# GKChatty Version Control Audit
**Date:** 2025-11-15
**Auditor:** Claude Code
**Status:** 🚨 CRITICAL - Version Mismatch Detected

## Executive Summary

**CRITICAL FINDING:** You have THREE different versions of GKChatty running with different configurations and purposes. This creates serious risk of working on the wrong codebase.

---

## Version Matrix

| Version | Location | Ports | Git Remote | Purpose | Status |
|---------|----------|-------|------------|---------|--------|
| **gkchatty-local** | `/gkchatty-ecosystem/gkchatty-local` | 4001 (API)<br>4003 (Web) | ✅ https://github.com/dmos82/gkchatty-local-v2.git | **Hybrid: Local + Cloud** | ⚠️ Local branch diverged |
| **gkchatty-pure** | `/gkchatty-pure` | 3001 (API)<br>3004 (Web) | ❌ No remote | **100% Local Only** | ✅ Independent dev |
| **GitHub Staging** | GitHub `origin/staging` | N/A | https://github.com/dmos82/gkchatty-local-v2.git | **Production/Staging Deploy** | ❓ Unknown deployment state |

---

## Version Details

### 1. gkchatty-local (Ports 4001/4003)

**Repository:**
```bash
Remote: https://github.com/dmos82/gkchatty-local-v2.git
Branch: local-ollama-dev (NOT main)
Status: DIVERGED from origin/main
```

**Package Info:**
- Name: `@gkchatty/backend`
- Description: "RAG platform with MongoDB, Pinecone, OpenAI"

**Architecture:** HYBRID (Supports both local and cloud)
- **Database:** MongoDB (cloud) OR SQLite (local mode)
- **Vector DB:** Pinecone (cloud) OR ChromaDB (local mode)
- **LLM:** OpenAI API (cloud) OR Ollama (local)
- **Embeddings:** OpenAI API OR Transformers.js

**Recent Commits:**
```
d201228 fix: Restore missing LLM Provider Configuration in gkchatty-local
78acef3 feat: Complete Ollama local LLM integration with RAG dual-mode support
108e5d1 fix: Add sourceType=user query param to My Docs tree fetch
96ca65b fix: Add missing SystemFolderModel to gkchatty-local/backend
```

**Key Features:**
- ✅ Ollama local LLM integration
- ✅ Dual-mode storage (local/cloud switchable via env var)
- ✅ Session management with activeSessionIds array
- ✅ Modern authentication flow

**Uncommitted Changes:**
- Deleted GKCHATTYLOCALBUILD backup directory files (safe to ignore)

---

### 2. gkchatty-pure (Ports 3001/3004)

**Repository:**
```bash
Remote: NONE (local-only git repo)
Branch: main (local)
Status: Independent development
```

**Package Info:**
- Name: `@gkchatty-pure/backend`
- Description: "100% Local RAG platform with SQLite, ChromaDB, Ollama"

**Architecture:** 100% LOCAL ONLY
- **Database:** SQLite ONLY
- **Vector DB:** ChromaDB ONLY
- **LLM:** Ollama ONLY (local models)
- **Embeddings:** Transformers.js ONLY
- **Storage:** Local filesystem

**Recent Commits:**
```
878aa23 feat: Add Phases 2 & 3 - Intelligent Model Router and Document Export
22dc5ae feat: Add intelligent model routing based on query complexity (Phase 2)
90f4baa feat: Add streaming test script for Phase 1 verification
df1cfca feat: Add frontend streaming support with SSE (Phase 1 complete)
```

**Key Features:**
- ✅ Zero cloud dependencies
- ✅ Offline-first architecture
- ✅ Model router (auto-selects Ollama model by query complexity)
- ✅ Document export (PDF, Markdown, TXT, HTML, DOCX)
- ✅ Streaming responses with SSE

---

### 3. GitHub Repository (origin/main)

**Last Deployment Commits (origin/main):**
```
4ae683f fix: Remove duplicate netlify.toml from subdirectory
ad17f93 fix: Update netlify.toml at repo root with correct build configuration
00eb84d fix: Update Netlify base directory and install command
9f4ea94 fix: Add pnpm workspace configuration for proper Netlify deployment
```

**Deployment Target:** Netlify (staging environment)

**Architecture:** Based on commit history, this appears to be the CLOUD version
- MongoDB Atlas + Pinecone + OpenAI

**Key Differences from local-ollama-dev:**
```diff
- Missing: Ollama integration (300 lines in ollamaHelper.ts)
- Missing: System folder controller (447 lines)
- Missing: System folder model (80 lines)
- Missing: Admin settings routes (151 lines)
- Different: Package dependencies (Ollama packages removed)
```

---

## Critical Questions Answered

### Q1: Is gkchatty-local the same as GitHub/staging?

**❌ NO** - Your local `gkchatty-local` on branch `local-ollama-dev` is **AHEAD** of `origin/main` by several Ollama-related commits. GitHub staging does NOT have:
- Ollama local LLM support
- System folder management
- Advanced admin settings

### Q2: Does gkchatty-local have local AND web service capability?

**✅ YES** - `gkchatty-local` is HYBRID and supports both modes:
- Set `GKCHATTY_STORAGE=local` → 100% local (SQLite + ChromaDB + Ollama)
- Set `GKCHATTY_STORAGE=cloud` → Cloud service (MongoDB + Pinecone + OpenAI)

### Q3: What's the difference between gkchatty-local and gkchatty-pure?

| Feature | gkchatty-local | gkchatty-pure |
|---------|----------------|---------------|
| **Mode** | Hybrid (switchable) | Local only |
| **GitHub** | ✅ Connected | ❌ No remote |
| **Cloud Deploy** | ✅ Possible | ❌ Never |
| **Use Case** | SaaS + On-prem | Desktop app |
| **Ollama** | ✅ Yes (new) | ✅ Yes (always) |
| **Port** | 4001/4003 | 3001/3004 |

---

## Risk Assessment

### 🔴 HIGH RISK: Accidental Deployment

**Problem:** If you push `local-ollama-dev` to `origin/main`, Netlify staging will break because:
- Ollama dependencies won't install on Netlify
- Local file paths will fail in cloud environment
- SQLite won't work on Netlify (ephemeral filesystem)

**Mitigation:**
1. NEVER merge `local-ollama-dev` to `main` without testing
2. Keep Ollama features in a separate branch
3. Use feature flags to disable local-only features in cloud deploys

### ⚠️ MEDIUM RISK: Working on Wrong Version

**Problem:** Easy to confuse which version you're working on:
- Both have similar file structure
- Both run on localhost (different ports)
- Both are named "gkchatty-local"

**Mitigation:**
1. Use terminal window titles with port numbers
2. Check `git remote -v` before making changes
3. Use different dev usernames (dev@local vs dev@pure)

### 🟡 LOW RISK: Lost Changes

**Problem:** gkchatty-pure has no remote backup

**Mitigation:**
- Consider creating a separate GitHub repo for gkchatty-pure
- Or use local git bundles for backup

---

## Recommended Action Plan

### Immediate Actions (Today)

1. **Verify Current State**
   ```bash
   # gkchatty-local
   cd /path/to/gkchatty-ecosystem/gkchatty-local
   git branch --show-current  # Should show: local-ollama-dev
   git status

   # gkchatty-pure
   cd /path/to/gkchatty-pure
   git log --oneline -1  # Latest commit
   ```

2. **Check Staging Website**
   - Visit your Netlify staging URL
   - Check if it has Ollama features (it shouldn't)
   - Verify it's using cloud storage (MongoDB + Pinecone)

3. **Label Terminal Windows**
   - gkchatty-local (4001/4003) - Hybrid - Git: local-ollama-dev
   - gkchatty-pure (3001/3004) - Local Only - No Remote

### Short-Term Actions (This Week)

4. **Create Branch Strategy**
   ```bash
   cd gkchatty-ecosystem/gkchatty-local

   # Option A: Keep local-ollama-dev as feature branch
   git checkout -b feature/ollama-integration
   git branch -D local-ollama-dev

   # Option B: Create production branch for cloud deploys
   git checkout main
   git checkout -b production
   git push -u origin production
   # Configure Netlify to deploy from 'production' branch
   ```

5. **Environment-Based Configuration**
   ```typescript
   // backend/src/config/deployment.ts
   export const isCloudDeployment = () => {
     return process.env.DEPLOYMENT_TARGET === 'netlify' ||
            process.env.DEPLOYMENT_TARGET === 'vercel';
   };

   export const isLocalDeployment = () => {
     return process.env.GKCHATTY_STORAGE === 'local';
   };
   ```

6. **Backup gkchatty-pure**
   ```bash
   cd /path/to/gkchatty-pure
   git bundle create ../gkchatty-pure-backup.bundle --all
   # OR create GitHub repo
   gh repo create dmos82/gkchatty-pure --private --source=.
   ```

### Long-Term Strategy

7. **Monorepo with Workspaces**
   Consider consolidating into one repo with multiple deployment targets:
   ```
   gkchatty/
   ├── packages/
   │   ├── backend-core/       # Shared business logic
   │   ├── backend-cloud/      # MongoDB + Pinecone + OpenAI
   │   ├── backend-local/      # SQLite + ChromaDB + Ollama
   │   ├── frontend/           # Shared React frontend
   │   └── shared/             # Types, constants
   ├── apps/
   │   ├── web-saas/           # Cloud deployment (Netlify)
   │   └── desktop/            # Electron app (local)
   └── package.json            # pnpm workspace
   ```

8. **Deployment Pipeline**
   ```yaml
   # .github/workflows/deploy-cloud.yml
   name: Deploy Cloud (Netlify)
   on:
     push:
       branches: [main, production]
   env:
     GKCHATTY_STORAGE: cloud

   # .github/workflows/build-desktop.yml
   name: Build Desktop App
   on:
     push:
       branches: [desktop, feature/ollama-*]
   env:
     GKCHATTY_STORAGE: local
   ```

---

## Version Control Strategy

### Branch Naming Convention

```
main                    → Production cloud deployment (Netlify/staging)
production              → Verified cloud release candidates
feature/ollama-*        → Local LLM features
feature/cloud-*         → Cloud-specific features
desktop/main            → Desktop app releases
local/dev               → Local development experiments
```

### Commit Message Convention

```
feat(cloud): Add Pinecone indexing
feat(local): Add Ollama streaming
fix(hybrid): Fix storage mode switching
docs(deploy): Update Netlify configuration
```

### Release Strategy

- **Cloud (SaaS):** Continuous deployment from `main`
- **Desktop (Local):** Tagged releases with Electron builds
- **Hybrid:** Feature flags to enable/disable features per deployment

---

## Environment Variables Reference

### gkchatty-local (Hybrid Mode)

```bash
# Core Settings
GKCHATTY_STORAGE=local|cloud        # Storage mode
PORT=4001
NODE_ENV=development|production

# Cloud Mode (GKCHATTY_STORAGE=cloud)
MONGODB_URI=mongodb+srv://...
PINECONE_API_KEY=...
PINECONE_ENVIRONMENT=us-east-1
PINECONE_INDEX_NAME=gkchatty-prod
OPENAI_API_KEY=sk-...

# Local Mode (GKCHATTY_STORAGE=local)
GKCHATTY_HOME=~/.gkchatty
OLLAMA_BASE_URL=http://localhost:11434
EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2
```

### gkchatty-pure (Always Local)

```bash
PORT=3001
NODE_ENV=development
GKCHATTY_HOME=~/.gkchatty
OLLAMA_BASE_URL=http://localhost:11434
# No cloud variables - would be ignored
```

---

## Testing Strategy

### Before Pushing to GitHub

```bash
# 1. Test cloud mode locally
export GKCHATTY_STORAGE=cloud
npm run dev
# Verify: MongoDB connects, Pinecone works, OpenAI responds

# 2. Test local mode
export GKCHATTY_STORAGE=local
npm run dev
# Verify: SQLite works, ChromaDB works, Ollama responds

# 3. Test build
npm run build
# Should succeed without errors

# 4. Run tests
npm test
```

### Deployment Verification

```bash
# After pushing to main
# 1. Check Netlify build logs
# 2. Verify staging site works
# 3. Test authentication flow
# 4. Test document upload
# 5. Test chat functionality
```

---

## Action Items Summary

- [ ] **Immediate:** Verify which version is on Netlify staging
- [ ] **Immediate:** Label terminal windows with version names
- [ ] **Today:** Decide on branch strategy (keep local-ollama-dev or rename)
- [ ] **This Week:** Test cloud mode deployment locally before pushing
- [ ] **This Week:** Backup gkchatty-pure (git bundle or GitHub repo)
- [ ] **This Week:** Add environment detection to prevent accidental cloud deploys of local features
- [ ] **This Month:** Consider monorepo migration for better code sharing
- [ ] **Ongoing:** Use commit prefixes to indicate deployment target (cloud/local/hybrid)

---

## Contacts for Questions

- **Development:** Review this document before starting work
- **Deployment:** Check branch and GKCHATTY_STORAGE before deploying
- **Debugging:** Check port number to identify which version has the issue

---

**Last Updated:** 2025-11-15
**Next Review:** When preparing for production release
