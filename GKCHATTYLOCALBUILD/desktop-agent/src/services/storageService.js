/**
 * Storage Service
 *
 * Manages local storage with SQLite + ChromaDB
 * Provides unified interface for database and vector operations
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class StorageService {
  constructor(config) {
    this.dbPath = config.dbPath || path.join(process.env.HOME || '', '.gkchatty', 'data', 'gkchatty.db');
    this.chromaPath = config.chromaPath || path.join(process.env.HOME || '', '.gkchatty', 'data', 'chroma');
    this.db = null;
    this.mode = 'local'; // 'local' or 'cloud'
  }

  /**
   * Initialize storage service
   */
  async initialize() {
    console.log('🚀 Initializing storage service...');

    // Ensure data directories exist
    this.ensureDirectories();

    // Initialize SQLite database
    await this.initializeDatabase();

    // Initialize ChromaDB (handled by chromaService in backend)
    console.log(`✅ ChromaDB path: ${this.chromaPath}`);

    console.log('✅ Storage service initialized');
  }

  /**
   * Ensure all necessary directories exist
   */
  ensureDirectories() {
    const dirs = [
      path.dirname(this.dbPath),
      this.chromaPath,
      path.join(path.dirname(this.dbPath), 'documents'),
      path.join(path.dirname(this.dbPath), 'uploads')
    ];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`Created directory: ${dir}`);
      }
    }
  }

  /**
   * Initialize SQLite database with schema
   */
  async initializeDatabase() {
    console.log(`Opening database: ${this.dbPath}`);

    // Open database
    this.db = new Database(this.dbPath);

    // Enable foreign keys
    this.db.pragma('foreign_keys = ON');

    // Create tables
    this.createTables();

    // Insert default data if needed
    this.insertDefaults();

    console.log('✅ SQLite database initialized');
  }

  /**
   * Create database tables
   */
  createTables() {
    // Users table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE,
        password_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Documents table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        filename TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_type TEXT,
        file_size INTEGER,
        content_hash TEXT,
        embedding_provider TEXT DEFAULT 'transformers',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Projects table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        namespace TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Settings table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        key TEXT NOT NULL,
        value TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, key)
      )
    `);

    // Embedding providers table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS embedding_providers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        type TEXT NOT NULL,
        model_name TEXT,
        dimensions INTEGER,
        is_active BOOLEAN DEFAULT 0,
        config TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ Database tables created');
  }

  /**
   * Insert default data
   */
  insertDefaults() {
    // Check if default user exists
    const defaultUser = this.db.prepare('SELECT id FROM users WHERE username = ?').get('default');

    if (!defaultUser) {
      // Create default user
      this.db.prepare(`
        INSERT INTO users (username, email, password_hash)
        VALUES (?, ?, ?)
      `).run('default', 'default@gkchatty.local', 'default_hash');

      console.log('✅ Created default user');
    }

    // Check if default embedding provider exists
    const defaultProvider = this.db.prepare('SELECT id FROM embedding_providers WHERE name = ?').get('transformers');

    if (!defaultProvider) {
      // Create default Transformers.js provider
      this.db.prepare(`
        INSERT INTO embedding_providers (name, type, model_name, dimensions, is_active)
        VALUES (?, ?, ?, ?, ?)
      `).run('transformers', 'local', 'nomic-embed-text-v1.5', 768, 1);

      console.log('✅ Created default embedding provider');
    }
  }

  /**
   * Get storage info
   */
  async getInfo() {
    const userCount = this.db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    const documentCount = this.db.prepare('SELECT COUNT(*) as count FROM documents').get().count;
    const projectCount = this.db.prepare('SELECT COUNT(*) as count FROM projects').get().count;

    // Get active provider
    const activeProvider = this.db.prepare(
      'SELECT name, type, model_name FROM embedding_providers WHERE is_active = 1'
    ).get();

    return {
      mode: this.mode,
      database: {
        path: this.dbPath,
        size: this.getDatabaseSize()
      },
      chromaPath: this.chromaPath,
      counts: {
        users: userCount,
        documents: documentCount,
        projects: projectCount
      },
      activeProvider: activeProvider || null
    };
  }

  /**
   * Get database size in bytes
   */
  getDatabaseSize() {
    try {
      const stats = fs.statSync(this.dbPath);
      return stats.size;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Switch storage mode (local <-> cloud)
   */
  async setMode(mode) {
    if (mode !== 'local' && mode !== 'cloud') {
      throw new Error('Invalid storage mode. Must be "local" or "cloud"');
    }

    this.mode = mode;

    // Update setting in database
    const defaultUser = this.db.prepare('SELECT id FROM users WHERE username = ?').get('default');
    if (defaultUser) {
      this.db.prepare(`
        INSERT OR REPLACE INTO settings (user_id, key, value, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      `).run(defaultUser.id, 'storage_mode', mode);
    }

    console.log(`✅ Storage mode set to: ${mode}`);
  }

  /**
   * Get current storage mode
   */
  getMode() {
    return this.mode;
  }

  /**
   * Close database connection
   */
  async close() {
    if (this.db) {
      this.db.close();
      console.log('Storage service closed');
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      // Test database connection
      this.db.prepare('SELECT 1').get();

      // Test directory access
      fs.accessSync(this.chromaPath, fs.constants.R_OK | fs.constants.W_OK);

      return {
        healthy: true,
        database: 'ok',
        chromaPath: 'ok'
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message
      };
    }
  }
}

module.exports = { StorageService };
