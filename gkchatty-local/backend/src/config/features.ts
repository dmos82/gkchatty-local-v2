/**
 * Feature Flags Configuration for GKChatty Local
 *
 * This module provides a centralized feature flag system for controlling
 * the rollout of new features. All flags default to disabled for safety.
 *
 * Phase 4 Features:
 * - Ollama Integration: Local model support
 * - Smart Routing: Intelligent model selection
 * - Model Transparency: Show which model answered
 *
 * Feature flags can be overridden in the database. Environment variables
 * are used as fallback defaults.
 *
 * Usage:
 * ```typescript
 * import { getFeatures } from './config/features';
 *
 * const features = await getFeatures();
 * if (features.ollama) {
 *   // Ollama-specific code
 * }
 * ```
 */

import Setting from '../models/SettingModel';

export interface FeatureFlags {
  /**
   * Enable Ollama local model integration
   * Allows users to select from locally available Ollama models
   * Requires Ollama running on localhost:11434 (or OLLAMA_BASE_URL)
   */
  ollama: boolean;

  /**
   * Enable smart model routing based on query complexity
   * Automatically selects best model for simple/medium/complex queries
   * Works with both Ollama and OpenAI models
   */
  smartRouting: boolean;

  /**
   * Show which model answered each message
   * Displays model badges in chat UI with model name
   * Can be enabled independently of other features
   */
  showModelUsed: boolean;

  /**
   * Allow general questions (non-RAG queries)
   * When enabled, model can answer general questions without document context
   * When disabled, model will only answer questions based on uploaded documents
   */
  allowGeneralQuestions: boolean;
}

const FEATURE_FLAGS_KEY = 'featureFlags';

/**
 * Load feature flags from environment variables (defaults)
 * All flags default to false for safety
 */
const getEnvDefaults = (): FeatureFlags => ({
  ollama: process.env.FEATURE_OLLAMA_MODELS === 'true',
  smartRouting: process.env.FEATURE_SMART_ROUTING === 'true',
  showModelUsed: process.env.FEATURE_SHOW_MODEL_USED === 'true',
  allowGeneralQuestions: process.env.FEATURE_ALLOW_GENERAL_QUESTIONS === 'true',
});

/**
 * Get feature flags from database or environment variables
 * Database overrides take precedence over environment variables
 */
export const getFeatures = async (): Promise<FeatureFlags> => {
  try {
    const setting = await Setting.findOne({ key: FEATURE_FLAGS_KEY });

    if (setting && setting.value) {
      try {
        const dbFeatures = JSON.parse(setting.value);
        // Merge with env defaults to ensure all flags exist
        return { ...getEnvDefaults(), ...dbFeatures };
      } catch (parseError) {
        console.error('[Features] Failed to parse feature flags from DB, using env defaults:', parseError);
      }
    }
  } catch (dbError) {
    console.error('[Features] Failed to fetch feature flags from DB, using env defaults:', dbError);
  }

  // Fallback to environment variables
  return getEnvDefaults();
};

/**
 * Update feature flags in database
 */
export const updateFeatures = async (updates: Partial<FeatureFlags>): Promise<FeatureFlags> => {
  const current = await getFeatures();
  const updated = { ...current, ...updates };

  await Setting.findOneAndUpdate(
    { key: FEATURE_FLAGS_KEY },
    { value: JSON.stringify(updated) },
    { upsert: true, new: true }
  );

  return updated;
};

/**
 * Legacy synchronous export for backward compatibility
 * WARNING: This uses environment variables only and doesn't check the database
 * Use getFeatures() instead for database-aware feature flags
 */
export const features: FeatureFlags = getEnvDefaults();

/**
 * Get feature flags safe for client exposure
 * Returns only client-relevant flags (no sensitive backend config)
 */
export async function getFeaturesForClient(): Promise<FeatureFlags> {
  const currentFeatures = await getFeatures();
  return {
    ollama: currentFeatures.ollama,
    smartRouting: currentFeatures.smartRouting,
    showModelUsed: currentFeatures.showModelUsed,
    allowGeneralQuestions: currentFeatures.allowGeneralQuestions,
  };
}

/**
 * Check if a specific feature is enabled
 * Useful for conditional logic and logging
 */
export async function isFeatureEnabled(featureName: keyof FeatureFlags): Promise<boolean> {
  const currentFeatures = await getFeatures();
  return currentFeatures[featureName] === true;
}

/**
 * Log feature flag status (useful for debugging)
 */
export async function logFeatureStatus(): Promise<void> {
  const currentFeatures = await getFeatures();
  console.log('🎛️  Feature Flags Status:');
  Object.entries(currentFeatures).forEach(([key, value]) => {
    const status = value ? '✅ ENABLED' : '❌ DISABLED';
    console.log(`   ${key}: ${status}`);
  });
}

// Log feature status on module load (development only)
if (process.env.NODE_ENV === 'development') {
  logFeatureStatus().catch(console.error);
}
