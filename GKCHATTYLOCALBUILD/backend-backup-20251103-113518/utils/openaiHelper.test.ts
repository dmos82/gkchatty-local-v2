import { getLogger } from './logger';
// import { HTTP_TIMEOUT_MS } from './openaiHelper'; // Will be used later or removed
// import CircuitBreaker from 'opossum'; // Will be used later for direct breaker tests or removed

// ------------------------------------
// Singleton logger mock shared across module imports
const loggerMock = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  child: jest.fn().mockReturnThis(),
};

// Ensure every call to getLogger returns the same loggerMock instance
jest.mock('./logger', () => ({
  __esModule: true,
  getLogger: jest.fn(() => loggerMock),
}));

// ------------------------------------

jest.mock('axios');

const mockOpenAICreateEmbedding = jest.fn();
const mockOpenAICreateChatCompletion = jest.fn();
jest.mock('openai', () => ({
  OpenAI: jest.fn().mockImplementation(() => ({
    embeddings: {
      create: mockOpenAICreateEmbedding,
    },
    chat: {
      completions: {
        create: mockOpenAICreateChatCompletion,
      },
    },
  })),
}));

const mockWithRetry = jest.fn(fn => fn()); // Corrected: removed parentheses
jest.mock('./retryHelper', () => ({
  withRetry: mockWithRetry,
  DEFAULT_OPENAI_RETRY_CONFIG: {},
}));

const mockGetMistralChatCompletion = jest.fn();
jest.mock('./mistralHelper', () => ({
  getMistralChatCompletion: mockGetMistralChatCompletion,
}));

const mockGetOpenAIConfig = jest.fn();
jest.mock('../services/settingsService', () => ({
  getOpenAIConfig: mockGetOpenAIConfig,
}));

let openaiHelper: any;

async function resetAllMocksAndModule() {
  jest.clearAllMocks();
  jest.resetModules();
  openaiHelper = await import('./openaiHelper');
  if (openaiHelper._resetForTesting) {
    openaiHelper._resetForTesting();
  }
}

describe('OpenAI Helper with Circuit Breakers and Logging', () => {
  beforeEach(async () => {
    // This single beforeEach now runs before EVERY test in the file, ensuring complete isolation.
    await resetAllMocksAndModule();
    process.env.OPENAI_API_KEY = 'test-key';
    // Ensure Mistral API key is theoretically available for fallback tests
    process.env.MISTRAL_API_KEY = 'test-mistral-key-for-openai-tests';
    // Mock settingsService to return default config
    mockGetOpenAIConfig.mockResolvedValue({ apiKey: '', modelId: '' });
  });

  afterEach(() => {
    // Restore all mocks after each test to prevent state bleeding
    jest.restoreAllMocks();
  });

  describe('Initialization and Configuration Logging', () => {
    it('should log API key availability using Pino logger', () => {
      expect(getLogger().info).toHaveBeenCalledWith(
        expect.stringContaining('[LLM Config] OpenAI API Key available: true')
      );
    });

    it('should log model configurations using Pino logger', () => {
      expect(getLogger().info).toHaveBeenCalledWith(
        expect.stringContaining('[LLM Config] Primary Chat Model:')
      );
      expect(getLogger().info).toHaveBeenCalledWith(
        expect.stringContaining('[LLM Config] Fallback Chat Model:')
      );
      expect(getLogger().info).toHaveBeenCalledWith(
        expect.stringContaining('[LLM Config] Embedding Model:')
      );
    });
  });

  describe('Circuit Breaker Instantiation', () => {
    it('module loads and breakers are implicitly created', () => {
      expect(openaiHelper).toBeDefined();
    });
  });

  describe('generateEmbedding', () => {
    it('should call singleEmbeddingBreaker.fire with the text', async () => {
      const testText = 'hello world';
      const mockEmbedding = [0.1, 0.2, 0.3];
      mockOpenAICreateEmbedding.mockResolvedValueOnce({
        data: [{ embedding: mockEmbedding, index: 0 }],
      });

      const result = await openaiHelper.generateEmbedding(testText);

      expect(result).toEqual(mockEmbedding);
      expect(mockOpenAICreateEmbedding).toHaveBeenCalledWith({
        model: expect.any(String),
        input: testText,
      });
      expect(getLogger().info).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: 'protectedSingleEmbeddingOperation' }),
        expect.any(String)
      );
    });

    it('should return empty array if input text array is empty for generateEmbeddings', async () => {
      const result = await openaiHelper.generateEmbeddings([]);
      expect(result).toEqual([]);
      expect(mockOpenAICreateEmbedding).not.toHaveBeenCalled();
      expect(getLogger().info).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: 'generateEmbeddings' }),
        expect.stringContaining('Empty input for batch embeddings')
      );
    });
  });

  describe('generateEmbeddings', () => {
    it('should call batchEmbeddingBreaker.fire with the texts', async () => {
      const testTexts = ['hello', 'world'];
      const mockEmbeddings = [[0.1], [0.2]];
      mockOpenAICreateEmbedding.mockResolvedValueOnce({
        data: [
          { embedding: mockEmbeddings[0], index: 0 },
          { embedding: mockEmbeddings[1], index: 1 },
        ],
      }); // Corrected formatting

      const result = await openaiHelper.generateEmbeddings(testTexts);

      expect(result).toEqual(mockEmbeddings);
      expect(mockOpenAICreateEmbedding).toHaveBeenCalledWith({
        model: expect.any(String),
        input: testTexts,
      });
      expect(getLogger().info).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: 'protectedBatchEmbeddingOperation' }),
        expect.any(String)
      );
    });
  });

  describe('getChatCompletion with Mistral Fallback', () => {
    const testMessages = [{ role: 'user' as const, content: 'Hello OpenAI' }];
    const openAIPrimaryModel = process.env.OPENAI_PRIMARY_CHAT_MODEL || 'gpt-4o-mini';

    it('should return OpenAI response if primary call succeeds', async () => {
      const mockOpenAIResponse = {
        id: 'openai-test-id',
        object: 'chat.completion' as const,
        created: Date.now(),
        model: openAIPrimaryModel,
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'OpenAI says hi!' },
            finish_reason: 'stop' as const,
            logprobs: null,
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      };
      mockOpenAICreateChatCompletion.mockResolvedValueOnce(mockOpenAIResponse);

      const result = await openaiHelper.getChatCompletion(testMessages);
      expect(result).toEqual(mockOpenAIResponse);
      expect(mockOpenAICreateChatCompletion).toHaveBeenCalledTimes(1);
      expect(mockGetMistralChatCompletion).not.toHaveBeenCalled();
    });

    it('should fallback to Mistral and synthesize a response if primary OpenAI call fails (non-429 error)', async () => {
      const openAIError = new Error('Generic OpenAI API Error');
      (openAIError as any).status = 500; // Simulate a non-429 server error
      mockOpenAICreateChatCompletion.mockRejectedValueOnce(openAIError);
      mockGetMistralChatCompletion.mockResolvedValueOnce('Mistral says hi as fallback!');

      const result = await openaiHelper.getChatCompletion(testMessages);

      expect(mockOpenAICreateChatCompletion).toHaveBeenCalledTimes(1);
      expect(mockGetMistralChatCompletion).toHaveBeenCalledTimes(1);
      expect(loggerMock.warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'openaiError' }),
        'Primary OpenAI call failed, attempting Mistral fallback.'
      );
      expect(loggerMock.info).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'mistralFallbackSuccess' }),
        'Mistral AI fallback successful.'
      );

      expect(result).toBeDefined();
      expect(result?.choices[0].message.content).toBe('Mistral says hi as fallback!');
      expect(result?.model).toContain('mistral-small-latest');
    });

    it('should return null if both OpenAI and Mistral calls fail', async () => {
      const openAIError = new Error('OpenAI Server Error');
      (openAIError as any).status = 500;
      mockOpenAICreateChatCompletion.mockRejectedValueOnce(openAIError);

      const mistralError = new Error('Mistral Server Error');
      mockGetMistralChatCompletion.mockRejectedValueOnce(mistralError);

      const result = await openaiHelper.getChatCompletion(testMessages);

      expect(result).toBeNull();
      expect(mockOpenAICreateChatCompletion).toHaveBeenCalledTimes(1);
      expect(mockGetMistralChatCompletion).toHaveBeenCalledTimes(1);
      // The log does not contain the error object, so we check only the event.
      const lastErrorCall = loggerMock.error.mock.calls[loggerMock.error.mock.calls.length - 1];
      expect(lastErrorCall[0]).toMatchObject({
        event: 'mistralFallbackFailure',
      });
    });

    it('should fall back to Mistral if OpenAI fails with a 429 error', async () => {
      const rateLimitError = new Error('OpenAI Rate Limit');
      (rateLimitError as any).status = 429;
      mockOpenAICreateChatCompletion.mockRejectedValueOnce(rateLimitError);
      mockGetMistralChatCompletion.mockResolvedValueOnce('Mistral says hi after rate limit!');

      const result = await openaiHelper.getChatCompletion(testMessages);

      expect(mockOpenAICreateChatCompletion).toHaveBeenCalledTimes(1);
      expect(mockGetMistralChatCompletion).toHaveBeenCalledTimes(1);
      // The log does not contain isRateLimit, so we check for the status in the err object.
      const warnCalls = loggerMock.warn.mock.calls;
      expect(
        warnCalls.some(call => call[0].event === 'openaiError' && call[0].err?.status === 429)
      ).toBe(true);
      expect(result?.choices[0].message.content).toBe('Mistral says hi after rate limit!');
      expect(result?.model).toContain('mistral-small-latest');
    });

    it('should fall back to Mistral without calling OpenAI if the circuit breaker is open', async () => {
      // Manually open the breaker
      openaiHelper.chatCompletionBreaker.open();
      mockGetMistralChatCompletion.mockResolvedValueOnce('Mistral says hi while breaker is open!');

      const result = await openaiHelper.getChatCompletion(testMessages);

      // Critical: OpenAI should NOT be called
      expect(mockOpenAICreateChatCompletion).not.toHaveBeenCalled();
      expect(mockGetMistralChatCompletion).toHaveBeenCalledTimes(1);

      // Check that the warn log contains either isCircuitOpen flag or BreakerOpenError name
      const warnCalls = loggerMock.warn.mock.calls;
      expect(
        warnCalls.some(
          call =>
            call[0].event === 'openaiError' &&
            (call[0].isCircuitOpen === true || call[0].err?.message === 'Breaker is open')
        )
      ).toBe(true);
      expect(loggerMock.info).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'mistralFallbackSuccess' }),
        'Mistral AI fallback successful.'
      );
      expect(result?.choices[0].message.content).toBe('Mistral says hi while breaker is open!');
      expect(result?.model).toContain('mistral-small-latest');
    });
  });

  describe('getChatCompletionWithMessages with Mistral Fallback', () => {
    const testMessages = [{ role: 'user' as const, content: 'Hello OpenAI' }];

    it('should return content string if primary OpenAI call succeeds', async () => {
      const mockOpenAIResponse = {
        id: 'openai-test-id',
        object: 'chat.completion' as const,
        created: Date.now(),
        model: 'gpt-4o-mini',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'OpenAI says hi!' },
            finish_reason: 'stop' as const,
            logprobs: null,
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      };
      mockOpenAICreateChatCompletion.mockResolvedValueOnce(mockOpenAIResponse);

      const result = await openaiHelper.getChatCompletionWithMessages(testMessages);

      expect(result).toBe('OpenAI says hi!');
      expect(mockGetMistralChatCompletion).not.toHaveBeenCalled();
    });

    it('should fall back to Mistral on non-429 OpenAI failure and return its content', async () => {
      const openAIError = new Error('Generic OpenAI API Error');
      (openAIError as any).status = 500;
      mockOpenAICreateChatCompletion.mockRejectedValueOnce(openAIError);

      const mistralContent = 'Mistral string fallback content';
      // The underlying getChatCompletion now synthesizes a full object,
      // and getChatCompletionWithMessages extracts the string.
      mockGetMistralChatCompletion.mockResolvedValueOnce(mistralContent);

      const result = await openaiHelper.getChatCompletionWithMessages(testMessages);

      expect(result).toBe(mistralContent);
      expect(mockGetMistralChatCompletion).toHaveBeenCalledTimes(1);
    });

    it('should fall back to Mistral after OpenAI 429 failure and return its content', async () => {
      const rateLimitError = new Error('OpenAI Rate Limit');
      (rateLimitError as any).status = 429;

      // Simulate OpenAI failing on both primary and internal fallback attempts
      mockOpenAICreateChatCompletion.mockRejectedValue(rateLimitError);

      const mistralContent = 'Mistral says hi after rate limits';
      mockGetMistralChatCompletion.mockResolvedValueOnce(mistralContent);

      const result = await openaiHelper.getChatCompletionWithMessages(testMessages);

      expect(result).toBe(mistralContent);
      // It will try OpenAI once, fail, then go to mistral
      expect(mockOpenAICreateChatCompletion).toHaveBeenCalledTimes(1);
      expect(mockGetMistralChatCompletion).toHaveBeenCalledTimes(1);
    });

    it('should return default error message if all fallbacks fail', async () => {
      const openAIError = new Error('OpenAI Server Error');
      mockOpenAICreateChatCompletion.mockRejectedValue(openAIError);
      const mistralError = new Error('Mistral Server Error');
      mockGetMistralChatCompletion.mockRejectedValue(mistralError);

      // The function now throws an error instead of returning a string.
      await expect(openaiHelper.getChatCompletionWithMessages(testMessages)).rejects.toThrow(
        /OpenAI and Mistral fallbacks failed/
      );
    });
  });

  describe('getOpenAIClient - Configuration and Caching', () => {
    it('should use admin-configured API key when available', async () => {
      const adminApiKey = 'admin-configured-unique-key-123';
      mockGetOpenAIConfig.mockResolvedValueOnce({ apiKey: adminApiKey, modelId: '' });

      const testMessages = [{ role: 'user' as const, content: 'Test' }];
      const mockResponse = {
        id: 'test-id',
        object: 'chat.completion' as const,
        created: Date.now(),
        model: 'gpt-4o-mini',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Response' },
            finish_reason: 'stop' as const,
            logprobs: null,
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      };
      mockOpenAICreateChatCompletion.mockResolvedValueOnce(mockResponse);

      const result = await openaiHelper.getChatCompletion(testMessages);

      // Verify the call succeeded with admin config
      expect(result).toBeDefined();
      expect(result?.choices[0]?.message?.content).toBe('Response');

      // Check that getOpenAIConfig was called
      expect(mockGetOpenAIConfig).toHaveBeenCalled();

      // Verify that the logger was called about using admin-configured API key
      // The specific log line might vary, so just check the function worked
      const infoCalls = loggerMock.info.mock.calls;
      const hasAdminLog = infoCalls.some(
        call =>
          (typeof call[0] === 'string' && call[0].includes('admin-configured')) ||
          (call[1] === 'admin-configured')
      );
      expect(hasAdminLog).toBe(true);
    });

    it('should fall back to environment API key when admin config returns empty', async () => {
      // Return empty config so it uses environment key
      mockGetOpenAIConfig.mockResolvedValueOnce({ apiKey: '', modelId: '' });

      const testMessages = [{ role: 'user' as const, content: 'Test' }];
      const mockResponse = {
        id: 'test-id',
        object: 'chat.completion' as const,
        created: Date.now(),
        model: 'gpt-4o-mini',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Response' },
            finish_reason: 'stop' as const,
            logprobs: null,
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      };
      mockOpenAICreateChatCompletion.mockResolvedValueOnce(mockResponse);

      const result = await openaiHelper.getChatCompletion(testMessages);

      // Since API key is the same as before (test-key from env), client is cached
      // and logger.info isn't called again. Just verify it worked.
      expect(result).toBeDefined();
      expect(result?.choices[0]?.message?.content).toBe('Response');
    });

    it('should handle settingsService errors and fall back to default client', async () => {
      mockGetOpenAIConfig.mockRejectedValueOnce(new Error('Settings service error'));

      const testMessages = [{ role: 'user' as const, content: 'Test' }];
      const mockResponse = {
        id: 'test-id',
        object: 'chat.completion' as const,
        created: Date.now(),
        model: 'gpt-4o-mini',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Response' },
            finish_reason: 'stop' as const,
            logprobs: null,
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      };
      mockOpenAICreateChatCompletion.mockResolvedValueOnce(mockResponse);

      const result = await openaiHelper.getChatCompletion(testMessages);

      expect(result).toBeDefined();
      // The error is logged from getChatCompletion, not getOpenAIClient
      expect(loggerMock.error).toHaveBeenCalledWith(
        expect.stringContaining('[LLM Helper] Error fetching admin config'),
        expect.any(Error)
      );
    });

    it('should use admin-configured model when available', async () => {
      const adminModel = 'gpt-4';
      mockGetOpenAIConfig.mockResolvedValueOnce({ apiKey: '', modelId: adminModel });

      const testMessages = [{ role: 'user' as const, content: 'Test' }];
      const mockResponse = {
        id: 'test-id',
        object: 'chat.completion' as const,
        created: Date.now(),
        model: adminModel,
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Response' },
            finish_reason: 'stop' as const,
            logprobs: null,
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      };
      mockOpenAICreateChatCompletion.mockResolvedValueOnce(mockResponse);

      await openaiHelper.getChatCompletion(testMessages);

      expect(loggerMock.info).toHaveBeenCalledWith(
        expect.stringContaining(`[LLM Helper] Using admin-configured model: ${adminModel}`)
      );
    });

    it('should handle admin config error and use environment model', async () => {
      mockGetOpenAIConfig.mockRejectedValueOnce(new Error('Config error'));

      const testMessages = [{ role: 'user' as const, content: 'Test' }];
      const mockResponse = {
        id: 'test-id',
        object: 'chat.completion' as const,
        created: Date.now(),
        model: 'gpt-4o-mini',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Response' },
            finish_reason: 'stop' as const,
            logprobs: null,
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      };
      mockOpenAICreateChatCompletion.mockResolvedValueOnce(mockResponse);

      await openaiHelper.getChatCompletion(testMessages);

      expect(loggerMock.error).toHaveBeenCalledWith(
        expect.stringContaining('[LLM Helper] Error fetching admin config'),
        expect.any(Error)
      );
    });
  });

  describe('getChatCompletion - Edge Cases and Error Handling', () => {
    const testMessages = [{ role: 'user' as const, content: 'Test' }];

    beforeEach(() => {
      // Clear Mistral mock before each test in this suite to prevent state bleeding
      mockGetMistralChatCompletion.mockClear();
    });

    it('should handle response with no choices array', async () => {
      const mockResponseNoChoices = {
        id: 'test-id',
        object: 'chat.completion' as const,
        created: Date.now(),
        model: 'gpt-4o-mini',
        choices: [],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      };
      mockOpenAICreateChatCompletion.mockResolvedValueOnce(mockResponseNoChoices);

      const result = await openaiHelper.getChatCompletion(testMessages);

      // When there are no choices, it returns null directly without triggering Mistral
      expect(loggerMock.warn).toHaveBeenCalledWith('No choices returned from API.');
      expect(result).toBeNull();
      expect(mockGetMistralChatCompletion).not.toHaveBeenCalled();
    });

    it('should handle empty content response and trigger fallback', async () => {
      const mockResponseEmptyContent = {
        id: 'test-id',
        object: 'chat.completion' as const,
        created: Date.now(),
        model: 'gpt-4o-mini',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: '' },
            finish_reason: 'stop' as const,
            logprobs: null,
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 0, total_tokens: 10 },
      };
      mockOpenAICreateChatCompletion.mockResolvedValueOnce(mockResponseEmptyContent);
      mockGetMistralChatCompletion.mockResolvedValueOnce('Empty content fallback');

      const result = await openaiHelper.getChatCompletion(testMessages);

      expect(loggerMock.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'openaiEmptyContent',
          finishReason: 'stop',
        }),
        expect.stringContaining('OpenAI returned empty content')
      );
      expect(result?.choices[0]?.message?.content).toBe('Empty content fallback');
    });

    it('should handle length limit hit with empty content and trigger fallback', async () => {
      const mockResponseLengthLimit = {
        id: 'test-id',
        object: 'chat.completion' as const,
        created: Date.now(),
        model: 'gpt-4o-mini',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: '' },
            finish_reason: 'length' as const,
            logprobs: null,
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 4096, total_tokens: 4196 },
      };
      mockOpenAICreateChatCompletion.mockResolvedValueOnce(mockResponseLengthLimit);
      mockGetMistralChatCompletion.mockResolvedValueOnce('Length limit fallback');

      const result = await openaiHelper.getChatCompletion(testMessages);

      expect(loggerMock.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'openaiEmptyContent',
          finishReason: 'length',
        }),
        expect.stringContaining('hit length limit')
      );
      expect(result?.choices[0]?.message?.content).toBe('Length limit fallback');
    });

    it('should handle response without usage data', async () => {
      const mockResponseNoUsage = {
        id: 'test-id',
        object: 'chat.completion' as const,
        created: Date.now(),
        model: 'gpt-4o-mini',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Response without usage' },
            finish_reason: 'stop' as const,
            logprobs: null,
          },
        ],
      };
      mockOpenAICreateChatCompletion.mockResolvedValueOnce(mockResponseNoUsage);

      const result = await openaiHelper.getChatCompletion(testMessages);

      expect(result?.choices[0]?.message?.content).toBe('Response without usage');
      expect(loggerMock.warn).toHaveBeenCalledWith('Response did not contain usage data.');
    });

    it('should handle unknown model pricing and log warning', async () => {
      const unknownModel = 'gpt-future-model';
      mockGetOpenAIConfig.mockResolvedValueOnce({ apiKey: '', modelId: unknownModel });

      const mockResponse = {
        id: 'test-id',
        object: 'chat.completion' as const,
        created: Date.now(),
        model: unknownModel,
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Response from unknown model' },
            finish_reason: 'stop' as const,
            logprobs: null,
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      };
      mockOpenAICreateChatCompletion.mockResolvedValueOnce(mockResponse);

      await openaiHelper.getChatCompletion(testMessages);

      expect(loggerMock.warn).toHaveBeenCalledWith(
        expect.objectContaining({ modelUsed: unknownModel, pricingSource: 'defaultEstimation' }),
        'Pricing not found for model. Using default pricing for cost estimation.'
      );
    });

    it('should return null when Mistral fallback returns null', async () => {
      const openAIError = new Error('OpenAI Error');
      (openAIError as any).status = 500;
      mockOpenAICreateChatCompletion.mockRejectedValueOnce(openAIError);
      // Explicitly set null for this test
      mockGetMistralChatCompletion.mockResolvedValueOnce(null);

      const result = await openaiHelper.getChatCompletion(testMessages);

      expect(result).toBeNull();
      expect(loggerMock.error).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'mistralFallbackFailure' }),
        'Mistral fallback failed.'
      );
    });
  });

  describe('generateEmbedding - Error Handling and Axios Fallback', () => {
    it('should fall back to axios when SDK fails', async () => {
      const testText = 'test text';
      const mockEmbedding = [0.1, 0.2, 0.3];

      // SDK fails
      mockOpenAICreateEmbedding.mockRejectedValueOnce(new Error('SDK Error'));

      // Mock axios success
      const axios = require('axios');
      axios.post.mockResolvedValueOnce({
        data: {
          data: [{ embedding: mockEmbedding, index: 0 }],
        },
      });

      const result = await openaiHelper.generateEmbedding(testText);

      expect(result).toEqual(mockEmbedding);
      expect(loggerMock.warn).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Object) }),
        'SDK single embedding failed, falling back to axios'
      );
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('embeddings'),
        expect.objectContaining({ input: testText }),
        expect.any(Object)
      );
    });

    it('should throw error when both SDK and axios fail', async () => {
      const testText = 'test text';

      // SDK fails
      mockOpenAICreateEmbedding.mockRejectedValueOnce(new Error('SDK Error'));

      // Axios also fails
      const axios = require('axios');
      axios.post.mockRejectedValueOnce(new Error('Axios Error'));

      await expect(openaiHelper.generateEmbedding(testText)).rejects.toThrow();

      expect(loggerMock.error).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: 'protectedSingleEmbeddingOperation' }),
        'Error generating single embedding'
      );
    });

    it('should handle invalid SDK response format', async () => {
      const testText = 'test text';

      // SDK returns invalid format
      mockOpenAICreateEmbedding.mockResolvedValueOnce({
        data: [{ invalid: 'format' }],
      });

      // Axios succeeds
      const axios = require('axios');
      axios.post.mockResolvedValueOnce({
        data: {
          data: [{ embedding: [0.1, 0.2], index: 0 }],
        },
      });

      const result = await openaiHelper.generateEmbedding(testText);

      expect(result).toEqual([0.1, 0.2]);
      expect(loggerMock.error).toHaveBeenCalledWith(
        'Invalid single embedding response format from SDK'
      );
    });

    it('should handle invalid axios response format', async () => {
      const testText = 'test text';

      // SDK fails
      mockOpenAICreateEmbedding.mockRejectedValueOnce(new Error('SDK Error'));

      // Axios returns invalid format
      const axios = require('axios');
      axios.post.mockResolvedValueOnce({
        data: {
          data: [{ invalid: 'format' }],
        },
      });

      await expect(openaiHelper.generateEmbedding(testText)).rejects.toThrow(
        'Invalid single embedding response format from direct API call'
      );

      expect(loggerMock.error).toHaveBeenCalledWith(
        'Invalid single embedding response format from Axios fallback'
      );
    });
  });

  describe('generateEmbeddings - Batch Error Handling and Axios Fallback', () => {
    it('should return empty array for empty input', async () => {
      const result = await openaiHelper.generateEmbeddings([]);
      expect(result).toEqual([]);
      expect(mockOpenAICreateEmbedding).not.toHaveBeenCalled();
    });

    it('should fall back to axios when SDK fails for batch', async () => {
      const testTexts = ['text1', 'text2'];
      const mockEmbeddings = [[0.1, 0.2], [0.3, 0.4]];

      // SDK fails
      mockOpenAICreateEmbedding.mockRejectedValueOnce(new Error('SDK Batch Error'));

      // Axios succeeds
      const axios = require('axios');
      axios.post.mockResolvedValueOnce({
        data: {
          data: [
            { embedding: mockEmbeddings[0], index: 0 },
            { embedding: mockEmbeddings[1], index: 1 },
          ],
        },
      });

      const result = await openaiHelper.generateEmbeddings(testTexts);

      expect(result).toEqual(mockEmbeddings);
      expect(loggerMock.warn).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Object) }),
        'SDK batch embedding failed, falling back to axios'
      );
    });

    it('should throw error when both SDK and axios fail for batch', async () => {
      const testTexts = ['text1', 'text2'];

      // SDK fails
      mockOpenAICreateEmbedding.mockRejectedValueOnce(new Error('SDK Error'));

      // Axios also fails
      const axios = require('axios');
      axios.post.mockRejectedValueOnce(new Error('Axios Error'));

      await expect(openaiHelper.generateEmbeddings(testTexts)).rejects.toThrow();

      expect(loggerMock.error).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: 'protectedBatchEmbeddingOperation' }),
        'Error generating batch embeddings'
      );
    });

    it('should handle SDK response with count mismatch', async () => {
      const testTexts = ['text1', 'text2', 'text3'];

      // SDK returns wrong count
      mockOpenAICreateEmbedding.mockResolvedValueOnce({
        data: [
          { embedding: [0.1], index: 0 },
          { embedding: [0.2], index: 1 },
          // Missing third embedding
        ],
      });

      // Axios succeeds
      const axios = require('axios');
      axios.post.mockResolvedValueOnce({
        data: {
          data: [
            { embedding: [0.1], index: 0 },
            { embedding: [0.2], index: 1 },
            { embedding: [0.3], index: 2 },
          ],
        },
      });

      const result = await openaiHelper.generateEmbeddings(testTexts);

      expect(result).toHaveLength(3);
      expect(loggerMock.error).toHaveBeenCalledWith(
        'Invalid batch embedding response format or count mismatch from SDK'
      );
    });

    it('should handle axios response with count mismatch', async () => {
      const testTexts = ['text1', 'text2'];

      // SDK fails
      mockOpenAICreateEmbedding.mockRejectedValueOnce(new Error('SDK Error'));

      // Axios returns wrong count
      const axios = require('axios');
      axios.post.mockResolvedValueOnce({
        data: {
          data: [{ embedding: [0.1], index: 0 }], // Only 1 instead of 2
        },
      });

      await expect(openaiHelper.generateEmbeddings(testTexts)).rejects.toThrow(
        'Invalid batch embedding response format or count mismatch from direct API call'
      );

      expect(loggerMock.error).toHaveBeenCalledWith(
        'Invalid batch embedding response format or count mismatch from Axios fallback'
      );
    });
  });

  // TODO: Add detailed tests for chatCompletion functions
  // TODO: Add tests for circuit breaker event logging (requires mocking/spying on CircuitBreaker instances or their .on method)
});
