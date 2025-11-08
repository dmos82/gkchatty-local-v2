/**
 * GKChatty Local - Retry Logic with Exponential Backoff
 *
 * Implements retry strategies with exponential backoff, jitter, and circuit breaker pattern
 * to handle transient failures gracefully.
 *
 * @module services/embedding/retry
 */

import {
  EmbeddingError,
  isRecoverableError,
  NetworkError,
  RateLimitError,
  TimeoutError,
  extractErrorDetails,
} from './errors';

/**
 * Retry configuration options
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxAttempts: number;
  /** Initial delay in milliseconds */
  initialDelayMs: number;
  /** Maximum delay in milliseconds */
  maxDelayMs: number;
  /** Exponential backoff multiplier */
  backoffMultiplier: number;
  /** Add random jitter to prevent thundering herd */
  jitter: boolean;
  /** Timeout for each attempt in milliseconds */
  timeoutMs?: number;
  /** Custom function to determine if error is retryable */
  shouldRetry?: (error: any, attempt: number) => boolean;
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  jitter: true,
  timeoutMs: 30000,
};

/**
 * Retry result with metadata
 */
export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
  totalDelayMs: number;
}

/**
 * Circuit breaker states
 */
export enum CircuitState {
  CLOSED = 'CLOSED', // Normal operation
  OPEN = 'OPEN', // Too many failures, stop trying
  HALF_OPEN = 'HALF_OPEN', // Testing if service recovered
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /** Number of failures before opening circuit */
  failureThreshold: number;
  /** Time in ms before attempting recovery */
  resetTimeoutMs: number;
  /** Number of successful attempts needed to close circuit */
  successThreshold: number;
}

/**
 * Circuit breaker for preventing cascading failures
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime: number = 0;
  private config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = {
      failureThreshold: 5,
      resetTimeoutMs: 60000, // 1 minute
      successThreshold: 2,
      ...config,
    };
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    // Check if we should transition from OPEN to HALF_OPEN
    if (
      this.state === CircuitState.OPEN &&
      Date.now() - this.lastFailureTime >= this.config.resetTimeoutMs
    ) {
      console.log('[CircuitBreaker] Transitioning to HALF_OPEN (testing recovery)');
      this.state = CircuitState.HALF_OPEN;
      this.successCount = 0;
    }

    return this.state;
  }

  /**
   * Check if operation is allowed
   */
  isAllowed(): boolean {
    const state = this.getState();
    return state !== CircuitState.OPEN;
  }

  /**
   * Record successful operation
   */
  recordSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        console.log('[CircuitBreaker] Transitioning to CLOSED (service recovered)');
        this.state = CircuitState.CLOSED;
        this.failureCount = 0;
        this.successCount = 0;
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count on success
      this.failureCount = Math.max(0, this.failureCount - 1);
    }
  }

  /**
   * Record failed operation
   */
  recordFailure(): void {
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      console.log('[CircuitBreaker] Transitioning to OPEN (recovery failed)');
      this.state = CircuitState.OPEN;
      this.successCount = 0;
    } else if (this.state === CircuitState.CLOSED) {
      this.failureCount++;
      if (this.failureCount >= this.config.failureThreshold) {
        console.log('[CircuitBreaker] Transitioning to OPEN (too many failures)');
        this.state = CircuitState.OPEN;
      }
    }
  }

  /**
   * Reset circuit breaker
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
  }

  /**
   * Get circuit breaker statistics
   */
  getStats() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime
        ? new Date(this.lastFailureTime).toISOString()
        : null,
    };
  }
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(
  attempt: number,
  config: RetryConfig
): number {
  // Exponential backoff: initialDelay * (multiplier ^ attempt)
  const exponentialDelay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1);

  // Cap at maximum delay
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);

  // Add jitter if enabled (randomize ±25%)
  if (config.jitter) {
    const jitterRange = cappedDelay * 0.25;
    const jitter = Math.random() * jitterRange * 2 - jitterRange;
    return Math.max(0, cappedDelay + jitter);
  }

  return cappedDelay;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Determine if an error should be retried
 */
function shouldRetryError(error: any, attempt: number, maxAttempts: number): boolean {
  // Don't retry if we've exceeded max attempts
  if (attempt >= maxAttempts) {
    return false;
  }

  // Check if error is explicitly marked as recoverable
  if (isRecoverableError(error)) {
    return true;
  }

  // Retry specific error types
  if (
    error instanceof NetworkError ||
    error instanceof TimeoutError ||
    error instanceof RateLimitError
  ) {
    return true;
  }

  // Retry on common network error codes
  if (error.code && ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ENETUNREACH'].includes(error.code)) {
    return true;
  }

  // Retry on 5xx server errors
  if (error.response && error.response.status >= 500) {
    return true;
  }

  // Don't retry by default
  return false;
}

/**
 * Execute function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const retryConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let attempt = 0;
  let totalDelay = 0;
  let lastError: Error | undefined;

  while (attempt < retryConfig.maxAttempts) {
    attempt++;

    try {
      console.log(`[Retry] Attempt ${attempt}/${retryConfig.maxAttempts}`);

      // Execute function with timeout if specified
      if (retryConfig.timeoutMs) {
        const result = await Promise.race([
          fn(),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new TimeoutError('unknown', retryConfig.timeoutMs!)),
              retryConfig.timeoutMs
            )
          ),
        ]);
        return result;
      } else {
        return await fn();
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry
      const customShouldRetry = retryConfig.shouldRetry?.(error, attempt);
      const defaultShouldRetry = shouldRetryError(error, attempt, retryConfig.maxAttempts);
      const shouldRetry = customShouldRetry !== undefined ? customShouldRetry : defaultShouldRetry;

      if (!shouldRetry) {
        console.log(`[Retry] Not retrying error:`, extractErrorDetails(error));
        throw error;
      }

      // Calculate delay for next attempt
      const delay = calculateDelay(attempt, retryConfig);
      totalDelay += delay;

      console.log(
        `[Retry] Attempt ${attempt} failed, retrying in ${Math.round(delay)}ms:`,
        extractErrorDetails(error)
      );

      // Handle rate limit errors specially
      if (error instanceof RateLimitError && error.retryAfter) {
        const rateLimitDelay = error.retryAfter * 1000;
        console.log(`[Retry] Rate limited, waiting ${rateLimitDelay}ms`);
        await sleep(rateLimitDelay);
        totalDelay += rateLimitDelay;
      } else {
        await sleep(delay);
      }
    }
  }

  // All retries exhausted
  console.log(`[Retry] All ${retryConfig.maxAttempts} attempts failed`);
  throw lastError || new Error('All retry attempts failed');
}

/**
 * Retry with circuit breaker
 */
export async function withRetryAndCircuitBreaker<T>(
  fn: () => Promise<T>,
  circuitBreaker: CircuitBreaker,
  retryConfig: Partial<RetryConfig> = {}
): Promise<T> {
  // Check circuit breaker state
  if (!circuitBreaker.isAllowed()) {
    const stats = circuitBreaker.getStats();
    throw new EmbeddingError(
      `Circuit breaker is ${stats.state}. Service unavailable.`,
      'CIRCUIT_BREAKER_OPEN',
      false,
      { circuitBreaker: stats }
    );
  }

  try {
    const result = await withRetry(fn, retryConfig);
    circuitBreaker.recordSuccess();
    return result;
  } catch (error) {
    circuitBreaker.recordFailure();
    throw error;
  }
}

/**
 * Batch retry - execute multiple operations with retry logic
 */
export async function batchWithRetry<T>(
  items: T[],
  fn: (item: T) => Promise<any>,
  config: Partial<RetryConfig> = {},
  batchSize: number = 10
): Promise<Array<{ item: T; result?: any; error?: Error }>> {
  const results: Array<{ item: T; result?: any; error?: Error }> = [];

  // Process in batches
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);

    const batchResults = await Promise.allSettled(
      batch.map(item =>
        withRetry(() => fn(item), config).then(result => ({ item, result }))
      )
    );

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        // Find which item failed (this is a bit tricky with Promise.allSettled)
        const failedIndex = results.length;
        results.push({
          item: batch[failedIndex % batch.length],
          error: result.reason,
        });
      }
    }
  }

  return results;
}

/**
 * Create a retry-enabled version of a function
 */
export function withRetryDecorator<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  config: Partial<RetryConfig> = {}
): T {
  return (async (...args: any[]) => {
    return await withRetry(() => fn(...args), config);
  }) as T;
}
