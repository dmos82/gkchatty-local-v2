import mongoose, { Document, Schema } from 'mongoose';

// Define the interface for the Feedback document
export interface IFeedback extends Document {
  feedbackText: string;
  userId: mongoose.Schema.Types.ObjectId;
  username: string; // Denormalized for easier querying/display
  chatId?: mongoose.Schema.Types.ObjectId;
  createdAt: Date;
}

// Define the Mongoose schema
const FeedbackSchema: Schema = new Schema({
  feedbackText: {
    type: String,
    required: [true, 'Feedback text is required.'],
    trim: true,
    minlength: [1, 'Feedback text cannot be empty.'],
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true, // Index for potential user-specific lookups
  },
  username: {
    type: String,
    required: [true, 'Username is required.'],
  },
  chatId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chat',
    required: false, // Optional link to a specific chat session
    index: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true, // Index for sorting
  },
});

// Create and export the Feedback model
const Feedback = mongoose.model<IFeedback>('Feedback', FeedbackSchema);

export default Feedback;
