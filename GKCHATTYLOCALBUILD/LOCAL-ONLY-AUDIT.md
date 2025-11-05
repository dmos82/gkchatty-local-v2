# GKChatty Local Build - Web Services Audit

## Executive Summary
**Status**: System still has CRITICAL web service dependencies that prevent local-only operation

##  Critical Issues Found

### 1. Document Processing is BROKEN ❌
**File**: `src/utils/documentProcessor.ts`
- **Problem**: Function signature mismatch
  - `processAndEmbedDocument()` expects: `(documentId, s3Bucket, s3Key, sourceType, originalFileName, mimeType, userId?, reqId?, extractedText?, tenantKbId?)`
  - We're calling it with: `(documentId, userId)`
- **Impact**: Documents uploaded never get processed - stuck on "pending" forever
- **Pinecone dependency**: Still imports `pineconeNamespace` (line 18)

### 2. Pinecone Vector Database Still Referenced ❌
**Total References**: 300+ across codebase
**Critical Files**:
- `src/utils/pineconeService.ts` (55 references)
- `src/utils/pineconeNamespace.ts` (7 references) - STILL IMPORTED by documentProcessor
- `src/routes/adminRoutes.ts` (11 references)
- `src/controllers/admin.controller.ts` (8 references)
- `src/routes/documentRoutes.ts` (7 references)

### 3. S3 Storage References Still Present ⚠️
**File**: `src/utils/documentProcessor.ts`
- Line 2: Still imports `@aws-sdk/client-s3`
- Comments mention S3 throughout (lines 55, 63, 64)
- `storageInterface` exists but documentProcessor still expects S3 parameters

### 4. PDF Viewer Doesn't Work ❌
**Root Cause**: File serving endpoint returns 404
- Files exist at: `~/.gkchatty/data/documents/user-documents/...`
- Endpoint `/local/:key` can't find them
- Problem in `s3Helper.getFileStream()` - likely still looking for S3

## Required Fixes

### CRITICAL - Fix Document Processing (Phase 1)

1. **Update processAndEmbedDocument function signature**
   ```typescript
   // OLD (current - broken):
   processAndEmbedDocument(documentId, s3Bucket, s3Key, sourceType, ...)

   // NEW (simplified for local):
   processAndEmbedDocument(documentId, userId)
   ```

2. **Remove all Pinecone imports from documentProcessor.ts**
   - Remove line 18: `import { getSystemKbNamespace, getUserNamespace } from './pineconeNamespace'`
   - Already has: `import { upsertVectors } from './lancedbService'` ✓

3. **Simplify document processing flow**
   - Skip vector embeddings entirely for local mode
   - Just extract text and mark document as "completed"
   - Store extracted text in SQLite `textContent` field

### CRITICAL - Fix PDF Viewer (Phase 2)

1. **Fix localFileRoutes.ts**
   - Verify `getFileStream()` points to correct local path
   - Path should be: `~/.gkchatty/data/documents/{s3Key}`

2. **Test file serving**
   - Should serve files from local filesystem
   - No S3 calls

### CRITICAL - Remove Pinecone Entirely (Phase 3)

1. **Create stub pineconeService.ts** that returns empty results
2. **Remove from critical paths**:
   - documentRoutes.ts
   - adminRoutes.ts
   - admin.controller.ts

### OPTIONAL - Clean up legacy code (Phase 4)
- Remove `/src/scripts/*pinecone*.ts` files
- Remove test files with Pinecone references

## Current System State

✅ **Working**:
- SQLite database (replacing MongoDB)
- Local file storage (files being saved correctly)
- Document uploads (files reach backend)
- Document list display (after userId fix)

❌ **Broken**:
- Document processing (wrong function signature)
- PDF viewer (file serving 404)
- Documents stuck on "pending" status
- Any feature requiring vector search

⚠️ **Partially Fixed**:
- S3 abstracted but not fully removed from code
- Pinecone referenced but not required at runtime (skipped when PINECONE_API_KEY missing)

## Implementation Plan

**Phase 1: Emergency Fix (15 min)**
1. Fix processAndEmbedDocument call in uploadRoutes.ts
2. Simplify documentProcessor.ts to skip embeddings
3. Mark documents as "completed" immediately

**Phase 2: Fix PDF Viewer (15 min)**
1. Debug getFileStream() in localStorageHelper
2. Verify file path resolution
3. Test download endpoint

**Phase 3: Remove Pinecone (30 min)**
1. Stub out pineconeService
2. Remove imports from critical files
3. Make vector search optional/disabled

**Total Time**: ~1 hour to make system fully functional locally

## Risk Assessment

**HIGH RISK** if not fixed:
- Users can't view uploaded documents
- Documents never leave "pending" status
- System appears broken despite successful uploads

**MEDIUM RISK**:
- Pinecone errors in logs (cosmetic if keys missing)
- Legacy code confusion for future developers

## Success Criteria

- ✅ Upload PDF → appears in list with "completed" status within 5 seconds
- ✅ Click PDF in list → opens in viewer
- ✅ No errors in backend logs about missing web services
- ✅ Zero network calls to external services (S3, Pinecone, MongoDB)
