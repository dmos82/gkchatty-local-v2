/**
 * Unified Chat Service for GKChatty Local
 *
 * Provides a unified interface for chat completions from multiple providers:
 * - OpenAI (cloud API)
 * - Ollama (local models)
 *
 * Includes intelligent fallback:  Ollama fails → OpenAI
 *
 * Phase 4 - Week 2: Ollama Integration
 * Status: ACTIVE
 */

import { ollamaService, convertToOllamaMessages } from './ollamaService';
import { getChatCompletion } from '../utils/openaiHelper';
import { ChatCompletionMessageParam as OpenAIChatCompletionMessageParam } from 'openai/resources/chat';
import type { ChatCompletion } from 'openai/resources/chat/completions';
import { getFeatures, type FeatureFlags } from '../config/features';

// ============================================================================
// Types & Interfaces
// ============================================================================

export type ModelMode = 'ollama' | 'openai' | 'auto';
export type ComplexityLevel = 'simple' | 'medium' | 'complex';

export interface UnifiedChatOptions {
  messages: OpenAIChatCompletionMessageParam[];
  modelMode?: ModelMode;
  model?: string; // Specific model name (e.g., "llama3.2:3b", "gpt-4o-mini")
  temperature?: number;
  maxTokens?: number;
  enableFallback?: boolean; // If true, fallback to OpenAI if Ollama fails
  complexity?: ComplexityLevel; // For smart routing
}

export interface UnifiedChatResponse {
  content: string;
  modelUsed: string;
  modelMode: ModelMode;
  complexity?: ComplexityLevel;
  smartRoutingUsed: boolean;
  fallbackUsed: boolean;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

// ============================================================================
// Unified Chat Service Class
// ============================================================================

export class ChatService {
  /**
   * Get chat completion from unified service (OpenAI or Ollama)
   *
   * @param options - Chat options including mode, model, messages
   * @returns UnifiedChatResponse with content and metadata
   *
   * @example
   * ```typescript
   * const response = await chatService.getChatCompletion({
   *   messages: [{ role: 'user', content: 'Hello' }],
   *   modelMode: 'ollama',
   *   model: 'llama3.2:3b',
   *   enableFallback: true
   * });
   * console.log(response.content);
   * console.log(`Used: ${response.modelUsed} via ${response.modelMode}`);
   * ```
   */
  async getChatCompletion(options: UnifiedChatOptions): Promise<UnifiedChatResponse> {
    // ✅ FIX: Get feature flags once at the start (more efficient, consistent state)
    const features = await getFeatures();

    const {
      messages,
      modelMode = 'openai',
      model,
      temperature = 0.7,
      maxTokens,
      enableFallback = true,
      complexity,
    } = options;

    let fallbackUsed = false;
    let actualMode = modelMode;
    let actualModel = model;

    // === OLLAMA MODE ===
    if (modelMode === 'ollama') {
      // ✅ FIX: Check Ollama feature flag synchronously using features object
      if (!features.ollama) {
        console.log('[ChatService] Ollama feature disabled, falling back to OpenAI');
        return this.callOpenAI(messages, model, temperature, maxTokens, {
          fallbackUsed: true,
          complexity,
        });
      }

      // ✅ FIX: Pass features to getDefaultOllamaModel for smart routing check
      const ollamaModel = model || this.getDefaultOllamaModel(complexity, features);

      try {
        console.log(`[ChatService] Attempting Ollama: ${ollamaModel}`);

        // Convert messages to Ollama format
        const ollamaMessages = convertToOllamaMessages(
          messages.map((msg) => ({
            role: msg.role as string,
            content: typeof msg.content === 'string' ? msg.content : '',
          }))
        );

        // Call Ollama
        const ollamaResponse = await ollamaService.chat({
          model: ollamaModel,
          messages: ollamaMessages,
          temperature,
          maxTokens,
        });

        return {
          content: ollamaResponse.message.content,
          modelUsed: ollamaModel,
          modelMode: 'ollama',
          complexity,
          smartRoutingUsed: !!complexity,
          fallbackUsed: false,
          usage: {
            prompt_tokens: ollamaResponse.prompt_eval_count,
            completion_tokens: ollamaResponse.eval_count,
            total_tokens:
              (ollamaResponse.prompt_eval_count || 0) + (ollamaResponse.eval_count || 0),
          },
        };
      } catch (error: any) {
        console.error('[ChatService] Ollama request failed:', error.message);

        // Fallback to OpenAI if enabled
        if (enableFallback) {
          console.log('[ChatService] Falling back to OpenAI');
          return this.callOpenAI(messages, model, temperature, maxTokens, {
            fallbackUsed: true,
            complexity,
          });
        } else {
          throw new Error(`Ollama request failed: ${error.message}`);
        }
      }
    }

    // === OPENAI MODE (default) ===
    return this.callOpenAI(messages, model, temperature, maxTokens, {
      fallbackUsed,
      complexity,
    });
  }

  /**
   * Call OpenAI API
   */
  private async callOpenAI(
    messages: OpenAIChatCompletionMessageParam[],
    model: string | undefined,
    temperature: number,
    maxTokens: number | undefined,
    metadata: { fallbackUsed: boolean; complexity?: ComplexityLevel }
  ): Promise<UnifiedChatResponse> {
    try {
      // Use the existing getChatCompletion helper
      const completion: ChatCompletion = await getChatCompletion(messages);

      const content = completion.choices[0]?.message?.content || '';
      const modelUsed = completion.model || model || 'gpt-4o-mini';

      return {
        content,
        modelUsed,
        modelMode: 'openai',
        complexity: metadata.complexity,
        smartRoutingUsed: !!metadata.complexity,
        fallbackUsed: metadata.fallbackUsed,
        usage: completion.usage
          ? {
              prompt_tokens: completion.usage.prompt_tokens,
              completion_tokens: completion.usage.completion_tokens,
              total_tokens: completion.usage.total_tokens,
            }
          : undefined,
      };
    } catch (error: any) {
      console.error('[ChatService] OpenAI request failed:', error.message);
      throw new Error(`OpenAI request failed: ${error.message}`);
    }
  }

  /**
   * Get default Ollama model based on query complexity
   * ✅ FIX: Now accepts features parameter to avoid async calls
   */
  private getDefaultOllamaModel(complexity?: ComplexityLevel, features?: FeatureFlags): string {
    // ✅ FIX: Check smartRouting flag synchronously using features object
    // If smart routing is disabled or no complexity provided, use balanced model
    if (!features?.smartRouting || !complexity) {
      return 'llama3.2:3b';
    }

    // Smart routing based on complexity (simple tier removed - poor performance)
    switch (complexity) {
      case 'medium':
        return 'llama3.2:3b'; // 2GB, balanced, good for most queries (default)
      case 'complex':
        return 'qwen2.5:7b'; // 4.7GB, powerful, good for complex reasoning
      default:
        return 'llama3.2:3b';
    }
  }

  /**
   * Check if Ollama is available
   * ✅ FIX: Now properly awaits isFeatureEnabled
   */
  async isOllamaAvailable(): Promise<boolean> {
    // ✅ FIX: Use getFeatures() for async feature check
    const features = await getFeatures();
    if (!features.ollama) {
      return false;
    }

    const health = await ollamaService.healthCheck();
    return health.status === 'healthy';
  }

  /**
   * Get available models for a specific mode
   * ✅ FIX: Now properly awaits feature check
   */
  async getAvailableModels(mode: ModelMode): Promise<string[]> {
    if (mode === 'ollama') {
      // ✅ FIX: Use getFeatures() for async feature check
      const features = await getFeatures();
      if (!features.ollama) {
        return [];
      }

      try {
        const response = await ollamaService.listModels();
        return response.models.map((m) => m.name);
      } catch (error) {
        return [];
      }
    }

    // OpenAI models (from environment or defaults)
    return [
      process.env.OPENAI_PRIMARY_CHAT_MODEL || 'gpt-4o-mini',
      process.env.OPENAI_FALLBACK_CHAT_MODEL || 'gpt-3.5-turbo',
      'gpt-4o',
      'gpt-4o-mini',
    ];
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const chatService = new ChatService();
