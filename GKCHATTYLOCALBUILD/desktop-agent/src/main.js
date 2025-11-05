/**
 * GKChatty Desktop Agent
 *
 * Main entry point for the Electron desktop application.
 * Provides:
 * - System tray interface
 * - Local MCP server (maintains compatibility with all existing MCPs)
 * - Backend API server
 * - Local embedding with Transformers.js + MPS
 */

const { app, BrowserWindow, Menu, Tray, nativeImage } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

// Import our services
const { MCPServer } = require('./services/mcpServer');
const { BackendServer } = require('./services/backendServer');
const { EmbeddingService } = require('./services/embeddingService');
const { StorageService } = require('./services/storageService');

let tray = null;
let mainWindow = null;
let mcpServer = null;
let backendServer = null;
let embeddingService = null;
let storageService = null;

// Keep track of spawned MCP processes
const mcpProcesses = new Map();

/**
 * Initialize all services
 */
async function initializeServices() {
  console.log('🚀 Initializing GKChatty Desktop Agent...');

  // Initialize storage (SQLite + LanceDB)
  storageService = new StorageService({
    dbPath: path.join(app.getPath('userData'), 'gkchatty.db'),
    lancedbPath: path.join(app.getPath('userData'), 'vectors')
  });
  await storageService.initialize();

  // Initialize embedding service with MPS support
  embeddingService = new EmbeddingService({
    device: 'mps', // Use Metal Performance Shaders on M2 Mac
    modelPath: path.join(app.getPath('home'), '.cache/huggingface/hub')
  });
  await embeddingService.initialize();

  // Start backend API server (maintains compatibility with existing frontend)
  backendServer = new BackendServer({
    port: 6001, // GKChatty Local uses 6001 (original GKChatty uses 6001)
    storageService,
    embeddingService
  });
  await backendServer.start();

  // Start MCP server (maintains all existing MCP connections)
  mcpServer = new MCPServer({
    port: 7860, // New local MCP port
    backendUrl: 'http://localhost:6001'
  });
  await mcpServer.start();

  // Start existing MCP servers as child processes
  await startExistingMCPServers();

  console.log('✅ All services initialized successfully');
}

/**
 * Start existing MCP servers to maintain compatibility
 */
async function startExistingMCPServers() {
  const mcpConfigs = [
    {
      name: 'gkchatty-mcp',
      command: 'node',
      args: ['/Users/davidjmorin/GOLDKEY CHATTY/mcp/gkchatty-mcp/index.js'],
      env: {
        GKCHATTY_API_URL: 'http://localhost:6001', // Point to our local backend
        GKCHATTY_ADMIN_USERNAME: 'dev',
        GKCHATTY_ADMIN_PASSWORD: 'dev123'
      }
    },
    {
      name: 'builder-pro-mcp',
      command: 'node',
      args: ['/Users/davidjmorin/GOLDKEY CHATTY/mcp/builder-pro-mcp/server.js']
    },
    {
      name: 'ai-bridge',
      command: 'node',
      args: ['/Users/davidjmorin/GOLDKEY CHATTY/mcp/ai-bridge-mcp/server.js'],
      env: {
        AI_BRIDGE_URL: 'http://127.0.0.1:17865',
        AI_BRIDGE_TIMEOUT: '30000'
      }
    }
  ];

  for (const config of mcpConfigs) {
    try {
      const proc = spawn(config.command, config.args, {
        env: { ...process.env, ...config.env }
      });

      proc.stdout.on('data', (data) => {
        console.log(`[${config.name}] ${data}`);
      });

      proc.stderr.on('data', (data) => {
        console.error(`[${config.name}] ${data}`);
      });

      mcpProcesses.set(config.name, proc);
      console.log(`✅ Started ${config.name}`);
    } catch (error) {
      console.error(`❌ Failed to start ${config.name}:`, error);
    }
  }
}

/**
 * Create system tray
 */
function createTray() {
  const icon = nativeImage.createFromPath(
    path.join(__dirname, '../assets/icon.png')
  );

  tray = new Tray(icon);

  updateTrayMenu();

  tray.setToolTip('GKChatty Local - Running');
}

/**
 * Update tray menu with current status
 */
function updateTrayMenu() {
  const storageInfo = storageService ? storageService.getInfo() : {};
  const embeddingInfo = embeddingService ? embeddingService.getInfo() : {};

  const contextMenu = Menu.buildFromTemplate([
    {
      label: `GKChatty Local ${storageInfo.mode === 'local' ? '✅' : '☁️'}`,
      enabled: false
    },
    { type: 'separator' },
    {
      label: `Storage: ${storageInfo.mode || 'Initializing...'}`,
      enabled: false
    },
    {
      label: `Documents: ${storageInfo.documentCount || 0}`,
      enabled: false
    },
    {
      label: `Embedding: ${embeddingInfo.provider || 'Initializing...'}`,
      enabled: false
    },
    {
      label: `MPS: ${embeddingInfo.mpsEnabled ? '✅ Enabled' : '❌ Disabled'}`,
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Open Dashboard',
      click: () => {
        if (!mainWindow) {
          createWindow();
        } else {
          mainWindow.show();
        }
      }
    },
    {
      label: 'Switch to Cloud Mode',
      click: async () => {
        await switchStorageMode('cloud');
      }
    },
    { type: 'separator' },
    {
      label: 'MCP Servers',
      submenu: [
        {
          label: `gkchatty-mcp: ${mcpProcesses.has('gkchatty-mcp') ? '✅' : '❌'}`,
          enabled: false
        },
        {
          label: `builder-pro: ${mcpProcesses.has('builder-pro-mcp') ? '✅' : '❌'}`,
          enabled: false
        },
        {
          label: `ai-bridge: ${mcpProcesses.has('ai-bridge') ? '✅' : '❌'}`,
          enabled: false
        }
      ]
    },
    { type: 'separator' },
    {
      label: 'Settings',
      click: () => {
        // Open settings window
      }
    },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
}

/**
 * Create main window (dashboard)
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: nativeImage.createFromPath(
      path.join(__dirname, '../assets/icon.png')
    )
  });

  // Load the frontend (using the copied Next.js app)
  mainWindow.loadURL('http://localhost:6004');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Hide instead of close
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

/**
 * Switch between local and cloud storage modes
 */
async function switchStorageMode(mode) {
  console.log(`Switching to ${mode} mode...`);

  // Update storage service
  await storageService.switchMode(mode);

  // Update tray menu
  updateTrayMenu();

  // Notify user
  const { dialog } = require('electron');
  dialog.showMessageBox({
    type: 'info',
    title: 'Storage Mode Changed',
    message: `Switched to ${mode} mode successfully.`,
    buttons: ['OK']
  });
}

/**
 * App event handlers
 */
app.whenReady().then(async () => {
  // Initialize all services
  await initializeServices();

  // Create system tray
  createTray();

  // Don't show dock icon on macOS
  if (process.platform === 'darwin') {
    app.dock.hide();
  }

  // Update tray menu periodically
  setInterval(() => {
    updateTrayMenu();
  }, 5000);
});

app.on('before-quit', () => {
  app.isQuitting = true;

  // Clean up MCP processes
  for (const [name, proc] of mcpProcesses) {
    console.log(`Stopping ${name}...`);
    proc.kill();
  }

  // Clean up services
  if (mcpServer) mcpServer.stop();
  if (backendServer) backendServer.stop();
  if (embeddingService && typeof embeddingService.cleanup === 'function') embeddingService.cleanup();
  if (storageService && typeof storageService.cleanup === 'function') storageService.cleanup();
});

app.on('window-all-closed', (event) => {
  // Prevent app from quitting when all windows are closed
  event.preventDefault();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});