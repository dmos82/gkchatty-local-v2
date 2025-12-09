const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, Notification, shell } = require('electron');
const path = require('path');
const Store = require('electron-store');

// Initialize persistent storage for window states
const store = new Store({
  defaults: {
    mainWindowBounds: { width: 1400, height: 900 },
    chatWindows: {}
  }
});

// Keep references to windows to prevent garbage collection
let mainWindow = null;
let tray = null;
const chatWindows = new Map();

// Configuration
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:4003';
const isDev = process.env.NODE_ENV === 'development';

/**
 * Create the main application window
 */
function createMainWindow() {
  const bounds = store.get('mainWindowBounds');

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    minWidth: 800,
    minHeight: 600,
    x: bounds.x,
    y: bounds.y,
    title: 'GKChatty',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    },
    // Modern look
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
    backgroundColor: '#1a1a1a',
    show: false // Show after ready-to-show
  });

  // Load the Next.js frontend
  mainWindow.loadURL(FRONTEND_URL);

  // Show window when ready (prevents white flash)
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) {
      mainWindow.webContents.openDevTools();
    }
  });

  // Save window bounds on close
  mainWindow.on('close', () => {
    store.set('mainWindowBounds', mainWindow.getBounds());
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  return mainWindow;
}

/**
 * Create a pop-out chat window
 */
function createChatWindow(options) {
  const { conversationId, recipientId, recipientUsername, isGroup, groupName, participants } = options;

  // Check if window already exists
  const windowKey = conversationId || recipientId;
  if (chatWindows.has(windowKey)) {
    const existingWindow = chatWindows.get(windowKey);
    existingWindow.focus();
    return existingWindow;
  }

  // Get saved position or default
  const savedBounds = store.get(`chatWindows.${windowKey}`) || {
    width: 400,
    height: 600,
    x: 100 + (chatWindows.size * 30),
    y: 100 + (chatWindows.size * 30)
  };

  const chatWindow = new BrowserWindow({
    width: savedBounds.width,
    height: savedBounds.height,
    x: savedBounds.x,
    y: savedBounds.y,
    minWidth: 300,
    minHeight: 400,
    title: isGroup ? groupName : recipientUsername,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    // Frameless with custom title bar for cleaner look
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1a1a',
    show: false
  });

  // Build URL with parameters
  const params = new URLSearchParams({
    conversationId: conversationId || '',
    recipientId: recipientId || '',
    recipientUsername: recipientUsername || '',
    isGroup: String(isGroup || false),
    groupName: groupName || '',
    participants: participants?.join(',') || ''
  });

  chatWindow.loadURL(`${FRONTEND_URL}/im/chat?${params.toString()}`);

  chatWindow.once('ready-to-show', () => {
    chatWindow.show();
  });

  // Save position when moved/resized
  chatWindow.on('close', () => {
    store.set(`chatWindows.${windowKey}`, chatWindow.getBounds());
  });

  chatWindow.on('closed', () => {
    chatWindows.delete(windowKey);
    // Notify main window that chat was closed
    if (mainWindow) {
      mainWindow.webContents.send('chat-window-closed', windowKey);
    }
  });

  chatWindows.set(windowKey, chatWindow);
  return chatWindow;
}

/**
 * Create system tray
 */
function createTray() {
  // Create tray icon (you'd replace this with actual icon)
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  );

  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open GKChatty',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createMainWindow();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      }
    }
  ]);

  tray.setToolTip('GKChatty');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
      }
    } else {
      createMainWindow();
    }
  });
}

/**
 * IPC Handlers - Communication between renderer and main process
 */
function setupIPC() {
  // Open chat in new window
  ipcMain.handle('open-chat-window', async (event, options) => {
    const chatWindow = createChatWindow(options);
    return { success: true, windowId: options.conversationId || options.recipientId };
  });

  // Close chat window
  ipcMain.handle('close-chat-window', async (event, windowKey) => {
    if (chatWindows.has(windowKey)) {
      chatWindows.get(windowKey).close();
      return { success: true };
    }
    return { success: false, error: 'Window not found' };
  });

  // Focus chat window
  ipcMain.handle('focus-chat-window', async (event, windowKey) => {
    if (chatWindows.has(windowKey)) {
      chatWindows.get(windowKey).focus();
      return { success: true };
    }
    return { success: false, error: 'Window not found' };
  });

  // Get list of open chat windows
  ipcMain.handle('get-open-chat-windows', async () => {
    return Array.from(chatWindows.keys());
  });

  // Show native notification
  ipcMain.handle('show-notification', async (event, { title, body, onClick }) => {
    if (Notification.isSupported()) {
      const notification = new Notification({
        title,
        body,
        icon: path.join(__dirname, 'assets', 'icon.png')
      });

      notification.on('click', () => {
        // Bring app to front
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
        // Send click event back to renderer
        event.sender.send('notification-clicked', onClick);
      });

      notification.show();
      return { success: true };
    }
    return { success: false, error: 'Notifications not supported' };
  });

  // Broadcast message to all windows (for real-time sync)
  ipcMain.handle('broadcast-to-windows', async (event, channel, data) => {
    // Send to main window
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, data);
    }
    // Send to all chat windows
    chatWindows.forEach((window) => {
      if (!window.isDestroyed()) {
        window.webContents.send(channel, data);
      }
    });
    return { success: true };
  });

  // Get window info
  ipcMain.handle('get-window-info', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    return {
      isMainWindow: window === mainWindow,
      bounds: window.getBounds(),
      id: window.id
    };
  });

  // Window control handlers
  ipcMain.handle('window-minimize', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) window.minimize();
  });

  ipcMain.handle('window-maximize', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) {
      if (window.isMaximized()) {
        window.unmaximize();
      } else {
        window.maximize();
      }
    }
  });

  ipcMain.handle('window-close', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) window.close();
  });
}

/**
 * App lifecycle events
 */
app.whenReady().then(() => {
  createMainWindow();
  createTray();
  setupIPC();

  app.on('activate', () => {
    // macOS: Re-create window when dock icon clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // macOS: Keep app running in tray
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle certificate errors in development
if (isDev) {
  app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
    if (url.startsWith('https://localhost') || url.startsWith('https://192.168')) {
      event.preventDefault();
      callback(true);
    } else {
      callback(false);
    }
  });
}

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Focus main window if another instance tries to start
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}
