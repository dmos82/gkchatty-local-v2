import mongoose, { Document, Schema } from 'mongoose';

// Interface defining the structure of a SystemKbDocument
export interface ISystemKbDocument extends Document {
  filename: string;
  s3Key: string;
  fileUrl: string;
  textContent: string;
  fileSize: number;
  mimeType: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  statusDetail?: string;
  folderId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const systemKbDocumentSchema = new Schema<ISystemKbDocument>({
  filename: { type: String, required: true },
  s3Key: { type: String, required: true, unique: true, index: true },
  fileUrl: { type: String, required: true },
  textContent: { type: String, required: false },
  fileSize: { type: Number, required: false, default: 0 },
  mimeType: { type: String, required: false },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending',
    required: true,
  },
  statusDetail: { type: String, required: false },
  folderId: { type: String, required: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Add any helpful instance methods here if needed
systemKbDocumentSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v; // Remove version key from responses
  return obj;
};

// Create text index for searching document content
systemKbDocumentSchema.index({ textContent: 'text', filename: 'text' });

export const SystemKbDocument = mongoose.model<ISystemKbDocument>(
  'SystemKbDocument',
  systemKbDocumentSchema
);
