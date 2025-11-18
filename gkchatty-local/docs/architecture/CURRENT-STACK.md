# GKChatty Local - Current Stack Architecture

**Version:** Cloud-Only Development (Pre-Hybrid)
**Last Updated:** 2025-11-14
**Status:** ☁️ Production (Cloud Services)

---

## Architecture Overview

GKChatty Local is currently a **cloud-based RAG platform** despite its name. It uses cloud services for all core functionality:

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (Port 4003)                  │
│                  Next.js 14 + React 18                   │
└─────────────────┬───────────────────────────────────────┘
                  │ HTTP/REST API
┌─────────────────▼───────────────────────────────────────┐
│                   Backend (Port 4001)                    │
│              Express.js + TypeScript                     │
│  ┌──────────────┬──────────────┬────────────────────┐   │
│  │   MongoDB    │   Pinecone   │   OpenAI API       │   │
│  │   (User DB)  │  (Vectors)   │   (LLM + Embed)    │   │
│  └──────────────┴──────────────┴────────────────────┘   │
└──────────────────────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────┐
│              Cloud Infrastructure                        │
│  ┌──────────────┬──────────────┬────────────────────┐   │
│  │ MongoDB      │ Pinecone     │ OpenAI             │   │
│  │ (local or    │ us-east-1    │ gpt-4o-mini        │   │
│  │  Atlas)      │              │ text-embed-3-small │   │
│  └──────────────┴──────────────┴────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

---

## Technology Stack

### Frontend

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| **Framework** | Next.js | 14.x | React framework with SSR/SSG |
| **UI Library** | React | 18.x | Component-based UI |
| **Language** | TypeScript | 5.x | Type-safe development |
| **Styling** | Tailwind CSS | 3.x | Utility-first CSS |
| **HTTP Client** | Fetch API | Native | API communication |
| **State** | React Context | Native | Global state management |

**Port:** 4003
**Entry Point:** `frontend/pages/_app.tsx`

### Backend

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| **Framework** | Express.js | 4.x | REST API server |
| **Language** | TypeScript | 5.x | Type-safe development |
| **Runtime** | Node.js | 18+ | JavaScript runtime |
| **Database ORM** | Mongoose | 8.x | MongoDB object modeling |
| **Auth** | JWT | 9.x | Token-based authentication |
| **Logging** | Pino | 8.x | Structured logging |
| **Validation** | Joi | 17.x | Request validation |

**Port:** 4001
**Entry Point:** `backend/src/index.ts`

### Data Layer

#### Database (MongoDB)

- **Type:** Document database
- **Mode:** Local development or MongoDB Atlas
- **Connection:** `mongodb://localhost:27017/gkchatty`
- **Collections:**
  - `users` - User accounts and profiles
  - `documents` - Uploaded documents metadata
  - `chatsessions` - Chat conversation history
  - `projects` - User projects organization
  - `settings` - Application settings
  - `systemfolders` - System folder hierarchy

**Schema Highlights:**
```typescript
// User Schema
{
  username: string;
  email: string;
  passwordHash: string;
  activeSessionIds: string[];  // Array of JWT IDs for concurrent sessions
  isAdmin: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

#### Vector Database (Pinecone)

- **Type:** Cloud vector database
- **Environment:** us-east-1
- **Index:** gkchatty-sandbox (development)
- **Dimensions:** 1536 (OpenAI text-embedding-3-small)
- **Metric:** Cosine similarity
- **Namespaces:** User-specific isolation

**Usage:**
- Store document embeddings
- Semantic search queries
- RAG context retrieval

#### LLM Provider (OpenAI)

**Chat Models:**
- Primary: `gpt-4o-mini` (fast, cost-effective)
- Fallback: `gpt-3.5-turbo` (if primary unavailable)

**Embedding Model:**
- `text-embedding-3-small` (1536 dimensions)

**API Integration:**
- Direct OpenAI API calls
- Streaming responses supported
- Rate limiting handled

### File Storage

- **Type:** Local filesystem (development)
- **Production:** AWS S3 (planned)
- **Path:** `backend/uploads/`
- **Supported Types:** PDF, TXT, MD, DOCX, CSV

---

## Authentication & Authorization

### Session Management

**Strategy:** JWT with concurrent session support

**Flow:**
1. User logs in → Server generates JWT with unique `jti` (JWT ID)
2. `jti` added to user's `activeSessionIds` array in MongoDB
3. Client stores JWT in httpOnly cookie
4. Every request → Middleware validates JWT and checks `jti` exists in array
5. User can have up to 10 concurrent sessions
6. Logout → `jti` removed from array

**Security Features:**
- HttpOnly cookies (XSS protection)
- JWT expiration (configurable)
- Session array validation (prevents token replay)
- CSRF protection (coming soon)

**Middleware:**
- `authMiddleware.ts:authenticateJWT` - Validates JWT signature
- `authMiddleware.ts:checkSession` - Validates session in database

### Authorization

**Roles:**
- `user` - Standard user access
- `admin` - Full system access

**Implementation:**
- Role stored in `users.isAdmin` field
- Checked in route middleware
- Admin-only endpoints protected

---

## API Architecture

### REST API Design

**Base URL:** `http://localhost:4001/api`

**Endpoint Categories:**

1. **Authentication** (`/api/auth`)
   - POST `/login` - User login
   - POST `/logout` - User logout
   - POST `/register` - New user registration
   - GET `/profile` - Get current user profile

2. **Chat** (`/api/chat`)
   - POST `/` - Send chat message
   - POST `/stream` - Streaming chat (SSE)
   - GET `/sessions` - List user sessions
   - GET `/sessions/:id` - Get session messages
   - POST `/sessions/:id/export` - Export session

3. **Documents** (`/api/documents`)
   - POST `/upload` - Upload document
   - GET `/` - List user documents
   - GET `/:id` - Get document details
   - DELETE `/:id` - Delete document
   - POST `/search` - Semantic search

4. **Projects** (`/api/projects`)
   - POST `/` - Create project
   - GET `/` - List projects
   - PUT `/:id` - Update project
   - DELETE `/:id` - Delete project

5. **Admin** (`/api/admin`)
   - GET `/settings` - Get system settings
   - PUT `/settings` - Update system settings
   - GET `/users` - List all users
   - GET `/stats` - System statistics

**Request/Response Format:**
- Content-Type: `application/json`
- Authentication: JWT in httpOnly cookie
- Error format:
```json
{
  "message": "Error description",
  "code": "ERROR_CODE",
  "details": {}
}
```

---

## Data Flow

### Document Upload & Processing

```
1. User uploads file (frontend)
   ↓
2. POST /api/documents/upload (backend)
   ↓
3. File saved to disk
   ↓
4. Text extracted (pdf-parse, etc.)
   ↓
5. Text chunked (1000 chars, 200 overlap)
   ↓
6. OpenAI embeddings generated
   ↓
7. Vectors stored in Pinecone (user namespace)
   ↓
8. Document metadata saved to MongoDB
   ↓
9. Response sent to frontend
```

### Chat with RAG

```
1. User sends message (frontend)
   ↓
2. POST /api/chat (backend)
   ↓
3. Message embedded (OpenAI)
   ↓
4. Vector search in Pinecone (top 5 results)
   ↓
5. Context retrieved from matched documents
   ↓
6. Prompt constructed: system + context + history + user message
   ↓
7. OpenAI chat completion requested
   ↓
8. Response streamed back (or returned at once)
   ↓
9. Message saved to MongoDB (chatsessions)
   ↓
10. Response rendered in frontend
```

---

## Environment Configuration

### Required Environment Variables

```bash
# Core Settings
PORT=4001
NODE_ENV=development
JWT_SECRET=your-secret-key

# Database
MONGODB_URI=mongodb://localhost:27017/gkchatty

# Pinecone
PINECONE_API_KEY=your-key
PINECONE_ENVIRONMENT=us-east-1
PINECONE_INDEX_NAME=gkchatty-sandbox

# OpenAI
OPENAI_API_KEY=your-key
OPENAI_PRIMARY_CHAT_MODEL=gpt-4o-mini
OPENAI_FALLBACK_CHAT_MODEL=gpt-3.5-turbo
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

# Storage (currently only 'cloud' works)
GKCHATTY_STORAGE=cloud

# AWS S3 (future)
AWS_REGION=us-east-2
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
AWS_BUCKET_NAME=your-bucket
```

---

## Deployment Architecture

### Development (Current)

- **Backend:** Local Node.js server (port 4001)
- **Frontend:** Next.js dev server (port 4003)
- **MongoDB:** Local instance (`mongod`)
- **Pinecone:** Cloud service (us-east-1)
- **OpenAI:** Cloud API

### Staging (Netlify)

- **Platform:** Netlify
- **Branch:** `staging` or `main`
- **Backend:** Netlify Functions (serverless)
- **Frontend:** Static export (SSG)
- **MongoDB:** MongoDB Atlas
- **Pinecone:** Cloud service (production index)
- **OpenAI:** Cloud API

**Netlify Config:**
```toml
[build]
  base = "gkchatty-local"
  command = "npm run build"
  publish = "frontend/out"
```

### Production (Planned)

- Same as staging but with:
  - Production MongoDB Atlas cluster
  - Production Pinecone index
  - Rate limiting enabled
  - Enhanced monitoring
  - CDN for static assets

---

## Code Organization

```
gkchatty-local/
├── backend/
│   ├── src/
│   │   ├── controllers/       # Request handlers
│   │   ├── middleware/        # Express middleware
│   │   ├── models/            # Mongoose schemas
│   │   ├── routes/            # API route definitions
│   │   ├── services/          # Business logic
│   │   ├── utils/             # Helpers and adapters
│   │   │   ├── local/         # Local storage (unused currently)
│   │   │   ├── mongoHelper.ts # MongoDB connection
│   │   │   ├── pineconeService.ts # Pinecone client
│   │   │   └── storageAdapter.ts  # Storage abstraction
│   │   └── index.ts           # Entry point
│   ├── uploads/               # File storage
│   ├── .env                   # Environment config
│   └── package.json
├── frontend/
│   ├── pages/                 # Next.js pages
│   ├── components/            # React components
│   ├── lib/                   # Utilities
│   ├── public/                # Static assets
│   └── package.json
├── docs/                      # Documentation
└── README.md
```

---

## Partially Implemented Features

### Local Storage (Not Connected)

Code exists in `backend/src/utils/local/` but is **NOT integrated**:

- `sqliteHelper.ts` - SQLite database adapter (not imported)
- `chromaService.ts` - ChromaDB vector storage (not imported)
- `embeddingService.ts` - Local embeddings (not imported)

**Status:** Planned for future hybrid mode integration

**Entry Point:** `index.ts` currently imports `mongoHelper`, NOT `sqliteHelper`

### Ollama Integration (Partially Built)

- `ollamaHelper.ts` exists but not used
- Code on branch `local-ollama-dev`
- Not yet merged to main

---

## Known Limitations

1. **Storage Mode:** Only cloud mode works (local mode partially implemented)
2. **File Storage:** Local filesystem only (S3 planned)
3. **Scalability:** Single server (no load balancing)
4. **Monitoring:** Basic logging only (no APM)
5. **Caching:** No Redis or caching layer
6. **Rate Limiting:** Not implemented
7. **CSRF Protection:** Not implemented

---

## Performance Characteristics

### Typical Response Times (Development)

| Operation | Time | Notes |
|-----------|------|-------|
| User Login | 200-500ms | MongoDB + JWT generation |
| Document Upload (1MB PDF) | 1-2s | File save + embedding + Pinecone |
| Chat Message (no RAG) | 500ms-2s | OpenAI API latency |
| Chat Message (with RAG) | 1-3s | Pinecone search + OpenAI |
| Vector Search | 200-500ms | Pinecone latency |
| Database Query | 50-200ms | MongoDB local |

### Scalability

- **Concurrent Users:** ~50-100 (single server)
- **Document Limit:** Limited by Pinecone quota
- **Message Throughput:** Limited by OpenAI rate limits

---

## Security Considerations

### Current Implementation

- ✅ JWT authentication with httpOnly cookies
- ✅ Password hashing (bcrypt)
- ✅ Environment variable secrets
- ✅ User data isolation (Pinecone namespaces)
- ✅ Input validation (Joi schemas)

### Missing (Planned)

- ❌ CSRF protection
- ❌ Rate limiting
- ❌ Request throttling
- ❌ API key rotation
- ❌ Audit logging
- ❌ Two-factor authentication

---

## Monitoring & Observability

### Logging

- **Library:** Pino (structured JSON logs)
- **Levels:** debug, info, warn, error
- **Output:** Console (development), files (production planned)

**Example Log:**
```json
{
  "level": 30,
  "time": 1699982400000,
  "pid": 12345,
  "hostname": "localhost",
  "msg": "User authenticated successfully",
  "userId": "user_123",
  "username": "john"
}
```

### Health Checks

- **Endpoint:** GET `/health`
- **Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-11-14T20:00:00Z",
  "services": {
    "mongodb": "connected",
    "pinecone": "connected",
    "openai": "connected"
  }
}
```

---

## Future Architecture (Hybrid Mode)

**Planned:** Merge features from `gkchatty-pure` to support:

```
┌─────────────────────────────────────────┐
│         GKCHATTY_STORAGE=cloud           │
│  MongoDB + Pinecone + OpenAI (current)  │
└─────────────────────────────────────────┘
              OR
┌─────────────────────────────────────────┐
│         GKCHATTY_STORAGE=local           │
│   SQLite + ChromaDB + Ollama (planned)  │
└─────────────────────────────────────────┘
```

**Implementation Strategy:**
- Storage adapter pattern (already exists)
- Feature flags for gradual rollout
- API contract preservation (no breaking changes)
- See `CLEANUP-AND-MERGE-PLAN.md` for details

---

## Related Documentation

- **Deployment:** `docs/deployment/NETLIFY-DEPLOYMENT.md`
- **Development:** `docs/development/LOCAL-DEVELOPMENT.md`
- **Version Audit:** `../TRUTH-VERSION-AUDIT.md`
- **Merge Plan:** `../CLEANUP-AND-MERGE-PLAN.md`

---

**Last Updated:** 2025-11-14
**Maintainer:** David Morin
**Status:** Cloud-only (hybrid mode planned)
