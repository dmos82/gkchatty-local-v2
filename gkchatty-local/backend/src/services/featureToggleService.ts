import { Types } from 'mongoose';
import FeatureToggle, { IFeatureToggle, FeatureName, DEFAULT_FEATURE_CONFIG } from '../models/FeatureToggleModel';
import { getLogger } from '../utils/logger';

const log = getLogger('featureToggleService');

// In-memory cache for feature toggles (reduces DB calls)
const featureCache: Map<FeatureName, { enabled: boolean; config: Record<string, unknown>; cachedAt: number }> = new Map();
const CACHE_TTL_MS = 60000; // 1 minute cache

/**
 * Initialize default feature toggles if they don't exist
 */
export async function initializeFeatureToggles(adminUserId: Types.ObjectId): Promise<void> {
  const features = Object.keys(DEFAULT_FEATURE_CONFIG) as FeatureName[];

  for (const feature of features) {
    const existing = await FeatureToggle.findOne({ feature });
    if (!existing) {
      const defaults = DEFAULT_FEATURE_CONFIG[feature];
      await FeatureToggle.create({
        feature,
        enabled: defaults.enabled,
        config: defaults.config,
        description: defaults.description,
        updatedBy: adminUserId,
      });
      log.info({ feature, enabled: defaults.enabled }, 'Initialized feature toggle');
    }
  }
}

/**
 * Check if a feature is enabled
 */
export async function isFeatureEnabled(feature: FeatureName): Promise<boolean> {
  // Check cache first
  const cached = featureCache.get(feature);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.enabled;
  }

  try {
    const toggle = await FeatureToggle.findOne({ feature }).lean();

    if (!toggle) {
      // Use default if not found in DB
      const defaults = DEFAULT_FEATURE_CONFIG[feature];
      if (defaults) {
        featureCache.set(feature, {
          enabled: defaults.enabled,
          config: defaults.config,
          cachedAt: Date.now(),
        });
        return defaults.enabled;
      }
      return false;
    }

    // Update cache
    featureCache.set(feature, {
      enabled: toggle.enabled,
      config: toggle.config as Record<string, unknown>,
      cachedAt: Date.now(),
    });

    return toggle.enabled;
  } catch (error) {
    log.error({ error, feature }, 'Error checking feature toggle');
    // Default to false on error for safety
    return false;
  }
}

/**
 * Get feature configuration
 */
export async function getFeatureConfig(feature: FeatureName): Promise<Record<string, unknown> | null> {
  // Check cache first
  const cached = featureCache.get(feature);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.config;
  }

  try {
    const toggle = await FeatureToggle.findOne({ feature }).lean();

    if (!toggle) {
      const defaults = DEFAULT_FEATURE_CONFIG[feature];
      return defaults?.config || null;
    }

    // Update cache
    featureCache.set(feature, {
      enabled: toggle.enabled,
      config: toggle.config as Record<string, unknown>,
      cachedAt: Date.now(),
    });

    return toggle.config as Record<string, unknown>;
  } catch (error) {
    log.error({ error, feature }, 'Error getting feature config');
    return null;
  }
}

/**
 * Set feature toggle state
 */
export async function setFeatureToggle(
  feature: FeatureName,
  enabled: boolean,
  updatedBy: Types.ObjectId,
  config?: Record<string, unknown>
): Promise<IFeatureToggle | null> {
  try {
    const updateData: Record<string, unknown> = {
      enabled,
      updatedBy,
      updatedAt: new Date(),
    };

    if (config !== undefined) {
      updateData.config = config;
    }

    const toggle = await FeatureToggle.findOneAndUpdate(
      { feature },
      { $set: updateData },
      { new: true, upsert: true }
    );

    // Invalidate cache
    featureCache.delete(feature);

    log.info({ feature, enabled, updatedBy }, 'Feature toggle updated');
    return toggle;
  } catch (error) {
    log.error({ error, feature }, 'Error setting feature toggle');
    return null;
  }
}

/**
 * Get all feature toggles
 */
export async function getAllFeatureToggles(): Promise<IFeatureToggle[]> {
  try {
    const toggles = await FeatureToggle.find({}).lean();

    // Merge with defaults for any missing features
    const features = Object.keys(DEFAULT_FEATURE_CONFIG) as FeatureName[];
    const existingFeatures = new Set(toggles.map((t) => t.feature));

    const result: IFeatureToggle[] = [...(toggles as IFeatureToggle[])];

    for (const feature of features) {
      if (!existingFeatures.has(feature)) {
        const defaults = DEFAULT_FEATURE_CONFIG[feature];
        result.push({
          feature,
          enabled: defaults.enabled,
          config: defaults.config,
          description: defaults.description,
        } as IFeatureToggle);
      }
    }

    return result;
  } catch (error) {
    log.error({ error }, 'Error getting all feature toggles');
    return [];
  }
}

/**
 * Clear the feature cache (useful after bulk updates)
 */
export function clearFeatureCache(): void {
  featureCache.clear();
  log.debug('Feature toggle cache cleared');
}

/**
 * Check multiple features at once (more efficient than individual calls)
 */
export async function areFeaturesEnabled(features: FeatureName[]): Promise<Record<FeatureName, boolean>> {
  const result: Partial<Record<FeatureName, boolean>> = {};
  const uncached: FeatureName[] = [];

  // Check cache first
  for (const feature of features) {
    const cached = featureCache.get(feature);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      result[feature] = cached.enabled;
    } else {
      uncached.push(feature);
    }
  }

  // Fetch uncached features from DB
  if (uncached.length > 0) {
    const toggles = await FeatureToggle.find({ feature: { $in: uncached } }).lean();
    const toggleMap = new Map(toggles.map((t) => [t.feature, t]));

    for (const feature of uncached) {
      const toggle = toggleMap.get(feature);
      if (toggle) {
        result[feature] = toggle.enabled;
        featureCache.set(feature, {
          enabled: toggle.enabled,
          config: toggle.config as Record<string, unknown>,
          cachedAt: Date.now(),
        });
      } else {
        const defaults = DEFAULT_FEATURE_CONFIG[feature];
        result[feature] = defaults?.enabled || false;
      }
    }
  }

  return result as Record<FeatureName, boolean>;
}
