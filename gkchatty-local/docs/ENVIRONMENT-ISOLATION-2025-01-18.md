# Environment Isolation Implementation

**Date:** January 18, 2025
**Issue:** Ghost documents appearing in RAG searches from other environments

## Problem

Three GKChatty environments were sharing Pinecone namespaces, causing:
- Documents from localhost appearing in staging searches
- Cross-environment data pollution
- Ghost documents (vectors without MongoDB metadata)

## Solution: Environment-Prefixed Namespaces

All Pinecone namespaces now include an environment prefix to ensure complete isolation.

### Namespace Format

| Environment | System KB Namespace | User Namespace |
|-------------|---------------------|----------------|
| **Production** | `prod-system-kb` | `prod-user-{userId}` |
| **Staging** | `staging-system-kb` | `staging-user-{userId}` |
| **Localhost** | `local-system-kb` | `local-user-{userId}` |

### Configuration

Set `GKCHATTY_ENV` in your `.env` file:

```bash
# Localhost
GKCHATTY_ENV=local

# Staging (Render)
GKCHATTY_ENV=staging

# Production (gkchatty.com)
GKCHATTY_ENV=prod
```

### Files Modified

- `backend/src/utils/pineconeNamespace.ts` - Added environment prefix logic
- `backend/.env` - Added GKCHATTY_ENV=local for localhost

### Deployment Checklist

#### Staging (Render)
Add to Render environment variables:
```
GKCHATTY_ENV=staging
```

#### Production
Add to production environment variables:
```
GKCHATTY_ENV=prod
```

## Cleanup Script

A cleanup script was created to identify and remove orphaned vectors:

```bash
# Dry run (report only)
cd backend
npx ts-node src/scripts/cleanup-orphaned-vectors.ts

# Actually delete orphans
npx ts-node src/scripts/cleanup-orphaned-vectors.ts --delete

# Target specific namespace
npx ts-node src/scripts/cleanup-orphaned-vectors.ts --namespace system-kb
```

### What the Script Does

1. Connects to MongoDB and Pinecone
2. Lists all namespaces in the index
3. For each vector, checks if documentId exists in MongoDB
4. Reports orphaned vectors (no matching MongoDB document)
5. Optionally deletes orphans with `--delete` flag

## Migration Notes

### Existing Data

After enabling environment isolation, existing vectors will be in old namespaces:
- Old: `system-kb`
- New: `local-system-kb` (for localhost)

You have two options:

1. **Re-index all documents** (recommended for clean slate)
   - Run purge script
   - Re-upload all documents

2. **Migrate vectors** (advanced)
   - Query vectors from old namespace
   - Upsert to new prefixed namespace
   - Delete from old namespace

### Recommended Migration Steps

```bash
# 1. Run cleanup to see current state
npx ts-node src/scripts/cleanup-orphaned-vectors.ts

# 2. If migrating localhost, set GKCHATTY_ENV
export GKCHATTY_ENV=local

# 3. Re-index system KB documents
# (Re-upload through admin UI or run reindex script)
```

## Testing

After deployment, verify isolation:

1. Upload a document on localhost
2. Check that it appears in `local-system-kb` namespace
3. Verify staging uses `staging-system-kb` namespace
4. Confirm no cross-environment bleed

## Rollback

If issues occur, you can temporarily disable environment prefixing:

```bash
# Forces use of legacy namespace (not recommended long-term)
PINECONE_NAMESPACE=system-kb
```

## Benefits

- ✅ Complete isolation between environments
- ✅ No more ghost documents from other environments
- ✅ Clear audit trail of which environment created vectors
- ✅ Safe to develop locally without affecting staging/production
- ✅ Easy to identify and clean up environment-specific data
