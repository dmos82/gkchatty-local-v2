/**
 * Hook to detect and use Electron APIs
 * Works in both browser and Electron environments
 */

import { useCallback, useEffect, useState } from 'react';

// Type definitions for the Electron API exposed via preload
interface ElectronAPI {
  // Window Management
  openChatWindow: (options: ChatWindowOptions) => Promise<{ success: boolean; windowId?: string }>;
  closeChatWindow: (windowKey: string) => Promise<{ success: boolean; error?: string }>;
  focusChatWindow: (windowKey: string) => Promise<{ success: boolean; error?: string }>;
  getOpenChatWindows: () => Promise<string[]>;
  getWindowInfo: () => Promise<{ isMainWindow: boolean; bounds: { x: number; y: number; width: number; height: number }; id: number }>;

  // Notifications
  showNotification: (options: NotificationOptions) => Promise<{ success: boolean; error?: string }>;

  // Cross-Window Communication
  broadcast: (channel: string, data: unknown) => Promise<{ success: boolean }>;
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
  once: (channel: string, callback: (...args: unknown[]) => void) => void;

  // Platform Info
  isElectron: boolean;
  platform: 'darwin' | 'win32' | 'linux';

  // Window Actions
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
}

interface ChatWindowOptions {
  conversationId?: string | null;
  recipientId?: string;
  recipientUsername?: string;
  recipientIconUrl?: string | null;
  isGroup?: boolean;
  groupName?: string;
  participants?: string[];
}

interface NotificationOptions {
  title: string;
  body: string;
  onClick?: unknown;
}

// Get the electron API from window (exposed by preload.js)
function getElectronAPI(): ElectronAPI | null {
  if (typeof window !== 'undefined' && 'electronAPI' in window) {
    return (window as unknown as { electronAPI: ElectronAPI }).electronAPI;
  }
  return null;
}

/**
 * Hook to access Electron APIs
 * Returns null values/no-ops when running in browser
 */
export function useElectron() {
  const [isElectron, setIsElectron] = useState(false);
  const [platform, setPlatform] = useState<'darwin' | 'win32' | 'linux' | null>(null);

  useEffect(() => {
    const api = getElectronAPI();
    if (api) {
      setIsElectron(true);
      setPlatform(api.platform);
    }
  }, []);

  /**
   * Open a chat in a native Electron window
   * Falls back to browser window.open() in non-Electron environments
   */
  const openChatWindow = useCallback(async (options: ChatWindowOptions) => {
    const api = getElectronAPI();

    if (api) {
      // Use native Electron window
      return api.openChatWindow(options);
    } else {
      // Fallback to browser popup
      const params = new URLSearchParams({
        conversationId: options.conversationId || '',
        recipientId: options.recipientId || '',
        recipientUsername: options.recipientUsername || '',
        ...(options.recipientIconUrl && { recipientIconUrl: options.recipientIconUrl }),
        isGroup: String(options.isGroup || false),
        ...(options.groupName && { groupName: options.groupName }),
        ...(options.participants?.length && { participants: options.participants.join(',') }),
      });

      window.open(
        `/im/chat?${params.toString()}`,
        `chat-${options.conversationId || options.recipientId}`,
        'popup=yes,width=400,height=600,top=100,left=100,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes'
      );

      return { success: true, windowId: options.conversationId || options.recipientId };
    }
  }, []);

  /**
   * Open buddy list in a native window
   */
  const openBuddyListWindow = useCallback(async () => {
    const api = getElectronAPI();

    if (api) {
      // For Electron, we'd need to add this to main.js if needed
      // For now, use browser fallback approach
    }

    window.open(
      '/im/buddylist',
      'buddylist',
      'popup=yes,width=350,height=600,top=100,left=150,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes'
    );

    return { success: true };
  }, []);

  /**
   * Show a native desktop notification
   */
  const showNotification = useCallback(async (options: NotificationOptions) => {
    const api = getElectronAPI();

    if (api) {
      return api.showNotification(options);
    } else {
      // Browser fallback - use Web Notifications API
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(options.title, { body: options.body });
        return { success: true };
      } else if ('Notification' in window && Notification.permission !== 'denied') {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          new Notification(options.title, { body: options.body });
          return { success: true };
        }
      }
      return { success: false, error: 'Notifications not available' };
    }
  }, []);

  /**
   * Broadcast a message to all windows
   */
  const broadcast = useCallback(async (channel: string, data: unknown) => {
    const api = getElectronAPI();
    if (api) {
      return api.broadcast(channel, data);
    }
    // No browser equivalent for cross-window broadcast
    return { success: false };
  }, []);

  /**
   * Listen for messages from other windows
   */
  const on = useCallback((channel: string, callback: (...args: unknown[]) => void) => {
    const api = getElectronAPI();
    if (api) {
      return api.on(channel, callback);
    }
    // Return no-op unsubscribe
    return () => {};
  }, []);

  /**
   * Get info about current window
   */
  const getWindowInfo = useCallback(async () => {
    const api = getElectronAPI();
    if (api) {
      return api.getWindowInfo();
    }
    return { isMainWindow: true, bounds: { x: 0, y: 0, width: 0, height: 0 }, id: 0 };
  }, []);

  return {
    isElectron,
    platform,
    openChatWindow,
    openBuddyListWindow,
    showNotification,
    broadcast,
    on,
    getWindowInfo,

    // Direct API access for advanced usage
    api: getElectronAPI(),
  };
}

// Type augmentation for window.electronAPI
declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export default useElectron;
