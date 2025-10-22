import mongoose, { Document, Schema } from 'mongoose';

// Interface defining the structure of a UserDocument
export interface IUserDocument extends Document {
  userId?: mongoose.Types.ObjectId; // Optional for system docs and tenant docs (tracks uploader)
  sourceType: 'system' | 'user' | 'tenant';
  tenantKbId?: mongoose.Types.ObjectId; // For tenant KB documents
  folderId?: mongoose.Types.ObjectId; // For folder organization
  originalFileName: string;
  // Remove local file fields
  // fileName?: string; // Stored filename on disk
  // filePath?: string; // Full path on disk
  // Add S3 fields
  s3Bucket: string;
  s3Key: string; // Path/key within the S3 bucket (will store UUID for user docs)
  file_extension: string; // Changed to required
  fileSize: number;
  mimeType: string;
  uploadTimestamp: Date;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  contentHash?: string; // Added for idempotency
  processingError?: string;
  errorCode?: string; // Added for specific error codes (maps to IngestionErrorCode enum)
  chunkCount?: number;
  metadata?: Record<string, any>;
}

const userDocumentSchema = new Schema<IUserDocument>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: false, index: true }, // Optional: Not present for system docs, but present for tenant docs to track uploader
  sourceType: { type: String, enum: ['system', 'user', 'tenant'], required: true, index: true },
  tenantKbId: {
    type: Schema.Types.ObjectId,
    ref: 'TenantKnowledgeBase',
    required: false,
    index: true,
  }, // For tenant KB documents
  folderId: {
    type: Schema.Types.ObjectId,
    ref: 'Folder',
    required: false,
    index: true,
  }, // For folder organization
  originalFileName: { type: String, required: true },
  // Remove local file fields
  // fileName: { type: String, required: false }, // No longer storing this distinct name
  // filePath: { type: String, required: false }, // No longer storing local path
  // Add S3 fields
  s3Bucket: { type: String, required: true },
  s3Key: { type: String, required: true, index: true }, // S3 key (UUID for user docs). Not unique globally if system docs also use it. Consider compound index with userId or sourceType if needed.
  file_extension: { type: String, required: true }, // Changed to required
  fileSize: { type: Number, required: true },
  mimeType: { type: String, required: true },
  uploadTimestamp: { type: Date, default: Date.now },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending',
    index: true,
  },
  contentHash: { type: String, index: true, sparse: true }, // Added for idempotency
  processingError: { type: String, required: false },
  errorCode: { type: String, required: false }, // Added for specific error codes
  chunkCount: { type: Number, required: false },
  metadata: { type: Schema.Types.Mixed, required: false },
});

// Explicitly create the text index using schema methods
// (Alternative or complementary to inline `text: true`)
// userDocumentSchema.index({ originalFileName: 'text' });

// Add any helpful instance methods here if needed
userDocumentSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v; // Remove version key from responses
  return obj;
};

// Indexing recommendations
// Index for finding user's documents (already exists)
userDocumentSchema.index({ userId: 1, sourceType: 1 });
// Index for System KB keyword search (Hybrid Search)
userDocumentSchema.index({ sourceType: 1, originalFileName: 1 });
// Index for User Docs keyword search (Hybrid Search)
userDocumentSchema.index({ userId: 1, sourceType: 1, originalFileName: 1 });
// Index for user-specific content hash, ensuring it's for 'user' type documents if needed for query speed.
userDocumentSchema.index({ userId: 1, contentHash: 1, sourceType: 1 });
// Index for tenant KB documents
userDocumentSchema.index({ tenantKbId: 1, sourceType: 1 });
userDocumentSchema.index({ tenantKbId: 1, contentHash: 1 });

export const UserDocument = mongoose.model<IUserDocument>('UserDocument', userDocumentSchema);
