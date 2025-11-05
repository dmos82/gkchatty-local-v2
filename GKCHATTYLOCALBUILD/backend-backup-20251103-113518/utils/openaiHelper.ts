import { OpenAI } from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletion,
  ChatCompletionCreateParamsStreaming,
  ChatCompletionCreateParamsNonStreaming,
} from 'openai/resources/chat/completions';
import type { Stream } from 'openai/streaming';
import axios from 'axios';
import { withRetry, DEFAULT_OPENAI_RETRY_CONFIG } from './retryHelper';
import CircuitBreaker from 'opossum';
import { getLogger } from './logger';
import { getMistralChatCompletion, getMistralChatCompletionStream } from './mistralHelper';
import { getOpenAIConfig } from '../services/settingsService';
import { v4 as uuidv4 } from 'uuid';

const logger = getLogger('openaiHelper');

/**
 * Determines the appropriate temperature for a given chat model.
 * The newer gpt-4o family currently only supports the default temperature (1).
 * All other models fall back to 0.7 unless future constraints arise.
 * @param model - The model name being called
 */
function getTemperature(model: string): number {
  const m = model.toLowerCase();
  // Models in the new 4o family are very strict: only temperature 1 supported.
  // They appear in various forms (e.g. 'gpt-4o-mini', 'o4-mini').
  const isFourOFamily = m.startsWith('gpt-4o') || m.startsWith('o4');
  const temp = isFourOFamily ? 1 : 0.7;
  // Debug – remove once verified in production
  logger.debug(`[LLM Helper] getTemperature -> model: ${model}, temperature: ${temp}`);
  return temp;
}

// Fallback state tracking - initialize to use primary model
let useFallbackChatModel = false;

// ----- Timeout Configuration -----
const DEFAULT_HTTP_TIMEOUT_MS = 60000; // 60 seconds default
const configuredTimeout = parseInt(process.env.OPENAI_HTTP_TIMEOUT_MS || '', 10);
const isTimeoutInvalid = isNaN(configuredTimeout) || configuredTimeout <= 0;
export const HTTP_TIMEOUT_MS = isTimeoutInvalid ? DEFAULT_HTTP_TIMEOUT_MS : configuredTimeout;

// Check if OpenAI API key is available
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error('OPENAI_API_KEY is not defined in environment variables');
}

// Log API key availability (without exposing the actual key)
logger.info(`[LLM Config] OpenAI API Key available: ${!!apiKey}`);

// Get model configuration from environment
const PRIMARY_CHAT_MODEL = process.env.OPENAI_PRIMARY_CHAT_MODEL || 'gpt-4o-mini';
const FALLBACK_CHAT_MODEL = process.env.OPENAI_FALLBACK_CHAT_MODEL || 'gpt-3.5-turbo';
const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';

// Log the configuration
logger.info(`[LLM Config] Primary Chat Model: ${PRIMARY_CHAT_MODEL}`);
logger.info(`[LLM Config] Fallback Chat Model: ${FALLBACK_CHAT_MODEL}`);
logger.info(`[LLM Config] Embedding Model: ${EMBEDDING_MODEL}`);
logger.info(
  `[LLM Config] Current Chat Model: ${useFallbackChatModel ? FALLBACK_CHAT_MODEL : PRIMARY_CHAT_MODEL}`
);

// --- Pricing Constants (per token) ---
const MODEL_PRICING: { [key: string]: { input: number; output: number } } = {
  'gpt-4o-mini': { input: 0.0000005, output: 0.0000015 },
  'gpt-4.1-mini-2025-04-14': { input: 0.0000004, output: 0.0000016 },
  'gpt-3.5-turbo': { input: 0.0000005, output: 0.0000015 },
  'gpt-3.5-turbo-0125': { input: 0.0000005, output: 0.0000015 },
};
// -----------------------------------

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: apiKey,
  timeout: HTTP_TIMEOUT_MS,
});

// Create a function to get OpenAI client with proper API key
let cachedApiKey: string | null = null;
let cachedOpenAI: OpenAI | null = null;

async function getOpenAIClient(): Promise<OpenAI> {
  try {
    const adminConfig = await getOpenAIConfig();
    const effectiveApiKey = adminConfig.apiKey || apiKey || '';

    // If API key hasn't changed, return cached client
    if (cachedApiKey === effectiveApiKey && cachedOpenAI) {
      return cachedOpenAI;
    }

    // Create new client with the effective API key
    logger.info(
      '[LLM Helper] Creating OpenAI client with',
      adminConfig.apiKey ? 'admin-configured' : 'environment',
      'API key'
    );
    cachedApiKey = effectiveApiKey;
    cachedOpenAI = new OpenAI({
      apiKey: effectiveApiKey,
      timeout: HTTP_TIMEOUT_MS,
    });

    return cachedOpenAI;
  } catch (error) {
    logger.error('[LLM Helper] Error getting OpenAI client, using default:', error);
    return openai; // Fall back to environment-based client
  }
}

// For direct API calls when the SDK client is unavailable
const OPENAI_EMBEDDING_API_URL = 'https://api.openai.com/v1/embeddings';

// ---------------- Token Limit Configuration ----------------
// Model-specific maximum completion token limits
const MODEL_COMPLETION_LIMITS: Record<string, number> = {
  // GPT-3.5 models
  'gpt-3.5-turbo': 4096,
  'gpt-3.5-turbo-0125': 4096,
  'gpt-3.5-turbo-16k': 4096, // Output limit, not context

  // GPT-4 models
  'gpt-4': 4096,
  'gpt-4-0613': 4096,
  'gpt-4-32k': 4096,
  'gpt-4-32k-0613': 4096,

  // GPT-4 Turbo models
  'gpt-4-turbo': 4096,
  'gpt-4-turbo-2024-04-09': 4096,
  'gpt-4-turbo-preview': 4096,
  'gpt-4-1106-preview': 4096,
  'gpt-4-0125-preview': 4096,

  // GPT-4o models (newer models with higher limits)
  'gpt-4o': 16384,
  'gpt-4o-mini': 16384,
  'o4-mini': 16384,
  'o4-mini-2025-04-16': 16384,

  // Custom/special models
  'gpt-4.1-mini': 4096, // Conservative default for custom model
  'gpt-4.1-mini-2025-04-14': 4096,
};

// Default safe limit for unknown models
const DEFAULT_SAFE_MAX_TOKENS = 4096;

// Allow overriding the default completion-token limit via ENV.
// If not provided or invalid, fall back to 4096.
const DEFAULT_MAX_COMPLETION_TOKENS = 4096;
const configuredMaxTokens = parseInt(process.env.OPENAI_MAX_COMPLETION_TOKENS || '', 10);
export const MAX_COMPLETION_TOKENS =
  !isNaN(configuredMaxTokens) && configuredMaxTokens > 0
    ? configuredMaxTokens
    : DEFAULT_MAX_COMPLETION_TOKENS;

// Helper to get the appropriate max tokens for a model
function getModelMaxTokens(model: string): number {
  const modelLower = model.toLowerCase();

  // Check for exact match first
  if (MODEL_COMPLETION_LIMITS[model]) {
    return MODEL_COMPLETION_LIMITS[model];
  }

  // Check for lowercase match
  if (MODEL_COMPLETION_LIMITS[modelLower]) {
    return MODEL_COMPLETION_LIMITS[modelLower];
  }

  // Check for partial matches (e.g., model variants)
  for (const [key, limit] of Object.entries(MODEL_COMPLETION_LIMITS)) {
    if (modelLower.startsWith(key.toLowerCase()) || key.toLowerCase().startsWith(modelLower)) {
      return limit;
    }
  }

  // Default safe limit for unknown models
  logger.warn(
    { model },
    `[LLM Helper] Unknown model "${model}", using default safe limit of ${DEFAULT_SAFE_MAX_TOKENS} tokens`
  );
  return DEFAULT_SAFE_MAX_TOKENS;
}

// Helper to decide which token-count parameter the model expects
function buildChatParams(
  model: string,
  messages: ChatCompletionMessageParam[],
  requestedTokenLimit: number
): Record<string, unknown> {
  // Get model-specific limit
  const modelMaxTokens = getModelMaxTokens(model);

  // Use the minimum of requested limit and model's maximum
  const actualTokenLimit = Math.min(requestedTokenLimit, modelMaxTokens);

  // Log the token limit being used
  logger.info(
    {
      model,
      requestedTokens: requestedTokenLimit,
      modelLimit: modelMaxTokens,
      actualTokens: actualTokenLimit,
    },
    '[LLM Helper] Setting completion tokens for chat request'
  );

  const params: Record<string, unknown> = {
    model,
    messages,
    temperature: getTemperature(model),
  };

  const m = model.toLowerCase();
  const usesCompletionParam = m.startsWith('gpt-4o') || m.startsWith('o4');

  if (usesCompletionParam) {
    params.max_completion_tokens = actualTokenLimit;
  } else {
    params.max_tokens = actualTokenLimit;
  }

  return params;
}

// ---------------- Circuit Breaker ----------------
// Function that performs the raw OpenAI chat completion call
// (rawChatCompletion removed – logic now embedded directly in breaker)

// Configure circuit breaker
const chatBreakerOptions = {
  errorThresholdPercentage: 25,
  volumeThreshold: 10,
  timeout: 60000, // Increased to 60s for better reliability
  resetTimeout: 60_000,
};

export const chatCompletionBreaker = new CircuitBreaker(
  async (params: ChatCompletionCreateParamsStreaming | ChatCompletionCreateParamsNonStreaming) => {
    // Get the properly configured OpenAI client
    const client = await getOpenAIClient();
    // Directly await the SDK call. It has its own timeout (HTTP_TIMEOUT_MS).
    // The inner withRetry has been removed as per GKCHATTY-PH4B-T1.
    return await client.chat.completions.create(params);
  },
  chatBreakerOptions
);

// Attach event logging for breakers
[chatCompletionBreaker].forEach(b => {
  ['open', 'halfOpen', 'close', 'success', 'failure', 'reject', 'timeout'].forEach(evt => {
    // @ts-ignore - Circuit breaker event types are complex, using generic handler
    b.on(evt, (detail: unknown) => {
      logger.warn(
        { event: 'circuit', breaker: b.name, state: evt, detail },
        `Circuit ${b.name} ${evt}`
      );
    });
  });
});

// ---------------- Retry Configuration ----------------
const parsedRetries = parseInt(process.env.OPENAI_CHAT_MAX_RETRIES || '', 10);
export const OPENAI_CHAT_MAX_RETRIES =
  !isNaN(parsedRetries) && parsedRetries >= 0 ? parsedRetries : 1; // production-sensible default (1 retry)

const OPENAI_CHAT_RETRY_CONFIG = {
  ...DEFAULT_OPENAI_RETRY_CONFIG,
  retries: OPENAI_CHAT_MAX_RETRIES,
};

// Retry Configuration for Embeddings
const parsedEmbeddingRetries = parseInt(process.env.OPENAI_EMBEDDING_MAX_RETRIES || '', 10);
export const OPENAI_EMBEDDING_MAX_RETRIES =
  !isNaN(parsedEmbeddingRetries) && parsedEmbeddingRetries >= 0 ? parsedEmbeddingRetries : 2; // Sensible default (e.g., 2 retries)

export const OPENAI_EMBEDDING_RETRY_CONFIG = {
  ...DEFAULT_OPENAI_RETRY_CONFIG,
  retries: OPENAI_EMBEDDING_MAX_RETRIES,
  description: 'OpenAI Embedding Generation', // Specific description for logs
};

/**
 * Gets a chat completion from OpenAI with fallback mechanism
 * @param messages - Array of chat messages in OpenAI format
 * @returns Promise resolving to the full ChatCompletion object or null
 */
export async function getChatCompletion(
  messages: ChatCompletionMessageParam[]
): Promise<ChatCompletion | null> {
  // Fetch admin-configured settings
  let adminConfig;
  let modelToUse = PRIMARY_CHAT_MODEL; // Default to environment variable

  try {
    logger.info('[LLM Helper] Fetching admin OpenAI configuration...');
    adminConfig = await getOpenAIConfig();

    // Use admin-configured model if available, otherwise fall back to environment
    if (adminConfig.modelId) {
      modelToUse = adminConfig.modelId;
      logger.info(`[LLM Helper] Using admin-configured model: ${modelToUse}`);
    } else {
      // Check fallback state for environment-based model selection
      modelToUse = useFallbackChatModel ? FALLBACK_CHAT_MODEL : PRIMARY_CHAT_MODEL;
      logger.info(`[LLM Helper] No admin model configured, using environment model: ${modelToUse}`);
    }

    // Log API key source for debugging
    if (adminConfig.apiKey) {
      logger.info('[LLM Helper] Using admin-configured API key (database)');
    } else {
      logger.info('[LLM Helper] Using environment API key (fallback)');
    }
  } catch (configError) {
    logger.error(
      '[LLM Helper] Error fetching admin config, falling back to environment:',
      configError
    );
    modelToUse = useFallbackChatModel ? FALLBACK_CHAT_MODEL : PRIMARY_CHAT_MODEL;
  }

  logger.info(`[LLM Helper] Requesting chat completion with model: ${modelToUse}`);

  try {
    // Wrap the chat completion call with our retry utility
    return await withRetry(
      async () => {
        const startTime = Date.now(); // Start timer
        const completion = (await chatCompletionBreaker.fire(
          buildChatParams(
            modelToUse,
            messages,
            MAX_COMPLETION_TOKENS
          ) as unknown as ChatCompletionCreateParamsNonStreaming
        )) as ChatCompletion;
        const duration = Date.now() - startTime; // End timer

        // --- Token Usage and Cost Logging ---
        if (completion?.usage) {
          const usage = completion.usage;
          const modelUsed = completion.model; // Get the exact model used from response
          const pricing = MODEL_PRICING[modelUsed] ||
            MODEL_PRICING[PRIMARY_CHAT_MODEL] || { input: 0.0000005, output: 0.0000015 }; // Fallback pricing

          if (!MODEL_PRICING[modelUsed]) {
            logger.warn(
              { modelUsed, pricingSource: 'defaultEstimation' },
              'Pricing not found for model. Using default pricing for cost estimation.'
            );
          }

          const inputCost = usage.prompt_tokens * pricing.input;
          const outputCost = usage.completion_tokens * pricing.output;
          const totalCost = inputCost + outputCost;

          logger.info(
            {
              event: 'usage',
              modelUsed,
              provider: 'OpenAI',
              durationMs: duration,
              promptTokens: usage.prompt_tokens,
              completionTokens: usage.completion_tokens,
              totalTokens: usage.total_tokens,
              estimatedCost: `$${totalCost.toFixed(6)}`,
            },
            'Usage Log'
          );
        } else {
          logger.warn('Response did not contain usage data.');
        }
        // --- End Logging ---

        // Check if choices exist
        if (!completion || !completion.choices || completion.choices.length === 0) {
          logger.warn('No choices returned from API.');
          return null;
        }

        // Detect empty content or model hitting max token limit
        const firstChoice = completion.choices?.[0];
        const finishReason = firstChoice?.finish_reason;
        const messageContent = firstChoice?.message?.content?.trim();

        if (!messageContent || (finishReason === 'length' && !messageContent)) {
          logger.warn(
            {
              event: 'openaiEmptyContent',
              modelUsed: completion.model,
              finishReason,
              promptTokens: completion.usage?.prompt_tokens,
              completionTokens: completion.usage?.completion_tokens,
            },
            'OpenAI returned empty content or hit length limit – treating as failure to trigger fallback.'
          );
          // Simulate error to trigger catch block & fallback logic
          const err = new Error('OpenAI returned empty content or hit length limit') as Error & {
            status: number;
          };
          err.status = 500;
          throw err;
        }

        // Return the full completion object
        return completion;
      },
      OPENAI_CHAT_RETRY_CONFIG,
      'Chat completion'
    );
  } catch (error: unknown) {
    // Opossum throws an error with message "Breaker is open" when circuit is open
    if (error instanceof Error && error.message === 'Breaker is open') {
      // Add a property to the error so the calling function knows the circuit was open
      (error as Error & { isCircuitOpen?: boolean }).isCircuitOpen = true;
    }
    // ---------------- Mistral Fallback Path ----------------
    try {
      const errorWithProps = error as {
        status?: number;
        message?: string;
        name?: string;
        isCircuitOpen?: boolean;
      };
      logger.warn(
        {
          event: 'openaiError',
          err: {
            status: errorWithProps.status,
            message: errorWithProps.message,
            name: errorWithProps.name,
          },
          isRateLimit: errorWithProps.status === 429,
          isCircuitOpen: errorWithProps.isCircuitOpen,
        },
        'Primary OpenAI call failed, attempting Mistral fallback.'
      );

      const mistralContent = await getMistralChatCompletion(
        messages.map(m => ({
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content as string,
        }))
      );

      if (mistralContent) {
        logger.info({ event: 'mistralFallbackSuccess' }, 'Mistral AI fallback successful.');
        return createSynthesizedMistralResponse(mistralContent);
      }

      logger.error({ event: 'mistralFallbackFailure' }, 'Mistral fallback failed.');
      return null;
    } catch (mistralErr) {
      logger.error(
        { err: mistralErr, event: 'mistralFallbackFailure' },
        'Mistral fallback failed.'
      );
      return null;
    }
  }
}

/**
 * Gets a chat completion from OpenAI with fallback mechanism, returning just the content string
 * @param messages - Array of chat messages in OpenAI format
 * @returns Promise resolving to the completion text
 */
export async function getChatCompletionWithMessages(
  messages: ChatCompletionMessageParam[]
): Promise<string> {
  const response = await getChatCompletion(messages);
  if (response?.choices[0]?.message?.content) {
    return response.choices[0].message.content;
  }
  // Throw explicit error so callers/tests can assert.
  throw new Error('OpenAI and Mistral fallbacks failed');
}

// Define protected operations for embeddings FIRST
async function protectedSingleEmbeddingOperation(text: string): Promise<number[]> {
  try {
    logger.info(
      { functionName: 'protectedSingleEmbeddingOperation', textLength: text.length },
      'Generating single embedding'
    );
    // SDK/Axios logic for single embedding
    try {
      logger.debug({ model: EMBEDDING_MODEL }, 'Using SDK for single embedding');
      const client = await getOpenAIClient();
      const response = await client.embeddings.create({ model: EMBEDDING_MODEL, input: text });
      if (!response?.data?.[0]?.embedding) {
        logger.error('Invalid single embedding response format from SDK');
        throw new Error('Invalid single embedding response format');
      }
      logger.debug(
        { dims: response.data[0].embedding.length },
        'Single embedding generated via SDK'
      );
      return response.data[0].embedding;
    } catch (sdkError: unknown) {
      const errorProps = sdkError as { message?: string; name?: string; status?: number };
      logger.warn(
        {
          error: { message: errorProps.message, name: errorProps.name, status: errorProps.status },
        },
        'SDK single embedding failed, falling back to axios'
      );
      // Get effective API key for axios fallback
      const adminConfig = await getOpenAIConfig();
      const effectiveApiKey = adminConfig.apiKey || apiKey || '';

      const response = await axios.post(
        OPENAI_EMBEDDING_API_URL,
        { model: EMBEDDING_MODEL, input: text },
        {
          headers: {
            Authorization: `Bearer ${effectiveApiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );
      if (!response?.data?.data?.[0]?.embedding) {
        logger.error('Invalid single embedding response format from Axios fallback');
        throw new Error('Invalid single embedding response format from direct API call');
      }
      logger.debug(
        { dims: response.data.data[0].embedding.length },
        'Single embedding generated via Axios'
      );
      return response.data.data[0].embedding;
    }
  } catch (error: unknown) {
    logger.error(
      {
        functionName: 'protectedSingleEmbeddingOperation',
        error: {
          message: (error as { message?: string; name?: string }).message,
          name: (error as { message?: string; name?: string }).name,
        },
      },
      'Error generating single embedding'
    );
    throw error; // Re-throw to be caught by circuit breaker (and outer retry)
  }
}

async function protectedBatchEmbeddingOperation(texts: string[]): Promise<number[][]> {
  if (!texts || texts.length === 0) {
    logger.info(
      { functionName: 'protectedBatchEmbeddingOperation' },
      'Empty input for batch embeddings, returning empty array.'
    );
    return [];
  }
  try {
    logger.info(
      { functionName: 'protectedBatchEmbeddingOperation', count: texts.length },
      'Generating batch embeddings'
    );
    // SDK/Axios logic for batch embeddings
    try {
      logger.debug({ model: EMBEDDING_MODEL }, 'Using SDK for batch embeddings');
      const client = await getOpenAIClient();
      const response = await client.embeddings.create({ model: EMBEDDING_MODEL, input: texts });
      if (!response?.data || response.data.length !== texts.length) {
        logger.error('Invalid batch embedding response format or count mismatch from SDK');
        throw new Error('Invalid batch embedding response format or count mismatch');
      }
      const sortedEmbeddings = response.data
        .sort((a, b) => a.index - b.index)
        .map(item => item.embedding);
      logger.debug({ count: sortedEmbeddings.length }, 'Batch embeddings generated via SDK');
      return sortedEmbeddings;
    } catch (sdkError: unknown) {
      logger.warn(
        {
          error: {
            message: (sdkError as { message?: string; name?: string; status?: number }).message,
            name: (sdkError as { message?: string; name?: string; status?: number }).name,
            status: (sdkError as { message?: string; name?: string; status?: number }).status,
          },
        },
        'SDK batch embedding failed, falling back to axios'
      );
      // Get effective API key for axios fallback
      const adminConfig = await getOpenAIConfig();
      const effectiveApiKey = adminConfig.apiKey || apiKey || '';

      const response = await axios.post(
        OPENAI_EMBEDDING_API_URL,
        { model: EMBEDDING_MODEL, input: texts },
        {
          headers: {
            Authorization: `Bearer ${effectiveApiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );
      if (!response?.data?.data || response.data.data.length !== texts.length) {
        logger.error(
          'Invalid batch embedding response format or count mismatch from Axios fallback'
        );
        throw new Error(
          'Invalid batch embedding response format or count mismatch from direct API call'
        );
      }
      const sortedEmbeddings = response.data.data
        .sort((a: { index: number }, b: { index: number }) => a.index - b.index)
        .map((item: { embedding: number[] }) => item.embedding);
      logger.debug({ count: sortedEmbeddings.length }, 'Batch embeddings generated via Axios');
      return sortedEmbeddings;
    }
  } catch (error: unknown) {
    logger.error(
      {
        functionName: 'protectedBatchEmbeddingOperation',
        error: {
          message: (error as { message?: string; name?: string }).message,
          name: (error as { message?: string; name?: string }).name,
        },
      },
      'Error generating batch embeddings'
    );
    throw error; // Re-throw to be caught by circuit breaker (and outer retry)
  }
}

// Re-define embeddingBreakerOptions (it was defined before but now we might have two)
const singleEmbeddingBreakerOptions = {
  errorThresholdPercentage: 50,
  volumeThreshold: 10,
  timeout: 5000, // Proposed: 5,000ms (5s)
  resetTimeout: 60_000,
};
const singleEmbeddingBreaker = new CircuitBreaker(
  protectedSingleEmbeddingOperation,
  singleEmbeddingBreakerOptions
);

const batchEmbeddingBreakerOptions = {
  // Potentially same options, or could differ if batch has different characteristics
  errorThresholdPercentage: 50,
  volumeThreshold: 10, // Lower volume for batch potentially
  timeout: 60000, // Increased to 60s for large document processing
  resetTimeout: 60_000,
};
const batchEmbeddingBreaker = new CircuitBreaker(
  protectedBatchEmbeddingOperation,
  batchEmbeddingBreakerOptions
);

// Updated event logging for ALL breakers
const breakers = [
  { name: 'chatCompletionBreaker', instance: chatCompletionBreaker },
  { name: 'singleEmbeddingBreaker', instance: singleEmbeddingBreaker },
  { name: 'batchEmbeddingBreaker', instance: batchEmbeddingBreaker },
];

breakers.forEach(({ name, instance }: { name: string; instance: CircuitBreaker }) => {
  // Corrected event handlers
  instance.on('success', (result: unknown, latencyMs?: number) => {
    let resultSummary: unknown = 'operation_successful';
    if (name === 'singleEmbeddingBreaker' && Array.isArray(result)) {
      resultSummary = { dimensions: result.length, firstElement: result[0] };
    } else if (name === 'batchEmbeddingBreaker' && Array.isArray(result)) {
      resultSummary = { count: result.length, dimensions: result[0]?.length };
    } else if (name === 'chatCompletionBreaker' && result && typeof result === 'object') {
      const chatResult = result as ChatCompletion;
      resultSummary = { id: chatResult.id, model: chatResult.model, usage: chatResult.usage };
    }
    logger.info(
      { event: 'circuit', breakerName: name, state: 'success' as const, latencyMs, resultSummary },
      `Circuit ${name} success`
    );
  });

  instance.on('failure', (error: Error, latencyMs?: number) => {
    logger.error(
      {
        event: 'circuit',
        breakerName: name,
        state: 'failure' as const,
        latencyMs,
        error: { message: error.message, name: error.name, stack: error.stack },
      },
      `Circuit ${name} failed`
    );
  });

  instance.on('open', () => {
    logger.error(
      { event: 'circuit', breakerName: name, state: 'open' as const },
      `Circuit ${name} opened`
    );
  });

  instance.on('close', () => {
    logger.info(
      { event: 'circuit', breakerName: name, state: 'close' as const },
      `Circuit ${name} closed`
    );
  });

  instance.on('halfOpen', (numConsecutiveFailures?: number) => {
    logger.warn(
      { event: 'circuit', breakerName: name, state: 'halfOpen' as const, numConsecutiveFailures },
      `Circuit ${name} halfOpen`
    );
  });

  instance.on('reject', (error: Error) => {
    logger.warn(
      {
        event: 'circuit',
        breakerName: name,
        state: 'reject' as const,
        error: {
          message: (error as { message?: string; name?: string }).message,
          name: (error as { message?: string; name?: string }).name,
        },
      },
      `Circuit ${name} rejected`
    );
  });

  instance.on('timeout', (error: Error) => {
    logger.warn(
      {
        event: 'circuit',
        breakerName: name,
        state: 'timeout' as const,
        error: {
          message: (error as { message?: string; name?: string }).message,
          name: (error as { message?: string; name?: string }).name,
        },
      },
      `Circuit ${name} timed out`
    );
  });
});

// Update generateEmbedding to use the new breaker AND an outer retry
export async function generateEmbedding(text: string): Promise<number[]> {
  return withRetry(
    () => singleEmbeddingBreaker.fire(text),
    OPENAI_EMBEDDING_RETRY_CONFIG,
    'OpenAI Single Embedding via Breaker' // More specific description for this outer retry
  );
}

// Update generateEmbeddings to use the new breaker AND an outer retry
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (!texts || texts.length === 0) {
    logger.info(
      { functionName: 'generateEmbeddings' },
      'Empty input for batch embeddings, returning empty array directly from public function.'
    );
    return []; // Handle empty input before calling retry/breaker
  }
  return withRetry(
    () => batchEmbeddingBreaker.fire(texts),
    OPENAI_EMBEDDING_RETRY_CONFIG,
    'OpenAI Batch Embedding via Breaker' // More specific description for this outer retry
  );
}

// ADD BELOW: Streaming-compatible chat completion helper ---------------------------------------------

/**
 * Callback signature for receiving streaming chunks of assistant content.
 */
export type ChatStreamHandler = (chunk: string) => void;

/**
 * Streams a chat completion from OpenAI. If the OpenAI request fails, it will
 * transparently fall back to (non-streaming) Mistral and emit the entire
 * response as a single chunk so that the caller remains stream-compatible.
 *
 * NOTE: For simplicity, this implementation currently emits the raw content
 * returned from Mistral in a single call to `onChunk`. If native streaming
 * support is added to the Mistral SDK in the future, this logic can be
 * swapped out without impacting upstream callers.
 *
 * @param messages   Array of messages in OpenAI format.
 * @param onChunk    Callback that is invoked for every text delta received.
 * @returns          The final concatenated assistant response or `null` when
 *                   both providers fail.
 */
export async function getChatCompletionStream(
  messages: ChatCompletionMessageParam[],
  onChunk: ChatStreamHandler
): Promise<string | null> {
  // Fetch admin-configured settings
  let adminConfig;
  let initialModelToUse = PRIMARY_CHAT_MODEL; // Default to environment variable

  try {
    logger.info('[LLM Helper] Fetching admin OpenAI configuration for streaming...');
    adminConfig = await getOpenAIConfig();

    // Use admin-configured model if available, otherwise fall back to environment
    if (adminConfig.modelId) {
      initialModelToUse = adminConfig.modelId;
      logger.info(`[LLM Helper] Using admin-configured model (streaming): ${initialModelToUse}`);
    } else {
      // Check fallback state for environment-based model selection
      initialModelToUse = useFallbackChatModel ? FALLBACK_CHAT_MODEL : PRIMARY_CHAT_MODEL;
      logger.info(
        `[LLM Helper] No admin model configured (streaming), using environment model: ${initialModelToUse}`
      );
    }
  } catch (configError) {
    logger.error(
      '[LLM Helper] Error fetching admin config (streaming), falling back to environment:',
      configError
    );
    initialModelToUse = useFallbackChatModel ? FALLBACK_CHAT_MODEL : PRIMARY_CHAT_MODEL;
  }

  // Helper that performs the actual streamed request against a given model.
  const streamFromOpenAI = async (model: string): Promise<string> => {
    const params = {
      ...buildChatParams(model, messages, MAX_COMPLETION_TOKENS),
      stream: true,
    } as unknown as ChatCompletionCreateParamsStreaming;

    logger.info(
      { event: 'streamRequest', model },
      '[LLM Helper] Requesting streaming chat completion'
    );

    const stream = (await withRetry(
      () => chatCompletionBreaker.fire(params),
      OPENAI_CHAT_RETRY_CONFIG,
      'Chat completion SDK call (stream)'
    )) as Stream<OpenAI.Chat.Completions.ChatCompletionChunk>;

    let fullResponse = '';
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content ?? '';
      if (delta) {
        onChunk(delta);
        fullResponse += delta;
      }
    }
    return fullResponse;
  };

  try {
    const response = await streamFromOpenAI(initialModelToUse);
    return response;
  } catch (error: unknown) {
    // Handle rate-limit 429 separately so we can retry with fallback model
    const errorWithProps = error as {
      status?: number;
      message?: string;
      name?: string;
      isCircuitOpen?: boolean;
    };
    if (errorWithProps?.status === 429 && !useFallbackChatModel) {
      logger.warn(
        { event: 'rateLimitStream', isRateLimit: true, modelUsed: initialModelToUse },
        'Received 429 during stream – retrying with fallback model'
      );
      useFallbackChatModel = true;
      initialModelToUse = FALLBACK_CHAT_MODEL;
      try {
        const response = await streamFromOpenAI(initialModelToUse);
        return response;
      } catch (fallbackErr) {
        logger.error(
          { event: 'fallbackStreamFailure', error: fallbackErr },
          'Fallback OpenAI model also failed during streaming'
        );
        // fall through to Mistral section below
      }
    }

    // Non-429 errors or exhausted fallbacks → attempt Mistral
    const isCircuitOpen =
      errorWithProps?.message === 'Breaker is open' || errorWithProps?.isCircuitOpen;
    logger.warn(
      {
        event: 'openaiError',
        err: {
          status: errorWithProps?.status,
          message: errorWithProps?.message,
          name: errorWithProps?.name,
        },
        isRateLimit: errorWithProps?.status === 429,
        isCircuitOpen,
      },
      'Primary OpenAI streaming call failed, attempting Mistral fallback.'
    );

    try {
      const mistralMessages = messages
        .filter(m => m.role === 'user' || m.role === 'assistant' || m.role === 'system')
        .map(m => ({
          role: m.role as 'user' | 'assistant' | 'system',
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content || ''),
        }));

      const mistralResponse = await getMistralChatCompletionStream(mistralMessages, onChunk);
      if (mistralResponse) {
        // Note: getMistralChatCompletionStream already emits chunks via onChunk
        // So we don't need to call onChunk(mistralResponse) again to avoid duplicates
        logger.info(
          { event: 'mistralFallbackSuccessStream' },
          'Mistral fallback (stream) succeeded.'
        );
        return mistralResponse;
      }
      logger.error(
        { event: 'mistralFallbackEmptyStream' },
        'Mistral fallback (stream) returned empty content.'
      );
      return null;
    } catch (mistralErr: unknown) {
      logger.error(
        {
          err: mistralErr, // Pass the actual mistralError object
          event: 'mistralFallbackFailureStream',
        },
        'Mistral fallback (stream) failed.'
      );
      return null;
    }
  }
}

// Export the openai instance for potential direct use if needed elsewhere
export default openai;

// ============================================================================
// TESTING UTILITIES (Not for production use)
// ============================================================================
// Resets internal module state so unit tests can run in isolation.
// The leading underscore signals that this export is intended for tests only.
export function _resetForTesting(): void {
  useFallbackChatModel = false;
  // Resetting breakers to closed state is critical for test isolation
  singleEmbeddingBreaker.close();
  batchEmbeddingBreaker.close();
  chatCompletionBreaker.close();
}

function createSynthesizedMistralResponse(content: string): ChatCompletion {
  return {
    id: `mistral-fallback-${uuidv4()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: 'mistral-small-latest', // Corrected model name
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: content,
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: Math.max(1, content.split(/\s+/).length),
      total_tokens: Math.max(1, content.split(/\s+/).length),
    },
  } as ChatCompletion;
}
