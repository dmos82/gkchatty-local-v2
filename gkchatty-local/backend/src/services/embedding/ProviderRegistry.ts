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

  /**
   * Private constructor for singleton pattern
   */
  private constructor() {
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
      // Initialize the provider
      await provider.initialize();

      // Store provider
      this.providers.set(info.id, provider);

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
      console.error(`[ProviderRegistry] Failed to register provider ${info.id}:`, error);
      throw new Error(`Failed to register provider: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
      throw new Error(`Provider not found: ${providerId}`);
    }

    console.log(`[ProviderRegistry] Setting active provider: ${providerId}`);

    // Check provider health before activating
    const status = await this.checkProviderHealth(providerId);
    if (!status.healthy) {
      throw new Error(`Cannot activate unhealthy provider: ${status.message}`);
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
      throw new Error('No active provider set');
    }

    const provider = this.providers.get(this.activeProviderId);
    if (!provider) {
      throw new Error(`Active provider not found: ${this.activeProviderId}`);
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
      throw new Error(`Provider not found: ${providerId}`);
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

      this.healthCache.set(providerId, status);
      return status;
    } catch (error) {
      const status: ProviderStatus = {
        healthy: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        lastChecked: new Date(),
      };

      this.healthCache.set(providerId, status);
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

    // Clear active provider
    this.activeProviderId = null;

    // Clear all maps
    this.providers.clear();
    this.stats.clear();
    this.healthCache.clear();

    console.log('[ProviderRegistry] Cleanup complete');
  }
}

/**
 * Get the singleton ProviderRegistry instance
 */
export const getProviderRegistry = (): ProviderRegistry => {
  return ProviderRegistry.getInstance();
};
