// import MistralClient, { ChatCompletionResponse } from '@mistralai/mistralai'; // Changed to dynamic import
import { getLogger } from './logger';
import { withRetry, RetryConfig } from './retryHelper';
import CircuitBreaker from 'opossum';

const logger = getLogger('mistralHelper');

// MISTRAL_API_KEY diagnostics (PR31)
const mistralApiKey = process.env.MISTRAL_API_KEY;
logger.debug('MISTRAL_HELPER_RUNTIME_KEY_CHECK: MISTRAL_API_KEY type:', typeof mistralApiKey);
if (mistralApiKey) {
  logger.debug(
    'MISTRAL_HELPER_RUNTIME_KEY_CHECK: MISTRAL_API_KEY exists. Length:',
    mistralApiKey.length
  );
  const partialKey =
    mistralApiKey.substring(0, Math.min(4, mistralApiKey.length)) +
    '...' +
    (mistralApiKey.length > 4
      ? mistralApiKey.substring(mistralApiKey.length - Math.min(4, mistralApiKey.length - 4))
      : '');
  logger.debug('MISTRAL_HELPER_RUNTIME_KEY_CHECK: MISTRAL_API_KEY partial value:', partialKey);
} else {
  logger.debug('MISTRAL_HELPER_RUNTIME_KEY_CHECK: MISTRAL_API_KEY is undefined or empty.');
}

const MISTRAL_API_KEY = mistralApiKey;
const MISTRAL_FALLBACK_MODEL_NAME =
  process.env.MISTRAL_FALLBACK_MODEL_NAME || 'mistral-small-latest';

if (!MISTRAL_API_KEY) {
  logger.error(
    'MISTRAL_API_KEY is not defined in environment variables. Mistral fallback will be disabled.'
  );
}

let mistralClient: any | null = null; // Changed type to any, removed static initialization

// Helper function to get the initialized Mistral client
async function getClient(): Promise<any> {
  // Type 'any' for now, can be refined
  if (!mistralClient && MISTRAL_API_KEY) {
    try {
      const MistralClientModule = await import('@mistralai/mistralai');
      mistralClient = new MistralClientModule.default(MISTRAL_API_KEY); // Or MistralClientModule.MistralClient
      logger.info('Mistral client dynamically initialized.');
    } catch (e) {
      logger.error({ error: e }, 'Failed to dynamically import or initialize MistralClient.');
      throw new Error('Failed to initialize Mistral AI client.');
    }
  }
  if (!mistralClient) {
    // This error will be hit if API key is missing OR if dynamic import/init failed.
    throw new Error(
      'Mistral client not available. API key may be missing or initialization failed.'
    );
  }
  return mistralClient;
}

export const DEFAULT_MISTRAL_RETRY_CONFIG: RetryConfig = {
  retries: 2,
  minTimeout: 1000,
  maxTimeout: 3000,
  factor: 2,
  retryableStatusCodes: [429, 500, 502, 503, 504],
};

// Override retries via ENV for production tuning
const parsedMistralRetries = parseInt(process.env.MISTRAL_CHAT_MAX_RETRIES || '', 10);
export const MISTRAL_CHAT_MAX_RETRIES =
  !isNaN(parsedMistralRetries) && parsedMistralRetries >= 0 ? parsedMistralRetries : 0; // default 0 retries

const MISTRAL_CHAT_RETRY_CONFIG: RetryConfig = {
  ...DEFAULT_MISTRAL_RETRY_CONFIG,
  retries: MISTRAL_CHAT_MAX_RETRIES,
  description: 'Mistral Chat Completion',
};

interface MistralChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

async function protectedGetMistralChatCompletion(
  messages: MistralChatMessage[],
  modelName: string = MISTRAL_FALLBACK_MODEL_NAME
): Promise<string> {
  const client = await getClient();

  try {
    logger.info(
      {
        functionName: 'protectedGetMistralChatCompletion',
        modelName,
        messageCount: messages.length,
      },
      'Requesting Mistral chat completion'
    );
    const response = await client.chat({
      // Use dynamically obtained client
      model: modelName,
      messages: messages,
    });

    if (response.choices && response.choices.length > 0 && response.choices[0].message) {
      const content = response.choices[0].message.content;
      logger.info(
        { functionName: 'protectedGetMistralChatCompletion', modelName, responseId: response.id },
        'Mistral chat completion successful'
      );
      return content || '';
    } else {
      logger.error(
        { functionName: 'protectedGetMistralChatCompletion', modelName, response },
        'Invalid or empty response from Mistral API'
      );
      throw new Error('Invalid or empty response from Mistral API');
    }
  } catch (error: unknown) {
    logger.error(
      {
        functionName: 'protectedGetMistralChatCompletion',
        modelName,
        error: {
          message: error instanceof Error ? error.message : String(error),
          name: error instanceof Error ? error.name : 'Unknown',
          status: (error as { status?: number }).status,
          stack: error instanceof Error ? error.stack : undefined,
        },
      },
      'Mistral API call failed'
    );
    throw error;
  }
}

const mistralChatBreakerOptions = {
  timeout: 10000,
  errorThresholdPercentage: 60,
  volumeThreshold: 5,
  resetTimeout: 45_000,
};

const mistralChatCompletionBreaker = new CircuitBreaker(
  protectedGetMistralChatCompletion,
  mistralChatBreakerOptions
);

const mistralBreakerName = 'mistralChatCompletionBreaker';
mistralChatCompletionBreaker.on('success', (result: any, latencyMs?: number) => {
  logger.info(
    {
      event: 'circuit',
      breakerName: mistralBreakerName,
      state: 'success' as const,
      latencyMs,
      resultSummary: 'chat_completion_successful',
    },
    `Circuit ${mistralBreakerName} success`
  );
});
mistralChatCompletionBreaker.on('failure', (error: Error, latencyMs?: number) => {
  logger.error(
    {
      event: 'circuit',
      breakerName: mistralBreakerName,
      state: 'failure' as const,
      latencyMs,
      error: { message: error.message, name: error.name, stack: error.stack },
    },
    `Circuit ${mistralBreakerName} failed`
  );
});
mistralChatCompletionBreaker.on('open', () => {
  logger.error(
    {
      event: 'circuit',
      breakerName: mistralBreakerName,
      state: 'open' as const,
    },
    `Circuit ${mistralBreakerName} opened`
  );
});
mistralChatCompletionBreaker.on('close', () => {
  logger.info(
    {
      event: 'circuit',
      breakerName: mistralBreakerName,
      state: 'close' as const,
    },
    `Circuit ${mistralBreakerName} closed`
  );
});
mistralChatCompletionBreaker.on('halfOpen', (numConsecutiveFailures?: number) => {
  logger.warn(
    {
      event: 'circuit',
      breakerName: mistralBreakerName,
      state: 'halfOpen' as const,
      numConsecutiveFailures,
    },
    `Circuit ${mistralBreakerName} halfOpen`
  );
});
mistralChatCompletionBreaker.on('reject', (error: Error) => {
  logger.warn(
    {
      event: 'circuit',
      breakerName: mistralBreakerName,
      state: 'reject' as const,
      error: { message: error.message, name: error.name },
    },
    `Circuit ${mistralBreakerName} rejected`
  );
});
mistralChatCompletionBreaker.on('timeout', (error: Error) => {
  logger.warn(
    {
      event: 'circuit',
      breakerName: mistralBreakerName,
      state: 'timeout' as const,
      error: { message: error.message, name: error.name },
    },
    `Circuit ${mistralBreakerName} timed out`
  );
});

export async function getMistralChatCompletion(
  messages: MistralChatMessage[],
  modelName: string = MISTRAL_FALLBACK_MODEL_NAME
): Promise<string> {
  if (!MISTRAL_API_KEY) {
    // Check for API key early
    logger.error(
      'Attempted to call getMistralChatCompletion but Mistral API key is not configured.'
    );
    throw new Error('Mistral AI service is not configured (API key missing).');
  }
  // getClient() will be called inside the retry wrapper, ensuring client is initialized before use.
  return withRetry(
    () => mistralChatCompletionBreaker.fire(messages, modelName),
    MISTRAL_CHAT_RETRY_CONFIG,
    `Mistral Chat Completion - Model: ${modelName}`
  );
}

async function protectedGetMistralChatCompletionStream(
  messages: MistralChatMessage[],
  onChunk: (chunk: string) => void,
  modelName: string = MISTRAL_FALLBACK_MODEL_NAME
): Promise<string> {
  const client = await getClient();
  let fullContent = '';
  try {
    logger.info(
      { functionName: 'protectedGetMistralChatCompletionStream', modelName },
      'Requesting Mistral chat stream'
    );
    const stream = await client.chatStream({
      model: modelName,
      messages: messages,
    });

    for await (const chunk of stream) {
      if (chunk.choices[0].delta.content) {
        const content = chunk.choices[0].delta.content;
        fullContent += content;
        onChunk(content);
      }
    }
    return fullContent;
  } catch (error: unknown) {
    logger.error(
      {
        functionName: 'protectedGetMistralChatCompletionStream',
        error: {
          message: error instanceof Error ? error.message : String(error),
          name: error instanceof Error ? error.name : 'Unknown',
        },
      },
      'Mistral API stream failed'
    );
    throw error;
  }
}

const mistralStreamBreakerOptions = { ...mistralChatBreakerOptions, timeout: 20000 };
const mistralChatStreamBreaker = new CircuitBreaker(
  protectedGetMistralChatCompletionStream,
  mistralStreamBreakerOptions
);

// Simplified logging for stream breaker for now
mistralChatStreamBreaker.on('failure', () => logger.warn('Mistral stream breaker failed.'));
mistralChatStreamBreaker.on('open', () => logger.error('Mistral stream breaker opened.'));
mistralChatStreamBreaker.on('close', () => logger.info('Mistral stream breaker closed.'));

export async function getMistralChatCompletionStream(
  messages: MistralChatMessage[],
  onChunk: (chunk: string) => void,
  modelName: string = MISTRAL_FALLBACK_MODEL_NAME
): Promise<string> {
  if (!MISTRAL_API_KEY) {
    logger.error(
      'Attempted to call getMistralChatCompletionStream but Mistral API key is not configured.'
    );
    throw new Error('Mistral AI service is not configured (API key missing).');
  }
  return withRetry(
    () => mistralChatStreamBreaker.fire(messages, onChunk, modelName),
    MISTRAL_CHAT_RETRY_CONFIG,
    `Mistral Chat Stream - Model: ${modelName}`
  );
}

logger.info('Mistral Helper module loaded.');
