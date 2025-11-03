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

  // UserDocuments table
  database.exec(`
    CREATE TABLE IF NOT EXISTS userdocuments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      _id TEXT UNIQUE NOT NULL DEFAULT (lower(hex(randomblob(12)))),
      userId TEXT,
      sourceType TEXT NOT NULL DEFAULT 'user',
      tenantKbId TEXT,
      folderId TEXT,
      originalFileName TEXT NOT NULL,
      s3Bucket TEXT NOT NULL,
      s3Key TEXT NOT NULL,
      file_extension TEXT NOT NULL,
      fileSize INTEGER NOT NULL,
      mimeType TEXT NOT NULL,
      uploadTimestamp TEXT DEFAULT (datetime('now')),
      status TEXT NOT NULL DEFAULT 'pending',
      contentHash TEXT,
      processingError TEXT,
      errorCode TEXT,
      chunkCount INTEGER,
      metadata TEXT DEFAULT '{}',
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now'))
    )
  `);

  // SystemKbDocuments table
  database.exec(`
    CREATE TABLE IF NOT EXISTS systemkbdocuments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      _id TEXT UNIQUE NOT NULL DEFAULT (lower(hex(randomblob(12)))),
      filename TEXT NOT NULL,
      s3Key TEXT UNIQUE NOT NULL,
      fileUrl TEXT NOT NULL,
      textContent TEXT,
      fileSize INTEGER DEFAULT 0,
      mimeType TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      statusDetail TEXT,
      folderId TEXT,
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now'))
    )
  `);

  // Create indexes
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_documents_userId ON documents(userId);

    -- UserDocuments indexes
    CREATE INDEX IF NOT EXISTS idx_userdocs_userId_sourceType ON userdocuments(userId, sourceType);
    CREATE INDEX IF NOT EXISTS idx_userdocs_sourceType_filename ON userdocuments(sourceType, originalFileName);
    CREATE INDEX IF NOT EXISTS idx_userdocs_userId_sourceType_filename ON userdocuments(userId, sourceType, originalFileName);
    CREATE INDEX IF NOT EXISTS idx_userdocs_userId_contentHash_sourceType ON userdocuments(userId, contentHash, sourceType);
    CREATE INDEX IF NOT EXISTS idx_userdocs_tenantKbId_sourceType ON userdocuments(tenantKbId, sourceType);
    CREATE INDEX IF NOT EXISTS idx_userdocs_tenantKbId_contentHash ON userdocuments(tenantKbId, contentHash);
    CREATE INDEX IF NOT EXISTS idx_userdocs_s3Key ON userdocuments(s3Key);
    CREATE INDEX IF NOT EXISTS idx_userdocs_status ON userdocuments(status);

    -- SystemKbDocuments indexes
    CREATE INDEX IF NOT EXISTS idx_systemkb_s3Key ON systemkbdocuments(s3Key);
    CREATE INDEX IF NOT EXISTS idx_systemkb_status ON systemkbdocuments(status);
    CREATE INDEX IF NOT EXISTS idx_systemkb_filename ON systemkbdocuments(filename);

    -- ===== CHATS TABLE =====
    CREATE TABLE IF NOT EXISTS chats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      _id TEXT UNIQUE NOT NULL DEFAULT (lower(hex(randomblob(12)))),
      userId TEXT NOT NULL,
      chatName TEXT NOT NULL DEFAULT 'New Chat',
      messages TEXT DEFAULT '[]',
      notes TEXT,
      personaId TEXT,
      currentSearchMode TEXT DEFAULT 'unified',
      activeTenantKbId TEXT,
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now'))
    );

    -- Chats indexes
    CREATE INDEX IF NOT EXISTS idx_chats_userId ON chats(userId);
    CREATE INDEX IF NOT EXISTS idx_chats_userId_updatedAt ON chats(userId, updatedAt DESC);
    CREATE INDEX IF NOT EXISTS idx_chats_userId_id ON chats(userId, _id);

    -- ===== PERSONAS TABLE =====
    CREATE TABLE IF NOT EXISTS personas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      _id TEXT UNIQUE NOT NULL DEFAULT (lower(hex(randomblob(12)))),
      name TEXT NOT NULL,
      prompt TEXT NOT NULL,
      systemPrompt TEXT,
      userId TEXT NOT NULL,
      isActive INTEGER DEFAULT 0,
      isDefault INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now'))
    );

    -- Personas indexes
    CREATE INDEX IF NOT EXISTS idx_personas_userId ON personas(userId);
    CREATE INDEX IF NOT EXISTS idx_personas_isDefault ON personas(isDefault);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_personas_userId_isActive ON personas(userId, isActive) WHERE isActive = 1;

    -- ===== SETTINGS TABLE =====
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      _id TEXT UNIQUE NOT NULL DEFAULT (lower(hex(randomblob(12)))),
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL,
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now'))
    );

    -- Settings indexes
    CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_key ON settings(key);

    -- ===== FOLDERS TABLE =====
    CREATE TABLE IF NOT EXISTS folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      _id TEXT UNIQUE NOT NULL DEFAULT (lower(hex(randomblob(12)))),
      name TEXT NOT NULL,
      parentId TEXT,
      knowledgeBaseId TEXT,
      path TEXT NOT NULL,
      ownerId TEXT NOT NULL,
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now'))
    );

    -- Folders indexes
    CREATE INDEX IF NOT EXISTS idx_folders_path ON folders(path);
    CREATE INDEX IF NOT EXISTS idx_folders_ownerId ON folders(ownerId);
    CREATE INDEX IF NOT EXISTS idx_folders_ownerId_parentId ON folders(ownerId, parentId);
    CREATE INDEX IF NOT EXISTS idx_folders_knowledgeBaseId_parentId ON folders(knowledgeBaseId, parentId);
    CREATE INDEX IF NOT EXISTS idx_folders_path_ownerId ON folders(path, ownerId);

    -- ===== TENANT KNOWLEDGE BASES TABLE =====
    CREATE TABLE IF NOT EXISTS tenant_knowledge_bases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      _id TEXT UNIQUE NOT NULL DEFAULT (lower(hex(randomblob(12)))),
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      description TEXT,
      s3Prefix TEXT UNIQUE NOT NULL,
      color TEXT DEFAULT '#6B7280',
      icon TEXT,
      shortName TEXT,
      accessType TEXT DEFAULT 'restricted',
      allowedRoles TEXT DEFAULT '[]',
      allowedUsers TEXT DEFAULT '[]',
      isActive INTEGER DEFAULT 1,
      documentCount INTEGER DEFAULT 0,
      createdBy TEXT NOT NULL,
      lastModifiedBy TEXT,
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now'))
    );

    -- Tenant Knowledge Bases indexes
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tkb_slug ON tenant_knowledge_bases(slug);
    CREATE INDEX IF NOT EXISTS idx_tkb_isActive ON tenant_knowledge_bases(isActive);
    CREATE INDEX IF NOT EXISTS idx_tkb_createdAt ON tenant_knowledge_bases(createdAt DESC);

    -- ===== USER SETTINGS TABLE =====
    CREATE TABLE IF NOT EXISTS user_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      _id TEXT UNIQUE NOT NULL DEFAULT (lower(hex(randomblob(12)))),
      userId TEXT UNIQUE NOT NULL,
      customPrompt TEXT,
      iconUrl TEXT,
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now'))
    );

    -- User Settings indexes
    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_settings_userId ON user_settings(userId);

    -- ===== FEEDBACK TABLE =====
    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      _id TEXT UNIQUE NOT NULL DEFAULT (lower(hex(randomblob(12)))),
      feedbackText TEXT NOT NULL,
      userId TEXT NOT NULL,
      username TEXT NOT NULL,
      chatId TEXT,
      createdAt TEXT DEFAULT (datetime('now'))
    );

    -- Feedback indexes
    CREATE INDEX IF NOT EXISTS idx_feedback_userId ON feedback(userId);
    CREATE INDEX IF NOT EXISTS idx_feedback_chatId ON feedback(chatId);
    CREATE INDEX IF NOT EXISTS idx_feedback_createdAt ON feedback(createdAt);
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
   * Returns a chainable query object to support Mongoose-style .select()
   */
  static findById(id: string | number): any {
    const db = getDatabase();

    // Return a query object with select() method for Mongoose compatibility
    return {
      select: (fields: string) => {
        const fieldsArray = fields.split(' ').filter(f => f.trim());
        const selectFields = fieldsArray.length > 0 ? fieldsArray.join(', ') : '*';

        const row = db.prepare(`SELECT ${selectFields} FROM users WHERE _id = ? OR id = ?`).get(id, id);
        return row ? UserModel.deserialize(row) : null;
      },
      // If select() is not called, return the full object
      then: (resolve: any, reject: any) => {
        const row = db.prepare('SELECT * FROM users WHERE _id = ? OR id = ?').get(id, id);
        const result = row ? UserModel.deserialize(row) : null;
        return resolve(result);
      }
    };
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
      if (value === undefined) continue; // Skip undefined values

      fields.push(`${key} = ?`);

      // Serialize arrays and objects
      if (Array.isArray(value)) {
        logger.debug(`Serializing array field ${key}: ${JSON.stringify(value)}`);
        values.push(JSON.stringify(value));
      } else if (typeof value === 'object' && value !== null) {
        logger.debug(`Serializing object field ${key}: ${JSON.stringify(value)}`);
        values.push(JSON.stringify(value));
      } else {
        logger.debug(`Adding primitive field ${key}: ${value} (type: ${typeof value})`);
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
 * UserDocument Model Adapter
 */
export class UserDocumentModel {
  /**
   * Find documents by query
   */
  static find(query: any = {}): any[] {
    const db = getDatabase();

    let sql = 'SELECT * FROM userdocuments';
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
   * Find one document by query
   */
  static findOne(query: any): any | null {
    const db = getDatabase();

    let sql = 'SELECT * FROM userdocuments WHERE 1=1';
    const params: any[] = [];

    if (query.userId) {
      sql += ' AND userId = ?';
      params.push(query.userId.toString ? query.userId.toString() : query.userId);
    }
    if (query.contentHash) {
      sql += ' AND contentHash = ?';
      params.push(query.contentHash);
    }
    if (query.sourceType) {
      sql += ' AND sourceType = ?';
      params.push(query.sourceType);
    }
    if (query.tenantKbId) {
      sql += ' AND tenantKbId = ?';
      params.push(query.tenantKbId.toString ? query.tenantKbId.toString() : query.tenantKbId);
    }
    if (query._id) {
      sql += ' AND _id = ?';
      params.push(query._id.toString ? query._id.toString() : query._id);
    }

    sql += ' LIMIT 1';

    const row = db.prepare(sql).get(...params);
    return row ? this.deserialize(row) : null;
  }

  /**
   * Find document by ID
   */
  static findById(id: string | number): any | null {
    const db = getDatabase();
    const idStr = id.toString ? id.toString() : String(id);
    const row = db.prepare('SELECT * FROM userdocuments WHERE _id = ? OR id = ?').get(idStr, idStr);
    return row ? this.deserialize(row) : null;
  }

  /**
   * Create new document
   */
  static create(docData: any): any {
    const db = getDatabase();

    const stmt = db.prepare(`
      INSERT INTO userdocuments (
        userId, sourceType, tenantKbId, folderId, originalFileName,
        s3Bucket, s3Key, file_extension, fileSize, mimeType,
        uploadTimestamp, status, contentHash, processingError, errorCode,
        chunkCount, metadata
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      docData.userId ? (docData.userId.toString ? docData.userId.toString() : docData.userId) : null,
      docData.sourceType || 'user',
      docData.tenantKbId ? (docData.tenantKbId.toString ? docData.tenantKbId.toString() : docData.tenantKbId) : null,
      docData.folderId ? (docData.folderId.toString ? docData.folderId.toString() : docData.folderId) : null,
      docData.originalFileName,
      docData.s3Bucket,
      docData.s3Key,
      docData.file_extension,
      docData.fileSize,
      docData.mimeType,
      docData.uploadTimestamp ? new Date(docData.uploadTimestamp).toISOString() : new Date().toISOString(),
      docData.status || 'pending',
      docData.contentHash || null,
      docData.processingError || null,
      docData.errorCode || null,
      docData.chunkCount || null,
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
      if (typeof value === 'function') continue;
      if (value === undefined) continue;

      fields.push(`${key} = ?`);

      // Handle ObjectId fields
      if (key === 'userId' || key === 'tenantKbId' || key === 'folderId') {
        values.push(value ? (value.toString ? value.toString() : String(value)) : null);
      }
      // Handle Date fields
      else if (key === 'uploadTimestamp' || key === 'createdAt' || key === 'updatedAt') {
        values.push(value ? new Date(value).toISOString() : new Date().toISOString());
      }
      // Serialize metadata object
      else if (key === 'metadata' && typeof value === 'object' && value !== null) {
        values.push(JSON.stringify(value));
      }
      // Handle arrays
      else if (Array.isArray(value)) {
        values.push(JSON.stringify(value));
      }
      // Handle objects
      else if (typeof value === 'object' && value !== null) {
        values.push(JSON.stringify(value));
      }
      // Primitives
      else {
        values.push(value);
      }
    }

    fields.push('updatedAt = datetime(\'now\')');

    if (fields.length === 0) {
      return this.findById(id);
    }

    const idStr = id.toString ? id.toString() : String(id);
    const sql = `UPDATE userdocuments SET ${fields.join(', ')} WHERE _id = ? OR id = ?`;
    values.push(idStr, idStr);

    db.prepare(sql).run(...values);

    return this.findById(id);
  }

  /**
   * Delete document by ID
   */
  static findByIdAndDelete(id: string | number): any | null {
    const db = getDatabase();
    const doc = this.findById(id);

    if (doc) {
      const idStr = id.toString ? id.toString() : String(id);
      db.prepare('DELETE FROM userdocuments WHERE _id = ? OR id = ?').run(idStr, idStr);
    }

    return doc;
  }

  /**
   * Delete one document matching query
   */
  static deleteOne(query: any): { deletedCount: number } {
    const db = getDatabase();
    const doc = this.findOne(query);

    if (doc) {
      db.prepare('DELETE FROM userdocuments WHERE _id = ?').run(doc._id);
      return { deletedCount: 1 };
    }

    return { deletedCount: 0 };
  }

  /**
   * Delete many documents matching query
   */
  static deleteMany(query: any): { deletedCount: number } {
    const db = getDatabase();

    let sql = 'DELETE FROM userdocuments WHERE 1=1';
    const params: any[] = [];

    if (query.userId) {
      sql += ' AND userId = ?';
      params.push(query.userId.toString ? query.userId.toString() : query.userId);
    }
    if (query.sourceType) {
      sql += ' AND sourceType = ?';
      params.push(query.sourceType);
    }
    if (query.tenantKbId) {
      sql += ' AND tenantKbId = ?';
      params.push(query.tenantKbId.toString ? query.tenantKbId.toString() : query.tenantKbId);
    }

    const result = db.prepare(sql).run(...params);
    return { deletedCount: result.changes };
  }

  /**
   * Select specific fields (Mongoose .select())
   */
  static select(fields: string): any {
    return {
      findOne: (query: any) => {
        return this.findOne(query);
      },
      sort: (sortQuery: any) => {
        // Return chainable object with exec method
        return {
          exec: () => this.find(query)
        };
      }
    };
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

    // Convert uploadTimestamp to Date
    if (row.uploadTimestamp) {
      row.uploadTimestamp = new Date(row.uploadTimestamp);
    }

    // Add Mongoose-like _id if not present
    if (!row._id && row.id) {
      row._id = row.id.toString();
    }

    return row;
  }
}

/**
 * SystemKbDocument Model Adapter
 */
export class SystemKbDocumentModel {
  /**
   * Find documents by query
   */
  static find(query: any = {}): any[] {
    const db = getDatabase();

    let sql = 'SELECT * FROM systemkbdocuments';
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
   * Find one document by query
   */
  static findOne(query: any): any | null {
    const db = getDatabase();

    let sql = 'SELECT * FROM systemkbdocuments WHERE 1=1';
    const params: any[] = [];

    if (query.s3Key) {
      sql += ' AND s3Key = ?';
      params.push(query.s3Key);
    }
    if (query._id) {
      sql += ' AND _id = ?';
      params.push(query._id.toString ? query._id.toString() : query._id);
    }
    if (query.filename) {
      sql += ' AND filename = ?';
      params.push(query.filename);
    }

    sql += ' LIMIT 1';

    const row = db.prepare(sql).get(...params);
    return row ? this.deserialize(row) : null;
  }

  /**
   * Find document by ID
   */
  static findById(id: string | number): any | null {
    const db = getDatabase();
    const idStr = id.toString ? id.toString() : String(id);
    const row = db.prepare('SELECT * FROM systemkbdocuments WHERE _id = ? OR id = ?').get(idStr, idStr);
    return row ? this.deserialize(row) : null;
  }

  /**
   * Create new system KB document
   */
  static create(docData: any): any {
    const db = getDatabase();

    const stmt = db.prepare(`
      INSERT INTO systemkbdocuments (
        filename, s3Key, fileUrl, textContent, fileSize, mimeType,
        status, statusDetail, folderId
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      docData.filename,
      docData.s3Key,
      docData.fileUrl,
      docData.textContent || null,
      docData.fileSize || 0,
      docData.mimeType || null,
      docData.status || 'pending',
      docData.statusDetail || null,
      docData.folderId || null
    );

    return this.findById(Number(result.lastInsertRowid));
  }

  /**
   * Update system KB document
   */
  static findByIdAndUpdate(id: string | number, updates: any): any | null {
    const db = getDatabase();

    const fields = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      if (key === '_id' || key === 'id') continue;
      if (typeof value === 'function') continue;
      if (value === undefined) continue;

      fields.push(`${key} = ?`);

      // Handle Date fields
      if (key === 'createdAt' || key === 'updatedAt') {
        values.push(value ? new Date(value).toISOString() : new Date().toISOString());
      }
      // Handle objects
      else if (typeof value === 'object' && value !== null) {
        values.push(JSON.stringify(value));
      }
      // Primitives
      else {
        values.push(value);
      }
    }

    fields.push('updatedAt = datetime(\'now\')');

    if (fields.length === 0) {
      return this.findById(id);
    }

    const idStr = id.toString ? id.toString() : String(id);
    const sql = `UPDATE systemkbdocuments SET ${fields.join(', ')} WHERE _id = ? OR id = ?`;
    values.push(idStr, idStr);

    db.prepare(sql).run(...values);

    return this.findById(id);
  }

  /**
   * Delete system KB document by ID
   */
  static findByIdAndDelete(id: string | number): any | null {
    const db = getDatabase();
    const doc = this.findById(id);

    if (doc) {
      const idStr = id.toString ? id.toString() : String(id);
      db.prepare('DELETE FROM systemkbdocuments WHERE _id = ? OR id = ?').run(idStr, idStr);
    }

    return doc;
  }

  /**
   * Deserialize database row
   */
  private static deserialize(row: any): any | null {
    if (!row) return null;

    // Convert dates
    if (row.createdAt) {
      row.createdAt = new Date(row.createdAt);
    }
    if (row.updatedAt) {
      row.updatedAt = new Date(row.updatedAt);
    }

    // Add Mongoose-like _id if not present
    if (!row._id && row.id) {
      row._id = row.id.toString();
    }

    return row;
  }
}

/**
 * Chat Model Adapter
 *
 * Handles chat conversations with embedded messages stored as JSON
 */
export class ChatModel {
  /**
   * Generate ObjectId-like string for message _id
   */
  private static generateObjectId(): string {
    const timestamp = Math.floor(new Date().getTime() / 1000).toString(16);
    const randomHex = () => Math.floor(Math.random() * 16).toString(16);
    return timestamp + Array(16).fill(0).map(randomHex).join('');
  }

  /**
   * Find chats by query
   */
  static find(query: any = {}): any[] {
    const db = getDatabase();
    let sql = 'SELECT * FROM chats WHERE 1=1';
    const params: any[] = [];

    if (query.userId) {
      sql += ' AND userId = ?';
      params.push(query.userId.toString ? query.userId.toString() : query.userId);
    }

    if (query._id) {
      sql += ' AND _id = ?';
      params.push(query._id.toString ? query._id.toString() : query._id);
    }

    // Default sort by updatedAt DESC
    sql += ' ORDER BY updatedAt DESC';

    const rows = db.prepare(sql).all(...params);
    return rows.map(row => this.deserialize(row));
  }

  /**
   * Find single chat by query
   */
  static findOne(query: any): any | null {
    const db = getDatabase();
    let sql = 'SELECT * FROM chats WHERE 1=1';
    const params: any[] = [];

    if (query.userId) {
      sql += ' AND userId = ?';
      params.push(query.userId.toString ? query.userId.toString() : query.userId);
    }

    if (query._id) {
      sql += ' AND _id = ?';
      params.push(query._id.toString ? query._id.toString() : query._id);
    }

    if (query.chatName) {
      sql += ' AND chatName LIKE ?';
      params.push(`%${query.chatName}%`);
    }

    const row = db.prepare(sql).get(...params);
    return row ? this.deserialize(row) : null;
  }

  /**
   * Find chat by ID
   */
  static findById(id: string | number): any | null {
    const db = getDatabase();
    const idStr = id.toString ? id.toString() : String(id);

    const row = db.prepare('SELECT * FROM chats WHERE _id = ? OR id = ?').get(idStr, idStr);
    return row ? this.deserialize(row) : null;
  }

  /**
   * Create new chat
   */
  static create(chatData: any): any {
    const db = getDatabase();

    const stmt = db.prepare(`
      INSERT INTO chats (
        userId, chatName, messages, notes, personaId,
        currentSearchMode, activeTenantKbId
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      chatData.userId ? (chatData.userId.toString ? chatData.userId.toString() : chatData.userId) : null,
      chatData.chatName || 'New Chat',
      JSON.stringify(chatData.messages || []),
      chatData.notes || null,
      chatData.personaId ? (chatData.personaId.toString ? chatData.personaId.toString() : chatData.personaId) : null,
      chatData.currentSearchMode || 'unified',
      chatData.activeTenantKbId ? (chatData.activeTenantKbId.toString ? chatData.activeTenantKbId.toString() : chatData.activeTenantKbId) : null
    );

    return this.findById(Number(result.lastInsertRowid));
  }

  /**
   * Update chat by ID
   */
  static findByIdAndUpdate(id: string | number, updates: any): any | null {
    const db = getDatabase();

    const fields = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      if (key === '_id' || key === 'id') continue;
      if (typeof value === 'function') continue;
      if (value === undefined) continue;

      fields.push(`${key} = ?`);

      // Handle ObjectId fields
      if (key === 'userId' || key === 'personaId' || key === 'activeTenantKbId') {
        values.push(value ? (value.toString ? value.toString() : String(value)) : null);
      }
      // Handle Date fields
      else if (key === 'createdAt' || key === 'updatedAt') {
        values.push(value ? new Date(value).toISOString() : new Date().toISOString());
      }
      // Handle messages array
      else if (key === 'messages') {
        values.push(Array.isArray(value) ? JSON.stringify(value) : value);
      }
      // Handle arrays and objects
      else if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
        values.push(JSON.stringify(value));
      }
      // Primitives
      else {
        values.push(value);
      }
    }

    fields.push('updatedAt = datetime(\'now\')');

    if (fields.length === 0) {
      return this.findById(id);
    }

    const idStr = id.toString ? id.toString() : String(id);
    const sql = `UPDATE chats SET ${fields.join(', ')} WHERE _id = ? OR id = ?`;
    values.push(idStr, idStr);

    db.prepare(sql).run(...values);

    return this.findById(id);
  }

  /**
   * Delete chat by ID
   */
  static findByIdAndDelete(id: string | number): any | null {
    const chat = this.findById(id);
    if (!chat) return null;

    const db = getDatabase();
    const idStr = id.toString ? id.toString() : String(id);

    db.prepare('DELETE FROM chats WHERE _id = ? OR id = ?').run(idStr, idStr);

    return chat;
  }

  /**
   * Add message to chat (helper method for MongoDB $push equivalent)
   */
  static addMessage(chatId: string | number, message: any): any | null {
    const chat = this.findById(chatId);
    if (!chat) return null;

    // Parse existing messages
    const messages = Array.isArray(chat.messages) ? chat.messages : JSON.parse(chat.messages || '[]');

    // Add new message with auto-generated _id if not present
    const newMessage = {
      _id: message._id || this.generateObjectId(),
      role: message.role,
      content: message.content,
      sources: message.sources || [],
      metadata: message.metadata || null,
      timestamp: message.timestamp || new Date().toISOString()
    };

    messages.push(newMessage);

    // Update chat with new messages array
    return this.findByIdAndUpdate(chatId, {
      messages: messages,
      updatedAt: new Date().toISOString()
    });
  }

  /**
   * Delete message from chat (helper method for MongoDB $pull equivalent)
   */
  static deleteMessage(chatId: string | number, messageId: string): any | null {
    const chat = this.findById(chatId);
    if (!chat) return null;

    // Parse existing messages
    const messages = Array.isArray(chat.messages) ? chat.messages : JSON.parse(chat.messages || '[]');

    // Filter out the message to delete
    const filteredMessages = messages.filter((msg: any) => msg._id !== messageId);

    // Update chat with filtered messages array
    return this.findByIdAndUpdate(chatId, {
      messages: filteredMessages,
      updatedAt: new Date().toISOString()
    });
  }

  /**
   * Get messages from chat with pagination (helper method for MongoDB $slice equivalent)
   */
  static getMessages(chatId: string | number, limit?: number, offset?: number): any[] {
    const chat = this.findById(chatId);
    if (!chat) return [];

    // Parse messages
    const messages = Array.isArray(chat.messages) ? chat.messages : JSON.parse(chat.messages || '[]');

    // Apply pagination
    if (limit !== undefined) {
      if (offset !== undefined) {
        return messages.slice(offset, offset + limit);
      } else {
        // Negative limit means "last N messages"
        if (limit < 0) {
          return messages.slice(limit);
        }
        return messages.slice(0, limit);
      }
    }

    return messages;
  }

  /**
   * Sort chats (chainable helper)
   */
  static sort(sortObj: any): any {
    // SQLite sorting is done in the query
    // This is a placeholder for Mongoose API compatibility
    return this;
  }

  /**
   * Limit results (chainable helper)
   */
  static limit(count: number): any {
    // SQLite LIMIT is done in the query
    // This is a placeholder for Mongoose API compatibility
    return this;
  }

  /**
   * Select fields (chainable helper)
   */
  static select(fields: string): any {
    // SQLite SELECT is done in the query
    // This is a placeholder for Mongoose API compatibility
    return this;
  }

  /**
   * Deserialize database row to chat object
   */
  private static deserialize(row: any): any | null {
    if (!row) return null;

    // Parse messages JSON array
    if (row.messages) {
      try {
        row.messages = JSON.parse(row.messages);
        // Convert message timestamps to Date objects
        if (Array.isArray(row.messages)) {
          row.messages = row.messages.map((msg: any) => ({
            ...msg,
            timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date()
          }));
        }
      } catch (e) {
        row.messages = [];
      }
    }

    // Convert timestamps to Date objects
    if (row.createdAt) {
      row.createdAt = new Date(row.createdAt);
    }
    if (row.updatedAt) {
      row.updatedAt = new Date(row.updatedAt);
    }

    // Add Mongoose-like _id if not present
    if (!row._id && row.id) {
      row._id = row.id.toString();
    }

    return row;
  }
}

/**
 * Persona Model Adapter
 */
export class PersonaModel {
  static find(query: any = {}): any[] {
    const db = getDatabase();
    let sql = 'SELECT * FROM personas WHERE 1=1';
    const params: any[] = [];

    if (query.userId) {
      sql += ' AND userId = ?';
      params.push(query.userId.toString ? query.userId.toString() : query.userId);
    }
    if (query.isDefault !== undefined) {
      sql += ' AND isDefault = ?';
      params.push(query.isDefault ? 1 : 0);
    }
    if (query.isActive !== undefined) {
      sql += ' AND isActive = ?';
      params.push(query.isActive ? 1 : 0);
    }

    const rows = db.prepare(sql).all(...params);
    return rows.map(row => this.deserialize(row));
  }

  static findOne(query: any): any | null {
    const db = getDatabase();
    let sql = 'SELECT * FROM personas WHERE 1=1';
    const params: any[] = [];

    if (query._id) {
      sql += ' AND _id = ?';
      params.push(query._id);
    }
    if (query.userId) {
      sql += ' AND userId = ?';
      params.push(query.userId.toString ? query.userId.toString() : query.userId);
    }
    if (query.isActive !== undefined) {
      sql += ' AND isActive = ?';
      params.push(query.isActive ? 1 : 0);
    }

    sql += ' LIMIT 1';
    const row = db.prepare(sql).get(...params);
    return row ? this.deserialize(row) : null;
  }

  static findById(id: string | number): any | null {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM personas WHERE _id = ? OR id = ?').get(id, id);
    return row ? this.deserialize(row) : null;
  }

  static create(personaData: any): any {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO personas (name, prompt, systemPrompt, userId, isActive, isDefault)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      personaData.name,
      personaData.prompt,
      personaData.systemPrompt || null,
      personaData.userId ? personaData.userId.toString() : null,
      personaData.isActive ? 1 : 0,
      personaData.isDefault ? 1 : 0
    );

    return this.findById(Number(result.lastInsertRowid));
  }

  static findByIdAndUpdate(id: string | number, updates: any): any | null {
    const persona = this.findById(id);
    if (!persona) return null;

    const db = getDatabase();
    const fields: string[] = [];
    const values: any[] = [];

    Object.keys(updates).forEach(key => {
      const value = updates[key];
      if (typeof value === 'function' || value === undefined) return;

      if (key === 'isActive' || key === 'isDefault') {
        fields.push(`${key} = ?`);
        values.push(value ? 1 : 0);
      } else if (key === 'userId') {
        fields.push(`${key} = ?`);
        values.push(value.toString ? value.toString() : value);
      } else {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    });

    fields.push('updatedAt = datetime(\'now\')');

    const sql = `UPDATE personas SET ${fields.join(', ')} WHERE _id = ? OR id = ?`;
    db.prepare(sql).run(...values, id, id);

    return this.findById(id);
  }

  static findByIdAndDelete(id: string | number): any | null {
    const persona = this.findById(id);
    if (!persona) return null;

    const db = getDatabase();
    db.prepare('DELETE FROM personas WHERE _id = ? OR id = ?').run(id, id);
    return persona;
  }

  private static deserialize(row: any): any | null {
    if (!row) return null;

    // Convert INTEGER to boolean
    if (row.isActive !== undefined) row.isActive = Boolean(row.isActive);
    if (row.isDefault !== undefined) row.isDefault = Boolean(row.isDefault);

    // Convert dates
    if (row.createdAt) row.createdAt = new Date(row.createdAt);
    if (row.updatedAt) row.updatedAt = new Date(row.updatedAt);

    // Add Mongoose-like _id if not present
    if (!row._id && row.id) row._id = row.id.toString();

    return row;
  }
}

/**
 * Setting Model Adapter
 */
export class SettingModel {
  static find(query: any = {}): any[] {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM settings').all();
    return rows.map(row => this.deserialize(row));
  }

  static findOne(query: any): any | null {
    const db = getDatabase();
    let sql = 'SELECT * FROM settings WHERE 1=1';
    const params: any[] = [];

    if (query.key) {
      sql += ' AND key = ?';
      params.push(query.key);
    }
    if (query._id) {
      sql += ' AND _id = ?';
      params.push(query._id);
    }

    sql += ' LIMIT 1';
    const row = db.prepare(sql).get(...params);
    return row ? this.deserialize(row) : null;
  }

  static findById(id: string | number): any | null {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM settings WHERE _id = ? OR id = ?').get(id, id);
    return row ? this.deserialize(row) : null;
  }

  static create(settingData: any): any {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO settings (key, value)
      VALUES (?, ?)
    `);

    const result = stmt.run(settingData.key, settingData.value);
    return this.findById(Number(result.lastInsertRowid));
  }

  static findByIdAndUpdate(id: string | number, updates: any): any | null {
    const setting = this.findById(id);
    if (!setting) return null;

    const db = getDatabase();
    const fields: string[] = [];
    const values: any[] = [];

    Object.keys(updates).forEach(key => {
      const value = updates[key];
      if (typeof value === 'function' || value === undefined) return;
      fields.push(`${key} = ?`);
      values.push(value);
    });

    fields.push('updatedAt = datetime(\'now\')');

    const sql = `UPDATE settings SET ${fields.join(', ')} WHERE _id = ? OR id = ?`;
    db.prepare(sql).run(...values, id, id);

    return this.findById(id);
  }

  static findByIdAndDelete(id: string | number): any | null {
    const setting = this.findById(id);
    if (!setting) return null;

    const db = getDatabase();
    db.prepare('DELETE FROM settings WHERE _id = ? OR id = ?').run(id, id);
    return setting;
  }

  // Upsert helper (insert or update)
  static upsert(key: string, value: string): any {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO settings (key, value, updatedAt)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updatedAt = datetime('now')
    `);
    stmt.run(key, value);
    return this.findOne({ key });
  }

  private static deserialize(row: any): any | null {
    if (!row) return null;

    // Convert dates
    if (row.createdAt) row.createdAt = new Date(row.createdAt);
    if (row.updatedAt) row.updatedAt = new Date(row.updatedAt);

    // Add Mongoose-like _id if not present
    if (!row._id && row.id) row._id = row.id.toString();

    return row;
  }
}

/**
 * Folder Model Adapter
 */
export class FolderModel {
  static find(query: any = {}): any[] {
    const db = getDatabase();
    let sql = 'SELECT * FROM folders WHERE 1=1';
    const params: any[] = [];

    if (query.ownerId) {
      sql += ' AND ownerId = ?';
      params.push(query.ownerId.toString ? query.ownerId.toString() : query.ownerId);
    }
    if (query.parentId !== undefined) {
      if (query.parentId === null) {
        sql += ' AND parentId IS NULL';
      } else {
        sql += ' AND parentId = ?';
        params.push(query.parentId.toString ? query.parentId.toString() : query.parentId);
      }
    }
    if (query.knowledgeBaseId) {
      sql += ' AND knowledgeBaseId = ?';
      params.push(query.knowledgeBaseId.toString ? query.knowledgeBaseId.toString() : query.knowledgeBaseId);
    }
    if (query.path) {
      sql += ' AND path = ?';
      params.push(query.path);
    }

    const rows = db.prepare(sql).all(...params);
    return rows.map(row => this.deserialize(row));
  }

  static findOne(query: any): any | null {
    const db = getDatabase();
    let sql = 'SELECT * FROM folders WHERE 1=1';
    const params: any[] = [];

    if (query._id) {
      sql += ' AND _id = ?';
      params.push(query._id);
    }
    if (query.path) {
      sql += ' AND path = ?';
      params.push(query.path);
    }
    if (query.ownerId) {
      sql += ' AND ownerId = ?';
      params.push(query.ownerId.toString ? query.ownerId.toString() : query.ownerId);
    }

    sql += ' LIMIT 1';
    const row = db.prepare(sql).get(...params);
    return row ? this.deserialize(row) : null;
  }

  static findById(id: string | number): any | null {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM folders WHERE _id = ? OR id = ?').get(id, id);
    return row ? this.deserialize(row) : null;
  }

  static create(folderData: any): any {
    const db = getDatabase();

    // Build path if not provided
    let path = folderData.path;
    if (!path) {
      path = this.buildPath(folderData.name, folderData.parentId);
    }

    const stmt = db.prepare(`
      INSERT INTO folders (name, parentId, knowledgeBaseId, path, ownerId)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      folderData.name,
      folderData.parentId ? (folderData.parentId.toString ? folderData.parentId.toString() : folderData.parentId) : null,
      folderData.knowledgeBaseId ? (folderData.knowledgeBaseId.toString ? folderData.knowledgeBaseId.toString() : folderData.knowledgeBaseId) : null,
      path,
      folderData.ownerId ? folderData.ownerId.toString() : null
    );

    return this.findById(Number(result.lastInsertRowid));
  }

  static findByIdAndUpdate(id: string | number, updates: any): any | null {
    const folder = this.findById(id);
    if (!folder) return null;

    const db = getDatabase();
    const fields: string[] = [];
    const values: any[] = [];

    // Rebuild path if name or parentId changed
    if (updates.name || updates.parentId !== undefined) {
      const newName = updates.name || folder.name;
      const newParentId = updates.parentId !== undefined ? updates.parentId : folder.parentId;
      updates.path = this.buildPath(newName, newParentId);
    }

    Object.keys(updates).forEach(key => {
      const value = updates[key];
      if (typeof value === 'function' || value === undefined) return;

      if (key === 'parentId' || key === 'knowledgeBaseId' || key === 'ownerId') {
        fields.push(`${key} = ?`);
        values.push(value ? (value.toString ? value.toString() : value) : null);
      } else {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    });

    fields.push('updatedAt = datetime(\'now\')');

    const sql = `UPDATE folders SET ${fields.join(', ')} WHERE _id = ? OR id = ?`;
    db.prepare(sql).run(...values, id, id);

    return this.findById(id);
  }

  static findByIdAndDelete(id: string | number): any | null {
    const folder = this.findById(id);
    if (!folder) return null;

    const db = getDatabase();
    db.prepare('DELETE FROM folders WHERE _id = ? OR id = ?').run(id, id);
    return folder;
  }

  // Build path from parent hierarchy
  static buildPath(name: string, parentId?: string | null): string {
    if (!parentId) {
      return '/' + name;
    }

    const parts = [name];
    let currentParentId: string | null = parentId;
    let depth = 0;
    const MAX_DEPTH = 20; // Prevent infinite loops

    while (currentParentId && depth < MAX_DEPTH) {
      const parent = this.findById(currentParentId);
      if (!parent) break;
      parts.unshift(parent.name);
      currentParentId = parent.parentId;
      depth++;
    }

    return '/' + parts.join('/');
  }

  private static deserialize(row: any): any | null {
    if (!row) return null;

    // Convert dates
    if (row.createdAt) row.createdAt = new Date(row.createdAt);
    if (row.updatedAt) row.updatedAt = new Date(row.updatedAt);

    // Add Mongoose-like _id if not present
    if (!row._id && row.id) row._id = row.id.toString();

    return row;
  }
}

/**
 * TenantKnowledgeBase Model Adapter
 */
export class TenantKnowledgeBaseModel {
  static find(query: any = {}): any[] {
    const db = getDatabase();
    let sql = 'SELECT * FROM tenant_knowledge_bases WHERE 1=1';
    const params: any[] = [];

    if (query.isActive !== undefined) {
      sql += ' AND isActive = ?';
      params.push(query.isActive ? 1 : 0);
    }
    if (query.slug) {
      sql += ' AND slug = ?';
      params.push(query.slug);
    }
    if (query.createdBy) {
      sql += ' AND createdBy = ?';
      params.push(query.createdBy.toString ? query.createdBy.toString() : query.createdBy);
    }

    sql += ' ORDER BY createdAt DESC';
    const rows = db.prepare(sql).all(...params);
    return rows.map(row => this.deserialize(row));
  }

  static findOne(query: any): any | null {
    const db = getDatabase();
    let sql = 'SELECT * FROM tenant_knowledge_bases WHERE 1=1';
    const params: any[] = [];

    if (query._id) {
      sql += ' AND _id = ?';
      params.push(query._id);
    }
    if (query.slug) {
      sql += ' AND slug = ?';
      params.push(query.slug);
    }
    if (query.s3Prefix) {
      sql += ' AND s3Prefix = ?';
      params.push(query.s3Prefix);
    }

    sql += ' LIMIT 1';
    const row = db.prepare(sql).get(...params);
    return row ? this.deserialize(row) : null;
  }

  static findById(id: string | number): any | null {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM tenant_knowledge_bases WHERE _id = ? OR id = ?').get(id, id);
    return row ? this.deserialize(row) : null;
  }

  static create(kbData: any): any {
    const db = getDatabase();

    // Auto-generate slug if not provided
    let slug = kbData.slug;
    if (!slug && kbData.name) {
      slug = kbData.name.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    }

    // Auto-generate s3Prefix if not provided
    let s3Prefix = kbData.s3Prefix;
    if (!s3Prefix && slug) {
      s3Prefix = `tenant_kb/${slug}/`;
    }

    // Auto-generate shortName if not provided
    let shortName = kbData.shortName;
    if (!shortName && kbData.name) {
      const words = kbData.name.split(' ');
      shortName = words[0].substring(0, 10);
    }

    const stmt = db.prepare(`
      INSERT INTO tenant_knowledge_bases (
        name, slug, description, s3Prefix, color, icon, shortName,
        accessType, allowedRoles, allowedUsers, isActive, documentCount,
        createdBy, lastModifiedBy
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      kbData.name,
      slug,
      kbData.description || null,
      s3Prefix,
      kbData.color || '#6B7280',
      kbData.icon || null,
      shortName,
      kbData.accessType || 'restricted',
      JSON.stringify(kbData.allowedRoles || []),
      JSON.stringify(kbData.allowedUsers || []),
      kbData.isActive !== undefined ? (kbData.isActive ? 1 : 0) : 1,
      kbData.documentCount || 0,
      kbData.createdBy ? kbData.createdBy.toString() : null,
      kbData.lastModifiedBy ? kbData.lastModifiedBy.toString() : null
    );

    return this.findById(Number(result.lastInsertRowid));
  }

  static findByIdAndUpdate(id: string | number, updates: any): any | null {
    const kb = this.findById(id);
    if (!kb) return null;

    const db = getDatabase();
    const fields: string[] = [];
    const values: any[] = [];

    Object.keys(updates).forEach(key => {
      const value = updates[key];
      if (typeof value === 'function' || value === undefined) return;

      if (key === 'isActive') {
        fields.push(`${key} = ?`);
        values.push(value ? 1 : 0);
      } else if (key === 'allowedRoles' || key === 'allowedUsers') {
        fields.push(`${key} = ?`);
        values.push(JSON.stringify(value || []));
      } else if (key === 'createdBy' || key === 'lastModifiedBy') {
        fields.push(`${key} = ?`);
        values.push(value ? (value.toString ? value.toString() : value) : null);
      } else {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    });

    fields.push('updatedAt = datetime(\'now\')');

    const sql = `UPDATE tenant_knowledge_bases SET ${fields.join(', ')} WHERE _id = ? OR id = ?`;
    db.prepare(sql).run(...values, id, id);

    return this.findById(id);
  }

  static findByIdAndDelete(id: string | number): any | null {
    const kb = this.findById(id);
    if (!kb) return null;

    const db = getDatabase();
    db.prepare('DELETE FROM tenant_knowledge_bases WHERE _id = ? OR id = ?').run(id, id);
    return kb;
  }

  // Method to check if a user has access
  static hasAccess(kb: any, userId: string, userRole?: string): boolean {
    if (!kb.isActive) return false;
    if (kb.accessType === 'public') return true;

    if (kb.accessType === 'role-based' && userRole && kb.allowedRoles?.includes(userRole)) {
      return true;
    }

    if (kb.allowedUsers?.some((id: string) => id === userId)) {
      return true;
    }

    return false;
  }

  private static deserialize(row: any): any | null {
    if (!row) return null;

    // Parse JSON arrays
    try {
      row.allowedRoles = JSON.parse(row.allowedRoles || '[]');
    } catch (e) {
      row.allowedRoles = [];
    }

    try {
      row.allowedUsers = JSON.parse(row.allowedUsers || '[]');
    } catch (e) {
      row.allowedUsers = [];
    }

    // Convert INTEGER to boolean
    if (row.isActive !== undefined) row.isActive = Boolean(row.isActive);

    // Convert dates
    if (row.createdAt) row.createdAt = new Date(row.createdAt);
    if (row.updatedAt) row.updatedAt = new Date(row.updatedAt);

    // Add Mongoose-like _id if not present
    if (!row._id && row.id) row._id = row.id.toString();

    // Add hasAccess method
    row.hasAccess = (userId: string, userRole?: string) => {
      return TenantKnowledgeBaseModel.hasAccess(row, userId, userRole);
    };

    return row;
  }
}

/**
 * UserSettings Model Adapter
 */
export class UserSettingsModel {
  static find(query: any = {}): any[] {
    const db = getDatabase();
    let sql = 'SELECT * FROM user_settings WHERE 1=1';
    const params: any[] = [];

    if (query.userId) {
      sql += ' AND userId = ?';
      params.push(query.userId.toString ? query.userId.toString() : query.userId);
    }

    const rows = db.prepare(sql).all(...params);
    return rows.map(row => this.deserialize(row));
  }

  static findOne(query: any): any | null {
    const db = getDatabase();
    let sql = 'SELECT * FROM user_settings WHERE 1=1';
    const params: any[] = [];

    if (query._id) {
      sql += ' AND _id = ?';
      params.push(query._id);
    }
    if (query.userId) {
      sql += ' AND userId = ?';
      params.push(query.userId.toString ? query.userId.toString() : query.userId);
    }

    sql += ' LIMIT 1';
    const row = db.prepare(sql).get(...params);
    return row ? this.deserialize(row) : null;
  }

  static findById(id: string | number): any | null {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM user_settings WHERE _id = ? OR id = ?').get(id, id);
    return row ? this.deserialize(row) : null;
  }

  static create(settingsData: any): any {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO user_settings (userId, customPrompt, iconUrl)
      VALUES (?, ?, ?)
    `);

    const result = stmt.run(
      settingsData.userId ? settingsData.userId.toString() : null,
      settingsData.customPrompt || null,
      settingsData.iconUrl || null
    );

    return this.findById(Number(result.lastInsertRowid));
  }

  static findByIdAndUpdate(id: string | number, updates: any): any | null {
    const settings = this.findById(id);
    if (!settings) return null;

    const db = getDatabase();
    const fields: string[] = [];
    const values: any[] = [];

    Object.keys(updates).forEach(key => {
      const value = updates[key];
      if (typeof value === 'function' || value === undefined) return;

      if (key === 'userId') {
        fields.push(`${key} = ?`);
        values.push(value ? (value.toString ? value.toString() : value) : null);
      } else {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    });

    fields.push('updatedAt = datetime(\'now\')');

    const sql = `UPDATE user_settings SET ${fields.join(', ')} WHERE _id = ? OR id = ?`;
    db.prepare(sql).run(...values, id, id);

    return this.findById(id);
  }

  static findByIdAndDelete(id: string | number): any | null {
    const settings = this.findById(id);
    if (!settings) return null;

    const db = getDatabase();
    db.prepare('DELETE FROM user_settings WHERE _id = ? OR id = ?').run(id, id);
    return settings;
  }

  // Helper to find by userId
  static findByUserId(userId: string): any | null {
    return this.findOne({ userId });
  }

  private static deserialize(row: any): any | null {
    if (!row) return null;

    // Convert dates
    if (row.createdAt) row.createdAt = new Date(row.createdAt);
    if (row.updatedAt) row.updatedAt = new Date(row.updatedAt);

    // Add Mongoose-like _id if not present
    if (!row._id && row.id) row._id = row.id.toString();

    return row;
  }
}

/**
 * Feedback Model Adapter
 */
export class FeedbackModel {
  static find(query: any = {}): any[] {
    const db = getDatabase();
    let sql = 'SELECT * FROM feedback WHERE 1=1';
    const params: any[] = [];

    if (query.userId) {
      sql += ' AND userId = ?';
      params.push(query.userId.toString ? query.userId.toString() : query.userId);
    }
    if (query.chatId) {
      sql += ' AND chatId = ?';
      params.push(query.chatId.toString ? query.chatId.toString() : query.chatId);
    }

    sql += ' ORDER BY createdAt DESC';
    const rows = db.prepare(sql).all(...params);
    return rows.map(row => this.deserialize(row));
  }

  static findOne(query: any): any | null {
    const db = getDatabase();
    let sql = 'SELECT * FROM feedback WHERE 1=1';
    const params: any[] = [];

    if (query._id) {
      sql += ' AND _id = ?';
      params.push(query._id);
    }
    if (query.userId) {
      sql += ' AND userId = ?';
      params.push(query.userId.toString ? query.userId.toString() : query.userId);
    }

    sql += ' LIMIT 1';
    const row = db.prepare(sql).get(...params);
    return row ? this.deserialize(row) : null;
  }

  static findById(id: string | number): any | null {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM feedback WHERE _id = ? OR id = ?').get(id, id);
    return row ? this.deserialize(row) : null;
  }

  static create(feedbackData: any): any {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO feedback (feedbackText, userId, username, chatId)
      VALUES (?, ?, ?, ?)
    `);

    const result = stmt.run(
      feedbackData.feedbackText,
      feedbackData.userId ? feedbackData.userId.toString() : null,
      feedbackData.username,
      feedbackData.chatId ? feedbackData.chatId.toString() : null
    );

    return this.findById(Number(result.lastInsertRowid));
  }

  static findByIdAndUpdate(id: string | number, updates: any): any | null {
    const feedback = this.findById(id);
    if (!feedback) return null;

    const db = getDatabase();
    const fields: string[] = [];
    const values: any[] = [];

    Object.keys(updates).forEach(key => {
      const value = updates[key];
      if (typeof value === 'function' || value === undefined) return;

      if (key === 'userId' || key === 'chatId') {
        fields.push(`${key} = ?`);
        values.push(value ? (value.toString ? value.toString() : value) : null);
      } else {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    });

    const sql = `UPDATE feedback SET ${fields.join(', ')} WHERE _id = ? OR id = ?`;
    db.prepare(sql).run(...values, id, id);

    return this.findById(id);
  }

  static findByIdAndDelete(id: string | number): any | null {
    const feedback = this.findById(id);
    if (!feedback) return null;

    const db = getDatabase();
    db.prepare('DELETE FROM feedback WHERE _id = ? OR id = ?').run(id, id);
    return feedback;
  }

  // Helper to find by userId
  static findByUserId(userId: string): any[] {
    return this.find({ userId });
  }

  // Helper to find by chatId
  static findByChatId(chatId: string): any[] {
    return this.find({ chatId });
  }

  private static deserialize(row: any): any | null {
    if (!row) return null;

    // Convert date
    if (row.createdAt) row.createdAt = new Date(row.createdAt);

    // Add Mongoose-like _id if not present
    if (!row._id && row.id) row._id = row.id.toString();

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
