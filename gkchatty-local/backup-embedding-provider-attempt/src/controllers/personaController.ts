import { Request, Response, NextFunction, RequestHandler } from 'express'; // Added RequestHandler
import asyncHandler from 'express-async-handler';
import { errorTypes } from '../utils/errorResponse';
import {
  createPersona,
  getPersonasByUserId,
  getPersonaById,
  updatePersona,
  deletePersona,
  deleteAllPersonasByUserId,
  activatePersona,
  deactivateCurrentPersona,
} from '../services/personaService';
import { getLogger } from '../utils/logger';

const log = getLogger('personaController');

/**
 * @desc    Create a new persona for the authenticated user
 * @route   POST /api/personas
 * @access  Private (requires authentication and persona access)
 */
export const createPersonaHandler: RequestHandler = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const userId = req.user?._id?.toString();
    const { name, prompt } = req.body;

    if (!userId) {
      throw errorTypes.unauthorized('User not authenticated', 'AUTH_REQUIRED');
    }

    if (!name || !prompt) {
      throw errorTypes.badRequest('Name and prompt are required', 'VALIDATION_ERROR');
    }

    try {
      const persona = await createPersona(userId, name, prompt);

      res.status(201).json({
        success: true,
        message: 'Persona created successfully',
        persona: {
          _id: persona._id,
          name: persona.name,
          prompt: persona.prompt,
          isActive: persona.isActive,
          createdAt: persona.createdAt,
          updatedAt: persona.updatedAt,
        },
      });
    } catch (error) {
      log.error(`[PersonaController] Error creating persona for user ${userId}:`, error);
      throw errorTypes.badRequest(
        error instanceof Error ? error.message : 'Failed to create persona',
        'PERSONA_CREATION_ERROR'
      );
    }
  }
);

/**
 * @desc    Get all personas for the authenticated user
 * @route   GET /api/personas
 * @access  Private (requires authentication and persona access)
 */
export const getPersonasHandler: RequestHandler = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const userId = req.user?._id?.toString();

    if (!userId) {
      throw errorTypes.unauthorized('User not authenticated', 'AUTH_REQUIRED');
    }

    try {
      const personas = await getPersonasByUserId(userId);

      res.status(200).json({
        success: true,
        count: personas.length,
        personas: personas.map(persona => ({
          _id: persona._id,
          name: persona.name,
          prompt: persona.prompt,
          isActive: persona.isActive,
          createdAt: persona.createdAt,
          updatedAt: persona.updatedAt,
        })),
      });
    } catch (error) {
      log.error(`[PersonaController] Error retrieving personas for user ${userId}:`, error);
      throw errorTypes.serverError(
        error instanceof Error ? error.message : 'Failed to retrieve personas',
        'PERSONA_RETRIEVAL_ERROR'
      );
    }
  }
);

/**
 * @desc    Get a specific persona by ID for the authenticated user
 * @route   GET /api/personas/:personaId
 * @access  Private (requires authentication and persona access)
 */
export const getPersonaByIdHandler: RequestHandler = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const userId = req.user?._id?.toString();
    const { personaId } = req.params;

    if (!userId) {
      throw errorTypes.unauthorized('User not authenticated', 'AUTH_REQUIRED');
    }

    if (!personaId) {
      throw errorTypes.badRequest('Persona ID is required', 'VALIDATION_ERROR');
    }

    try {
      const persona = await getPersonaById(personaId, userId);

      if (!persona) {
        throw errorTypes.notFound('Persona not found', 'PERSONA_NOT_FOUND');
      }

      res.status(200).json({
        success: true,
        persona: {
          _id: persona._id,
          name: persona.name,
          prompt: persona.prompt,
          isActive: persona.isActive,
          createdAt: persona.createdAt,
          updatedAt: persona.updatedAt,
        },
      });
    } catch (error) {
      log.error(
        `[PersonaController] Error retrieving persona ${personaId} for user ${userId}:`,
        error
      );

      // Re-throw known errors as-is
      if (error instanceof Error && error.message === 'Persona not found') {
        throw errorTypes.notFound('Persona not found', 'PERSONA_NOT_FOUND');
      }

      throw errorTypes.serverError(
        error instanceof Error ? error.message : 'Failed to retrieve persona',
        'PERSONA_RETRIEVAL_ERROR'
      );
    }
  }
);

/**
 * @desc    Update a specific persona for the authenticated user
 * @route   PUT /api/personas/:personaId
 * @access  Private (requires authentication and persona access)
 */
export const updatePersonaHandler: RequestHandler = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const userId = req.user?._id?.toString();
    const { personaId } = req.params;
    const { name, prompt } = req.body;

    if (!userId) {
      throw errorTypes.unauthorized('User not authenticated', 'AUTH_REQUIRED');
    }

    if (!personaId) {
      throw errorTypes.badRequest('Persona ID is required', 'VALIDATION_ERROR');
    }

    // Validate that at least one field is provided for update
    if (name === undefined && prompt === undefined) {
      throw errorTypes.badRequest(
        'At least one field (name or prompt) must be provided for update',
        'VALIDATION_ERROR'
      );
    }

    try {
      const updates: { name?: string; prompt?: string } = {};
      if (name !== undefined) updates.name = name;
      if (prompt !== undefined) updates.prompt = prompt;

      const updatedPersona = await updatePersona(personaId, userId, updates);

      if (!updatedPersona) {
        throw errorTypes.notFound('Persona not found', 'PERSONA_NOT_FOUND');
      }

      res.status(200).json({
        success: true,
        message: 'Persona updated successfully',
        persona: {
          _id: updatedPersona._id,
          name: updatedPersona.name,
          prompt: updatedPersona.prompt,
          isActive: updatedPersona.isActive,
          createdAt: updatedPersona.createdAt,
          updatedAt: updatedPersona.updatedAt,
        },
      });
    } catch (error) {
      log.error(
        `[PersonaController] Error updating persona ${personaId} for user ${userId}:`,
        error
      );

      // Re-throw known errors as-is
      if (error instanceof Error && error.message === 'Persona not found') {
        throw errorTypes.notFound('Persona not found', 'PERSONA_NOT_FOUND');
      }

      throw errorTypes.badRequest(
        error instanceof Error ? error.message : 'Failed to update persona',
        'PERSONA_UPDATE_ERROR'
      );
    }
  }
);

/**
 * @desc    Delete a specific persona for the authenticated user
 * @route   DELETE /api/personas/:personaId
 * @access  Private (requires authentication and persona access)
 */
export const deletePersonaHandler: RequestHandler = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const userId = req.user?._id?.toString();
    const { personaId } = req.params;

    if (!userId) {
      throw errorTypes.unauthorized('User not authenticated', 'AUTH_REQUIRED');
    }

    if (!personaId) {
      throw errorTypes.badRequest('Persona ID is required', 'VALIDATION_ERROR');
    }

    try {
      const result = await deletePersona(personaId, userId);

      if (!result.deleted) {
        throw errorTypes.notFound('Persona not found', 'PERSONA_NOT_FOUND');
      }

      res.status(200).json({
        success: true,
        message: 'Persona deleted successfully',
        wasActive: result.wasActive,
      });
    } catch (error) {
      log.error(
        `[PersonaController] Error deleting persona ${personaId} for user ${userId}:`,
        error
      );

      // Re-throw known errors as-is
      if (error instanceof Error && error.message === 'Persona not found') {
        throw errorTypes.notFound('Persona not found', 'PERSONA_NOT_FOUND');
      }

      throw errorTypes.serverError(
        error instanceof Error ? error.message : 'Failed to delete persona',
        'PERSONA_DELETE_ERROR'
      );
    }
  }
);

/**
 * @desc    Delete all personas for the authenticated user
 * @route   DELETE /api/personas/all
 * @access  Private (requires authentication and persona access)
 */
export const deleteAllPersonasHandler: RequestHandler = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const userId = req.user?._id?.toString();

    if (!userId) {
      throw errorTypes.unauthorized('User not authenticated', 'AUTH_REQUIRED');
    }

    try {
      const result = await deleteAllPersonasByUserId(userId);
      res.status(200).json({
        success: true,
        message: `Successfully deleted ${result.deletedCount} personas.`,
        deletedCount: result.deletedCount,
      });
    } catch (error) {
      log.error(`[PersonaController] Error deleting all personas for user ${userId}:`, error);
      throw errorTypes.serverError(
        error instanceof Error ? error.message : 'Failed to delete all personas',
        'PERSONA_DELETE_ALL_ERROR'
      );
    }
  }
);

/**
 * @desc    Activate a specific persona for the authenticated user
 * @route   PUT /api/personas/:personaId/activate
 * @access  Private (requires authentication and persona access)
 */
export const activatePersonaHandler: RequestHandler = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const userId = req.user?._id?.toString();
    const { personaId } = req.params;

    if (!userId) {
      throw errorTypes.unauthorized('User not authenticated', 'AUTH_REQUIRED');
    }

    if (!personaId) {
      throw errorTypes.badRequest('Persona ID is required', 'VALIDATION_ERROR');
    }

    try {
      const activatedPersona = await activatePersona(userId, personaId);

      if (!activatedPersona) {
        // This case should ideally be handled by activatePersona service throwing an error
        throw errorTypes.notFound(
          'Persona not found or could not be activated',
          'PERSONA_ACTIVATION_ERROR'
        );
      }

      res.status(200).json({
        success: true,
        message: 'Persona activated successfully',
        persona: {
          _id: activatedPersona._id,
          name: activatedPersona.name,
          prompt: activatedPersona.prompt,
          isActive: activatedPersona.isActive,
          createdAt: activatedPersona.createdAt,
          updatedAt: activatedPersona.updatedAt,
        },
      });
    } catch (error) {
      log.error(
        `[PersonaController] Error activating persona ${personaId} for user ${userId}:`,
        error
      );

      if (
        error instanceof Error &&
        error.message === 'Persona not found or does not belong to user'
      ) {
        throw errorTypes.notFound(
          'Persona not found or does not belong to user',
          'PERSONA_NOT_FOUND_OR_UNAUTHORIZED'
        );
      }

      throw errorTypes.serverError(
        error instanceof Error ? error.message : 'Failed to activate persona',
        'PERSONA_ACTIVATION_FAILURE'
      );
    }
  }
);

/**
 * @desc    Deactivate the current active persona for the authenticated user
 * @route   PUT /api/personas/deactivate
 * @access  Private (requires authentication)
 */
export const deactivatePersonaHandler: RequestHandler = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const userId = req.user?._id?.toString();

    if (!userId) {
      throw errorTypes.unauthorized('User not authenticated', 'AUTH_REQUIRED');
    }

    try {
      const success = await deactivateCurrentPersona(userId);
      if (success) {
        res.status(200).json({
          success: true,
          message: 'Persona deactivated successfully',
        });
      } else {
        // This might occur if no persona was active, or another issue.
        throw errorTypes.badRequest(
          'Could not deactivate persona. No active persona found or another issue occurred.',
          'PERSONA_DEACTIVATION_ERROR'
        );
      }
    } catch (error) {
      log.error(`[PersonaController] Error deactivating persona for user ${userId}:`, error);
      throw errorTypes.serverError(
        error instanceof Error ? error.message : 'Failed to deactivate persona',
        'PERSONA_DEACTIVATION_FAILURE'
      );
    }
  }
);
