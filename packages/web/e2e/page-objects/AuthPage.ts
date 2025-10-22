import { Page, Locator } from '@playwright/test';

/**
 * Page Object Model for Authentication Page (/auth)
 * Handles login and registration flows
 */
export class AuthPage {
  readonly page: Page;
  readonly usernameInput: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly confirmPasswordInput: Locator;
  readonly loginButton: Locator;
  readonly registerButton: Locator;
  readonly switchToRegisterLink: Locator;
  readonly switchToLoginLink: Locator;
  readonly errorMessage: Locator;
  readonly successMessage: Locator;

  constructor(page: Page) {
    this.page = page;

    // Input fields (using placeholders as found in actual implementation)
    this.usernameInput = page.locator('input[placeholder*="username" i], input[name="username"], input[id="username"]');
    this.emailInput = page.locator('input[placeholder*="email" i], input[name="email"], input[type="email"]');
    this.passwordInput = page.locator('input[placeholder*="password" i], input[name="password"], input[type="password"]').first();
    this.confirmPasswordInput = page.locator('input[placeholder*="confirm" i], input[name="confirmPassword"], input[name="confirm_password"]');

    // Buttons
    this.loginButton = page.locator('button:has-text("Login"), button:has-text("Sign In")').first();
    this.registerButton = page.locator('button:has-text("Register"), button:has-text("Sign Up"), button:has-text("Create Account")').first();

    // Tab switches (more flexible selectors)
    this.switchToRegisterLink = page.locator('[role="tab"]:has-text("Register"), button:has-text("Register"), a:has-text("Register")').first();
    this.switchToLoginLink = page.locator('[role="tab"]:has-text("Login"), button:has-text("Login"), a:has-text("Login")').first();

    // Messages
    this.errorMessage = page.locator('[role="alert"], .error-message, .text-red');
    this.successMessage = page.locator('.success-message, .text-green');
  }

  /**
   * Navigate to auth page
   */
  async goto() {
    await this.page.goto('/auth');
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Login with credentials
   */
  async login(username: string, password: string) {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.loginButton.click();

    // Wait for navigation to complete
    await this.page.waitForURL((url) => !url.pathname.includes('/auth'), {
      timeout: 15000,
    });
  }

  /**
   * Register new user
   */
  async register(username: string, email: string, password: string) {
    // Try to switch to register tab/form
    try {
      const registerTab = this.switchToRegisterLink;
      if (await registerTab.isVisible({ timeout: 2000 })) {
        await registerTab.click();
        await this.page.waitForTimeout(1000);
      }
    } catch {
      // Already on register form or no tab switching needed
    }

    // Fill registration fields
    await this.usernameInput.fill(username);
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);

    // Fill confirm password if it exists
    try {
      if (await this.confirmPasswordInput.isVisible({ timeout: 1000 })) {
        await this.confirmPasswordInput.fill(password);
      }
    } catch {
      // No confirm password field
    }

    await this.registerButton.click();

    // Wait for either success or error
    await Promise.race([
      this.page.waitForURL((url) => !url.pathname.includes('/auth')),
      this.errorMessage.waitFor({ timeout: 5000 }),
      this.successMessage.waitFor({ timeout: 5000 }),
    ]);
  }

  /**
   * Switch to register form
   */
  async switchToRegister() {
    if (await this.switchToRegisterLink.isVisible()) {
      await this.switchToRegisterLink.click();
      await this.page.waitForTimeout(500);
    }
  }

  /**
   * Switch to login form
   */
  async switchToLogin() {
    if (await this.switchToLoginLink.isVisible()) {
      await this.switchToLoginLink.click();
      await this.page.waitForTimeout(500);
    }
  }

  /**
   * Check if error message is displayed
   */
  async hasError(): Promise<boolean> {
    return await this.errorMessage.isVisible();
  }

  /**
   * Get error message text
   */
  async getErrorMessage(): Promise<string> {
    return await this.errorMessage.textContent() || '';
  }

  /**
   * Wait for successful login (redirect away from /auth)
   */
  async waitForSuccessfulLogin() {
    await this.page.waitForURL((url) => !url.pathname.includes('/auth'), {
      timeout: 15000,
    });
  }
}
