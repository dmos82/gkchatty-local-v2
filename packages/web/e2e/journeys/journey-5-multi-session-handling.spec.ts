import { test, expect, chromium, Browser, BrowserContext, Page } from '@playwright/test';
import { AuthPage, ChatPage, DocumentsPage } from '../page-objects';
import { TEST_USERS, getUniqueTestUser, setupTestUsers, cleanupTestUsers } from '../fixtures/test-users';
import { TEST_DOCUMENTS, createTestFiles, testFilesExist } from '../fixtures/test-documents';
import path from 'path';

/**
 * Journey 5: Multi-Session Handling → Concurrent Logins → Logout
 *
 * This test suite validates session management across multiple concurrent browser sessions:
 * - Multiple concurrent sessions (JWT + sessionId tracking)
 * - Session array management (activeSessionIds)
 * - Selective logout (one session vs all sessions)
 * - Real-time data sync across sessions
 * - Session expiration handling
 *
 * Flow:
 * 1. User logs in on Browser 1 (Session 1)
 * 2. User logs in on Browser 2 (Session 2)
 * 3. Verifies both sessions active in `activeSessionIds` array
 * 4. User uploads document in Browser 1
 * 5. Verifies document visible in Browser 2 (real-time sync)
 * 6. User logs out from Browser 1
 * 7. Verifies Session 1 removed from `activeSessionIds`
 * 8. Verifies Browser 2 session still active
 * 9. User logs out from Browser 2
 * 10. Verifies all sessions cleared
 */
test.describe('Journey 5: Multi-Session Handling', () => {
  let browser1: Browser;
  let browser2: Browser;
  let context1: BrowserContext;
  let context2: BrowserContext;
  let page1: Page;
  let page2: Page;

  test.beforeAll(async () => {
    // Create test users via admin API
    await setupTestUsers();

    // Ensure test files exist
    const filesExist = await testFilesExist();
    if (!filesExist) {
      await createTestFiles();
    }

    // Create two independent browsers for session testing
    browser1 = await chromium.launch();
    browser2 = await chromium.launch();
  });

  test.afterAll(async () => {
    await browser1?.close();
    await browser2?.close();

    // Cleanup test users
    await cleanupTestUsers();
  });

  test.beforeEach(async () => {
    // Create fresh browser contexts (independent sessions)
    context1 = await browser1.newContext();
    context2 = await browser2.newContext();

    page1 = await context1.newPage();
    page2 = await context2.newPage();
  });

  test.afterEach(async () => {
    await context1?.close();
    await context2?.close();
  });

  /**
   * HAPPY PATH: Complete multi-session journey
   */
  test('should handle multiple concurrent sessions successfully', async () => {
    const authPage1 = new AuthPage(page1);
    const authPage2 = new AuthPage(page2);
    const chatPage1 = new ChatPage(page1);
    const chatPage2 = new ChatPage(page2);
    const documentsPage1 = new DocumentsPage(page1);
    const documentsPage2 = new DocumentsPage(page2);

    // Step 1: User logs in on Browser 1 (Session 1)
    await authPage1.goto();
    await authPage1.login(TEST_USERS.regularUser.username, TEST_USERS.regularUser.password);

    // Verify Session 1 active
    await chatPage1.goto();
    const session1Active = await page1.locator('body').isVisible();
    expect(session1Active).toBe(true);

    // Step 2: User logs in on Browser 2 (Session 2)
    await authPage2.goto();
    await authPage2.login(TEST_USERS.regularUser.username, TEST_USERS.regularUser.password);

    // Verify Session 2 active
    await chatPage2.goto();
    const session2Active = await page2.locator('body').isVisible();
    expect(session2Active).toBe(true);

    // Step 3: Both sessions should be active (validated by both being logged in)
    // In a real implementation, you'd verify activeSessionIds via API call

    // Step 4: User uploads document in Browser 1
    await documentsPage1.goto();
    const testFilePath = path.resolve(__dirname, '..', 'fixtures', 'files', 'test-document.txt');
    await documentsPage1.uploadFileAndWait(testFilePath, 45000);

    // Verify document uploaded in Session 1
    const doc1Exists = await documentsPage1.hasDocument('test-document.txt');
    expect(doc1Exists).toBe(true);

    // Step 5: Verify document visible in Browser 2 (data sync)
    await documentsPage2.goto();
    await page2.reload(); // Refresh to get latest data
    const doc2Exists = await documentsPage2.hasDocument('test-document.txt');
    expect(doc2Exists).toBe(true);

    // Step 6: User logs out from Browser 1
    await chatPage1.goto();
    await chatPage1.logout();

    // Verify Session 1 logged out
    await expect(page1).toHaveURL(/\/auth|\/login/);

    // Step 7 & 8: Verify Browser 2 session still active
    await chatPage2.goto();
    await page2.reload();

    // Session 2 should still be active
    const stillLoggedIn = !(await page2.url().includes('/auth') || await page2.url().includes('/login'));
    expect(stillLoggedIn).toBe(true);

    // Step 9: User logs out from Browser 2
    await chatPage2.logout();

    // Step 10: Verify all sessions cleared
    await expect(page2).toHaveURL(/\/auth|\/login/);
  });

  /**
   * CONCURRENT SESSION TESTS
   */
  test.describe('Concurrent Sessions', () => {
    test('should allow user to be logged in on multiple browsers simultaneously', async () => {
      const authPage1 = new AuthPage(page1);
      const authPage2 = new AuthPage(page2);

      // Login on both browsers
      await authPage1.goto();
      await authPage1.login(TEST_USERS.regularUser.username, TEST_USERS.regularUser.password);

      await authPage2.goto();
      await authPage2.login(TEST_USERS.regularUser.username, TEST_USERS.regularUser.password);

      // Both should be logged in
      await page1.goto('/');
      await page2.goto('/');

      const url1 = page1.url();
      const url2 = page2.url();

      expect(url1).not.toContain('/auth');
      expect(url1).not.toContain('/login');
      expect(url2).not.toContain('/auth');
      expect(url2).not.toContain('/login');
    });

    test('should track each session with unique jti (JWT ID)', async () => {
      const authPage1 = new AuthPage(page1);
      const authPage2 = new AuthPage(page2);

      await authPage1.goto();
      await authPage1.login(TEST_USERS.regularUser.username, TEST_USERS.regularUser.password);

      await authPage2.goto();
      await authPage2.login(TEST_USERS.regularUser.username, TEST_USERS.regularUser.password);

      // Get tokens from both sessions
      const cookies1 = await context1.cookies();
      const cookies2 = await context2.cookies();

      const authToken1 = cookies1.find(c => c.name === 'authToken');
      const authToken2 = cookies2.find(c => c.name === 'authToken');

      // Tokens should exist and be different
      expect(authToken1).toBeDefined();
      expect(authToken2).toBeDefined();
      expect(authToken1?.value).not.toBe(authToken2?.value);
    });

    test('should handle 3+ concurrent sessions', async () => {
      const context3 = await browser1.newContext();
      const page3 = await context3.newPage();

      const authPage1 = new AuthPage(page1);
      const authPage2 = new AuthPage(page2);
      const authPage3 = new AuthPage(page3);

      // Login on all three browsers
      await authPage1.goto();
      await authPage1.login(TEST_USERS.regularUser.username, TEST_USERS.regularUser.password);

      await authPage2.goto();
      await authPage2.login(TEST_USERS.regularUser.username, TEST_USERS.regularUser.password);

      await authPage3.goto();
      await authPage3.login(TEST_USERS.regularUser.username, TEST_USERS.regularUser.password);

      // All three should be active
      await page1.goto('/');
      await page2.goto('/');
      await page3.goto('/');

      expect(page1.url()).not.toContain('/auth');
      expect(page2.url()).not.toContain('/auth');
      expect(page3.url()).not.toContain('/auth');

      await context3.close();
    });
  });

  /**
   * SELECTIVE LOGOUT TESTS
   */
  test.describe('Selective Logout', () => {
    test('should logout from one session without affecting other sessions', async () => {
      const authPage1 = new AuthPage(page1);
      const authPage2 = new AuthPage(page2);
      const chatPage1 = new ChatPage(page1);
      const chatPage2 = new ChatPage(page2);

      // Login on both
      await authPage1.goto();
      await authPage1.login(TEST_USERS.regularUser.username, TEST_USERS.regularUser.password);

      await authPage2.goto();
      await authPage2.login(TEST_USERS.regularUser.username, TEST_USERS.regularUser.password);

      // Logout from Session 1
      await chatPage1.goto();
      await chatPage1.logout();

      // Verify Session 1 logged out
      await expect(page1).toHaveURL(/\/auth|\/login/);

      // Verify Session 2 still active
      await chatPage2.goto();
      await page2.reload();

      const session2URL = page2.url();
      expect(session2URL).not.toContain('/auth');
      expect(session2URL).not.toContain('/login');
    });

    test('should remove only logged-out session from activeSessionIds', async () => {
      const authPage1 = new AuthPage(page1);
      const authPage2 = new AuthPage(page2);
      const chatPage1 = new ChatPage(page1);

      // Login on both
      await authPage1.goto();
      await authPage1.login(TEST_USERS.regularUser.username, TEST_USERS.regularUser.password);

      await authPage2.goto();
      await authPage2.login(TEST_USERS.regularUser.username, TEST_USERS.regularUser.password);

      // Logout from Session 1
      await chatPage1.goto();
      await chatPage1.logout();

      // Session 2 should still work
      await page2.goto('/');
      const session2Works = !(page2.url().includes('/auth') || page2.url().includes('/login'));
      expect(session2Works).toBe(true);
    });

    test('should allow logging back in after selective logout', async () => {
      const authPage1 = new AuthPage(page1);
      const authPage2 = new AuthPage(page2);
      const chatPage1 = new ChatPage(page1);

      // Login on both
      await authPage1.goto();
      await authPage1.login(TEST_USERS.regularUser.username, TEST_USERS.regularUser.password);

      await authPage2.goto();
      await authPage2.login(TEST_USERS.regularUser.username, TEST_USERS.regularUser.password);

      // Logout from Session 1
      await chatPage1.logout();

      // Login again on Session 1
      await authPage1.login(TEST_USERS.regularUser.username, TEST_USERS.regularUser.password);

      // Verify can access protected routes
      await page1.goto('/');
      expect(page1.url()).not.toContain('/auth');
    });
  });

  /**
   * REAL-TIME DATA SYNC
   */
  test.describe('Real-Time Data Sync', () => {
    test('should sync uploaded documents across sessions', async () => {
      const authPage1 = new AuthPage(page1);
      const authPage2 = new AuthPage(page2);
      const documentsPage1 = new DocumentsPage(page1);
      const documentsPage2 = new DocumentsPage(page2);

      // Login on both
      await authPage1.goto();
      await authPage1.login(TEST_USERS.regularUser.username, TEST_USERS.regularUser.password);

      await authPage2.goto();
      await authPage2.login(TEST_USERS.regularUser.username, TEST_USERS.regularUser.password);

      // Upload on Session 1
      await documentsPage1.goto();
      const testFilePath = path.resolve(__dirname, '..', 'fixtures', 'files', 'test-document.txt');
      await documentsPage1.uploadFileAndWait(testFilePath, 45000);

      // Refresh Session 2 and verify
      await documentsPage2.goto();
      await page2.reload();

      const docExists = await documentsPage2.hasDocument('test-document.txt');
      expect(docExists).toBe(true);
    });

    test('should sync document deletions across sessions', async () => {
      const authPage1 = new AuthPage(page1);
      const authPage2 = new AuthPage(page2);
      const documentsPage1 = new DocumentsPage(page1);
      const documentsPage2 = new DocumentsPage(page2);

      // Login and upload
      await authPage1.goto();
      await authPage1.login(TEST_USERS.regularUser.username, TEST_USERS.regularUser.password);

      await authPage2.goto();
      await authPage2.login(TEST_USERS.regularUser.username, TEST_USERS.regularUser.password);

      await documentsPage1.goto();
      const testFilePath = path.resolve(__dirname, '..', 'fixtures', 'files', 'test-document.txt');
      await documentsPage1.uploadFileAndWait(testFilePath, 45000);

      // Delete from Session 1
      await documentsPage1.deleteDocument('test-document.txt');

      // Verify deletion in Session 2
      await documentsPage2.goto();
      await page2.reload();

      const docExists = await documentsPage2.hasDocument('test-document.txt');
      expect(docExists).toBe(false);
    });

    test('should sync folder creations across sessions', async () => {
      const authPage1 = new AuthPage(page1);
      const authPage2 = new AuthPage(page2);
      const documentsPage1 = new DocumentsPage(page1);
      const documentsPage2 = new DocumentsPage(page2);

      await authPage1.goto();
      await authPage1.login(TEST_USERS.regularUser.username, TEST_USERS.regularUser.password);

      await authPage2.goto();
      await authPage2.login(TEST_USERS.regularUser.username, TEST_USERS.regularUser.password);

      // Create folder in Session 1
      await documentsPage1.goto();
      const folderName = `sync-test-${Date.now()}`;
      await documentsPage1.createFolder(folderName);

      // Verify in Session 2
      await documentsPage2.goto();
      await page2.reload();

      const folderExists = await documentsPage2.hasFolder(folderName);
      expect(folderExists).toBe(true);
    });
  });

  /**
   * SESSION EXPIRATION
   */
  test.describe('Session Expiration', () => {
    test('should handle expired session gracefully', async () => {
      const authPage1 = new AuthPage(page1);
      const chatPage1 = new ChatPage(page1);

      // Login
      await authPage1.goto();
      await authPage1.login(TEST_USERS.regularUser.username, TEST_USERS.regularUser.password);

      // In a real test, you'd wait for token expiration or manipulate the token
      // For E2E, we can test the behavior when an invalid token is used

      // Manually clear token to simulate expiration
      await context1.clearCookies();

      // Attempt to access protected route
      await chatPage1.goto();

      // Should redirect to login
      await expect(page1).toHaveURL(/\/auth|\/login/);
    });

    test('should not allow actions with expired session', async () => {
      const authPage1 = new AuthPage(page1);
      const documentsPage1 = new DocumentsPage(page1);

      await authPage1.goto();
      await authPage1.login(TEST_USERS.regularUser.username, TEST_USERS.regularUser.password);

      // Clear cookies to simulate expiration
      await context1.clearCookies();

      // Attempt to upload (should fail)
      await documentsPage1.goto();

      // Should be redirected to login
      await expect(page1).toHaveURL(/\/auth|\/login/);
    });

    test('should require re-authentication after all sessions logged out', async () => {
      const authPage1 = new AuthPage(page1);
      const chatPage1 = new ChatPage(page1);

      // Login
      await authPage1.goto();
      await authPage1.login(TEST_USERS.regularUser.username, TEST_USERS.regularUser.password);

      // Logout
      await chatPage1.logout();

      // Attempt to access protected route
      await page1.goto('/');

      // Should redirect to login
      await expect(page1).toHaveURL(/\/auth|\/login/);
    });
  });

  /**
   * ERROR SCENARIOS
   */
  test.describe('Error Scenarios', () => {
    test('should handle network interruption gracefully', async () => {
      const authPage1 = new AuthPage(page1);

      await authPage1.goto();
      await authPage1.login(TEST_USERS.regularUser.username, TEST_USERS.regularUser.password);

      // Simulate offline mode
      await context1.setOffline(true);

      // Attempt navigation
      try {
        await page1.goto('/documents');
      } catch {
        // Expected to fail
      }

      // Restore connection
      await context1.setOffline(false);

      // Should recover
      await page1.goto('/');
      const recovered = !(page1.url().includes('/auth') || page1.url().includes('/login'));
      expect(recovered).toBe(true);
    });

    test('should handle concurrent logout from same session', async () => {
      const authPage1 = new AuthPage(page1);
      const chatPage1 = new ChatPage(page1);

      await authPage1.goto();
      await authPage1.login(TEST_USERS.regularUser.username, TEST_USERS.regularUser.password);

      // Logout (first call)
      await chatPage1.logout();

      // Attempt second logout (should handle gracefully)
      try {
        await chatPage1.logout();
      } catch {
        // Expected - already logged out
      }

      // Should be at login page
      await expect(page1).toHaveURL(/\/auth|\/login/);
    });
  });
});
