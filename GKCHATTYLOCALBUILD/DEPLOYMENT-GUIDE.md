# GKChatty Local - Deployment Guide

**Version:** 1.0.0
**Date:** 2025-11-03
**Target Platform:** macOS (Apple Silicon M1/M2/M3)

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [Configuration](#configuration)
4. [Running the Application](#running-the-application)
5. [Testing](#testing)
6. [Troubleshooting](#troubleshooting)
7. [Architecture](#architecture)

---

## Prerequisites

### Required Software

- **Node.js:** v18.14.0 or higher
- **npm:** v8.0.0 or higher
- **Python:** 3.8+ (for HuggingFace CLI)
- **macOS:** 12.0+ (for MPS support)
- **Apple Silicon:** M1/M2/M3 Mac (recommended for MPS acceleration)

### System Requirements

- **RAM:** 8GB minimum, 16GB+ recommended
- **Disk Space:** 10GB free (5GB for models, 5GB for data)
- **Ports:** 6001 (backend), 3000 (frontend), 7860 (MCP server)

---

## Installation

### Step 1: Install Dependencies

```bash
cd GKCHATTYLOCALBUILD/backend
npm install --legacy-peer-deps

cd ../desktop-agent
npm install --legacy-peer-deps

cd ../frontend
npm install --legacy-peer-deps
```

### Step 2: Download Embedding Model

The application requires a local embedding model. We recommend `nomic-embed-text-v1.5`:

```bash
# Install HuggingFace CLI
pip install huggingface-hub

# Download the model (this may take 5-10 minutes)
huggingface-cli download nomic-ai/nomic-embed-text-v1.5
```

The model will be cached at: `~/.cache/huggingface/hub/`

### Step 3: Verify MPS Detection

Check that your Mac supports Metal Performance Shaders:

```bash
sysctl -n machdep.cpu.brand_string
```

Expected output: `Apple M1`, `Apple M2`, or `Apple M3`

---

## Configuration

### Backend Configuration

1. Copy the example environment file:
```bash
cd backend
cp .env.local .env
```

2. Generate secure keys:
```bash
# Generate JWT secret
openssl rand -base64 32

# Generate encryption key (64 hex characters)
openssl rand -hex 32
```

3. Update `.env` with your keys:
```env
JWT_SECRET=<your-generated-jwt-secret>
ENCRYPTION_KEY=<your-generated-encryption-key>
```

### Desktop Agent Configuration

The desktop agent uses default configuration. No changes needed.

### Data Directory

The application will automatically create:
```
~/.gkchatty/
├── data/
│   ├── gkchatty.db          # SQLite database
│   ├── chroma/              # Vector storage
│   ├── documents/           # Uploaded documents
│   └── uploads/             # Temporary uploads
```

---

## Running the Application

### Option 1: Desktop Agent (Recommended)

The desktop agent automatically starts all services:

```bash
cd desktop-agent
npm start
```

**What happens:**
1. Electron app launches
2. System tray icon appears
3. Backend API starts (port 6001)
4. MCP server starts (port 7860)
5. All existing MCP servers spawn

### Option 2: Manual (Development)

Start each component separately:

```bash
# Terminal 1: Backend
cd backend
npm run dev

# Terminal 2: Frontend (optional)
cd frontend
npm run dev

# Terminal 3: Desktop Agent
cd desktop-agent
npm start
```

---

## Testing

### Test 1: MPS Detection

```bash
cd desktop-agent
node test-embedding-service.js
```

**Expected output:**
```
✅ Apple Silicon detected - MPS acceleration enabled
✅ Detected device: mps
   Expected performance: 50-100ms per embedding
```

### Test 2: Storage Service

```bash
cd desktop-agent
node test-storage-service.js
```

**Expected output:**
```
✅ SQLite database initialized
✅ Database tables created
✅ Created default user
   Health: ✅ HEALTHY
```

### Test 3: SQLite Adapter

```bash
cd backend
npx ts-node test-sqlite-adapter.ts
```

**Expected output:**
```
✅ All tests passed!
  - User CRUD operations: ✅
  - Document CRUD operations: ✅
  - Mongoose-compatible API: ✅
```

### Test 4: End-to-End (Manual)

1. **Start the desktop agent:**
   ```bash
   cd desktop-agent && npm start
   ```

2. **Verify system tray icon appears** (top-right of screen)

3. **Test MCP tools from Claude Code:**
   - Open Claude Code
   - Try: "query_gkchatty"
   - Try: "upload_to_gkchatty"

---

## Troubleshooting

### Issue: "No embedding models found"

**Solution:** Download the embedding model:
```bash
huggingface-cli download nomic-ai/nomic-embed-text-v1.5
```

### Issue: "Port 6001 already in use"

**Solution:** Kill the process using port 6001:
```bash
lsof -ti:6001 | xargs kill -9
```

### Issue: "MPS not detected"

**Check:** Your Mac model:
```bash
sysctl -n machdep.cpu.brand_string
```

If not Apple Silicon, MPS won't be available. The app will fall back to CPU mode (slower).

### Issue: "Cannot connect to backend"

**Check:** Backend is running:
```bash
curl http://localhost:6001/health
```

Expected: `{"status":"ok"}`

### Issue: "Database locked"

**Solution:** Close all processes and restart:
```bash
# Kill all node processes
pkill -9 node

# Restart desktop agent
cd desktop-agent && npm start
```

### Issue: "Permission denied" for ~/.gkchatty/data

**Solution:** Create directory with correct permissions:
```bash
mkdir -p ~/.gkchatty/data
chmod 755 ~/.gkchatty/data
```

---

## Architecture

### Component Overview

```
┌─────────────────────────────────────┐
│   Desktop Agent (Electron)          │
│   System Tray + Service Manager     │
└────────────┬────────────────────────┘
             │
┌────────────▼────────────────────────┐
│   MCP Server (localhost:7860)       │
│   6 Tools: query, upload, etc.      │
└────────────┬────────────────────────┘
             │
┌────────────▼────────────────────────┐
│   Backend API (localhost:6001)      │
│   Express + SQLite + Transformers   │
└────────────┬────────────────────────┘
             │
      ┌──────┴──────┐
      │             │
┌─────▼─────┐ ┌────▼────┐
│ SQLite    │ │ ChromaDB│
│ gkchatty  │ │ vectors │
│ .db       │ │         │
└───────────┘ └─────────┘
```

### Data Flow

1. **User uploads document** via Claude Code MCP tool
2. **MCP server** receives request, proxies to backend API
3. **Backend API** saves file to `~/.gkchatty/data/documents/`
4. **Transformers.js** generates embeddings (50-100ms with MPS)
5. **ChromaDB** stores vectors locally
6. **SQLite** stores metadata (filename, path, user, etc.)

### Storage Comparison

| Feature | Cloud (Original) | Local (This Build) |
|---------|-----------------|-------------------|
| Database | MongoDB Atlas | SQLite |
| Vectors | Pinecone | ChromaDB |
| Embeddings | OpenAI API | Transformers.js |
| Cost | $20-100/month | $0 |
| Speed | 200-500ms | 50-100ms (MPS) |
| Privacy | Cloud | 100% local |

---

## Performance Metrics

### Expected Performance (M2 Mac)

| Operation | Time |
|-----------|------|
| Single embedding | 50-100ms |
| Batch (10 texts) | 0.5-1 second |
| Document upload | < 0.1 second |
| RAG query | 100-200ms |
| App startup | < 2 seconds |

### Memory Usage

| Component | Memory |
|-----------|--------|
| Desktop agent | ~100MB |
| Backend API | ~200MB |
| Transformers.js model | ~2GB |
| **Total** | **~2.3GB** |

---

## MCP Tools Available

### 1. `query_gkchatty`
Query the local knowledge base using RAG.

**Parameters:**
- `query` (string): Search query
- `userId` (string, optional): User context

### 2. `upload_to_gkchatty`
Upload a document to the local knowledge base.

**Parameters:**
- `filePath` (string): Path to document
- `userId` (string, optional): User ID

### 3. `search_gkchatty`
Search documents by filename or content.

**Parameters:**
- `query` (string): Search query

### 4. `list_users`
List all users in the local database.

### 5. `switch_user`
Switch active user context.

**Parameters:**
- `username` (string): Username
- `password` (string): Password

### 6. `current_user`
Get the current active user.

---

## Security Considerations

### Local Security

- All data stored locally in `~/.gkchatty/data/`
- SQLite database encrypted at rest (macOS FileVault)
- JWT tokens for API authentication
- No data leaves the machine

### Recommended Practices

1. **Backup your data:**
   ```bash
   cp -r ~/.gkchatty/data ~/gkchatty-backup-$(date +%Y%m%d)
   ```

2. **Use strong JWT secret** (generated with openssl)

3. **Enable FileVault** on macOS for disk encryption

4. **Keep Node.js and npm updated** for security patches

---

## Maintenance

### Database Backup

```bash
# Backup SQLite database
cp ~/.gkchatty/data/gkchatty.db ~/gkchatty-backup.db

# Backup ChromaDB
cp -r ~/.gkchatty/data/chroma ~/chroma-backup
```

### Clearing Data

```bash
# Remove all data (caution!)
rm -rf ~/.gkchatty/data

# The app will recreate the directory on next startup
```

### Updating Dependencies

```bash
cd backend
npm update --legacy-peer-deps

cd ../desktop-agent
npm update --legacy-peer-deps
```

---

## Support

### Logs

Backend logs: Check terminal output or `backend/logs/`
Desktop agent logs: Check Electron DevTools console

### Common Commands

```bash
# Check if backend is running
curl http://localhost:6001/health

# Check if MCP server is running
lsof -i :7860

# View database
sqlite3 ~/.gkchatty/data/gkchatty.db ".tables"

# Check model cache
ls ~/.cache/huggingface/hub/
```

---

## Next Steps

1. **Download embedding model** (if not done)
2. **Generate security keys**
3. **Start desktop agent**
4. **Test MCP tools from Claude Code**
5. **Upload your first document**

---

**Questions?** Check `PROGRESS.md` and `TEST-RESULTS.md` for detailed implementation notes.

**Version:** 1.0.0 - Production Ready ✅
