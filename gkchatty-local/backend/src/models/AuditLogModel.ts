import mongoose, { Schema, Document, Types } from 'mongoose';

// Define audit action types
export type AuditAction =
  | 'LOGIN'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'PASSWORD_CHANGE'
  | 'PASSWORD_RESET'
  | 'CHAT_QUERY'
  | 'CHAT_CREATED'
  | 'CHAT_DELETED'
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'USER_DELETED'
  | 'DOCUMENT_UPLOADED'
  | 'DOCUMENT_DELETED'
  | 'SETTINGS_UPDATED'
  | 'FEATURE_TOGGLE_CHANGED'
  | 'SESSION_TERMINATED'
  | 'BUDGET_EXCEEDED'
  | 'PII_DETECTED'
  | 'IP_BLOCKED'
  | 'ADMIN_ACTION';

// Define resource types
export type AuditResource =
  | 'USER'
  | 'CHAT'
  | 'DOCUMENT'
  | 'SETTINGS'
  | 'FEATURE'
  | 'SESSION'
  | 'BUDGET'
  | 'SYSTEM';

// Define the interface for the AuditLog document
export interface IAuditLog extends Document {
  timestamp: Date;
  userId: Types.ObjectId | null;
  username: string | null;
  action: AuditAction;
  resource: AuditResource;
  resourceId: string | null;
  details: Record<string, unknown>;
  ipAddress: string;
  userAgent: string;
  sessionId: string | null;
  success: boolean;
  errorMessage: string | null;
  correlationId: string | null; // For tracing related events
}

// Define the Mongoose schema
const AuditLogSchema: Schema = new Schema(
  {
    timestamp: {
      type: Date,
      default: Date.now,
      required: true,
      index: true, // Index for time-based queries
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false,
      index: true, // Index for user-based queries
    },
    username: {
      type: String,
      required: false,
      index: true, // Index for username search
    },
    action: {
      type: String,
      required: true,
      enum: [
        'LOGIN',
        'LOGIN_FAILED',
        'LOGOUT',
        'PASSWORD_CHANGE',
        'PASSWORD_RESET',
        'CHAT_QUERY',
        'CHAT_CREATED',
        'CHAT_DELETED',
        'USER_CREATED',
        'USER_UPDATED',
        'USER_DELETED',
        'DOCUMENT_UPLOADED',
        'DOCUMENT_DELETED',
        'SETTINGS_UPDATED',
        'FEATURE_TOGGLE_CHANGED',
        'SESSION_TERMINATED',
        'BUDGET_EXCEEDED',
        'PII_DETECTED',
        'IP_BLOCKED',
        'ADMIN_ACTION',
      ],
      index: true, // Index for action-based filtering
    },
    resource: {
      type: String,
      required: true,
      enum: ['USER', 'CHAT', 'DOCUMENT', 'SETTINGS', 'FEATURE', 'SESSION', 'BUDGET', 'SYSTEM'],
      index: true,
    },
    resourceId: {
      type: String,
      required: false,
    },
    details: {
      type: Schema.Types.Mixed,
      required: false,
      default: {},
    },
    ipAddress: {
      type: String,
      required: true,
      index: true, // Index for IP-based filtering
    },
    userAgent: {
      type: String,
      required: false,
    },
    sessionId: {
      type: String,
      required: false,
      index: true, // Index for session tracking
    },
    success: {
      type: Boolean,
      required: true,
      default: true,
    },
    errorMessage: {
      type: String,
      required: false,
    },
    correlationId: {
      type: String,
      required: false,
      index: true, // Index for correlation ID search
    },
  },
  {
    timestamps: false, // We use our own timestamp field
    collection: 'auditlogs',
  }
);

// Compound indexes for common query patterns
AuditLogSchema.index({ userId: 1, timestamp: -1 });
AuditLogSchema.index({ action: 1, timestamp: -1 });
AuditLogSchema.index({ success: 1, timestamp: -1 });

// Create and export the AuditLog model
const AuditLog = mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);

export default AuditLog;
