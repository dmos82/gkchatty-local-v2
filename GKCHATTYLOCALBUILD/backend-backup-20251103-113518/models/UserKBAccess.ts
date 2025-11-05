import mongoose, { Document, Schema } from 'mongoose';

export interface IUserKBAccess extends Document {
  userId: mongoose.Types.ObjectId;
  enabledKnowledgeBases: mongoose.Types.ObjectId[]; // Array of TenantKB IDs
  defaultKnowledgeBase?: mongoose.Types.ObjectId; // User's preferred default
  pinnedKBs: mongoose.Types.ObjectId[]; // KBs pinned to top
  hiddenKBs: mongoose.Types.ObjectId[]; // KBs user chose to hide
  recentlyUsedKBs: mongoose.Types.ObjectId[]; // Track recent usage
  lastUpdated: Date;
  createdAt: Date;
  updatedAt: Date;

  // Methods
  addToRecentlyUsed(kbId: mongoose.Types.ObjectId): void;
  toggleKBAccess(kbId: mongoose.Types.ObjectId, enable: boolean): void;
}

const UserKBAccessSchema = new Schema<IUserKBAccess>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    enabledKnowledgeBases: [
      {
        type: Schema.Types.ObjectId,
        ref: 'TenantKnowledgeBase',
      },
    ],
    defaultKnowledgeBase: {
      type: Schema.Types.ObjectId,
      ref: 'TenantKnowledgeBase',
    },
    pinnedKBs: [
      {
        type: Schema.Types.ObjectId,
        ref: 'TenantKnowledgeBase',
      },
    ],
    hiddenKBs: [
      {
        type: Schema.Types.ObjectId,
        ref: 'TenantKnowledgeBase',
      },
    ],
    recentlyUsedKBs: [
      {
        type: Schema.Types.ObjectId,
        ref: 'TenantKnowledgeBase',
      },
    ],
    lastUpdated: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
UserKBAccessSchema.index({ userId: 1 });
UserKBAccessSchema.index({ enabledKnowledgeBases: 1 });

// Method to add a KB to recently used (max 5)
UserKBAccessSchema.methods.addToRecentlyUsed = function (kbId: mongoose.Types.ObjectId) {
  const recent = this.recentlyUsedKBs.filter(
    (id: mongoose.Types.ObjectId) => id.toString() !== kbId.toString()
  );
  recent.unshift(kbId);
  this.recentlyUsedKBs = recent.slice(0, 5); // Keep only 5 most recent
  this.lastUpdated = new Date();
};

// Method to toggle KB access
UserKBAccessSchema.methods.toggleKBAccess = function (
  kbId: mongoose.Types.ObjectId,
  enable: boolean
) {
  const kbIdStr = kbId.toString();
  const currentEnabled = this.enabledKnowledgeBases.map((id: mongoose.Types.ObjectId) =>
    id.toString()
  );

  if (enable && !currentEnabled.includes(kbIdStr)) {
    this.enabledKnowledgeBases.push(kbId);
  } else if (!enable) {
    this.enabledKnowledgeBases = this.enabledKnowledgeBases.filter(
      (id: mongoose.Types.ObjectId) => id.toString() !== kbIdStr
    );
    // Also remove from default if it was the default
    if (this.defaultKnowledgeBase?.toString() === kbIdStr) {
      this.defaultKnowledgeBase = undefined;
    }
  }
  this.lastUpdated = new Date();
};

export const UserKBAccess = mongoose.model<IUserKBAccess>('UserKBAccess', UserKBAccessSchema);
