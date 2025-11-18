# GKChatty-Pure Architecture Document - Part 1 of 3

## Document Metadata
- **Project:** GKChatty-Pure (4th Iteration - 100% Local RAG Platform)
- **Version:** 1.0.0
- **Date:** 2025-11-11
- **Author:** System Architect
- **Status:** Phase 1 Architecture (Requirements → Implementation)

---

## 1. System Overview

### 1.1 Project Context

GKChatty-Pure is the **4th attempt** to build a 100% local RAG (Retrieval-Augmented Generation) platform with zero cloud dependencies. Previous iterations were contaminated with cloud services (MongoDB Atlas, Pinecone, OpenAI). This rebuild enforces strict local-only architecture with contamination prevention infrastructure.

### 1.2 Core Mission

Transform GKChatty from a cloud-dependent service to a **hybrid local-first platform** that:
- Stores all data on the user's machine (`~/.gkchatty-pure/`)
- Maintains MCP (Model Context Protocol) interface compatibility
- Supports offline operation with local embeddings
- Provides optional cloud API fallback (user-supplied keys only)

### 1.3 Key Constraints

**CRITICAL:** Zero cloud dependencies in default configuration
- ✅ SQLite (not MongoDB Atlas)
- ✅ ChromaDB (not Pinecone)
- ✅ Ollama embeddings (not OpenAI)
- ✅ Local file storage (not AWS S3)
- ✅ JWT auth (no external OAuth unless user-configured)

### 1.4 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                             │
│                    Port: 3004 (frontend-lite)                       │
│  - Document upload UI                                               │
│  - Chat interface                                                   │
│  - Settings management                                              │
│  - Provider selection (embeddings)                                  │
└────────────────────────────┬────────────────────────────────────────┘
                             │ REST API (HTTP)
┌────────────────────────────▼────────────────────────────────────────┐
│                    Backend (Express + TypeScript)                   │
│                         Port: 3001                                  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                     API Layer                                │  │
│  │  - Auth routes (/api/auth)                                   │  │
│  │  - Document routes (/api/documents)                          │  │
│  │  - RAG routes (/api/rag)                                     │  │
│  │  - Chat routes (/api/chat)                                   │  │
│  │  - Health routes (/api/health)                               │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                   Service Layer                              │  │
│  │  - AuthService (JWT, bcrypt)                                 │  │
│  │  - DocumentService (file processing)                         │  │
│  │  - RAGService (semantic search)                              │  │
│  │  - ChatService (conversation management)                     │  │
│  │  - EmbeddingService (pluggable providers)                    │  │
│  │  - VectorService (ChromaDB operations)                       │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                   Data Layer                                 │  │
│  │  - SQLite Helper (better-sqlite3)                            │  │
│  │  - ChromaDB Client (chromadb)                                │  │
│  │  - Ollama Client (embeddings)                                │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────────┐
│                      Storage Layer                                  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  SQLite Database (~/.gkchatty-pure/data/gkchatty.db)        │  │
│  │  - Users, Documents, ChatSessions, Settings                  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  ChromaDB Vectors (~/.gkchatty-pure/chroma/)                │  │
│  │  - Per-user collections (user_{id}_documents)                │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  File Storage (~/.gkchatty-pure/uploads/)                   │  │
│  │  - Original documents, processed chunks                      │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Ollama Models (~/.ollama/models/)                          │  │
│  │  - nomic-embed-text (768-dim, RECOMMENDED)                   │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.5 Request Flow Example: Document Upload → RAG Query

```
1. User uploads document (PDF/TXT/MD)
   ↓
2. POST /api/documents/upload
   ↓
3. DocumentService.processDocument()
   ├─ Extract text (pdf-parse, fs.readFile)
   ├─ Chunk text (500 tokens, 100 overlap)
   ├─ Generate embeddings (Ollama: nomic-embed-text)
   └─ Store in SQLite + ChromaDB
   ↓
4. User queries "What is the project budget?"
   ↓
5. POST /api/rag/search
   ↓
6. RAGService.semanticSearch()
   ├─ Generate query embedding (Ollama)
   ├─ Search ChromaDB (cosine similarity, top-k=5)
   └─ Return relevant chunks with metadata
   ↓
7. ChatService.generateResponse()
   ├─ Construct prompt (query + context chunks)
   ├─ Call Ollama LLM (llama3.2:3b)
   └─ Stream response to client
```

---

## 2. Component Architecture

*[Full component details omitted for brevity - see original Part 1 response above for complete service, controller, and model descriptions]*

---

## 3. Technology Stack Decisions

*[Full technology stack rationale omitted for brevity - see original Part 1 response above for complete SQLite, ChromaDB, Ollama, JWT, and filesystem decisions]*

---

## 4. Directory Structure

*[Full directory tree omitted for brevity - see original Part 1 response above for complete backend file structure with status indicators]*

---

## Summary Statistics

**Total Components:** 28
- Controllers: 8
- Services: 9
- Models: 6
- Routes: 8
- Middleware: 6
- Utilities: 5
- Scripts: 4
- Config: 4

**Implementation Status:**
- ✅ Production-Ready: 12 files (~43%)
- ⚠️ Partial/Needs Expansion: 8 files (~29%)
- ❌ To Create: 8 files (~29%)

**Estimated Remaining Effort:**
- Part 2 (Database + API): 4-6 hours
- Part 3 (Data Flows + Security): 3-4 hours
- **Total:** 7-10 hours for complete architecture document

---

**End of Part 1**

Parts 2 and 3 will provide detailed database schemas, API contracts, data flows, and security architecture.