/**
 * Utility for determining the correct Pinecone namespace based on environment and configuration
 *
 * ENVIRONMENT ISOLATION:
 * Each environment (production, staging, localhost) uses prefixed namespaces to prevent data bleed.
 * Set GKCHATTY_ENV to: 'prod', 'staging', or 'local'
 */

import { getLogger } from './logger';

const log = getLogger('pineconeNamespace');

/**
 * Gets the environment prefix for namespace isolation
 * Prevents cross-environment data bleed between prod/staging/localhost
 */
function getEnvironmentPrefix(): string {
  const env = process.env.GKCHATTY_ENV || process.env.NODE_ENV || 'local';

  // Normalize environment names
  if (env === 'production') return 'prod';
  if (env === 'development') return 'local';

  return env; // 'prod', 'staging', 'local', or custom
}

/**
 * Determines the correct Pinecone namespace to use based on:
 * 1. Explicitly passed namespace
 * 2. PINECONE_NAMESPACE environment variable
 * 3. Index-specific defaults
 *
 * @param explicitNamespace - Namespace explicitly passed by caller
 * @param targetType - Type of content being queried ('system', 'tenant', 'user')
 * @returns The namespace to use for Pinecone operations
 */
export function getPineconeNamespace(
  explicitNamespace?: string,
  targetType?: 'system' | 'tenant' | 'user'
): string {
  const indexName = process.env.PINECONE_INDEX_NAME;
  const envNamespace = process.env.PINECONE_NAMESPACE;

  // 1. If explicit namespace is provided, use it
  if (explicitNamespace !== undefined) {
    log.debug({ explicitNamespace, indexName }, '[Namespace] Using explicitly provided namespace');
    return explicitNamespace;
  }

  // 2. Check environment variable (with special handling for _default_)
  if (envNamespace) {
    // If environment variable is set to "_default_", translate it to empty string for Pinecone API
    if (envNamespace === '_default_') {
      log.debug(
        { envNamespace, indexName },
        '[Namespace] Translating PINECONE_NAMESPACE=_default_ to empty string for Pinecone API'
      );
      return '';
    }
    log.debug({ envNamespace, indexName }, '[Namespace] Using PINECONE_NAMESPACE from environment');
    return envNamespace;
  }

  // 3. Index-specific defaults
  if (indexName === 'gkchatty-prod') {
    // Production index uses Pinecone's default namespace (represented as empty string)
    log.debug(
      { indexName, targetType },
      '[Namespace] Using default namespace (empty string) for gkchatty-prod index'
    );
    return '';
  }

  // 4. Legacy behavior for non-production indexes
  if (targetType === 'user') {
    // User documents use user-specific namespaces
    return ''; // Will be overridden by caller with user-${userId}
  }

  // Default to 'system-kb' for backward compatibility with staging/dev
  log.debug(
    { indexName, targetType },
    '[Namespace] Using system-kb namespace for non-production index'
  );
  return 'system-kb';
}

/**
 * Gets the namespace for system/tenant KB queries
 * Uses environment prefix for isolation between prod/staging/local
 */
export function getSystemKbNamespace(): string {
  const baseNamespace = getPineconeNamespace(undefined, 'system');
  const envPrefix = getEnvironmentPrefix();

  // For production index with default namespace, add environment prefix
  if (baseNamespace === '') {
    const namespace = `${envPrefix}-system-kb`;
    log.debug({ envPrefix, namespace }, '[Namespace] Using environment-prefixed system namespace');
    return namespace;
  }

  // For non-production, prefix the existing namespace
  const namespace = `${envPrefix}-${baseNamespace}`;
  log.debug({ envPrefix, baseNamespace, namespace }, '[Namespace] Using environment-prefixed system namespace');
  return namespace;
}

/**
 * Gets the namespace for user document queries
 * Uses environment prefix for isolation between prod/staging/local
 * @param userId - The user ID to create namespace for
 */
export function getUserNamespace(userId: string): string {
  const envPrefix = getEnvironmentPrefix();
  const namespace = `${envPrefix}-user-${userId}`;

  log.debug({ envPrefix, userId, namespace }, '[Namespace] Using environment-prefixed user namespace');
  return namespace;
}

/**
 * Gets the environment prefix (exported for use in cleanup scripts)
 */
export { getEnvironmentPrefix };
