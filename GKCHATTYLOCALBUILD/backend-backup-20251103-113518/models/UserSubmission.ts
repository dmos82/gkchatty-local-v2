import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IUserSubmission extends Document {
  submittedByUserId: Types.ObjectId;
  submitterUsername: string;
  originalFilename: string;
  storageIdentifier: string; // Unique identifier for the stored file (e.g., generated filename)
  mimeType: string;
  fileSizeBytes: number;
  submittedAt: Date;
}

const UserSubmissionSchema: Schema = new Schema({
  submittedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  submitterUsername: { type: String, required: true }, // Store for easy display in admin panel
  originalFilename: { type: String, required: true },
  storageIdentifier: { type: String, required: true, unique: true },
  mimeType: { type: String, required: true },
  fileSizeBytes: { type: Number, required: true },
  submittedAt: { type: Date, default: Date.now },
});

export default mongoose.model<IUserSubmission>('UserSubmission', UserSubmissionSchema);
