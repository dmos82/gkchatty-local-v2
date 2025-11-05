import 'dotenv/config';
import { getLogger } from './logger';

// Cloud services
import { connectDB as connectMongo, disconnectDB as disconnectMongo } from './mongoHelper';
import * as pineconeService from './pineconeService';

// Local services
import sqliteHelper from './local/sqliteHelper';
import chromaService from './local/chromaService';
import embeddingService from './local/embeddingService';
import { getProviderRegistry } from '../services/embedding/ProviderRegistry';

const log = getLogger('storageAdapter');

// Configuration
const STORAGE_MODE = process.env.GKCHATTY_STORAGE || 'local';

log.debug(`Storage adapter initialized in '${STORAGE_MODE}' mode`);

/**
 * Storage adapter interface
 */
export interface StorageAdapter {
  // Database operations
  connect(): Promise<void>;
  disconnect(): Promise<void>;

  // Document operations
  createDocument(doc: any): Promise<any>;
  findDocuments(query: any): Promise<any[]>;
  updateDocument(id: string, updates: any): Promise<any>;
  deleteDocument(id: string): Promise<boolean>;

  // User operations
  createUser(user: any): Promise<any>;
  findUser(query: any): Promise<any>;
  updateUser(id: string, updates: any): Promise<any>;

  // Vector operations
  upsertVectors(namespace: string, vectors: any[]): Promise<void>;
  queryVectors(namespace: string, vector: number[], topK: number): Promise<any>;
  deleteVectors(namespace: string, ids: string[]): Promise<void>;

  // Embedding operations
  generateEmbedding(text: string): Promise<number[]>;
  generateEmbeddings(texts: string[]): Promise<number[][]>;

  // Provider management
  switchProvider(providerId: string): Promise<void>;
  getActiveProvider(): string | null;
  listProviders(): any[];

  // Storage info
  getStorageInfo(): any;
}

/**
 * Local storage adapter (SQLite + ChromaDB + Pluggable Embedding Providers)
 */
class LocalStorageAdapter implements StorageAdapter {
  private providerRegistry = getProviderRegistry();

  async connect(): Promise<void> {
    log.debug('Connecting to local storage...');
    await sqliteHelper.connect();
    await chromaService.initialize();

    // Initialize provider registry (will auto-detect providers)
    await this.providerRegistry.initialize();

    // For backward compatibility, keep embeddingService as fallback
    await embeddingService.initialize();

    log.debug('✅ Local storage connected');
  }

  async disconnect(): Promise<void> {
    log.debug('Disconnecting from local storage...');
    await sqliteHelper.disconnect();
    await chromaService.disconnect();
    await this.providerRegistry.cleanup();
    await embeddingService.cleanup();
    log.debug('✅ Local storage disconnected');
  }

  async createDocument(doc: any): Promise<any> {
    const db = sqliteHelper.getDB();
    const stmt = db.prepare(`
      INSERT INTO documents (id, userId, projectId, filename, content, metadata, fileSize, mimeType)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const id = doc.id || generateId();
    stmt.run(
      id,
      doc.userId,
      doc.projectId || null,
      doc.filename,
      doc.content,
      JSON.stringify(doc.metadata || {}),
      doc.fileSize || 0,
      doc.mimeType || 'text/plain'
    );

    return { ...doc, id };
  }

  async findDocuments(query: any): Promise<any[]> {
    const db = sqliteHelper.getDB();
    let sql = 'SELECT * FROM documents WHERE 1=1';
    const params: any[] = [];

    if (query.userId) {
      sql += ' AND userId = ?';
      params.push(query.userId);
    }

    if (query.projectId) {
      sql += ' AND projectId = ?';
      params.push(query.projectId);
    }

    const rows = db.prepare(sql).all(...params);
    return rows.map(row => ({
      ...row,
      metadata: JSON.parse(row.metadata || '{}')
    }));
  }

  async updateDocument(id: string, updates: any): Promise<any> {
    const db = sqliteHelper.getDB();
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    values.push(id);

    const stmt = db.prepare(`UPDATE documents SET ${fields}, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`);
    stmt.run(...values);

    return { id, ...updates };
  }

  async deleteDocument(id: string): Promise<boolean> {
    const db = sqliteHelper.getDB();
    const stmt = db.prepare('DELETE FROM documents WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  async createUser(user: any): Promise<any> {
    const db = sqliteHelper.getDB();
    const stmt = db.prepare(`
      INSERT INTO users (id, email, username, passwordHash, role, settings)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const id = user.id || generateId();
    stmt.run(
      id,
      user.email,
      user.username,
      user.passwordHash || null,
      user.role || 'user',
      JSON.stringify(user.settings || {})
    );

    return { ...user, id };
  }

  async findUser(query: any): Promise<any> {
    const db = sqliteHelper.getDB();
    let sql = 'SELECT * FROM users WHERE 1=1';
    const params: any[] = [];

    if (query.email) {
      sql += ' AND email = ?';
      params.push(query.email);
    }

    if (query.username) {
      sql += ' AND username = ?';
      params.push(query.username);
    }

    if (query.id) {
      sql += ' AND id = ?';
      params.push(query.id);
    }

    const row = db.prepare(sql).get(...params);
    if (!row) return null;

    return {
      ...row,
      settings: JSON.parse(row.settings || '{}')
    };
  }

  async updateUser(id: string, updates: any): Promise<any> {
    const db = sqliteHelper.getDB();
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    values.push(id);

    const stmt = db.prepare(`UPDATE users SET ${fields}, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`);
    stmt.run(...values);

    return { id, ...updates };
  }

  async upsertVectors(namespace: string, vectors: any[]): Promise<void> {
    await chromaService.upsert(namespace, vectors);
  }

  async queryVectors(namespace: string, vector: number[], topK: number): Promise<any> {
    return await chromaService.query(namespace, vector, { topK });
  }

  async deleteVectors(namespace: string, ids: string[]): Promise<void> {
    await chromaService.deleteVectors(namespace, ids);
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      // Use active provider from registry
      const provider = this.providerRegistry.getActiveProvider();
      return await provider.embed(text);
    } catch (error) {
      // Fallback to legacy embeddingService if no provider is active
      log.warn('No active provider, falling back to legacy embeddingService');
      return await embeddingService.embed(text);
    }
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      // Use active provider from registry
      const provider = this.providerRegistry.getActiveProvider();
      return await provider.embedBatch(texts);
    } catch (error) {
      // Fallback to legacy embeddingService if no provider is active
      log.warn('No active provider, falling back to legacy embeddingService');
      return await embeddingService.embedBatch(texts);
    }
  }

  async switchProvider(providerId: string): Promise<void> {
    log.debug(`Switching to provider: ${providerId}`);
    await this.providerRegistry.setActiveProvider(providerId);
    log.debug('✅ Provider switched successfully');
  }

  getActiveProvider(): string | null {
    return this.providerRegistry.getActiveProviderId();
  }

  listProviders(): any[] {
    return this.providerRegistry.listProviders();
  }

  getStorageInfo() {
    const storageInfo = sqliteHelper.getStorageInfo();
    const activeProvider = this.providerRegistry.getActiveProviderId();
    const providers = this.providerRegistry.listProviders();

    return {
      ...storageInfo,
      activeProvider,
      availableProviders: providers.length,
      providers,
    };
  }
}

/**
 * Cloud storage adapter (MongoDB + Pinecone + OpenAI)
 */
class CloudStorageAdapter implements StorageAdapter {
  async connect(): Promise<void> {
    log.debug('Connecting to cloud storage...');
    await connectMongo();
    // Pinecone is initialized on-demand
    log.debug('✅ Cloud storage connected');
  }

  async disconnect(): Promise<void> {
    log.debug('Disconnecting from cloud storage...');
    await disconnectMongo();
    log.debug('✅ Cloud storage disconnected');
  }

  async createDocument(doc: any): Promise<any> {
    // Use existing MongoDB models
    // This would connect to your existing Document model
    throw new Error('Cloud storage adapter not fully implemented yet');
  }

  async findDocuments(query: any): Promise<any[]> {
    // Use existing MongoDB models
    throw new Error('Cloud storage adapter not fully implemented yet');
  }

  async updateDocument(id: string, updates: any): Promise<any> {
    // Use existing MongoDB models
    throw new Error('Cloud storage adapter not fully implemented yet');
  }

  async deleteDocument(id: string): Promise<boolean> {
    // Use existing MongoDB models
    throw new Error('Cloud storage adapter not fully implemented yet');
  }

  async createUser(user: any): Promise<any> {
    // Use existing MongoDB models
    throw new Error('Cloud storage adapter not fully implemented yet');
  }

  async findUser(query: any): Promise<any> {
    // Use existing MongoDB models
    throw new Error('Cloud storage adapter not fully implemented yet');
  }

  async updateUser(id: string, updates: any): Promise<any> {
    // Use existing MongoDB models
    throw new Error('Cloud storage adapter not fully implemented yet');
  }

  async upsertVectors(namespace: string, vectors: any[]): Promise<void> {
    // Use existing Pinecone service
    throw new Error('Cloud storage adapter not fully implemented yet');
  }

  async queryVectors(namespace: string, vector: number[], topK: number): Promise<any> {
    // Use existing Pinecone service
    throw new Error('Cloud storage adapter not fully implemented yet');
  }

  async deleteVectors(namespace: string, ids: string[]): Promise<void> {
    // Use existing Pinecone service
    throw new Error('Cloud storage adapter not fully implemented yet');
  }

  async generateEmbedding(text: string): Promise<number[]> {
    // Use OpenAI API
    throw new Error('Cloud storage adapter not fully implemented yet');
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    // Use OpenAI API
    throw new Error('Cloud storage adapter not fully implemented yet');
  }

  async switchProvider(providerId: string): Promise<void> {
    throw new Error('Cloud storage adapter does not support provider switching');
  }

  getActiveProvider(): string | null {
    return 'openai'; // Cloud mode always uses OpenAI
  }

  listProviders(): any[] {
    return [{
      id: 'openai',
      name: 'OpenAI',
      type: 'api',
      available: true,
      requiresApiKey: true,
    }];
  }

  getStorageInfo() {
    return {
      mode: 'cloud',
      backend: 'MongoDB + Pinecone',
      activeProvider: 'openai',
      availableProviders: 1,
    };
  }
}

/**
 * Helper function to generate unique IDs
 */
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * Get the appropriate storage adapter based on configuration
 */
export function getStorageAdapter(): StorageAdapter {
  if (STORAGE_MODE === 'local') {
    return new LocalStorageAdapter();
  } else {
    return new CloudStorageAdapter();
  }
}

// Export singleton instance
export const storageAdapter = getStorageAdapter();

// Export for convenience
export default storageAdapter;