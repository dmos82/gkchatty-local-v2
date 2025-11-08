/**
 * Backend Server Service
 *
 * Spawns and manages the Express backend API server
 * Handles initialization, health checks, and graceful shutdown
 */

const { spawn } = require('child_process');
const axios = require('axios');
const path = require('path');

class BackendServer {
  constructor(config) {
    this.port = config.port || 6001;
    this.backendPath = config.backendPath || path.join(__dirname, '../../../backend');
    this.storageService = config.storageService;
    this.embeddingService = config.embeddingService;
    this.process = null;
    this.healthCheckInterval = null;
  }

  /**
   * Start the backend server
   */
  async start() {
    console.log(`🚀 Starting backend server on port ${this.port}...`);

    return new Promise((resolve, reject) => {
      // Spawn backend process
      this.process = spawn('npm', ['run', 'dev'], {
        cwd: this.backendPath,
        env: {
          ...process.env,
          PORT: this.port,
          NODE_ENV: 'production',
          // Local storage paths
          GKCHATTY_DATA_DIR: path.join(process.env.HOME || '', '.gkchatty', 'data'),
          STORAGE_MODE: 'local',
          // Disable cloud services
          USE_LOCAL_EMBEDDINGS: 'true',
          USE_LOCAL_VECTORS: 'true'
        },
        stdio: ['ignore', 'pipe', 'pipe']
      });

      // Log stdout
      this.process.stdout.on('data', (data) => {
        console.log(`[Backend] ${data.toString().trim()}`);
      });

      // Log stderr
      this.process.stderr.on('data', (data) => {
        console.error(`[Backend Error] ${data.toString().trim()}`);
      });

      // Handle process exit
      this.process.on('exit', (code, signal) => {
        if (code !== 0) {
          console.error(`Backend server exited with code ${code} (signal: ${signal})`);
        }
      });

      // Wait for server to be ready
      this.waitForReady()
        .then(() => {
          console.log('✅ Backend server started successfully');
          this.startHealthChecks();
          resolve();
        })
        .catch((error) => {
          console.error('Failed to start backend server:', error);
          reject(error);
        });
    });
  }

  /**
   * Wait for backend server to become ready
   */
  async waitForReady(maxAttempts = 30) {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await axios.get(`http://localhost:${this.port}/health`);
        if (response.status === 200) {
          return true;
        }
      } catch (error) {
        // Server not ready yet
      }

      // Wait 1 second before next attempt
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    throw new Error('Backend server failed to start after 30 seconds');
  }

  /**
   * Start periodic health checks
   */
  startHealthChecks() {
    // Check every 30 seconds
    this.healthCheckInterval = setInterval(async () => {
      try {
        const response = await axios.get(`http://localhost:${this.port}/health`);
        if (response.status !== 200) {
          console.warn('Backend server health check failed');
        }
      } catch (error) {
        console.error('Backend server health check error:', error.message);
      }
    }, 30000);
  }

  /**
   * Get backend server status
   */
  async getStatus() {
    try {
      const response = await axios.get(`http://localhost:${this.port}/health`);
      return {
        running: true,
        healthy: response.status === 200,
        port: this.port,
        uptime: response.data.uptime || 0
      };
    } catch (error) {
      return {
        running: false,
        healthy: false,
        port: this.port,
        error: error.message
      };
    }
  }

  /**
   * Stop the backend server
   */
  async stop() {
    console.log('Stopping backend server...');

    // Clear health check interval
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Kill backend process
    if (this.process) {
      return new Promise((resolve) => {
        this.process.on('exit', () => {
          console.log('Backend server stopped');
          resolve();
        });

        // Send SIGTERM for graceful shutdown
        this.process.kill('SIGTERM');

        // Force kill after 5 seconds if not stopped
        setTimeout(() => {
          if (this.process && !this.process.killed) {
            console.warn('Force killing backend server');
            this.process.kill('SIGKILL');
          }
        }, 5000);
      });
    }
  }
}

module.exports = { BackendServer };
