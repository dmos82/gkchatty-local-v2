// Unmock settingsService for this test since we want to test the actual route logic with real model mocks
jest.unmock('../../services/settingsService');

import request from 'supertest';
import { Express } from 'express';
import { setupTestApp } from '../../test-utils/testSetup';
import UserSettings from '../../models/UserSettings';
import Setting from '../../models/SettingModel';
import User from '../../models/UserModel';
import { queryVectors } from '../../utils/pineconeService';
import { generateEmbeddings, getChatCompletion } from '../../utils/openaiHelper';
import mongoose from 'mongoose';
import chatRoutes from '../chatRoutes';

// Mock dependencies
jest.mock('../../utils/pineconeService');
jest.mock('../../utils/openaiHelper');
jest.mock('../../models/UserDocument');
jest.mock('../../models/SystemKbDocument');

// Define a consistent mock user for all tests in this suite
const mockUser = {
  _id: new mongoose.Types.ObjectId(),
  username: 'testuser',
  isPersonaEnabled: true,
} as any;

// Mock the entire auth middleware module BEFORE tests run
jest.mock('../../middleware/authMiddleware', () => ({
  protect: jest.fn((req, res, next) => {
    req.user = mockUser; // Attach the mock user to the request
    next();
  }),
  checkSession: jest.fn((req, res, next) => {
    next();
  }),
  // Ensure we export anything else the real module does, if necessary
  __esModule: true,
}));

let app: Express;
let mockUserSettings: any;
let mockSystemPrompt: any;
let mockUserDocsPrompt: any;

describe('Chat Routes - Targeted KB Queries', () => {
  beforeAll(() => {
    app = setupTestApp();
    app.use('/api/chats', chatRoutes);
  });

  beforeEach(() => {
    // Mock user for auth -- NO LONGER NEEDED HERE
    /*
    mockUser = {
      _id: new mongoose.Types.ObjectId(),
      username: 'testuser',
    };
    */

    // Mock user settings
    mockUserSettings = {
      userId: mockUser._id,
      customPrompt: 'Custom user prompt for testing',
      iconUrl: '/user-custom-icon.png',
    };

    // Mock system prompt
    mockSystemPrompt = {
      name: 'systemPrompt',
      value: 'Global system prompt for testing',
    };

    // Mock default user docs prompt
    mockUserDocsPrompt = {
      name: 'userDocsPrompt',
      value: 'Default user docs prompt for testing',
    };

    // Reset and setup mocks
    jest.clearAllMocks();

    // Mock authentication -- NO LONGER NEEDED, moved to top-level jest.mock
    /*
    jest
      .spyOn(require('../../middleware/authMiddleware'), 'protect')
      .mockImplementation((req, res, next) => {
        req.user = mockUser;
        next();
      });

    jest
      .spyOn(require('../../middleware/authMiddleware'), 'checkSession')
      .mockImplementation((req, res, next) => {
        next();
      });
    */

    // Mock UserSettings.findOne - default to returning mockUserSettings
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    jest.spyOn(UserSettings, 'findOne').mockImplementation(() => ({
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      select: jest.fn().mockReturnValue(mockUserSettings),
    }));

    // Mock Setting.findOne - default implementation
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - simplify mock return types for tests
    jest.spyOn(Setting, 'findOne').mockImplementation((query: any) => {
      if (query?.key === 'systemPrompt') {
        return Promise.resolve({ key: 'systemPrompt', value: mockSystemPrompt.value } as any);
      }
      if (query?.key === 'userDocsPrompt') {
        return Promise.resolve({ key: 'userDocsPrompt', value: mockUserDocsPrompt.value } as any);
      }
      return Promise.resolve(null as any);
    });

    // Mock User.findById and findByIdAndUpdate
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    jest.spyOn(User, 'findById').mockImplementation(() => ({
      select: jest.fn().mockReturnValue(mockUser),
    }));
    jest.spyOn(User, 'findByIdAndUpdate').mockResolvedValue(mockUser);

    // Mock vectorization and LLM responses
    (generateEmbeddings as jest.Mock).mockResolvedValue([[0.1, 0.2, 0.3]]);
    (queryVectors as jest.Mock).mockResolvedValue({
      matches: [
        {
          id: 'doc1',
          score: 0.8,
          metadata: {
            text: 'Sample document text',
            documentId: 'doc1',
            originalFileName: 'test.pdf',
            sourceType: 'user',
          },
        },
      ],
    });
    (getChatCompletion as jest.Mock).mockResolvedValue({
      choices: [{ message: { content: 'Test response' } }],
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    });
  });

  test('should reject invalid knowledgeBaseTarget values', async () => {
    const response = await request(app).post('/api/chats').send({
      query: 'test query',
      knowledgeBaseTarget: 'invalid',
    });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toContain('Invalid knowledgeBaseTarget value');
  });

  test('should use user custom prompt when knowledgeBaseTarget is "user"', async () => {
    const response = await request(app).post('/api/chats').send({
      query: 'test query',
      knowledgeBaseTarget: 'user',
    });

    expect(response.status).toBe(200);
    expect(getChatCompletion).toHaveBeenCalledTimes(1);

    // Verify first argument (messages array) contains the user's custom prompt
    const messagesArg = (getChatCompletion as jest.Mock).mock.calls[0][0];
    const systemMessage = messagesArg.find((msg: any) => msg.role === 'system');

    expect(systemMessage.content).toContain(mockSystemPrompt.value);
    expect(response.body.iconUrl).toBeNull();
    expect(response.body.knowledgeBaseTarget).toBe('user');
  });

  test('should use system prompt when knowledgeBaseTarget is "system"', async () => {
    // Override the queryVectors mock to return system KB results
    (queryVectors as jest.Mock).mockResolvedValueOnce({
      matches: [
        {
          id: 'system-doc1',
          score: 0.9,
          metadata: {
            text: 'System KB document text',
            documentId: 'system-doc1',
            originalFileName: 'system.pdf',
            sourceType: 'system',
          },
        },
      ],
    });

    const response = await request(app).post('/api/chats').send({
      query: 'test query',
      knowledgeBaseTarget: 'system',
    });

    expect(response.status).toBe(200);
    expect(getChatCompletion).toHaveBeenCalledTimes(1);

    // Verify first argument (messages array) contains the global system prompt
    const messagesArg = (getChatCompletion as jest.Mock).mock.calls[0][0];
    const systemMessage = messagesArg.find((msg: any) => msg.role === 'system');

    expect(systemMessage.content).toContain(mockSystemPrompt.value);
    expect(response.body.iconUrl).toBe('/system-kb-icon.png');
    expect(response.body.knowledgeBaseTarget).toBe('system');
  });

  test('should use global system prompt when knowledgeBaseTarget is "unified"', async () => {
    const response = await request(app).post('/api/chats').send({
      query: 'test query',
      knowledgeBaseTarget: 'unified',
    });

    expect(response.status).toBe(200);
    expect(getChatCompletion).toHaveBeenCalledTimes(1);

    // Verify first argument (messages array) contains the global system prompt
    const messagesArg = (getChatCompletion as jest.Mock).mock.calls[0][0];
    const systemMessage = messagesArg.find((msg: any) => msg.role === 'system');

    expect(systemMessage.content).toContain(mockSystemPrompt.value);
    expect(response.body.iconUrl).toBeNull();
    expect(response.body.knowledgeBaseTarget).toBe('unified');
  });

  test('should default to "unified" when knowledgeBaseTarget is not provided', async () => {
    const response = await request(app).post('/api/chats').send({
      query: 'test query',
      // knowledgeBaseTarget not provided
    });

    expect(response.status).toBe(200);
    expect(getChatCompletion).toHaveBeenCalledTimes(1);

    // Verify first argument (messages array) contains the global system prompt
    const messagesArg = (getChatCompletion as jest.Mock).mock.calls[0][0];
    const systemMessage = messagesArg.find((msg: any) => msg.role === 'system');

    expect(systemMessage.content).toContain(mockSystemPrompt.value);
    expect(response.body.knowledgeBaseTarget).toBe('unified');
  });

  test('should fall back to default userDocsPrompt when knowledgeBaseTarget is "user" but no custom settings exist', async () => {
    // Override UserSettings.findOne mock to return null for this test
    (UserSettings.findOne as jest.Mock).mockImplementationOnce(() => ({
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      select: jest.fn().mockReturnValue(null),
    }));

    const response = await request(app).post('/api/chats').send({
      query: 'test query',
      knowledgeBaseTarget: 'user',
    });

    expect(response.status).toBe(200);
    expect(getChatCompletion).toHaveBeenCalledTimes(1);

    // Verify first argument (messages array) contains the default user docs prompt
    const messagesArg = (getChatCompletion as jest.Mock).mock.calls[0][0];
    const systemMessage = messagesArg.find((msg: any) => msg.role === 'system');

    // Should fall back to system prompt
    expect(systemMessage.content).toContain(mockSystemPrompt.value);
    expect(response.body.iconUrl).toBeNull(); // No custom icon
    expect(response.body.knowledgeBaseTarget).toBe('user');
  });

  // Add more tests as needed for additional edge cases
});
