# BMAD Orchestrator Command Integration

This file contains the Claude Code command template for integrating the BMAD Orchestrator with slash commands.

## Command Template for `/bmad-pro-build`

```markdown
You are executing the BMAD Builder Pro workflow with the new orchestration pattern.

## Orchestration Pattern

**CRITICAL:** Sub-agents CANNOT write files or use MCP tools. You must:
1. Invoke agents to get JSON output
2. Parse the JSON output
3. Handle ALL file writing and MCP operations yourself
4. Upload plans to GKChatty yourself

## Phase Execution

### Phase 0: Requirements (Product Owner)

Invoke the Product Owner agent:

<Task>
subagent_type: general-purpose
description: BMAD Product Owner - Requirements Analysis
prompt: |
  You are a BMAD Product Owner creating comprehensive requirements.

  User Request: {{USER_REQUEST}}

  Create detailed user stories and acceptance criteria.

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
    "artifacts": [
      {
        "name": "requirements.md",
        "content": "# Full requirements document...",
        "type": "file"
      }
    ],
    "next_phase": {"ready": true}
  }
</Task>

After receiving the response:
1. Parse the JSON output
2. Write artifacts to `specs/user-stories/YYYY-MM-DD-{{PROJECT}}.md`
3. Store outputs for next phase

### Phase 1: Architecture (Architect)

Invoke the Architect agent with requirements:

<Task>
subagent_type: general-purpose
description: BMAD Architect - System Design
prompt: |
  You are a BMAD System Architect.

  Requirements: {{REQUIREMENTS_OUTPUT}}

  Design the technical architecture.

  Return ONLY valid JSON with architecture decisions and artifacts.
</Task>

Process the output similarly.

### Phase 2: Discovery (Scout)

Invoke the Scout agent:

<Task>
subagent_type: scout
description: BMAD Scout - Codebase Discovery
prompt: |
  Analyze the codebase for relevant patterns.

  Requirements: {{REQUIREMENTS}}
  Architecture: {{ARCHITECTURE}}

  Return findings as JSON.
</Task>

### Phase 3: Planning (Planner)

Invoke the Planner agent:

<Task>
subagent_type: planner
description: BMAD Planner - Implementation Plan
prompt: |
  Create a detailed implementation plan.

  Context: {{ALL_PREVIOUS_OUTPUTS}}

  Return JSON with step-by-step plan for GKChatty upload.
</Task>

**CRITICAL AFTER PLANNER:**
1. Parse the JSON output
2. Extract the plan artifact
3. Write plan to `specs/plans/YYYY-MM-DD-{{PROJECT}}.md`
4. Upload to GKChatty using MCP tools:
   ```
   mcp__gkchatty_kb__switch_user(username: "gkchattymcp", password: "Gkchatty1!")
   mcp__gkchatty_kb__upload_to_gkchatty(file_path: "...", description: "...")
   ```

### Phase 4: Implementation (Builder)

Execute in main session using RAG pattern:

1. Query GKChatty for each step:
   ```
   mcp__gkchatty_kb__query_gkchatty(query: "What is Step 1 of the implementation plan?")
   ```
2. Implement the step
3. Repeat for all steps

### Phase 5: QA Review

After implementation, invoke QA agent:

<Task>
subagent_type: general-purpose
description: BMAD QA - Code Review
prompt: |
  Review the implementation for quality and compliance.

  Return JSON with QA findings.
</Task>

## Error Handling

If any agent returns non-JSON output:
1. Try to extract JSON from the text
2. If extraction fails, log the error and retry once
3. If still failing, halt workflow and report issue

## Success Criteria

✅ All artifacts written to disk
✅ Plan uploaded to GKChatty
✅ Each phase validates before proceeding
✅ No silent failures
✅ Clear error reporting

## Example Execution Log

```
📋 Phase: Product Owner
  ✅ Agent returned valid JSON
  📁 Created: specs/user-stories/2025-10-27-commisocial.md
  ✅ Phase complete

📋 Phase: Architect
  ✅ Agent returned valid JSON
  📁 Created: specs/architecture/2025-10-27-commisocial.md
  ✅ Phase complete

📋 Phase: Planner
  ✅ Agent returned valid JSON
  📁 Created: specs/plans/2025-10-27-commisocial.md
  📤 Uploading to GKChatty...
  ✅ Upload successful
  ✅ Phase complete

🚀 Ready for Builder Pro implementation
```

## Migration Notes

This replaces the old pattern where agents were expected to write files directly.
The orchestrator (Claude Code main session) now handles ALL I/O operations.
```

## Command Template for `/bmad-router`

Similar pattern but routes to specific specialist agents based on request type.

## Command Template for All BMAD Commands

All BMAD commands should follow this orchestration pattern:

1. **Agents**: Pure computation, return JSON
2. **Orchestrator**: Handle all I/O (files, MCP, network)
3. **Validation**: Check outputs between phases
4. **Error Handling**: Catch and report failures

## Testing a Command

To test if a command has been updated:

```bash
# Look for these patterns in the command file:

# OLD (Broken):
"Planner: Create plan and save to specs/plans/..."
"Upload to GKChatty"

# NEW (Working):
"Return JSON with plan artifact"
"Orchestrator will handle file writing"
```