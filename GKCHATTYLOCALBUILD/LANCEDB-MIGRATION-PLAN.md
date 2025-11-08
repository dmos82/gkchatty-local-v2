# GKChatty Local - ChromaDB → LanceDB Migration Plan

**Date:** 2025-11-03
**Status:** Ready to Execute
**Estimated Time:** 2-3 hours
**Goal:** Replace ChromaDB with LanceDB for zero-config local vector storage

---

## Executive Summary

**Why LanceDB?**
- ✅ Embedded (no server needed)
- ✅ File-based persistence (like SQLite)
- ✅ Zero Docker dependency
- ✅ Native Node.js/TypeScript support
- ✅ Production-ready (used by Continue.dev)

**What Changes:**
- Replace `chromaDB` package → `vectordb` (LanceDB)
- Replace `chromaService.ts` → `lancedbService.ts`
- Update imports in 3 files
- Zero changes to API contracts

---

## Conflict Analysis & Prevention

### 1. Port Conflicts (RESOLVED)

**Current Port Usage:**
```
✅ Backend API: 6001 (Electron embedded)
✅ Frontend: 6004 (Next.js dev server)
✅ MCP Servers: Various (spawned by Electron)
```

**LanceDB Ports:** NONE - Embedded in-process

**Action Required:** ✅ No port conflicts possible

---

### 2. Environment Variables (CLEANED UP)

**REMOVE These (ChromaDB-specific):**
```bash
# ❌ DELETE FROM .env
CHROMA_PATH=...
CHROMA_SERVER_URL=...
```

**ADD These (LanceDB):**
```bash
# ✅ ADD TO .env
LANCEDB_PATH=~/.gkchatty/data/vectors
```

**Final .env for Local Mode:**
```bash
# ===== GKChatty Local Configuration =====

# Database
USE_SQLITE=true
MONGODB_URI=  # Leave empty for local-only

# Storage
LANCEDB_PATH=~/.gkchatty/data/vectors

# Embeddings
EMBEDDING_PROVIDER=transformers
EMBEDDING_MODEL=nomic-ai/nomic-embed-text-v1.5

# API
PORT=6001
NODE_ENV=development

# JWT (generate with: openssl rand -hex 32)
JWT_SECRET=your-jwt-secret-here
JWT_REFRESH_SECRET=your-refresh-secret-here
ENCRYPTION_KEY=your-encryption-key-here

# CORS
CORS_ALLOWED_ORIGINS=http://localhost:6004

# ===== Cloud Fallback (Optional) =====
# OPENAI_API_KEY=  # Optional fallback
# PINECONE_API_KEY=  # Optional fallback
```

---

### 3. Dependency Conflicts

**REMOVE:**
```json
"chromadb": "2.2.0"
```

**ADD:**
```json
"vectordb": "^0.4.0"  // LanceDB
```

**Check for Conflicts:**
```bash
# Run this to check for peer dependency issues
npm ls vectordb
npm ls apache-arrow  # LanceDB uses Arrow
```

**Known Safe Dependencies:**
- ✅ LanceDB uses Apache Arrow (no conflicts with Transformers.js)
- ✅ Compatible with better-sqlite3
- ✅ No native module conflicts on M2 Mac

---

### 4. File System Paths (STANDARDIZED)

**Single Source of Truth:**
```
~/.gkchatty/
├── data/
│   ├── gkchatty.db        # SQLite (metadata)
│   └── vectors/           # LanceDB (embeddings)
│       ├── documents.lance
│       └── *.lance
└── cache/
    └── huggingface/       # Transformers.js models
```

**Code Changes Required:**
- desktop-agent/src/services/storageService.js: Update path
- backend/src/utils/lancedbService.ts: Set db path

---

### 5. API Contract (NO BREAKING CHANGES)

**Interface STAYS THE SAME:**
```typescript
// These functions keep exact same signatures
export async function queryVectors(
  embeddings: number[],
  options: { namespace?: string; topK?: number; filter?: Record<string, any> }
): Promise<VectorQueryResult>;

export async function upsertVectors(
  namespace: string,
  params: { vectors: number[][]; ids: string[]; metadata?: Record<string, any>[] }
): Promise<void>;

export async function deleteVectorsByFilter(
  filter: Record<string, any>,
  namespace?: string
): Promise<void>;
```

**Result:** Zero changes needed in calling code

---

### 6. Data Format Differences

**ChromaDB Format:**
```typescript
// Query returns: { ids: [[]], distances: [[]], metadatas: [[]] }
// Needs conversion to Pinecone format
```

**LanceDB Format:**
```typescript
// Query returns: [{ id, _distance, ...metadata }]
// Easier to convert to Pinecone format
```

**Impact:** Slightly simpler conversion code in lancedbService

---

## Migration Steps

### **Phase 1: Backup & Prep (5 minutes)**

```bash
# 1. Kill all running processes
lsof -ti:6001 | xargs kill -9

# 2. Backup current code
cp backend/src/utils/chromaService.ts backend/src/utils/chromaService.ts.backup

# 3. Clean node_modules (prevents conflicts)
cd /Users/davidjmorin/GOLDKEY\ CHATTY/gkchatty-ecosystem/GKCHATTYLOCALBUILD/backend
rm -rf node_modules package-lock.json
```

---

### **Phase 2: Update Dependencies (10 minutes)**

**File:** `backend/package.json`

```json
{
  "dependencies": {
    // REMOVE
    "chromadb": "2.2.0",

    // ADD
    "vectordb": "^0.4.0",
    "apache-arrow": "^14.0.0"  // Peer dependency
  }
}
```

**Install:**
```bash
cd backend
npm install
```

**Verify:**
```bash
npm ls vectordb
# Should show: vectordb@0.4.0
```

---

### **Phase 3: Create LanceDB Service (45 minutes)**

**File:** `backend/src/utils/lancedbService.ts`

**Key Implementation Points:**

1. **Import LanceDB:**
```typescript
import * as lancedb from 'vectordb';
```

2. **Initialize with local path:**
```typescript
const dbPath = process.env.LANCEDB_PATH ||
  path.join(process.env.HOME || '', '.gkchatty', 'data', 'vectors');

const db = await lancedb.connect(dbPath);
```

3. **Create/Get Table (like ChromaDB collection):**
```typescript
async function getTable(namespace: string) {
  try {
    return await db.openTable(namespace);
  } catch {
    // Create if doesn't exist
    return await db.createTable(namespace, [
      { id: 'string', vector: 'vector', metadata: 'json' }
    ]);
  }
}
```

4. **Query (Pinecone-compatible):**
```typescript
export async function queryVectors(embeddings: number[], options = {}) {
  const table = await getTable(options.namespace || 'default');

  const results = await table
    .search(embeddings)
    .limit(options.topK || 10)
    .where(options.filter)
    .execute();

  // Convert to Pinecone format
  return {
    matches: results.map(r => ({
      id: r.id,
      score: 1 - r._distance,  // LanceDB returns distance, convert to similarity
      metadata: r.metadata
    }))
  };
}
```

5. **Upsert:**
```typescript
export async function upsertVectors(namespace: string, params: VectorUpsertParams) {
  const table = await getTable(namespace);

  const data = params.ids.map((id, i) => ({
    id,
    vector: params.vectors[i],
    metadata: params.metadata?.[i] || {}
  }));

  await table.add(data);
}
```

6. **Delete by Filter:**
```typescript
export async function deleteVectorsByFilter(filter: Record<string, any>, namespace = 'default') {
  const table = await getTable(namespace);

  // LanceDB delete by filter
  await table.delete(filter);
}
```

---

### **Phase 4: Update Imports (15 minutes)**

**Files to Update:**

1. **backend/src/routes/documentRoutes.ts**
```typescript
// BEFORE
import { deleteVectorsByFilter, queryVectors } from '../utils/chromaService';

// AFTER
import { deleteVectorsByFilter, queryVectors } from '../utils/lancedbService';
```

2. **backend/src/utils/documentProcessor.ts**
```typescript
// BEFORE
import * as chromaService from './chromaService';

// AFTER
import * as lancedbService from './lancedbService';

// Update all chromaService.* calls to lancedbService.*
```

3. **backend/src/services/ragService.ts** (if applicable)
```typescript
// Update import from chromaService to lancedbService
```

**Verification Command:**
```bash
# Find any remaining chromaService references
grep -r "chromaService" backend/src/ --exclude-dir=node_modules
# Should return ZERO results (except .backup files)
```

---

### **Phase 5: Update Environment (5 minutes)**

**File:** `backend/.env`

```bash
# Add this
LANCEDB_PATH=~/.gkchatty/data/vectors

# Remove these (if present)
# CHROMA_PATH=...
# CHROMA_SERVER_URL=...
```

**File:** `desktop-agent/src/services/storageService.js`

```javascript
// Update ChromaDB path to LanceDB path
const vectorDbPath = path.join(dataDir, 'vectors'); // LanceDB directory
```

---

### **Phase 6: Test (30 minutes)**

**Test 1: LanceDB Initialization**
```bash
cd backend
npm run dev
```

**Expected Log:**
```
✅ LanceDB initialized at ~/.gkchatty/data/vectors
✅ Vector database ready
```

**Test 2: Document Upload**
```bash
# Start Electron app
cd ../desktop-agent
npm start
```

1. Upload a test document
2. Check logs for:
   - ✅ Transformers.js embedding generated
   - ✅ LanceDB upsert successful
   - ✅ No errors

**Test 3: Vector Query**
```bash
# Use admin panel or API
curl -X POST http://localhost:6001/api/documents/query \
  -H "Content-Type: application/json" \
  -d '{"query": "test query"}'
```

**Expected:**
- ✅ Returns matching documents
- ✅ < 200ms response time

---

### **Phase 7: Cleanup (10 minutes)**

```bash
# Remove ChromaDB backup
rm backend/src/utils/chromaService.ts.backup

# Remove ChromaDB from package.json (already done in Phase 2)

# Verify no chromadb in node_modules
ls backend/node_modules | grep chroma
# Should return nothing

# Commit changes
git add -A
git commit -m "feat: Migrate from ChromaDB to LanceDB for local vector storage

- Replaced ChromaDB with LanceDB (embedded, no server needed)
- Updated all imports and references
- Maintained Pinecone-compatible API interface
- Zero Docker dependency
- Verified on M2 Mac with MPS acceleration"
```

---

## Gotchas & Solutions

### Gotcha 1: LanceDB creates tables lazily
**Symptom:** First query fails with "table not found"
**Solution:** Always use `getTable()` helper that creates if missing

### Gotcha 2: LanceDB uses distance, Pinecone uses similarity
**Symptom:** Search results ordered incorrectly
**Solution:** Convert: `similarity = 1 - distance`

### Gotcha 3: Apache Arrow peer dependency warning
**Symptom:** npm warns about arrow version
**Solution:** Ignore warning or add `apache-arrow@^14.0.0` explicitly

### Gotcha 4: Path expansion with tilde (~)
**Symptom:** LanceDB can't find path with `~`
**Solution:** Use `process.env.HOME` and `path.join()`

### Gotcha 5: Metadata must be JSON-serializable
**Symptom:** Upsert fails with "cannot serialize"
**Solution:** Ensure all metadata values are primitive types or plain objects

---

## Rollback Plan

If migration fails:

```bash
# 1. Restore chromaService.ts
cp backend/src/utils/chromaService.ts.backup backend/src/utils/chromaService.ts

# 2. Restore package.json
git checkout backend/package.json

# 3. Reinstall dependencies
cd backend && npm install

# 4. Restore imports
git checkout backend/src/routes/documentRoutes.ts
git checkout backend/src/utils/documentProcessor.ts

# 5. Restart backend
npm run dev
```

---

## Success Criteria

- ✅ `npm install` completes with no errors
- ✅ Backend starts with no ChromaDB errors
- ✅ LanceDB path created at `~/.gkchatty/data/vectors/`
- ✅ Document upload generates embeddings
- ✅ Vectors stored in LanceDB (`.lance` files exist)
- ✅ Document query returns results
- ✅ No "chromaService" references in codebase
- ✅ Performance < 200ms for RAG queries

---

## Final Architecture

```
GKChatty Local Stack:
┌─────────────────────────────────────┐
│   Electron Desktop App (Port 6001)  │
│   ├─ System Tray UI                 │
│   └─ Service Manager                │
└────────────┬────────────────────────┘
             │
┌────────────▼────────────────────────┐
│   Backend Services                  │
│   ├─ Express API (6001)             │
│   ├─ Document Processor             │
│   └─ RAG Service                    │
└────────────┬────────────────────────┘
             │
┌────────────▼────────────────────────┐
│   Storage Layer (LOCAL ONLY)        │
│   ├─ SQLite (document metadata)     │
│   ├─ LanceDB (vector embeddings)   │ ✅ NEW
│   └─ Filesystem (uploaded files)    │
└────────────┬────────────────────────┘
             │
┌────────────▼────────────────────────┐
│   ML Layer (M2 Optimized)           │
│   └─ Transformers.js + MPS          │
│      (nomic-embed-text-v1.5)       │
└─────────────────────────────────────┘
```

**Zero external dependencies** ✅
**Zero cloud costs** ✅
**Zero Docker required** ✅

---

## Dependencies Summary

### Before (ChromaDB):
```json
{
  "chromadb": "2.2.0",              // ❌ Requires server
  "@xenova/transformers": "^2.6.0", // ✅ Keep
  "better-sqlite3": "^9.0.0"        // ✅ Keep
}
```

### After (LanceDB):
```json
{
  "vectordb": "^0.4.0",             // ✅ Embedded
  "apache-arrow": "^14.0.0",        // ✅ Peer dep
  "@xenova/transformers": "^2.6.0", // ✅ Keep
  "better-sqlite3": "^9.0.0"        // ✅ Keep
}
```

**Total Package Change:** 1 replacement + 1 new peer dependency

---

## Timeline

| Phase | Task | Time | Blocker? |
|-------|------|------|----------|
| 1 | Backup & prep | 5 min | No |
| 2 | Update dependencies | 10 min | No |
| 3 | Create lancedbService | 45 min | **Yes** (core work) |
| 4 | Update imports | 15 min | No |
| 5 | Update environment | 5 min | No |
| 6 | Test end-to-end | 30 min | **Yes** (validation) |
| 7 | Cleanup & commit | 10 min | No |

**Total:** 2 hours (focused work)
**With debugging:** 2-3 hours

---

## Next Steps

1. **Review this plan** - Any questions or concerns?
2. **Execute Phase 1-2** - Backup and update dependencies
3. **I'll write lancedbService.ts** - Complete implementation
4. **You test** - Upload document, verify it works
5. **Commit** - Lock in the working solution

**Ready to proceed?**
