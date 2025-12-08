# Session: December 7, 2025 - Upload Fixes & Environment Separation

## Summary
1. Fixed two file upload regressions on staging (apps.gkchatty.com)
2. Fixed AWS IAM permissions for S3 buckets
3. Started environment separation (staging vs production)

---

## Part 1: Upload Fixes

### 1. Document Upload Failure
**Problem:** Frontend was using presigned URLs to upload directly to S3, but S3 CORS was not configured for `apps.gkchatty.com`.

**Error:** `TypeError: Failed to fetch` at `uploadFiles` in fileTreeStore.ts

**Fix:** Changed user mode uploads to use server-side upload (`/api/documents/upload`) instead of presigned URLs. The backend handles S3 upload, avoiding CORS issues.

**File Changed:** `frontend/src/stores/fileTreeStore.ts`
- Replaced 3-step presigned URL flow with single server-side upload
- Now uses same pattern as system KB uploads

### 2. IM File Sharing Regression
**Problem:** When opening a new IM chat window, `conversationId` is null until first message is sent. The `uploadFileToConversation` function silently returned null when no conversation existed.

**Fix:** Added conversation creation logic before upload attempt (same pattern as `handleSend`).

**File Changed:** `frontend/src/components/im/IMChatWindow.tsx`
- Modified `uploadFileToConversation` to create conversation first if needed
- Uses `createConversation(recipientId, recipientUsername)` before upload

---

## Part 2: AWS IAM Fix

### Problem
After fixing the frontend upload code, uploads still failed with:
```
S3 Upload Failed: User: arn:aws:iam::079621603261:user/gkchatty-s3-user
is not authorized to perform: s3:PutObject on resource:
"arn:aws:s3:::gkchatty-staging-documents/..."
```

### Root Cause
The IAM user `gkchatty-s3-user` only had permissions for `gkchatty-sandbox-documents` bucket, not the new `gkchatty-staging-documents` and `gkchatty-prod-documents` buckets.

### Fix
Updated IAM policy `GkChattyStagingDocsS3Access` to include all buckets:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowAllGkChattyBuckets",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": [
        "arn:aws:s3:::gkchatty-sandbox-documents/*",
        "arn:aws:s3:::gkchatty-staging-documents/*",
        "arn:aws:s3:::gkchatty-prod-documents/*"
      ]
    }
  ]
}
```

---

## Part 3: Environment Separation (Attempted - Rolled Back)

### Problem Identified
Both staging and production backends were using the SAME database (`GKCHATTY-SANDBOX`), which is incorrect for proper environment isolation.

### Current Architecture (Unchanged)
| Environment | Frontend | Backend | Database | S3 Bucket |
|-------------|----------|---------|----------|-----------|
| Staging | apps.gkchatty.com | staging-gk-chatty.onrender.com | GKCHATTY-SANDBOX | gkchatty-staging-documents |
| Production | gkchatty-prod-frontend.netlify.app | gkchatty-api-production.onrender.com | GKCHATTY-SANDBOX | gkchatty-prod-documents |
| Local Dev | localhost:4003 | localhost:4001 | localhost:27017/gkchatty | N/A |

### Target Architecture (Future)
| Environment | Frontend | Backend | Database | S3 Bucket |
|-------------|----------|---------|----------|-----------|
| Staging | apps.gkchatty.com | staging-gk-chatty.onrender.com | GKCHATTY-SANDBOX | gkchatty-staging-documents |
| Production | gkchatty-prod-frontend.netlify.app | gkchatty-api-production.onrender.com | **GKCHATTY-PRODUCTION** | gkchatty-prod-documents |
| Local Dev | localhost:4003 | localhost:4001 | localhost:27017/gkchatty | N/A |

### Progress
- [x] Created new `GKCHATTY-PRODUCTION` database in MongoDB Atlas
- [x] Created initial `users` collection
- [x] Updated production backend MONGODB_URI on Render
- [x] Triggered deploy → **FAILED** (`update_failed`)
- [x] **Rolled back** MONGODB_URI to GKCHATTY-SANDBOX

### Why Deploy Failed
The production backend deploy failed when switching to `GKCHATTY-PRODUCTION` database. This is likely because:
1. Render's health check failed during deployment
2. The empty database doesn't have required collections/indexes
3. The app may expect certain data to exist on startup

### Resolution
**Rolled back** to `GKCHATTY-SANDBOX` to restore production functionality. Both staging and production continue to share the same database for now.

### Future Work Required
To properly separate environments:
1. **Option A: Data Migration** - Copy data from GKCHATTY-SANDBOX to GKCHATTY-PRODUCTION, then switch
2. **Option B: Fresh Start** - Ensure app can start with empty database, register admin user first
3. **Option C: Seed Script** - Create a database seeding script that sets up required collections/indexes

---

## Deployment Status

### Frontend (Netlify)
- Manual deploy completed via CLI
- Command: `NEXT_PUBLIC_API_URL=https://staging-gk-chatty.onrender.com HUSKY=0 netlify deploy --prod`
- Live at: https://apps.gkchatty.com

### Backend (Render)
- Staging: https://staging-gk-chatty.onrender.com (working)
- Production: https://gkchatty-api-production.onrender.com (needs DB update)

---

## Files Modified (Not Committed)
```
M gkchatty-local/frontend/src/stores/fileTreeStore.ts
M gkchatty-local/frontend/src/components/im/IMChatWindow.tsx
```

---

## Next Steps
1. ~~Update production backend on Render to use `GKCHATTY-PRODUCTION` database~~ (Attempted - rolled back)
2. Plan proper database migration strategy (see "Future Work Required" above)
3. Commit frontend code changes (upload fixes)
4. Test staging environment with upload fixes

---

## AWS Resources

### S3 Buckets (us-east-2)
- `gkchatty-sandbox-documents` - Created June 30, 2025
- `gkchatty-staging-documents` - Created Dec 7, 2025
- `gkchatty-prod-documents` - Created Dec 7, 2025

### IAM
- User: `gkchatty-s3-user`
- Policy: `GkChattyStagingDocsS3Access` (updated to include all buckets)

### MongoDB Atlas
- Cluster: `gkchatty-staging-cluster` (M10 tier, us-east-1)
- Databases:
  - `GKCHATTY-SANDBOX` - **Both staging and production** (shared)
  - `GKCHATTY-PRODUCTION` - Created but empty/unused (future use)
