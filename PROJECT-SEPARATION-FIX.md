# Project Separation Fix - gkchatty-local vs GKCHATTYLOCALBUILD

**Date:** November 3, 2025
**Issue:** Port configuration cross-contamination between two separate projects

## The Problem

The hardcoded `PORT=6001` in `gkchatty-local/backend/package.json` was meant for **GKCHATTYLOCALBUILD** but somehow ended up in the **gkchatty-local** project, causing it to fail on startup.

## Two Separate Projects

### 1. **gkchatty-local** (Insurance Company Web Version)
- **Purpose:** Production web-based RAG platform for 50+ users
- **Ports:** Backend 4001, Frontend 4003
- **Database:** MongoDB + Pinecone (cloud)
- **Storage:** Currently LOCAL (should be S3 for production)
- **Use Case:** Enterprise deployment with authentication, rate limiting, multi-user

### 2. **GKCHATTYLOCALBUILD** (Local-Only Version)
- **Purpose:** Offline-first, no cloud dependencies
- **Ports:** Backend 6001, Frontend 6004
- **Database:** SQLite + ChromaDB (local)
- **Storage:** Local filesystem only
- **Use Case:** Air-gapped environments, personal use, no internet required

## What Was Fixed

### File: `/gkchatty-local/backend/package.json`

**BEFORE (WRONG):**
```json
"dev": "PORT=6001 ts-node-dev --respawn --transpile-only --exit-child --notify=false src/index.ts"
```

**AFTER (CORRECT):**
```json
"dev": "ts-node-dev --respawn --transpile-only --exit-child --notify=false src/index.ts"
```

Now reads PORT from `.env` file correctly.

### File: `/gkchatty-local/backend/.env`

**CORRECTED:**
- `PORT=4001` ✅
- `LOCAL_FILE_STORAGE_DIR=uploads` ✅ (was `local_uploads`, wrong path)

## Verification Checklist

### ✅ gkchatty-local Configuration
- [x] `backend/.env`: `PORT=4001`
- [x] `backend/package.json`: No hardcoded PORT
- [x] `frontend/package.json`: `-p 4003`
- [x] Backend running on 4001
- [x] Frontend running on 4003
- [x] File storage: `/uploads/` directory
- [x] Database: MongoDB on localhost:27017

### ✅ GKCHATTYLOCALBUILD Configuration
- [x] `backend/.env`: `PORT=6001`
- [x] `frontend/package.json`: `-p 6004`
- [x] Backend running on 6001
- [x] Frontend running on 6004
- [x] File storage: Separate local directory
- [x] Database: SQLite (no MongoDB)

## How to Prevent This

### Rules for Maintaining Separation

1. **Never copy package.json between projects** - They have different port requirements
2. **Check .env files** - Each project must have its own `.env` with correct PORT
3. **Never hardcode ports in package.json** - Always read from .env
4. **Test startup** - Verify correct ports with `lsof -i :4001` and `lsof -i :6001`

### Correct Port Assignment

| Project | Backend | Frontend | Database |
|---------|---------|----------|----------|
| **gkchatty-local** | 4001 | 4003 | MongoDB 27017 |
| **GKCHATTYLOCALBUILD** | 6001 | 6004 | SQLite (file) |

### Quick Verification Commands

```bash
# Verify gkchatty-local
lsof -i :4001  # Should show node process
lsof -i :4003  # Should show next dev
curl -s http://localhost:4001/health | jq .

# Verify GKCHATTYLOCALBUILD
lsof -i :6001  # Should show node process
lsof -i :6004  # Should show next dev
curl -s http://localhost:6001/health | jq .
```

## Current Status

✅ **gkchatty-local**: Running correctly on 4001/4003
✅ **GKCHATTYLOCALBUILD**: Running correctly on 6001/6004
✅ **No port conflicts**
✅ **Complete separation maintained**

## What Changed This Session

1. ✅ Fixed `package.json` hardcoded port (4001 now reads from .env)
2. ✅ Fixed file storage path (`uploads` instead of `local_uploads`)
3. ✅ Backend restarted and verified on port 4001
4. ✅ PDFs now accessible (correct file path)
5. ✅ Login working (backend responding correctly)

## For Production Deployment (gkchatty-local only)

### Required Changes Before Insurance Company Deployment:

1. **File Storage:** Change to S3
   ```env
   FILE_STORAGE_MODE=S3
   AWS_ACCESS_KEY_ID=xxx
   AWS_SECRET_ACCESS_KEY=xxx
   AWS_REGION=us-east-1
   AWS_S3_BUCKET=gkchatty-insurance-docs
   ```

2. **Redis:** Use Redis Sentinel/Cluster for HA
   ```env
   REDIS_URL=redis://your-redis-cluster:6379
   REDIS_PASSWORD=your-password
   ```

3. **Rate Limiting:** Review production limits for 50 users
   - Currently: 100 req/15min per user (standard endpoints)
   - AI: 30 req/min shared pool
   - May need adjustment based on usage patterns

---

**This document ensures gkchatty-local and GKCHATTYLOCALBUILD remain completely separate projects.**
