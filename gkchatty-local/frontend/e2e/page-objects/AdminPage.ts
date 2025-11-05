import { Page, Locator } from '@playwright/test';

/**
 * AdminPage - Page Object Model for Admin Dashboard
 *
 * Handles admin-specific operations:
 * - Settings management (OpenAI config, system prompt)
 * - User management (CRUD operations, role changes)
 * - System statistics viewing
 * - Knowledge base configuration
 */
export class AdminPage {
  readonly page: Page;

  // Settings selectors
  readonly settingsTab: Locator;
  readonly openAIKeyInput: Locator;
  readonly systemPromptInput: Locator;
  readonly saveSettingsButton: Locator;
  readonly settingsSuccessMessage: Locator;

  // User management selectors
  readonly usersTab: Locator;
  readonly createUserButton: Locator;
  readonly usernameInput: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly roleSelect: Locator;
  readonly submitUserButton: Locator;
  readonly userSuccessMessage: Locator;

  // Statistics selectors
  readonly statsTab: Locator;
  readonly totalUsersCount: Locator;
  readonly totalDocumentsCount: Locator;
  readonly totalQueriesCount: Locator;

  // Knowledge base selectors
  readonly kbTab: Locator;
  readonly kbModeSelect: Locator;
  readonly kbSaveButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Settings - Tab navigation (tabs are text labels, clickable)
    this.settingsTab = page.locator('button[role="tab"]:has-text("Settings")').first();
    this.openAIKeyInput = page.locator('#apiKey, input[name="openaiKey"], input[name="openaiApiKey"], input[placeholder*="sk-"]').first();
    this.systemPromptInput = page.locator('#system-prompt, textarea[name="systemPrompt"], textarea[placeholder*="system prompt"]').first();
    this.saveSettingsButton = page.locator('button:has-text("Save"), button:has-text("Update"), button[type="submit"]').first();
    this.settingsSuccessMessage = page.locator('text=/Settings saved|Updated successfully|Success/i').first();

    // User management - Tab navigation
    this.usersTab = page.locator('button[role="tab"]:has-text("Users")').first();
    this.createUserButton = page.locator('button:has-text("Create New User")').first();
    this.usernameInput = page.locator('#username-create, input[name="username"]').first();
    this.emailInput = page.locator('#email-create, input[name="email"], input[type="email"]').first();
    this.passwordInput = page.locator('#password-create, input[name="password"], input[type="password"]').first();
    this.roleSelect = page.locator('button[role="combobox"], select').first(); // shadcn/ui Select or native select
    this.submitUserButton = page.locator('[role="dialog"] button:has-text("Create User"), [role="dialog"] button:has-text("Create"), [role="dialog"] button[type="submit"]').last();
    this.userSuccessMessage = page.locator('text=/User created|Success|successfully/i').first();

    // Statistics
    this.statsTab = page.locator('[data-testid="admin-stats-tab"], a[href*="admin/stats"], button:has-text("Statistics")').first();
    this.totalUsersCount = page.locator('[data-testid="total-users-count"], .stat-users').first();
    this.totalDocumentsCount = page.locator('[data-testid="total-documents-count"], .stat-documents').first();
    this.totalQueriesCount = page.locator('[data-testid="total-queries-count"], .stat-queries').first();

    // Knowledge base
    this.kbTab = page.locator('[data-testid="admin-kb-tab"], a[href*="admin/kb"], button:has-text("Knowledge Base")').first();
    this.kbModeSelect = page.locator('[data-testid="kb-mode-select"], select[name="kbMode"]').first();
    this.kbSaveButton = page.locator('[data-testid="kb-save-button"], button:has-text("Save KB Settings")').first();
  }

  /**
   * Navigate to admin dashboard
   */
  async goto() {
    await this.page.goto('/admin');
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Navigate to admin settings tab
   */
  async gotoSettings() {
    await this.goto();
    await this.settingsTab.click();
    await this.page.waitForLoadState('networkidle');
    await this.page.waitForTimeout(500); // Small wait for tab transition
    // Wait for settings form to be visible
    await this.openAIKeyInput.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {
      console.warn('Settings form not immediately visible');
    });
  }

  /**
   * Navigate to user management tab
   */
  async gotoUsers() {
    await this.goto();
    await this.usersTab.click();
    await this.page.waitForLoadState('networkidle');
    // Wait for user management UI to be visible
    await this.createUserButton.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {
      console.warn('User management UI not immediately visible');
    });
  }

  /**
   * Navigate to statistics page
   */
  async gotoStats() {
    await this.goto();
    await this.statsTab.click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Navigate to knowledge base settings
   */
  async gotoKBSettings() {
    await this.goto();
    await this.kbTab.click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Update OpenAI API key
   */
  async updateOpenAIKey(apiKey: string) {
    await this.openAIKeyInput.fill(apiKey);
  }

  /**
   * Update system prompt
   */
  async updateSystemPrompt(prompt: string) {
    await this.systemPromptInput.fill(prompt);
  }

  /**
   * Save settings and wait for success
   */
  async saveSettings() {
    await this.saveSettingsButton.click();
    await this.settingsSuccessMessage.waitFor({ state: 'visible', timeout: 10000 });
  }

  /**
   * Update OpenAI settings (key + prompt)
   */
  async updateOpenAISettings(apiKey: string, systemPrompt: string) {
    await this.gotoSettings();
    await this.updateOpenAIKey(apiKey);
    await this.updateSystemPrompt(systemPrompt);
    await this.saveSettings();
  }

  /**
   * Create a new user
   */
  async createUser(username: string, email: string, password: string, role: 'user' | 'admin' = 'user') {
    await this.gotoUsers();
    await this.createUserButton.click();

    await this.usernameInput.fill(username);
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);

    // Handle role selection (shadcn/ui combobox or native select)
    const isCombobox = await this.roleSelect.getAttribute('role') === 'combobox';
    if (isCombobox) {
      // Click combobox to open dropdown
      await this.roleSelect.click();
      // Wait for dropdown to appear and click the role option
      const roleOption = this.page.locator(`[role="option"]:has-text("${role === 'admin' ? 'Admin' : 'User'}")`).first();
      await roleOption.waitFor({ state: 'visible', timeout: 5000 });
      await roleOption.click();
    } else {
      // Native select
      await this.roleSelect.selectOption(role);
    }

    await this.submitUserButton.click();
    await this.userSuccessMessage.waitFor({ state: 'visible', timeout: 10000 });
  }

  /**
   * Update user role
   */
  async updateUserRole(username: string, newRole: 'user' | 'admin') {
    await this.gotoUsers();

    // Find user row and click role toggle button
    const userRow = this.page.locator(`tr:has-text("${username}")`).first();
    const roleButton = newRole === 'admin'
      ? userRow.locator('button:has-text("Make Admin")').first()
      : userRow.locator('button:has-text("Make User")').first();
    await roleButton.click();

    // Wait for success (role change is immediate via button click)
    await this.page.waitForTimeout(1000); // Allow role update to process
  }

  /**
   * Delete user
   */
  async deleteUser(username: string) {
    await this.gotoUsers();

    const userRow = this.page.locator(`tr:has-text("${username}")`).first();
    const deleteButton = userRow.locator('button:has-text("Delete User")').first();
    await deleteButton.click();

    // Confirm deletion if needed
    const confirmButton = this.page.locator('[data-testid="confirm-delete"], button:has-text("Confirm"), button:has-text("Delete")').first();
    await this.page.waitForTimeout(500); // Wait for confirmation dialog
    if (await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmButton.click();
    }

    await this.page.waitForTimeout(1000); // Allow deletion to process
  }

  /**
   * Get system statistics
   */
  async getStatistics() {
    await this.gotoStats();

    const totalUsers = await this.totalUsersCount.textContent();
    const totalDocuments = await this.totalDocumentsCount.textContent();
    const totalQueries = await this.totalQueriesCount.textContent();

    return {
      users: parseInt(totalUsers?.replace(/\D/g, '') || '0'),
      documents: parseInt(totalDocuments?.replace(/\D/g, '') || '0'),
      queries: parseInt(totalQueries?.replace(/\D/g, '') || '0'),
    };
  }

  /**
   * Check if user exists in user list
   */
  async userExists(username: string): Promise<boolean> {
    await this.gotoUsers();
    await this.page.waitForTimeout(1000); // Wait for user list to update
    const userRow = this.page.locator(`tr:has-text("${username}")`);
    const count = await userRow.count();
    return count > 0;
  }

  /**
   * Get user's current role
   */
  async getUserRole(username: string): Promise<string> {
    await this.gotoUsers();
    const userRow = this.page.locator(`tr:has-text("${username}")`).first();
    const roleCell = userRow.locator('[data-testid="user-role"], td').nth(1); // Column 2: Role (0-indexed)
    return (await roleCell.textContent()) || '';
  }

  /**
   * Verify admin access (checks if admin page loads)
   */
  async verifyAdminAccess(): Promise<boolean> {
    try {
      await this.goto();
      // Check if admin-specific element exists
      const adminElement = this.page.locator('[data-testid="admin-dashboard"], h1:has-text("Admin")').first();
      return await adminElement.isVisible({ timeout: 5000 });
    } catch {
      return false;
    }
  }

  /**
   * Verify non-admin gets denied access
   */
  async expectAccessDenied() {
    await this.goto();
    const errorMessage = this.page.locator('text=/Access Denied|Unauthorized|403/i').first();
    await errorMessage.waitFor({ state: 'visible', timeout: 5000 });
  }

  /**
   * Configure knowledge base mode
   */
  async setKBMode(mode: 'unified' | 'user' | 'system') {
    await this.gotoKBSettings();
    await this.kbModeSelect.selectOption(mode);
    await this.kbSaveButton.click();
    await this.page.locator('.success-message, text=/saved|success/i').waitFor({ state: 'visible', timeout: 5000 });
  }
}
