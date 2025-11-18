/**
 * Ollama Model Routes for GKChatty Local
 *
 * Provides REST API endpoints for managing Ollama models:
 * - List available models
 * - Health check
 * - Check specific model availability
 *
 * Phase 4 - Week 2: Ollama Integration
 * Status: ACTIVE
 */

import { Router, Request, Response } from 'express';
import { ollamaService } from '../services/ollamaService';
import { getFeatures } from '../config/features';

const router = Router();

// ============================================================================
// Middleware: Check Ollama Feature Flag
// ✅ FIX: Made async to properly await feature check
// ============================================================================

const checkOllamaEnabled = async (req: Request, res: Response, next: any) => {
  // ✅ FIX: Use getFeatures() with await for proper async feature check
  const features = await getFeatures();
  if (!features.ollama) {
    return res.status(403).json({
      success: false,
      error: 'Ollama integration is disabled',
      message: 'Set FEATURE_OLLAMA_MODELS=true to enable Ollama models',
    });
  }
  next();
};

// Apply middleware to all routes
router.use(checkOllamaEnabled);

// ============================================================================
// GET /api/models/ollama/health
// Check if Ollama service is running
// ============================================================================

router.get('/health', async (req: Request, res: Response) => {
  try {
    const health = await ollamaService.healthCheck();

    if (health.status === 'healthy') {
      res.json({
        success: true,
        status: 'healthy',
        version: health.version,
        models: health.models,
        baseURL: ollamaService.getBaseURL(),
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(503).json({
        success: false,
        status: 'unhealthy',
        error: health.error,
        baseURL: ollamaService.getBaseURL(),
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error: any) {
    console.error('[OllamaRoutes] Health check failed:', error);
    res.status(500).json({
      success: false,
      error: 'Health check failed',
      message: error.message,
    });
  }
});

// ============================================================================
// GET /api/models/ollama
// List all available Ollama models
// ============================================================================

router.get('/', async (req: Request, res: Response) => {
  try {
    // Check if simple format requested
    const simple = req.query.simple === 'true';

    if (simple) {
      // Return simplified model list for UI
      const models = await ollamaService.getSimpleModelList();

      res.json({
        success: true,
        count: models.length,
        models: models,
        timestamp: new Date().toISOString(),
      });
    } else {
      // Return full model details
      const response = await ollamaService.listModels();

      res.json({
        success: true,
        count: response.models.length,
        models: response.models,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error: any) {
    console.error('[OllamaRoutes] List models failed:', error);

    // Check if Ollama is not running
    if (error.message.includes('ECONNREFUSED') || error.message.includes('connect')) {
      return res.status(503).json({
        success: false,
        error: 'Ollama service not available',
        message: 'Ollama is not running. Please start Ollama service.',
        models: [],
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to list models',
      message: error.message,
      models: [],
    });
  }
});

// ============================================================================
// GET /api/models/ollama/:modelName
// Check if a specific model is available
// ============================================================================

router.get('/:modelName', async (req: Request, res: Response) => {
  try {
    const { modelName } = req.params;

    const hasModel = await ollamaService.hasModel(modelName);

    if (hasModel) {
      res.json({
        success: true,
        model: modelName,
        available: true,
        message: `Model "${modelName}" is available`,
      });
    } else {
      res.status(404).json({
        success: false,
        model: modelName,
        available: false,
        message: `Model "${modelName}" not found. You may need to pull it first.`,
        suggestion: `Run: ollama pull ${modelName}`,
      });
    }
  } catch (error: any) {
    console.error('[OllamaRoutes] Check model failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check model availability',
      message: error.message,
    });
  }
});

// ============================================================================
// Export Router
// ============================================================================

export default router;
