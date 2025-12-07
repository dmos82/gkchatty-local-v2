import { Server as HTTPServer } from 'http';
import { Server, Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import User from '../models/UserModel';
import UserPresence, { IUserPresence, PresenceStatus } from '../models/UserPresenceModel';
import Conversation from '../models/ConversationModel';
import DirectMessage from '../models/DirectMessageModel';

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

// Socket service singleton
class SocketService {
  private io: Server | null = null;
  private userSocketMap: Map<string, Set<string>> = new Map(); // userId -> Set of socketIds

  /**
   * Initialize Socket.IO server with JWT authentication
   */
  initialize(httpServer: HTTPServer): Server {
    this.io = new Server(httpServer, {
      cors: {
        origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:4003'],
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
          await this.updatePresence(authSocket, 'offline', socket.id, true);
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

    // Presence Events
    socket.on('presence:update', (payload: PresenceUpdatePayload) =>
      this.handlePresenceUpdate(socket, payload)
    );
    socket.on('presence:heartbeat', () => this.handleHeartbeat(socket));

    // Conversation Events
    socket.on('conversation:join', (conversationId: string) =>
      this.handleJoinConversation(socket, conversationId)
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

      // Use socket.to() instead of io.to() to exclude the sender
      socket.to(`conversation:${conversationId}`).emit('dm:receive', messageData);

      // ALSO emit to each participant's user room to handle NEW conversations
      // where recipients haven't joined the conversation room yet
      for (const participantId of conversation.participants) {
        if (!participantId.equals(socket.userObjectId)) {
          // Emit to user:${participantId} room (they always join this on connect)
          this.io?.to(`user:${participantId.toString()}`).emit('dm:receive', messageData);
          console.log(`[Socket DM] Also emitted to user:${participantId} room for new conversation support`);
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
        } else {
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
