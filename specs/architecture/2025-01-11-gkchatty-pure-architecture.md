# gkchatty-pure System Architecture

**Version:** 1.0
**Date:** 2025-01-11
**Status:** Implementation Ready
**Project:** 100% Local-Only RAG Platform

## Executive Summary

gkchatty-pure transforms gkchatty-local into a completely self-contained RAG platform by replacing all cloud dependencies:

- **MongoDB → SQLite**: Local relational database with better-sqlite3
- **Pinecone → ChromaDB**: Local vector storage with persistent data
- **OpenAI → Ollama**: Local LLM and embeddings (nomic-embed-text, llama2)
- **Supabase Auth → Local JWT**: bcrypt password hashing + JWT tokens

**Critical Design Principle**: Frontend remains 100% unchanged. All API contracts preserved.

---

## High-Level Architecture

```
Frontend (Vue.js - Unchanged)
    ↓ HTTP/REST
API Layer (Express Routes)
    ↓
Service Layer (Auth, Document, RAG, Chat)
    ↓
Adapter Layer (SQLite, ChromaDB, Ollama)
    ↓
Storage Layer (~/.gkchatty-pure/)
```

---

## Core Components

### 1. Database Layer (SQLite)

**Schema:**
- **users**: id, email, password_hash, username, created_at, updated_at
- **documents**: id, user_id, title, content, metadata, embedding_status, created_at
- **chunks**: id, document_id, content, chunk_index, metadata, chroma_id, created_at
- **chat_sessions**: id, user_id, title, created_at, updated_at
- **messages**: id, session_id, role, content, metadata, created_at

**Adapter Pattern:**
```javascript
class SQLiteAdapter {
  query(sql, params)
  insert(table, data)
  update(table, id, data)
  delete(table, id)
  findById(table, id)
  findOne(table, where)
  findMany(table, where, options)
}
```

### 2. Vector Store Layer (ChromaDB)

**Collection Strategy**: Per-user collections (`user_{userId}_documents`)

**Adapter Pattern:**
```javascript
class ChromaAdapter {
  getOrCreateCollection(name, metadata)
  addDocuments(collection, {ids, documents, metadatas, embeddings})
  query(collection, {query_embeddings, n_results, where})
  delete(collection, ids)
  count(collection)
}
```

### 3. Service Layer

**AuthService**: register(), login(), verifyToken(), refreshToken()
**DocumentService**: createDocument(), getDocument(), listDocuments(), updateDocument(), deleteDocument()
**RAGService**: retrieveContext(), buildPrompt(), generateAnswer()
**ChatService**: createSession(), sendMessage(), getHistory()
**IndexingService**: indexDocument(), reindexDocument(), deleteDocumentIndex()
**QueryService**: search(), searchMultipleCollections()

### 4. Route Layer (API Contracts Preserved)

**Auth Routes**:
- `POST /auth/register` → {user, token}
- `POST /auth/login` → {user, token}
- `POST /auth/refresh` → {token}
- `GET /auth/me` → {user}

**Document Routes**:
- `POST /documents` → {document}
- `GET /documents/:id` → {document}
- `GET /documents` → {documents[]}
- `PATCH /documents/:id` → {document}
- `DELETE /documents/:id` → {success}

**RAG Routes**:
- `POST /rag/query` → {answer, citations, metadata}
- `POST /rag/search` → {results[]}

**Chat Routes**:
- `POST /chat/sessions` → {session}
- `GET /chat/sessions/:id` → {session, messages[]}
- `POST /chat/sessions/:id/messages` → {user_message, assistant_message, citations}

---

## Data Flow: Document Upload → RAG Query

### Document Ingestion Pipeline

```
1. User uploads PDF
2. API Layer: Multer saves to ~/.gkchatty-pure/uploads/
3. DocumentService: Extract text (pdf-parse)
4. ChunkingService: Split into 512-token chunks with 50-token overlap
5. EmbeddingService: Generate embeddings via Ollama (nomic-embed-text, 768 dims)
6. ChromaAdapter: Store vectors in user's collection
7. ChunkModel: Store chunk metadata in SQLite
8. DocumentModel: Update embedding_status to 'completed'
```

### RAG Query Pipeline

```
1. User sends query
2. EmbeddingService: Generate query embedding
3. QueryService: Hybrid search (semantic ChromaDB + keyword SQLite FTS5)
4. RAGService: Merge results with RRF (Reciprocal Rank Fusion)
5. RAGService: Build prompt with top 5 chunks as context
6. OllamaAdapter: Stream LLM response (llama2)
7. ChatService: Save user message + assistant message
8. Return answer + citations
```

---

## Migration Strategy

### Phase 1: Schema Mapping (Mongoose → SQLite)
- Map all 13 Mongoose models to SQLite tables
- Preserve foreign key relationships
- Add indexes for performance

### Phase 2: Service Layer Refactor
- Create SQLiteAdapter, ChromaAdapter, OllamaAdapter
- Refactor all services to use adapters instead of Supabase/Pinecone
- Preserve all method signatures (API compatibility)

### Phase 3: Vector Store Migration (Pinecone → ChromaDB)
- Export vectors from Pinecone (if any existing data)
- Create per-user ChromaDB collections
- Re-index all documents with Ollama embeddings

### Phase 4: Route Updates
- Update routes to use new services
- Verify API contracts unchanged
- Remove all Supabase/Pinecone client calls

---

## Performance Targets

- **Document Upload**: < 5s for 10MB PDF
- **Chat Query**: < 10s end-to-end (embedding + search + LLM)
- **Embedding Generation**: < 3s for 512-token chunk
- **Vector Search**: < 500ms for 10k vectors

---

## Security

- **Authentication**: bcrypt (10 rounds) + JWT (7-day expiry)
- **Authorization**: User can only access own data
- **File Upload**: MIME type validation, size limits (50MB), path traversal prevention
- **SQL Injection**: Prepared statements throughout
- **Data Isolation**: Per-user ChromaDB collections

---

## Deployment

**Directory Structure:**
```
~/.gkchatty-pure/
├── database/gkchatty.db (SQLite)
├── chroma-data/ (ChromaDB persistence)
├── uploads/{userId}/ (User documents)
└── config/.env (JWT secret, ports)
```

**Ports:**
- Backend: 6002
- Frontend: 6004
- Ollama: 11434

---

## Key Architectural Decisions

1. **Adapter Pattern**: Decouples business logic from storage (easy to swap backends)
2. **Per-User ChromaDB Collections**: Strong data isolation, simplified deletion
3. **Hybrid Search**: Combines semantic (ChromaDB) + keyword (SQLite FTS5) with RRF
4. **SQLite vs PostgreSQL**: Simpler deployment, sufficient for single-user workload
5. **Ollama vs OpenAI**: 100% local, free, privacy-preserving

---

## Technical Risks

1. **Ollama Embedding Quality**: May be lower than OpenAI (mitigate with hybrid search fallback)
2. **SQLite Concurrent Writes**: Limited support (mitigate with WAL mode + write queue)
3. **ChromaDB Performance**: May degrade with 100k+ vectors (mitigate with monitoring + sharding)
4. **Frontend Compatibility**: API contracts must match exactly (mitigate with contract tests)

---

**For complete implementation details, see:**
- Phase 0: Requirements (/specs/user-stories/2025-01-11-gkchatty-pure-requirements.md)
- Phase 2: Discovery (/specs/discovery/2025-01-11-gkchatty-pure-file-discovery.md)
- Phase 3: Implementation Plan (/specs/plans/2025-01-11-gkchatty-pure-implementation-plan.md)
