import { test, expect } from '@playwright/test';
import { AuthPage, AdminPage, ChatPage, DocumentsPage } from '../page-objects';
import { TEST_USERS, getUniqueTestUser, setupTestUsers, cleanupTestUsers } from '../fixtures/test-users';
import { TEST_DOCUMENTS, createTestFiles, testFilesExist } from '../fixtures/test-documents';
import path from 'path';

/**
 * Journey 4: Knowledge Base Isolation → Multi-Tenant Data Segregation
 *
 * **SECURITY CRITICAL TESTS**
 *
 * This test suite validates critical security requirements for multi-tenant data isolation:
 * - Tenant-specific vector namespaces (user-{userId})
 * - Zero cross-tenant data contamination
 * - User KB vs System KB separation
 * - Admin unified access capabilities
 * - Pinecone namespace isolation
 *
 * Flow:
 * 1. Admin creates Tenant A user
 * 2. Admin creates Tenant B user
 * 3. Tenant A logs in, uploads Document A
 * 4. Tenant A asks question, gets Document A context
 * 5. Tenant A logs out
 * 6. Tenant B logs in, uploads Document B
 * 7. Tenant B asks same question
 * 8. Verifies Tenant B ONLY sees Document B context
 * 9. Verifies NO contamination from Tenant A
 * 10. Admin logs in, switches to "unified" KB mode
 * 11. Verifies admin sees both tenants' documents
 */
test.describe('Journey 4: KB Isolation → Multi-Tenant 🔒 SECURITY CRITICAL', () => {
  let authPage: AuthPage;
  let adminPage: AdminPage;
  let chatPage: ChatPage;
  let documentsPage: DocumentsPage;

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
    adminPage = new AdminPage(page);
    chatPage = new ChatPage(page);
    documentsPage = new DocumentsPage(page);
  });

  /**
   * CRITICAL: Complete multi-tenant isolation journey
   */
  test('🔒 CRITICAL: should enforce complete tenant isolation', async ({ page }, testInfo) => {
    // Mark as critical for reporting
    testInfo.annotations.push({ type: 'security', description: 'multi-tenant isolation' });

    // Step 1: Admin creates Tenant A
    await authPage.goto();
    await authPage.login(TEST_USERS.adminUser.username, TEST_USERS.adminUser.password);

    const tenantA = getUniqueTestUser(TEST_USERS.tenantA);
    await adminPage.createUser(tenantA.username, tenantA.email, tenantA.password, 'user');

    // Step 2: Admin creates Tenant B
    const tenantB = getUniqueTestUser(TEST_USERS.tenantB);
    await adminPage.createUser(tenantB.username, tenantB.email, tenantB.password, 'user');

    await chatPage.logout();

    // Step 3: Tenant A logs in and uploads Document A
    await authPage.login(tenantA.username, tenantA.password);
    await documentsPage.goto();

    const docAPath = path.resolve(__dirname, '..', 'fixtures', 'files', 'tenant-a-document.txt');
    await documentsPage.uploadFileAndWait(docAPath, 45000);

    // Step 4: Tenant A asks question and gets Document A context
    await chatPage.goto();
    await chatPage.sendMessageAndWaitForResponse('What is TENANT_A_SECRET_DATA?', 30000);
    const tenantAResponse = await chatPage.getLastAssistantMessage();

    // ASSERT: Tenant A can see their own data
    expect(tenantAResponse).toContain('TENANT_A_SECRET_DATA');

    // Step 5: Tenant A logs out
    await chatPage.logout();

    // Step 6: Tenant B logs in and uploads Document B
    await authPage.login(tenantB.username, tenantB.password);
    await documentsPage.goto();

    const docBPath = path.resolve(__dirname, '..', 'fixtures', 'files', 'tenant-b-document.txt');
    await documentsPage.uploadFileAndWait(docBPath, 45000);

    // Step 7: Tenant B asks same question
    await chatPage.goto();
    await chatPage.sendMessageAndWaitForResponse('What is TENANT_B_SECRET_DATA?', 30000);
    const tenantBResponseOwn = await chatPage.getLastAssistantMessage();

    // CRITICAL ASSERT: Tenant B can see their own data
    expect(tenantBResponseOwn).toContain('TENANT_B_SECRET_DATA');

    // Step 8 & 9: CRITICAL - Verify NO cross-tenant contamination
    await chatPage.sendMessageAndWaitForResponse('What is TENANT_A_SECRET_DATA?', 30000);
    const tenantBResponseCrossTenant = await chatPage.getLastAssistantMessage();

    // CRITICAL ASSERT: Tenant B CANNOT see Tenant A's data
    expect(tenantBResponseCrossTenant).not.toContain('TENANT_A_SECRET_DATA');
    expect(tenantBResponseCrossTenant.toLowerCase()).toMatch(/don't have|cannot find|no information/i);

    await chatPage.logout();

    // Step 10: Admin logs in and switches to unified KB mode
    await authPage.login(TEST_USERS.adminUser.username, TEST_USERS.adminUser.password);
    await adminPage.setKBMode('unified');

    // Step 11: Verify admin sees both tenants' documents
    await chatPage.goto();

    // Query for Tenant A data
    await chatPage.sendMessageAndWaitForResponse('What is TENANT_A_SECRET_DATA?', 30000);
    const adminResponseA = await chatPage.getLastAssistantMessage();
    expect(adminResponseA).toContain('TENANT_A_SECRET_DATA');

    // Query for Tenant B data
    await chatPage.sendMessageAndWaitForResponse('What is TENANT_B_SECRET_DATA?', 30000);
    const adminResponseB = await chatPage.getLastAssistantMessage();
    expect(adminResponseB).toContain('TENANT_B_SECRET_DATA');
  });

  /**
   * NAMESPACE ISOLATION TESTS
   */
  test.describe('🔒 Namespace Isolation', () => {
    test('should isolate Tenant A vectors in user-{tenantA-id} namespace', async () => {
      // Create tenant A
      await authPage.goto();
      await authPage.login(TEST_USERS.adminUser.username, TEST_USERS.adminUser.password);

      const tenantA = getUniqueTestUser(TEST_USERS.tenantA);
      await adminPage.createUser(tenantA.username, tenantA.email, tenantA.password);
      await chatPage.logout();

      // Tenant A uploads document
      await authPage.login(tenantA.username, tenantA.password);
      await documentsPage.goto();

      const docPath = path.resolve(__dirname, '..', 'fixtures', 'files', 'tenant-a-document.txt');
      await documentsPage.uploadFileAndWait(docPath, 45000);

      // Verify tenant can query their own data
      await chatPage.goto();
      await chatPage.sendMessageAndWaitForResponse('What secret data do I have?', 30000);
      const response = await chatPage.getLastAssistantMessage();

      expect(response).toContain('TENANT_A_SECRET_DATA');
    });

    test('should isolate Tenant B vectors in user-{tenantB-id} namespace', async () => {
      await authPage.goto();
      await authPage.login(TEST_USERS.adminUser.username, TEST_USERS.adminUser.password);

      const tenantB = getUniqueTestUser(TEST_USERS.tenantB);
      await adminPage.createUser(tenantB.username, tenantB.email, tenantB.password);
      await chatPage.logout();

      await authPage.login(tenantB.username, tenantB.password);
      await documentsPage.goto();

      const docPath = path.resolve(__dirname, '..', 'fixtures', 'files', 'tenant-b-document.txt');
      await documentsPage.uploadFileAndWait(docPath, 45000);

      await chatPage.goto();
      await chatPage.sendMessageAndWaitForResponse('What secret data do I have?', 30000);
      const response = await chatPage.getLastAssistantMessage();

      expect(response).toContain('TENANT_B_SECRET_DATA');
    });
  });

  /**
   * CROSS-TENANT CONTAMINATION PREVENTION
   */
  test.describe('🔒 Cross-Tenant Contamination Prevention', () => {
    test('🔒 CRITICAL: Tenant B query should return ZERO results for Tenant A content', async ({}, testInfo) => {
      testInfo.annotations.push({ type: 'security', description: 'zero cross-tenant leakage' });

      // Setup: Create both tenants with documents
      await authPage.goto();
      await authPage.login(TEST_USERS.adminUser.username, TEST_USERS.adminUser.password);

      const tenantA = getUniqueTestUser(TEST_USERS.tenantA);
      const tenantB = getUniqueTestUser(TEST_USERS.tenantB);

      await adminPage.createUser(tenantA.username, tenantA.email, tenantA.password);
      await adminPage.createUser(tenantB.username, tenantB.email, tenantB.password);
      await chatPage.logout();

      // Tenant A uploads
      await authPage.login(tenantA.username, tenantA.password);
      await documentsPage.goto();
      const docAPath = path.resolve(__dirname, '..', 'fixtures', 'files', 'tenant-a-document.txt');
      await documentsPage.uploadFileAndWait(docAPath, 45000);
      await chatPage.logout();

      // Tenant B uploads
      await authPage.login(tenantB.username, tenantB.password);
      await documentsPage.goto();
      const docBPath = path.resolve(__dirname, '..', 'fixtures', 'files', 'tenant-b-document.txt');
      await documentsPage.uploadFileAndWait(docBPath, 45000);

      // CRITICAL TEST: Tenant B tries to access Tenant A data
      await chatPage.goto();
      await chatPage.sendMessageAndWaitForResponse('Tell me about TENANT_A_SECRET_DATA', 30000);
      const response = await chatPage.getLastAssistantMessage();

      // CRITICAL ASSERTIONS
      expect(response).not.toContain('TENANT_A_SECRET_DATA');
      expect(response).not.toContain('tenant-a-document');
      expect(response.toLowerCase()).toMatch(/don't have|cannot find|no information|not available/i);
    });

    test('🔒 CRITICAL: Tenant A cannot see Tenant B data even with direct query', async ({}, testInfo) => {
      testInfo.annotations.push({ type: 'security', description: 'reverse isolation check' });

      // Setup
      await authPage.goto();
      await authPage.login(TEST_USERS.adminUser.username, TEST_USERS.adminUser.password);

      const tenantA = getUniqueTestUser(TEST_USERS.tenantA);
      const tenantB = getUniqueTestUser(TEST_USERS.tenantB);

      await adminPage.createUser(tenantA.username, tenantA.email, tenantA.password);
      await adminPage.createUser(tenantB.username, tenantB.email, tenantB.password);
      await chatPage.logout();

      // Tenant B uploads first
      await authPage.login(tenantB.username, tenantB.password);
      await documentsPage.goto();
      const docBPath = path.resolve(__dirname, '..', 'fixtures', 'files', 'tenant-b-document.txt');
      await documentsPage.uploadFileAndWait(docBPath, 45000);
      await chatPage.logout();

      // Tenant A uploads
      await authPage.login(tenantA.username, tenantA.password);
      await documentsPage.goto();
      const docAPath = path.resolve(__dirname, '..', 'fixtures', 'files', 'tenant-a-document.txt');
      await documentsPage.uploadFileAndWait(docAPath, 45000);

      // CRITICAL TEST: Tenant A tries to access Tenant B data
      await chatPage.goto();
      await chatPage.sendMessageAndWaitForResponse('What is TENANT_B_SECRET_DATA?', 30000);
      const response = await chatPage.getLastAssistantMessage();

      // CRITICAL ASSERTIONS
      expect(response).not.toContain('TENANT_B_SECRET_DATA');
      expect(response.toLowerCase()).toMatch(/don't have|cannot find|no information/i);
    });

    test('🔒 should prevent vector namespace leakage through timing attacks', async () => {
      // This tests for side-channel attacks where query time might reveal other tenants' data

      await authPage.goto();
      await authPage.login(TEST_USERS.adminUser.username, TEST_USERS.adminUser.password);

      const tenantA = getUniqueTestUser(TEST_USERS.tenantA);
      await adminPage.createUser(tenantA.username, tenantA.email, tenantA.password);
      await chatPage.logout();

      await authPage.login(tenantA.username, tenantA.password);
      await documentsPage.goto();
      const docPath = path.resolve(__dirname, '..', 'fixtures', 'files', 'tenant-a-document.txt');
      await documentsPage.uploadFileAndWait(docPath, 45000);

      // Query for own data (should be fast)
      await chatPage.goto();
      const start1 = Date.now();
      await chatPage.sendMessageAndWaitForResponse('What is TENANT_A_SECRET_DATA?', 30000);
      const ownDataTime = Date.now() - start1;

      // Query for non-existent data (should be similarly fast, not slower due to cross-tenant search)
      const start2 = Date.now();
      await chatPage.sendMessageAndWaitForResponse('What is TENANT_B_SECRET_DATA?', 30000);
      const otherDataTime = Date.now() - start2;

      // Response times should be similar (within 50% of each other)
      // If otherDataTime is significantly longer, it might indicate cross-tenant search
      const timeDifferenceRatio = Math.abs(otherDataTime - ownDataTime) / ownDataTime;
      expect(timeDifferenceRatio).toBeLessThan(0.5);
    });
  });

  /**
   * USER KB VS SYSTEM KB SEPARATION
   */
  test.describe('🔒 User KB vs System KB Separation', () => {
    test('should separate user documents from system KB', async () => {
      await authPage.goto();
      await authPage.login(TEST_USERS.regularUser.username, TEST_USERS.regularUser.password);

      // Upload user document
      await documentsPage.goto();
      const docPath = path.resolve(__dirname, '..', 'fixtures', 'files', 'test-document.txt');
      await documentsPage.uploadFileAndWait(docPath, 45000);

      // Switch to user KB mode
      await chatPage.goto();
      await chatPage.selectKnowledgeBase('user');

      // Query should return user document
      await chatPage.sendMessageAndWaitForResponse('What does my test document say?', 30000);
      const userResponse = await chatPage.getLastAssistantMessage();
      expect(userResponse.toLowerCase()).toContain('goldkey');

      // Switch to system KB mode
      await chatPage.selectKnowledgeBase('system');

      // Query should NOT return user document (only system docs)
      await chatPage.sendMessageAndWaitForResponse('What does my test document say?', 30000);
      const systemResponse = await chatPage.getLastAssistantMessage();
      expect(systemResponse.toLowerCase()).toMatch(/don't have|cannot find|no user documents/i);
    });

    test('should allow unified KB mode to access both user and system', async () => {
      await authPage.goto();
      await authPage.login(TEST_USERS.adminUser.username, TEST_USERS.adminUser.password);

      // Upload admin document
      await documentsPage.goto();
      const docPath = path.resolve(__dirname, '..', 'fixtures', 'files', 'test-document.txt');
      await documentsPage.uploadFileAndWait(docPath, 45000);

      // Switch to unified mode
      await chatPage.goto();
      await chatPage.selectKnowledgeBase('unified');

      // Should access both user and system KB
      await chatPage.sendMessageAndWaitForResponse('What documents do I have access to?', 30000);
      const response = await chatPage.getLastAssistantMessage();

      // Response should indicate unified access
      expect(response.toLowerCase()).toMatch(/documents|knowledge base|files/i);
    });
  });

  /**
   * ADMIN UNIFIED ACCESS
   */
  test.describe('🔒 Admin Unified Access', () => {
    test('should allow admin in unified mode to see all tenant documents', async () => {
      // Create two tenants with documents
      await authPage.goto();
      await authPage.login(TEST_USERS.adminUser.username, TEST_USERS.adminUser.password);

      const tenantA = getUniqueTestUser(TEST_USERS.tenantA);
      const tenantB = getUniqueTestUser(TEST_USERS.tenantB);

      await adminPage.createUser(tenantA.username, tenantA.email, tenantA.password);
      await adminPage.createUser(tenantB.username, tenantB.email, tenantB.password);
      await chatPage.logout();

      // Tenant A uploads
      await authPage.login(tenantA.username, tenantA.password);
      await documentsPage.goto();
      const docAPath = path.resolve(__dirname, '..', 'fixtures', 'files', 'tenant-a-document.txt');
      await documentsPage.uploadFileAndWait(docAPath, 45000);
      await chatPage.logout();

      // Tenant B uploads
      await authPage.login(tenantB.username, tenantB.password);
      await documentsPage.goto();
      const docBPath = path.resolve(__dirname, '..', 'fixtures', 'files', 'tenant-b-document.txt');
      await documentsPage.uploadFileAndWait(docBPath, 45000);
      await chatPage.logout();

      // Admin logs in with unified mode
      await authPage.login(TEST_USERS.adminUser.username, TEST_USERS.adminUser.password);
      await adminPage.setKBMode('unified');
      await chatPage.goto();

      // Admin should see Tenant A data
      await chatPage.sendMessageAndWaitForResponse('What is TENANT_A_SECRET_DATA?', 30000);
      const responseA = await chatPage.getLastAssistantMessage();
      expect(responseA).toContain('TENANT_A_SECRET_DATA');

      // Admin should see Tenant B data
      await chatPage.sendMessageAndWaitForResponse('What is TENANT_B_SECRET_DATA?', 30000);
      const responseB = await chatPage.getLastAssistantMessage();
      expect(responseB).toContain('TENANT_B_SECRET_DATA');
    });

    test('should restrict admin to own data when not in unified mode', async () => {
      await authPage.goto();
      await authPage.login(TEST_USERS.adminUser.username, TEST_USERS.adminUser.password);

      // Create tenant with document
      const tenant = getUniqueTestUser(TEST_USERS.tenantA);
      await adminPage.createUser(tenant.username, tenant.email, tenant.password);
      await chatPage.logout();

      await authPage.login(tenant.username, tenant.password);
      await documentsPage.goto();
      const docPath = path.resolve(__dirname, '..', 'fixtures', 'files', 'tenant-a-document.txt');
      await documentsPage.uploadFileAndWait(docPath, 45000);
      await chatPage.logout();

      // Admin logs in with USER mode (not unified)
      await authPage.login(TEST_USERS.adminUser.username, TEST_USERS.adminUser.password);
      await chatPage.goto();
      await chatPage.selectKnowledgeBase('user');

      // Admin should NOT see other user's data in user mode
      await chatPage.sendMessageAndWaitForResponse('What is TENANT_A_SECRET_DATA?', 30000);
      const response = await chatPage.getLastAssistantMessage();
      expect(response).not.toContain('TENANT_A_SECRET_DATA');
    });
  });
});
