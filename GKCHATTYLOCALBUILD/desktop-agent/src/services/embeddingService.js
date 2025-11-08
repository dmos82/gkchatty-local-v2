/**
 * Embedding Service
 *
 * Manages Transformers.js initialization and model loading
 * Detects M2 MPS acceleration and manages model cache
 */

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

class EmbeddingService {
  constructor(config) {
    this.modelPath = config.modelPath || path.join(process.env.HOME || '', '.cache/huggingface/hub');
    this.device = config.device || 'auto'; // 'auto', 'mps', 'cuda', 'cpu'
    this.detectedDevice = null;
    this.mpsEnabled = false;
    this.availableModels = [];
  }

  /**
   * Initialize embedding service
   */
  async initialize() {
    console.log('🚀 Initializing embedding service...');

    // Detect best device
    this.detectedDevice = this.detectBestDevice();
    console.log(`✅ Detected device: ${this.detectedDevice}`);

    // Scan for available models
    this.availableModels = await this.scanForModels();
    console.log(`✅ Found ${this.availableModels.length} embedding models`);

    if (this.availableModels.length === 0) {
      console.warn('⚠️  No embedding models found in HuggingFace cache');
      console.warn(`    Expected location: ${this.modelPath}`);
      console.warn('    Recommended: nomic-ai/nomic-embed-text-v1.5');
    } else {
      console.log('Available models:');
      this.availableModels.forEach(model => {
        console.log(`  - ${model.name} (${model.dimensions} dimensions)`);
      });
    }

    console.log('✅ Embedding service initialized');
  }

  /**
   * Detect the best available device for embeddings
   * Priority: MPS (Apple Silicon) > CUDA (NVIDIA) > CPU
   */
  detectBestDevice() {
    if (this.device !== 'auto') {
      return this.device;
    }

    // Check for Apple Silicon (M1/M2/M3)
    if (process.platform === 'darwin') {
      try {
        const output = execSync('sysctl -n machdep.cpu.brand_string', {
          encoding: 'utf-8'
        });

        if (output.includes('M1') || output.includes('M2') || output.includes('M3')) {
          this.mpsEnabled = true;
          console.log('✅ Apple Silicon detected - MPS acceleration enabled');
          return 'mps';
        }
      } catch (error) {
        console.warn('Could not detect CPU type:', error.message);
      }
    }

    // Check for NVIDIA GPU (future enhancement)
    // For now, default to CPU
    return 'cpu';
  }

  /**
   * Scan HuggingFace cache for available embedding models
   */
  async scanForModels() {
    if (!fs.existsSync(this.modelPath)) {
      return [];
    }

    const models = [];

    try {
      const dirs = fs.readdirSync(this.modelPath);

      for (const dir of dirs) {
        // HuggingFace models are stored as models--org--name
        if (dir.startsWith('models--')) {
          const modelPath = path.join(this.modelPath, dir);

          // Extract model name
          const nameParts = dir.replace('models--', '').split('--');
          const modelName = nameParts.join('/');

          // Check if it's an embedding model (has tokenizer_config.json)
          const snapshotDir = path.join(modelPath, 'snapshots');
          if (fs.existsSync(snapshotDir)) {
            const snapshots = fs.readdirSync(snapshotDir);
            if (snapshots.length > 0) {
              const latestSnapshot = snapshots[0];
              const configPath = path.join(snapshotDir, latestSnapshot, 'tokenizer_config.json');

              if (fs.existsSync(configPath)) {
                // Try to read dimensions from config
                let dimensions = 768; // Default
                try {
                  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                  // Some models store dimensions in model_max_length or other fields
                  dimensions = config.model_max_length || 768;
                } catch (error) {
                  // Use default
                }

                models.push({
                  name: modelName,
                  path: path.join(snapshotDir, latestSnapshot),
                  dimensions: dimensions
                });
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error scanning for models:', error);
    }

    return models;
  }

  /**
   * Get recommended model
   */
  getRecommendedModel() {
    // Prefer nomic-embed-text for MPS
    const nomicModel = this.availableModels.find(m =>
      m.name.includes('nomic-embed-text')
    );

    if (nomicModel) {
      return nomicModel;
    }

    // Fallback to first available model
    return this.availableModels[0] || null;
  }

  /**
   * Get embedding service info
   */
  getInfo() {
    return {
      device: this.detectedDevice,
      mpsEnabled: this.mpsEnabled,
      modelPath: this.modelPath,
      availableModels: this.availableModels.length,
      recommendedModel: this.getRecommendedModel()?.name || null,
      status: this.availableModels.length > 0 ? 'ready' : 'no_models'
    };
  }

  /**
   * Estimate embedding performance
   */
  estimatePerformance() {
    const baseTime = 500; // Base CPU time in ms

    if (this.detectedDevice === 'mps') {
      return {
        device: 'mps',
        estimatedTime: 50, // 50-100ms with MPS
        speedup: '5-10x vs CPU'
      };
    } else if (this.detectedDevice === 'cuda') {
      return {
        device: 'cuda',
        estimatedTime: 100,
        speedup: '3-5x vs CPU'
      };
    } else {
      return {
        device: 'cpu',
        estimatedTime: baseTime,
        speedup: 'baseline'
      };
    }
  }

  /**
   * Check if a model is downloaded
   */
  async isModelDownloaded(modelName) {
    return this.availableModels.some(m => m.name === modelName);
  }

  /**
   * Get storage path for data
   */
  getDataPath() {
    return path.join(process.env.HOME || '', '.gkchatty', 'data');
  }
}

module.exports = { EmbeddingService };
