/**
 * GKChatty Local - Embedding Provider Types
 *
 * Defines the common interface for all embedding providers (local and API-based)
 * to enable pluggable embedding architecture with seamless provider switching.
 *
 * @module services/embedding/types
 */

/**
 * Core embedding provider interface that all providers must implement.
 * Supports both local models (Transformers.js) and API providers (OpenAI, Cohere, etc.)
 */
export interface EmbeddingProvider {
  /** Human-readable provider name (e.g., "OpenAI text-embedding-3-small") */
  name: string;

  /** Provider type: 'local' for on-device models, 'api' for cloud services */
  type: 'local' | 'api';

  /** Embedding vector dimensionality (e.g., 384, 768, 1536) */
  dimensions: number;

  /** Maximum tokens the model can process in a single request */
  maxTokens: number;

  /**
   * Initialize the provider (load model, validate API key, etc.)
   * @throws {Error} If initialization fails (missing API key, model not found, etc.)
   */
  initialize(): Promise<void>;

  /**
   * Generate embedding for a single text
   * @param text - Input text to embed
   * @returns Embedding vector
   */
  embed(text: string): Promise<number[]>;

  /**
   * Generate embeddings for multiple texts in a batch (more efficient)
   * @param texts - Array of input texts
   * @returns Array of embedding vectors
   */
  embedBatch(texts: string[]): Promise<number[][]>;

  /**
   * Get provider metadata and capabilities
   */
  getInfo(): ProviderInfo;

  /**
   * Estimate cost for embedding N tokens (returns 0 for local providers)
   * @param tokens - Number of tokens to embed
   * @returns Estimated cost in USD
   */
  estimateCost(tokens: number): number;

  /**
   * Estimate latency for embedding N texts
   * @param texts - Number of texts to embed
   * @returns Estimated time in milliseconds
   */
  estimateLatency(texts: number): number;
}

/**
 * Provider metadata and capabilities
 */
export interface ProviderInfo {
  /** Unique provider identifier (e.g., "openai-text-embedding-3-small") */
  id: string;

  /** Human-readable name */
  name: string;

  /** Optional description of the provider */
  description?: string;

  /** Embedding dimensions */
  dimensions: number;

  /** Whether this provider requires an API key */
  requiresApiKey: boolean;

  /** Estimated cost per 1M tokens (e.g., "$0.02/1M tokens") */
  estimatedCost?: string;
}

/**
 * Provider configuration for registry and UI
 */
export interface ProviderConfig {
  /** Unique provider identifier */
  id: string;

  /** Human-readable name */
  name: string;

  /** Provider type */
  type: 'local' | 'api';

  /** Model identifier (for local providers, HuggingFace model ID) */
  modelId?: string;

  /** Embedding dimensions */
  dimensions: number;

  /** Whether the provider is currently available */
  available: boolean;

  /** Whether this provider requires an API key */
  requiresApiKey: boolean;

  /** Estimated cost per 1M tokens */
  estimatedCost?: string;
}

/**
 * Detected local model from HuggingFace cache or system
 */
export interface DetectedModel {
  /** Unique model identifier (e.g., "nomic-ai/nomic-embed-text-v1.5") */
  id: string;

  /** Human-readable model name */
  name: string;

  /** Absolute path to model files */
  path: string;

  /** Model size in bytes */
  size: number;

  /** Embedding dimensions */
  dimensions: number;

  /** Whether the model is available for use */
  available: boolean;

  /** Hardware device the model will run on */
  device: 'cpu' | 'mps' | 'cuda';

  /** Estimated embedding speed (embeddings per second) */
  estimatedSpeed: number;
}

/**
 * Embedding result with metadata
 */
export interface EmbeddingResult {
  /** Embedding vector */
  embedding: number[];

  /** Number of tokens processed */
  tokens: number;

  /** Time taken in milliseconds */
  latency: number;

  /** Cost in USD (0 for local providers) */
  cost: number;
}

/**
 * Batch embedding result with metadata
 */
export interface BatchEmbeddingResult {
  /** Array of embedding vectors */
  embeddings: number[][];

  /** Total number of tokens processed */
  tokens: number;

  /** Total time taken in milliseconds */
  latency: number;

  /** Total cost in USD (0 for local providers) */
  cost: number;
}

/**
 * Provider health status
 */
export interface ProviderStatus {
  /** Whether the provider is healthy and operational */
  healthy: boolean;

  /** Status message (error details if unhealthy) */
  message: string;

  /** Timestamp of last health check */
  lastChecked: Date;

  /** Average latency in milliseconds (from recent requests) */
  averageLatency?: number;

  /** Error count in last hour */
  errorCount?: number;
}

/**
 * Provider statistics for monitoring and UI
 */
export interface ProviderStats {
  /** Total embeddings generated */
  totalEmbeddings: number;

  /** Total tokens processed */
  totalTokens: number;

  /** Total cost in USD */
  totalCost: number;

  /** Average latency in milliseconds */
  averageLatency: number;

  /** Error count */
  errorCount: number;

  /** First used timestamp */
  firstUsed: Date;

  /** Last used timestamp */
  lastUsed: Date;
}
