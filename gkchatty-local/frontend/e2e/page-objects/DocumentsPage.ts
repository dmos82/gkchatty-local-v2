import { Page, Locator } from '@playwright/test';

/**
 * Page Object Model for Documents Page (/documents)
 * Handles document upload, management, and folder operations
 */
export class DocumentsPage {
  readonly page: Page;
  readonly fileInput: Locator;
  readonly uploadButton: Locator;
  readonly uploadProgress: Locator;
  readonly documentList: Locator;
  readonly documentItems: Locator;
  readonly createFolderButton: Locator;
  readonly folderNameInput: Locator;
  readonly deleteFolderButton: Locator;
  readonly deleteDocumentButton: Locator;
  readonly successMessage: Locator;
  readonly errorMessage: Locator;
  readonly processingStatus: Locator;

  constructor(page: Page) {
    this.page = page;

    // Upload elements
    this.fileInput = page.locator('input[type="file"]');
    this.uploadButton = page.locator('button:has-text("Upload")');
    this.uploadProgress = page.locator('[role="progressbar"], [class*="progress"]');

    // Document list
    this.documentList = page.locator('[class*="document-list"], [data-testid="document-list"]');
    this.documentItems = page.locator('[class*="document-item"], [data-testid*="document"]');

    // Folder operations
    this.createFolderButton = page.locator('button:has-text("New Folder"), button:has-text("Create Folder")');
    this.folderNameInput = page.locator('input[name="folderName"], input[placeholder*="folder"]');
    this.deleteFolderButton = page.locator('button:has-text("Delete Folder")');

    // Document operations
    this.deleteDocumentButton = page.locator('button:has-text("Delete"), button[aria-label*="delete"]');

    // Status messages
    this.successMessage = page.locator('[role="status"]:has-text("success"), .success-message');
    this.errorMessage = page.locator('[role="alert"], .error-message');
    this.processingStatus = page.locator('[class*="processing"], :has-text("Processing")');
  }

  /**
   * Navigate to documents page
   */
  async goto() {
    await this.page.goto('/documents');
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Upload a file
   */
  async uploadFile(filePath: string) {
    await this.fileInput.setInputFiles(filePath);

    // Wait for upload to start
    await this.page.waitForTimeout(500);
  }

  /**
   * Upload file and wait for processing to complete
   */
  async uploadFileAndWait(filePath: string, timeout = 60000) {
    await this.uploadFile(filePath);

    // Wait for processing to complete
    await this.waitForProcessingComplete(timeout);
  }

  /**
   * Wait for document processing to complete
   */
  async waitForProcessingComplete(timeout = 60000) {
    try {
      // Wait for processing indicator to appear
      await this.processingStatus.waitFor({ state: 'visible', timeout: 5000 });
    } catch {
      // If it doesn't appear, processing might be instant
    }

    // Wait for processing to finish
    try {
      await this.processingStatus.waitFor({ state: 'hidden', timeout });
    } catch {
      // If processing status doesn't exist, that's ok
    }

    // Additional wait for UI to update
    await this.page.waitForTimeout(1000);
  }

  /**
   * Create a new folder
   */
  async createFolder(folderName: string) {
    await this.createFolderButton.click();
    await this.folderNameInput.fill(folderName);

    // Find and click submit button in modal/dialog
    await this.page.locator('button:has-text("Create"), button:has-text("Save")').click();

    // Wait for folder to be created
    await this.page.waitForTimeout(1000);
  }

  /**
   * Delete a document by name
   */
  async deleteDocument(documentName: string) {
    // Find the document item
    const documentItem = this.page.locator(`[class*="document-item"]:has-text("${documentName}")`).first();

    // Click delete button within the document item
    const deleteButton = documentItem.locator('button:has-text("Delete"), button[aria-label*="delete"]').first();
    await deleteButton.click();

    // Confirm deletion if needed
    const confirmButton = this.page.locator('button:has-text("Confirm"), button:has-text("Yes")');
    if (await confirmButton.isVisible({ timeout: 2000 })) {
      await confirmButton.click();
    }

    // Wait for deletion to complete
    await this.page.waitForTimeout(1000);
  }

  /**
   * Check if document exists by name
   * Updated to match actual DOM structure: div.flex.justify-between containing button with filename
   */
  async hasDocument(documentName: string): Promise<boolean> {
    // The document name appears in a button element within the flex container
    const document = this.page.locator(`button:has-text("${documentName}")`).first();
    const isVisible = await document.isVisible({ timeout: 5000 });

    if (!isVisible) {
      // Debug: log what we can find
      const allButtons = await this.page.locator('button').allTextContents();
      console.log(`[hasDocument] Looking for "${documentName}", found buttons:`, allButtons.slice(0, 10));
    }

    return isVisible;
  }

  /**
   * Get document processing status by name
   * Returns the status text (e.g., "completed", "processing", "failed")
   */
  async getDocumentStatus(documentName: string): Promise<string> {
    // Find the document row/container
    const documentRow = this.page.locator(`button:has-text("${documentName}")`).first().locator('..');

    // Look for status indicator (could be badge, text, or icon)
    const statusElement = documentRow.locator('[class*="status"], [data-status], [class*="badge"]').first();

    // Try to get status from element
    const statusText = await statusElement.textContent({ timeout: 5000 }).catch(() => null);

    // If no explicit status element, check if processing indicator is visible
    if (!statusText) {
      const isProcessing = await documentRow.locator('[class*="processing"], [class*="spinner"]').isVisible().catch(() => false);
      return isProcessing ? 'processing' : 'completed';
    }

    return statusText.toLowerCase().trim();
  }

  /**
   * Get list of all document names
   */
  async getAllDocumentNames(): Promise<string[]> {
    const documents = await this.documentItems.all();
    const names: string[] = [];

    for (const doc of documents) {
      const text = await doc.textContent();
      if (text) {
        names.push(text.trim());
      }
    }

    return names;
  }

  /**
   * Move document to folder
   */
  async moveDocumentToFolder(documentName: string, folderName: string) {
    // Find the document
    const documentItem = this.page.locator(`[class*="document-item"]:has-text("${documentName}")`).first();

    // Open context menu or move dialog
    const moveButton = documentItem.locator('button:has-text("Move"), button[aria-label*="move"]').first();
    await moveButton.click();

    // Select folder
    const folderOption = this.page.locator(`[role="option"]:has-text("${folderName}"), button:has-text("${folderName}")`).first();
    await folderOption.click();

    // Wait for move to complete
    await this.page.waitForTimeout(1000);
  }

  /**
   * Wait for success message
   */
  async waitForSuccess(timeout = 10000) {
    await this.successMessage.waitFor({ state: 'visible', timeout });
  }

  /**
   * Wait for error message
   */
  async waitForError(timeout = 10000) {
    await this.errorMessage.waitFor({ state: 'visible', timeout });
  }

  /**
   * Get number of documents
   */
  async getDocumentCount(): Promise<number> {
    return await this.documentItems.count();
  }

  /**
   * Rename folder
   */
  async renameFolder(oldName: string, newName: string) {
    const folderItem = this.page.locator(`[class*="folder-item"]:has-text("${oldName}"), [data-testid*="folder"]:has-text("${oldName}")`).first();

    // Click rename button or right-click for context menu
    const renameButton = folderItem.locator('button:has-text("Rename"), button[aria-label*="rename"]').first();
    await renameButton.click();

    // Fill new name
    const renameInput = this.page.locator('input[value*="${oldName}"], input[placeholder*="folder"]').first();
    await renameInput.fill(newName);

    // Submit
    await this.page.locator('button:has-text("Save"), button:has-text("Rename")').click();

    await this.page.waitForTimeout(1000);
  }

  /**
   * Delete folder
   */
  async deleteFolder(folderName: string) {
    const folderItem = this.page.locator(`[class*="folder-item"]:has-text("${folderName}"), [data-testid*="folder"]:has-text("${folderName}")`).first();

    const deleteButton = folderItem.locator('button:has-text("Delete"), button[aria-label*="delete"]').first();
    await deleteButton.click();

    // Confirm deletion
    const confirmButton = this.page.locator('button:has-text("Confirm"), button:has-text("Yes")');
    if (await confirmButton.isVisible({ timeout: 2000 })) {
      await confirmButton.click();
    }

    await this.page.waitForTimeout(1000);
  }

  /**
   * Check if folder exists
   */
  async hasFolder(folderName: string): Promise<boolean> {
    const folder = this.page.locator(`[class*="folder-item"]:has-text("${folderName}"), [data-testid*="folder"]:has-text("${folderName}")`).first();
    return await folder.isVisible({ timeout: 2000 });
  }

  /**
   * Open/navigate to folder
   */
  async openFolder(folderName: string) {
    const folderItem = this.page.locator(`[class*="folder-item"]:has-text("${folderName}"), [data-testid*="folder"]:has-text("${folderName}")`).first();
    await folderItem.click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Navigate back to root documents
   */
  async navigateToRoot() {
    const backButton = this.page.locator('button:has-text("Back"), button[aria-label*="back"], a:has-text("Documents")').first();
    if (await backButton.isVisible({ timeout: 2000 })) {
      await backButton.click();
      await this.page.waitForLoadState('networkidle');
    }
  }
}
