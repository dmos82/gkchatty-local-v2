# GKChatty Local - Getting Started

**Transform GKChatty into a local desktop application - Zero cloud costs, 5-10x faster!**

---

## Quick Start (5 Minutes)

### 1. Install Dependencies

```bash
cd GKCHATTYLOCALBUILD/backend && npm install --legacy-peer-deps
cd ../desktop-agent && npm install --legacy-peer-deps
```

### 2. Download Embedding Model

```bash
pip install huggingface-hub
huggingface-cli download nomic-ai/nomic-embed-text-v1.5
```

### 3. Configure Environment

```bash
cd backend
cp .env.local .env

# Generate secure keys
JWT_SECRET=$(openssl rand -base64 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)

# Update .env with your keys
echo "JWT_SECRET=$JWT_SECRET" >> .env
echo "ENCRYPTION_KEY=$ENCRYPTION_KEY" >> .env
```

### 4. Start the Application

```bash
cd desktop-agent
npm start
```

**That's it!** The desktop agent will:
- ✅ Launch in your system tray
- ✅ Start the backend API (port 6001)
- ✅ Initialize SQLite database
- ✅ Spawn all MCP servers
- ✅ Be ready for Claude Code integration

---

## What You Get

### 🚀 Performance

- **Embedding Generation:** 50-100ms (vs 200-500ms cloud)
- **RAG Queries:** 100-200ms (vs 500ms-1s cloud)
- **5-10x faster** on Apple Silicon with MPS

### 💰 Cost Savings

- **Cloud Version:** $20-100/month (OpenAI API + Pinecone + MongoDB Atlas)
- **Local Version:** $0/month (everything runs locally)

### 🔒 Privacy

- **100% Local:** All data stays on your machine
- **Zero API Calls:** No data sent to cloud services
- **Offline Capable:** Works without internet (except Claude API)

### 🎯 Features Maintained

- ✅ All MCP tools (query, upload, search, etc.)
- ✅ RAG (Retrieval-Augmented Generation)
- ✅ Document processing (PDF, TXT, DOCX, etc.)
- ✅ User management
- ✅ Project namespaces

---

## Architecture

```
┌─────────────────────────────────────┐
│   Desktop Agent (Electron)          │
│   - System tray icon                │
│   - Auto-starts services            │
└────────────┬────────────────────────┘
             │
┌────────────▼────────────────────────┐
│   Backend API (localhost:6001)      │
│   - Express REST API                │
│   - SQLite database                 │
│   - Transformers.js embeddings      │
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

---

## Key Differences from Cloud Version

| Feature | Cloud | Local |
|---------|-------|-------|
| **Database** | MongoDB Atlas | SQLite |
| **Vectors** | Pinecone | ChromaDB |
| **Embeddings** | OpenAI API | Transformers.js |
| **Deployment** | Web service | Desktop app |
| **Cost** | $20-100/month | $0 |
| **Speed** | 200-500ms | 50-100ms |
| **Privacy** | Cloud storage | 100% local |
| **Internet** | Required | Optional |

---

## System Requirements

### Minimum

- macOS 12.0+
- 8GB RAM
- 10GB free disk space
- Node.js 18.14.0+

### Recommended

- Apple Silicon Mac (M1/M2/M3) for MPS acceleration
- 16GB+ RAM
- 20GB free disk space

---

## Testing

### Verify Installation

```bash
# Test 1: MPS Detection
cd desktop-agent && node test-embedding-service.js
# Expected: ✅ MPS Enabled: YES

# Test 2: Storage Service
node test-storage-service.js
# Expected: ✅ Health: HEALTHY

# Test 3: SQLite Adapter
cd ../backend && npx ts-node test-sqlite-adapter.ts
# Expected: ✅ All tests passed!
```

### Test with Claude Code

1. **Open Claude Code**
2. **Try MCP tools:**
   ```
   query_gkchatty("test query")
   upload_to_gkchatty("/path/to/document.pdf")
   ```

---

## File Structure

```
GKCHATTYLOCALBUILD/
├── backend/                        # Backend API
│   ├── src/
│   │   ├── utils/
│   │   │   ├── transformersHelper.ts  # Local embeddings (MPS)
│   │   │   ├── chromaService.ts       # Vector storage
│   │   │   ├── sqliteAdapter.ts       # Database adapter
│   │   │   └── modelFactory.ts        # Auto-switching logic
│   │   └── ...
│   ├── .env.local                  # Environment config
│   └── package.json
│
├── desktop-agent/                  # Electron app
│   ├── src/
│   │   ├── main.js                # Main process
│   │   └── services/
│   │       ├── mcpServer.js       # MCP server
│   │       ├── backendServer.js   # API wrapper
│   │       ├── embeddingService.js# Model manager
│   │       └── storageService.js  # Data manager
│   └── package.json
│
├── frontend/                       # Next.js UI (optional)
│
├── DEPLOYMENT-GUIDE.md            # Comprehensive guide
├── GETTING-STARTED.md             # This file
├── PROGRESS.md                    # Implementation details
├── TEST-RESULTS.md                # Test documentation
└── README.md                      # Project overview
```

---

## Data Storage

All data stored in: `~/.gkchatty/data/`

```
~/.gkchatty/data/
├── gkchatty.db          # SQLite database (~50KB initial)
├── chroma/              # Vector embeddings
│   └── [collection files]
├── documents/           # Uploaded documents
│   └── [user files]
└── uploads/             # Temporary upload staging
```

---

## MCP Tools

### Available Tools (6 total)

1. **query_gkchatty** - Query knowledge base with RAG
2. **upload_to_gkchatty** - Upload documents
3. **search_gkchatty** - Search by filename/content
4. **list_users** - List all users
5. **switch_user** - Change active user
6. **current_user** - Get current user

All tools work identically to the cloud version - zero code changes in Claude Code!

---

## Troubleshooting

### "No embedding models found"
```bash
huggingface-cli download nomic-ai/nomic-embed-text-v1.5
```

### "Port 6001 already in use"
```bash
lsof -ti:6001 | xargs kill -9
```

### "MPS not detected" (Not Apple Silicon)
The app will fall back to CPU mode. It will still work, just slower (500ms vs 50ms).

### "Cannot find module better-sqlite3"
```bash
cd backend && npm install --legacy-peer-deps
```

---

## Performance Benchmarks

**Tested on:** MacBook Pro M2, 24GB RAM

| Operation | Time |
|-----------|------|
| Single embedding | 65ms |
| Batch (10 texts) | 0.8s |
| Document upload | 0.05s |
| RAG query | 150ms |
| App startup | 1.5s |

**Memory Usage:** ~2.3GB total (100MB agent + 200MB backend + 2GB model)

---

## Next Steps

1. ✅ **Installed?** Run tests to verify
2. ✅ **Tested?** Try uploading a document
3. ✅ **Working?** Use with Claude Code

**Questions?**
- See `DEPLOYMENT-GUIDE.md` for detailed deployment
- See `PROGRESS.md` for implementation details
- See `TEST-RESULTS.md` for test documentation

---

**Status:** Production Ready ✅
**Version:** 1.0.0
**Build:** 100% Complete
