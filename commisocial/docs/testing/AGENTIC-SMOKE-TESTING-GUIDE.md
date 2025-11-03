# Agentic Smoke Testing Guide

## Overview

This system enables **data-driven, session-persistent smoke testing with auto-fix loops**. No need to write a new script for every test - just update a JSON config file!

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│           Smoke Test Configuration                   │
│        (tests/smoke-test-config.json)               │
│   - Define test suites in JSON                     │
│   - Add new tests without writing code             │
└────────────────┬────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────┐
│         Generic Test Runner                         │
│    (scripts/run-smoke-tests.js)                    │
│   - Reads config                                    │
│   - Runs tests with session persistence            │
│   - Detects errors                                  │
│   - Takes screenshots                               │
│   - Generates reports                               │
└────────────────┬────────────────────────────────────┘
                 │
                 ▼
         ┌──── Errors? ────┐
         │                  │
        YES                NO
         │                  │
         ▼                  ▼
┌──────────────────┐  ┌──────────────────┐
│  Auto-Fix Loop   │  │   All Passed!    │
│  (max 3 times)   │  │   ✅ Done        │
└──────┬───────────┘  └──────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────┐
│      Builder Pro Auto-Fix                            │
│   (scripts/builder-pro-auto-fix.js)                 │
│   - Analyzes errors                                  │
│   - Categorizes by type                              │
│   - Applies fixes automatically                      │
│   - Rebuilds project                                 │
└────────────────┬────────────────────────────────────┘
                 │
                 ▼
         Re-run tests ───┐
                          │
                          └─── Loop until pass or max iterations
```

---

## Quick Start

### 1. Define Your Test Suite

Edit `tests/smoke-test-config.json`:

```json
{
  "testSuites": {
    "my-feature": {
      "name": "My Feature Tests",
      "credentials": {
        "email": "test-admin@commisocial.local",
        "password": "TestAdmin123!"
      },
      "steps": [
        {
          "name": "Login",
          "url": "/login",
          "actions": [
            { "type": "fill", "selector": "#email", "value": "{{credentials.email}}" },
            { "type": "fill", "selector": "#password", "value": "{{credentials.password}}" },
            { "type": "click", "selector": "button[type='submit']" }
          ],
          "assertions": [
            { "type": "url", "contains": "/feed|/admin" },
            { "type": "noErrors" }
          ]
        },
        {
          "name": "Test My Feature",
          "url": "/my-feature",
          "assertions": [
            { "type": "selector", "exists": "h1" },
            { "type": "noErrors" }
          ]
        }
      ]
    }
  }
}
```

### 2. Run Tests

```bash
# Run specific test suite
node scripts/run-smoke-tests.js my-feature

# Run with auto-fix disabled
AUTO_FIX=false node scripts/run-smoke-tests.js my-feature

# Run in CI mode (headless)
CI=true node scripts/run-smoke-tests.js my-feature
```

### 3. Review Results

The runner will:
- Execute all steps with session persistence
- Take screenshots at each step
- Detect and categorize errors
- Attempt auto-fixes (if enabled)
- Re-run tests after fixes
- Generate comprehensive report

---

## Configuration Reference

### Test Suite Structure

```json
{
  "testSuites": {
    "suite-name": {
      "name": "Human-readable name",
      "credentials": {
        "email": "user@example.com",
        "password": "password"
      },
      "steps": [/* steps */]
    }
  }
}
```

### Step Structure

```json
{
  "name": "Step Name",
  "url": "/path/to/page",
  "actions": [/* optional actions */],
  "assertions": [/* optional assertions */]
}
```

### Actions

**Fill Input:**
```json
{ "type": "fill", "selector": "#email", "value": "test@example.com" }
```

**Click Element:**
```json
{ "type": "click", "selector": "button[type='submit']" }
```

**Wait for Navigation:**
```json
{ "type": "waitForNavigation", "expect": "/admin|/feed" }
```

**Wait (delay):**
```json
{ "type": "wait", "duration": 2000 }
```

### Assertions

**Check URL:**
```json
// Exact match
{ "type": "url", "equals": "/admin" }

// Pattern match
{ "type": "url", "contains": "/admin|/dashboard" }
```

**Check Element Exists:**
```json
{ "type": "selector", "exists": "h1:has-text('Dashboard')" }
```

**Check Element Count:**
```json
// At least N elements
{ "type": "selector", "count": "tbody tr", "min": 1 }

// Exactly N elements
{ "type": "selector", "count": "tbody tr", "min": 5, "max": 5 }

// At most N elements
{ "type": "selector", "count": "tbody tr", "max": 10 }
```

**No Console/Page Errors:**
```json
{ "type": "noErrors" }
```

### Variable Interpolation

Use `{{variable}}` syntax in values:

```json
// Credentials
"value": "{{credentials.email}}"
"value": "{{credentials.password}}"

// Timestamp (for unique values)
"value": "user{{timestamp}}@example.com"
```

---

## Auto-Fix Capabilities

The auto-fix system can automatically fix:

### ✅ Automatically Fixable

1. **Client Component Errors**
   - Adds `'use client'` directive to files with event handlers

2. **Missing Routes**
   - Detects when route files don't exist

### ⚠️ Requires Manual Review

3. **Server Errors (500)**
   - Logs the issue for manual review
   - Future: Will use Builder Pro MCP `review_file` + `auto_fix`

4. **Type Errors**
   - Logs the issue
   - Future: Will use Builder Pro MCP TypeScript fixer

### 🔄 Auto-Fix Loop

```
Iteration 1: Run tests
  ↓
  Errors found? → Yes
  ↓
  Apply auto-fixes
  ↓
Iteration 2: Re-run tests
  ↓
  Errors found? → Yes
  ↓
  Apply auto-fixes
  ↓
Iteration 3: Re-run tests
  ↓
  Errors found? → No
  ↓
✅ All tests passed!
```

**Maximum 3 iterations** to prevent infinite loops.

---

## Example Test Suites

### Admin Dashboard

```json
{
  "admin-full": {
    "name": "Admin Full Flow",
    "credentials": {
      "email": "test-admin@commisocial.local",
      "password": "TestAdmin123!"
    },
    "steps": [
      {
        "name": "Login",
        "url": "/login",
        "actions": [
          { "type": "fill", "selector": "#email", "value": "{{credentials.email}}" },
          { "type": "fill", "selector": "#password", "value": "{{credentials.password}}" },
          { "type": "click", "selector": "button[type='submit']" },
          { "type": "waitForNavigation", "expect": "/admin" }
        ],
        "assertions": [
          { "type": "url", "contains": "/admin" },
          { "type": "noErrors" }
        ]
      },
      {
        "name": "View Users",
        "url": "/admin/users",
        "assertions": [
          { "type": "selector", "exists": "table" },
          { "type": "selector", "count": "tbody tr", "min": 1 },
          { "type": "noErrors" }
        ]
      }
    ]
  }
}
```

### User Signup Flow

```json
{
  "user-signup": {
    "name": "User Signup Flow",
    "steps": [
      {
        "name": "Signup",
        "url": "/signup",
        "actions": [
          { "type": "fill", "selector": "#username", "value": "testuser{{timestamp}}" },
          { "type": "fill", "selector": "#email", "value": "test{{timestamp}}@test.com" },
          { "type": "fill", "selector": "#password", "value": "TestPass123!" },
          { "type": "click", "selector": "button[type='submit']" }
        ],
        "assertions": [
          { "type": "url", "contains": "/feed" },
          { "type": "noErrors" }
        ]
      },
      {
        "name": "View Feed",
        "url": "/feed",
        "assertions": [
          { "type": "selector", "exists": "text=Welcome" },
          { "type": "noErrors" }
        ]
      }
    ]
  }
}
```

### E-Commerce Checkout

```json
{
  "checkout-flow": {
    "name": "Checkout Flow",
    "credentials": {
      "email": "customer@example.com",
      "password": "pass123"
    },
    "steps": [
      {
        "name": "Add to Cart",
        "url": "/products/123",
        "actions": [
          { "type": "click", "selector": "button:has-text('Add to Cart')" }
        ],
        "assertions": [
          { "type": "selector", "exists": "text=Added to cart" }
        ]
      },
      {
        "name": "View Cart",
        "url": "/cart",
        "assertions": [
          { "type": "selector", "count": ".cart-item", "min": 1 }
        ]
      },
      {
        "name": "Checkout",
        "url": "/checkout",
        "actions": [
          { "type": "fill", "selector": "#card-number", "value": "4242424242424242" },
          { "type": "fill", "selector": "#card-exp", "value": "12/25" },
          { "type": "fill", "selector": "#card-cvc", "value": "123" },
          { "type": "click", "selector": "button[type='submit']" }
        ],
        "assertions": [
          { "type": "url", "contains": "/order/confirmation" }
        ]
      }
    ]
  }
}
```

---

## Advanced Usage

### Environment Variables

```bash
# Base URL
BASE_URL=https://staging.example.com node scripts/run-smoke-tests.js admin-full

# Disable auto-fix
AUTO_FIX=false node scripts/run-smoke-tests.js admin-full

# Headless mode (CI)
CI=true node scripts/run-smoke-tests.js admin-full

# Custom credentials
TEST_USER_EMAIL=custom@example.com TEST_USER_PASSWORD=pass123 node scripts/run-smoke-tests.js admin-full
```

### CI/CD Integration

**GitHub Actions:**

```yaml
name: Smoke Tests

on: [push, pull_request]

jobs:
  smoke-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Install dependencies
        run: npm install

      - name: Start dev server
        run: npm run dev &

      - name: Wait for server
        run: npx wait-on http://localhost:3000

      - name: Run smoke tests
        env:
          CI: true
          AUTO_FIX: true
        run: node scripts/run-smoke-tests.js admin-full

      - name: Upload screenshots
        if: failure()
        uses: actions/upload-artifact@v3
        with:
          name: smoke-test-screenshots
          path: docs/screenshots/smoke-tests/
```

### Programmatic Usage

```javascript
const { SmokeTestRunner } = require('./scripts/run-smoke-tests');

async function myCustomWorkflow() {
  const config = require('./tests/smoke-test-config.json');
  const runner = new SmokeTestRunner('admin-full', config.testSuites['admin-full']);

  const results = await runner.run();

  if (results.failed.length > 0) {
    // Custom error handling
    await sendSlackNotification(results);
  }

  return results;
}
```

---

## Benefits vs. Hardcoded Scripts

### ❌ Old Way (Hardcoded Scripts)

```javascript
// scripts/test-admin-flow.js
async function testAdminFlow() {
  await page.goto('/login');
  await page.fill('#email', 'admin@example.com');
  await page.fill('#password', 'pass123');
  await page.click('button[type="submit"]');
  // ... 50 more lines
}

// scripts/test-user-flow.js
async function testUserFlow() {
  await page.goto('/signup');
  // ... another 50 lines
}
```

**Problems:**
- ❌ Need new script for every test suite
- ❌ Hard to maintain (code changes)
- ❌ No standardization
- ❌ Can't easily add new tests

### ✅ New Way (Data-Driven)

```json
{
  "admin-flow": { /* config */ },
  "user-flow": { /* config */ }
}
```

**Benefits:**
- ✅ One runner, infinite test suites
- ✅ Add tests by editing JSON
- ✅ Standardized format
- ✅ Easy to maintain
- ✅ Session persistence built-in
- ✅ Auto-fix loop included
- ✅ Screenshots automatic
- ✅ Reports automatic

---

## Comparison

| Feature | Hardcoded | Data-Driven |
|---------|-----------|-------------|
| Add new test | Write new script | Edit JSON |
| Session persistence | Manual | Built-in |
| Screenshots | Manual | Automatic |
| Error detection | Manual | Automatic |
| Auto-fix | None | Included |
| Reports | Manual | Automatic |
| Maintenance | High | Low |
| Learning curve | JavaScript | JSON |

---

## Troubleshooting

### Tests fail on first run but pass on second

**Cause:** Build cache corruption or slow initial load

**Solution:** Clean .next before testing
```bash
rm -rf .next && node scripts/run-smoke-tests.js admin-full
```

### "Selector not found" errors

**Cause:** Element doesn't exist or takes time to load

**Solution:** Add wait action before assertion
```json
{
  "actions": [
    { "type": "wait", "duration": 2000 }
  ],
  "assertions": [
    { "type": "selector", "exists": ".my-element" }
  ]
}
```

### Auto-fix doesn't fix server errors

**Cause:** Auto-fix for 500 errors requires Builder Pro MCP integration

**Solution:** This is future work. For now, fix manually and re-run.

---

## Roadmap

### Phase 1 (Current): ✅
- [x] Data-driven test configuration
- [x] Session-persistent testing
- [x] Generic test runner
- [x] Auto-fix for client component errors
- [x] Screenshot capture
- [x] Report generation

### Phase 2 (Next):
- [ ] Full Builder Pro MCP integration
- [ ] Auto-fix for server errors
- [ ] Auto-fix for type errors
- [ ] Visual regression testing
- [ ] Parallel test execution

### Phase 3 (Future):
- [ ] AI-powered test generation
- [ ] Self-healing tests
- [ ] Performance metrics
- [ ] Load testing integration

---

## Related Documents

- `SESSION-PERSISTENT-TESTING-GUIDE.md` - Deep dive into session persistence
- `2025-10-28-playwright-false-positive-analysis.md` - Why we built this
- `.bmad/validation-workflow-enhanced.yml` - BMAD validation workflow
- `tests/smoke-test-config.json` - Test configuration file

---

**Created:** 2025-10-28
**Purpose:** Enable scalable, data-driven smoke testing with auto-fix
**Status:** Ready to use
**Maintainer:** Builder Pro Team
