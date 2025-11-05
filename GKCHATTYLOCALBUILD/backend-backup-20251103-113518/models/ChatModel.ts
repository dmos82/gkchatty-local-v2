import mongoose, { Schema, Document, Types } from 'mongoose';

// Interface for a single message within a chat
interface IChatMessage {
  role: 'user' | 'assistant'; // Changed 'ai' to 'assistant' to match OpenAI terminology
  content: string;
  sources?: {
    // Optional field for AI assistant messages
    documentId: string | null; // Can be MongoDB ID for user docs or filename/UUID for system
    fileName: string;
    pageNumbers?: number[];
    type: 'user' | 'system';
    text?: string; // Include original chunk text if needed for context/display
  }[];
  timestamp: Date;
  metadata?: {
    // Optional field for cost/token tracking on assistant messages
    tokenUsage: {
      prompt: number;
      completion: number;
      total: number;
    };
    cost: number;
  };
}

// Interface for the Chat document
export interface IChat extends Document {
  userId: Types.ObjectId;
  chatName: string;
  createdAt: Date;
  updatedAt: Date;
  messages: IChatMessage[];
  notes?: string;
  personaId?: Types.ObjectId; // Added: Optional, refers to Persona model
  currentSearchMode: 'unified' | 'user' | 'system' | 'kb'; // Added: Tracks current search mode
  activeTenantKbId?: Types.ObjectId; // Added: Optional, for tenant KB selection
}

// Schema for source documents embedded within messages
const sourceSchema = new mongoose.Schema(
  {
    documentId: { type: String, required: false }, // Can be MongoDB ID or other identifier
    fileName: { type: String, required: true },
    pageNumbers: { type: [Number], required: false },
    type: { type: String, required: true, enum: ['user', 'system'] },
    text: { type: String, required: false },
  },
  { _id: false }
);

// Schema for ChatMessage (now explicitly defined with _id)
const messageSchema = new mongoose.Schema({
  _id: {
    type: mongoose.Schema.Types.ObjectId,
    default: () => new mongoose.Types.ObjectId(),
    required: true,
  },
  role: { type: String, required: true, enum: ['user', 'assistant'] },
  content: { type: String, required: true },
  sources: [sourceSchema], // Use the defined sourceSchema
  metadata: { type: Schema.Types.Mixed, required: false }, // Allow flexible metadata
  timestamp: { type: Date, default: Date.now },
});

// Schema for Chat
const ChatSchema: Schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    chatName: { type: String, required: true, default: 'New Chat' },
    messages: [messageSchema], // Array of messages using the defined schema
    notes: { type: String, required: false },
  },
  { timestamps: true }
); // Automatically adds createdAt and updatedAt

// Add compound index for better query performance
ChatSchema.index({ userId: 1, updatedAt: -1 }); // For fetching user's chats sorted by update time
ChatSchema.index({ userId: 1, _id: 1 }); // For delete operations

const Chat = mongoose.model<IChat>('Chat', ChatSchema);

export default Chat; // Export the model as default
export type { IChatMessage }; // Export the type separately
