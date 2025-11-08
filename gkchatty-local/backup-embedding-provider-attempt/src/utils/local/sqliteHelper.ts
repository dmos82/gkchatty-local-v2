import 'dotenv/config';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { getLogger } from '../logger';

const log = getLogger('sqliteHelper');

// Configuration
const STORAGE_MODE = process.env.GKCHATTY_STORAGE || 'local';
const GKCHATTY_HOME = process.env.GKCHATTY_HOME || path.join(os.homedir(), '.gkchatty');
const DB_PATH = path.join(GKCHATTY_HOME, 'data', 'gkchatty.db');

let db: Database.Database | null = null;

/**
 * Initialize SQLite database with proper directory structure
 */
const initializeDirectories = () => {
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    log.debug(`Created data directory: ${dataDir}`);
  }
};

/**
 * Create database schema
 */
const createSchema = (database: Database.Database) => {
  // Users table (replaces MongoDB users collection)
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      username TEXT UNIQUE NOT NULL,
      passwordHash TEXT,
      role TEXT DEFAULT 'user',
      settings TEXT DEFAULT '{}',
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      lastLogin TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
  `);

  // Documents table (replaces MongoDB documents collection)
  database.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      projectId TEXT,
      filename TEXT NOT NULL,
      content TEXT,
      metadata TEXT DEFAULT '{}',
      embeddings BLOB,
      vectorId TEXT,
      contentHash TEXT,
      fileSize INTEGER,
      mimeType TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_documents_userId ON documents(userId);
    CREATE INDEX IF NOT EXISTS idx_documents_projectId ON documents(projectId);
    CREATE INDEX IF NOT EXISTS idx_documents_filename ON documents(filename);
  `);

  // Projects table
  database.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      settings TEXT DEFAULT '{}',
      isActive INTEGER DEFAULT 1,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_projects_userId ON projects(userId);
    CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(name);
  `);

  // Settings table (for app-wide settings)
  database.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // API Keys table
  database.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      key TEXT UNIQUE NOT NULL,
      name TEXT,
      permissions TEXT DEFAULT '[]',
      lastUsed TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      expiresAt TEXT,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_api_keys_key ON api_keys(key);
    CREATE INDEX IF NOT EXISTS idx_api_keys_userId ON api_keys(userId);
  `);

  // Chat history table
  database.exec(`
    CREATE TABLE IF NOT EXISTS chat_history (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      projectId TEXT,
      messages TEXT NOT NULL,
      metadata TEXT DEFAULT '{}',
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_chat_history_userId ON chat_history(userId);
    CREATE INDEX IF NOT EXISTS idx_chat_history_projectId ON chat_history(projectId);
  `);

  log.debug('✅ SQLite schema created/verified');
};

/**
 * Connects to the SQLite database (creates if doesn't exist)
 */
export const connectDB = async () => {
  try {
    if (STORAGE_MODE !== 'local') {
      log.debug(`Storage mode is '${STORAGE_MODE}', skipping SQLite connection`);
      return;
    }

    // Initialize directories
    initializeDirectories();

    // Create database connection
    db = new Database(DB_PATH, { verbose: log.debug });

    // Enable foreign key constraints
    db.pragma('foreign_keys = ON');

    // Set WAL mode for better concurrency
    db.pragma('journal_mode = WAL');

    // Create schema
    createSchema(db);

    log.debug(`✅ SQLite Connected successfully to: ${DB_PATH}`);

    // Log database info
    const tableCount = db.prepare("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'").get() as any;
    log.debug(`Database has ${tableCount.count} tables`);

  } catch (err: any) {
    log.error('❌ SQLite connection FAILED:', err);
    throw err;
  }
};

/**
 * Disconnects from the SQLite database
 */
export const disconnectDB = async () => {
  try {
    if (db) {
      db.close();
      db = null;
      log.debug('🔌 SQLite disconnected successfully.');
    }
  } catch (err) {
    log.error('❌ Error disconnecting from SQLite:', err);
  }
};

/**
 * Get the database instance
 */
export const getDB = (): Database.Database => {
  if (!db) {
    throw new Error('SQLite database not connected. Call connectDB() first.');
  }
  return db;
};

/**
 * Transaction helper
 */
export const transaction = <T>(fn: (db: Database.Database) => T): T => {
  const database = getDB();
  return database.transaction(fn)(database);
};

/**
 * Backup database
 */
export const backupDB = async (backupPath?: string): Promise<void> => {
  const database = getDB();
  const dest = backupPath || path.join(GKCHATTY_HOME, 'backups', `gkchatty_${Date.now()}.db`);

  // Ensure backup directory exists
  const backupDir = path.dirname(dest);
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  await database.backup(dest);
  log.debug(`✅ Database backed up to: ${dest}`);
};

/**
 * Get storage info
 */
export const getStorageInfo = () => {
  if (!db) {
    return null;
  }

  const stats = fs.statSync(DB_PATH);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();

  const documentCount = db.prepare('SELECT COUNT(*) as count FROM documents').get() as any;
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as any;
  const projectCount = db.prepare('SELECT COUNT(*) as count FROM projects').get() as any;

  return {
    mode: 'local',
    backend: 'SQLite',
    path: DB_PATH,
    sizeBytes: stats.size,
    sizeMB: (stats.size / 1024 / 1024).toFixed(2),
    tables: tables.map((t: any) => t.name),
    counts: {
      documents: documentCount.count,
      users: userCount.count,
      projects: projectCount.count
    },
    lastModified: stats.mtime
  };
};

// Export for compatibility with existing code that expects mongoose-like interface
export default {
  connect: connectDB,
  disconnect: disconnectDB,
  getDB,
  transaction,
  backupDB,
  getStorageInfo
};