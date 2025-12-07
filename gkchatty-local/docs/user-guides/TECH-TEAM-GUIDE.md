# GKChatty Technical Operations Guide

**Version:** 1.0
**Last Updated:** December 2024

---

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Technology Stack](#technology-stack)
3. [Environment Setup](#environment-setup)
4. [Configuration Reference](#configuration-reference)
5. [Deployment](#deployment)
6. [Database Operations](#database-operations)
7. [Vector Database (Pinecone)](#vector-database-pinecone)
8. [External Services](#external-services)
9. [API Reference](#api-reference)
10. [Security Configuration](#security-configuration)
11. [Monitoring & Logging](#monitoring--logging)
12. [Performance Tuning](#performance-tuning)
13. [Backup & Recovery](#backup--recovery)
14. [Troubleshooting](#troubleshooting)
15. [Maintenance Procedures](#maintenance-procedures)

---

## System Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              CLIENTS                                    │
│                    (Web Browsers, Mobile Devices)                       │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Next.js)                              │
│                         Port: 4003 / Netlify                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  Chat UI    │  │  Admin UI   │  │  Auth UI    │  │  Doc Viewer │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         BACKEND (Express.js)                            │
│                         Port: 4001 / Render                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  Auth       │  │  Chat/RAG   │  │  Documents  │  │  Admin      │    │
│  │  Routes     │  │  Routes     │  │  Routes     │  │  Routes     │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
│                              │                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      SERVICES LAYER                              │   │
│  │  RAG Service │ Persona Service │ Settings Service │ Email       │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
          │                    │                    │
          ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│    MongoDB      │  │    Pinecone     │  │   AWS S3        │
│  (Documents)    │  │   (Vectors)     │  │  (File Storage) │
└─────────────────┘  └─────────────────┘  └─────────────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │    OpenAI API   │
                  │  (LLM + Embed)  │
                  └─────────────────┘
```

### Component Breakdown

| Component | Technology | Port | Purpose |
|-----------|------------|------|---------|
| Frontend | Next.js 14, React 18 | 4003 | User interface |
| Backend | Express.js, TypeScript | 4001 | REST API |
| Database | MongoDB | 27017 | Data persistence |
| Vector DB | Pinecone | Cloud | Semantic search |
| File Storage | AWS S3 / Local | - | Document storage |
| LLM | OpenAI API | Cloud | Chat & embeddings |
| Cache | Redis (optional) | 6379 | Rate limiting |

---

## Technology Stack

### Backend

```json
{
  "runtime": "Node.js 18+",
  "framework": "Express.js",
  "language": "TypeScript",
  "database": "MongoDB (Mongoose ODM)",
  "vector_db": "Pinecone",
  "llm": "OpenAI API (GPT-4o, text-embedding-3-small)",
  "storage": "AWS S3 or local filesystem",
  "auth": "JWT (HTTP-only cookies)",
  "logging": "Pino"
}
```

### Frontend

```json
{
  "framework": "Next.js 14",
  "library": "React 18",
  "language": "TypeScript",
  "styling": "Tailwind CSS",
  "components": "Shadcn UI",
  "state": "React Context + Hooks"
}
```

### Infrastructure

```json
{
  "process_manager": "PM2",
  "containerization": "Docker (optional)",
  "frontend_hosting": "Netlify",
  "backend_hosting": "Render",
  "database_hosting": "MongoDB Atlas",
  "cdn": "Netlify Edge"
}
```

---

## Environment Setup

### Prerequisites

- Node.js 18+
- npm or pnpm
- MongoDB (local or Atlas)
- Pinecone account
- OpenAI API key
- AWS S3 bucket (optional)

### Directory Structure

```
gkchatty-local/
├── backend/
│   ├── src/
│   │   ├── config/          # Configuration constants
│   │   ├── controllers/     # Route handlers
│   │   ├── middleware/      # Express middleware
│   │   ├── models/          # Mongoose models
│   │   ├── routes/          # API routes
│   │   ├── services/        # Business logic
│   │   ├── utils/           # Utilities
│   │   └── index.ts         # Entry point
│   ├── dist/                # Compiled JS
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── app/             # Next.js pages
│   │   ├── components/      # React components
│   │   ├── contexts/        # React contexts
│   │   ├── hooks/           # Custom hooks
│   │   └── lib/             # Utilities
│   └── package.json
├── ecosystem.config.js      # PM2 config
├── .env                     # Environment variables
└── netlify.toml             # Netlify config
```

### Local Development Setup

```bash
# Clone repository
git clone https://github.com/dmos82/gkchatty-local-v2.git
cd gkchatty-local

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install

# Copy environment template
cd ../backend
cp .env.example .env
# Edit .env with your values

# Start development servers
# Terminal 1: Backend
cd backend && npm run dev

# Terminal 2: Frontend
cd frontend && npm run dev
```

---

## Configuration Reference

### Backend Environment Variables

Create `backend/.env`:

```bash
# ===========================================
# SERVER CONFIGURATION
# ===========================================
NODE_ENV=development              # development | staging | production
PORT=4001                         # API port
FRONTEND_URL=http://localhost:4003   # CORS origin

# ===========================================
# DATABASE
# ===========================================
MONGO_URI=mongodb://localhost:27017/gkchatty
# For Atlas:
# MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/gkchatty

# ===========================================
# AUTHENTICATION
# ===========================================
JWT_SECRET=your-256-bit-secret-key-here
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# ===========================================
# OPENAI
# ===========================================
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxx
OPENAI_PRIMARY_CHAT_MODEL=gpt-4o-mini     # gpt-4o | gpt-4o-mini | gpt-3.5-turbo
OPENAI_FALLBACK_CHAT_MODEL=gpt-3.5-turbo
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_HTTP_TIMEOUT_MS=90000
OPENAI_MAX_COMPLETION_TOKENS=8192
OPENAI_CHAT_MAX_RETRIES=1

# ===========================================
# PINECONE (Vector Database)
# ===========================================
PINECONE_API_KEY=pcsk_xxxxxxxxxxxx
PINECONE_ENVIRONMENT=us-east-1
PINECONE_INDEX_NAME=gkchatty-sandbox
PINECONE_NAMESPACE=_default_        # or environment-specific

# ===========================================
# FILE STORAGE
# ===========================================
FILE_STORAGE_MODE=local              # local | s3

# For S3:
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_BUCKET_NAME=gkchatty-documents
AWS_REGION=us-east-2

# For local:
SYSTEM_KB_PATH=/tmp/gkchatty/uploads/system
USER_DOCS_PATH=/tmp/gkchatty/uploads/user

# ===========================================
# REDIS (Optional - for rate limiting)
# ===========================================
REDIS_URL=redis://localhost:6379
# REDIS_PASSWORD=optional-password

# ===========================================
# EMAIL (Optional)
# ===========================================
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
EMAIL_FROM=your-email@gmail.com

# ===========================================
# FEATURE FLAGS
# ===========================================
FEATURE_OLLAMA_MODELS=false
FEATURE_SMART_ROUTING=false
FEATURE_SHOW_MODEL_USED=true
FEATURE_ALLOW_GENERAL_QUESTIONS=true

# ===========================================
# SECURITY
# ===========================================
ENCRYPTION_KEY=your-64-char-hex-key
ADMIN_SECRET_KEY=your-admin-secret
COOKIE_DOMAIN=localhost             # .yourdomain.com for production
```

### Frontend Environment Variables

Create `frontend/.env.local`:

```bash
NEXT_PUBLIC_API_URL=http://localhost:4001
NEXT_PUBLIC_APP_NAME=GKChatty
```

---

## Deployment

### PM2 Production Deployment

**ecosystem.config.js:**

```javascript
module.exports = {
  apps: [
    {
      name: 'gkchatty-backend',
      script: './dist/index.js',
      cwd: './backend',
      instances: 4,                    // Cluster mode
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 4001
      },
      max_memory_restart: '1G',
      exp_backoff_restart_delay: 100,
      min_uptime: '10s',
      max_restarts: 10
    },
    {
      name: 'gkchatty-frontend',
      script: 'npm',
      args: 'start',
      cwd: './frontend',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 4003
      }
    }
  ]
};
```

**Commands:**

```bash
# Build
cd backend && npm run build
cd frontend && npm run build

# Start with PM2
pm2 start ecosystem.config.js

# Monitor
pm2 monit

# Logs
pm2 logs

# Restart
pm2 restart all

# Stop
pm2 stop all
```

### Netlify Deployment (Frontend)

**netlify.toml:**

```toml
[build]
  base = "gkchatty-local/frontend"
  command = "NODE_ENV=development npm install --legacy-peer-deps && npm run build"
  publish = ".next"

[build.environment]
  NODE_VERSION = "18"
  HUSKY = "0"

[context.production.environment]
  NODE_ENV = "production"

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
```

### Render Deployment (Backend)

**Environment Variables in Render Dashboard:**

Set all backend environment variables in Render's environment section.

**Build Command:**
```bash
cd backend && npm install && npm run build
```

**Start Command:**
```bash
cd backend && node dist/index.js
```

---

## Database Operations

### MongoDB Models

| Model | Collection | Purpose |
|-------|------------|---------|
| User | users | User accounts |
| Chat | chats | Chat sessions |
| UserDocument | userdocuments | User-uploaded files |
| SystemKbDocument | systemkbdocuments | System KB files |
| Persona | personas | AI personas |
| UserSettings | usersettings | User preferences |
| Feedback | feedbacks | User feedback |
| Folder | folders | Document organization |
| TenantKnowledgeBase | tenantkbs | Team KBs |
| Setting | settings | System settings |

### Common Operations

```bash
# Connect to MongoDB
mongosh "mongodb://localhost:27017/gkchatty"

# List collections
show collections

# Count users
db.users.countDocuments()

# Find admin users
db.users.find({ role: 'admin' })

# Check document count
db.userdocuments.countDocuments()
db.systemkbdocuments.countDocuments()

# View recent chats
db.chats.find().sort({ createdAt: -1 }).limit(5)
```

### Indexes

Ensure these indexes exist for performance:

```javascript
// Users
db.users.createIndex({ username: 1 }, { unique: true })
db.users.createIndex({ email: 1 }, { unique: true })

// Chats
db.chats.createIndex({ userId: 1, createdAt: -1 })

// Documents
db.userdocuments.createIndex({ userId: 1 })
db.systemkbdocuments.createIndex({ filename: 1 })
```

---

## Vector Database (Pinecone)

### Namespace Strategy

| Namespace | Content |
|-----------|---------|
| `system-kb` | System knowledge base vectors |
| `user-{userId}` | Per-user document vectors |
| `tenant-{tenantId}` | Tenant KB vectors |

### Environment Isolation

For multi-environment deployments:

| Environment | Index | Namespace Prefix |
|-------------|-------|------------------|
| Development | gkchatty-dev | dev_ |
| Staging | gkchatty-sandbox | staging_ |
| Production | gkchatty-prod | prod_ |

### Common Operations

```javascript
// Check namespace stats (via admin API)
GET /api/admin/pinecone-namespace-stats

// Re-index system KB
POST /api/admin/reindex-system-kb

// Re-index user documents
POST /api/admin/reindex-user-documents

// Purge orphaned vectors
POST /api/admin/purge-documents-from-default-namespace
```

### Vector Dimensions

- **Embedding Model**: text-embedding-3-small
- **Dimensions**: 1536
- **Metric**: Cosine similarity

---

## External Services

### OpenAI API

**Models Used:**

| Purpose | Model | Tokens |
|---------|-------|--------|
| Chat (Primary) | gpt-4o-mini | 128K context |
| Chat (Fallback) | gpt-3.5-turbo | 16K context |
| Embeddings | text-embedding-3-small | 8191 input |

**Rate Limits:**
- Tier 1: 500 RPM, 10K TPM
- Tier 2: 5000 RPM, 80K TPM
- Check your tier in OpenAI dashboard

### AWS S3

**Bucket Structure:**
```
gkchatty-documents/
├── system-kb/
│   └── {documentId}.pdf
├── users/
│   └── {userId}/
│       └── {documentId}.pdf
└── tenants/
    └── {tenantId}/
        └── {documentId}.pdf
```

**Required Permissions:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::gkchatty-documents",
        "arn:aws:s3:::gkchatty-documents/*"
      ]
    }
  ]
}
```

---

## API Reference

### Health Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Overall health check |
| `/ready` | GET | Kubernetes readiness probe |
| `/alive` | GET | Kubernetes liveness probe |

### Authentication

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/auth/login` | POST | User login |
| `/api/auth/logout` | POST | User logout |
| `/api/auth/register` | POST | User registration |

### Chat

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/chats` | POST | Send message |
| `/api/chats` | GET | List chats |
| `/api/chats/:id` | GET | Get chat |
| `/api/chats/:id` | DELETE | Delete chat |
| `/api/chats/latest` | GET | Get latest chat |

### Admin (Requires Admin Role)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/admin/users` | GET | List users |
| `/api/admin/users` | POST | Create user |
| `/api/admin/users/:id` | DELETE | Delete user |
| `/api/admin/system-kb/upload` | POST | Upload to System KB |
| `/api/admin/system-kb/documents` | GET | List System KB docs |
| `/api/admin/reindex-system-kb` | POST | Re-index System KB |
| `/api/admin/stats` | GET | System statistics |
| `/api/admin/server-info` | GET | Server info |

---

## Security Configuration

### Rate Limiting

**Default Limits (config/constants.ts):**

| Category | Production | Development |
|----------|------------|-------------|
| Standard | 100 req/15min | 10000 req/15min |
| Auth | 20 req/min | 200 req/min |
| AI/Chat | 500 req/min | 1000 req/min |
| Upload | 150 req/5min | 1500 req/5min |
| Admin | 200 req/15min | 2000 req/15min |

### Security Headers

Applied via Helmet.js:
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- X-XSS-Protection: 1; mode=block
- Referrer-Policy: strict-origin-when-cross-origin

### CORS Configuration

```javascript
// Dynamic CORS based on FRONTEND_URL
const corsOptions = {
  origin: process.env.FRONTEND_URL,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
```

### JWT Configuration

- Algorithm: HS256
- Expiry: 24 hours (configurable)
- Storage: HTTP-only cookies
- Secure: true in production

---

## Monitoring & Logging

### Log Locations

```
logs/
├── app.log           # Application logs
├── error.log         # Error logs
└── access.log        # HTTP access logs
```

### Log Levels

| Level | When Used |
|-------|-----------|
| error | Errors requiring attention |
| warn | Potential issues |
| info | Normal operations |
| debug | Detailed debugging (dev only) |

### Structured Logging Format

```json
{
  "level": "info",
  "time": 1699123456789,
  "correlationId": "abc-123",
  "msg": "Chat message received",
  "userId": "user123",
  "chatId": "chat456"
}
```

### Health Monitoring

```bash
# Check health endpoint
curl http://localhost:4001/health

# Expected response
{
  "status": "healthy",
  "timestamp": "2024-12-04T12:00:00Z",
  "uptime": 86400,
  "mongodb": "connected",
  "version": "1.0.0"
}
```

---

## Performance Tuning

### Node.js Configuration

```bash
# Increase memory limit
NODE_OPTIONS="--max-old-space-size=2048"

# Enable cluster mode (via PM2)
instances: 4  # or 'max' for all CPUs
```

### MongoDB Optimization

```bash
# Connection string optimization
mongodb://...?maxPoolSize=200&minPoolSize=10&serverSelectionTimeoutMS=5000
```

### Pinecone Optimization

- Batch upserts: 100 vectors per request
- Use metadata filtering to reduce search scope
- Monitor index utilization

### Caching Strategy

- Redis for session storage (if enabled)
- Rate limit counters in Redis
- Consider caching frequent API responses

---

## Backup & Recovery

### MongoDB Backup

```bash
# Full backup
mongodump --uri="mongodb://localhost:27017/gkchatty" --out=/backup/$(date +%Y%m%d)

# Restore
mongorestore --uri="mongodb://localhost:27017/gkchatty" /backup/20241204
```

### S3 Backup

Enable versioning on S3 bucket for automatic file history.

### Pinecone

Pinecone handles replication automatically. For disaster recovery:
1. Keep MongoDB document metadata as source of truth
2. Re-index from stored documents if needed

---

## Troubleshooting

### Common Issues

**Server won't start:**
```bash
# Check for port conflicts
lsof -i :4001
lsof -i :4003

# Check logs
pm2 logs gkchatty-backend
```

**MongoDB connection failed:**
```bash
# Verify MongoDB is running
mongosh --eval "db.adminCommand('ping')"

# Check connection string
echo $MONGO_URI
```

**Pinecone errors:**
```bash
# Verify API key
curl -H "Api-Key: $PINECONE_API_KEY" \
  https://controller.$PINECONE_ENVIRONMENT.pinecone.io/databases

# Check index exists
GET /api/admin/pinecone-stats
```

**OpenAI API errors:**
```bash
# Test API key
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"

# Check rate limits in OpenAI dashboard
```

**File upload failures:**
```bash
# Check disk space
df -h

# Check file permissions
ls -la $SYSTEM_KB_PATH
ls -la $USER_DOCS_PATH

# For S3, check credentials
aws s3 ls s3://$AWS_BUCKET_NAME
```

### Debug Mode

Enable detailed logging:
```bash
DEBUG=* npm run dev
```

---

## Maintenance Procedures

### Regular Maintenance

**Daily:**
- Check health endpoints
- Review error logs
- Monitor disk usage

**Weekly:**
- Review usage statistics
- Check for orphaned documents
- Verify backup integrity

**Monthly:**
- Rotate API keys
- Review user access
- Update dependencies
- Security patches

### Scaling Procedures

**For 50+ concurrent users:**

1. Increase PM2 instances:
```javascript
instances: 'max'  // Use all CPU cores
```

2. Enable Redis:
```bash
REDIS_URL=redis://your-redis-host:6379
```

3. Optimize MongoDB:
```bash
# Add read replicas for heavy read loads
# Enable connection pooling
```

4. Monitor and adjust rate limits as needed

---

## Quick Reference Commands

```bash
# Start development
cd backend && npm run dev
cd frontend && npm run dev

# Build for production
cd backend && npm run build
cd frontend && npm run build

# PM2 operations
pm2 start ecosystem.config.js
pm2 restart all
pm2 stop all
pm2 logs
pm2 monit

# Database
mongosh gkchatty
pm2 logs | grep -i error

# Health check
curl http://localhost:4001/health

# View environment
printenv | grep -E "MONGO|OPENAI|PINECONE"
```

---

*GKChatty Technical Operations Guide v1.0 - December 2024*
