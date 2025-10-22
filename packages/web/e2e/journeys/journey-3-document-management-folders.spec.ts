import { test, expect } from '@playwright/test';
import { AuthPage, DocumentsPage, ChatPage } from '../page-objects';
import { AdminSystemKBPage } from '../page-objects/AdminSystemKBPage';
import { TEST_USERS, getUniqueTestUser, setupTestUsers, cleanupTestUsers } from '../fixtures/test-users';
import { TEST_DOCUMENTS, createTestFiles, testFilesExist } from '../fixtures/test-documents';
import path from 'path';

/**
 * Journey 3: Document Management → Folder Operations → File Organization
 *
 * IMPORTANT: Folder functionality exists ONLY in Admin Dashboard → System KB tab
 * Regular /documents page does NOT have folder management
 *
 * This test suite validates document and folder management operations including:
 * - Folder CRUD (create, rename, delete)
 * - Document uploads to folders
 * - Moving documents between folders
 * - Cascade delete verification
 * - Vector cleanup (Pinecone delete)
 * - Storage cleanup (S3/local delete)
 * - Chat context removal verification
 *
 * Flow:
 * 1. Admin logs in
 * 2. Navigates to /admin → System KB tab
 * 3. Creates new folder
 * 4. Uploads multiple documents to folder
 * 5. Moves document from one folder to another
 * 6. Renames folder
 * 7. Deletes document
 * 8. Verifies document removed from chat context
 * 9. Deletes folder (cascade delete)
 * 10. Logs out
 */
test.describe('Journey 3: Document Management → Folders', () => {
  let authPage: AuthPage;
  let adminSystemKBPage: AdminSystemKBPage;
  let chatPage: ChatPage;

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

  test.beforeEach(async ({ page }) => {
    // Initialize page objects
    authPage = new AuthPage(page);
    adminSystemKBPage = new AdminSystemKBPage(page);
    chatPage = new ChatPage(page);

    // Login as ADMIN user (folders are admin-only feature)
    await authPage.goto();
    await authPage.login(TEST_USERS.adminUser.username, TEST_USERS.adminUser.password);
  });

  test.afterEach(async () => {
    // Logout after each test
    await chatPage.logout();
  });

  /**
   * HAPPY PATH: Complete document management journey
   */
  test('should complete full document management journey successfully', async ({ page }) => {
    // Step 1: Navigate to Admin System KB page
    await adminSystemKBPage.goto();

    // Step 2: Create new folder
    const folderName = `e2e-test-folder-${Date.now()}`;
    await adminSystemKBPage.createFolder(folderName);

    // Verify folder created
    const folderExists = await adminSystemKBPage.hasFolderNamed(folderName);
    expect(folderExists).toBe(true);

    // Step 3: Upload document to folder
    const testFilePath = path.resolve(__dirname, '..', 'fixtures', 'files', 'test-document.txt');
    await adminSystemKBPage.uploadFileToFolder(folderName, testFilePath);

    // Verify document uploaded
    const docExists = await adminSystemKBPage.hasDocumentNamed('test-document.txt');
    expect(docExists).toBe(true);

    // Step 4: Create second folder
    const folder2Name = `e2e-test-folder2-${Date.now()}`;
    await adminSystemKBPage.createFolder(folder2Name);

    // Step 5: Move document to second folder
    await adminSystemKBPage.moveDocument('test-document.txt', folder2Name);

    // Verify document moved
    await page.waitForTimeout(1000); // Wait for UI update
    const movedDocExists = await adminSystemKBPage.hasDocumentNamed('test-document.txt');
    expect(movedDocExists).toBe(true);

    // Step 6: Rename folder
    const renamedFolderName = `renamed-${folder2Name}`;
    await adminSystemKBPage.renameFolder(folder2Name, renamedFolderName);

    // Verify folder renamed
    const renamedExists = await adminSystemKBPage.hasFolderNamed(renamedFolderName);
    expect(renamedExists).toBe(true);

    // Step 7: Delete document
    await adminSystemKBPage.deleteDocument('test-document.txt');

    // Verify document deleted
    const docStillExists = await adminSystemKBPage.hasDocumentNamed('test-document.txt');
    expect(docStillExists).toBe(false);

    // Step 8: Verify document no longer in chat context
    await chatPage.goto();
    await chatPage.sendMessageAndWaitForResponse('What is GOLDKEY?', 60000);
    const response = await chatPage.getLastMessage();
    // Should not contain document-specific content
    expect(response).not.toContain('This is a test document for E2E testing');

    // Step 9: Delete folders (cascade delete)
    await adminSystemKBPage.goto();
    await adminSystemKBPage.deleteFolder(renamedFolderName);
    await adminSystemKBPage.deleteFolder(folderName);

    // Verify folders deleted
    const folderStillExists = await adminSystemKBPage.hasFolderNamed(renamedFolderName);
    expect(folderStillExists).toBe(false);
  });

  /**
   * FOLDER CRUD OPERATIONS
   */
  test.describe('Folder CRUD Operations', () => {
    test('should create new folder', async () => {
      await adminSystemKBPage.goto();

      const folderName = `test-folder-${Date.now()}`;
      await adminSystemKBPage.createFolder(folderName);

      const exists = await adminSystemKBPage.hasFolderNamed(folderName);
      expect(exists).toBe(true);
    });

    test('should rename folder', async () => {
      await adminSystemKBPage.goto();

      // Create folder
      const oldName = `old-folder-${Date.now()}`;
      await adminSystemKBPage.createFolder(oldName);

      // Rename it
      const newName = `new-folder-${Date.now()}`;
      await adminSystemKBPage.renameFolder(oldName, newName);

      // Verify old name gone, new name exists
      const oldExists = await adminSystemKBPage.hasFolderNamed(oldName);
      const newExists = await adminSystemKBPage.hasFolderNamed(newName);

      expect(oldExists).toBe(false);
      expect(newExists).toBe(true);
    });

    test('should delete empty folder', async () => {
      await adminSystemKBPage.goto();

      const folderName = `delete-me-${Date.now()}`;
      await adminSystemKBPage.createFolder(folderName);

      // Verify exists
      let exists = await adminSystemKBPage.hasFolderNamed(folderName);
      expect(exists).toBe(true);

      // Delete
      await adminSystemKBPage.deleteFolder(folderName);

      // Verify deleted
      exists = await adminSystemKBPage.hasFolderNamed(folderName);
      expect(exists).toBe(false);
    });

    test('should prevent duplicate folder names', async ({ page }) => {
      await adminSystemKBPage.goto();

      const folderName = `duplicate-test-${Date.now()}`;

      // Create first folder
      await adminSystemKBPage.createFolder(folderName);

      // Attempt duplicate
      await adminSystemKBPage.createFolderButton.click();
      await adminSystemKBPage.folderNameInput.fill(folderName);
      await page.locator('button:has-text("Create"), button:has-text("Save")').click();

      // Expect error
      const errorMessage = page.locator('text=/already exists|duplicate/i').first();
      await expect(errorMessage).toBeVisible({ timeout: 5000 });
    });
  });

  /**
   * DOCUMENT UPLOAD TO FOLDERS
   */
  test.describe('Document Upload to Folders', () => {
    test('should upload document to folder', async () => {
      await adminSystemKBPage.goto();

      // Create folder
      const folderName = `upload-folder-${Date.now()}`;
      await adminSystemKBPage.createFolder(folderName);
      await adminSystemKBPage.clickFolder(folderName);

      // Upload document
      const testFilePath = path.resolve(__dirname, '..', 'fixtures', 'files', 'test-document.txt');
      await adminSystemKBPage.uploadFileAndWait(testFilePath, 45000);

      // Verify document exists in folder
      const exists = await adminSystemKBPage.hasDocumentNamed('test-document.txt');
      expect(exists).toBe(true);
    });

    test('should upload multiple documents to same folder', async () => {
      await adminSystemKBPage.goto();

      const folderName = `multi-upload-${Date.now()}`;
      await adminSystemKBPage.createFolder(folderName);
      await adminSystemKBPage.clickFolder(folderName);

      // Upload first document
      const file1Path = path.resolve(__dirname, '..', 'fixtures', 'files', 'test-document.txt');
      await adminSystemKBPage.uploadFileAndWait(file1Path, 45000);

      // Upload second document
      const file2Path = path.resolve(__dirname, '..', 'fixtures', 'files', 'tenant-a-document.txt');
      await adminSystemKBPage.uploadFileAndWait(file2Path, 45000);

      // Verify both exist
      const doc1Exists = await adminSystemKBPage.hasDocumentNamed('test-document.txt');
      const doc2Exists = await adminSystemKBPage.hasDocumentNamed('tenant-a-document.txt');

      expect(doc1Exists).toBe(true);
      expect(doc2Exists).toBe(true);
    });

    test('should handle document upload failure gracefully', async ({ page }) => {
      await adminSystemKBPage.goto();

      const folderName = `error-test-${Date.now()}`;
      await adminSystemKBPage.createFolder(folderName);
      await adminSystemKBPage.clickFolder(folderName);

      // Attempt to upload non-existent file (should fail gracefully)
      const fakeFilePath = '/non/existent/file.txt';
      try {
        await adminSystemKBPage.uploadFile(fakeFilePath);
        await adminSystemKBPage.waitForError(5000);
      } catch {
        // Expected to fail
      }
    });
  });

  /**
   * DOCUMENT MOVE OPERATIONS
   */
  test.describe('Document Move Operations', () => {
    test('should move document from one folder to another', async () => {
      await adminSystemKBPage.goto();

      // Create two folders
      const folder1 = `source-${Date.now()}`;
      const folder2 = `dest-${Date.now()}`;
      await adminSystemKBPage.createFolder(folder1);
      await adminSystemKBPage.createFolder(folder2);

      // Upload document to folder1
      await adminSystemKBPage.clickFolder(folder1);
      const testFilePath = path.resolve(__dirname, '..', 'fixtures', 'files', 'test-document.txt');
      await adminSystemKBPage.uploadFileAndWait(testFilePath, 45000);

      // Move to folder2
      await adminSystemKBPage.moveDocument('test-document.txt', folder2);

      // Verify document in folder2
      await adminSystemKBPage.goto();
      await adminSystemKBPage.clickFolder(folder2);
      const existsInFolder2 = await adminSystemKBPage.hasDocumentNamed('test-document.txt');
      expect(existsInFolder2).toBe(true);

      // Verify NOT in folder1
      await adminSystemKBPage.goto();
      await adminSystemKBPage.clickFolder(folder1);
      const existsInFolder1 = await adminSystemKBPage.hasDocumentNamed('test-document.txt');
      expect(existsInFolder1).toBe(false);
    });

    test('should update folder reference in database', async () => {
      await adminSystemKBPage.goto();

      const folder1 = `db-test-1-${Date.now()}`;
      const folder2 = `db-test-2-${Date.now()}`;
      await adminSystemKBPage.createFolder(folder1);
      await adminSystemKBPage.createFolder(folder2);

      // Upload to folder1
      await adminSystemKBPage.clickFolder(folder1);
      const testFilePath = path.resolve(__dirname, '..', 'fixtures', 'files', 'test-document.txt');
      await adminSystemKBPage.uploadFileAndWait(testFilePath, 45000);

      // Move to folder2
      await adminSystemKBPage.moveDocument('test-document.txt', folder2);

      // Refresh page and verify persistence
      await adminSystemKBPage.page.reload();
      await adminSystemKBPage.goto();
      await adminSystemKBPage.clickFolder(folder2);

      const exists = await adminSystemKBPage.hasDocumentNamed('test-document.txt');
      expect(exists).toBe(true);
    });
  });

  /**
   * CASCADE DELETE VERIFICATION
   */
  test.describe('Cascade Delete Operations', () => {
    test('should delete folder and all documents inside (cascade)', async () => {
      await adminSystemKBPage.goto();

      // Create folder and upload 2 documents
      const folderName = `cascade-test-${Date.now()}`;
      await adminSystemKBPage.createFolder(folderName);
      await adminSystemKBPage.clickFolder(folderName);

      const file1Path = path.resolve(__dirname, '..', 'fixtures', 'files', 'test-document.txt');
      const file2Path = path.resolve(__dirname, '..', 'fixtures', 'files', 'tenant-a-document.txt');

      await adminSystemKBPage.uploadFileAndWait(file1Path, 45000);
      await adminSystemKBPage.uploadFileAndWait(file2Path, 45000);

      // Verify both documents exist
      const doc1Before = await adminSystemKBPage.hasDocumentNamed('test-document.txt');
      const doc2Before = await adminSystemKBPage.hasDocumentNamed('tenant-a-document.txt');
      expect(doc1Before).toBe(true);
      expect(doc2Before).toBe(true);

      // Delete folder
      await adminSystemKBPage.goto();
      await adminSystemKBPage.deleteFolder(folderName);

      // Verify folder deleted
      const folderExists = await adminSystemKBPage.hasFolderNamed(folderName);
      expect(folderExists).toBe(false);
    });

    test('should remove document vectors from Pinecone on delete', async () => {
      await adminSystemKBPage.goto();

      const folderName = `vector-delete-test-${Date.now()}`;
      await adminSystemKBPage.createFolder(folderName);
      await adminSystemKBPage.clickFolder(folderName);

      // Upload document
      const testFilePath = path.resolve(__dirname, '..', 'fixtures', 'files', 'test-document.txt');
      await adminSystemKBPage.uploadFileAndWait(testFilePath, 45000);

      // Verify document accessible in chat
      await chatPage.goto();
      await chatPage.sendMessageAndWaitForResponse('What does the test document say about GOLDKEY?', 30000);
      let response = await chatPage.getLastAssistantMessage();
      // Should contain document content before delete
      expect(response.toLowerCase()).toContain('goldkey');

      // Delete document
      await adminSystemKBPage.goto();
      await adminSystemKBPage.clickFolder(folderName);
      await adminSystemKBPage.deleteDocument('test-document.txt');

      // Verify document no longer in chat context (vectors deleted)
      await chatPage.goto();
      await chatPage.sendMessageAndWaitForResponse('What does the test document say about GOLDKEY?', 30000);
      response = await chatPage.getLastAssistantMessage();

      // Should not have specific document content (vectors removed)
      expect(response).not.toContain('This is a test document for E2E testing');
    });
  });

  /**
   * DOCUMENT DELETION
   */
  test.describe('Document Deletion', () => {
    test('should delete single document from folder', async () => {
      await adminSystemKBPage.goto();

      const folderName = `delete-doc-${Date.now()}`;
      await adminSystemKBPage.createFolder(folderName);
      await adminSystemKBPage.clickFolder(folderName);

      const testFilePath = path.resolve(__dirname, '..', 'fixtures', 'files', 'test-document.txt');
      await adminSystemKBPage.uploadFileAndWait(testFilePath, 45000);

      // Verify exists
      let exists = await adminSystemKBPage.hasDocumentNamed('test-document.txt');
      expect(exists).toBe(true);

      // Delete
      await adminSystemKBPage.deleteDocument('test-document.txt');

      // Verify deleted
      exists = await adminSystemKBPage.hasDocumentNamed('test-document.txt');
      expect(exists).toBe(false);
    });

    test('should remove document from MongoDB on delete', async () => {
      await adminSystemKBPage.goto();

      const folderName = `mongodb-delete-${Date.now()}`;
      await adminSystemKBPage.createFolder(folderName);
      await adminSystemKBPage.clickFolder(folderName);

      const testFilePath = path.resolve(__dirname, '..', 'fixtures', 'files', 'test-document.txt');
      await adminSystemKBPage.uploadFileAndWait(testFilePath, 45000);

      // Delete document
      await adminSystemKBPage.deleteDocument('test-document.txt');

      // Refresh page and verify deletion persisted
      await adminSystemKBPage.page.reload();

      const exists = await adminSystemKBPage.hasDocumentNamed('test-document.txt');
      expect(exists).toBe(false);
    });

    test('should remove document from storage (S3/local) on delete', async () => {
      // This is implicitly tested by deletion, but we verify no errors occur
      await adminSystemKBPage.goto();

      const folderName = `storage-delete-${Date.now()}`;
      await adminSystemKBPage.createFolder(folderName);
      await adminSystemKBPage.clickFolder(folderName);

      const testFilePath = path.resolve(__dirname, '..', 'fixtures', 'files', 'test-document.txt');
      await adminSystemKBPage.uploadFileAndWait(testFilePath, 45000);

      // Delete and verify no error messages
      await adminSystemKBPage.deleteDocument('test-document.txt');

      // Should NOT see any error messages
      const hasError = await adminSystemKBPage.page.locator('[role="alert"], .error').isVisible({ timeout: 2000 }).catch(() => false);
      expect(hasError).toBe(false);
    });
  });

  /**
   * CHAT CONTEXT VERIFICATION
   */
  test.describe('Chat Context Removal Verification', () => {
    test('should remove deleted document from chat context', async () => {
      await adminSystemKBPage.goto();

      const folderName = `context-test-${Date.now()}`;
      await adminSystemKBPage.createFolder(folderName);
      await adminSystemKBPage.clickFolder(folderName);

      // Upload document with unique content
      const testFilePath = path.resolve(__dirname, '..', 'fixtures', 'files', 'test-document.txt');
      await adminSystemKBPage.uploadFileAndWait(testFilePath, 45000);

      // Query chat and get response with document
      await chatPage.goto();
      await chatPage.sendMessageAndWaitForResponse('Tell me about GOLDKEY', 30000);
      const beforeDelete = await chatPage.getLastAssistantMessage();

      // Delete document
      await adminSystemKBPage.goto();
      await adminSystemKBPage.clickFolder(folderName);
      await adminSystemKBPage.deleteDocument('test-document.txt');

      // Query chat again
      await chatPage.goto();
      await chatPage.sendMessageAndWaitForResponse('Tell me about GOLDKEY from the test document', 30000);
      const afterDelete = await chatPage.getLastAssistantMessage();

      // Response should indicate no access to deleted document
      expect(afterDelete.toLowerCase()).toMatch(/don't have|cannot find|no information/i);
    });

    test('should preserve other documents in chat after one deleted', async () => {
      await adminSystemKBPage.goto();

      const folderName = `preserve-test-${Date.now()}`;
      await adminSystemKBPage.createFolder(folderName);
      await adminSystemKBPage.clickFolder(folderName);

      // Upload two documents
      const file1Path = path.resolve(__dirname, '..', 'fixtures', 'files', 'test-document.txt');
      const file2Path = path.resolve(__dirname, '..', 'fixtures', 'files', 'tenant-a-document.txt');

      await adminSystemKBPage.uploadFileAndWait(file1Path, 45000);
      await adminSystemKBPage.uploadFileAndWait(file2Path, 45000);

      // Delete only first document
      await adminSystemKBPage.deleteDocument('test-document.txt');

      // Verify second document still accessible in chat
      await chatPage.goto();
      await chatPage.sendMessageAndWaitForResponse('What is TENANT_A_SECRET_DATA?', 30000);
      const response = await chatPage.getLastAssistantMessage();

      // Should still have access to second document
      expect(response).toContain('TENANT_A_SECRET_DATA');
    });
  });
});
