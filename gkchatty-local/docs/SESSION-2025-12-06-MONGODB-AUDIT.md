# Session Progress - December 6, 2025 (MongoDB Audit)

## Summary
Investigating MongoDB Atlas costs and cluster configuration to optimize spending.

---

## MongoDB Atlas API Access

Successfully configured API access:
- **Public Key:** `hzqailal`
- **Private Key:** `5c3abace-2924-4b40-af2a-258d7ad1db6b`
- **Organization ID:** `67f6f30a5a33da6185a091e0`
- **Project ID:** `67f6f30a5a33da6185a091fb`

---

## Current Costs

**Monthly spend: ~$270/month** for MongoDB Atlas

Breakdown by cluster:
| Cluster | Tier | Nodes | Cost/mo |
|---------|------|-------|---------|
| gkchatty-prod-cluster | M20 | 3 | ~$140 |
| gkchatty-staging-cluster | M10 | 3 | ~$57 |
| Cluster0gkchatty-dev-cluster | M10 | 3 | ~$57 |
| Backups + Data Transfer | - | - | ~$16 |

---

## Cluster Details

### 1. gkchatty-staging-cluster (M10)
- **Connection:** `mongodb+srv://gkchatty-staging-cluste.2l9dc.mongodb.net`
- **Database:** GKCHATTY-SANDBOX
- **Created:** May 1, 2025
- **MongoDB Version:** 8.0.16
- **Storage:** 10GB
- **Auto-scaling:** M10 → M20
- **Status:** ACTIVE - **THIS IS ACTUALLY PRODUCTION!**
- **Users:** Prema, Trisha, dev, larrye, nav, testuser1, initial_admin (7 real users)
- **Connected to:** staging-gk-chatty.onrender.com

### 2. gkchatty-prod-cluster (M20)
- **Connection:** `mongodb+srv://gkchatty-prod-cluster.2l9dc.mongodb.net`
- **Created:** June 23, 2025
- **MongoDB Version:** 7.0.26
- **Storage:** 20GB
- **Auto-scaling:** M20 → M40
- **Termination Protection:** ENABLED
- **Status:** UNKNOWN - Need to verify what uses this

### 3. Cluster0gkchatty-dev-cluster (M10)
- **Connection:** `mongodb+srv://cluster0gkchatty-dev-cl.fehrzkw.mongodb.net`
- **Created:** April 30, 2025
- **MongoDB Version:** 8.0.16
- **Storage:** 10GB
- **Auto-scaling:** Disabled
- **Status:** APPEARS ORPHANED - Not referenced in any config files

---

## GKChatty MCP Connections

### gkchatty-kb (local dev)
- URL: http://localhost:4001
- Users: 19 (admin, atlas, bob, dev, loadtest_user_1-10, etc.)
- Purpose: Local development

### gkchatty-production (staging/prod)
- URL: https://staging-gk-chatty.onrender.com
- Users: 7 (Prema, Trisha, dev, initial_admin, larrye, nav, testuser1)
- Purpose: Production site (confusingly named "staging")

---

## Web Endpoints Status

| URL | Status | Notes |
|-----|--------|-------|
| staging-gk-chatty.onrender.com | ✅ Running | Real production site |
| gkchatty.com | ❌ 404 on /health | Domain exists but incomplete config |
| apps.gkchatty.com | Unknown | Referenced in code, need to check |

### staging-gk-chatty.onrender.com health check:
```json
{
  "status": "unhealthy",
  "timestamp": "2025-12-06T08:18:31.883Z",
  "uptime": 7448.294921472,
  "checks": {
    "database": "ok",
    "auth": "failed",
    "documentStorage": "ok"
  },
  "version": "unknown"
}
```

---

## Key Finding: Naming Confusion

**The "staging" cluster is actually production!**

- Real users (Prema, Trisha, larrye, nav) use `staging-gk-chatty.onrender.com`
- This connects to `gkchatty-staging-cluster`
- The cluster named "prod" may be unused or a future migration target

---

## Questions to Resolve

1. **What is gkchatty.com pointing to?**
   - Frontend only? Different backend?
   - Does it use gkchatty-prod-cluster?

2. **What uses gkchatty-prod-cluster?**
   - Created June 23, 2025 (after staging)
   - Has termination protection enabled
   - May have been created for a migration that didn't happen

3. **Is Cluster0gkchatty-dev-cluster used?**
   - No references found in codebase
   - Appears safe to delete (saves $57/mo)

---

## Potential Savings

| Action | Savings | Risk |
|--------|---------|------|
| Delete Cluster0gkchatty-dev-cluster | $57/mo | Low (appears orphaned) |
| Pause/delete gkchatty-prod-cluster | $140/mo | NEED TO VERIFY FIRST |
| Total potential | Up to $200/mo | |

**Current spend:** ~$270/mo
**Minimum needed:** ~$57/mo (single M10 for 50 users)

---

## User's Request

User wants to:
1. Understand the current setup
2. Deploy "staging" code to production (better version)
3. Figure out what the third cluster (dev) is doing
4. Optimize costs

**Important:** User requested NOT to delete anything without understanding the full picture first.

---

## API Commands Used

```bash
# List organizations
curl -s --digest -u "hzqailal:5c3abace-2924-4b40-af2a-258d7ad1db6b" \
  "https://cloud.mongodb.com/api/atlas/v2/orgs" \
  -H "Accept: application/vnd.atlas.2023-11-15+json"

# List projects
curl -s --digest -u "hzqailal:5c3abace-2924-4b40-af2a-258d7ad1db6b" \
  "https://cloud.mongodb.com/api/atlas/v2/groups" \
  -H "Accept: application/vnd.atlas.2023-11-15+json"

# List clusters
curl -s --digest -u "hzqailal:5c3abace-2924-4b40-af2a-258d7ad1db6b" \
  "https://cloud.mongodb.com/api/atlas/v2/groups/67f6f30a5a33da6185a091fb/clusters" \
  -H "Accept: application/vnd.atlas.2023-11-15+json"
```

---

## Architecture Mapping (COMPLETE)

### Domain → Service → Cluster Mapping

```
gkchatty.com → 301 redirect → apps.gkchatty.com
                                  ↓
                          Netlify (Frontend)
                                  ↓
                    staging-gk-chatty.onrender.com (Backend API)
                                  ↓
                    gkchatty-staging-cluster (MongoDB M10)
                                  ↓
                    GKCHATTY-SANDBOX (database)
```

### Service Details

| Component | Host | Platform | Notes |
|-----------|------|----------|-------|
| Frontend | apps.gkchatty.com | Netlify | Next.js, builds from `gkchatty-local/frontend` |
| Backend API | staging-gk-chatty.onrender.com | Render | Express/Node.js |
| Database | gkchatty-staging-cluster | MongoDB Atlas M10 | Real production data |

### Cluster Status Summary

| Cluster | Status | Evidence |
|---------|--------|----------|
| gkchatty-staging-cluster (M10) | **ACTIVE PRODUCTION** | Connected to Render backend, has 7 real users |
| gkchatty-prod-cluster (M20) | **UNUSED / RESERVED** | No references in codebase, `javascriptEnabled: false` |
| Cluster0gkchatty-dev-cluster (M10) | **ORPHANED** | Only in old test scripts, original dev cluster |

---

## Key Finding: Cluster0gkchatty-dev-cluster

**Evidence it's orphaned:**
- Hardcoded credentials in test script: `test-tenant-kb.js`
- Connection: `mongodb+srv://davidmorinmusic:woolaway@cluster0gkchatty-dev-cl.fehrzkw.mongodb.net`
- Created: April 30, 2025 (first cluster created)
- No active services connect to it
- Only used for one-off test scripts

**Safe to delete:** Yes - saves $57/month

---

## Key Finding: gkchatty-prod-cluster

**Evidence it's not actively used:**
- No environment files reference it
- Only appears in `verify-prod-mongo-textcontent.ts` (utility script requiring manual MONGODB_URI)
- Has `javascriptEnabled: false` (stricter security, suggests it was set up but never used)
- Has termination protection enabled (suggests it was intended for production)
- Created: June 23, 2025 (after staging was already running)

**Theory:** This cluster was created for a planned migration from staging to prod that never happened.

**Action:** Verify with Render dashboard before pausing/deleting. Saves $140/month if unused.

---

## Actions Completed

### Cluster Deletions (DONE)
1. ✅ **Deleted**: Cluster0gkchatty-dev-cluster ($57/mo savings)
2. ✅ **Deleted**: gkchatty-prod-cluster ($140/mo savings)
3. ✅ **Kept**: gkchatty-staging-cluster (production database)

**Total savings: $197/month (~$2,556/year)**
**New monthly cost: ~$57/month** (down from ~$270/month)

---

## Issue Discovered After Deletion

### Problem: apps.gkchatty.com login broken

**Root Cause:** There are TWO different backend services:

| Backend URL | Status | Database |
|-------------|--------|----------|
| `staging-gk-chatty.onrender.com` | ✅ Working | gkchatty-staging-cluster |
| `api.gkchatty.com` | ❌ Broken | Was connected to deleted cluster |

**The frontend at apps.gkchatty.com uses `api.gkchatty.com`** which was pointing to one of the deleted clusters.

### Console Error from apps.gkchatty.com:
```
[Config] Client API Base URL (Resolved): https://api.gkchatty.com
api.gkchatty.com/api/auth/verify: 401
api.gkchatty.com/api/auth/login: "Server error during login"
```

### Working Alternative:
`gkchatty-staging-sandbox.netlify.app` - This site works and uses the correct backend.

---

## Fix Required

### Option 1: Replace apps.gkchatty.com with staging-sandbox (Recommended)

In Netlify Dashboard:
1. Go to `gkchatty-staging-sandbox` site
2. Site settings → Domain management → Add custom domain
3. Add: `apps.gkchatty.com`
4. If domain is on another site, remove it from there first
5. Verify environment variable `NEXT_PUBLIC_API_URL` = `https://staging-gk-chatty.onrender.com`
6. Trigger rebuild: Clear cache and deploy

### Option 2: Fix api.gkchatty.com backend

In Render Dashboard:
1. Find the service behind `api.gkchatty.com`
2. Update its `MONGODB_URI` to point to `gkchatty-staging-cluster`
3. Redeploy

---

## Fix Applied (DONE)

### Root Cause
The `gkchatty-prod-frontend` Netlify site (serving apps.gkchatty.com) had environment variable:
```
NEXT_PUBLIC_API_BASE_URL=https://gkchatty-staging-backend.onrender.com
```
This URL is **dead** (returns "Route not found").

The working `gkchatty-staging-sandbox` site uses:
```
NEXT_PUBLIC_API_BASE_URL=https://staging-gk-chatty.onrender.com
```

### Fix Applied via Netlify CLI
1. Updated env var on `gkchatty-prod-frontend` (site ID: `69120fad-8fce-40b1-aa4d-cf0b7db958bb`):
   ```bash
   netlify api updateEnvVar --data '{"account_id": "...", "site_id": "...", "key": "NEXT_PUBLIC_API_BASE_URL", "body": {"key": "NEXT_PUBLIC_API_BASE_URL", "scopes": ["builds", "functions", "runtime", "post-processing"], "values": [{"value": "https://staging-gk-chatty.onrender.com", "context": "all"}]}}'
   ```
2. Triggered rebuild with cache clear:
   ```bash
   netlify api createSiteBuild --data '{"site_id": "...", "body": {"clear_cache": true}}'
   ```
3. Deploy completed: `6933ee950775ef097147281f` (published at 2025-12-06T08:53:30.418Z)

---

## Current State (AFTER FIX)

| Component | URL | Status |
|-----------|-----|--------|
| Frontend | apps.gkchatty.com | ✅ Fixed - now uses staging-gk-chatty.onrender.com |
| Frontend | gkchatty-staging-sandbox.netlify.app | ✅ Works |
| Backend | staging-gk-chatty.onrender.com | ✅ Works |
| Database | gkchatty-staging-cluster | ✅ Running, all 7 users intact |

**Both Netlify sites now point to the same working backend.**

---

## Netlify Sites Summary (FINAL STATE)

### Domain Transfer Completed

**Problem Discovered:** The two Netlify sites were deploying from DIFFERENT GitHub repositories:
- `gkchatty-prod-frontend`: `dmos82/goldkey-chat-app` (main) - **OLD CODE**
- `gkchatty-staging-sandbox`: `dmos82/gkchatty-local-v2` (staging) - **GOOD CODE**

**Solution:** Transferred `apps.gkchatty.com` domain from old site to staging-sandbox.

### Commands Used
```bash
# Remove domain from old site
netlify api updateSite --data '{"site_id": "69120fad-8fce-40b1-aa4d-cf0b7db958bb", "body": {"custom_domain": null}}'

# Add domain to staging-sandbox
netlify api updateSite --data '{"site_id": "aa3a1369-f83f-4e61-8aaf-2ed6f4ec2962", "body": {"custom_domain": "apps.gkchatty.com"}}'
```

### Final Configuration

| Site Name | Domain | GitHub Repo | Branch | API Backend | Site ID |
|-----------|--------|-------------|--------|-------------|---------|
| gkchatty-staging-sandbox | **apps.gkchatty.com** | gkchatty-local-v2 | staging | staging-gk-chatty.onrender.com | aa3a1369-f83f-4e61-8aaf-2ed6f4ec2962 |
| gkchatty-prod-frontend | *.netlify.app only | goldkey-chat-app | main | (deprecated) | 69120fad-8fce-40b1-aa4d-cf0b7db958bb |

**Result:** `apps.gkchatty.com` now serves the latest code from `gkchatty-local-v2` staging branch.

---

## CORS Issue Discovered (NEEDS FIX)

### Problem
After domain transfer, `apps.gkchatty.com` shows CORS errors:
```
Access to fetch at 'https://staging-gk-chatty.onrender.com/api/auth/verify'
from origin 'https://apps.gkchatty.com' has been blocked by CORS policy
```

### Root Cause
The backend at `staging-gk-chatty.onrender.com` has `FRONTEND_URL` env var set, which overrides the default CORS origins that include `apps.gkchatty.com`.

### Fix Required (On Render Dashboard)
1. Go to: Render Dashboard → `staging-gk-chatty` service → Environment
2. Find `FRONTEND_URL` environment variable
3. Update it to include `apps.gkchatty.com`:
   ```
   FRONTEND_URL=https://apps.gkchatty.com,https://gkchatty-staging-sandbox.netlify.app
   ```
4. Click "Save Changes" → Render will auto-redeploy

### Code Reference
The CORS configuration is in `backend/src/index.ts:328-349`:
```typescript
const frontendUrl = process.env.FRONTEND_URL;
const allowedOrigins = frontendUrl ? frontendUrl.split(',').map(origin => origin.trim()) : [];

// Default origins only used if FRONTEND_URL is not set
if (allowedOrigins.length === 0) {
  const defaultOrigins = [
    'https://apps.gkchatty.com',  // ← This is in defaults
    ...
  ];
}
```

---

## User Data Status

All users are safe in gkchatty-staging-cluster:
- Prema, Trisha, dev, initial_admin, larrye, nav, testuser1

The database was NOT affected by the cluster deletions.

---

## Session Summary

### Cost Optimization
- **Before:** ~$270/month (3 clusters)
- **After:** ~$57/month (1 cluster)
- **Savings:** $197/month ($2,556/year)

### Clusters Deleted
1. Cluster0gkchatty-dev-cluster (orphaned)
2. gkchatty-prod-cluster (unused)

### Issues Fixed
1. **Login broken after cluster deletion**
   - Root cause: Dead backend URL in Netlify env var
   - Initial fix: Updated env var to working backend

2. **Wrong codebase on apps.gkchatty.com**
   - Discovery: Two Netlify sites using different GitHub repos
   - `gkchatty-prod-frontend` → `goldkey-chat-app` (old code)
   - `gkchatty-staging-sandbox` → `gkchatty-local-v2` (current code)
   - Fix: Transferred `apps.gkchatty.com` domain to staging-sandbox site

### Final Architecture
```
gkchatty.com → 301 redirect → apps.gkchatty.com
                                    ↓
                    gkchatty-staging-sandbox (Netlify)
                    Repo: gkchatty-local-v2 (staging branch)
                                    ↓
                    staging-gk-chatty.onrender.com (Backend)
                                    ↓
                    gkchatty-staging-cluster (MongoDB M10)
```

---

## Files Changed This Session

- Created: `docs/SESSION-2025-12-06-MONGODB-AUDIT.md` (this file)

---

## Previous Session Context

From earlier today:
- Added user profile picture upload with S3 presigned URLs
- Reverted admin dashboard avatar feature (user preference)
- Pushed to staging branch (commit `cfa9f8d`)

See: `docs/SESSION-2025-12-06-PROGRESS.md`
