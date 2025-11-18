const { chromium } = require('playwright');

async function quickPermissionsTest() {
  const browser = await chromium.launch({ headless: false, slowMo: 500 });
  const page = await browser.newPage();

  // Capture ALL console messages
  page.on('console', msg => {
    const type = msg.type().toUpperCase().padEnd(7);
    console.log(`[${type}] ${msg.text()}`);
  });

  page.on('pageerror', error => {
    console.log(`[ERROR ] ${error.message}`);
  });

  try {
    // Login
    console.log('\n=== LOGGING IN ===\n');
    await page.goto('http://localhost:4003/auth');
    await page.fill('input[placeholder="Username"]', 'dev');
    await page.fill('input[placeholder="Password"]', 'dev123');
    await page.click('button:has-text("LOGIN")');
    await page.waitForURL('http://localhost:4003/', { timeout: 10000 });
    console.log('✅ Login successful\n');

    // Go to admin
    console.log('\n=== NAVIGATING TO ADMIN PAGE ===\n');
    await page.goto('http://localhost:4003/admin');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    console.log('✅ Admin page loaded\n');

    // Take screenshot of admin page
    await page.screenshot({ path: '/Users/davidjmorin/GOLDKEY CHATTY/docs/screenshots/admin-loaded.png' });

    // Look for the file tree
    console.log('\n=== INSPECTING FILE TREE ===\n');
    const html = await page.content();

    // Check for various possible folder elements
    const hasFolderItems = html.includes('data-testid="folder');
    const hasFolderClass = html.includes('class="folder');
    const hasCreateButton = html.includes('Create Folder');

    console.log(`File tree indicators:`);
    console.log(`  - Has folder data-testid: ${hasFolderItems}`);
    console.log(`  - Has folder class: ${hasFolderClass}`);
    console.log(`  - Has Create Folder button: ${hasCreateButton}`);

    // RIGHT-CLICK ON THE "managers" FOLDER
    console.log('\n\n=== RIGHT-CLICKING ON MANAGERS FOLDER ===\n');

    // Find the folder row by looking for the span containing "managers"
    const folderNameSpan = await page.$('span:has-text("managers")');

    if (!folderNameSpan) {
      console.log('⚠️  Could not find "managers" folder. Taking screenshot...');
      await page.screenshot({ path: '/Users/davidjmorin/GOLDKEY CHATTY/docs/screenshots/no-folder-found.png' });
      console.log('Waiting 60 seconds for manual inspection...');
      await page.waitForTimeout(60000);
      await browser.close();
      return;
    }

    console.log('✅ Found "managers" folder, performing right-click...');
    await folderNameSpan.click({ button: 'right' });
    await page.waitForTimeout(1000); // Wait for context menu to appear

    // Check if context menu appeared
    const contextMenu = await page.$('button:has-text("Permissions")');
    console.log(`Context menu visible: ${contextMenu !== null}`);

    await page.screenshot({ path: '/Users/davidjmorin/GOLDKEY CHATTY/docs/screenshots/context-menu.png' });

    if (!contextMenu) {
      console.log('⚠️  Context menu did not appear. Waiting 60 seconds for manual inspection...');
      await page.waitForTimeout(60000);
      await browser.close();
      return;
    }

    // Click Permissions
    console.log('\n=== CLICKING PERMISSIONS ===\n');
    await page.click('button:has-text("Permissions")');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/Users/davidjmorin/GOLDKEY CHATTY/docs/screenshots/permissions-modal-open.png' });

    // Click Specific Users radio
    console.log('\n=== CLICKING SPECIFIC USERS RADIO ===\n');
    console.log('Look for console messages starting with [FolderPermissionsModal] and [UserPicker]...\n');

    await page.click('input[value="specific-users"]');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: '/Users/davidjmorin/GOLDKEY CHATTY/docs/screenshots/specific-users-selected.png' });

    console.log('\n=== WAITING FOR INSPECTION (60 seconds) ===\n');
    await page.waitForTimeout(60000);

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    await page.screenshot({ path: '/Users/davidjmorin/GOLDKEY CHATTY/docs/screenshots/test-error.png' });
  } finally {
    await browser.close();
    console.log('\n✅ Test complete');
  }
}

quickPermissionsTest();
