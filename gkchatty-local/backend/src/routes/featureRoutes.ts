/**
 * Feature Flags API Routes
 *
 * Provides endpoints for frontend to query enabled feature flags.
 * This allows the UI to conditionally show/hide features based on backend config.
 *
 * Phase 4: Incremental Feature Addition
 */

import { Router, Request, Response } from 'express';
import { getFeaturesForClient, features, isFeatureEnabled } from '../config/features';

const router = Router();

/**
 * GET /api/features
 *
 * Returns all feature flags safe for client consumption
 * No authentication required (feature flags are not sensitive)
 *
 * Response:
 * {
 *   ollama: boolean,
 *   smartRouting: boolean,
 *   showModelUsed: boolean
 * }
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const clientFeatures = await getFeaturesForClient();

    res.json({
      success: true,
      features: clientFeatures,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch feature flags',
      message: error.message,
    });
  }
});

/**
 * GET /api/features/:featureName
 *
 * Check if a specific feature is enabled
 *
 * Response:
 * {
 *   feature: string,
 *   enabled: boolean
 * }
 */
router.get('/:featureName', async (req: Request, res: Response) => {
  try {
    const { featureName } = req.params;

    // Validate feature name
    if (!features.hasOwnProperty(featureName)) {
      return res.status(404).json({
        success: false,
        error: `Unknown feature: ${featureName}`,
        availableFeatures: Object.keys(features),
      });
    }

    const enabled = await isFeatureEnabled(featureName as keyof typeof features);

    res.json({
      success: true,
      feature: featureName,
      enabled,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to check feature status',
      message: error.message,
    });
  }
});

export default router;
