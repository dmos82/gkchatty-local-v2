# BMAD Workflow Update: User Isolation for Knowledge Base

**Date:** October 27, 2025
**Priority:** HIGH - Affects all BMAD commands
**Status:** Discovered and Documented

## Required Changes to BMAD Workflow

### New Phase 0.5: Project User Setup

This phase must be added to ALL BMAD commands between Requirements and Architecture:

```markdown
### PHASE 0.5: Project User Setup 🔐

**Purpose:** Create isolated knowledge base for this project

**Process:**
1. Generate project username from feature name
   - Example: "task-management" → "taskmanagement"
   - Lowercase, alphanumeric only

2. Check if project user exists:
   ```javascript
   mcp__gkchatty_kb__switch_user(projectUsername, projectPassword)
   ```

3. If authentication fails, create user:
   ```bash
   cd packages/backend
   node ../../orchestrator/gkchatty-user-creator.js [projectname]
   ```

4. Store credentials for session:
   - Username: [projectname]
   - Password: [generated or provided]

5. Switch MCP context to project user:
   ```javascript
   mcp__gkchatty_kb__switch_user(projectUsername, projectPassword)
   ```

**Output:**
- Project user created/verified
- MCP context switched to project user
- Ready for isolated document uploads
```

### Updated Phase 3: Planning

**Change Required:** Upload to project user, not gkchattymcp

```javascript
// OLD (Wrong)
mcp__gkchatty_kb__upload_to_gkchatty(file_path, description)

// NEW (Correct)
// Ensure we're using project user
mcp__gkchatty_kb__current_user() // Verify
mcp__gkchatty_kb__upload_to_gkchatty(file_path, description)
```

### Updated Phase 4: Builder Pro BMAD

**Change Required:** Query from project user context

```javascript
// At start of Builder phase
mcp__gkchatty_kb__switch_user(projectUsername, projectPassword)

// Then proceed with RAG queries
mcp__gkchatty_kb__query_gkchatty("What is Step 1?")
```

## Commands That Need Updates

### Priority 1 (Core BMAD)
- [ ] `/bmad-pro-build` - Main BMAD workflow
- [ ] `/bmad-router` - BMAD router
- [ ] `/builder-pro-build` - Builder Pro workflow
- [ ] `/scout-plan-build` - Scout → Plan → Build

### Priority 2 (Specialized)
- [ ] `/bmad-auto-phase` - Auto phase execution
- [ ] `/bmad-master-router` - Master router
- [ ] `/bmad-orchestrator-router` - Orchestrator router

### Priority 3 (Development Workflows)
- [ ] `/build` - Universal builder
- [ ] `/load` - Project loader
- [ ] `/task` - Task management

## Implementation Checklist

### For Each Command Update:

1. **Add Phase 0.5** between Requirements and Architecture
2. **Update Planning Phase** to verify user context
3. **Update Builder Phase** to use project user
4. **Add to command metadata**:
   ```yaml
   project-user-required: true
   knowledge-base-isolated: true
   ```

## Example Implementation

### Project Name Derivation
```javascript
function deriveProjectUsername(featureDescription) {
  // "Build a task management system with auth" → "taskmanagement"
  const keywords = featureDescription.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(' ')
    .filter(word => word.length > 3)
    .slice(0, 2)
    .join('');

  return keywords.substring(0, 20); // Max 20 chars
}
```

### Credential Storage (Session Only)
```javascript
// Store in orchestrator context
context.projectUser = {
  username: 'commisocial',
  password: 'CommiSocial2025!',
  created: new Date(),
  documentsUploaded: []
};
```

## Benefits After Implementation

1. **Clean RAG Context** - Each project queries only its own docs
2. **No Contamination** - Projects don't see each other's plans
3. **Better Security** - Per-project access control
4. **Easier Cleanup** - Delete user = delete all project docs
5. **Usage Tracking** - Can measure per-project token usage

## Rollout Plan

### Phase 1: Documentation (TODAY)
- [x] Document the pattern
- [x] Create user creation utilities
- [x] Test with CommiSocial

### Phase 2: Update Core Commands (THIS WEEK)
- [ ] Update `/bmad-pro-build`
- [ ] Update `/builder-pro-build`
- [ ] Test with new project

### Phase 3: Update All Commands (NEXT WEEK)
- [ ] Update remaining commands
- [ ] Create automated tests
- [ ] Update documentation

## Breaking Change Notice

⚠️ **This is a breaking change for existing workflows**

Projects using the old pattern (everything in gkchattymcp) will need to:
1. Create project-specific users
2. Re-upload their documents
3. Update any hardcoded references

## Questions to Resolve

1. **Should we auto-generate passwords or prompt user?**
   - Current: Auto-generate secure passwords
   - Alternative: Prompt for password

2. **Should project users be admin or regular users?**
   - Current: Admin (full access to their KB)
   - Alternative: Regular user with limited permissions

3. **How to handle user deletion/cleanup?**
   - Manual cleanup via MongoDB
   - Future: API endpoint for user management

## Conclusion

This user isolation pattern is a critical improvement that should be implemented across all BMAD workflows. It provides better security, cleaner context, and improved RAG performance.

---

**Next Step:** Update `/bmad-pro-build` command with Phase 0.5