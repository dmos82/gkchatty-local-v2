const { chromium } = require('playwright');

async function testFolderPermissions() {
  console.log('🎬 Starting folder permissions test...\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Capture all console messages
  const consoleMessages = [];
  page.on('console', msg => {
    const timestamp = new Date().toISOString();
    consoleMessages.push({
      type: msg.type(),
      text: msg.text(),
      timestamp
    });
    console.log(`[${msg.type().toUpperCase()}] ${msg.text()}`);
  });

  // Capture errors
  page.on('pageerror', error => {
    console.log(`[PAGE ERROR] ${error.message}`);
  });

  try {
    // Step 1: Navigate to login page
    console.log('\n📍 Step 1: Navigating to login page...');
    await page.goto('http://localhost:4003/auth');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: '/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-ecosystem/gkchatty-local/docs/screenshots/01-login-page.png' });

    // Step 2: Login as admin
    console.log('\n📍 Step 2: Logging in as admin...');
    await page.fill('input[placeholder="Username"]', 'dev');
    await page.fill('input[placeholder="Password"]', 'dev123');
    await page.click('button:has-text("LOGIN")');
    await page.waitForURL('http://localhost:4003/', { timeout: 5000 });
    await page.screenshot({ path: '/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-ecosystem/gkchatty-local/docs/screenshots/02-logged-in.png' });
    console.log('✅ Login successful');

    // Step 3: Navigate to admin page
    console.log('\n📍 Step 3: Navigating to admin page...');
    await page.goto('http://localhost:4003/admin');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: '/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-ecosystem/gkchatty-local/docs/screenshots/03-admin-page.png' });
    console.log('✅ Admin page loaded');

    // Step 4: Wait for file tree to load
    console.log('\n📍 Step 4: Waiting for file tree to load...');
    await page.waitForSelector('[data-testid="folder-item"], .folder-item, button:has-text("Create Folder")', { timeout: 10000 });
    await page.waitForTimeout(2000); // Give time for folders to populate
    await page.screenshot({ path: '/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-ecosystem/gkchatty-local/docs/screenshots/04-file-tree-loaded.png' });

    // Step 5: Find a folder and right-click it
    console.log('\n📍 Step 5: Right-clicking on a folder...');

    // Try to find a folder - check multiple possible selectors
    const folderSelectors = [
      '[data-testid="folder-item"]',
      '.folder-item',
      'div[role="treeitem"]',
      'button:has-text("Create Folder")'
    ];

    let folderElement = null;
    for (const selector of folderSelectors) {
      folderElement = await page.$(selector);
      if (folderElement) {
        console.log(`Found folder with selector: ${selector}`);
        break;
      }
    }

    if (!folderElement) {
      console.log('⚠️  No folders found. Creating a test folder first...');
      // Click Create Folder button if available
      const createButton = await page.$('button:has-text("Create Folder")');
      if (createButton) {
        await createButton.click();
        await page.waitForTimeout(1000);
        await page.fill('input[placeholder*="folder" i]', 'Test Folder');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(2000);

        // Try to find the folder again
        for (const selector of folderSelectors) {
          folderElement = await page.$(selector);
          if (folderElement) {
            console.log(`Found created folder with selector: ${selector}`);
            break;
          }
        }
      }
    }

    if (folderElement) {
      // Right-click on the folder
      await folderElement.click({ button: 'right' });
      await page.waitForTimeout(1000);
      await page.screenshot({ path: '/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-ecosystem/gkchatty-local/docs/screenshots/05-context-menu.png' });
      console.log('✅ Context menu opened');

      // Step 6: Click Permissions
      console.log('\n📍 Step 6: Clicking Permissions option...');
      const permissionsButton = await page.$('button:has-text("Permissions"), [role="menuitem"]:has-text("Permissions")');
      if (permissionsButton) {
        await permissionsButton.click();
        await page.waitForTimeout(1000);
        await page.screenshot({ path: '/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-ecosystem/gkchatty-local/docs/screenshots/06-permissions-modal.png' });
        console.log('✅ Permissions modal opened');

        // Step 7: Click "Specific Users" radio button
        console.log('\n📍 Step 7: Clicking "Specific Users" radio button...');
        const specificUsersRadio = await page.$('input[value="specific-users"]');
        if (specificUsersRadio) {
          await specificUsersRadio.click();
          await page.waitForTimeout(2000); // Wait for UserPicker to render
          await page.screenshot({ path: '/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-ecosystem/gkchatty-local/docs/screenshots/07-specific-users-selected.png' });
          console.log('✅ "Specific Users" selected');

          // Step 8: Check if UserPicker is visible
          console.log('\n📍 Step 8: Checking if UserPicker is visible...');
          const userPicker = await page.$('input[placeholder*="Search users" i]');
          if (userPicker) {
            console.log('✅ UserPicker is visible!');
            await page.screenshot({ path: '/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-ecosystem/gkchatty-local/docs/screenshots/08-userpicker-visible.png' });

            // Check if users are loaded
            const userCheckboxes = await page.$$('input[type="checkbox"]');
            console.log(`📊 Found ${userCheckboxes.length} checkboxes (including radio buttons)`);

            // Try to find user list items
            const userItems = await page.$$('label:has(input[type="checkbox"])');
            console.log(`📊 Found ${userItems.length} user items`);

          } else {
            console.log('❌ UserPicker is NOT visible!');
            console.log('\n🔍 Checking DOM for UserPicker-related elements...');

            // Check if the conditional rendering is working
            const modalContent = await page.content();
            const hasUserPicker = modalContent.includes('Search users');
            console.log(`Has "Search users" text in DOM: ${hasUserPicker}`);
          }
        } else {
          console.log('❌ Could not find "Specific Users" radio button');
        }
      } else {
        console.log('❌ Could not find Permissions button in context menu');
      }
    } else {
      console.log('❌ Could not find any folder to test with');
    }

    // Keep browser open for inspection
    console.log('\n⏸️  Browser will stay open for 30 seconds for inspection...');
    await page.waitForTimeout(30000);

  } catch (error) {
    console.error('\n❌ Test failed with error:', error);
    await page.screenshot({ path: '/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-ecosystem/gkchatty-local/docs/screenshots/error.png' });
  } finally {
    await browser.close();
    console.log('\n✅ Test complete. Check screenshots in docs/screenshots/');

    // Print console summary
    console.log('\n📊 Console Message Summary:');
    console.log(`Total messages: ${consoleMessages.length}`);
    const errorMessages = consoleMessages.filter(m => m.type === 'error');
    const warningMessages = consoleMessages.filter(m => m.type === 'warning');
    console.log(`Errors: ${errorMessages.length}`);
    console.log(`Warnings: ${warningMessages.length}`);

    if (errorMessages.length > 0) {
      console.log('\n🔴 Error Messages:');
      errorMessages.forEach(msg => console.log(`  - ${msg.text}`));
    }
  }
}

testFolderPermissions();
