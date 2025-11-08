import mongoose, { Document, Schema } from 'mongoose';

interface ISetting extends Document {
  key: string;
  value: string;
}

const settingSchema = new Schema<ISetting>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    value: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true, // Add createdAt and updatedAt timestamps
  }
);

const Setting = mongoose.model<ISetting>('Setting', settingSchema);

export default Setting;
export type { ISetting };
