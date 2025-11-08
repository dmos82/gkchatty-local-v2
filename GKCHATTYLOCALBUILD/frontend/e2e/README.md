# E2E Testing Guide - GKCHATTY

## Overview

This directory contains **End-to-End (E2E) tests** for the GKCHATTY application using **Playwright**. The test suite validates complete user journeys from authentication through document management to RAG-powered chat interactions.

**Total Test Coverage**: 81 tests across 5 journeys

---

## 🔐 Admin-Controlled User Creation Model

### Important Security Architecture

**GKCHATTY does NOT support user self-registration.** This is a deliberate security design choice.

- **✅ User Creation**: Only admins can create user accounts via the admin dashboard
- **❌ Public Registration**: No `/register` route exists in the frontend
- **📧 Email Optional**: Email field is a placeholder (can be left blank for now)

### Implications for E2E Tests

All tests must use **admin-created users** instead of expecting self-registration:

1. **Before tests run**: `setupTestUsers()` creates users via admin API
2. **Tests execute**: Users login with pre-created credentials
3. **After tests complete**: `cleanupTestUsers()` deletes test users

---

## Prerequisites

### 1. Admin Account Required

You **MUST** have an admin account created before running E2E tests.

**Create admin user** (run this script once):

```bash
cd apps/api
npx ts-node src/scripts/create-admin-user.ts
```

This will create:
- **Username**: `admin`
- **Password**: (you'll set this when prompted)
- **Role**: `admin`

### 2. Environment Variables

Create `.env.test` in `/apps/web/`:

```bash
# Admin credentials for creating test users
E2E_ADMIN_USERNAME=admin
E2E_ADMIN_PASSWORD=your-actual-admin-password

# API URL
NEXT_PUBLIC_API_URL=http://localhost:6001/api

# Optional: Log level
E2E_LOG_LEVEL=info
```

**⚠️ Security**: Add `.env.test` to `.gitignore` to prevent committing credentials

### 3. Services Running

Ensure these services are running:

```bash
# Terminal 1: API Server
cd apps/api
pnpm dev  # Runs on http://localhost:6001

# Terminal 2: Web Frontend
cd apps/web
pnpm dev  # Runs on http://localhost:3000
```

### 4. Dependencies Installed

```bash
cd apps/web
pnpm install
pnpm exec playwright install  # Install browser binaries
```

---

## Test Architecture

### Page Object Model (POM)

Tests use the **Page Object Model** design pattern:

```
e2e/
├── page-objects/        # Page Object Models
│   ├── AuthPage.ts      # Login operations (NO registration)
│   ├── ChatPage.ts      # Chat interface
│   ├── DocumentsPage.ts # Document management
│   └── AdminPage.ts     # Admin operations
├── fixtures/            # Test data and utilities
│   ├── test-users.ts    # User fixtures + setupTestUsers()
│   ├── test-documents.ts# Document fixtures
│   └── admin-api.ts     # Admin API helper
├── journeys/            # Test suites
│   ├── journey-1-login-upload-chat.spec.ts           # 15 tests
│   ├── journey-2-admin-setup-config-users.spec.ts    # 22 tests
│   ├── journey-3-document-management-folders.spec.ts # 18 tests
│   ├── journey-4-kb-isolation-multitenant.spec.ts    # 11 tests 🔒 SECURITY
│   └── journey-5-multi-session-handling.spec.ts      # 15 tests
└── utils/               # Logging and utilities
```

### Test User Setup Flow

```typescript
// Journey Test Structure
test.describe('Journey X', () => {
  test.beforeAll(async () => {
    // 1. Create users via admin API
    await setupTestUsers();  // Creates: regularUser, adminUser, tenantA, tenantB

    // 2. Setup test data
    await createTestFiles();
  });

  test.afterAll(async () => {
    // Cleanup: Delete test users
    await cleanupTestUsers();
  });

  test('test name', async ({ page }) => {
    // Tests use pre-created users
    await authPage.login(TEST_USERS.regularUser.username, TEST_USERS.regularUser.password);
  });
});
```

---

## Running Tests

### Run All Tests

```bash
cd apps/web
pnpm test:e2e
```

### Run Specific Journey

```bash
# Journey 1: Login → Upload → Chat
pnpm exec playwright test journey-1

# Journey 2: Admin Operations
pnpm exec playwright test journey-2

# Journey 3: Document Management
pnpm exec playwright test journey-3

# Journey 4: KB Isolation (SECURITY CRITICAL)
pnpm exec playwright test journey-4

# Journey 5: Multi-Session
pnpm exec playwright test journey-5
```

### Run Single Test

```bash
pnpm exec playwright test journey-1 --grep "should complete full user journey"
```

### Debug Mode

```bash
# Interactive UI mode
pnpm exec playwright test --ui

# Headed mode (see browser)
pnpm exec playwright test --headed

# Debug specific test
pnpm exec playwright test journey-1 --debug
```

### Parallel Execution

```bash
# Run with 4 workers (faster)
pnpm exec playwright test --workers=4

# Run serially (debugging)
pnpm exec playwright test --workers=1
```

---

## Test Journeys

### Journey 1: Login → Upload → Chat (15 tests)

**File**: `journey-1-login-upload-chat.spec.ts`

**Flow**:
1. Login with admin-created user
2. Upload document (TXT, PDF, MD)
3. Wait for processing
4. Ask RAG questions
5. Verify context-aware responses

**Tests**:
- ✅ Happy path (login → upload → chat)
- ✅ Login validation (wrong password, non-existent user)
- ✅ Document upload (text, PDF, markdown)
- ✅ Unsupported file rejection
- ✅ RAG query validation
- ✅ Context maintenance across messages
- ✅ Session management (logout, re-login)

---

### Journey 2: Admin Operations (22 tests)

**File**: `journey-2-admin-setup-config-users.spec.ts`

**Flow**:
1. Admin logs in
2. Updates OpenAI settings
3. Creates new users
4. Updates user roles
5. Views system statistics
6. Manages KB settings

**Tests**:
- ✅ Admin authentication
- ✅ Settings management (OpenAI API, system prompt)
- ✅ User CRUD (create, update, delete)
- ✅ Role management (user ↔ admin)
- ✅ System statistics
- ✅ KB mode configuration

---

### Journey 3: Document Management (18 tests)

**File**: `journey-3-document-management-folders.spec.ts`

**Flow**:
1. Create folders
2. Upload documents to folders
3. Move documents between folders
4. Rename folders
5. Delete documents (verify vector cleanup)
6. Cascade delete folders

**Tests**:
- ✅ Folder CRUD operations
- ✅ Document upload to folders
- ✅ Document move operations
- ✅ Cascade delete verification
- ✅ Vector cleanup (Pinecone)
- ✅ Storage cleanup (S3/local)
- ✅ Chat context removal

---

### Journey 4: KB Isolation - Multi-Tenant 🔒 (11 tests)

**File**: `journey-4-kb-isolation-multitenant.spec.ts`

**⚠️ SECURITY CRITICAL**: Tests zero-trust isolation between tenant knowledge bases

**Flow**:
1. Tenant A uploads document
2. Tenant B uploads different document
3. Verify Tenant A CANNOT access Tenant B's data
4. Verify namespace isolation (Pinecone)
5. Admin verifies unified access

**Tests**:
- 🔒 Namespace isolation (user_<userId>)
- 🔒 Cross-tenant contamination prevention
- 🔒 User KB vs System KB separation
- 🔒 Admin unified access
- 🔒 Timing attack prevention

---

### Journey 5: Multi-Session Handling (15 tests)

**File**: `journey-5-multi-session-handling.spec.ts`

**Flow**:
1. User logs in on Browser 1 (Session 1)
2. User logs in on Browser 2 (Session 2)
3. Both sessions active (`activeSessionIds` array)
4. Upload document in Session 1
5. Verify real-time sync to Session 2
6. Logout from Session 1
7. Verify Session 2 still active
8. Logout from Session 2

**Tests**:
- ✅ Concurrent sessions (multiple browsers)
- ✅ Session tracking (`jti` - JWT ID)
- ✅ Selective logout (one session)
- ✅ Real-time data sync
- ✅ Session expiration handling

---

## Test Fixtures

### Test Users

**File**: `e2e/fixtures/test-users.ts`

All test users are prefixed with `e2e-test-` for easy identification:

```typescript
TEST_USERS = {
  regularUser: {
    username: 'e2e-test-user',
    password: 'Test123!@#',
    role: 'user',
  },
  adminUser: {
    username: 'e2e-test-admin',
    password: 'Admin123!@#',
    role: 'admin',
  },
  tenantA: {
    username: 'e2e-test-tenant-a',
    password: 'TenantA123!@#',
    role: 'user',
  },
  tenantB: {
    username: 'e2e-test-tenant-b',
    password: 'TenantB123!@#',
    role: 'user',
  },
};
```

### Test Documents

**File**: `e2e/fixtures/test-documents.ts`

Located in `e2e/fixtures/files/`:

- `test-document.txt` - Contains secret keyword "LIGHTHOUSE"
- `test-pdf.pdf` - Sample PDF document
- `test-markdown.md` - Markdown documentation

---

## Troubleshooting

### Admin Login Fails

**Error**: `Admin login failed: 401 Unauthorized`

**Solution**:
1. Verify admin user exists:
   ```bash
   cd apps/api
   npx ts-node src/scripts/create-admin-user.ts
   ```
2. Check `.env.test` has correct password
3. Ensure API is running on `http://localhost:6001`

### Test Users Not Created

**Error**: `Failed to create user e2e-test-user`

**Solution**:
1. Check admin credentials in `.env.test`
2. Verify API endpoint: `POST /api/admin/users` works
3. Check if users already exist (cleanup failed):
   ```bash
   # Delete existing test users manually via MongoDB or admin dashboard
   ```

### Tests Timing Out

**Error**: `TimeoutError: locator.waitFor: Timeout 15000ms exceeded`

**Solution**:
1. Increase timeouts in individual tests
2. Check if frontend is running (`http://localhost:3000`)
3. Check if backend processing is slow (document upload)
4. Run with `--headed` to see what's happening

### Selector Not Found

**Error**: `Locator not found: input[placeholder*="username"]`

**Solution**:
1. Verify frontend code matches selectors in `AuthPage.ts`
2. Check if page loaded correctly
3. Use Playwright Inspector: `pnpm exec playwright test --debug`

### Port Already in Use

**Error**: `EADDRINUSE: address already in use :::3000`

**Solution**:
```bash
# Find and kill process
lsof -ti:3000 | xargs kill -9
lsof -ti:6001 | xargs kill -9
```

---

## CI/CD Integration

### GitHub Actions Example

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  e2e-tests:
    runs-on: ubuntu-latest

    services:
      mongodb:
        image: mongo:latest
        ports:
          - 27017:27017

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: pnpm install

      - name: Create admin user
        run: |
          cd apps/api
          npx ts-node src/scripts/create-admin-user.ts << EOF
          admin
          ${{ secrets.E2E_ADMIN_PASSWORD }}
          EOF

      - name: Install Playwright Browsers
        run: pnpm exec playwright install --with-deps

      - name: Run E2E tests
        env:
          E2E_ADMIN_USERNAME: admin
          E2E_ADMIN_PASSWORD: ${{ secrets.E2E_ADMIN_PASSWORD }}
          NEXT_PUBLIC_API_URL: http://localhost:6001/api
        run: |
          cd apps/web
          pnpm test:e2e
```

---

## Best Practices

### 1. Always Use setupTestUsers()

```typescript
// ❌ WRONG - trying to register
test('bad test', async ({ page }) => {
  await authPage.register(username, email, password);  // WILL FAIL - no registration
});

// ✅ CORRECT - use pre-created user
test.beforeAll(async () => {
  await setupTestUsers();  // Admin creates users via API
});

test('good test', async ({ page }) => {
  await authPage.login(TEST_USERS.regularUser.username, TEST_USERS.regularUser.password);
});
```

### 2. Use Unique Users for Parallel Tests

```typescript
// For tests that modify user data
const uniqueUser = getUniqueTestUser(TEST_USERS.regularUser);
await createTestUser(uniqueUser);
```

### 3. Clean Up Test Data

```typescript
test.afterAll(async () => {
  await cleanupTestUsers();  // Delete all e2e-test-* users
});
```

### 4. Handle Async Operations

```typescript
// Wait for document processing
await documentsPage.uploadFileAndWait(testFilePath, 60000);  // 60s timeout

// Wait for RAG response
await chatPage.sendMessageAndWaitForResponse(query, 45000);  // 45s timeout
```

### 5. Use Descriptive Test Names

```typescript
// ✅ GOOD
test('should reject login with invalid password', async ({ page }) => { ... });

// ❌ BAD
test('test login', async ({ page }) => { ... });
```

---

## Maintenance

### Updating Selectors

If the frontend UI changes, update selectors in Page Objects:

**Example**: `e2e/page-objects/AuthPage.ts`

```typescript
// Update if frontend changes
this.usernameInput = page.locator('input[placeholder*="username" i]');
this.passwordInput = page.locator('input[placeholder*="password" i]').first();
this.loginButton = page.locator('button:has-text("Login")').first();
```

### Adding New Tests

1. Create test in appropriate journey file
2. Use existing page objects
3. Follow naming convention: `e2e-test-*`
4. Add to test describe block
5. Ensure `setupTestUsers()` is called

### Debugging Flaky Tests

```bash
# Run test multiple times
for i in {1..10}; do pnpm exec playwright test journey-1 --grep "flaky test"; done

# Record trace for debugging
pnpm exec playwright test --trace on
```

---

## Additional Resources

- [Playwright Documentation](https://playwright.dev/)
- [Page Object Model Pattern](https://playwright.dev/docs/pom)
- [GKCHATTY API Documentation](../../api/README.md)
- [Test Strategy](../../api/TEST_STRATEGY.md)

---

**Last Updated**: 2025-10-20
**Test Coverage**: 81 tests across 5 journeys
**Estimated Runtime**: ~8-12 minutes (parallel execution)
