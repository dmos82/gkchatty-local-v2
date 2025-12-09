/**
 * Preload script - Secure bridge between renderer and main process
 * This exposes only specific, safe APIs to the web content
 */
const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // ============================================
  // Window Management
  // ============================================

  /**
   * Open a chat in a new native window
   * @param {Object} options - Chat window options
   * @param {string} options.conversationId - Conversation ID
   * @param {string} options.recipientId - Recipient user ID
   * @param {string} options.recipientUsername - Recipient username
   * @param {string} options.recipientIconUrl - Recipient avatar URL
   * @param {boolean} options.isGroup - Is this a group chat
   * @param {string} options.groupName - Group name (if group)
   * @param {string[]} options.participants - Participant usernames (if group)
   */
  openChatWindow: (options) => ipcRenderer.invoke('open-chat-window', options),

  /**
   * Close a chat window
   * @param {string} windowKey - The conversation/recipient ID
   */
  closeChatWindow: (windowKey) => ipcRenderer.invoke('close-chat-window', windowKey),

  /**
   * Focus an existing chat window
   * @param {string} windowKey - The conversation/recipient ID
   */
  focusChatWindow: (windowKey) => ipcRenderer.invoke('focus-chat-window', windowKey),

  /**
   * Get list of open chat window IDs
   */
  getOpenChatWindows: () => ipcRenderer.invoke('get-open-chat-windows'),

  /**
   * Get info about current window
   */
  getWindowInfo: () => ipcRenderer.invoke('get-window-info'),

  // ============================================
  // Notifications
  // ============================================

  /**
   * Show a native desktop notification
   * @param {Object} options - Notification options
   * @param {string} options.title - Notification title
   * @param {string} options.body - Notification body text
   * @param {Object} options.onClick - Data to pass when notification clicked
   */
  showNotification: (options) => ipcRenderer.invoke('show-notification', options),

  // ============================================
  // Cross-Window Communication
  // ============================================

  /**
   * Broadcast a message to all windows
   * @param {string} channel - Channel name
   * @param {any} data - Data to send
   */
  broadcast: (channel, data) => ipcRenderer.invoke('broadcast-to-windows', channel, data),

  /**
   * Listen for messages from main process or other windows
   * @param {string} channel - Channel to listen on
   * @param {Function} callback - Callback function
   */
  on: (channel, callback) => {
    // Whitelist of allowed channels
    const validChannels = [
      'new-message',
      'typing-indicator',
      'presence-update',
      'chat-window-closed',
      'notification-clicked',
      'sync-state'
    ];

    if (validChannels.includes(channel)) {
      // Wrap callback to remove event parameter for security
      const wrappedCallback = (event, ...args) => callback(...args);
      ipcRenderer.on(channel, wrappedCallback);

      // Return unsubscribe function
      return () => ipcRenderer.removeListener(channel, wrappedCallback);
    }
    console.warn(`Attempted to listen on invalid channel: ${channel}`);
    return () => {};
  },

  /**
   * One-time listener for messages
   * @param {string} channel - Channel to listen on
   * @param {Function} callback - Callback function
   */
  once: (channel, callback) => {
    const validChannels = [
      'new-message',
      'typing-indicator',
      'presence-update',
      'chat-window-closed',
      'notification-clicked',
      'sync-state'
    ];

    if (validChannels.includes(channel)) {
      ipcRenderer.once(channel, (event, ...args) => callback(...args));
    }
  },

  // ============================================
  // Platform Info
  // ============================================

  /**
   * Check if running in Electron
   */
  isElectron: true,

  /**
   * Get platform info
   */
  platform: process.platform,

  // ============================================
  // App Actions (via IPC for security)
  // ============================================

  /**
   * Minimize current window
   */
  minimizeWindow: () => ipcRenderer.invoke('window-minimize'),

  /**
   * Maximize/restore current window
   */
  maximizeWindow: () => ipcRenderer.invoke('window-maximize'),

  /**
   * Close current window
   */
  closeWindow: () => ipcRenderer.invoke('window-close')
});

// Log when preload is executed
console.log('[GKChatty Desktop] Preload script loaded');
console.log('[GKChatty Desktop] Platform:', process.platform);
