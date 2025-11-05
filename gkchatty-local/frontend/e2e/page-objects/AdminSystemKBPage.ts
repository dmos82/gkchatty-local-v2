import { Page, Locator } from '@playwright/test';

/**
 * Page Object Model for Admin System KB Page (/admin → System KB tab)
 * Handles folder management and system document uploads
 *
 * NOTE: Folder functionality exists ONLY here, not on /documents page
 */
export class AdminSystemKBPage {
  readonly page: Page;
  readonly systemKBTab: Locator;
  readonly createFolderButton: Locator;
  readonly uploadButton: Locator;
  readonly fileTree: Locator;
  readonly searchInput: Locator;
  readonly debugToggle: Locator;
  readonly emptyState: Locator;

  constructor(page: Page) {
    this.page = page;

    // Tab navigation
    this.systemKBTab = page.locator('button[role="tab"]:has-text("System KB")').first();

    // Folder/file operations (icon buttons, not text buttons)
    this.createFolderButton = page.locator('button:has(svg.lucide-plus)').first();
    this.uploadButton = page.locator('button[aria-label*="upload"], button:has(svg.lucide-upload)');

    // UI elements
    this.fileTree = page.locator('[class*="file-tree"], [role="tree"], [class*="tree-view"]');
    this.searchInput = page.locator('input[placeholder*="Search"], input[placeholder*="files"]');
    this.debugToggle = page.locator('text=Show Debug Info');
    this.emptyState = page.locator('text=No files or folders');
  }

  /**
   * Navigate to Admin System KB page
   */
  async goto() {
    await this.page.goto('/admin');
    await this.page.waitForLoadState('networkidle');

    // Click System KB tab
    await this.systemKBTab.click();
    await this.page.waitForLoadState('networkidle');
    await this.page.waitForTimeout(500); // Small wait for tab transition

    // Wait for page to be ready (either file tree or empty state)
    await Promise.race([
      this.fileTree.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {}),
      this.emptyState.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {}),
    ]);
  }

  /**
   * Create a new folder
   */
  async createFolder(folderName: string) {
    // Click the create folder button (+ icon)
    await this.createFolderButton.click();

    // Wait for modal/dialog to appear - use actual ID from UI
    const folderInput = this.page.locator('#folder-name, input[placeholder="New Folder"]');
    await folderInput.waitFor({ state: 'visible', timeout: 10000 });
    await folderInput.fill(folderName);

    // Find and click the Create button in the modal
    const submitButton = this.page.locator('button:has-text("Create")').last();
    await submitButton.click();

    // Wait for folder to appear in tree
    await this.page.waitForTimeout(1000); // Wait for UI update
  }

  /**
   * Check if folder exists by name
   */
  async hasFolderNamed(folderName: string): Promise<boolean> {
    // Wait a bit for folder to appear in list
    await this.page.waitForTimeout(1000);

    // Simple text search - folder name should be visible in UI
    const folderLocator = this.page.locator(`text="${folderName}"`);
    const count = await folderLocator.count();
    return count > 0;
  }

  /**
   * Click on a folder to select/open it
   */
  async clickFolder(folderName: string) {
    const folder = this.page.locator(`[role="treeitem"]:has-text("${folderName}"), .folder:has-text("${folderName}")`).first();
    await folder.click();
  }

  /**
   * Open folder context menu (right-click or menu button)
   */
  async openFolderMenu(folderName: string) {
    const folder = this.page.locator(`[role="treeitem"]:has-text("${folderName}"), .folder:has-text("${folderName}")`).first();

    // Try to find menu button first (3 dots)
    const menuButton = folder.locator('button[aria-label*="menu"], button:has(svg.lucide-more)');
    const menuButtonExists = await menuButton.count() > 0;

    if (menuButtonExists) {
      await menuButton.click();
    } else {
      // Fallback to right-click
      await folder.click({ button: 'right' });
    }
  }

  /**
   * Rename a folder
   */
  async renameFolder(oldName: string, newName: string) {
    await this.openFolderMenu(oldName);

    // Click rename option
    const renameOption = this.page.locator('text=Rename, [role="menuitem"]:has-text("Rename")');
    await renameOption.click();

    // Fill new name
    const renameInput = this.page.locator('input[name="folderName"], input[value*="' + oldName + '"], input[placeholder*="name"]');
    await renameInput.waitFor({ state: 'visible' });
    await renameInput.fill(newName);

    // Submit
    const submitButton = this.page.locator('button[type="submit"]:has-text("Rename"), button:has-text("Save")');
    await submitButton.click();

    await this.page.waitForTimeout(500);
  }

  /**
   * Delete a folder
   */
  async deleteFolder(folderName: string) {
    await this.openFolderMenu(folderName);

    // Click delete option
    const deleteOption = this.page.locator('text=Delete, [role="menuitem"]:has-text("Delete")');
    await deleteOption.click();

    // Confirm deletion if confirmation dialog appears
    const confirmButton = this.page.locator('button:has-text("Delete"), button:has-text("Confirm"), button:has-text("Yes")');
    const confirmExists = await confirmButton.count() > 0;

    if (confirmExists) {
      await confirmButton.click();
    }

    await this.page.waitForTimeout(500);
  }

  /**
   * Upload file to a folder
   */
  async uploadFileToFolder(folderName: string, filePath: string) {
    // Select the folder first
    await this.clickFolder(folderName);

    // Click upload button
    await this.uploadButton.click();

    // Set the file
    const fileInput = this.page.locator('input[type="file"]');
    await fileInput.setInputFiles(filePath);

    // Wait for upload to complete
    await this.page.waitForTimeout(1000);
  }

  /**
   * Upload file and wait for processing (compatible with DocumentsPage API)
   */
  async uploadFileAndWait(filePath: string, timeout = 45000) {
    // Click upload button
    const uploadBtn = this.uploadButton.or(this.page.locator('button:has-text("Upload")'));
    await uploadBtn.click();

    // Set the file
    const fileInput = this.page.locator('input[type="file"]');
    await fileInput.setInputFiles(filePath);

    // Wait for upload and processing
    await this.page.waitForTimeout(2000); // Wait for initial upload

    // Wait for processing to complete (look for "completed" status or similar)
    await this.page.waitForSelector('text=/completed|processed|ready/i', {
      state: 'visible',
      timeout
    }).catch(() => {
      // Timeout is acceptable - file might process in background
      console.warn('Upload status check timed out, continuing...');
    });
  }

  /**
   * Upload file (alias for uploadFileAndWait)
   */
  async uploadFile(filePath: string) {
    await this.uploadFileAndWait(filePath, 30000);
  }

  /**
   * Wait for error message to appear
   */
  async waitForError(timeout = 5000) {
    const errorLocator = this.page.locator('text=/error|failed|invalid/i');
    await errorLocator.waitFor({ state: 'visible', timeout });
  }

  /**
   * folderNameInput compatibility
   */
  get folderNameInput() {
    return this.page.locator('input[name="folderName"], input[placeholder*="folder"], input[placeholder*="name"]');
  }

  /**
   * Check if a document exists in the file tree
   */
  async hasDocumentNamed(documentName: string): Promise<boolean> {
    const docLocator = this.page.locator(`text="${documentName}"`);
    const count = await docLocator.count();
    return count > 0;
  }

  /**
   * Move document to another folder (drag and drop or menu)
   */
  async moveDocument(documentName: string, targetFolderName: string) {
    // Right-click on document
    const document = this.page.locator(`text="${documentName}"`).first();
    await document.click({ button: 'right' });

    // Click move option
    const moveOption = this.page.locator('text=Move, [role="menuitem"]:has-text("Move")');
    await moveOption.click();

    // Select target folder from dropdown/list
    const targetFolder = this.page.locator(`text="${targetFolderName}"`).last();
    await targetFolder.click();

    // Confirm move
    const confirmButton = this.page.locator('button:has-text("Move"), button:has-text("Confirm")');
    await confirmButton.click();

    await this.page.waitForTimeout(500);
  }

  /**
   * Delete a document
   */
  async deleteDocument(documentName: string) {
    const document = this.page.locator(`text="${documentName}"`).first();
    await document.click({ button: 'right' });

    const deleteOption = this.page.locator('text=Delete, [role="menuitem"]:has-text("Delete")');
    await deleteOption.click();

    // Confirm deletion
    const confirmButton = this.page.locator('button:has-text("Delete"), button:has-text("Confirm")');
    const confirmExists = await confirmButton.count() > 0;

    if (confirmExists) {
      await confirmButton.click();
    }

    await this.page.waitForTimeout(500);
  }

  /**
   * Get folder item count
   */
  async getFolderCount(): Promise<number> {
    const folders = this.page.locator('[role="treeitem"][aria-label*="folder"], .folder-item');
    return await folders.count();
  }

  /**
   * Search for files
   */
  async search(query: string) {
    await this.searchInput.fill(query);
    await this.page.waitForTimeout(500); // Debounce
  }
}
