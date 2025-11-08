import express, { Router, Request, Response } from 'express';
import { protect, checkSession } from '../middleware/authMiddleware';
import { ALLOWED_OPENAI_MODELS } from '../services/settingsService';
import { getLogger } from '../utils/logger';

const router: Router = express.Router();
const logger = getLogger('modelsRoutes');

/**
 * @route   GET /api/models
 * @desc    Get list of available models
 * @access  Private (Authenticated users)
 */
router.get('/', protect, checkSession, async (req: Request, res: Response) => {
  try {
    logger.debug('Fetching available models');

    // Return the list of allowed OpenAI models
    const models = ALLOWED_OPENAI_MODELS.map(model => ({
      id: model,
      name: model,
      provider: 'openai'
    }));

    return res.status(200).json({
      success: true,
      models
    });
  } catch (error: unknown) {
    logger.error('Error fetching models:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch models',
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

export default router;
