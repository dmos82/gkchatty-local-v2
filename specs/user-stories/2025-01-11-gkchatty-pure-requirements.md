# gkchatty-pure HOME EDITION - Requirements Document

## Project Overview

**Project Name:** gkchatty-pure HOME EDITION
**Version:** 1.0.0
**Target Release:** Phase 1 (160 hours)
**Architecture:** 100% local RAG platform with zero cloud dependencies

### Vision

Create a privacy-first, fully local RAG platform by forking gkchatty-local and replacing all cloud dependencies (MongoDB → SQLite, Pinecone → ChromaDB, OpenAI → Ollama). The HOME EDITION targets single-user personal use cases with document upload, RAG chat, and basic auth.

### Key Differentiators

1. **100% Local:** All data stored in `~/.gkchatty-pure/` (no cloud services)
2. **Zero API Keys:** Uses Ollama for embeddings and LLM inference
3. **Privacy-First:** User retains full control of documents and conversations
4. **Frontend Compatibility:** Zero frontend changes (identical UI to gkchatty-local)
5. **Performance Parity:** Matches or exceeds cloud version speed

---

## User Stories

### End User Stories

#### US-1: Easy Installation
**As a user**, I want to install gkchatty-pure with a single command so that I can start using the RAG platform without complex setup.

**Acceptance Criteria:**
- AC-1.1: Installation script creates `~/.gkchatty-pure/` directory structure
- AC-1.2: Installation script initializes SQLite database with schema
- AC-1.3: Installation script starts backend server on localhost:3001
- AC-1.4: Installation completes in < 2 minutes

**Priority:** P0 (Blocker)

---

#### US-2: Ollama Health Check
**As a user**, I want the system to automatically check if Ollama is running so that I receive clear error messages if dependencies are missing.

**Acceptance Criteria:**
- AC-2.1: Ollama health check runs on server startup
- AC-2.2: Clear error message displayed if Ollama is not running
- AC-2.3: Health check verifies mxbai-embed-large model is available

**Priority:** P0 (Blocker)

---

#### US-3: User Signup
**As a user**, I want to sign up with email/password so that I can create a personal account for document storage.

**Acceptance Criteria:**
- AC-3.1: Signup endpoint accepts email, password, username
- AC-3.2: Passwords hashed with bcrypt before storage
- AC-3.3: SQLite users table stores user credentials
- AC-3.4: Duplicate email registration returns 400 error

**Priority:** P0 (Blocker)

---

#### US-4: User Login
**As a user**, I want to log in with my credentials so that I can access my documents and chat history.

**Acceptance Criteria:**
- AC-4.1: Login endpoint validates credentials against SQLite
- AC-4.2: JWT token issued on successful login
- AC-4.3: JWT includes user_id and expires in 7 days

**Priority:** P0 (Blocker)

---

#### US-5: Document Upload
**As a user**, I want to upload documents (PDF, TXT, DOCX, MD) to my local filesystem so that I can query them with RAG.

**Acceptance Criteria:**
- AC-5.1: Upload endpoint accepts multipart/form-data
- AC-5.2: Documents saved to `~/.gkchatty-pure/documents/{user_id}/`
- AC-5.3: Supported formats: PDF, TXT, DOCX, MD
- AC-5.4: File metadata stored in SQLite documents table

**Priority:** P0 (Blocker)

---

#### US-6: Document Embedding
**As a user**, I want uploaded documents to be automatically chunked and embedded using Ollama so that they are searchable.

**Acceptance Criteria:**
- AC-6.1: Document chunking uses 512-token chunks with 50-token overlap
- AC-6.2: Ollama mxbai-embed-large generates embeddings for each chunk
- AC-6.3: Embeddings stored in ChromaDB collection per user
- AC-6.4: Chunking completes in < 5 seconds per 1MB document

**Priority:** P0 (Blocker)

---

#### US-7: RAG Chat
**As a user**, I want to chat with my documents using natural language so that I can extract insights without manual searching.

**Acceptance Criteria:**
- AC-7.1: Chat endpoint accepts user message and optional conversation_id
- AC-7.2: RAG retrieves top 5 relevant chunks from ChromaDB
- AC-7.3: Ollama LLM generates response with retrieved context
- AC-7.4: Response time < 10 seconds for queries

**Priority:** P0 (Blocker)

---

#### US-8: Source Citations
**As a user**, I want RAG responses to include source citations so that I can verify information accuracy.

**Acceptance Criteria:**
- AC-8.1: RAG responses include sources array with document names and page numbers
- AC-8.2: Each source links to original document chunk
- AC-8.3: Sources displayed in frontend chat UI

**Priority:** P1 (High)

---

#### US-9: Chat History
**As a user**, I want to view my chat history so that I can reference previous conversations.

**Acceptance Criteria:**
- AC-9.1: Chat history stored in SQLite messages table
- AC-9.2: GET /chat/history/{conversation_id} returns message array
- AC-9.3: History includes user messages, assistant responses, and timestamps

**Priority:** P1 (High)

---

#### US-10: Document Deletion
**As a user**, I want to delete my uploaded documents so that I can manage my storage space.

**Acceptance Criteria:**
- AC-10.1: DELETE /documents/{document_id} removes file from filesystem
- AC-10.2: DELETE removes embeddings from ChromaDB
- AC-10.3: DELETE removes metadata from SQLite

**Priority:** P1 (High)

---

#### US-11: Local Data Storage
**As a user**, I want all data stored locally in `~/.gkchatty-pure/` so that I have full control over my data privacy.

**Acceptance Criteria:**
- AC-11.1: All SQLite databases stored in `~/.gkchatty-pure/data/`
- AC-11.2: All ChromaDB collections stored in `~/.gkchatty-pure/chroma/`
- AC-11.3: All uploaded files stored in `~/.gkchatty-pure/documents/`

**Priority:** P0 (Blocker)

---

#### US-12: Frontend Compatibility
**As a user**, I want the frontend UI to remain identical to gkchatty-local so that I have a familiar user experience.

**Acceptance Criteria:**
- AC-12.1: Frontend assets unchanged from gkchatty-local
- AC-12.2: All API endpoints return identical response structures
- AC-12.3: Frontend environment variables point to localhost:3001

**Priority:** P0 (Blocker)

---

### Developer Stories

#### US-13: MongoDB → SQLite Migration
**As a developer**, I want to replace MongoDB with SQLite so that the system has no cloud dependencies.

**Acceptance Criteria:**
- AC-13.1: All 13 Mongoose models converted to SQLite schemas
- AC-13.2: All MongoDB queries replaced with SQLite queries
- AC-13.3: Zero MongoDB references in codebase

**Priority:** P0 (Blocker)
**Estimated Effort:** 40 hours

---

#### US-14: Pinecone → ChromaDB Migration
**As a developer**, I want to replace Pinecone with ChromaDB so that vector storage is fully local.

**Acceptance Criteria:**
- AC-14.1: Pinecone vector operations replaced with ChromaDB
- AC-14.2: Zero Pinecone references in codebase
- AC-14.3: ChromaDB persistence configured to `~/.gkchatty-pure/chroma/`

**Priority:** P0 (Blocker)
**Estimated Effort:** 20 hours

---

#### US-15: OpenAI → Ollama Migration
**As a developer**, I want to replace OpenAI embeddings with Ollama embeddings so that no API keys are required.

**Acceptance Criteria:**
- AC-15.1: OpenAI embedding calls replaced with Ollama
- AC-15.2: Zero OpenAI API key requirements
- AC-15.3: Embedding dimensions match mxbai-embed-large (1024)

**Priority:** P0 (Blocker)
**Estimated Effort:** 15 hours

---

#### US-16: Local Infrastructure Reuse
**As a developer**, I want to reuse existing local infrastructure (sqliteHelper.ts, chromaService.ts, embeddingService.ts) so that development is faster.

**Acceptance Criteria:**
- AC-16.1: sqliteHelper.ts used for all database operations
- AC-16.2: chromaService.ts used for all vector operations
- AC-16.3: embeddingService.ts used for all embedding generation

**Priority:** P0 (Blocker)
**Estimated Effort:** 10 hours (integration)

---

#### US-17: API Contract Preservation
**As a developer**, I want API response formats to remain unchanged so that the frontend requires zero modifications.

**Acceptance Criteria:**
- AC-17.1: POST /auth/signup returns {user, token}
- AC-17.2: POST /chat returns {message, sources, conversation_id}
- AC-17.3: GET /documents returns {documents: [...]}

**Priority:** P0 (Blocker)
**Estimated Effort:** 5 hours (validation)

---

#### US-18: Unit Testing
**As a developer**, I want comprehensive unit tests for all backend services so that reliability matches the cloud version.

**Acceptance Criteria:**
- AC-18.1: Unit tests for auth service (signup, login, JWT)
- AC-18.2: Unit tests for document service (upload, delete, list)
- AC-18.3: Unit tests for RAG service (chunk, embed, query)
- AC-18.4: 90% code coverage for backend services

**Priority:** P1 (High)
**Estimated Effort:** 25 hours

---

#### US-19: Integration Testing
**As a developer**, I want integration tests for the complete RAG pipeline so that end-to-end functionality is verified.

**Acceptance Criteria:**
- AC-19.1: Integration test: signup → upload → chat → verify response
- AC-19.2: Integration test: upload multiple docs → query across all
- AC-19.3: Integration test: delete document → verify removed from ChromaDB

**Priority:** P1 (High)
**Estimated Effort:** 20 hours

---

#### US-20: Performance Benchmarking
**As a developer**, I want performance benchmarks comparing gkchatty-pure to gkchatty-local so that I can verify performance is equal or better.

**Acceptance Criteria:**
- AC-20.1: Benchmark: Document upload speed (gkchatty-pure vs gkchatty-local)
- AC-20.2: Benchmark: RAG query latency (gkchatty-pure vs gkchatty-local)
- AC-20.3: Benchmark: Embedding generation speed (Ollama vs OpenAI)

**Priority:** P2 (Medium)
**Estimated Effort:** 10 hours

---

## Technical Requirements

### System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (React)                     │
│              [UNCHANGED FROM gkchatty-local]            │
└────────────────────────┬────────────────────────────────┘
                         │
                         │ HTTP/REST
                         │
┌────────────────────────▼────────────────────────────────┐
│                 Backend (Express + TS)                  │
│  ┌──────────┬──────────────┬───────────┬─────────────┐ │
│  │   Auth   │   Document   │    RAG    │    Chat     │ │
│  │ Service  │   Service    │  Service  │   Service   │ │
│  └────┬─────┴──────┬───────┴─────┬─────┴──────┬──────┘ │
│       │            │             │            │         │
│       ▼            ▼             ▼            ▼         │
│  ┌────────┬────────────┬─────────────┬─────────────┐  │
│  │ SQLite │ Filesystem │  ChromaDB   │   Ollama    │  │
│  │ Helper │   Helper   │   Service   │   Service   │  │
│  └────────┴────────────┴─────────────┴─────────────┘  │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│              ~/.gkchatty-pure/ (Data Dir)               │
│  ┌──────────┬───────────────┬─────────────┬─────────┐  │
│  │   data/  │  documents/   │   chroma/   │  logs/  │  │
│  │ (SQLite) │ (User Files)  │ (Vectors)   │ (Logs)  │  │
│  └──────────┴───────────────┴─────────────┴─────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Database Schema (SQLite)

#### Users Table
```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

#### Documents Table
```sql
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  filepath TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  chunk_count INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

#### Conversations Table
```sql
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

#### Messages Table
```sql
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  sources TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);
```

### ChromaDB Collections

- **Collection Name:** `user_{user_id}_documents`
- **Embedding Dimension:** 1024 (mxbai-embed-large)
- **Metadata Fields:**
  - `document_id`: Foreign key to documents table
  - `chunk_index`: Index of chunk within document
  - `chunk_text`: Raw text content
  - `page_number`: Page number (for PDFs)

### API Endpoints (Contract Preservation)

#### Authentication

```
POST /api/auth/signup
Request: { email, password, username }
Response: { user: { id, email, username }, token }

POST /api/auth/login
Request: { email, password }
Response: { user: { id, email, username }, token }

GET /api/auth/me
Headers: { Authorization: "Bearer {token}" }
Response: { user: { id, email, username } }
```

#### Documents

```
POST /api/documents/upload
Headers: { Authorization: "Bearer {token}" }
Request: multipart/form-data { file }
Response: { document: { id, filename, file_type, file_size, created_at } }

GET /api/documents
Headers: { Authorization: "Bearer {token}" }
Response: { documents: [...] }

DELETE /api/documents/:id
Headers: { Authorization: "Bearer {token}" }
Response: { success: true }
```

#### Chat

```
POST /api/chat
Headers: { Authorization: "Bearer {token}" }
Request: { message, conversation_id? }
Response: {
  message: "...",
  sources: [{ document_id, document_name, chunk_text, page_number }],
  conversation_id
}

GET /api/chat/history/:conversation_id
Headers: { Authorization: "Bearer {token}" }
Response: { messages: [...] }

GET /api/chat/conversations
Headers: { Authorization: "Bearer {token}" }
Response: { conversations: [...] }
```

### Data Migration Strategy

#### Phase 1: Schema Mapping (10 hours)

1. **Analyze gkchatty-local Mongoose models** (13 models)
2. **Map to SQLite schemas** (focus on HOME EDITION needs)
3. **Remove unused models** (tenants, folders, personas, system_kb)
4. **Design indexes** for query performance

#### Phase 2: Service Layer Refactor (40 hours)

1. **Replace Mongoose queries with SQLite queries** (sqliteHelper.ts)
2. **Preserve function signatures** (minimize API changes)
3. **Add transaction support** for multi-step operations
4. **Implement connection pooling** (better-sqlite3)

#### Phase 3: Vector Store Migration (20 hours)

1. **Replace Pinecone SDK with ChromaDB client**
2. **Migrate upsert/query/delete operations**
3. **Configure persistent storage** (`~/.gkchatty-pure/chroma/`)
4. **Add collection management** (per-user isolation)

#### Phase 4: Embedding Service Migration (15 hours)

1. **Replace OpenAI API calls with Ollama**
2. **Use mxbai-embed-large model** (1024 dimensions)
3. **Add fallback logic** (if Ollama unavailable)
4. **Benchmark performance** vs OpenAI

### Performance Targets

| Metric | Target | Baseline (gkchatty-local) |
|--------|--------|---------------------------|
| Document Upload (1MB) | < 5 seconds | ~4 seconds |
| Embedding Generation (1K tokens) | < 3 seconds | ~2 seconds (OpenAI) |
| RAG Query Latency | < 10 seconds | ~8 seconds |
| SQLite Query Latency | < 100ms | ~50ms (MongoDB Atlas) |
| ChromaDB Vector Search | < 500ms | ~400ms (Pinecone) |
| Server Startup Time | < 5 seconds | ~3 seconds |

### Security Requirements

1. **Password Storage:** bcrypt with 10 rounds
2. **JWT Secret:** 256-bit random key stored in `.env`
3. **JWT Expiration:** 7 days
4. **File Upload Validation:** MIME type + extension check
5. **Path Traversal Protection:** Sanitize filenames
6. **Rate Limiting:** 100 requests/minute per user
7. **CORS:** Restrict to localhost origins

### Testing Requirements

#### Unit Tests (25 hours)

- **Auth Service:** 10 tests (signup, login, JWT validation)
- **Document Service:** 15 tests (upload, delete, list, validation)
- **RAG Service:** 20 tests (chunk, embed, query, ranking)
- **ChromaDB Service:** 10 tests (upsert, query, delete)
- **SQLite Helper:** 15 tests (CRUD operations)

**Target Coverage:** 90%

#### Integration Tests (20 hours)

- **End-to-End RAG Pipeline:** 5 tests
- **Multi-Document Query:** 3 tests
- **Document Deletion:** 2 tests
- **Chat History:** 3 tests
- **Error Handling:** 5 tests

**Target Pass Rate:** 100%

#### Performance Benchmarks (10 hours)

- **Upload Speed:** Compare gkchatty-pure vs gkchatty-local
- **Query Latency:** Measure p50, p95, p99
- **Embedding Speed:** Ollama vs OpenAI
- **Database Performance:** SQLite vs MongoDB

---

## Constraints

### Technical Constraints

1. **Frontend Immutability:** Zero React component changes allowed
2. **API Compatibility:** Response formats must match gkchatty-local
3. **Local Infrastructure Reuse:** Must use existing sqliteHelper.ts, chromaService.ts, embeddingService.ts
4. **Ollama Dependency:** Ollama must be running with mxbai-embed-large model
5. **Data Locality:** All data in `~/.gkchatty-pure/` (no cloud services)
6. **Single User:** No multi-tenancy support (HOME EDITION)
7. **No System KB:** Only user-uploaded documents supported
8. **Flat Document List:** No folder organization
9. **No Personas:** Single default chat mode

### Resource Constraints

1. **Development Time:** 160 hours (HOME EDITION)
2. **Source Codebase:** gkchatty-local (18,230 TypeScript files)
3. **Team Size:** 1 developer + BMAD workflow
4. **Budget:** $0 (no cloud costs)

### Quality Constraints

1. **Test Coverage:** 90% for backend services
2. **Performance:** Match or exceed gkchatty-local
3. **Reliability:** Zero data loss on crashes
4. **Security:** Follow OWASP top 10 guidelines

---

## Success Metrics

### Quantitative Metrics

1. **Installation Success Rate:** > 95% (tested on macOS, Linux, Windows)
2. **RAG Accuracy (RAGAS Score):** > 0.85 (match gkchatty-local)
3. **Upload Speed:** ≤ gkchatty-local (< 5 seconds per 1MB)
4. **Query Latency:** < 10 seconds per query
5. **Embedding Speed:** ≥ OpenAI (mxbai-embed-large)
6. **Code Quality:** Zero MongoDB/Pinecone/OpenAI references (verified with grep)
7. **Test Coverage:** 90% backend unit tests
8. **Test Pass Rate:** 100% integration tests

### Qualitative Metrics

1. **User Satisfaction:** > 4.5/5 (ease of setup, performance, privacy)
2. **Code Maintainability:** ESLint score > 95%
3. **Documentation Quality:** All API endpoints documented
4. **Migration Ease:** < 30 minutes for users switching from gkchatty-local

---

## Out of Scope (Phase 2 - PRO EDITION)

1. **Multi-User Support:** Admin panel, user management
2. **System KB:** Shared knowledge base across users
3. **Folder Organization:** Document categorization
4. **Persona Support:** Multiple chat modes (technical, casual, etc.)
5. **Tenant KBs:** Organization-level knowledge bases
6. **Advanced Analytics:** Usage dashboards
7. **API Rate Limiting (per user):** Global rate limit only in Phase 1
8. **SSO/OAuth:** Email/password only in Phase 1

---

## Risks & Mitigations

### Risk 1: Ollama Performance
**Likelihood:** Medium
**Impact:** High
**Mitigation:** Benchmark mxbai-embed-large early, add caching layer if needed

### Risk 2: SQLite Concurrency
**Likelihood:** Low
**Impact:** Medium
**Mitigation:** Use WAL mode, implement connection pooling

### Risk 3: ChromaDB Stability
**Likelihood:** Low
**Impact:** High
**Mitigation:** Use stable version (0.4.x), add error recovery

### Risk 4: Frontend Breaking Changes
**Likelihood:** Medium
**Impact:** Critical
**Mitigation:** API contract tests, version pinning

### Risk 5: Large Document Processing
**Likelihood:** Medium
**Impact:** Medium
**Mitigation:** Add file size limits (50MB), streaming upload

---

## Dependencies

### External Dependencies

1. **Ollama:** Must be installed and running
2. **mxbai-embed-large:** Must be pulled (`ollama pull mxbai-embed-large`)
3. **Node.js:** v18+ required
4. **npm:** v9+ required

### Internal Dependencies

1. **gkchatty-local codebase:** Fork source
2. **Local infrastructure:** sqliteHelper.ts, chromaService.ts, embeddingService.ts
3. **Frontend assets:** React app (unchanged)

---

## Acceptance Criteria (MVP Complete)

The HOME EDITION MVP is complete when:

1. ✅ User can install with single command (`npm run setup`)
2. ✅ User can signup with email/password
3. ✅ User can login and receive JWT token
4. ✅ User can upload documents (PDF, TXT, DOCX, MD)
5. ✅ Documents are automatically chunked and embedded
6. ✅ User can chat with documents using RAG
7. ✅ RAG responses include source citations
8. ✅ User can view chat history
9. ✅ User can delete documents
10. ✅ All data stored in `~/.gkchatty-pure/`
11. ✅ Zero MongoDB/Pinecone/OpenAI references in codebase
12. ✅ 90% backend unit test coverage
13. ✅ 100% integration test pass rate
14. ✅ Performance matches or exceeds gkchatty-local
15. ✅ Frontend UI identical to gkchatty-local

---

## Timeline (160 hours)

### Week 1 (40 hours)
- Setup repository and fork gkchatty-local
- MongoDB → SQLite schema design
- Implement sqliteHelper.ts integration
- Auth service migration

### Week 2 (40 hours)
- Document service implementation
- Pinecone → ChromaDB migration
- OpenAI → Ollama migration
- File upload and storage

### Week 3 (40 hours)
- RAG service implementation
- Chat service implementation
- API endpoint preservation
- Integration testing

### Week 4 (40 hours)
- Unit test development
- Performance benchmarking
- Bug fixes and polish
- Documentation and migration guide

---

## Appendix

### A. Mongoose to SQLite Mapping

| Mongoose Model | SQLite Table | Notes |
|----------------|--------------|-------|
| User | users | Keep
| Document | documents | Keep |
| Conversation | conversations | Keep |
| Message | messages | Keep |
| Tenant | N/A | Remove (multi-tenancy not in HOME EDITION) |
| Folder | N/A | Remove (not in HOME EDITION) |
| Persona | N/A | Remove (not in HOME EDITION) |
| SystemKB | N/A | Remove (not in HOME EDITION) |

### B. API Endpoints (Complete List)

**Authentication:**
- POST /api/auth/signup
- POST /api/auth/login
- GET /api/auth/me

**Documents:**
- POST /api/documents/upload
- GET /api/documents
- GET /api/documents/:id
- DELETE /api/documents/:id

**Chat:**
- POST /api/chat
- GET /api/chat/history/:conversation_id
- GET /api/chat/conversations
- DELETE /api/chat/conversations/:id

**Health:**
- GET /api/health
- GET /api/health/ollama

### C. Environment Variables

```bash
# Server
PORT=3001
NODE_ENV=production

# JWT
JWT_SECRET=<256-bit-random-key>
JWT_EXPIRATION=7d

# Data Directory
DATA_DIR=~/.gkchatty-pure

# Ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_EMBEDDING_MODEL=mxbai-embed-large
OLLAMA_CHAT_MODEL=llama2

# ChromaDB
CHROMA_PERSIST_DIRECTORY=~/.gkchatty-pure/chroma

# SQLite
SQLITE_DB_PATH=~/.gkchatty-pure/data/gkchatty.db

# File Upload
MAX_FILE_SIZE=52428800  # 50MB
ALLOWED_FILE_TYPES=pdf,txt,docx,md
```

### D. Directory Structure

```
~/.gkchatty-pure/
├── data/
│   └── gkchatty.db           # SQLite database
├── documents/
│   └── {user_id}/            # Per-user document storage
│       ├── document1.pdf
│       └── document2.txt
├── chroma/                   # ChromaDB persistent storage
│   └── user_{user_id}_documents/
├── logs/
│   ├── server.log
│   └── error.log
└── config.json               # User preferences (future)
```

---

**Document Version:** 1.0.0
**Last Updated:** 2025-01-11
**Author:** BMAD Product Owner
**Status:** Ready for Architecture Phase
