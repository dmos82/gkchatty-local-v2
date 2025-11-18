# GKChatty-Pure Architecture Document - Part 3 of 3

## Document Metadata
- **Project:** GKChatty-Pure (4th Iteration - 100% Local RAG Platform)
- **Version:** 1.0.0
- **Date:** 2025-11-11
- **Author:** System Architect
- **Status:** Phase 1 Architecture (Data Flows, Security, Validation)
- **Continuation of:** Part 2 (Database Schema, API Contracts)

---

## 8. Data Flow Diagrams

### 8.1 Document Upload Flow (End-to-End)

```
┌─────────────────────────────────────────────────────────────────────┐
│ PHASE 1: File Upload & Validation (Frontend → Backend)             │
└─────────────────────────────────────────────────────────────────────┘

[User] → [Frontend: Upload Component]
           ↓ (FormData with file)
       POST /api/documents/upload
           ↓
[Backend: Multer Middleware]
  ├─ Validate file type (PDF/TXT/MD) ✓
  ├─ Validate file size (< 10MB) ✓
  └─ Save to temp: /tmp/upload_abc123.pdf
           ↓
[Backend: Document Controller]
  ├─ Generate document ID (UUID)
  ├─ Create user directory: ~/.gkchatty-pure/uploads/{user_id}/
  ├─ Move file: /tmp/upload_abc123.pdf → ~/.gkchatty-pure/uploads/{user_id}/doc_abc123.pdf
  └─ Insert to SQLite: status='pending'
           ↓
[Response to Frontend]
  {
    "success": true,
    "data": {
      "id": "doc_abc123",
      "status": "pending",
      "filename": "quarterly-report.pdf"
    }
  }

┌─────────────────────────────────────────────────────────────────────┐
│ PHASE 2: Background Processing (Async Job)                          │
└─────────────────────────────────────────────────────────────────────┘

[Backend: Document Service] (Background Worker)
  ↓
  1. Update status → 'processing'
  ↓
  2. Extract Text
     ├─ PDF: Use pdf-parse library
     ├─ TXT: Use fs.readFile (UTF-8)
     └─ MD: Use fs.readFile (UTF-8)
     Result: "Q3 2024 Financial Report... Revenue $2.5M..."
  ↓
  3. Chunk Text (RAG Service)
     ├─ Chunk size: 512 tokens (~2048 chars)
     ├─ Overlap: 50 tokens (~200 chars)
     ├─ Algorithm: Sliding window with sentence boundaries
     Result: 42 chunks
  ↓
  4. Generate Embeddings (Embedding Service)
     For each chunk (parallel processing, batch size: 10):
       ├─ Call Ollama: POST http://localhost:11434/api/embeddings
       ├─ Model: nomic-embed-text
       ├─ Input: chunk text
       └─ Output: 768-dimensional vector
     Result: 42 embeddings (768-dim each)
  ↓
  5. Store in ChromaDB (Vector Service)
     ├─ Collection: user_{user_id}_documents
     ├─ Upsert vectors with metadata:
     │    {
     │      "ids": ["doc_abc123_chunk_0", "doc_abc123_chunk_1", ...],
     │      "embeddings": [[0.123, -0.456, ...], ...],
     │      "metadatas": [
     │        {
     │          "document_id": "doc_abc123",
     │          "chunk_index": 0,
     │          "text": "Q3 2024 Financial Report...",
     │          "filename": "quarterly-report.pdf"
     │        },
     │        ...
     │      ]
     │    }
     └─ Persist to: ~/.gkchatty-pure/chroma/
  ↓
  6. Update SQLite
     ├─ extracted_text = full text (for search)
     ├─ chunk_count = 42
     ├─ embedding_model = "nomic-embed-text"
     ├─ embedding_dimension = 768
     ├─ chroma_collection_id = "user_{user_id}_documents"
     ├─ status = 'completed'
     └─ processed_at = current timestamp
  ↓
  7. Frontend Polling (Optional)
     Frontend polls: GET /api/documents/doc_abc123
     Until status === 'completed'

┌─────────────────────────────────────────────────────────────────────┐
│ PHASE 3: Error Handling                                             │
└─────────────────────────────────────────────────────────────────────┘

If any step fails:
  ├─ Catch error
  ├─ Update status → 'failed'
  ├─ Set status_detail → error message
  ├─ Cleanup: Delete partial data from ChromaDB (if applicable)
  └─ Log error to ~/.gkchatty-pure/logs/processing.log

Performance Metrics:
  - 1MB PDF: ~3-5 seconds total
  - Breakdown:
    * File upload: ~500ms
    * Text extraction: ~1s
    * Chunking: ~200ms
    * Embeddings (42 chunks): ~2s (Ollama M2 MPS)
    * ChromaDB upsert: ~300ms
    * SQLite update: ~50ms
```

---

### 8.2 RAG Query Flow (Semantic Search + LLM)

```
┌─────────────────────────────────────────────────────────────────────┐
│ PHASE 1: Query Embedding Generation                                 │
└─────────────────────────────────────────────────────────────────────┘

[User] → [Frontend: Chat Input]
           ↓ ("What was our Q3 revenue?")
       POST /api/rag/query
       {
         "query": "What was our Q3 revenue?",
         "max_sources": 5,
         "min_score": 0.7
       }
           ↓
[Backend: RAG Controller]
  ↓
[RAG Service: Generate Query Embedding]
  ├─ Call Ollama embeddings API
  ├─ POST http://localhost:11434/api/embeddings
  ├─ Body: {
  │    "model": "nomic-embed-text",
  │    "prompt": "What was our Q3 revenue?"
  │  }
  └─ Response: 768-dimensional vector
     [0.234, -0.567, 0.123, ...]

  Time: ~45ms

┌─────────────────────────────────────────────────────────────────────┐
│ PHASE 2: Semantic Search in ChromaDB                                │
└─────────────────────────────────────────────────────────────────────┘

[RAG Service: Semantic Search]
  ↓
[Vector Service: Query ChromaDB]
  ├─ Collection: user_{user_id}_documents
  ├─ Method: collection.query()
  ├─ Parameters:
  │    {
  │      "query_embeddings": [[0.234, -0.567, 0.123, ...]],
  │      "n_results": 10,  // Fetch extra for filtering
  │      "include": ["embeddings", "metadatas", "distances"]
  │    }
  └─ Response (ChromaDB):
     {
       "ids": [["doc_abc123_chunk_5", "doc_abc123_chunk_12", ...]],
       "metadatas": [[
         {
           "document_id": "doc_abc123",
           "chunk_index": 5,
           "text": "Q3 revenue: $2.5M, up 15% from Q2.",
           "filename": "quarterly-report.pdf"
         },
         ...
       ]],
       "distances": [[0.23, 0.35, 0.42, ...]]  // Cosine distance (lower = better)
     }

  Time: ~12ms

┌─────────────────────────────────────────────────────────────────────┐
│ PHASE 3: Score Filtering & Ranking                                  │
└─────────────────────────────────────────────────────────────────────┘

[RAG Service: Post-Process Results]
  ↓
  1. Convert distances to similarity scores
     similarity = 1 - (distance / 2)  // Normalize to 0-1

  2. Filter by min_score (0.7)
     Keep only chunks with similarity >= 0.7

  3. Sort by score (descending)

  4. Limit to max_sources (5)

  Result:
  [
    {
      "document_id": "doc_abc123",
      "filename": "quarterly-report.pdf",
      "chunk_index": 5,
      "score": 0.89,
      "text": "Q3 revenue: $2.5M, up 15% from Q2."
    },
    {
      "document_id": "doc_abc123",
      "filename": "quarterly-report.pdf",
      "chunk_index": 12,
      "score": 0.82,
      "text": "Total Q3 revenue includes product sales ($1.8M) and services ($0.7M)."
    },
    ...
  ]

┌─────────────────────────────────────────────────────────────────────┐
│ PHASE 4: LLM Response Generation                                    │
└─────────────────────────────────────────────────────────────────────┘

[RAG Service: Construct Prompt]
  ↓
  System Prompt:
  "You are a helpful AI assistant. Answer the user's question based on the provided context.
   If the context doesn't contain the answer, say 'I don't have enough information.'"

  Context (from top sources):
  """
  Source 1 (quarterly-report.pdf, score: 0.89):
  Q3 revenue: $2.5M, up 15% from Q2.

  Source 2 (quarterly-report.pdf, score: 0.82):
  Total Q3 revenue includes product sales ($1.8M) and services ($0.7M).
  """

  User Question:
  "What was our Q3 revenue?"

  ↓
[RAG Service: Call Ollama LLM]
  ├─ POST http://localhost:11434/api/generate
  ├─ Body: {
  │    "model": "llama3.2:3b",
  │    "prompt": "<system_prompt>\n\n<context>\n\n<question>",
  │    "stream": false,
  │    "options": {
  │      "temperature": 0.3,  // Lower for factual answers
  │      "top_p": 0.9
  │    }
  │  }
  └─ Response:
     {
       "model": "llama3.2:3b",
       "response": "According to the Q3 report, our revenue was $2.5M, which represents a 15% increase from Q2. This includes $1.8M from product sales and $0.7M from services.",
       "done": true,
       "total_duration": 3500000000  // nanoseconds (3.5 seconds)
     }

  Time: ~3500ms

┌─────────────────────────────────────────────────────────────────────┐
│ PHASE 5: Response Formatting                                        │
└─────────────────────────────────────────────────────────────────────┘

[RAG Service: Format Response]
  {
    "answer": "According to the Q3 report, our revenue was $2.5M...",
    "sources": [
      {
        "document_id": "doc_abc123",
        "filename": "quarterly-report.pdf",
        "chunk_index": 5,
        "score": 0.89,
        "text": "Q3 revenue: $2.5M, up 15% from Q2."
      },
      ...
    ],
    "query_embedding_time_ms": 45,
    "search_time_ms": 12,
    "llm_time_ms": 3500,
    "total_time_ms": 3557
  }
  ↓
[Response to Frontend] (200 OK)

Total Time: ~3.6 seconds
```

---

### 8.3 Chat Message Flow (With Conversation Management)

```
┌─────────────────────────────────────────────────────────────────────┐
│ PHASE 1: Message Creation                                           │
└─────────────────────────────────────────────────────────────────────┘

[User] → [Frontend: Chat Interface]
           ↓
       POST /api/chat
       {
         "conversation_id": "conv_xyz789",  // Or null for new conversation
         "message": "What was our Q3 revenue?",
         "use_rag": true,
         "max_sources": 5
       }
           ↓
[Backend: Chat Controller]
  ↓
[Chat Service: Process Message]

  1. Check/Create Conversation
     ├─ If conversation_id provided:
     │    └─ Verify conversation belongs to user (403 if not)
     └─ If conversation_id is null:
          └─ Create new conversation:
             INSERT INTO conversations (id, user_id, title, created_at, updated_at)
             VALUES (uuid(), user_id, NULL, now(), now())

  2. Save User Message
     INSERT INTO messages (id, conversation_id, role, content, created_at)
     VALUES (uuid(), conversation_id, 'user', message, now())

  3. Generate Assistant Response
     ├─ If use_rag === true:
     │    ├─ Call RAG Service (see 8.2 above)
     │    └─ Get: {answer, sources, metrics}
     └─ If use_rag === false:
          └─ Call Ollama LLM directly (no context)

  4. Save Assistant Message
     INSERT INTO messages (id, conversation_id, role, content, sources, created_at)
     VALUES (
       uuid(),
       conversation_id,
       'assistant',
       answer,
       JSON.stringify(sources),  // Store sources as JSON
       now()
     )

  5. Update Conversation Metadata
     UPDATE conversations
     SET message_count = message_count + 2,  // User + assistant
         last_message_at = now(),
         updated_at = now(),
         title = COALESCE(title, generate_title(message))  // Auto-generate if null
     WHERE id = conversation_id

  6. Return Response
     {
       "conversation_id": "conv_xyz789",
       "user_message": {...},
       "assistant_message": {
         "content": answer,
         "sources": sources
       }
     }

┌─────────────────────────────────────────────────────────────────────┐
│ PHASE 2: Conversation Title Generation (Optional)                   │
└─────────────────────────────────────────────────────────────────────┘

[Chat Service: Generate Title]
  ↓
  If conversation.title is NULL:
    ├─ Option A: Use first user message (truncated)
    │    "What was our Q3 revenue?" → "What was our Q3 revenue?"
    │
    └─ Option B: Use LLM to generate title
         POST http://localhost:11434/api/generate
         {
           "model": "llama3.2:3b",
           "prompt": "Generate a 5-word title for this conversation:\n\nUser: What was our Q3 revenue?\n\nTitle:",
           "stream": false,
           "options": {"temperature": 0.7, "max_tokens": 20}
         }
         Response: "Q3 Financial Revenue Analysis"

  UPDATE conversations SET title = generated_title WHERE id = conversation_id

Performance:
  - Total time: RAG query time + 2x SQLite inserts (~3.7 seconds)
  - SQLite insert: ~5ms each
  - Title generation: +1s (if using LLM)
```

---

### 8.4 Authentication Flow (JWT)

```
┌─────────────────────────────────────────────────────────────────────┐
│ SIGNUP FLOW                                                          │
└─────────────────────────────────────────────────────────────────────┘

[Frontend] → POST /api/auth/signup
             {
               "username": "alice",
               "email": "alice@example.com",
               "password": "SecurePass123!"
             }
               ↓
[Backend: Auth Controller]
  ↓
[Auth Service: Signup]

  1. Validate Input
     ├─ Username: 3-50 chars, alphanumeric + _-
     ├─ Email: Valid format (regex)
     └─ Password: Min 8 chars, 1 upper, 1 lower, 1 number

  2. Check Uniqueness
     SELECT * FROM users WHERE username = ? OR email = ?
     ├─ If exists → Return 409 Conflict
     └─ If not exists → Continue

  3. Hash Password
     bcrypt.hash(password, 10)
     Result: "$2b$10$N9qo8uLOickgx2ZMRZoMye..."
     Time: ~100ms (10 rounds)

  4. Create User
     INSERT INTO users (id, username, email, password_hash, role, created_at, updated_at)
     VALUES (uuid(), ?, ?, ?, 'user', now(), now())

  5. Generate JWT Token
     jwt.sign(
       {
         user_id: user.id,
         username: user.username,
         role: user.role
       },
       JWT_SECRET,
       { expiresIn: '7d' }
     )
     Result: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

  6. Return Response
     {
       "user": {id, username, email, role},
       "token": "eyJhbGci..."
     }

  Frontend stores token in localStorage

┌─────────────────────────────────────────────────────────────────────┐
│ LOGIN FLOW                                                           │
└─────────────────────────────────────────────────────────────────────┘

[Frontend] → POST /api/auth/login
             {
               "email": "alice@example.com",
               "password": "SecurePass123!"
             }
               ↓
[Backend: Auth Controller]
  ↓
[Auth Service: Login]

  1. Find User
     SELECT * FROM users WHERE email = ?
     ├─ If not found → Return 404 User not found
     └─ If found → Continue

  2. Verify Password
     bcrypt.compare(password, user.password_hash)
     Time: ~100ms
     ├─ If false → Return 401 Invalid credentials
     └─ If true → Continue

  3. Update Last Login
     UPDATE users SET last_login_at = now() WHERE id = user.id

  4. Generate JWT Token (same as signup)

  5. Return Response
     {
       "user": {id, username, email, role},
       "token": "eyJhbGci..."
     }

┌─────────────────────────────────────────────────────────────────────┐
│ AUTHENTICATED REQUEST FLOW                                           │
└─────────────────────────────────────────────────────────────────────┘

[Frontend] → GET /api/documents
             Headers: {
               "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
             }
               ↓
[Backend: Auth Middleware]

  1. Extract Token
     const token = req.headers.authorization?.split(' ')[1]
     ├─ If missing → Return 401 Unauthorized
     └─ If present → Continue

  2. Verify Token
     jwt.verify(token, JWT_SECRET)
     ├─ If expired → Return 401 Token expired
     ├─ If invalid → Return 401 Invalid token
     └─ If valid → Decode payload

  3. Attach User to Request
     req.user = {
       user_id: payload.user_id,
       username: payload.username,
       role: payload.role
     }

  4. Continue to Controller
     next()

  ↓
[Backend: Document Controller]
  Access req.user.user_id for user-scoped queries
```

---

## 9. Security Architecture

### 9.1 Authentication & Authorization

**JWT Token Security:**
```typescript
// Token Generation
const token = jwt.sign(
  {
    user_id: user.id,
    username: user.username,
    role: user.role,
    iat: Date.now() / 1000  // Issued at
  },
  JWT_SECRET,  // 256-bit random key (stored in .env)
  {
    expiresIn: '7d',
    algorithm: 'HS256'
  }
);

// Token Verification
try {
  const payload = jwt.verify(token, JWT_SECRET);
  // Payload: { user_id, username, role, iat, exp }
} catch (error) {
  // Invalid or expired token
}
```

**Password Security:**
- Hashing: bcrypt with 10 salt rounds
- Never stored in plaintext
- Minimum requirements enforced:
  - Length: 8+ characters
  - Complexity: 1 uppercase, 1 lowercase, 1 number
  - Optional: Special characters
- Rate limiting on login attempts (10/minute per IP)

**Authorization Strategy:**
```typescript
// Middleware: Check Resource Ownership
async function checkDocumentOwnership(req, res, next) {
  const document = await db.prepare(
    'SELECT user_id FROM documents WHERE id = ?'
  ).get(req.params.id);

  if (!document) {
    return res.status(404).json({ error: 'Document not found' });
  }

  if (document.user_id !== req.user.user_id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  next();
}

// Usage
router.delete('/documents/:id', authMiddleware, checkDocumentOwnership, deleteDocument);
```

---

### 9.2 Input Validation & Sanitization

**Validation Strategy:**
1. **Type Validation** - Ensure correct data types
2. **Format Validation** - Regex patterns for email, username
3. **Range Validation** - Min/max lengths, numeric ranges
4. **Content Validation** - Whitelist allowed characters
5. **Business Logic Validation** - Check uniqueness, existence

**Implementation:**
```typescript
import { z } from 'zod';

// Schema Definition
const SignupSchema = z.object({
  username: z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(50, 'Username must be at most 50 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain alphanumeric, underscore, dash'),
  email: z.string()
    .email('Invalid email format')
    .max(254, 'Email too long'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain uppercase, lowercase, number')
});

// Validation Middleware
function validateInput(schema: z.ZodSchema) {
  return (req, res, next) => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input',
            details: error.errors
          }
        });
      }
      next(error);
    }
  };
}

// Usage
router.post('/auth/signup', validateInput(SignupSchema), signup);
```

**Sanitization (SQL Injection Prevention):**
```typescript
// ✅ GOOD: Parameterized Queries (better-sqlite3)
const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

// ❌ BAD: String Concatenation (SQL INJECTION RISK)
const user = db.prepare(`SELECT * FROM users WHERE email = '${email}'`).get();
```

**File Upload Validation:**
```typescript
import multer from 'multer';
import path from 'path';

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['application/pdf', 'text/plain', 'text/markdown'];

  if (!allowedTypes.includes(file.mimetype)) {
    return cb(new Error('Invalid file type. Only PDF, TXT, MD allowed.'), false);
  }

  cb(null, true);
};

const upload = multer({
  dest: '/tmp/uploads',
  limits: {
    fileSize: 10 * 1024 * 1024  // 10MB
  },
  fileFilter
});
```

---

### 9.3 CORS Configuration

**Purpose:** Allow frontend (localhost:3004) to access backend (localhost:3001)

```typescript
import cors from 'cors';

const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = [
      'http://localhost:3004',  // Frontend
      'http://127.0.0.1:3004'   // Alternative localhost
    ];

    // Allow requests with no origin (e.g., mobile apps, Postman)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,  // Allow cookies (if needed)
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
```

---

### 9.4 Rate Limiting

**Purpose:** Prevent abuse, brute-force attacks

```typescript
import rateLimit from 'express-rate-limit';

// Global Rate Limiter (100 requests per 15 minutes)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 100,
  message: { error: 'Too many requests, please try again later.' }
});

// Auth Rate Limiter (Stricter: 5 login attempts per 15 minutes)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,  // Only count failed attempts
  message: { error: 'Too many login attempts, please try again later.' }
});

// File Upload Rate Limiter (3 uploads per hour)
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1 hour
  max: 3,
  message: { error: 'Upload limit exceeded, please try again later.' }
});

// Usage
app.use('/api', globalLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/documents/upload', uploadLimiter);
```

---

### 9.5 Error Handling & Logging

**Error Handling Middleware:**
```typescript
// Custom Error Class
class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'AppError';
  }
}

// Global Error Handler
function errorHandler(err, req, res, next) {
  // Log error
  logger.error({
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    error: err.message,
    stack: err.stack,
    user_id: req.user?.user_id
  });

  // Handle known errors
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details
      }
    });
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid authentication token'
      }
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      error: {
        code: 'TOKEN_EXPIRED',
        message: 'Authentication token expired'
      }
    });
  }

  // Handle multer errors
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'FILE_TOO_LARGE',
          message: 'File size exceeds 10MB limit'
        }
      });
    }
  }

  // Handle SQLite errors
  if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return res.status(409).json({
      success: false,
      error: {
        code: 'DUPLICATE_ENTRY',
        message: 'Resource already exists'
      }
    });
  }

  // Fallback: Unknown error (don't expose internals)
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred'
    }
  });
}

app.use(errorHandler);
```

**Logging Strategy:**
```typescript
import winston from 'winston';
import path from 'path';

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    // Console output
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    // File output
    new winston.transports.File({
      filename: path.join(process.env.HOME, '.gkchatty-pure/logs/error.log'),
      level: 'error'
    }),
    new winston.transports.File({
      filename: path.join(process.env.HOME, '.gkchatty-pure/logs/combined.log')
    })
  ]
});

// Usage
logger.info('Server started on port 3001');
logger.error('Database connection failed', { error: err.message });
logger.debug('Processing document', { document_id, user_id });
```

---

## 10. Validation Gates & Testing Strategy

### 10.1 Contamination Prevention Workflow

**After EVERY implementation step:**

```bash
#!/bin/bash
# Validation Workflow (Run after each component implementation)

echo "🔒 Step 1: Run audit script"
./scripts/audit-local.sh
if [ $? -ne 0 ]; then
  echo "❌ AUDIT FAILED - Fix violations before continuing"
  exit 1
fi

echo "✅ Step 2: Verify no banned imports"
grep -r "from ['\"]mongoose['\"]" backend/src/ && exit 1
grep -r "from ['\"]openai['\"]" backend/src/ && exit 1
grep -r "MONGODB_URI" backend/.env && exit 1

echo "✅ Step 3: Check data locality"
# All data should be in ~/.gkchatty-pure/
ls -la ~/.gkchatty-pure/data/gkchatty.db || echo "⚠️ SQLite DB not created yet"
ls -la ~/.gkchatty-pure/chroma/ || echo "⚠️ ChromaDB not initialized yet"

echo "✅ Step 4: Verify Ollama connectivity"
curl -s http://localhost:11434/api/tags || echo "⚠️ Ollama not running"

echo "✅ All validation gates passed"
```

---

### 10.2 Testing Strategy

**Test Pyramid:**
```
         ┌──────────────────┐
         │   E2E Tests (5%) │  Frontend → Backend → DB → Ollama
         └──────────────────┘
              ┌────────────────────────┐
              │ Integration Tests (25%)│  Backend → DB, Backend → Ollama
              └────────────────────────┘
                   ┌──────────────────────────────┐
                   │   Unit Tests (70%)            │  Services, Controllers, Utils
                   └──────────────────────────────┘
```

**Unit Tests (Jest):**
```typescript
// backend/src/__tests__/services/authService.test.ts
import { AuthService } from '../../services/authService';
import { sqliteHelper } from '../../utils/local/sqliteHelper';

describe('AuthService', () => {
  let authService: AuthService;
  let db;

  beforeAll(() => {
    // Use in-memory SQLite for tests
    db = sqliteHelper.connect(':memory:');
    authService = new AuthService(db);
  });

  afterAll(() => {
    db.close();
  });

  describe('signup', () => {
    it('should create user with hashed password', async () => {
      const user = await authService.signup(
        'alice',
        'alice@example.com',
        'SecurePass123!'
      );

      expect(user.id).toBeDefined();
      expect(user.username).toBe('alice');
      expect(user.password_hash).not.toBe('SecurePass123!');  // Hashed
      expect(user.password_hash).toMatch(/^\$2b\$10\$/);  // bcrypt format
    });

    it('should reject duplicate username', async () => {
      await authService.signup('bob', 'bob@example.com', 'SecurePass123!');

      await expect(
        authService.signup('bob', 'bob2@example.com', 'SecurePass123!')
      ).rejects.toThrow('Username already exists');
    });

    it('should reject weak password', async () => {
      await expect(
        authService.signup('charlie', 'charlie@example.com', 'weak')
      ).rejects.toThrow('Password must be at least 8 characters');
    });
  });

  describe('login', () => {
    it('should return token for valid credentials', async () => {
      await authService.signup('dave', 'dave@example.com', 'SecurePass123!');

      const result = await authService.login('dave@example.com', 'SecurePass123!');

      expect(result.user.username).toBe('dave');
      expect(result.token).toMatch(/^eyJ/);  // JWT format
    });

    it('should reject invalid password', async () => {
      await authService.signup('eve', 'eve@example.com', 'SecurePass123!');

      await expect(
        authService.login('eve@example.com', 'WrongPass123!')
      ).rejects.toThrow('Invalid credentials');
    });
  });
});
```

**Integration Tests:**
```typescript
// backend/src/__tests__/integration/ragFlow.test.ts
import { DocumentService } from '../../services/documentService';
import { RAGService } from '../../services/ragService';
import { chromaService } from '../../utils/local/chromaService';
import { embeddingService } from '../../utils/local/embeddingService';

describe('RAG Flow Integration', () => {
  let documentService: DocumentService;
  let ragService: RAGService;

  beforeAll(async () => {
    // Initialize services with real Ollama and ChromaDB
    documentService = new DocumentService();
    ragService = new RAGService();

    // Ensure Ollama is running
    const ollamaHealthy = await embeddingService.healthCheck();
    if (!ollamaHealthy) {
      throw new Error('Ollama not running. Start with: ollama serve');
    }
  });

  it('should complete full RAG pipeline: upload → embed → query', async () => {
    // Step 1: Upload document
    const document = await documentService.processDocument({
      user_id: 'test_user',
      filename: 'test-doc.txt',
      filepath: '/tmp/test-doc.txt',
      content: 'The Q3 revenue was $2.5 million, up 15% from Q2.'
    });

    expect(document.status).toBe('completed');
    expect(document.chunk_count).toBeGreaterThan(0);

    // Step 2: Query with RAG
    const result = await ragService.query({
      user_id: 'test_user',
      query: 'What was the Q3 revenue?',
      max_sources: 5,
      min_score: 0.7
    });

    expect(result.answer).toContain('$2.5 million');
    expect(result.sources.length).toBeGreaterThan(0);
    expect(result.sources[0].score).toBeGreaterThan(0.7);

    // Step 3: Verify embeddings in ChromaDB
    const collection = await chromaService.getCollection('test_user_documents');
    const count = await collection.count();
    expect(count).toBeGreaterThan(0);
  }, 30000);  // 30 second timeout (includes Ollama calls)
});
```

**E2E Tests (Playwright):**
```typescript
// backend/src/__tests__/e2e/chatFlow.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Chat Flow E2E', () => {
  test('should complete full chat workflow', async ({ page }) => {
    // Step 1: Login
    await page.goto('http://localhost:3004/login');
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'SecurePass123!');
    await page.click('button[type="submit"]');

    // Wait for redirect to chat
    await page.waitForURL('http://localhost:3004/chat');

    // Step 2: Upload document
    await page.click('button:has-text("Upload")');
    await page.setInputFiles('input[type="file"]', 'test-fixtures/sample.pdf');
    await page.click('button:has-text("Upload")');

    // Wait for processing
    await expect(page.locator('text=Processing complete')).toBeVisible({ timeout: 10000 });

    // Step 3: Send message
    await page.fill('textarea[placeholder="Ask a question..."]', 'What is this document about?');
    await page.click('button:has-text("Send")');

    // Verify response with sources
    await expect(page.locator('.message.assistant')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.sources')).toBeVisible();

    // Step 4: Verify conversation saved
    await page.click('a:has-text("Conversations")');
    await expect(page.locator('text=What is this document about?')).toBeVisible();
  });
});
```

**Coverage Requirements:**
- Unit tests: 80% minimum
- Integration tests: Critical paths covered
- E2E tests: Happy path + error scenarios

---

### 10.3 Performance Benchmarks

**Target Performance Metrics:**

| Operation | Target | Measurement Method |
|-----------|--------|-------------------|
| SQLite insert (user) | < 10ms | `console.time()` in code |
| SQLite select (indexed) | < 5ms | `console.time()` in code |
| SQLite select (unindexed) | < 50ms | `console.time()` in code |
| Password hash (bcrypt) | < 150ms | `console.time()` in code |
| JWT sign | < 5ms | `console.time()` in code |
| JWT verify | < 2ms | `console.time()` in code |
| File upload (1MB) | < 2s | End-to-end timing |
| Text extraction (1MB PDF) | < 1.5s | `pdf-parse` timing |
| Chunking (5000 chars) | < 100ms | Service timing |
| Embedding (1 chunk) | < 50ms | Ollama timing |
| Embedding (10 chunks batch) | < 300ms | Ollama timing |
| ChromaDB upsert (100 vectors) | < 500ms | ChromaDB timing |
| ChromaDB query (top 10) | < 50ms | ChromaDB timing |
| Ollama LLM (simple query) | < 5s | Ollama timing |
| **Full RAG query** | < 10s | End-to-end timing |
| **Document processing (1MB)** | < 5s | End-to-end timing |

**Performance Testing Script:**
```typescript
// backend/src/scripts/benchmarkPerformance.ts
import { performance } from 'perf_hooks';

async function benchmarkRAGQuery() {
  const start = performance.now();

  const result = await ragService.query({
    user_id: 'test_user',
    query: 'What was the Q3 revenue?',
    max_sources: 5
  });

  const end = performance.now();
  const duration = end - start;

  console.log(`RAG Query Performance:`);
  console.log(`  Total: ${duration.toFixed(2)}ms`);
  console.log(`  Embedding: ${result.query_embedding_time_ms}ms`);
  console.log(`  Search: ${result.search_time_ms}ms`);
  console.log(`  LLM: ${result.llm_time_ms}ms`);

  if (duration > 10000) {
    console.warn(`⚠️ Performance degraded (target: < 10s)`);
  }
}
```

---

## 11. Deployment & Production Readiness

### 11.1 Pre-Deployment Checklist

**Before marking MVP complete:**

- [ ] All 18 API endpoints implemented and tested
- [ ] Audit script reports ZERO violations
- [ ] Unit tests: 80%+ coverage, all passing
- [ ] Integration tests: All passing
- [ ] E2E tests: Critical paths passing
- [ ] Frontend integration: Successful login + upload + query
- [ ] Performance benchmarks: All targets met
- [ ] Error handling: All endpoints have error handlers
- [ ] Logging: All critical operations logged
- [ ] Documentation: API docs complete
- [ ] Security review: OWASP top 10 addressed
- [ ] Data locality verified: All in `~/.gkchatty-pure/`

---

### 11.2 Environment Configuration

**.env Production Template:**
```bash
# Server
NODE_ENV=production
PORT=3001

# JWT (CHANGE THIS IN PRODUCTION)
JWT_SECRET=<generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
JWT_EXPIRATION=7d

# Database
SQLITE_DB_PATH=/Users/user/.gkchatty-pure/data/gkchatty.db
SQLITE_WAL_MODE=true

# ChromaDB
CHROMA_PERSIST_DIRECTORY=/Users/user/.gkchatty-pure/chroma
CHROMA_COLLECTION_PREFIX=user_

# Ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
OLLAMA_CHAT_MODEL=llama3.2:3b

# File Storage
FILE_STORAGE_MODE=local
LOCAL_FILE_STORAGE_DIR=/Users/user/.gkchatty-pure/uploads
MAX_FILE_SIZE_MB=10

# Logging
LOG_LEVEL=info
LOG_DIR=/Users/user/.gkchatty-pure/logs
```

---

### 11.3 Health Monitoring

**Health Check Endpoint Response:**
```json
{
  "status": "healthy",
  "services": {
    "sqlite": {
      "status": "healthy",
      "response_time_ms": 2,
      "db_size_mb": 12.5
    },
    "chromadb": {
      "status": "healthy",
      "response_time_ms": 8,
      "collection_count": 3
    },
    "ollama": {
      "status": "healthy",
      "response_time_ms": 15,
      "models": ["nomic-embed-text", "llama3.2:3b"]
    },
    "filesystem": {
      "status": "healthy",
      "free_space_gb": 250.3
    }
  },
  "uptime_seconds": 3600
}
```

**Monitoring Strategy:**
- Health check every 60 seconds
- Log degraded performance
- Alert if any service unhealthy > 5 minutes

---

## 12. Summary & Next Steps

### 12.1 Architecture Completeness

**Phase 1 Complete (3 Parts):**
- ✅ Part 1: System overview, components, tech stack, directory structure
- ✅ Part 2: Database schemas (5 tables), API contracts (18 endpoints)
- ✅ Part 3: Data flows (4 diagrams), security architecture, validation gates

**Total Architecture Documentation:**
- Pages: 3 markdown files (~15,000 words)
- Components: 28 identified
- Endpoints: 18 fully specified
- Database tables: 5 with complete schemas
- Indexes: 16
- Data flows: 4 end-to-end diagrams
- Security layers: 6 (auth, validation, CORS, rate limiting, error handling, logging)

---

### 12.2 Estimated Implementation Effort

**Breakdown by Component Type:**

| Component | Count | Hours Each | Total |
|-----------|-------|------------|-------|
| Controllers | 8 | 1h | 8h |
| Services | 9 | 2h | 18h |
| Middleware | 6 | 0.5h | 3h |
| Models | 6 | 0.5h | 3h |
| Utils (expand existing) | 3 | 1h | 3h |
| Migrations | 5 | 0.5h | 2.5h |
| Frontend Integration | 1 | 3h | 3h |
| Testing & Debugging | - | - | 5-7h |

**Total: 30-40 hours** (as estimated in Phase 0)

---

### 12.3 Next Phase: Discovery

**Phase 2 will discover:**
1. Existing production-ready files to reuse:
   - `backend/src/config/db.config.ts`
   - `backend/src/config/chroma.config.ts`
   - `backend/src/utils/local/sqliteHelper.ts`
   - `backend/src/utils/local/chromaService.ts`
   - `backend/src/utils/local/embeddingService.ts`

2. Files that need expansion:
   - `backend/src/services/ragService.ts` (add semantic search)
   - `backend/src/controllers/authControllerLocal.ts` (complete implementation)

3. Files to create from scratch:
   - All chat-related components
   - Settings management
   - Health check endpoints

4. Frontend integration points:
   - API client configuration
   - CORS requirements
   - Response format expectations

---

### 12.4 Success Criteria Review

**When implementation is complete, we must verify:**

1. ✅ Backend runs on `localhost:3001`
2. ✅ Frontend (existing) connects successfully on `localhost:3004`
3. ✅ Full RAG flow works: Upload → Chunk → Embed → Query → Citations
4. ✅ Audit script reports ZERO violations: `./scripts/audit-local.sh`
5. ✅ No MongoDB, Pinecone, OpenAI, AWS, or Supabase references anywhere
6. ✅ All data in `~/.gkchatty-pure/`
7. ✅ Ollama connectivity verified: `curl http://localhost:11434/api/tags`
8. ✅ All 18 endpoints return expected responses
9. ✅ Tests passing: Unit (80%+), Integration (all), E2E (critical paths)
10. ✅ Performance targets met: RAG query < 10s, document processing < 5s

---

**End of Part 3 - Architecture Phase Complete**

Next: Phase 2 (Discovery) will use the Scout agent to discover relevant files and context from the existing codebase and GKChatty knowledge base.
