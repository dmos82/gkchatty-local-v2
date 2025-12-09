import { Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import Conversation from '../models/ConversationModel';
import DirectMessage from '../models/DirectMessageModel';
import UserPresence from '../models/UserPresenceModel';
import User from '../models/UserModel';
import UserSettings from '../models/UserSettings';
import { RequestWithUser } from '../middleware/authMiddleware';
import socketService from '../services/socketService';
import { getPresignedUrlForView } from '../utils/s3Helper';

/**
 * Helper function to generate a fresh URL from a stored icon key/URL
 * Handles both legacy URLs (already presigned) and new key-based storage
 */
const getIconUrl = async (storedIconValue: string | null | undefined): Promise<string | null> => {
  if (!storedIconValue) return null;

  // If it looks like a URL (starts with http), return as-is (legacy support)
  // If it's a key (like "user_icons/..."), generate a fresh presigned URL
  if (storedIconValue.startsWith('http://') || storedIconValue.startsWith('https://')) {
    // Legacy presigned URL - might be expired, but try anyway
    return storedIconValue;
  }

  // It's an S3 key - generate a fresh presigned URL
  try {
    return await getPresignedUrlForView(storedIconValue);
  } catch (error) {
    console.error('[getIconUrl] Error generating presigned URL:', error);
    return null;
  }
};

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
          customStatus: presence?.customStatus || null,
        },
        lastMessage: conv.lastMessage,
        unreadCount: userMeta.unreadCount || 0,
        isArchived: userMeta.isArchived || false,
        isMuted: userMeta.isMuted || false,
        isGroup: conv.isGroup,
        groupName: conv.groupName,
        participantUsernames: conv.isGroup ? conv.participantUsernames : undefined,
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
          customStatus: presence?.customStatus || null,
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
          customStatus: presence?.customStatus || null,
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
 * Search messages in a conversation
 * GET /api/conversations/:id/messages/search?q=term
 */
export const searchMessages = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id;
    const { id } = req.params;
    const { q, limit = '50' } = req.query;

    if (!userId) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    if (!Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, message: 'Invalid conversation ID' });
      return;
    }

    if (!q || typeof q !== 'string' || q.trim().length === 0) {
      res.status(400).json({ success: false, message: 'Search query is required' });
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

    const searchLimit = Math.min(parseInt(limit as string) || 50, 100);
    const searchTerm = q.trim();

    // Escape special regex characters for safety
    const escapedTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Search messages by content (case-insensitive)
    const messages = await DirectMessage.find({
      conversationId: new Types.ObjectId(id),
      isDeleted: false,
      content: { $regex: escapedTerm, $options: 'i' },
    })
      .sort({ createdAt: -1 }) // Most recent first
      .limit(searchLimit)
      .lean();

    const formattedMessages = messages.map((msg) => ({
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
    }));

    res.json({
      success: true,
      query: searchTerm,
      totalResults: formattedMessages.length,
      messages: formattedMessages,
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
 * Create a group conversation
 * POST /api/conversations/group
 */
export const createGroupConversation = async (
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

    const { participantIds, groupName } = req.body;

    if (!participantIds || !Array.isArray(participantIds) || participantIds.length < 1) {
      res.status(400).json({ success: false, message: 'At least one participant is required' });
      return;
    }

    if (!groupName || typeof groupName !== 'string' || groupName.trim().length === 0) {
      res.status(400).json({ success: false, message: 'Group name is required' });
      return;
    }

    // Validate all participant IDs and get usernames
    const participantObjectIds = participantIds.map((id: string) => new Types.ObjectId(id));
    const participants = await User.find({ _id: { $in: participantObjectIds } }).select('_id username');

    if (participants.length !== participantIds.length) {
      res.status(400).json({ success: false, message: 'One or more participants not found' });
      return;
    }

    // Cannot include yourself as participant (you're added automatically as creator)
    if (participantIds.includes(userId.toString())) {
      res.status(400).json({ success: false, message: 'Cannot include yourself in participant list' });
      return;
    }

    // Build full participant list (creator + selected participants)
    const allParticipantIds = [userId, ...participantObjectIds];
    const allParticipantUsernames = [username, ...participants.map(p => p.username)];

    // Initialize participant metadata
    const now = new Date();
    const participantMeta = new Map<string, {
      unreadCount: number;
      lastReadAt: Date | null;
      isArchived: boolean;
      isMuted: boolean;
      joinedAt: Date;
    }>();

    allParticipantIds.forEach((pId) => {
      participantMeta.set(pId.toString(), {
        unreadCount: 0,
        lastReadAt: null,
        isArchived: false,
        isMuted: false,
        joinedAt: now,
      });
    });

    // Create the group conversation
    const conversation = new Conversation({
      participants: allParticipantIds,
      participantUsernames: allParticipantUsernames,
      participantMeta,
      isGroup: true,
      groupName: groupName.trim(),
      createdBy: userId,
      deletedBy: [],
      lastMessage: null,
    });

    await conversation.save();

    // Get presence for all participants
    const presenceMap = await UserPresence.getBulkPresence(participantObjectIds);

    // Format participant info for response
    const memberInfo = participants.map((p) => {
      const presence = presenceMap.get(p._id.toString());
      return {
        _id: p._id.toString(),
        username: p.username,
        status: presence?.status || 'offline',
        lastSeenAt: presence?.lastSeenAt,
      };
    });

    res.status(201).json({
      success: true,
      conversation: {
        _id: conversation._id.toString(),
        isGroup: true,
        groupName: conversation.groupName,
        participants: memberInfo,
        participantUsernames: allParticipantUsernames, // Include usernames array for frontend
        createdBy: userId.toString(),
        lastMessage: null,
        unreadCount: 0,
        updatedAt: conversation.updatedAt,
        createdAt: conversation.createdAt,
      },
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

    // Generate fresh presigned URLs for all user icons
    const usersWithPresence = await Promise.all(
      users.map(async (user) => {
        const presence = presenceMap.get(user._id.toString());
        const storedIconValue = iconMap.get(user._id.toString());
        // Use helper to generate fresh URL from stored key
        const iconUrl = await getIconUrl(storedIconValue);
        return {
          _id: user._id.toString(),
          username: user.username,
          status: presence?.status || 'offline',
          lastSeenAt: presence?.lastSeenAt,
          iconUrl,
          customStatus: presence?.customStatus || null,
        };
      })
    );

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

/**
 * Add members to a group conversation
 * POST /api/conversations/:id/members
 */
export const addGroupMembers = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id;
    const { id } = req.params;
    const { memberIds } = req.body;

    if (!userId) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    if (!Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, message: 'Invalid conversation ID' });
      return;
    }

    if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
      res.status(400).json({ success: false, message: 'At least one member ID is required' });
      return;
    }

    const conversation = await Conversation.findOne({
      _id: id,
      participants: userId,
      isGroup: true,
    });

    if (!conversation) {
      res.status(404).json({ success: false, message: 'Group conversation not found' });
      return;
    }

    // Validate new member IDs and get usernames
    const newMemberObjectIds = memberIds.map((mid: string) => new Types.ObjectId(mid));
    const newMembers = await User.find({ _id: { $in: newMemberObjectIds } }).select('_id username');

    if (newMembers.length !== memberIds.length) {
      res.status(400).json({ success: false, message: 'One or more members not found' });
      return;
    }

    // Filter out members who are already in the group
    const existingParticipantIds = new Set(conversation.participants.map((p) => p.toString()));
    const membersToAdd = newMembers.filter((m) => !existingParticipantIds.has(m._id.toString()));

    if (membersToAdd.length === 0) {
      res.status(400).json({ success: false, message: 'All specified members are already in the group' });
      return;
    }

    // Add new members to participants and participantUsernames
    const now = new Date();
    for (const member of membersToAdd) {
      conversation.participants.push(member._id);
      conversation.participantUsernames.push(member.username);

      // Initialize participantMeta for new member
      conversation.participantMeta.set(member._id.toString(), {
        unreadCount: 0,
        lastReadAt: null,
        isArchived: false,
        isMuted: false,
        joinedAt: now,
      });
    }

    await conversation.save();

    res.json({
      success: true,
      message: `Added ${membersToAdd.length} member(s) to the group`,
      addedMembers: membersToAdd.map((m) => ({ _id: m._id.toString(), username: m.username })),
      participantUsernames: conversation.participantUsernames,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Leave a group conversation (remove self)
 * POST /api/conversations/:id/leave
 */
export const leaveGroup = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id;
    const username = (req.user as any)?.username;
    const { id } = req.params;

    if (!userId || !username) {
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
      isGroup: true,
    });

    if (!conversation) {
      res.status(404).json({ success: false, message: 'Group conversation not found' });
      return;
    }

    // Remove user from participants and participantUsernames
    const userIndex = conversation.participants.findIndex((p) => p.equals(userId));
    if (userIndex !== -1) {
      conversation.participants.splice(userIndex, 1);
      conversation.participantUsernames.splice(userIndex, 1);
    }

    // Remove from participantMeta
    conversation.participantMeta.delete(userId.toString());

    // Get the IO instance for socket events
    const io = socketService.getIO();

    // If only 1 person left (or 0), delete the group entirely
    if (conversation.participants.length <= 1) {
      // Notify remaining participant (if any) that group is deleted
      if (conversation.participants.length === 1) {
        const remainingParticipant = conversation.participants[0];
        io?.to(`user:${remainingParticipant.toString()}`).emit('group:deleted', {
          conversationId: id,
          groupName: conversation.groupName,
          deletedBy: username,
          reason: 'last_member_left',
        });
      }

      // Notify the leaving user to remove from their UI
      io?.to(`user:${userId.toString()}`).emit('group:deleted', {
        conversationId: id,
        groupName: conversation.groupName,
        deletedBy: username,
        reason: 'you_left',
      });

      // Delete all messages in the conversation
      await DirectMessage.deleteMany({ conversationId: conversation._id });
      // Delete the conversation
      await Conversation.deleteOne({ _id: id });

      res.json({
        success: true,
        message: 'Successfully left the group. Group was deleted as you were the last member.',
        groupDeleted: true,
      });
      return;
    }

    // If user was the creator, transfer ownership to next participant
    if (conversation.createdBy?.equals(userId)) {
      conversation.createdBy = conversation.participants[0];
    }

    await conversation.save();

    // Notify the user who left so they can remove it from their UI
    io?.to(`user:${userId.toString()}`).emit('group:deleted', {
      conversationId: id,
      groupName: conversation.groupName,
      deletedBy: username,
      reason: 'you_left',
    });

    // Notify remaining participants that someone left
    for (const participantId of conversation.participants) {
      io?.to(`user:${participantId.toString()}`).emit('group:member_left', {
        conversationId: id,
        groupName: conversation.groupName,
        leftUser: { _id: userId.toString(), username },
        remainingParticipants: conversation.participantUsernames,
      });
    }

    res.json({
      success: true,
      message: 'Successfully left the group',
      groupDeleted: false,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a group conversation (only creator can delete)
 * DELETE /api/conversations/:id
 */
export const deleteGroupConversation = async (
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
      isGroup: true,
    });

    if (!conversation) {
      res.status(404).json({ success: false, message: 'Group conversation not found' });
      return;
    }

    // Only creator can delete the group
    if (!conversation.createdBy?.equals(userId)) {
      res.status(403).json({
        success: false,
        message: 'Only the group creator can delete this group',
      });
      return;
    }

    // Get the IO instance for socket events before deletion
    const io = socketService.getIO();
    const deletedByUsername = (req.user as any)?.username;

    // Notify all other participants that the group has been deleted
    for (const participantId of conversation.participants) {
      if (!participantId.equals(userId)) {
        io?.to(`user:${participantId.toString()}`).emit('group:deleted', {
          conversationId: id,
          groupName: conversation.groupName,
          deletedBy: deletedByUsername,
          reason: 'creator_deleted',
        });
      }
    }

    // Delete all messages in the conversation
    await DirectMessage.deleteMany({ conversationId: conversation._id });

    // Delete the conversation
    await Conversation.deleteOne({ _id: id });

    res.json({
      success: true,
      message: 'Group conversation deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};
