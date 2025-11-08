/**
 * Utility for determining the correct Pinecone namespace based on environment and configuration
 */

import { getLogger } from './logger';

const log = getLogger('pineconeNamespace');

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
 */
export function getSystemKbNamespace(): string {
  return getPineconeNamespace(undefined, 'system');
}

/**
 * Gets the namespace for user document queries
 * @param userId - The user ID to create namespace for
 */
export function getUserNamespace(userId: string): string {
  // For production, user docs might also be in default namespace with metadata filtering
  if (process.env.PINECONE_INDEX_NAME === 'gkchatty-prod') {
    return '';
  }
  return `user-${userId}`;
}
