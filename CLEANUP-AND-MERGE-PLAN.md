# GKChatty Cleanup & Merge Strategy
**Date:** 2025-11-15
**Goal:** Organize, clean up, and safely merge gkchatty-pure into gkchatty-local
**Risk Level:** Medium (with proper safeguards)
**Timeline:** 2-3 days for cleanup, 3-5 days for merge

---

## Table of Contents
1. [Current State Summary](#current-state-summary)
2. [Phase 1: Cleanup & Organization](#phase-1-cleanup--organization)
3. [Phase 2: Fix Misleading Documentation](#phase-2-fix-misleading-documentation)
4. [Phase 3: Environment Configuration](#phase-3-environment-configuration)
5. [Phase 4: Safe Merge Strategy](#phase-4-safe-merge-strategy)
6. [Phase 5: MCP Service Protection](#phase-5-mcp-service-protection)
7. [Testing Checklist](#testing-checklist)
8. [Rollback Plan](#rollback-plan)

---

## Current State Summary

### What We Have
```
/Users/davidjmorin/GOLDKEY CHATTY/
├── gkchatty-ecosystem/
│   └── gkchatty-local/          # Cloud-only (MongoDB + Pinecone + OpenAI)
│       ├── backend/             # Port 4001
│       ├── frontend/            # Port 4003
│       └── README.md            # ❌ MISLEADING (claims hybrid)
│
├── gkchatty-pure/               # Local-only (SQLite + ChromaDB + Ollama)
│   ├── backend/                 # Port 3001
│   ├── frontend-lite/           # Port 3004
│   └── README.md                # ✅ ACCURATE
│
└── mcp/
    ├── gkchatty-mcp/            # Points to localhost:4001
    └── gkchatty-web-mcp/        # Points to localhost:4001 (configurable)
```

### What We Want
```
/Users/davidjmorin/GOLDKEY CHATTY/
├── gkchatty-ecosystem/
│   └── gkchatty-local/          # HYBRID (cloud OR local mode)
│       ├── backend/             # Port 4001 (can switch modes)
│       ├── frontend/            # Port 4003 (can switch modes)
│       ├── README.md            # ✅ ACCURATE (describes hybrid)
│       └── .env.cloud           # Cloud mode config
│       └── .env.local           # Local mode config
│
├── gkchatty-pure/               # STANDALONE desktop app
│   ├── backend/                 # Port 3001 (local-only, frozen)
│   ├── frontend-lite/           # Port 3004 (local-only, frozen)
│   └── README.md                # ✅ ACCURATE
│
└── mcp/
    ├── gkchatty-mcp/            # Points to localhost:4001
    └── gkchatty-web-mcp/        # Points to staging (configured)
```

---

## Phase 1: Cleanup & Organization

### Step 1.1: Backup Everything (CRITICAL)

```bash
# Create timestamped backup
cd "/Users/davidjmorin/GOLDKEY CHATTY"
BACKUP_DATE=$(date +%Y%m%d-%H%M%S)

# Backup gkchatty-local
cp -r gkchatty-ecosystem/gkchatty-local "gkchatty-local-backup-$BACKUP_DATE"

# Backup gkchatty-pure
cp -r gkchatty-pure "gkchatty-pure-backup-$BACKUP_DATE"

# Backup MCP servers
cp -r mcp "mcp-backup-$BACKUP_DATE"

# Create git bundle for gkchatty-pure (has no remote)
cd gkchatty-pure
git bundle create "../gkchatty-pure-git-$BACKUP_DATE.bundle" --all

echo "✅ Backups created in GOLDKEY CHATTY/"
```

**Verify backups exist before proceeding!**

---

### Step 1.2: Remove Misleading/Unused Code in gkchatty-local

**Files to DELETE (never used):**

```bash
cd "/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-ecosystem/gkchatty-local/backend"

# These files exist but are NEVER imported or used
rm -rf src/utils/local/sqliteHelper.ts       # SQLite code (unused)
rm -rf src/utils/local/chromaService.ts      # ChromaDB code (unused)
rm -rf src/utils/local/embeddingService.ts   # Local embeddings (unused)
rm -rf src/utils/local/storageAdapter.ts     # Storage switcher (unused)

# Empty directory after cleanup
rmdir src/utils/local/
```

**Why delete?** These files create confusion. We'll re-add proper versions from gkchatty-pure during the merge.

---

### Step 1.3: Organize Folder Structure

**Create clear directory structure:**

```bash
cd "/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-ecosystem/gkchatty-local"

# Create documentation directory
mkdir -p docs/architecture
mkdir -p docs/deployment
mkdir -p docs/development

# Create environment templates
mkdir -p config/environments

# Create merge staging area
mkdir -p merge-prep/
```

---

### Step 1.4: Clean Up Obsolete Files

**Files to archive/delete in gkchatty-local:**

```bash
cd "/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-ecosystem/gkchatty-local"

# Move old documentation to archive
mkdir -p archive/old-docs
mv docs/SERVICE-RESTART-LOOP-FIX.md archive/old-docs/ 2>/dev/null
mv TEST-REPORT-2025-11-06.md archive/old-docs/ 2>/dev/null

# Remove old backup directories (already have fresh backups)
rm -rf backend-backup-*/
rm -rf frontend-backup-*/

# Clean up temp files
find . -name "*.log" -type f -delete
find . -name ".DS_Store" -delete
```

---

## Phase 2: Fix Misleading Documentation

### Step 2.1: Update gkchatty-local README

**Replace current README.md with accurate description:**

```bash
cd "/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-ecosystem/gkchatty-local"

# Backup old README
mv README.md README.OLD.md

# Create new accurate README
cat > README.md << 'EOF'
# GKChatty Local - Cloud Development Version

**Current Status:** Cloud-only (MongoDB + Pinecone + OpenAI)
**Planned:** Hybrid mode (cloud OR local storage)

## What This Version Does

This is the **cloud/SaaS development version** of GKChatty. It connects to:
- MongoDB (local or Atlas)
- Pinecone vector database
- OpenAI API
- AWS S3 for file storage

## Ports

- Backend API: **4001**
- Frontend Web: **4003**
- HTTPS (mobile): **4004**

## Stack

| Component | Technology |
|-----------|------------|
| Database | MongoDB |
| Vector DB | Pinecone |
| LLM | OpenAI API (gpt-4o-mini) |
| Embeddings | OpenAI text-embedding-3-small |
| File Storage | AWS S3 |
| Auth | JWT + HttpOnly cookies |

## Quick Start

```bash
# 1. Install dependencies
cd backend && npm install
cd ../frontend && npm install

# 2. Configure environment
cp backend/.env.example backend/.env
# Edit .env with your API keys

# 3. Start services
cd backend && npm run dev    # Port 4001
cd frontend && npm run dev   # Port 4003
```

## Environment Variables

See `backend/.env.example` for required configuration.

## Related Versions

- **gkchatty-pure**: 100% local version (SQLite + ChromaDB + Ollama) - Separate codebase
- **Staging**: Deployed at [your-netlify-url] (coming soon)

## Development

This version is connected to GitHub: https://github.com/dmos82/gkchatty-local-v2

**Branch:** `local-ollama-dev` (development)
**Deploy:** `main` (staging/production)

## Future: Hybrid Mode

We plan to merge local-only features from gkchatty-pure to enable:
- Toggle between cloud and local storage
- Use Ollama for local LLM inference
- Work offline with SQLite + ChromaDB

This is not yet implemented.

---

**For 100% local/offline usage, use gkchatty-pure instead.**
EOF

echo "✅ Updated README.md"
```

---

### Step 2.2: Create Accurate Documentation

**Create new docs:**

```bash
cd "/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-ecosystem/gkchatty-local/docs"

# Architecture overview
cat > architecture/CURRENT-STACK.md << 'EOF'
# Current Architecture: Cloud-Only

## Data Flow

```
User → Frontend (4003)
  ↓
Backend API (4001)
  ↓
├─ MongoDB (user data, sessions, documents)
├─ Pinecone (vector embeddings)
├─ OpenAI API (LLM + embeddings)
└─ AWS S3 (file storage)
```

## Why Cloud-Only?

The local storage code in `/utils/local/` was built but never connected.
We use MongoDB/Pinecone/OpenAI exclusively.

## Hybrid Mode (Planned)

Will support switching between:
- Cloud mode (current)
- Local mode (SQLite + ChromaDB + Ollama)

See MERGE-PLAN.md for details.
EOF

# Deployment guide
cat > deployment/NETLIFY-DEPLOYMENT.md << 'EOF'
# Deploying to Netlify

## Current Setup

- **Repository:** https://github.com/dmos82/gkchatty-local-v2
- **Deploy Branch:** `main` (verify in Netlify dashboard)
- **Build Command:** `npm run build`
- **Publish Directory:** `frontend/out`

## Environment Variables (Netlify)

Required in Netlify dashboard:

```
MONGODB_URI=mongodb+srv://[atlas-connection-string]
PINECONE_API_KEY=...
PINECONE_ENVIRONMENT=us-east-1
PINECONE_INDEX_NAME=gkchatty-prod
OPENAI_API_KEY=...
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_BUCKET_NAME=...
JWT_SECRET=...
```

## Verify Deployment

After deploying, check:
- Health endpoint: `https://your-site.netlify.app/api/health`
- Should return `{"status":"healthy"}`

## Common Issues

- **MongoDB connection failed:** Check MONGODB_URI in Netlify env vars
- **Pinecone errors:** Verify API key and index name
- **S3 upload fails:** Check AWS credentials
EOF
```

---

### Step 2.3: Create Development Guide

```bash
cat > docs/development/LOCAL-DEVELOPMENT.md << 'EOF'
# Local Development Setup

## Prerequisites

- Node.js 18+
- MongoDB (local instance or Atlas)
- Pinecone account
- OpenAI API key
- AWS S3 bucket

## Setup Steps

1. **Clone and Install**
```bash
git clone https://github.com/dmos82/gkchatty-local-v2
cd gkchatty-local-v2
cd backend && npm install
cd ../frontend && npm install
```

2. **Configure Environment**
```bash
cd backend
cp .env.example .env
# Edit .env with your credentials
```

3. **Start MongoDB**
```bash
# Option A: Local MongoDB
mongod --dbpath ~/data/db

# Option B: Use MongoDB Atlas (configure in .env)
```

4. **Start Servers**
```bash
# Terminal 1: Backend
cd backend && npm run dev

# Terminal 2: Frontend
cd frontend && npm run dev
```

5. **Verify**
- Backend: http://localhost:4001/health
- Frontend: http://localhost:4003

## Ports Used

- **4001**: Backend API
- **4003**: Frontend web app
- **4004**: HTTPS for mobile testing

## Database Access

```bash
# Connect to local MongoDB
mongosh gkchatty

# View collections
show collections

# Query users
db.users.find()
```

## Switching to gkchatty-pure (Local-Only)

If you want 100% local/offline development, use gkchatty-pure instead:
- Port 3001: Backend (SQLite + ChromaDB)
- Port 3004: Frontend
- No cloud services required
EOF
```

---

## Phase 3: Environment Configuration

### Step 3.1: Create Environment Templates

**Cloud mode template:**

```bash
cd "/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-ecosystem/gkchatty-local/backend"

cat > .env.cloud << 'EOF'
# GKChatty Cloud Mode Configuration
# Use this for cloud/SaaS deployment

# Server
PORT=4001
NODE_ENV=development

# Authentication
JWT_SECRET=your-jwt-secret-change-in-production

# Storage Mode
GKCHATTY_STORAGE=cloud

# Database: MongoDB
MONGODB_URI=mongodb://localhost:27017/gkchatty
# For production: mongodb+srv://user:pass@cluster.mongodb.net/gkchatty

# Vector Database: Pinecone
PINECONE_API_KEY=your-pinecone-api-key
PINECONE_ENVIRONMENT=us-east-1
PINECONE_INDEX_NAME=gkchatty-sandbox

# LLM: OpenAI
OPENAI_API_KEY=your-openai-api-key
OPENAI_PRIMARY_CHAT_MODEL=gpt-4o-mini
OPENAI_FALLBACK_CHAT_MODEL=gpt-3.5-turbo
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

# File Storage: AWS S3
FILE_STORAGE_MODE=S3
AWS_REGION=us-east-2
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
AWS_BUCKET_NAME=gkchatty-documents

# Frontend
FRONTEND_URL=http://localhost:4003

# Redis (optional)
REDIS_URL=redis://localhost:6379
EOF

echo "✅ Created .env.cloud"
```

**Local mode template (for future hybrid implementation):**

```bash
cat > .env.local << 'EOF'
# GKChatty Local Mode Configuration
# Use this for offline/local development

# Server
PORT=4001
NODE_ENV=development

# Authentication
JWT_SECRET=local-dev-secret-change-in-production

# Storage Mode
GKCHATTY_STORAGE=local

# Database: SQLite
SQLITE_DB_PATH=~/.gkchatty/data/gkchatty.db

# Vector Database: ChromaDB
CHROMA_PATH=~/.gkchatty/data/vectors
CHROMA_COLLECTION=gkchatty-embeddings

# LLM: Ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_PRIMARY_MODEL=llama3.2:3b
OLLAMA_FALLBACK_MODEL=qwen2.5:7b

# Embeddings: Local (Transformers.js)
EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2
EMBEDDING_CACHE=~/.gkchatty/data/models

# File Storage: Local Filesystem
FILE_STORAGE_MODE=LOCAL
LOCAL_FILE_STORAGE_DIR=~/.gkchatty/uploads

# Frontend
FRONTEND_URL=http://localhost:4003

# No cloud services required
EOF

echo "✅ Created .env.local"
```

---

### Step 3.2: Create .env Switcher Script

```bash
cd "/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-ecosystem/gkchatty-local"

cat > switch-mode.sh << 'EOF'
#!/bin/bash
# GKChatty Mode Switcher

MODE=$1

if [ "$MODE" != "cloud" ] && [ "$MODE" != "local" ]; then
  echo "Usage: ./switch-mode.sh [cloud|local]"
  echo ""
  echo "Examples:"
  echo "  ./switch-mode.sh cloud   # Switch to cloud mode (MongoDB + Pinecone + OpenAI)"
  echo "  ./switch-mode.sh local   # Switch to local mode (SQLite + ChromaDB + Ollama)"
  exit 1
fi

echo "🔄 Switching to $MODE mode..."

# Copy the appropriate .env file
cp "backend/.env.$MODE" backend/.env

echo "✅ Switched to $MODE mode"
echo ""
echo "Environment file: backend/.env.$MODE → backend/.env"
echo ""
echo "Next steps:"
echo "1. Restart backend: cd backend && npm run dev"
echo "2. Verify health: curl http://localhost:4001/health"
echo ""
echo "Current mode: $MODE"
EOF

chmod +x switch-mode.sh

echo "✅ Created switch-mode.sh"
```

---

### Step 3.3: Update .gitignore

```bash
cat >> .gitignore << 'EOF'

# Environment files (keep templates only)
.env
.env.local
.env.cloud
.env.development
.env.production

# Backup files
*-backup-*/
*.bundle

# Local data directories
.gkchatty/
data/

# Logs
*.log
logs/
EOF
```

---

## Phase 4: Safe Merge Strategy

### Overview

We'll merge gkchatty-pure features into gkchatty-local in **three stages** to minimize risk:

1. **Stage 1:** Copy code (no integration)
2. **Stage 2:** Integrate incrementally
3. **Stage 3:** Add UI switcher

---

### Stage 1: Copy gkchatty-pure Code (No Integration Yet)

**Create merge preparation directory:**

```bash
cd "/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-ecosystem/gkchatty-local"
mkdir -p merge-prep/backend-local
mkdir -p merge-prep/frontend-features

# Copy gkchatty-pure backend local code
cp -r "/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-pure/backend/src/utils/local/" \
      merge-prep/backend-local/

# Copy gkchatty-pure models
cp "/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-pure/backend/src/models/"*.ts \
   merge-prep/backend-local/models/

# Copy gkchatty-pure services
cp -r "/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-pure/backend/src/services/" \
      merge-prep/backend-local/services/

# Copy gkchatty-pure frontend features
cp -r "/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-pure/frontend-lite/components/" \
      merge-prep/frontend-features/

# Copy model router, export service
cp "/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-pure/backend/src/services/modelRouter.ts" \
   merge-prep/backend-local/services/
cp "/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-pure/backend/src/services/exportService.ts" \
   merge-prep/backend-local/services/
```

**Review copied files:**

```bash
tree merge-prep/
```

This creates a staging area to review before integration.

---

### Stage 2: Create Storage Abstraction Layer

**This is the KEY to making hybrid mode work safely.**

```bash
cd "/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-ecosystem/gkchatty-local/backend/src"

mkdir -p adapters/database
mkdir -p adapters/vector
mkdir -p adapters/llm
mkdir -p adapters/storage
```

**Create database adapter:**

```typescript
// backend/src/adapters/database/index.ts
import { config } from '../../config/environment';

export interface DatabaseAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  // Add common database operations
}

export async function getDatabaseAdapter(): Promise<DatabaseAdapter> {
  const mode = config.storageMode;

  if (mode === 'cloud') {
    const { MongoDBAdapter } = await import('./mongodb');
    return new MongoDBAdapter(config.mongodb);
  } else if (mode === 'local') {
    const { SQLiteAdapter } = await import('./sqlite');
    return new SQLiteAdapter(config.sqlite);
  } else {
    throw new Error(`Unknown storage mode: ${mode}`);
  }
}
```

**Benefits:**
- Clean separation of concerns
- Easy to switch modes
- Testable
- No code duplication

---

### Stage 3: Incremental Integration Plan

**Order of integration (low risk → high risk):**

1. **✅ Model Router** (standalone feature, no dependencies)
   ```bash
   cp merge-prep/backend-local/services/modelRouter.ts \
      backend/src/services/
   ```

2. **✅ Export Service** (standalone feature)
   ```bash
   cp merge-prep/backend-local/services/exportService.ts \
      backend/src/services/
   ```

3. **✅ Storage Adapters** (with fallback to cloud)
   ```bash
   # Create adapters first
   # Test with feature flags
   ```

4. **✅ UI Components** (additive, doesn't break existing)
   ```bash
   # Add storage mode selector
   # Add model selector
   ```

5. **✅ Full Integration** (wire everything together)

---

### Stage 4: Feature Flags

**Add feature flags to enable/disable hybrid features:**

```typescript
// backend/src/config/features.ts
export const FEATURES = {
  HYBRID_STORAGE: process.env.FEATURE_HYBRID_STORAGE === 'true',
  OLLAMA_SUPPORT: process.env.FEATURE_OLLAMA === 'true',
  MODEL_ROUTER: process.env.FEATURE_MODEL_ROUTER === 'true',
  EXPORT_SERVICE: process.env.FEATURE_EXPORT === 'true',
};

// Usage in code:
import { FEATURES } from './config/features';

if (FEATURES.HYBRID_STORAGE) {
  // Use new hybrid code
} else {
  // Use existing cloud-only code
}
```

**Benefits:**
- Can enable features gradually
- Easy rollback if issues
- Test in production safely

---

## Phase 5: MCP Service Protection

### Strategy: Zero Downtime for MCP Services

**Key Principle:** MCP services should continue working throughout the merge.

---

### Step 5.1: MCP Compatibility Matrix

| Scenario | gkchatty-mcp | gkchatty-web-mcp | Impact |
|----------|--------------|------------------|--------|
| **Before merge** | ✅ Points to 4001 (cloud) | ✅ Points to staging | ✅ Working |
| **During merge** | ✅ Points to 4001 (cloud fallback) | ✅ Points to staging | ✅ Working |
| **After merge (cloud mode)** | ✅ Points to 4001 (cloud) | ✅ Points to staging | ✅ Working |
| **After merge (local mode)** | ⚠️ Points to 4001 (local) | ✅ Points to staging | ⚠️ Different data |

---

### Step 5.2: MCP Configuration Best Practices

**Create separate MCP config for each mode:**

```bash
cd "/Users/davidjmorin/GOLDKEY CHATTY/mcp"

# gkchatty-mcp: Always points to local development (4001)
# This will work in either cloud or local mode

# gkchatty-web-mcp: Configure to point to staging
cat > gkchatty-web-mcp/.env << 'EOF'
GKCHATTY_API_URL=https://your-staging-site.netlify.app
GKCHATTY_ADMIN_USERNAME=davidmorinmusic
GKCHATTY_ADMIN_PASSWORD=your-admin-password
EOF
```

**Update package.json scripts:**

```json
// gkchatty-web-mcp/package.json
{
  "scripts": {
    "start": "node index.js",
    "start:local": "GKCHATTY_API_URL=http://localhost:4001 node index.js",
    "start:staging": "node index.js"
  }
}
```

---

### Step 5.3: MCP Testing Strategy

**Before merge:**
```bash
# Test gkchatty-mcp against cloud mode
cd mcp/gkchatty-mcp
npm start
# Verify: Can query, upload, search

# Test gkchatty-web-mcp against staging
cd mcp/gkchatty-web-mcp
npm start
# Verify: Can query staging site
```

**After merge:**
```bash
# Test gkchatty-mcp against hybrid backend (cloud mode)
./switch-mode.sh cloud
cd backend && npm run dev
# MCP should still work

# Test gkchatty-mcp against hybrid backend (local mode)
./switch-mode.sh local
cd backend && npm run dev
# MCP should work with local data
```

---

### Step 5.4: API Compatibility Layer

**Ensure all MCP endpoints remain the same:**

```typescript
// backend/src/routes/index.ts
// Keep existing routes unchanged:
// POST /api/auth/login
// POST /api/documents/upload
// GET /api/documents
// POST /api/search
// POST /api/chats

// Internal implementation can change (cloud vs local)
// But API contract stays the same
```

**This guarantees MCP services won't break.**

---

## Testing Checklist

### Pre-Merge Tests (Current State)

- [ ] gkchatty-local (4001/4003) works in cloud mode
- [ ] gkchatty-pure (3001/3004) works in local mode
- [ ] gkchatty-mcp can connect to 4001
- [ ] gkchatty-web-mcp can connect to staging
- [ ] All backups created

### During Merge Tests (After Each Stage)

**Stage 1: Code Copy**
- [ ] Copied files are in merge-prep/
- [ ] No changes to running code
- [ ] Servers still start normally

**Stage 2: Storage Adapters**
- [ ] Cloud adapter works (existing functionality)
- [ ] Local adapter compiles (not connected yet)
- [ ] Feature flags default to OFF
- [ ] MCP services still work

**Stage 3: Model Router Integration**
- [ ] Model router works with OpenAI (cloud mode)
- [ ] Model router works with Ollama (local mode)
- [ ] Existing chat functionality unchanged
- [ ] MCP chat queries still work

**Stage 4: Export Service Integration**
- [ ] Export endpoint available
- [ ] Can export PDF, MD, TXT, HTML, DOCX
- [ ] Works in both cloud and local modes
- [ ] MCP services unaffected

**Stage 5: Full Hybrid Mode**
- [ ] Can switch between cloud/local with script
- [ ] Data persists in each mode
- [ ] UI shows current mode
- [ ] MCP works in both modes

### Post-Merge Tests (Final Validation)

**Cloud Mode:**
- [ ] MongoDB connection works
- [ ] Pinecone queries work
- [ ] OpenAI chat works
- [ ] S3 uploads work
- [ ] gkchatty-mcp works
- [ ] gkchatty-web-mcp works

**Local Mode:**
- [ ] SQLite connection works
- [ ] ChromaDB queries work
- [ ] Ollama chat works
- [ ] Local file storage works
- [ ] gkchatty-mcp works (with local data)

**Mode Switching:**
- [ ] Switch script works
- [ ] Server restarts cleanly
- [ ] No data loss
- [ ] MCP reconnects successfully

---

## Rollback Plan

### If Merge Goes Wrong

**Level 1: Rollback Feature Flags**
```bash
# Turn off hybrid features
echo "FEATURE_HYBRID_STORAGE=false" >> backend/.env
echo "FEATURE_OLLAMA=false" >> backend/.env
# Restart server
# System reverts to cloud-only mode
```

**Level 2: Rollback Code with Git**
```bash
cd gkchatty-ecosystem/gkchatty-local
git stash  # Save any uncommitted work
git checkout [commit-before-merge]
npm install
npm run dev
```

**Level 3: Restore from Backup**
```bash
cd "/Users/davidjmorin/GOLDKEY CHATTY"
# Find your backup
ls -la | grep gkchatty-local-backup

# Restore
rm -rf gkchatty-ecosystem/gkchatty-local
cp -r gkchatty-local-backup-YYYYMMDD-HHMMSS gkchatty-ecosystem/gkchatty-local

# Restart servers
cd gkchatty-ecosystem/gkchatty-local/backend
npm run dev
```

**MCP Services:** Should continue working as they connect to the API, not the implementation.

---

## Migration Timeline

### Week 1: Cleanup & Organization
- Day 1: Backup everything, remove misleading docs
- Day 2: Fix READMEs, create accurate documentation
- Day 3: Set up environment templates, test mode switching

### Week 2: Merge Preparation
- Day 4: Copy code to merge-prep/
- Day 5: Create storage adapters
- Day 6: Set up feature flags
- Day 7: Test adapter layer

### Week 3: Incremental Integration
- Day 8: Integrate model router
- Day 9: Integrate export service
- Day 10: Integrate storage adapters
- Day 11: Test hybrid mode switching

### Week 4: UI & Final Integration
- Day 12: Add storage mode UI switcher
- Day 13: Add model selector UI
- Day 14: Full integration testing
- Day 15: MCP compatibility testing
- Day 16: User acceptance testing

### Week 5: Stabilization
- Day 17-18: Bug fixes
- Day 19: Documentation updates
- Day 20: Deploy to staging

---

## Success Metrics

**Merge is successful when:**

1. ✅ Can switch between cloud and local modes
2. ✅ All existing features work in cloud mode
3. ✅ All gkchatty-pure features work in local mode
4. ✅ MCP services work in both modes
5. ✅ No data loss during mode switching
6. ✅ Documentation is accurate
7. ✅ Rollback plan tested and works

---

## Next Steps

**Right Now (today):**
1. Create backups
2. Remove misleading documentation
3. Update README files

**This Week:**
1. Set up environment templates
2. Test mode switching script
3. Create merge-prep directory

**Next Week:**
1. Start Stage 1 merge (code copy)
2. Build storage adapters
3. Test with feature flags

**Would you like me to start with Phase 1 (Cleanup) now?**

---

**Last Updated:** 2025-11-15
**Status:** Ready to execute
**Risk Level:** Medium (with proper safeguards)
