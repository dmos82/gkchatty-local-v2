import Setting from '../models/SettingModel'; // Corrected casing
import { encrypt, decrypt } from '../utils/cryptoUtils';
import { getLogger } from '../utils/logger';

const log = getLogger('settingsService');

const MODEL_ID_KEY = 'activeOpenAIModelId';
const API_KEY_KEY = 'encryptedOpenAIApiKey';

interface OpenAIConfig {
  modelId: string | null;
  apiKey: string | null; // This will be the decrypted key
}

// Predefined list of allowed OpenAI models for validation
// Tested and verified as of January 2025
// See: backend/src/scripts/test-model-availability.ts for testing script
export const ALLOWED_OPENAI_MODELS = [
  // GPT-5 Series (2025)
  'gpt-5-chat-latest', // Non-reasoning GPT-5 (ChatGPT default)
  // Note: gpt-5, gpt-5-mini, gpt-5-nano require max_completion_tokens (reasoning models)

  // GPT-4.1 Series (2025)
  'gpt-4.1', // GPT-4.1 - specialized for coding
  'gpt-4.1-mini', // GPT-4.1 mini - improved instruction-following

  // GPT-4o Series (2024-2025) - RECOMMENDED
  'gpt-4o', // GPT-4 Omni - multimodal flagship
  'gpt-4o-mini', // GPT-4o mini - cost-effective version (BEST FOR MOST QUERIES)
  'gpt-4o-2024-11-20', // Specific GPT-4o snapshot
  'gpt-4o-2024-08-06', // Previous GPT-4o snapshot
  'gpt-4o-mini-2024-07-18', // Specific GPT-4o-mini snapshot

  // GPT-4 Turbo Models (Legacy)
  'gpt-4-turbo', // GPT-4 Turbo
  'gpt-4-turbo-2024-04-09', // Specific turbo snapshot

  // O-Series Reasoning Models - REMOVED
  // These models require max_completion_tokens instead of max_tokens
  // and are not compatible with current implementation
  // 'o3', 'o3-mini', 'o3-pro', 'o4-mini'

  // GPT-3.5 Models (Legacy support)
  'gpt-3.5-turbo',
  'gpt-3.5-turbo-0125',
];

export async function getOpenAIConfig(): Promise<OpenAIConfig> {
  // Ensure mongoose connection is ready. In test environments, jest.resetModules may load a fresh mongoose instance
  // that is not connected yet. We defensively (re)connect here to avoid buffering timeouts.
  // This logic is effectively a no-op in production where a singleton connection is already established.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mongoose = require('mongoose');
  if (mongoose?.connection?.readyState !== 1) {
    const uri = process.env.MONGO_URI;
    if (uri) {
      await mongoose.connect(uri);
    }
  }

  log.debug('[SettingsService] Attempting to fetch OpenAI config for chat/general use.');
  try {
    const modelIdSetting = await Setting.findOne({ key: MODEL_ID_KEY });
    const apiKeySetting = await Setting.findOne({ key: API_KEY_KEY });

    const modelId = modelIdSetting ? modelIdSetting.value : null;
    log.debug(`[SettingsService] ActiveOpenAIModelId from DB: ${modelId}`);
    let apiKey = null;
    /* eslint-disable @typescript-eslint/no-unused-vars */
    let _apiKeySource = 'None';

    if (apiKeySetting && apiKeySetting.value) {
      log.debug('[SettingsService] Found encryptedOpenAIApiKey in DB: true');
      const decryptedKey = decrypt(apiKeySetting.value);
      if (decryptedKey && decryptedKey.trim() !== '') {
        apiKey = decryptedKey;
        _apiKeySource = 'Database (decrypted)';
        log.debug('[SettingsService] Successfully decrypted API key from DB for chat/general use.');
      } else {
        if (decryptedKey?.trim() === '') {
          log.debug(
            '[SettingsService] Decrypted OpenAI API key from DB is empty. Will rely on ENV fallback.'
          );
        } else {
          log.warn(
            '[SettingsService] Failed to decrypt OpenAI API key from DB. Key may be corrupted or incorrect ENCRYPTION_KEY.'
          );
        }
        // Fallback will be handled by openaiHelper if apiKey remains null
        _apiKeySource = 'Database (decryption failed)';
      }
    } else {
      log.debug('[SettingsService] Found encryptedOpenAIApiKey in DB: false');
      // Fallback will be handled by openaiHelper
    }

    // This log will be refined in openaiHelper once fallback to ENV is applied
    // log.debug(`[SettingsService] Effective API Key for chat (Source: ${apiKeySource}, Masked: ${maskApiKey(apiKey)})`);

    return { modelId, apiKey }; // apiKey here is the decrypted one from DB, or null
  } catch (error) {
    log.error('[SettingsService] Error fetching OpenAI config:', error);
    return { modelId: null, apiKey: null };
  }
}

// Helper to mask API key for logging
export function maskApiKey(apiKey: string | null | undefined): string {
  if (!apiKey || apiKey.length < 8) return 'Invalid or too short';
  return `${apiKey.substring(0, 5)}...${apiKey.substring(apiKey.length - 4)}`;
}

interface UpdateConfigOptions {
  modelId?: string;
  apiKey?: string;
}

export async function updateOpenAIConfig(
  options: UpdateConfigOptions
): Promise<{ success: boolean; message?: string }> {
  try {
    if (options.modelId) {
      if (!ALLOWED_OPENAI_MODELS.includes(options.modelId)) {
        return {
          success: false,
          message: `Invalid modelId: ${options.modelId}. Not in allowed list.`,
        };
      }
      await Setting.findOneAndUpdate(
        { key: MODEL_ID_KEY },
        { value: options.modelId },
        { upsert: true, new: true }
      );
      log.debug(`[SettingsService] Updated activeOpenAIModelId to: ${options.modelId}`);
    }

    /*
     * We must differentiate between three cases for `apiKey` in the options object:
     *  1. `apiKey` is **undefined**   → the caller did not intend to update the key – no-op.
     *  2. `apiKey` is an empty string → explicit request to **clear** the stored key and revert to ENV fallback.
     *  3. `apiKey` is a non-empty     → store the provided key (after encryption).
     */
    if (Object.prototype.hasOwnProperty.call(options, 'apiKey')) {
      const providedKey = options.apiKey ?? '';

      if (providedKey.trim() === '') {
        // Explicit clear request
        await Setting.findOneAndDelete({ key: API_KEY_KEY });
        log.debug('[SettingsService] Cleared encryptedOpenAIApiKey (explicit clear request).');
      } else {
        const encryptedKey = encrypt(providedKey);
        await Setting.findOneAndUpdate(
          { key: API_KEY_KEY },
          { value: encryptedKey },
          { upsert: true, new: true }
        );
        log.debug('[SettingsService] Updated and encrypted new openAIApiKey.');
      }
    }
    return { success: true };
  } catch (error: any) {
    log.error('[SettingsService] Error updating OpenAI config:', error);
    return { success: false, message: error.message || 'Failed to update OpenAI config.' };
  }
}

export async function revertToDefaultOpenAIApiKey(): Promise<{
  success: boolean;
  message?: string;
}> {
  try {
    const result = await Setting.deleteOne({ key: API_KEY_KEY });
    if (result.deletedCount && result.deletedCount > 0) {
      log.debug(
        '[SettingsService] Successfully reverted to default OpenAI API Key (removed custom key from DB).'
      );
      return {
        success: true,
        message:
          'Custom OpenAI API Key removed. System will now use default (ENV) key if available.',
      };
    } else {
      log.debug('[SettingsService] No custom OpenAI API Key was set in the database to revert.');
      return {
        success: true,
        message:
          'No custom OpenAI API Key was set. System already uses default (ENV) key if available.',
      }; // Still a success, just nothing to remove
    }
  } catch (error: any) {
    log.error('[SettingsService] Error reverting to default OpenAI API Key:', error);
    return { success: false, message: error.message || 'Failed to revert OpenAI API Key.' };
  }
}
