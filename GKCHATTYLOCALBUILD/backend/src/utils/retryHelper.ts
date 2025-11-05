import retry from 'async-retry';
import { getLogger } from './logger';

const log = getLogger('retryHelper');

/**
 * Configuration for retry behavior
 */
export interface RetryConfig {
  retries: number; // Maximum number of retries
  minTimeout: number; // Initial timeout in ms
  maxTimeout: number; // Maximum timeout in ms
  factor: number; // Exponential factor for backoff
  retryableStatusCodes: number[]; // HTTP status codes to retry on
  description?: string; // Optional description for logging clarity
}

/**
 * Default retry configuration for OpenAI API calls
 */
export const DEFAULT_OPENAI_RETRY_CONFIG: RetryConfig = {
  retries: 5, // Retry 5 times
  minTimeout: 1000, // Start with 1 second timeout
  maxTimeout: 10000, // Maximum 10 second timeout
  factor: 2, // Double the timeout each retry
  retryableStatusCodes: [429, 500, 502, 503, 504], // Rate limit and server errors
};

/**
 * Extract HTTP status code from various error shapes
 */
function getErrorStatusCode(error: any): number | undefined {
  // Handle direct status property (OpenAI SDK format)
  if (typeof error?.status === 'number') {
    return error.status;
  }

  // Handle Axios error response format
  if (typeof error?.response?.status === 'number') {
    return error.response.status;
  }

  // Handle error message containing status code like "Request failed with status code 429"
  const statusMatch = error?.message?.match(/status code (\d+)/i);
  if (statusMatch && statusMatch[1]) {
    return parseInt(statusMatch[1], 10);
  }

  return undefined;
}

/**
 * A wrapper function that implements exponential backoff for async operations
 *
 * @param operation - The async function to retry, receives (bail, attempt) parameters
 * @param config - Retry configuration options
 * @param operationName - Name of the operation for logging purposes
 * @returns The result of the operation
 */
export async function withRetry<T>(
  operation: (bail: (e: Error) => void, attempt: number) => Promise<T>,
  config: RetryConfig = DEFAULT_OPENAI_RETRY_CONFIG,
  operationName: string = 'API call'
): Promise<T> {
  return retry(
    async (bail, attempt) => {
      try {
        // If this is a retry attempt, log it
        if (attempt > 1) {
          log.debug(`[Retry] Attempt ${attempt}/${config.retries + 1} for ${operationName}`);
        }

        return await operation(bail, attempt);
      } catch (error: any) {
        // Get the HTTP status code if available
        const statusCode = getErrorStatusCode(error);

        // Log the error
        log.error(
          `[Retry] ${operationName} failed (attempt ${attempt}/${config.retries + 1}):`,
          error.message || error
        );

        // If the error has a status code that is not in our retryable list, bail
        if (statusCode && !config.retryableStatusCodes.includes(statusCode)) {
          log.error(`[Retry] Status code ${statusCode} is not retryable. Giving up.`);
          bail(error);
          throw error; // This won't execute but TypeScript needs it
        }

        // If this was the final retry, log it
        if (attempt > config.retries) {
          log.error(`[Retry] All ${config.retries} retries failed for ${operationName}.`);
        }

        // Let async-retry know this error should trigger a retry
        throw error;
      }
    },
    {
      retries: config.retries,
      minTimeout: config.minTimeout,
      maxTimeout: config.maxTimeout,
      factor: config.factor,
      // Add jitter to avoid thundering herd problem
      randomize: true,
      onRetry: (error: any, attempt) => {
        // Additional logging on retry
        const statusCode = getErrorStatusCode(error);
        if (statusCode === 429) {
          log.warn(`[Retry] Rate limit (429) hit on attempt ${attempt}. Backing off...`);
        } else if (statusCode && statusCode >= 500) {
          log.warn(`[Retry] Server error (${statusCode}) on attempt ${attempt}. Backing off...`);
        }
      },
    }
  );
}
