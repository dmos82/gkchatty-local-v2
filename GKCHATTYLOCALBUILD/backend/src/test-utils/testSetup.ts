// Ensure critical env defaults before any modules import cryptoUtils
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'f'.repeat(64);
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_default_1234567890abcdef';
process.env.LOCAL_FILE_STORAGE_DIR = process.env.LOCAL_FILE_STORAGE_DIR || './test-uploads';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test_openai_api_key_default';

import mongoose from 'mongoose';
import type { Express } from 'express';
// Use default import pattern for express
import express from 'express';
import cookieParser from 'cookie-parser';

// Factory to create a clean Express app for each test suite
export const setupTestApp = (): Express => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  return app;
};

// Global beforeEach hook for complete test isolation
beforeEach(async () => {
  // Ensure all collections are cleaned before each test
  if (mongoose.connection.readyState === 1) {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      const collection = collections[key];
      await collection.deleteMany({}); // Deletes all documents in the collection
    }
  }
});

beforeAll(async () => {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI not set by Jest globalSetup');
  }

  // Ensure clean connection state
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  await mongoose.connect(process.env.MONGO_URI);
}, 30000);

afterAll(async () => {
  // Ensure clean disconnection
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
});

afterEach(async () => {
  // Additional cleanup for safety (this is now redundant with beforeEach but kept for robustness)
  if (mongoose.connection.readyState === 1) {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
  }
});

// Mock settingsService to prevent additional mongoose connections
jest.mock('../services/settingsService', () => ({
  getOpenAIConfig: jest.fn().mockResolvedValue({
    modelId: 'gpt-4o-mini',
    apiKey: 'test_openai_api_key_default',
  }),
  updateOpenAIConfig: jest.fn().mockResolvedValue({ success: true }),
  revertToDefaultOpenAIApiKey: jest.fn().mockResolvedValue({ success: true }),
  ALLOWED_OPENAI_MODELS: ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo'],
  maskApiKey: jest
    .fn()
    .mockImplementation(key =>
      key ? `${key.substring(0, 5)}...${key.substring(key.length - 4)}` : 'Invalid'
    ),
}));

// Mock pino globally for all tests with stdTimeFunctions isoTime support
// eslint-disable-next-line @typescript-eslint/no-var-requires
jest.mock('pino', () => {
  // Return a factory function that creates a simple mock logger
  const loggerMethods = ['info', 'warn', 'error', 'debug', 'fatal', 'trace', 'child', 'silent'];
  const mockLogger: Record<string, jest.Mock> = {} as any;
  loggerMethods.forEach(method => {
    mockLogger[method] = jest.fn().mockReturnThis();
  });

  const factory = jest.fn(() => mockLogger);
  (factory as any).stdTimeFunctions = {
    isoTime: jest.fn(() => new Date().toISOString()),
  };

  return factory;
});
