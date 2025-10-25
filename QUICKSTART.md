# GKChatty Ecosystem - Quickstart Guide

**Production-ready RAG platform with autonomous code generation**

This guide gets you up and running with GKChatty in under 5 minutes.

---

## Prerequisites

Before starting, ensure you have:

- **Node.js** 20.19.5 or higher
- **pnpm** 8.15.0 or higher
- **MongoDB** running locally
- **API Keys**:
  - OpenAI API key (for embeddings and chat)
  - Pinecone API key (for vector database)

### Quick Check

```bash
node -v      # Should show v20.19.5 or higher
pnpm -v      # Should show 8.15.0 or higher
mongosh      # Should connect to MongoDB
```

---

## First Time Setup

### 1. Install Dependencies

```bash
cd gkchatty-ecosystem
pnpm install
```

### 2. Configure Environment Variables

```bash
# Copy example environment file
cp packages/backend/.env.example packages/backend/.env

# Edit with your API keys
nano packages/backend/.env
# OR
code packages/backend/.env
```

**Required environment variables:**
```bash
# MongoDB
MONGODB_URI=mongodb://localhost:27017/gkchatty

# JWT Authentication
JWT_SECRET=your-secret-key-here

# OpenAI
OPENAI_API_KEY=sk-...your-key-here

# Pinecone
PINECONE_API_KEY=pcsk_...your-key-here
PINECONE_ENVIRONMENT=us-east-1-aws
PINECONE_INDEX_NAME=gkchatty-sandbox
```

### 3. Start MongoDB (if not running)

```bash
brew services start mongodb-community
```

### 4. (Optional) Install PM2 for Better Process Management

```bash
npm install -g pm2
```

---

## Daily Development Workflow

### Starting Services

**Option 1: Using pnpm scripts (Recommended)**
```bash
pnpm start
```

**Option 2: Using startup script directly**
```bash
./scripts/start.sh
```

**Option 3: Using PM2 (if installed)**
```bash
pm2 start ecosystem.config.js
```

**Option 4: Manual (for debugging)**
```bash
# Terminal 1: Backend
cd packages/backend
PORT=4001 pnpm run dev

# Terminal 2: Frontend
cd packages/web
PORT=4003 pnpm run dev
```

### Accessing Services

Once started, access:

- **Backend API:** http://localhost:4001
  - Health check: http://localhost:4001/health
  - API version: http://localhost:4001/api/version

- **Web Frontend:** http://localhost:4003
  - Login with default admin:
    - Username: `admin`
    - Password: `admin123`

### Stopping Services

**Option 1: Using pnpm scripts (Recommended)**
```bash
pnpm stop
```

**Option 2: Using stop script directly**
```bash
./scripts/stop.sh
```

**Option 3: Using PM2**
```bash
pm2 stop all
```

**Option 4: Manual (Ctrl+C in each terminal)**

---

## Health Checks

Check if all services are running properly:

```bash
./scripts/health-check.sh
```

This checks:
- ✅ Node.js version
- ✅ pnpm installation
- ✅ MongoDB status
- ✅ Environment variables
- ✅ Backend API
- ✅ Frontend web app
- ✅ MCP servers (if Claude Code is running)

---

## Common Tasks

### Building for Production

```bash
# Build all packages
pnpm build

# Start in production mode (requires build first)
cd packages/backend && pnpm start
cd packages/web && pnpm start
```

### Running Tests

```bash
# Run all tests
pnpm test

# Run backend tests
cd packages/backend && pnpm test

# Run integration tests
pnpm test:integration

# Run E2E tests
pnpm test:e2e
```

### Database Scripts

```bash
# Create admin user
cd packages/backend
pnpm run user:create-admin

# Load system knowledge base
pnpm run load-kb

# Reindex Pinecone
pnpm run reindex:all-kb
```

### Code Quality

```bash
# Lint all packages
pnpm lint

# Format code
pnpm format

# Clean node_modules and dist folders
pnpm clean
```

---

## Troubleshooting

### "Port already in use"

**Problem:** Port 4001 or 4003 is busy

**Solution:**
```bash
# Check what's using the ports
lsof -ti:4001
lsof -ti:4003

# Stop services properly
./scripts/stop.sh

# If that doesn't work, kill specific process
kill $(lsof -ti:4001)
kill $(lsof -ti:4003)
```

### "MongoDB connection failed"

**Problem:** Backend can't connect to MongoDB

**Solution:**
```bash
# Check if MongoDB is running
mongosh

# If not, start it
brew services start mongodb-community

# Verify connection string in .env
echo $MONGODB_URI
```

### "MCP servers stopped working"

**Problem:** GKChatty MCP tools not responding

**Important:** MCP servers are managed by Claude Code, NOT by GKChatty scripts

**Solution:**
1. **NEVER run `killall node`** - this kills MCP servers too
2. Restart Claude Code to restart MCP servers
3. Verify MCPs are running:
   ```bash
   ps aux | grep -E "(gkchatty-mcp|builder-pro-mcp)" | grep -v grep
   ```

### Backend won't start

**Problem:** Backend fails to start

**Solution:**

For development (no build required):
```bash
cd packages/backend
pnpm run dev
```

For production (requires build):
```bash
cd packages/backend
pnpm run build
pnpm start
```

### Frontend shows "API connection error"

**Problem:** Frontend can't connect to backend

**Solution:**
1. Verify backend is running: `curl http://localhost:4001/health`
2. Check backend logs for errors
3. Verify CORS configuration in backend
4. Check frontend API URL in `.env` or config

---

## Architecture Overview

```
gkchatty-ecosystem/
├── packages/
│   ├── backend/          # Node.js + Express API
│   │   ├── src/          # Source code
│   │   ├── dist/         # Compiled code (after build)
│   │   └── .env          # Environment variables
│   │
│   └── web/              # Next.js frontend
│       ├── src/          # React components
│       └── public/       # Static assets
│
├── scripts/              # Startup/management scripts
│   ├── start.sh          # Start services
│   ├── stop.sh           # Stop services
│   └── health-check.sh   # Health validation
│
├── ecosystem.config.js   # PM2 configuration
└── package.json          # Monorepo scripts
```

---

## PM2 Process Management (Recommended)

PM2 provides better process isolation and prevents accidentally killing MCP servers.

### Install PM2

```bash
npm install -g pm2
```

### Basic PM2 Commands

```bash
# Start all services
pm2 start ecosystem.config.js

# Stop all services (MCPs remain running!)
pm2 stop all

# Restart one service
pm2 restart gkchatty-backend
pm2 restart gkchatty-frontend

# View logs
pm2 logs
pm2 logs gkchatty-backend

# Monitor resources
pm2 monit

# List processes
pm2 list

# Delete all processes
pm2 delete all
```

### Why PM2?

✅ **Process Isolation** - Restart backend without affecting frontend
✅ **MCP Safety** - `pm2 stop all` doesn't kill MCP servers
✅ **Auto-restart** - Services restart on crash
✅ **Log Management** - Centralized logging
✅ **Resource Monitoring** - CPU/memory tracking
✅ **Zero Downtime** - Reload without dropping requests

---

## MCP Integration (Claude Code)

GKChatty provides MCP (Model Context Protocol) tools for Claude Code integration.

### Available MCP Tools

- **search_gkchatty** - Vector search across knowledge base
- **query_gkchatty** - AI-powered Q&A with RAG
- **upload_to_gkchatty** - Upload documents to knowledge base
- **switch_user** - Switch between user contexts
- **current_user** - Check current user

### MCP Server Location

```bash
# Global installation
/opt/homebrew/bin/gkchatty-mcp

# Source code
mcp/gkchatty-mcp/index.js
```

### Important: MCP vs GKChatty Services

```
┌─────────────────────────┐
│ Claude Code             │  ← Manages these
│ ├─ gkchatty-mcp         │
│ └─ builder-pro-mcp      │
└─────────────────────────┘

┌─────────────────────────┐
│ GKChatty Ecosystem      │  ← You manage these
│ ├─ Backend (4001)       │
│ └─ Frontend (4003)      │
└─────────────────────────┘
```

**Rule:** GKChatty scripts should NEVER affect MCP servers

---

## Development vs Production

| Aspect | Development | Production |
|--------|-------------|------------|
| Build Required | ❌ No | ✅ Yes |
| Command | `pnpm run dev` | `pnpm start` |
| Hot Reload | ✅ Yes | ❌ No |
| Source Maps | ✅ Yes | ❌ No |
| Optimizations | ❌ No | ✅ Yes |
| Environment | `NODE_ENV=development` | `NODE_ENV=production` |

---

## Getting Help

### Check Logs

**Backend logs:**
```bash
# If using PM2
pm2 logs gkchatty-backend

# If using manual startup
# Logs appear in terminal where you ran npm run dev
```

**Frontend logs:**
```bash
# If using PM2
pm2 logs gkchatty-frontend

# If using manual startup
# Logs appear in terminal where you ran npm run dev
```

### Run Health Check

```bash
./scripts/health-check.sh
```

### Verify Services

```bash
# Check if backend is responding
curl http://localhost:4001/health

# Check if frontend is running
curl http://localhost:4003
```

---

## Next Steps

1. **Explore the API** - http://localhost:4001/api/version
2. **Try the Web UI** - http://localhost:4003
3. **Upload documents** - Use the web UI or MCP tools
4. **Test RAG search** - Query your knowledge base
5. **Integrate with Claude Code** - Use MCP tools in BMAD workflows

---

## Quick Reference

```bash
# Start everything
pnpm start

# Stop everything
pnpm stop

# Check health
./scripts/health-check.sh

# View PM2 processes
pm2 list

# View logs
pm2 logs

# Restart one service
pm2 restart gkchatty-backend

# Clean install
pnpm clean && pnpm install

# Run tests
pnpm test
```

---

**Need more help?** Check the full documentation in `/docs` or run `./scripts/health-check.sh` to diagnose issues.

**Last Updated:** October 25, 2025
