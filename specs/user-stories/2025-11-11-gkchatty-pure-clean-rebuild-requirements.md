# GKChatty Pure - Requirements Document

## Project Overview

**Project:** GKChatty Pure (4th Attempt)
**Goal:** Build 100% local RAG platform with ZERO cloud dependencies
**Context:** Previous 3 attempts were contaminated with cloud services (MongoDB, Pinecone, AWS)
**Duration:** 30-40 hours (clean backend rebuild)

### Why This Attempt Will Succeed

1. **Contamination Prevention Infrastructure Already Created:**
   - `.env.template` documents banned services
   - `BANNED-DEPENDENCIES.md` lists prohibited packages
   - `scripts/audit-local.sh` validates local-only operation
   - `.git/hooks/pre-commit` blocks contaminated commits
   - `ARCHITECTURE.md` documents 100% local constraint

2. **Existing Local Infrastructure to Reuse:**
   - `backend/src/config/db.config.ts` (SQLite configuration)
   - `backend/src/config/chroma.config.ts` (ChromaDB configuration)
   - `backend/src/utils/local/sqliteHelper.ts` (production-ready)
   - `backend/src/utils/local/chromaService.ts` (production-ready)
   - `backend/src/utils/local/embeddingService.ts` (Ollama integration)
   - `frontend-lite/` (React app, working on :3004)

3. **Clear Validation Criteria:**
   - `scripts/audit-local.sh` must report ZERO violations
   - All data must reside in `~/.gkchatty-pure/`
   - Only network call allowed: `localhost:11434` (Ollama)

---

## User Stories

### P0 - Critical Path (Must Have for MVP)

#### US-1: User Registration with Local Storage
**As a** new user
**I want** to create an account with username and password
**So that** I can access the RAG platform securely

**Acceptance Criteria:**
- AC-1.1: User can register with unique username and password
- AC-1.2: Password is hashed with bcrypt before storage
- AC-1.3: User data stored in SQLite database at `~/.gkchatty-pure/data.db`
- AC-1.4: JWT token generated and returned on successful registration
- AC-1.5: No external API calls made during registration
- AC-1.6: Audit script confirms zero cloud dependencies

---

#### US-2: User Authentication
**As a** registered user
**I want** to login with my credentials
**So that** I can access my documents and chat history

**Acceptance Criteria:**
- AC-2.1: User can login with username and password
- AC-2.2: Password verified against bcrypt hash in SQLite
- AC-2.3: JWT token returned with user ID and username
- AC-2.4: Token expires after configured duration
- AC-2.5: All auth operations use local SQLite only
- AC-2.6: No cloud auth services referenced

---

#### US-3: Session Management
**As an** authenticated user
**I want** to maintain my session and logout when needed
**So that** my account remains secure

**Acceptance Criteria:**
- AC-3.1: `/me` endpoint validates JWT and returns user info
- AC-3.2: `/logout` endpoint invalidates token (client-side removal)
- AC-3.3: Protected routes require valid JWT
- AC-3.4: Expired tokens return 401 Unauthorized
- AC-3.5: Session data stored locally only

---

#### US-4: Document Upload and Processing
**As an** authenticated user
**I want** to upload PDF, TXT, DOCX, MD documents
**So that** I can build my knowledge base

**Acceptance Criteria:**
- AC-4.1: Upload endpoint accepts PDF, TXT, DOCX, MD files
- AC-4.2: Files saved to `~/.gkchatty-pure/uploads/{userId}/{filename}`
- AC-4.3: Document metadata stored in SQLite (id, user_id, filename, upload_date, size)
- AC-4.4: Text extracted from documents using local libraries
- AC-4.5: No cloud storage services used (no S3, no GCS)
- AC-4.6: File size limits enforced (e.g., 10MB per file)

---

#### US-5: Document Chunking
**As a** system
**I want** to automatically chunk uploaded documents
**So that** documents can be embedded and retrieved efficiently

**Acceptance Criteria:**
- AC-5.1: Documents chunked into 500-token segments with 50-token overlap
- AC-5.2: Chunks stored in SQLite with document_id, chunk_index, content
- AC-5.3: Chunking happens synchronously after upload
- AC-5.4: Chunk boundaries respect sentence/paragraph boundaries when possible
- AC-5.5: All chunking operations local only

---

#### US-6: Vector Embedding Generation
**As a** system
**I want** to generate embeddings for document chunks using Ollama
**So that** semantic search is possible

**Acceptance Criteria:**
- AC-6.1: Embeddings generated using `nomic-embed-text` model via Ollama
- AC-6.2: Ollama API called at `localhost:11434` only
- AC-6.3: Embeddings stored in ChromaDB at `~/.gkchatty-pure/chroma/`
- AC-6.4: Each chunk stored with metadata (document_id, chunk_index, user_id)
- AC-6.5: Embedding service reused from `src/utils/local/embeddingService.ts`
- AC-6.6: No external embedding APIs used (no OpenAI embeddings)

---

#### US-10: RAG Query with Citations
**As an** authenticated user
**I want** to ask questions and get answers with source citations
**So that** I can trust the responses and verify sources

**Acceptance Criteria:**
- AC-10.1: `/rag/query` endpoint accepts natural language query
- AC-10.2: Query embedded using Ollama `nomic-embed-text`
- AC-10.3: Top 5 relevant chunks retrieved from ChromaDB
- AC-10.4: Context + query sent to Ollama `llama3.2` for response generation
- AC-10.5: Response includes answer and citations (document name, chunk index)
- AC-10.6: All operations use `localhost:11434` only
- AC-10.7: No external LLM APIs used

---

#### US-17: Contamination Prevention Enforcement
**As a** developer
**I want** automated validation to prevent cloud service contamination
**So that** the platform remains 100% local

**Acceptance Criteria:**
- AC-17.1: `scripts/audit-local.sh` scans for banned dependencies
- AC-17.2: Script checks for MongoDB, Pinecone, AWS SDK, OpenAI packages
- AC-17.3: Script validates `.env` has no cloud API keys
- AC-17.4: Pre-commit hook blocks commits with contaminated code
- AC-17.5: Script exit code 1 if violations found, 0 if clean
- AC-17.6: CI/CD pipeline runs audit script automatically

---

#### US-18: Frontend Integration
**As a** user
**I want** the existing frontend-lite to work with new backend
**So that** I have a complete working application

**Acceptance Criteria:**
- AC-18.1: Backend exposes CORS for `localhost:3004`
- AC-18.2: All 18 API endpoints match frontend expectations
- AC-18.3: JWT authentication works with frontend auth flow
- AC-18.4: File upload works with frontend upload component
- AC-18.5: Chat interface connects to backend WebSocket/REST
- AC-18.6: No frontend code changes required

---

### P1 - Important (Should Have for Complete MVP)

#### US-7: Document Listing
**As an** authenticated user
**I want** to see all my uploaded documents
**So that** I can manage my knowledge base

**Acceptance Criteria:**
- AC-7.1: `/documents` endpoint returns list of user's documents
- AC-7.2: Each document includes id, filename, upload_date, size, chunk_count
- AC-7.3: Results filtered by authenticated user ID
- AC-7.4: Results sorted by upload_date descending
- AC-7.5: Data retrieved from SQLite only

---

#### US-8: Document Retrieval
**As an** authenticated user
**I want** to view a specific document's details
**So that** I can see what content I uploaded

**Acceptance Criteria:**
- AC-8.1: `/documents/:id` endpoint returns document metadata
- AC-8.2: Endpoint returns 404 if document not found or not owned by user
- AC-8.3: Response includes original text or path to original file
- AC-8.4: All data from local SQLite and filesystem

---

#### US-9: Document Deletion
**As an** authenticated user
**I want** to delete documents I no longer need
**So that** I can manage my storage

**Acceptance Criteria:**
- AC-9.1: `DELETE /documents/:id` removes document from SQLite
- AC-9.2: Associated chunks removed from SQLite
- AC-9.3: Associated embeddings removed from ChromaDB
- AC-9.4: Original file deleted from filesystem
- AC-9.5: Endpoint returns 404 if document not owned by user
- AC-9.6: All operations local only

---

#### US-11: Semantic Search
**As an** authenticated user
**I want** to search my documents semantically
**So that** I can find relevant content quickly

**Acceptance Criteria:**
- AC-11.1: `/rag/search` endpoint accepts search query
- AC-11.2: Query embedded and matched against ChromaDB vectors
- AC-11.3: Returns top 10 relevant chunks with similarity scores
- AC-11.4: Results include document name, chunk text, score
- AC-11.5: Results filtered by authenticated user ID
- AC-11.6: All operations local only

---

#### US-12: Chat Session Management
**As an** authenticated user
**I want** to create and manage multiple chat conversations
**So that** I can organize different topics

**Acceptance Criteria:**
- AC-12.1: `POST /chat/send` creates new conversation if none specified
- AC-12.2: `GET /chat/conversations` returns list of user's conversations
- AC-12.3: `GET /chat/conversations/:id` returns specific conversation
- AC-12.4: `DELETE /chat/conversations/:id` removes conversation and messages
- AC-12.5: Conversations stored in SQLite with id, user_id, title, created_at
- AC-12.6: All data local only

---

#### US-13: Chat Message Storage
**As an** authenticated user
**I want** my chat messages saved with RAG context
**So that** I can review conversation history

**Acceptance Criteria:**
- AC-13.1: Each message stored with conversation_id, role (user/assistant), content, timestamp
- AC-13.2: Retrieved chunks stored as message metadata
- AC-13.3: `GET /chat/history/:conversationId` returns all messages
- AC-13.4: Messages ordered by timestamp ascending
- AC-13.5: All data stored in SQLite only

---

#### US-15: System Health Check
**As a** system administrator
**I want** to verify all services are operational
**So that** I can troubleshoot issues quickly

**Acceptance Criteria:**
- AC-15.1: `GET /health/system` checks SQLite connection
- AC-15.2: Endpoint checks ChromaDB connection
- AC-15.3: Endpoint verifies data directories exist
- AC-15.4: Returns status of each component (healthy/unhealthy)
- AC-15.5: Returns 200 if all healthy, 503 if any unhealthy

---

#### US-16: Ollama Health Check
**As a** system administrator
**I want** to verify Ollama is running and models are available
**So that** I can ensure RAG functionality works

**Acceptance Criteria:**
- AC-16.1: `GET /health/ollama` checks `localhost:11434` connectivity
- AC-16.2: Endpoint verifies `nomic-embed-text` model is available
- AC-16.3: Endpoint verifies `llama3.2` model is available
- AC-16.4: Returns model versions and status
- AC-16.5: Returns 200 if Ollama healthy, 503 if down

---

### P2 - Nice to Have (Can Defer Post-MVP)

#### US-14: Conversation Title Management
**As an** authenticated user
**I want** to update conversation titles
**So that** I can organize my chats meaningfully

**Acceptance Criteria:**
- AC-14.1: `PUT /chat/conversations/:id/title` accepts new title
- AC-14.2: Title updated in SQLite for specified conversation
- AC-14.3: Only conversation owner can update title
- AC-14.4: Returns 404 if conversation not found or not owned

---

## Technology Stack (Approved Only)

### Backend
- **Runtime:** Node.js (TypeScript)
- **Framework:** Express.js
- **Database:** SQLite (`better-sqlite3`) - NO MongoDB
- **Vector Store:** ChromaDB (Python client) - NO Pinecone
- **LLM/Embeddings:** Ollama (`localhost:11434`) - NO OpenAI API
- **Authentication:** JWT (`jsonwebtoken`) + bcrypt
- **File Processing:**
  - PDF: `pdf-parse`
  - DOCX: `mammoth`
  - TXT/MD: Node.js `fs`
- **Chunking:** Custom implementation (500 tokens, 50 overlap)

### Frontend (Reuse Existing)
- **Framework:** React (frontend-lite)
- **Port:** `localhost:3004`
- **No changes required**

### Infrastructure
- **Storage:** Local filesystem (`~/.gkchatty-pure/`)
- **Models:** Ollama (`nomic-embed-text`, `llama3.2`)
- **Configuration:** `.env.local` (no cloud credentials)

---

## API Endpoints (18 Total)

### Authentication (4 endpoints)
1. `POST /auth/signup` - Register new user
2. `POST /auth/login` - Authenticate user
3. `GET /auth/me` - Get current user info
4. `POST /auth/logout` - Logout user

### Documents (4 endpoints)
5. `POST /documents/upload` - Upload document
6. `GET /documents` - List user's documents
7. `GET /documents/:id` - Get document details
8. `DELETE /documents/:id` - Delete document

### RAG (2 endpoints)
9. `POST /rag/query` - Ask question (get answer + citations)
10. `POST /rag/search` - Semantic search

### Chat (6 endpoints)
11. `POST /chat/send` - Send message (triggers RAG)
12. `GET /chat/conversations` - List conversations
13. `GET /chat/conversations/:id` - Get conversation details
14. `DELETE /chat/conversations/:id` - Delete conversation
15. `GET /chat/history/:conversationId` - Get message history
16. `PUT /chat/conversations/:id/title` - Update conversation title

### Health (2 endpoints)
17. `GET /health/system` - System health check
18. `GET /health/ollama` - Ollama health check

---

## Constraints (100% Local Operation)

### CRITICAL - Zero Cloud Dependencies
1. **NO cloud databases:** MongoDB, Supabase, Firebase, AWS RDS
2. **NO cloud vector stores:** Pinecone, Weaviate Cloud, Qdrant Cloud
3. **NO cloud LLM APIs:** OpenAI, Anthropic, Cohere, Google AI
4. **NO cloud storage:** AWS S3, Google Cloud Storage, Azure Blob
5. **NO cloud auth:** Auth0, Firebase Auth, AWS Cognito

### Allowed Network Calls
- **ONLY:** `localhost:11434` (Ollama)
- All other operations must be local

### Data Storage
- **Root directory:** `~/.gkchatty-pure/`
- **SQLite database:** `~/.gkchatty-pure/data.db`
- **ChromaDB vectors:** `~/.gkchatty-pure/chroma/`
- **Uploaded files:** `~/.gkchatty-pure/uploads/{userId}/`

### Validation Requirements
- Run `scripts/audit-local.sh` after EVERY implementation step
- Pre-commit hook must pass (blocks contaminated commits)
- Exit code 0 = clean, exit code 1 = violations found

### Reuse Existing Infrastructure
- `backend/src/config/db.config.ts` (SQLite setup)
- `backend/src/config/chroma.config.ts` (ChromaDB setup)
- `backend/src/utils/local/sqliteHelper.ts` (database operations)
- `backend/src/utils/local/chromaService.ts` (vector operations)
- `backend/src/utils/local/embeddingService.ts` (Ollama embeddings)
- `frontend-lite/` (React app, no changes)

---

## Success Criteria

### Functional Requirements
1. Backend runs on `localhost:3001` with zero errors
2. Frontend connects successfully on `localhost:3004`
3. Full E2E flow works:
   - User registers → Logs in → Uploads document → Document chunked → Chunks embedded → User queries → RAG returns answer with citations
4. All 18 API endpoints return expected responses
5. JWT authentication flow works end-to-end
6. Chat history persists across sessions

### Validation Requirements
1. `scripts/audit-local.sh` reports ZERO violations (exit code 0)
2. No references to banned services in codebase:
   - MongoDB, Mongoose, `mongodb://`
   - Pinecone, `pinecone-client`
   - OpenAI, `openai`, `OPENAI_API_KEY`
   - AWS SDK, `aws-sdk`, `@aws-sdk/`
   - Supabase, `@supabase/`
3. `.env` contains NO cloud API keys
4. All data resides in `~/.gkchatty-pure/` directory

### Performance Requirements
1. Ollama health check passes (`nomic-embed-text` + `llama3.2` available)
2. SQLite database created and accessible
3. ChromaDB collection created and queryable
4. Document upload completes within 10 seconds (for 1MB file)
5. RAG query returns response within 5 seconds

### Quality Requirements
1. Pre-commit hook blocks contaminated code successfully
2. All user stories' acceptance criteria met
3. No TypeScript compilation errors
4. No runtime errors during normal operation
5. API responses follow consistent format

---

## Out of Scope

### Explicitly NOT Included
1. **Frontend changes** - Reuse existing `frontend-lite` as-is
2. **New features** - Only 18 API endpoints, no additional functionality
3. **Cloud integration** - Zero cloud services of any kind
4. **Migration tools** - No migration from previous contaminated attempts
5. **Performance optimization** - Basic functionality only (optimize later if needed)
6. **Advanced RAG** - No re-ranking, hybrid search, or advanced techniques
7. **User management** - No roles, permissions, teams, or organizations
8. **Real-time features** - No WebSockets, SSE, or real-time sync
9. **Advanced document processing** - No OCR, table extraction, or image analysis
10. **Monitoring** - No logging infrastructure beyond health checks
11. **Deployment** - No Docker, Kubernetes, or cloud deployment automation

---

## Validation Workflow (MANDATORY)

### After Every Implementation Step

```bash
# 1. Run local audit
./scripts/audit-local.sh

# 2. Verify exit code
echo $?  # Must be 0 (no violations)

# 3. Check for banned patterns
grep -r "mongodb://" backend/src/  # Must return nothing
grep -r "OPENAI_API_KEY" backend/  # Must return nothing
grep -r "pinecone" backend/  # Must return nothing

# 4. Verify data directories
ls ~/.gkchatty-pure/  # Must show: data.db, chroma/, uploads/

# 5. Test Ollama connectivity
curl http://localhost:11434/api/tags  # Must return model list
```

### Before Marking Story Complete

1. ✅ All acceptance criteria met
2. ✅ Audit script reports zero violations
3. ✅ Manual testing confirms functionality
4. ✅ No TypeScript errors
5. ✅ No runtime errors
6. ✅ API response matches expected format
7. ✅ Frontend integration verified (if applicable)

---

## Effort Estimate

**Total:** 30-40 hours (clean backend rebuild)

### Breakdown
- **Authentication (US-1, US-2, US-3):** 4-6 hours
- **Document Pipeline (US-4, US-5, US-6):** 8-10 hours
- **Document Management (US-7, US-8, US-9):** 4-5 hours
- **RAG Implementation (US-10, US-11):** 8-10 hours
- **Chat System (US-12, US-13, US-14):** 6-8 hours
- **Health Checks (US-15, US-16):** 2-3 hours
- **Contamination Prevention (US-17):** 1-2 hours (mostly validation)
- **Frontend Integration (US-18):** 2-3 hours (testing + CORS)
- **Testing & Debugging:** 5-7 hours

**Why Only 30-40 Hours?**
- Reusing existing local infrastructure (sqliteHelper, chromaService, embeddingService)
- Reusing existing frontend (no UI work)
- Contamination prevention already in place
- Clear requirements and constraints
- No cloud service integration complexity
- No migration from previous attempts

---

## Risk Mitigation

### Risk: Accidental Cloud Dependency
**Mitigation:**
- Run `audit-local.sh` after every step
- Pre-commit hook blocks contaminated code
- Code review checklist includes local-only verification

### Risk: Ollama Unavailable
**Mitigation:**
- Health check endpoint detects Ollama status
- Clear error messages guide user to install Ollama
- Documentation includes Ollama setup instructions

### Risk: Frontend Incompatibility
**Mitigation:**
- API endpoints match existing frontend expectations
- CORS configured for `localhost:3004`
- Integration testing with actual frontend

### Risk: SQLite Performance Issues
**Mitigation:**
- Indexes on user_id, document_id, conversation_id
- Chunk size limited to 500 tokens
- File size limits enforced (10MB per upload)

### Risk: ChromaDB Setup Complexity
**Mitigation:**
- Reuse existing `chromaService.ts` (proven working)
- Health check verifies ChromaDB connectivity
- Clear error messages for setup issues

---

## Definition of Done

### For Each User Story
1. ✅ All acceptance criteria met
2. ✅ Unit tests written and passing
3. ✅ Integration tests passing
4. ✅ `audit-local.sh` reports zero violations
5. ✅ No TypeScript compilation errors
6. ✅ No runtime errors during testing
7. ✅ API endpoint documented
8. ✅ Frontend integration verified (if applicable)
9. ✅ Code reviewed
10. ✅ Merged to main branch

### For MVP Complete
1. ✅ All P0 user stories complete
2. ✅ All P1 user stories complete
3. ✅ All 18 API endpoints operational
4. ✅ Full E2E flow tested (signup → upload → query → chat)
5. ✅ `audit-local.sh` reports zero violations
6. ✅ Frontend fully functional with backend
7. ✅ Health checks passing (system + Ollama)
8. ✅ All data in `~/.gkchatty-pure/`
9. ✅ Documentation complete (API docs, setup guide)
10. ✅ User acceptance testing passed

---

## Next Steps

1. **Review Requirements** - Product Owner + Architect review
2. **Architecture Design** - Architect creates system design
3. **Implementation Plan** - Break into sprint tasks
4. **Development** - Implement user stories in priority order
5. **Validation** - Run audit script after each story
6. **Integration Testing** - Test with frontend-lite
7. **User Acceptance** - Final testing and approval
8. **Documentation** - API docs and setup guide
9. **MVP Release** - Deploy to local environment

---

## Appendix: Contamination Prevention

### Banned Dependencies
See `BANNED-DEPENDENCIES.md` for full list:
- `mongodb`, `mongoose`
- `@pinecone-database/pinecone`
- `openai`
- `aws-sdk`, `@aws-sdk/*`
- `@supabase/supabase-js`
- `firebase`, `firebase-admin`

### Audit Script Checks
`scripts/audit-local.sh` validates:
1. No banned packages in `package.json`
2. No cloud API keys in `.env`
3. No MongoDB connection strings in code
4. No Pinecone imports
5. No OpenAI API calls
6. No AWS SDK usage
7. All data in `~/.gkchatty-pure/`

### Pre-Commit Hook
`.git/hooks/pre-commit` blocks commits containing:
- Banned dependency imports
- Cloud API key patterns
- Banned service connection strings

---

**Document Version:** 1.0
**Last Updated:** 2025-11-11
**Author:** Product Owner (GKChatty Pure)
**Status:** Ready for Architecture Phase