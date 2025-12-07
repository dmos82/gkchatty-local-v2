# Direct Messages (DM) Feature - Detailed Implementation Plan

## Executive Summary

This document outlines the comprehensive implementation plan for adding 1:1 Direct Messaging to GKChatty. The feature enables private real-time conversations between users with typing indicators, read receipts, and user presence.

**Status**: Planning Complete
**Date**: 2025-12-06
**Estimated Effort**: 12-18 days
**Priority**: High

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Database Schema Design](#2-database-schema-design)
3. [Socket.IO Event Specification](#3-socketio-event-specification)
4. [REST API Endpoints](#4-rest-api-endpoints)
5. [Frontend Architecture](#5-frontend-architecture)
6. [Security & Rate Limiting](#6-security--rate-limiting)
7. [Audit Logging Integration](#7-audit-logging-integration)
8. [Testing Strategy](#8-testing-strategy)
9. [Implementation Phases](#9-implementation-phases)
10. [File Structure](#10-file-structure)
11. [Dependencies](#11-dependencies)
12. [Migration Plan](#12-migration-plan)

---

## 1. Architecture Overview

### 1.1 Current State

| Component | Status | Notes |
|-----------|--------|-------|
| JWT Authentication | ✅ Ready | Session-based with JTI validation |
| MongoDB + Mongoose | ✅ Ready | Document-based storage |
| Redis | ✅ Ready | Used for rate limiting |
| Bull Job Queue | ⚠️ Partial | Installed, minimal usage |
| Socket.IO | ❌ Missing | Needs implementation |
| WebSocket Client | ❌ Missing | Frontend needs socket.io-client |

### 1.2 Target Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Next.js)                        │
├─────────────────────────────────────────────────────────────────┤
│  DMContext ←→ Zustand Store ←→ Socket.IO Client ←→ REST API    │
└─────────────────────────────────────────────────────────────────┘
                              ↑ ↓
                         WebSocket / HTTP
                              ↑ ↓
┌─────────────────────────────────────────────────────────────────┐
│                       BACKEND (Express)                          │
├─────────────────────────────────────────────────────────────────┤
│  Socket.IO Server  ←→  DM Service  ←→  MongoDB                  │
│         ↓                   ↓                                    │
│    Redis Adapter      Audit Service                              │
│    (Pub/Sub)          (Logging)                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3 Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Real-time Transport | Socket.IO | Battle-tested, fallback support, built-in rooms |
| Message Storage | MongoDB | Consistent with existing data layer |
| Presence Tracking | Redis + Socket.IO | In-memory for speed, persistent for reliability |
| Read Receipts | Per-message tracking | Granular control, better UX |
| Typing Indicators | Ephemeral (no DB) | Real-time only, no persistence needed |

---

## 2. Database Schema Design

### 2.1 Conversation Model

**File**: `backend/src/models/ConversationModel.ts`

```typescript
import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IConversation extends Document {
  _id: Types.ObjectId;

  // Participants (always 2 for DMs, but schema supports groups)
  participants: Types.ObjectId[];

  // Denormalized for quick display
  participantUsernames: string[];

  // Conversation metadata
  createdAt: Date;
  updatedAt: Date;

  // Last message preview (denormalized for list performance)
  lastMessage: {
    content: string;        // Truncated to 100 chars
    senderId: Types.ObjectId;
    senderUsername: string;
    sentAt: Date;
    isRead: boolean;
  } | null;

  // Per-user metadata
  participantMeta: {
    [userId: string]: {
      unreadCount: number;
      lastReadAt: Date | null;
      isArchived: boolean;
      isMuted: boolean;
      joinedAt: Date;
      nickname?: string;    // Optional custom display name
    };
  };

  // Soft delete support
  deletedBy: Types.ObjectId[];  // Users who "deleted" this conversation

  // Future: group chat support
  isGroup: boolean;
  groupName?: string;
  groupIcon?: string;
  createdBy?: Types.ObjectId;
}

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
      content: { type: String, maxlength: 100 },
      senderId: { type: Schema.Types.ObjectId, ref: 'User' },
      senderUsername: String,
      sentAt: Date,
      isRead: Boolean,
    },
    participantMeta: {
      type: Map,
      of: {
        unreadCount: { type: Number, default: 0 },
        lastReadAt: { type: Date, default: null },
        isArchived: { type: Boolean, default: false },
        isMuted: { type: Boolean, default: false },
        joinedAt: { type: Date, default: Date.now },
        nickname: String,
      },
    },
    deletedBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    isGroup: { type: Boolean, default: false },
    groupName: String,
    groupIcon: String,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
  }
);

// Indexes
ConversationSchema.index({ participants: 1 });
ConversationSchema.index({ 'participants': 1, 'updatedAt': -1 });
ConversationSchema.index({ 'lastMessage.sentAt': -1 });

// Compound index for finding existing DM between two users
ConversationSchema.index(
  { participants: 1, isGroup: 1 },
  {
    unique: true,
    partialFilterExpression: { isGroup: false },
  }
);

export default mongoose.model<IConversation>('Conversation', ConversationSchema);
```

### 2.2 DirectMessage Model

**File**: `backend/src/models/DirectMessageModel.ts`

```typescript
import mongoose, { Schema, Document, Types } from 'mongoose';

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
export type MessageType = 'text' | 'image' | 'file' | 'system';

export interface IDirectMessage extends Document {
  _id: Types.ObjectId;

  // References
  conversationId: Types.ObjectId;
  senderId: Types.ObjectId;
  senderUsername: string;  // Denormalized

  // Content
  content: string;
  messageType: MessageType;

  // Attachments (future)
  attachments?: {
    type: 'image' | 'file';
    url: string;
    filename: string;
    size: number;
    mimeType: string;
  }[];

  // Status tracking
  status: MessageStatus;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  editedAt?: Date;

  // Read receipts
  readBy: {
    userId: Types.ObjectId;
    readAt: Date;
  }[];

  // Delivery tracking
  deliveredTo: {
    userId: Types.ObjectId;
    deliveredAt: Date;
  }[];

  // Reply support
  replyTo?: {
    messageId: Types.ObjectId;
    content: string;        // Truncated preview
    senderUsername: string;
  };

  // Soft delete
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: Types.ObjectId;

  // System message data
  systemData?: {
    action: 'user_joined' | 'user_left' | 'conversation_created';
    targetUserId?: Types.ObjectId;
    targetUsername?: string;
  };
}

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
      required: true,
      maxlength: 4000,  // Reasonable limit for DMs
    },
    messageType: {
      type: String,
      enum: ['text', 'image', 'file', 'system'],
      default: 'text',
    },
    attachments: [
      {
        type: { type: String, enum: ['image', 'file'] },
        url: String,
        filename: String,
        size: Number,
        mimeType: String,
      },
    ],
    status: {
      type: String,
      enum: ['sending', 'sent', 'delivered', 'read', 'failed'],
      default: 'sent',
    },
    editedAt: Date,
    readBy: [
      {
        userId: { type: Schema.Types.ObjectId, ref: 'User' },
        readAt: { type: Date, default: Date.now },
      },
    ],
    deliveredTo: [
      {
        userId: { type: Schema.Types.ObjectId, ref: 'User' },
        deliveredAt: { type: Date, default: Date.now },
      },
    ],
    replyTo: {
      messageId: { type: Schema.Types.ObjectId, ref: 'DirectMessage' },
      content: { type: String, maxlength: 100 },
      senderUsername: String,
    },
    isDeleted: { type: Boolean, default: false },
    deletedAt: Date,
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    systemData: {
      action: {
        type: String,
        enum: ['user_joined', 'user_left', 'conversation_created'],
      },
      targetUserId: { type: Schema.Types.ObjectId, ref: 'User' },
      targetUsername: String,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
DirectMessageSchema.index({ conversationId: 1, createdAt: -1 });
DirectMessageSchema.index({ conversationId: 1, _id: -1 });  // Cursor pagination
DirectMessageSchema.index({ senderId: 1, createdAt: -1 });
DirectMessageSchema.index({ 'readBy.userId': 1 });

// TTL index for auto-cleanup of old messages (optional, 1 year)
// DirectMessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 31536000 });

export default mongoose.model<IDirectMessage>('DirectMessage', DirectMessageSchema);
```

### 2.3 UserPresence Model

**File**: `backend/src/models/UserPresenceModel.ts`

```typescript
import mongoose, { Schema, Document, Types } from 'mongoose';

export type PresenceStatus = 'online' | 'away' | 'busy' | 'offline';

export interface IUserPresence extends Document {
  userId: Types.ObjectId;
  username: string;

  // Current status
  status: PresenceStatus;
  customStatus?: string;  // "In a meeting", "On vacation", etc.

  // Connection tracking
  socketIds: string[];     // Multiple tabs/devices
  lastActiveAt: Date;
  lastSeenAt: Date;

  // Device info
  activeDevices: {
    socketId: string;
    deviceType: 'desktop' | 'mobile' | 'tablet';
    userAgent: string;
    connectedAt: Date;
    lastPingAt: Date;
  }[];

  // Auto-away settings
  autoAwayEnabled: boolean;
  autoAwayMinutes: number;  // Default: 5 minutes
}

const UserPresenceSchema = new Schema<IUserPresence>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    username: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['online', 'away', 'busy', 'offline'],
      default: 'offline',
    },
    customStatus: {
      type: String,
      maxlength: 100,
    },
    socketIds: [String],
    lastActiveAt: {
      type: Date,
      default: Date.now,
    },
    lastSeenAt: {
      type: Date,
      default: Date.now,
    },
    activeDevices: [
      {
        socketId: String,
        deviceType: {
          type: String,
          enum: ['desktop', 'mobile', 'tablet'],
          default: 'desktop',
        },
        userAgent: String,
        connectedAt: { type: Date, default: Date.now },
        lastPingAt: { type: Date, default: Date.now },
      },
    ],
    autoAwayEnabled: { type: Boolean, default: true },
    autoAwayMinutes: { type: Number, default: 5 },
  },
  {
    timestamps: true,
  }
);

// Indexes
UserPresenceSchema.index({ status: 1 });
UserPresenceSchema.index({ lastActiveAt: -1 });
UserPresenceSchema.index({ 'socketIds': 1 });

// TTL for cleanup of stale presence (24 hours of offline = remove)
UserPresenceSchema.index(
  { lastSeenAt: 1 },
  {
    expireAfterSeconds: 86400,
    partialFilterExpression: { status: 'offline' },
  }
);

export default mongoose.model<IUserPresence>('UserPresence', UserPresenceSchema);
```

### 2.4 Database Indexes Summary

```javascript
// MongoDB Index Creation Script (for migration)
// Run: mongosh gkchatty < create-dm-indexes.js

// Conversation indexes
db.conversations.createIndex({ participants: 1 });
db.conversations.createIndex({ participants: 1, updatedAt: -1 });
db.conversations.createIndex({ 'lastMessage.sentAt': -1 });
db.conversations.createIndex(
  { participants: 1, isGroup: 1 },
  { unique: true, partialFilterExpression: { isGroup: false } }
);

// DirectMessage indexes
db.directmessages.createIndex({ conversationId: 1, createdAt: -1 });
db.directmessages.createIndex({ conversationId: 1, _id: -1 });
db.directmessages.createIndex({ senderId: 1, createdAt: -1 });
db.directmessages.createIndex({ 'readBy.userId': 1 });

// UserPresence indexes
db.userpresences.createIndex({ userId: 1 }, { unique: true });
db.userpresences.createIndex({ status: 1 });
db.userpresences.createIndex({ socketIds: 1 });
```

---

## 3. Socket.IO Event Specification

### 3.1 Connection & Authentication

**File**: `backend/src/services/socketService.ts`

```typescript
// Connection handshake
interface SocketAuth {
  token: string;  // JWT token from localStorage or cookie
}

// Server-side authentication middleware
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token ||
                socket.handshake.headers.authorization?.split(' ')[1];

  if (!token) {
    return next(new Error('Authentication required'));
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId).select('_id username role activeSessionIds');

    if (!user || !user.activeSessionIds?.includes(decoded.jti)) {
      return next(new Error('Session expired'));
    }

    socket.data.user = user;
    socket.data.userId = user._id.toString();
    socket.data.username = user.username;
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
});
```

### 3.2 Event Specifications

#### 3.2.1 Direct Message Events

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `dm:send` | Client → Server | `SendMessagePayload` | Send a new message |
| `dm:receive` | Server → Client | `MessagePayload` | New message received |
| `dm:sent` | Server → Client | `MessageSentAck` | Confirmation of sent message |
| `dm:delivered` | Server → Client | `DeliveryPayload` | Message delivered to recipient |
| `dm:read` | Client → Server | `ReadPayload` | Mark messages as read |
| `dm:read_receipt` | Server → Client | `ReadReceiptPayload` | Read receipt notification |
| `dm:typing` | Client → Server | `TypingPayload` | User is typing |
| `dm:typing_indicator` | Server → Client | `TypingIndicatorPayload` | Show typing indicator |
| `dm:edit` | Client → Server | `EditPayload` | Edit a message |
| `dm:edited` | Server → Client | `MessageEditedPayload` | Message was edited |
| `dm:delete` | Client → Server | `DeletePayload` | Delete a message |
| `dm:deleted` | Server → Client | `MessageDeletedPayload` | Message was deleted |

#### 3.2.2 Presence Events

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `presence:online` | Server → Client | `PresencePayload` | User came online |
| `presence:offline` | Server → Client | `PresencePayload` | User went offline |
| `presence:away` | Server → Client | `PresencePayload` | User is away |
| `presence:update` | Client → Server | `PresenceUpdatePayload` | Update own status |
| `presence:subscribe` | Client → Server | `SubscribePayload` | Watch user's presence |
| `presence:unsubscribe` | Client → Server | `UnsubscribePayload` | Stop watching |

#### 3.2.3 Conversation Events

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `conversation:created` | Server → Client | `ConversationPayload` | New conversation started |
| `conversation:updated` | Server → Client | `ConversationPayload` | Conversation metadata changed |
| `conversation:archived` | Server → Client | `ArchivePayload` | Conversation archived |

### 3.3 Payload Definitions

```typescript
// ===== MESSAGE PAYLOADS =====

interface SendMessagePayload {
  conversationId: string;
  content: string;
  messageType: 'text' | 'image' | 'file';
  clientMessageId: string;  // For deduplication & optimistic UI
  replyTo?: {
    messageId: string;
    content: string;
    senderUsername: string;
  };
  attachments?: {
    type: 'image' | 'file';
    url: string;
    filename: string;
    size: number;
    mimeType: string;
  }[];
}

interface MessagePayload {
  _id: string;
  conversationId: string;
  senderId: string;
  senderUsername: string;
  content: string;
  messageType: 'text' | 'image' | 'file' | 'system';
  status: 'sent' | 'delivered' | 'read';
  createdAt: string;  // ISO date
  replyTo?: {
    messageId: string;
    content: string;
    senderUsername: string;
  };
  attachments?: {
    type: 'image' | 'file';
    url: string;
    filename: string;
    size: number;
    mimeType: string;
  }[];
}

interface MessageSentAck {
  clientMessageId: string;  // Echo back for matching
  messageId: string;        // Server-assigned ID
  conversationId: string;
  sentAt: string;
  status: 'sent';
}

interface DeliveryPayload {
  messageId: string;
  conversationId: string;
  deliveredTo: string;      // userId
  deliveredAt: string;
}

// ===== READ RECEIPT PAYLOADS =====

interface ReadPayload {
  conversationId: string;
  lastReadMessageId: string;  // Mark all messages up to this as read
}

interface ReadReceiptPayload {
  conversationId: string;
  userId: string;
  username: string;
  lastReadMessageId: string;
  readAt: string;
}

// ===== TYPING PAYLOADS =====

interface TypingPayload {
  conversationId: string;
  isTyping: boolean;
}

interface TypingIndicatorPayload {
  conversationId: string;
  userId: string;
  username: string;
  isTyping: boolean;
}

// ===== EDIT/DELETE PAYLOADS =====

interface EditPayload {
  messageId: string;
  conversationId: string;
  newContent: string;
}

interface MessageEditedPayload {
  messageId: string;
  conversationId: string;
  newContent: string;
  editedAt: string;
  editedBy: string;
}

interface DeletePayload {
  messageId: string;
  conversationId: string;
}

interface MessageDeletedPayload {
  messageId: string;
  conversationId: string;
  deletedBy: string;
  deletedAt: string;
}

// ===== PRESENCE PAYLOADS =====

interface PresencePayload {
  userId: string;
  username: string;
  status: 'online' | 'away' | 'busy' | 'offline';
  customStatus?: string;
  lastSeenAt?: string;
}

interface PresenceUpdatePayload {
  status: 'online' | 'away' | 'busy';
  customStatus?: string;
}

interface SubscribePayload {
  userIds: string[];  // Subscribe to multiple users' presence
}

// ===== CONVERSATION PAYLOADS =====

interface ConversationPayload {
  _id: string;
  participants: { _id: string; username: string }[];
  lastMessage: {
    content: string;
    senderId: string;
    senderUsername: string;
    sentAt: string;
    isRead: boolean;
  } | null;
  unreadCount: number;
  updatedAt: string;
}

// ===== ERROR PAYLOADS =====

interface SocketError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}
```

### 3.4 Room Management

```typescript
// Each user joins their own room for receiving messages
socket.join(`user:${userId}`);

// Each conversation has a room for real-time updates
socket.join(`conversation:${conversationId}`);

// Presence room for users you're watching
socket.join(`presence:${targetUserId}`);

// Admin broadcast room (optional)
if (user.role === 'admin') {
  socket.join('admin:broadcast');
}
```

### 3.5 Socket.IO Server Configuration

```typescript
// backend/src/config/socketConfig.ts

import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

export interface SocketConfig {
  cors: {
    origin: string[];
    credentials: boolean;
  };
  pingTimeout: number;
  pingInterval: number;
  transports: ('websocket' | 'polling')[];
  allowEIO3: boolean;
}

export const socketConfig: SocketConfig = {
  cors: {
    origin: [
      'http://localhost:4003',
      'http://localhost:3000',
      process.env.FRONTEND_URL || '',
    ].filter(Boolean),
    credentials: true,
  },
  pingTimeout: 60000,      // 60 seconds
  pingInterval: 25000,     // 25 seconds
  transports: ['websocket', 'polling'],
  allowEIO3: true,         // Backwards compatibility
};

// Redis adapter for horizontal scaling
export async function createRedisAdapter(io: SocketIOServer) {
  const pubClient = createClient({ url: process.env.REDIS_URL });
  const subClient = pubClient.duplicate();

  await Promise.all([pubClient.connect(), subClient.connect()]);

  io.adapter(createAdapter(pubClient, subClient));

  return { pubClient, subClient };
}
```

---

## 4. REST API Endpoints

### 4.1 Conversation Endpoints

**Base Path**: `/api/conversations`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/` | Required | List user's conversations |
| POST | `/` | Required | Create/find conversation with user |
| GET | `/:id` | Required | Get conversation details |
| PUT | `/:id` | Required | Update conversation settings |
| DELETE | `/:id` | Required | Archive/delete conversation |
| POST | `/:id/messages` | Required | Send message (fallback for no WS) |
| GET | `/:id/messages` | Required | Get messages with pagination |
| PUT | `/:id/read` | Required | Mark conversation as read |

### 4.2 API Specifications

```typescript
// ===== LIST CONVERSATIONS =====
// GET /api/conversations

interface ListConversationsQuery {
  page?: number;           // Default: 1
  limit?: number;          // Default: 20, max: 50
  archived?: boolean;      // Default: false
  search?: string;         // Search by participant username
}

interface ListConversationsResponse {
  success: true;
  conversations: {
    _id: string;
    participants: {
      _id: string;
      username: string;
      presence?: {
        status: 'online' | 'away' | 'busy' | 'offline';
        lastSeenAt: string;
      };
    }[];
    lastMessage: {
      content: string;
      senderId: string;
      senderUsername: string;
      sentAt: string;
      isRead: boolean;
    } | null;
    unreadCount: number;
    isArchived: boolean;
    isMuted: boolean;
    updatedAt: string;
  }[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ===== CREATE/FIND CONVERSATION =====
// POST /api/conversations

interface CreateConversationBody {
  participantId: string;   // User ID to start conversation with
}

interface CreateConversationResponse {
  success: true;
  conversation: {
    _id: string;
    participants: { _id: string; username: string }[];
    isNew: boolean;        // True if newly created, false if existing
    createdAt: string;
  };
}

// ===== GET CONVERSATION =====
// GET /api/conversations/:id

interface GetConversationResponse {
  success: true;
  conversation: {
    _id: string;
    participants: {
      _id: string;
      username: string;
      presence?: {
        status: 'online' | 'away' | 'busy' | 'offline';
        lastSeenAt: string;
      };
    }[];
    unreadCount: number;
    isArchived: boolean;
    isMuted: boolean;
    createdAt: string;
    updatedAt: string;
  };
}

// ===== UPDATE CONVERSATION =====
// PUT /api/conversations/:id

interface UpdateConversationBody {
  isArchived?: boolean;
  isMuted?: boolean;
  nickname?: string;       // Custom name for the other participant
}

interface UpdateConversationResponse {
  success: true;
  conversation: {
    _id: string;
    isArchived: boolean;
    isMuted: boolean;
    nickname?: string;
  };
}

// ===== DELETE CONVERSATION =====
// DELETE /api/conversations/:id

// Soft deletes for current user only
// Conversation persists for other participant

interface DeleteConversationResponse {
  success: true;
  message: 'Conversation deleted';
}

// ===== GET MESSAGES =====
// GET /api/conversations/:id/messages

interface GetMessagesQuery {
  limit?: number;          // Default: 50, max: 100
  before?: string;         // Cursor: message ID for pagination
  after?: string;          // Cursor: for loading newer messages
}

interface GetMessagesResponse {
  success: true;
  messages: {
    _id: string;
    senderId: string;
    senderUsername: string;
    content: string;
    messageType: 'text' | 'image' | 'file' | 'system';
    status: 'sent' | 'delivered' | 'read';
    createdAt: string;
    editedAt?: string;
    isDeleted: boolean;
    replyTo?: {
      messageId: string;
      content: string;
      senderUsername: string;
    };
    attachments?: {
      type: 'image' | 'file';
      url: string;
      filename: string;
      size: number;
    }[];
  }[];
  pagination: {
    hasMore: boolean;
    oldestMessageId: string | null;
    newestMessageId: string | null;
  };
}

// ===== SEND MESSAGE (REST fallback) =====
// POST /api/conversations/:id/messages

interface SendMessageBody {
  content: string;
  messageType?: 'text' | 'image' | 'file';
  replyTo?: string;        // Message ID to reply to
  clientMessageId?: string; // For deduplication
}

interface SendMessageResponse {
  success: true;
  message: {
    _id: string;
    conversationId: string;
    senderId: string;
    senderUsername: string;
    content: string;
    messageType: 'text';
    status: 'sent';
    createdAt: string;
  };
}

// ===== MARK AS READ =====
// PUT /api/conversations/:id/read

interface MarkReadBody {
  lastReadMessageId?: string;  // Optional: specific message
}

interface MarkReadResponse {
  success: true;
  unreadCount: 0;
  lastReadAt: string;
}
```

### 4.3 User Search Endpoint

```typescript
// GET /api/users/search?q=username

interface UserSearchQuery {
  q: string;               // Search query (min 2 chars)
  limit?: number;          // Default: 10
  excludeSelf?: boolean;   // Default: true
}

interface UserSearchResponse {
  success: true;
  users: {
    _id: string;
    username: string;
    presence?: {
      status: 'online' | 'away' | 'busy' | 'offline';
    };
  }[];
}
```

### 4.4 Presence Endpoints

```typescript
// GET /api/presence/:userId

interface GetPresenceResponse {
  success: true;
  presence: {
    userId: string;
    username: string;
    status: 'online' | 'away' | 'busy' | 'offline';
    customStatus?: string;
    lastSeenAt: string;
  };
}

// GET /api/presence/bulk?ids=id1,id2,id3

interface BulkPresenceResponse {
  success: true;
  presences: {
    [userId: string]: {
      status: 'online' | 'away' | 'busy' | 'offline';
      lastSeenAt: string;
    };
  };
}
```

---

## 5. Frontend Architecture

### 5.1 Component Hierarchy

```
src/
├── components/
│   └── dm/
│       ├── DMContainer.tsx           # Main container
│       ├── ConversationList.tsx      # Left sidebar with conversations
│       ├── ConversationItem.tsx      # Single conversation in list
│       ├── ConversationView.tsx      # Right panel with messages
│       ├── MessageList.tsx           # Virtualized message list
│       ├── MessageItem.tsx           # Single message bubble
│       ├── MessageInput.tsx          # Text input + send button
│       ├── TypingIndicator.tsx       # "User is typing..." display
│       ├── UserSearch.tsx            # Search users to message
│       ├── PresenceBadge.tsx         # Online/offline indicator
│       ├── ReadReceipt.tsx           # Read receipt checkmarks
│       ├── NewConversationModal.tsx  # Start new conversation
│       └── ConversationSettings.tsx  # Mute, archive, etc.
├── contexts/
│   └── DMContext.tsx                 # DM state & socket management
├── stores/
│   └── dmStore.ts                    # Zustand store for DM state
├── hooks/
│   ├── useSocket.ts                  # Socket.IO connection hook
│   ├── useConversations.ts           # Conversation list management
│   ├── useMessages.ts                # Message loading & pagination
│   ├── useTypingIndicator.ts         # Typing indicator logic
│   └── usePresence.ts                # User presence tracking
├── lib/
│   └── api/
│       └── conversations.ts          # REST API calls
└── app/
    └── messages/
        └── page.tsx                  # /messages route
```

### 5.2 Zustand Store Design

**File**: `frontend/src/stores/dmStore.ts`

```typescript
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

interface Participant {
  _id: string;
  username: string;
  presence?: {
    status: 'online' | 'away' | 'busy' | 'offline';
    lastSeenAt: string;
  };
}

interface LastMessage {
  content: string;
  senderId: string;
  senderUsername: string;
  sentAt: string;
  isRead: boolean;
}

interface Conversation {
  _id: string;
  participants: Participant[];
  lastMessage: LastMessage | null;
  unreadCount: number;
  isArchived: boolean;
  isMuted: boolean;
  updatedAt: string;
}

interface Message {
  _id: string;
  conversationId: string;
  senderId: string;
  senderUsername: string;
  content: string;
  messageType: 'text' | 'image' | 'file' | 'system';
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  createdAt: string;
  editedAt?: string;
  isDeleted: boolean;
  replyTo?: {
    messageId: string;
    content: string;
    senderUsername: string;
  };
  clientMessageId?: string;  // For optimistic updates
}

interface TypingUser {
  conversationId: string;
  userId: string;
  username: string;
  startedAt: number;
}

interface DMState {
  // Conversations
  conversations: Conversation[];
  conversationsLoading: boolean;
  conversationsError: string | null;

  // Current conversation
  activeConversationId: string | null;

  // Messages (keyed by conversationId)
  messages: { [conversationId: string]: Message[] };
  messagesLoading: { [conversationId: string]: boolean };
  messagesHasMore: { [conversationId: string]: boolean };

  // Typing indicators
  typingUsers: TypingUser[];

  // Presence (keyed by userId)
  presence: { [userId: string]: { status: string; lastSeenAt: string } };

  // Socket connection
  socketConnected: boolean;

  // Unread total (for badge)
  totalUnreadCount: number;

  // Actions
  setConversations: (conversations: Conversation[]) => void;
  addConversation: (conversation: Conversation) => void;
  updateConversation: (id: string, updates: Partial<Conversation>) => void;
  removeConversation: (id: string) => void;
  setActiveConversation: (id: string | null) => void;

  setMessages: (conversationId: string, messages: Message[]) => void;
  addMessage: (message: Message) => void;
  updateMessage: (conversationId: string, messageId: string, updates: Partial<Message>) => void;
  prependMessages: (conversationId: string, messages: Message[]) => void;

  setTypingUser: (conversationId: string, userId: string, username: string, isTyping: boolean) => void;
  clearTypingUser: (conversationId: string, userId: string) => void;

  updatePresence: (userId: string, status: string, lastSeenAt: string) => void;

  setSocketConnected: (connected: boolean) => void;

  calculateTotalUnread: () => void;

  reset: () => void;
}

export const useDMStore = create<DMState>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial state
        conversations: [],
        conversationsLoading: false,
        conversationsError: null,
        activeConversationId: null,
        messages: {},
        messagesLoading: {},
        messagesHasMore: {},
        typingUsers: [],
        presence: {},
        socketConnected: false,
        totalUnreadCount: 0,

        // Conversation actions
        setConversations: (conversations) => {
          set({ conversations });
          get().calculateTotalUnread();
        },

        addConversation: (conversation) => {
          set((state) => ({
            conversations: [conversation, ...state.conversations.filter(c => c._id !== conversation._id)],
          }));
          get().calculateTotalUnread();
        },

        updateConversation: (id, updates) => {
          set((state) => ({
            conversations: state.conversations.map((c) =>
              c._id === id ? { ...c, ...updates } : c
            ),
          }));
          get().calculateTotalUnread();
        },

        removeConversation: (id) => {
          set((state) => ({
            conversations: state.conversations.filter((c) => c._id !== id),
            activeConversationId: state.activeConversationId === id ? null : state.activeConversationId,
          }));
          get().calculateTotalUnread();
        },

        setActiveConversation: (id) => {
          set({ activeConversationId: id });
          // Clear unread when opening conversation
          if (id) {
            get().updateConversation(id, { unreadCount: 0 });
          }
        },

        // Message actions
        setMessages: (conversationId, messages) => {
          set((state) => ({
            messages: { ...state.messages, [conversationId]: messages },
            messagesHasMore: { ...state.messagesHasMore, [conversationId]: messages.length >= 50 },
          }));
        },

        addMessage: (message) => {
          set((state) => {
            const existing = state.messages[message.conversationId] || [];
            const isDuplicate = existing.some(
              (m) => m._id === message._id || m.clientMessageId === message.clientMessageId
            );

            if (isDuplicate) {
              // Update existing message (optimistic → real)
              return {
                messages: {
                  ...state.messages,
                  [message.conversationId]: existing.map((m) =>
                    m.clientMessageId === message.clientMessageId ? message : m
                  ),
                },
              };
            }

            return {
              messages: {
                ...state.messages,
                [message.conversationId]: [...existing, message],
              },
            };
          });
        },

        updateMessage: (conversationId, messageId, updates) => {
          set((state) => ({
            messages: {
              ...state.messages,
              [conversationId]: (state.messages[conversationId] || []).map((m) =>
                m._id === messageId ? { ...m, ...updates } : m
              ),
            },
          }));
        },

        prependMessages: (conversationId, messages) => {
          set((state) => ({
            messages: {
              ...state.messages,
              [conversationId]: [...messages, ...(state.messages[conversationId] || [])],
            },
            messagesHasMore: {
              ...state.messagesHasMore,
              [conversationId]: messages.length >= 50,
            },
          }));
        },

        // Typing indicator actions
        setTypingUser: (conversationId, userId, username, isTyping) => {
          set((state) => {
            const filtered = state.typingUsers.filter(
              (t) => !(t.conversationId === conversationId && t.userId === userId)
            );

            if (isTyping) {
              return {
                typingUsers: [
                  ...filtered,
                  { conversationId, userId, username, startedAt: Date.now() },
                ],
              };
            }

            return { typingUsers: filtered };
          });
        },

        clearTypingUser: (conversationId, userId) => {
          set((state) => ({
            typingUsers: state.typingUsers.filter(
              (t) => !(t.conversationId === conversationId && t.userId === userId)
            ),
          }));
        },

        // Presence actions
        updatePresence: (userId, status, lastSeenAt) => {
          set((state) => ({
            presence: {
              ...state.presence,
              [userId]: { status, lastSeenAt },
            },
          }));
        },

        // Socket actions
        setSocketConnected: (connected) => set({ socketConnected: connected }),

        // Calculate total unread
        calculateTotalUnread: () => {
          const total = get().conversations.reduce((sum, c) => sum + c.unreadCount, 0);
          set({ totalUnreadCount: total });
        },

        // Reset
        reset: () => set({
          conversations: [],
          conversationsLoading: false,
          conversationsError: null,
          activeConversationId: null,
          messages: {},
          messagesLoading: {},
          messagesHasMore: {},
          typingUsers: [],
          presence: {},
          socketConnected: false,
          totalUnreadCount: 0,
        }),
      }),
      {
        name: 'dm-storage',
        partialize: (state) => ({
          // Only persist conversation list (not messages)
          activeConversationId: state.activeConversationId,
        }),
      }
    ),
    { name: 'DMStore' }
  )
);
```

### 5.3 Socket Hook

**File**: `frontend/src/hooks/useSocket.ts`

```typescript
import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useDMStore } from '@/stores/dmStore';
import { useAuth } from '@/hooks/useAuth';

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const { user } = useAuth();
  const {
    setSocketConnected,
    addMessage,
    updateMessage,
    setTypingUser,
    updatePresence,
    addConversation,
    updateConversation,
  } = useDMStore();

  const connect = useCallback(() => {
    if (socketRef.current?.connected) return;

    const token = localStorage.getItem('accessToken');
    if (!token || !user) return;

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      console.log('[Socket] Connected');
      setSocketConnected(true);
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
      setSocketConnected(false);
    });

    socket.on('connect_error', (error) => {
      console.error('[Socket] Connection error:', error.message);
      setSocketConnected(false);
    });

    // Message events
    socket.on('dm:receive', (message) => {
      addMessage(message);
      // Update conversation's lastMessage
      updateConversation(message.conversationId, {
        lastMessage: {
          content: message.content,
          senderId: message.senderId,
          senderUsername: message.senderUsername,
          sentAt: message.createdAt,
          isRead: false,
        },
        unreadCount: (prev) => prev + 1,
        updatedAt: message.createdAt,
      });
    });

    socket.on('dm:sent', (ack) => {
      updateMessage(ack.conversationId, ack.clientMessageId, {
        _id: ack.messageId,
        status: 'sent',
      });
    });

    socket.on('dm:delivered', (payload) => {
      updateMessage(payload.conversationId, payload.messageId, {
        status: 'delivered',
      });
    });

    socket.on('dm:read_receipt', (payload) => {
      // Update all messages up to lastReadMessageId as 'read'
      // Implementation depends on message list structure
    });

    socket.on('dm:typing_indicator', (payload) => {
      setTypingUser(payload.conversationId, payload.userId, payload.username, payload.isTyping);

      // Auto-clear typing after 5 seconds
      if (payload.isTyping) {
        setTimeout(() => {
          setTypingUser(payload.conversationId, payload.userId, payload.username, false);
        }, 5000);
      }
    });

    socket.on('dm:edited', (payload) => {
      updateMessage(payload.conversationId, payload.messageId, {
        content: payload.newContent,
        editedAt: payload.editedAt,
      });
    });

    socket.on('dm:deleted', (payload) => {
      updateMessage(payload.conversationId, payload.messageId, {
        isDeleted: true,
        content: '[Message deleted]',
      });
    });

    // Presence events
    socket.on('presence:online', (payload) => {
      updatePresence(payload.userId, 'online', new Date().toISOString());
    });

    socket.on('presence:offline', (payload) => {
      updatePresence(payload.userId, 'offline', payload.lastSeenAt);
    });

    socket.on('presence:away', (payload) => {
      updatePresence(payload.userId, 'away', new Date().toISOString());
    });

    // Conversation events
    socket.on('conversation:created', (conversation) => {
      addConversation(conversation);
    });

    socketRef.current = socket;

    return socket;
  }, [user, setSocketConnected, addMessage, updateMessage, setTypingUser, updatePresence, addConversation, updateConversation]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      setSocketConnected(false);
    }
  }, [setSocketConnected]);

  const emit = useCallback(<T = unknown>(event: string, data: T) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data);
    } else {
      console.warn('[Socket] Not connected, cannot emit:', event);
    }
  }, []);

  // Auto-connect when user is authenticated
  useEffect(() => {
    if (user) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [user, connect, disconnect]);

  return {
    socket: socketRef.current,
    connected: socketRef.current?.connected ?? false,
    connect,
    disconnect,
    emit,
  };
}
```

### 5.4 Key Component: MessageInput

**File**: `frontend/src/components/dm/MessageInput.tsx`

```tsx
import { useState, useCallback, useRef, useEffect } from 'react';
import { useSocket } from '@/hooks/useSocket';
import { useDMStore } from '@/stores/dmStore';
import { useAuth } from '@/hooks/useAuth';
import { SendHorizontal, Paperclip, Smile } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { v4 as uuidv4 } from 'uuid';

interface MessageInputProps {
  conversationId: string;
}

export function MessageInput({ conversationId }: MessageInputProps) {
  const [content, setContent] = useState('');
  const [isSending, setIsSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTypingEmitRef = useRef<number>(0);

  const { emit, connected } = useSocket();
  const { addMessage } = useDMStore();
  const { user } = useAuth();

  // Send typing indicator (debounced)
  const sendTypingIndicator = useCallback((isTyping: boolean) => {
    const now = Date.now();

    // Throttle typing events to max 1 per 2 seconds
    if (isTyping && now - lastTypingEmitRef.current < 2000) {
      return;
    }

    lastTypingEmitRef.current = now;
    emit('dm:typing', { conversationId, isTyping });

    // Auto-stop typing after 5 seconds of no input
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    if (isTyping) {
      typingTimeoutRef.current = setTimeout(() => {
        emit('dm:typing', { conversationId, isTyping: false });
      }, 5000);
    }
  }, [conversationId, emit]);

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);

    if (e.target.value.length > 0) {
      sendTypingIndicator(true);
    } else {
      sendTypingIndicator(false);
    }
  };

  const handleSend = useCallback(async () => {
    const trimmedContent = content.trim();
    if (!trimmedContent || !user || isSending) return;

    const clientMessageId = uuidv4();

    // Optimistic update
    const optimisticMessage = {
      _id: clientMessageId, // Temporary ID
      clientMessageId,
      conversationId,
      senderId: user._id,
      senderUsername: user.username,
      content: trimmedContent,
      messageType: 'text' as const,
      status: 'sending' as const,
      createdAt: new Date().toISOString(),
      isDeleted: false,
    };

    addMessage(optimisticMessage);
    setContent('');
    sendTypingIndicator(false);

    // Send via WebSocket
    if (connected) {
      emit('dm:send', {
        conversationId,
        content: trimmedContent,
        messageType: 'text',
        clientMessageId,
      });
    } else {
      // Fallback to REST API
      try {
        setIsSending(true);
        const response = await fetch(`/api/conversations/${conversationId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: trimmedContent,
            clientMessageId,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to send message');
        }
      } catch (error) {
        console.error('Failed to send message:', error);
        // Mark message as failed
        addMessage({ ...optimisticMessage, status: 'failed' });
      } finally {
        setIsSending(false);
      }
    }
  }, [content, user, isSending, conversationId, addMessage, sendTypingIndicator, connected, emit]);

  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Cleanup typing timeout on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="flex items-end gap-2 p-4 border-t">
      <Button variant="ghost" size="icon" className="shrink-0">
        <Paperclip className="h-5 w-5" />
      </Button>

      <Textarea
        ref={textareaRef}
        value={content}
        onChange={handleContentChange}
        onKeyDown={handleKeyDown}
        placeholder="Type a message..."
        className="min-h-[40px] max-h-[120px] resize-none"
        rows={1}
      />

      <Button variant="ghost" size="icon" className="shrink-0">
        <Smile className="h-5 w-5" />
      </Button>

      <Button
        onClick={handleSend}
        disabled={!content.trim() || isSending}
        size="icon"
        className="shrink-0"
      >
        <SendHorizontal className="h-5 w-5" />
      </Button>
    </div>
  );
}
```

---

## 6. Security & Rate Limiting

### 6.1 Rate Limiting Configuration

**File**: `backend/src/middleware/dmRateLimiter.ts`

```typescript
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { getRedisClient } from '../config/redis';

// Message sending rate limit (per user)
export const dmSendLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args: string[]) => getRedisClient().sendCommand(args),
  }),
  windowMs: 60 * 1000,     // 1 minute
  max: 60,                  // 60 messages per minute
  message: {
    success: false,
    error: 'Too many messages. Please slow down.',
    code: 'RATE_LIMIT_DM_SEND',
  },
  keyGenerator: (req) => `dm:send:${req.user?._id}`,
  skip: (req) => req.user?.role === 'admin',  // Admins exempt
});

// Conversation creation rate limit
export const dmConversationLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args: string[]) => getRedisClient().sendCommand(args),
  }),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,                   // 10 new conversations per hour
  message: {
    success: false,
    error: 'Too many new conversations. Please wait.',
    code: 'RATE_LIMIT_DM_CONVERSATION',
  },
  keyGenerator: (req) => `dm:conv:${req.user?._id}`,
});

// Typing indicator rate limit (per conversation)
export const dmTypingLimiter = rateLimit({
  windowMs: 1000,           // 1 second
  max: 1,                    // 1 typing event per second
  keyGenerator: (req) => `dm:typing:${req.user?._id}`,
});

// Read receipt rate limit
export const dmReadLimiter = rateLimit({
  windowMs: 1000,           // 1 second
  max: 5,                    // 5 read receipts per second
  keyGenerator: (req) => `dm:read:${req.user?._id}`,
});
```

### 6.2 Socket.IO Rate Limiting

```typescript
// backend/src/middleware/socketRateLimiter.ts

import { Socket } from 'socket.io';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimits = new Map<string, RateLimitEntry>();

export function socketRateLimiter(
  event: string,
  maxRequests: number,
  windowMs: number
) {
  return (socket: Socket, next: (err?: Error) => void) => {
    const key = `${socket.data.userId}:${event}`;
    const now = Date.now();

    let entry = rateLimits.get(key);

    if (!entry || now > entry.resetAt) {
      entry = { count: 1, resetAt: now + windowMs };
      rateLimits.set(key, entry);
      return next();
    }

    entry.count++;

    if (entry.count > maxRequests) {
      return next(new Error(`Rate limit exceeded for ${event}`));
    }

    next();
  };
}

// Usage in socket handlers
socket.use((packet, next) => {
  const [event] = packet;

  switch (event) {
    case 'dm:send':
      return socketRateLimiter('dm:send', 60, 60000)(socket, next);
    case 'dm:typing':
      return socketRateLimiter('dm:typing', 2, 1000)(socket, next);
    case 'dm:read':
      return socketRateLimiter('dm:read', 10, 1000)(socket, next);
    default:
      next();
  }
});
```

### 6.3 Authorization Checks

```typescript
// backend/src/middleware/dmAuthorization.ts

import { Request, Response, NextFunction } from 'express';
import Conversation from '../models/ConversationModel';

// Verify user is participant in conversation
export async function verifyConversationAccess(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const { id: conversationId } = req.params;
  const userId = req.user?._id;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
    });
  }

  const conversation = await Conversation.findById(conversationId);

  if (!conversation) {
    return res.status(404).json({
      success: false,
      error: 'Conversation not found',
    });
  }

  const isParticipant = conversation.participants.some(
    (p) => p.toString() === userId.toString()
  );

  if (!isParticipant) {
    return res.status(403).json({
      success: false,
      error: 'Not authorized to access this conversation',
    });
  }

  // Check if user "deleted" this conversation
  const hasDeleted = conversation.deletedBy?.some(
    (id) => id.toString() === userId.toString()
  );

  if (hasDeleted) {
    return res.status(404).json({
      success: false,
      error: 'Conversation not found',
    });
  }

  req.conversation = conversation;
  next();
}

// Verify user can message target user
export async function verifyCanMessage(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const { participantId } = req.body;
  const userId = req.user?._id;

  // Can't message yourself
  if (participantId === userId?.toString()) {
    return res.status(400).json({
      success: false,
      error: 'Cannot start conversation with yourself',
    });
  }

  // Future: Check if user is blocked
  // Future: Check if user has DM disabled

  next();
}
```

### 6.4 Input Validation

```typescript
// backend/src/validators/dmValidators.ts

import { body, param, query } from 'express-validator';

export const sendMessageValidator = [
  body('content')
    .trim()
    .notEmpty()
    .withMessage('Message content is required')
    .isLength({ max: 4000 })
    .withMessage('Message too long (max 4000 characters)'),
  body('messageType')
    .optional()
    .isIn(['text', 'image', 'file'])
    .withMessage('Invalid message type'),
  body('replyTo')
    .optional()
    .isMongoId()
    .withMessage('Invalid reply message ID'),
  body('clientMessageId')
    .optional()
    .isUUID()
    .withMessage('Invalid client message ID'),
];

export const getMessagesValidator = [
  param('id')
    .isMongoId()
    .withMessage('Invalid conversation ID'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('before')
    .optional()
    .isMongoId()
    .withMessage('Invalid cursor'),
];

export const createConversationValidator = [
  body('participantId')
    .notEmpty()
    .isMongoId()
    .withMessage('Valid participant ID required'),
];
```

---

## 7. Audit Logging Integration

### 7.1 New Audit Actions

**Add to**: `backend/src/models/AuditLogModel.ts`

```typescript
// Extend AuditAction type
type AuditAction =
  | 'LOGIN' | 'LOGOUT' | 'CHAT_QUERY' | 'CHAT_CREATED' | 'CHAT_DELETED'
  | 'DOCUMENT_UPLOADED' | 'DOCUMENT_DELETED' | 'USER_CREATED' | 'USER_UPDATED'
  | 'SETTINGS_UPDATED' | 'SESSION_TERMINATED' | 'PII_DETECTED' | 'ADMIN_ACTION'
  // New DM actions
  | 'DM_CONVERSATION_CREATED'
  | 'DM_MESSAGE_SENT'
  | 'DM_MESSAGE_EDITED'
  | 'DM_MESSAGE_DELETED'
  | 'DM_CONVERSATION_ARCHIVED'
  | 'DM_CONVERSATION_DELETED';

// Extend AuditResource type
type AuditResource =
  | 'USER' | 'CHAT' | 'DOCUMENT' | 'SETTINGS' | 'SESSION' | 'SYSTEM'
  // New DM resources
  | 'DM_CONVERSATION'
  | 'DM_MESSAGE';
```

### 7.2 Audit Logging Functions

**File**: `backend/src/services/dmAuditService.ts`

```typescript
import { logAuditEvent } from './auditService';
import { Types } from 'mongoose';

export async function auditDMConversationCreated(
  userId: Types.ObjectId,
  username: string,
  conversationId: string,
  participantId: string,
  participantUsername: string,
  ipAddress: string,
  userAgent: string
) {
  await logAuditEvent({
    action: 'DM_CONVERSATION_CREATED',
    resource: 'DM_CONVERSATION',
    resourceId: conversationId,
    userId,
    username,
    ipAddress,
    userAgent,
    success: true,
    details: {
      participantId,
      participantUsername,
    },
  });
}

export async function auditDMMessageSent(
  userId: Types.ObjectId,
  username: string,
  messageId: string,
  conversationId: string,
  contentLength: number,
  ipAddress: string,
  userAgent: string
) {
  await logAuditEvent({
    action: 'DM_MESSAGE_SENT',
    resource: 'DM_MESSAGE',
    resourceId: messageId,
    userId,
    username,
    ipAddress,
    userAgent,
    success: true,
    details: {
      conversationId,
      contentLength,  // Don't log actual content for privacy
    },
  });
}

export async function auditDMMessageDeleted(
  userId: Types.ObjectId,
  username: string,
  messageId: string,
  conversationId: string,
  ipAddress: string,
  userAgent: string
) {
  await logAuditEvent({
    action: 'DM_MESSAGE_DELETED',
    resource: 'DM_MESSAGE',
    resourceId: messageId,
    userId,
    username,
    ipAddress,
    userAgent,
    success: true,
    details: {
      conversationId,
    },
  });
}
```

---

## 8. Testing Strategy

### 8.1 Unit Tests

```typescript
// backend/src/services/__tests__/dmService.test.ts

describe('DM Service', () => {
  describe('createConversation', () => {
    it('should create new conversation between two users');
    it('should return existing conversation if one exists');
    it('should throw if participant does not exist');
    it('should throw if trying to message self');
  });

  describe('sendMessage', () => {
    it('should create message with correct fields');
    it('should update conversation lastMessage');
    it('should increment recipient unread count');
    it('should validate message length');
    it('should support reply references');
  });

  describe('markAsRead', () => {
    it('should update read receipts for all messages');
    it('should reset unread count to zero');
    it('should emit read receipt events');
  });

  describe('getMessages', () => {
    it('should paginate messages correctly');
    it('should sort by createdAt descending');
    it('should filter deleted messages');
    it('should support cursor-based pagination');
  });
});
```

### 8.2 Integration Tests

```typescript
// backend/src/routes/__tests__/dmRoutes.test.ts

describe('DM Routes', () => {
  describe('GET /api/conversations', () => {
    it('should list user conversations');
    it('should include unread counts');
    it('should include participant presence');
    it('should support archived filter');
    it('should require authentication');
  });

  describe('POST /api/conversations', () => {
    it('should create new conversation');
    it('should return existing if duplicate');
    it('should reject invalid participant');
    it('should rate limit conversation creation');
  });

  describe('GET /api/conversations/:id/messages', () => {
    it('should return paginated messages');
    it('should reject non-participants');
    it('should mark as read on fetch');
  });

  describe('POST /api/conversations/:id/messages', () => {
    it('should send message');
    it('should validate content');
    it('should rate limit sends');
  });
});
```

### 8.3 E2E Tests

```typescript
// e2e/dm.spec.ts (Playwright)

describe('Direct Messages E2E', () => {
  test('User can start new conversation', async ({ page }) => {
    // Login as user1
    // Navigate to messages
    // Search for user2
    // Click to start conversation
    // Verify conversation created
  });

  test('Users can exchange messages', async ({ browser }) => {
    // Create two browser contexts
    // Login user1 in context1
    // Login user2 in context2
    // user1 sends message
    // Verify user2 receives in real-time
  });

  test('Typing indicator works', async ({ browser }) => {
    // user1 starts typing
    // Verify user2 sees typing indicator
    // user1 stops typing
    // Verify indicator disappears
  });

  test('Read receipts update', async ({ browser }) => {
    // user1 sends message
    // Verify status is 'sent'
    // user2 opens conversation
    // Verify user1 sees 'read' status
  });
});
```

### 8.4 Load Tests

```typescript
// load-tests/dm-load.js (k6)

import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 100 },   // Ramp to 100 users
    { duration: '3m', target: 100 },   // Stay at 100
    { duration: '1m', target: 500 },   // Ramp to 500
    { duration: '3m', target: 500 },   // Stay at 500
    { duration: '1m', target: 0 },     // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],  // 95% under 500ms
    ws_connecting: ['p(95)<1000'],     // WebSocket connect under 1s
  },
};

export default function () {
  // Test message send throughput
  const res = http.post(
    `${__ENV.API_URL}/api/conversations/${__ENV.CONV_ID}/messages`,
    JSON.stringify({ content: 'Load test message' }),
    { headers: { Authorization: `Bearer ${__ENV.TOKEN}` } }
  );

  check(res, {
    'message sent': (r) => r.status === 200,
  });

  sleep(1);
}
```

---

## 9. Implementation Phases

### Phase 1: Foundation (3-4 days)

**Goal**: Core infrastructure setup

**Tasks**:
1. Install Socket.IO dependencies (backend + frontend)
2. Create database models (Conversation, DirectMessage, UserPresence)
3. Run MongoDB migrations/indexes
4. Set up Socket.IO server with JWT auth
5. Create Redis adapter for Socket.IO
6. Implement basic connection handling

**Deliverables**:
- Socket.IO server running
- Models created with indexes
- Basic connection established from frontend

**Verification**:
- [ ] `npm install` completes for socket.io packages
- [ ] Models compile without TypeScript errors
- [ ] MongoDB indexes created
- [ ] Socket connects from browser console

---

### Phase 2: Core Messaging (4-5 days)

**Goal**: Send and receive messages

**Tasks**:
1. Implement `dm:send` and `dm:receive` socket events
2. Create REST API endpoints for conversations
3. Create REST API endpoints for messages
4. Implement conversation creation logic
5. Implement message pagination
6. Build optimistic UI updates
7. Add message deduplication

**Deliverables**:
- Users can send messages
- Messages appear in real-time
- REST fallback works
- Pagination loads older messages

**Verification**:
- [ ] User A sends message, User B receives instantly
- [ ] Messages persist in MongoDB
- [ ] Scrolling up loads older messages
- [ ] Offline mode falls back to REST

---

### Phase 3: Delivery & Read Receipts (2-3 days)

**Goal**: Message status tracking

**Tasks**:
1. Implement delivery tracking
2. Implement read receipt logic
3. Add read receipt UI (checkmarks)
4. Create unread count tracking
5. Add notification badge
6. Implement "mark as read" on open

**Deliverables**:
- Messages show sent/delivered/read status
- Unread counts in conversation list
- Badge shows total unread

**Verification**:
- [ ] Checkmarks update as status changes
- [ ] Opening conversation clears unread
- [ ] Badge count is accurate

---

### Phase 4: Typing Indicators & Presence (2 days)

**Goal**: Real-time activity indicators

**Tasks**:
1. Implement typing indicator events
2. Create typing indicator UI
3. Implement user presence tracking
4. Add online/offline badges
5. Handle disconnect/reconnect
6. Implement auto-away logic

**Deliverables**:
- "User is typing..." appears
- Online status shows on avatars
- Presence updates in real-time

**Verification**:
- [ ] Typing appears within 200ms
- [ ] Presence badge updates on connect/disconnect
- [ ] Auto-away after 5 minutes

---

### Phase 5: UI Polish & UX (2-3 days)

**Goal**: Complete user experience

**Tasks**:
1. Build conversation list component
2. Build message list with virtualization
3. Add user search for new conversations
4. Add conversation settings (mute, archive)
5. Implement message editing
6. Implement message deletion
7. Add reply-to functionality
8. Mobile responsive layout

**Deliverables**:
- Polished messaging interface
- All actions functional
- Mobile-friendly

**Verification**:
- [ ] UI matches design specs
- [ ] Edit/delete work correctly
- [ ] Reply threads display properly
- [ ] Works on mobile

---

### Phase 6: Security & Production (2-3 days)

**Goal**: Production-ready security

**Tasks**:
1. Implement all rate limiters
2. Add input validation
3. Integrate audit logging
4. Add authorization checks
5. Security testing
6. Performance testing
7. Documentation

**Deliverables**:
- Rate limiting active
- All inputs validated
- Audit logs generated
- Load tested

**Verification**:
- [ ] Rate limit errors appear when exceeded
- [ ] Invalid inputs rejected
- [ ] Audit logs show DM events
- [ ] Handles 500 concurrent users

---

## 10. File Structure

### Backend Files to Create

```
backend/src/
├── models/
│   ├── ConversationModel.ts          # NEW
│   ├── DirectMessageModel.ts         # NEW
│   └── UserPresenceModel.ts          # NEW
├── services/
│   ├── dmService.ts                  # NEW - Core DM logic
│   ├── socketService.ts              # NEW - Socket.IO management
│   ├── presenceService.ts            # NEW - User presence
│   └── dmAuditService.ts             # NEW - DM audit helpers
├── routes/
│   └── conversationRoutes.ts         # NEW - REST endpoints
├── controllers/
│   └── conversationController.ts     # NEW
├── middleware/
│   ├── dmRateLimiter.ts              # NEW
│   ├── dmAuthorization.ts            # NEW
│   └── socketAuth.ts                 # NEW
├── validators/
│   └── dmValidators.ts               # NEW
├── config/
│   └── socketConfig.ts               # NEW
└── types/
    └── socket.d.ts                   # NEW - Socket type definitions
```

### Frontend Files to Create

```
frontend/src/
├── components/
│   └── dm/
│       ├── DMContainer.tsx           # NEW
│       ├── ConversationList.tsx      # NEW
│       ├── ConversationItem.tsx      # NEW
│       ├── ConversationView.tsx      # NEW
│       ├── MessageList.tsx           # NEW
│       ├── MessageItem.tsx           # NEW
│       ├── MessageInput.tsx          # NEW
│       ├── TypingIndicator.tsx       # NEW
│       ├── UserSearch.tsx            # NEW
│       ├── PresenceBadge.tsx         # NEW
│       ├── ReadReceipt.tsx           # NEW
│       ├── NewConversationModal.tsx  # NEW
│       └── ConversationSettings.tsx  # NEW
├── stores/
│   └── dmStore.ts                    # NEW
├── hooks/
│   ├── useSocket.ts                  # NEW
│   ├── useConversations.ts           # NEW
│   ├── useMessages.ts                # NEW
│   ├── useTypingIndicator.ts         # NEW
│   └── usePresence.ts                # NEW
├── lib/
│   └── api/
│       └── conversations.ts          # NEW
└── app/
    └── messages/
        ├── page.tsx                  # NEW - /messages route
        └── [conversationId]/
            └── page.tsx              # NEW - /messages/:id route
```

### Files to Modify

```
backend/src/
├── index.ts                          # Add Socket.IO initialization
├── models/AuditLogModel.ts           # Add DM audit actions
├── routes/index.ts                   # Register conversation routes
└── routes/userRoutes.ts              # Add user search endpoint

frontend/src/
├── app/layout.tsx                    # Add Socket provider
├── components/layout/Sidebar.tsx     # Add Messages link
└── components/layout/Header.tsx      # Add unread badge
```

---

## 11. Dependencies

### Backend

```json
{
  "dependencies": {
    "socket.io": "^4.7.5",
    "@socket.io/redis-adapter": "^8.3.0"
  },
  "devDependencies": {
    "@types/socket.io": "^3.0.0"
  }
}
```

**Install Command**:
```bash
cd backend
npm install socket.io @socket.io/redis-adapter
npm install -D @types/socket.io
```

### Frontend

```json
{
  "dependencies": {
    "socket.io-client": "^4.7.5",
    "uuid": "^9.0.1"
  },
  "devDependencies": {
    "@types/uuid": "^9.0.8"
  }
}
```

**Install Command**:
```bash
cd frontend
npm install socket.io-client uuid
npm install -D @types/uuid
```

---

## 12. Migration Plan

### 12.1 Database Migration Script

**File**: `backend/scripts/migrate-dm-collections.ts`

```typescript
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function migrate() {
  await mongoose.connect(process.env.MONGODB_URI!);

  const db = mongoose.connection.db;

  console.log('Creating DM collections and indexes...');

  // Create collections
  await db.createCollection('conversations');
  await db.createCollection('directmessages');
  await db.createCollection('userpresences');

  // Conversation indexes
  await db.collection('conversations').createIndexes([
    { key: { participants: 1 } },
    { key: { participants: 1, updatedAt: -1 } },
    { key: { 'lastMessage.sentAt': -1 } },
  ]);

  // DirectMessage indexes
  await db.collection('directmessages').createIndexes([
    { key: { conversationId: 1, createdAt: -1 } },
    { key: { conversationId: 1, _id: -1 } },
    { key: { senderId: 1, createdAt: -1 } },
    { key: { 'readBy.userId': 1 } },
  ]);

  // UserPresence indexes
  await db.collection('userpresences').createIndexes([
    { key: { userId: 1 }, unique: true },
    { key: { status: 1 } },
    { key: { socketIds: 1 } },
  ]);

  console.log('Migration complete!');
  await mongoose.disconnect();
}

migrate().catch(console.error);
```

### 12.2 Rollback Script

```typescript
// backend/scripts/rollback-dm-collections.ts

async function rollback() {
  await mongoose.connect(process.env.MONGODB_URI!);

  const db = mongoose.connection.db;

  console.log('Rolling back DM collections...');

  await db.dropCollection('conversations');
  await db.dropCollection('directmessages');
  await db.dropCollection('userpresences');

  console.log('Rollback complete!');
  await mongoose.disconnect();
}
```

---

## Summary

This implementation plan provides a comprehensive blueprint for adding Direct Messages to GKChatty. The feature is designed to:

1. **Integrate seamlessly** with existing JWT authentication
2. **Scale horizontally** via Redis-backed Socket.IO
3. **Maintain security** with rate limiting and authorization
4. **Support auditability** via integrated audit logging
5. **Deliver great UX** with real-time updates, typing indicators, and read receipts

**Total Estimated Effort**: 15-21 days

**Critical Path**:
1. Socket.IO infrastructure (Phase 1)
2. Core messaging (Phase 2)
3. UI components (Phase 5)

**Risk Areas**:
- Socket.IO connection handling on mobile
- Message ordering with high concurrency
- Presence accuracy with multiple tabs

**Next Steps**:
1. Review and approve this plan
2. Create implementation branch
3. Begin Phase 1 (Foundation)
