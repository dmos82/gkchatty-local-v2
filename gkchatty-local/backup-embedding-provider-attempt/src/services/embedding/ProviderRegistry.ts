/**
 * GKChatty Local - Provider Registry
 *
 * Singleton registry that manages all embedding providers (local and API-based).
 * Handles provider registration, activation, health checks, and statistics tracking.
 *
 * @module services/embedding/ProviderRegistry
 */

import {
  EmbeddingProvider,
  ProviderConfig,
  ProviderInfo,
  ProviderStatus,
  ProviderStats,
} from './types';
import { ModelDetector } from './ModelDetector';
import { OpenAIProvider } from './providers/OpenAIProvider';
import { OllamaProvider } from './providers/OllamaProvider';
import {
  ProviderNotFoundError,
  ProviderInitializationError,
  ProviderHealthCheckError,
  normalizeError,
  extractErrorDetails,
} from './errors';
import { CircuitBreaker } from './retry';
import { ResourceMonitor, validateResources } from './resourceMonitor';

/**
 * Singleton ProviderRegistry for managing embedding providers
 */
export class ProviderRegistry {
  private static instance: ProviderRegistry;

  /** Map of provider ID to provider instance */
  private providers: Map<string, EmbeddingProvider> = new Map();

  /** Currently active provider ID */
  private activeProviderId: string | null = null;

  /** Provider statistics tracking */
  private stats: Map<string, ProviderStats> = new Map();

  /** Provider health status cache */
  private healthCache: Map<string, ProviderStatus> = new Map();

  /** Health check interval handle */
  private healthCheckInterval: NodeJS.Timeout | null = null;

  /** Circuit breakers for each provider */
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();

  /** Resource monitor */
  private resourceMonitor: ResourceMonitor;

  /**
   * Private constructor for singleton pattern
   */
  private constructor() {
    // Initialize resource monitor
    this.resourceMonitor = new ResourceMonitor();
    this.resourceMonitor.start(60000); // Check every minute

    // Start health checks every 5 minutes
    this.startHealthChecks();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): ProviderRegistry {
    if (!ProviderRegistry.instance) {
      ProviderRegistry.instance = new ProviderRegistry();
    }
    return ProviderRegistry.instance;
  }

  /**
   * Initialize the registry (scan for local models, register default providers)
   */
  public async initialize(): Promise<void> {
    console.log('[ProviderRegistry] Initializing provider registry...');

    try {
      // Auto-detect local models
      const detector = new ModelDetector();
      const detectedModels = await detector.scanForModels();
      console.log(`[ProviderRegistry] Detected ${detectedModels.length} local models`);

      // Get device info
      const device = await detector.detectBestDevice();
      const systemInfo = await detector.getSystemInfo();
      console.log(`[ProviderRegistry] Best device: ${device}`);
      console.log(`[ProviderRegistry] System: ${systemInfo.platform} ${systemInfo.arch}, ${systemInfo.memory.total} RAM`);

      // Register Ollama providers for detected models
      for (const model of detectedModels) {
        if (model.id.startsWith('ollama-')) {
          try {
            const modelName = model.id.replace('ollama-', '');
            const provider = new OllamaProvider({
              model: modelName,
            });
            await this.registerProvider(provider);
            console.log(`[ProviderRegistry] Registered Ollama provider: ${modelName}`);
          } catch (error) {
            console.warn(`[ProviderRegistry] Failed to register ${model.id}:`, error);
          }
        }
      }

      // Register OpenAI provider if API key is available
      if (process.env.OPENAI_API_KEY) {
        try {
          const provider = new OpenAIProvider({
            apiKey: process.env.OPENAI_API_KEY,
            model: 'text-embedding-3-small',
          });
          await this.registerProvider(provider);
          console.log('[ProviderRegistry] Registered OpenAI provider');
        } catch (error) {
          console.warn('[ProviderRegistry] Failed to register OpenAI provider:', error);
        }
      }

      // Set default active provider
      if (this.providers.size > 0) {
        // Prefer local models on Apple Silicon
        let defaultProvider: string | null = null;

        if (device === 'mps') {
          // Look for Ollama nomic-embed-text (recommended for M2)
          for (const id of this.providers.keys()) {
            if (id.includes('nomic')) {
              defaultProvider = id;
              break;
            }
          }
        }

        // Fallback to first available provider
        if (!defaultProvider) {
          defaultProvider = Array.from(this.providers.keys())[0];
        }

        if (defaultProvider) {
          await this.setActiveProvider(defaultProvider);
          console.log(`[ProviderRegistry] Default provider set: ${defaultProvider}`);
        }
      }

      console.log('[ProviderRegistry] Registry initialized successfully');
    } catch (error) {
      console.error('[ProviderRegistry] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Register a new embedding provider
   * @param provider - Provider instance to register
   */
  public async registerProvider(provider: EmbeddingProvider): Promise<void> {
    const info = provider.getInfo();

    console.log(`[ProviderRegistry] Registering provider: ${info.id}`);

    try {
      // Validate resources before registration
      validateResources();

      // Initialize the provider
      await provider.initialize();

      // Store provider
      this.providers.set(info.id, provider);

      // Initialize circuit breaker
      this.circuitBreakers.set(info.id, new CircuitBreaker());

      // Initialize stats
      this.initializeStats(info.id);

      // Initialize health cache
      this.healthCache.set(info.id, {
        healthy: true,
        message: 'Provider registered',
        lastChecked: new Date(),
      });

      console.log(`[ProviderRegistry] Provider registered: ${info.id}`);
    } catch (error) {
      const normalizedError = normalizeError(error, info.id);
      console.error(`[ProviderRegistry] Failed to register provider ${info.id}:`, extractErrorDetails(normalizedError));
      throw new ProviderInitializationError(info.id, normalizedError.message);
    }
  }

  /**
   * Unregister a provider
   * @param providerId - Provider ID to unregister
   */
  public async unregisterProvider(providerId: string): Promise<void> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Provider not found: ${providerId}`);
    }

    console.log(`[ProviderRegistry] Unregistering provider: ${providerId}`);

    // If this is the active provider, clear it
    if (this.activeProviderId === providerId) {
      this.activeProviderId = null;
    }

    // Remove from all maps
    this.providers.delete(providerId);
    this.stats.delete(providerId);
    this.healthCache.delete(providerId);

    console.log(`[ProviderRegistry] Provider unregistered: ${providerId}`);
  }

  /**
   * Set the active provider
   * @param providerId - Provider ID to activate
   */
  public async setActiveProvider(providerId: string): Promise<void> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new ProviderNotFoundError(providerId);
    }

    console.log(`[ProviderRegistry] Setting active provider: ${providerId}`);

    // Check circuit breaker
    const circuitBreaker = this.circuitBreakers.get(providerId);
    if (circuitBreaker && !circuitBreaker.isAllowed()) {
      throw new ProviderHealthCheckError(
        providerId,
        `Circuit breaker is ${circuitBreaker.getStats().state}`,
        { circuitBreaker: circuitBreaker.getStats() }
      );
    }

    // Check provider health before activating
    const status = await this.checkProviderHealth(providerId);
    if (!status.healthy) {
      throw new ProviderHealthCheckError(providerId, status.message);
    }

    this.activeProviderId = providerId;
    console.log(`[ProviderRegistry] Active provider set: ${providerId}`);
  }

  /**
   * Get the currently active provider
   * @returns Active provider instance
   * @throws Error if no provider is active
   */
  public getActiveProvider(): EmbeddingProvider {
    if (!this.activeProviderId) {
      throw new ProviderNotFoundError('none', { reason: 'No active provider set' });
    }

    const provider = this.providers.get(this.activeProviderId);
    if (!provider) {
      throw new ProviderNotFoundError(this.activeProviderId);
    }

    return provider;
  }

  /**
   * Get active provider ID
   */
  public getActiveProviderId(): string | null {
    return this.activeProviderId;
  }

  /**
   * Get a specific provider by ID
   * @param providerId - Provider ID
   * @returns Provider instance or undefined
   */
  public getProvider(providerId: string): EmbeddingProvider | undefined {
    return this.providers.get(providerId);
  }

  /**
   * List all registered providers
   * @returns Array of provider configs
   */
  public listProviders(): ProviderConfig[] {
    const configs: ProviderConfig[] = [];

    for (const [id, provider] of this.providers) {
      const info = provider.getInfo();
      const health = this.healthCache.get(id);

      configs.push({
        id: info.id,
        name: info.name,
        type: info.id.startsWith('local-') ? 'local' : 'api',
        modelId: info.id,
        dimensions: info.dimensions,
        available: health?.healthy ?? false,
        requiresApiKey: info.requiresApiKey,
        estimatedCost: info.estimatedCost,
      });
    }

    return configs;
  }

  /**
   * Get provider information
   * @param providerId - Provider ID
   * @returns Provider info
   */
  public getProviderInfo(providerId: string): ProviderInfo {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new ProviderNotFoundError(providerId);
    }

    return provider.getInfo();
  }

  /**
   * Get provider status
   * @param providerId - Provider ID
   * @returns Provider status
   */
  public getProviderStatus(providerId: string): ProviderStatus | undefined {
    return this.healthCache.get(providerId);
  }

  /**
   * Get provider statistics
   * @param providerId - Provider ID
   * @returns Provider stats
   */
  public getProviderStats(providerId: string): ProviderStats | undefined {
    return this.stats.get(providerId);
  }

  /**
   * Check provider health
   * @param providerId - Provider ID
   * @returns Provider status
   */
  private async checkProviderHealth(providerId: string): Promise<ProviderStatus> {
    const provider = this.providers.get(providerId);
    const circuitBreaker = this.circuitBreakers.get(providerId);

    if (!provider) {
      return {
        healthy: false,
        message: 'Provider not found',
        lastChecked: new Date(),
      };
    }

    try {
      // Try a simple embedding to check health
      await provider.embed('health check');

      const status: ProviderStatus = {
        healthy: true,
        message: 'Provider is healthy',
        lastChecked: new Date(),
      };

      // Record success in circuit breaker
      if (circuitBreaker) {
        circuitBreaker.recordSuccess();
      }

      this.healthCache.set(providerId, status);
      return status;
    } catch (error) {
      const normalizedError = normalizeError(error, providerId);

      const status: ProviderStatus = {
        healthy: false,
        message: normalizedError.message,
        lastChecked: new Date(),
      };

      // Record failure in circuit breaker
      if (circuitBreaker) {
        circuitBreaker.recordFailure();
      }

      this.healthCache.set(providerId, status);
      console.warn(`[ProviderRegistry] Health check failed for ${providerId}:`, extractErrorDetails(normalizedError));
      return status;
    }
  }

  /**
   * Start periodic health checks for all providers
   */
  private startHealthChecks(): void {
    // Check health every 5 minutes
    this.healthCheckInterval = setInterval(async () => {
      console.log('[ProviderRegistry] Running periodic health checks...');

      for (const providerId of this.providers.keys()) {
        await this.checkProviderHealth(providerId);
      }
    }, 5 * 60 * 1000); // 5 minutes
  }

  /**
   * Stop health checks (cleanup)
   */
  public stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Initialize statistics for a provider
   */
  private initializeStats(providerId: string): void {
    this.stats.set(providerId, {
      totalEmbeddings: 0,
      totalTokens: 0,
      totalCost: 0,
      averageLatency: 0,
      errorCount: 0,
      firstUsed: new Date(),
      lastUsed: new Date(),
    });
  }

  /**
   * Update statistics after an embedding operation
   * @param providerId - Provider ID
   * @param tokens - Number of tokens processed
   * @param latency - Operation latency in ms
   * @param cost - Operation cost in USD
   * @param isError - Whether the operation failed
   */
  public updateStats(
    providerId: string,
    tokens: number,
    latency: number,
    cost: number,
    isError: boolean = false
  ): void {
    const stats = this.stats.get(providerId);
    if (!stats) return;

    stats.lastUsed = new Date();

    if (isError) {
      stats.errorCount++;
    } else {
      stats.totalEmbeddings++;
      stats.totalTokens += tokens;
      stats.totalCost += cost;

      // Update rolling average latency
      const totalOps = stats.totalEmbeddings;
      stats.averageLatency =
        (stats.averageLatency * (totalOps - 1) + latency) / totalOps;
    }

    this.stats.set(providerId, stats);
  }

  /**
   * Get total count of registered providers
   */
  public getProviderCount(): number {
    return this.providers.size;
  }

  /**
   * Check if a provider is registered
   * @param providerId - Provider ID
   */
  public hasProvider(providerId: string): boolean {
    return this.providers.has(providerId);
  }

  /**
   * Cleanup all providers and stop background tasks
   */
  public async cleanup(): Promise<void> {
    console.log('[ProviderRegistry] Cleaning up...');

    // Stop health checks
    this.stopHealthChecks();

    // Stop resource monitoring
    this.resourceMonitor.stop();

    // Clear active provider
    this.activeProviderId = null;

    // Clear all maps
    this.providers.clear();
    this.stats.clear();
    this.healthCache.clear();
    this.circuitBreakers.clear();

    console.log('[ProviderRegistry] Cleanup complete');
  }

  /**
   * Get circuit breaker stats for a provider
   * @param providerId - Provider ID
   * @returns Circuit breaker stats or undefined
   */
  public getCircuitBreakerStats(providerId: string) {
    const breaker = this.circuitBreakers.get(providerId);
    return breaker ? breaker.getStats() : undefined;
  }

  /**
   * Get circuit breaker stats for all providers
   */
  public getAllCircuitBreakerStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    for (const [providerId, breaker] of this.circuitBreakers) {
      stats[providerId] = breaker.getStats();
    }
    return stats;
  }

  /**
   * Reset circuit breaker for a provider
   * @param providerId - Provider ID
   */
  public resetCircuitBreaker(providerId: string): void {
    const breaker = this.circuitBreakers.get(providerId);
    if (breaker) {
      breaker.reset();
      console.log(`[ProviderRegistry] Circuit breaker reset for ${providerId}`);
    }
  }

  /**
   * Get current resource status
   */
  public getResourceStatus() {
    return this.resourceMonitor.getStatus();
  }

  /**
   * Create a fallback chain for embedding operations
   * @param providerIds - List of provider IDs in fallback order
   * @returns FallbackChain instance
   */
  public createFallbackChain(providerIds?: string[]) {
    const { createFallbackChain } = require('./fallbackChain');
    const ids = providerIds || Array.from(this.providers.keys());
    return createFallbackChain(ids, (id: string) => this.getProvider(id));
  }
}

/**
 * Get the singleton ProviderRegistry instance
 */
export const getProviderRegistry = (): ProviderRegistry => {
  return ProviderRegistry.getInstance();
};
