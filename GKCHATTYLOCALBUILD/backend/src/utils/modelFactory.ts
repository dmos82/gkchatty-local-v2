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

// Re-export TypeScript interfaces (MongoDB types - SQLite uses same structure)
export type { IUser } from '../models/UserModel';
export type { IUserDocument } from '../models/UserDocument';
export type { ISystemKbDocument } from '../models/SystemKbDocument';
export type { IChat } from '../models/ChatModel';
export type { IPersona } from '../models/PersonaModel';
export type { ISetting } from '../models/SettingModel';
export type { IFolder } from '../models/FolderModel';
export type { ITenantKnowledgeBase } from '../models/TenantKnowledgeBase';
export type { IUserSettings } from '../models/UserSettings';
export type { IFeedback } from '../models/Feedback.model';

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

// Export Chat model (for chat history)
export const ChatModel = USE_SQLITE
  ? require('./sqliteAdapter').ChatModel
  : require('../models/ChatModel').default;

// Export Persona model (for user AI personas)
export const PersonaModel = USE_SQLITE
  ? require('./sqliteAdapter').PersonaModel
  : require('../models/PersonaModel').PersonaModel;

// Export Setting model (for system settings)
export const SettingModel = USE_SQLITE
  ? require('./sqliteAdapter').SettingModel
  : require('../models/SettingModel').default;

// Export Folder model (for document folders)
export const FolderModel = USE_SQLITE
  ? require('./sqliteAdapter').FolderModel
  : require('../models/FolderModel').Folder;

// Export TenantKnowledgeBase model (for multi-tenant KB)
export const TenantKnowledgeBaseModel = USE_SQLITE
  ? require('./sqliteAdapter').TenantKnowledgeBaseModel
  : require('../models/TenantKnowledgeBase').TenantKnowledgeBase;

// Export UserSettings model (for user preferences)
export const UserSettingsModel = USE_SQLITE
  ? require('./sqliteAdapter').UserSettingsModel
  : require('../models/UserSettings').default;

// Export Feedback model (for user feedback)
export const FeedbackModel = USE_SQLITE
  ? require('./sqliteAdapter').FeedbackModel
  : require('../models/Feedback.model').default;

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
