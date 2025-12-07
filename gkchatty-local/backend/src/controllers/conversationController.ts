import { Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import Conversation from '../models/ConversationModel';
import DirectMessage from '../models/DirectMessageModel';
import UserPresence from '../models/UserPresenceModel';
import User from '../models/UserModel';
import UserSettings from '../models/UserSettings';
import { RequestWithUser } from '../middleware/authMiddleware';

/**
 * Get all conversations for the authenticated user
 * GET /api/conversations
 */
export const getConversations = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const conversations = await Conversation.find({
      participants: userId,
      deletedBy: { $ne: userId },
    })
      .sort({ updatedAt: -1 })
      .lean();

    // Get presence for all participants
    const allParticipantIds = new Set<string>();
    conversations.forEach((conv) => {
      conv.participants.forEach((p: Types.ObjectId) => {
        if (!p.equals(userId)) {
          allParticipantIds.add(p.toString());
        }
      });
    });

    const presenceMap = await UserPresence.getBulkPresence(
      Array.from(allParticipantIds).map((id) => new Types.ObjectId(id))
    );

    // Format response
    const formattedConversations = conversations.map((conv) => {
      const otherParticipantIndex = conv.participants.findIndex(
        (p: Types.ObjectId) => !p.equals(userId)
      );
      const otherParticipantId = conv.participants[otherParticipantIndex];
      const otherUsername = conv.participantUsernames[otherParticipantIndex];

      const presence = presenceMap.get(otherParticipantId.toString());
      // When using .lean(), Map becomes a plain object
      const participantMeta = conv.participantMeta as unknown as Record<string, any>;
      const userMeta = participantMeta?.[userId.toString()] || {
        unreadCount: 0,
        isArchived: false,
        isMuted: false,
      };

      return {
        _id: conv._id.toString(),
        otherParticipant: {
          _id: otherParticipantId.toString(),
          username: otherUsername,
          status: presence?.status || 'offline',
          lastSeenAt: presence?.lastSeenAt,
        },
        lastMessage: conv.lastMessage,
        unreadCount: userMeta.unreadCount || 0,
        isArchived: userMeta.isArchived || false,
        isMuted: userMeta.isMuted || false,
        isGroup: conv.isGroup,
        groupName: conv.groupName,
        updatedAt: conv.updatedAt,
        createdAt: conv.createdAt,
      };
    });

    res.json({
      success: true,
      conversations: formattedConversations,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get or create a conversation with another user
 * POST /api/conversations
 */
export const createConversation = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id;
    const username = (req.user as any)?.username;

    if (!userId || !username) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const { recipientId, recipientUsername } = req.body;

    if (!recipientId) {
      res.status(400).json({ success: false, message: 'Recipient ID is required' });
      return;
    }

    // Validate recipient exists
    const recipient = await User.findById(recipientId).select('_id username');
    if (!recipient) {
      res.status(404).json({ success: false, message: 'Recipient not found' });
      return;
    }

    // Cannot start conversation with yourself
    if (recipient._id.equals(userId)) {
      res.status(400).json({ success: false, message: 'Cannot start conversation with yourself' });
      return;
    }

    // Find or create the conversation
    const { conversation, isNew } = await Conversation.findOrCreateDM(
      new Types.ObjectId(userId),
      username,
      new Types.ObjectId(recipientId),
      recipientUsername || recipient.username
    );

    // Get recipient's presence
    const presence = await UserPresence.findOne({ userId: recipient._id });

    res.status(isNew ? 201 : 200).json({
      success: true,
      conversation: {
        _id: conversation._id.toString(),
        otherParticipant: {
          _id: recipient._id.toString(),
          username: recipient.username,
          status: presence?.status || 'offline',
          lastSeenAt: presence?.lastSeenAt,
        },
        lastMessage: conversation.lastMessage,
        unreadCount: 0,
        isArchived: false,
        isMuted: false,
        isGroup: false,
        updatedAt: conversation.updatedAt,
        createdAt: conversation.createdAt,
      },
      isNew,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get a specific conversation by ID
 * GET /api/conversations/:id
 */
export const getConversation = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id;
    const { id } = req.params;

    if (!userId) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    if (!Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, message: 'Invalid conversation ID' });
      return;
    }

    const conversation = await Conversation.findOne({
      _id: id,
      participants: userId,
      deletedBy: { $ne: userId },
    }).lean();

    if (!conversation) {
      res.status(404).json({ success: false, message: 'Conversation not found' });
      return;
    }

    // Get other participant's info and presence
    const otherParticipantIndex = conversation.participants.findIndex(
      (p: Types.ObjectId) => !p.equals(userId)
    );
    const otherParticipantId = conversation.participants[otherParticipantIndex];
    const otherUsername = conversation.participantUsernames[otherParticipantIndex];

    const presence = await UserPresence.findOne({ userId: otherParticipantId });
    // When using .lean(), Map becomes a plain object
    const participantMetaObj = conversation.participantMeta as unknown as Record<string, any>;
    const userMeta = participantMetaObj?.[userId.toString()] || {
      unreadCount: 0,
      isArchived: false,
      isMuted: false,
    };

    res.json({
      success: true,
      conversation: {
        _id: conversation._id.toString(),
        otherParticipant: {
          _id: otherParticipantId.toString(),
          username: otherUsername,
          status: presence?.status || 'offline',
          lastSeenAt: presence?.lastSeenAt,
        },
        lastMessage: conversation.lastMessage,
        unreadCount: userMeta.unreadCount || 0,
        isArchived: userMeta.isArchived || false,
        isMuted: userMeta.isMuted || false,
        isGroup: conversation.isGroup,
        groupName: conversation.groupName,
        updatedAt: conversation.updatedAt,
        createdAt: conversation.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Soft delete a conversation for the current user
 * DELETE /api/conversations/:id
 */
export const deleteConversation = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id;
    const { id } = req.params;

    if (!userId) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    if (!Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, message: 'Invalid conversation ID' });
      return;
    }

    const conversation = await Conversation.findOneAndUpdate(
      {
        _id: id,
        participants: userId,
      },
      {
        $addToSet: { deletedBy: userId },
      },
      { new: true }
    );

    if (!conversation) {
      res.status(404).json({ success: false, message: 'Conversation not found' });
      return;
    }

    res.json({
      success: true,
      message: 'Conversation deleted',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get messages for a conversation with pagination
 * GET /api/conversations/:id/messages
 */
export const getMessages = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id;
    const { id } = req.params;
    const { limit = '50', before, after } = req.query;

    if (!userId) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    if (!Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, message: 'Invalid conversation ID' });
      return;
    }

    // Verify user is participant
    const conversation = await Conversation.findOne({
      _id: id,
      participants: userId,
    });

    if (!conversation) {
      res.status(404).json({ success: false, message: 'Conversation not found' });
      return;
    }

    const messageLimit = Math.min(parseInt(limit as string) || 50, 100);

    // Build query
    const query: Record<string, unknown> = {
      conversationId: new Types.ObjectId(id),
      isDeleted: false,
    };

    if (before && Types.ObjectId.isValid(before as string)) {
      query._id = { $lt: new Types.ObjectId(before as string) };
    } else if (after && Types.ObjectId.isValid(after as string)) {
      query._id = { $gt: new Types.ObjectId(after as string) };
    }

    const messages = await DirectMessage.find(query)
      .sort({ _id: after ? 1 : -1 })
      .limit(messageLimit + 1) // Fetch one extra to check if there are more
      .lean();

    const hasMore = messages.length > messageLimit;
    if (hasMore) {
      messages.pop(); // Remove the extra one
    }

    // Ensure messages are in chronological order (oldest first) for chat display
    // - Initial load (no cursor): sorted DESC, need to reverse
    // - Load older (before cursor): sorted DESC, need to reverse
    // - Load newer (after cursor): sorted ASC, already correct order
    if (!after) {
      messages.reverse();
    }

    const formattedMessages = messages.map((msg) => {
      // Debug logging for attachments
      if (msg.attachments && msg.attachments.length > 0) {
        console.log(`[getMessages] Message ${msg._id} has ${msg.attachments.length} attachment(s):`, JSON.stringify(msg.attachments, null, 2));
      }
      return {
        _id: msg._id.toString(),
        senderId: msg.senderId.toString(),
        senderUsername: msg.senderUsername,
        content: msg.content,
        messageType: msg.messageType,
        status: msg.status,
        createdAt: msg.createdAt,
        editedAt: msg.editedAt,
        isDeleted: msg.isDeleted,
        replyTo: msg.replyTo
          ? {
              messageId: msg.replyTo.messageId.toString(),
              content: msg.replyTo.content,
              senderUsername: msg.replyTo.senderUsername,
            }
          : undefined,
        attachments: msg.attachments,
      };
    });

    res.json({
      success: true,
      messages: formattedMessages,
      pagination: {
        hasMore,
        oldestMessageId: formattedMessages.length > 0 ? formattedMessages[0]._id : null,
        newestMessageId:
          formattedMessages.length > 0
            ? formattedMessages[formattedMessages.length - 1]._id
            : null,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Mark all messages in a conversation as read
 * POST /api/conversations/:id/read
 */
export const markConversationRead = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id;
    const { id } = req.params;

    if (!userId) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    if (!Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, message: 'Invalid conversation ID' });
      return;
    }

    const conversation = await Conversation.findOne({
      _id: id,
      participants: userId,
    });

    if (!conversation) {
      res.status(404).json({ success: false, message: 'Conversation not found' });
      return;
    }

    // Mark conversation as read
    await conversation.markAsRead(userId.toString());

    // Update all unread messages as read
    await DirectMessage.updateMany(
      {
        conversationId: new Types.ObjectId(id),
        senderId: { $ne: userId },
        'readBy.userId': { $ne: userId },
      },
      {
        $push: {
          readBy: {
            userId: userId,
            readAt: new Date(),
          },
        },
        $set: { status: 'read' },
      }
    );

    res.json({
      success: true,
      message: 'Conversation marked as read',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get online users (for starting new conversations)
 * GET /api/conversations/users/online
 */
export const getOnlineUsers = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    // Get all users except current user
    const users = await User.find({
      _id: { $ne: userId },
    })
      .select('_id username')
      .lean();

    // Get presence for all users
    const userIds = users.map((u) => u._id);
    const presenceMap = await UserPresence.getBulkPresence(userIds);

    // Get user settings (icons) for all users
    const userSettings = await UserSettings.find({
      userId: { $in: userIds },
    })
      .select('userId iconUrl')
      .lean();

    const iconMap = new Map<string, string>();
    userSettings.forEach((settings) => {
      if (settings.iconUrl) {
        iconMap.set(settings.userId.toString(), settings.iconUrl);
      }
    });

    const usersWithPresence = users.map((user) => {
      const presence = presenceMap.get(user._id.toString());
      const iconUrl = iconMap.get(user._id.toString());
      return {
        _id: user._id.toString(),
        username: user.username,
        status: presence?.status || 'offline',
        lastSeenAt: presence?.lastSeenAt,
        iconUrl: iconUrl || null,
      };
    });

    // Sort: online first, then by username
    usersWithPresence.sort((a, b) => {
      if (a.status === 'online' && b.status !== 'online') return -1;
      if (a.status !== 'online' && b.status === 'online') return 1;
      return a.username.localeCompare(b.username);
    });

    res.json({
      success: true,
      users: usersWithPresence,
    });
  } catch (error) {
    next(error);
  }
};
