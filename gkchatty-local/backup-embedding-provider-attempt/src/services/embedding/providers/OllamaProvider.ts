/**
 * GKChatty Local - Ollama Embedding Provider
 *
 * Provider implementation for Ollama's local embedding API.
 * Ollama runs locally on the user's machine (typically at http://localhost:11434).
 *
 * @module services/embedding/providers/OllamaProvider
 */

import axios, { AxiosInstance } from 'axios';
import {
  EmbeddingProvider,
  ProviderInfo,
} from '../types';

/**
 * Ollama embedding provider configuration
 */
export interface OllamaProviderConfig {
  /** Ollama model name (e.g., "nomic-embed-text", "all-minilm") */
  model: string;

  /** Base URL for Ollama API */
  baseURL?: string;

  /** Request timeout in milliseconds */
  timeout?: number;
}

/**
 * Ollama embedding provider implementation
 * Supports local embedding models running via Ollama
 */
export class OllamaProvider implements EmbeddingProvider {
  name: string;
  type: 'local' = 'local';
  dimensions: number;
  maxTokens: number;

  private client: AxiosInstance;
  private model: string;
  private baseURL: string;

  /**
   * Create Ollama provider
   * @param config - Provider configuration
   */
  constructor(config: OllamaProviderConfig) {
    this.model = config.model;
    this.baseURL = config.baseURL || 'http://localhost:11434';
    this.name = `Ollama ${this.model}`;

    // Set default dimensions (will be updated after initialization)
    // Common Ollama models:
    // - nomic-embed-text: 768 dimensions
    // - all-minilm: 384 dimensions
    // - mxbai-embed-large: 1024 dimensions
    this.dimensions = 768; // Default, will be detected
    this.maxTokens = 8192; // Default for most Ollama models

    // Initialize Axios client
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: config.timeout || 60000, // 60 second default timeout (local models can be slow)
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Initialize the provider (check Ollama is running and model is available)
   */
  async initialize(): Promise<void> {
    console.log(`[OllamaProvider] Initializing with model: ${this.model}`);

    try {
      // Check if Ollama is running
      await this.client.get('/api/tags');

      // Test the model by generating an embedding
      const testEmbedding = await this.embed('test');

      // Detect dimensions from actual embedding
      this.dimensions = testEmbedding.length;

      console.log(
        `[OllamaProvider] Initialization successful (${this.dimensions} dimensions)`
      );
    } catch (error) {
      console.error('[OllamaProvider] Initialization failed:', error);

      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNREFUSED') {
          throw new Error(
            'Ollama is not running. Please start Ollama: https://ollama.ai'
          );
        } else if (error.response?.status === 404) {
          throw new Error(
            `Model "${this.model}" not found. Pull it with: ollama pull ${this.model}`
          );
        }
      }

      throw new Error(
        `Failed to initialize Ollama provider: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Generate embedding for a single text
   * @param text - Input text
   * @returns Embedding vector
   */
  async embed(text: string): Promise<number[]> {
    if (!text || text.trim() === '') {
      throw new Error('Text cannot be empty');
    }

    try {
      const response = await this.client.post('/api/embeddings', {
        model: this.model,
        prompt: text,
      });

      if (!response.data || !response.data.embedding) {
        throw new Error('No embedding returned from Ollama API');
      }

      return response.data.embedding;
    } catch (error) {
      console.error('[OllamaProvider] Embedding failed:', error);

      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNREFUSED') {
          throw new Error('Ollama is not running');
        } else if (error.response?.status === 404) {
          throw new Error(`Model "${this.model}" not found`);
        } else if (error.code === 'ETIMEDOUT') {
          throw new Error('Ollama request timed out (model may be loading)');
        }
      }

      throw new Error(
        `Ollama embedding failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Generate embeddings for multiple texts (batch processing)
   * @param texts - Array of input texts
   * @returns Array of embedding vectors
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!texts || texts.length === 0) {
      throw new Error('Texts array cannot be empty');
    }

    // Filter out empty strings
    const validTexts = texts.filter((text) => text && text.trim() !== '');
    if (validTexts.length === 0) {
      throw new Error('All texts are empty');
    }

    try {
      // Ollama doesn't have a native batch API, so we process sequentially
      // TODO: Consider parallel requests with concurrency limit
      const results: number[][] = [];

      for (const text of validTexts) {
        const embedding = await this.embed(text);
        results.push(embedding);
      }

      return results;
    } catch (error) {
      console.error('[OllamaProvider] Batch embedding failed:', error);
      throw new Error(
        `Ollama batch embedding failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get provider metadata
   */
  getInfo(): ProviderInfo {
    return {
      id: `ollama-${this.model}`,
      name: this.name,
      description: `Ollama local embedding model with ${this.dimensions} dimensions`,
      dimensions: this.dimensions,
      requiresApiKey: false,
      estimatedCost: '$0 (local model)',
    };
  }

  /**
   * Estimate cost for embedding N tokens (always 0 for local models)
   * @param tokens - Number of tokens
   * @returns Cost (always 0 for local models)
   */
  estimateCost(tokens: number): number {
    return 0; // Local models have no API cost
  }

  /**
   * Estimate latency for embedding N texts
   * @param texts - Number of texts
   * @returns Estimated time in milliseconds
   */
  estimateLatency(texts: number): number {
    // Ollama local models are slower than API providers
    // Based on empirical testing with M2 MacBook Pro:
    // - Single request: ~500-2000ms (depends on model size)
    // - Sequential processing (no batch API)

    // Estimate based on model complexity
    // nomic-embed-text on M2: ~100-300ms per embedding
    // all-minilm on M2: ~50-150ms per embedding

    const baseLatency = 100; // Model load time overhead
    const perTextLatency = 200; // Average per-text processing time

    return baseLatency + texts * perTextLatency;
  }

  /**
   * Check if Ollama is running
   * @returns true if Ollama is running
   */
  async isRunning(): Promise<boolean> {
    try {
      await this.client.get('/api/tags');
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * List available models in Ollama
   * @returns Array of model names
   */
  async listModels(): Promise<string[]> {
    try {
      const response = await this.client.get('/api/tags');

      if (!response.data || !response.data.models) {
        return [];
      }

      return response.data.models.map((model: any) => model.name);
    } catch (error) {
      console.error('[OllamaProvider] Failed to list models:', error);
      return [];
    }
  }

  /**
   * Estimate token count for a text (rough approximation)
   * @param text - Input text
   * @returns Estimated token count
   */
  private estimateTokens(text: string): number {
    // Rough approximation: 1 token ≈ 4 characters for English
    return Math.ceil(text.length / 4);
  }
}

/**
 * Create an Ollama provider from environment variables
 * @returns Ollama provider instance
 */
export function createOllamaProviderFromEnv(): OllamaProvider {
  const model = process.env.OLLAMA_MODEL || 'nomic-embed-text';
  const baseURL = process.env.OLLAMA_BASE_URL; // Optional

  return new OllamaProvider({
    model,
    baseURL,
  });
}

/**
 * Check if Ollama is installed and running
 * @returns true if Ollama is available
 */
export async function isOllamaAvailable(): Promise<boolean> {
  try {
    const response = await axios.get('http://localhost:11434/api/tags', {
      timeout: 2000,
    });
    return response.status === 200;
  } catch (error) {
    return false;
  }
}
