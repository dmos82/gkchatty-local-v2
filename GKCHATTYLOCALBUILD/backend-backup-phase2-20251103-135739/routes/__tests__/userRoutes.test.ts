import request from 'supertest';
import { Express } from 'express';
import path from 'path';
import { setupTestApp } from '../../test-utils/testSetup';
import UserSettings from '../../models/UserSettings';
import * as s3Helper from '../../utils/s3Helper';
import userRoutes from '../userRoutes';
import mongoose from 'mongoose';

// We'll define a mutable variable to hold the current mock user so that the mocked
// middleware can attach it to each request. The variable will be assigned inside
// each test's setup phase (beforeEach).
let currentMockUser: any;

// Mock the auth middleware **before** the routes are imported so that the route
// definitions capture these mocked implementations rather than the real ones.
jest.mock('../../middleware/authMiddleware', () => ({
  protect: (req: any, _res: any, next: any) => {
    // Attach whatever user the test has configured.
    req.user = currentMockUser;
    req.reqId = 'test-request-id';
    next();
  },
  checkSession: (_req: any, _res: any, next: any) => next(),
}));

// Mock UserModel to stub findById used for persona flag lookups
jest.mock('../../models/UserModel', () => {
  const mockFindByIdResult = {
    select: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue({
      isPersonaEnabled: true,
      canCustomizePersona: true,
    }),
    then: (resolve: any) =>
      resolve({
        isPersonaEnabled: true,
        canCustomizePersona: true,
      }),
  };

  return {
    __esModule: true,
    default: {
      findById: jest.fn(() => mockFindByIdResult),
    },
  };
});

// Mock dependencies
jest.mock('../../utils/s3Helper');
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  promises: {
    readFile: jest.fn().mockResolvedValue(Buffer.from('mock-file-content')),
  },
}));

describe('User Settings Routes', () => {
  let app: Express;
  let mockUser: any;
  let mockUserSettings: any;

  beforeAll(() => {
    app = setupTestApp();
    app.use('/api/user', userRoutes);
    app.use('/api/users', userRoutes);
  });

  beforeEach(() => {
    // Mock user for auth
    const generatedId = new mongoose.Types.ObjectId();
    mockUser = {
      _id: generatedId,
      id: generatedId.toString(),
      username: 'testuser',
      role: 'admin',
      canCustomizePersona: true,
    };

    // Mock user settings
    mockUserSettings = {
      userId: mockUser._id,
      customPrompt: 'Existing custom prompt for testing',
      iconUrl: '/existing-icon-url.png',
    };

    // Reset and setup mocks
    jest.clearAllMocks();

    // Mock UserSettings.findOne and findOneAndUpdate
    jest.spyOn(UserSettings, 'findOne').mockResolvedValue({
      ...mockUserSettings,
      toObject: () => ({ ...mockUserSettings }),
    });

    jest.spyOn(UserSettings, 'findOneAndUpdate').mockResolvedValue({
      ...mockUserSettings,
      createdAt: new Date(),
      updatedAt: new Date(),
      toObject: () => ({ ...mockUserSettings }),
    });

    // Mock S3 saveFile function
    (s3Helper.saveFile as jest.Mock).mockResolvedValue('https://example.com/mock-s3-url.png');

    // Assign the current mock user
    currentMockUser = mockUser;
  });

  describe('GET /api/user/settings', () => {
    test('should return user settings for authenticated user', async () => {
      const response = await request(app).get('/api/user/settings');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.settings).toMatchObject({
        userId: mockUser._id.toString(),
        customPrompt: mockUserSettings.customPrompt,
        iconUrl: mockUserSettings.iconUrl,
      });
    });

    test('should return default settings if none exist for the user', async () => {
      // Override UserSettings.findOne mock to return null
      (UserSettings.findOne as jest.Mock).mockResolvedValueOnce(null);

      const response = await request(app).get('/api/user/settings');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.settings).toMatchObject({
        userId: mockUser._id.toString(),
        customPrompt: null,
        iconUrl: null,
      });
    });
  });

  describe('PUT /api/users/me/settings', () => {
    test('should update customPrompt successfully', async () => {
      const newPrompt = 'New custom prompt for user docs';

      const response = await request(app)
        .put('/api/users/me/settings')
        .send({ customPrompt: newPrompt });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Your settings were updated successfully');
      expect(UserSettings.findOneAndUpdate).toHaveBeenCalledWith(
        { userId: mockUser._id },
        { $set: { customPrompt: newPrompt } },
        expect.any(Object)
      );
    });

    test('should set customPrompt to null', async () => {
      const response = await request(app)
        .put('/api/users/me/settings')
        .send({ customPrompt: null });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(UserSettings.findOneAndUpdate).toHaveBeenCalledWith(
        { userId: mockUser._id },
        { $set: { customPrompt: null } },
        expect.any(Object)
      );
    });

    test.skip('should reject invalid customPrompt type', async () => {
      const response = await request(app).put('/api/users/me/settings').send({ customPrompt: 123 }); // Number instead of string

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('must be a string or null');
    });
  });

  describe('POST /api/users/me/icon', () => {
    test('should upload and set icon URL when S3 is enabled', async () => {
      // Mock environment variables
      process.env.S3_ENABLED = 'true';

      // Create test file
      const testFilePath = path.join(__dirname, 'test-icon.png');

      const response = await request(app).post('/api/users/me/icon').attach('icon', testFilePath);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Your icon was uploaded and set successfully');
      expect(s3Helper.saveFile).toHaveBeenCalled();
      expect(UserSettings.findOneAndUpdate).toHaveBeenCalledWith(
        { userId: mockUser._id },
        { $set: { iconUrl: expect.any(String) } },
        expect.any(Object)
      );
    });

    test.skip('should handle error when no file is uploaded', async () => {
      const response = await request(app).post('/api/users/me/icon').send({}); // No file attached

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Please upload an image file');
    });
  });
});
