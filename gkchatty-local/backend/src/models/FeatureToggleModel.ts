import mongoose, { Schema, Document, Types } from 'mongoose';

// Define available feature names
export type FeatureName =
  | 'audit_logs'
  | 'session_management'
  | 'budget_enforcement'
  | 'pii_detection'
  | 'ip_whitelist'
  | 'realtime_dashboard';

// Define the interface for the FeatureToggle document
export interface IFeatureToggle extends Document {
  feature: FeatureName;
  enabled: boolean;
  config: Record<string, unknown>;
  updatedBy: Types.ObjectId;
  updatedAt: Date;
  description: string;
}

// Default feature configurations
export const DEFAULT_FEATURE_CONFIG: Record<FeatureName, { enabled: boolean; description: string; config: Record<string, unknown> }> = {
  audit_logs: {
    enabled: true,
    description: 'Log all user actions for security and compliance',
    config: {
      retentionDays: 90,
      logChatQueries: true,
      logDocumentAccess: true,
    },
  },
  session_management: {
    enabled: true,
    description: 'Enhanced session controls including force logout and timeouts',
    config: {
      maxConcurrentSessions: 10,
      sessionTimeoutMinutes: 30,
      allowMultipleSessions: true,
    },
  },
  budget_enforcement: {
    enabled: false,
    description: 'Enforce token and cost limits per user',
    config: {
      defaultMonthlyTokenLimit: null, // null = unlimited
      defaultMonthlyCostLimit: null,
      alertThresholds: [50, 80, 100],
    },
  },
  pii_detection: {
    enabled: false,
    description: 'Scan AI responses for PII and flag for review',
    config: {
      detectSSN: true,
      detectEmail: true,
      detectPhone: true,
      detectCreditCard: true,
      autoFlag: true, // Flag for review (not auto-redact)
    },
  },
  ip_whitelist: {
    enabled: false,
    description: 'Restrict access to whitelisted IP addresses',
    config: {
      enforceForUsers: false,
      enforceForAdmins: false,
      blockMessage: 'Access denied: Your IP address is not authorized.',
    },
  },
  realtime_dashboard: {
    enabled: true,
    description: 'WebSocket-powered real-time admin dashboard updates',
    config: {
      updateIntervalMs: 5000,
      showActiveUsers: true,
      showLiveQueries: true,
    },
  },
};

// Define the Mongoose schema
const FeatureToggleSchema: Schema = new Schema(
  {
    feature: {
      type: String,
      required: true,
      unique: true,
      enum: [
        'audit_logs',
        'session_management',
        'budget_enforcement',
        'pii_detection',
        'ip_whitelist',
        'realtime_dashboard',
      ],
      index: true,
    },
    enabled: {
      type: Boolean,
      required: true,
      default: false,
    },
    config: {
      type: Schema.Types.Mixed,
      required: false,
      default: {},
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    description: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
    collection: 'featuretoggles',
  }
);

// Create and export the FeatureToggle model
const FeatureToggle = mongoose.model<IFeatureToggle>('FeatureToggle', FeatureToggleSchema);

export default FeatureToggle;
