# Playwright Test Report

**Project:** {PROJECT_NAME}
**Date:** {DATE}
**Test Run:** {ITERATION_NUMBER}
**Status:** {PASS/FAIL}

---

## Test Summary

| Metric | Count |
|--------|-------|
| Total Tests | {TOTAL} |
| Passed | {PASSED} |
| Failed | {FAILED} |
| Console Errors | {ERRORS} |
| Screenshots | {SCREENSHOTS} |

---

## Test Results by Category

### 1. Homepage & Landing Pages

**Test:** Homepage loads and displays correctly
- **URL:** http://localhost:3000
- **Screenshot:** `docs/screenshots/01-homepage.png`
- **Console Errors:** {COUNT}
- **Result:** ✅ PASS / ❌ FAIL
- **Notes:** {NOTES}

---

### 2. Authentication Flow

**Test 2.1:** Signup page loads
- **URL:** /signup
- **Screenshot:** `docs/screenshots/02-signup.png`
- **Console Errors:** {COUNT}
- **Result:** ✅ PASS / ❌ FAIL

**Test 2.2:** Signup validation works
- **Action:** Fill form with invalid data
- **Expected:** Show validation errors
- **Actual:** {RESULT}
- **Result:** ✅ PASS / ❌ FAIL
- **Notes:** {NOTES}

**Test 2.3:** Signup submission works
- **Action:** Fill form with valid data + submit
- **Expected:** Create account + redirect to /feed
- **Actual:** {RESULT}
- **Result:** ✅ PASS / ❌ FAIL
- **Console Errors:** {COUNT}

**Test 2.4:** Login page loads
- **URL:** /login
- **Screenshot:** `docs/screenshots/03-login.png`
- **Result:** ✅ PASS / ❌ FAIL

**Test 2.5:** Login works
- **Action:** Submit valid credentials
- **Expected:** Redirect to /feed
- **Actual:** {RESULT}
- **Result:** ✅ PASS / ❌ FAIL

---

### 3. Navigation Testing

**Test 3.1:** All header links work
- **Links Tested:**
  - [ ] CommiSocial logo → /
  - [ ] Feed → /feed
  - [ ] Search → /search
  - [ ] Create button → /post/create
  - [ ] User menu dropdown
  - [ ] Profile link → /profile/{username}
  - [ ] Logout button
- **Console Errors:** {COUNT}
- **Result:** ✅ PASS / ❌ FAIL

---

### 4. Feed Page Testing

**Test 4.1:** Feed page loads
- **URL:** /feed
- **Screenshot:** `docs/screenshots/04-feed.png`
- **Console Errors:** {COUNT}
- **Result:** ✅ PASS / ❌ FAIL

**Test 4.2:** Posts display correctly
- **Expected:** List of posts with titles, content, vote counts
- **Actual:** {RESULT}
- **Result:** ✅ PASS / ❌ FAIL

**Test 4.3:** Vote buttons work
- **Actions Tested:**
  - [ ] Click upvote → count increases
  - [ ] Click upvote again → count decreases (remove vote)
  - [ ] Click downvote → count changes
  - [ ] Vote persists on refresh
- **Console Errors:** {COUNT}
- **Result:** ✅ PASS / ❌ FAIL

**Test 4.4:** Post links work
- **Action:** Click post title
- **Expected:** Navigate to /post/{id}
- **Actual:** {RESULT}
- **Result:** ✅ PASS / ❌ FAIL

---

### 5. Post Creation Testing

**Test 5.1:** Create post page loads
- **URL:** /post/create
- **Screenshot:** `docs/screenshots/05-create-post.png`
- **Console Errors:** {COUNT}
- **Result:** ✅ PASS / ❌ FAIL

**Test 5.2:** Form validation works
- **Actions Tested:**
  - [ ] Title too short → shows error
  - [ ] Content too short → shows error
  - [ ] Character counter updates
- **Result:** ✅ PASS / ❌ FAIL

**Test 5.3:** Post submission works
- **Action:** Fill valid form + submit
- **Expected:** Create post + redirect to /feed + post appears
- **Actual:** {RESULT}
- **Console Errors:** {COUNT}
- **Result:** ✅ PASS / ❌ FAIL

**Test 5.4:** Cancel button works
- **Action:** Click cancel
- **Expected:** Navigate back
- **Actual:** {RESULT}
- **Result:** ✅ PASS / ❌ FAIL

---

### 6. Post Detail & Comments Testing

**Test 6.1:** Post detail page loads
- **URL:** /post/{id}
- **Screenshot:** `docs/screenshots/06-post-detail.png`
- **Console Errors:** {COUNT}
- **Result:** ✅ PASS / ❌ FAIL

**Test 6.2:** Comment form works
- **Action:** Write comment + submit
- **Expected:** Comment appears below post
- **Actual:** {RESULT}
- **Console Errors:** {COUNT}
- **Result:** ✅ PASS / ❌ FAIL

**Test 6.3:** Reply to comment works
- **Actions Tested:**
  - [ ] Click "Reply" button
  - [ ] Reply form appears
  - [ ] Submit reply
  - [ ] Nested comment appears
  - [ ] Cancel button closes form
- **Result:** ✅ PASS / ❌ FAIL

**Test 6.4:** Comment threading works
- **Action:** Create multiple nested replies
- **Expected:** Comments nest up to 5 levels with indentation
- **Actual:** {RESULT}
- **Result:** ✅ PASS / ❌ FAIL

**Test 6.5:** Collapse/expand replies works
- **Action:** Click show/hide replies
- **Expected:** Reply tree toggles visibility
- **Actual:** {RESULT}
- **Result:** ✅ PASS / ❌ FAIL

---

### 7. Profile Testing

**Test 7.1:** Profile page loads
- **URL:** /profile/{username}
- **Screenshot:** `docs/screenshots/07-profile.png`
- **Console Errors:** {COUNT}
- **Result:** ✅ PASS / ❌ FAIL

**Test 7.2:** Profile displays user info
- **Expected:** Username, display name, bio, join date
- **Actual:** {RESULT}
- **Result:** ✅ PASS / ❌ FAIL

**Test 7.3:** User's posts display
- **Expected:** List of posts by that user
- **Actual:** {RESULT}
- **Result:** ✅ PASS / ❌ FAIL

**Test 7.4:** Profile links work
- **Action:** Click username throughout app
- **Expected:** Navigate to profile page
- **Result:** ✅ PASS / ❌ FAIL

---

### 8. Search Testing

**Test 8.1:** Search page loads
- **URL:** /search
- **Screenshot:** `docs/screenshots/08-search.png`
- **Console Errors:** {COUNT}
- **Result:** ✅ PASS / ❌ FAIL

**Test 8.2:** Search returns results
- **Action:** Search for "test"
- **Expected:** Display matching posts and users
- **Actual:** {RESULT}
- **Console Errors:** {COUNT}
- **Result:** ✅ PASS / ❌ FAIL

**Test 8.3:** Search result links work
- **Actions Tested:**
  - [ ] Click user result → navigate to profile
  - [ ] Click post result → navigate to post detail
- **Result:** ✅ PASS / ❌ FAIL

**Test 8.4:** Empty search handled
- **Action:** Submit empty search
- **Expected:** Show empty state message
- **Actual:** {RESULT}
- **Result:** ✅ PASS / ❌ FAIL

---

### 9. Logout Testing

**Test 9.1:** Logout works
- **Actions Tested:**
  - [ ] Click user menu
  - [ ] Click "Logout"
  - [ ] Redirect to home
  - [ ] Header shows login/signup buttons
  - [ ] Cannot access protected routes
- **Console Errors:** {COUNT}
- **Result:** ✅ PASS / ❌ FAIL

---

## Console Errors Found

### Critical Errors (Block MVP)
```
{LIST OF CRITICAL CONSOLE ERRORS}
```

### Warnings
```
{LIST OF WARNINGS}
```

---

## Bugs Found

See detailed bug report: `docs/validation/bugs-found.md`

### Critical Bugs
- {BUG #1}
- {BUG #2}

### High Priority Bugs
- {BUG #3}
- {BUG #4}

### Medium Priority Bugs
- {BUG #5}

### Low Priority Issues
- {BUG #6}

---

## Screenshots Captured

All screenshots saved to: `docs/screenshots/`

- `01-homepage.png`
- `02-signup.png`
- `03-login.png`
- `04-feed.png`
- `05-create-post.png`
- `06-post-detail.png`
- `07-profile.png`
- `08-search.png`

---

## Overall Assessment

**Status:** {PASS/FAIL/PASS WITH WARNINGS}

**Summary:** {BRIEF SUMMARY OF RESULTS}

**Ready for Next Phase:** {YES/NO}

**Recommendations:**
- {RECOMMENDATION 1}
- {RECOMMENDATION 2}

---

**Test Conducted By:** Claude Code + Builder Pro MCP
**Next Action:** {PROCEED TO ORCHESTRATE_BUILD / FIX BUGS / PRESENT TO USER}
