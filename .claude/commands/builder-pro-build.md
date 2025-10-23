---
description: Complete Builder Pro + BMAD workflow for building applications with plan upload to GKChatty and autonomous execution
allowed-tools: Task, mcp__gkchatty-kb__switch_user, mcp__gkchatty-kb__upload_to_gkchatty, mcp__builder-pro-mcp__orchestrate_build, TodoWrite, Read, Write, Edit, Bash
---

# Builder Pro Build - Complete BMAD Workflow

When a user says "use builder pro to build [X]" or invokes `/builder-pro-build [description]`, this triggers the complete BMAD workflow with GKChatty integration.

## 🎯 The Complete Flow

```mermaid
User: "Use builder pro to build X"
         ↓
1. PLANNING PHASE (Scout → Plan → Upload)
         ↓
2. APPROVAL PHASE (Review → Approve)
         ↓
3. EXECUTION PHASE (Build → Validate → Loop)
         ↓
4. DELIVERY (Report → Commit)
```

---

## Phase 1: PLANNING (Scout & Plan)

### Step 1.1: Scout Analysis
**Use Task agent to analyze the project:**

```javascript
Task({
  subagent_type: "scout",
  description: "Scout analysis for [project name]",
  prompt: `
    Analyze the codebase and requirements for building [X].

    Examine:
    1. Current codebase structure
    2. Existing patterns and conventions
    3. Dependencies and tech stack
    4. Similar components/features already built
    5. Potential integration points

    Return:
    - Codebase overview
    - Recommended approach
    - Identified risks
    - Resource requirements
  `
})
```

### Step 1.2: Create BMAD Plan
**Use Task agent to create detailed plan:**

```javascript
Task({
  subagent_type: "planner",
  description: "Create BMAD plan for [project name]",
  prompt: `
    Based on scout analysis, create a detailed BMAD implementation plan for [X].

    Include:
    1. Architecture design
    2. Component breakdown
    3. Implementation phases
    4. Task priorities
    5. Validation checkpoints
    6. Estimated timelines

    Format as structured markdown with:
    - Executive summary
    - Technical architecture
    - Phase-by-phase implementation
    - Risk mitigation
    - Success criteria
  `
})
```

### Step 1.3: Save Plan Locally
**Save the plan to project directory:**

```bash
Write: ./specs/bmad-plans/[project-name]-plan-[timestamp].md
```

---

## Phase 2: GKCHATTY UPLOAD

### Step 2.1: Create/Switch to Project User
**Create a descriptive user for this build:**

```javascript
// Generate username from project
const projectName = "feature-[X]" // e.g., "feature-auth-system"
const username = projectName.toLowerCase().replace(/\s+/g, '-');
const password = generateSecurePassword();

// Switch to or create user
mcp__gkchatty-kb__switch_user({
  username: username,
  password: password
})

// If fails, may need to create user first via admin routes
```

### Step 2.2: Upload Plan to GKChatty
**Upload the BMAD plan:**

```javascript
mcp__gkchatty-kb__upload_to_gkchatty({
  file_path: "./specs/bmad-plans/[project-name]-plan-[timestamp].md",
  description: `BMAD Plan: ${projectName} - AWAITING APPROVAL`
})
```

### Step 2.3: Present for Approval
**Show plan summary and wait:**

```markdown
## 📋 BMAD Plan Ready: [Project Name]

**Scout Analysis:** Complete ✅
**Plan Created:** [timestamp]
**Uploaded to GKChatty:** ✅
**User:** [username]

### Plan Summary:
[Executive summary from plan]

### Implementation Phases:
1. [Phase 1 description] - [time estimate]
2. [Phase 2 description] - [time estimate]
3. [Phase 3 description] - [time estimate]

**Estimated Total Time:** [total]

---

**🚦 APPROVAL REQUIRED**

Type "approve" to begin autonomous execution, or provide feedback for plan adjustments.
```

**⏸️ WAIT FOR USER APPROVAL**

---

## Phase 3: EXECUTION

### Step 3.1: Initialize Todo Tracking
```javascript
TodoWrite({
  todos: [
    { content: "Scout analysis", status: "completed", activeForm: "Analyzing codebase" },
    { content: "Create BMAD plan", status: "completed", activeForm: "Creating plan" },
    { content: "Upload to GKChatty", status: "completed", activeForm: "Uploading plan" },
    { content: "Get approval", status: "completed", activeForm: "Getting approval" },
    { content: "Phase 1: [description]", status: "in_progress", activeForm: "Implementing Phase 1" },
    { content: "Phase 2: [description]", status: "pending", activeForm: "Implementing Phase 2" },
    { content: "Phase 3: [description]", status: "pending", activeForm: "Implementing Phase 3" },
    { content: "Final validation", status: "pending", activeForm: "Running validation" },
    { content: "Create report", status: "pending", activeForm: "Creating report" }
  ]
})
```

### Step 3.2: Execute with Builder Agent
**For each phase in the plan:**

```javascript
Task({
  subagent_type: "builder",
  description: `Execute Phase ${phaseNumber}`,
  prompt: `
    Execute the following phase from the BMAD plan:

    ${phaseDetails}

    Instructions:
    1. Implement according to specifications
    2. Use Builder Pro for simple tasks (config, dependencies)
    3. Implement complex logic directly
    4. Validate after each component

    Return status after completion.
  `
})
```

### Step 3.3: Validate with Builder Pro
**After each phase:**

```javascript
mcp__builder-pro-mcp__orchestrate_build({
  projectPath: process.cwd(),
  config: {
    frontend: { url: "http://localhost:3000" },
    backend: { url: "http://localhost:4001" }
  },
  autoFix: false,  // Just validate
  maxIterations: 1,
  stopOnCritical: true
})
```

### Step 3.4: Handle Validation Results
```javascript
if (validationResult.bugs.critical > 0) {
  // Stop and report issue
  return requestUserIntervention();
} else if (validationResult.bugs.medium > 0) {
  // Try to fix with Builder Pro
  orchestrate_build({ autoFix: true, maxIterations: 3 });
} else {
  // Continue to next phase
  updateTodo(currentPhase, "completed");
  moveToNextPhase();
}
```

---

## Phase 4: DELIVERY

### Step 4.1: Final Validation
**Complete validation run:**

```javascript
mcp__builder-pro-mcp__orchestrate_build({
  projectPath: process.cwd(),
  autoFix: false,
  maxIterations: 3,
  stopOnCritical: true
})
```

### Step 4.2: Create Completion Report
**Generate comprehensive report:**

```markdown
# BMAD Build Complete: [Project Name]

**Date:** [timestamp]
**Duration:** [total time]
**User:** [gkchatty username]

## Implementation Summary

### Phases Completed:
1. ✅ [Phase 1]: [result]
2. ✅ [Phase 2]: [result]
3. ✅ [Phase 3]: [result]

### Artifacts Created:
- Files: [list]
- Components: [list]
- Tests: [list]

### Validation Results:
- Builder Pro validation: PASSED ✅
- No critical issues
- Performance metrics: [details]

### Commits:
[List git commits]

---

**🎉 Build Complete!**
```

### Step 4.3: Upload Report to GKChatty
```javascript
mcp__gkchatty-kb__upload_to_gkchatty({
  file_path: "./reports/[project-name]-completion-[timestamp].md",
  description: `BMAD Build Complete: ${projectName}`
})
```

### Step 4.4: Git Commit
```bash
git add .
git commit -m "feat: Complete [project name] via BMAD workflow

Built using Builder Pro + BMAD methodology:
- Scout analysis completed
- Plan approved via GKChatty
- Autonomous execution with validation
- All tests passing

GKChatty User: [username]
Plan ID: [timestamp]

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## 🎯 Trigger Patterns

This workflow triggers when user says:
- "Use builder pro to build [X]"
- "Build [X] with builder pro"
- "/builder-pro-build [description]"
- "Create [X] using BMAD methodology"
- "Build [X] with plan upload to GKChatty"

---

## 🔧 Configuration

### Default Settings:
```yaml
scout_thoroughness: "medium"  # quick | medium | very thorough
plan_detail_level: "comprehensive"  # basic | standard | comprehensive
validation_frequency: "after_each_phase"  # continuous | after_each_phase | end_only
gkchatty_user_prefix: "build-"  # Prefix for auto-generated users
max_execution_time: 14400  # 4 hours max
require_approval: true  # Always require approval before execution
```

---

## 🚨 Error Handling

### If GKChatty upload fails:
1. Save plan locally with timestamp
2. Continue with approval request
3. Note in report that GKChatty upload failed
4. Provide local plan location

### If validation fails:
1. Stop execution immediately
2. Create error report
3. Upload error report to GKChatty
4. Request user intervention

### If execution exceeds time limit:
1. Pause execution
2. Save state
3. Create progress report
4. Ask user to continue or abort

---

## 📊 Success Metrics

Track and report:
- Time from request to completion
- Number of validation passes/fails
- Lines of code generated
- Test coverage achieved
- Performance metrics
- User interventions required

---

## 🎯 Example Usage

**User:** "Use builder pro to build a real-time chat system"

**Claude:**
1. Launches scout analysis
2. Creates BMAD plan with WebSocket architecture
3. Creates user "build-chat-system" in GKChatty
4. Uploads plan
5. Presents summary and waits for approval
6. User: "approve"
7. Executes plan phase by phase
8. Validates after each phase
9. Creates completion report
10. Commits with descriptive message

**Total time:** ~2-4 hours depending on complexity

---

**This is THE standard flow for Builder Pro builds!**
