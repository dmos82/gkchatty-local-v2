import { Server as HTTPServer } from 'http';
import { Server, Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import * as Y from 'yjs';
import User from '../models/UserModel';
import UserPresence, { IUserPresence, PresenceStatus } from '../models/UserPresenceModel';
import Conversation from '../models/ConversationModel';
import DirectMessage from '../models/DirectMessageModel';
import CollaborativeDocument, { CollaborativeDocumentFileType } from '../models/CollaborativeDocumentModel';

// WebRTC types (browser-specific, defined for Node.js server pass-through)
interface RTCSessionDescriptionInit {
  type?: 'offer' | 'answer' | 'pranswer' | 'rollback';
  sdp?: string;
}

interface RTCIceCandidateInit {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

// Decoded JWT payload interface (matching authMiddleware)
interface DecodedUserPayload extends jwt.JwtPayload {
  userId: string;
  username: string;
  email?: string;
  role?: 'user' | 'admin';
  iat: number;
  exp: number;
  jti?: string;
}

// Extended socket with user data
interface AuthenticatedSocket extends Socket {
  userId: string;
  username: string;
  userObjectId: Types.ObjectId;
}

// Attachment interface for DM file sharing
interface MessageAttachment {
  type: 'image' | 'file';
  url: string;
  filename: string;
  size: number;
  mimeType: string;
  s3Key?: string; // For copy-to-docs functionality
}

// Event payload interfaces
interface SendMessagePayload {
  conversationId: string;
  recipientId?: string; // For new conversations
  content: string;
  clientMessageId: string; // Client-generated ID for optimistic UI
  messageType?: 'text' | 'image' | 'file';
  attachments?: MessageAttachment[]; // File attachments
  replyTo?: {
    messageId: string;
    content: string;
    senderUsername: string;
  };
}

interface TypingPayload {
  conversationId: string;
  isTyping: boolean;
}

interface MarkReadPayload {
  conversationId: string;
  lastReadMessageId: string;
}

interface PresenceUpdatePayload {
  status: PresenceStatus;
  customStatus?: string;
}

interface SetDNDPayload {
  enabled: boolean;
  dndUntil?: string; // ISO date string
  dndMessage?: string;
}

interface EditMessagePayload {
  conversationId: string;
  messageId: string;
  newContent: string;
}

interface DeleteMessagePayload {
  conversationId: string;
  messageId: string;
}

interface ReactMessagePayload {
  conversationId: string;
  messageId: string;
  emoji: string; // 👍, ❤️, 😂, 😮, 😢, 🎉
}

// Collaborative Document Event Payloads
interface CollabCreatePayload {
  conversationId: string;
  title: string;
  fileType: 'docx' | 'txt' | 'md' | 'rtf';
}

interface CollabJoinPayload {
  documentId: string;
}

interface CollabLeavePayload {
  documentId: string;
}

interface CollabSyncPayload {
  documentId: string;
  update: number[]; // Yjs update as byte array
}

interface CollabAwarenessPayload {
  documentId: string;
  awareness: {
    cursor?: { index: number; length: number };
    user: { id: string; name: string; color: string };
  };
}

// WebRTC Voice/Video Call Event Payloads
interface CallInitiatePayload {
  targetUserId: string;
  callType: 'audio' | 'video';
}

interface CallAcceptPayload {
  callId: string;
}

interface CallRejectPayload {
  callId: string;
  reason?: string;
}

interface CallOfferPayload {
  callId: string;
  sdp: RTCSessionDescriptionInit;
}

interface CallAnswerPayload {
  callId: string;
  sdp: RTCSessionDescriptionInit;
}

interface CallIceCandidatePayload {
  callId: string;
  candidate: RTCIceCandidateInit;
}

interface CallEndPayload {
  callId: string;
}

interface CallToggleMediaPayload {
  callId: string;
  mediaType: 'audio' | 'video';
  enabled: boolean;
}

// Active call tracking
interface ActiveCall {
  callId: string;
  callerId: string;
  callerUsername: string;
  targetId: string;
  targetUsername: string;
  callType: 'audio' | 'video';
  status: 'ringing' | 'connected' | 'ended';
  startedAt: Date;
  connectedAt?: Date;
}

// Socket service singleton
class SocketService {
  private io: Server | null = null;
  private userSocketMap: Map<string, Set<string>> = new Map(); // userId -> Set of socketIds
  private activeDocuments: Map<string, Y.Doc> = new Map(); // documentId -> Yjs Doc (in-memory)
  private activeCalls: Map<string, ActiveCall> = new Map(); // callId -> ActiveCall

  /**
   * Initialize Socket.IO server with JWT authentication
   */
  initialize(httpServer: HTTPServer): Server {
    // Build comprehensive allowed origins list (matching Express CORS config)
    const frontendUrl = process.env.FRONTEND_URL;
    const corsOrigin = process.env.CORS_ORIGIN;

    // Combine all possible origins
    const allowedOrigins: string[] = [];

    // Add FRONTEND_URL origins (comma-separated)
    if (frontendUrl) {
      allowedOrigins.push(...frontendUrl.split(',').map(o => o.trim()));
    }

    // Add CORS_ORIGIN (comma-separated)
    if (corsOrigin) {
      allowedOrigins.push(...corsOrigin.split(',').map(o => o.trim()));
    }

    // ALWAYS include production domains
    const productionOrigins = [
      'https://apps.gkchatty.com',
      'https://gkchatty.com',
      'https://staging-gkchatty.netlify.app',
    ];
    productionOrigins.forEach(origin => {
      if (!allowedOrigins.includes(origin)) {
        allowedOrigins.push(origin);
      }
    });

    // Add development defaults if nothing specified
    if (allowedOrigins.length === 0) {
      allowedOrigins.push(
        'http://localhost:4003',
        'http://localhost:3003',
        'https://gkchatty.netlify.app'
      );
    }

    console.log(`[Socket.IO] CORS Origins: ${allowedOrigins.join(', ')}`);

    this.io = new Server(httpServer, {
      cors: {
        origin: (origin, callback) => {
          // Allow requests with no origin (server-to-server, mobile apps)
          if (!origin) {
            return callback(null, true);
          }

          // Check Netlify preview regex pattern
          const netlifyPreviewRegex = /\.netlify\.app$/i;

          if (allowedOrigins.includes(origin) || netlifyPreviewRegex.test(origin)) {
            return callback(null, true);
          }

          console.error(`[Socket.IO CORS] Blocked origin: ${origin}`);
          return callback(new Error('Not allowed by CORS'));
        },
        methods: ['GET', 'POST'],
        credentials: true,
      },
      pingTimeout: 60000,
      pingInterval: 25000,
    });

    // JWT Authentication middleware
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;

        if (!token) {
          console.log('[Socket Auth] No token provided');
          return next(new Error('Authentication required'));
        }

        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
          console.error('[Socket Auth] JWT_SECRET not configured');
          return next(new Error('Server configuration error'));
        }

        // Verify JWT token
        const decoded = jwt.verify(token, jwtSecret) as DecodedUserPayload;

        // Verify user exists in database
        const user = await User.findById(decoded.userId).select('_id username role');
        if (!user) {
          console.log(`[Socket Auth] User ${decoded.userId} not found`);
          return next(new Error('User not found'));
        }

        // Attach user info to socket
        (socket as AuthenticatedSocket).userId = decoded.userId;
        (socket as AuthenticatedSocket).username = decoded.username;
        (socket as AuthenticatedSocket).userObjectId = new Types.ObjectId(decoded.userId);

        console.log(`[Socket Auth] Authenticated: ${decoded.username} (${decoded.userId})`);
        next();
      } catch (error: any) {
        console.error('[Socket Auth] Authentication failed:', error.message);
        next(new Error('Authentication failed'));
      }
    });

    // Connection handler
    this.io.on('connection', async (socket: Socket) => {
      const authSocket = socket as AuthenticatedSocket;
      console.log(`[Socket] Connected: ${authSocket.username} (${socket.id})`);

      // Track socket connection
      this.addUserSocket(authSocket.userId, socket.id);

      // Update user presence to online
      await this.updatePresence(authSocket, 'online', socket.id);

      // Join user to their personal room for targeted messages
      socket.join(`user:${authSocket.userId}`);

      // Join user to all their conversation rooms
      await this.joinConversationRooms(authSocket);

      // Register event handlers
      this.registerEventHandlers(authSocket);

      // Handle disconnection
      socket.on('disconnect', async (reason) => {
        console.log(`[Socket DISCONNECT] User: ${authSocket.username}, Socket: ${socket.id}, Reason: ${reason}`);
        this.removeUserSocket(authSocket.userId, socket.id);

        // Update presence - only go offline if no more sockets
        const remainingSockets = this.userSocketMap.get(authSocket.userId);
        console.log(`[Socket DISCONNECT] Remaining sockets for ${authSocket.username}: ${remainingSockets?.size || 0}`);
        if (!remainingSockets || remainingSockets.size === 0) {
          console.log(`[Socket DISCONNECT] No remaining sockets, setting ${authSocket.username} to OFFLINE`);
          // Force offline status and clear all socketIds to handle any race conditions
          await this.forceUserOffline(authSocket);
        }
      });
    });

    console.log('[Socket.IO] Server initialized');
    return this.io;
  }

  /**
   * Register all event handlers for a socket
   */
  private registerEventHandlers(socket: AuthenticatedSocket): void {
    // Direct Message Events
    socket.on('dm:send', (payload: SendMessagePayload) => this.handleSendMessage(socket, payload));
    socket.on('dm:typing', (payload: TypingPayload) => this.handleTyping(socket, payload));
    socket.on('dm:mark_read', (payload: MarkReadPayload) => this.handleMarkRead(socket, payload));
    socket.on('dm:edit', (payload: EditMessagePayload) => this.handleEditMessage(socket, payload));
    socket.on('dm:delete', (payload: DeleteMessagePayload) => this.handleDeleteMessage(socket, payload));
    socket.on('dm:react', (payload: ReactMessagePayload) => this.handleReactToMessage(socket, payload));

    // Presence Events
    socket.on('presence:update', (payload: PresenceUpdatePayload) =>
      this.handlePresenceUpdate(socket, payload)
    );
    socket.on('presence:heartbeat', () => this.handleHeartbeat(socket));
    socket.on('presence:set_dnd', (payload: SetDNDPayload) =>
      this.handleSetDND(socket, payload)
    );

    // Conversation Events
    socket.on('conversation:join', (conversationId: string) =>
      this.handleJoinConversation(socket, conversationId)
    );

    // Collaborative Document Events
    socket.on('collab:create', (payload: CollabCreatePayload) =>
      this.handleCollabCreate(socket, payload)
    );
    socket.on('collab:join', (payload: CollabJoinPayload) =>
      this.handleCollabJoin(socket, payload)
    );
    socket.on('collab:leave', (payload: CollabLeavePayload) =>
      this.handleCollabLeave(socket, payload)
    );
    socket.on('collab:sync', (payload: CollabSyncPayload) =>
      this.handleCollabSync(socket, payload)
    );
    socket.on('collab:awareness', (payload: CollabAwarenessPayload) =>
      this.handleCollabAwareness(socket, payload)
    );

    // Voice/Video Call Events
    socket.on('call:initiate', (payload: CallInitiatePayload) =>
      this.handleCallInitiate(socket, payload)
    );
    socket.on('call:accept', (payload: CallAcceptPayload) =>
      this.handleCallAccept(socket, payload)
    );
    socket.on('call:reject', (payload: CallRejectPayload) =>
      this.handleCallReject(socket, payload)
    );
    socket.on('call:offer', (payload: CallOfferPayload) =>
      this.handleCallOffer(socket, payload)
    );
    socket.on('call:answer', (payload: CallAnswerPayload) =>
      this.handleCallAnswer(socket, payload)
    );
    socket.on('call:ice_candidate', (payload: CallIceCandidatePayload) =>
      this.handleCallIceCandidate(socket, payload)
    );
    socket.on('call:end', (payload: CallEndPayload) =>
      this.handleCallEnd(socket, payload)
    );
    socket.on('call:toggle_media', (payload: CallToggleMediaPayload) =>
      this.handleCallToggleMedia(socket, payload)
    );
  }

  /**
   * Handle sending a direct message
   */
  private async handleSendMessage(
    socket: AuthenticatedSocket,
    payload: SendMessagePayload
  ): Promise<void> {
    try {
      const { conversationId, content, clientMessageId, messageType = 'text', attachments, replyTo } = payload;

      // Allow messages with content OR attachments (or both)
      if (!conversationId || (!content?.trim() && (!attachments || attachments.length === 0))) {
        socket.emit('dm:error', { clientMessageId, error: 'Invalid message payload' });
        return;
      }

      // Verify user is participant in conversation
      const conversation = await Conversation.findOne({
        _id: conversationId,
        participants: socket.userObjectId,
      });

      if (!conversation) {
        socket.emit('dm:error', { clientMessageId, error: 'Conversation not found' });
        return;
      }

      // Create the message
      console.log('[Socket DM] Creating message with attachments:', JSON.stringify(attachments, null, 2));
      const message = new DirectMessage({
        conversationId: new Types.ObjectId(conversationId),
        senderId: socket.userObjectId,
        senderUsername: socket.username,
        content: content?.trim() || '',
        messageType,
        status: 'sent',
        attachments: attachments || [],
        replyTo: replyTo
          ? {
              messageId: new Types.ObjectId(replyTo.messageId),
              content: replyTo.content.substring(0, 100),
              senderUsername: replyTo.senderUsername,
            }
          : undefined,
      });

      await message.save();
      console.log('[Socket DM] Message saved. Attachments in saved message:', JSON.stringify(message.attachments, null, 2));

      // Update conversation's lastMessage
      conversation.lastMessage = {
        content: content.substring(0, 100),
        senderId: socket.userObjectId,
        senderUsername: socket.username,
        sentAt: message.createdAt,
        isRead: false,
      };

      // Increment unread count for other participants
      for (const participantId of conversation.participants) {
        if (!participantId.equals(socket.userObjectId)) {
          const meta = conversation.participantMeta.get(participantId.toString()) || {
            unreadCount: 0,
            lastReadAt: null,
            isArchived: false,
            isMuted: false,
            joinedAt: new Date(),
          };
          meta.unreadCount += 1;
          conversation.participantMeta.set(participantId.toString(), meta);
        }
      }

      await conversation.save();

      // Acknowledge to sender with full message data including attachments
      socket.emit('dm:sent', {
        clientMessageId,
        messageId: message._id.toString(),
        conversationId,
        createdAt: message.createdAt,
        status: 'sent',
        attachments: message.attachments || [],
      });

      // Broadcast to OTHER participants in the conversation (exclude sender to avoid duplicates)
      const messageData = {
        _id: message._id.toString(),
        conversationId,
        senderId: socket.userId,
        senderUsername: socket.username,
        content: message.content,
        messageType: message.messageType,
        status: message.status,
        attachments: message.attachments || [],
        createdAt: message.createdAt,
        replyTo: message.replyTo,
      };

      // Get DND status for all participants (to skip real-time delivery for DND users)
      const participantIds = conversation.participants.filter(
        (id: Types.ObjectId) => !id.equals(socket.userObjectId)
      );
      const presenceMap = await UserPresence.getBulkPresence(participantIds);

      // Check which participants are in DND mode
      const isDNDActive = (participantId: string): boolean => {
        const presence = presenceMap.get(participantId);
        if (!presence?.dndEnabled) return false;
        // If dndUntil is set, check if it has passed
        if (presence.dndUntil && new Date(presence.dndUntil) < new Date()) {
          return false; // DND has expired
        }
        return true;
      };

      // Use socket.to() instead of io.to() to exclude the sender
      // Note: This broadcasts to conversation room, but DND users won't see notifications
      socket.to(`conversation:${conversationId}`).emit('dm:receive', messageData);

      // ALSO emit to each participant's user room to handle NEW conversations
      // where recipients haven't joined the conversation room yet
      // SKIP real-time delivery for users in DND mode
      for (const participantId of conversation.participants) {
        if (!participantId.equals(socket.userObjectId)) {
          const participantIdStr = participantId.toString();

          // Skip real-time notification for DND users
          if (isDNDActive(participantIdStr)) {
            console.log(`[Socket DM] Skipping real-time delivery for DND user ${participantIdStr}`);
            continue;
          }

          // Emit to user:${participantId} room (they always join this on connect)
          this.io?.to(`user:${participantIdStr}`).emit('dm:receive', messageData);

          // Only emit conversation:new for 1-on-1 DMs, NOT for group chats
          // This ensures User B sees the chat when User A messages them for the first time
          // Group chats are shown separately in the Groups section and don't need this event
          if (!conversation.isGroup) {
            const conversationData = {
              _id: conversation._id.toString(),
              otherParticipant: {
                _id: socket.userId,
                username: socket.username,
                status: 'online' as const, // Sender is obviously online
              },
              lastMessage: {
                content: message.content.substring(0, 100),
                senderId: socket.userId,
                senderUsername: socket.username,
                sentAt: message.createdAt,
                isRead: false,
              },
              unreadCount: 1,
              isArchived: false,
              isMuted: false,
              isGroup: false,
              updatedAt: conversation.updatedAt,
              createdAt: conversation.createdAt,
            };
            this.io?.to(`user:${participantIdStr}`).emit('conversation:new', conversationData);
            console.log(`[Socket DM] Emitted conversation:new to user:${participantId} for chat visibility`);
          }
        }
      }

      // Send delivery receipts to online participants
      for (const participantId of conversation.participants) {
        if (!participantId.equals(socket.userObjectId)) {
          const participantSockets = this.userSocketMap.get(participantId.toString());
          if (participantSockets && participantSockets.size > 0) {
            // Mark as delivered for online users
            await message.markDelivered(participantId);
            socket.emit('dm:delivered', {
              conversationId,
              messageId: message._id.toString(),
              userId: participantId.toString(),
              deliveredAt: new Date(),
            });
          }
        }
      }

      const attachmentInfo = attachments && attachments.length > 0
        ? ` with ${attachments.length} attachment(s)`
        : '';
      console.log(
        `[Socket DM] Message sent by ${socket.username} in conversation ${conversationId}${attachmentInfo}`
      );
    } catch (error: any) {
      console.error('[Socket DM] Error sending message:', error.message);
      socket.emit('dm:error', {
        clientMessageId: payload.clientMessageId,
        error: 'Failed to send message',
      });
    }
  }

  /**
   * Handle typing indicator
   */
  private async handleTyping(socket: AuthenticatedSocket, payload: TypingPayload): Promise<void> {
    const { conversationId, isTyping } = payload;

    if (!conversationId) return;

    // Broadcast typing indicator to other participants
    socket.to(`conversation:${conversationId}`).emit('dm:typing_indicator', {
      conversationId,
      userId: socket.userId,
      username: socket.username,
      isTyping,
    });
  }

  /**
   * Handle marking messages as read
   */
  private async handleMarkRead(
    socket: AuthenticatedSocket,
    payload: MarkReadPayload
  ): Promise<void> {
    try {
      const { conversationId, lastReadMessageId } = payload;

      if (!conversationId || !lastReadMessageId) return;

      // Update all messages up to lastReadMessageId as read
      await DirectMessage.updateMany(
        {
          conversationId: new Types.ObjectId(conversationId),
          _id: { $lte: new Types.ObjectId(lastReadMessageId) },
          senderId: { $ne: socket.userObjectId },
          'readBy.userId': { $ne: socket.userObjectId },
        },
        {
          $push: {
            readBy: {
              userId: socket.userObjectId,
              readAt: new Date(),
            },
          },
          $set: { status: 'read' },
        }
      );

      // Update conversation's unread count
      const conversation = await Conversation.findById(conversationId);
      if (conversation) {
        await conversation.markAsRead(socket.userId);
      }

      // Notify sender about read receipt
      socket.to(`conversation:${conversationId}`).emit('dm:read_receipt', {
        conversationId,
        userId: socket.userId,
        username: socket.username,
        lastReadMessageId,
        readAt: new Date(),
      });

      console.log(
        `[Socket DM] Messages marked read by ${socket.username} in conversation ${conversationId}`
      );
    } catch (error: any) {
      console.error('[Socket DM] Error marking messages read:', error.message);
    }
  }

  /**
   * Handle editing a message
   */
  private async handleEditMessage(
    socket: AuthenticatedSocket,
    payload: EditMessagePayload
  ): Promise<void> {
    try {
      const { conversationId, messageId, newContent } = payload;

      if (!conversationId || !messageId || !newContent?.trim()) {
        socket.emit('dm:error', { messageId, error: 'Invalid edit payload' });
        return;
      }

      // Find the message and verify ownership
      const message = await DirectMessage.findOne({
        _id: new Types.ObjectId(messageId),
        conversationId: new Types.ObjectId(conversationId),
        senderId: socket.userObjectId,
        isDeleted: false,
      });

      if (!message) {
        socket.emit('dm:error', { messageId, error: 'Message not found or not authorized' });
        return;
      }

      // Update the message
      message.content = newContent.trim();
      message.editedAt = new Date();
      await message.save();

      // Broadcast edit to all participants in the conversation
      const editData = {
        conversationId,
        messageId,
        newContent: message.content,
        editedAt: message.editedAt,
      };

      // Emit to conversation room (all participants)
      this.io?.to(`conversation:${conversationId}`).emit('dm:edited', editData);

      console.log(`[Socket DM] Message ${messageId} edited by ${socket.username}`);
    } catch (error: any) {
      console.error('[Socket DM] Error editing message:', error.message);
      socket.emit('dm:error', { messageId: payload.messageId, error: 'Failed to edit message' });
    }
  }

  /**
   * Handle deleting a message (soft delete)
   */
  private async handleDeleteMessage(
    socket: AuthenticatedSocket,
    payload: DeleteMessagePayload
  ): Promise<void> {
    try {
      const { conversationId, messageId } = payload;

      if (!conversationId || !messageId) {
        socket.emit('dm:error', { messageId, error: 'Invalid delete payload' });
        return;
      }

      // Find the message and verify ownership
      const message = await DirectMessage.findOne({
        _id: new Types.ObjectId(messageId),
        conversationId: new Types.ObjectId(conversationId),
        senderId: socket.userObjectId,
        isDeleted: false,
      });

      if (!message) {
        socket.emit('dm:error', { messageId, error: 'Message not found or not authorized' });
        return;
      }

      // Soft delete the message
      message.isDeleted = true;
      message.deletedAt = new Date();
      message.deletedBy = socket.userObjectId;
      await message.save();

      // Broadcast deletion to all participants in the conversation
      const deleteData = {
        conversationId,
        messageId,
        deletedAt: message.deletedAt,
      };

      // Emit to conversation room (all participants)
      this.io?.to(`conversation:${conversationId}`).emit('dm:deleted', deleteData);

      console.log(`[Socket DM] Message ${messageId} deleted by ${socket.username}`);
    } catch (error: any) {
      console.error('[Socket DM] Error deleting message:', error.message);
      socket.emit('dm:error', { messageId: payload.messageId, error: 'Failed to delete message' });
    }
  }

  /**
   * Handle adding/removing a reaction to a message (toggle behavior)
   */
  private async handleReactToMessage(
    socket: AuthenticatedSocket,
    payload: ReactMessagePayload
  ): Promise<void> {
    try {
      const { conversationId, messageId, emoji } = payload;

      if (!conversationId || !messageId || !emoji) {
        socket.emit('dm:error', { messageId, error: 'Invalid reaction payload' });
        return;
      }

      // Validate emoji is one of the allowed emojis
      const allowedEmojis = ['👍', '❤️', '😂', '😮', '😢', '🎉'];
      if (!allowedEmojis.includes(emoji)) {
        socket.emit('dm:error', { messageId, error: 'Invalid emoji' });
        return;
      }

      // Find the message
      const message = await DirectMessage.findOne({
        _id: new Types.ObjectId(messageId),
        conversationId: new Types.ObjectId(conversationId),
        isDeleted: false,
      });

      if (!message) {
        socket.emit('dm:error', { messageId, error: 'Message not found' });
        return;
      }

      // Initialize reactions array if not exists
      if (!message.reactions) {
        message.reactions = [];
      }

      // Find existing reaction for this emoji
      const existingReaction = message.reactions.find(r => r.emoji === emoji);

      if (existingReaction) {
        // Check if user already reacted with this emoji
        const userIndex = existingReaction.users.findIndex(
          u => u.userId.toString() === socket.userId
        );

        if (userIndex >= 0) {
          // User already reacted - remove their reaction (toggle off)
          existingReaction.users.splice(userIndex, 1);

          // If no users left for this emoji, remove the emoji entry
          if (existingReaction.users.length === 0) {
            message.reactions = message.reactions.filter(r => r.emoji !== emoji);
          }
        } else {
          // User hasn't reacted with this emoji - add their reaction
          existingReaction.users.push({
            userId: socket.userObjectId,
            username: socket.username,
            reactedAt: new Date(),
          });
        }
      } else {
        // No one has reacted with this emoji yet - create new reaction
        message.reactions.push({
          emoji,
          users: [{
            userId: socket.userObjectId,
            username: socket.username,
            reactedAt: new Date(),
          }],
        });
      }

      await message.save();

      // Broadcast updated reactions to all participants in the conversation
      const reactionData = {
        conversationId,
        messageId,
        reactions: message.reactions,
      };

      // Emit to conversation room (all participants)
      this.io?.to(`conversation:${conversationId}`).emit('dm:reaction_updated', reactionData);

      console.log(`[Socket DM] Reaction ${emoji} toggled on message ${messageId} by ${socket.username}`);
    } catch (error: any) {
      console.error('[Socket DM] Error handling reaction:', error.message);
      socket.emit('dm:error', { messageId: payload.messageId, error: 'Failed to update reaction' });
    }
  }

  /**
   * Handle presence status update
   */
  private async handlePresenceUpdate(
    socket: AuthenticatedSocket,
    payload: PresenceUpdatePayload
  ): Promise<void> {
    console.log(`[Socket PRESENCE] Received presence:update from ${socket.username}: status=${payload.status}`);
    await this.updatePresence(socket, payload.status, socket.id, false, payload.customStatus);
  }

  /**
   * Handle heartbeat for activity tracking
   */
  private async handleHeartbeat(socket: AuthenticatedSocket): Promise<void> {
    try {
      const presence = await UserPresence.findOne({ userId: socket.userObjectId });
      if (presence) {
        await presence.updateActivity(socket.id);
      }
    } catch (error: any) {
      console.error('[Socket] Heartbeat error:', error.message);
    }
  }

  /**
   * Handle setting Do Not Disturb mode
   */
  private async handleSetDND(
    socket: AuthenticatedSocket,
    payload: SetDNDPayload
  ): Promise<void> {
    try {
      console.log(`[Socket DND] Received presence:set_dnd from ${socket.username}: enabled=${payload.enabled}`);

      const presence = await UserPresence.findOne({ userId: socket.userObjectId });
      if (!presence) {
        console.error(`[Socket DND] Presence not found for ${socket.username}`);
        return;
      }

      // Update DND fields
      presence.dndEnabled = payload.enabled;
      if (payload.enabled) {
        presence.dndUntil = payload.dndUntil ? new Date(payload.dndUntil) : undefined;
        presence.dndMessage = payload.dndMessage?.substring(0, 100);
      } else {
        presence.dndUntil = undefined;
        presence.dndMessage = undefined;
      }

      await presence.save();

      // Broadcast DND status change to all users
      console.log(`[Socket DND] Broadcasting presence:changed for ${socket.username} with DND=${payload.enabled}`);
      this.io?.emit('presence:changed', {
        userId: socket.userId,
        username: socket.username,
        status: presence.status,
        customStatus: presence.customStatus,
        lastSeenAt: presence.lastSeenAt,
        dndEnabled: presence.dndEnabled,
        dndUntil: presence.dndUntil,
        dndMessage: presence.dndMessage,
      });

      // Acknowledge to sender
      socket.emit('dnd:updated', {
        dndEnabled: presence.dndEnabled,
        dndUntil: presence.dndUntil,
        dndMessage: presence.dndMessage,
      });

      console.log(`[Socket DND] ${socket.username} DND mode ${payload.enabled ? 'enabled' : 'disabled'}`);
    } catch (error: any) {
      console.error('[Socket DND] Error setting DND:', error.message);
      socket.emit('dnd:error', { error: error.message });
    }
  }

  /**
   * Handle joining a conversation room
   */
  private async handleJoinConversation(
    socket: AuthenticatedSocket,
    conversationId: string
  ): Promise<void> {
    try {
      // Verify user is participant
      const conversation = await Conversation.findOne({
        _id: conversationId,
        participants: socket.userObjectId,
      });

      if (conversation) {
        socket.join(`conversation:${conversationId}`);
        console.log(`[Socket] ${socket.username} joined conversation ${conversationId}`);
      }
    } catch (error: any) {
      console.error('[Socket] Error joining conversation:', error.message);
    }
  }

  /**
   * Join user to all their conversation rooms
   */
  private async joinConversationRooms(socket: AuthenticatedSocket): Promise<void> {
    try {
      const conversations = await Conversation.find({
        participants: socket.userObjectId,
        deletedBy: { $ne: socket.userObjectId },
      }).select('_id');

      for (const conv of conversations) {
        socket.join(`conversation:${conv._id.toString()}`);
      }

      console.log(
        `[Socket] ${socket.username} joined ${conversations.length} conversation rooms`
      );
    } catch (error: any) {
      console.error('[Socket] Error joining conversation rooms:', error.message);
    }
  }

  /**
   * Force a user offline - clears all sockets and sets status to offline
   * Used when the last socket disconnects to handle race conditions
   */
  private async forceUserOffline(socket: AuthenticatedSocket): Promise<void> {
    try {
      const presence = await UserPresence.findOne({ userId: socket.userObjectId });

      if (presence) {
        // Force clear all socket data and set offline
        presence.socketIds = [];
        presence.activeDevices = [];
        presence.status = 'offline';
        presence.lastSeenAt = new Date();
        await presence.save();

        console.log(`[Socket FORCE OFFLINE] ${socket.username} forced offline, socketIds cleared`);
      }

      // Always broadcast the offline status
      this.io?.emit('presence:changed', {
        userId: socket.userId,
        username: socket.username,
        status: 'offline',
        customStatus: presence?.customStatus,
        lastSeenAt: new Date(),
        dndEnabled: presence?.dndEnabled,
        dndUntil: presence?.dndUntil,
        dndMessage: presence?.dndMessage,
      });

      console.log(`[Socket FORCE OFFLINE] Broadcasted offline status for ${socket.username}`);
    } catch (error: any) {
      console.error('[Socket FORCE OFFLINE] Error:', error.message);
    }
  }

  /**
   * Update user presence
   */
  private async updatePresence(
    socket: AuthenticatedSocket,
    status: PresenceStatus,
    socketId: string,
    isDisconnecting = false,
    customStatus?: string
  ): Promise<void> {
    try {
      let presence = await UserPresence.findOne({ userId: socket.userObjectId });

      if (!presence) {
        presence = new UserPresence({
          userId: socket.userObjectId,
          username: socket.username,
          status: 'offline',
          socketIds: [],
          activeDevices: [],
        });
      }

      if (isDisconnecting) {
        await presence.removeSocket(socketId);
      } else {
        if (status === 'online') {
          const userAgent = socket.handshake.headers['user-agent'] || '';
          const deviceType = this.detectDeviceType(userAgent);
          await presence.addSocket(socketId, deviceType, userAgent);
        } else if (status === 'offline') {
          // When explicitly going offline, clear all socket data (logout scenario)
          presence.socketIds = [];
          presence.activeDevices = [];
          presence.status = 'offline';
          presence.lastSeenAt = new Date();
          if (customStatus !== undefined) {
            presence.customStatus = customStatus;
          }
          await presence.save();
          // Also clear in-memory socket tracking for this user
          this.userSocketMap.delete(socket.userId);
          console.log(`[Socket Presence] ${socket.username} explicitly set to offline, socketIds and userSocketMap cleared`);
        } else {
          // For 'away' or 'busy' status changes
          presence.status = status;
          if (customStatus !== undefined) {
            presence.customStatus = customStatus;
          }
          await presence.save();
        }
      }

      // Broadcast presence update to all users (for now, could be optimized to contacts only)
      console.log(`[Socket PRESENCE BROADCAST] Broadcasting presence:changed for ${socket.username}: status=${presence.status}`);
      this.io?.emit('presence:changed', {
        userId: socket.userId,
        username: socket.username,
        status: presence.status,
        customStatus: presence.customStatus,
        lastSeenAt: presence.lastSeenAt,
        dndEnabled: presence.dndEnabled,
        dndUntil: presence.dndUntil,
        dndMessage: presence.dndMessage,
      });

      console.log(`[Socket Presence] ${socket.username} is now ${presence.status}`);
    } catch (error: any) {
      console.error('[Socket Presence] Error updating presence:', error.message);
    }
  }

  /**
   * Detect device type from user agent
   */
  private detectDeviceType(userAgent: string): 'desktop' | 'mobile' | 'tablet' {
    const ua = userAgent.toLowerCase();
    if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
      return 'tablet';
    }
    if (
      /Mobile|iP(hone|od)|Android|BlackBerry|IEMobile|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(
        userAgent
      )
    ) {
      return 'mobile';
    }
    return 'desktop';
  }

  /**
   * Track user socket connection
   */
  private addUserSocket(userId: string, socketId: string): void {
    if (!this.userSocketMap.has(userId)) {
      this.userSocketMap.set(userId, new Set());
    }
    this.userSocketMap.get(userId)!.add(socketId);
  }

  /**
   * Remove user socket connection
   */
  private removeUserSocket(userId: string, socketId: string): void {
    const sockets = this.userSocketMap.get(userId);
    if (sockets) {
      sockets.delete(socketId);
      if (sockets.size === 0) {
        this.userSocketMap.delete(userId);
      }
    }
  }

  // ==========================================
  // COLLABORATIVE DOCUMENT HANDLERS
  // ==========================================

  /**
   * Handle creating a new collaborative document
   */
  private async handleCollabCreate(
    socket: AuthenticatedSocket,
    payload: CollabCreatePayload
  ): Promise<void> {
    try {
      const { conversationId, title, fileType } = payload;

      if (!conversationId || !title) {
        socket.emit('collab:error', { error: 'Invalid create payload' });
        return;
      }

      // Verify user is participant in conversation
      const conversation = await Conversation.findOne({
        _id: conversationId,
        participants: socket.userObjectId,
      });

      if (!conversation) {
        socket.emit('collab:error', { error: 'Conversation not found' });
        return;
      }

      // Create the document in MongoDB
      const document = new CollaborativeDocument({
        conversationId: new Types.ObjectId(conversationId),
        title,
        fileType: fileType || 'docx',
        createdBy: socket.userObjectId,
        createdByUsername: socket.username,
        participants: [socket.userObjectId],
        participantUsernames: [socket.username],
      });

      await document.save();

      // Create Yjs document in memory
      const ydoc = new Y.Doc();
      this.activeDocuments.set(document._id.toString(), ydoc);

      // Join the document room
      const docRoom = `collab:${document._id.toString()}`;
      socket.join(docRoom);

      // Acknowledge document creation
      socket.emit('collab:created', {
        documentId: document._id.toString(),
        conversationId,
        title: document.title,
        fileType: document.fileType,
        createdBy: socket.userId,
        createdByUsername: socket.username,
        createdAt: document.createdAt,
      });

      // Notify other participants in the conversation about new document
      // Emit directly to each participant's user room (they join user:{userId} on connect)
      const collabNotification = {
        documentId: document._id.toString(),
        conversationId,
        title: document.title,
        fileType: document.fileType,
        createdBy: socket.userId,
        createdByUsername: socket.username,
      };

      for (const participantId of conversation.participants) {
        // Don't notify the creator
        if (participantId.toString() !== socket.userId) {
          this.io.to(`user:${participantId.toString()}`).emit('collab:document_available', collabNotification);
          console.log(`[Socket Collab] Notified user:${participantId.toString()} about new document`);
        }
      }

      console.log(
        `[Socket Collab] Document "${title}" created by ${socket.username} in conversation ${conversationId}`
      );
    } catch (error: any) {
      console.error('[Socket Collab] Error creating document:', error.message);
      socket.emit('collab:error', { error: 'Failed to create document' });
    }
  }

  /**
   * Handle joining an existing collaborative document
   */
  private async handleCollabJoin(
    socket: AuthenticatedSocket,
    payload: CollabJoinPayload
  ): Promise<void> {
    try {
      const { documentId } = payload;

      if (!documentId) {
        socket.emit('collab:error', { error: 'Invalid join payload' });
        return;
      }

      // Find the document
      const document = await CollaborativeDocument.findById(documentId);
      if (!document || !document.isActive) {
        socket.emit('collab:error', { error: 'Document not found' });
        return;
      }

      // Verify user is participant in the conversation
      const conversation = await Conversation.findOne({
        _id: document.conversationId,
        participants: socket.userObjectId,
      });

      if (!conversation) {
        socket.emit('collab:error', { error: 'Not authorized to access document' });
        return;
      }

      // Add user to participants if not already
      if (!document.participants.some(p => p.equals(socket.userObjectId))) {
        document.participants.push(socket.userObjectId);
        document.participantUsernames.push(socket.username);
        await document.save();
      }

      // Get or create Yjs document in memory
      let ydoc = this.activeDocuments.get(documentId);
      if (!ydoc) {
        ydoc = new Y.Doc();
        // Load saved state from MongoDB if exists
        if (document.yjsState) {
          Y.applyUpdate(ydoc, new Uint8Array(document.yjsState));
        }
        this.activeDocuments.set(documentId, ydoc);
      }

      // Join the document room
      const docRoom = `collab:${documentId}`;
      socket.join(docRoom);

      // Send current state to joining user
      const state = Y.encodeStateAsUpdate(ydoc);
      socket.emit('collab:joined', {
        documentId,
        title: document.title,
        fileType: document.fileType,
        state: Array.from(state), // Convert to regular array for JSON
        participants: document.participantUsernames,
      });

      // Notify others in document that user joined
      socket.to(docRoom).emit('collab:user_joined', {
        documentId,
        userId: socket.userId,
        username: socket.username,
      });

      console.log(`[Socket Collab] ${socket.username} joined document ${documentId}`);
    } catch (error: any) {
      console.error('[Socket Collab] Error joining document:', error.message);
      socket.emit('collab:error', { error: 'Failed to join document' });
    }
  }

  /**
   * Handle leaving a collaborative document
   */
  private async handleCollabLeave(
    socket: AuthenticatedSocket,
    payload: CollabLeavePayload
  ): Promise<void> {
    try {
      const { documentId } = payload;

      if (!documentId) return;

      const docRoom = `collab:${documentId}`;
      socket.leave(docRoom);

      // Notify others
      socket.to(docRoom).emit('collab:user_left', {
        documentId,
        userId: socket.userId,
        username: socket.username,
      });

      // Persist current state to MongoDB
      await this.persistDocumentState(documentId, socket);

      console.log(`[Socket Collab] ${socket.username} left document ${documentId}`);
    } catch (error: any) {
      console.error('[Socket Collab] Error leaving document:', error.message);
    }
  }

  /**
   * Handle Yjs sync updates
   */
  private async handleCollabSync(
    socket: AuthenticatedSocket,
    payload: CollabSyncPayload
  ): Promise<void> {
    try {
      const { documentId, update } = payload;

      if (!documentId || !update) {
        return;
      }

      // Get the Yjs document
      const ydoc = this.activeDocuments.get(documentId);
      if (!ydoc) {
        socket.emit('collab:error', { error: 'Document not in memory' });
        return;
      }

      // Apply the update
      const updateArray = new Uint8Array(update);
      Y.applyUpdate(ydoc, updateArray);

      // Broadcast to other users in the document room (exclude sender)
      socket.to(`collab:${documentId}`).emit('collab:sync', {
        documentId,
        update,
      });

      // Debounced persistence (save every 5 seconds of activity)
      this.debouncedPersist(documentId, socket);

    } catch (error: any) {
      console.error('[Socket Collab] Error syncing document:', error.message);
    }
  }

  /**
   * Handle awareness updates (cursor positions, user presence)
   */
  private async handleCollabAwareness(
    socket: AuthenticatedSocket,
    payload: CollabAwarenessPayload
  ): Promise<void> {
    try {
      const { documentId, awareness } = payload;

      if (!documentId || !awareness) return;

      // Broadcast awareness to other users in document
      socket.to(`collab:${documentId}`).emit('collab:awareness', {
        documentId,
        awareness: {
          ...awareness,
          user: {
            id: socket.userId,
            name: socket.username,
            color: this.getUserColor(socket.userId),
          },
        },
      });
    } catch (error: any) {
      console.error('[Socket Collab] Error broadcasting awareness:', error.message);
    }
  }

  /**
   * Persist document state to MongoDB
   */
  private async persistDocumentState(
    documentId: string,
    socket: AuthenticatedSocket
  ): Promise<void> {
    try {
      const ydoc = this.activeDocuments.get(documentId);
      if (!ydoc) return;

      const state = Y.encodeStateAsUpdate(ydoc);

      await CollaborativeDocument.findByIdAndUpdate(documentId, {
        yjsState: Buffer.from(state),
        lastModifiedBy: socket.userObjectId,
        lastModifiedByUsername: socket.username,
      });

      console.log(`[Socket Collab] Document ${documentId} state persisted`);
    } catch (error: any) {
      console.error('[Socket Collab] Error persisting document:', error.message);
    }
  }

  // Debounce map for document persistence
  private persistTimeouts: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Debounced persistence to avoid excessive writes
   */
  private debouncedPersist(documentId: string, socket: AuthenticatedSocket): void {
    // Clear existing timeout
    const existingTimeout = this.persistTimeouts.get(documentId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Set new timeout (save after 5 seconds of no activity)
    const timeout = setTimeout(() => {
      this.persistDocumentState(documentId, socket);
      this.persistTimeouts.delete(documentId);
    }, 5000);

    this.persistTimeouts.set(documentId, timeout);
  }

  /**
   * Generate consistent color for user based on their ID
   */
  private getUserColor(userId: string): string {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
      '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
      '#BB8FCE', '#85C1E9', '#F8B500', '#00CED1',
    ];
    // Simple hash based on first characters of ID
    const hash = userId.charCodeAt(0) + userId.charCodeAt(userId.length - 1);
    return colors[hash % colors.length];
  }

  // ==========================================
  // VOICE/VIDEO CALL HANDLERS
  // ==========================================

  /**
   * Generate unique call ID
   */
  private generateCallId(): string {
    return `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Handle initiating a voice/video call
   */
  private async handleCallInitiate(
    socket: AuthenticatedSocket,
    payload: CallInitiatePayload
  ): Promise<void> {
    try {
      const { targetUserId, callType } = payload;

      if (!targetUserId || !callType) {
        socket.emit('call:error', { error: 'Invalid call payload' });
        return;
      }

      // Check if target user is online
      if (!this.isUserOnline(targetUserId)) {
        socket.emit('call:error', { error: 'User is not online' });
        return;
      }

      // Check if caller already has an active call
      for (const call of this.activeCalls.values()) {
        if ((call.callerId === socket.userId || call.targetId === socket.userId)
            && call.status !== 'ended') {
          socket.emit('call:error', { error: 'You already have an active call' });
          return;
        }
      }

      // Check if target user already has an active call
      for (const call of this.activeCalls.values()) {
        if ((call.callerId === targetUserId || call.targetId === targetUserId)
            && call.status !== 'ended') {
          socket.emit('call:error', { error: 'User is busy on another call' });
          return;
        }
      }

      // Get target user info
      const targetUser = await User.findById(targetUserId).select('username');
      if (!targetUser) {
        socket.emit('call:error', { error: 'User not found' });
        return;
      }

      // Create call record
      const callId = this.generateCallId();
      const call: ActiveCall = {
        callId,
        callerId: socket.userId,
        callerUsername: socket.username,
        targetId: targetUserId,
        targetUsername: targetUser.username,
        callType,
        status: 'ringing',
        startedAt: new Date(),
      };

      this.activeCalls.set(callId, call);

      // Notify caller that call is initiated
      socket.emit('call:initiated', {
        callId,
        targetUserId,
        targetUsername: targetUser.username,
        callType,
      });

      // Notify target user of incoming call
      const targetRoom = `user:${targetUserId}`;
      const roomSockets = this.io?.sockets.adapter.rooms.get(targetRoom);
      const roomSize = roomSockets ? roomSockets.size : 0;

      console.log(`[Socket Call] Sending call:incoming to room ${targetRoom} (${roomSize} sockets in room)`);

      this.io?.to(targetRoom).emit('call:incoming', {
        callId,
        callerId: socket.userId,
        callerUsername: socket.username,
        callType,
      });

      console.log(`[Socket Call] ${socket.username} initiated ${callType} call to ${targetUser.username} (${callId}), target room has ${roomSize} connected sockets`);

      // Set timeout to auto-reject if not answered in 30 seconds
      setTimeout(() => {
        const currentCall = this.activeCalls.get(callId);
        if (currentCall && currentCall.status === 'ringing') {
          this.activeCalls.delete(callId);
          socket.emit('call:timeout', { callId });
          this.io?.to(`user:${targetUserId}`).emit('call:timeout', { callId });
          console.log(`[Socket Call] Call ${callId} timed out`);
        }
      }, 30000);

    } catch (error: any) {
      console.error('[Socket Call] Error initiating call:', error.message);
      socket.emit('call:error', { error: 'Failed to initiate call' });
    }
  }

  /**
   * Handle accepting a call
   */
  private async handleCallAccept(
    socket: AuthenticatedSocket,
    payload: CallAcceptPayload
  ): Promise<void> {
    try {
      const { callId } = payload;
      const call = this.activeCalls.get(callId);

      if (!call) {
        socket.emit('call:error', { error: 'Call not found' });
        return;
      }

      if (call.targetId !== socket.userId) {
        socket.emit('call:error', { error: 'Not authorized to accept this call' });
        return;
      }

      if (call.status !== 'ringing') {
        socket.emit('call:error', { error: 'Call is no longer available' });
        return;
      }

      // Update call status
      call.status = 'connected';
      call.connectedAt = new Date();

      // Notify both parties
      socket.emit('call:accepted', { callId });
      this.io?.to(`user:${call.callerId}`).emit('call:accepted', { callId });

      console.log(`[Socket Call] ${socket.username} accepted call ${callId}`);
    } catch (error: any) {
      console.error('[Socket Call] Error accepting call:', error.message);
      socket.emit('call:error', { error: 'Failed to accept call' });
    }
  }

  /**
   * Handle rejecting a call
   */
  private async handleCallReject(
    socket: AuthenticatedSocket,
    payload: CallRejectPayload
  ): Promise<void> {
    try {
      const { callId, reason } = payload;
      const call = this.activeCalls.get(callId);

      if (!call) {
        socket.emit('call:error', { error: 'Call not found' });
        return;
      }

      if (call.targetId !== socket.userId && call.callerId !== socket.userId) {
        socket.emit('call:error', { error: 'Not authorized' });
        return;
      }

      // Remove call
      this.activeCalls.delete(callId);

      // Notify both parties
      const otherUserId = call.callerId === socket.userId ? call.targetId : call.callerId;
      socket.emit('call:rejected', { callId, reason: reason || 'Call declined' });
      this.io?.to(`user:${otherUserId}`).emit('call:rejected', { callId, reason: reason || 'Call declined' });

      console.log(`[Socket Call] Call ${callId} rejected by ${socket.username}`);
    } catch (error: any) {
      console.error('[Socket Call] Error rejecting call:', error.message);
      socket.emit('call:error', { error: 'Failed to reject call' });
    }
  }

  /**
   * Handle WebRTC offer (SDP)
   */
  private async handleCallOffer(
    socket: AuthenticatedSocket,
    payload: CallOfferPayload
  ): Promise<void> {
    try {
      const { callId, sdp } = payload;
      const call = this.activeCalls.get(callId);

      if (!call) {
        socket.emit('call:error', { error: 'Call not found' });
        return;
      }

      // Determine the other party
      const otherUserId = call.callerId === socket.userId ? call.targetId : call.callerId;

      // Forward offer to the other party
      this.io?.to(`user:${otherUserId}`).emit('call:offer', { callId, sdp });

      console.log(`[Socket Call] Offer forwarded for call ${callId}`);
    } catch (error: any) {
      console.error('[Socket Call] Error handling offer:', error.message);
      socket.emit('call:error', { error: 'Failed to send offer' });
    }
  }

  /**
   * Handle WebRTC answer (SDP)
   */
  private async handleCallAnswer(
    socket: AuthenticatedSocket,
    payload: CallAnswerPayload
  ): Promise<void> {
    try {
      const { callId, sdp } = payload;
      const call = this.activeCalls.get(callId);

      if (!call) {
        socket.emit('call:error', { error: 'Call not found' });
        return;
      }

      // Determine the other party
      const otherUserId = call.callerId === socket.userId ? call.targetId : call.callerId;

      // Forward answer to the other party
      this.io?.to(`user:${otherUserId}`).emit('call:answer', { callId, sdp });

      console.log(`[Socket Call] Answer forwarded for call ${callId}`);
    } catch (error: any) {
      console.error('[Socket Call] Error handling answer:', error.message);
      socket.emit('call:error', { error: 'Failed to send answer' });
    }
  }

  /**
   * Handle ICE candidate exchange
   */
  private async handleCallIceCandidate(
    socket: AuthenticatedSocket,
    payload: CallIceCandidatePayload
  ): Promise<void> {
    try {
      const { callId, candidate } = payload;
      const call = this.activeCalls.get(callId);

      if (!call) {
        return; // Silently ignore - call may have ended
      }

      // Determine the other party
      const otherUserId = call.callerId === socket.userId ? call.targetId : call.callerId;

      // Forward ICE candidate to the other party
      this.io?.to(`user:${otherUserId}`).emit('call:ice_candidate', { callId, candidate });
    } catch (error: any) {
      console.error('[Socket Call] Error handling ICE candidate:', error.message);
    }
  }

  /**
   * Handle ending a call
   */
  private async handleCallEnd(
    socket: AuthenticatedSocket,
    payload: CallEndPayload
  ): Promise<void> {
    try {
      const { callId } = payload;
      const call = this.activeCalls.get(callId);

      if (!call) {
        return; // Already ended
      }

      // Determine the other party
      const otherUserId = call.callerId === socket.userId ? call.targetId : call.callerId;

      // Calculate call duration if it was connected
      const duration = call.connectedAt
        ? Math.floor((Date.now() - call.connectedAt.getTime()) / 1000)
        : 0;

      // Remove call
      this.activeCalls.delete(callId);

      // Notify both parties
      socket.emit('call:ended', { callId, duration });
      this.io?.to(`user:${otherUserId}`).emit('call:ended', { callId, duration });

      console.log(`[Socket Call] Call ${callId} ended by ${socket.username}, duration: ${duration}s`);
    } catch (error: any) {
      console.error('[Socket Call] Error ending call:', error.message);
    }
  }

  /**
   * Handle toggling audio/video during call
   */
  private async handleCallToggleMedia(
    socket: AuthenticatedSocket,
    payload: CallToggleMediaPayload
  ): Promise<void> {
    try {
      const { callId, mediaType, enabled } = payload;
      const call = this.activeCalls.get(callId);

      if (!call) {
        return;
      }

      // Determine the other party
      const otherUserId = call.callerId === socket.userId ? call.targetId : call.callerId;

      // Notify the other party about media toggle
      this.io?.to(`user:${otherUserId}`).emit('call:media_toggled', {
        callId,
        userId: socket.userId,
        mediaType,
        enabled,
      });

      console.log(`[Socket Call] ${socket.username} ${enabled ? 'enabled' : 'disabled'} ${mediaType} in call ${callId}`);
    } catch (error: any) {
      console.error('[Socket Call] Error toggling media:', error.message);
    }
  }

  /**
   * Get the Socket.IO server instance
   */
  getIO(): Server | null {
    return this.io;
  }

  /**
   * Check if a user is online
   */
  isUserOnline(userId: string): boolean {
    const sockets = this.userSocketMap.get(userId);
    return sockets !== undefined && sockets.size > 0;
  }

  /**
   * Send a message to a specific user (all their connected sockets)
   */
  sendToUser(userId: string, event: string, data: any): void {
    this.io?.to(`user:${userId}`).emit(event, data);
  }

  /**
   * Send a message to all participants in a conversation
   */
  sendToConversation(conversationId: string, event: string, data: any): void {
    this.io?.to(`conversation:${conversationId}`).emit(event, data);
  }
}

// Export singleton instance
export const socketService = new SocketService();
export default socketService;
