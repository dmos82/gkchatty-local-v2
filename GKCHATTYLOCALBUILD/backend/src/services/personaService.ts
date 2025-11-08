import mongoose from 'mongoose';
import { PersonaModel, IPersona } from '../utils/modelFactory';
import { UserModel as User } from '../utils/modelFactory';
import { PERSONA_NAME_MAX_LENGTH, PERSONA_PROMPT_MAX_LENGTH } from '../config/constants';
import { getLogger } from '../utils/logger';

const log = getLogger('personaService');

/**
 * Create a new persona for a user
 * New personas are created with isActive: false by default
 */
export const createPersona = async (
  userId: string,
  name: string,
  prompt: string
): Promise<IPersona> => {
  try {
    // Validate userId format
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error('Invalid user ID format');
    }

    // Validate input
    if (!name?.trim()) {
      throw new Error('Persona name is required');
    }
    if (!prompt?.trim()) {
      throw new Error('Persona prompt is required');
    }
    if (name.trim().length > PERSONA_NAME_MAX_LENGTH) {
      throw new Error(`Persona name must be ${PERSONA_NAME_MAX_LENGTH} characters or less`);
    }
    if (prompt.trim().length > PERSONA_PROMPT_MAX_LENGTH) {
      throw new Error(`Persona prompt must be ${PERSONA_PROMPT_MAX_LENGTH} characters or less`);
    }

    // Use PersonaModel.create() for SQLite compatibility
    const savedPersona = await PersonaModel.create({
      name: name.trim(),
      prompt: prompt.trim(),
      userId: new mongoose.Types.ObjectId(userId),
      isActive: false, // New personas are inactive by default
    });

    log.debug(`[PersonaService] Created persona "${name}" for user ${userId}`);
    return savedPersona;
  } catch (error) {
    log.error(`[PersonaService] Error creating persona for user ${userId}:`, error);
    throw error;
  }
};

/**
 * Get all personas for a specific user
 */
export const getPersonasByUserId = async (userId: string): Promise<IPersona[]> => {
  try {
    // Validate userId format
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error('Invalid user ID format');
    }

    const personas = await PersonaModel.find({ userId: new mongoose.Types.ObjectId(userId) })
      .sort({ createdAt: -1 }) // Most recent first
      .lean();

    log.debug(`[PersonaService] Retrieved ${personas.length} personas for user ${userId}`);
    return personas;
  } catch (error) {
    log.error(`[PersonaService] Error retrieving personas for user ${userId}:`, error);
    throw error;
  }
};

/**
 * Get a specific persona by ID, ensuring it belongs to the user
 */
export const getPersonaById = async (
  personaId: string,
  userId: string
): Promise<IPersona | null> => {
  try {
    // Validate IDs format
    if (!mongoose.Types.ObjectId.isValid(personaId)) {
      throw new Error('Invalid persona ID format');
    }
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error('Invalid user ID format');
    }

    const persona = await PersonaModel.findOne({
      _id: new mongoose.Types.ObjectId(personaId),
      userId: new mongoose.Types.ObjectId(userId),
    }).lean();

    if (persona) {
      log.debug(`[PersonaService] Retrieved persona "${persona.name}" for user ${userId}`);
    } else {
      log.debug(`[PersonaService] Persona ${personaId} not found for user ${userId}`);
    }

    return persona;
  } catch (error) {
    log.error(`[PersonaService] Error retrieving persona ${personaId} for user ${userId}:`, error);
    throw error;
  }
};

/**
 * Update a persona, ensuring it belongs to the user
 * Does not allow updating isActive directly - use activation service for that
 */
export const updatePersona = async (
  personaId: string,
  userId: string,
  updates: { name?: string; prompt?: string }
): Promise<IPersona | null> => {
  try {
    // Validate IDs format
    if (!mongoose.Types.ObjectId.isValid(personaId)) {
      throw new Error('Invalid persona ID format');
    }
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error('Invalid user ID format');
    }

    // Validate updates
    const updateData: { name?: string; prompt?: string } = {};

    if (updates.name !== undefined) {
      if (!updates.name?.trim()) {
        throw new Error('Persona name cannot be empty');
      }
      if (updates.name.trim().length > 100) {
        throw new Error('Persona name must be 100 characters or less');
      }
      updateData.name = updates.name.trim();
    }

    if (updates.prompt !== undefined) {
      if (!updates.prompt?.trim()) {
        throw new Error('Persona prompt cannot be empty');
      }
      if (updates.prompt.trim().length > 5000) {
        throw new Error('Persona prompt must be 5000 characters or less');
      }
      updateData.prompt = updates.prompt.trim();
    }

    // If no valid updates provided
    if (Object.keys(updateData).length === 0) {
      throw new Error('No valid updates provided');
    }

    const updatedPersona = await PersonaModel.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(personaId),
        userId: new mongoose.Types.ObjectId(userId),
      },
      updateData,
      { new: true, runValidators: true }
    ).lean();

    if (updatedPersona) {
      log.debug(`[PersonaService] Updated persona "${updatedPersona.name}" for user ${userId}`);
    } else {
      log.debug(`[PersonaService] Persona ${personaId} not found for user ${userId} during update`);
    }

    return updatedPersona;
  } catch (error) {
    log.error(`[PersonaService] Error updating persona ${personaId} for user ${userId}:`, error);
    throw error;
  }
};

/**
 * Delete a specific persona, ensuring it belongs to the user
 * Returns whether the persona was deleted and if it was active
 */
export const deletePersona = async (
  personaId: string,
  userId: string
): Promise<{ deleted: boolean; wasActive: boolean }> => {
  try {
    // Validate IDs format
    if (!mongoose.Types.ObjectId.isValid(personaId)) {
      throw new Error('Invalid persona ID format');
    }
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error('Invalid user ID format');
    }

    // First, find the persona to check if it was active
    const persona = await PersonaModel.findOne({
      _id: new mongoose.Types.ObjectId(personaId),
      userId: new mongoose.Types.ObjectId(userId),
    });

    if (!persona) {
      log.debug(`[PersonaService] Persona ${personaId} not found for user ${userId} during delete`);
      return { deleted: false, wasActive: false };
    }

    const wasActive = persona.isActive;
    const personaName = persona.name;

    // Delete the persona
    const deleteResult = await PersonaModel.deleteOne({
      _id: new mongoose.Types.ObjectId(personaId),
      userId: new mongoose.Types.ObjectId(userId),
    });

    const deleted = deleteResult.deletedCount > 0;

    if (deleted) {
      log.debug(
        `[PersonaService] Deleted persona "${personaName}" for user ${userId} (was active: ${wasActive})`
      );
    }

    return { deleted, wasActive };
  } catch (error) {
    log.error(`[PersonaService] Error deleting persona ${personaId} for user ${userId}:`, error);
    throw error;
  }
};

/**
 * Delete all personas for a specific user.
 * Also updates the user to ensure no active persona is set and persona usage is disabled.
 * @param userId - The ID of the user.
 * @returns The number of personas deleted.
 */
export const deleteAllPersonasByUserId = async (
  userId: string
): Promise<{ deletedCount: number }> => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error('Invalid user ID format');
    }
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const deleteResult = await PersonaModel.deleteMany({ userId: userObjectId }, { session });
    const deletedCount = deleteResult.deletedCount || 0;

    if (deletedCount > 0) {
      // If personas were deleted, update the user to clear active persona and disable persona feature
      await User.findByIdAndUpdate(
        userObjectId,
        { $set: { activePersonaId: null, isPersonaEnabled: false } },
        { session, new: true } // `new: true` is optional here as we don't use the result directly
      );
      log.debug(
        `[PersonaService] Deleted ${deletedCount} personas for user ${userId} and reset user's persona settings.`
      );
    } else {
      log.debug(`[PersonaService] No personas found to delete for user ${userId}.`);
    }

    await session.commitTransaction();
    return { deletedCount };
  } catch (error) {
    await session.abortTransaction();
    log.error(`[PersonaService] Error deleting all personas for user ${userId}:`, error);
    throw error;
  } finally {
    session.endSession();
  }
};

/**
 * Activate a persona for a user
 * Sets the specified persona as active and deactivates all others for the user
 * Updates the User.activePersonaId field
 */
export const activatePersona = async (
  userId: string,
  personaIdToActivate: string
): Promise<IPersona | null> => {
  try {
    // Validate IDs format
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error('Invalid user ID format');
    }
    if (!mongoose.Types.ObjectId.isValid(personaIdToActivate)) {
      throw new Error('Invalid persona ID format');
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);
    const personaObjectId = new mongoose.Types.ObjectId(personaIdToActivate);

    // Verify the persona belongs to the user
    const personaToActivate = await PersonaModel.findOne({
      _id: personaObjectId,
      userId: userObjectId,
    });

    if (!personaToActivate) {
      throw new Error('Persona not found or does not belong to user');
    }

    // Start a session for transaction
    const session = await mongoose.startSession();

    try {
      await session.withTransaction(async () => {
        // 1. Set all personas for this user to inactive
        await PersonaModel.updateMany({ userId: userObjectId }, { isActive: false }, { session });

        // 2. Set the specified persona to active
        await PersonaModel.findByIdAndUpdate(personaObjectId, { isActive: true }, { session });

        // 3. Update the User's activePersonaId
        await User.findByIdAndUpdate(
          userObjectId,
          { activePersonaId: personaObjectId },
          { session }
        );
      });

      log.debug(
        `[PersonaService] Activated persona "${personaToActivate.name}" for user ${userId}`
      );

      // Return the updated persona
      const activatedPersona = await PersonaModel.findById(personaObjectId).lean();
      return activatedPersona;
    } finally {
      await session.endSession();
    }
  } catch (error) {
    log.error(
      `[PersonaService] Error activating persona ${personaIdToActivate} for user ${userId}:`,
      error
    );
    throw error;
  }
};

/**
 * Deactivate the current active persona for a user
 * Sets all personas to inactive and clears User.activePersonaId
 */
export const deactivateCurrentPersona = async (userId: string): Promise<boolean> => {
  try {
    // Validate userId format
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error('Invalid user ID format');
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);

    // Start a session for transaction
    const session = await mongoose.startSession();

    try {
      await session.withTransaction(async () => {
        // 1. Set all personas for this user to inactive
        await PersonaModel.updateMany({ userId: userObjectId }, { isActive: false }, { session });

        // 2. Clear the User's activePersonaId
        await User.findByIdAndUpdate(userObjectId, { activePersonaId: null }, { session });
      });

      log.debug(`[PersonaService] Deactivated current persona for user ${userId}`);
      return true;
    } finally {
      await session.endSession();
    }
  } catch (error) {
    log.error(`[PersonaService] Error deactivating current persona for user ${userId}:`, error);
    throw error;
  }
};
