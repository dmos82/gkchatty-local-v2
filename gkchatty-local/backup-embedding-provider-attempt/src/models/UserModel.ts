import mongoose, { Schema, Document } from 'mongoose';

// Define the interface for the User document
export interface IUser extends Document {
  username: string;
  email: string;
  password?: string; // Optional because we might exclude it
  createdAt: Date;
  updatedAt: Date;
  role: 'user' | 'admin';
  activeSessionIds?: string[]; // Changed: Tracks multiple active session IDs for concurrent logins
  forcePasswordChange?: boolean; // Added: Requires password change on next login
  // --- Added for Usage Tracking ---
  usageMonthMarker?: string; // Format: YYYY-MM
  currentMonthPromptTokens?: number;
  currentMonthCompletionTokens?: number;
  currentMonthCost?: number; // Store cost in USD
  // --------------------------------
  // --- Persona feature flags ---
  isPersonaEnabled?: boolean;
  canCustomizePersona?: boolean;
  // --------------------------------
}

// Define the Mongoose schema
const UserSchema: Schema = new Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      index: true, // Ensure efficient lookups by username
      trim: true, // Remove leading/trailing whitespace
    },
    email: {
      type: String,
      required: false, // Make optional
      unique: false, // Remove unique constraint if allowing null/multiple empty
      sparse: true, // Recommended for optional unique fields, but removing unique anyway
      lowercase: true, // Store emails in lowercase if provided
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please use a valid email address.'], // Keep validation if value exists
      default: null, // Explicitly allow null
    },
    password: {
      type: String,
      required: true,
      select: false, // Exclude by default
    },
    createdAt: {
      type: Date,
      default: Date.now, // Automatically set the creation date
    },
    updatedAt: {
      type: Date,
      default: Date.now, // Automatically set the update date
    },
    role: {
      type: String,
      required: true,
      enum: ['user', 'admin'],
      default: 'user',
    },
    activeSessionIds: {
      // Changed: Tracks multiple active session IDs for concurrent logins
      type: [String],
      required: false,
      default: [],
      index: true,
    },
    forcePasswordChange: {
      // Added: Requires password change on next login
      type: Boolean,
      required: false,
      default: false,
    },
    // --- Added for Usage Tracking ---
    usageMonthMarker: {
      type: String,
      required: false,
      select: false, // Exclude by default
    },
    currentMonthPromptTokens: {
      type: Number,
      default: 0,
      select: false, // Exclude by default
    },
    currentMonthCompletionTokens: {
      type: Number,
      default: 0,
      select: false, // Exclude by default
    },
    currentMonthCost: {
      type: Number,
      default: 0,
      select: false, // Exclude by default
    },
    // --- Persona feature flags ---
    isPersonaEnabled: {
      type: Boolean,
      default: false,
    },
    canCustomizePersona: {
      type: Boolean,
      default: false,
    },
    // --- REMOVE: Display Name ---
    /*
  displayName: { 
    type: String, 
    required: false,
  },
  */
    // --------------------------------
  },
  { timestamps: true }
);

// Create and export the User model
// Mongoose will automatically create a collection named 'users' (pluralized, lowercase)
const User = mongoose.model<IUser>('User', UserSchema);

export default User;
