import mongoose, { Document, Schema } from 'mongoose';

export interface IFolder extends Document {
  name: string;
  parentId?: mongoose.Types.ObjectId | null;
  knowledgeBaseId?: mongoose.Types.ObjectId;
  path: string;
  ownerId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const folderSchema = new Schema<IFolder>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    parentId: {
      type: Schema.Types.ObjectId,
      ref: 'Folder',
      default: null,
    },
    knowledgeBaseId: {
      type: Schema.Types.ObjectId,
      ref: 'TenantKnowledgeBase',
      required: false,
    },
    path: {
      type: String,
      required: true,
      index: true,
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient queries
folderSchema.index({ ownerId: 1, parentId: 1 });
folderSchema.index({ knowledgeBaseId: 1, parentId: 1 });
folderSchema.index({ path: 1, ownerId: 1 });

// Method to build the full path
folderSchema.methods.buildPath = async function () {
  const parts = [this.name];
  let current = this;

  while (current.parentId) {
    current = await Folder.findById(current.parentId);
    if (!current) break;
    parts.unshift(current.name);
  }

  this.path = '/' + parts.join('/');
  return this.path;
};

// Pre-save hook to build path
folderSchema.pre('save', async function (next) {
  if (this.isNew || this.isModified('parentId') || this.isModified('name')) {
    await this.buildPath();
  }
  next();
});

export const Folder = mongoose.model<IFolder>('Folder', folderSchema);
