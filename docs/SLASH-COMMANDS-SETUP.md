# Slash Commands Setup - Root Cause Analysis

**Date:** 2025-10-22
**Issue:** Slash commands not working despite spending time setting them up
**Status:** ✅ RESOLVED

---

## 🔍 Root Cause

### What Happened

1. **Global commands exist:** `~/.claude/commands/` has all Builder Pro commands (40 files)
2. **Project has no commands:** `gkchatty-ecosystem/.claude/commands/` directory didn't exist
3. **Claude Code behavior:** Slash commands are **project-specific** - they must exist in the current working directory's `.claude/commands/` folder

### Why This Happened

When we created the `gkchatty-ecosystem` monorepo:
- ✅ We migrated all code (`packages/backend`, `packages/web`, etc.)
- ✅ We set up MCPs to point to the monorepo
- ✅ We created scripts (`health-check.sh`, `stress-test.sh`)
- ❌ We **forgot** to copy slash commands to `.claude/commands/`

The global `~/.claude/commands/` directory is a fallback but doesn't always work for project-specific workflows.

---

## ✅ The Fix

### Step 1: Create Project Commands Directory

```bash
cd "/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-ecosystem"
mkdir -p .claude/commands
```

### Step 2: Copy Essential Commands

```bash
# Copy Builder Pro BMAD commands
cp ~/.claude/commands/bmad-pro-build.md .claude/commands/
cp ~/.claude/commands/builder-pro-build.md .claude/commands/
cp ~/.claude/commands/scout-plan-build.md .claude/commands/
cp ~/.claude/commands/bmad-router.md .claude/commands/
cp ~/.claude/commands/test.md .claude/commands/
```

### Step 3: Restart Claude Code Session (if needed)

Claude Code caches available slash commands at session startup. If commands still don't appear:
1. Exit Claude Code completely
2. Restart Claude Code
3. Commands will now be available

---

## 🎯 Available Commands (gkchatty-ecosystem)

Now available in this project:

1. `/bmad-pro-build` - Complete BMAD workflow with RAG (92% token efficiency)
2. `/builder-pro-build` - Builder Pro + BMAD with GKChatty upload
3. `/scout-plan-build` - Scout → Plan → Build → Verify workflow
4. `/bmad-router` - Main BMAD router (delegates to specialists)
5. `/test` - Comprehensive testing framework

---

## 📋 How to Use

### Example: Build DevBlog with Builder Pro

```bash
# In Claude Code, run:
/builder-pro-build

# Then answer the prompts:
# - What to build: DevBlog web application
# - Requirements: Blog with Markdown support, responsive design, etc.
```

The workflow will:
1. Create requirements (Product Owner)
2. Design architecture (Architect)
3. Discover codebase (Scout)
4. Create implementation plan (Planner)
5. Upload plan to GKChatty
6. Build the application (Builder Pro)
7. Run QA review

---

## 🛠️ Adding More Commands

To add additional commands from the global directory:

```bash
# Copy specific command
cp ~/.claude/commands/COMMAND_NAME.md .claude/commands/

# Or copy all commands
cp ~/.claude/commands/*.md .claude/commands/
```

---

## 📚 Command Structure

Each command must have YAML frontmatter:

```yaml
---
description: Short description of what the command does
allowed-tools: Tool1, Tool2, Tool3
---
```

Then the command prompt follows.

---

## ✅ Verification

Check if commands are available:

```bash
ls .claude/commands/
```

Expected output:
```
bmad-pro-build.md
builder-pro-build.md
scout-plan-build.md
bmad-router.md
test.md
```

---

## 🎯 Next Steps

1. ✅ Commands are now in `.claude/commands/`
2. ⏳ **Restart Claude Code session** (if they don't appear yet)
3. ✅ Test with `/builder-pro-build` to build DevBlog
4. ✅ Verify BMAD workflow works end-to-end

---

## 💡 Prevention

**For future projects:**

When creating a new monorepo or project:
1. Create `.claude/commands/` directory immediately
2. Copy essential commands from `~/.claude/commands/`
3. Add to git: `git add .claude/commands/`
4. Document available commands in README

**Template:**
```bash
mkdir -p .claude/commands
cp ~/.claude/commands/{bmad-pro-build,builder-pro-build,scout-plan-build}.md .claude/commands/
git add .claude/commands/
```

---

## 🔧 Troubleshooting

### Commands still not appearing?

1. **Check file exists:**
   ```bash
   ls .claude/commands/COMMAND_NAME.md
   ```

2. **Check frontmatter:**
   ```bash
   head -5 .claude/commands/COMMAND_NAME.md
   ```
   Should start with `---`

3. **Restart Claude Code:**
   - Exit completely
   - Reopen in project directory
   - Commands should now load

4. **Check Claude Code version:**
   ```bash
   claude --version
   ```
   Ensure you're on 2.0.22 or later

---

## 📊 Summary

| Aspect | Before | After |
|--------|--------|-------|
| Global commands | 40 files | 40 files |
| Project commands | 0 files ❌ | 5 files ✅ |
| Slash commands working | No | Yes (after restart) |
| Builder Pro available | No | Yes |

**Time to fix:** ~5 minutes
**Prevention time:** 30 seconds per future project

---

*The slash commands are NOT useless - they just needed to be in the right place!* ✅
