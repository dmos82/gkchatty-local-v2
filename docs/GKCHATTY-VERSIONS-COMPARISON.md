# GKChatty Versions - Resource Sharing Analysis

**Date:** 2025-11-11
**Status:** Analysis Complete - Action Items Identified

---

## Executive Summary

Two GKChatty versions are running simultaneously with **shared resources** that should be isolated:

1. **gkchatty-local** (ecosystem) - Cloud-enabled version for production/staging
2. **gkchatty-pure** (standalone) - **Meant to be 100% local** but currently misconfigured

**Critical Issue:** Both share the same MongoDB database and gkchatty-pure has cloud service configuration when it should be fully local.

---

## Version Comparison

### 1. gkchatty-local (Ecosystem)

**Location:** `/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-ecosystem/gkchatty-local/`

**Configuration:**
- **Port:** 4001
- **MongoDB:** `mongodb://localhost:27017/gkchatty` ⚠️ SHARED
- **Storage:** Cloud/S3 enabled
- **MCP Access:** ✅ Yes (`gkchatty-mcp` → port 4001)
- **Process:** PID 76404
- **Purpose:** Production/staging version with cloud integration

**Current Status:** ✅ Working as intended (cloud-enabled)

---

### 2. gkchatty-pure (Standalone)

**Location:** `/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-pure/`

**Configuration:**
- **Port:** 3001
- **MongoDB:** `mongodb://localhost:27017/gkchatty` ⚠️ SHARED (should be separate)
- **Storage:** Cloud/S3 ❌ **MISCONFIGURED** (should be 100% local)
- **MCP Access:** ❌ No (not configured)
- **Process:** PID 69466
- **Purpose:** **100% local version** (no cloud dependencies)

**Current Status:** ❌ Misconfigured with cloud services

---

## Shared Resources (Problems)

### 1. MongoDB Database ⚠️ CRITICAL

**Current State:**
```bash
# gkchatty-local
MONGODB_URI=mongodb://localhost:27017/gkchatty

# gkchatty-pure
MONGODB_URI=mongodb://localhost:27017/gkchatty  # ❌ SAME DATABASE
```

**Problems:**
- Both versions write to same collections
- No data isolation
- Schema conflicts possible
- Changes in one affect the other

**Fix Required:**
```bash
# gkchatty-pure should use:
MONGODB_URI=mongodb://localhost:27017/gkchatty-pure
```

---

### 2. Storage Configuration ❌ CRITICAL

**gkchatty-pure current config (.env):**
```bash
GKCHATTY_STORAGE=cloud          # ❌ Should be "local"
FILE_STORAGE_MODE=S3            # ❌ Should be "local"
LOCAL_FILE_STORAGE_DIR=uploads  # ✅ OK but not used
```

**gkchatty-pure SHOULD be:**
```bash
GKCHATTY_STORAGE=local          # ✅ 100% local
FILE_STORAGE_MODE=local         # ✅ No S3
LOCAL_FILE_STORAGE_DIR=~/.gkchatty-pure/uploads  # ✅ Isolated storage
```

---

### 3. MCP Server Configuration

**Current:**
```json
// ~/.config/claude/mcp.json
{
  "gkchatty-mcp": {
    "env": {
      "GKCHATTY_API_URL": "http://localhost:4001"  // Points to gkchatty-local only
    }
  }
}
```

**gkchatty-pure has NO MCP access** (may or may not be needed)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    MongoDB (localhost:27017)                 │
│  ┌──────────────────┐              ┌──────────────────┐    │
│  │   gkchatty DB    │ ⚠️ SHARED   │ gkchatty-pure    │    │
│  │  (cloud version) │──────────────│   (should be     │    │
│  │                  │              │    separate!)    │    │
│  └──────────────────┘              └──────────────────┘    │
└─────────────────────────────────────────────────────────────┘
         ↑                                      ↑
         │                                      │
┌────────┴─────────┐                  ┌────────┴─────────┐
│  gkchatty-local  │                  │  gkchatty-pure   │
│   (Port 4001)    │                  │   (Port 3001)    │
│                  │                  │                  │
│  ✅ Cloud/S3     │                  │  ❌ Cloud/S3     │
│  ✅ MongoDB      │                  │     (should be   │
│  ✅ MCP enabled  │                  │      local!)     │
└──────────────────┘                  └──────────────────┘
         ↑
         │
┌────────┴─────────┐
│   gkchatty-mcp   │
│  (MCP Server)    │
│  dev/dev123      │
└──────────────────┘
```

---

## Action Items (For Later)

### Priority 1: Database Isolation

**Goal:** Separate gkchatty-pure to use its own database

**Steps:**
1. Change `gkchatty-pure/backend/.env`:
   ```bash
   MONGODB_URI=mongodb://localhost:27017/gkchatty-pure
   ```
2. Restart gkchatty-pure backend
3. Verify isolation (documents in one don't appear in the other)

**Impact:** ✅ Complete data isolation

---

### Priority 2: Remove Cloud Dependencies from gkchatty-pure

**Goal:** Make gkchatty-pure 100% local (no S3, no cloud services)

**Current Issues:**
- `GKCHATTY_STORAGE=cloud` → Should be `local`
- `FILE_STORAGE_MODE=S3` → Should be `local`
- Likely has AWS credentials in .env
- May have other cloud service integrations

**Steps Required:**
1. Audit all cloud service references in code
2. Replace S3 storage with local filesystem
3. Remove cloud dependencies from package.json
4. Update .env to use only local storage
5. Test document upload/download works locally
6. Verify no network calls to external services

**Expected Config:**
```bash
# gkchatty-pure/.env (target state)
PORT=3001
MONGODB_URI=mongodb://localhost:27017/gkchatty-pure
GKCHATTY_STORAGE=local
FILE_STORAGE_MODE=local
LOCAL_FILE_STORAGE_DIR=/Users/davidjmorin/.gkchatty-pure/data
# NO AWS credentials
# NO S3 bucket names
# NO external API endpoints
```

---

### Priority 3: MCP Server (Optional)

**Decision:** Does gkchatty-pure need MCP access?

**Option A: No MCP (Standalone)**
- gkchatty-pure is just for local testing/development
- No Builder Pro integration needed
- Keep simple

**Option B: Add MCP Server**
- Create `gkchatty-pure-mcp` server in `~/.config/claude/mcp.json`
- Point to `http://localhost:3001`
- Use different tool prefix (e.g., `mcp__gkchatty-pure__*`)

---

## Cloud Service Audit Checklist (TODO)

When addressing Priority 2, check for:

- [ ] AWS S3 SDK imports/usage
- [ ] AWS credentials in .env
- [ ] S3 bucket configuration
- [ ] External API endpoints
- [ ] Pinecone/vector DB connections
- [ ] OpenAI API calls
- [ ] Any other SaaS integrations
- [ ] Network request monitoring during operation

**Goal:** Zero external network calls except localhost

---

## Directory Structure

```
/Users/davidjmorin/GOLDKEY CHATTY/
├── gkchatty-ecosystem/
│   └── gkchatty-local/              # Port 4001, Cloud, MCP-enabled
│       ├── backend/
│       └── frontend/ (packages/web)
│
└── gkchatty-pure/                   # Port 3001, SHOULD BE 100% LOCAL
    ├── backend/                      # ❌ Currently has cloud config
    └── frontend-lite/                # Minimal UI

# Future isolated storage
~/.gkchatty-pure/
├── data/                             # Local database files (if SQLite)
└── uploads/                          # Local file storage
```

---

## Current Process Status

```bash
# Active processes (ps -p 69466,76404)
PID    PORT   VERSION           PATH
76404  4001   gkchatty-local   /gkchatty-ecosystem/gkchatty-local/
69466  3001   gkchatty-pure    /gkchatty-pure/backend/
```

---

## Summary

**Immediate State:**
- ✅ Both versions running on separate ports
- ⚠️ Sharing same MongoDB database (unintended)
- ❌ gkchatty-pure has cloud config (should be local)
- ⚠️ Only gkchatty-local has MCP access

**Target State:**
- ✅ Both versions running on separate ports
- ✅ Separate MongoDB databases
- ✅ gkchatty-pure is 100% local (no cloud)
- ✅ gkchatty-local remains cloud-enabled
- ⚠️ MCP decision TBD

**Status:** Documented, ready to fix when prioritized

---

**Related Files:**
- `/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-ecosystem/gkchatty-local/backend/.env`
- `/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-pure/backend/.env`
- `~/.config/claude/mcp.json`

**Next Steps:** Address Priority 1 (database isolation) when ready, then tackle Priority 2 (remove cloud dependencies from gkchatty-pure).

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
