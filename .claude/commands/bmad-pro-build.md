---
description: Execute the full BMAD workflow with Builder Pro BMAD (RAG pattern) - Complete SDLC automation from requirements to production-ready code with 92% token efficiency
allowed-tools: Task, Read, Write, TodoWrite, mcp__gkchatty-kb__upload_to_gkchatty, mcp__gkchatty-kb__search_gkchatty
---

# BMAD-PRO-BUILD: Enterprise Agentic Workflow with RAG

**Complete SDLC automation using Builder Pro BMAD (verified September 2025 RAG pattern)**

This workflow integrates BMAD specialists with the **Builder Pro BMAD** autonomous agent featuring:
- ✅ RAG step-by-step queries (2K tokens per step vs 50K full plan)
- ✅ 3-iteration error recovery
- ✅ Progress tracking to GKChatty
- ✅ 92% token efficiency (verified)
- ✅ Sub-second query retrieval

---

## 🎯 Workflow Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────┐     ┌─────────┐     ┌──────────────────┐     ┌──────────┐
│ REQUIREMENTS│ ──> │ ARCHITECTURE│ ──> │  SCOUT  │ ──> │ PLANNER │ ──> │ BUILDER-PRO-BMAD │ ──> │ QA VERIFY│
│   (PO/BA)   │     │  (Architect)│     │         │     │         │     │   (RAG Pattern)  │     │   (QA)   │
└─────────────┘     └─────────────┘     └─────────┘     └─────────┘     └──────────────────┘     └──────────┘
      │                    │                 │               │                     │                    │
      ↓                    ↓                 ↓               ↓                     ↓                    ↓
 User Story          System Design      File Discovery  Implementation    RAG Query → Execute     Quality Gate
 Acceptance         API Contracts        + GKChatty       Plan            → Test → Query          + Security
 Criteria           Tech Decisions       + Context      + Upload KB       → Repeat (2K/step)      + E2E Tests
```

---

## 📋 Phase-by-Phase Execution

### PHASE 0: Requirements Engineering 📝

**Specialist:** Product Owner (via `/po-router`)

**Process:**
1. Invoke Product Owner to refine requirements
2. Create user story with acceptance criteria
3. Define success metrics
4. Identify stakeholders
5. Document edge cases and constraints

**Output:**
- User story document
- Acceptance criteria checklist
- Success metrics
- Saved to: `specs/user-stories/[date]-[story-name].md`

---

### PHASE 1: Architecture Design 🏗️

**Specialist:** Architect (via `/architect-router`)

**Process:**
1. Invoke Architect to design system
2. Define API contracts and data models
3. Select technologies and frameworks
4. Document security and scalability considerations
5. Create architecture diagrams

**Output:**
- System architecture document
- API specifications
- Technology stack decisions
- Saved to: `specs/architecture/[date]-[story-name].md`

---

### PHASE 2: Discovery 🔍

**Specialist:** Scout (via `scout` subagent)

**Process:**
1. Search GKChatty for historical context
2. Discover relevant files in codebase
3. Identify entry points and dependencies
4. Analyze existing patterns
5. Create structured discovery report

**Output:**
- JSON discovery report with:
  - Historical context from GKChatty
  - Relevant files (prioritized)
  - Entry points and dependencies
  - Recommendations

---

### PHASE 3: Planning 📋

**Specialist:** Planner (via `planner` subagent)

**Process:**
1. Review context from Scout, Architect, and PO
2. Research historical patterns via GKChatty
3. Create detailed step-by-step implementation plan
4. Include risk assessment and test strategy
5. Save plan locally AND upload to GKChatty

**Output:**
- Implementation plan: `specs/plans/[date]-[story-name].md`
- Plan uploaded to GKChatty knowledge base
- Confirmation: "Plan formalized and uploaded"

---

### PHASE 4: Implementation (Builder Pro BMAD) 🔨 **⭐ RAG PATTERN**

**Specialist:** Builder Pro BMAD (via `builder-pro-bmad` subagent)

**IMPORTANT:** Due to Claude Code MCP + Task tool limitation, Builder Pro BMAD will be executed in main session (not as sub-agent). This is normal and works perfectly.

**RAG Workflow:**

```
Step 1: Verify Plan Exists in GKChatty
  Query: "Implementation plan for [feature]"
  If not found → STOP

Step 2: Execute Plan Using Step-by-Step RAG Queries
  Loop until plan complete:
    1. Query GKChatty: "What is step [X] of [feature] plan?"
       → Token usage: ~2K per query
       → Retrieval time: < 1 second

    2. Execute ONLY that step:
       - Create/modify files as specified
       - Follow exact specifications

    3. Test the step:
       - Run relevant tests
       - Verify compilation
       - Check for errors

    4. If step succeeds → Query for next step (go to 1)

    5. If step fails → Enter error recovery (Step 3)

Step 3: Error Recovery (3-Iteration Loop)
  Iteration 1: RAG Self-Recovery
    - Query GKChatty: "How to resolve [error] in [feature]?"
    - Apply solution from knowledge base
    - Retry the failed step

  Iteration 2: Pattern Search
    - Query GKChatty: "How was [similar problem] solved?"
    - Apply historical pattern
    - Retry the failed step

  Iteration 3: Stop and Report Blocker
    - STOP execution
    - Report to user with detailed analysis
    - Await user guidance

Step 4: Progress Tracking
  After EACH successful step:
    - Upload progress update to GKChatty
    - Report to user:
      ✅ Step [X] complete: [description]
      📄 Files modified: [list]
      🧪 Tests: [status]
      ⏭️  Next: [next step]

Step 5: Completion
  When all steps complete:
    1. Final validation (run full test suite)
    2. Upload completion report to GKChatty
    3. Report to user:
       ✅ Implementation complete!
       - Steps completed: [X/X]
       - Files created/modified: [count]
       - Tests passing: [count/count]
       - Ready for QA phase
```

**Output:**
- Implemented code changes
- Progress updates in GKChatty
- Completion report
- All tests passing

**Performance Metrics:**
- Token usage: ~2K per step (vs 50K full plan read)
- Query speed: < 1 second per RAG query
- Error recovery: Up to 3 iterations before user escalation
- Token efficiency: 92% reduction vs October version

---

### PHASE 5: QA Review 🔬

**Specialist:** QA Architect (via `/qa-router`)

**Process:**
1. Comprehensive code review
2. Security vulnerability scan
3. Performance testing
4. E2E test execution
5. Final approval or rejection with feedback

**Output:**
- QA report with approval/rejection
- Security scan results
- Test coverage metrics
- Recommendations for improvements

---

## 🎯 Usage

### **Invoke the complete workflow:**

```
/bmad-pro-build "feature description"
```

**Example:**
```
/bmad-pro-build "Add real-time notifications with WebSocket support"
```

### **What happens:**
1. ✅ Product Owner creates user story
2. ✅ Architect designs system architecture
3. ✅ Scout discovers relevant files + GKChatty history
4. ✅ Planner creates + uploads implementation plan
5. ✅ Builder Pro BMAD executes with RAG pattern (in main session)
6. ✅ QA reviews and approves

---

## 📊 Success Criteria

The workflow is complete when:
- ✅ All acceptance criteria from PO are met
- ✅ Architecture constraints are respected
- ✅ All tests are passing
- ✅ QA has approved the implementation
- ✅ Security scans show no critical issues
- ✅ Code is production-ready

---

## 🚨 Known Limitations

### MCP Sub-Agent Access
**Issue:** Builder Pro BMAD sub-agent cannot access GKChatty MCP tools when invoked via Task tool (Claude Code limitation)

**Workaround:** Builder Pro BMAD will be executed in main session where all MCP tools work perfectly.

**Impact:** Zero - RAG pattern works perfectly in main session

**Status:** Normal operation, verified working

---

## 🎓 Builder Pro BMAD vs Standard Builder

| Feature | Standard Builder | Builder Pro BMAD |
|---------|-----------------|------------------|
| **RAG Pattern** | ❌ No | ✅ YES |
| **Token Efficiency** | 50K full plan | ✅ 2K per step (92% reduction) |
| **Query Speed** | N/A | ✅ < 1 second |
| **Error Recovery** | ❌ No | ✅ 3-iteration loop |
| **Progress Tracking** | Limited | ✅ Per-step updates |
| **GKChatty Integration** | Basic | ✅ Advanced RAG |
| **Status** | October broken | ✅ September verified |

---

## 📝 Related Documentation

- `BUILDER-PRO-RAG-PATTERN-VERIFICATION.md` - Test results proving RAG works
- `BUILDER-PRO-RESTORATION-REPORT.md` - Why September version was restored
- `MCP-ACCESS-SOLUTION.md` - MCP blocker analysis and workaround
- `BMAD-STANDARD-VS-BUILDER-PRO-ANALYSIS.md` - Comparison of all versions

---

## ✅ Quick Reference

**Use this command when:**
- Building complex features E2E
- Need full BMAD workflow automation
- Want RAG step-by-step execution
- Need 92% token efficiency
- Want 3-iteration error recovery

**Don't use if:**
- Simple one-off task (use individual routers instead)
- Just need code review (use `/qa-router`)
- Just need architecture (use `/architect-router`)

---

**Workflow Type**: Complete SDLC Automation
**Builder Agent**: builder-pro-bmad (September 2025 RAG pattern)
**Status**: ✅ PRODUCTION READY (verified 2025-10-22)
**Token Efficiency**: 92% vs October version
**Execution**: Main session (MCP tools fully functional)

---

*From requirements to production. With intelligence.* 🚀
