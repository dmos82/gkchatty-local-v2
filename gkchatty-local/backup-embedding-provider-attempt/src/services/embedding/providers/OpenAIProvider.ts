/**
 * GKChatty Local - OpenAI Embedding Provider
 *
 * Provider implementation for OpenAI's embedding API.
 * Supports text-embedding-3-small and text-embedding-3-large models.
 *
 * @module services/embedding/providers/OpenAIProvider
 */

import OpenAI from 'openai';
import {
  EmbeddingProvider,
  ProviderInfo,
} from '../types';

/**
 * OpenAI embedding provider configuration
 */
export interface OpenAIProviderConfig {
  /** OpenAI API key */
  apiKey: string;

  /** Model to use (text-embedding-3-small or text-embedding-3-large) */
  model?: 'text-embedding-3-small' | 'text-embedding-3-large';

  /** Base URL for OpenAI API (optional, for custom endpoints) */
  baseURL?: string;

  /** Request timeout in milliseconds */
  timeout?: number;
}

/**
 * OpenAI embedding provider implementation
 */
export class OpenAIProvider implements EmbeddingProvider {
  name: string;
  type: 'api' = 'api';
  dimensions: number;
  maxTokens: number;

  private client: OpenAI;
  private model: string;
  private apiKey: string;

  /**
   * Create OpenAI provider
   * @param config - Provider configuration
   */
  constructor(config: OpenAIProviderConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model || 'text-embedding-3-small';

    // Set dimensions based on model
    if (this.model === 'text-embedding-3-small') {
      this.dimensions = 1536;
      this.maxTokens = 8191;
    } else if (this.model === 'text-embedding-3-large') {
      this.dimensions = 3072;
      this.maxTokens = 8191;
    } else {
      throw new Error(`Unsupported OpenAI model: ${this.model}`);
    }

    this.name = `OpenAI ${this.model}`;

    // Initialize OpenAI client
    this.client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: config.baseURL,
      timeout: config.timeout || 30000, // 30 second default timeout
    });
  }

  /**
   * Initialize the provider (validate API key)
   */
  async initialize(): Promise<void> {
    if (!this.apiKey || this.apiKey.trim() === '') {
      throw new Error('OpenAI API key is required');
    }

    console.log(`[OpenAIProvider] Initializing with model: ${this.model}`);

    try {
      // Test the API key by making a small embedding request
      await this.embed('test');
      console.log(`[OpenAIProvider] Initialization successful`);
    } catch (error) {
      console.error('[OpenAIProvider] Initialization failed:', error);
      throw new Error(
        `Failed to initialize OpenAI provider: ${error instanceof Error ? error.message : 'Unknown error'}`
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
      const response = await this.client.embeddings.create({
        model: this.model,
        input: text,
      });

      if (!response.data || response.data.length === 0) {
        throw new Error('No embedding returned from OpenAI API');
      }

      return response.data[0].embedding;
    } catch (error) {
      console.error('[OpenAIProvider] Embedding failed:', error);

      if (error instanceof Error) {
        // Check for specific OpenAI errors
        if (error.message.includes('API key')) {
          throw new Error('Invalid OpenAI API key');
        } else if (error.message.includes('rate limit')) {
          throw new Error('OpenAI rate limit exceeded');
        } else if (error.message.includes('timeout')) {
          throw new Error('OpenAI API timeout');
        }
      }

      throw new Error(
        `OpenAI embedding failed: ${error instanceof Error ? error.message : 'Unknown error'}`
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
      // OpenAI supports batch embedding up to 2048 inputs
      // For large batches, we need to split them
      const batchSize = 2048;
      const results: number[][] = [];

      for (let i = 0; i < validTexts.length; i += batchSize) {
        const batch = validTexts.slice(i, i + batchSize);

        const response = await this.client.embeddings.create({
          model: this.model,
          input: batch,
        });

        if (!response.data || response.data.length === 0) {
          throw new Error('No embeddings returned from OpenAI API');
        }

        // OpenAI returns embeddings in the same order as inputs
        for (const embedding of response.data) {
          results.push(embedding.embedding);
        }
      }

      return results;
    } catch (error) {
      console.error('[OpenAIProvider] Batch embedding failed:', error);
      throw new Error(
        `OpenAI batch embedding failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get provider metadata
   */
  getInfo(): ProviderInfo {
    return {
      id: `openai-${this.model}`,
      name: this.name,
      description: `OpenAI embedding model with ${this.dimensions} dimensions`,
      dimensions: this.dimensions,
      requiresApiKey: true,
      estimatedCost: this.model === 'text-embedding-3-small'
        ? '$0.02/1M tokens'
        : '$0.13/1M tokens',
    };
  }

  /**
   * Estimate cost for embedding N tokens
   * @param tokens - Number of tokens
   * @returns Estimated cost in USD
   */
  estimateCost(tokens: number): number {
    // Pricing as of 2025-01-01:
    // text-embedding-3-small: $0.02 per 1M tokens
    // text-embedding-3-large: $0.13 per 1M tokens

    const pricePerMillionTokens =
      this.model === 'text-embedding-3-small' ? 0.02 : 0.13;

    return (tokens / 1_000_000) * pricePerMillionTokens;
  }

  /**
   * Estimate latency for embedding N texts
   * @param texts - Number of texts
   * @returns Estimated time in milliseconds
   */
  estimateLatency(texts: number): number {
    // Based on empirical testing:
    // - Single request: ~200-500ms
    // - Batch of 10: ~300-700ms
    // - Batch of 100: ~500-1000ms

    const baseLatency = 300; // Base API call overhead
    const perTextLatency = 5; // Additional time per text

    return baseLatency + texts * perTextLatency;
  }

  /**
   * Estimate token count for a text (rough approximation)
   * @param text - Input text
   * @returns Estimated token count
   */
  private estimateTokens(text: string): number {
    // Rough approximation: 1 token ≈ 4 characters for English
    // This is a simplified estimate; for accurate counting, use tiktoken
    return Math.ceil(text.length / 4);
  }
}

/**
 * Create an OpenAI provider from environment variables
 * @returns OpenAI provider instance
 */
export function createOpenAIProviderFromEnv(): OpenAIProvider {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }

  const model = (process.env.OPENAI_EMBEDDING_MODEL as any) || 'text-embedding-3-small';

  return new OpenAIProvider({
    apiKey,
    model,
  });
}
