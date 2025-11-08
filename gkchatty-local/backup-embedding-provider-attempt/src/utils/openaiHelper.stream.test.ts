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

const mockWithRetry = jest.fn(fn => fn());
jest.mock('./retryHelper', () => ({
  withRetry: mockWithRetry,
  DEFAULT_OPENAI_RETRY_CONFIG: {},
}));

const mockGetMistralChatCompletionStream = jest.fn();
jest.mock('./mistralHelper', () => ({
  getMistralChatCompletionStream: mockGetMistralChatCompletionStream,
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

describe('getChatCompletionStream', () => {
  const testMessages = [{ role: 'user' as const, content: 'Hello' }];

  beforeEach(async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.MISTRAL_API_KEY = 'mistral-test-key';
    await resetAllMocksAndModule();
    // Mock settingsService to return default config
    mockGetOpenAIConfig.mockResolvedValue({ apiKey: '', modelId: '' });
  });

  it('streams chunks from OpenAI when primary call succeeds', async () => {
    // Build a fake async iterable returning two chunks
    const chunks = [
      { choices: [{ delta: { content: 'Hello ' } }] },
      { choices: [{ delta: { content: 'World' } }] },
    ];
    async function* createAsyncIterable() {
      for (const chunk of chunks) {
        yield chunk;
      }
    }

    mockOpenAICreateChatCompletion.mockResolvedValueOnce(createAsyncIterable());

    const received: string[] = [];
    const result = await openaiHelper.getChatCompletionStream(testMessages, (c: string) =>
      received.push(c)
    );

    expect(result).toBe('Hello World');
    expect(received).toEqual(['Hello ', 'World']);
    expect(mockGetMistralChatCompletionStream).not.toHaveBeenCalled();
  });

  it('falls back to Mistral when OpenAI streaming fails with a non-429 error', async () => {
    const openAIError = new Error('OpenAI Stream Error');
    (openAIError as any).status = 500;
    mockOpenAICreateChatCompletion.mockRejectedValueOnce(openAIError);

    async function* mistralStream() {
      yield 'Mistral ';
      yield 'response';
    }
    mockGetMistralChatCompletionStream.mockImplementation(async (_messages, onChunk) => {
      let fullText = '';
      for await (const chunk of mistralStream()) {
        onChunk(chunk);
        fullText += chunk;
      }
      return fullText;
    });

    const received: string[] = [];
    const result = await openaiHelper.getChatCompletionStream(testMessages, (c: string) =>
      received.push(c)
    );

    expect(result).toBe('Mistral response');
    expect(received).toEqual(['Mistral ', 'response']);
    expect(mockGetMistralChatCompletionStream).toHaveBeenCalledTimes(1);
    const warnCalls = loggerMock.warn.mock.calls;
    expect(warnCalls.some(call => call[0].event === 'openaiError')).toBe(true);
  });

  it('falls back to Mistral when OpenAI streaming fails with a 429 error', async () => {
    const rateLimitError = new Error('OpenAI Rate Limit');
    (rateLimitError as any).status = 429;
    mockOpenAICreateChatCompletion.mockRejectedValueOnce(rateLimitError);

    async function* mistralStream() {
      yield 'Mistral rate limit fallback';
    }
    mockGetMistralChatCompletionStream.mockImplementation(async (_messages, onChunk) => {
      let fullText = '';
      for await (const chunk of mistralStream()) {
        onChunk(chunk);
        fullText += chunk;
      }
      return fullText;
    });

    const received: string[] = [];
    const result = await openaiHelper.getChatCompletionStream(testMessages, (c: string) =>
      received.push(c)
    );

    expect(result).toBe('Mistral rate limit fallback');
    expect(received).toEqual(['Mistral rate limit fallback']);
    const warnCalls = loggerMock.warn.mock.calls;
    expect(warnCalls.some(call => call[0].isRateLimit)).toBe(true);
  });

  it('returns null if both OpenAI and Mistral streaming fail', async () => {
    const openAIError = new Error('OpenAI Stream Error');
    mockOpenAICreateChatCompletion.mockRejectedValueOnce(openAIError);
    const mistralError = new Error('Mistral Stream Error');
    mockGetMistralChatCompletionStream.mockRejectedValueOnce(mistralError);

    const received: string[] = [];
    const result = await openaiHelper.getChatCompletionStream(testMessages, (c: string) =>
      received.push(c)
    );

    expect(result).toBeNull();
    expect(received).toEqual([]);
    const lastErrorCall = loggerMock.error.mock.calls[loggerMock.error.mock.calls.length - 1];
    expect(lastErrorCall[0]).toMatchObject({
      event: 'mistralFallbackFailureStream',
    });
  });

  it('falls back to Mistral if circuit breaker is open', async () => {
    openaiHelper.chatCompletionBreaker.open();

    async function* mistralStream() {
      yield 'Breaker open fallback';
    }
    mockGetMistralChatCompletionStream.mockImplementation(async (_messages, onChunk) => {
      let fullText = '';
      for await (const chunk of mistralStream()) {
        onChunk(chunk);
        fullText += chunk;
      }
      return fullText;
    });

    const received: string[] = [];
    const result = await openaiHelper.getChatCompletionStream(testMessages, (c: string) =>
      received.push(c)
    );

    expect(result).toBe('Breaker open fallback');
    expect(received).toEqual(['Breaker open fallback']);
    expect(mockOpenAICreateChatCompletion).not.toHaveBeenCalled();
    const warnCalls = loggerMock.warn.mock.calls;
    expect(warnCalls.some(call => call[0].isCircuitOpen)).toBe(true);
  });

  it('should use admin-configured model for streaming when available', async () => {
    const adminModel = 'gpt-4';
    mockGetOpenAIConfig.mockResolvedValueOnce({ apiKey: '', modelId: adminModel });

    const chunks = [
      { choices: [{ delta: { content: 'Admin ' } }] },
      { choices: [{ delta: { content: 'Model' } }] },
    ];
    async function* createAsyncIterable() {
      for (const chunk of chunks) {
        yield chunk;
      }
    }

    mockOpenAICreateChatCompletion.mockResolvedValueOnce(createAsyncIterable());

    const received: string[] = [];
    const result = await openaiHelper.getChatCompletionStream(testMessages, (c: string) =>
      received.push(c)
    );

    expect(result).toBe('Admin Model');
    expect(loggerMock.info).toHaveBeenCalledWith(
      expect.stringContaining(`[LLM Helper] Using admin-configured model (streaming): ${adminModel}`)
    );
  });

  it('should handle admin config error for streaming and use environment model', async () => {
    mockGetOpenAIConfig.mockRejectedValueOnce(new Error('Config error'));

    const chunks = [{ choices: [{ delta: { content: 'Fallback' } }] }];
    async function* createAsyncIterable() {
      for (const chunk of chunks) {
        yield chunk;
      }
    }

    mockOpenAICreateChatCompletion.mockResolvedValueOnce(createAsyncIterable());

    const received: string[] = [];
    const result = await openaiHelper.getChatCompletionStream(testMessages, (c: string) =>
      received.push(c)
    );

    expect(result).toBe('Fallback');
    expect(loggerMock.error).toHaveBeenCalledWith(
      expect.stringContaining('[LLM Helper] Error fetching admin config (streaming)'),
      expect.any(Error)
    );
  });

  it('should return null when Mistral streaming fallback returns null', async () => {
    const openAIError = new Error('OpenAI Stream Error');
    (openAIError as any).status = 500;
    mockOpenAICreateChatCompletion.mockRejectedValueOnce(openAIError);
    mockGetMistralChatCompletionStream.mockResolvedValueOnce(null);

    const received: string[] = [];
    const result = await openaiHelper.getChatCompletionStream(testMessages, (c: string) =>
      received.push(c)
    );

    expect(result).toBeNull();
    expect(loggerMock.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'mistralFallbackEmptyStream' }),
      'Mistral fallback (stream) returned empty content.'
    );
  });

  it('should retry with fallback model on 429 error during streaming', async () => {
    const rateLimitError = new Error('Rate Limit');
    (rateLimitError as any).status = 429;

    // First call fails with 429
    mockOpenAICreateChatCompletion.mockRejectedValueOnce(rateLimitError);

    // Second call (fallback model) succeeds
    const chunks = [{ choices: [{ delta: { content: 'Fallback model response' } }] }];
    async function* createAsyncIterable() {
      for (const chunk of chunks) {
        yield chunk;
      }
    }
    mockOpenAICreateChatCompletion.mockResolvedValueOnce(createAsyncIterable());

    const received: string[] = [];
    const result = await openaiHelper.getChatCompletionStream(testMessages, (c: string) =>
      received.push(c)
    );

    expect(result).toBe('Fallback model response');
    expect(received).toEqual(['Fallback model response']);
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'rateLimitStream', isRateLimit: true }),
      expect.stringContaining('Received 429 during stream')
    );
  });

  it('should fall back to Mistral when fallback model also fails with 429', async () => {
    const rateLimitError = new Error('Rate Limit');
    (rateLimitError as any).status = 429;

    // Both OpenAI calls fail with 429
    mockOpenAICreateChatCompletion.mockRejectedValue(rateLimitError);

    async function* mistralStream() {
      yield 'Mistral after double 429';
    }
    mockGetMistralChatCompletionStream.mockImplementation(async (_messages, onChunk) => {
      let fullText = '';
      for await (const chunk of mistralStream()) {
        onChunk(chunk);
        fullText += chunk;
      }
      return fullText;
    });

    const received: string[] = [];
    const result = await openaiHelper.getChatCompletionStream(testMessages, (c: string) =>
      received.push(c)
    );

    expect(result).toBe('Mistral after double 429');
    expect(received).toEqual(['Mistral after double 429']);
    expect(loggerMock.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'fallbackStreamFailure' }),
      'Fallback OpenAI model also failed during streaming'
    );
  });
});
