# Builder Pro Validation Workflow Integration Guide

**Purpose:** Enforce comprehensive testing loop before marking any MVP as complete

**Created:** October 27, 2025
**Version:** 1.0.0

---

## Overview

This guide explains how to integrate the Builder Pro validation workflow into your development process so that:

1. ✅ Implementation never skips testing
2. ✅ Playwright tests run comprehensively (buttons, links, forms)
3. ✅ orchestrate_build runs automatically after manual testing
4. ✅ Bugs are found, fixed, and re-tested in a loop
5. ✅ User only sees results after automated validation passes

---

## Files Created

### 1. Workflow Configuration
**File:** `.bmad/validation-workflow.yml`
**Purpose:** Defines the 7-phase validation loop with max 3 iterations

### 2. Test Report Template
**File:** `.bmad/templates/PLAYWRIGHT-TEST-REPORT-TEMPLATE.md`
**Purpose:** Standardized format for documenting Playwright test results

### 3. Bug Report Template
**File:** `.bmad/templates/BUGS-FOUND-TEMPLATE.md`
**Purpose:** Standardized format for documenting bugs found and fixed

---

## Integration Steps

### Step 1: Update CLAUDE.md

Add this section to your `.claude/CLAUDE.md`:

```markdown
## Builder Pro Validation Workflow (MANDATORY)

### Enforcement Rules

**CRITICAL:** Never mark a project as "MVP Complete" without completing ALL validation phases.

### Validation Workflow

After implementation is complete (no TypeScript/runtime errors):

1. **Phase 2: Comprehensive Playwright Testing** (MANUAL)
   - Use `mcp__builder-pro-mcp__test_ui` tool
   - Test EVERY button, link, form, and user flow
   - Capture screenshots of all pages
   - Document bugs in `docs/validation/bugs-found.md`
   - Create test report using template from `.bmad/templates/PLAYWRIGHT-TEST-REPORT-TEMPLATE.md`

2. **Phase 3: Run orchestrate_build** (AUTOMATIC)
   - Use `mcp__builder-pro-mcp__orchestrate_build` tool
   - Project path + frontend URL required
   - Auto-fix enabled with max 3 iterations
   - Generates comprehensive validation report

3. **Phase 4: Apply Manual Fixes** (MANUAL)
   - Fix critical and high-priority bugs from reports
   - Commit fixes with descriptive messages

4. **Phase 5: Re-run Playwright Tests** (MANUAL)
   - Run full test suite again using `test_ui`
   - Verify bugs are fixed
   - Check for new regressions
   - Update test report

5. **Phase 6: Evaluate Results** (AUTOMATIC)
   - If all tests pass → Proceed to Phase 7
   - If issues found → Loop back to Phase 3 (max 3 times)
   - If max iterations reached → Document remaining issues + require user decision

6. **Phase 7: Present to User** (MANUAL)
   - Show all test results
   - Show screenshots
   - Show validation reports
   - Highlight any remaining issues
   - Request human smoke test

### Configuration Location

Workflow config: `.bmad/validation-workflow.yml`
Templates: `.bmad/templates/`

### Validation Checklist

Before marking complete:
- [ ] Phase 2 Playwright tests completed
- [ ] Phase 3 orchestrate_build completed
- [ ] Phase 5 re-test completed
- [ ] All critical bugs fixed
- [ ] All high-priority bugs fixed
- [ ] Screenshots captured
- [ ] Test reports generated
- [ ] User approval received

**DO NOT skip any phase. DO NOT mark complete without user approval.**
```

### Step 2: Update Implementation Plan Templates

For all future projects, add this as **Step 17** in the implementation plan:

```markdown
## Step 17: Comprehensive Validation & Testing (MANDATORY)

**Objective:** Validate MVP with automated testing loop before user presentation

**Validation Workflow:** See `.bmad/validation-workflow.yml`

### Phase 2: Comprehensive Playwright Testing

**Tool:** `mcp__builder-pro-mcp__test_ui`

**Tests to Run:**

1. **Homepage Test**
   ```
   URL: http://localhost:3000
   Screenshot: docs/screenshots/01-homepage.png
   Actions: None (load + screenshot + console check)
   ```

2. **Signup Flow Test**
   ```
   URL: http://localhost:3000/signup
   Screenshot: docs/screenshots/02-signup.png
   Actions:
   - Fill username (invalid: "ab") → verify error
   - Fill username (valid: "testuser123")
   - Fill email (valid format)
   - Fill password (invalid: "123") → verify error
   - Fill password (valid: "password123")
   - Click "Sign Up" button
   - Verify redirect to /feed
   - Check console for errors
   ```

3. **Login Flow Test**
   ```
   URL: http://localhost:3000/login
   Actions:
   - Fill email + password
   - Click "Sign In"
   - Verify redirect to /feed
   ```

4. **Feed Page Test**
   ```
   URL: http://localhost:3000/feed
   Actions:
   - Screenshot feed
   - Click upvote on first post
   - Verify count changes
   - Click "Create" button
   - Verify redirect to /post/create
   ```

5. **Post Creation Test**
   ```
   URL: http://localhost:3000/post/create
   Actions:
   - Fill title (short) → verify error
   - Fill title (valid)
   - Fill content (short) → verify error
   - Fill content (valid)
   - Click "Post"
   - Verify redirect + post appears in feed
   ```

6. **Post Detail + Comments Test**
   ```
   URL: http://localhost:3000/post/{id}
   Actions:
   - Click post from feed
   - Screenshot detail page
   - Fill comment + submit
   - Verify comment appears
   - Click "Reply" on comment
   - Fill reply + submit
   - Verify nested comment
   - Check console for errors
   ```

7. **Profile Test**
   ```
   URL: http://localhost:3000/profile/{username}
   Actions:
   - Click username link
   - Screenshot profile
   - Verify posts display
   ```

8. **Search Test**
   ```
   URL: http://localhost:3000/search
   Actions:
   - Fill search field
   - Submit search
   - Verify results
   - Click result link
   ```

9. **Navigation Test**
   ```
   Actions:
   - Click every nav link
   - Click user menu
   - Click "Logout"
   - Verify redirect to home
   ```

**Output:**
- Test report: `docs/validation/playwright-test-report.md`
- Bugs found: `docs/validation/bugs-found.md`
- Screenshots: `docs/screenshots/*.png`

### Phase 3: Run orchestrate_build

**Tool:** `mcp__builder-pro-mcp__orchestrate_build`

**Command:**
```javascript
mcp__builder-pro-mcp__orchestrate_build({
  projectPath: "/absolute/path/to/project",
  config: {
    frontend: { url: "http://localhost:3000" },
    backend: { url: null } // if applicable
  },
  autoFix: true,
  maxIterations: 3,
  stopOnCritical: false
})
```

**Output:** Comprehensive validation report with bug categorization

### Phase 4-6: Fix, Re-test, Evaluate

**Loop until:**
- All critical bugs fixed
- All high-priority bugs fixed
- No console errors
- All tests pass
- Max 3 iterations

### Phase 7: Present to User

**Show:**
- Test results summary
- Screenshots
- Validation reports
- Any remaining issues

**Request:** Human smoke test + approval

**Acceptance Criteria:**
- ✅ All automated tests pass
- ✅ User manually tests and approves
- ✅ No critical bugs
- ✅ Documentation complete

**DO NOT proceed to deployment without completing this step.**
```

### Step 3: Create Validation Script (Optional)

Create `.bmad/scripts/validate-completion.sh`:

```bash
#!/bin/bash

echo "🔍 Checking validation completion..."

# Check for required documentation
if [ ! -f "docs/validation/playwright-test-report.md" ]; then
  echo "❌ Missing: Playwright test report"
  echo "   Run comprehensive Playwright tests first"
  exit 1
fi

if [ ! -f "docs/validation/bugs-found.md" ]; then
  echo "❌ Missing: Bug report"
  exit 1
fi

if [ ! -d "docs/screenshots" ]; then
  echo "❌ Missing: Screenshots directory"
  echo "   Capture screenshots during testing"
  exit 1
fi

screenshot_count=$(ls docs/screenshots/*.png 2>/dev/null | wc -l)
if [ "$screenshot_count" -lt 5 ]; then
  echo "❌ Insufficient screenshots: $screenshot_count found (minimum 5)"
  exit 1
fi

# Check for user approval
if ! grep -q "User Approval: ✅" docs/validation/playwright-test-report.md; then
  echo "⚠️  User approval not found in test report"
  echo "   Add 'User Approval: ✅' to report after human smoke test"
  exit 1
fi

echo "✅ All validation requirements met!"
echo "   - Playwright tests: ✅"
echo "   - Bug report: ✅"
echo "   - Screenshots: $screenshot_count captured"
echo "   - User approval: ✅"
echo ""
echo "🎉 Ready to mark as complete!"
```

Make it executable:
```bash
chmod +x .bmad/scripts/validate-completion.sh
```

### Step 4: Add Git Hook (Optional)

Create `.git/hooks/pre-commit`:

```bash
#!/bin/bash

# Check if marking project as complete
if git diff --cached | grep -q "Status.*Complete\|MVP Complete"; then
  echo "🔍 Detected completion status change..."

  # Run validation script
  if [ -f ".bmad/scripts/validate-completion.sh" ]; then
    .bmad/scripts/validate-completion.sh
    if [ $? -ne 0 ]; then
      echo ""
      echo "❌ COMMIT BLOCKED: Validation incomplete"
      echo "   Complete all validation phases before marking as complete"
      exit 1
    fi
  fi
fi

echo "✅ Validation checks passed"
```

Make it executable:
```bash
chmod +x .git/hooks/pre-commit
```

---

## Usage Instructions

### For Claude Code (AI Agent)

When implementing a project:

1. Complete implementation (Steps 1-16)
2. **STOP** - Do not mark complete yet
3. Run Phase 2: Comprehensive Playwright tests
4. Document bugs found
5. Run Phase 3: orchestrate_build
6. Fix bugs (Phase 4)
7. Re-run Playwright tests (Phase 5)
8. Evaluate (Phase 6) - loop if needed (max 3 times)
9. Present results to user (Phase 7)
10. Wait for user approval
11. **THEN** mark as complete

### For Human Developers

After Claude Code implements features:

1. Review validation reports
2. Run manual smoke tests
3. Verify critical functionality
4. Approve or request changes
5. Only approve when satisfied with quality

---

## Benefits

✅ **No skipped testing** - Enforced workflow prevents premature completion
✅ **Comprehensive testing** - Every button, link, form tested
✅ **Automated fixing** - orchestrate_build auto-fixes many issues
✅ **Iterative improvement** - Loop ensures bugs are actually fixed
✅ **Documentation** - Standardized reports for every project
✅ **Quality assurance** - User only sees production-ready code

---

## Example: CommiSocial

For the CommiSocial project, this workflow would have:

1. Found bugs before user testing (console errors, broken links, etc.)
2. Auto-fixed configuration issues
3. Re-tested to verify fixes
4. Presented clean, working MVP to user
5. Saved time by catching issues early

**Result:** Higher quality, fewer surprises, better user experience

---

## Maintenance

### Updating Workflow

To modify the workflow:
1. Edit `.bmad/validation-workflow.yml`
2. Update templates in `.bmad/templates/`
3. Update CLAUDE.md integration instructions
4. Test changes on next project

### Adding New Tests

To add new Playwright tests:
1. Add test to `PLAYWRIGHT-TEST-REPORT-TEMPLATE.md`
2. Document expected behavior
3. Include in Phase 2 checklist

---

## Troubleshooting

### Issue: orchestrate_build fails

**Solution:** Check logs, fix critical issues manually, re-run

### Issue: Tests keep failing after 3 iterations

**Solution:** Document remaining issues, get user decision on whether to proceed or continue fixing

### Issue: Missing screenshots

**Solution:** Re-run Playwright tests with screenshot actions

---

**Integration Complete!** Follow this workflow for all future BMAD projects.
