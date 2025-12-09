import mongoose, { Schema, Document, Types } from 'mongoose';

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
export type MessageType = 'text' | 'image' | 'file' | 'system';

export interface IAttachment {
  type: 'image' | 'file' | 'voice';
  url: string;
  filename: string;
  size: number;
  mimeType: string;
  s3Key?: string;
  duration?: number; // Duration in seconds (for voice messages)
}

export interface IReadReceipt {
  userId: Types.ObjectId;
  readAt: Date;
}

export interface IDeliveryReceipt {
  userId: Types.ObjectId;
  deliveredAt: Date;
}

export interface IReplyTo {
  messageId: Types.ObjectId;
  content: string;
  senderUsername: string;
}

export interface ISystemData {
  action: 'user_joined' | 'user_left' | 'conversation_created';
  targetUserId?: Types.ObjectId;
  targetUsername?: string;
}

export interface IReactionUser {
  userId: Types.ObjectId;
  username: string;
  reactedAt: Date;
}

export interface IReaction {
  emoji: string;
  users: IReactionUser[];
}

export interface IDirectMessage extends Document {
  _id: Types.ObjectId;
  conversationId: Types.ObjectId;
  senderId: Types.ObjectId;
  senderUsername: string;
  content: string;
  messageType: MessageType;
  attachments?: IAttachment[];
  status: MessageStatus;
  createdAt: Date;
  updatedAt: Date;
  editedAt?: Date;
  readBy: IReadReceipt[];
  deliveredTo: IDeliveryReceipt[];
  replyTo?: IReplyTo;
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: Types.ObjectId;
  systemData?: ISystemData;
  reactions?: IReaction[];

  // Instance methods
  markDelivered(userId: Types.ObjectId): Promise<void>;
  markRead(userId: Types.ObjectId): Promise<void>;
}

const AttachmentSchema = new Schema<IAttachment>(
  {
    type: { type: String, enum: ['image', 'file', 'voice'], required: true },
    url: { type: String, required: true },
    filename: { type: String, required: true },
    size: { type: Number, required: true },
    mimeType: { type: String, required: true },
    s3Key: { type: String },
    duration: { type: Number }, // Duration in seconds (for voice messages)
  },
  { _id: false }
);

const ReadReceiptSchema = new Schema<IReadReceipt>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    readAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const DeliveryReceiptSchema = new Schema<IDeliveryReceipt>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    deliveredAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ReplyToSchema = new Schema<IReplyTo>(
  {
    messageId: { type: Schema.Types.ObjectId, ref: 'DirectMessage', required: true },
    content: { type: String, maxlength: 100 },
    senderUsername: { type: String, required: true },
  },
  { _id: false }
);

const SystemDataSchema = new Schema<ISystemData>(
  {
    action: {
      type: String,
      enum: ['user_joined', 'user_left', 'conversation_created'],
      required: true,
    },
    targetUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    targetUsername: { type: String },
  },
  { _id: false }
);

const ReactionUserSchema = new Schema<IReactionUser>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    username: { type: String, required: true },
    reactedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ReactionSchema = new Schema<IReaction>(
  {
    emoji: { type: String, required: true },
    users: [ReactionUserSchema],
  },
  { _id: false }
);

const DirectMessageSchema = new Schema<IDirectMessage>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    senderUsername: {
      type: String,
      required: true,
    },
    content: {
      type: String,
      required: false, // Optional - allows attachment-only messages
      default: '',
      maxlength: 4000,
    },
    messageType: {
      type: String,
      enum: ['text', 'image', 'file', 'system'],
      default: 'text',
    },
    attachments: [AttachmentSchema],
    status: {
      type: String,
      enum: ['sending', 'sent', 'delivered', 'read', 'failed'],
      default: 'sent',
    },
    editedAt: { type: Date },
    readBy: [ReadReceiptSchema],
    deliveredTo: [DeliveryReceiptSchema],
    replyTo: ReplyToSchema,
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    systemData: SystemDataSchema,
    reactions: [ReactionSchema],
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
DirectMessageSchema.index({ conversationId: 1, createdAt: -1 });
DirectMessageSchema.index({ conversationId: 1, _id: -1 }); // For cursor pagination
DirectMessageSchema.index({ senderId: 1, createdAt: -1 });
DirectMessageSchema.index({ 'readBy.userId': 1 });

// Helper method to mark as delivered for a user
DirectMessageSchema.methods.markDelivered = async function (
  userId: Types.ObjectId
): Promise<void> {
  const alreadyDelivered = this.deliveredTo.some(
    (d: IDeliveryReceipt) => d.userId.equals(userId)
  );

  if (!alreadyDelivered) {
    this.deliveredTo.push({ userId, deliveredAt: new Date() });
    if (this.status === 'sent') {
      this.status = 'delivered';
    }
    await this.save();
  }
};

// Helper method to mark as read for a user
DirectMessageSchema.methods.markRead = async function (
  userId: Types.ObjectId
): Promise<void> {
  const alreadyRead = this.readBy.some((r: IReadReceipt) => r.userId.equals(userId));

  if (!alreadyRead) {
    this.readBy.push({ userId, readAt: new Date() });
    this.status = 'read';
    await this.save();
  }
};

// Static method to get messages for a conversation with pagination
DirectMessageSchema.statics.getMessagesForConversation = async function (
  conversationId: Types.ObjectId,
  options: { limit?: number; before?: Types.ObjectId } = {}
): Promise<IDirectMessage[]> {
  const { limit = 50, before } = options;

  const query: Record<string, unknown> = {
    conversationId,
    isDeleted: false,
  };

  if (before) {
    query._id = { $lt: before };
  }

  return this.find(query)
    .sort({ _id: -1 })
    .limit(limit)
    .lean();
};

// Ensure proper typing for static methods
export interface IDirectMessageModel extends mongoose.Model<IDirectMessage> {
  getMessagesForConversation(
    conversationId: Types.ObjectId,
    options?: { limit?: number; before?: Types.ObjectId }
  ): Promise<IDirectMessage[]>;
}

export default mongoose.model<IDirectMessage, IDirectMessageModel>(
  'DirectMessage',
  DirectMessageSchema
);
