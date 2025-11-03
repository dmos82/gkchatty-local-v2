# Session-Persistent Testing Guide

## Overview

This guide explains how to use the session-persistent testing script to test authenticated admin flows while maintaining login state across multiple pages.

---

## The Problem We're Solving

**Standard Playwright `test_ui` Issue:**
- Each test creates a NEW browser context
- Login cookies are lost between tests
- Can't test multi-page authenticated flows

**Our Solution:**
- Single browser context for entire test flow
- Cookies persist across page navigations
- Can test Login → Admin → Users → Audit Logs → Settings

---

## Quick Start

### 1. Set Your Credentials

Create a `.env` file or export variables:

```bash
export TEST_USER_EMAIL="your-admin-email@example.com"
export TEST_USER_PASSWORD="your-password"
```

Or edit the script directly (line 16-19):
```javascript
credentials: {
  email: 'your-email@example.com',  // ← Change this
  password: 'your-password'          // ← Change this
}
```

### 2. Ensure Dev Server is Running

```bash
npm run dev
# Should be running at http://localhost:3000
```

### 3. Run the Tests

```bash
node scripts/test-authenticated-flow.js
```

---

## What It Tests

The script runs 6 sequential steps with session persistence:

### Step 1: Login
- Navigates to `/login`
- Fills email and password
- Clicks submit
- Waits for redirect to `/feed` or `/admin`
- **Session created** ← Cookies saved

### Step 2: Access Admin Dashboard
- Navigates to `/admin` (using session from Step 1)
- Verifies not redirected back to login
- Checks for dashboard content
- Takes screenshot

### Step 3: Navigate to Users Page
- Navigates to `/admin/users` (still authenticated)
- Waits for table to load
- Counts visible users
- Takes screenshot

### Step 4: Test User Search
- Finds search input
- Types "david"
- Waits for filter results
- Takes before/after screenshots

### Step 5: Navigate to Audit Logs
- Navigates to `/admin/audit-logs`
- Checks for table
- Counts log entries
- Takes screenshot

### Step 6: Navigate to Settings
- Navigates to `/admin/settings`
- Checks if redirected (non-super_admin)
- Takes screenshot

---

## Output

### Screenshots

All screenshots saved to:
```
docs/screenshots/authenticated/
├── 01-login-page.png
├── 02-login-filled.png
├── 03-login-success.png
├── 04-admin-dashboard.png
├── 05-users-page.png
├── 06-search-filled.png
├── 07-search-results.png
├── 08-audit-logs.png
├── 09-settings.png
└── ERROR-*.png (if failures occur)
```

### Session State

Session saved to:
```
docs/screenshots/session-state.json
```

Contains:
- Cookies
- localStorage
- sessionStorage
- Origins

Can be reused for future tests!

### Console Output

```
🚀 Starting Authenticated Flow Testing

Configuration:
  Base URL: http://localhost:3000
  Email: david@example.com
  Screenshot dir: docs/screenshots/authenticated
  Headless: false

📋 Step: Login
   URL: /login
✅ Login successful
   Current URL: http://localhost:3000/admin
   ✅ PASS

📋 Step: Access Admin Dashboard
   URL: /admin
✅ Admin dashboard loaded
   Has user management: true
   Has stat cards: true
   ✅ PASS

... (more steps)

============================================================
📊 TEST SUMMARY
============================================================

✅ Passed: 6/6
❌ Failed: 0/6

Screenshots saved to: docs/screenshots/authenticated
Session state saved to: docs/screenshots/session-state.json
```

---

## Configuration Options

Edit `CONFIG` object in the script:

```javascript
const CONFIG = {
  baseURL: 'http://localhost:3000',  // Change for different environments

  credentials: {
    email: process.env.TEST_USER_EMAIL || 'default@example.com',
    password: process.env.TEST_USER_PASSWORD || 'default-password'
  },

  screenshotDir: path.join(__dirname, '../docs/screenshots/authenticated'),

  timeout: 30000,  // 30 seconds max per action

  headless: false  // true = no browser window (CI/CD)
                   // false = visible browser (debugging)
};
```

---

## Customizing Test Flow

Add new steps to `TEST_FLOW` array:

```javascript
{
  name: 'Test User Creation',
  url: '/admin/users',
  actions: async (page) => {
    // Click "Create User" button
    await page.click('button:has-text("Create User")');

    // Fill form
    await page.fill('#username', 'testuser');
    await page.fill('#email', 'test@example.com');

    // Screenshot
    await page.screenshot({
      path: path.join(CONFIG.screenshotDir, '10-create-user.png')
    });

    // Submit
    await page.click('button[type="submit"]');

    console.log('✅ User created');
  }
}
```

---

## Advanced: Reusing Sessions

### Save Session Once

```bash
# Login and save session
node scripts/test-authenticated-flow.js
# Creates: docs/screenshots/session-state.json
```

### Reuse in Future Tests

Modify script to load saved session:

```javascript
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  storageState: './docs/screenshots/session-state.json'  // ← Load saved session
});
```

Now you skip login step entirely!

---

## Comparison: Before vs After

### Before (session-isolation)

```javascript
// Test 1: Login
test_ui({ url: '/login', actions: [/* login */] })
// ✅ PASS

// Test 2: Admin (FAILS - new session, no cookies!)
test_ui({ url: '/admin', actions: [/* test */] })
// ❌ FAIL - Redirected to login
```

**Problem:** Can't test admin features

### After (session-persistent)

```javascript
// Single test flow with persistent session
runAuthenticatedTests()
// Step 1: Login ✅
// Step 2: Admin ✅ (cookies from step 1!)
// Step 3: Users ✅ (still authenticated)
// Step 4: Search ✅ (still authenticated)
// Step 5: Audit Logs ✅ (still authenticated)
// Step 6: Settings ✅ (still authenticated)
```

**Solution:** All authenticated features testable!

---

## Troubleshooting

### Error: "Login successful but redirected to /feed instead of /admin"

**Cause:** User doesn't have admin role

**Solution:**
1. Check user role in database
2. Update via SQL:
   ```sql
   UPDATE profiles SET role = 'admin' WHERE email = 'your-email@example.com';
   ```

### Error: "Timeout waiting for selector"

**Cause:** Element doesn't exist or takes too long to load

**Solution:**
1. Increase timeout: `CONFIG.timeout = 60000` (60 seconds)
2. Check element exists on page
3. Use `waitForSelector` with longer timeout

### Error: "Settings page redirected"

**Cause:** User is `admin`, not `super_admin`

**Solution:** This is expected behavior. Settings requires `super_admin` role.

### Screenshots show blank pages

**Cause:** Page didn't finish loading

**Solution:** Add `waitUntil: 'networkidle'` to navigation

---

## Integration with CI/CD

### GitHub Actions Example

```yaml
name: E2E Admin Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Install dependencies
        run: npm install

      - name: Start dev server
        run: npm run dev &

      - name: Run authenticated tests
        env:
          TEST_USER_EMAIL: ${{ secrets.TEST_USER_EMAIL }}
          TEST_USER_PASSWORD: ${{ secrets.TEST_USER_PASSWORD }}
        run: node scripts/test-authenticated-flow.js

      - name: Upload screenshots
        if: failure()
        uses: actions/upload-artifact@v3
        with:
          name: test-screenshots
          path: docs/screenshots/authenticated/
```

---

## Benefits

### ✅ Tests Real User Experience
- Logs in like a real user
- Maintains session across pages
- Tests actual authenticated flows

### ✅ Catches Real Bugs
- Finds navigation issues
- Detects redirect loops
- Verifies role-based access

### ✅ Visual Verification
- Screenshots at every step
- Error screenshots on failures
- Easy to debug issues

### ✅ Reusable Sessions
- Save session once
- Reuse for multiple tests
- Faster test runs

### ✅ No False Positives
- Tests complete user journeys
- Fails when features actually broken
- Passes when features actually work

---

## Limitations

### Requires Real Credentials
- Must have valid user account
- Must know password
- Can't test signup flow easily

### Sequential Only
- Tests run one after another
- Can't parallelize easily
- Slower than isolated tests

### Browser Dependent
- Uses Chromium by default
- Cross-browser testing requires changes
- Mobile testing needs viewport adjustment

---

## Next Steps

1. **Run the tests** with your credentials
2. **Check the screenshots** to verify each step
3. **Customize the flow** for your specific needs
4. **Integrate with CI/CD** for automated testing

---

## Related Documents

- `docs/testing/2025-10-28-playwright-false-positive-analysis.md` - Why session persistence matters
- `docs/validation/post-fix-validation-report.md` - Current validation status
- `.bmad/validation-workflow-enhanced.yml` - Enhanced validation workflow

---

**Created:** 2025-10-28
**Purpose:** Enable authenticated admin flow testing
**Solves:** Playwright session isolation issue
**Status:** Ready to use
