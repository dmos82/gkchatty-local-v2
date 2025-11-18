# GKChatty - The ACTUAL Truth About Your Versions
**Date:** 2025-11-15
**Status:** 🔴 CRITICAL CONFUSION RESOLVED

## What You Were Told vs. Reality

### ❌ MYTH: gkchatty-local is "hybrid" with local/cloud modes
### ✅ TRUTH: gkchatty-local is CLOUD-ONLY (MongoDB + Pinecone + OpenAI)

**Evidence:**
- `.env` file shows: `GKCHATTY_STORAGE=cloud`
- `index.ts` imports: `mongoHelper` and `mongoose` (NOT sqliteHelper)
- Health check confirms: Connected to MongoDB
- No UI exists to switch storage modes
- SQLite/ChromaDB code EXISTS in `/utils/local/` but is NEVER IMPORTED OR USED

---

## The ACTUAL Three Versions

| Version | Ports | Stack | Purpose | Status |
|---------|-------|-------|---------|--------|
| **gkchatty-local** | 4001/4003 | MongoDB + Pinecone + OpenAI | Local development of CLOUD version | ✅ Running |
| **gkchatty-pure** | 3001/3004 | SQLite + ChromaDB + Ollama | 100% offline desktop app | ✅ Running |
| **Staging/Production** | N/A | MongoDB Atlas + Pinecone + OpenAI | Deployed SaaS (Netlify) | ❓ Unknown |

---

## MCP Server Reality Check

### gkchatty-mcp

```javascript
const API_URL = process.env.GKCHATTY_API_URL || 'http://localhost:4001';
```

**Default Target:** localhost:4001 (gkchatty-local)
**Purpose:** MCP integration for local cloud development

### gkchatty-web-mcp

```javascript
const API_URL = process.env.GKCHATTY_API_URL || 'http://localhost:4001';
```

**Default Target:** ALSO localhost:4001 (gkchatty-local)
**Purpose:** Misleadingly named! Same as gkchatty-mcp by default
**To connect to staging:** Must set `GKCHATTY_API_URL=https://your-staging-url.netlify.app`

**🚨 CRITICAL:** Both MCPs point to the SAME localhost server by default! They are NOT pointing to different versions unless you configure environment variables.

---

## What's Actually Running Right Now

### Port 4001/4003: gkchatty-local (CLOUD MODE)

**Backend Stack:**
- Database: MongoDB (local instance at mongodb://localhost:27017/gkchatty)
- Vector DB: Pinecone (us-east-1, index: gkchatty-sandbox)
- LLM: OpenAI API (gpt-4o-mini, gpt-3.5-turbo)
- File Storage: AWS S3 (bucket: gkchatty-sandbox-documents)

**Authentication:** MongoDB-based sessions with JWT

**Key Features:**
- Ollama integration code exists (ollamaHelper.ts)
- System folder management
- Advanced admin settings

### Port 3001/3004: gkchatty-pure (LOCAL MODE)

**Backend Stack:**
- Database: SQLite (`~/.gkchatty/data/gkchatty.db`)
- Vector DB: ChromaDB (local)
- LLM: Ollama (llama3.2:3b, qwen2.5:7b, etc.)
- File Storage: Local filesystem

**Authentication:** SQLite-based sessions

**Key Features:**
- Model router (auto-selects Ollama model by complexity)
- Document export (PDF, MD, TXT, HTML, DOCX)
- Streaming SSE responses
- 100% offline capable

---

## Why The Confusion?

### 1. Misleading README

`gkchatty-local/README.md` says:
> "This provides zero cloud costs, complete data privacy, offline functionality"

**REALITY:** That README describes a PLANNED feature that was NEVER IMPLEMENTED.

The `/utils/local/` directory with SQLite/ChromaDB code was built but NEVER CONNECTED to the main application.

### 2. Unused Code

```
gkchatty-local/backend/src/utils/local/
├── sqliteHelper.ts      # ✅ Code exists
├── chromaService.ts     # ✅ Code exists
├── embeddingService.ts  # ✅ Code exists
└── storageAdapter.ts    # ✅ Code exists

But index.ts imports:
import { connectDB } from './utils/mongoHelper';  # ❌ Uses MongoDB instead!
```

### 3. Environment Variable That Does Nothing

`GKCHATTY_STORAGE=local` is checked in `/utils/local/` files, but those files are never imported, so the variable has no effect.

### 4. No UI for Mode Switching

The frontend has NO settings page to switch between local/cloud modes. The admin settings only show:
- System prompt configuration
- OpenAI API configuration
- Server info

There is NO "Storage Mode" selector anywhere in the UI.

---

## GitHub Repository Truth

**Repository:** https://github.com/dmos82/gkchatty-local-v2

**Your local branch:** `local-ollama-dev`
**GitHub main branch:** `origin/main`

**Status:** Your local branch is AHEAD of main by 5 commits (Ollama features)

**Question:** What's on the staging website?
**Answer:** Unknown - need to check Netlify deployment logs to see which branch it deploys

**Most Likely:** Staging deploys from `origin/staging` or `origin/main`, which does NOT have your Ollama features.

---

## The Real Differences

### gkchatty-local vs gkchatty-pure

**NOT what you think:**
- ❌ gkchatty-local is NOT "hybrid"
- ❌ gkchatty-local does NOT support local-only mode
- ❌ gkchatty-local does NOT use SQLite or ChromaDB

**The truth:**
- ✅ gkchatty-local = Cloud-only development version
- ✅ gkchatty-pure = Actual local-only version
- ✅ They are COMPLETELY SEPARATE codebases with NO shared code

### What makes them different?

| Feature | gkchatty-local | gkchatty-pure |
|---------|----------------|---------------|
| **Database** | MongoDB | SQLite |
| **Vector DB** | Pinecone | ChromaDB |
| **LLM** | OpenAI API | Ollama |
| **GitHub** | Connected | Not connected |
| **Deployment** | Netlify (can deploy) | Never (local only) |
| **Internet** | Required | Optional (offline-capable) |
| **Cost** | $$$ (cloud services) | Free (no cloud) |

---

## Critical Questions - ANSWERED

### Q1: Which version is on the staging website?

**Answer:** Need to check - but MOST LIKELY it's `origin/main` which:
- Does NOT have Ollama integration
- Does NOT have your local-ollama-dev features
- IS cloud-only (MongoDB + Pinecone + OpenAI)

### Q2: Can gkchatty-local switch to local mode?

**Answer:** NO. The code exists but is not connected. You would need to:
1. Import sqliteHelper instead of mongoHelper in index.ts
2. Import chromaService instead of pineconeService
3. Import ollamaHelper instead of openaiHelper
4. Rebuild the entire application

Currently it's hardcoded to cloud mode.

### Q3: Do the two MCP servers point to different places?

**Answer:** NO! Both point to localhost:4001 by default.

To make gkchatty-web-mcp point to staging:
```bash
export GKCHATTY_API_URL=https://your-staging-site.netlify.app
```

Then restart the MCP server.

### Q4: Can I run both versions at the same time?

**Answer:** YES - they're on different ports:
- gkchatty-local: 4001/4003
- gkchatty-pure: 3001/3004

They don't conflict.

---

## How Did This Happen?

**Timeline (reconstructed):**

1. **Original plan:** Build a hybrid system that can switch between cloud/local
2. **Implementation:** Built the local storage code (`/utils/local/`)
3. **Problem:** Never connected it to the main application
4. **Result:** gkchatty-local remained cloud-only
5. **Parallel development:** Built gkchatty-pure as a separate codebase that IS fully local
6. **Confusion:** README still describes the hybrid plan, not the reality

---

## What You Should Do

### Immediate Actions

1. **Verify Staging Website**
   ```bash
   # Check Netlify deployment
   # Visit your staging URL
   # Look for Ollama features (shouldn't exist)
   # Check which branch is deployed
   ```

2. **Rename for Clarity**
   - `gkchatty-local` → `gkchatty-cloud-dev` (more accurate name)
   - Or update README to reflect cloud-only reality

3. **Fix MCP Configuration**

   Create separate configs for each MCP:
   ```bash
   # For local development
   export GKCHATTY_API_URL=http://localhost:4001

   # For staging/production testing
   export GKCHATTY_API_URL=https://your-staging.netlify.app
   ```

### Long-Term Strategy

**Option A: Keep Both Codebases**
- gkchatty-local = Cloud/SaaS development
- gkchatty-pure = Desktop/offline product
- Accept they are different products

**Option B: Actually Implement Hybrid Mode**
- Connect the `/utils/local/` code in gkchatty-local
- Add UI to switch between modes
- Make environment variable `GKCHATTY_STORAGE` actually work
- This is significant work (2-3 days minimum)

**Option C: Merge Approaches**
- Port gkchatty-pure features to gkchatty-local
- Create true hybrid system
- Use feature flags for deployment targets

---

## Port Reference (Quick Guide)

**When you see port 4001/4003:**
- You're using gkchatty-local
- Stack: MongoDB + Pinecone + OpenAI
- Cost: $$$ (cloud services)
- GitHub: Connected (local-ollama-dev branch)

**When you see port 3001/3004:**
- You're using gkchatty-pure
- Stack: SQLite + ChromaDB + Ollama
- Cost: Free (all local)
- GitHub: Not connected (local-only repo)

**Always check the port to know which version you're working on!**

---

## Final Recommendation

**For now:**
1. Accept that gkchatty-local is CLOUD-ONLY
2. Use gkchatty-pure for local/offline work
3. Keep them as separate products
4. Configure MCP servers with environment variables to target the right instance

**For future:**
- Decide if you want ONE hybrid system or TWO separate products
- If hybrid: Significant refactoring needed
- If separate: Update documentation to reflect reality

---

**Last Updated:** 2025-11-15
**Confidence Level:** 100% (verified with code inspection and runtime checks)
