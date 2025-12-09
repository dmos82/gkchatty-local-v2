# Session: Ghost Document Filtering Fix
**Date:** 2025-12-08
**Commits:** `d63a621`, `4154376`

## Summary
Fixed a bug where "ghost documents" (documents belonging to other users or deleted from MongoDB) were appearing in RAG Sources when users queried their My Documents.

---

## The Problem

**Reported By:** User on apps.gkchatty.com (production)

**Symptom:** When asking questions in "My Docs" mode with only 2 personal documents, the Sources section showed 6+ documents including Gold_Key legal documents that belonged to other users.

**Root Cause:** Multiple issues in the ghost document filtering logic in `chatRoutes.ts`:

1. **Sources without documentId were KEPT** - The code had:
   ```typescript
   if (!source.documentId) return true;  // BUG: Keeps invalid sources!
   ```

2. **Type-based filtering was unreliable** - The code only validated sources where `type === 'user'`, but Pinecone sources don't always have accurate type metadata.

3. **No cross-validation against MongoDB** - Sources weren't being checked against the actual document ownership in the database.

---

## Fix Attempts

### Attempt 1: Add userId Filter (Commit d63a621)
**Approach:** Added `userId` filter to the MongoDB validation query.

```typescript
const existingDocIds = await UserDocument.find({
  _id: { $in: docIdsToCheck },
  userId: new Types.ObjectId(userId),  // Added this filter
}).select('_id').lean();
```

**Result:** Failed. Ghost documents still appeared because:
- Sources without `documentId` were still passing through
- Sources with incorrect `type` field bypassed validation entirely

### Attempt 2: Complete Rewrite (Commit 4154376)
**Approach:** Completely rewrote the ghost document filtering logic with:

1. **Filter OUT sources without documentId** (was keeping them before)
2. **Validate ALL sources against MongoDB** regardless of type field
3. **Mode-based filtering** based on `knowledgeBaseTarget`:
   - `user` mode: Only allow docs owned by current user
   - `system` mode: Only allow system KB docs
   - `unified` mode: Allow either (with ownership checks)
4. **Comprehensive debug logging** for troubleshooting

**Result:** Deployed to staging and production. Awaiting user verification.

---

## Technical Details

### File Modified
`backend/src/routes/chatRoutes.ts` (lines 934-1051)

### Key Code Changes

**Before (Buggy):**
```typescript
// This KEPT sources without documentId!
if (!source.documentId) return true;

// This only checked user-type sources
if (source.type !== 'user') return true;
```

**After (Fixed):**
```typescript
// Filter OUT sources without documentId
if (!source.documentId) {
  log.warn({ fileName: source.fileName }, '[Ghost Document] Filtering source without documentId');
  return false;
}

// Check ALL sources against MongoDB
const isUserDoc = existingUserDocIds.has(source.documentId);
const isSystemDoc = existingSystemDocIds.has(source.documentId);

// Apply mode-specific rules
if (knowledgeBaseTarget === 'user') {
  if (!isUserDoc) {
    log.warn({ documentId, fileName, userId }, '[Ghost Document] Not in user docs');
    return false;
  }
  return true;
}
// ... similar logic for 'system' and 'unified' modes
```

### New Validation Flow

```
1. Collect ALL documentIds from Pinecone sources
2. Query UserDocument for docs owned by current user
3. Query SystemKbDocument for system docs
4. For each source:
   - No documentId? → REJECT
   - "user" mode: Must be in user's docs → else REJECT
   - "system" mode: Must be in system KB → else REJECT
   - "unified" mode: Must be in either → else REJECT
5. Log filtered count for debugging
```

---

## Deployment

### Git
- Commit `d63a621`: "fix: Add userId filter to ghost document validation"
- Commit `4154376`: "fix: Strict ghost document filtering by knowledgeBaseTarget mode"
- Pushed to `main` and `staging` branches

### Backend (Render)
- Staging: https://staging-gk-chatty.onrender.com - Deploy triggered
- Production: https://gkchatty-api-production.onrender.com - Deploy triggered

### Frontend
No frontend changes required - this was a backend-only fix.

---

## Debug Logging Added

The fix includes comprehensive logging to help diagnose future issues:

```
[Ghost Filter] Starting validation - logs source count and knowledgeBaseTarget
[Ghost Document] Filtering source without documentId - logs fileName
[Ghost Document] Filtering out source - not found in current user's documents
[Ghost Document] Filtering out source - not found in system KB
[Chat] Validated sources against MongoDB - removed ghost documents - logs before/after counts
```

---

## Testing Checklist

- [ ] Login to apps.gkchatty.com as a user with 2 documents
- [ ] Select "My Docs" mode
- [ ] Ask a question that should match user's documents
- [ ] Verify Sources section shows ONLY user's documents
- [ ] Verify no Gold_Key or other user's documents appear
- [ ] Check server logs for ghost document filtering messages

---

## Related Files

- `backend/src/routes/chatRoutes.ts` - Main fix location
- `backend/src/models/UserDocument.ts` - User document model
- `backend/src/models/SystemKbDocument.ts` - System KB document model

---

## Lessons Learned

1. **`return true` in filters KEEPS items** - Easy to confuse with "this is valid"
2. **Don't trust Pinecone metadata** - Always validate against source of truth (MongoDB)
3. **Type fields can be unreliable** - Validate ALL sources, not just those with expected type
4. **Add logging for invisible bugs** - Ghost documents were only visible to users, not in logs

---

*Session completed: 2025-12-08*
