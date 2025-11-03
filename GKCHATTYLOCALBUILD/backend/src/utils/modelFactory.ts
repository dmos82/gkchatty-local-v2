/**
 * Model Factory
 *
 * Automatically switches between MongoDB (Mongoose) and SQLite adapters
 * based on environment configuration
 */

import { getLogger } from './logger';

const logger = getLogger('modelFactory');

// Determine storage mode from environment
const USE_SQLITE = process.env.USE_SQLITE === 'true';

logger.info(`Storage mode: ${USE_SQLITE ? 'SQLite (Local)' : 'MongoDB (Cloud)'}`);

// Export the appropriate models based on storage mode
export const UserModel = USE_SQLITE
  ? require('./sqliteAdapter').UserModel
  : require('../models/UserModel').default;

export const DocumentModel = USE_SQLITE
  ? require('./sqliteAdapter').DocumentModel
  : null; // TODO: Add MongoDB DocumentModel when needed

// Export UserDocument model (for document management)
export const UserDocumentModel = USE_SQLITE
  ? require('./sqliteAdapter').UserDocumentModel
  : require('../models/UserDocument').UserDocument;

// Export SystemKbDocument model (for system knowledge base)
export const SystemKbDocumentModel = USE_SQLITE
  ? require('./sqliteAdapter').SystemKbDocumentModel
  : require('../models/SystemKbDocument').SystemKbDocument;

// Initialize database connection
if (USE_SQLITE) {
  const { initializeDatabase } = require('./sqliteAdapter');
  const dbPath = process.env.SQLITE_DB_PATH || undefined;
  initializeDatabase(dbPath);
  logger.info('SQLite database initialized via modelFactory');
}

// Export database initialization for external use
export function initializeStorage() {
  if (USE_SQLITE) {
    const { initializeDatabase } = require('./sqliteAdapter');
    const dbPath = process.env.SQLITE_DB_PATH || undefined;
    return initializeDatabase(dbPath);
  }
  // MongoDB initialization handled elsewhere
  return null;
}

// Export cleanup function
export function closeStorage() {
  if (USE_SQLITE) {
    const { closeDatabase } = require('./sqliteAdapter');
    closeDatabase();
    logger.info('SQLite database closed');
  }
}

logger.info('Model factory initialized');
