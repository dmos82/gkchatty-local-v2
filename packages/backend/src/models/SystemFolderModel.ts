import mongoose, { Document, Schema } from 'mongoose';

export interface ISystemFolder extends Document {
  name: string;
  parentId?: mongoose.Types.ObjectId | null;
  path: string;
  metadata: {
    createdBy: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
  };
}

const systemFolderSchema = new Schema<ISystemFolder>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    parentId: {
      type: Schema.Types.ObjectId,
      ref: 'SystemFolder',
      default: null,
    },
    path: {
      type: String,
      required: true,
      index: true,
    },
    metadata: {
      createdBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
      createdAt: {
        type: Date,
        default: Date.now,
      },
      updatedAt: {
        type: Date,
        default: Date.now,
      },
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient queries
systemFolderSchema.index({ parentId: 1 });
systemFolderSchema.index({ path: 1 });

// Method to build the full path
systemFolderSchema.methods.buildPath = async function () {
  const parts = [this.name];
  let current = this;

  while (current.parentId) {
    current = await SystemFolder.findById(current.parentId);
    if (!current) break;
    parts.unshift(current.name);
  }

  this.path = '/' + parts.join('/');
  return this.path;
};

// Pre-save hook to build path
systemFolderSchema.pre('save', async function (next) {
  if (this.isNew || this.isModified('parentId') || this.isModified('name')) {
    await this.buildPath();
  }
  this.metadata.updatedAt = new Date();
  next();
});

export const SystemFolder = mongoose.model<ISystemFolder>('SystemFolder', systemFolderSchema);
