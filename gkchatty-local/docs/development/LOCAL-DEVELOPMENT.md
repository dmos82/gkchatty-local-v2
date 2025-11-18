# Local Development Guide - GKChatty Local

**Last Updated:** 2025-11-14
**Development Mode:** Cloud-based (MongoDB + Pinecone + OpenAI)
**Ports:** Backend 4001, Frontend 4003

---

## Quick Start

```bash
# 1. Clone repository
git clone https://github.com/dmos82/gkchatty-local-v2.git
cd gkchatty-local-v2/gkchatty-local

# 2. Install backend dependencies
cd backend
npm install

# 3. Install frontend dependencies
cd ../frontend
npm install

# 4. Set up environment variables (cloud mode)
cd ../backend
cp .env.cloud .env
# Edit .env with your credentials

# 5. Start MongoDB (if using local instance)
mongod --dbpath ~/data/db

# 6. Start backend (terminal 1)
cd backend
npm run dev  # Runs on port 4001

# 7. Start frontend (terminal 2)
cd frontend
npm run dev  # Runs on port 4003

# 8. Open browser
http://localhost:4003
```

---

## Prerequisites

### Required Software

| Software | Version | Purpose | Installation |
|----------|---------|---------|--------------|
| **Node.js** | 18+ | JavaScript runtime | [nodejs.org](https://nodejs.org) |
| **npm** | 9+ | Package manager | Comes with Node.js |
| **MongoDB** | 6+ | Database | [mongodb.com/try/download/community](https://www.mongodb.com/try/download/community) |
| **Git** | 2.x | Version control | [git-scm.com](https://git-scm.com) |
| **VS Code** | Latest | Code editor (recommended) | [code.visualstudio.com](https://code.visualstudio.com) |

### Required Accounts

1. **Pinecone** (free tier available)
   - Sign up: https://www.pinecone.io/
   - Create index: dimensions=1536, metric=cosine
   - Get API key

2. **OpenAI** (requires billing)
   - Sign up: https://platform.openai.com
   - Add payment method
   - Get API key
   - Enable models: gpt-4o-mini, text-embedding-3-small

### Optional Tools

- **MongoDB Compass** - GUI for MongoDB
- **Postman** - API testing
- **Docker** - Container runtime (alternative to local MongoDB)

---

## Environment Setup

### MongoDB Setup

**Option 1: Local MongoDB Instance**

```bash
# macOS (Homebrew)
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community

# Ubuntu
wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
sudo apt update
sudo apt install mongodb-org
sudo systemctl start mongod

# Windows
# Download installer from mongodb.com
# Run installer
# Start MongoDB service from Services panel

# Verify MongoDB is running
mongosh
# Should connect to mongodb://127.0.0.1:27017
```

**Option 2: Docker MongoDB**

```bash
# Start MongoDB container
docker run -d \
  --name gkchatty-mongo \
  -p 27017:27017 \
  -v ~/data/mongo:/data/db \
  mongo:6

# Verify
docker ps | grep gkchatty-mongo
```

**Option 3: MongoDB Atlas (Cloud)**

```bash
# 1. Sign up at cloud.mongodb.com
# 2. Create free M0 cluster
# 3. Add database user
# 4. Whitelist IP: 0.0.0.0/0 (for development)
# 5. Get connection string:
#    mongodb+srv://username:password@cluster.xxxxx.mongodb.net/gkchatty
```

### Environment Variables

Create `backend/.env` file:

```bash
# Copy cloud mode template
cp backend/.env.cloud backend/.env
```

**Edit `backend/.env`:**

```bash
# ==========================================
# CORE SETTINGS
# ==========================================
PORT=4001
NODE_ENV=development
JWT_SECRET=gkchatty_local_dev_secret_key_change_in_production_12345678

# ==========================================
# DATABASE
# ==========================================
# Option 1: Local MongoDB
MONGODB_URI=mongodb://localhost:27017/gkchatty

# Option 2: Docker MongoDB
# MONGODB_URI=mongodb://localhost:27017/gkchatty

# Option 3: MongoDB Atlas
# MONGODB_URI=mongodb+srv://username:password@cluster.xxxxx.mongodb.net/gkchatty

# ==========================================
# PINECONE VECTOR DATABASE
# ==========================================
PINECONE_API_KEY=pc-xxxxxxxxxxxxxxxxxxxxxxxxxxxx
PINECONE_ENVIRONMENT=us-east-1
PINECONE_INDEX_NAME=gkchatty-dev

# ==========================================
# OPENAI API
# ==========================================
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxx
OPENAI_PRIMARY_CHAT_MODEL=gpt-4o-mini
OPENAI_FALLBACK_CHAT_MODEL=gpt-3.5-turbo
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

# ==========================================
# STORAGE MODE
# ==========================================
GKCHATTY_STORAGE=cloud

# ==========================================
# AWS S3 (Optional - for file storage)
# ==========================================
# AWS_REGION=us-east-2
# AWS_ACCESS_KEY_ID=your-access-key
# AWS_SECRET_ACCESS_KEY=your-secret-key
# AWS_BUCKET_NAME=gkchatty-dev-uploads

# ==========================================
# LOGGING
# ==========================================
LOG_LEVEL=debug  # debug | info | warn | error
```

**Security Notes:**
- ⚠️ **NEVER commit .env file to Git**
- ✅ Use different secrets for development and production
- ✅ Rotate JWT_SECRET regularly

### Pinecone Index Setup

```bash
# 1. Login to Pinecone dashboard
https://app.pinecone.io

# 2. Create new index
Name: gkchatty-dev
Dimensions: 1536
Metric: cosine
Pod Type: p1.x1 (starter)
Region: us-east-1

# 3. Copy API key and index name to .env
```

---

## Development Workflow

### Starting Development Servers

**Terminal 1 - Backend:**

```bash
cd backend
npm run dev

# Output:
# [Server] Starting in development mode...
# [MongoDB] Connected to mongodb://localhost:27017/gkchatty
# [Pinecone] Connected to index: gkchatty-dev
# [Server] 🚀 Server running on http://localhost:4001
```

**Terminal 2 - Frontend:**

```bash
cd frontend
npm run dev

# Output:
# ready - started server on 0.0.0.0:4003, url: http://localhost:4003
# event - compiled client and server successfully
```

**Verify Services:**

```bash
# Backend health check
curl http://localhost:4001/health
# Expected: {"status":"healthy","timestamp":"..."}

# Frontend
open http://localhost:4003
# Should show login page
```

### Development Scripts

**Backend (`backend/package.json`):**

```bash
npm run dev      # Start with hot reload (ts-node-dev)
npm run build    # Compile TypeScript to JavaScript
npm start        # Run compiled code
npm test         # Run tests
npm run lint     # Run ESLint
npm run clean    # Clean dist/ and cache
```

**Frontend (`frontend/package.json`):**

```bash
npm run dev      # Start Next.js dev server (port 4003)
npm run build    # Build for production
npm start        # Start production server
npm run lint     # Run ESLint
npm run export   # Export static files
```

### Hot Reload

Both backend and frontend have hot reload enabled:

- **Backend:** Uses `ts-node-dev` - auto-restarts on file changes
- **Frontend:** Uses Next.js Fast Refresh - instant updates in browser

**Note:** If backend logs show old code, clean cache:

```bash
cd backend
rm -rf dist/ .ts-node/ node_modules/.cache/
npm run dev
```

---

## Project Structure

```
gkchatty-local/
├── backend/                      # Express.js API server
│   ├── src/
│   │   ├── controllers/          # Request handlers
│   │   │   ├── authController.ts
│   │   │   ├── chatController.ts
│   │   │   ├── documentController.ts
│   │   │   └── ...
│   │   ├── middleware/           # Express middleware
│   │   │   ├── authMiddleware.ts # JWT validation
│   │   │   ├── errorHandler.ts   # Error handling
│   │   │   └── validator.ts      # Request validation
│   │   ├── models/               # Mongoose schemas
│   │   │   ├── User.ts
│   │   │   ├── Document.ts
│   │   │   ├── ChatSession.ts
│   │   │   └── ...
│   │   ├── routes/               # API route definitions
│   │   │   ├── authRoutes.ts     # /api/auth/*
│   │   │   ├── chatRoutes.ts     # /api/chat/*
│   │   │   ├── documentRoutes.ts # /api/documents/*
│   │   │   └── ...
│   │   ├── services/             # Business logic
│   │   │   ├── chatService.ts
│   │   │   ├── documentService.ts
│   │   │   ├── ragService.ts
│   │   │   └── ...
│   │   ├── utils/                # Utilities
│   │   │   ├── mongoHelper.ts    # MongoDB connection
│   │   │   ├── pineconeService.ts # Pinecone client
│   │   │   ├── storageAdapter.ts  # Storage abstraction
│   │   │   └── local/            # Local storage (unused)
│   │   └── index.ts              # Entry point
│   ├── uploads/                  # File uploads directory
│   ├── .env                      # Environment variables (gitignored)
│   ├── .env.cloud                # Cloud mode template
│   ├── .env.local                # Local mode template (future)
│   ├── package.json
│   └── tsconfig.json
├── frontend/                     # Next.js React app
│   ├── pages/                    # Next.js pages
│   │   ├── _app.tsx              # App wrapper
│   │   ├── index.tsx             # Homepage (/)
│   │   ├── login.tsx             # Login (/login)
│   │   ├── register.tsx          # Register (/register)
│   │   └── chat.tsx              # Chat page (/chat)
│   ├── components/               # React components
│   │   ├── Chat/
│   │   ├── Documents/
│   │   ├── Layout/
│   │   └── ...
│   ├── lib/                      # Utilities
│   │   ├── api-client.ts         # API wrapper
│   │   ├── types.ts              # TypeScript types
│   │   └── ...
│   ├── public/                   # Static assets
│   ├── styles/                   # Global styles
│   ├── package.json
│   └── next.config.js
├── docs/                         # Documentation
│   ├── architecture/
│   ├── deployment/
│   └── development/
└── README.md
```

---

## Development Tasks

### Creating a New User (For Testing)

**Option 1: Via Frontend**

```bash
# 1. Open http://localhost:4003
# 2. Click "Sign Up"
# 3. Enter:
#    Username: dev
#    Email: dev@example.com
#    Password: dev123
# 4. Click "Create Account"
```

**Option 2: Via MongoDB**

```bash
mongosh gkchatty

# Hash password (use bcrypt in code, or set a simple one for dev)
db.users.insertOne({
  username: "dev",
  email: "dev@example.com",
  passwordHash: "$2b$10$...",  # bcrypt hash of "dev123"
  isAdmin: true,
  activeSessionIds: [],
  createdAt: new Date(),
  updatedAt: new Date()
})
```

**Option 3: Via API (cURL)**

```bash
curl -X POST http://localhost:4001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "dev",
    "email": "dev@example.com",
    "password": "dev123"
  }'
```

### Testing Document Upload

```bash
# 1. Login first (get JWT cookie)
curl -X POST http://localhost:4001/api/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{
    "username": "dev",
    "password": "dev123"
  }'

# 2. Upload document
curl -X POST http://localhost:4001/api/documents/upload \
  -b cookies.txt \
  -F "file=@/path/to/document.pdf"

# 3. Verify in MongoDB
mongosh gkchatty
db.documents.find({userId: "..."})

# 4. Verify in Pinecone
# Check Pinecone dashboard → gkchatty-dev index → Namespace (userId)
```

### Testing Chat with RAG

```bash
# 1. Upload document (see above)

# 2. Send chat message
curl -X POST http://localhost:4001/api/chat \
  -b cookies.txt \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What is this document about?",
    "sessionId": "optional-session-id",
    "useRag": true
  }'

# 3. Response includes:
# {
#   "message": "According to the document...",
#   "sources": [{"id": "...", "score": 0.95}],
#   "sessionId": "..."
# }
```

### Debugging

**Backend Logs:**

```bash
# Backend outputs structured JSON logs
cd backend
npm run dev

# Increase log verbosity
export LOG_LEVEL=debug
npm run dev

# Filter logs
npm run dev | grep ERROR
```

**Frontend Logs:**

```bash
# Open browser dev console
# Network tab → Check API requests
# Console tab → Check React errors
```

**Database Inspection:**

```bash
# MongoDB Shell
mongosh gkchatty

# List collections
show collections

# View users
db.users.find().pretty()

# View documents
db.documents.find().pretty()

# View chat sessions
db.chatsessions.find().pretty()

# Count documents
db.documents.countDocuments()
```

**Pinecone Inspection:**

```bash
# Via Dashboard
https://app.pinecone.io → Select index → Stats

# Via API
curl -X GET "https://controller.us-east-1.pinecone.io/databases/gkchatty-dev" \
  -H "Api-Key: ${PINECONE_API_KEY}"
```

---

## Common Development Issues

### Issue: Backend won't start

**Error:** `Error: listen EADDRINUSE: address already in use :::4001`

**Solution:**

```bash
# Find process using port 4001
lsof -i:4001

# Kill process
kill -9 <PID>

# Or use different port
PORT=4002 npm run dev
```

---

### Issue: MongoDB connection failed

**Error:** `MongooseServerSelectionError: connect ECONNREFUSED 127.0.0.1:27017`

**Solution:**

```bash
# Check if MongoDB is running
mongosh
# If fails, start MongoDB:

# macOS
brew services start mongodb-community

# Ubuntu
sudo systemctl start mongod

# Docker
docker start gkchatty-mongo
```

---

### Issue: Old code running (session bug persists)

**Error:** Logs show old code despite file changes

**Solution:**

```bash
# Stop backend
# Clean cache
cd backend
rm -rf dist/ .ts-node/ node_modules/.cache/

# Restart
npm run dev
```

---

### Issue: Pinecone API errors

**Error:** `PineconeConfigurationError: Invalid API key`

**Solution:**

```bash
# Verify API key in .env
cat backend/.env | grep PINECONE_API_KEY

# Ensure key format: pc-xxxxxxxxxxxxxxxxxxxxx

# Test connection
curl https://controller.us-east-1.pinecone.io/actions/whoami \
  -H "Api-Key: ${PINECONE_API_KEY}"
```

---

### Issue: OpenAI rate limits

**Error:** `RateLimitError: Rate limit exceeded`

**Solution:**

```bash
# 1. Check billing enabled at platform.openai.com
# 2. Increase rate limits (if on paid plan)
# 3. Use slower model (gpt-3.5-turbo instead of gpt-4o-mini)
# 4. Implement request throttling (future feature)
```

---

### Issue: Frontend shows "API error"

**Check:**

```bash
# 1. Backend running?
curl http://localhost:4001/health

# 2. CORS enabled in backend?
# Should be enabled in development mode automatically

# 3. Check browser console for actual error
# Network tab → Failed request → Preview

# 4. Check backend logs for errors
# Terminal running npm run dev
```

---

## Testing

### Manual Testing Checklist

```bash
# Authentication
[ ] Register new user
[ ] Login with valid credentials
[ ] Login with invalid credentials (should fail)
[ ] Logout
[ ] Access protected route without login (should redirect)

# Document Management
[ ] Upload PDF file
[ ] Upload TXT file
[ ] View document list
[ ] Delete document
[ ] Search documents by name

# Chat
[ ] Send message without RAG
[ ] Send message with RAG (after uploading doc)
[ ] View chat history
[ ] Create new chat session
[ ] Export chat session

# Admin (if admin user)
[ ] View system settings
[ ] Update system settings
[ ] View user list
```

### Automated Tests (Future)

```bash
# Backend tests
cd backend
npm test

# Frontend tests
cd frontend
npm test

# E2E tests
npm run test:e2e
```

---

## Code Style & Linting

### ESLint Configuration

Both backend and frontend use ESLint:

```bash
# Lint backend
cd backend
npm run lint

# Lint frontend
cd frontend
npm run lint

# Auto-fix issues
npm run lint -- --fix
```

### TypeScript

All code is written in TypeScript for type safety:

```bash
# Type check (no compilation)
cd backend
npx tsc --noEmit

cd frontend
npx tsc --noEmit
```

### Prettier (Recommended)

```bash
# Install
npm install -g prettier

# Format code
prettier --write "src/**/*.ts"
```

---

## Git Workflow

### Branch Strategy

```bash
# Main branches
main              # Production deployment
staging           # Staging deployment
local-ollama-dev  # Development (current work)

# Feature branches
feature/xyz       # New feature
fix/xyz           # Bug fix
```

### Commit Guidelines

```bash
# Good commit messages
git commit -m "feat: Add document export endpoint"
git commit -m "fix: Resolve session timeout issue"
git commit -m "docs: Update API documentation"

# Bad commit messages
git commit -m "changes"
git commit -m "fix"
git commit -m "update"
```

### Before Committing

```bash
# 1. Lint code
npm run lint

# 2. Type check
npx tsc --noEmit

# 3. Test manually
# (automated tests coming soon)

# 4. Commit
git add .
git commit -m "feat: Add new feature"

# 5. Push
git push origin local-ollama-dev
```

---

## VS Code Setup (Recommended)

### Extensions

Install these VS Code extensions:

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "mongodb.mongodb-vscode",
    "bradlc.vscode-tailwindcss",
    "ms-vscode.vscode-typescript-next"
  ]
}
```

### Settings

Create `.vscode/settings.json`:

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "typescript.tsdk": "node_modules/typescript/lib",
  "eslint.validate": ["javascript", "typescript"],
  "files.exclude": {
    "**/.git": true,
    "**/.DS_Store": true,
    "**/node_modules": true,
    "**/dist": true,
    "**/.next": true
  }
}
```

### Launch Configuration

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Backend",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "cwd": "${workspaceFolder}/backend",
      "console": "integratedTerminal"
    }
  ]
}
```

---

## Performance Tips

### Development Mode

```bash
# Speed up backend restarts
# Use ts-node-dev with transpile-only
# Already configured in package.json

# Speed up frontend builds
# Next.js Fast Refresh is already enabled

# Reduce logs in development
export LOG_LEVEL=info  # Instead of debug
```

### Database Optimization

```bash
# Create indexes for frequently queried fields
mongosh gkchatty

db.users.createIndex({ email: 1 }, { unique: true })
db.users.createIndex({ username: 1 }, { unique: true })
db.documents.createIndex({ userId: 1 })
db.chatsessions.createIndex({ userId: 1 })
db.chatsessions.createIndex({ createdAt: -1 })
```

---

## Next Steps

After completing local development setup:

1. **Build a feature** - Try adding a simple endpoint
2. **Deploy to staging** - See `docs/deployment/NETLIFY-DEPLOYMENT.md`
3. **Review architecture** - See `docs/architecture/CURRENT-STACK.md`
4. **Plan hybrid mode** - See `CLEANUP-AND-MERGE-PLAN.md`

---

## Related Documentation

- **Architecture:** `docs/architecture/CURRENT-STACK.md`
- **Deployment:** `docs/deployment/NETLIFY-DEPLOYMENT.md`
- **Version Audit:** `../../TRUTH-VERSION-AUDIT.md`
- **Merge Plan:** `../../CLEANUP-AND-MERGE-PLAN.md`

---

## Getting Help

**Common Resources:**
- Express.js docs: https://expressjs.com
- Next.js docs: https://nextjs.org/docs
- MongoDB docs: https://www.mongodb.com/docs
- Pinecone docs: https://docs.pinecone.io
- OpenAI docs: https://platform.openai.com/docs

**Debugging:**
- Check backend logs (terminal running `npm run dev`)
- Check browser console (F12 → Console)
- Check MongoDB data (`mongosh gkchatty`)
- Check Pinecone dashboard (https://app.pinecone.io)

---

**Last Updated:** 2025-11-14
**Maintainer:** David Morin
**Status:** Development guide for cloud-only mode
