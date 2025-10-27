# BMAD Builder Pro Configuration

**Purpose:** Configuration files and templates for Builder Pro validation workflow

**Created:** October 27, 2025
**Version:** 1.0.0

---

## Directory Structure

```
.bmad/
├── README.md                              # This file
├── validation-workflow.yml                # Complete 7-phase validation workflow
├── VALIDATION-WORKFLOW-INTEGRATION.md     # Integration guide for CLAUDE.md
├── templates/
│   ├── PLAYWRIGHT-TEST-REPORT-TEMPLATE.md # Test report format
│   └── BUGS-FOUND-TEMPLATE.md             # Bug report format
└── scripts/ (optional)
    └── validate-completion.sh             # Pre-commit validation check
```

---

## What This Is

This directory contains the **Builder Pro Validation Workflow** configuration that enforces comprehensive testing before marking any MVP as complete.

### The Problem It Solves

Without this workflow:
- ❌ Implementation gets marked "complete" without proper testing
- ❌ Bugs are only found during user testing
- ❌ No systematic approach to validation
- ❌ Playwright tests are skipped or minimal
- ❌ Console errors go unnoticed

With this workflow:
- ✅ Comprehensive Playwright testing (buttons, links, forms)
- ✅ Automated bug detection and fixing
- ✅ Iterative test-fix-retest loop (max 3 iterations)
- ✅ User only sees validated, production-ready code
- ✅ Standardized documentation of results

---

## The Validation Workflow

### 7 Phases (See `validation-workflow.yml`)

1. **Implementation** - Code complete, no errors
2. **Comprehensive Playwright Testing** - Test every button, link, form
3. **Run orchestrate_build** - Automated validation + auto-fix
4. **Manual Fixes** - Fix issues that couldn't be auto-fixed
5. **Re-run Playwright Tests** - Verify fixes, catch regressions
6. **Evaluate Results** - Pass? → Present. Issues? → Loop back (max 3)
7. **Present to User** - Show results + request approval

### Key Feature: Iterative Loop

The workflow loops between phases 3-6 until:
- All tests pass, OR
- Max 3 iterations reached (then requires user decision)

This ensures bugs are actually fixed, not just documented.

---

## Files Explained

### 1. `validation-workflow.yml`

**Complete workflow specification** with:
- Phase definitions
- Test requirements (what to click, what to verify)
- Output requirements (screenshots, reports)
- Loop conditions
- Enforcement rules

**Use:** Reference for understanding the workflow
**Format:** YAML configuration

---

### 2. `VALIDATION-WORKFLOW-INTEGRATION.md`

**Integration guide** showing:
- How to add workflow to CLAUDE.md
- How to update implementation plans
- How to create validation scripts
- Example commands
- Troubleshooting

**Use:** Follow this to integrate workflow into your dev process
**Format:** Markdown documentation

---

### 3. `templates/PLAYWRIGHT-TEST-REPORT-TEMPLATE.md`

**Standardized test report format** with sections for:
- Test summary (passed/failed counts)
- Results by category (auth, feed, posts, comments, etc.)
- Console errors found
- Bugs found (by severity)
- Screenshots captured
- Overall assessment

**Use:** Copy this template when running Playwright tests
**Format:** Markdown template

---

### 4. `templates/BUGS-FOUND-TEMPLATE.md`

**Standardized bug report format** with:
- Bug summary table (by severity)
- Critical bugs (blocks MVP)
- High priority bugs (poor UX)
- Medium/low priority bugs
- Console errors logged
- Automated fixes applied
- Manual fixes applied
- Regression testing results

**Use:** Document all bugs found during validation
**Format:** Markdown template

---

## How to Use This

### For AI Agents (Claude Code)

When implementing a project:

1. ✅ Complete implementation (Steps 1-16)
2. 🛑 **STOP** - Do not mark complete
3. 📸 Run Phase 2 Playwright tests using templates
4. 🐛 Document bugs using bug template
5. 🤖 Run Phase 3 orchestrate_build
6. 🔧 Fix bugs (Phase 4)
7. 🔄 Re-run Playwright tests (Phase 5)
8. 📊 Evaluate (Phase 6) - loop if needed
9. 👤 Present to user (Phase 7)
10. ✅ **THEN** mark complete (only after user approval)

### For Human Developers

1. Review test reports after Claude Code runs validation
2. Run manual smoke tests
3. Approve or request changes
4. Only mark complete when satisfied

---

## Integration Checklist

To integrate this workflow:

- [ ] Read `VALIDATION-WORKFLOW-INTEGRATION.md`
- [ ] Add workflow section to `.claude/CLAUDE.md`
- [ ] Update implementation plan templates (add Step 17)
- [ ] Create validation scripts (optional)
- [ ] Add git hooks (optional)
- [ ] Test workflow on next project

---

## Example: CommiSocial

This workflow was created **after** CommiSocial was built, when we realized Playwright testing was skipped.

**What should have happened:**
1. Complete Steps 1-16 ✅
2. Run comprehensive Playwright tests 📸
3. Find bugs (broken links, console errors, etc.)
4. Run orchestrate_build to auto-fix
5. Fix remaining bugs manually
6. Re-test to verify
7. Present to user with confidence 🎉

**What actually happened:**
- Marked complete without Playwright tests
- User had to request validation
- Created this workflow to prevent it in future

**Lesson:** This workflow ensures production-ready quality before user sees code.

---

## Configuration Details

### orchestrate_build Parameters

```javascript
{
  projectPath: "/absolute/path/to/project", // required
  config: {
    frontend: { url: "http://localhost:3000" },
    backend: { url: null } // if applicable
  },
  autoFix: true,              // enable auto-fixing
  maxIterations: 3,           // max fix attempts
  stopOnCritical: false       // continue even on critical bugs
}
```

### test_ui Parameters

```javascript
{
  url: "http://localhost:3000",
  screenshotPath: "docs/screenshots/page-name.png",
  actions: [
    { type: "screenshot" },
    { type: "click", selector: "button#signup" },
    { type: "type", selector: "input#username", text: "testuser" },
    { type: "wait", timeout: 2000 }
  ]
}
```

---

## Benefits of This Approach

### Before Workflow
- 🔴 Tests skipped or minimal
- 🔴 Bugs found by users
- 🔴 No systematic validation
- 🔴 Inconsistent quality
- 🔴 More iterations needed

### After Workflow
- 🟢 Comprehensive automated testing
- 🟢 Bugs caught before user sees code
- 🟢 Systematic test-fix-retest loop
- 🟢 Consistent high quality
- 🟢 Faster to production-ready

---

## Maintenance

### Updating Workflow

To modify:
1. Edit `validation-workflow.yml`
2. Update templates as needed
3. Update integration guide
4. Document changes here

### Adding Tests

To add new Playwright tests:
1. Add section to test report template
2. Document in workflow YAML
3. Update integration guide examples

### Version History

- **v1.0.0** (Oct 27, 2025) - Initial workflow created
  - 7-phase validation loop
  - Comprehensive Playwright testing
  - Iterative bug fixing (max 3)
  - Standardized templates

---

## Questions?

See `VALIDATION-WORKFLOW-INTEGRATION.md` for detailed usage instructions.

**Key Principle:** Never mark a project as complete without comprehensive validation and user approval.

---

**Created by:** BMAD Development Team
**Purpose:** Ensure production-ready quality on every project
**Status:** Active and enforced
