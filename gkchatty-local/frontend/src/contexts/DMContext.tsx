'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '@/context/AuthContext';
import { getApiBaseUrl } from '@/lib/config';

// Types
export type PresenceStatus = 'online' | 'away' | 'busy' | 'offline';

export interface UserPresence {
  _id: string;
  username: string;
  status: PresenceStatus;
  lastSeenAt?: Date;
  iconUrl?: string | null;
}

export interface LastMessage {
  content: string;
  senderId: string;
  senderUsername: string;
  sentAt: Date;
  isRead: boolean;
}

export interface Conversation {
  _id: string;
  otherParticipant: UserPresence;
  lastMessage: LastMessage | null;
  unreadCount: number;
  isArchived: boolean;
  isMuted: boolean;
  isGroup: boolean;
  groupName?: string;
  updatedAt: Date;
  createdAt: Date;
}

export interface Attachment {
  type: 'image' | 'file';
  url: string;
  filename: string;
  size: number;
  mimeType: string;
  s3Key?: string; // Optional - for copy-to-docs functionality
}

export interface Message {
  _id: string;
  senderId: string;
  senderUsername: string;
  content: string;
  messageType: 'text' | 'image' | 'file' | 'system';
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  createdAt: Date;
  editedAt?: Date;
  isDeleted: boolean;
  replyTo?: {
    messageId: string;
    content: string;
    senderUsername: string;
  };
  attachments?: Attachment[];
  // Local tracking
  tempId?: string;
}

interface TypingUser {
  userId: string;
  username: string;
  timestamp: number;
}

interface DMContextType {
  // Connection
  socket: Socket | null;
  isConnected: boolean;
  connectionError: string | null;

  // Conversations
  conversations: Conversation[];
  selectedConversation: Conversation | null;
  isLoadingConversations: boolean;
  selectConversation: (conversation: Conversation | null) => void;
  createConversation: (recipientId: string, recipientUsername: string) => Promise<Conversation>;
  refreshConversations: () => Promise<void>;

  // Messages
  messages: Message[];
  isLoadingMessages: boolean;
  hasMoreMessages: boolean;
  sendMessage: (content: string, attachments?: Attachment[]) => Promise<void>;
  loadMoreMessages: () => Promise<void>;
  uploadAttachment: (file: File) => Promise<Attachment | null>;

  // Users
  onlineUsers: UserPresence[];
  isLoadingUsers: boolean;
  refreshOnlineUsers: () => Promise<void>;

  // Typing
  typingUsers: TypingUser[];
  sendTyping: () => void;

  // Presence
  updatePresence: (status: PresenceStatus) => void;

  // Unread count
  totalUnreadCount: number;
  markConversationAsRead: (conversationId: string) => Promise<void>;
}

const DMContext = createContext<DMContextType | undefined>(undefined);

interface DMProviderProps {
  children: ReactNode;
}

const TYPING_TIMEOUT = 3000; // 3 seconds

// Use the shared config for API URL (same as rest of app)
const getSocketUrl = () => getApiBaseUrl();

export const DMProvider: React.FC<DMProviderProps> = ({ children }) => {
  // Get auth state to react to login/logout
  const { user } = useAuth();

  // Connection state
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Conversations state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);

  // Messages state
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const oldestMessageId = useRef<string | null>(null);

  // Users state
  const [onlineUsers, setOnlineUsers] = useState<UserPresence[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);

  // Typing state
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTypingSentRef = useRef<number>(0);

  // Track processed message IDs to prevent duplicate notification increments
  // (Backend emits to both conversation room and user room, causing duplicates)
  const processedMessageIds = useRef<Set<string>>(new Set());

  // Ref to track current selected conversation (for use in socket handlers to avoid stale closures)
  const selectedConversationRef = useRef<Conversation | null>(null);

  // Keep ref in sync with state
  useEffect(() => {
    selectedConversationRef.current = selectedConversation;
  }, [selectedConversation]);

  // Get auth token - must match key used by AuthContext
  const getToken = useCallback(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('accessToken');
    }
    return null;
  }, []);

  // Listen for logout event from AuthContext - this fires BEFORE user state changes
  // This is critical because the component may unmount before useEffect cleanup runs
  useEffect(() => {
    const handleLogout = async () => {
      console.log('[DMContext] auth:logout event received');
      if (socket?.connected) {
        console.log('[DMContext] Emitting presence:update offline via auth:logout handler. Socket ID:', socket.id);
        socket.emit('presence:update', { status: 'offline' });
        // Wait briefly for server to process the presence update before disconnecting
        await new Promise(resolve => setTimeout(resolve, 100));
        socket.disconnect();
        console.log('[DMContext] Socket disconnected via auth:logout handler');
      }
      setSocket(null);
      setIsConnected(false);
      setOnlineUsers([]);
      setConversations([]);
      setMessages([]);
    };

    window.addEventListener('auth:logout', handleLogout);
    return () => {
      window.removeEventListener('auth:logout', handleLogout);
    };
  }, [socket]);

  // Disconnect socket when user logs out (backup - in case event handler didn't catch it)
  useEffect(() => {
    if (!user && socket) {
      console.log('[DMContext] User logged out (backup check), disconnecting socket. Socket ID:', socket.id, 'Connected:', socket.connected);
      // Emit explicit offline status before disconnecting
      if (socket.connected) {
        console.log('[DMContext] Emitting presence:update offline');
        socket.emit('presence:update', { status: 'offline' });
      }
      socket.disconnect();
      console.log('[DMContext] Socket.disconnect() called. Connected now:', socket.connected);
      setSocket(null);
      setIsConnected(false);
      setOnlineUsers([]);
      setConversations([]);
      setMessages([]);
    }
  }, [user, socket]);

  // Initialize Socket.IO connection - depends on user state to react to login/logout
  useEffect(() => {
    // Only connect if user is logged in
    if (!user) {
      console.log('[DMContext] No user logged in, skipping socket connection');
      return;
    }

    const token = getToken();
    if (!token) {
      console.log('[DMContext] No token found, skipping socket connection');
      return;
    }

    // Don't create a new socket if one already exists and is connected
    if (socket?.connected) {
      console.log('[DMContext] Socket already connected, skipping initialization');
      return;
    }

    console.log('[DMContext] Initializing Socket.IO connection to:', getSocketUrl());
    const newSocket = io(getSocketUrl(), {
      auth: { token },
      // Use polling first for better compatibility with restrictive networks/firewalls
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity, // Keep trying to reconnect
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000, // Max 10 seconds between attempts
      randomizationFactor: 0.5, // Add jitter to prevent thundering herd
      timeout: 20000, // Connection timeout
    });

    newSocket.on('connect', () => {
      console.log('[DMContext] Socket connected:', newSocket.id);
      setIsConnected(true);
      setConnectionError(null);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('[DMContext] Socket disconnected:', reason);
      setIsConnected(false);
    });

    newSocket.on('connect_error', (error) => {
      console.error('[DMContext] Socket connection error:', error.message);
      setConnectionError(error.message);
      setIsConnected(false);
    });

    // Handle reconnection events for debugging
    newSocket.io.on('reconnect', (attempt) => {
      console.log('[DMContext] Socket reconnected after', attempt, 'attempts');
    });

    newSocket.io.on('reconnect_attempt', (attempt) => {
      console.log('[DMContext] Socket reconnection attempt', attempt);
    });

    newSocket.io.on('reconnect_error', (error) => {
      console.error('[DMContext] Socket reconnection error:', error.message);
    });

    newSocket.io.on('reconnect_failed', () => {
      console.error('[DMContext] Socket reconnection failed after all attempts');
    });

    // Handle incoming DM (backend emits 'dm:receive')
    // NOTE: Backend emits to both conversation room AND user room, so we may receive duplicates
    newSocket.on('dm:receive', (message: Message) => {
      console.log('[DMContext] Received new message:', message._id);
      const messageConversationId = (message as any).conversationId;

      // Check if we've already processed this message (prevents duplicate notifications)
      const alreadyProcessed = processedMessageIds.current.has(message._id);
      if (!alreadyProcessed) {
        processedMessageIds.current.add(message._id);
        // Limit set size to prevent memory leak (keep last 1000 message IDs)
        if (processedMessageIds.current.size > 1000) {
          const iterator = processedMessageIds.current.values();
          processedMessageIds.current.delete(iterator.next().value);
        }
      }

      setMessages((prev) => {
        // Check if message already exists (by _id or tempId)
        const exists = prev.some((m) => m._id === message._id);
        if (exists) return prev;
        return [...prev, message];
      });

      // Update conversation's last message
      // Only increment unread count if:
      // 1. This is the first time processing this message (not a duplicate)
      // 2. The chat window for this conversation is NOT currently open
      setConversations((prev) =>
        prev.map((conv) => {
          if (conv._id === messageConversationId) {
            // Check if this conversation is currently selected (chat window open)
            // If so, don't increment unread - user is already viewing this chat
            // Use ref to get current value (avoids stale closure from when socket handler was created)
            const isCurrentlyViewing = selectedConversationRef.current?._id === messageConversationId;

            // Only increment unread if: not a duplicate AND not currently viewing
            const shouldIncrementUnread = !alreadyProcessed && !isCurrentlyViewing;

            return {
              ...conv,
              lastMessage: {
                content: message.content,
                senderId: message.senderId,
                senderUsername: message.senderUsername,
                sentAt: message.createdAt,
                isRead: isCurrentlyViewing, // Mark as read if viewing
              },
              // Don't increment unread if duplicate or user is currently viewing
              unreadCount: shouldIncrementUnread ? conv.unreadCount + 1 : conv.unreadCount,
              updatedAt: message.createdAt,
            };
          }
          return conv;
        })
      );
    });

    // Handle message sent confirmation
    newSocket.on('dm:sent', ({ clientMessageId, messageId, conversationId, createdAt, status }) => {
      console.log('[DMContext] Message sent confirmed:', messageId);
      setMessages((prev) =>
        prev.map((m) =>
          m.tempId === clientMessageId
            ? { ...m, _id: messageId, status: status || 'sent', createdAt: new Date(createdAt), tempId: undefined }
            : m
        )
      );
    });

    // Handle typing indicator
    newSocket.on('dm:typing_indicator', ({ userId, username, conversationId, isTyping }) => {
      if (selectedConversation?._id === conversationId) {
        setTypingUsers((prev) => {
          if (!isTyping) {
            // User stopped typing
            return prev.filter((t) => t.userId !== userId);
          }
          const exists = prev.some((t) => t.userId === userId);
          const now = Date.now();
          if (exists) {
            return prev.map((t) => (t.userId === userId ? { ...t, timestamp: now } : t));
          }
          return [...prev, { userId, username, timestamp: now }];
        });

        // Auto-clear typing after timeout
        if (isTyping) {
          setTimeout(() => {
            setTypingUsers((prev) => prev.filter((t) => Date.now() - t.timestamp < TYPING_TIMEOUT));
          }, TYPING_TIMEOUT + 100);
        }
      }
    });

    // Handle presence updates
    newSocket.on('presence:changed', ({ userId, status }: { userId: string; status: PresenceStatus }) => {
      console.log('[DMContext] Presence changed:', userId, status);
      // Update in conversations
      setConversations((prev) =>
        prev.map((conv) => {
          if (conv.otherParticipant._id === userId) {
            return {
              ...conv,
              otherParticipant: { ...conv.otherParticipant, status },
            };
          }
          return conv;
        })
      );
      // Update in online users list
      setOnlineUsers((prev) =>
        prev.map((u) => (u._id === userId ? { ...u, status } : u))
      );
    });

    // Handle read receipts
    newSocket.on('dm:read', ({ conversationId, userId }) => {
      if (selectedConversation?._id === conversationId) {
        setMessages((prev) =>
          prev.map((m) => {
            if (m.senderId !== userId && m.status !== 'read') {
              return { ...m, status: 'read' };
            }
            return m;
          })
        );
      }
    });

    setSocket(newSocket);

    return () => {
      console.log('[DMContext] Cleanup running - Socket ID:', newSocket.id, 'Connected:', newSocket.connected);
      // Emit explicit offline status before disconnecting
      if (newSocket.connected) {
        console.log('[DMContext] Emitting presence:update offline before disconnect');
        newSocket.emit('presence:update', { status: 'offline' });
      }
      newSocket.disconnect();
      console.log('[DMContext] Socket disconnected. Connected now:', newSocket.connected);
    };
  }, [user, getToken]); // Re-run when user changes (login/logout)

  // Fetch conversations
  const refreshConversations = useCallback(async () => {
    const token = getToken();
    if (!token) return;

    setIsLoadingConversations(true);
    try {
      const response = await fetch(`${getSocketUrl()}/api/conversations`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error('Failed to fetch conversations');

      const data = await response.json();
      setConversations(data.conversations || []);
    } catch (error) {
      console.error('[DMContext] Error fetching conversations:', error);
    } finally {
      setIsLoadingConversations(false);
    }
  }, [getToken]);

  // Fetch online users
  const refreshOnlineUsers = useCallback(async () => {
    const token = getToken();
    if (!token) return;

    setIsLoadingUsers(true);
    try {
      const response = await fetch(`${getSocketUrl()}/api/conversations/users/online`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error('Failed to fetch online users');

      const data = await response.json();
      setOnlineUsers(data.users || []);
    } catch (error) {
      console.error('[DMContext] Error fetching online users:', error);
    } finally {
      setIsLoadingUsers(false);
    }
  }, [getToken]);

  // Load initial data when connected
  useEffect(() => {
    if (isConnected) {
      refreshConversations();
      refreshOnlineUsers();
    }
  }, [isConnected, refreshConversations, refreshOnlineUsers]);

  // Select conversation and load messages
  const selectConversation = useCallback(
    async (conversation: Conversation | null) => {
      setSelectedConversation(conversation);
      setMessages([]);
      setHasMoreMessages(true);
      oldestMessageId.current = null;
      setTypingUsers([]);

      if (!conversation) return;

      const token = getToken();
      if (!token) return;

      // Join conversation room (backend expects 'conversation:join' with just the ID string)
      socket?.emit('conversation:join', conversation._id);

      // Load messages
      setIsLoadingMessages(true);
      try {
        const response = await fetch(
          `${getSocketUrl()}/api/conversations/${conversation._id}/messages`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) throw new Error('Failed to fetch messages');

        const data = await response.json();
        setMessages(data.messages || []);
        setHasMoreMessages(data.pagination?.hasMore || false);
        oldestMessageId.current = data.pagination?.oldestMessageId || null;

        // Mark as read
        if (conversation.unreadCount > 0) {
          await fetch(`${getSocketUrl()}/api/conversations/${conversation._id}/read`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
          setConversations((prev) =>
            prev.map((c) => (c._id === conversation._id ? { ...c, unreadCount: 0 } : c))
          );
        }
      } catch (error) {
        console.error('[DMContext] Error fetching messages:', error);
      } finally {
        setIsLoadingMessages(false);
      }
    },
    [getToken, socket]
  );

  // Load more messages (pagination)
  const loadMoreMessages = useCallback(async () => {
    if (!selectedConversation || !hasMoreMessages || isLoadingMessages) return;

    const token = getToken();
    if (!token) return;

    setIsLoadingMessages(true);
    try {
      const url = new URL(`${getSocketUrl()}/api/conversations/${selectedConversation._id}/messages`);
      if (oldestMessageId.current) {
        url.searchParams.set('before', oldestMessageId.current);
      }

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error('Failed to fetch more messages');

      const data = await response.json();
      setMessages((prev) => [...(data.messages || []), ...prev]);
      setHasMoreMessages(data.pagination?.hasMore || false);
      oldestMessageId.current = data.pagination?.oldestMessageId || null;
    } catch (error) {
      console.error('[DMContext] Error loading more messages:', error);
    } finally {
      setIsLoadingMessages(false);
    }
  }, [selectedConversation, hasMoreMessages, isLoadingMessages, getToken]);

  // Upload attachment
  const uploadAttachment = useCallback(
    async (file: File): Promise<Attachment | null> => {
      const token = getToken();
      if (!token || !selectedConversation) {
        console.error('[DMContext] Cannot upload: no token or conversation');
        return null;
      }

      const formData = new FormData();
      formData.append('file', file);

      try {
        console.log('[DMContext] Uploading attachment:', file.name);
        const response = await fetch(
          `${getSocketUrl()}/api/conversations/${selectedConversation._id}/attachments`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
            },
            body: formData,
          }
        );

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Upload failed');
        }

        const data = await response.json();
        console.log('[DMContext] Attachment uploaded:', data.attachment);
        return data.attachment as Attachment;
      } catch (error) {
        console.error('[DMContext] Error uploading attachment:', error);
        return null;
      }
    },
    [getToken, selectedConversation]
  );

  // Send message
  const sendMessage = useCallback(
    async (content: string, attachments?: Attachment[]) => {
      if (!selectedConversation || !socket) return;
      if (!content.trim() && (!attachments || attachments.length === 0)) return;

      const tempId = uuidv4();
      const hasAttachments = attachments && attachments.length > 0;
      const messageType = hasAttachments && attachments[0].type === 'image' ? 'image' : 'text';

      const tempMessage: Message = {
        _id: tempId,
        tempId,
        senderId: 'me', // Will be replaced by server
        senderUsername: 'me',
        content: content.trim() || (hasAttachments ? `Sent ${attachments[0].filename}` : ''),
        messageType,
        status: 'sending',
        createdAt: new Date(),
        isDeleted: false,
        attachments: attachments,
      };

      // Optimistic update
      setMessages((prev) => [...prev, tempMessage]);

      // Send via socket
      socket.emit('dm:send', {
        conversationId: selectedConversation._id,
        recipientId: selectedConversation.otherParticipant._id,
        content: tempMessage.content,
        clientMessageId: tempId,
        attachments: attachments,
      });
    },
    [selectedConversation, socket]
  );

  // Create new conversation
  const createConversation = useCallback(
    async (recipientId: string, recipientUsername: string): Promise<Conversation> => {
      const token = getToken();
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(`${getSocketUrl()}/api/conversations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ recipientId, recipientUsername }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create conversation');
      }

      const data = await response.json();
      const conversation = data.conversation;

      // Add to conversations if new
      if (data.isNew) {
        setConversations((prev) => [conversation, ...prev]);
      }

      return conversation;
    },
    [getToken]
  );

  // Send typing indicator
  const sendTyping = useCallback(() => {
    if (!selectedConversation || !socket) return;

    const now = Date.now();
    if (now - lastTypingSentRef.current < 2000) return; // Throttle to once per 2 seconds

    lastTypingSentRef.current = now;
    socket.emit('dm:typing', { conversationId: selectedConversation._id, isTyping: true });
  }, [selectedConversation, socket]);

  // Update presence
  const updatePresence = useCallback(
    (status: PresenceStatus) => {
      socket?.emit('presence:update', { status });
    },
    [socket]
  );

  // Mark conversation as read
  const markConversationAsRead = useCallback(
    async (conversationId: string) => {
      const token = getToken();
      if (!token) return;

      // Find the conversation
      const conversation = conversations.find((c) => c._id === conversationId);
      if (!conversation || conversation.unreadCount === 0) return;

      try {
        await fetch(`${getSocketUrl()}/api/conversations/${conversationId}/read`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        // Update local state
        setConversations((prev) =>
          prev.map((c) => (c._id === conversationId ? { ...c, unreadCount: 0 } : c))
        );
      } catch (error) {
        console.error('[DMContext] Error marking conversation as read:', error);
      }
    },
    [getToken, conversations]
  );

  // Calculate total unread count
  const totalUnreadCount = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

  const value: DMContextType = {
    socket,
    isConnected,
    connectionError,
    conversations,
    selectedConversation,
    isLoadingConversations,
    selectConversation,
    createConversation,
    refreshConversations,
    messages,
    isLoadingMessages,
    hasMoreMessages,
    sendMessage,
    loadMoreMessages,
    uploadAttachment,
    onlineUsers,
    isLoadingUsers,
    refreshOnlineUsers,
    typingUsers,
    sendTyping,
    updatePresence,
    totalUnreadCount,
    markConversationAsRead,
  };

  return <DMContext.Provider value={value}>{children}</DMContext.Provider>;
};

export const useDM = (): DMContextType => {
  const context = useContext(DMContext);
  if (context === undefined) {
    throw new Error('useDM must be used within a DMProvider');
  }
  return context;
};
