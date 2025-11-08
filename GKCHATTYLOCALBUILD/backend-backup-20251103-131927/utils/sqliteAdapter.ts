/**
 * SQLite Adapter
 *
 * Provides Mongoose-compatible interface for SQLite database
 * Allows gradual migration from MongoDB to SQLite
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { getLogger } from './logger';

const logger = getLogger('sqliteAdapter');

// Singleton database instance
let db: Database.Database | null = null;

/**
 * Initialize SQLite database connection
 */
export function initializeDatabase(dbPath?: string): Database.Database {
  if (db) {
    return db;
  }

  // Default path: ~/.gkchatty/data/gkchatty.db
  const finalPath = dbPath || path.join(
    process.env.HOME || '',
    '.gkchatty',
    'data',
    'gkchatty.db'
  );

  // Ensure directory exists
  const dir = path.dirname(finalPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  logger.info(`Initializing SQLite database: ${finalPath}`);

  db = new Database(finalPath);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL'); // Write-Ahead Logging for better performance

  // Create tables if they don't exist
  createTables(db);

  logger.info('SQLite database initialized');
  return db;
}

/**
 * Get database instance
 */
export function getDatabase(): Database.Database {
  if (!db) {
    return initializeDatabase();
  }
  return db;
}

/**
 * Create database tables
 */
function createTables(database: Database.Database) {
  // Users table
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      _id TEXT UNIQUE NOT NULL DEFAULT (lower(hex(randomblob(12)))),
      username TEXT UNIQUE NOT NULL,
      email TEXT,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      activeSessionIds TEXT DEFAULT '[]',
      forcePasswordChange INTEGER DEFAULT 0,
      usageMonthMarker TEXT,
      currentMonthPromptTokens INTEGER DEFAULT 0,
      currentMonthCompletionTokens INTEGER DEFAULT 0,
      currentMonthCost REAL DEFAULT 0,
      isPersonaEnabled INTEGER DEFAULT 0,
      canCustomizePersona INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now'))
    )
  `);

  // Documents table
  database.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      _id TEXT UNIQUE NOT NULL DEFAULT (lower(hex(randomblob(12)))),
      userId INTEGER NOT NULL,
      filename TEXT NOT NULL,
      filePath TEXT NOT NULL,
      fileType TEXT,
      fileSize INTEGER,
      contentHash TEXT,
      embeddingProvider TEXT DEFAULT 'transformers',
      metadata TEXT DEFAULT '{}',
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Create indexes
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_documents_userId ON documents(userId);
  `);

  logger.info('Database tables created');
}

/**
 * User Model Adapter
 */
export class UserModel {
  /**
   * Find user by username
   */
  static findOne(query: { username?: string; email?: string; _id?: string }): any | null {
    const db = getDatabase();

    let sql = 'SELECT * FROM users WHERE 1=1';
    const params: any[] = [];

    if (query.username) {
      sql += ' AND username = ?';
      params.push(query.username);
    }
    if (query.email) {
      sql += ' AND email = ?';
      params.push(query.email);
    }
    if (query._id) {
      sql += ' AND _id = ?';
      params.push(query._id);
    }

    sql += ' LIMIT 1';

    const row = db.prepare(sql).get(...params);
    return row ? this.deserialize(row) : null;
  }

  /**
   * Find user by ID
   */
  static findById(id: string | number): any | null {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM users WHERE _id = ? OR id = ?').get(id, id);
    return row ? this.deserialize(row) : null;
  }

  /**
   * Find all users matching query
   */
  static find(query: any = {}): any[] {
    const db = getDatabase();

    let sql = 'SELECT * FROM users';
    const params: any[] = [];

    if (Object.keys(query).length > 0) {
      const conditions = Object.keys(query).map(key => `${key} = ?`);
      sql += ' WHERE ' + conditions.join(' AND ');
      params.push(...Object.values(query));
    }

    const rows = db.prepare(sql).all(...params);
    return rows.map(row => this.deserialize(row));
  }

  /**
   * Create new user
   */
  static create(userData: any): any {
    const db = getDatabase();

    const stmt = db.prepare(`
      INSERT INTO users (username, email, password, role, activeSessionIds)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      userData.username,
      userData.email || null,
      userData.password,
      userData.role || 'user',
      JSON.stringify(userData.activeSessionIds || [])
    );

    return this.findById(Number(result.lastInsertRowid));
  }

  /**
   * Update user
   */
  static findByIdAndUpdate(id: string | number, updates: any): any | null {
    const db = getDatabase();

    const fields = [];
    const values = [];

    // Build dynamic update query
    for (const [key, value] of Object.entries(updates)) {
      if (key === '_id' || key === 'id') continue; // Skip ID fields
      if (typeof value === 'function') continue; // Skip functions (like .save())

      fields.push(`${key} = ?`);

      // Serialize arrays and objects
      if (Array.isArray(value)) {
        values.push(JSON.stringify(value));
      } else if (typeof value === 'object' && value !== null) {
        values.push(JSON.stringify(value));
      } else {
        values.push(value);
      }
    }

    // Always update updatedAt
    fields.push('updatedAt = datetime(\'now\')');

    if (fields.length === 0) {
      return this.findById(id);
    }

    const sql = `UPDATE users SET ${fields.join(', ')} WHERE _id = ? OR id = ?`;
    values.push(id, id);

    db.prepare(sql).run(...values);

    return this.findById(id);
  }

  /**
   * Delete user
   */
  static findByIdAndDelete(id: string | number): any | null {
    const db = getDatabase();
    const user = this.findById(id);

    if (user) {
      db.prepare('DELETE FROM users WHERE _id = ? OR id = ?').run(id, id);
    }

    return user;
  }

  /**
   * Deserialize database row to Mongoose-like object
   */
  private static deserialize(row: any): any | null {
    if (!row) return null;

    // Parse JSON fields
    if (row.activeSessionIds) {
      try {
        row.activeSessionIds = JSON.parse(row.activeSessionIds);
      } catch (e) {
        row.activeSessionIds = [];
      }
    }

    // Convert integers to booleans
    row.forcePasswordChange = Boolean(row.forcePasswordChange);
    row.isPersonaEnabled = Boolean(row.isPersonaEnabled);
    row.canCustomizePersona = Boolean(row.canCustomizePersona);

    // Add Mongoose-like methods
    row.save = async function() {
      return UserModel.findByIdAndUpdate(this._id || this.id, this);
    };

    return row;
  }

  /**
   * Select specific fields (Mongoose .select())
   */
  static select(fields: string): any {
    return {
      findOne: (query: any) => {
        const user = this.findOne(query);
        if (!user) return null;

        // Include password if explicitly requested
        if (fields.includes('+password')) {
          return user;
        }

        // Exclude password by default
        const { password, ...userWithoutPassword } = user;
        return userWithoutPassword;
      }
    };
  }
}

/**
 * Document Model Adapter
 */
export class DocumentModel {
  /**
   * Find documents by query
   */
  static find(query: any = {}): any[] {
    const db = getDatabase();

    let sql = 'SELECT * FROM documents';
    const params: any[] = [];

    if (Object.keys(query).length > 0) {
      const conditions = Object.keys(query).map(key => `${key} = ?`);
      sql += ' WHERE ' + conditions.join(' AND ');
      params.push(...Object.values(query));
    }

    const rows = db.prepare(sql).all(...params);
    return rows.map(row => this.deserialize(row));
  }

  /**
   * Find document by ID
   */
  static findById(id: string | number): any | null {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM documents WHERE _id = ? OR id = ?').get(id, id);
    return row ? this.deserialize(row) : null;
  }

  /**
   * Create new document
   */
  static create(docData: any): any {
    const db = getDatabase();

    const stmt = db.prepare(`
      INSERT INTO documents (userId, filename, filePath, fileType, fileSize, contentHash, embeddingProvider, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      docData.userId,
      docData.filename,
      docData.filePath,
      docData.fileType || null,
      docData.fileSize || null,
      docData.contentHash || null,
      docData.embeddingProvider || 'transformers',
      JSON.stringify(docData.metadata || {})
    );

    return this.findById(Number(result.lastInsertRowid));
  }

  /**
   * Update document
   */
  static findByIdAndUpdate(id: string | number, updates: any): any | null {
    const db = getDatabase();

    const fields = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      if (key === '_id' || key === 'id') continue;

      fields.push(`${key} = ?`);

      if (typeof value === 'object' && value !== null) {
        values.push(JSON.stringify(value));
      } else {
        values.push(value);
      }
    }

    fields.push('updatedAt = datetime(\'now\')');

    if (fields.length === 0) {
      return this.findById(id);
    }

    const sql = `UPDATE documents SET ${fields.join(', ')} WHERE _id = ? OR id = ?`;
    values.push(id, id);

    db.prepare(sql).run(...values);

    return this.findById(id);
  }

  /**
   * Delete document
   */
  static findByIdAndDelete(id: string | number): any | null {
    const db = getDatabase();
    const doc = this.findById(id);

    if (doc) {
      db.prepare('DELETE FROM documents WHERE _id = ? OR id = ?').run(id, id);
    }

    return doc;
  }

  /**
   * Deserialize database row
   */
  private static deserialize(row: any): any | null {
    if (!row) return null;

    // Parse JSON metadata
    if (row.metadata) {
      try {
        row.metadata = JSON.parse(row.metadata);
      } catch (e) {
        row.metadata = {};
      }
    }

    return row;
  }
}

/**
 * Close database connection
 */
export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
    logger.info('Database connection closed');
  }
}
