import mongoose, { Document, Schema } from 'mongoose';

export interface ITenantKnowledgeBase extends Document {
  name: string; // Display name: "ABC Insurance KB"
  slug: string; // URL-safe identifier: "abc-insurance"
  description?: string; // Optional description
  s3Prefix: string; // S3 storage prefix: "tenant_kb/abc-insurance/"
  color?: string; // UI theme color: "#FF6B6B"
  icon?: string; // Icon URL or emoji
  shortName?: string; // Short display name for tabs: "ABC"

  // Access control
  accessType: 'public' | 'restricted' | 'role-based';
  allowedRoles?: string[]; // ['admin', 'user', 'viewer']
  allowedUsers?: mongoose.Types.ObjectId[]; // Specific user IDs

  // Metadata
  isActive: boolean; // Can be enabled/disabled by admin
  documentCount: number; // Track number of documents
  createdBy: mongoose.Types.ObjectId;
  lastModifiedBy?: mongoose.Types.ObjectId;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;

  // Methods
  hasAccess(userId: string, userRole?: string): boolean;
}

const TenantKnowledgeBaseSchema = new Schema<ITenantKnowledgeBase>(
  {
    name: {
      type: String,
      required: [true, 'Knowledge base name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    slug: {
      type: String,
      required: [true, 'Slug is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens'],
    },
    description: {
      type: String,
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },
    s3Prefix: {
      type: String,
      required: [true, 'S3 prefix is required'],
      unique: true,
    },
    color: {
      type: String,
      default: '#6B7280',
      match: [/^#[0-9A-Fa-f]{6}$/, 'Color must be a valid hex code'],
    },
    icon: {
      type: String,
      maxlength: [500, 'Icon URL cannot exceed 500 characters'],
    },
    shortName: {
      type: String,
      maxlength: [10, 'Short name cannot exceed 10 characters'],
    },

    // Access control
    accessType: {
      type: String,
      enum: ['public', 'restricted', 'role-based'],
      default: 'restricted',
      required: true,
    },
    allowedRoles: {
      type: [String],
      enum: ['admin', 'user', 'viewer'],
      default: [],
    },
    allowedUsers: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],

    // Metadata
    isActive: {
      type: Boolean,
      default: true,
    },
    documentCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    lastModifiedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
TenantKnowledgeBaseSchema.index({ slug: 1 });
TenantKnowledgeBaseSchema.index({ isActive: 1 });
TenantKnowledgeBaseSchema.index({ allowedUsers: 1 });
TenantKnowledgeBaseSchema.index({ createdAt: -1 });

// Pre-save hook to generate slug if not provided
TenantKnowledgeBaseSchema.pre('save', async function (next) {
  try {
    console.log('[TenantKB Pre-save] Starting pre-save hook for:', this.name);
    console.log(
      '[TenantKB Pre-save] Initial state - slug:',
      this.slug,
      's3Prefix:',
      this.s3Prefix,
      'shortName:',
      this.shortName
    );

    if (!this.slug && this.name) {
      this.slug = this.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      console.log('[TenantKB Pre-save] Generated slug:', this.slug);
    }

    // Validate slug is not empty
    if (!this.slug) {
      const error = new Error('Failed to generate valid slug from name');
      console.error('[TenantKB Pre-save] Slug generation failed for name:', this.name);
      return next(error);
    }

    // Generate S3 prefix from slug
    if (!this.s3Prefix && this.slug) {
      this.s3Prefix = `tenant_kb/${this.slug}/`;
      console.log('[TenantKB Pre-save] Generated s3Prefix:', this.s3Prefix);
    }

    // Generate short name if not provided
    if (!this.shortName && this.name) {
      // Take first word or first 10 chars
      const words = this.name.split(' ');
      this.shortName = words[0].substring(0, 10);
      console.log('[TenantKB Pre-save] Generated shortName:', this.shortName);
    }

    console.log('[TenantKB Pre-save] Pre-save hook completed successfully');
    console.log(
      '[TenantKB Pre-save] Final state - slug:',
      this.slug,
      's3Prefix:',
      this.s3Prefix,
      'shortName:',
      this.shortName
    );
    next();
  } catch (error) {
    console.error('[TenantKB Pre-save] Error in pre-save hook:', error);
    next(error as Error);
  }
});

// Method to check if a user has access
TenantKnowledgeBaseSchema.methods.hasAccess = function (
  userId: string,
  userRole?: string
): boolean {
  if (!this.isActive) return false;

  if (this.accessType === 'public') return true;

  if (this.accessType === 'role-based' && userRole && this.allowedRoles?.includes(userRole)) {
    return true;
  }

  if (this.allowedUsers?.some((id: mongoose.Types.ObjectId) => id.toString() === userId)) {
    return true;
  }

  return false;
};

export const TenantKnowledgeBase = mongoose.model<ITenantKnowledgeBase>(
  'TenantKnowledgeBase',
  TenantKnowledgeBaseSchema
);
