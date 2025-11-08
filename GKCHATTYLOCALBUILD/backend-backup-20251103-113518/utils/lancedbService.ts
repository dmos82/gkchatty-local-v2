/**
 * GKChatty Local - LanceDB Service
 *
 * Replaces ChromaDB with embedded LanceDB vector storage
 * Maintains same interface as chromaService.ts for compatibility
 *
 * Key Features:
 * - Embedded (no server required)
 * - File-based persistence
 * - Zero Docker dependency
 * - Pinecone-compatible API interface
 */

import * as lancedb from '@lancedb/lancedb';
import * as path from 'path';
import { getLogger } from './logger';
import * as fs from 'fs';

const logger = getLogger('lancedbService');

// LanceDB connection instance
let db: lancedb.Connection | null = null;
let dbPath: string;

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
 * Initialize LanceDB connection
 * Uses local file-based storage at ~/.gkchatty/data/vectors
 */
export async function initializeLanceDB(): Promise<void> {
  if (db) {
    return; // Already initialized
  }

  try {
    // Determine database path
    dbPath =
      process.env.LANCEDB_PATH ||
      path.join(process.env.HOME || '', '.gkchatty', 'data', 'vectors');

    // Ensure directory exists
    if (!fs.existsSync(dbPath)) {
      fs.mkdirSync(dbPath, { recursive: true });
      logger.info(`Created LanceDB directory: ${dbPath}`);
    }

    // Connect to LanceDB
    db = await lancedb.connect(dbPath);

    logger.info(`✅ LanceDB initialized at ${dbPath}`);
    logger.info('✅ Vector database ready (embedded, no server required)');
  } catch (error: any) {
    logger.error(error, 'Failed to initialize LanceDB');
    throw new Error(`LanceDB initialization failed: ${error.message}`);
  }
}

/**
 * Get or create a table (equivalent to ChromaDB collection)
 */
async function getTable(namespace: string): Promise<lancedb.Table> {
  if (!db) {
    await initializeLanceDB();
  }

  try {
    // Try to open existing table
    const table = await db!.openTable(namespace);
    logger.debug(`Using existing table: ${namespace}`);
    return table;
  } catch (error) {
    // Table doesn't exist, create it
    logger.debug(`Table ${namespace} doesn't exist, creating...`);

    // Create table with empty data (LanceDB requires initial data)
    // We'll use a schema-less approach by providing a sample record
    const sampleData = [
      {
        id: '__init__',
        vector: Array(768).fill(0), // Default 768 dimensions (nomic-embed-text)
        metadata: { __init: true }
      }
    ];

    const table = await db!.createTable(namespace, sampleData, {
      mode: 'overwrite'
    });

    logger.info(`Created new table: ${namespace}`);
    return table;
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
  const { namespace = 'default', topK = 10, filter = {}, includeMetadata = true } = options;

  try {
    const table = await getTable(namespace);

    // Build query
    let query = table.search(embeddings).limit(topK);

    // Apply filter if provided
    if (filter && Object.keys(filter).length > 0) {
      // Convert filter to LanceDB SQL-like syntax
      const whereClause = buildWhereClause(filter);
      if (whereClause) {
        query = query.where(whereClause);
      }
    }

    // Execute query
    const results = await query.execute();

    // Filter out initialization record
    const filteredResults = results.filter((r: any) => r.id !== '__init__');

    // Convert LanceDB results to Pinecone format
    const matches = filteredResults.map((record: any) => ({
      id: record.id,
      score: 1 - (record._distance || 0), // Convert distance to similarity
      metadata: includeMetadata && record.metadata ? record.metadata : {}
    }));

    logger.debug(
      {
        namespace,
        topK,
        resultsCount: matches.length
      },
      'Vector query completed'
    );

    return { matches };
  } catch (error: any) {
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
    const table = await getTable(namespace);

    // Format data for LanceDB
    const data = ids.map((id, i) => ({
      id,
      vector: vectors[i],
      metadata: metadata[i] || {}
    }));

    // Upsert to LanceDB (add will overwrite existing IDs)
    await table.add(data);

    logger.info(
      {
        namespace,
        count: vectors.length
      },
      'Vectors upserted successfully'
    );
  } catch (error: any) {
    logger.error(error, 'Vector upsert failed');
    throw new Error(`Vector upsert failed: ${error.message}`);
  }
}

/**
 * Delete vectors by IDs
 */
export async function deleteVectors(namespace: string, ids: string[]): Promise<void> {
  try {
    const table = await getTable(namespace);

    // LanceDB delete by ID filter
    const whereClause = ids.map(id => `id = '${id}'`).join(' OR ');
    await table.delete(whereClause);

    logger.info(
      {
        namespace,
        count: ids.length
      },
      'Vectors deleted successfully'
    );
  } catch (error: any) {
    logger.error(error, 'Vector deletion failed');
    throw new Error(`Vector deletion failed: ${error.message}`);
  }
}

/**
 * Delete vectors by metadata filter (replaces Pinecone deleteVectorsByFilter)
 */
export async function deleteVectorsByFilter(
  filter: Record<string, any>,
  namespace: string = 'default'
): Promise<void> {
  try {
    const table = await getTable(namespace);

    // Convert filter to LanceDB SQL-like syntax
    const whereClause = buildWhereClause(filter);

    if (!whereClause) {
      logger.warn('No valid filter provided for deletion');
      return;
    }

    await table.delete(whereClause);

    logger.info(
      {
        namespace,
        filter
      },
      'Vectors deleted by filter successfully'
    );
  } catch (error: any) {
    logger.error({ error, filter, namespace }, 'Vector deletion by filter failed');
    throw new Error(`Vector deletion by filter failed: ${error.message}`);
  }
}

/**
 * Delete entire table (collection)
 */
export async function deleteCollection(namespace: string): Promise<void> {
  try {
    if (!db) {
      await initializeLanceDB();
    }

    await db!.dropTable(namespace);

    logger.info(`Table deleted: ${namespace}`);
  } catch (error: any) {
    logger.error(error, `Failed to delete table: ${namespace}`);
    throw new Error(`Table deletion failed: ${error.message}`);
  }
}

/**
 * List all tables
 */
export async function listCollections(): Promise<string[]> {
  try {
    if (!db) {
      await initializeLanceDB();
    }

    const tables = await db!.tableNames();
    return tables;
  } catch (error: any) {
    logger.error(error, 'Failed to list tables');
    return [];
  }
}

/**
 * Get table statistics
 */
export async function getCollectionStats(namespace: string): Promise<{
  name: string;
  count: number;
  dimensions?: number;
}> {
  try {
    const table = await getTable(namespace);

    const count = await table.countRows();

    return {
      name: namespace,
      count: count > 0 ? count - 1 : 0, // Subtract initialization record
      dimensions: 768 // Default, can be detected from first real vector if needed
    };
  } catch (error: any) {
    logger.error(error, `Failed to get stats for table: ${namespace}`);
    throw new Error(`Table stats error: ${error.message}`);
  }
}

/**
 * Cleanup LanceDB resources
 */
export async function cleanup(): Promise<void> {
  db = null;
  logger.info('LanceDB service cleaned up');
}

/**
 * Health check
 */
export async function healthCheck(): Promise<boolean> {
  try {
    if (!db) {
      await initializeLanceDB();
    }

    // Try to list tables as a health check
    await db!.tableNames();
    return true;
  } catch (error: any) {
    logger.error(error, 'LanceDB health check failed');
    return false;
  }
}

/**
 * Build SQL-like WHERE clause from filter object
 * Handles common filter patterns from Pinecone API
 */
function buildWhereClause(filter: Record<string, any>): string | null {
  if (!filter || Object.keys(filter).length === 0) {
    return null;
  }

  const conditions: string[] = [];

  for (const [key, value] of Object.entries(filter)) {
    if (value === null || value === undefined) {
      continue;
    }

    // Handle different value types
    if (typeof value === 'string') {
      conditions.push(`metadata.${key} = '${escapeSql(value)}'`);
    } else if (typeof value === 'number') {
      conditions.push(`metadata.${key} = ${value}`);
    } else if (typeof value === 'boolean') {
      conditions.push(`metadata.${key} = ${value}`);
    } else if (Array.isArray(value)) {
      // Handle IN operator
      const values = value
        .map(v => (typeof v === 'string' ? `'${escapeSql(v)}'` : v))
        .join(', ');
      conditions.push(`metadata.${key} IN (${values})`);
    } else if (typeof value === 'object') {
      // Handle operators like $eq, $ne, $gt, $lt, etc.
      for (const [operator, operatorValue] of Object.entries(value)) {
        const sqlOperator = convertOperator(operator);
        if (sqlOperator) {
          const escapedValue =
            typeof operatorValue === 'string' ? `'${escapeSql(operatorValue)}'` : operatorValue;
          conditions.push(`metadata.${key} ${sqlOperator} ${escapedValue}`);
        }
      }
    }
  }

  return conditions.length > 0 ? conditions.join(' AND ') : null;
}

/**
 * Convert Pinecone-style operators to SQL operators
 */
function convertOperator(operator: string): string | null {
  const operatorMap: Record<string, string> = {
    $eq: '=',
    $ne: '!=',
    $gt: '>',
    $gte: '>=',
    $lt: '<',
    $lte: '<=',
    $in: 'IN'
  };

  return operatorMap[operator] || null;
}

/**
 * Escape SQL special characters
 */
function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}
