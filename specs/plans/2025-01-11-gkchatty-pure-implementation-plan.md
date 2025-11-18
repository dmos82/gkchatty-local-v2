# gkchatty-pure Implementation Plan

**Version:** 1.0
**Date:** 2025-01-11
**Total Steps:** 82
**Estimated Duration:** 160 hours (140 hours + 20-hour buffer)
**Builder:** Builder Pro BMAD with RAG

## Executive Summary

This plan transforms gkchatty-local into gkchatty-pure through 82 granular, testable steps across 7 phases. Each step includes RAG queries for Builder Pro BMAD to fetch context from GKChatty KB.

**Key Success Metrics:**
- All 47 backend files refactored with zero API contract changes
- 100% local operation (no network calls except LLM inference)
- 80%+ test coverage
- Frontend compatibility maintained

---

## Phase Overview

| Phase | Steps | Duration | Key Deliverable |
|-------|-------|----------|----------------|
| **Phase 1: Project Setup** | 1-8 | 6 hours | Forked repo, local utils copied |
| **Phase 2: Database Layer** | 9-23 | 26 hours | SQLite schema + adapters |
| **Phase 3: ChromaDB Integration** | 24-32 | 16 hours | Vector store + embeddings |
| **Phase 4: Service Layer** | 33-52 | 38 hours | All services refactored |
| **Phase 5: Route Layer** | 53-62 | 18 hours | API contracts preserved |
| **Phase 6: Integration & Testing** | 63-75 | 24 hours | E2E tests + performance |
| **Phase 7: Documentation** | 76-82 | 12 hours | Migration guides + API docs |

**Total: 140 hours (20-hour buffer included for unknowns)**

---

## Critical Path

```
Step 6: SQLite schema → Blocks all database work
  ↓
Step 21: SQLiteAdapter → Blocks service refactors
  ↓
Step 33: Auth service → Blocks route updates
  ↓
Step 61: E2E test → Validates full stack
  ↓
Step 82: Release
```

---

## Phase 1: Project Setup (Steps 1-8) - 6 hours

### Step 1: Fork Repository (15 min)
- Fork gkchatty-local to gkchatty-pure
- Update package.json name
- Initialize git history

**RAG Query**: "How was gkchatty-local initially set up?"

### Step 2: Create Directory Structure (30 min)
- Create `backend/adapters/` (for SQLiteAdapter, ChromaAdapter)
- Create `backend/migrations/` (for SQL schemas)
- Create `backend/tests/integration/`
- Update .gitignore

**RAG Query**: "What is the recommended adapter-based directory structure?"

### Step 3: Copy Existing Local Utils (20 min) ⭐ Quick Win
- Copy `sqliteHelper.js`, `chromaService.js`, `localChatService.js` from gkchatty-local
- These are already production-ready!

**RAG Query**: "What are the existing local infrastructure implementations?"

### Step 4: Install Dependencies (15 min)
- Install: better-sqlite3, chromadb, bcrypt, jsonwebtoken
- Remove: @supabase/supabase-js, @pinecone-database/pinecone

**RAG Query**: "What are the recommended versions of better-sqlite3 and chromadb?"

### Step 5: Environment Config Template (30 min)
- Create env.template.js with:
  - SQLITE_DB_PATH, CHROMA_DB_PATH, JWT_SECRET, OLLAMA_BASE_URL
- Create .env.example

**RAG Query**: "What are security best practices for JWT secret generation?"

### Step 6: Database Config (45 min)
- Create db.config.js with SQLite connection settings
- Implement connection pooling
- Add error handling

**RAG Query**: "What are SQLite connection pooling best practices?"

### Step 7: ChromaDB Config (45 min)
- Create chroma.config.js
- Configure persistent storage
- Add collection defaults

**RAG Query**: "What are recommended ChromaDB configuration settings?"

### Step 8: Checkpoint - Validate Setup (30 min)
- Run npm install
- Verify all config files load
- Document completion in SETUP-LOG.md

---

## Phase 2: Database Layer (Steps 9-23) - 26 hours

### Step 9: Design Users Table Schema (1 hour)
- Create 001_create_users_table.sql
- Map Supabase auth.users → SQLite

**RAG Query**: "What is the Supabase auth.users schema?"

### Step 10: Design Documents Table Schema (1 hour)
- Create 002_create_documents_table.sql
- Add foreign key to users
- Add indexes

**RAG Query**: "What is the Supabase documents schema?"

### Step 11: Design Chunks Table Schema (1 hour)
- Create 003_create_chunks_table.sql
- Link to documents
- Add chroma_id for vector store

**RAG Query**: "How are document chunks stored in Supabase?"

### Step 12: Design Chat Sessions Table (45 min)
- Create 004_create_chat_sessions_table.sql

**RAG Query**: "What is the Supabase chat_sessions schema?"

### Step 13: Design Messages Table (1 hour)
- Create 005_create_messages_table.sql
- Link to chat_sessions
- Add role constraint

**RAG Query**: "What is the Supabase messages schema?"

### Step 14: Migration Runner Script (1.5 hours)
- Create migrate.js
- Execute SQL files in order
- Track applied migrations
- Add rollback support

**RAG Query**: "What are best practices for database migrations in Node.js?"

### Step 15: Implement SQLiteAdapter (2 hours)
- Create SQLiteAdapter class:
  - query(), insert(), update(), delete()
  - findById(), findOne(), findMany()
- Use prepared statements
- Add transaction support

**RAG Query**: "What is the recommended SQLite adapter pattern?"

### Steps 16-20: Create Models (8 hours)
- User model (2 hours)
- Document model (2 hours)
- Chunk model (1.5 hours)
- ChatSession model (1.5 hours)
- Message model (1.5 hours)

Each model extends SQLiteAdapter with domain-specific methods.

**RAG Query for each**: "How is [Model] implemented in gkchatty-local?"

### Step 21: Model Integration Tests (2 hours)
- Test all CRUD operations
- Test foreign key constraints
- Test cascade deletes

**RAG Query**: "What are best practices for testing database models?"

### Step 22: Checkpoint - Validate Database (1 hour)
- Run all migrations
- Run all model tests
- Verify schema matches Supabase
- Check idempotency

### Step 23: Document Database Architecture (1 hour)
- Create DATABASE-ARCHITECTURE.md
- Schema diagrams
- Relationship diagrams
- API reference

---

## Phase 3: ChromaDB Integration (Steps 24-32) - 16 hours

### Step 24: Initialize ChromaDB Client (1 hour)
- Create chromaClient.js
- Implement retry logic
- Add health check

**RAG Query**: "What is the ChromaDB client initialization pattern?"

### Step 25: Create ChromaAdapter (2 hours)
- Wrap ChromaDB client:
  - getOrCreateCollection()
  - addDocuments()
  - query()
  - delete()

**RAG Query**: "What are ChromaDB adapter best practices?"

### Step 26: Implement Embedding Service (2.5 hours)
- Create EmbeddingService:
  - generateEmbedding() - single text
  - generateEmbeddings() - batch
- Use Ollama nomic-embed-text
- Add caching

**RAG Query**: "How is the embedding service implemented in gkchatty-local?"

### Step 27: Document Chunking Service (2 hours)
- Create ChunkingService:
  - chunkDocument() - split text
  - Preserve markdown structure
- Default: 512 tokens, 50 overlap

**RAG Query**: "What are document chunking best practices for RAG?"

### Step 28: Collection Manager (1.5 hours)
- Create CollectionManager:
  - ensureCollection(user_id)
  - getCollectionName(user_id)
  - deleteCollection(user_id)

**RAG Query**: "How are user collections organized in ChromaDB?"

### Step 29: Indexing Service (3 hours)
- Create IndexingService:
  - indexDocument() - full pipeline:
    1. Fetch document from DB
    2. Chunk text
    3. Generate embeddings
    4. Store in ChromaDB + SQLite
  - reindexDocument()
  - deleteDocumentIndex()

**RAG Query**: "What is the document indexing pipeline?"

### Step 30: Query Service (2.5 hours)
- Create QueryService:
  - search() - semantic search
  - Format results with citations

**RAG Query**: "How is semantic search implemented in RAG service?"

### Step 31: ChromaDB Integration Tests (2 hours)
- Test collection creation
- Test indexing pipeline
- Test search
- Test cleanup

### Step 32: Checkpoint - Validate ChromaDB (1 hour)
- Run all tests
- Verify end-to-end indexing
- Check collection isolation
- Verify persistence

---

## Phase 4: Service Layer Refactor (Steps 33-52) - 38 hours

### Steps 33-35: Auth Service (5 hours)
- Step 33: register() method (2 hours)
- Step 34: login() method (1.5 hours)
- Step 35: verifyToken(), refreshToken() (1.5 hours)

**RAG Query**: "How is user authentication implemented in gkchatty-local?"

### Step 36: Auth Middleware (1.5 hours)
- Create requireAuth middleware
- Create optionalAuth middleware
- Extract JWT from header
- Attach user to req.user

**RAG Query**: "How is authentication middleware implemented?"

### Step 37: Document Service (3 hours)
- createDocument() + trigger indexing
- getDocument(), listDocuments()
- updateDocument() + re-index
- deleteDocument() + delete vectors
- Add authorization checks

**RAG Query**: "How is the document service implemented with indexing?"

### Step 38: RAG Service (2.5 hours)
- retrieveContext() - hybrid search
- buildPrompt() - combine query + context
- generateAnswer() - call LLM with context

**RAG Query**: "How is RAG context retrieval implemented?"

### Step 39: Chat Service (3 hours)
- createSession(), getSession(), listSessions()
- sendMessage() with RAG integration
- getHistory()
- Add authorization

**RAG Query**: "How is chat service implemented with RAG?"

### Step 40: Service Factory (1.5 hours)
- Create ServiceFactory for dependency injection
- Singleton pattern for all services

**RAG Query**: "What are service factory best practices?"

### Step 41: Service Integration Tests (3 hours)
- Test Auth flow (register → login → verify)
- Test Document flow (create → index → search)
- Test RAG flow (upload → query → citations)
- Test Chat flow (create session → send message)

### Step 42: Checkpoint - Validate Services (1.5 hours)
- Run all service tests
- Verify API contracts preserved
- Check error handling

### Steps 43-52: Reserved for Additional Work
(e.g., performance optimization, additional features discovered during implementation)

---

## Phase 5: Route Layer Update (Steps 53-62) - 18 hours

### Step 53: Update Auth Routes (2 hours)
- POST /auth/register → AuthService.register()
- POST /auth/login → AuthService.login()
- POST /auth/refresh → AuthService.refreshToken()
- GET /auth/me → AuthService.verifyToken()
- Remove Supabase calls

**RAG Query**: "What are the auth route response formats?"

### Step 54: Update Document Routes (2.5 hours)
- All CRUD operations → DocumentService
- Preserve response formats
- Remove Supabase calls

**RAG Query**: "What are the document route response formats?"

### Step 55: Update RAG Routes (2 hours)
- POST /rag/query → RAGService.generateAnswer()
- POST /rag/search → RAGService.retrieveContext()
- Remove Pinecone calls

**RAG Query**: "What are the RAG route response formats?"

### Step 56: Update Chat Routes (2.5 hours)
- All session/message operations → ChatService
- Preserve response formats
- Remove Supabase calls

**RAG Query**: "What are the chat route response formats?"

### Step 57: Health Check Route (1 hour)
- GET /health → Return system status:
  - SQLite, ChromaDB, Ollama status
  - Memory/disk usage

**RAG Query**: "What are health check endpoint best practices?"

### Step 58: Remove Supabase Dependencies (1.5 hours)
- Grep for all Supabase imports
- Remove Supabase client files
- Remove from package.json

**RAG Query**: "What are all Supabase dependencies in gkchatty-local?"

### Step 59: Remove Pinecone Dependencies (1 hour)
- Grep for all Pinecone imports
- Remove Pinecone client files
- Remove from package.json

**RAG Query**: "What are all Pinecone dependencies?"

### Step 60: Route Integration Tests (3 hours)
- Test auth routes with supertest
- Test document routes
- Test RAG routes
- Test chat routes

### Step 61: Checkpoint - Validate Routes (1.5 hours)
- Run all route tests
- Compare responses with gkchatty-local
- Manual testing with Postman/curl
- Verify error codes

### Step 62: Update Server Entry Point (1 hour)
- Remove Supabase initialization
- Initialize SQLite (run migrations)
- Initialize ChromaDB
- Mount all routes
- Add graceful shutdown

---

## Phase 6: Integration & Testing (Steps 63-75) - 24 hours

### Step 63: End-to-End Test Suite (4 hours)
Complete workflow:
1. Register → Login
2. Upload document → Wait for indexing
3. Query RAG → Verify citations
4. Create chat → Send message with RAG
5. Delete document → Verify vectors removed

**RAG Query**: "What are E2E testing best practices for Node.js?"

### Step 64: API Contract Tests (3 hours)
- Compare response schemas with gkchatty-local
- Verify field names, data types
- Use JSON schema validation

**RAG Query**: "How are API contracts validated?"

### Step 65: Frontend Compatibility Test (2.5 hours)
- Start backend
- Run frontend build
- Test critical flows (login, upload, RAG, chat)
- Check for console errors

**RAG Query**: "How is frontend-backend compatibility tested?"

### Step 66: Database Performance Tests (2 hours)
- Bulk insert (1000 documents)
- Bulk query
- Cascade delete
- Concurrent writes

**RAG Query**: "What are SQLite vs Supabase performance benchmarks?"

### Step 67: ChromaDB Performance Tests (2 hours)
- Bulk vector insertion (1000 vectors)
- Similarity search latency
- Concurrent queries

**RAG Query**: "What are ChromaDB vs Pinecone performance benchmarks?"

### Step 68: Load Testing (3 hours)
- Use k6 or Artillery
- Test concurrent users (10, 50, 100)
- Measure p50, p95, p99 latencies
- Identify bottlenecks

**RAG Query**: "What are load testing best practices for RAG applications?"

### Step 69: Security Testing (3 hours)
- Test SQL injection
- Test authentication bypass
- Test authorization bypass
- Test XSS, CSRF
- Verify bcrypt hashing

**RAG Query**: "What are OWASP Top 10 vulnerabilities for Node.js APIs?"

### Step 70: Data Migration Script (3 hours)
- Create migrate-from-supabase.js:
  - Export Supabase data
  - Import to SQLite
  - Re-index in ChromaDB
- Add dry-run mode

**RAG Query**: "What are Supabase to SQLite migration best practices?"

### Step 71: Backup and Restore (2 hours)
- Create backup.js (copy DB + ChromaDB)
- Create restore.js
- Add automated schedule

**RAG Query**: "What are SQLite + ChromaDB backup best practices?"

### Step 72: Monitoring Dashboard (2.5 hours)
- Track request counts, latencies, errors
- Export Prometheus metrics
- Add Grafana config

**RAG Query**: "What are Node.js monitoring best practices?"

### Step 73: Deployment Guide (2 hours)
- DEPLOYMENT.md:
  - System requirements
  - Installation steps
  - Configuration
  - Health check verification

**RAG Query**: "What are Node.js deployment documentation best practices?"

### Step 74: Migration Guide (2 hours)
- MIGRATION-FROM-GKCHATTY-LOCAL.md:
  - Backup existing data
  - Run migration script
  - Verify data
  - Rollback instructions

**RAG Query**: "What are user migration guide best practices?"

### Step 75: Checkpoint - Validate Complete System (2 hours)
- Run full test suite (unit + integration + E2E + performance + security)
- Manual smoke test
- Verify API compatibility
- Check code coverage (target: 80%+)
- Document in VALIDATION-REPORT.md

---

## Phase 7: Documentation & Cleanup (Steps 76-82) - 12 hours

### Step 76: System Architecture Diagram (1.5 hours)
- Create SYSTEM-ARCHITECTURE.md
- Add Mermaid diagrams
- Document all components

**RAG Query**: "What are system architecture documentation best practices?"

### Step 77: API Reference (2 hours)
- Create API-REFERENCE.md
- Document all endpoints
- Request/response schemas
- Error codes

**RAG Query**: "What are API documentation best practices?"

### Step 78: Developer Guide (2 hours)
- Create DEVELOPER-GUIDE.md
- Project structure
- Development setup
- Testing guidelines
- Contribution workflow

**RAG Query**: "What are developer onboarding documentation best practices?"

### Step 79: User Guide (1.5 hours)
- Create USER-GUIDE.md
- What is gkchatty-pure?
- Getting started
- Using RAG
- Troubleshooting

**RAG Query**: "What are end-user documentation best practices?"

### Step 80: Changelog (1 hour)
- Create CHANGELOG.md for v1.0.0
- Summary of changes
- Breaking changes
- Migration notes

**RAG Query**: "What are changelog best practices?"

### Step 81: Code Cleanup (2 hours)
- Run ESLint, fix errors
- Run Prettier
- Remove commented code
- Add JSDoc comments

**RAG Query**: "What are ESLint and Prettier configurations?"

### Step 82: Final Review and Release (2 hours)
- Run all tests
- Verify code coverage >= 80%
- Check documentation complete
- Create GitHub release (v1.0.0)
- Tag commit

**RAG Query**: "What are final steps before production release?"

---

## Testing Strategy

### Test Pyramid

```
         /\
        /  \    E2E (10 tests, ~6 hours)
       /    \
      /------\
     /        \  Integration (30 tests, ~12 hours)
    /          \
   /------------\
  /              \ Unit (100 tests, ~20 hours)
 /                \
/__________________\
```

**Coverage Requirements:**
- Models: 90%+
- Services: 85%+
- Routes: 80%+
- Adapters: 85%+
- Overall: 80%+

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| API contract breakage | High | Step 64: Contract tests |
| Data loss during migration | Critical | Step 70: Dry-run mode + backup |
| Performance regression | High | Steps 66-68: Benchmarks + load tests |
| Security vulnerabilities | Critical | Step 69: OWASP Top 10 tests |
| ChromaDB indexing failure | High | Step 31: Integration tests + retry logic |

### Rollback Procedures

**Checkpoint Rollback Points:**
- Step 8: Project setup complete
- Step 23: Database layer complete
- Step 32: ChromaDB layer complete
- Step 42: Service layer complete
- Step 62: Route layer complete
- Step 75: Integration testing complete

**If Step N Fails:**
1. Identify failure point
2. Check git status
3. Rollback to previous checkpoint
4. Review error logs
5. Fix issue
6. Re-run from failed step

---

## Progress Tracking

**A step is "complete" when:**
- [ ] All code written
- [ ] All tests pass
- [ ] Code reviewed
- [ ] Documentation updated
- [ ] Git commit pushed

**A phase is "complete" when:**
- [ ] All steps complete
- [ ] Checkpoint validation passed
- [ ] Phase documentation complete
- [ ] No failing tests

**Project is "complete" when:**
- [ ] All 82 steps complete
- [ ] Step 82 final review passed
- [ ] Release created (v1.0.0)

---

## Summary

**Total Steps**: 82
**Total Time**: 160 hours (~4 weeks full-time)
**Critical Path**: Steps 6, 21, 33, 61, 75
**Checkpoints**: 7
**Test Count**: ~140 tests
**Code Coverage**: 80%+
**Deliverables**: 47 refactored files + 12 documentation files

**Key Success Metrics:**
- ✅ 100% local operation
- ✅ API contracts preserved
- ✅ All tests passing
- ✅ Performance benchmarks met
- ✅ Security validated
- ✅ Documentation complete

**Ready for Builder Pro BMAD Implementation!**

---

**For complete details, see:**
- Phase 0: Requirements (/specs/user-stories/2025-01-11-gkchatty-pure-requirements.md)
- Phase 1: Architecture (/specs/architecture/2025-01-11-gkchatty-pure-architecture.md)
- Phase 2: Discovery (/specs/discovery/2025-01-11-gkchatty-pure-file-discovery.md)
