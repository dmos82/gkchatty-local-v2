/**
 * GKChatty Local - ChromaDB Service
 *
 * Replaces Pinecone with local ChromaDB vector storage
 * Maintains same interface as pineconeService.ts for compatibility
 */

import { ChromaClient, Collection } from 'chromadb';
import * as path from 'path';
import { getLogger } from './logger';

const logger = getLogger('chromaService');

// ChromaDB client instance
let chromaClient: ChromaClient | null = null;
let collections: Map<string, Collection> = new Map();

interface VectorQueryResult {
  matches: Array<{
    id: string;
    score: number;
    metadata?: Record<string, any>;
  }>;
}

interface VectorUpsertParams {
  vectors: number[][];
  ids: string[];
  metadata?: Record<string, any>[];
}

/**
 * Initialize ChromaDB client
 *
 * Note: ChromaDB.js requires a server connection. For truly local storage,
 * we're using in-memory mode which doesn't require a server.
 * Vectors will be lost on restart unless persisted elsewhere.
 */
export async function initializeChroma(): Promise<void> {
  if (chromaClient) {
    return; // Already initialized
  }

  try {
    // Use in-memory ChromaDB (no server required)
    // This keeps vectors in memory but doesn't persist them to disk
    chromaClient = new ChromaClient();

    logger.info('✅ ChromaDB initialized in-memory mode');
    logger.warn('⚠️  Vectors are stored in-memory and will be lost on restart');
  } catch (error) {
    logger.error(error, 'Failed to initialize ChromaDB');
    throw new Error(`ChromaDB initialization failed: ${error.message}`);
  }
}

/**
 * Get or create a collection
 */
async function getCollection(
  collectionName: string,
  embeddingDimensions: number = 768
): Promise<Collection> {
  if (!chromaClient) {
    await initializeChroma();
  }

  // Check cache
  if (collections.has(collectionName)) {
    return collections.get(collectionName)!;
  }

  try {
    // Try to get existing collection
    let collection: Collection;

    try {
      collection = await chromaClient!.getCollection({
        name: collectionName
      });
      logger.debug(`Using existing collection: ${collectionName}`);
    } catch (error) {
      // Collection doesn't exist, create it
      collection = await chromaClient!.createCollection({
        name: collectionName,
        metadata: {
          'hnsw:space': 'cosine', // Use cosine similarity like Pinecone
          dimensions: embeddingDimensions
        }
      });
      logger.info(`Created new collection: ${collectionName}`);
    }

    // Cache it
    collections.set(collectionName, collection);
    return collection;
  } catch (error) {
    logger.error(error, `Failed to get/create collection: ${collectionName}`);
    throw new Error(`Collection error: ${error.message}`);
  }
}

/**
 * Query vectors (replaces Pinecone queryVectors)
 * Maintains same interface for compatibility with ragService.ts
 */
export async function queryVectors(
  embeddings: number[],
  options: {
    namespace?: string;
    topK?: number;
    filter?: Record<string, any>;
    includeMetadata?: boolean;
  } = {}
): Promise<VectorQueryResult> {
  const {
    namespace = 'default',
    topK = 10,
    filter = {},
    includeMetadata = true
  } = options;

  try {
    const collection = await getCollection(namespace);

    // Query ChromaDB
    const results = await collection.query({
      queryEmbeddings: [embeddings],
      nResults: topK,
      where: filter,
      include: includeMetadata ? ['metadatas', 'distances'] : ['distances']
    });

    // Convert ChromaDB results to Pinecone format
    const matches = results.ids[0].map((id, index) => ({
      id: id,
      score: 1 - (results.distances?.[0]?.[index] || 0), // Convert distance to similarity
      metadata: results.metadatas?.[0]?.[index] || {}
    }));

    logger.debug({
      namespace,
      topK,
      resultsCount: matches.length
    }, 'Vector query completed');

    return { matches };
  } catch (error) {
    logger.error(error, 'Vector query failed');
    throw new Error(`Vector query failed: ${error.message}`);
  }
}

/**
 * Upsert vectors (replaces Pinecone upsert)
 */
export async function upsertVectors(
  namespace: string,
  params: VectorUpsertParams
): Promise<void> {
  const { vectors, ids, metadata = [] } = params;

  if (vectors.length !== ids.length) {
    throw new Error('Vectors and IDs length mismatch');
  }

  try {
    const collection = await getCollection(namespace, vectors[0].length);

    // Upsert to ChromaDB
    await collection.upsert({
      ids: ids,
      embeddings: vectors,
      metadatas: metadata.length > 0 ? metadata : undefined
    });

    logger.info({
      namespace,
      count: vectors.length
    }, 'Vectors upserted successfully');
  } catch (error) {
    logger.error(error, 'Vector upsert failed');
    throw new Error(`Vector upsert failed: ${error.message}`);
  }
}

/**
 * Delete vectors by IDs
 */
export async function deleteVectors(
  namespace: string,
  ids: string[]
): Promise<void> {
  try {
    const collection = await getCollection(namespace);

    await collection.delete({
      ids: ids
    });

    logger.info({
      namespace,
      count: ids.length
    }, 'Vectors deleted successfully');
  } catch (error) {
    logger.error(error, 'Vector deletion failed');
    throw new Error(`Vector deletion failed: ${error.message}`);
  }
}

/**
 * Delete vectors by metadata filter (replaces Pinecone deleteVectorsByFilter)
 * ChromaDB requires getting IDs first, then deleting by IDs
 */
export async function deleteVectorsByFilter(
  filter: Record<string, any>,
  namespace: string = 'default'
): Promise<void> {
  try {
    const collection = await getCollection(namespace);

    // ChromaDB's delete with where clause
    await collection.delete({
      where: filter
    });

    logger.info({
      namespace,
      filter
    }, 'Vectors deleted by filter successfully');
  } catch (error) {
    logger.error({ error, filter, namespace }, 'Vector deletion by filter failed');
    throw new Error(`Vector deletion by filter failed: ${error.message}`);
  }
}

/**
 * Delete entire collection
 */
export async function deleteCollection(namespace: string): Promise<void> {
  try {
    if (!chromaClient) {
      await initializeChroma();
    }

    await chromaClient!.deleteCollection({ name: namespace });

    // Remove from cache
    collections.delete(namespace);

    logger.info(`Collection deleted: ${namespace}`);
  } catch (error) {
    logger.error(error, `Failed to delete collection: ${namespace}`);
    throw new Error(`Collection deletion failed: ${error.message}`);
  }
}

/**
 * List all collections
 */
export async function listCollections(): Promise<string[]> {
  try {
    if (!chromaClient) {
      await initializeChroma();
    }

    const result = await chromaClient!.listCollections();
    return result.map(c => c.name);
  } catch (error) {
    logger.error(error, 'Failed to list collections');
    return [];
  }
}

/**
 * Get collection statistics
 */
export async function getCollectionStats(namespace: string): Promise<{
  name: string;
  count: number;
  dimensions?: number;
}> {
  try {
    const collection = await getCollection(namespace);

    const count = await collection.count();

    return {
      name: namespace,
      count,
      dimensions: 768 // Default, can be extracted from metadata if needed
    };
  } catch (error) {
    logger.error(error, `Failed to get stats for collection: ${namespace}`);
    throw new Error(`Collection stats error: ${error.message}`);
  }
}

/**
 * Cleanup ChromaDB resources
 */
export async function cleanup(): Promise<void> {
  collections.clear();
  chromaClient = null;
  logger.info('ChromaDB service cleaned up');
}

/**
 * Health check
 */
export async function healthCheck(): Promise<boolean> {
  try {
    if (!chromaClient) {
      await initializeChroma();
    }

    // Try to list collections as a health check
    await chromaClient!.listCollections();
    return true;
  } catch (error) {
    logger.error(error, 'ChromaDB health check failed');
    return false;
  }
}