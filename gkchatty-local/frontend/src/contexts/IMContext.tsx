'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { UserPresence, Conversation } from './DMContext';

interface ChatWindow {
  id: string;
  recipientId: string;
  recipientUsername: string;
  recipientIconUrl?: string | null;
  conversationId: string | null; // null if conversation not yet created
  isMinimized: boolean;
  position: { x: number; y: number };
  zIndex: number;
}

interface IMContextType {
  // Buddy list state
  isBuddyListOpen: boolean;
  toggleBuddyList: () => void;
  openBuddyList: () => void;
  closeBuddyList: () => void;

  // Chat windows
  chatWindows: ChatWindow[];
  openChatWindow: (user: UserPresence, conversationId?: string | null) => void;
  closeChatWindow: (windowId: string) => void;
  minimizeChatWindow: (windowId: string) => void;
  restoreChatWindow: (windowId: string) => void;
  bringToFront: (windowId: string) => void;
  updateWindowPosition: (windowId: string, position: { x: number; y: number }) => void;
  setConversationId: (windowId: string, conversationId: string) => void;

  // Utility
  getNextZIndex: () => number;
  hasOpenWindow: (recipientId: string) => boolean;
}

const IMContext = createContext<IMContextType | undefined>(undefined);

interface IMProviderProps {
  children: ReactNode;
}

const WINDOW_OFFSET = 30; // Offset for cascading windows
const BASE_Z_INDEX = 100;

const CHAT_WINDOWS_STORAGE_KEY = 'im-chat-windows';
const WINDOW_WIDTH = 320;
const WINDOW_HEIGHT = 420;

export const IMProvider: React.FC<IMProviderProps> = ({ children }) => {
  const [isBuddyListOpen, setIsBuddyListOpen] = useState(false);
  const [chatWindows, setChatWindows] = useState<ChatWindow[]>([]);
  const [highestZIndex, setHighestZIndex] = useState(BASE_Z_INDEX);
  const [isInitialized, setIsInitialized] = useState(false);

  // Load chat windows from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(CHAT_WINDOWS_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as ChatWindow[];
          // Ensure windows are within viewport bounds
          const viewportWidth = window.innerWidth;
          const viewportHeight = window.innerHeight;
          const adjusted = parsed.map((w) => ({
            ...w,
            position: {
              x: Math.min(Math.max(0, w.position.x), viewportWidth - WINDOW_WIDTH),
              y: Math.min(Math.max(0, w.position.y), viewportHeight - WINDOW_HEIGHT),
            },
          }));
          setChatWindows(adjusted);
          // Find highest z-index
          const maxZ = adjusted.reduce((max, w) => Math.max(max, w.zIndex), BASE_Z_INDEX);
          setHighestZIndex(maxZ);
        }
      } catch (e) {
        console.error('[IMContext] Error loading chat windows:', e);
      }
      setIsInitialized(true);
    }
  }, []);

  // Save chat windows to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== 'undefined' && isInitialized) {
      try {
        localStorage.setItem(CHAT_WINDOWS_STORAGE_KEY, JSON.stringify(chatWindows));
      } catch (e) {
        console.error('[IMContext] Error saving chat windows:', e);
      }
    }
  }, [chatWindows, isInitialized]);

  // Handle window resize - keep chat windows within viewport
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      setChatWindows((prev) =>
        prev.map((w) => {
          const newX = Math.min(Math.max(0, w.position.x), viewportWidth - WINDOW_WIDTH);
          const newY = Math.min(Math.max(0, w.position.y), viewportHeight - WINDOW_HEIGHT);

          // Only update if position actually changed
          if (newX !== w.position.x || newY !== w.position.y) {
            return { ...w, position: { x: newX, y: newY } };
          }
          return w;
        })
      );
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Buddy list controls
  const toggleBuddyList = useCallback(() => {
    setIsBuddyListOpen((prev) => !prev);
  }, []);

  const openBuddyList = useCallback(() => {
    setIsBuddyListOpen(true);
  }, []);

  const closeBuddyList = useCallback(() => {
    setIsBuddyListOpen(false);
  }, []);

  // Get next z-index for new windows
  const getNextZIndex = useCallback(() => {
    const next = highestZIndex + 1;
    setHighestZIndex(next);
    return next;
  }, [highestZIndex]);

  // Check if window already exists for a recipient
  const hasOpenWindow = useCallback(
    (recipientId: string) => {
      return chatWindows.some((w) => w.recipientId === recipientId);
    },
    [chatWindows]
  );

  // Open a new chat window
  const openChatWindow = useCallback(
    (user: UserPresence, conversationId: string | null = null) => {
      // Check if window already exists
      const existingWindow = chatWindows.find((w) => w.recipientId === user._id);
      if (existingWindow) {
        // Bring existing window to front and restore if minimized
        setChatWindows((prev) =>
          prev.map((w) =>
            w.id === existingWindow.id
              ? { ...w, isMinimized: false, zIndex: getNextZIndex() }
              : w
          )
        );
        return;
      }

      // Calculate position with cascade effect
      const windowCount = chatWindows.length;
      const baseX = typeof window !== 'undefined' ? window.innerWidth - 380 : 800;
      const baseY = typeof window !== 'undefined' ? window.innerHeight - 500 : 300;

      const newWindow: ChatWindow = {
        id: `chat-${user._id}-${Date.now()}`,
        recipientId: user._id,
        recipientUsername: user.username,
        recipientIconUrl: user.iconUrl,
        conversationId,
        isMinimized: false,
        position: {
          x: Math.max(100, baseX - (windowCount % 5) * WINDOW_OFFSET),
          y: Math.max(100, baseY - (windowCount % 5) * WINDOW_OFFSET),
        },
        zIndex: getNextZIndex(),
      };

      setChatWindows((prev) => [...prev, newWindow]);
    },
    [chatWindows, getNextZIndex]
  );

  // Close a chat window
  const closeChatWindow = useCallback((windowId: string) => {
    setChatWindows((prev) => prev.filter((w) => w.id !== windowId));
  }, []);

  // Minimize a chat window
  const minimizeChatWindow = useCallback((windowId: string) => {
    setChatWindows((prev) =>
      prev.map((w) => (w.id === windowId ? { ...w, isMinimized: true } : w))
    );
  }, []);

  // Restore a minimized window
  const restoreChatWindow = useCallback(
    (windowId: string) => {
      setChatWindows((prev) =>
        prev.map((w) =>
          w.id === windowId ? { ...w, isMinimized: false, zIndex: getNextZIndex() } : w
        )
      );
    },
    [getNextZIndex]
  );

  // Bring window to front
  const bringToFront = useCallback(
    (windowId: string) => {
      setChatWindows((prev) =>
        prev.map((w) => (w.id === windowId ? { ...w, zIndex: getNextZIndex() } : w))
      );
    },
    [getNextZIndex]
  );

  // Update window position (for dragging) - constrain to viewport
  const updateWindowPosition = useCallback(
    (windowId: string, position: { x: number; y: number }) => {
      const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
      const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;

      const constrainedPosition = {
        x: Math.min(Math.max(0, position.x), viewportWidth - WINDOW_WIDTH),
        y: Math.min(Math.max(0, position.y), viewportHeight - WINDOW_HEIGHT),
      };

      setChatWindows((prev) =>
        prev.map((w) => (w.id === windowId ? { ...w, position: constrainedPosition } : w))
      );
    },
    []
  );

  // Set conversation ID after creating conversation
  const setConversationId = useCallback(
    (windowId: string, conversationId: string) => {
      setChatWindows((prev) =>
        prev.map((w) => (w.id === windowId ? { ...w, conversationId } : w))
      );
    },
    []
  );

  const value: IMContextType = {
    isBuddyListOpen,
    toggleBuddyList,
    openBuddyList,
    closeBuddyList,
    chatWindows,
    openChatWindow,
    closeChatWindow,
    minimizeChatWindow,
    restoreChatWindow,
    bringToFront,
    updateWindowPosition,
    setConversationId,
    getNextZIndex,
    hasOpenWindow,
  };

  return <IMContext.Provider value={value}>{children}</IMContext.Provider>;
};

export const useIM = (): IMContextType => {
  const context = useContext(IMContext);
  if (context === undefined) {
    throw new Error('useIM must be used within an IMProvider');
  }
  return context;
};
