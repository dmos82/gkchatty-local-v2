import { Page, Locator } from '@playwright/test';

/**
 * Page Object Model for Chat Page (/)
 * Handles chat interface interactions
 */
export class ChatPage {
  readonly page: Page;
  readonly chatInput: Locator;
  readonly sendButton: Locator;
  readonly messageContainer: Locator;
  readonly userMessages: Locator;
  readonly assistantMessages: Locator;
  readonly loadingIndicator: Locator;
  readonly knowledgeBaseSelector: Locator;
  readonly systemKBSwitch: Locator;
  readonly userDocsSwitch: Locator;
  readonly personaToggle: Locator;
  readonly clearChatButton: Locator;
  readonly logoutButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Chat input elements
    this.chatInput = page.locator('textarea[placeholder*="message"], textarea[name="message"], input[type="text"][placeholder*="message"]');
    this.sendButton = page.locator('button[type="submit"]:has-text("Send"), button:has([data-icon="send"])');

    // Message elements - updated to match actual DOM structure
    // Messages use data-testid="chat-message-bubble" and distinguish by bg color classes
    this.messageContainer = page.locator('[class*="message-container"], [class*="chat-messages"]');
    this.userMessages = page.locator('[data-testid="chat-message-bubble"]:has([class*="bg-blue"])');
    this.assistantMessages = page.locator('[data-testid="chat-message-bubble"]:has([class*="bg-white"], [class*="bg-neutral-800"])');

    // Loading and status
    this.loadingIndicator = page.locator('[class*="loading"], [aria-label="Loading"]');

    // Controls
    this.knowledgeBaseSelector = page.locator('select[name*="knowledge"], [data-testid="kb-selector"]');
    this.systemKBSwitch = page.locator('button[title="Search only Knowledge Base"]');
    this.userDocsSwitch = page.locator('button[title="Search only My Documents"]');
    this.personaToggle = page.locator('button:has-text("Persona"), [data-testid="persona-toggle"]');
    this.clearChatButton = page.locator('button:has-text("Clear"), button:has-text("New Chat")');
    this.logoutButton = page.locator('button:has-text("Logout"), button:has-text("Sign Out")');
  }

  /**
   * Navigate to chat page
   */
  async goto() {
    await this.page.goto('/');
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Send a chat message
   */
  async sendMessage(message: string) {
    await this.chatInput.fill(message);
    await this.sendButton.click();
  }

  /**
   * Send message and wait for response
   * Updated to match actual DOM structure with data-testid
   * Increased timeout for LLM + RAG retrieval + embedding search
   */
  async sendMessageAndWaitForResponse(message: string, timeout = 60000) {
    const initialMessageCount = await this.assistantMessages.count();

    await this.sendMessage(message);

    // Wait for new assistant message using actual DOM structure
    await this.page.waitForFunction(
      (count) => {
        const messages = document.querySelectorAll('[data-testid="chat-message-bubble"]');
        // Filter for assistant messages (bg-white or bg-neutral-800)
        const assistantMessages = Array.from(messages).filter(el =>
          el.className.includes('bg-white') || el.className.includes('bg-neutral-800')
        );
        return assistantMessages.length > count;
      },
      initialMessageCount,
      { timeout }
    );

    // Wait for pulse animation to stop (message generation complete)
    await this.page.waitForFunction(() => {
      const bubbles = document.querySelectorAll('[data-testid="chat-message-bubble"]');
      if (bubbles.length === 0) return false;
      const lastBubble = bubbles[bubbles.length - 1];
      return !lastBubble.classList.contains('animate-pulse');
    }, { timeout: 15000 }).catch(() => {
      // If pulse check times out, message might be complete anyway
      console.warn('Pulse animation check timed out, proceeding anyway');
    });

    // Wait for loading to finish
    await this.waitForLoadingComplete();
  }

  /**
   * Get the last message text
   */
  async getLastMessage(): Promise<string> {
    const messages = await this.assistantMessages.all();
    if (messages.length === 0) {
      return '';
    }
    return await messages[messages.length - 1].textContent() || '';
  }

  /**
   * Get the last assistant message
   */
  async getLastAssistantMessage(): Promise<string> {
    const messages = await this.assistantMessages.all();
    if (messages.length === 0) {
      return '';
    }
    return await messages[messages.length - 1].textContent() || '';
  }

  /**
   * Get all user messages
   */
  async getAllUserMessages(): Promise<string[]> {
    const messages = await this.userMessages.all();
    return await Promise.all(messages.map(m => m.textContent().then(t => t || '')));
  }

  /**
   * Get all assistant messages
   */
  async getAllAssistantMessages(): Promise<string[]> {
    const messages = await this.assistantMessages.all();
    return await Promise.all(messages.map(m => m.textContent().then(t => t || '')));
  }

  /**
   * Wait for loading to complete
   */
  async waitForLoadingComplete(timeout = 30000) {
    try {
      await this.loadingIndicator.waitFor({ state: 'hidden', timeout });
    } catch {
      // If loading indicator doesn't exist, that's fine
    }
  }

  /**
   * Check if a response contains specific text
   */
  async responseContains(text: string): Promise<boolean> {
    const lastMessage = await this.getLastAssistantMessage();
    return lastMessage.toLowerCase().includes(text.toLowerCase());
  }

  /**
   * Select knowledge base mode
   */
  async selectKnowledgeBase(mode: 'unified' | 'user' | 'system' | string) {
    if (await this.knowledgeBaseSelector.isVisible()) {
      await this.knowledgeBaseSelector.selectOption(mode);
      await this.page.waitForTimeout(500);
    }
  }

  /**
   * Switch knowledge base mode using mode buttons
   * Fixes chat timeout issue - ensures tests query user-docs (where uploads go)
   * instead of system-kb (which is empty)
   */
  async switchKnowledgeBaseMode(mode: 'system-kb' | 'user-docs') {
    // Map mode to button
    const targetButton = mode === 'system-kb' ? this.systemKBSwitch : this.userDocsSwitch;

    // Wait for button to be visible
    await targetButton.waitFor({ state: 'visible', timeout: 5000 });

    // Click the mode button
    await targetButton.click();

    // Wait for mode switch to complete
    await this.page.waitForTimeout(500);

    // Wait for any UI updates
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Toggle persona on/off
   */
  async togglePersona() {
    if (await this.personaToggle.isVisible()) {
      await this.personaToggle.click();
      await this.page.waitForTimeout(500);
    }
  }

  /**
   * Clear chat history
   */
  async clearChat() {
    if (await this.clearChatButton.isVisible()) {
      await this.clearChatButton.click();
      await this.page.waitForTimeout(500);
    }
  }

  /**
   * Logout from the application
   * Works from any page by first navigating to chat if needed
   */
  async logout() {
    // If not on chat page, navigate there first
    const currentUrl = this.page.url();
    if (!currentUrl.includes('/chat') && !currentUrl.endsWith('/')) {
      await this.goto();
      await this.page.waitForTimeout(1000); // Wait for page to fully load
    }

    // Try to find and click logout button with multiple fallback selectors
    const logoutSelectors = [
      'button:has-text("Logout")',
      'button:has-text("Sign Out")',
      'button:has-text("Log Out")',
      '[data-testid="logout-button"]',
      'a[href="/auth/logout"]',
      'button[aria-label*="logout" i]',
      'button[aria-label*="sign out" i]'
    ];

    for (const selector of logoutSelectors) {
      const button = this.page.locator(selector).first();
      if (await button.isVisible({ timeout: 2000 }).catch(() => false)) {
        await button.click();
        await this.page.waitForURL('/auth', { timeout: 10000 }).catch(() => {
          // If URL doesn't change, might be on auth page already
          console.warn('Logout clicked but URL did not change to /auth');
        });
        return;
      }
    }

    // If no logout button found, try navigating to auth directly
    console.warn('No logout button found, navigating to /auth directly');
    await this.page.goto('/auth');
  }

  /**
   * Wait for specific text in any message
   * Updated to use actual DOM structure
   */
  async waitForMessageContaining(text: string, timeout = 30000) {
    await this.page.waitForFunction(
      (searchText) => {
        const messages = document.querySelectorAll('[data-testid="chat-message-bubble"]');
        return Array.from(messages).some(m =>
          m.textContent?.toLowerCase().includes(searchText.toLowerCase())
        );
      },
      text,
      { timeout }
    );
  }

  /**
   * Get message count
   */
  async getMessageCount(): Promise<number> {
    return await this.assistantMessages.count();
  }
}
