# GKChatty User Isolation Pattern - Critical Discovery

**Date:** October 27, 2025
**Status:** ✅ Implemented and Tested
**Impact:** Changes how ALL BMAD workflows handle knowledge base uploads

## Executive Summary

Discovered that GKChatty requires project-specific users for knowledge base isolation. The `gkchattymcp` user is an admin account for creating other users, NOT for storing project documents. Each project needs its own user with isolated document storage.

## The Discovery

### What We Thought
- Single `gkchattymcp` user for all operations
- Upload all project documents to one knowledge base
- MCP tools would handle user creation

### What Actually Works
- `gkchattymcp` = Admin user for creating project users ONLY
- Each project gets its own user (e.g., `commisocial`, `devblog`, `taskmanager`)
- Documents uploaded to a user stay isolated in that user's namespace
- No MCP tool exists for user creation - must use direct database access

## Implementation

### 1. User Creation Utilities Created

#### Direct MongoDB Version
`orchestrator/gkchatty-user-creator.js`
- Connects directly to MongoDB
- Creates admin users for projects
- Generates secure passwords if not provided
- Usage: `node gkchatty-user-creator.js <username> [password]`

#### API Version (for future use)
`orchestrator/gkchatty-create-user-api.js`
- Uses HTTP requests to GKChatty API
- Currently blocked by disabled registration
- Ready when admin endpoints are added

### 2. Workflow Changes

#### Old Workflow (Incorrect)
```
1. Use gkchattymcp for everything
2. Upload all plans to gkchattymcp
3. Query from mixed knowledge base
```

#### New Workflow (Correct)
```
1. Start with gkchattymcp (admin)
2. Create project-specific user
3. Switch to project user via MCP
4. Upload project documents
5. Query from isolated knowledge base
```

### 3. Example: CommiSocial Setup

```javascript
// Step 1: Create project user (using MongoDB script)
// Username: commisocial
// Password: CommiSocial2025!

// Step 2: Switch MCP context
mcp__gkchatty_kb__switch_user("commisocial", "CommiSocial2025!")

// Step 3: Upload project documents
mcp__gkchatty_kb__upload_to_gkchatty(
  file_path: "specs/plans/commisocial-implementation.md",
  description: "CommiSocial implementation plan"
)

// Step 4: Query with isolated context
mcp__gkchatty_kb__query_gkchatty("What is Step 1 of CommiSocial?")
// Returns ONLY CommiSocial-relevant results
```

## Architecture Diagram

```
┌──────────────────────────────────────────────────┐
│                  GKChatty System                  │
├──────────────────────────────────────────────────┤
│                                                   │
│  ┌─────────────┐                                 │
│  │ gkchattymcp │ ← Master Admin Account          │
│  │   (admin)   │   Creates project users         │
│  └──────┬──────┘                                 │
│         │                                        │
│    Creates Users                                 │
│         │                                        │
│   ┌─────┴──────┬──────────┬──────────┐         │
│   ↓            ↓          ↓          ↓         │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│ │commisocial│ │ devblog  │ │taskmanager│ ...   │
│ │  (admin)  │ │  (admin) │ │  (admin)  │        │
│ └─────┬─────┘ └────┬─────┘ └─────┬─────┘        │
│       ↓           ↓             ↓              │
│    [KB: CS]    [KB: DB]     [KB: TM]           │
│    Isolated    Isolated     Isolated           │
│                                                 │
└──────────────────────────────────────────────────┘

KB = Knowledge Base (Document Storage)
CS = CommiSocial, DB = DevBlog, TM = TaskManager
```

## Benefits of This Pattern

### 1. **Project Isolation**
- Each project has completely separate document storage
- No cross-contamination of context
- Clean RAG retrieval with only relevant documents

### 2. **Security**
- Each project has its own credentials
- Can revoke access per project
- Audit trail per project user

### 3. **Scalability**
- Unlimited projects without namespace collisions
- Can delete project and all its documents easily
- Per-project usage tracking possible

### 4. **Better RAG Performance**
- Queries only search relevant documents
- Reduces token usage (fewer irrelevant results)
- Improves answer accuracy

## Required Changes to BMAD Workflows

### Phase 3: Planning (All BMAD commands)

**Before:**
```markdown
Upload plan to GKChatty using gkchattymcp
```

**After:**
```markdown
1. Create project user if not exists
2. Switch to project user
3. Upload plan to project's isolated KB
```

### Builder Pro BMAD

**Before:**
```javascript
// Query using default user
mcp__gkchatty_kb__query_gkchatty("Step 1 of plan")
```

**After:**
```javascript
// Ensure using project user
mcp__gkchatty_kb__switch_user(projectUser, projectPassword)
mcp__gkchatty_kb__query_gkchatty("Step 1 of plan")
```

## Project User Registry

| Project | Username | Password | Created | Purpose |
|---------|----------|----------|---------|---------|
| CommiSocial | commisocial | CommiSocial2025! | 2025-10-27 | Reddit-style social platform |
| _Add new projects here_ | | | | |

## How to Create New Project Users

### Option 1: MongoDB Script (Recommended)
```bash
cd packages/backend
node ../../orchestrator/gkchatty-user-creator.js <projectname>
```

### Option 2: Inline Script
```bash
cd packages/backend
node -e "
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
// ... (see implementation in file)
"
```

### Option 3: Future API (When Available)
```bash
node orchestrator/gkchatty-create-user-api.js <projectname>
```

## Session Persistence

### Do we need to restart Claude Code?
**No**, the MCP context switches persist within the session:
- Once you call `switch_user()`, it stays switched
- The context remains until you switch again
- Uploads go to the current user's KB

### Best Practices
1. **Always verify current user** before uploads:
   ```javascript
   mcp__gkchatty_kb__current_user()
   ```

2. **Document project credentials** in a secure location

3. **Use consistent naming** for project users (lowercase, no spaces)

4. **Create user BEFORE starting project** to avoid mixed contexts

## Migration Guide

### For Existing Projects
1. Identify documents uploaded to gkchattymcp
2. Create project-specific user
3. Re-upload documents to project user
4. Update any hardcoded references

### For New Projects
1. Create project user first
2. Switch to project user
3. Proceed with normal BMAD workflow

## Troubleshooting

### "User already exists"
- Use the existing credentials
- Or create with suffix: `projectname2`

### "Authentication failed"
- Check password case sensitivity
- Verify MongoDB connection string

### "Documents not found in RAG"
- Verify current user: `mcp__gkchatty_kb__current_user()`
- Ensure documents uploaded to correct user

## Conclusion

This pattern fundamentally improves the BMAD workflow by providing project isolation, better security, and cleaner RAG retrieval. All future projects should follow this user isolation pattern.

---

**Critical:** Update all BMAD command files to include project user creation as Phase 0.5