/**
 * Model Router for GKChatty
 *
 * Selects the best model for a given query based on its complexity.
 * Routes simple queries to fast/cheap models, complex queries to powerful models.
 *
 * Phase 4: Smart Model Routing
 * Status: PROTOTYPE - Ready for testing
 */

import { QueryComplexity } from './queryAnalyzer';

export type ModelMode = 'ollama' | 'openai';
export type ComplexityLevel = 'medium' | 'complex'; // Removed 'simple' - those models perform poorly

export interface ModelRoute {
  model: string;
  reason: string;
  estimatedCost?: number; // In USD (for OpenAI)
  estimatedSpeed?: string; // 'fast' | 'medium' | 'slow'
}

export interface ModelRoutingConfig {
  ollama: {
    medium: string;
    complex: string;
  };
  openai: {
    medium: string;
    complex: string;
  };
}

export class ModelRouter {
  private config: ModelRoutingConfig;

  constructor(customConfig?: Partial<ModelRoutingConfig>) {
    // Default routing configuration
    // Note: Simple tier removed - those models (0.5b-1b) perform poorly for RAG
    this.config = {
      ollama: {
        medium: 'llama3.2:3b', // 2GB, balanced, good for most queries (default)
        complex: 'qwen2.5:7b', // 4.7GB, powerful, good for complex reasoning
      },
      openai: {
        medium: 'gpt-4o-mini', // Cheap ($0.15/1M tokens), fast, good for most queries
        complex: 'gpt-4o', // Premium ($2.50/1M tokens), best quality for complex queries
      },
      ...customConfig,
    };
  }

  /**
   * Select the best model based on query complexity
   *
   * @param complexity - Query complexity analysis result
   * @param mode - Model mode (ollama or openai)
   * @returns ModelRoute with selected model and reasoning
   *
   * @example
   * ```typescript
   * const router = new ModelRouter();
   * const complexity = { level: 'complex', confidence: 0.8, ... };
   * const route = router.selectModel(complexity, 'openai');
   * // Returns: { model: 'gpt-4o', reason: 'Complex query...', ... }
   * ```
   */
  selectModel(
    complexity: QueryComplexity,
    mode: ModelMode
  ): ModelRoute {
    const selectedModel = this.config[mode][complexity.level];

    // Build reason string
    const reasons = [
      `Complexity: ${complexity.level} (score: ${complexity.score})`,
      ...complexity.indicators.slice(0, 2), // Top 2 indicators
    ];

    // Get cost/speed estimates
    const estimates = this.getModelEstimates(selectedModel, mode);

    return {
      model: selectedModel,
      reason: reasons.join(' • '),
      ...estimates,
    };
  }

  /**
   * Get cost and speed estimates for a model
   */
  private getModelEstimates(
    model: string,
    mode: ModelMode
  ): Pick<ModelRoute, 'estimatedCost' | 'estimatedSpeed'> {
    // OpenAI pricing (approximate, per 1000 tokens)
    if (mode === 'openai') {
      const pricing: Record<string, { cost: number; speed: string }> = {
        'gpt-4o-mini': { cost: 0.00015, speed: 'fast' },
        'gpt-4o': { cost: 0.0025, speed: 'medium' },
      };

      const info = pricing[model] || { cost: 0, speed: 'medium' };
      return {
        estimatedCost: info.cost,
        estimatedSpeed: info.speed,
      };
    }

    // Ollama models (free, but different speeds)
    if (mode === 'ollama') {
      const speeds: Record<string, string> = {
        'llama3.2:3b': 'fast',
        'qwen2.5:7b': 'medium',
      };

      return {
        estimatedCost: 0, // Local models are free
        estimatedSpeed: speeds[model] || 'medium',
      };
    }

    return {};
  }

  /**
   * Get current routing configuration
   */
  getRoutes(): ModelRoutingConfig {
    return { ...this.config };
  }

  /**
   * Update routing for a specific level and mode
   *
   * @param mode - Model mode (ollama or openai)
   * @param level - Complexity level
   * @param model - Model name to use
   *
   * @example
   * ```typescript
   * router.updateRoute('ollama', 'complex', 'llama3.1:8b');
   * ```
   */
  updateRoute(
    mode: ModelMode,
    level: ComplexityLevel,
    model: string
  ): void {
    this.config[mode][level] = model;
  }

  /**
   * Reset routing configuration to defaults
   */
  resetRoutes(): void {
    this.config = {
      ollama: {
        medium: 'llama3.2:3b',
        complex: 'qwen2.5:7b',
      },
      openai: {
        medium: 'gpt-4o-mini',
        complex: 'gpt-4o',
      },
    };
  }

  /**
   * Get available models for a mode (stub - will be replaced by actual detection)
   */
  getAvailableModels(mode: ModelMode): string[] {
    if (mode === 'ollama') {
      // Only models currently installed and suitable for RAG
      return [
        'llama3.2:3b',
        'qwen2.5:7b',
      ];
    }

    if (mode === 'openai') {
      return [
        'gpt-4o-mini',
        'gpt-4o',
      ];
    }

    return [];
  }

  /**
   * Validate that a model is available for routing
   */
  validateModel(mode: ModelMode, model: string): boolean {
    const available = this.getAvailableModels(mode);
    return available.includes(model);
  }

  /**
   * Get routing statistics for a set of queries
   *
   * @param complexities - Array of query complexity results
   * @param mode - Model mode
   * @returns Statistics about model usage
   */
  getRoutingStatistics(
    complexities: QueryComplexity[],
    mode: ModelMode
  ): {
    total: number;
    byModel: Record<string, number>;
    totalCost?: number; // For OpenAI mode
  } {
    const stats: Record<string, number> = {};
    let totalCost = 0;

    complexities.forEach((complexity) => {
      const route = this.selectModel(complexity, mode);
      stats[route.model] = (stats[route.model] || 0) + 1;

      if (route.estimatedCost) {
        totalCost += route.estimatedCost;
      }
    });

    return {
      total: complexities.length,
      byModel: stats,
      ...(mode === 'openai' && { totalCost }),
    };
  }
}

// Export singleton instance with default configuration
export const modelRouter = new ModelRouter();
