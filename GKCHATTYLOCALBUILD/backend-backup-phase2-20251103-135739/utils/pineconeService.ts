/* eslint-disable @typescript-eslint/no-unused-vars */
import { Pinecone, Index } from '@pinecone-database/pinecone';
import type { QueryResponse, RecordMetadata } from '@pinecone-database/pinecone';
import { getLogger } from './logger';
import CircuitBreaker from 'opossum';
import { withRetry, RetryConfig } from './retryHelper'; // Assuming RetryConfig is exported
import { getSystemKbNamespace } from './pineconeNamespace';
// import { chunkArray } from './arrayUtils'; // Remove unused import if truly unused

let pinecone: Pinecone | null = null;
let pineconeIndexInstance: Index | null = null; // Renamed for clarity

// Reading at top level might be cached by Node module system
// These are not used directly by initPinecone but good for reference if needed elsewhere.
// const PINECONE_INDEX_NAME_TOP = process.env.PINECONE_INDEX_NAME;
// const PINECONE_API_KEY_TOP = process.env.PINECONE_API_KEY;
// const PINECONE_ENVIRONMENT_TOP = process.env.PINECONE_ENVIRONMENT;

const logger = getLogger('pineconeService');

// Define Pinecone-specific retry configuration
export const DEFAULT_PINECONE_RETRY_CONFIG: RetryConfig = {
  retries: 3, // Fewer retries than OpenAI initially, can be tuned
  minTimeout: 1000,
  maxTimeout: 5000,
  factor: 2,
  retryableStatusCodes: [500, 502, 503, 504], // General server errors, Pinecone might have specific ones too
};

export const PINECONE_READ_RETRY_CONFIG: RetryConfig = {
  ...DEFAULT_PINECONE_RETRY_CONFIG,
  description: 'Pinecone Read Operation',
};

export const PINECONE_WRITE_RETRY_CONFIG: RetryConfig = {
  ...DEFAULT_PINECONE_RETRY_CONFIG,
  // retries: 2, // Example: Potentially fewer retries for write operations
  description: 'Pinecone Write Operation',
};

logger.info('Pinecone Service Module loaded and executing');

// Define FilterType if not well-defined by SDK or for flexibility
// Using a generic object for filter. PineconeQueryFilter was 'object'.
// Pinecone SDK often uses Record<string, unknown> or specific filter types.
// For metadata filtering, it's typically simple key-value pairs.
type FilterType = Record<string, string | number | boolean | string[] | Record<string, unknown>>;

export const initPinecone = async (): Promise<Index> => {
  if (pineconeIndexInstance) {
    // logger.debug('Pinecone already initialized, returning cached index instance.'); // Optional debug log
    return pineconeIndexInstance;
  }

  logger.info('Initializing Pinecone client...');

  if (!process.env.PINECONE_API_KEY || !process.env.PINECONE_INDEX_NAME) {
    logger.error(
      {
        apiKeyPresent: !!process.env.PINECONE_API_KEY,
        indexNamePresent: !!process.env.PINECONE_INDEX_NAME,
      },
      'ERROR: Missing required Pinecone environment variables (API_KEY, INDEX_NAME). Check failed.'
    );
    throw new Error('Missing Pinecone environment variables.');
  }

  try {
    // New v6.x API - no need for environment variable
    pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY,
    });

    const indexName = process.env.PINECONE_INDEX_NAME;
    logger.info({ indexName }, `Accessing Pinecone index: ${indexName}...`);
    const index = pinecone.index(indexName);
    // Optional: A quick check to ensure the index is responsive by describing stats.
    // try {
    //   await index.describeIndexStats();
    //   logger.info({ indexName }, 'Successfully connected to Pinecone index and described stats.');
    // } catch (statsError: unknown) {
    //   logger.error({ indexName, error: { message: statsError.message, name: statsError.name } }, 'Failed to describe Pinecone index stats during initialization.');
    //   throw new Error(`Failed to connect to Pinecone index or describe stats: ${statsError.message}`);
    // }
    pineconeIndexInstance = index;
    logger.info('[Pinecone] Initialization successful. Index instance ready.');
    return pineconeIndexInstance;
  } catch (error: unknown) {
    logger.error(
      {
        error: {
          message: error instanceof Error ? error.message : String(error),
          name: error instanceof Error ? error.name : 'Unknown',
          stack: error instanceof Error ? error.stack : undefined,
        },
      },
      'ERROR: Failed to initialize Pinecone client or index:'
    );
    pineconeIndexInstance = null; // Reset on failure
    throw new Error(
      `Pinecone initialization failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

export const getPineconeIndex = async (): Promise<Index> => {
  if (!pineconeIndexInstance) {
    // logger.debug('Pinecone index not cached, initializing...');
    return await initPinecone();
  }
  // logger.debug('Returning cached Pinecone index instance.');
  return pineconeIndexInstance;
};

export type PineconeVector = {
  id: string;
  values: number[];
  metadata?: RecordMetadata;
};

// --- Protected Pinecone Operations (to be wrapped by breakers) ---

async function protectedUpsertVectors(
  vectors: PineconeVector[],
  namespace?: string
): Promise<void> {
  const index = await getPineconeIndex(); // getPineconeIndex handles init
  const targetNamespace = namespace || '';
  logger.info(
    {
      functionName: 'protectedUpsertVectors',
      vectorCount: vectors.length,
      namespace: targetNamespace,
    },
    `Attempting to upsert ${vectors.length} vectors`
  );
  // Existing batching logic
  const batchSize = 100;
  for (let i = 0; i < vectors.length; i += batchSize) {
    const batch = vectors.slice(i, i + batchSize);
    logger.debug(
      { batchNumber: i / batchSize + 1, batchSize: batch.length, namespace: targetNamespace },
      'Upserting batch'
    );
    await index.namespace(targetNamespace).upsert(batch);
  }
  logger.info(
    {
      functionName: 'protectedUpsertVectors',
      vectorCount: vectors.length,
      namespace: targetNamespace,
    },
    'Successfully upserted vectors'
  );
}

async function protectedQueryVectors(
  vector: number[],
  topK: number,
  filter?: FilterType,
  namespace?: string
): Promise<QueryResponse> {
  // Use imported QueryResponse
  const index = await getPineconeIndex();
  const targetNamespace = namespace || '';
  const queryRequest = { vector, topK, includeMetadata: true, includeValues: false, filter };
  logger.info(
    {
      functionName: 'protectedQueryVectors',
      topK,
      namespace: targetNamespace,
      filter: JSON.stringify(filter),
    }, // Stringify filter for logging
    'Attempting to query vectors'
  );
  const results = await index.namespace(targetNamespace).query(queryRequest);
  logger.info(
    {
      functionName: 'protectedQueryVectors',
      matchCount: results?.matches?.length,
      namespace: targetNamespace,
    },
    'Successfully queried vectors'
  );
  return results;
}

async function protectedDeleteVectorsById(ids: string[], namespace?: string): Promise<void> {
  const index = await getPineconeIndex();
  const targetNamespace = namespace || '';
  logger.info(
    { functionName: 'protectedDeleteVectorsById', idCount: ids.length, namespace: targetNamespace },
    `Attempting to delete ${ids.length} vectors by ID`
  );
  await index.namespace(targetNamespace).deleteMany(ids);
  logger.info(
    { functionName: 'protectedDeleteVectorsById', idCount: ids.length, namespace: targetNamespace },
    'Successfully deleted vectors by ID'
  );
}

async function protectedDeleteVectorsByFilter(
  filter: FilterType,
  namespace?: string
): Promise<void> {
  const index = await getPineconeIndex();
  const targetNamespace = namespace || '';
  logger.info(
    { functionName: 'protectedDeleteVectorsByFilter', filter, namespace: targetNamespace },
    'Attempting to delete vectors by filter'
  );

  // If the filter is empty, it means we want to delete all vectors in the namespace.
  // The Pinecone API requires an explicit `deleteAll: true` for this.
  if (Object.keys(filter).length === 0) {
    await index.namespace(targetNamespace).deleteMany({ deleteAll: true });
    logger.info(
      { functionName: 'protectedDeleteVectorsByFilter', namespace: targetNamespace },
      'Successfully submitted request to delete all vectors in namespace'
    );
  } else {
    // Otherwise, delete based on the provided filter.
    await index.namespace(targetNamespace).deleteMany(filter);
    logger.info(
      { functionName: 'protectedDeleteVectorsByFilter', namespace: targetNamespace },
      'Successfully deleted vectors by filter'
    );
  }
}

// --- Circuit Breaker Configurations and Instances ---
const pineconeReadBreakerOptions = {
  timeout: 2000, // Proposed: 2,000ms (2s)
  errorThresholdPercentage: 40,
  volumeThreshold: 10, // Lowered from 20 for quicker reaction if needed
  resetTimeout: 30_000, // 30 seconds
};

const pineconeWriteBreakerOptions = {
  timeout: 5000, // Proposed: 5,000ms (5s) for Upsert and DeleteById
  errorThresholdPercentage: 50,
  volumeThreshold: 5, // Lowered from 10 for quicker reaction
  resetTimeout: 60_000, // 60 seconds
};

// Specific options for DeleteByFilter if different, otherwise uses pineconeWriteBreakerOptions
// For now, let's assume DeleteByFilter needs a longer timeout as per report
const pineconeDeleteByFilterBreakerOptions = {
  timeout: 10000, // Proposed: 10,000ms (10s)
  errorThresholdPercentage: 50,
  volumeThreshold: 5,
  resetTimeout: 60_000,
};

const pineconeReadBreaker = new CircuitBreaker(protectedQueryVectors, pineconeReadBreakerOptions);

const pineconeWriteUpsertBreaker = new CircuitBreaker(
  protectedUpsertVectors,
  pineconeWriteBreakerOptions
);

const pineconeWriteDeleteByIdBreaker = new CircuitBreaker(
  protectedDeleteVectorsById,
  pineconeWriteBreakerOptions
);

const pineconeWriteDeleteByFilterBreaker = new CircuitBreaker(
  protectedDeleteVectorsByFilter,
  pineconeDeleteByFilterBreakerOptions
); // Use specific options

// --- Event Logging for Pinecone Breakers ---
const pineconeBreakers = [
  { name: 'pineconeReadBreaker', instance: pineconeReadBreaker },
  { name: 'pineconeWriteUpsertBreaker', instance: pineconeWriteUpsertBreaker },
  { name: 'pineconeWriteDeleteByIdBreaker', instance: pineconeWriteDeleteByIdBreaker },
  { name: 'pineconeWriteDeleteByFilterBreaker', instance: pineconeWriteDeleteByFilterBreaker },
];

pineconeBreakers.forEach(({ name, instance }: { name: string; instance: CircuitBreaker }) => {
  instance.on('success', (result: unknown, latencyMs?: number) => {
    logger.info(
      {
        event: 'circuit',
        breakerName: name,
        state: 'success' as const,
        latencyMs,
        resultSummary: 'operation_successful',
      },
      `Circuit ${name} success`
    );
  });
  instance.on('failure', (error: Error, latencyMs?: number) => {
    logger.error(
      {
        event: 'circuit',
        breakerName: name,
        state: 'failure' as const,
        latencyMs,
        error: {
          message: error instanceof Error ? error.message : String(error),
          name: error instanceof Error ? error.name : 'Unknown',
          stack: error instanceof Error ? error.stack : undefined,
        },
      },
      `Circuit ${name} failed`
    );
  });
  instance.on('open', () => {
    logger.error(
      { event: 'circuit', breakerName: name, state: 'open' as const },
      `Circuit ${name} opened`
    );
  });
  instance.on('close', () => {
    logger.info(
      { event: 'circuit', breakerName: name, state: 'close' as const },
      `Circuit ${name} closed`
    );
  });
  instance.on('halfOpen', (numConsecutiveFailures?: number) => {
    logger.warn(
      { event: 'circuit', breakerName: name, state: 'halfOpen' as const, numConsecutiveFailures },
      `Circuit ${name} halfOpen`
    );
  });
  instance.on('reject', (error: Error) => {
    logger.warn(
      {
        event: 'circuit',
        breakerName: name,
        state: 'reject' as const,
        error: {
          message: error instanceof Error ? error.message : String(error),
          name: error instanceof Error ? error.name : 'Unknown',
        },
      },
      `Circuit ${name} rejected`
    );
  });
  instance.on('timeout', (error: Error) => {
    logger.warn(
      {
        event: 'circuit',
        breakerName: name,
        state: 'timeout' as const,
        error: {
          message: error instanceof Error ? error.message : String(error),
          name: error instanceof Error ? error.name : 'Unknown',
        },
      },
      `Circuit ${name} timed out`
    );
  });
});

// --- Refactor Public Functions ---
// (Replace original console.log and error handling in these functions)
// initPinecone and getPineconeIndex remain largely the same, but internal logs switch to logger.

// Replace console.log in initPinecone and getPineconeIndex
// ...

export const upsertVectors = async (
  vectors: PineconeVector[],
  namespace?: string
): Promise<void> => {
  try {
    await withRetry(
      () => pineconeWriteUpsertBreaker.fire(vectors, namespace),
      PINECONE_WRITE_RETRY_CONFIG,
      `Pinecone Upsert - Namespace: ${namespace || 'default'}`
    );
  } catch (error: unknown) {
    logger.error(
      {
        functionName: 'upsertVectors',
        error: {
          message: error instanceof Error ? error.message : String(error),
          name: error instanceof Error ? error.name : 'Unknown',
          stack: error instanceof Error ? error.stack : undefined,
        },
        vectorsCount: vectors.length,
        namespace,
      },
      'Pinecone upsert failed after retries/breaker'
    );
    throw new Error(
      `Pinecone upsert failed: ${error instanceof Error ? error.message : String(error)}`
    ); // Re-throw a generic error
  }
};

export const queryVectors = async (
  vector: number[],
  topK: number,
  filter?: FilterType,
  namespace?: string
): Promise<QueryResponse> => {
  // Use imported QueryResponse
  try {
    // The fire method should correctly infer the return type from protectedQueryVectors
    return await withRetry(
      () => pineconeReadBreaker.fire(vector, topK, filter, namespace),
      PINECONE_READ_RETRY_CONFIG,
      `Pinecone Query - Namespace: ${namespace || 'default'}`
    );
  } catch (error: unknown) {
    logger.error(
      {
        functionName: 'queryVectors',
        error: {
          message: error instanceof Error ? error.message : String(error),
          name: error instanceof Error ? error.name : 'Unknown',
          stack: error instanceof Error ? error.stack : undefined,
        },
        topK,
        filter: JSON.stringify(filter),
        namespace,
      },
      'Pinecone query failed after retries/breaker'
    );
    throw new Error(
      `Pinecone query failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

export const deleteVectorsById = async (ids: string[], namespace?: string): Promise<void> => {
  try {
    await withRetry(
      () => pineconeWriteDeleteByIdBreaker.fire(ids, namespace),
      PINECONE_WRITE_RETRY_CONFIG,
      `Pinecone DeleteById - Namespace: ${namespace || 'default'}`
    );
  } catch (error: unknown) {
    logger.error(
      {
        functionName: 'deleteVectorsById',
        error: {
          message: error instanceof Error ? error.message : String(error),
          name: error instanceof Error ? error.name : 'Unknown',
          stack: error instanceof Error ? error.stack : undefined,
        },
        idsCount: ids.length,
        namespace,
      },
      'Pinecone delete by ID failed after retries/breaker'
    );
    throw new Error(
      `Pinecone delete by ID failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

export const deleteVectorsByFilter = async (
  filter: FilterType,
  namespace?: string
): Promise<void> => {
  try {
    await withRetry(
      () => pineconeWriteDeleteByFilterBreaker.fire(filter, namespace),
      PINECONE_WRITE_RETRY_CONFIG,
      `Pinecone DeleteByFilter - Namespace: ${namespace || 'default'}`
    );
  } catch (error: unknown) {
    logger.error(
      {
        functionName: 'deleteVectorsByFilter',
        error: {
          message: error instanceof Error ? error.message : String(error),
          name: error instanceof Error ? error.name : 'Unknown',
          stack: error instanceof Error ? error.stack : undefined,
        },
        filter,
        namespace,
      },
      'Pinecone delete by filter failed after retries/breaker'
    );
    throw new Error(
      `Pinecone delete by filter failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

export const upsertSystemDocument = async (
  documentId: string,
  embedding: number[],
  text: string,
  originalFileName: string, // Added for more complete metadata
  chunkIndex: number, // Added for chunk identification
  totalChunks: number // Added for context
): Promise<void> => {
  // log.debug(`[Pinecone] Preparing to upsert system document chunk: ${documentId}, chunk ${chunkIndex + 1}/${totalChunks}`);

  const vectorId = `${documentId}_chunk_${chunkIndex}`;
  const vector: PineconeVector = {
    id: vectorId,
    values: embedding,
    metadata: {
      documentId,
      originalFileName, // Store the actual filename
      sourceType: 'system',
      textSnippet: text.substring(0, 1000), // Store a preview, ensure it's within Pinecone limits
      chunkIndex,
      totalChunks,
      // Add any other relevant metadata, e.g., creationDate: new Date().toISOString()
    },
  };

  const namespace = getSystemKbNamespace();
  await upsertVectors([vector], namespace);
  logger.info(
    { vectorId, namespace, indexName: process.env.PINECONE_INDEX_NAME },
    `[Pinecone] Upserted system document chunk to namespace`
  );
};

export const deleteSystemDocument = async (documentId: string): Promise<void> => {
  // CANARY TEST LOG
  logger.debug(
    `[CANARY TEST] Reached deleteSystemDocument for docId: ${documentId} at ${new Date().toISOString()}`
  );

  const namespace = getSystemKbNamespace();
  logger.info(
    { documentId, namespace, indexName: process.env.PINECONE_INDEX_NAME },
    `[Pinecone] Deleting all vectors for system document from namespace`
  );
  // Pinecone uses simple key-value filter syntax, not MongoDB operators
  await deleteVectorsByFilter({ documentId: documentId }, namespace);
  logger.info(
    { documentId, namespace },
    `[Pinecone] Successfully submitted delete request for system document`
  );
};

export const purgeNamespace = async (namespace: string): Promise<void> => {
  logger.info({ namespace }, `Purging all vectors from namespace: ${namespace}...`);
  try {
    await deleteVectorsByFilter({}, namespace); // empty filter triggers deleteAll logic
    logger.info({ namespace }, `Successfully purged namespace: ${namespace}.`);
  } catch (error: unknown) {
    logger.error(
      {
        namespace,
        error: {
          message: error instanceof Error ? error.message : String(error),
          name: error instanceof Error ? error.name : 'Unknown',
        },
      },
      'Failed to purge namespace'
    );
    throw error;
  }
};

// Add a final log at the end of the module to indicate it has been initialized, if desired
// logger.info('[Pinecone Service Module] Initialized and ready.');
