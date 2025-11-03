# SQLite Migration Phase 2: Document System Analysis

**Date:** 2025-11-03
**Status:** Analysis Complete - Ready for Implementation
**Phase:** 2 of 4

## Executive Summary

Phase 2 focuses on migrating the document management system from MongoDB to SQLite. This includes UserDocument and SystemKbDocument models, along with all routes, services, and processors that use them.

### Scope Overview

- **25 files** use `UserDocument` model
- **33 files** use `SystemKbDocument` model
- **Core systems affected:** Document upload, processing, search, RAG service
- **Estimated complexity:** High (document processing pipeline is critical)

## Document Models Analysis

### UserDocument Model

**File:** `backend/src/models/UserDocument.ts`

**Schema Fields:**
```typescript
{
  userId?: ObjectId,              // User who uploaded (optional for system/tenant docs)
  sourceType: 'system'|'user'|'tenant',
  tenantKbId?: ObjectId,          // For tenant KB documents
  folderId?: ObjectId,            // For folder organization
  originalFileName: string,
  s3Bucket: string,
  s3Key: string,                  // S3 path/key
  file_extension: string,
  fileSize: number,
  mimeType: string,
  uploadTimestamp: Date,
  status: 'pending'|'processing'|'completed'|'failed',
  contentHash?: string,           // For idempotency
  processingError?: string,
  errorCode?: string,
  chunkCount?: number,
  metadata?: Record<string, any>
}
```

**Indexes:**
- `{ userId, sourceType }`
- `{ sourceType, originalFileName }`
- `{ userId, sourceType, originalFileName }`
- `{ userId, contentHash, sourceType }`
- `{ tenantKbId, sourceType }`
- `{ tenantKbId, contentHash }`

### SystemKbDocument Model

**File:** `backend/src/models/SystemKbDocument.ts`

**Schema Fields:**
```typescript
{
  filename: string,
  s3Key: string (unique),
  fileUrl: string,
  textContent: string,
  fileSize: number,
  mimeType: string,
  status: 'pending'|'processing'|'completed'|'failed',
  statusDetail?: string,
  folderId?: string,
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes:**
- `{ s3Key }` (unique)
- Text index on `{ textContent, filename }`

## Files Using UserDocument (25 files)

### Critical Routes (Must Fix)
1. `routes/documentRoutes.ts` - **PRIMARY** - Document upload, view, delete, chat
2. `routes/chatRoutes.ts.bak` - Backup file (may skip)
3. `routes/searchRoutes.ts` - Search functionality
4. `routes/systemKbRoutes.ts` - System KB management
5. `routes/adminRoutes.ts` - Admin document management
6. `routes/healthRoutes.ts` - Health checks (likely minimal impact)

### Critical Services (Must Fix)
7. `services/userDocumentProcessor.ts` - **PRIMARY** - Document processing pipeline
8. `services/ragService.ts` - **PRIMARY** - RAG context retrieval
9. `utils/documentProcessor.ts` - Document processing utilities

### Controllers (Must Fix)
10. `controllers/admin.controller.ts` - Admin operations
11. `controllers/folderController.ts` - Folder management

### Scripts (Lower Priority - Can defer to Phase 4)
12-25. Various maintenance scripts in `scripts/` directory:
    - `loadSystemKnowledge.ts`
    - `verify-tenant-kb-documents.ts`
    - `reindex-system-tenant-kb.ts`
    - `seed-dev-kb.ts`
    - `check-document-by-id.ts`
    - `check-tenant-docs.ts`
    - `audit-systemkbdocuments.ts`
    - `reindex-all-users-docs.ts`
    - `verify-specific-tenant-doc.ts`
    - `reindex-tenant-kb.ts`
    - (Plus various test files)

## Files Using SystemKbDocument (33 files)

### Critical Routes (Must Fix)
1. `routes/adminRoutes.ts` - Admin system KB operations
2. `routes/searchRoutes.ts` - System KB search

### Critical Services (Must Fix)
3. `services/ragService.ts` - RAG retrieval from system KB
4. `utils/documentProcessor.ts` - Processing system documents

### Controllers (Must Fix)
5. `controllers/admin.controller.ts` - Admin system KB management
6. `controllers/adminSystemKbController.ts` - **PRIMARY** - Dedicated system KB controller
7. `controllers/folderController.ts` - System KB folder management

### Scripts (Lower Priority - Defer to Phase 4)
8-33. Extensive system KB maintenance scripts (26 scripts):
    - Various reindex scripts
    - Verification scripts
    - Migration scripts
    - Audit scripts
    - Recovery scripts

## Critical Operations to Support

### UserDocument Operations

**documentRoutes.ts uses:**
- `UserDocument.find()` - List documents
- `UserDocument.findOne()` - Find by ID/hash for duplicates
- `UserDocument.create()` - Create new document record
- `UserDocument.findById()` - Get document details
- `UserDocument.findByIdAndDelete()` - Delete document
- `UserDocument.deleteOne()` - Delete by query
- `UserDocument.deleteMany()` - Delete all user documents

**userDocumentProcessor.ts uses:**
- `UserDocument.findByIdAndUpdate()` - Update status/metadata
- `UserDocument.findById()` - Get document for processing

**ragService.ts uses:**
- `UserDocument.findById()` - Get document metadata for sources

### SystemKbDocument Operations

**adminSystemKbController.ts likely uses:**
- `SystemKbDocument.find()` - List system documents
- `SystemKbDocument.findOne()` - Find by s3Key
- `SystemKbDocument.create()` - Create system document record
- `SystemKbDocument.findByIdAndUpdate()` - Update document
- `SystemKbDocument.findByIdAndDelete()` - Delete system document

**ragService.ts uses:**
- `SystemKbDocument.findById()` - Get system document metadata

## SQLite Adapter Requirements

### New UserDocumentModel Class Needed

```typescript
export class UserDocumentModel {
  // Query methods
  static find(query: any): any[]
  static findOne(query: any): any | null
  static findById(id: string | number): any | null

  // Mutation methods
  static create(docData: any): any
  static findByIdAndUpdate(id: string | number, updates: any): any | null
  static findByIdAndDelete(id: string | number): any | null
  static deleteOne(query: any): { deletedCount: number }
  static deleteMany(query: any): { deletedCount: number }

  // Utility methods
  static select(fields: string): any
}
```

### New SystemKbDocumentModel Class Needed

```typescript
export class SystemKbDocumentModel {
  // Query methods
  static find(query: any): any[]
  static findOne(query: any): any | null
  static findById(id: string | number): any | null

  // Mutation methods
  static create(docData: any): any
  static findByIdAndUpdate(id: string | number, updates: any): any | null
  static findByIdAndDelete(id: string | number): any | null

  // Utility methods
  static select(fields: string): any
}
```

## SQLite Schema Design

### userdocuments Table

```sql
CREATE TABLE IF NOT EXISTS userdocuments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  _id TEXT UNIQUE NOT NULL DEFAULT (lower(hex(randomblob(12)))),
  userId TEXT, -- Allow NULL for system/tenant docs
  sourceType TEXT NOT NULL DEFAULT 'user', -- 'system', 'user', 'tenant'
  tenantKbId TEXT,
  folderId TEXT,
  originalFileName TEXT NOT NULL,
  s3Bucket TEXT NOT NULL,
  s3Key TEXT NOT NULL,
  file_extension TEXT NOT NULL,
  fileSize INTEGER NOT NULL,
  mimeType TEXT NOT NULL,
  uploadTimestamp TEXT DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  contentHash TEXT,
  processingError TEXT,
  errorCode TEXT,
  chunkCount INTEGER,
  metadata TEXT DEFAULT '{}', -- JSON
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT DEFAULT (datetime('now'))
);

-- Indexes matching MongoDB
CREATE INDEX IF NOT EXISTS idx_userdocs_userId_sourceType ON userdocuments(userId, sourceType);
CREATE INDEX IF NOT EXISTS idx_userdocs_sourceType_filename ON userdocuments(sourceType, originalFileName);
CREATE INDEX IF NOT EXISTS idx_userdocs_userId_sourceType_filename ON userdocuments(userId, sourceType, originalFileName);
CREATE INDEX IF NOT EXISTS idx_userdocs_userId_contentHash_sourceType ON userdocuments(userId, contentHash, sourceType);
CREATE INDEX IF NOT EXISTS idx_userdocs_tenantKbId_sourceType ON userdocuments(tenantKbId, sourceType);
CREATE INDEX IF NOT EXISTS idx_userdocs_tenantKbId_contentHash ON userdocuments(tenantKbId, contentHash);
CREATE INDEX IF NOT EXISTS idx_userdocs_s3Key ON userdocuments(s3Key);
CREATE INDEX IF NOT EXISTS idx_userdocs_status ON userdocuments(status);
```

### systemkbdocuments Table

```sql
CREATE TABLE IF NOT EXISTS systemkbdocuments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  _id TEXT UNIQUE NOT NULL DEFAULT (lower(hex(randomblob(12)))),
  filename TEXT NOT NULL,
  s3Key TEXT UNIQUE NOT NULL,
  fileUrl TEXT NOT NULL,
  textContent TEXT,
  fileSize INTEGER DEFAULT 0,
  mimeType TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  statusDetail TEXT,
  folderId TEXT,
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_systemkb_s3Key ON systemkbdocuments(s3Key);
CREATE INDEX IF NOT EXISTS idx_systemkb_status ON systemkbdocuments(status);
CREATE INDEX IF NOT EXISTS idx_systemkb_filename ON systemkbdocuments(filename);
```

**Note:** SQLite doesn't have full-text search like MongoDB's text indexes. For textContent search, we may need to:
1. Use SQLite FTS5 (Full-Text Search) extension
2. OR rely on LanceDB for vector search (which is the primary search method anyway)
3. OR implement simple LIKE queries for basic keyword search

## Phase 2 Implementation Plan

### Step 1: Expand SQLite Adapter
**File:** `backend/src/utils/sqliteAdapter.ts`

**Tasks:**
1. Add `userdocuments` table creation to `createTables()`
2. Add `systemkbdocuments` table creation to `createTables()`
3. Implement `UserDocumentModel` class with all required methods
4. Implement `SystemKbDocumentModel` class with all required methods
5. Handle complex field serialization:
   - `metadata` field (JSON object)
   - Date fields (uploadTimestamp, createdAt, updatedAt)
   - Enum fields (status, sourceType)

**Key Considerations:**
- Reuse the same patterns from `UserModel` (findOne, findById, create, etc.)
- Handle ObjectId references (userId, tenantKbId, folderId) as TEXT fields
- Ensure `.save()` method pattern works (or avoid it like in Phase 1)

### Step 2: Update Model Factory
**File:** `backend/src/utils/modelFactory.ts`

**Tasks:**
1. Import UserDocument and SystemKbDocument from MongoDB models
2. Import UserDocumentModel and SystemKbDocumentModel from SQLite adapter
3. Export appropriate model based on USE_SQLITE flag:
```typescript
export const UserDocumentModel = USE_SQLITE
  ? sqliteAdapter.UserDocumentModel
  : mongoUserDocument;

export const SystemKbDocumentModel = USE_SQLITE
  ? sqliteAdapter.SystemKbDocumentModel
  : mongoSystemKbDocument;
```

### Step 3: Fix Core Routes
**Priority order:**
1. `routes/documentRoutes.ts` - Replace `UserDocument` with `UserDocumentModel` from modelFactory
2. `routes/searchRoutes.ts` - Fix both UserDocument and SystemKbDocument imports
3. `routes/systemKbRoutes.ts` - Fix UserDocument imports
4. `routes/adminRoutes.ts` - Fix both document model imports
5. `routes/healthRoutes.ts` - Fix if needed (likely minimal)

### Step 4: Fix Core Services
**Priority order:**
1. `services/userDocumentProcessor.ts` - Critical document processing
2. `services/ragService.ts` - Critical RAG functionality
3. `utils/documentProcessor.ts` - Shared document utilities

### Step 5: Fix Controllers
**Priority order:**
1. `controllers/adminSystemKbController.ts` - System KB management
2. `controllers/admin.controller.ts` - Admin document operations
3. `controllers/folderController.ts` - Folder management

### Step 6: Testing
**Test scenarios:**
1. Document upload (POST /api/documents/upload)
2. Document listing (GET /api/documents)
3. Document viewing (GET /api/documents/view/:docId)
4. Document deletion (DELETE /api/documents/:docId)
5. Chat with RAG context (POST /api/documents/chat)
6. Search functionality (GET /api/search)
7. System KB operations (admin routes)

### Step 7: Deferred Items (Phase 4)
**Scripts to fix later:**
- All 26 system KB maintenance scripts
- All user document maintenance scripts
- Test files

## Known Challenges

### Challenge 1: ObjectId References
**Issue:** MongoDB uses ObjectId type, SQLite uses TEXT
**Solution:** Convert ObjectId to string when saving, handle both string and ObjectId when querying

### Challenge 2: Complex Metadata Field
**Issue:** `metadata` is a Record<string, any> with arbitrary structure
**Solution:** JSON.stringify when saving, JSON.parse when reading (same as activeSessionIds in Phase 1)

### Challenge 3: Text Search
**Issue:** MongoDB has text indexes, SQLite doesn't (natively)
**Options:**
1. Use SQLite FTS5 extension
2. Rely only on LanceDB vector search
3. Use LIKE queries for simple searches
**Decision:** Start with option 2 (LanceDB), add FTS5 later if needed

### Challenge 4: Enum Fields
**Issue:** SQLite doesn't enforce enum constraints
**Solution:** Store as TEXT, add CHECK constraints if needed, or rely on application-level validation

### Challenge 5: .save() Method Pattern
**Issue:** Phase 1 showed `.save()` causes issues with SQLite adapter
**Solution:** Search for `.save()` calls in document code and replace with `findByIdAndUpdate()`

## Success Criteria

- ✅ SQLite adapter has UserDocumentModel and SystemKbDocumentModel classes
- ✅ All core routes use modelFactory instead of direct MongoDB imports
- ✅ Document upload works end-to-end
- ✅ Document processing pipeline works
- ✅ RAG service retrieves context from SQLite-stored documents
- ✅ No MongoDB dependency for document operations
- ✅ All CRUD operations work correctly
- ✅ LanceDB integration still works (vectors stored in LanceDB, metadata in SQLite)

## Risk Assessment

**High Risk Areas:**
1. Document processing pipeline - Complex flow with multiple services
2. RAG service integration - Critical for chat functionality
3. LanceDB metadata sync - Must keep vector metadata in sync with SQLite records

**Medium Risk Areas:**
1. Search functionality - May need FTS5 for full functionality
2. Admin operations - Complex queries with multiple filters
3. Folder management - References between documents and folders

**Low Risk Areas:**
1. Document listing - Simple queries
2. Document viewing - Basic CRUD
3. Health checks - Minimal document interaction

## Estimated Timeline

**Step 1 (SQLite Adapter):** 2-3 hours
- Complex due to two models with many fields
- Need to handle serialization carefully

**Step 2 (Model Factory):** 15 minutes
- Straightforward export additions

**Step 3 (Core Routes):** 1-2 hours
- 5 route files to update
- Need to search/replace carefully

**Step 4 (Core Services):** 1-2 hours
- Critical code that must work correctly
- May need to refactor .save() patterns

**Step 5 (Controllers):** 1 hour
- 3 controller files
- Similar patterns to routes

**Step 6 (Testing):** 2-3 hours
- Comprehensive testing required
- Debug any issues found

**Total Estimated Time:** 8-12 hours

## Comparison with Phase 1

| Aspect | Phase 1 (Auth) | Phase 2 (Documents) |
|--------|----------------|---------------------|
| **Models** | 1 (User) | 2 (UserDocument, SystemKbDocument) |
| **Files to update** | ~5 | ~15 (core files) |
| **Complexity** | Medium | High |
| **Field count** | 14 | 16 (UserDocument) + 11 (SystemKbDocument) |
| **Critical operations** | Login, session mgmt | Upload, process, search, RAG |
| **External integrations** | JWT | S3, LanceDB |
| **Testing complexity** | Simple | Complex (end-to-end pipeline) |

## Next Steps

1. **Implement Step 1:** Expand SQLite adapter with document models
2. **Implement Step 2:** Update modelFactory exports
3. **Implement Step 3:** Fix core routes one by one
4. **Implement Step 4:** Fix core services
5. **Implement Step 5:** Fix controllers
6. **Implement Step 6:** Comprehensive testing
7. **Document results:** Create SQLITE-MIGRATION-PHASE2-COMPLETE.md
8. **Commit:** Git commit Phase 2 changes

---

**Analysis Complete:** Ready to proceed with implementation
**Next Action:** Expand sqliteAdapter.ts with document model classes
