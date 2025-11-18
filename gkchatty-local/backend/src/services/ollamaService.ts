/**
 * Ollama Service for GKChatty Local
 *
 * Provides integration with local Ollama models for chat completion.
 * Supports model listing, health checks, and streaming chat responses.
 *
 * Phase 4 - Week 2: Ollama Integration
 * Status: ACTIVE
 */

import axios, { AxiosInstance } from 'axios';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface OllamaModel {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details?: {
    format: string;
    family: string;
    families: string[] | null;
    parameter_size: string;
    quantization_level: string;
  };
}

export interface OllamaListResponse {
  models: OllamaModel[];
}

export interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OllamaChatRequest {
  model: string;
  messages: OllamaChatMessage[];
  stream?: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    num_predict?: number;
  };
}

export interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
  eval_duration?: number;
}

export interface OllamaHealthResponse {
  status: 'healthy' | 'unhealthy';
  version?: string;
  models?: number;
  error?: string;
}

export interface OllamaChatOptions {
  model: string;
  messages: OllamaChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

// ============================================================================
// Ollama Service Class
// ============================================================================

export class OllamaService {
  private client: AxiosInstance;
  private baseURL: string;
  private timeout: number;

  constructor(baseURL?: string, timeout: number = 120000) {
    this.baseURL = baseURL || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    this.timeout = timeout;

    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Check if Ollama service is running and healthy
   *
   * @returns OllamaHealthResponse with status and version
   *
   * @example
   * ```typescript
   * const health = await ollamaService.healthCheck();
   * if (health.status === 'healthy') {
   *   console.log('Ollama is running:', health.version);
   * }
   * ```
   */
  async healthCheck(): Promise<OllamaHealthResponse> {
    try {
      // Try to get version (indicates Ollama is running)
      const versionResponse = await this.client.get('/api/version', {
        timeout: 5000, // Quick timeout for health check
      });

      // Try to list models to verify functionality
      const modelsResponse = await this.listModels();

      return {
        status: 'healthy',
        version: versionResponse.data.version || 'unknown',
        models: modelsResponse.models.length,
      };
    } catch (error: any) {
      return {
        status: 'unhealthy',
        error: error.message || 'Cannot connect to Ollama service',
      };
    }
  }

  /**
   * List all available Ollama models
   *
   * @returns Array of OllamaModel objects
   *
   * @example
   * ```typescript
   * const response = await ollamaService.listModels();
   * response.models.forEach(model => {
   *   console.log(`${model.name} (${model.details?.parameter_size})`);
   * });
   * ```
   */
  async listModels(): Promise<OllamaListResponse> {
    try {
      const response = await this.client.get<OllamaListResponse>('/api/tags');
      return response.data;
    } catch (error: any) {
      console.error('[OllamaService] Failed to list models:', error.message);
      throw new Error(`Failed to list Ollama models: ${error.message}`);
    }
  }

  /**
   * Send chat completion request to Ollama (non-streaming)
   *
   * @param options - Chat options including model, messages, temperature
   * @returns OllamaChatResponse with assistant's message
   *
   * @example
   * ```typescript
   * const response = await ollamaService.chat({
   *   model: 'llama3.2:3b',
   *   messages: [
   *     { role: 'user', content: 'What is React?' }
   *   ],
   *   temperature: 0.7
   * });
   * console.log(response.message.content);
   * ```
   */
  async chat(options: OllamaChatOptions): Promise<OllamaChatResponse> {
    const { model, messages, temperature = 0.7, maxTokens, stream = false } = options;

    try {
      const requestBody: OllamaChatRequest = {
        model,
        messages,
        stream,
        options: {
          temperature,
          ...(maxTokens && { num_predict: maxTokens }),
        },
      };

      const response = await this.client.post<OllamaChatResponse>(
        '/api/chat',
        requestBody
      );

      return response.data;
    } catch (error: any) {
      console.error('[OllamaService] Chat request failed:', error.message);

      // Provide helpful error messages
      if (error.code === 'ECONNREFUSED') {
        throw new Error('Ollama service is not running. Please start Ollama.');
      } else if (error.response?.status === 404) {
        throw new Error(`Model "${model}" not found. Please pull the model first.`);
      } else {
        throw new Error(`Ollama chat failed: ${error.message}`);
      }
    }
  }

  /**
   * Send streaming chat completion request to Ollama
   *
   * @param options - Chat options including model, messages, temperature
   * @param onChunk - Callback function called for each chunk of response
   * @returns Promise that resolves when stream completes
   *
   * @example
   * ```typescript
   * await ollamaService.chatStream({
   *   model: 'llama3.2:3b',
   *   messages: [{ role: 'user', content: 'Tell me a story' }]
   * }, (chunk) => {
   *   process.stdout.write(chunk.message.content);
   * });
   * ```
   */
  async chatStream(
    options: OllamaChatOptions,
    onChunk: (chunk: OllamaChatResponse) => void
  ): Promise<void> {
    const { model, messages, temperature = 0.7, maxTokens } = options;

    try {
      const requestBody: OllamaChatRequest = {
        model,
        messages,
        stream: true,
        options: {
          temperature,
          ...(maxTokens && { num_predict: maxTokens }),
        },
      };

      const response = await this.client.post('/api/chat', requestBody, {
        responseType: 'stream',
      });

      return new Promise((resolve, reject) => {
        let buffer = '';

        response.data.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.trim()) {
              try {
                const data: OllamaChatResponse = JSON.parse(line);
                onChunk(data);

                if (data.done) {
                  resolve();
                }
              } catch (e) {
                console.error('[OllamaService] Failed to parse chunk:', e);
              }
            }
          }
        });

        response.data.on('end', () => {
          resolve();
        });

        response.data.on('error', (error: Error) => {
          console.error('[OllamaService] Stream error:', error);
          reject(error);
        });
      });
    } catch (error: any) {
      console.error('[OllamaService] Stream request failed:', error.message);
      throw new Error(`Ollama stream failed: ${error.message}`);
    }
  }

  /**
   * Check if a specific model is available
   *
   * @param modelName - Name of the model to check
   * @returns True if model is available, false otherwise
   *
   * @example
   * ```typescript
   * const hasModel = await ollamaService.hasModel('llama3.2:3b');
   * if (!hasModel) {
   *   console.log('Please pull the model first');
   * }
   * ```
   */
  async hasModel(modelName: string): Promise<boolean> {
    try {
      const response = await this.listModels();
      return response.models.some(
        (model) => model.name === modelName || model.model === modelName
      );
    } catch (error) {
      return false;
    }
  }

  /**
   * Get simplified model list for UI display
   *
   * @returns Array of model names with sizes
   *
   * @example
   * ```typescript
   * const models = await ollamaService.getSimpleModelList();
   * // Returns: [
   * //   { name: 'llama3.2:1b', size: '1.3GB', family: 'llama' },
   * //   { name: 'llama3.2:3b', size: '2.0GB', family: 'llama' }
   * // ]
   * ```
   */
  async getSimpleModelList(): Promise<Array<{
    name: string;
    size: string;
    family: string;
    parameterSize: string;
  }>> {
    try {
      const response = await this.listModels();

      return response.models.map((model) => ({
        name: model.name,
        size: this.formatBytes(model.size),
        family: model.details?.family || 'unknown',
        parameterSize: model.details?.parameter_size || 'unknown',
      }));
    } catch (error) {
      console.error('[OllamaService] Failed to get simple model list:', error);
      return [];
    }
  }

  /**
   * Format bytes to human-readable size
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Get base URL of Ollama service
   */
  getBaseURL(): string {
    return this.baseURL;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

// Export singleton instance with environment-based configuration
export const ollamaService = new OllamaService();

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert GKChatty messages to Ollama format
 */
export function convertToOllamaMessages(
  messages: Array<{ role: string; content: string }>
): OllamaChatMessage[] {
  return messages.map((msg) => ({
    role: msg.role as 'system' | 'user' | 'assistant',
    content: msg.content,
  }));
}

/**
 * Test Ollama connection and log results
 */
export async function testOllamaConnection(): Promise<void> {
  console.log('[OllamaService] Testing connection...');

  const health = await ollamaService.healthCheck();

  if (health.status === 'healthy') {
    console.log('✅ Ollama is running');
    console.log(`   Version: ${health.version}`);
    console.log(`   Models available: ${health.models}`);
  } else {
    console.log('❌ Ollama is not available');
    console.log(`   Error: ${health.error}`);
  }
}
