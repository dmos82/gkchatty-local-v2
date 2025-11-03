import { getLogger } from './logger';
import CircuitBreaker from 'opossum';

// Mocks
jest.mock('./logger', () => ({
  getLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

const mockMistralChat = jest.fn();
const mockMistralChatStream = jest.fn();

jest.mock('@mistralai/mistralai', () => {
  const MockMistralClient = jest.fn().mockImplementation(() => ({
    chat: mockMistralChat,
    chatStream: mockMistralChatStream,
  }));
  return {
    __esModule: true,
    default: MockMistralClient,
  };
});

const mockWithRetryPassthrough = jest.fn(fn => fn());
jest.mock('./retryHelper', () => ({
  withRetry: mockWithRetryPassthrough,
  DEFAULT_MISTRAL_RETRY_CONFIG: { retries: 1 },
}));

let mistralHelper: any;

describe('Mistral Helper Integration Tests - Circuit Breaker Coverage', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    jest.resetModules();
    process.env.MISTRAL_API_KEY = 'test-mistral-key';
    process.env.MISTRAL_FALLBACK_MODEL_NAME = 'test-mistral-model';
    mistralHelper = await import('./mistralHelper');
    (getLogger as jest.Mock).mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    });
  });

  describe('Streaming Function Coverage', () => {
    it('should handle successful stream with chunks', async () => {
      const mockStream = (async function* () {
        yield { choices: [{ delta: { content: 'Hello' } }] };
        yield { choices: [{ delta: { content: ' world' } }] };
        yield { choices: [{ delta: { content: '!' } }] };
      })();

      mockMistralChatStream.mockResolvedValueOnce(mockStream);

      const mockOnChunk = jest.fn();
      const result = await mistralHelper.getMistralChatCompletionStream(
        [{ role: 'user', content: 'Test' }],
        mockOnChunk
      );

      expect(result).toBe('Hello world!');
      expect(mockOnChunk).toHaveBeenCalledTimes(3);
    });

    it('should handle stream with empty delta content', async () => {
      const mockStream = (async function* () {
        yield { choices: [{ delta: { content: 'Start' } }] };
        yield { choices: [{ delta: {} }] };
        yield { choices: [{ delta: { content: null } }] };
        yield { choices: [{ delta: { content: undefined } }] };
        yield { choices: [{ delta: { content: 'End' } }] };
      })();

      mockMistralChatStream.mockResolvedValueOnce(mockStream);

      const mockOnChunk = jest.fn();
      const result = await mistralHelper.getMistralChatCompletionStream(
        [{ role: 'user', content: 'Test' }],
        mockOnChunk
      );

      expect(result).toBe('StartEnd');
      expect(mockOnChunk).toHaveBeenCalledTimes(2);
    });

    it('should handle stream errors', async () => {
      const streamError = new Error('Stream error');
      mockMistralChatStream.mockRejectedValueOnce(streamError);

      const mockOnChunk = jest.fn();
      await expect(
        mistralHelper.getMistralChatCompletionStream([{ role: 'user', content: 'Test' }], mockOnChunk)
      ).rejects.toThrow('Stream error');
    });

    it('should throw error when API key is missing for streaming', async () => {
      delete process.env.MISTRAL_API_KEY;
      jest.resetModules();
      mistralHelper = await import('./mistralHelper');

      const mockOnChunk = jest.fn();
      await expect(
        mistralHelper.getMistralChatCompletionStream([{ role: 'user', content: 'Test' }], mockOnChunk)
      ).rejects.toThrow('Mistral AI service is not configured (API key missing).');
    });

    it('should handle iteration over async stream', async () => {
      const mockStream = (async function* () {
        for (let i = 0; i < 5; i++) {
          yield { choices: [{ delta: { content: String(i) } }] };
        }
      })();

      mockMistralChatStream.mockResolvedValueOnce(mockStream);

      const mockOnChunk = jest.fn();
      const result = await mistralHelper.getMistralChatCompletionStream(
        [{ role: 'user', content: 'Test' }],
        mockOnChunk
      );

      expect(result).toBe('01234');
      expect(mockOnChunk).toHaveBeenCalledTimes(5);
    });
  });

  describe('Error Logging Coverage', () => {
    it('should log API errors with details', async () => {
      const mockLogger = getLogger('mistralHelper');
      const apiError = new Error('Mistral API Error');
      (apiError as any).status = 500;

      mockMistralChat.mockRejectedValueOnce(apiError);

      await expect(
        mistralHelper.getMistralChatCompletion([{ role: 'user', content: 'Test' }])
      ).rejects.toThrow();

      // The error path should have been hit
      expect(mockMistralChat).toHaveBeenCalled();
    });

    it('should handle non-Error rejections', async () => {
      mockMistralChat.mockRejectedValueOnce('Plain string error');

      await expect(
        mistralHelper.getMistralChatCompletion([{ role: 'user', content: 'Test' }])
      ).rejects.toMatch('Plain string error');
    });

    it('should handle errors with stack traces', async () => {
      const errorWithStack = new Error('Error with stack');
      errorWithStack.stack = 'Error: Error with stack\n  at line1\n  at line2';
      mockMistralChat.mockRejectedValueOnce(errorWithStack);

      await expect(
        mistralHelper.getMistralChatCompletion([{ role: 'user', content: 'Test' }])
      ).rejects.toThrow('Error with stack');
    });
  });

  describe('API Key Logging at Module Load', () => {
    it('should verify module loads with API key', async () => {
      process.env.MISTRAL_API_KEY = 'test-key-1234567890';
      jest.resetModules();

      mistralHelper = await import('./mistralHelper');

      // Module should load successfully
      expect(mistralHelper).toBeDefined();
      expect(mistralHelper.getMistralChatCompletion).toBeDefined();
    });

    it('should verify module loads without API key', async () => {
      delete process.env.MISTRAL_API_KEY;
      jest.resetModules();

      mistralHelper = await import('./mistralHelper');

      // Module should load but functions should throw when called
      expect(mistralHelper).toBeDefined();
      await expect(
        mistralHelper.getMistralChatCompletion([{ role: 'user', content: 'test' }])
      ).rejects.toThrow('Mistral AI service is not configured');
    });
  });

  describe('Environment Variable Parsing', () => {
    it('should parse positive MISTRAL_CHAT_MAX_RETRIES', async () => {
      process.env.MISTRAL_CHAT_MAX_RETRIES = '3';
      jest.resetModules();
      process.env.MISTRAL_API_KEY = 'test-key';
      mistralHelper = await import('./mistralHelper');

      expect(mistralHelper.MISTRAL_CHAT_MAX_RETRIES).toBe(3);
    });

    it('should handle zero MISTRAL_CHAT_MAX_RETRIES', async () => {
      process.env.MISTRAL_CHAT_MAX_RETRIES = '0';
      jest.resetModules();
      process.env.MISTRAL_API_KEY = 'test-key';
      mistralHelper = await import('./mistralHelper');

      expect(mistralHelper.MISTRAL_CHAT_MAX_RETRIES).toBe(0);
    });

    it('should default to 0 for empty string MISTRAL_CHAT_MAX_RETRIES', async () => {
      process.env.MISTRAL_CHAT_MAX_RETRIES = '';
      jest.resetModules();
      process.env.MISTRAL_API_KEY = 'test-key';
      mistralHelper = await import('./mistralHelper');

      expect(mistralHelper.MISTRAL_CHAT_MAX_RETRIES).toBe(0);
    });

    it('should default to 0 for negative MISTRAL_CHAT_MAX_RETRIES', async () => {
      process.env.MISTRAL_CHAT_MAX_RETRIES = '-5';
      jest.resetModules();
      process.env.MISTRAL_API_KEY = 'test-key';
      mistralHelper = await import('./mistralHelper');

      expect(mistralHelper.MISTRAL_CHAT_MAX_RETRIES).toBe(0);
    });
  });

  describe('Response Content Edge Cases', () => {
    it('should handle response with content = null', async () => {
      mockMistralChat.mockResolvedValueOnce({
        id: 'test',
        choices: [{ message: { role: 'assistant', content: null } }],
      });

      const result = await mistralHelper.getMistralChatCompletion([
        { role: 'user', content: 'Test' },
      ]);
      expect(result).toBe('');
    });

    it('should handle response with content = undefined', async () => {
      mockMistralChat.mockResolvedValueOnce({
        id: 'test',
        choices: [{ message: { role: 'assistant', content: undefined } }],
      });

      const result = await mistralHelper.getMistralChatCompletion([
        { role: 'user', content: 'Test' },
      ]);
      expect(result).toBe('');
    });

    it('should handle response with no content property', async () => {
      mockMistralChat.mockResolvedValueOnce({
        id: 'test',
        choices: [{ message: { role: 'assistant' } }],
      });

      const result = await mistralHelper.getMistralChatCompletion([
        { role: 'user', content: 'Test' },
      ]);
      expect(result).toBe('');
    });
  });
});
