import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IParticipantMeta {
  unreadCount: number;
  lastReadAt: Date | null;
  isArchived: boolean;
  isMuted: boolean;
  joinedAt: Date;
  nickname?: string;
}

export interface ILastMessage {
  content: string;
  senderId: Types.ObjectId;
  senderUsername: string;
  sentAt: Date;
  isRead: boolean;
}

export interface IConversation extends Document {
  _id: Types.ObjectId;
  participants: Types.ObjectId[];
  participantUsernames: string[];
  lastMessage: ILastMessage | null;
  participantMeta: Map<string, IParticipantMeta>;
  deletedBy: Types.ObjectId[];
  isGroup: boolean;
  groupName?: string;
  groupIcon?: string;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;

  // Instance methods
  getUnreadCount(userId: string): number;
  incrementUnread(userId: string): Promise<void>;
  markAsRead(userId: string): Promise<void>;
}

const ParticipantMetaSchema = new Schema<IParticipantMeta>(
  {
    unreadCount: { type: Number, default: 0 },
    lastReadAt: { type: Date, default: null },
    isArchived: { type: Boolean, default: false },
    isMuted: { type: Boolean, default: false },
    joinedAt: { type: Date, default: Date.now },
    nickname: { type: String },
  },
  { _id: false }
);

const LastMessageSchema = new Schema<ILastMessage>(
  {
    content: { type: String, maxlength: 100 },
    senderId: { type: Schema.Types.ObjectId, ref: 'User' },
    senderUsername: { type: String },
    sentAt: { type: Date },
    isRead: { type: Boolean, default: false },
  },
  { _id: false }
);

const ConversationSchema = new Schema<IConversation>(
  {
    participants: {
      type: [{ type: Schema.Types.ObjectId, ref: 'User' }],
      required: true,
      validate: {
        validator: (v: Types.ObjectId[]) => v.length >= 2,
        message: 'Conversation must have at least 2 participants',
      },
    },
    participantUsernames: {
      type: [String],
      required: true,
    },
    lastMessage: {
      type: LastMessageSchema,
      default: null,
    },
    participantMeta: {
      type: Map,
      of: ParticipantMetaSchema,
      default: new Map(),
    },
    deletedBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    isGroup: { type: Boolean, default: false },
    groupName: { type: String },
    groupIcon: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
ConversationSchema.index({ participants: 1 });
ConversationSchema.index({ participants: 1, updatedAt: -1 });
ConversationSchema.index({ 'lastMessage.sentAt': -1 });

// NOTE: We previously had a unique index on { participants: 1, isGroup: 1 } but it was
// fundamentally broken. MongoDB creates index entries for each array element, so the unique
// constraint prevented users from being in more than one DM conversation. Removed.
// Duplicate prevention is now handled in findOrCreateDM via application logic.

// Helper method to get unread count for a user
ConversationSchema.methods.getUnreadCount = function (userId: string): number {
  const meta = this.participantMeta.get(userId);
  return meta?.unreadCount || 0;
};

// Helper method to increment unread count for a user
ConversationSchema.methods.incrementUnread = async function (
  userId: string
): Promise<void> {
  const meta = this.participantMeta.get(userId) || {
    unreadCount: 0,
    lastReadAt: null,
    isArchived: false,
    isMuted: false,
    joinedAt: new Date(),
  };
  meta.unreadCount += 1;
  this.participantMeta.set(userId, meta);
  await this.save();
};

// Helper method to mark as read for a user
ConversationSchema.methods.markAsRead = async function (
  userId: string
): Promise<void> {
  // Get existing meta or create a default entry if missing
  // This handles edge cases where participantMeta wasn't properly initialized
  const meta = this.participantMeta.get(userId) || {
    unreadCount: 0,
    lastReadAt: null,
    isArchived: false,
    isMuted: false,
    joinedAt: new Date(),
  };

  // Always update (even if unreadCount was already 0) to ensure data consistency
  meta.unreadCount = 0;
  meta.lastReadAt = new Date();
  this.participantMeta.set(userId, meta);
  await this.save();
};

// Static method to find or create a DM conversation between two users
ConversationSchema.statics.findOrCreateDM = async function (
  user1Id: Types.ObjectId,
  user1Username: string,
  user2Id: Types.ObjectId,
  user2Username: string
): Promise<{ conversation: IConversation; isNew: boolean }> {
  // Sort participant IDs to ensure consistent ordering
  const participants = [user1Id, user2Id].sort((a, b) =>
    a.toString().localeCompare(b.toString())
  );
  const participantUsernames =
    participants[0].equals(user1Id)
      ? [user1Username, user2Username]
      : [user2Username, user1Username];

  // Try to find existing conversation first
  let conversation = await this.findOne({
    participants: { $all: participants, $size: 2 },
    isGroup: false,
  });

  if (conversation) {
    return { conversation, isNew: false };
  }

  // Create new conversation
  const now = new Date();
  const participantMeta = new Map<string, IParticipantMeta>();
  participants.forEach((pId) => {
    participantMeta.set(pId.toString(), {
      unreadCount: 0,
      lastReadAt: null,
      isArchived: false,
      isMuted: false,
      joinedAt: now,
    });
  });

  try {
    conversation = new this({
      participants,
      participantUsernames,
      participantMeta,
      isGroup: false,
      deletedBy: [],
      lastMessage: null,
    });

    await conversation.save();
    return { conversation, isNew: true };
  } catch (error: any) {
    // Handle race condition - another request may have created the conversation
    // between our find and create. MongoDB error code 11000 = duplicate key.
    if (error.code === 11000) {
      console.log('[Conversation] Race condition detected, fetching existing conversation');
      const existingConversation = await this.findOne({
        participants: { $all: participants, $size: 2 },
        isGroup: false,
      });

      if (existingConversation) {
        return { conversation: existingConversation, isNew: false };
      }
    }

    // Re-throw if it's not a duplicate key error or we still can't find it
    throw error;
  }
};

// Ensure proper typing for static methods
export interface IConversationModel extends mongoose.Model<IConversation> {
  findOrCreateDM(
    user1Id: Types.ObjectId,
    user1Username: string,
    user2Id: Types.ObjectId,
    user2Username: string
  ): Promise<{ conversation: IConversation; isNew: boolean }>;
}

export default mongoose.model<IConversation, IConversationModel>(
  'Conversation',
  ConversationSchema
);
