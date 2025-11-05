import { test, expect } from '@playwright/test';
import { AuthPage, AdminPage, ChatPage } from '../page-objects';
import { TEST_USERS, getUniqueTestUser, setupTestUsers, cleanupTestUsers, TestUser } from '../fixtures/test-users';

/**
 * Journey 2: Admin Setup → OpenAI Configuration → User Management
 *
 * This test suite validates admin operations including settings management,
 * user CRUD operations, role-based access control, and system statistics.
 *
 * Flow:
 * 1. Admin logs in
 * 2. Navigates to admin dashboard
 * 3. Updates OpenAI API key settings
 * 4. Configures system prompt
 * 5. Creates new user account
 * 6. Updates user role (user → admin)
 * 7. Views system statistics
 * 8. Manages knowledge base settings
 * 9. Logs out
 */
test.describe('Journey 2: Admin Setup → Config → User Management', () => {
  let authPage: AuthPage;
  let adminPage: AdminPage;
  let chatPage: ChatPage;

  test.beforeAll(async () => {
    // Create test users via admin API
    await setupTestUsers();
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
  });

  /**
   * HAPPY PATH: Complete admin journey
   */
  test('should complete full admin journey successfully', async ({ page }) => {
    // Step 1: Admin logs in
    await authPage.goto();
    await authPage.login(TEST_USERS.adminUser.username, TEST_USERS.adminUser.password);

    // Verify admin access
    const hasAdminAccess = await adminPage.verifyAdminAccess();
    expect(hasAdminAccess).toBe(true);

    // Step 2: Navigate to settings
    await adminPage.gotoSettings();

    // Step 3: Update OpenAI settings
    const testAPIKey = 'sk-test-' + Date.now();
    const testSystemPrompt = 'You are a helpful AI assistant for E2E testing.';
    await adminPage.updateOpenAISettings(testAPIKey, testSystemPrompt);

    // Step 4: Create new user
    const newUser = getUniqueTestUser(TEST_USERS.regularUser);
    await adminPage.createUser(
      newUser.username,
      newUser.email,
      newUser.password,
      'user'
    );

    // Verify user was created
    const userExists = await adminPage.userExists(newUser.username);
    expect(userExists).toBe(true);

    // Step 5: Update user role to admin
    await adminPage.updateUserRole(newUser.username, 'admin');

    // Verify role change
    const updatedRole = await adminPage.getUserRole(newUser.username);
    expect(updatedRole.toLowerCase()).toContain('admin');

    // Step 6: View system statistics
    const stats = await adminPage.getStatistics();
    expect(stats.users).toBeGreaterThan(0);
    expect(stats.documents).toBeGreaterThanOrEqual(0);

    // Step 7: Configure KB mode
    await adminPage.setKBMode('unified');

    // Step 8: Logout
    await chatPage.logout();
    await expect(page).toHaveURL(/\/auth|\/login/);
  });

  /**
   * AUTHENTICATION & AUTHORIZATION
   */
  test.describe('Authentication & Authorization', () => {
    test('should allow admin to access admin dashboard', async () => {
      await authPage.goto();
      await authPage.login(TEST_USERS.adminUser.username, TEST_USERS.adminUser.password);

      const hasAccess = await adminPage.verifyAdminAccess();
      expect(hasAccess).toBe(true);
    });

    test('should deny non-admin access to admin dashboard', async () => {
      await authPage.goto();
      await authPage.login(TEST_USERS.regularUser.username, TEST_USERS.regularUser.password);

      await adminPage.expectAccessDenied();
    });

    test('should redirect to login if not authenticated', async ({ page }) => {
      await page.goto('/admin');
      await expect(page).toHaveURL(/\/auth|\/login/);
    });
  });

  /**
   * SETTINGS MANAGEMENT
   */
  test.describe('Settings Management', () => {
    test.beforeEach(async () => {
      await authPage.goto();
      await authPage.login(TEST_USERS.adminUser.username, TEST_USERS.adminUser.password);
    });

    test('should update OpenAI API key', async () => {
      const newAPIKey = 'sk-test-' + Date.now();
      await adminPage.gotoSettings();
      await adminPage.updateOpenAIKey(newAPIKey);
      await adminPage.saveSettings();

      // Verify success message appears
      await adminPage.settingsSuccessMessage.waitFor({ state: 'visible' });
    });

    test('should update system prompt', async () => {
      const newPrompt = 'Updated system prompt for testing at ' + new Date().toISOString();
      await adminPage.gotoSettings();
      await adminPage.updateSystemPrompt(newPrompt);
      await adminPage.saveSettings();

      await adminPage.settingsSuccessMessage.waitFor({ state: 'visible' });
    });

    test('should persist settings after page refresh', async ({ page }) => {
      const uniquePrompt = 'Test prompt ' + Date.now();

      await adminPage.gotoSettings();
      await adminPage.updateSystemPrompt(uniquePrompt);
      await adminPage.saveSettings();

      // Refresh page
      await page.reload();

      // Verify prompt persisted
      const promptValue = await adminPage.systemPromptInput.inputValue();
      expect(promptValue).toContain(uniquePrompt);
    });

    test('should validate invalid API key format', async ({ page }) => {
      await adminPage.gotoSettings();
      await adminPage.updateOpenAIKey('invalid-key');
      await adminPage.saveSettingsButton.click();

      // Expect error message (validation may be client or server side)
      const errorMessage = page.locator('text=/invalid|error/i').first();
      await expect(errorMessage).toBeVisible({ timeout: 5000 });
    });
  });

  /**
   * USER MANAGEMENT (CRUD)
   */
  test.describe('User Management', () => {
    test.beforeEach(async () => {
      await authPage.goto();
      await authPage.login(TEST_USERS.adminUser.username, TEST_USERS.adminUser.password);
    });

    test('should create new user with user role', async () => {
      const newUser = getUniqueTestUser(TEST_USERS.regularUser);

      await adminPage.createUser(
        newUser.username,
        newUser.email,
        newUser.password,
        'user'
      );

      const exists = await adminPage.userExists(newUser.username);
      expect(exists).toBe(true);
    });

    test('should create new user with admin role', async () => {
      const newAdmin = getUniqueTestUser(TEST_USERS.adminUser);
      newAdmin.username = 'e2e-test-admin-' + Date.now();

      await adminPage.createUser(
        newAdmin.username,
        newAdmin.email,
        newAdmin.password,
        'admin'
      );

      const role = await adminPage.getUserRole(newAdmin.username);
      expect(role.toLowerCase()).toContain('admin');
    });

    test('should prevent duplicate username creation', async ({ page }) => {
      const duplicateUser = getUniqueTestUser(TEST_USERS.regularUser);

      // Create first user
      await adminPage.createUser(
        duplicateUser.username,
        duplicateUser.email,
        duplicateUser.password
      );

      // Attempt to create duplicate
      await adminPage.gotoUsers();
      await adminPage.createUserButton.click();
      await adminPage.usernameInput.fill(duplicateUser.username);
      await adminPage.emailInput.fill('different@example.com');
      await adminPage.passwordInput.fill(duplicateUser.password);
      await adminPage.submitUserButton.click();

      // Expect error
      const errorMessage = page.locator('text=/already exists|duplicate/i').first();
      await expect(errorMessage).toBeVisible({ timeout: 5000 });
    });

    test('should update user role from user to admin', async () => {
      const testUser = getUniqueTestUser(TEST_USERS.regularUser);

      // Create as user
      await adminPage.createUser(testUser.username, testUser.email, testUser.password, 'user');

      // Verify initial role
      let role = await adminPage.getUserRole(testUser.username);
      expect(role.toLowerCase()).toContain('user');

      // Update to admin
      await adminPage.updateUserRole(testUser.username, 'admin');

      // Verify updated role
      role = await adminPage.getUserRole(testUser.username);
      expect(role.toLowerCase()).toContain('admin');
    });

    test('should update user role from admin to user', async () => {
      const testUser = getUniqueTestUser(TEST_USERS.adminUser);
      testUser.username = 'e2e-test-demote-' + Date.now();

      // Create as admin
      await adminPage.createUser(testUser.username, testUser.email, testUser.password, 'admin');

      // Update to user
      await adminPage.updateUserRole(testUser.username, 'user');

      // Verify updated role
      const role = await adminPage.getUserRole(testUser.username);
      expect(role.toLowerCase()).toContain('user');
      expect(role.toLowerCase()).not.toContain('admin');
    });

    test('should delete user', async () => {
      const testUser = getUniqueTestUser(TEST_USERS.regularUser);

      // Create user
      await adminPage.createUser(testUser.username, testUser.email, testUser.password);

      // Verify exists
      let exists = await adminPage.userExists(testUser.username);
      expect(exists).toBe(true);

      // Delete user
      await adminPage.deleteUser(testUser.username);

      // Verify deleted
      exists = await adminPage.userExists(testUser.username);
      expect(exists).toBe(false);
    });
  });

  /**
   * ROLE-BASED ACCESS CONTROL
   */
  test.describe('Role-Based Access Control', () => {
    test('should enforce admin-only access to settings', async ({ page }) => {
      // Login as regular user
      await authPage.goto();
      await authPage.login(TEST_USERS.regularUser.username, TEST_USERS.regularUser.password);

      // Attempt to access admin settings
      await page.goto('/admin/settings');

      // Should be denied or redirected
      const isDenied = await page.locator('text=/Access Denied|Unauthorized|403/i').isVisible({ timeout: 3000 }).catch(() => false);
      const isRedirected = page.url().includes('/auth') || page.url().includes('/login');

      expect(isDenied || isRedirected).toBe(true);
    });

    test('should enforce admin-only access to user management', async ({ page }) => {
      await authPage.goto();
      await authPage.login(TEST_USERS.regularUser.username, TEST_USERS.regularUser.password);

      await page.goto('/admin/users');

      const isDenied = await page.locator('text=/Access Denied|Unauthorized|403/i').isVisible({ timeout: 3000 }).catch(() => false);
      const isRedirected = page.url().includes('/auth') || page.url().includes('/login');

      expect(isDenied || isRedirected).toBe(true);
    });

    test('should allow newly promoted admin to access admin pages', async ({ page }) => {
      const testUser = getUniqueTestUser(TEST_USERS.regularUser);

      // Admin creates user as regular user
      await authPage.goto();
      await authPage.login(TEST_USERS.adminUser.username, TEST_USERS.adminUser.password);
      await adminPage.createUser(testUser.username, testUser.email, testUser.password, 'user');
      await chatPage.logout();

      // New user logs in (should NOT have admin access)
      await authPage.login(testUser.username, testUser.password);
      await page.goto('/admin');
      let isDenied = await page.locator('text=/Access Denied|Unauthorized/i').isVisible({ timeout: 3000 }).catch(() => false);
      expect(isDenied || page.url().includes('/auth')).toBe(true);
      await chatPage.logout();

      // Admin promotes user to admin
      await authPage.login(TEST_USERS.adminUser.username, TEST_USERS.adminUser.password);
      await adminPage.updateUserRole(testUser.username, 'admin');
      await chatPage.logout();

      // User logs in again (should NOW have admin access)
      await authPage.login(testUser.username, testUser.password);
      const hasAdminAccess = await adminPage.verifyAdminAccess();
      expect(hasAdminAccess).toBe(true);
    });
  });

  /**
   * SYSTEM STATISTICS
   */
  test.describe('System Statistics', () => {
    test.beforeEach(async () => {
      await authPage.goto();
      await authPage.login(TEST_USERS.adminUser.username, TEST_USERS.adminUser.password);
    });

    test('should display system statistics', async () => {
      const stats = await adminPage.getStatistics();

      expect(stats.users).toBeGreaterThanOrEqual(0);
      expect(stats.documents).toBeGreaterThanOrEqual(0);
      expect(stats.queries).toBeGreaterThanOrEqual(0);
    });

    test('should increment user count after creating user', async () => {
      const initialStats = await adminPage.getStatistics();

      // Create new user
      const newUser = getUniqueTestUser(TEST_USERS.regularUser);
      await adminPage.createUser(newUser.username, newUser.email, newUser.password);

      // Refresh stats
      const updatedStats = await adminPage.getStatistics();

      expect(updatedStats.users).toBe(initialStats.users + 1);
    });

    test('should decrement user count after deleting user', async () => {
      // Create a user first
      const testUser = getUniqueTestUser(TEST_USERS.regularUser);
      await adminPage.createUser(testUser.username, testUser.email, testUser.password);

      const statsBeforeDelete = await adminPage.getStatistics();

      // Delete user
      await adminPage.deleteUser(testUser.username);

      // Refresh stats
      const statsAfterDelete = await adminPage.getStatistics();

      expect(statsAfterDelete.users).toBe(statsBeforeDelete.users - 1);
    });
  });

  /**
   * KNOWLEDGE BASE SETTINGS
   */
  test.describe('Knowledge Base Settings', () => {
    test.beforeEach(async () => {
      await authPage.goto();
      await authPage.login(TEST_USERS.adminUser.username, TEST_USERS.adminUser.password);
    });

    test('should set KB mode to unified', async () => {
      await adminPage.setKBMode('unified');
      // Success message should appear
      await adminPage.page.locator('text=/saved|success/i').waitFor({ state: 'visible', timeout: 5000 });
    });

    test('should set KB mode to user', async () => {
      await adminPage.setKBMode('user');
      await adminPage.page.locator('text=/saved|success/i').waitFor({ state: 'visible', timeout: 5000 });
    });

    test('should set KB mode to system', async () => {
      await adminPage.setKBMode('system');
      await adminPage.page.locator('text=/saved|success/i').waitFor({ state: 'visible', timeout: 5000 });
    });
  });
});
