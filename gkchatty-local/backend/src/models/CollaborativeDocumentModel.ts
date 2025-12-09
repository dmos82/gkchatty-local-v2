import mongoose, { Schema, Document, Types } from 'mongoose';

export type CollaborativeDocumentFileType = 'docx' | 'txt' | 'md' | 'rtf';

export interface ICollaborativeDocument extends Document {
  _id: Types.ObjectId;
  conversationId: Types.ObjectId;
  title: string;
  fileType: CollaborativeDocumentFileType;
  yjsState: Buffer | null; // Encoded Yjs document state
  createdBy: Types.ObjectId;
  createdByUsername: string;
  lastModifiedBy: Types.ObjectId | null;
  lastModifiedByUsername: string | null;
  participants: Types.ObjectId[];
  participantUsernames: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CollaborativeDocumentSchema = new Schema<ICollaborativeDocument>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      default: 'Untitled Document',
      maxlength: 255,
    },
    fileType: {
      type: String,
      enum: ['docx', 'txt', 'md', 'rtf'],
      default: 'docx',
    },
    yjsState: {
      type: Buffer,
      default: null,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    createdByUsername: {
      type: String,
      required: true,
    },
    lastModifiedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    lastModifiedByUsername: {
      type: String,
      default: null,
    },
    participants: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    participantUsernames: [String],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient queries
CollaborativeDocumentSchema.index({ conversationId: 1, isActive: 1 });
CollaborativeDocumentSchema.index({ conversationId: 1, createdAt: -1 });

export default mongoose.model<ICollaborativeDocument>(
  'CollaborativeDocument',
  CollaborativeDocumentSchema
);
