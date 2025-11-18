# GKChatty-Pure Architecture Document - Part 2 of 3

## Document Metadata
- **Project:** GKChatty-Pure (4th Iteration - 100% Local RAG Platform)
- **Version:** 1.0.0
- **Date:** 2025-11-11
- **Author:** System Architect
- **Status:** Phase 1 Architecture (Database Schema + API Contracts)
- **Continuation of:** Part 1 (System Overview, Components, Tech Stack)

---

## 5. Database Schema (SQLite)

### 5.1 Schema Overview

**Database Location:** `~/.gkchatty-pure/data/gkchatty.db`

**Configuration:**
- SQLite version: 3.43+ (via better-sqlite3)
- WAL mode enabled: Concurrent reads + single writer
- Foreign keys enabled: Referential integrity enforced
- Auto-vacuum: INCREMENTAL (manual trigger)
- Page size: 4096 bytes (default)
- Cache size: 2000 pages (~8MB)

**Design Principles:**
1. **User Isolation:** All resources scoped to user_id
2. **Referential Integrity:** CASCADE deletes for dependent resources
3. **Timestamps:** All entities have created_at, updated_at
4. **Soft Deletes:** Optional (use deleted_at column if needed)
5. **Indexing Strategy:** Index all foreign keys, frequently queried columns

---

### 5.2 Table Definitions

#### Table 1: `users`

**Purpose:** Store user accounts with local authentication

```sql
CREATE TABLE IF NOT EXISTS users (
  -- Primary Key
  id TEXT PRIMARY KEY,  -- UUID v4 (e.g., "550e8400-e29b-41d4-a716-446655440000")

  -- Authentication
  username TEXT UNIQUE NOT NULL,  -- Unique username (3-50 chars)
  email TEXT UNIQUE NOT NULL,     -- Unique email (validated format)
  password_hash TEXT NOT NULL,    -- bcrypt hash (60 chars)

  -- Authorization
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),

  -- Session Management
  active_session_ids TEXT DEFAULT '[]',  -- JSON array of session IDs
  last_login_at INTEGER,                  -- Unix timestamp (milliseconds)

  -- Account Status
  is_active INTEGER DEFAULT 1 CHECK (is_active IN (0, 1)),
  force_password_change INTEGER DEFAULT 0 CHECK (force_password_change IN (0, 1)),

  -- Timestamps
  created_at INTEGER NOT NULL,    -- Unix timestamp (milliseconds)
  updated_at INTEGER NOT NULL     -- Unix timestamp (milliseconds)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
```

**Constraints:**
- `username`: 3-50 chars, alphanumeric + underscore/dash
- `email`: Valid email format (validated in application layer)
- `password`: Minimum 8 chars, hashed with bcrypt (10 rounds)
- `role`: ENUM('user', 'admin')

**Example Row:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "username": "alice",
  "email": "alice@example.com",
  "password_hash": "$2b$10$N9qo8uLOickgx2ZMRZoMye",
  "role": "user",
  "active_session_ids": "[\"sess_abc123\", \"sess_xyz789\"]",
  "last_login_at": 1699999999000,
  "is_active": 1,
  "force_password_change": 0,
  "created_at": 1699900000000,
  "updated_at": 1699999999000
}
```

---

#### Table 2: `documents`

**Purpose:** Store metadata for uploaded documents

```sql
CREATE TABLE IF NOT EXISTS documents (
  -- Primary Key
  id TEXT PRIMARY KEY,  -- UUID v4

  -- Ownership
  user_id TEXT NOT NULL,

  -- File Metadata
  filename TEXT NOT NULL,               -- Original filename (e.g., "report.pdf")
  filepath TEXT NOT NULL UNIQUE,        -- Local path (e.g., "~/.gkchatty-pure/uploads/user_id/doc_id.pdf")
  file_type TEXT NOT NULL,              -- MIME type (e.g., "application/pdf")
  file_size INTEGER NOT NULL,           -- Bytes (e.g., 1048576 = 1MB)

  -- Processing Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  status_detail TEXT,                   -- Error message if failed

  -- Extracted Content
  extracted_text TEXT,                  -- Full extracted text (for search)

  -- RAG Metadata
  chunk_count INTEGER DEFAULT 0,        -- Number of chunks generated
  embedding_model TEXT,                 -- Model used (e.g., "nomic-embed-text")
  embedding_dimension INTEGER,          -- Vector dimension (e.g., 768)
  chroma_collection_id TEXT,            -- ChromaDB collection ID

  -- Timestamps
  created_at INTEGER NOT NULL,          -- Unix timestamp (milliseconds)
  updated_at INTEGER NOT NULL,          -- Unix timestamp (milliseconds)
  processed_at INTEGER,                 -- When processing completed

  -- Foreign Keys
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_file_type ON documents(file_type);

-- Full-Text Search (Optional)
CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
  document_id UNINDEXED,
  filename,
  extracted_text,
  content=documents,
  content_rowid=id
);
```

**Constraints:**
- `file_type`: Allowed: 'application/pdf', 'text/plain', 'text/markdown'
- `file_size`: Maximum 10MB (10485760 bytes)
- `status`: ENUM('pending', 'processing', 'completed', 'failed')

**Example Row:**
```json
{
  "id": "doc_abc123",
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "filename": "quarterly-report.pdf",
  "filepath": "/Users/user/.gkchatty-pure/uploads/550e8400/doc_abc123.pdf",
  "file_type": "application/pdf",
  "file_size": 2097152,
  "status": "completed",
  "status_detail": null,
  "extracted_text": "Q3 2024 Financial Report...",
  "chunk_count": 42,
  "embedding_model": "nomic-embed-text",
  "embedding_dimension": 768,
  "chroma_collection_id": "user_550e8400_documents",
  "created_at": 1699900000000,
  "updated_at": 1699900500000,
  "processed_at": 1699900500000
}
```

---

#### Table 3: `conversations`

**Purpose:** Store chat conversations/sessions

```sql
CREATE TABLE IF NOT EXISTS conversations (
  -- Primary Key
  id TEXT PRIMARY KEY,  -- UUID v4

  -- Ownership
  user_id TEXT NOT NULL,

  -- Conversation Metadata
  title TEXT,                           -- Auto-generated or user-provided
  is_archived INTEGER DEFAULT 0 CHECK (is_archived IN (0, 1)),

  -- Message Count (Denormalized for Performance)
  message_count INTEGER DEFAULT 0,

  -- Timestamps
  created_at INTEGER NOT NULL,          -- Unix timestamp (milliseconds)
  updated_at INTEGER NOT NULL,          -- Unix timestamp (milliseconds)
  last_message_at INTEGER,              -- When last message was sent

  -- Foreign Keys
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_is_archived ON conversations(is_archived);
```

**Constraints:**
- `title`: Maximum 200 chars (auto-generated from first message if null)
- `is_archived`: Boolean (0=active, 1=archived)

**Example Row:**
```json
{
  "id": "conv_xyz789",
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "Q3 Financial Analysis",
  "is_archived": 0,
  "message_count": 8,
  "created_at": 1699900000000,
  "updated_at": 1699905000000,
  "last_message_at": 1699905000000
}
```

---

#### Table 4: `messages`

**Purpose:** Store individual chat messages with RAG sources

```sql
CREATE TABLE IF NOT EXISTS messages (
  -- Primary Key
  id TEXT PRIMARY KEY,  -- UUID v4

  -- Conversation Link
  conversation_id TEXT NOT NULL,

  -- Message Content
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,                -- Message text

  -- RAG Sources (JSON Array)
  sources TEXT,  -- JSON array of {document_id, chunk_index, score, text}

  -- Metadata
  token_count INTEGER,                  -- Approximate token count
  embedding_model TEXT,                 -- Model used for query (if role=user)

  -- Timestamps
  created_at INTEGER NOT NULL,          -- Unix timestamp (milliseconds)

  -- Foreign Keys
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at ASC);
CREATE INDEX IF NOT EXISTS idx_messages_role ON messages(role);
```

**Constraints:**
- `role`: ENUM('user', 'assistant', 'system')
- `content`: Maximum 50,000 chars
- `sources`: JSON array (validated in application layer)

**Sources JSON Schema:**
```typescript
interface Source {
  document_id: string;      // Document ID
  chunk_index: number;      // Chunk position in document
  score: number;            // Similarity score (0.0-1.0)
  text: string;             // Chunk content (preview)
  filename: string;         // Document filename
}
```

**Example Row:**
```json
{
  "id": "msg_123abc",
  "conversation_id": "conv_xyz789",
  "role": "user",
  "content": "What was our Q3 revenue?",
  "sources": null,
  "token_count": 8,
  "embedding_model": "nomic-embed-text",
  "created_at": 1699900000000
}
```

```json
{
  "id": "msg_456def",
  "conversation_id": "conv_xyz789",
  "role": "assistant",
  "content": "According to the Q3 report, revenue was $2.5M.",
  "sources": "[{\"document_id\":\"doc_abc123\",\"chunk_index\":5,\"score\":0.89,\"text\":\"Q3 revenue: $2.5M\",\"filename\":\"quarterly-report.pdf\"}]",
  "token_count": 15,
  "embedding_model": null,
  "created_at": 1699900005000
}
```

---

#### Table 5: `settings`

**Purpose:** Store user-specific and global settings

```sql
CREATE TABLE IF NOT EXISTS settings (
  -- Primary Key
  id TEXT PRIMARY KEY,  -- UUID v4

  -- Ownership (NULL for global settings)
  user_id TEXT,

  -- Setting Key-Value
  setting_key TEXT NOT NULL,            -- Unique per user (e.g., "embedding_provider")
  setting_value TEXT NOT NULL,          -- JSON value

  -- Metadata
  data_type TEXT NOT NULL CHECK (data_type IN ('string', 'number', 'boolean', 'json', 'array')),
  is_system INTEGER DEFAULT 0 CHECK (is_system IN (0, 1)),  -- System settings can't be deleted

  -- Timestamps
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,

  -- Foreign Keys
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,

  -- Unique Constraint
  UNIQUE(user_id, setting_key)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_settings_user_id ON settings(user_id);
CREATE INDEX IF NOT EXISTS idx_settings_setting_key ON settings(setting_key);
CREATE INDEX IF NOT EXISTS idx_settings_is_system ON settings(is_system);
```

**Common Settings:**
```typescript
// User Settings
{
  "embedding_provider": "ollama",           // or "openai" (user-supplied key)
  "embedding_model": "nomic-embed-text",
  "chat_model": "llama3.2:3b",
  "theme": "dark",
  "max_sources": 5,
  "chunk_size": 512,
  "chunk_overlap": 50
}

// System Settings (user_id = NULL)
{
  "system_prompt": "You are a helpful AI assistant...",
  "max_upload_size_mb": 10,
  "allowed_file_types": ["pdf", "txt", "md"]
}
```

**Example Row:**
```json
{
  "id": "set_abc123",
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "setting_key": "embedding_provider",
  "setting_value": "\"ollama\"",
  "data_type": "string",
  "is_system": 0,
  "created_at": 1699900000000,
  "updated_at": 1699900000000
}
```

---

### 5.3 Migrations Strategy

**Migration Files Location:** `backend/src/migrations/`

**Naming Convention:** `YYYYMMDD_HHMMSS_description.sql`

**Example Migration:**
```sql
-- 20251111_000001_create_users_table.sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_users_email ON users(email);
```

**Migration Runner:**
```typescript
// backend/src/utils/migrationRunner.ts
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

export async function runMigrations(db: Database.Database) {
  // Create migrations table if not exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT UNIQUE NOT NULL,
      applied_at INTEGER NOT NULL
    )
  `);

  const migrationsDir = path.join(__dirname, '../migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  for (const file of files) {
    const applied = db.prepare('SELECT 1 FROM migrations WHERE filename = ?').get(file);
    if (applied) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    db.exec(sql);
    db.prepare('INSERT INTO migrations (filename, applied_at) VALUES (?, ?)').run(file, Date.now());
    console.log(`✓ Applied migration: ${file}`);
  }
}
```

---

### 5.4 Data Relationships

```
users (1) ──< (N) documents
         ──< (N) conversations
         ──< (N) settings

documents (1) ──< (N) messages.sources (via JSON)

conversations (1) ──< (N) messages
```

**CASCADE Behavior:**
- Delete user → Deletes all documents, conversations, settings
- Delete conversation → Deletes all messages
- Delete document → Updates messages.sources JSON (application-level cleanup)

---

## 6. API Endpoint Contracts

### 6.1 API Overview

**Base URL:** `http://localhost:3001/api`

**Authentication:** JWT Bearer token in `Authorization` header

**Response Format:**
```typescript
// Success Response
{
  "success": true,
  "data": <resource>,
  "message"?: string
}

// Error Response
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error",
    "details"?: any
  }
}
```

**Standard HTTP Status Codes:**
- 200: Success
- 201: Created
- 400: Bad Request (validation error)
- 401: Unauthorized (invalid/missing token)
- 403: Forbidden (insufficient permissions)
- 404: Not Found
- 409: Conflict (duplicate resource)
- 500: Internal Server Error

---

### 6.2 Authentication Endpoints

#### POST /api/auth/signup

**Description:** Register new user with username, email, password

**Request:**
```typescript
POST /api/auth/signup
Content-Type: application/json

{
  "username": string,  // 3-50 chars, alphanumeric + _-
  "email": string,     // Valid email format
  "password": string   // Min 8 chars, 1 uppercase, 1 lowercase, 1 number
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "username": "alice",
      "email": "alice@example.com",
      "role": "user",
      "created_at": 1699900000000
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  },
  "message": "User registered successfully"
}
```

**Error Cases:**
- 400: Invalid email format, weak password
- 409: Username or email already exists

---

#### POST /api/auth/login

**Description:** Login with email/username and password

**Request:**
```typescript
POST /api/auth/login
Content-Type: application/json

{
  "email": string,     // Email OR username
  "password": string
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "username": "alice",
      "email": "alice@example.com",
      "role": "user"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Error Cases:**
- 401: Invalid credentials
- 404: User not found

---

#### GET /api/auth/me

**Description:** Get current authenticated user

**Request:**
```typescript
GET /api/auth/me
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "username": "alice",
    "email": "alice@example.com",
    "role": "user",
    "created_at": 1699900000000,
    "last_login_at": 1699999999000
  }
}
```

**Error Cases:**
- 401: Invalid or expired token

---

#### POST /api/auth/logout

**Description:** Logout (invalidate token on client side)

**Request:**
```typescript
POST /api/auth/logout
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

**Note:** Since JWT is stateless, logout is client-side token deletion. Server can optionally add token to blacklist.

---

### 6.3 Document Endpoints

#### POST /api/documents/upload

**Description:** Upload document for processing

**Request:**
```typescript
POST /api/documents/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data

{
  "file": File,  // PDF, TXT, or MD file (max 10MB)
  "metadata"?: {
    "description": string,
    "tags": string[]
  }
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "id": "doc_abc123",
    "filename": "quarterly-report.pdf",
    "file_size": 2097152,
    "file_type": "application/pdf",
    "status": "pending",
    "created_at": 1699900000000
  },
  "message": "Document uploaded successfully. Processing started."
}
```

**Error Cases:**
- 400: Invalid file type, file too large
- 401: Unauthorized
- 500: Upload failed

**Processing Flow:**
1. File saved to `~/.gkchatty-pure/uploads/{user_id}/{doc_id}.{ext}`
2. Status set to 'processing'
3. Background job: Extract text → Chunk → Embed → Store in ChromaDB
4. Status updated to 'completed' or 'failed'

---

#### GET /api/documents

**Description:** List user's documents with pagination

**Request:**
```typescript
GET /api/documents?page=1&limit=20&status=completed&sort=created_at:desc
Authorization: Bearer <token>
```

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20, max: 100)
- `status`: Filter by status (pending|processing|completed|failed)
- `sort`: Sort field:order (default: created_at:desc)

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "documents": [
      {
        "id": "doc_abc123",
        "filename": "quarterly-report.pdf",
        "file_size": 2097152,
        "file_type": "application/pdf",
        "status": "completed",
        "chunk_count": 42,
        "created_at": 1699900000000,
        "processed_at": 1699900500000
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 5,
      "pages": 1
    }
  }
}
```

**Error Cases:**
- 401: Unauthorized
- 400: Invalid query parameters

---

#### GET /api/documents/:id

**Description:** Get document details by ID

**Request:**
```typescript
GET /api/documents/doc_abc123
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "doc_abc123",
    "filename": "quarterly-report.pdf",
    "file_size": 2097152,
    "file_type": "application/pdf",
    "status": "completed",
    "chunk_count": 42,
    "embedding_model": "nomic-embed-text",
    "embedding_dimension": 768,
    "created_at": 1699900000000,
    "processed_at": 1699900500000,
    "extracted_text_preview": "Q3 2024 Financial Report..."
  }
}
```

**Error Cases:**
- 401: Unauthorized
- 404: Document not found
- 403: Document belongs to another user

---

#### DELETE /api/documents/:id

**Description:** Delete document and its embeddings

**Request:**
```typescript
DELETE /api/documents/doc_abc123
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Document deleted successfully"
}
```

**Deletion Process:**
1. Delete from SQLite `documents` table (CASCADE)
2. Delete embeddings from ChromaDB collection
3. Delete file from `~/.gkchatty-pure/uploads/`

**Error Cases:**
- 401: Unauthorized
- 404: Document not found
- 403: Document belongs to another user

---

### 6.4 RAG Endpoints

#### POST /api/rag/query

**Description:** Query with RAG (semantic search + LLM response)

**Request:**
```typescript
POST /api/rag/query
Authorization: Bearer <token>
Content-Type: application/json

{
  "query": string,           // User question
  "conversation_id"?: string, // Optional: Link to conversation
  "max_sources": number,     // Default: 5
  "min_score": number        // Default: 0.7 (0.0-1.0)
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "answer": "According to the Q3 report, revenue was $2.5M.",
    "sources": [
      {
        "document_id": "doc_abc123",
        "filename": "quarterly-report.pdf",
        "chunk_index": 5,
        "score": 0.89,
        "text": "Q3 revenue: $2.5M, up 15% from Q2."
      }
    ],
    "query_embedding_time_ms": 45,
    "search_time_ms": 12,
    "llm_time_ms": 3500,
    "total_time_ms": 3557
  }
}
```

**Error Cases:**
- 401: Unauthorized
- 400: Empty query, invalid parameters
- 404: No documents found (no embeddings available)
- 500: Ollama connection failed

---

#### POST /api/rag/search

**Description:** Semantic search only (no LLM response)

**Request:**
```typescript
POST /api/rag/search
Authorization: Bearer <token>
Content-Type: application/json

{
  "query": string,
  "max_sources": number,     // Default: 10
  "min_score": number        // Default: 0.5
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "sources": [
      {
        "document_id": "doc_abc123",
        "filename": "quarterly-report.pdf",
        "chunk_index": 5,
        "score": 0.89,
        "text": "Q3 revenue: $2.5M, up 15% from Q2.",
        "metadata": {
          "page": 3,
          "section": "Financial Summary"
        }
      }
    ],
    "query_embedding_time_ms": 45,
    "search_time_ms": 12,
    "total_time_ms": 57
  }
}
```

**Error Cases:**
- 401: Unauthorized
- 400: Empty query
- 404: No documents found

---

### 6.5 Chat Endpoints

#### POST /api/chat

**Description:** Send chat message with RAG context

**Request:**
```typescript
POST /api/chat
Authorization: Bearer <token>
Content-Type: application/json

{
  "conversation_id"?: string,  // Optional: Create new if not provided
  "message": string,            // User message
  "use_rag": boolean,          // Default: true
  "max_sources": number        // Default: 5
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "conversation_id": "conv_xyz789",
    "user_message": {
      "id": "msg_123abc",
      "role": "user",
      "content": "What was our Q3 revenue?",
      "created_at": 1699900000000
    },
    "assistant_message": {
      "id": "msg_456def",
      "role": "assistant",
      "content": "According to the Q3 report, revenue was $2.5M.",
      "sources": [
        {
          "document_id": "doc_abc123",
          "filename": "quarterly-report.pdf",
          "chunk_index": 5,
          "score": 0.89,
          "text": "Q3 revenue: $2.5M"
        }
      ],
      "created_at": 1699900005000
    }
  }
}
```

**Error Cases:**
- 401: Unauthorized
- 400: Empty message
- 404: Conversation not found

---

#### GET /api/chat/conversations

**Description:** List user's conversations

**Request:**
```typescript
GET /api/chat/conversations?page=1&limit=20&archived=false
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "conversations": [
      {
        "id": "conv_xyz789",
        "title": "Q3 Financial Analysis",
        "message_count": 8,
        "last_message_at": 1699905000000,
        "created_at": 1699900000000
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 3,
      "pages": 1
    }
  }
}
```

---

#### GET /api/chat/conversations/:id

**Description:** Get conversation with all messages

**Request:**
```typescript
GET /api/chat/conversations/conv_xyz789
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "conv_xyz789",
    "title": "Q3 Financial Analysis",
    "messages": [
      {
        "id": "msg_123abc",
        "role": "user",
        "content": "What was our Q3 revenue?",
        "created_at": 1699900000000
      },
      {
        "id": "msg_456def",
        "role": "assistant",
        "content": "According to the Q3 report, revenue was $2.5M.",
        "sources": [...],
        "created_at": 1699900005000
      }
    ],
    "created_at": 1699900000000,
    "updated_at": 1699905000000
  }
}
```

**Error Cases:**
- 401: Unauthorized
- 404: Conversation not found
- 403: Conversation belongs to another user

---

#### DELETE /api/chat/conversations/:id

**Description:** Delete conversation and all messages

**Request:**
```typescript
DELETE /api/chat/conversations/conv_xyz789
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Conversation deleted successfully"
}
```

---

#### GET /api/chat/history/:conversation_id

**Description:** Get conversation message history (paginated)

**Request:**
```typescript
GET /api/chat/history/conv_xyz789?page=1&limit=50
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "messages": [...],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 8,
      "pages": 1
    }
  }
}
```

---

#### POST /api/chat/conversations/:id/title

**Description:** Update conversation title

**Request:**
```typescript
POST /api/chat/conversations/conv_xyz789/title
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": string  // Max 200 chars
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "conv_xyz789",
    "title": "Q3 Financial Analysis (Updated)"
  }
}
```

---

### 6.6 Health Endpoints

#### GET /api/health

**Description:** System health check

**Request:**
```typescript
GET /api/health
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": 1699900000000,
    "services": {
      "sqlite": {
        "status": "healthy",
        "db_path": "~/.gkchatty-pure/data/gkchatty.db",
        "db_size_mb": 12.5,
        "wal_mode": true
      },
      "chromadb": {
        "status": "healthy",
        "persist_directory": "~/.gkchatty-pure/chroma",
        "collection_count": 1
      },
      "ollama": {
        "status": "healthy",
        "base_url": "http://localhost:11434",
        "models": ["nomic-embed-text", "llama3.2:3b"]
      },
      "filesystem": {
        "status": "healthy",
        "upload_directory": "~/.gkchatty-pure/uploads",
        "free_space_gb": 250.3
      }
    },
    "uptime_seconds": 3600
  }
}
```

**Error Cases:**
- 500: One or more services unhealthy

---

#### GET /api/health/ollama

**Description:** Ollama-specific health check

**Request:**
```typescript
GET /api/health/ollama
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "base_url": "http://localhost:11434",
    "available_models": [
      {
        "name": "nomic-embed-text",
        "size": "274MB",
        "parameter_size": "137M",
        "modified_at": "2024-11-10T12:00:00Z"
      },
      {
        "name": "llama3.2:3b",
        "size": "2.0GB",
        "parameter_size": "3.2B",
        "modified_at": "2024-11-10T12:00:00Z"
      }
    ],
    "last_check": 1699900000000
  }
}
```

**Error Cases:**
- 503: Ollama service unavailable

---

## 7. Data Validation Rules

### 7.1 Input Validation

**Username:**
- Length: 3-50 characters
- Pattern: `^[a-zA-Z0-9_-]+$`
- Reserved: admin, root, system, api

**Email:**
- Pattern: RFC 5322 compliant
- Max length: 254 characters
- Must be unique

**Password:**
- Min length: 8 characters
- Must contain: 1 uppercase, 1 lowercase, 1 number
- Optional: Special character
- Max length: 128 characters (before hashing)

**File Upload:**
- Allowed MIME types: `application/pdf`, `text/plain`, `text/markdown`
- Max size: 10MB (10485760 bytes)
- Filename: Sanitized (remove special chars)

**Query Parameters:**
- `page`: Integer >= 1
- `limit`: Integer 1-100
- `min_score`: Float 0.0-1.0
- `max_sources`: Integer 1-50

---

### 7.2 Business Logic Validation

**Document Upload:**
1. Check user storage quota (if implemented)
2. Validate file type by content (not just extension)
3. Scan for malware (optional, future enhancement)
4. Check duplicate filename (warn user)

**RAG Query:**
1. Require at least 1 document processed
2. Minimum query length: 3 characters
3. Maximum query length: 1000 characters
4. Check Ollama service availability before processing

**Chat Message:**
1. Maximum message length: 5000 characters
2. Rate limiting: 10 messages per minute per user
3. Check conversation ownership before adding message

---

## Summary Statistics

**Database Schema:**
- Total Tables: 5 (users, documents, conversations, messages, settings)
- Total Indexes: 16
- Foreign Keys: 5
- Check Constraints: 8
- Unique Constraints: 5

**API Endpoints:**
- Total: 18
- Authentication: 4
- Documents: 4
- RAG: 2
- Chat: 6
- Health: 2

**Data Types:**
- TEXT: 45 columns
- INTEGER: 25 columns
- JSON (stored as TEXT): 3 columns

**Estimated Storage:**
- User row: ~500 bytes
- Document row: ~2KB (including extracted_text)
- Message row: ~1.5KB (including sources JSON)
- Conversation row: ~200 bytes
- Settings row: ~300 bytes

**Performance Targets:**
- SQLite query (indexed): < 10ms
- Document upload: < 5s (1MB file)
- RAG query: < 10s (including LLM)
- Message history fetch: < 50ms (50 messages)

---

**End of Part 2**

Part 3 will cover:
- Data flows (document upload flow, RAG query flow, chat flow)
- Security architecture (authentication, authorization, input sanitization)
- Validation gates (audit script integration, testing requirements)
- Performance optimization strategies
- Error handling patterns
