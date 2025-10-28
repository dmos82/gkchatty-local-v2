# BMAD Complete Guide
## Builder Master Agentic Development - Production Workflow System

**Version:** 2.0 (Post-Optimization)
**Last Updated:** 2025-10-28
**Status:** ✅ Production Ready

---

## Table of Contents

1. [Overview](#overview)
2. [When to Use BMAD](#when-to-use-bmad)
3. [Workflow Phases](#workflow-phases)
4. [GKChatty Integration](#gkchatty-integration)
5. [MCP Tools](#mcp-tools)
6. [Validation Workflow](#validation-workflow)
7. [Configuration](#configuration)
8. [Examples](#examples)
9. [Troubleshooting](#troubleshooting)
10. [Optimization History](#optimization-history)

---

## Overview

### What is BMAD?

BMAD (Builder Master Agentic Development) is a complete Software Development Life Cycle (SDLC) automation system that transforms feature requests into production-ready code through orchestrated AI agents.

**Key Characteristics:**
- **6 Phases**: Requirements → Architecture → Discovery → Planning → Implementation → QA
- **92% Token Efficiency**: RAG pattern queries GKChatty step-by-step (2K per step vs 50K full plan)
- **Sub-second Queries**: Fast RAG retrieval from knowledge base
- **3-Iteration Error Recovery**: Automatic retry with historical pattern search
- **Mandatory User Approval**: Cannot mark complete without validation

### Architecture

```
┌─────────────┐   ┌─────────────┐   ┌─────────┐   ┌─────────┐   ┌──────────────────┐   ┌──────────┐
│ REQUIREMENTS│──>│ ARCHITECTURE│──>│  SCOUT  │──>│ PLANNER │──>│ BUILDER-PRO-BMAD │──>│ QA VERIFY│
│   (PO/BA)   │   │  (Architect)│   │         │   │         │   │   (RAG Pattern)  │   │   (QA)   │
└─────────────┘   └─────────────┘   └─────────┘   └─────────┘   └──────────────────┘   └──────────┘
      │                  │                │              │                   │                  │
      ↓                  ↓                ↓              ↓                   ↓                  ↓
 User Story        System Design     File Discovery  Implementation    RAG Query → Execute   Quality Gate
 Acceptance       API Contracts      + GKChatty       Plan            → Test → Query      + Security
 Criteria         Tech Decisions     + Context      + Upload KB       → Repeat (2K/step)  + E2E Tests
```

### Why BMAD?

**Problems Solved:**
- ❌ Manual implementation wastes tokens reading full specs repeatedly
- ❌ No standardized workflow leads to inconsistent quality
- ❌ Features marked "complete" without testing
- ❌ Cross-project knowledge contamination in RAG queries

**BMAD Solutions:**
- ✅ RAG pattern: Query only what you need, when you need it
- ✅ Standardized 6-phase workflow with automatic QA
- ✅ Mandatory validation before completion
- ✅ Project-specific GKChatty users for knowledge isolation

---

## When to Use BMAD

### Decision Matrix

| Factor | Manual Implementation | `/bmad-pro-build` |
|--------|----------------------|-------------------|
| **Time Estimate** | < 1 hour | 1+ hours |
| **User Stories** | 1-2 simple | 3+ OR complex |
| **Documentation** | None needed | Requirements + Architecture + Plan |
| **Architecture** | No formal design | Yes (system design required) |
| **Components** | 1-2 files | 3+ files/tables/services |
| **Security** | Basic | Enterprise (RBAC, MFA, audit logs) |
| **RAG Needed** | No | Yes (step-by-step GKChatty queries) |

### Quick Decision Rules

1. **Estimate complexity:**
   - < 1 hour → Do it manually (no workflow overhead)
   - 1+ hours → Use `/bmad-pro-build`

2. **Check for enterprise signals:**
   - Keywords: RBAC, audit logs, MFA, compliance, multi-tenant
   - If present → Use `/bmad-pro-build`

3. **Count user stories:**
   - 1-2 simple user stories → Consider manual
   - 3+ user stories OR complex stories → Use `/bmad-pro-build`

4. **When in doubt:**
   - ASK THE USER: "This looks like [X-hour task]. Should I use BMAD?"
   - Better to confirm than choose wrong approach

### Keywords That Trigger BMAD

- "admin panel" / "user management system"
- "RBAC" / "role-based access"
- "audit logging" / "compliance"
- "enterprise" / "multi-tenant"
- "with authentication, authorization, and..."
- Multiple complex features in one request

### Examples

**✅ Use BMAD for:**
- "Build admin user management with RBAC, audit logs, password reset"
- "Create a complete blog platform with auth, posts, comments, voting"
- "Build a payment system with Stripe integration and refund handling"
- "Implement real-time chat system with WebSockets and presence"
- "Create user profile page with avatar upload, editing, privacy settings"

**❌ Don't use BMAD for:**
- "Fix the typo in the header" (< 5 min)
- "Add a dark mode toggle button" (< 30 min)
- "Update the README with new instructions" (< 15 min)
- "Build a simple signup form with email validation" (< 30 min)
- "Add a search bar with autocomplete" (< 45 min)

**Never:**
- Use BMAD for simple one-file features (token waste)
- Skip user confirmation when complexity is ambiguous
- Assume BMAD is always needed (manual is often faster)

---

## Workflow Phases

### Phase 0: Requirements Engineering 📝

**Specialist:** Product Owner (via `general-purpose` subagent)

**Purpose:** Transform user request into formal requirements

**Process:**
1. Invoke Product Owner agent with user request
2. Agent returns JSON with requirements artifact
3. YOU (orchestrator) parse JSON output
4. YOU write requirements to `specs/user-stories/[date]-[story-name].md`

**Agent Prompt Must Include:**
```
CRITICAL: Return ONLY valid JSON with this structure:
{
  "status": "success",
  "phase": "requirements",
  "outputs": {
    "user_stories": [...],
    "acceptance_criteria": [...],
    "scope": "MVP",
    "constraints": [...]
  },
  "artifacts": [{
    "name": "requirements.md",
    "content": "# Full requirements document...",
    "type": "file"
  }]
}
```

**Output:**
- User story document with:
  - Title and description
  - Acceptance criteria (testable)
  - Success metrics
  - Constraints and assumptions
- Saved to: `specs/user-stories/[date]-[story-name].md`

**Example:**
```markdown
# User Story: Admin User Management System

## Summary
As a system administrator, I want to manage users so that I can control access and maintain security.

## Acceptance Criteria
- [ ] Admin can view list of all users
- [ ] Admin can create new users
- [ ] Admin can edit user details
- [ ] Admin can delete users
- [ ] Admin can assign/revoke admin privileges
- [ ] Audit log tracks all admin actions

## Success Metrics
- All CRUD operations work correctly
- Audit logs capture every action
- Only admins can access admin panel
```

---

### Phase 1: Architecture Design 🏗️

**Specialist:** Architect (via `general-purpose` subagent)

**Purpose:** Design system architecture and technology choices

**Process:**
1. Invoke Architect agent with requirements
2. Agent returns JSON with architecture artifact
3. YOU parse JSON output
4. YOU write architecture to `specs/architecture/[date]-[story-name].md`

**Agent Prompt Must Include:**
```
CRITICAL: Return ONLY valid JSON with architecture decisions and artifacts.
Include components, technologies, patterns, and complete architecture document.
```

**Output:**
- System architecture document with:
  - Component diagram
  - Technology stack decisions
  - API specifications
  - Database schema
  - Security architecture
  - Deployment strategy
- Saved to: `specs/architecture/[date]-[story-name].md`

**Example:**
```markdown
# Architecture: Admin User Management System

## Technology Stack
- **Framework:** Next.js 15 (App Router)
- **Database:** PostgreSQL (Supabase)
- **Auth:** Supabase Auth + RLS policies
- **UI:** Tailwind CSS + shadcn/ui

## Components
1. **Admin Layout** - `/app/admin/layout.tsx`
   - Auth guard (admin role required)
   - Navigation sidebar

2. **User List Page** - `/app/admin/users/page.tsx`
   - Server component with Supabase query
   - Search/filter functionality
   - Pagination

3. **User Edit Page** - `/app/admin/users/[userId]/page.tsx`
   - Form with validation
   - Update API route

4. **API Routes**
   - `POST /api/admin/users` - Create user
   - `PATCH /api/admin/users/[id]` - Update user
   - `DELETE /api/admin/users/[id]` - Delete user

## Database Schema
```sql
-- profiles table (extends auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  username TEXT UNIQUE,
  role TEXT DEFAULT 'user', -- 'user' | 'admin' | 'super_admin'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- audit_logs table
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id UUID REFERENCES profiles(id),
  action TEXT, -- 'create_user', 'update_user', 'delete_user'
  target_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Security
- **RLS Policies:** Only admins can access admin routes
- **Audit Logging:** Track all admin actions
- **CSRF Protection:** Next.js built-in
- **SQL Injection:** Supabase parameterized queries
```

---

### Phase 2: Discovery 🔍

**Specialist:** Scout (via `scout` subagent)

**Purpose:** Discover relevant code and historical context

**Process:**
1. Search GKChatty for historical context (similar features)
2. Discover relevant files in codebase (Glob + Grep)
3. Identify entry points and dependencies
4. Analyze existing patterns
5. Create structured discovery report (JSON)

**Output:**
- JSON discovery report with:
  - **Historical context** from GKChatty (similar implementations)
  - **Relevant files** (prioritized by relevance)
  - **Entry points** (where to start implementing)
  - **Dependencies** (what needs to be created/modified)
  - **Recommendations** (best practices to follow)

**Example:**
```json
{
  "historical_context": {
    "similar_features": [
      "Post management admin panel (2025-10-20)",
      "User authentication system (2025-10-15)"
    ],
    "patterns": [
      "Use Supabase RLS for admin auth",
      "Create audit_logs table for tracking",
      "Use shadcn/ui Table component for lists"
    ]
  },
  "relevant_files": [
    "app/admin/layout.tsx (modify: add admin check)",
    "lib/supabase/client.ts (reference for queries)",
    "types/database.ts (add new types)"
  ],
  "entry_points": [
    "Create app/admin/users/page.tsx",
    "Create API routes in app/api/admin/"
  ],
  "recommendations": [
    "Follow existing admin panel structure",
    "Reuse authentication helpers",
    "Add comprehensive tests"
  ]
}
```

---

### Phase 3: Planning 📋

**Specialist:** Planner (via `planner` subagent)

**Purpose:** Create detailed implementation plan

**CRITICAL ORCHESTRATION NOTE:**
Sub-agents CANNOT write files or use MCP tools. The Planner returns JSON, and YOU (the orchestrator) handle all I/O operations.

**Process:**
1. Invoke Planner agent with context from Phases 0-2
2. **Planner returns JSON** with plan content
3. **YOU parse the JSON output**
4. **YOU write plan to** `specs/plans/[date]-[story-name].md`
5. **YOU upload to GKChatty using MCP tools**

**Orchestration Steps:**
```javascript
// 1. Invoke Planner
Task(subagent_type: "planner", prompt: "Create implementation plan...")

// 2. Parse JSON response
const plan = JSON.parse(response);
const planContent = plan.artifacts[0].content;

// 3. Write plan to disk
Write(file_path: "specs/plans/...", content: planContent)

// 4. Upload to GKChatty
// CRITICAL: Use project-specific user (see .bmad/project-config.yml)
// Example: commisocial → user: "commisocial", password: "commisocial123!"
mcp__gkchatty_kb__switch_user(username: "[PROJECT_NAME]", password: "[PROJECT_NAME]123!")
mcp__gkchatty_kb__upload_to_gkchatty(file_path: "...", description: "...")
```

**Output:**
- Implementation plan: `specs/plans/[date]-[story-name].md`
- Plan uploaded to GKChatty knowledge base
- Confirmation: "Plan formalized and uploaded"

**Plan Structure:**
```markdown
# Implementation Plan: Admin User Management

## Overview
18 tasks, estimated 42 hours

## Task Breakdown

### Task 1: Database Schema
**File:** `supabase/migrations/001_admin_user_management.sql`
**Estimate:** 2 hours
**Dependencies:** None
**Steps:**
1. Create profiles table extension
2. Add role column
3. Create audit_logs table
4. Add RLS policies
5. Add indexes

### Task 2: Type Definitions
**File:** `types/database.ts`
**Estimate:** 1 hour
**Dependencies:** Task 1
**Steps:**
1. Add Profile type
2. Add AuditLog type
3. Export from index

... (16 more tasks)

## Testing Plan
1. Unit tests for API routes
2. Integration tests for user flows
3. E2E tests with Playwright

## Rollback Plan
If deployment fails:
1. Revert database migrations
2. Restore previous code
3. Check audit logs for data integrity
```

---

### Phase 4: Implementation (Builder Pro BMAD) 🔨 ⭐ **RAG PATTERN**

**Specialist:** Builder Pro BMAD (via `builder-pro-bmad` subagent)

**IMPORTANT:** Due to Claude Code MCP + Task tool limitation, Builder Pro BMAD will be executed in main session (not as sub-agent). This is normal and works perfectly.

**RAG Workflow:**

#### Step 1: Verify Plan Exists in GKChatty
```javascript
Query: "Implementation plan for [feature]"
If not found → STOP and report error
```

#### Step 2: Execute Plan Using Step-by-Step RAG Queries

```
Loop until plan complete:
  1. Query GKChatty: "What is step [X] of [feature] plan?"
     → Token usage: ~2K per query (vs 50K reading full plan)
     → Retrieval time: < 1 second

  2. Execute ONLY that step:
     - Create/modify files as specified
     - Follow exact specifications from query result
     - Apply best practices from historical context

  3. Test the step:
     - Run relevant tests (unit/integration)
     - Verify TypeScript compilation
     - Check for runtime errors
     - Validate against acceptance criteria

  4. If step succeeds:
     → Mark step complete
     → Query for next step (go to 1)

  5. If step fails:
     → Enter error recovery (Step 3)
```

#### Step 3: Error Recovery (3-Iteration Loop)

**Iteration 1: RAG Self-Recovery**
```
- Query GKChatty: "How to resolve [error] in [feature]?"
- Apply solution from knowledge base
- Retry the failed step
- If success → Continue to next step
- If failure → Iteration 2
```

**Iteration 2: Pattern Search**
```
- Query GKChatty: "How was [similar problem] solved in past?"
- Apply historical pattern
- Retry the failed step
- If success → Continue to next step
- If failure → Iteration 3
```

**Iteration 3: Stop and Report Blocker**
```
- STOP execution
- Report to user with detailed analysis:
  * What step failed
  * What errors occurred
  * What recovery attempts were made
  * What manual intervention is needed
- Await user guidance
```

#### Step 4: Progress Tracking

After EACH successful step:
```
- Upload progress update to GKChatty
- Report to user:
  ✅ Step [X] complete: [description]
  📄 Files modified: [list]
  🧪 Tests: [status]
  ⏭️  Next: [next step]
```

#### Step 5: Completion

When all steps complete:
```
1. Final validation:
   - Run full test suite
   - Verify TypeScript compilation
   - Check for console errors
   - Validate against all acceptance criteria

2. Upload completion report to GKChatty

3. Report to user:
   ✅ Implementation complete!
   - Steps completed: [X/X]
   - Files created/modified: [count]
   - Tests passing: [count/count]
   - Ready for QA phase
```

**Performance Metrics:**
- **Token usage:** ~2K per step (vs 50K full plan read)
- **Query speed:** < 1 second per RAG query
- **Error recovery:** Up to 3 iterations before user escalation
- **Token efficiency:** 92% reduction vs October version

**Example RAG Query Session:**
```
Query 1: "What is step 1 of admin user management plan?"
Response: "Create database migration file..."
[Execute step 1, test passes]

Query 2: "What is step 2 of admin user management plan?"
Response: "Add type definitions in types/database.ts..."
[Execute step 2, test passes]

... (16 more queries)

Query 18: "What is step 18 of admin user management plan?"
Response: "Final integration test..."
[Execute step 18, all tests pass]

Result: Implementation complete! ✅
```

---

### Phase 5: QA Review & Validation 🔬

**Specialist:** QA Architect + Builder Pro MCP Validation

**CRITICAL:** This phase runs the complete 7-phase validation workflow from CLAUDE.md.
**YOU CANNOT mark a project complete without completing this phase and getting user approval.**

#### Step 5.1: Phase 2 - Comprehensive Testing 📸

**Run all 3 sub-phases:**

##### Phase 2A: Visual Load Testing ✅

Test that every page loads without errors:

```javascript
// Test all major routes
const routes = ['/admin', '/admin/users', '/admin/audit-logs', '/admin/settings'];

for (const route of routes) {
  await mcp__builder-pro-mcp__test_ui({
    url: `http://localhost:3000${route}`,
    screenshotPath: `docs/screenshots/phase5-load-${route.replace(/\//g, '-')}.png`,
    actions: [{type: "screenshot"}]
  });
}
```

**Verify:**
- HTTP 200 responses (no 404s)
- Page titles present
- No server console errors
- Content renders

##### Phase 2B: Interactive Testing ⭐ MANDATORY

Test forms, buttons, and user interactions:

```javascript
// Example: Test admin user edit form
await mcp__builder-pro-mcp__test_ui({
  url: "http://localhost:3000/admin/users/[userId]",
  screenshotPath: "docs/screenshots/phase5-user-edit.png",
  actions: [
    {type: "screenshot"},  // Before
    {type: "type", selector: "#username", text: "newusername"},
    {type: "type", selector: "#email", text: "newemail@example.com"},
    {type: "click", selector: "button:has-text('Save')"},
    {type: "screenshot"}   // After
  ]
});

// CRITICAL CHECKS After Form Submission:
// 1. Console Errors: Check action results for console errors
// 2. URL Changed: Did page redirect? Or error message appeared?
// 3. Network Requests: Were API calls made? Did they succeed?
// 4. Error Messages: Are there error messages on page?
```

**Test ALL:**
- Forms (signup, login, create/edit)
- Buttons (submit, delete, cancel)
- Links (navigation, external)
- Interactions (vote, like, comment)

##### Phase 2C: User Flow Testing ⭐ MANDATORY

Run smoke test suites for complete user journeys:

```bash
node scripts/run-smoke-tests.js admin-full
# Must pass: All critical flows work end-to-end
```

**Required Flows:**
1. **Complete Auth Flow:** Signup → Feed → Logout → Login
2. **Main Feature Flow:** Create item → View → Edit → Delete
3. **Navigation Flow:** Test all navigation paths work

#### Step 5.2: Phase 3 - orchestrate_build (Automatic) 🤖

```javascript
const buildResults = await mcp__builder-pro-mcp__orchestrate_build({
  projectPath: process.cwd(),
  config: {
    frontend: { url: "http://localhost:3000" },
    backend: { url: null } // if applicable
  },
  autoFix: false,  // Validation only (no auto-fix in Phase 5)
  maxIterations: 1,
  stopOnCritical: true
});
```

**This runs:**
- Phase 1: Detect missing dependencies
- Phase 2: Run visual smoke test (Playwright)
- Phase 3: Validate config file consistency
- Phase 4: Scan busy ports and allocate
- Phase 5: Categorize bugs by severity + generate report

#### Step 5.3: Phases 4-6 - Iterative Fixing (Max 3 iterations)

```javascript
let iteration = 1;
const MAX_ITERATIONS = 3;

while (iteration <= MAX_ITERATIONS) {
  // Run validation
  const results = await runValidation();

  if (results.critical === 0 && results.high === 0) {
    break; // All critical/high issues resolved
  }

  // Apply fixes
  await applyFixes(results);

  // Re-run tests
  await runTests();

  iteration++;
}

if (iteration > MAX_ITERATIONS) {
  console.log('⚠️ Max iterations reached. Manual intervention required.');
  // Present issues to user for manual fix
}
```

#### Step 5.4: Generate QA Report

Create: `docs/validation/phase5-qa-report-[timestamp].md`

**Include:**
- Playwright test results (all 3 sub-phases)
- orchestrate_build results
- Smoke test results
- Bug summary (found, fixed, remaining)
- Security scan results
- Screenshots (all captured during testing)
- Final pass/fail status

#### Step 5.5: Phase 7 - User Approval Gate 🚦 **MANDATORY**

**CRITICAL:** Cannot proceed without user approval.

**Present to user:**

```markdown
## 🎯 BMAD Phase 5 Complete - Ready for User Approval

**Feature:** [Feature Name]
**Date:** [timestamp]
**Iterations:** [X/3]

### Validation Results:

✅ **Phase 2A: Visual Load Testing**
   - Pages tested: [X/X]
   - All pages load successfully
   - No 404 errors

✅ **Phase 2B: Interactive Testing**
   - Forms tested: [X/X]
   - Buttons tested: [X/X]
   - All interactions work correctly

✅ **Phase 2C: User Flow Testing**
   - Smoke tests: PASS ([X]%)
   - Critical flows: All working

✅ **Phase 3: orchestrate_build**
   - Critical bugs: 0
   - High-priority bugs: 0
   - Medium bugs: [X] (documented)

### Screenshots:
- docs/screenshots/phase5-*.png ([X] screenshots)

### Reports:
- docs/validation/phase5-qa-report-[timestamp].md
- docs/validation/orchestrate-build-results.json
- docs/validation/smoke-test-results.json

### Bugs Fixed:
1. [Bug 1 description] ✅
2. [Bug 2 description] ✅

### Remaining Issues:
- [Medium issue 1] - Documented, not blocking
- [Medium issue 2] - Documented, not blocking

---

**🚦 APPROVAL REQUIRED**

Type "approve" to mark implementation complete, or provide feedback.
```

**Wait for user response before proceeding.**

---

## GKChatty Integration

### User Isolation Rules (CRITICAL)

**RULE:** All project documents MUST be uploaded to the project-specific user.

**Pattern:**
- Project: `commisocial` → User: `commisocial` / `commisocial123!`
- Project: `devblog` → User: `devblog` / `devblog123!`
- Project: `ecommerce` → User: `ecommerce` / `ecommerce123!`

**Exception - "dev" user is ONLY for:**
1. Meta-work about the build system itself (BMAD improvements, MCP testing)
2. Standalone GKChatty usage (not tied to a project)
3. Tool testing and validation

**CRITICAL:** Project code MUST use project-specific users.

### Before ANY Upload to GKChatty:

```javascript
// 1. Check .bmad/project-config.yml for gkchatty.user
const projectUser = readConfig().gkchatty.user; // e.g., "commisocial"

// 2. Switch to project user
mcp__gkchatty-kb__switch_user({
  username: projectUser,
  password: `${projectUser}123!`
});

// 3. Verify current user
const currentUser = mcp__gkchatty-kb__current_user();
console.log(`Current user: ${currentUser}`); // "commisocial"

// 4. THEN upload documents
mcp__gkchatty-kb__upload_to_gkchatty({
  file_path: "specs/plans/2025-10-28-admin-user-management.md",
  description: "Implementation plan for admin user management system"
});
```

**NEVER:**
- Upload project docs to "dev" user (breaks isolation)
- Upload to "gkchattymcp" (deprecated user)
- Skip user verification before upload

**This ensures:**
- **Knowledge isolation** - Each project has own namespace
- **RAG accuracy** - Queries only return relevant context
- **Multi-project support** - No cross-contamination between projects

### RAG Query Patterns

**Good Queries:**
```
"What is step 5 of the admin user management plan?"
"How to resolve TypeScript error in profiles table?"
"What authentication pattern was used in the blog feature?"
```

**Bad Queries:**
```
"Tell me everything about the project" (too broad)
"What's in the plan?" (not specific enough)
"How do I code?" (not contextual)
```

---

## MCP Tools

### Available Tools (6/11 Tested ✅)

#### Code Quality
1. **`mcp__builder-pro-mcp__review_file`** ✅
   - Comprehensive code review with ESLint
   - Returns: `{summary, critical, warnings, suggestions}`
   - Usage: `review_file({filePath: "/path/to/file.js"})`

2. **`mcp__builder-pro-mcp__review_code`** ⏳
   - Inline code review (similar to review_file)
   - Status: Untested (redundant with review_file)

3. **`mcp__builder-pro-mcp__auto_fix`** ⏳
   - Automatically fix ESLint/TypeScript issues
   - Status: Untested (nice-to-have)

#### Security
4. **`mcp__builder-pro-mcp__security_scan`** ✅
   - OWASP compliance scanning
   - Detects: SQL injection, XSS, insecure auth, etc.
   - Usage: `security_scan({code: "...", filePath: "/path"})`

#### Validation
5. **`mcp__builder-pro-mcp__validate_configs`** ⏳
   - Config file consistency checks
   - Status: Untested (nice-to-have)

6. **`mcp__builder-pro-mcp__orchestrate_build`** ✅
   - Complete project validation
   - Runs all 5 validation phases
   - Returns: Comprehensive bug report categorized by severity
   - Usage: `orchestrate_build({projectPath: "...", config: {...}})`

#### Infrastructure
7. **`mcp__builder-pro-mcp__manage_ports`** ⏳
   - Port allocation and conflict resolution
   - Status: Untested (nice-to-have)

8. **`mcp__builder-pro-mcp__detect_dependencies`** ⏳
   - Missing dependency detection
   - Status: Untested (nice-to-have)

#### Testing
9. **`mcp__builder-pro-mcp__test_ui`** ✅
   - Playwright UI testing
   - Captures screenshots, tests interactions
   - Detects console errors, blank pages
   - Usage: `test_ui({url: "...", actions: [...]})`

#### GKChatty
10. **`mcp__gkchatty-kb__switch_user`** ✅
    - Switch GKChatty user for project isolation
    - Usage: `switch_user({username: "commisocial", password: "..."})`

11. **`mcp__gkchatty-kb__upload_to_gkchatty`** ✅
    - Upload documents to knowledge base
    - Usage: `upload_to_gkchatty({file_path: "...", description: "..."})`

### Tool Status Summary

| Category | Count | Percentage |
|----------|-------|------------|
| ✅ Tested & Working | 6/11 | 55% |
| ⏳ Untested | 5/11 | 45% |
| ❌ Failed | 0/11 | 0% |

**All critical tools are functional and tested ✅**

For detailed status, see: [MCP-TOOLS-STATUS.md](MCP-TOOLS-STATUS.md)

---

## Validation Workflow

### The 7-Phase Validation Workflow

See [CLAUDE.md lines 167-289] for complete details.

**Summary:**

1. **Phase 1:** Implementation Complete ✅
   - All features implemented
   - TypeScript compiles
   - Dev server runs with no errors

2. **Phase 2:** Comprehensive Testing 📸 (MANDATORY)
   - **2A:** Visual load testing (all pages)
   - **2B:** Interactive testing (forms, buttons) ⭐
   - **2C:** User flow testing (smoke tests) ⭐

3. **Phase 3:** orchestrate_build (Automatic) 🤖
   - Full project validation
   - Bug categorization
   - Missing dependency detection

4. **Phase 4:** Apply Manual Fixes 🔧
   - Fix critical bugs
   - Fix high-priority bugs
   - Address medium issues if time permits

5. **Phase 5:** Re-run Playwright Tests 🔄 (MANDATORY)
   - Verify bugs are fixed
   - Check for new regressions
   - Update test report

6. **Phase 6:** Evaluate Results 📊
   - All tests pass → Proceed to Phase 7
   - Issues found → Loop back to Phase 3 (max 3x)

7. **Phase 7:** Present to User 👤 (MANDATORY)
   - Show all test results + screenshots
   - Request user approval
   - **ONLY AFTER APPROVAL:** Mark project complete

### Enforcement Rules

**You CANNOT mark a project as complete without:**
- ✅ Phase 2 comprehensive Playwright tests completed
- ✅ Phase 3 orchestrate_build executed
- ✅ Phase 5 re-testing completed
- ✅ All critical bugs fixed
- ✅ All high-priority bugs fixed
- ✅ Test report generated
- ✅ Bug report generated
- ✅ Screenshots captured (minimum 10)
- ✅ User approval received

**Rule:** Implementation complete ≠ MVP complete. Validation is required.

---

## Configuration

### Project Configuration Template

Every BMAD project should have `.bmad/project-config.yml`:

```yaml
# BMAD Project Configuration
# Created: YYYY-MM-DD

project:
  name: your-project-name
  description: "Brief project description"
  type: nextjs-supabase  # or: react-vite, node-express, etc.
  version: "1.0.0"
  created: "YYYY-MM-DD"

# GKChatty Knowledge Base Configuration
gkchatty:
  user: your-project-name  # MUST match project name
  password: your-project-name123!
  namespace: your-project-name
  enforce_project_user: true
  block_dev_user_uploads: true  # Enforce project-specific user
  note: "All project documents use 'your-project-name' user for knowledge isolation."

# Tech Stack
tech_stack:
  framework: Next.js 15
  ui: React 19
  styling: Tailwind CSS + shadcn/ui
  database: PostgreSQL (Supabase)
  auth: Supabase Auth
  deployment: Vercel

# Validation Settings
validation:
  require_tests: true
  require_type_check: true
  require_lint: true
  require_build: true
  playwright_tests: true
  orchestrate_build: true

# Development
development:
  port: 3000
  hot_reload: true
  strict_mode: true

# Workflow Settings
workflows:
  preferred: bmad-pro-build
  auto_validation: true
  auto_commit: false  # Require user approval
  auto_push: false    # Require user approval

# Current Phase (updated as workflow progresses)
current_phase:
  bmad_workflow: "Phase 0 - Not Started"
  next_step: "Run /bmad-pro-build to begin"

# Project Contacts
contacts:
  owner: your-username
  developers:
    - SuperClaude (AI)
  reviewers:
    - your-username

# Notes
notes: |
  Additional project-specific notes, constraints, or context.
```

### Environment Variables

No environment variables are required for BMAD workflow itself. Project-specific env vars (API keys, database URLs, etc.) should be documented in the project's README.

---

## Examples

### Example 1: Admin User Management System

**User Request:**
```
/bmad-pro-build "Add admin user management system with RBAC, audit logs, and password reset"
```

**What Happens:**

1. **Phase 0 - Requirements (2 min):**
   - PO creates 8 user stories
   - Output: `specs/user-stories/2025-10-28-admin-user-management.md`

2. **Phase 1 - Architecture (5 min):**
   - Architect designs system
   - Output: `specs/architecture/2025-10-28-admin-user-management.md` (3,350 lines)

3. **Phase 2 - Discovery (3 min):**
   - Scout analyzes codebase
   - Finds existing auth patterns, admin layout
   - Output: JSON discovery report

4. **Phase 3 - Planning (10 min):**
   - Planner creates 18-task implementation plan (42 hours estimated)
   - Uploads to GKChatty
   - Output: `specs/plans/2025-10-28-admin-user-management.md`

5. **Phase 4 - Implementation (8 hours over multiple sessions):**
   - Builder queries GKChatty step-by-step
   - "What is step 1?" → Create database migration
   - "What is step 2?" → Add type definitions
   - ... (16 more queries)
   - Creates 23 files, modifies 12 files
   - All tests passing ✅

6. **Phase 5 - QA Review (30 min):**
   - Playwright tests all pages (10 screenshots)
   - Interactive testing on forms/buttons
   - Smoke test suite passes
   - orchestrate_build: 0 critical bugs
   - Presents to user → **User approves** ✅

**Result:** Production-ready admin user management system with comprehensive documentation

---

### Example 2: Simple Feature (Manual, No BMAD)

**User Request:**
```
"Add a dark mode toggle button to the header"
```

**What Happens:**

- SuperClaude recognizes: < 30 min task
- Does NOT invoke BMAD
- Implements manually:
  1. Add dark mode context provider
  2. Add toggle button to header
  3. Update CSS for dark mode
  4. Test in browser
- Total time: 25 minutes
- No overhead from BMAD workflow

**Why No BMAD:**
- Simple single-file change
- No architecture needed
- No documentation needed
- Manual is faster

---

## Troubleshooting

### Common Issues

#### Q: "Implementation complete but not tested?"

**A:** Phase 5 validation is now mandatory. SuperClaude cannot mark a project as "MVP complete" without:
- Running Playwright tests (2A, 2B, 2C)
- Running orchestrate_build
- Re-testing after fixes
- Getting user approval

If you see "implementation complete" without validation, remind SuperClaude:
> "Please run Phase 5 validation workflow before marking complete."

---

#### Q: "GKChatty returning wrong context?"

**A:** Check `.bmad/project-config.yml` - verify `gkchatty.user` matches project name.

**Diagnosis:**
```javascript
// 1. Check current user
mcp__gkchatty-kb__current_user()
// If shows "dev" but you're in "commisocial" → WRONG USER

// 2. Switch to correct user
mcp__gkchatty-kb__switch_user({
  username: "commisocial",
  password: "commisocial123!"
})

// 3. Verify
mcp__gkchatty-kb__current_user()
// Should show "commisocial"
```

---

#### Q: "Phase 4 using too many tokens?"

**A:** RAG pattern should use ~2K per step. If reading full plan (50K tokens), check:

1. Was plan uploaded to GKChatty?
   ```javascript
   // Query to verify
   mcp__gkchatty-kb__search_gkchatty({
     query: "implementation plan for [feature]"
   })
   // Should return plan document
   ```

2. Is Builder using correct RAG queries?
   - ✅ Good: "What is step 5 of admin user management plan?"
   - ❌ Bad: "Show me the entire plan"

3. Is Builder Pro BMAD agent being used?
   - Check: Should see RAG queries in progress updates
   - If not: May be using wrong builder agent

---

#### Q: "MCP tools not working?"

**A:** See [MCP-TOOLS-STATUS.md](MCP-TOOLS-STATUS.md) for validation status.

**All critical tools are tested and working ✅:**
- `review_file` ✅
- `security_scan` ✅
- `test_ui` ✅
- `orchestrate_build` ✅
- `switch_user` ✅
- `upload_to_gkchatty` ✅

If a tool fails:
1. Check MCP server is running
2. Check tool is called correctly (syntax)
3. Report issue in `docs/audits/`

---

#### Q: "How do I know if I should use BMAD?"

**A:** Use the decision matrix:

**Quick checks:**
1. Will this take more than 1 hour? → Use BMAD
2. Does request mention "RBAC", "audit logs", "enterprise"? → Use BMAD
3. Are there 3+ user stories? → Use BMAD
4. Is formal architecture needed? → Use BMAD

**When in doubt:** Ask the user!
> "This looks like a [X-hour] task. Should I use BMAD workflow or implement manually?"

---

#### Q: "Sub-agents returning non-JSON output?"

**A:** Retry ONCE with clearer instructions:

```javascript
// If agent returns non-JSON
if (!response.startsWith('{')) {
  // Retry with explicit JSON requirement
  Task({
    subagent_type: "planner",
    prompt: `CRITICAL: Return ONLY valid JSON. No markdown, no explanations.

    Required structure:
    {
      "status": "success",
      "outputs": {...},
      "artifacts": [...]
    }

    [Original prompt...]`
  });
}

// If still fails after retry
console.error("Agent failed to return JSON after retry. Stopping.");
// Report to user
```

---

#### Q: "Tests failing in Phase 5?"

**A:** This is expected! Phase 5 is designed to catch bugs.

**Workflow:**
1. Phase 2-3: Run tests → Find bugs
2. Phase 4: Fix bugs
3. Phase 5: Re-run tests → Verify fixes
4. Phase 6: Evaluate → Pass OR loop (max 3x)

**If looping 3 times:**
- Document remaining bugs
- Present to user
- Request manual intervention

**This is normal and shows validation is working correctly.**

---

#### Q: "How do I create a new BMAD project?"

**A:** Follow these steps:

```bash
# 1. Create .bmad directory
mkdir -p .bmad

# 2. Copy project config template
cp /path/to/template/project-config.yml .bmad/project-config.yml

# 3. Edit config with project details
# - Update project.name
# - Update gkchatty.user (MUST match project name)
# - Update tech_stack

# 4. Create GKChatty user (via admin interface)
# - Username: [project-name]
# - Password: [project-name]123!

# 5. Test GKChatty connection
# (In Claude Code)
mcp__gkchatty-kb__switch_user({
  username: "your-project-name",
  password: "your-project-name123!"
})

mcp__gkchatty-kb__current_user()
# Should show: "your-project-name"

# 6. Run BMAD
/bmad-pro-build "Your feature description"
```

---

## Optimization History

### 2025-10-28 Optimization (Version 2.0)

**Audit Results:**
- Analyzed 14 findings across 5 categories
- 3 critical issues
- 5 high-priority issues
- 4 medium issues
- 2 low issues

**Changes Made:**

#### Phase 1: Critical Fixes ✅
- Deleted `/builder-pro-build.md` (redundant workflow)
- Updated CLAUDE.md (removed all builder-pro-build references)
- Simplified workflow selection (Manual vs BMAD only)
- Fixed project-config.yml (dev → commisocial user)
- Enforced GKChatty project user isolation

**Impact:** Knowledge isolation, no cross-contamination

#### Phase 2: MCP Validation ✅
- Created `scripts/test-mcp-tools.js` validation framework
- Manually tested 6/11 MCP tools via Claude Code
- All critical tools confirmed working
- Created `docs/bmad/MCP-TOOLS-STATUS.md` reference

**Impact:** Verified all critical tools functional

#### Phase 3: Phase 5 Integration ✅
- Updated bmad-pro-build.md Phase 5
- Integrated 7-phase validation workflow
- Added mandatory user approval gate
- Added cross-reference in CLAUDE.md

**Impact:** Cannot mark complete without validation + approval

#### Phase 4: Documentation Consolidation ✅
- Created `docs/bmad/BMAD-COMPLETE-GUIDE.md` (this document)
- Created `docs/bmad/README.md` (documentation index)
- Added cross-references across all BMAD files

**Impact:** Single source of truth for BMAD documentation

#### Phase 5: Medium Priority (Pending)
- Pre-flight checks (scripts/bmad-preflight-check.js)
- Progress dashboard
- Rollback capability
- Cost tracking
- Auto-generated smoke tests

**Status:** Not yet implemented

---

### Previous Versions

#### October 2025 (Version 1.0 - Deprecated)
- Had two conflicting workflows (bmad-pro-build + builder-pro-build)
- Used "dev" user for all projects (no isolation)
- No mandatory validation workflow
- Phase 5 didn't automatically run tests
- Could mark projects complete without user approval
- 50K token usage per implementation (reading full plan)

**Problems:**
- Knowledge contamination between projects
- Premature "MVP complete" declarations
- Bugs not caught before user testing
- Token inefficiency

#### September 2025 (Foundation)
- Initial BMAD workflow
- RAG pattern established (92% token efficiency)
- 3-iteration error recovery
- Builder Pro BMAD agent created

**Success:**
- Proved RAG pattern works (verified working)
- Established 6-phase workflow structure

---

## Related Documentation

### Global Configuration
- `/Users/davidjmorin/.claude/CLAUDE.md` - SuperClaude configuration
- `/Users/davidjmorin/.claude/commands/bmad-pro-build.md` - BMAD workflow source

### Project Docs
- `docs/bmad/README.md` - Documentation index
- `docs/bmad/MCP-TOOLS-STATUS.md` - MCP tool validation status
- `docs/audits/` - Workflow audits
- `docs/plans/` - Optimization plans
- `docs/sessions/` - Session progress documentation
- `docs/validation/` - Test reports and QA results

### Templates
- `.bmad/project-config.yml` - Project configuration
- `.bmad/validation-workflow.yml` - Validation settings
- `.bmad/validation-workflow-enhanced.yml` - Enhanced validation v2.0

---

## Contributing

### Report Issues
Found a bug in BMAD workflow? Document in `docs/audits/[date]-[issue-name].md`

### Suggest Improvements
Have an idea? Create a plan in `docs/plans/[date]-[improvement-name].md`

### Session Documentation
When making significant changes to BMAD, document progress in:
`docs/sessions/[date]-[description].md`

Include:
- What was changed
- Why it was changed
- What problems it solves
- What was tested
- What still needs work

---

## Success Metrics

### Token Efficiency
- **Before (v1.0):** 50K tokens per implementation (reading full plan)
- **After (v2.0):** 2K tokens per step (92% reduction) ✅

### Quality Gates
- **Before (v1.0):** No mandatory validation
- **After (v2.0):** 7-phase validation + user approval ✅

### Knowledge Isolation
- **Before (v1.0):** All projects used "dev" user
- **After (v2.0):** Project-specific users enforced ✅

### Bug Detection
- **Before (v1.0):** Bugs found during user testing
- **After (v2.0):** Bugs found during Phase 5 QA ✅

### Documentation
- **Before (v1.0):** Info scattered across 5+ files
- **After (v2.0):** Single comprehensive guide ✅

---

**Built with:** SuperClaude + Builder Pro BMAD
**Pattern:** RAG-driven step-by-step execution
**Status:** ✅ Production Ready (validated 2025-10-28)
**Version:** 2.0

*From requirements to production. With intelligence.* 🚀
