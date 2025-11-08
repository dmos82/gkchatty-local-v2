import mongoose, { Document, Schema } from 'mongoose';

export interface IUserSettings extends Document {
  userId: mongoose.Types.ObjectId;
  customPrompt?: string;
  iconUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSettingsSchema = new Schema<IUserSettings>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    customPrompt: {
      type: String,
      required: false,
    },
    iconUrl: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true, // Add createdAt and updatedAt timestamps
  }
);

const UserSettings = mongoose.model<IUserSettings>('UserSettings', userSettingsSchema);

export default UserSettings;
