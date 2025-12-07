import mongoose, { Schema, Document } from 'mongoose';

export type GapStatus = 'new' | 'reviewed' | 'addressed' | 'dismissed';

export interface IKnowledgeGap extends Document {
  query: string;                    // The original question text
  normalizedQuery: string;          // Lowercase, trimmed for grouping
  bestScore: number;                // Highest RAG score received (still below threshold)
  occurrenceCount: number;          // How many times this question was asked
  lastAskedAt: Date;                // When it was last asked
  firstAskedAt: Date;               // When it was first recorded
  userIds: mongoose.Types.ObjectId[];  // Unique users who asked this
  status: GapStatus;                // Current status
  reviewedBy: mongoose.Types.ObjectId | null;  // Admin who reviewed
  reviewedAt: Date | null;
  notes: string | null;             // Admin notes
  suggestedDocTitle: string | null; // If addressed, what doc was added
}

const KnowledgeGapSchema = new Schema<IKnowledgeGap>(
  {
    query: {
      type: String,
      required: true,
    },
    normalizedQuery: {
      type: String,
      required: true,
      index: true,
    },
    bestScore: {
      type: Number,
      required: true,
      default: 0,
    },
    occurrenceCount: {
      type: Number,
      required: true,
      default: 1,
    },
    lastAskedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    firstAskedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    userIds: [{
      type: Schema.Types.ObjectId,
      ref: 'User',
    }],
    status: {
      type: String,
      enum: ['new', 'reviewed', 'addressed', 'dismissed'],
      default: 'new',
      index: true,
    },
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      default: null,
    },
    suggestedDocTitle: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient lookups
KnowledgeGapSchema.index({ status: 1, occurrenceCount: -1 });
KnowledgeGapSchema.index({ normalizedQuery: 1 }, { unique: true });

const KnowledgeGap = mongoose.model<IKnowledgeGap>('KnowledgeGap', KnowledgeGapSchema);

export default KnowledgeGap;
