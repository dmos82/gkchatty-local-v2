// Global Jest setup handles MongoDB; local hooks removed.
// Unmock settingsService for this unit test since we need to test the real implementation
jest.unmock('../settingsService');

import * as settingsService from '../settingsService';
import Setting from '../../models/SettingModel';

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'b'.repeat(64);

// Helper constant
const TEST_MODEL = settingsService.ALLOWED_OPENAI_MODELS[0];

describe('settingsService unit tests', () => {
  // DB connection & cleanup handled globally.

  it('getOpenAIConfig returns nulls when DB empty', async () => {
    const cfg = await settingsService.getOpenAIConfig();
    expect(cfg.modelId).toBeNull();
    expect(cfg.apiKey).toBeNull();
  });

  it('updateOpenAIConfig with model only stores model', async () => {
    const res = await settingsService.updateOpenAIConfig({ modelId: TEST_MODEL });
    expect(res.success).toBe(true);

    const modelSetting = await Setting.findOne({ key: 'activeOpenAIModelId' });
    expect(modelSetting).not.toBeNull();
    expect(modelSetting?.value).toBe(TEST_MODEL);
  });

  it('updateOpenAIConfig rejects invalid model', async () => {
    const res = await settingsService.updateOpenAIConfig({ modelId: 'not-a-real-model' });
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/Invalid modelId/);
  });

  it('updateOpenAIConfig stores and decrypts API key', async () => {
    const testKey = 'sk-unit-test-123';
    const res = await settingsService.updateOpenAIConfig({ apiKey: testKey });
    expect(res.success).toBe(true);

    const cfg = await settingsService.getOpenAIConfig();
    expect(cfg.apiKey).toBe(testKey);
  });

  it('revertToDefaultOpenAIApiKey removes stored key', async () => {
    await settingsService.updateOpenAIConfig({ apiKey: 'sk-temp' });
    let cfg = await settingsService.getOpenAIConfig();
    expect(cfg.apiKey).not.toBeNull();

    const res = await settingsService.revertToDefaultOpenAIApiKey();
    expect(res.success).toBe(true);

    cfg = await settingsService.getOpenAIConfig();
    expect(cfg.apiKey).toBeNull();
  });
});
