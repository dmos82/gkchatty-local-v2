# GKCHATTY RAG Search Fix - Verification Guide

This guide provides instructions for verifying the new RAG search functionality after deploying the fixes in PR #72 (fix/s3-region-and-rate-limit).

## Pre-requisites

1. The PR has been merged to staging and deployed to the production environment
2. You have access to MongoDB Atlas
3. You have access to Pinecone console

## Manual Setup in MongoDB Atlas

Before testing the new search functionality, you need to ensure the test user has access to the "gk chatty documentation" Tenant KB:

1. Log in to MongoDB Atlas
2. Navigate to the `UserKBAccess` collection
3. Find the document for your test user (e.g., dev@example.com)
4. Ensure the "\_id" of the "gk chatty documentation" Tenant KB is included in the `enabledKnowledgeBases` array
5. If it doesn't exist or is empty, you can run the setup script:

```bash
cd apps/api
npm run kbs:setup-test-user
```

## Reindexing System KB and Tenant KB Documents

The new search logic requires specific metadata fields (sourceType, tenantKbId) to be present in Pinecone vectors. Existing documents must be reindexed:

```bash
# First verify the current state of Tenant KB documents
npm run kbs:verify-tenant-docs

# Then reindex all documents (this will clear the system-kb namespace first)
npm run reindex:all-kb --confirm
```

**WARNING**: The reindexing process will:

1. Delete all vectors in the system-kb namespace
2. Re-process all System KB and Tenant KB documents
3. Upload new vectors with the correct metadata

## Verification Steps

### 1. Verify Search Modes

You can use the verification script to check if the search modes are working correctly:

```bash
npm run rag:verify-search
```

This script will test all three search modes (KB, User, Hybrid) and verify that:

- KB mode returns only System KB and enabled Tenant KB documents
- User mode returns only user's own documents
- Hybrid mode returns all relevant documents without duplicates

### 2. Manual Testing in the UI

Log in to the application as the test user (dev@example.com) and:

1. **KB Mode Test**:

   - Switch to "KB" search mode
   - Search for "chatty"
   - Verify that both System KB and the "gk chatty documentation" Tenant KB documents appear
   - Verify that no user documents appear
   - Verify no duplicates

2. **User Mode Test**:

   - Switch to "My Docs" search mode
   - Search for something that matches your user documents
   - Verify only your own documents appear
   - Verify no System KB or Tenant KB documents appear

3. **Hybrid Mode Test**:
   - Switch to "Hybrid" search mode
   - Search for "chatty" or another term that should match across document types
   - Verify documents from all sources appear (User, System KB, Tenant KB)
   - Verify no duplicates

## Troubleshooting

If search results are not as expected:

1. Check the browser console for errors
2. Verify the Pinecone metadata format:

   - System KB vectors should have `sourceType: "system"`
   - Tenant KB vectors should have `sourceType: "tenant"` and `tenantKbId: "<kb-id>"`
   - User documents should have `sourceType: "user"` and `userId: "<user-id>"`

3. Check MongoDB UserKBAccess collection to ensure the user has access to the expected Tenant KBs

4. If necessary, rerun the reindexing process after fixing any configuration issues

## Next Steps

Once verification is complete, document the results and any remaining issues. If everything works as expected, the fix is ready for wider rollout to all users.
