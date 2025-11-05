import express from 'express';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import { v4 as uuidv4 } from 'uuid';

import adminSettingsRoutes from '../../routes/adminSettingsRoutes';
import User from '../../models/UserModel';
import Setting from '../../models/SettingModel';

// Ensure test ENV vars
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_1234567890abcdef';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'a'.repeat(64); // 32-byte hex
process.env.OPENAI_API_KEY = 'env-test-key-123';
process.env.FALLBACK_OPENAI_CHAT_MODEL = 'gpt-3.5-turbo';

// Ensure we use real settingsService, not global mock
jest.unmock('../../services/settingsService');

const buildTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  // Mount routes under /api/admin/settings
  app.use('/api/admin/settings', adminSettingsRoutes);
  return app;
};

describe('Admin Settings Routes – OpenAI Config', () => {
  // Increase default timeout (MongoDB download can take several seconds on first run)
  jest.setTimeout(30000);
  const app = buildTestApp();
  let adminToken: string;

  beforeEach(async () => {
    const activeSessionId = uuidv4();

    // Clear settings collection for isolation
    await Setting.deleteMany({});

    const adminUser = await User.create({
      username: 'admin',
      email: 'admin@example.com',
      password: 'hashed',
      role: 'admin',
      activeSessionIds: [activeSessionId], // Fixed: Use plural array field name
    });

    adminToken = jwt.sign(
      {
        userId: adminUser._id.toString(),
        username: adminUser.username,
        role: 'admin',
        jti: activeSessionId,
      },
      process.env.JWT_SECRET as string,
      { expiresIn: '1h' }
    );
  });

  const authCookie = () => [`authToken=${adminToken}`];

  it('should return environment fallback when no DB key is set', async () => {
    const res = await request(app)
      .get('/api/admin/settings/openai-config')
      .set('Cookie', authCookie())
      .expect(200);

    expect(res.body.apiKeySource).toBe('environment_fallback');
    expect(res.body.isApiKeySetInDB).toBe(false);
    expect(res.body.activeOpenAIModelId).toBeDefined();
  });

  it('should store API key in DB and report database source', async () => {
    const payload = {
      modelId: 'gpt-4o-mini',
      apiKey: 'sk-test-db-123',
    };

    await request(app)
      .put('/api/admin/settings/openai-config')
      .set('Cookie', authCookie())
      .send(payload)
      .expect(200);

    // Verify via GET
    const getRes = await request(app)
      .get('/api/admin/settings/openai-config')
      .set('Cookie', authCookie())
      .expect(200);

    expect(getRes.body.apiKeySource).toBe('database');
    expect(getRes.body.isApiKeySetInDB).toBe(true);
    expect(getRes.body.activeOpenAIModelId).toBe('gpt-4o-mini');
  });

  it('should clear DB key when apiKey is empty string and fallback to env', async () => {
    // First set a key
    await Setting.create({ key: 'encryptedOpenAIApiKey', value: 'dummy' });

    const payload = {
      modelId: 'gpt-4o-mini',
      apiKey: '',
    };

    await request(app)
      .put('/api/admin/settings/openai-config')
      .set('Cookie', authCookie())
      .send(payload)
      .expect(200);

    const getRes = await request(app)
      .get('/api/admin/settings/openai-config')
      .set('Cookie', authCookie())
      .expect(200);

    expect(getRes.body.apiKeySource).toBe('environment_fallback');
    expect(getRes.body.isApiKeySetInDB).toBe(false);
  });
});
