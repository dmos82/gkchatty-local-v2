import mongoose, { Document, Schema } from 'mongoose';

export interface IPersona extends Document {
  name: string;
  prompt: string;
  userId: mongoose.Types.ObjectId; // Refers to 'User' model
  isActive: boolean; // True if this is the currently active persona for the user
  createdAt: Date;
  updatedAt: Date;
  systemPrompt: string; // Added: The system-level prompt for the persona
  isDefault?: boolean; // Added: Whether this is the default system persona
}

const personaSchema = new Schema<IPersona>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    prompt: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },
    systemPrompt: {
      type: String,
      required: false,
      trim: true,
      maxlength: 10000,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: false,
    },
    isDefault: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true } // Handles createdAt and updatedAt automatically
);

// Compound index to ensure only one persona can be active per user (if isActive is true)
// and to efficiently query for the active persona.
// A sparse index ensures that documents where isActive is false or not present are not subject to the uniqueness constraint.
personaSchema.index(
  { userId: 1, isActive: 1 },
  {
    unique: true,
    sparse: true,
    partialFilterExpression: { isActive: true },
  }
);

// Index for general querying by userId
personaSchema.index({ userId: 1 });

export const PersonaModel = mongoose.model<IPersona>('Persona', personaSchema);
export default PersonaModel;
