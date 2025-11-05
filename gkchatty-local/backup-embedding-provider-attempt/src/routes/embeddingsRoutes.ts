/**
 * Embedding Provider Routes for GKChatty Local
 *
 * Provides API endpoints for managing embedding providers:
 * - List available providers
 * - Scan for local models
 * - Test provider health
 * - Switch active provider
 * - Benchmark provider performance
 *
 * Part of GKChatty Local - Pluggable Embedding Architecture
 * Date: November 3, 2025
 */

import * as expressModule from 'express';
const express = expressModule.default || expressModule;
const router = express.Router();

import { protect } from '../middleware/authMiddleware';
import { getProviderRegistry } from '../services/embedding/ProviderRegistry';
import { OpenAIProvider } from '../services/embedding/providers/OpenAIProvider';
import { OllamaProvider, isOllamaAvailable } from '../services/embedding/providers/OllamaProvider';
import storageAdapter from '../utils/storageAdapter';

/**
 * GET /api/embeddings/providers
 *
 * List all available embedding providers
 *
 * Response:
 * {
 *   providers: Array<ProviderConfig>,
 *   activeProvider: string | null
 * }
 */
router.get('/providers', protect, async (req, res) => {
  try {
    const providers = storageAdapter.listProviders();
    const activeProvider = storageAdapter.getActiveProvider();

    res.status(200).json({
      success: true,
      providers,
      activeProvider,
      count: providers.length,
    });
  } catch (error) {
    console.error('[Embeddings API] Failed to list providers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to list providers',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/embeddings/scan
 *
 * Scan for available local embedding models and API providers
 *
 * Response:
 * {
 *   localModels: DetectedModel[],
 *   apiProviders: string[],
 *   recommended: string
 * }
 */
router.post('/scan', protect, async (req, res) => {
  try {
    const detected: any = {
      localModels: [],
      apiProviders: [],
      recommended: null,
    };

    // Check if Ollama is available
    const ollamaRunning = await isOllamaAvailable();
    if (ollamaRunning) {
      detected.localModels.push({
        id: 'ollama-nomic-embed-text',
        name: 'Nomic Embed Text (Ollama)',
        type: 'local',
        available: true,
        requiresApiKey: false,
        estimatedCost: '$0 (local)',
      });
    }

    // Check for API provider credentials
    if (process.env.OPENAI_API_KEY) {
      detected.apiProviders.push('openai');
    }

    // Recommend local model if available, otherwise OpenAI
    if (detected.localModels.length > 0) {
      detected.recommended = 'ollama-nomic-embed-text';
    } else if (detected.apiProviders.includes('openai')) {
      detected.recommended = 'openai-text-embedding-3-small';
    }

    res.status(200).json({
      success: true,
      ...detected,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Embeddings API] Failed to scan for models:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to scan for models',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/embeddings/test
 *
 * Test a specific provider's health and performance
 *
 * Body:
 * {
 *   providerId: string  // Provider ID to test
 * }
 *
 * Response:
 * {
 *   providerId: string,
 *   healthy: boolean,
 *   latency: number,  // in milliseconds
 *   dimensions: number,
 *   error?: string
 * }
 */
router.post('/test', protect, async (req, res) => {
  try {
    const { providerId } = req.body;

    if (!providerId) {
      return res.status(400).json({
        success: false,
        message: 'providerId is required',
      });
    }

    const registry = getProviderRegistry();
    const provider = registry.getProvider(providerId);

    if (!provider) {
      return res.status(404).json({
        success: false,
        message: `Provider not found: ${providerId}`,
      });
    }

    // Test the provider by generating a simple embedding
    const startTime = Date.now();
    const testEmbedding = await provider.embed('test');
    const latency = Date.now() - startTime;

    const info = provider.getInfo();

    res.status(200).json({
      success: true,
      providerId,
      healthy: true,
      latency,
      dimensions: testEmbedding.length,
      providerName: info.name,
      requiresApiKey: info.requiresApiKey,
      estimatedCost: info.estimatedCost,
    });
  } catch (error) {
    console.error('[Embeddings API] Provider test failed:', error);
    res.status(200).json({
      success: false,
      providerId: req.body.providerId,
      healthy: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/embeddings/set-provider
 *
 * Switch to a different embedding provider
 *
 * Body:
 * {
 *   providerId: string,  // Provider ID to activate
 *   apiKey?: string      // API key if required (for API providers)
 * }
 *
 * Response:
 * {
 *   success: boolean,
 *   activeProvider: string,
 *   message: string
 * }
 */
router.post('/set-provider', protect, async (req, res) => {
  try {
    const { providerId, apiKey } = req.body;

    if (!providerId) {
      return res.status(400).json({
        success: false,
        message: 'providerId is required',
      });
    }

    const registry = getProviderRegistry();

    // Check if provider exists
    if (!registry.hasProvider(providerId)) {
      // Try to register the provider if it's a known type
      if (providerId.startsWith('openai-')) {
        if (!apiKey && !process.env.OPENAI_API_KEY) {
          return res.status(400).json({
            success: false,
            message: 'API key required for OpenAI provider',
          });
        }

        const model = providerId.replace('openai-', '') as 'text-embedding-3-small' | 'text-embedding-3-large';
        const provider = new OpenAIProvider({
          apiKey: apiKey || process.env.OPENAI_API_KEY!,
          model,
        });

        await registry.registerProvider(provider);
      } else if (providerId.startsWith('ollama-')) {
        const model = providerId.replace('ollama-', '');
        const provider = new OllamaProvider({ model });

        await registry.registerProvider(provider);
      } else {
        return res.status(404).json({
          success: false,
          message: `Provider not found: ${providerId}`,
        });
      }
    }

    // Switch to the provider
    await storageAdapter.switchProvider(providerId);

    res.status(200).json({
      success: true,
      activeProvider: providerId,
      message: `Successfully switched to provider: ${providerId}`,
    });
  } catch (error) {
    console.error('[Embeddings API] Failed to switch provider:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to switch provider',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/embeddings/benchmark
 *
 * Benchmark the currently active provider's performance
 *
 * Query params:
 * - samples: number (default: 10) - Number of test samples
 *
 * Response:
 * {
 *   providerId: string,
 *   samples: number,
 *   avgLatency: number,  // in milliseconds
 *   minLatency: number,
 *   maxLatency: number,
 *   throughput: number,  // embeddings per second
 *   dimensions: number
 * }
 */
router.get('/benchmark', protect, async (req, res) => {
  try {
    const samples = parseInt(req.query.samples as string) || 10;

    if (samples < 1 || samples > 100) {
      return res.status(400).json({
        success: false,
        message: 'samples must be between 1 and 100',
      });
    }

    const registry = getProviderRegistry();
    const provider = registry.getActiveProvider();
    const info = provider.getInfo();

    // Run benchmark
    const latencies: number[] = [];
    const testText = 'This is a test sentence for benchmarking embedding generation performance.';

    for (let i = 0; i < samples; i++) {
      const startTime = Date.now();
      await provider.embed(testText);
      const latency = Date.now() - startTime;
      latencies.push(latency);
    }

    // Calculate statistics
    const avgLatency = latencies.reduce((sum, l) => sum + l, 0) / latencies.length;
    const minLatency = Math.min(...latencies);
    const maxLatency = Math.max(...latencies);
    const throughput = 1000 / avgLatency; // embeddings per second

    res.status(200).json({
      success: true,
      providerId: info.id,
      providerName: info.name,
      samples,
      avgLatency: Math.round(avgLatency),
      minLatency,
      maxLatency,
      throughput: Math.round(throughput * 100) / 100, // 2 decimal places
      dimensions: info.dimensions,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Embeddings API] Benchmark failed:', error);
    res.status(500).json({
      success: false,
      message: 'Benchmark failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/embeddings/info
 *
 * Get detailed information about the current embedding setup
 *
 * Response:
 * {
 *   storageMode: string,
 *   activeProvider: string,
 *   providerInfo: ProviderInfo,
 *   storageInfo: object
 * }
 */
router.get('/info', protect, async (req, res) => {
  try {
    const activeProviderId = storageAdapter.getActiveProvider();
    const storageInfo = storageAdapter.getStorageInfo();

    let providerInfo = null;
    if (activeProviderId) {
      const registry = getProviderRegistry();
      const provider = registry.getProvider(activeProviderId);
      if (provider) {
        providerInfo = provider.getInfo();

        // Add provider stats
        const stats = registry.getProviderStats(activeProviderId);
        if (stats) {
          providerInfo = {
            ...providerInfo,
            stats: {
              totalEmbeddings: stats.totalEmbeddings,
              totalTokens: stats.totalTokens,
              totalCost: stats.totalCost,
              averageLatency: Math.round(stats.averageLatency),
              errorCount: stats.errorCount,
            },
          };
        }
      }
    }

    res.status(200).json({
      success: true,
      storageMode: process.env.GKCHATTY_STORAGE || 'local',
      activeProvider: activeProviderId,
      providerInfo,
      storageInfo,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Embeddings API] Failed to get info:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get embedding info',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
