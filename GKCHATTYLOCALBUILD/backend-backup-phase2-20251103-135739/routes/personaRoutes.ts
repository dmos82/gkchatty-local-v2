import express, { Request, Response, NextFunction } from 'express';
import { protect, checkSession } from '../middleware/authMiddleware';
import {
  createPersonaHandler,
  getPersonasHandler,
  getPersonaByIdHandler,
  updatePersonaHandler,
  deletePersonaHandler,
  deleteAllPersonasHandler,
  activatePersonaHandler,
  deactivatePersonaHandler,
} from '../controllers/personaController';
// Import getSystemPrompt and alias it to maintain existing usage name
import { getSystemPrompt as getMainKbSystemPromptHandler } from '../controllers/settingsController';
import { getLogger } from '../utils/logger';

const router: express.Router = express.Router(); // Explicitly type router
const logger = getLogger('personaRoutes');

// Middleware to authorize access to persona-related endpoints
// This is the same middleware used in userRoutes.ts
const authorizePersonaAccess = (req: Request, res: Response, next: NextFunction) => {
  if (req.user && (req.user.role === 'admin' || req.user.canCustomizePersona)) {
    return next();
  }
  logger.warn(
    {
      userId: req.user?.id,
      role: req.user?.role,
      canCustomizePersona: req.user?.canCustomizePersona,
    },
    'Forbidden persona access attempt'
  );
  return res.status(403).json({
    success: false,
    message: 'Forbidden: Insufficient permissions to access persona settings.',
  });
};

// Apply authentication and authorization middleware to all routes
router.use(protect, checkSession, authorizePersonaAccess);

// POST /api/personas - Create a new persona
router.post('/', createPersonaHandler);

// GET /api/personas - Get all personas for the authenticated user
router.get('/', getPersonasHandler);

// GET /api/personas/main-kb-system-prompt - Get the main KB system prompt for persona templating
router.get('/main-kb-system-prompt', getMainKbSystemPromptHandler);

// DELETE /api/personas/all - Delete all personas for the authenticated user
// Note: This route must be defined BEFORE the /:personaId route to avoid conflicts
router.delete('/all', deleteAllPersonasHandler);

// PUT /api/personas/deactivate - Deactivate current active persona
// Note: This route must be defined BEFORE the /:personaId route to avoid conflicts
router.put('/deactivate', deactivatePersonaHandler);

// GET /api/personas/:personaId - Get a specific persona by ID
router.get('/:personaId', getPersonaByIdHandler);

// PUT /api/personas/:personaId - Update a specific persona
router.put('/:personaId', updatePersonaHandler);

// PUT /api/personas/:personaId/activate - Activate a specific persona
router.put('/:personaId/activate', activatePersonaHandler);

// DELETE /api/personas/:personaId - Delete a specific persona
router.delete('/:personaId', deletePersonaHandler);

export default router;
