import express, { Request, Response, Router, NextFunction } from 'express';
import { protect, isAdmin, checkSession } from '../middleware/authMiddleware';
import {
  getOpenAIConfig,
  updateOpenAIConfig,
  ALLOWED_OPENAI_MODELS,
  revertToDefaultOpenAIApiKey,
  maskApiKey,
  isLocalModel,
} from '../services/settingsService';
import Setting from '../models/SettingModel'; // Add import for Setting model
import { getLogger } from '../utils/logger';
import { scanLocalModels, getEmbeddingInfo } from '../utils/transformersHelper';

const router: Router = express.Router();
const logger = getLogger('adminSettingsRoutes');

// Add logging to see if requests reach this router
router.use((req: Request, res: Response, next: NextFunction) => {
  logger.debug({ method: req.method, path: req.path, fullUrl: req.originalUrl }, 'Router hit');
  next();
});

// Protect all routes in this file with admin privileges
router.use(protect, checkSession, isAdmin);

// Add another log after middleware to see if requests pass authentication
router.use((req: Request, res: Response, next: NextFunction) => {
  logger.debug(
    {
      method: req.method,
      path: req.path,
      username: req.user ? req.user.username : 'NO_USER',
    },
    'Passed all middleware'
  );
  next();
});

// GET /api/admin/settings/openai-config
router.get('/openai-config', async (req: Request, res: Response) => {
  logger.info(
    {
      timestamp: new Date().toISOString(),
      username: req.user ? req.user.username : 'NO_USER',
    },
    'OpenAI Config GET handler entry'
  );

  try {
    // Step 1: Attempt to fetch configuration from service
    logger.debug('Step 1: Attempting to fetch config from service');
    let config = null;

    try {
      config = await getOpenAIConfig();
      logger.debug(
        { configKeys: config ? Object.keys(config) : null },
        'Step 1 SUCCESS: Service returned config object'
      );
    } catch (serviceError: any) {
      logger.error(
        {
          errorType: serviceError.constructor.name,
          errorMessage: serviceError.message,
          errorStack: serviceError.stack,
        },
        'Step 1 ERROR: Service call failed'
      );

      // Check for specific error types
      if (serviceError.code === 'MODULE_NOT_FOUND') {
        logger.error(
          { errorCode: serviceError.code },
          'CRITICAL: Module resolution error - check imports!'
        );
      }

      // Return a safe default response instead of throwing
      logger.info('Returning safe default response due to service error');
      return res.status(200).json({
        success: true,
        apiKeySource: 'not_set',
        isApiKeySetInDB: false,
        activeApiKeyMasked: null,
        activeOpenAIModelId: null,
        activeChatModelId: 'gpt-4o-mini', // Default fallback
        allowedModels: ALLOWED_OPENAI_MODELS,
        error: 'Failed to fetch configuration from database',
      });
    }

    // Step 2: Process the configuration data
    logger.debug('Step 2: Processing configuration data');

    // Check environment variable as fallback
    const envKey = process.env.OPENAI_API_KEY || '';
    logger.debug(
      { envKeyPresent: !!envKey, envKeyLength: envKey ? envKey.length : 0 },
      'Environment key check'
    );

    let apiKeySource: 'database' | 'environment_fallback' | 'not_set' = 'not_set';
    let activeApiKeyMasked: string | null = null;

    // Step 3: Determine API key source and mask it
    logger.debug('Step 3: Determining API key source');

    try {
      if (config && config.apiKey && config.apiKey.trim() !== '') {
        apiKeySource = 'database';
        activeApiKeyMasked = maskApiKey(config.apiKey);
        logger.debug('Using database API key (masked)');
      } else if (envKey.trim() !== '') {
        apiKeySource = 'environment_fallback';
        activeApiKeyMasked = maskApiKey(envKey);
        logger.debug('Using environment fallback API key (masked)');
      } else {
        logger.debug('No API key found in database or environment');
      }
    } catch (maskError: any) {
      logger.error({ error: maskError.message }, 'Error masking API key');
      // Continue with null masked key
    }

    // Step 4: Determine active model with fallback
    logger.debug('Step 4: Determining active model');
    const fallbackModel = process.env.OPENAI_FALLBACK_CHAT_MODEL || 'gpt-3.5-turbo';
    const activeChatModelId = config && config.modelId ? config.modelId : fallbackModel;
    logger.debug({ activeModel: activeChatModelId }, 'Active model determined');

    // Step 5: Construct response
    const responseData = {
      success: true,
      activeOpenAIModelId: config ? config.modelId : null,
      activeChatModelId,
      apiKeySource,
      activeApiKeyMasked,
      isApiKeySetInDB: !!(config && config.apiKey),
      allowedModels: ALLOWED_OPENAI_MODELS,
    };

    logger.debug(
      {
        responseData: {
          ...responseData,
          activeApiKeyMasked: responseData.activeApiKeyMasked ? 'REDACTED' : null,
        },
      },
      'Step 5: Sending response'
    );

    return res.status(200).json(responseData);
  } catch (unexpectedError: any) {
    // Catch-all for any unexpected errors
    logger.error(
      {
        error: unexpectedError,
        errorMessage: unexpectedError.message,
        errorStack: unexpectedError.stack,
      },
      'UNEXPECTED ERROR in handler'
    );

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch OpenAI configuration',
      error: unexpectedError.message,
    });
  }
});

// TEST ENDPOINT - Simple ping to verify GET requests can reach this router
router.get('/ping-openai-config', async (req: Request, res: Response) => {
  logger.info({ timestamp: new Date().toISOString() }, 'Ping handler reached');
  res.setHeader('X-Debug-Ping', 'pong');
  return res.status(200).json({
    success: true,
    message: 'pong',
    timestamp: new Date().toISOString(),
    handler: 'adminSettingsRoutes',
  });
});

// PUT /api/admin/settings/openai-config
router.put('/openai-config', async (req: Request, res: Response) => {
  const { modelId, apiKey } = req.body;

  if (!modelId && !apiKey) {
    return res.status(400).json({
      success: false,
      message: 'No configuration options provided. modelId or apiKey is required.',
    });
  }
  if (modelId && typeof modelId !== 'string') {
    return res.status(400).json({ success: false, message: 'Invalid modelId format.' });
  }
  if (apiKey && typeof apiKey !== 'string') {
    // Allow empty string for apiKey to clear it, but not other types
    return res.status(400).json({ success: false, message: 'Invalid apiKey format.' });
  }

  try {
    const result = await updateOpenAIConfig({ modelId, apiKey });
    if (result.success) {
      return res
        .status(200)
        .json({ success: true, message: 'OpenAI configuration updated successfully.' });
    } else {
      return res.status(400).json({
        success: false,
        message: result.message || 'Failed to update OpenAI configuration.',
      });
    }
  } catch (error: any) {
    logger.error({ error }, 'Error updating OpenAI config');
    return res.status(500).json({
      success: false,
      message: 'Failed to update OpenAI configuration.',
      error: error.message,
    });
  }
});

// DELETE /api/admin/settings/openai-api-key
router.delete('/openai-api-key', async (req: Request, res: Response) => {
  try {
    const result = await revertToDefaultOpenAIApiKey();
    if (result.success) {
      return res.status(200).json({
        success: true,
        message: result.message || 'OpenAI API Key reverted to system default.',
      });
    } else {
      return res
        .status(500)
        .json({ success: false, message: result.message || 'Failed to revert OpenAI API Key.' });
    }
  } catch (error: any) {
    logger.error({ error }, 'Error reverting OpenAI API key');
    return res.status(500).json({
      success: false,
      message: 'Server error while reverting API Key.',
      error: error.message,
    });
  }
});

// GET /api/admin/settings/system-prompt
router.get('/system-prompt', async (req: Request, res: Response) => {
  logger.info(
    {
      timestamp: new Date().toISOString(),
      username: req.user ? req.user.username : 'NO_USER',
    },
    'System Prompt GET handler entry'
  );

  try {
    const SYSTEM_PROMPT_KEY = 'systemPrompt';
    const setting = await Setting.findOne({ key: SYSTEM_PROMPT_KEY });

    if (!setting) {
      logger.debug('No system prompt found in database, using default');
      return res.status(200).json({
        success: true,
        prompt:
          "You are a helpful AI assistant for GOAT Insurance. Answer questions based on the provided context only. If the answer is not in the context, say you don't know.",
      });
    }

    logger.debug('Found system prompt in database');
    return res.status(200).json({
      success: true,
      prompt: setting.value,
    });
  } catch (error: any) {
    logger.error({ error }, 'Error fetching system prompt');
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch system prompt',
      error: error.message,
    });
  }
});

// PUT /api/admin/settings/system-prompt
router.put('/system-prompt', async (req: Request, res: Response) => {
  logger.info(
    {
      timestamp: new Date().toISOString(),
      username: req.user ? req.user.username : 'NO_USER',
      requestBody: req.body,
    },
    'System Prompt PUT handler entry'
  );

  try {
    const { prompt } = req.body;

    if (typeof prompt !== 'string' || prompt.trim() === '') {
      logger.warn({ promptType: typeof prompt }, 'Invalid prompt value provided');
      return res.status(400).json({
        success: false,
        message: 'Invalid prompt value provided. Prompt must be a non-empty string.',
      });
    }

    const SYSTEM_PROMPT_KEY = 'systemPrompt';
    const trimmedPrompt = prompt.trim();

    logger.debug('Updating system prompt in database');
    const updatedSetting = await Setting.findOneAndUpdate(
      { key: SYSTEM_PROMPT_KEY },
      { value: trimmedPrompt },
      {
        new: true,
        upsert: true,
        runValidators: true,
      }
    );

    if (!updatedSetting) {
      logger.error('Failed to update setting in database');
      return res.status(500).json({
        success: false,
        message: 'Failed to update system prompt setting.',
      });
    }

    logger.info('System prompt updated successfully');
    return res.status(200).json({
      success: true,
      message: 'System prompt updated successfully.',
      prompt: updatedSetting.value,
    });
  } catch (error: any) {
    logger.error({ error }, 'Error updating system prompt');
    return res.status(500).json({
      success: false,
      message: 'Failed to update system prompt',
      error: error.message,
    });
  }
});

// GET /api/admin/settings/detect-local-models
router.get('/detect-local-models', async (req: Request, res: Response) => {
  logger.info(
    {
      timestamp: new Date().toISOString(),
      username: req.user ? req.user.username : 'NO_USER',
    },
    'Detect Local Models GET handler entry'
  );

  try {
    // Get embedding service info (device, current model, etc.)
    const embeddingInfo = getEmbeddingInfo();
    logger.debug({ embeddingInfo }, 'Current embedding service info');

    // Scan for available local models in HuggingFace cache
    logger.debug('Scanning HuggingFace cache for local models');
    const discoveredModels = await scanLocalModels();
    logger.info({ count: discoveredModels.length }, 'Found local models in cache');

    // Format discovered models for frontend
    const formattedModels = discoveredModels.map((model: any) => ({
      id: `local:${model.name}`,
      name: model.name,
      dimensions: model.dimensions,
      size: model.size,
      path: model.path,
      provider: 'local',
      available: true,
      mpsSupported: embeddingInfo.device === 'mps', // MPS support based on detected device
    }));

    // Add hardcoded local models (from ALLOWED_OPENAI_MODELS)
    const hardcodedLocalModels = ALLOWED_OPENAI_MODELS
      .filter(isLocalModel)
      .map((modelId: string) => {
        // Check if this model was discovered in the cache
        const discovered = formattedModels.find((m: any) => m.id === modelId);
        if (discovered) return discovered;

        // If not discovered, return as unavailable but known
        const modelName = modelId.replace('local:', '');
        return {
          id: modelId,
          name: modelName,
          dimensions: modelName.includes('nomic-embed-text') ? 768 :
                      modelName.includes('MiniLM') ? 384 :
                      modelName.includes('gte-small') ? 384 : 768,
          size: 0,
          path: null,
          provider: 'local',
          available: false,
          mpsSupported: embeddingInfo.device === 'mps',
          downloadRequired: true,
        };
      });

    // Combine and deduplicate
    const allModels = [...hardcodedLocalModels];
    const existingIds = new Set(allModels.map(m => m.id));

    formattedModels.forEach((model: any) => {
      if (!existingIds.has(model.id)) {
        allModels.push(model);
      }
    });

    logger.info({ totalModels: allModels.length }, 'Returning local models');

    return res.status(200).json({
      success: true,
      models: allModels,
      embeddingInfo: {
        device: embeddingInfo.device,
        mpsEnabled: embeddingInfo.mpsEnabled,
        currentModel: embeddingInfo.model,
      },
    });
  } catch (error: any) {
    logger.error({ error }, 'Error detecting local models');
    return res.status(500).json({
      success: false,
      message: 'Failed to detect local models',
      error: error.message,
    });
  }
});

export default router;
