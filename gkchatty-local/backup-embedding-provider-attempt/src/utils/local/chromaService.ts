import 'dotenv/config';
import path from 'path';
import os from 'os';
import { getLogger } from '../logger';
import { ChromaClient, Collection } from 'chromadb';

const log = getLogger('chromaService');

// Configuration
const STORAGE_MODE = process.env.GKCHATTY_STORAGE || 'local';
const GKCHATTY_HOME = process.env.GKCHATTY_HOME || path.join(os.homedir(), '.gkchatty');
const CHROMA_PATH = path.join(GKCHATTY_HOME, 'data', 'vectors');

let client: ChromaClient | null = null;
let collections: Map<string, Collection> = new Map();

/**
 * Initialize ChromaDB client
 */
export const initializeChroma = async () => {
  try {
    if (STORAGE_MODE !== 'local') {
      log.debug(`Storage mode is '${STORAGE_MODE}', skipping ChromaDB initialization`);
      return;
    }

    // Create ChromaDB client with persistent storage
    client = new ChromaClient({
      path: CHROMA_PATH
    });

    log.debug(`✅ ChromaDB initialized at: ${CHROMA_PATH}`);

    // List existing collections
    const existingCollections = await client.listCollections();
    log.debug(`Found ${existingCollections.length} existing collections`);

  } catch (err: any) {
    log.error('❌ ChromaDB initialization FAILED:', err);
    throw err;
  }
};

/**
 * Get or create a collection (similar to Pinecone namespace)
 */
export const getOrCreateCollection = async (
  name: string,
  metadata?: Record<string, any>
): Promise<Collection> => {
  if (!client) {
    await initializeChroma();
    if (!client) throw new Error('ChromaDB client not initialized');
  }

  // Check cache first
  if (collections.has(name)) {
    return collections.get(name)!;
  }

  try {
    // Try to get existing collection
    const collection = await client.getOrCreateCollection({
      name,
      metadata: metadata || { description: `Collection for ${name}` }
    });

    collections.set(name, collection);
    log.debug(`✅ Collection '${name}' ready`);

    return collection;
  } catch (err: any) {
    log.error(`❌ Failed to get/create collection '${name}':`, err);
    throw err;
  }
};

/**
 * Upsert vectors (similar to Pinecone upsert)
 */
export const upsertVectors = async (
  collectionName: string,
  vectors: {
    id: string;
    values: number[];
    metadata?: Record<string, any>;
  }[]
): Promise<void> => {
  const collection = await getOrCreateCollection(collectionName);

  try {
    // Prepare data for ChromaDB format
    const ids = vectors.map(v => v.id);
    const embeddings = vectors.map(v => v.values);
    const metadatas = vectors.map(v => v.metadata || {});

    // Add to collection
    await collection.add({
      ids,
      embeddings,
      metadatas
    });

    log.debug(`✅ Upserted ${vectors.length} vectors to collection '${collectionName}'`);
  } catch (err: any) {
    log.error(`❌ Failed to upsert vectors to '${collectionName}':`, err);
    throw err;
  }
};

/**
 * Query similar vectors (similar to Pinecone query)
 */
export const querySimilarVectors = async (
  collectionName: string,
  queryVector: number[],
  options: {
    topK?: number;
    filter?: Record<string, any>;
    includeMetadata?: boolean;
  } = {}
): Promise<{
  matches: Array<{
    id: string;
    score: number;
    metadata?: Record<string, any>;
  }>;
}> => {
  const collection = await getOrCreateCollection(collectionName);
  const { topK = 10, filter, includeMetadata = true } = options;

  try {
    const results = await collection.query({
      queryEmbeddings: [queryVector],
      nResults: topK,
      where: filter,
      include: includeMetadata ? ['metadatas', 'distances'] : ['distances']
    });

    // Convert ChromaDB results to Pinecone-like format
    const matches = results.ids[0].map((id, index) => ({
      id: id as string,
      score: 1 - (results.distances?.[0][index] || 0), // Convert distance to similarity score
      metadata: includeMetadata ? results.metadatas?.[0][index] : undefined
    }));

    return { matches };
  } catch (err: any) {
    log.error(`❌ Failed to query collection '${collectionName}':`, err);
    throw err;
  }
};

/**
 * Delete vectors by IDs
 */
export const deleteVectors = async (
  collectionName: string,
  ids: string[]
): Promise<void> => {
  const collection = await getOrCreateCollection(collectionName);

  try {
    await collection.delete({
      ids
    });

    log.debug(`✅ Deleted ${ids.length} vectors from collection '${collectionName}'`);
  } catch (err: any) {
    log.error(`❌ Failed to delete vectors from '${collectionName}':`, err);
    throw err;
  }
};

/**
 * Delete entire collection
 */
export const deleteCollection = async (name: string): Promise<void> => {
  if (!client) {
    throw new Error('ChromaDB client not initialized');
  }

  try {
    await client.deleteCollection({ name });
    collections.delete(name);
    log.debug(`✅ Deleted collection '${name}'`);
  } catch (err: any) {
    log.error(`❌ Failed to delete collection '${name}':`, err);
    throw err;
  }
};

/**
 * Get collection stats
 */
export const getCollectionStats = async (name: string): Promise<{
  vectorCount: number;
  metadata?: Record<string, any>;
}> => {
  const collection = await getOrCreateCollection(name);

  try {
    const count = await collection.count();

    return {
      vectorCount: count,
      metadata: collection.metadata
    };
  } catch (err: any) {
    log.error(`❌ Failed to get stats for collection '${name}':`, err);
    throw err;
  }
};

/**
 * List all collections
 */
export const listCollections = async (): Promise<string[]> => {
  if (!client) {
    await initializeChroma();
    if (!client) throw new Error('ChromaDB client not initialized');
  }

  try {
    const collections = await client.listCollections();
    return collections.map(c => c.name);
  } catch (err: any) {
    log.error('❌ Failed to list collections:', err);
    throw err;
  }
};

/**
 * Clear all data (useful for testing)
 */
export const clearAllData = async (): Promise<void> => {
  if (!client) {
    throw new Error('ChromaDB client not initialized');
  }

  try {
    const collectionNames = await listCollections();

    for (const name of collectionNames) {
      await deleteCollection(name);
    }

    log.debug('✅ Cleared all ChromaDB data');
  } catch (err: any) {
    log.error('❌ Failed to clear ChromaDB data:', err);
    throw err;
  }
};

/**
 * Disconnect (cleanup)
 */
export const disconnect = async (): Promise<void> => {
  try {
    // ChromaDB client doesn't need explicit disconnect
    // Just clear the references
    client = null;
    collections.clear();
    log.debug('🔌 ChromaDB disconnected');
  } catch (err) {
    log.error('❌ Error during ChromaDB disconnect:', err);
  }
};

// Export Pinecone-compatible interface
export default {
  initialize: initializeChroma,
  upsert: upsertVectors,
  query: querySimilarVectors,
  deleteVectors,
  deleteNamespace: deleteCollection,
  listNamespaces: listCollections,
  getStats: getCollectionStats,
  clearAll: clearAllData,
  disconnect
};