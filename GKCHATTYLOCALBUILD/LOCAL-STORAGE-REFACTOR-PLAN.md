# GKChatty Local Build - Complete S3 Removal & Local Storage Refactor

## Project Context

**Problem:** GKChatty Local Build is configured with `USE_SQLITE=true` and `FILE_STORAGE_MODE=local`, but the codebase still uses AWS S3 for file storage. This creates 146 cloud service dependencies (98 frontend, 48 backend) that prevent the app from working as a standalone local desktop application.

**Goal:** Remove ALL S3 dependencies and implement proper local filesystem storage with enterprise-grade architecture.

**Scope:** ~650-750 lines of code changes across ~25-35 files

---

## Architecture Overview

### Current (Broken) Flow:
```
Frontend → Generate Presigned S3 URL → Upload to S3 → Notify Backend → Backend fetches from S3 → Process
```

### Target (Local) Flow:
```
Frontend → Multipart Upload to Backend API → Backend saves to local FS → Process from local FS
```

### Storage Abstraction Pattern:
```
Application Code → Storage Interface (isLocalStorage() check) → Local FS Helper OR S3 Helper
```

---

## Phase 1: Backend Storage Abstraction Layer

**File:** `src/utils/storageInterface.ts` (NEW)

**Purpose:** Unified interface that automatically switches between S3 and local filesystem based on `FILE_STORAGE_MODE` environment variable.

**Interface Methods:**
```typescript
interface StorageInterface {
  saveFile(key: string, buffer: Buffer, contentType: string): Promise<string>;
  getFile(key: string): Promise<Buffer>;
  getFileStream(key: string): Promise<NodeJS.ReadableStream>;
  deleteFile(key: string): Promise<boolean>;
  deleteFolderContents(folderPath: string): Promise<{deleted: number, errors: number}>;
  generatePresignedUrl?(key: string, expiresIn: number): Promise<string>; // S3 only
}
```

**Implementation:**
- Check `isLocalStorage()` from `storageModeHelper.ts`
- If local: delegate to `localStorageHelper.ts`
- If S3: delegate to `s3Helper.ts`
- Export single default instance

**Files to Create:**
- `src/utils/storageInterface.ts`

**Files to Update:**
- `src/utils/localStorageHelper.ts` (add `getFile()` and `getFileStream()` methods)

---

## Phase 2: Fix SQLite Adapter Query Methods

**File:** `src/utils/sqliteAdapter.ts`

**Problem:** SQLite adapter's `findById()`, `find()`, `findOne()` return plain objects, but Mongoose code expects query objects with methods like `.select()`, `.populate()`, `.lean()`.

**Solution:** Make adapter methods return query-like objects that support chaining.

**Implementation:**
```typescript
class SQLiteQuery<T> {
  private model: any;
  private filter: any;
  private selectFields?: string[];

  constructor(model: any, filter: any) {
    this.model = model;
    this.filter = filter;
  }

  select(fields: string): this {
    this.selectFields = fields.split(' ');
    return this;
  }

  populate(path: string): this {
    // No-op for SQLite (no relationships)
    return this;
  }

  lean(): this {
    // No-op (already plain objects)
    return this;
  }

  async exec(): Promise<T | T[] | null> {
    // Execute actual query
    const result = await this.model._internalFind(this.filter);

    // Apply field selection if specified
    if (this.selectFields && result) {
      return this._applySelect(result);
    }

    return result;
  }

  then(resolve: any, reject: any) {
    // Make it thenable (Promise-like)
    return this.exec().then(resolve, reject);
  }

  private _applySelect(data: any) {
    if (Array.isArray(data)) {
      return data.map(item => this._selectFields(item));
    }
    return this._selectFields(data);
  }

  private _selectFields(obj: any) {
    if (!this.selectFields) return obj;
    const selected: any = {};
    for (const field of this.selectFields) {
      if (obj.hasOwnProperty(field)) {
        selected[field] = obj[field];
      }
    }
    return selected;
  }
}
```

**Changes Required:**
- Refactor `find()`, `findOne()`, `findById()` to return `SQLiteQuery` instances
- Keep `findByIdAndUpdate()`, `findOneAndUpdate()` as direct operations (no chaining needed)
- Ensure backward compatibility with existing code

**Files to Update:**
- `src/utils/sqliteAdapter.ts`

---

## Phase 3: Backend File Upload Endpoints

**File:** `src/routes/uploadRoutes.ts` (NEW)

**Purpose:** Handle multipart file uploads for local mode (replaces presigned S3 URLs).

**Endpoints:**

### `POST /api/upload/document`
- **Auth:** Required
- **Body:** Multipart form with file + metadata
- **Process:**
  1. Validate file (type, size)
  2. Generate unique filename: `${userId}_${timestamp}_${originalName}`
  3. Save to local FS via `storageInterface.saveFile()`
  4. Create document record in DB (status: 'pending')
  5. Trigger background processing
  6. Return document ID

### `POST /api/upload/system-kb`
- **Auth:** Admin only
- **Body:** Multipart form with file + metadata
- **Process:** Same as above but for system KB documents

**Dependencies:**
- `multer` for multipart parsing (already installed)
- `storageInterface` for file saving

**Files to Create:**
- `src/routes/uploadRoutes.ts`
- `src/middleware/fileUploadMiddleware.ts` (multer configuration)

**Files to Update:**
- `src/index.ts` (register upload routes)

---

## Phase 4: Update Document Processor

**File:** `src/utils/documentProcessor.ts`

**Changes:**
1. Replace `getFileStream(s3Key)` with `storageInterface.getFileStream(s3Key)`
2. Remove S3-specific logic (prefix handling, bucket references)
3. Keep `s3Key` field name in DB for compatibility (now stores local file path)

**Lines to Update:** ~5 locations (lines 132, 475-522 area)

**Files to Update:**
- `src/utils/documentProcessor.ts`

---

## Phase 5: Update Document Routes

**File:** `src/routes/documentRoutes.ts`

**Changes:**

### Remove Presigned URL Generation:
- Delete `GET /api/documents/presigned-url` endpoint
- Delete `GET /api/documents/:id/presigned-url` endpoint

### Remove `.select()` Calls:
- Replace all `.select('field1 field2')` with chaining pattern or remove if not needed
- SQLite adapter will now support this, but verify each usage

### Update File Download Endpoint:
```typescript
// OLD: Return presigned S3 URL
res.json({ url: presignedUrl });

// NEW: Stream file directly
const fileBuffer = await storageInterface.getFile(document.s3Key);
res.setHeader('Content-Type', document.mimeType);
res.setHeader('Content-Disposition', `inline; filename="${document.originalFileName}"`);
res.send(fileBuffer);
```

**Endpoints to Update:**
- `GET /api/documents/:id/download` - stream file directly
- `GET /api/documents/:id/view` - stream file for PDF viewer
- `DELETE /api/documents/:id` - use `storageInterface.deleteFile()`

**Files to Update:**
- `src/routes/documentRoutes.ts`
- `src/routes/systemKbRoutes.ts`
- `src/routes/adminRoutes.ts` (any document operations)

---

## Phase 6: Frontend Upload Refactor

**File:** `src/app/page.tsx` (Document Manager)

**Changes:**

### Remove S3 Upload Flow:
```typescript
// DELETE THIS ENTIRE SECTION (lines ~550-750):
// 1. Presigned URL generation
// 2. Direct S3 upload
// 3. Backend notification

// REPLACE WITH:
const uploadDocument = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('sourceType', 'user');

  const response = await fetchWithAuth('/api/upload/document', {
    method: 'POST',
    body: formData,
    // Don't set Content-Type - browser will set it with boundary
  });

  const data = await response.json();

  if (data.success) {
    console.log('[Upload] Success:', data.documentId);
    // Refresh document list
    await fetchDocuments();
  } else {
    throw new Error(data.message || 'Upload failed');
  }
};
```

**Files to Update:**
- `src/app/page.tsx` (main document upload)
- Any other components with file upload (search for `presigned`, `S3`, `aws-sdk`)

---

## Phase 7: Frontend File Viewer Updates

**File:** `src/components/PDFViewer.tsx` (and similar)

**Changes:**

### Remove Presigned URL Fetching:
```typescript
// OLD:
const response = await fetch(`/api/documents/${docId}/presigned-url`);
const { url } = await response.json();
setPdfUrl(url);

// NEW:
const url = `/api/documents/${docId}/view`;
setPdfUrl(url);
```

**Note:** Backend now streams files directly, so frontend just needs the API endpoint URL.

**Files to Update:**
- `src/components/PDFViewer.tsx`
- Any image/document preview components

---

## Phase 8: Remove Unused S3 Code

**Files to Delete:**
- Any S3-specific utilities no longer used
- Presigned URL generation code

**Files to Update:**
- `src/config/storageConfig.ts` - remove S3 bucket config (keep local path)
- Remove `@aws-sdk/*` imports across all files
- Update TypeScript types to remove S3-specific fields

---

## Phase 9: Environment Configuration

**File:** `.env`

**Ensure these are set:**
```bash
USE_SQLITE=true
FILE_STORAGE_MODE=local
LOCAL_FILE_STORAGE_DIR=/Users/davidjmorin/.gkchatty/data/documents

# S3 variables should be commented out or removed
# AWS_BUCKET_NAME=
# AWS_REGION=
# AWS_ACCESS_KEY_ID=
# AWS_SECRET_ACCESS_KEY=
```

**Files to Update:**
- `.env`
- `.env.local`
- `.env.example` (update documentation)

---

## Phase 10: Testing & Validation

### Manual Test Checklist:

1. **Document Upload:**
   - [ ] Upload PDF document
   - [ ] File saved to `/Users/davidjmorin/.gkchatty/data/documents/`
   - [ ] Document status changes: pending → processing → completed
   - [ ] No S3 errors in console

2. **Document Processing:**
   - [ ] Text extraction works
   - [ ] Embeddings generated (local model)
   - [ ] Vectors stored in LanceDB
   - [ ] Document searchable in chat

3. **Document Viewing:**
   - [ ] PDF viewer loads document
   - [ ] Download works
   - [ ] No presigned URL errors

4. **Document Deletion:**
   - [ ] File deleted from local FS
   - [ ] DB record removed
   - [ ] Vectors removed from LanceDB

5. **System KB Upload (Admin):**
   - [ ] Admin can upload system documents
   - [ ] Stored separately from user docs
   - [ ] Accessible in chat context

### Automated Tests:
- Update any existing tests that mock S3
- Add tests for storage interface
- Add tests for local file operations

---

## File Summary

### Files to Create (5):
1. `src/utils/storageInterface.ts` - Storage abstraction
2. `src/routes/uploadRoutes.ts` - File upload endpoints
3. `src/middleware/fileUploadMiddleware.ts` - Multer config
4. Tests for new components

### Files to Update (20-25):
**Backend:**
1. `src/utils/sqliteAdapter.ts` - Add query chaining
2. `src/utils/localStorageHelper.ts` - Add getFile/getFileStream
3. `src/utils/documentProcessor.ts` - Use storage interface
4. `src/routes/documentRoutes.ts` - Remove presigned URLs, update download
5. `src/routes/systemKbRoutes.ts` - Same as above
6. `src/routes/adminRoutes.ts` - Same as above
7. `src/routes/chatRoutes.ts` - Remove `.select()` calls
8. `src/routes/searchRoutes.ts` - Remove `.select()` calls
9. `src/controllers/admin.controller.ts` - Remove `.select()` calls
10. `src/controllers/adminSystemKbController.ts` - Remove `.select()` calls
11. `src/index.ts` - Register upload routes
12. `src/config/storageConfig.ts` - Remove S3 config

**Frontend:**
13. `src/app/page.tsx` - Replace S3 upload with direct upload
14. `src/components/PDFViewer.tsx` - Use direct file URLs
15. Any other file viewer components (2-3 files)
16. `.env` - Update configuration
17. `.env.example` - Update documentation

### Files to Delete (5-10):
- Unused S3 helper functions
- Presigned URL utilities
- Any S3-specific middleware

---

## Success Criteria

- [ ] Zero S3 dependencies in codebase (0/146 references)
- [ ] All files stored in `/Users/davidjmorin/.gkchatty/data/documents/`
- [ ] Document upload works end-to-end
- [ ] Document processing completes successfully
- [ ] PDF viewer displays documents
- [ ] No AWS SDK imports anywhere
- [ ] SQLite adapter supports `.select()`, `.populate()`, `.lean()`
- [ ] No errors in browser console related to S3/presigned URLs
- [ ] No errors in backend logs related to S3

---

## Risks & Mitigations

**Risk 1:** Breaking cloud deployment
- **Mitigation:** Storage interface maintains S3 support via `isLocalStorage()` check

**Risk 2:** Large files causing memory issues
- **Mitigation:** Use streams instead of buffering entire files

**Risk 3:** Incomplete SQLite query support
- **Mitigation:** Implement comprehensive query chaining in Phase 2

**Risk 4:** Frontend breaking changes
- **Mitigation:** Maintain same API contract, just change implementation

---

## Execution Order

1. Phase 2 (SQLite adapter) - Fixes immediate `.select()` errors
2. Phase 1 (Storage abstraction) - Creates foundation
3. Phase 4 (Document processor) - Updates backend processing
4. Phase 3 (Upload endpoints) - Adds new upload flow
5. Phase 5 (Document routes) - Updates existing endpoints
6. Phase 6 (Frontend upload) - Updates UI
7. Phase 7 (Frontend viewers) - Updates file viewing
8. Phase 8 (Cleanup) - Removes dead code
9. Phase 9 (Config) - Finalizes environment
10. Phase 10 (Testing) - Validates everything works

---

## Estimated Timeline

- **Phase 1-2:** 2-3 hours (foundation)
- **Phase 3-5:** 2-3 hours (backend refactor)
- **Phase 6-7:** 1-2 hours (frontend refactor)
- **Phase 8-10:** 1-2 hours (cleanup & testing)

**Total:** 6-10 hours of focused development

---

## Notes for Builder Pro

- Preserve all existing functionality for cloud mode (`FILE_STORAGE_MODE=s3`)
- Use existing `localStorageHelper.ts` as foundation (don't reinvent)
- Follow existing code style and patterns
- Add comprehensive error handling (local FS can fail too)
- Log all storage operations for debugging
- Use TypeScript strict mode
- Add JSDoc comments for all new public functions
- Keep backward compatibility with existing DB schema (s3Key, s3Bucket fields)

---

**Generated:** 2025-11-04
**Author:** Claude (Sonnet 4.5)
**For:** GKChatty Local Build - Local Storage Refactor
