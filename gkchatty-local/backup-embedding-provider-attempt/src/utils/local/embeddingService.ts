import 'dotenv/config';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { pipeline, Pipeline } from '@xenova/transformers';
import { getLogger } from '../logger';

const log = getLogger('embeddingService');

// Configuration
const STORAGE_MODE = process.env.GKCHATTY_STORAGE || 'local';
const GKCHATTY_HOME = process.env.GKCHATTY_HOME || path.join(os.homedir(), '.gkchatty');
const MODELS_PATH = path.join(GKCHATTY_HOME, 'data', 'models');
const DEFAULT_MODEL = process.env.EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2';

let embeddingPipeline: Pipeline | null = null;
let currentModel = DEFAULT_MODEL;

/**
 * Initialize the embedding model
 */
export const initializeEmbeddings = async (modelName?: string) => {
  try {
    if (STORAGE_MODE !== 'local') {
      log.debug(`Storage mode is '${STORAGE_MODE}', skipping local embeddings initialization`);
      return;
    }

    const model = modelName || DEFAULT_MODEL;

    // Ensure models directory exists
    if (!fs.existsSync(MODELS_PATH)) {
      fs.mkdirSync(MODELS_PATH, { recursive: true });
      log.debug(`Created models directory: ${MODELS_PATH}`);
    }

    log.debug(`Initializing embedding model: ${model}`);

    // Create the embedding pipeline
    // This will download the model on first use and cache it
    embeddingPipeline = await pipeline(
      'feature-extraction',
      model,
      {
        cache_dir: MODELS_PATH,
        progress_callback: (progress: any) => {
          if (progress.status === 'download') {
            log.debug(`Downloading model: ${progress.file} (${progress.progress}%)`);
          }
        }
      }
    );

    currentModel = model;
    log.debug(`✅ Embedding model initialized: ${model}`);

    // Get model info
    const modelInfo = await getModelInfo();
    log.debug(`Model dimensions: ${modelInfo.dimensions}`);

  } catch (err: any) {
    log.error('❌ Embedding model initialization FAILED:', err);
    throw err;
  }
};

/**
 * Generate embeddings for text(s)
 */
export const generateEmbeddings = async (
  texts: string | string[]
): Promise<number[][]> => {
  if (!embeddingPipeline) {
    await initializeEmbeddings();
    if (!embeddingPipeline) {
      throw new Error('Embedding pipeline not initialized');
    }
  }

  try {
    const inputTexts = Array.isArray(texts) ? texts : [texts];

    // Process in batches for better performance
    const batchSize = 32;
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < inputTexts.length; i += batchSize) {
      const batch = inputTexts.slice(i, i + batchSize);

      // Generate embeddings
      const output = await embeddingPipeline(batch, {
        pooling: 'mean',
        normalize: true
      });

      // Convert tensor to array
      const embeddings = output.tolist();

      allEmbeddings.push(...embeddings);

      log.debug(`Processed batch ${i / batchSize + 1} of ${Math.ceil(inputTexts.length / batchSize)}`);
    }

    return allEmbeddings;

  } catch (err: any) {
    log.error('❌ Failed to generate embeddings:', err);
    throw err;
  }
};

/**
 * Generate a single embedding
 */
export const generateEmbedding = async (text: string): Promise<number[]> => {
  const embeddings = await generateEmbeddings(text);
  return embeddings[0];
};

/**
 * Calculate cosine similarity between two vectors
 */
export const cosineSimilarity = (a: number[], b: number[]): number => {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same dimension');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (normA * normB);
};

/**
 * Get model information
 */
export const getModelInfo = async (): Promise<{
  name: string;
  dimensions: number;
  maxTokens: number;
}> => {
  if (!embeddingPipeline) {
    await initializeEmbeddings();
  }

  // Generate a test embedding to get dimensions
  const testEmbedding = await generateEmbedding('test');

  // Model-specific configurations
  const modelConfigs: Record<string, { maxTokens: number }> = {
    'Xenova/all-MiniLM-L6-v2': { maxTokens: 256 },
    'Xenova/all-mpnet-base-v2': { maxTokens: 384 },
    'Xenova/multilingual-e5-large': { maxTokens: 512 },
    'Xenova/bge-small-en-v1.5': { maxTokens: 512 },
  };

  const config = modelConfigs[currentModel] || { maxTokens: 512 };

  return {
    name: currentModel,
    dimensions: testEmbedding.length,
    maxTokens: config.maxTokens
  };
};

/**
 * List available models (cached)
 */
export const listCachedModels = (): string[] => {
  if (!fs.existsSync(MODELS_PATH)) {
    return [];
  }

  const models: string[] = [];
  const files = fs.readdirSync(MODELS_PATH);

  for (const file of files) {
    if (fs.statSync(path.join(MODELS_PATH, file)).isDirectory()) {
      models.push(file);
    }
  }

  return models;
};

/**
 * Clear model cache
 */
export const clearModelCache = (): void => {
  if (fs.existsSync(MODELS_PATH)) {
    fs.rmSync(MODELS_PATH, { recursive: true, force: true });
    log.debug('✅ Model cache cleared');
  }
};

/**
 * Switch to a different model
 */
export const switchModel = async (modelName: string): Promise<void> => {
  embeddingPipeline = null;
  await initializeEmbeddings(modelName);
};

/**
 * Batch process documents
 */
export const batchProcessDocuments = async (
  documents: Array<{
    id: string;
    text: string;
  }>
): Promise<Array<{
  id: string;
  embedding: number[];
}>> => {
  const texts = documents.map(d => d.text);
  const embeddings = await generateEmbeddings(texts);

  return documents.map((doc, index) => ({
    id: doc.id,
    embedding: embeddings[index]
  }));
};

/**
 * Cleanup (for graceful shutdown)
 */
export const cleanup = async (): Promise<void> => {
  embeddingPipeline = null;
  log.debug('🔌 Embedding service cleaned up');
};

// Export OpenAI-compatible interface
export default {
  initialize: initializeEmbeddings,
  embed: generateEmbedding,
  embedBatch: generateEmbeddings,
  similarity: cosineSimilarity,
  getInfo: getModelInfo,
  switchModel,
  batchProcess: batchProcessDocuments,
  cleanup
};