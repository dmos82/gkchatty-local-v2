/**
 * GKChatty Local - Transformers.js Helper with MPS Support
 *
 * Replaces OpenAI embeddings with local Transformers.js models
 * Supports M2 Metal Performance Shaders (MPS) for 5-10x speedup
 */

import { pipeline, env } from '@xenova/transformers';
import * as fs from 'fs';
import * as path from 'path';
import { getLogger } from './logger';

const logger = getLogger('transformersHelper');

// Configure Transformers.js environment
env.allowLocalModels = true;
env.localURL = path.join(process.env.HOME || '', '.cache/huggingface/hub');
env.backends.onnx.wasm.wasmPaths = path.join(__dirname, '../../node_modules/@xenova/transformers/dist/');

interface TransformerConfig {
  modelName?: string;
  device?: 'cpu' | 'mps' | 'cuda';
  dimensions?: number;
}

interface ModelInfo {
  name: string;
  dimensions: number;
  path: string;
  provider: string;
  size: number;
}

class TransformersEmbeddingService {
  private pipeline: any = null;
  private modelName: string;
  private device: string;
  private dimensions: number;
  private isInitialized: boolean = false;

  constructor(config: TransformerConfig = {}) {
    this.modelName = config.modelName || 'nomic-ai/nomic-embed-text-v1.5';
    this.device = config.device || this.detectBestDevice();
    this.dimensions = config.dimensions || 768;
  }

  /**
   * Detect the best available device (MPS for M2 Macs)
   */
  private detectBestDevice(): string {
    // Check for M2 Mac with MPS support
    if (process.platform === 'darwin') {
      try {
        const { execSync } = require('child_process');
        const output = execSync('sysctl -n machdep.cpu.brand_string').toString();

        if (output.includes('M1') || output.includes('M2') || output.includes('M3')) {
          logger.info('✅ Apple Silicon detected - using MPS acceleration');
          return 'mps';
        }
      } catch (error) {
        logger.debug('Could not detect Apple Silicon');
      }
    }

    // Check for CUDA support
    try {
      const { execSync } = require('child_process');
      execSync('nvidia-smi');
      logger.info('✅ NVIDIA GPU detected - using CUDA acceleration');
      return 'cuda';
    } catch (error) {
      logger.debug('No NVIDIA GPU detected');
    }

    logger.info('Using CPU for embeddings (no GPU acceleration available)');
    return 'cpu';
  }

  /**
   * Initialize the embedding pipeline
   */
  private async initialize(): Promise<void> {
    if (this.isInitialized && this.pipeline) {
      return;
    }

    logger.info({ model: this.modelName, device: this.device }, 'Initializing Transformers.js pipeline');

    try {
      this.pipeline = await pipeline('feature-extraction', this.modelName, {
        device: this.device,
      });
      this.isInitialized = true;
      logger.info('✅ Transformers.js pipeline initialized successfully');
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to initialize pipeline');
      throw new Error(`Pipeline initialization failed: ${error.message}`);
    }
  }

  /**
   * Generate embeddings from text
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    await this.initialize();

    if (!Array.isArray(texts)) {
      texts = [texts];
    }

    const startTime = Date.now();

    try {
      // Generate embeddings
      const output = await this.pipeline(texts, {
        pooling: 'mean',
        normalize: true
      });

      const embeddings = Array.from(output.tolist());

      const duration = Date.now() - startTime;
      const avgTime = duration / texts.length;

      logger.info({
        device: this.device,
        texts: texts.length,
        totalTime: duration,
        avgTimePerEmbedding: avgTime
      }, `Generated embeddings in ${duration}ms (${avgTime.toFixed(1)}ms per text)`);

      return embeddings;
    } catch (error) {
      logger.error(error, 'Failed to generate embeddings');
      throw new Error(`Embedding generation failed: ${error.message}`);
    }
  }

  /**
   * Scan for available local models in HuggingFace cache
   */
  async scanLocalModels(): Promise<ModelInfo[]> {
    const cacheDir = path.join(process.env.HOME || '', '.cache/huggingface/hub');
    const models: ModelInfo[] = [];

    if (!fs.existsSync(cacheDir)) {
      logger.warn('HuggingFace cache directory not found');
      return models;
    }

    try {
      const entries = fs.readdirSync(cacheDir);

      for (const entry of entries) {
        const modelPath = path.join(cacheDir, entry);
        const configPath = path.join(modelPath, 'config.json');

        if (fs.existsSync(configPath)) {
          try {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

            // Check if it's an embedding model
            if (config.architectures &&
                (config.architectures.includes('SentenceTransformer') ||
                 entry.includes('embed') ||
                 entry.includes('sentence-transformers'))) {

              const stats = fs.statSync(modelPath);

              models.push({
                name: entry.replace('models--', '').replace('--', '/'),
                dimensions: config.hidden_size || config.dim || 768,
                path: modelPath,
                provider: 'local',
                size: this.getDirectorySize(modelPath)
              });
            }
          } catch (error) {
            logger.debug(`Could not parse config for ${entry}`);
          }
        }
      }

      logger.info(`Found ${models.length} local embedding models`);
    } catch (error) {
      logger.error(error, 'Failed to scan local models');
    }

    return models;
  }

  /**
   * Get directory size recursively
   */
  private getDirectorySize(dirPath: string): number {
    let size = 0;

    try {
      const files = fs.readdirSync(dirPath);

      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stats = fs.statSync(filePath);

        if (stats.isDirectory()) {
          size += this.getDirectorySize(filePath);
        } else {
          size += stats.size;
        }
      }
    } catch (error) {
      // Ignore errors
    }

    return size;
  }

  /**
   * Get information about current configuration
   */
  getInfo() {
    return {
      provider: 'transformers.js',
      model: this.modelName,
      device: this.device,
      dimensions: this.dimensions,
      mpsEnabled: this.device === 'mps',
      initialized: this.isInitialized
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    this.pipeline = null;
    this.isInitialized = false;
    logger.info('Transformers embedding service cleaned up');
  }
}

// Create singleton instance
let embeddingService: TransformersEmbeddingService | null = null;

/**
 * Get or create embedding service instance
 */
export function getEmbeddingService(config?: TransformerConfig): TransformersEmbeddingService {
  if (!embeddingService) {
    embeddingService = new TransformersEmbeddingService(config);
  }
  return embeddingService;
}

/**
 * Generate embeddings using Transformers.js (replaces OpenAI)
 * This maintains the same interface as openaiHelper.ts for compatibility
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const service = getEmbeddingService();
  return service.generateEmbeddings(texts);
}

/**
 * Scan for available local models
 */
export async function scanLocalModels(): Promise<ModelInfo[]> {
  const service = getEmbeddingService();
  return service.scanLocalModels();
}

/**
 * Get embedding service info
 */
export function getEmbeddingInfo() {
  const service = getEmbeddingService();
  return service.getInfo();
}