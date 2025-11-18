const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function testMultipleFileUpload() {
  const browser = await chromium.launch({ headless: false, slowMo: 500 });
  const page = await browser.newPage();

  // Capture console messages
  const consoleMessages = [];
  page.on('console', msg => {
    const type = msg.type().toUpperCase().padEnd(7);
    const text = msg.text();
    consoleMessages.push(`[${type}] ${text}`);
    console.log(`[${type}] ${text}`);
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

    // Create 5 test files
    console.log('\n=== CREATING TEST FILES ===\n');
    const testDir = '/tmp/upload-test';
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    const testFiles = [];
    for (let i = 1; i <= 5; i++) {
      const filePath = path.join(testDir, `upload-test-${i}.txt`);
      fs.writeFileSync(filePath, `This is test file ${i}\nTimestamp: ${Date.now()}\n`);
      testFiles.push(filePath);
      console.log(`Created: ${filePath}`);
    }

    // Inject a file input into the page for testing
    console.log('\n=== INJECTING FILE INPUT FOR TESTING ===\n');
    await page.evaluate(() => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.id = 'test-file-input';
      input.style.position = 'fixed';
      input.style.top = '10px';
      input.style.left = '10px';
      input.style.zIndex = '9999';
      document.body.appendChild(input);

      // Listen for file changes and trigger upload
      input.addEventListener('change', async (e) => {
        console.log('[TEST] File input changed, files:', e.target.files.length);

        // Get the uploadFiles function from the store
        // We'll trigger it via the FileTreeManager component
        const files = e.target.files;
        console.log('[TEST] Triggering handleFileUpload with', files.length, 'files');

        // Dispatch custom event that FileTreeManager can listen to
        window.dispatchEvent(new CustomEvent('test-upload', { detail: { files } }));
      });
    });

    console.log('✅ File input injected\n');

    // Take screenshot before
    await page.screenshot({ path: '/Users/davidjmorin/GOLDKEY CHATTY/docs/screenshots/before-upload.png' });

    console.log('\n=== SELECTING FILES ===\n');
    console.log('👉 Watch for console messages with [FileTreeStore] and [FileTreeManager]\n');

    // Use Playwright's setInputFiles which is reliable
    const fileInput = await page.$('#test-file-input');
    await fileInput.setInputFiles(testFiles);

    console.log('✅ Files selected in input\n');

    // Now we need to manually trigger the upload by clicking the folder and using the store
    // Let's try a different approach - directly call the store's uploadFiles function

    console.log('\n=== TRIGGERING UPLOAD VIA STORE ===\n');

    await page.evaluate(async () => {
      // Get the file input
      const input = document.getElementById('test-file-input');
      const files = input.files;

      console.log('[TEST] Files from input:', files.length);

      // Try to access the store and call uploadFiles
      // This won't work directly, so let's simulate what the drop handler does
      const event = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: new DataTransfer()
      });

      // Unfortunately we can't add files to DataTransfer in this context
      // Let's try a different approach - find the actual file upload button

      console.log('[TEST] Looking for upload button or drop zone...');
    });

    // Let's try finding the "Company Policies" folder and right-clicking it
    console.log('\n=== ATTEMPTING TO TRIGGER UPLOAD MENU ===\n');

    const folderSpan = await page.$('span:has-text("Company Policies")');
    if (folderSpan) {
      console.log('Found Company Policies folder');

      // Click to select it
      await folderSpan.click();
      await page.waitForTimeout(500);

      // Now look for an upload button or menu
      const uploadButton = await page.$('button:has-text("Upload")');
      if (uploadButton) {
        console.log('Found upload button, clicking...');
        await uploadButton.click();
        await page.waitForTimeout(1000);

        // Look for file input that might appear
        const modalFileInput = await page.$('input[type="file"]');
        if (modalFileInput) {
          console.log('Found file input in modal, setting files...');
          await modalFileInput.setInputFiles(testFiles);
          await page.waitForTimeout(2000);

          // Look for submit button
          const submitButton = await page.$('button:has-text("Upload")');
          if (submitButton) {
            console.log('Clicking submit...');
            await submitButton.click();
          }
        }
      }
    }

    console.log('\n=== WAITING FOR UPLOAD TO COMPLETE (15 seconds) ===\n');
    await page.waitForTimeout(15000);

    // Take screenshot after
    await page.screenshot({ path: '/Users/davidjmorin/GOLDKEY CHATTY/docs/screenshots/after-upload.png' });

    console.log('\n=== ANALYZING CONSOLE OUTPUT ===\n');

    // Filter relevant messages
    const relevantMessages = consoleMessages.filter(msg =>
      msg.includes('[FileTreeManager]') ||
      msg.includes('[FileTreeStore]') ||
      msg.includes('[Admin Upload]') ||
      msg.includes('file')
    );

    console.log('Relevant console messages:');
    relevantMessages.forEach(msg => console.log(msg));

    // Look for the key indicators
    const droppedFiles = consoleMessages.find(msg => msg.includes('Dropped') && msg.includes('file(s)'));
    const uploadTotal = consoleMessages.find(msg => msg.includes('SYSTEM MODE UPLOAD - Total files'));

    console.log('\n=== SUMMARY ===');
    if (droppedFiles) {
      console.log('✅ Drop detected:', droppedFiles);
    } else {
      console.log('❌ No drop detected in console');
    }

    if (uploadTotal) {
      console.log('✅ Upload initiated:', uploadTotal);
    } else {
      console.log('❌ No upload initiated');
    }

    console.log('\n=== KEEPING BROWSER OPEN FOR MANUAL INSPECTION (20 seconds) ===\n');
    await page.waitForTimeout(20000);

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error.stack);
    await page.screenshot({ path: '/Users/davidjmorin/GOLDKEY CHATTY/docs/screenshots/upload-test-error.png' });
  } finally {
    await browser.close();
    console.log('\n✅ Test complete');
  }
}

testMultipleFileUpload();
