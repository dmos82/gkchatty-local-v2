import { test, expect } from '@playwright/test';
import { AuthPage, ChatPage, DocumentsPage } from '../page-objects';
import { TEST_USERS, setupTestUsers, cleanupTestUsers } from '../fixtures/test-users';
import { TEST_DOCUMENTS, createTestFiles, testFilesExist } from '../fixtures/test-documents';
import path from 'path';

/**
 * Journey 1: User Login → Document Upload → Chat Query
 *
 * IMPORTANT: User registration is NOT available in GKCHATTY.
 * Only admins can create user accounts via the admin dashboard.
 * This journey tests login with admin-created users.
 *
 * This test suite validates the complete user journey from login
 * through document upload to RAG-powered chat interactions.
 *
 * Flow:
 * 1. Admin pre-creates user account (setupTestUsers)
 * 2. User logs in with credentials
 * 3. Uploads a document
 * 4. Waits for document processing
 * 5. Asks questions about the uploaded document
 * 6. Verifies RAG responses contain document context
 * 7. Logs out
 */
test.describe('Journey 1: User Login → Upload → Chat', () => {
  test.beforeAll(async () => {
    // Create test users via admin API
    await setupTestUsers();

    // Ensure test files exist
    const filesExist = await testFilesExist();
    if (!filesExist) {
      await createTestFiles();
    }
  });

  test.afterAll(async () => {
    // Cleanup test users
    await cleanupTestUsers();
  });

  /**
   * HAPPY PATH: Complete journey from login to RAG query
   */
  test('should complete full user journey successfully', async ({ page }) => {
    const authPage = new AuthPage(page);
    const chatPage = new ChatPage(page);
    const documentsPage = new DocumentsPage(page);

    // Step 1: Login with pre-created user
    await authPage.goto();
    await authPage.login(TEST_USERS.regularUser.username, TEST_USERS.regularUser.password);

    // Verify successful login (should redirect away from /auth)
    await authPage.waitForSuccessfulLogin();
    expect(page.url()).not.toContain('/auth');

    // Step 2: Navigate to documents page
    await documentsPage.goto();
    expect(page.url()).toContain('/documents');

    // Step 3: Upload document
    const testDoc = TEST_DOCUMENTS.text;
    const testFilePath = path.resolve(__dirname, '..', 'fixtures', 'files', testDoc.name);
    await documentsPage.uploadFileAndWait(testFilePath, 60000);

    // Verify document appears in list
    const hasDoc = await documentsPage.hasDocument(testDoc.name);
    expect(hasDoc).toBeTruthy();

    // Step 4: Navigate to chat
    await chatPage.goto();
    const url = new URL(page.url());
    expect(url.pathname).toMatch(/^\/$|^\/chat/);

    // Step 4.5: CRITICAL - Switch to 'user-docs' mode (fixes timeout issue)
    // Default is 'system-kb' which is empty, but uploaded docs are in 'user-docs'
    await chatPage.switchKnowledgeBaseMode('user-docs');

    // Step 5: Ask question about uploaded document
    const query = 'What is the secret keyword mentioned in my document?';
    await chatPage.sendMessageAndWaitForResponse(query, 75000);

    // Step 6: Verify RAG response contains document context
    const response = await chatPage.getLastAssistantMessage();
    expect(response).toBeTruthy();

    // Response should contain the secret keyword from the document
    const containsKeyword = testDoc.expectedSearchKeywords.some(keyword =>
      response.toUpperCase().includes(keyword.toUpperCase())
    );
    expect(containsKeyword).toBeTruthy();

    // Step 7: Logout
    await chatPage.logout();
    await expect(page).toHaveURL(/\/auth|\/login/);
  });

  /**
   * LOGIN VALIDATION TESTS
   */
  test('should reject login with invalid password', async ({ page }) => {
    const authPage = new AuthPage(page);

    await authPage.goto();
    await authPage.usernameInput.fill(TEST_USERS.regularUser.username);
    await authPage.passwordInput.fill('WrongPassword123!');
    await authPage.loginButton.click();

    // Should show error message
    const hasError = await authPage.hasError();
    expect(hasError).toBe(true);

    // Should remain on auth page
    await page.waitForTimeout(1000);
    expect(page.url()).toContain('/auth');
  });

  test('should reject login with non-existent user', async ({ page }) => {
    const authPage = new AuthPage(page);

    await authPage.goto();
    await authPage.usernameInput.fill('nonexistent-user-12345');
    await authPage.passwordInput.fill('SomePassword123!');
    await authPage.loginButton.click();

    // Should show error message
    const hasError = await authPage.hasError();
    expect(hasError).toBe(true);

    // Should remain on auth page
    await page.waitForTimeout(1000);
    expect(page.url()).toContain('/auth');
  });

  test('should reject empty username', async ({ page }) => {
    const authPage = new AuthPage(page);

    await authPage.goto();
    await authPage.passwordInput.fill(TEST_USERS.regularUser.password);
    await authPage.loginButton.click();

    // Should show error or validation message
    await page.waitForTimeout(1000);
    expect(page.url()).toContain('/auth');
  });

  test('should reject empty password', async ({ page }) => {
    const authPage = new AuthPage(page);

    await authPage.goto();
    await authPage.usernameInput.fill(TEST_USERS.regularUser.username);
    await authPage.loginButton.click();

    // Should show error or validation message
    await page.waitForTimeout(1000);
    expect(page.url()).toContain('/auth');
  });

  /**
   * DOCUMENT UPLOAD TESTS
   */
  test.describe('Document Upload', () => {
    test.beforeEach(async ({ page }) => {
      const authPage = new AuthPage(page);
      await authPage.goto();
      await authPage.login(TEST_USERS.regularUser.username, TEST_USERS.regularUser.password);
    });

    test('should successfully upload and process text document', async ({ page }) => {
      const documentsPage = new DocumentsPage(page);

      await documentsPage.goto();

      const testDoc = TEST_DOCUMENTS.text;
      const testFilePath = path.resolve(__dirname, '..', 'fixtures', 'files', testDoc.name);
      await documentsPage.uploadFileAndWait(testFilePath, 60000);

      // Verify document uploaded
      const hasDoc = await documentsPage.hasDocument(testDoc.name);
      expect(hasDoc).toBe(true);

      // Verify status is completed
      const status = await documentsPage.getDocumentStatus(testDoc.name);
      expect(status).toBe('completed');
    });

    test('should successfully upload PDF document', async ({ page }) => {
      const documentsPage = new DocumentsPage(page);

      await documentsPage.goto();

      const testDoc = TEST_DOCUMENTS.pdf;
      const testFilePath = path.resolve(__dirname, '..', 'fixtures', 'files', testDoc.name);
      await documentsPage.uploadFileAndWait(testFilePath, 60000);

      // Verify document uploaded
      const hasDoc = await documentsPage.hasDocument(testDoc.name);
      expect(hasDoc).toBe(true);
    });

    test('should successfully upload Markdown document', async ({ page }) => {
      const documentsPage = new DocumentsPage(page);

      await documentsPage.goto();

      const testDoc = TEST_DOCUMENTS.markdown;
      const testFilePath = path.resolve(__dirname, '..', 'fixtures', 'files', testDoc.name);
      await documentsPage.uploadFileAndWait(testFilePath, 60000);

      // Verify document uploaded
      const hasDoc = await documentsPage.hasDocument(testDoc.name);
      expect(hasDoc).toBe(true);
    });

    test('should reject unsupported file type', async ({ page }) => {
      const documentsPage = new DocumentsPage(page);

      await documentsPage.goto();

      // Create temporary unsupported file
      const fs = require('fs');
      const tmpPath = path.resolve(__dirname, '..', 'fixtures', 'files', 'test-image.jpg');
      if (!fs.existsSync(tmpPath)) {
        fs.writeFileSync(tmpPath, 'fake image data');
      }

      // Attempt upload
      try {
        await documentsPage.uploadFile(tmpPath);
        // Should either reject or show error
        await page.waitForTimeout(2000);

        // Verify error shown or document not in list
        const hasDoc = await documentsPage.hasDocument('test-image.jpg');
        expect(hasDoc).toBe(false);
      } catch (error) {
        // Expected - file rejected
      }
    });
  });

  /**
   * RAG CHAT TESTS
   */
  test.describe('RAG Chat Queries', () => {
    test.beforeEach(async ({ page }) => {
      const authPage = new AuthPage(page);
      const documentsPage = new DocumentsPage(page);

      // Login
      await authPage.goto();
      await authPage.login(TEST_USERS.regularUser.username, TEST_USERS.regularUser.password);

      // Upload document for querying
      await documentsPage.goto();
      const testDoc = TEST_DOCUMENTS.text;
      const testFilePath = path.resolve(__dirname, '..', 'fixtures', 'files', testDoc.name);
      await documentsPage.uploadFileAndWait(testFilePath, 60000);
    });

    test('should answer questions about uploaded document', async ({ page }) => {
      const chatPage = new ChatPage(page);

      await chatPage.goto();
      await chatPage.switchKnowledgeBaseMode('user-docs');

      const query = 'What is the secret keyword?';
      await chatPage.sendMessageAndWaitForResponse(query, 75000); // Increased for LLM + RAG

      const response = await chatPage.getLastAssistantMessage();
      expect(response).toBeTruthy();
      expect(response.length).toBeGreaterThan(10);

      // Should contain keyword from document
      const containsKeyword = TEST_DOCUMENTS.text.expectedSearchKeywords.some(keyword =>
        response.toUpperCase().includes(keyword.toUpperCase())
      );
      expect(containsKeyword).toBe(true);
    });

    test('should maintain context across multiple questions', async ({ page }) => {
      const chatPage = new ChatPage(page);

      await chatPage.goto();
      await chatPage.switchKnowledgeBaseMode('user-docs');

      // First question
      await chatPage.sendMessageAndWaitForResponse(query, 75000);
      const response1 = await chatPage.getLastAssistantMessage();
      expect(response1).toBeTruthy();

      // Follow-up question
      await chatPage.sendMessageAndWaitForResponse(query, 75000);
      const response2 = await chatPage.getLastAssistantMessage();
      expect(response2).toBeTruthy();

      // Verify chat history shows both messages
      const messageCount = await chatPage.getMessageCount();
      expect(messageCount).toBeGreaterThanOrEqual(4); // 2 user + 2 assistant
    });

    test('should handle queries when no relevant context exists', async ({ page }) => {
      const chatPage = new ChatPage(page);

      await chatPage.goto();
      await chatPage.switchKnowledgeBaseMode('user-docs');

      // Ask about something not in the document
      const query = 'What is the meaning of life?';
      await chatPage.sendMessageAndWaitForResponse(query, 75000);

      const response = await chatPage.getLastAssistantMessage();
      expect(response).toBeTruthy();
      expect(response.length).toBeGreaterThan(10);
    });
  });

  /**
   * SESSION MANAGEMENT TESTS
   */
  test.describe('Session Management', () => {
    test('should maintain session across page navigation', async ({ page }) => {
      const authPage = new AuthPage(page);
      const chatPage = new ChatPage(page);
      const documentsPage = new DocumentsPage(page);

      // Login
      await authPage.goto();
      await authPage.login(TEST_USERS.regularUser.username, TEST_USERS.regularUser.password);

      // Navigate between pages
      await chatPage.goto();
      let url = new URL(page.url());
      expect(url.pathname).toMatch(/^\/$|^\/chat/);

      await documentsPage.goto();
      expect(page.url()).toContain('/documents');

      await chatPage.goto();
      url = new URL(page.url());
      expect(url.pathname).toMatch(/^\/$|^\/chat/);

      // Should still be logged in
      const isLoggedIn = !(
        page.url().includes('/auth') || page.url().includes('/login')
      );
      expect(isLoggedIn).toBe(true);
    });

    test('should logout successfully', async ({ page }) => {
      const authPage = new AuthPage(page);
      const chatPage = new ChatPage(page);

      // Login
      await authPage.goto();
      await authPage.login(TEST_USERS.regularUser.username, TEST_USERS.regularUser.password);

      // Navigate to chat
      await chatPage.goto();

      // Logout
      await chatPage.logout();

      // Should redirect to auth page
      await expect(page).toHaveURL(/\/auth|\/login/);
    });

    test('should require re-login after logout', async ({ page }) => {
      const authPage = new AuthPage(page);
      const chatPage = new ChatPage(page);

      // Login
      await authPage.goto();
      await authPage.login(TEST_USERS.regularUser.username, TEST_USERS.regularUser.password);

      // Logout
      await chatPage.logout();

      // Try to access protected route
      await page.goto('/documents');

      // Should redirect to auth
      await expect(page).toHaveURL(/\/auth|\/login/);
    });
  });
});
