# GKChatty Ecosystem - Quick Start Guide

**How to actually use this monorepo**

---

## 🚀 First Time Setup (30 minutes)

### Step 1: Navigate to the monorepo
```bash
cd "/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-ecosystem"
```

### Step 2: Install all dependencies
```bash
pnpm install
```

This will:
- Install all package dependencies
- Build the shared package
- Create `pnpm-lock.yaml`

**Expected output:**
```
Packages: +1500
Progress: resolving, fetching, linking...
Done in 2m
```

### Step 3: Set up environment variables
```bash
# Copy example to actual .env
cp packages/backend/.env.example packages/backend/.env

# Edit with your API keys
nano packages/backend/.env
# OR
code packages/backend/.env
```

**Required keys:**
```env
# Get from: https://www.pinecone.io/
PINECONE_API_KEY=your-key-here

# Get from: https://platform.openai.com/api-keys
OPENAI_API_KEY=your-key-here

# Generate with: openssl rand -base64 32
JWT_SECRET=your-generated-secret-here

# Already set (local dev)
MONGODB_URI=mongodb://localhost:27017/gkckb
```

### Step 4: Start MongoDB
```bash
# If not running
brew services start mongodb-community

# Verify it's running
mongosh --eval "db.version()"
```

### Step 5: Run health check
```bash
./scripts/health-check.sh
```

**Expected:**
```
🏥 GKChatty Ecosystem Health Check
======================================
Node.js Version... ✅ 20.19.5
pnpm... ✅ 8.15.0
MongoDB (localhost:27017)... ✅ Running
Environment Variables... ✅ Configured
Backend API (http://localhost:4001)... ❌ NOT RUNNING
Web Frontend (http://localhost:4003)... ⚠️  NOT RUNNING
MCPs Registered... ⚠️  NOT REGISTERED
```

---

## 🎯 Daily Usage

### Starting the System

#### Option 1: All services at once (recommended)
```bash
./scripts/start.sh
```

This starts:
- Backend API on http://localhost:4001
- Web Frontend on http://localhost:4003

**Press Ctrl+C to stop all services**

#### Option 2: Services separately (for development)

**Terminal 1 - Backend:**
```bash
cd packages/backend
pnpm run dev
```

**Terminal 2 - Web:**
```bash
cd packages/web
pnpm run dev
```

**Terminal 3 - Health Check (optional):**
```bash
watch -n 5 ./scripts/health-check.sh
```

---

## 🔧 Common Tasks

### Check System Health
```bash
./scripts/health-check.sh
```

### Run All Tests
```bash
pnpm test
```

### Build All Packages
```bash
pnpm build
```

### Build Specific Package
```bash
pnpm --filter @gkchatty/backend build
pnpm --filter @gkchatty/web build
pnpm --filter @gkchatty/shared build
```

### Run Backend Only
```bash
cd packages/backend
pnpm run dev
```

### Run Frontend Only
```bash
cd packages/web
pnpm run dev
```

### Update Dependencies (carefully!)
```bash
# DON'T use pnpm update (breaks version locks)
# Instead, manually update specific packages:
cd packages/backend
pnpm add axios@1.9.1  # Specific version
```

---

## 🤖 Using the MCPs with Claude

### Step 1: Update Claude's MCP Configuration

The MCPs are now **local**, not global. You need to update Claude's config:

**File:** `~/.config/claude/mcp.json`

**Add this:**
```json
{
  "mcpServers": {
    "gkchatty-kb": {
      "command": "node",
      "args": [
        "/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-ecosystem/packages/gkchatty-mcp/index.js"
      ],
      "env": {
        "GKCHATTY_API_URL": "http://localhost:4001"
      }
    },
    "builder-pro": {
      "command": "node",
      "args": [
        "/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-ecosystem/packages/builder-pro-mcp/server.js"
      ]
    }
  }
}
```

### Step 2: Restart Claude Code
```bash
# Quit Claude Code completely
# Then reopen it
```

### Step 3: Test MCPs

**GKChatty MCP:**
- `search_gkchatty` - Search knowledge base
- `query_gkchatty` - Ask questions with RAG
- `upload_to_gkchatty` - Upload documents
- `list_users` - List all users
- `switch_user` - Switch to a different user
- `current_user` - Show current user

**Builder Pro MCP:**
- `review_code` - Code review with ESLint
- `security_scan` - Security vulnerability scan
- `validate_architecture` - Architecture validation
- `auto_fix` - Auto-fix code issues
- `orchestrate_build` - Full project validation

---

## 📂 File Structure Reference

```
gkchatty-ecosystem/
├── packages/
│   ├── backend/              # Express API
│   │   ├── src/             # Source code
│   │   ├── .env             # YOUR API KEYS (gitignored)
│   │   └── package.json     # @gkchatty/backend
│   │
│   ├── web/                 # Next.js frontend
│   │   ├── src/            # Source code
│   │   └── package.json    # @gkchatty/web
│   │
│   ├── gkchatty-mcp/       # RAG MCP tools
│   │   ├── index.js        # Main server
│   │   └── package.json    # @gkchatty/mcp-server
│   │
│   ├── builder-pro-mcp/    # Code validation MCP
│   │   ├── server.js       # Main server
│   │   └── package.json    # @gkchatty/builder-pro-mcp
│   │
│   └── shared/             # Shared utilities
│       ├── src/
│       │   ├── config.ts   # Config loader
│       │   ├── types.ts    # TypeScript types
│       │   └── index.ts
│       └── package.json    # @gkchatty/shared
│
├── scripts/
│   ├── health-check.sh     # Check system health
│   ├── setup.sh           # First-time setup
│   └── start.sh           # Start all services
│
├── .gkchatty/
│   └── config.json        # Unified configuration
│
├── QUICK-START.md         # This file
├── README.md              # Overview
├── PROGRESS.md            # Build progress
└── SESSION-COMPLETE-2025-10-22.md  # Session details
```

---

## 🔍 Troubleshooting

### Backend won't start

**Check MongoDB:**
```bash
mongosh --eval "db.version()"
```

**Check environment:**
```bash
cat packages/backend/.env | grep API_KEY
```

**Check port:**
```bash
lsof -i :4001
# If something is running, kill it:
lsof -ti :4001 | xargs kill -9
```

### Frontend won't start

**Check backend is running:**
```bash
curl http://localhost:4001/api/version
```

**Check port:**
```bash
lsof -i :4003
```

### MCPs not working in Claude

**Check MCP config:**
```bash
cat ~/.config/claude/mcp.json
```

**Check paths are correct:**
```bash
ls "/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-ecosystem/packages/gkchatty-mcp/index.js"
```

**Restart Claude Code:**
- Quit completely
- Reopen

### "Module not found" errors

**Rebuild shared package:**
```bash
cd packages/shared
pnpm run build
```

**Reinstall dependencies:**
```bash
pnpm install
```

---

## 🎓 Development Workflow

### Making Changes to Backend

1. **Edit code:**
   ```bash
   code packages/backend/src/routes/chatRoutes.ts
   ```

2. **Hot reload is automatic** (ts-node-dev)

3. **Test:**
   ```bash
   curl http://localhost:4001/api/version
   ```

4. **Commit:**
   ```bash
   git add packages/backend
   git commit -m "feat: add new endpoint"
   ```

### Making Changes to Frontend

1. **Edit code:**
   ```bash
   code packages/web/src/app/page.tsx
   ```

2. **Hot reload is automatic** (Next.js)

3. **View:** http://localhost:4003

4. **Commit:**
   ```bash
   git add packages/web
   git commit -m "feat: update UI"
   ```

### Adding Shared Types

1. **Edit:**
   ```bash
   code packages/shared/src/types.ts
   ```

2. **Rebuild:**
   ```bash
   cd packages/shared
   pnpm run build
   ```

3. **Use in other packages:**
   ```typescript
   import { User, Document } from '@gkchatty/shared';
   ```

---

## 📊 Monitoring

### Watch Health Status
```bash
watch -n 5 ./scripts/health-check.sh
```

### Watch Backend Logs
```bash
cd packages/backend
pnpm run dev
```

### Watch Frontend Logs
```bash
cd packages/web
pnpm run dev
```

### Check MongoDB
```bash
mongosh gkckb
> db.users.countDocuments()
> db.documents.countDocuments()
```

---

## 🔒 Security Notes

### Never Commit These Files:
- `packages/backend/.env` (has API keys)
- `packages/backend/uploads/` (user data)
- `node_modules/` (dependencies)

### Already Gitignored:
```
.env
.env.local
uploads/
node_modules/
```

### Generate Secrets:
```bash
# JWT Secret
openssl rand -base64 32

# Encryption Key
openssl rand -hex 32
```

---

## 🚀 Production Deployment (Future)

### Build for Production
```bash
pnpm build
```

### Environment Variables
Set these in your production environment:
- `NODE_ENV=production`
- `MONGODB_URI` (production database)
- `PINECONE_API_KEY`
- `OPENAI_API_KEY`
- `JWT_SECRET`
- All other keys from `.env.example`

### Start Production Backend
```bash
cd packages/backend
pnpm run start  # Runs compiled JS
```

### Start Production Frontend
```bash
cd packages/web
pnpm run build
pnpm run start
```

---

## 💡 Tips & Best Practices

### Use pnpm Filters
```bash
# Run command in specific package
pnpm --filter @gkchatty/backend dev
pnpm --filter @gkchatty/web build

# Run in all packages
pnpm -r build    # recursive
pnpm run build   # from root
```

### Keep Dependencies Locked
```bash
# ❌ DON'T do this (breaks version locks):
pnpm update

# ✅ DO this instead:
pnpm add axios@1.9.1  # Specific version
```

### Use Health Checks
```bash
# Before making changes
./scripts/health-check.sh

# After making changes
./scripts/health-check.sh

# Before committing
./scripts/health-check.sh
```

### Commit Often
```bash
# Small, focused commits
git add packages/backend/src/routes/chatRoutes.ts
git commit -m "feat: add pagination to chat endpoint"
```

---

## 🆘 Getting Help

### Check Documentation
1. `README.md` - Overview
2. `QUICK-START.md` - This file
3. `PROGRESS.md` - Build status
4. `SESSION-COMPLETE-2025-10-22.md` - Full session details

### Run Health Check
```bash
./scripts/health-check.sh
```

### Check Logs
```bash
# Backend logs
cd packages/backend && pnpm run dev

# Frontend logs
cd packages/web && pnpm run dev
```

### Ask Claude
Claude has access to all the code and can help debug!

---

## ✅ Quick Checklist

**Every time you start working:**
- [ ] `cd gkchatty-ecosystem`
- [ ] MongoDB running? (`mongosh --eval "db.version()"`)
- [ ] `.env` configured? (`cat packages/backend/.env`)
- [ ] Dependencies installed? (`ls node_modules`)
- [ ] Health check passes? (`./scripts/health-check.sh`)
- [ ] Services started? (`./scripts/start.sh`)

**Before committing:**
- [ ] Health check passes
- [ ] Tests pass (`pnpm test`)
- [ ] Build succeeds (`pnpm build`)
- [ ] No secrets in code
- [ ] Commit message is clear

---

## 🎯 Next Steps

**Now that you know how to use it:**

1. **Test it works:**
   ```bash
   ./scripts/setup.sh
   ./scripts/start.sh
   ```

2. **Open in browser:**
   - Backend: http://localhost:4001
   - Frontend: http://localhost:4003

3. **Try the MCPs in Claude:**
   - Update `~/.config/claude/mcp.json`
   - Restart Claude Code
   - Test RAG queries

4. **Start developing:**
   - Make changes
   - Test locally
   - Commit to git

---

**You're all set!** The monorepo is ready to use. No more "weeks of inconsistency" - everything is stable and automated. 🚀

Questions? Run `./scripts/health-check.sh` or ask Claude!
