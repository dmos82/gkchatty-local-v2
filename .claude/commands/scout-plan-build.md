---
description: Execute the Scout → Plan → Build → Verify agentic workflow for complex feature implementation
---

You are executing the **Scout → Plan → Build** agentic workflow.

This workflow implements complex features through a structured, four-phase approach with continuous quality checks and historical context integration.

---

## 🎯 Workflow Overview

**Input**: User's feature request or task description
**Output**: Fully implemented, tested, and committed code changes

**Phases**:
1. **Scout** - Discover relevant files and historical context
2. **Plan** - Create detailed implementation strategy
3. **Build** - Execute plan with quality verification
4. **UI Verification** - Automated end-to-end testing

---

## 📋 Execution Steps

### Phase 1: SCOUT 🔍

**Invoke the scout subagent**:

```
Use the scout subagent with this request:

"Find all relevant files and context for this task:

$ARGUMENTS

Provide a structured JSON report with:
- Historical context from GKChatty
- Relevant files with priorities
- Entry points and dependencies
- Recommendations based on past implementations"
```

**Wait for scout's response before proceeding.**

The scout will return a JSON report containing:
- Files to modify (prioritized)
- Historical patterns from GKChatty
- Known gotchas
- Best practices to follow

---

### Phase 2: PLAN 📋

**Invoke the planner subagent with scout's findings**:

```
Use the planner subagent with this request:

"Create a detailed implementation plan for:

$ARGUMENTS

Use these findings from the scout:
[Paste the scout's complete JSON report here]

Create a plan that includes:
- Step-by-step implementation instructions
- Test strategy for each step
- Risk assessment and mitigation
- Rollback plan if needed

Save the plan to specs/plans/ and upload to GKChatty knowledge base."
```

**Wait for planner's response before proceeding.**

The planner will:
- Research additional context from GKChatty
- Read relevant files
- Create detailed plan in specs/plans/
- Upload plan to knowledge base
- Report where plan is saved

---

### Phase 3: BUILD 🔨

**Invoke the builder subagent with the plan**:

```
Use the builder subagent with this request:

"Execute the implementation plan located at:

[Path to plan from planner's response, e.g., specs/plans/2025-10-06-task-name.md]

Follow these rules:
- Execute each step in order
- Run code review after each change
- Run security scan before committing
- Run tests after each step - STOP if any fail
- Save progress to GKChatty after each completed step
- Report any blockers immediately

Commit changes only when ALL tests pass and security scan is clean."
```

**Monitor builder's progress.**

The builder will:
- Execute plan step-by-step
- Use builder-pro-mcp for code quality checks
- Use builder-pro-mcp for security scans
- Run tests after each step
- Save progress to GKChatty
- Commit when complete

---

### Phase 4: UI VERIFICATION 🎯

**Invoke the UI verification with this request:**

```
After the build is complete, perform automated end-to-end UI verification:

Task: $ARGUMENTS

You are now a QA Automation Agent. Your job is to visually confirm that the feature works in the live application.

**Instructions:**
1. **Formulate a Visual Test Plan**: Based on the original request, state a simple, visual test plan.
   - For UI tasks: "I will check that the button appears and is clickable"
   - For API tasks: "I will verify the /health endpoint returns correct JSON"

2. **Execute the Test Plan with Automatic Fallback**:

   **PRIMARY: Visual UI Testing (Attempt First)**
   - **For UI elements**: Use the See → Think → Act loop:
     - Use `mcp__ui-tester__take_screenshot` to SEE the screen
     - Analyze the image to find coordinates for your next action
     - Use `mcp__ui-tester__click_at` or `mcp__ui-tester__type_text` to ACT
     - Repeat until the test is complete

   **FALLBACK: API + Code Verification (If Screenshot Fails)**
   - If `mcp__ui-tester__take_screenshot` fails or returns an error (indicating headless/terminal environment):
     - **Step 1 - API Testing**: Use the `Bash` tool with `curl` to:
       * Authenticate and get a valid token
       * Test the backend API endpoint for the feature
       * Verify the API returns expected status codes and data
     - **Step 2 - Frontend Code Verification**: Use the `Read` tool to:
       * Read the relevant frontend component file
       * Verify the UI code was correctly generated (button, form, modal, etc.)
       * Confirm event handlers and state management are in place
     - **Step 3 - Integration Check**: If applicable, verify that:
       * The frontend makes the correct API calls
       * The data flow from API to UI is properly implemented

   **For API-only endpoints**: Always use the `Bash` tool with `curl` to test directly

3. **Final Verdict**: Conclude with a clear:
   - **UI TEST: PASSED ✅** if feature works as expected (either via visual test OR API + code verification)
   - **UI TEST: FAILED ❌** if feature has issues
   - Include which testing method was used: "Verified via [Visual UI Testing / API + Code Verification]"

This is the final validation step of the entire workflow.
```

---

## 🔄 Interaction Pattern

### Between You and Subagents

1. **Invoke subagent**: Use the pattern "Use the [scout/planner/builder] subagent..."
2. **Wait for response**: Each subagent will complete its work and return results
3. **Pass context forward**: Give each subagent the output from the previous one
4. **Monitor execution**: Track progress and handle any blockers

### What You See

- Scout returns: JSON with files and context
- Planner returns: Path to saved plan + summary
- Builder returns: Step-by-step progress + final commit hash

---

## ✅ Success Criteria

The workflow completes successfully when:

1. **Scout Phase**:
   - ✅ Historical context retrieved from GKChatty
   - ✅ All relevant files identified
   - ✅ Dependencies and entry points mapped

2. **Plan Phase**:
   - ✅ Detailed plan created with specific steps
   - ✅ Tests strategy defined
   - ✅ Risks identified with mitigation
   - ✅ Plan saved to specs/plans/
   - ✅ Plan uploaded to GKChatty

3. **Build Phase**:
   - ✅ All steps executed in order
   - ✅ Code review passed for all changes
   - ✅ Security scan clean (no vulnerabilities)
   - ✅ ALL tests passing
   - ✅ Changes committed to git
   - ✅ Progress saved to GKChatty

4. **UI Verification Phase**:
   - ✅ Visual test plan formulated
   - ✅ Tests executed successfully
   - ✅ Final verdict: PASSED ✅

---

## 🚨 Error Handling

### If Scout Fails:
- Review the task description - is it clear enough?
- Check if GKChatty is running (localhost:5001)
- Try refining the task with more specific keywords

### If Planner Fails:
- Verify scout provided adequate file list
- Check if plan complexity is too high (break into smaller tasks)
- Ensure GKChatty has relevant historical context

### If Builder Fails:
- **Tests Fail**: Builder will stop - review test output
- **Security Issues**: Builder will stop - review vulnerability report
- **Code Review Issues**: Builder will fix and retry
- **Blocker**: Builder will ask for guidance

### If UI Verification Fails:
- **Screenshot Tool Fails**: Automatic fallback to API + code verification (built into Phase 4)
- **API Test Fails**: Check if dev servers are running (ports 5001, 5003)
- **Code Verification Fails**: Review the frontend files - UI code may be incomplete
- **Feature Not Working**: Return to Builder phase to fix implementation

In any failure case:
1. Review the subagent's last output
2. Understand the blocker
3. Either fix the issue or revise the task
4. Restart from the failed phase

---

## 📊 Final Report

After all four phases complete, provide this summary to the user:

```markdown
# Workflow Complete: [Task Name]

## ✅ Summary

**Task**: $ARGUMENTS
**Status**: Completed successfully

## 📁 Changes Made

**Files Modified**:
- [List from builder]

**Files Created**:
- [List from builder]

## 🧪 Quality Verification

**Tests**: ✅ All passing
**Code Review**: ✅ No issues
**Security Scan**: ✅ No vulnerabilities
**Linting**: ✅ Clean
**UI Verification**: ✅ PASSED

## 📝 Git Commit

**Hash**: [commit hash from builder]
**Message**: [commit message]

## 📚 Documentation

**Plan Saved**: specs/plans/[filename]
**Progress Saved**: GKChatty knowledge base
**Searchable**: Use "search_gkchatty('[task keywords]')" to retrieve

## 🎯 Next Steps

[Any recommendations from builder or obvious follow-up tasks]
```

---

## 💡 Tips for Success

1. **Be Specific**: Detailed task descriptions yield better results
2. **Use Keywords**: Include technical terms for better GKChatty search
3. **Trust the Process**: Don't skip phases - each builds on the previous
4. **Review Plans**: After planning phase, review before building
5. **Watch for Blockers**: Address issues immediately when builder reports them

---

## Example Usage

```
/scout-plan-build "Add rate limiting middleware to all API routes in apps/api. Use express-rate-limit package. Configure: 100 requests per 15 minutes per IP. Apply to all routes except /health."
```

This will:
1. Scout finds all route files and existing middleware patterns
2. Planner creates 5-step implementation plan
3. Builder executes: installs package → creates middleware → applies to routes → tests → commits
4. UI Verification: Tests the endpoint and verifies rate limiting works

**Estimated time**: 5-10 minutes for moderate complexity tasks

---

**Ready to execute the workflow!**
