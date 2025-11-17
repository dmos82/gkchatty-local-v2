/**
 * GKChatty Local - Provider Fallback Chain
 *
 * Implements automatic fallback between providers when one fails.
 * Provides resilience and high availability for embedding generation.
 *
 * @module services/embedding/fallbackChain
 */

import { EmbeddingProvider, ProviderInfo } from './types';
import {
  EmbeddingError,
  ProviderNotFoundError,
  extractErrorDetails,
  normalizeError,
} from './errors';
import { withRetry, RetryConfig, CircuitBreaker } from './retry';

/**
 * Fallback chain configuration
 */
export interface FallbackChainConfig {
  /** List of provider IDs in fallback order */
  providerIds: string[];
  /** Retry configuration for each provider */
  retryConfig?: Partial<RetryConfig>;
  /** Whether to use circuit breaker per provider */
  useCircuitBreaker?: boolean;
  /** Maximum time to spend trying all providers (ms) */
  maxTotalTimeMs?: number;
  /** Whether to track fallback statistics */
  trackStats?: boolean;
}

/**
 * Fallback statistics
 */
export interface FallbackStats {
  /** Total fallback attempts */
  totalAttempts: number;
  /** Successful attempts per provider */
  successPerProvider: Record<string, number>;
  /** Failed attempts per provider */
  failuresPerProvider: Record<string, number>;
  /** Last fallback time */
  lastFallbackTime: Date | null;
}

/**
 * Fallback result with metadata
 */
export interface FallbackResult<T> {
  /** Result from successful provider */
  result: T;
  /** Provider ID that succeeded */
  providerId: string;
  /** Number of providers tried before success */
  attemptedProviders: number;
  /** Total time taken (ms) */
  totalTimeMs: number;
  /** Errors from failed providers */
  errors: Array<{ providerId: string; error: Error }>;
}

/**
 * Provider fallback chain manager
 */
export class FallbackChain {
  private config: FallbackChainConfig;
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private stats: FallbackStats;
  private providerGetter: (id: string) => EmbeddingProvider | undefined;

  constructor(
    config: FallbackChainConfig,
    providerGetter: (id: string) => EmbeddingProvider | undefined
  ) {
    this.config = {
      useCircuitBreaker: true,
      maxTotalTimeMs: 60000, // 1 minute default
      trackStats: true,
      ...config,
    };

    this.providerGetter = providerGetter;

    // Initialize circuit breakers for each provider
    if (this.config.useCircuitBreaker) {
      for (const providerId of this.config.providerIds) {
        this.circuitBreakers.set(providerId, new CircuitBreaker());
      }
    }

    // Initialize stats
    this.stats = {
      totalAttempts: 0,
      successPerProvider: {},
      failuresPerProvider: {},
      lastFallbackTime: null,
    };

    for (const providerId of this.config.providerIds) {
      this.stats.successPerProvider[providerId] = 0;
      this.stats.failuresPerProvider[providerId] = 0;
    }
  }

  /**
   * Execute operation with fallback chain
   */
  async execute<T>(
    operation: (provider: EmbeddingProvider) => Promise<T>
  ): Promise<FallbackResult<T>> {
    const startTime = Date.now();
    const errors: Array<{ providerId: string; error: Error }> = [];
    let attemptedProviders = 0;

    if (this.config.trackStats) {
      this.stats.totalAttempts++;
      this.stats.lastFallbackTime = new Date();
    }

    for (const providerId of this.config.providerIds) {
      attemptedProviders++;

      try {
        // Check if we've exceeded max total time
        const elapsedMs = Date.now() - startTime;
        if (this.config.maxTotalTimeMs && elapsedMs >= this.config.maxTotalTimeMs) {
          console.warn(`[FallbackChain] Max total time exceeded (${this.config.maxTotalTimeMs}ms)`);
          break;
        }

        console.log(`[FallbackChain] Trying provider ${providerId} (attempt ${attemptedProviders})`);

        // Get provider
        const provider = this.providerGetter(providerId);
        if (!provider) {
          const error = new ProviderNotFoundError(providerId);
          errors.push({ providerId, error });
          this.recordFailure(providerId);
          continue;
        }

        // Check circuit breaker
        const circuitBreaker = this.circuitBreakers.get(providerId);
        if (circuitBreaker && !circuitBreaker.isAllowed()) {
          const error = new EmbeddingError(
            `Circuit breaker open for provider ${providerId}`,
            'CIRCUIT_BREAKER_OPEN',
            true,
            { circuitBreaker: circuitBreaker.getStats() }
          );
          errors.push({ providerId, error });
          console.log(`[FallbackChain] Circuit breaker open for ${providerId}, skipping`);
          continue;
        }

        // Execute operation with retry
        const result = await withRetry(
          () => operation(provider),
          this.config.retryConfig
        );

        // Success! Record stats and return
        this.recordSuccess(providerId);
        if (circuitBreaker) {
          circuitBreaker.recordSuccess();
        }

        const totalTimeMs = Date.now() - startTime;
        console.log(
          `[FallbackChain] Success with provider ${providerId} after ${attemptedProviders} attempts (${totalTimeMs}ms)`
        );

        return {
          result,
          providerId,
          attemptedProviders,
          totalTimeMs,
          errors,
        };
      } catch (error) {
        const normalizedError = normalizeError(error, providerId);
        errors.push({ providerId, error: normalizedError });
        this.recordFailure(providerId);

        const circuitBreaker = this.circuitBreakers.get(providerId);
        if (circuitBreaker) {
          circuitBreaker.recordFailure();
        }

        console.warn(
          `[FallbackChain] Provider ${providerId} failed:`,
          extractErrorDetails(normalizedError)
        );

        // Continue to next provider
        continue;
      }
    }

    // All providers failed
    const totalTimeMs = Date.now() - startTime;
    console.error(
      `[FallbackChain] All ${attemptedProviders} providers failed after ${totalTimeMs}ms`
    );

    // Throw error with all failures
    throw new EmbeddingError(
      `All fallback providers failed after ${attemptedProviders} attempts`,
      'ALL_PROVIDERS_FAILED',
      false,
      {
        attemptedProviders,
        totalTimeMs,
        errors: errors.map(e => ({
          providerId: e.providerId,
          error: extractErrorDetails(e.error),
        })),
      }
    );
  }

  /**
   * Execute embedding with fallback
   */
  async embed(text: string): Promise<FallbackResult<number[]>> {
    return await this.execute(async provider => {
      return await provider.embed(text);
    });
  }

  /**
   * Execute batch embedding with fallback
   */
  async embedBatch(texts: string[]): Promise<FallbackResult<number[][]>> {
    return await this.execute(async provider => {
      return await provider.embedBatch(texts);
    });
  }

  /**
   * Get fallback statistics
   */
  getStats(): FallbackStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats.totalAttempts = 0;
    this.stats.lastFallbackTime = null;

    for (const providerId of this.config.providerIds) {
      this.stats.successPerProvider[providerId] = 0;
      this.stats.failuresPerProvider[providerId] = 0;
    }
  }

  /**
   * Get circuit breaker stats for all providers
   */
  getCircuitBreakerStats(): Record<string, any> {
    const stats: Record<string, any> = {};

    for (const [providerId, breaker] of this.circuitBreakers) {
      stats[providerId] = breaker.getStats();
    }

    return stats;
  }

  /**
   * Reset circuit breakers
   */
  resetCircuitBreakers(): void {
    for (const breaker of this.circuitBreakers.values()) {
      breaker.reset();
    }
  }

  /**
   * Update fallback chain configuration
   */
  updateConfig(config: Partial<FallbackChainConfig>): void {
    this.config = { ...this.config, ...config };

    // Add circuit breakers for new providers
    if (this.config.useCircuitBreaker && config.providerIds) {
      for (const providerId of config.providerIds) {
        if (!this.circuitBreakers.has(providerId)) {
          this.circuitBreakers.set(providerId, new CircuitBreaker());
        }
      }
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): FallbackChainConfig {
    return { ...this.config };
  }

  /**
   * Check if any provider is available
   */
  hasAvailableProvider(): boolean {
    for (const providerId of this.config.providerIds) {
      const circuitBreaker = this.circuitBreakers.get(providerId);
      if (!circuitBreaker || circuitBreaker.isAllowed()) {
        const provider = this.providerGetter(providerId);
        if (provider) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Get list of currently available providers
   */
  getAvailableProviders(): string[] {
    const available: string[] = [];

    for (const providerId of this.config.providerIds) {
      const circuitBreaker = this.circuitBreakers.get(providerId);
      if (!circuitBreaker || circuitBreaker.isAllowed()) {
        const provider = this.providerGetter(providerId);
        if (provider) {
          available.push(providerId);
        }
      }
    }

    return available;
  }

  /**
   * Record successful operation for a provider
   */
  private recordSuccess(providerId: string): void {
    if (this.config.trackStats) {
      this.stats.successPerProvider[providerId] =
        (this.stats.successPerProvider[providerId] || 0) + 1;
    }
  }

  /**
   * Record failed operation for a provider
   */
  private recordFailure(providerId: string): void {
    if (this.config.trackStats) {
      this.stats.failuresPerProvider[providerId] =
        (this.stats.failuresPerProvider[providerId] || 0) + 1;
    }
  }
}

/**
 * Create a fallback chain from provider registry
 */
export function createFallbackChain(
  providerIds: string[],
  providerGetter: (id: string) => EmbeddingProvider | undefined,
  config?: Partial<FallbackChainConfig>
): FallbackChain {
  return new FallbackChain(
    {
      providerIds,
      ...config,
    },
    providerGetter
  );
}

/**
 * Create a smart fallback chain that prioritizes based on provider type
 * (local providers first, then API providers)
 */
export function createSmartFallbackChain(
  providers: Array<{ id: string; info: ProviderInfo }>,
  providerGetter: (id: string) => EmbeddingProvider | undefined,
  config?: Partial<FallbackChainConfig>
): FallbackChain {
  // Sort providers: local first, then API
  const sortedProviders = [...providers].sort((a, b) => {
    // Local providers first
    const aIsLocal = a.id.startsWith('local-') || a.id.startsWith('ollama-');
    const bIsLocal = b.id.startsWith('local-') || b.id.startsWith('ollama-');

    if (aIsLocal && !bIsLocal) return -1;
    if (!aIsLocal && bIsLocal) return 1;

    // Within same type, sort by cost (lower first)
    return Number(a.info.estimatedCost || 0) - Number(b.info.estimatedCost || 0);
  });

  const providerIds = sortedProviders.map(p => p.id);

  console.log('[FallbackChain] Created smart fallback chain:', providerIds);

  return new FallbackChain(
    {
      providerIds,
      ...config,
    },
    providerGetter
  );
}
