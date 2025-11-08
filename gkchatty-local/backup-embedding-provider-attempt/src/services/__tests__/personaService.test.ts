// Mock setup BEFORE imports
const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  fatal: jest.fn(),
  trace: jest.fn(),
};

jest.mock('../../utils/logger', () => ({
  getLogger: jest.fn(() => mockLogger),
}));

// Mock mongoose models
jest.mock('../../models/PersonaModel');
jest.mock('../../models/UserModel');

// Mock mongoose for transaction support
jest.mock('mongoose', () => {
  const actualMongoose = jest.requireActual('mongoose');
  return {
    ...actualMongoose,
    startSession: jest.fn(),
  };
});

import mongoose from 'mongoose';
import PersonaModel from '../../models/PersonaModel';
import User from '../../models/UserModel';
import {
  createPersona,
  getPersonasByUserId,
  getPersonaById,
  updatePersona,
  deletePersona,
  deleteAllPersonasByUserId,
  activatePersona,
  deactivateCurrentPersona,
} from '../personaService';

// Get mocked versions
const mockPersonaModel = PersonaModel as jest.Mocked<typeof PersonaModel>;
const mockUserModel = User as jest.Mocked<typeof User>;
const mockStartSession = mongoose.startSession as jest.MockedFunction<typeof mongoose.startSession>;

describe('personaService', () => {
  // Mock data
  const mockUserId = new mongoose.Types.ObjectId().toString();
  const mockPersonaId = new mongoose.Types.ObjectId().toString();
  const mockPersonaId2 = new mongoose.Types.ObjectId().toString();

  const mockPersona = {
    _id: new mongoose.Types.ObjectId(mockPersonaId),
    name: 'Test Persona',
    prompt: 'You are a helpful assistant',
    userId: new mongoose.Types.ObjectId(mockUserId),
    isActive: false,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    save: jest.fn(),
  };

  const mockSession = {
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    abortTransaction: jest.fn(),
    endSession: jest.fn(),
    withTransaction: jest.fn((callback) => callback()),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockStartSession.mockResolvedValue(mockSession as any);
  });

  describe('createPersona', () => {
    it('should create a new persona with isActive: false', async () => {
      const mockSavedPersona = { ...mockPersona };
      mockSavedPersona.save.mockResolvedValue(mockSavedPersona);

      // Mock PersonaModel constructor
      (PersonaModel as any).mockImplementation(() => mockSavedPersona);

      const result = await createPersona(mockUserId, 'Test Persona', 'You are a helpful assistant');

      expect(result).toEqual(mockSavedPersona);
      expect(PersonaModel).toHaveBeenCalledWith({
        name: 'Test Persona',
        prompt: 'You are a helpful assistant',
        userId: expect.any(mongoose.Types.ObjectId),
        isActive: false,
      });
      expect(mockSavedPersona.save).toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        `[PersonaService] Created persona "Test Persona" for user ${mockUserId}`
      );
    });

    it('should trim name and prompt', async () => {
      const mockSavedPersona = { ...mockPersona };
      mockSavedPersona.save.mockResolvedValue(mockSavedPersona);
      (PersonaModel as any).mockImplementation(() => mockSavedPersona);

      await createPersona(mockUserId, '  Test Persona  ', '  You are a helpful assistant  ');

      expect(PersonaModel).toHaveBeenCalledWith({
        name: 'Test Persona',
        prompt: 'You are a helpful assistant',
        userId: expect.any(mongoose.Types.ObjectId),
        isActive: false,
      });
    });

    it('should throw error for invalid userId format', async () => {
      await expect(createPersona('invalid-id', 'Test', 'Prompt')).rejects.toThrow(
        'Invalid user ID format'
      );
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should throw error when name is missing', async () => {
      await expect(createPersona(mockUserId, '', 'Prompt')).rejects.toThrow(
        'Persona name is required'
      );
    });

    it('should throw error when name is empty/whitespace only', async () => {
      await expect(createPersona(mockUserId, '   ', 'Prompt')).rejects.toThrow(
        'Persona name is required'
      );
    });

    it('should throw error when prompt is missing', async () => {
      await expect(createPersona(mockUserId, 'Name', '')).rejects.toThrow(
        'Persona prompt is required'
      );
    });

    it('should throw error when prompt is empty/whitespace only', async () => {
      await expect(createPersona(mockUserId, 'Name', '   ')).rejects.toThrow(
        'Persona prompt is required'
      );
    });

    it('should throw error when name exceeds 100 characters', async () => {
      const longName = 'a'.repeat(101);
      await expect(createPersona(mockUserId, longName, 'Prompt')).rejects.toThrow(
        'Persona name must be 100 characters or less'
      );
    });

    it('should throw error when prompt exceeds 5000 characters', async () => {
      const longPrompt = 'a'.repeat(5001);
      await expect(createPersona(mockUserId, 'Name', longPrompt)).rejects.toThrow(
        'Persona prompt must be 5000 characters or less'
      );
    });

    it('should handle MongoDB save errors gracefully', async () => {
      const mockSavedPersona = { ...mockPersona };
      const dbError = new Error('Database error');
      mockSavedPersona.save.mockRejectedValue(dbError);
      (PersonaModel as any).mockImplementation(() => mockSavedPersona);

      await expect(createPersona(mockUserId, 'Name', 'Prompt')).rejects.toThrow('Database error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        `[PersonaService] Error creating persona for user ${mockUserId}:`,
        dbError
      );
    });

    it('should accept name and prompt at exactly max lengths', async () => {
      const maxName = 'a'.repeat(100);
      const maxPrompt = 'b'.repeat(5000);
      const mockSavedPersona = { ...mockPersona };
      mockSavedPersona.save.mockResolvedValue(mockSavedPersona);
      (PersonaModel as any).mockImplementation(() => mockSavedPersona);

      await createPersona(mockUserId, maxName, maxPrompt);

      expect(PersonaModel).toHaveBeenCalledWith({
        name: maxName,
        prompt: maxPrompt,
        userId: expect.any(mongoose.Types.ObjectId),
        isActive: false,
      });
    });
  });

  describe('getPersonasByUserId', () => {
    it('should retrieve all personas for a user sorted by createdAt desc', async () => {
      const mockPersonas = [
        { ...mockPersona, createdAt: new Date('2024-01-02') },
        { ...mockPersona, createdAt: new Date('2024-01-01') },
      ];

      const mockChain = {
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockPersonas),
      };

      mockPersonaModel.find = jest.fn().mockReturnValue(mockChain);

      const result = await getPersonasByUserId(mockUserId);

      expect(result).toEqual(mockPersonas);
      expect(mockPersonaModel.find).toHaveBeenCalledWith({
        userId: expect.any(mongoose.Types.ObjectId),
      });
      expect(mockChain.sort).toHaveBeenCalledWith({ createdAt: -1 });
      expect(mockChain.lean).toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        `[PersonaService] Retrieved ${mockPersonas.length} personas for user ${mockUserId}`
      );
    });

    it('should return empty array when user has no personas', async () => {
      const mockChain = {
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      };

      mockPersonaModel.find = jest.fn().mockReturnValue(mockChain);

      const result = await getPersonasByUserId(mockUserId);

      expect(result).toEqual([]);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        `[PersonaService] Retrieved 0 personas for user ${mockUserId}`
      );
    });

    it('should throw error for invalid userId format', async () => {
      await expect(getPersonasByUserId('invalid-id')).rejects.toThrow('Invalid user ID format');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle MongoDB query errors gracefully', async () => {
      const dbError = new Error('Database error');
      const mockChain = {
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockRejectedValue(dbError),
      };

      mockPersonaModel.find = jest.fn().mockReturnValue(mockChain);

      await expect(getPersonasByUserId(mockUserId)).rejects.toThrow('Database error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        `[PersonaService] Error retrieving personas for user ${mockUserId}:`,
        dbError
      );
    });
  });

  describe('getPersonaById', () => {
    it('should retrieve a specific persona for the user', async () => {
      const mockChain = {
        lean: jest.fn().mockResolvedValue(mockPersona),
      };

      mockPersonaModel.findOne = jest.fn().mockReturnValue(mockChain);

      const result = await getPersonaById(mockPersonaId, mockUserId);

      expect(result).toEqual(mockPersona);
      expect(mockPersonaModel.findOne).toHaveBeenCalledWith({
        _id: expect.any(mongoose.Types.ObjectId),
        userId: expect.any(mongoose.Types.ObjectId),
      });
      expect(mockChain.lean).toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        `[PersonaService] Retrieved persona "${mockPersona.name}" for user ${mockUserId}`
      );
    });

    it('should return null when persona not found', async () => {
      const mockChain = {
        lean: jest.fn().mockResolvedValue(null),
      };

      mockPersonaModel.findOne = jest.fn().mockReturnValue(mockChain);

      const result = await getPersonaById(mockPersonaId, mockUserId);

      expect(result).toBeNull();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        `[PersonaService] Persona ${mockPersonaId} not found for user ${mockUserId}`
      );
    });

    it('should return null when persona belongs to different user', async () => {
      const mockChain = {
        lean: jest.fn().mockResolvedValue(null),
      };

      mockPersonaModel.findOne = jest.fn().mockReturnValue(mockChain);

      const differentUserId = new mongoose.Types.ObjectId().toString();
      const result = await getPersonaById(mockPersonaId, differentUserId);

      expect(result).toBeNull();
    });

    it('should throw error for invalid personaId format', async () => {
      await expect(getPersonaById('invalid-id', mockUserId)).rejects.toThrow(
        'Invalid persona ID format'
      );
    });

    it('should throw error for invalid userId format', async () => {
      await expect(getPersonaById(mockPersonaId, 'invalid-id')).rejects.toThrow(
        'Invalid user ID format'
      );
    });

    it('should handle MongoDB query errors gracefully', async () => {
      const dbError = new Error('Database error');
      const mockChain = {
        lean: jest.fn().mockRejectedValue(dbError),
      };

      mockPersonaModel.findOne = jest.fn().mockReturnValue(mockChain);

      await expect(getPersonaById(mockPersonaId, mockUserId)).rejects.toThrow('Database error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        `[PersonaService] Error retrieving persona ${mockPersonaId} for user ${mockUserId}:`,
        dbError
      );
    });
  });

  describe('updatePersona', () => {
    it('should update persona name successfully', async () => {
      const updatedPersona = { ...mockPersona, name: 'Updated Name' };
      const mockChain = {
        lean: jest.fn().mockResolvedValue(updatedPersona),
      };

      mockPersonaModel.findOneAndUpdate = jest.fn().mockReturnValue(mockChain);

      const result = await updatePersona(mockPersonaId, mockUserId, { name: 'Updated Name' });

      expect(result).toEqual(updatedPersona);
      expect(mockPersonaModel.findOneAndUpdate).toHaveBeenCalledWith(
        {
          _id: expect.any(mongoose.Types.ObjectId),
          userId: expect.any(mongoose.Types.ObjectId),
        },
        { name: 'Updated Name' },
        { new: true, runValidators: true }
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        `[PersonaService] Updated persona "${updatedPersona.name}" for user ${mockUserId}`
      );
    });

    it('should update persona prompt successfully', async () => {
      const updatedPersona = { ...mockPersona, prompt: 'Updated prompt' };
      const mockChain = {
        lean: jest.fn().mockResolvedValue(updatedPersona),
      };

      mockPersonaModel.findOneAndUpdate = jest.fn().mockReturnValue(mockChain);

      const result = await updatePersona(mockPersonaId, mockUserId, { prompt: 'Updated prompt' });

      expect(result).toEqual(updatedPersona);
      expect(mockPersonaModel.findOneAndUpdate).toHaveBeenCalledWith(
        {
          _id: expect.any(mongoose.Types.ObjectId),
          userId: expect.any(mongoose.Types.ObjectId),
        },
        { prompt: 'Updated prompt' },
        { new: true, runValidators: true }
      );
    });

    it('should update both name and prompt successfully', async () => {
      const updatedPersona = { ...mockPersona, name: 'New Name', prompt: 'New prompt' };
      const mockChain = {
        lean: jest.fn().mockResolvedValue(updatedPersona),
      };

      mockPersonaModel.findOneAndUpdate = jest.fn().mockReturnValue(mockChain);

      const result = await updatePersona(mockPersonaId, mockUserId, {
        name: 'New Name',
        prompt: 'New prompt',
      });

      expect(result).toEqual(updatedPersona);
      expect(mockPersonaModel.findOneAndUpdate).toHaveBeenCalledWith(
        {
          _id: expect.any(mongoose.Types.ObjectId),
          userId: expect.any(mongoose.Types.ObjectId),
        },
        { name: 'New Name', prompt: 'New prompt' },
        { new: true, runValidators: true }
      );
    });

    it('should trim name and prompt before updating', async () => {
      const updatedPersona = { ...mockPersona, name: 'Trimmed', prompt: 'Trimmed' };
      const mockChain = {
        lean: jest.fn().mockResolvedValue(updatedPersona),
      };

      mockPersonaModel.findOneAndUpdate = jest.fn().mockReturnValue(mockChain);

      await updatePersona(mockPersonaId, mockUserId, {
        name: '  Trimmed  ',
        prompt: '  Trimmed  ',
      });

      expect(mockPersonaModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.any(Object),
        { name: 'Trimmed', prompt: 'Trimmed' },
        expect.any(Object)
      );
    });

    it('should return null when persona not found', async () => {
      const mockChain = {
        lean: jest.fn().mockResolvedValue(null),
      };

      mockPersonaModel.findOneAndUpdate = jest.fn().mockReturnValue(mockChain);

      const result = await updatePersona(mockPersonaId, mockUserId, { name: 'New Name' });

      expect(result).toBeNull();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        `[PersonaService] Persona ${mockPersonaId} not found for user ${mockUserId} during update`
      );
    });

    it('should return null when persona belongs to different user', async () => {
      const mockChain = {
        lean: jest.fn().mockResolvedValue(null),
      };

      mockPersonaModel.findOneAndUpdate = jest.fn().mockReturnValue(mockChain);

      const differentUserId = new mongoose.Types.ObjectId().toString();
      const result = await updatePersona(mockPersonaId, differentUserId, { name: 'New Name' });

      expect(result).toBeNull();
    });

    it('should throw error for invalid personaId format', async () => {
      await expect(
        updatePersona('invalid-id', mockUserId, { name: 'Name' })
      ).rejects.toThrow('Invalid persona ID format');
    });

    it('should throw error for invalid userId format', async () => {
      await expect(
        updatePersona(mockPersonaId, 'invalid-id', { name: 'Name' })
      ).rejects.toThrow('Invalid user ID format');
    });

    it('should throw error when updated name is empty/whitespace', async () => {
      await expect(
        updatePersona(mockPersonaId, mockUserId, { name: '   ' })
      ).rejects.toThrow('Persona name cannot be empty');
    });

    it('should throw error when updated prompt is empty/whitespace', async () => {
      await expect(
        updatePersona(mockPersonaId, mockUserId, { prompt: '   ' })
      ).rejects.toThrow('Persona prompt cannot be empty');
    });

    it('should throw error when updated name exceeds 100 characters', async () => {
      const longName = 'a'.repeat(101);
      await expect(
        updatePersona(mockPersonaId, mockUserId, { name: longName })
      ).rejects.toThrow('Persona name must be 100 characters or less');
    });

    it('should throw error when updated prompt exceeds 5000 characters', async () => {
      const longPrompt = 'a'.repeat(5001);
      await expect(
        updatePersona(mockPersonaId, mockUserId, { prompt: longPrompt })
      ).rejects.toThrow('Persona prompt must be 5000 characters or less');
    });

    it('should throw error when no valid updates provided (empty object)', async () => {
      await expect(updatePersona(mockPersonaId, mockUserId, {})).rejects.toThrow(
        'No valid updates provided'
      );
    });

    it('should handle MongoDB update errors gracefully', async () => {
      const dbError = new Error('Database error');
      const mockChain = {
        lean: jest.fn().mockRejectedValue(dbError),
      };

      mockPersonaModel.findOneAndUpdate = jest.fn().mockReturnValue(mockChain);

      await expect(
        updatePersona(mockPersonaId, mockUserId, { name: 'Name' })
      ).rejects.toThrow('Database error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        `[PersonaService] Error updating persona ${mockPersonaId} for user ${mockUserId}:`,
        dbError
      );
    });

    it('should accept updates at exactly max lengths', async () => {
      const maxName = 'a'.repeat(100);
      const maxPrompt = 'b'.repeat(5000);
      const updatedPersona = { ...mockPersona, name: maxName, prompt: maxPrompt };
      const mockChain = {
        lean: jest.fn().mockResolvedValue(updatedPersona),
      };

      mockPersonaModel.findOneAndUpdate = jest.fn().mockReturnValue(mockChain);

      await updatePersona(mockPersonaId, mockUserId, { name: maxName, prompt: maxPrompt });

      expect(mockPersonaModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.any(Object),
        { name: maxName, prompt: maxPrompt },
        expect.any(Object)
      );
    });
  });

  describe('deletePersona', () => {
    it('should delete persona and return deleted: true, wasActive: true', async () => {
      const activePersona = { ...mockPersona, isActive: true };
      mockPersonaModel.findOne = jest.fn().mockResolvedValue(activePersona);
      mockPersonaModel.deleteOne = jest.fn().mockResolvedValue({ deletedCount: 1 });

      const result = await deletePersona(mockPersonaId, mockUserId);

      expect(result).toEqual({ deleted: true, wasActive: true });
      expect(mockPersonaModel.findOne).toHaveBeenCalledWith({
        _id: expect.any(mongoose.Types.ObjectId),
        userId: expect.any(mongoose.Types.ObjectId),
      });
      expect(mockPersonaModel.deleteOne).toHaveBeenCalledWith({
        _id: expect.any(mongoose.Types.ObjectId),
        userId: expect.any(mongoose.Types.ObjectId),
      });
      expect(mockLogger.debug).toHaveBeenCalledWith(
        `[PersonaService] Deleted persona "${activePersona.name}" for user ${mockUserId} (was active: true)`
      );
    });

    it('should delete persona and return deleted: true, wasActive: false', async () => {
      const inactivePersona = { ...mockPersona, isActive: false };
      mockPersonaModel.findOne = jest.fn().mockResolvedValue(inactivePersona);
      mockPersonaModel.deleteOne = jest.fn().mockResolvedValue({ deletedCount: 1 });

      const result = await deletePersona(mockPersonaId, mockUserId);

      expect(result).toEqual({ deleted: true, wasActive: false });
      expect(mockLogger.debug).toHaveBeenCalledWith(
        `[PersonaService] Deleted persona "${inactivePersona.name}" for user ${mockUserId} (was active: false)`
      );
    });

    it('should return deleted: false, wasActive: false when persona not found', async () => {
      mockPersonaModel.findOne = jest.fn().mockResolvedValue(null);

      const result = await deletePersona(mockPersonaId, mockUserId);

      expect(result).toEqual({ deleted: false, wasActive: false });
      expect(mockLogger.debug).toHaveBeenCalledWith(
        `[PersonaService] Persona ${mockPersonaId} not found for user ${mockUserId} during delete`
      );
      expect(mockPersonaModel.deleteOne).not.toHaveBeenCalled();
    });

    it('should throw error for invalid personaId format', async () => {
      await expect(deletePersona('invalid-id', mockUserId)).rejects.toThrow(
        'Invalid persona ID format'
      );
    });

    it('should throw error for invalid userId format', async () => {
      await expect(deletePersona(mockPersonaId, 'invalid-id')).rejects.toThrow(
        'Invalid user ID format'
      );
    });

    it('should not delete persona belonging to different user', async () => {
      mockPersonaModel.findOne = jest.fn().mockResolvedValue(null);

      const differentUserId = new mongoose.Types.ObjectId().toString();
      const result = await deletePersona(mockPersonaId, differentUserId);

      expect(result).toEqual({ deleted: false, wasActive: false });
      expect(mockPersonaModel.deleteOne).not.toHaveBeenCalled();
    });

    it('should handle MongoDB findOne errors gracefully', async () => {
      const dbError = new Error('Database error');
      mockPersonaModel.findOne = jest.fn().mockRejectedValue(dbError);

      await expect(deletePersona(mockPersonaId, mockUserId)).rejects.toThrow('Database error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        `[PersonaService] Error deleting persona ${mockPersonaId} for user ${mockUserId}:`,
        dbError
      );
    });

    it('should handle MongoDB deleteOne errors gracefully', async () => {
      const dbError = new Error('Delete error');
      mockPersonaModel.findOne = jest.fn().mockResolvedValue(mockPersona);
      mockPersonaModel.deleteOne = jest.fn().mockRejectedValue(dbError);

      await expect(deletePersona(mockPersonaId, mockUserId)).rejects.toThrow('Delete error');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('deleteAllPersonasByUserId', () => {
    it('should delete all personas and reset user settings in transaction', async () => {
      mockPersonaModel.deleteMany = jest.fn().mockResolvedValue({ deletedCount: 3 });
      mockUserModel.findByIdAndUpdate = jest.fn().mockResolvedValue({});

      const result = await deleteAllPersonasByUserId(mockUserId);

      expect(result).toEqual({ deletedCount: 3 });
      expect(mockSession.startTransaction).toHaveBeenCalled();
      expect(mockPersonaModel.deleteMany).toHaveBeenCalledWith(
        { userId: expect.any(mongoose.Types.ObjectId) },
        { session: mockSession }
      );
      expect(mockUserModel.findByIdAndUpdate).toHaveBeenCalledWith(
        expect.any(mongoose.Types.ObjectId),
        { $set: { activePersonaId: null, isPersonaEnabled: false } },
        { session: mockSession, new: true }
      );
      expect(mockSession.commitTransaction).toHaveBeenCalled();
      expect(mockSession.endSession).toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        `[PersonaService] Deleted 3 personas for user ${mockUserId} and reset user's persona settings.`
      );
    });

    it('should return deletedCount when personas deleted', async () => {
      mockPersonaModel.deleteMany = jest.fn().mockResolvedValue({ deletedCount: 5 });
      mockUserModel.findByIdAndUpdate = jest.fn().mockResolvedValue({});

      const result = await deleteAllPersonasByUserId(mockUserId);

      expect(result.deletedCount).toBe(5);
    });

    it('should return deletedCount: 0 when no personas found', async () => {
      mockPersonaModel.deleteMany = jest.fn().mockResolvedValue({ deletedCount: 0 });

      const result = await deleteAllPersonasByUserId(mockUserId);

      expect(result).toEqual({ deletedCount: 0 });
      expect(mockUserModel.findByIdAndUpdate).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        `[PersonaService] No personas found to delete for user ${mockUserId}.`
      );
    });

    it('should throw error for invalid userId format', async () => {
      await expect(deleteAllPersonasByUserId('invalid-id')).rejects.toThrow(
        'Invalid user ID format'
      );
    });

    it('should commit transaction on success', async () => {
      mockPersonaModel.deleteMany = jest.fn().mockResolvedValue({ deletedCount: 2 });
      mockUserModel.findByIdAndUpdate = jest.fn().mockResolvedValue({});

      await deleteAllPersonasByUserId(mockUserId);

      expect(mockSession.commitTransaction).toHaveBeenCalled();
      expect(mockSession.abortTransaction).not.toHaveBeenCalled();
    });

    it('should abort transaction on error', async () => {
      const dbError = new Error('Database error');
      mockPersonaModel.deleteMany = jest.fn().mockRejectedValue(dbError);

      await expect(deleteAllPersonasByUserId(mockUserId)).rejects.toThrow('Database error');

      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(mockSession.commitTransaction).not.toHaveBeenCalled();
    });

    it('should end session in finally block', async () => {
      mockPersonaModel.deleteMany = jest.fn().mockResolvedValue({ deletedCount: 1 });
      mockUserModel.findByIdAndUpdate = jest.fn().mockResolvedValue({});

      await deleteAllPersonasByUserId(mockUserId);

      expect(mockSession.endSession).toHaveBeenCalled();
    });

    it('should end session in finally block even on error', async () => {
      mockPersonaModel.deleteMany = jest.fn().mockRejectedValue(new Error('Error'));

      await expect(deleteAllPersonasByUserId(mockUserId)).rejects.toThrow();

      expect(mockSession.endSession).toHaveBeenCalled();
    });

    it('should update User activePersonaId to null when personas deleted', async () => {
      mockPersonaModel.deleteMany = jest.fn().mockResolvedValue({ deletedCount: 2 });
      mockUserModel.findByIdAndUpdate = jest.fn().mockResolvedValue({});

      await deleteAllPersonasByUserId(mockUserId);

      expect(mockUserModel.findByIdAndUpdate).toHaveBeenCalledWith(
        expect.any(mongoose.Types.ObjectId),
        { $set: { activePersonaId: null, isPersonaEnabled: false } },
        { session: mockSession, new: true }
      );
    });

    it('should update User isPersonaEnabled to false when personas deleted', async () => {
      mockPersonaModel.deleteMany = jest.fn().mockResolvedValue({ deletedCount: 1 });
      mockUserModel.findByIdAndUpdate = jest.fn().mockResolvedValue({});

      await deleteAllPersonasByUserId(mockUserId);

      expect(mockUserModel.findByIdAndUpdate).toHaveBeenCalledWith(
        expect.any(mongoose.Types.ObjectId),
        expect.objectContaining({
          $set: expect.objectContaining({
            isPersonaEnabled: false,
          }),
        }),
        expect.any(Object)
      );
    });

    it('should not update User when no personas to delete', async () => {
      mockPersonaModel.deleteMany = jest.fn().mockResolvedValue({ deletedCount: 0 });

      await deleteAllPersonasByUserId(mockUserId);

      expect(mockUserModel.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('should handle MongoDB deleteMany errors gracefully', async () => {
      const dbError = new Error('Delete error');
      mockPersonaModel.deleteMany = jest.fn().mockRejectedValue(dbError);

      await expect(deleteAllPersonasByUserId(mockUserId)).rejects.toThrow('Delete error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        `[PersonaService] Error deleting all personas for user ${mockUserId}:`,
        dbError
      );
    });

    it('should handle User update errors and abort transaction', async () => {
      const updateError = new Error('Update error');
      mockPersonaModel.deleteMany = jest.fn().mockResolvedValue({ deletedCount: 2 });
      mockUserModel.findByIdAndUpdate = jest.fn().mockRejectedValue(updateError);

      await expect(deleteAllPersonasByUserId(mockUserId)).rejects.toThrow('Update error');

      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(mockSession.commitTransaction).not.toHaveBeenCalled();
    });
  });

  describe('activatePersona', () => {
    it('should activate persona and deactivate others in transaction', async () => {
      const personaToActivate = { ...mockPersona };
      mockPersonaModel.findOne = jest.fn().mockResolvedValue(personaToActivate);
      mockPersonaModel.updateMany = jest.fn().mockResolvedValue({});
      mockPersonaModel.findByIdAndUpdate = jest.fn().mockResolvedValue({});
      mockUserModel.findByIdAndUpdate = jest.fn().mockResolvedValue({});

      const activatedPersona = { ...mockPersona, isActive: true };
      const mockChain = {
        lean: jest.fn().mockResolvedValue(activatedPersona),
      };
      mockPersonaModel.findById = jest.fn().mockReturnValue(mockChain);

      const result = await activatePersona(mockUserId, mockPersonaId);

      expect(result).toEqual(activatedPersona);
      expect(mockSession.withTransaction).toHaveBeenCalled();
      expect(mockSession.endSession).toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        `[PersonaService] Activated persona "${personaToActivate.name}" for user ${mockUserId}`
      );
    });

    it('should update User.activePersonaId', async () => {
      mockPersonaModel.findOne = jest.fn().mockResolvedValue(mockPersona);
      mockPersonaModel.updateMany = jest.fn().mockResolvedValue({});
      mockPersonaModel.findByIdAndUpdate = jest.fn().mockResolvedValue({});
      mockUserModel.findByIdAndUpdate = jest.fn().mockResolvedValue({});

      const mockChain = {
        lean: jest.fn().mockResolvedValue(mockPersona),
      };
      mockPersonaModel.findById = jest.fn().mockReturnValue(mockChain);

      await activatePersona(mockUserId, mockPersonaId);

      expect(mockUserModel.findByIdAndUpdate).toHaveBeenCalledWith(
        expect.any(mongoose.Types.ObjectId),
        { activePersonaId: expect.any(mongoose.Types.ObjectId) },
        { session: mockSession }
      );
    });

    it('should return activated persona', async () => {
      const activatedPersona = { ...mockPersona, isActive: true };
      mockPersonaModel.findOne = jest.fn().mockResolvedValue(mockPersona);
      mockPersonaModel.updateMany = jest.fn().mockResolvedValue({});
      mockPersonaModel.findByIdAndUpdate = jest.fn().mockResolvedValue({});
      mockUserModel.findByIdAndUpdate = jest.fn().mockResolvedValue({});

      const mockChain = {
        lean: jest.fn().mockResolvedValue(activatedPersona),
      };
      mockPersonaModel.findById = jest.fn().mockReturnValue(mockChain);

      const result = await activatePersona(mockUserId, mockPersonaId);

      expect(result?.isActive).toBe(true);
    });

    it('should throw error for invalid userId format', async () => {
      await expect(activatePersona('invalid-id', mockPersonaId)).rejects.toThrow(
        'Invalid user ID format'
      );
    });

    it('should throw error for invalid personaId format', async () => {
      await expect(activatePersona(mockUserId, 'invalid-id')).rejects.toThrow(
        'Invalid persona ID format'
      );
    });

    it('should throw error when persona not found', async () => {
      mockPersonaModel.findOne = jest.fn().mockResolvedValue(null);

      await expect(activatePersona(mockUserId, mockPersonaId)).rejects.toThrow(
        'Persona not found or does not belong to user'
      );
    });

    it('should throw error when persona belongs to different user', async () => {
      mockPersonaModel.findOne = jest.fn().mockResolvedValue(null);

      const differentUserId = new mongoose.Types.ObjectId().toString();
      await expect(activatePersona(differentUserId, mockPersonaId)).rejects.toThrow(
        'Persona not found or does not belong to user'
      );
    });

    it('should deactivate all other personas for the user', async () => {
      mockPersonaModel.findOne = jest.fn().mockResolvedValue(mockPersona);
      mockPersonaModel.updateMany = jest.fn().mockResolvedValue({});
      mockPersonaModel.findByIdAndUpdate = jest.fn().mockResolvedValue({});
      mockUserModel.findByIdAndUpdate = jest.fn().mockResolvedValue({});

      const mockChain = {
        lean: jest.fn().mockResolvedValue(mockPersona),
      };
      mockPersonaModel.findById = jest.fn().mockReturnValue(mockChain);

      await activatePersona(mockUserId, mockPersonaId);

      expect(mockPersonaModel.updateMany).toHaveBeenCalledWith(
        { userId: expect.any(mongoose.Types.ObjectId) },
        { isActive: false },
        { session: mockSession }
      );
    });

    it('should end session in finally block', async () => {
      mockPersonaModel.findOne = jest.fn().mockResolvedValue(mockPersona);
      mockPersonaModel.updateMany = jest.fn().mockResolvedValue({});
      mockPersonaModel.findByIdAndUpdate = jest.fn().mockResolvedValue({});
      mockUserModel.findByIdAndUpdate = jest.fn().mockResolvedValue({});

      const mockChain = {
        lean: jest.fn().mockResolvedValue(mockPersona),
      };
      mockPersonaModel.findById = jest.fn().mockReturnValue(mockChain);

      await activatePersona(mockUserId, mockPersonaId);

      expect(mockSession.endSession).toHaveBeenCalled();
    });

    it('should handle transaction errors and throw', async () => {
      const txError = new Error('Transaction error');
      mockPersonaModel.findOne = jest.fn().mockResolvedValue(mockPersona);
      mockSession.withTransaction = jest.fn().mockRejectedValue(txError);

      await expect(activatePersona(mockUserId, mockPersonaId)).rejects.toThrow('Transaction error');

      expect(mockLogger.error).toHaveBeenCalledWith(
        `[PersonaService] Error activating persona ${mockPersonaId} for user ${mockUserId}:`,
        txError
      );
    });

    it('should end session in finally block even on error', async () => {
      mockPersonaModel.findOne = jest.fn().mockResolvedValue(mockPersona);
      mockSession.withTransaction = jest.fn().mockRejectedValue(new Error('Error'));

      await expect(activatePersona(mockUserId, mockPersonaId)).rejects.toThrow();

      expect(mockSession.endSession).toHaveBeenCalled();
    });
  });

  describe('deactivateCurrentPersona', () => {
    beforeEach(() => {
      // Reset withTransaction to default behavior for this describe block
      mockSession.withTransaction = jest.fn((callback) => callback());
      mockStartSession.mockResolvedValue(mockSession as any);
    });

    it('should deactivate all personas and clear User.activePersonaId', async () => {
      mockPersonaModel.updateMany = jest.fn().mockResolvedValue({});
      mockUserModel.findByIdAndUpdate = jest.fn().mockResolvedValue({});

      const result = await deactivateCurrentPersona(mockUserId);

      expect(result).toBe(true);
      expect(mockSession.withTransaction).toHaveBeenCalled();
      expect(mockPersonaModel.updateMany).toHaveBeenCalledWith(
        { userId: expect.any(mongoose.Types.ObjectId) },
        { isActive: false },
        { session: mockSession }
      );
      expect(mockUserModel.findByIdAndUpdate).toHaveBeenCalledWith(
        expect.any(mongoose.Types.ObjectId),
        { activePersonaId: null },
        { session: mockSession }
      );
      expect(mockSession.endSession).toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        `[PersonaService] Deactivated current persona for user ${mockUserId}`
      );
    });

    it('should return true on success', async () => {
      mockPersonaModel.updateMany = jest.fn().mockResolvedValue({});
      mockUserModel.findByIdAndUpdate = jest.fn().mockResolvedValue({});

      const result = await deactivateCurrentPersona(mockUserId);

      expect(result).toBe(true);
    });

    it('should throw error for invalid userId format', async () => {
      await expect(deactivateCurrentPersona('invalid-id')).rejects.toThrow(
        'Invalid user ID format'
      );
    });

    it('should update all personas to isActive: false', async () => {
      mockPersonaModel.updateMany = jest.fn().mockResolvedValue({});
      mockUserModel.findByIdAndUpdate = jest.fn().mockResolvedValue({});

      await deactivateCurrentPersona(mockUserId);

      expect(mockPersonaModel.updateMany).toHaveBeenCalledWith(
        { userId: expect.any(mongoose.Types.ObjectId) },
        { isActive: false },
        { session: mockSession }
      );
    });

    it('should update User.activePersonaId to null', async () => {
      mockPersonaModel.updateMany = jest.fn().mockResolvedValue({});
      mockUserModel.findByIdAndUpdate = jest.fn().mockResolvedValue({});

      await deactivateCurrentPersona(mockUserId);

      expect(mockUserModel.findByIdAndUpdate).toHaveBeenCalledWith(
        expect.any(mongoose.Types.ObjectId),
        { activePersonaId: null },
        { session: mockSession }
      );
    });

    it('should end session in finally block', async () => {
      mockPersonaModel.updateMany = jest.fn().mockResolvedValue({});
      mockUserModel.findByIdAndUpdate = jest.fn().mockResolvedValue({});

      await deactivateCurrentPersona(mockUserId);

      expect(mockSession.endSession).toHaveBeenCalled();
    });

    it('should handle transaction errors and throw', async () => {
      const txError = new Error('Transaction error');
      mockSession.withTransaction = jest.fn().mockRejectedValue(txError);

      await expect(deactivateCurrentPersona(mockUserId)).rejects.toThrow('Transaction error');

      expect(mockLogger.error).toHaveBeenCalledWith(
        `[PersonaService] Error deactivating current persona for user ${mockUserId}:`,
        txError
      );
    });

    it('should end session in finally block even on error', async () => {
      mockSession.withTransaction = jest.fn().mockRejectedValue(new Error('Error'));

      await expect(deactivateCurrentPersona(mockUserId)).rejects.toThrow();

      expect(mockSession.endSession).toHaveBeenCalled();
    });
  });

  describe('Mongoose Transaction Handling', () => {
    beforeEach(() => {
      // Reset withTransaction to default behavior for this describe block
      mockSession.withTransaction = jest.fn((callback) => callback());
      mockStartSession.mockResolvedValue(mockSession as any);
    });

    it('should properly handle session.withTransaction in activatePersona', async () => {
      mockPersonaModel.findOne = jest.fn().mockResolvedValue(mockPersona);
      mockPersonaModel.updateMany = jest.fn().mockResolvedValue({});
      mockPersonaModel.findByIdAndUpdate = jest.fn().mockResolvedValue({});
      mockUserModel.findByIdAndUpdate = jest.fn().mockResolvedValue({});

      const mockChain = {
        lean: jest.fn().mockResolvedValue(mockPersona),
      };
      mockPersonaModel.findById = jest.fn().mockReturnValue(mockChain);

      await activatePersona(mockUserId, mockPersonaId);

      expect(mockSession.withTransaction).toHaveBeenCalled();
      const transactionCallback = mockSession.withTransaction.mock.calls[0][0];
      expect(typeof transactionCallback).toBe('function');
    });

    it('should properly handle session.withTransaction in deactivateCurrentPersona', async () => {
      mockPersonaModel.updateMany = jest.fn().mockResolvedValue({});
      mockUserModel.findByIdAndUpdate = jest.fn().mockResolvedValue({});

      await deactivateCurrentPersona(mockUserId);

      expect(mockSession.withTransaction).toHaveBeenCalled();
      const transactionCallback = mockSession.withTransaction.mock.calls[0][0];
      expect(typeof transactionCallback).toBe('function');
    });

    it('should properly handle session.startTransaction in deleteAllPersonasByUserId', async () => {
      mockPersonaModel.deleteMany = jest.fn().mockResolvedValue({ deletedCount: 1 });
      mockUserModel.findByIdAndUpdate = jest.fn().mockResolvedValue({});

      await deleteAllPersonasByUserId(mockUserId);

      expect(mockSession.startTransaction).toHaveBeenCalled();
    });

    it('should call session.endSession in all transaction functions', async () => {
      // Test activatePersona
      mockPersonaModel.findOne = jest.fn().mockResolvedValue(mockPersona);
      mockPersonaModel.updateMany = jest.fn().mockResolvedValue({});
      mockPersonaModel.findByIdAndUpdate = jest.fn().mockResolvedValue({});
      mockUserModel.findByIdAndUpdate = jest.fn().mockResolvedValue({});

      const mockChain = {
        lean: jest.fn().mockResolvedValue(mockPersona),
      };
      mockPersonaModel.findById = jest.fn().mockReturnValue(mockChain);

      await activatePersona(mockUserId, mockPersonaId);
      expect(mockSession.endSession).toHaveBeenCalled();

      jest.clearAllMocks();
      mockSession.withTransaction = jest.fn((callback) => callback());
      mockStartSession.mockResolvedValue(mockSession as any);

      // Test deactivateCurrentPersona
      mockPersonaModel.updateMany = jest.fn().mockResolvedValue({});
      mockUserModel.findByIdAndUpdate = jest.fn().mockResolvedValue({});

      await deactivateCurrentPersona(mockUserId);
      expect(mockSession.endSession).toHaveBeenCalled();

      jest.clearAllMocks();
      mockSession.withTransaction = jest.fn((callback) => callback());
      mockStartSession.mockResolvedValue(mockSession as any);

      // Test deleteAllPersonasByUserId
      mockPersonaModel.deleteMany = jest.fn().mockResolvedValue({ deletedCount: 1 });
      mockUserModel.findByIdAndUpdate = jest.fn().mockResolvedValue({});

      await deleteAllPersonasByUserId(mockUserId);
      expect(mockSession.endSession).toHaveBeenCalled();
    });
  });
});
