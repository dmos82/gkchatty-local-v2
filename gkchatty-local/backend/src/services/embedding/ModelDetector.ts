/**
 * GKChatty Local - Model Detection & Auto-Discovery
 *
 * Automatically detects available local embedding models from:
 * - HuggingFace cache (~/.cache/huggingface/hub/)
 * - Ollama models
 * - Custom directories
 *
 * Also detects hardware capabilities (MPS for Apple Silicon, CUDA for NVIDIA)
 *
 * @module services/embedding/ModelDetector
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import axios from 'axios';
import { DetectedModel } from './types';

/**
 * Model detection configuration
 */
interface DetectionConfig {
  /** Paths to scan for models */
  searchPaths?: string[];
  /** Include Ollama models */
  includeOllama?: boolean;
  /** Include HuggingFace cache */
  includeHuggingFace?: boolean;
  /** Timeout for detection operations */
  timeout?: number;
}

/**
 * Hardware device information
 */
interface DeviceInfo {
  type: 'cpu' | 'mps' | 'cuda';
  name: string;
  available: boolean;
  memory?: number;
  computeCapability?: string;
}

/**
 * Model detector for auto-discovery of local embedding models
 */
export class ModelDetector {
  private config: DetectionConfig;
  private detectedModels: Map<string, DetectedModel> = new Map();
  private deviceInfo: DeviceInfo | null = null;

  constructor(config: DetectionConfig = {}) {
    this.config = {
      includeHuggingFace: true,
      includeOllama: true,
      timeout: 5000,
      ...config,
    };
  }

  /**
   * Scan for all available models
   * @returns Array of detected models
   */
  async scanForModels(): Promise<DetectedModel[]> {
    console.log('[ModelDetector] Starting model scan...');
    this.detectedModels.clear();

    const scanPromises: Promise<void>[] = [];

    // Scan HuggingFace cache
    if (this.config.includeHuggingFace) {
      scanPromises.push(this.scanHuggingFaceCache());
    }

    // Scan Ollama models
    if (this.config.includeOllama) {
      scanPromises.push(this.scanOllamaModels());
    }

    // Scan custom paths
    if (this.config.searchPaths && this.config.searchPaths.length > 0) {
      for (const searchPath of this.config.searchPaths) {
        scanPromises.push(this.scanDirectory(searchPath));
      }
    }

    // Wait for all scans to complete
    await Promise.all(scanPromises);

    const models = Array.from(this.detectedModels.values());
    console.log(`[ModelDetector] Found ${models.length} models`);
    return models;
  }

  /**
   * Scan HuggingFace cache directory
   */
  private async scanHuggingFaceCache(): Promise<void> {
    const cacheDir = path.join(os.homedir(), '.cache', 'huggingface', 'hub');
    console.log(`[ModelDetector] Scanning HuggingFace cache: ${cacheDir}`);

    if (!fs.existsSync(cacheDir)) {
      console.log('[ModelDetector] HuggingFace cache not found');
      return;
    }

    try {
      const entries = fs.readdirSync(cacheDir);

      for (const entry of entries) {
        // HuggingFace cache uses format: models--org--model-name
        if (entry.startsWith('models--')) {
          const modelPath = path.join(cacheDir, entry);
          const stats = fs.statSync(modelPath);

          if (stats.isDirectory()) {
            const parts = entry.split('--');
            if (parts.length >= 3) {
              const org = parts[1];
              const modelName = parts.slice(2).join('-');
              const modelId = `${org}/${modelName}`;

              // Check if this is an embedding model
              if (this.isEmbeddingModel(modelId)) {
                const model: DetectedModel = {
                  id: `huggingface-${modelId.replace('/', '-')}`,
                  name: `${modelName} (HuggingFace)`,
                  path: modelPath,
                  size: await this.getDirectorySize(modelPath),
                  dimensions: this.getModelDimensions(modelId),
                  available: true,
                  device: await this.detectBestDevice(),
                  estimatedSpeed: this.estimateSpeed(modelId),
                };

                this.detectedModels.set(model.id, model);
                console.log(`[ModelDetector] Found HuggingFace model: ${modelId}`);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('[ModelDetector] Error scanning HuggingFace cache:', error);
    }
  }

  /**
   * Scan for Ollama models
   */
  private async scanOllamaModels(): Promise<void> {
    console.log('[ModelDetector] Scanning Ollama models...');

    try {
      // Check if Ollama is running
      const response = await axios.get('http://localhost:11434/api/tags', {
        timeout: 2000,
      });

      if (response.data && response.data.models) {
        for (const model of response.data.models) {
          // Filter for embedding models
          if (this.isEmbeddingModel(model.name)) {
            const detectedModel: DetectedModel = {
              id: `ollama-${model.name}`,
              name: `${model.name} (Ollama)`,
              path: 'ollama:' + model.name,
              size: model.size || 0,
              dimensions: this.getModelDimensions(model.name),
              available: true,
              device: await this.detectBestDevice(),
              estimatedSpeed: this.estimateSpeed(model.name),
            };

            this.detectedModels.set(detectedModel.id, detectedModel);
            console.log(`[ModelDetector] Found Ollama model: ${model.name}`);
          }
        }
      }
    } catch (error) {
      console.log('[ModelDetector] Ollama not available or not running');
    }
  }

  /**
   * Scan a custom directory for models
   */
  private async scanDirectory(dirPath: string): Promise<void> {
    console.log(`[ModelDetector] Scanning directory: ${dirPath}`);

    if (!fs.existsSync(dirPath)) {
      console.log(`[ModelDetector] Directory not found: ${dirPath}`);
      return;
    }

    try {
      const entries = fs.readdirSync(dirPath);

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry);
        const stats = fs.statSync(fullPath);

        if (stats.isDirectory() && this.looksLikeModel(fullPath)) {
          const modelId = `custom-${entry}`;
          const model: DetectedModel = {
            id: modelId,
            name: `${entry} (Custom)`,
            path: fullPath,
            size: await this.getDirectorySize(fullPath),
            dimensions: 768, // Default, will be detected
            available: true,
            device: await this.detectBestDevice(),
            estimatedSpeed: 1000,
          };

          this.detectedModels.set(model.id, model);
          console.log(`[ModelDetector] Found custom model: ${entry}`);
        }
      }
    } catch (error) {
      console.error(`[ModelDetector] Error scanning directory ${dirPath}:`, error);
    }
  }

  /**
   * Detect the best available device for running models
   * @returns Device type ('cpu', 'mps', or 'cuda')
   */
  async detectBestDevice(): Promise<'cpu' | 'mps' | 'cuda'> {
    // Check for cached result
    if (this.deviceInfo) {
      return this.deviceInfo.type;
    }

    // Check for MPS (Apple Silicon)
    if (await this.hasMPS()) {
      this.deviceInfo = {
        type: 'mps',
        name: 'Apple Metal Performance Shaders',
        available: true,
      };
      console.log('[ModelDetector] MPS (Metal) available for acceleration');
      return 'mps';
    }

    // Check for CUDA (NVIDIA)
    if (await this.hasCUDA()) {
      this.deviceInfo = {
        type: 'cuda',
        name: 'NVIDIA CUDA',
        available: true,
      };
      console.log('[ModelDetector] CUDA available for acceleration');
      return 'cuda';
    }

    // Fallback to CPU
    this.deviceInfo = {
      type: 'cpu',
      name: 'CPU',
      available: true,
    };
    console.log('[ModelDetector] Using CPU (no GPU acceleration available)');
    return 'cpu';
  }

  /**
   * Check if MPS (Metal Performance Shaders) is available
   * @returns true if MPS is available (Apple Silicon Mac)
   */
  async hasMPS(): Promise<boolean> {
    // Check if running on macOS
    if (process.platform !== 'darwin') {
      return false;
    }

    try {
      // Check for Apple Silicon
      const cpuInfo = execSync('sysctl -n machdep.cpu.brand_string', {
        encoding: 'utf-8',
      }).trim();

      // Check if it's Apple Silicon (M1, M2, M3, etc.)
      if (cpuInfo.includes('Apple M')) {
        console.log(`[ModelDetector] Detected Apple Silicon: ${cpuInfo}`);

        // Additional check for MPS support in Node.js environment
        // This would require @tensorflow/tfjs-node or similar
        // For now, we assume MPS is available on all Apple Silicon Macs
        return true;
      }
    } catch (error) {
      console.error('[ModelDetector] Error detecting Apple Silicon:', error);
    }

    return false;
  }

  /**
   * Check if CUDA is available
   * @returns true if CUDA is available (NVIDIA GPU)
   */
  async hasCUDA(): Promise<boolean> {
    try {
      // Try to run nvidia-smi
      const output = execSync('nvidia-smi --query-gpu=name --format=csv,noheader', {
        encoding: 'utf-8',
      }).trim();

      if (output) {
        console.log(`[ModelDetector] Detected NVIDIA GPU: ${output}`);
        return true;
      }
    } catch (error) {
      // nvidia-smi not available or failed
    }

    return false;
  }

  /**
   * Benchmark a model to measure its performance
   * @param modelId - Model ID to benchmark
   * @returns Average time per embedding in milliseconds
   */
  async benchmarkModel(modelId: string): Promise<number> {
    console.log(`[ModelDetector] Benchmarking model: ${modelId}`);

    const model = this.detectedModels.get(modelId);
    if (!model) {
      throw new Error(`Model not found: ${modelId}`);
    }

    // This is a placeholder for actual benchmarking
    // In a real implementation, you would:
    // 1. Load the model
    // 2. Run multiple embedding operations
    // 3. Measure the time
    // 4. Return the average

    const testTexts = [
      'This is a test sentence for benchmarking.',
      'The quick brown fox jumps over the lazy dog.',
      'Machine learning models require careful evaluation.',
    ];

    const device = await this.detectBestDevice();

    // Estimate based on model and device
    // These are rough estimates
    let baseLatency = 100; // Base latency in ms

    // Adjust for device
    if (device === 'mps') {
      baseLatency *= 0.2; // MPS is ~5x faster
    } else if (device === 'cuda') {
      baseLatency *= 0.15; // CUDA is ~6-7x faster
    }

    // Adjust for model size
    if (modelId.includes('mini') || modelId.includes('small')) {
      baseLatency *= 0.5;
    } else if (modelId.includes('large') || modelId.includes('xl')) {
      baseLatency *= 2;
    }

    console.log(`[ModelDetector] Estimated latency: ${baseLatency}ms per embedding`);
    return baseLatency;
  }

  /**
   * Get system information
   */
  async getSystemInfo(): Promise<any> {
    const device = await this.detectBestDevice();

    return {
      platform: process.platform,
      arch: process.arch,
      cpus: os.cpus().map(cpu => cpu.model)[0],
      memory: {
        total: Math.round(os.totalmem() / (1024 * 1024 * 1024)) + ' GB',
        free: Math.round(os.freemem() / (1024 * 1024 * 1024)) + ' GB',
      },
      device: this.deviceInfo,
      nodeVersion: process.version,
    };
  }

  /**
   * Check if a model ID corresponds to an embedding model
   */
  private isEmbeddingModel(modelId: string): boolean {
    const embeddingKeywords = [
      'embed',
      'sentence',
      'e5',
      'minilm',
      'mpnet',
      'bert',
      'roberta',
      'nomic',
      'bge',
      'gte',
      'instructor',
    ];

    const modelLower = modelId.toLowerCase();
    return embeddingKeywords.some(keyword => modelLower.includes(keyword));
  }

  /**
   * Get expected dimensions for a model
   */
  private getModelDimensions(modelId: string): number {
    const modelLower = modelId.toLowerCase();

    // Common embedding model dimensions
    if (modelLower.includes('minilm')) return 384;
    if (modelLower.includes('mpnet')) return 768;
    if (modelLower.includes('nomic')) return 768;
    if (modelLower.includes('e5-small')) return 384;
    if (modelLower.includes('e5-base')) return 768;
    if (modelLower.includes('e5-large')) return 1024;
    if (modelLower.includes('bge-small')) return 384;
    if (modelLower.includes('bge-base')) return 768;
    if (modelLower.includes('bge-large')) return 1024;

    // Default
    return 768;
  }

  /**
   * Estimate embedding speed for a model
   */
  private estimateSpeed(modelId: string): number {
    const modelLower = modelId.toLowerCase();

    // Embeddings per second (rough estimates)
    if (modelLower.includes('minilm')) return 5000;
    if (modelLower.includes('mpnet')) return 3000;
    if (modelLower.includes('nomic')) return 4000;
    if (modelLower.includes('large')) return 1500;

    return 2000; // Default
  }

  /**
   * Check if a directory looks like a model
   */
  private looksLikeModel(dirPath: string): boolean {
    const modelFiles = [
      'config.json',
      'model.safetensors',
      'model.bin',
      'pytorch_model.bin',
      'tokenizer_config.json',
    ];

    try {
      const files = fs.readdirSync(dirPath);
      return modelFiles.some(modelFile => files.includes(modelFile));
    } catch {
      return false;
    }
  }

  /**
   * Get the size of a directory in bytes
   */
  private async getDirectorySize(dirPath: string): Promise<number> {
    let size = 0;

    try {
      const files = fs.readdirSync(dirPath);

      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stats = fs.statSync(filePath);

        if (stats.isFile()) {
          size += stats.size;
        } else if (stats.isDirectory()) {
          size += await this.getDirectorySize(filePath);
        }
      }
    } catch (error) {
      console.error(`[ModelDetector] Error calculating directory size:`, error);
    }

    return size;
  }
}

/**
 * Create a model detector with default configuration
 */
export function createModelDetector(config?: DetectionConfig): ModelDetector {
  return new ModelDetector(config);
}

/**
 * Quick function to detect if running on Apple Silicon with MPS
 */
export async function detectAppleSiliconMPS(): Promise<boolean> {
  const detector = new ModelDetector();
  return await detector.hasMPS();
}