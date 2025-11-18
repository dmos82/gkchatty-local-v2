const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function testDragDropMultipleFiles() {
  const browser = await chromium.launch({ headless: false, slowMo: 500 });
  const page = await browser.newPage();

  // Capture console messages
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

    // Create 5 test files in a temp directory
    console.log('\n=== CREATING TEST FILES ===\n');
    const testDir = '/tmp/drag-drop-test';
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    const testFiles = [];
    for (let i = 1; i <= 5; i++) {
      const filePath = path.join(testDir, `test-file-${i}.txt`);
      fs.writeFileSync(filePath, `This is test file ${i}\nContent for testing drag and drop\n`);
      testFiles.push(filePath);
      console.log(`Created: ${filePath}`);
    }

    // Find the folder to drop files into (use "Company Policies" or first folder)
    console.log('\n=== FINDING TARGET FOLDER ===\n');
    const folderNameSpan = await page.$('span:has-text("Company Policies")');

    if (!folderNameSpan) {
      console.log('⚠️  "Company Policies" folder not found, using root drop zone');
    }

    console.log('\n=== STARTING DRAG AND DROP TEST ===\n');
    console.log('👉 Watch for console messages with [FileTreeStore] and [FileTreeManager]');
    console.log('👉 Check if all 5 files are mentioned in the logs\n');

    // Create a data transfer object with all 5 files
    const fileChooser = await page.evaluateHandle((files) => {
      const dt = new DataTransfer();
      return dt;
    }, testFiles);

    // Use the File API to create file objects
    const dataTransfer = await page.evaluateHandle((filePaths) => {
      const dt = new DataTransfer();

      // Create File objects for each file
      filePaths.forEach((filePath, i) => {
        const fileName = filePath.split('/').pop();
        const file = new File([`Content of file ${i + 1}`], fileName, {
          type: 'text/plain'
        });
        dt.items.add(file);
      });

      return dt;
    }, testFiles);

    // Trigger drag enter, drag over, and drop events
    if (folderNameSpan) {
      // Drop into folder
      console.log('📦 Dropping 5 files into "Company Policies" folder...\n');

      const folderElement = await folderNameSpan.evaluateHandle(el => el.closest('[data-node-id]'));

      await folderElement.evaluate((el, dt) => {
        const dragEvent = new DragEvent('dragenter', {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt
        });
        el.dispatchEvent(dragEvent);
      }, await dataTransfer.jsonValue());

      await page.waitForTimeout(200);

      await folderElement.evaluate((el, dt) => {
        const dragEvent = new DragEvent('dragover', {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt
        });
        el.dispatchEvent(dragEvent);
      }, await dataTransfer.jsonValue());

      await page.waitForTimeout(200);

      await folderElement.evaluate((el, dt) => {
        const dropEvent = new DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt
        });
        el.dispatchEvent(dropEvent);
      }, await dataTransfer.jsonValue());
    } else {
      // Drop into root
      console.log('📦 Dropping 5 files into root folder...\n');

      const dropZone = await page.$('[data-testid="file-tree-container"]') || await page.$('.flex.flex-col');

      await dropZone.evaluate((el, dt) => {
        const dropEvent = new DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt
        });
        el.dispatchEvent(dropEvent);
      }, await dataTransfer.jsonValue());
    }

    console.log('\n=== WAITING FOR UPLOAD TO COMPLETE (10 seconds) ===\n');
    console.log('Look for messages about:');
    console.log('  1. "Dropped X file(s) from OS"');
    console.log('  2. "Uploading to folder: ..."');
    console.log('  3. "Upload result:"');
    console.log('  4. "Processing X files..."\n');

    await page.waitForTimeout(10000);

    // Take screenshot
    await page.screenshot({ path: '/Users/davidjmorin/GOLDKEY CHATTY/docs/screenshots/drag-drop-test.png' });
    console.log('✅ Screenshot saved\n');

    console.log('\n=== TEST SUMMARY ===');
    console.log('Expected: 5 files uploaded');
    console.log('Check backend logs for: "Processing X files..."');
    console.log('Check if X = 5 or X = 1');
    console.log('\n=== KEEPING BROWSER OPEN FOR 30 SECONDS ===\n');
    await page.waitForTimeout(30000);

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    await page.screenshot({ path: '/Users/davidjmorin/GOLDKEY CHATTY/docs/screenshots/drag-drop-error.png' });
  } finally {
    await browser.close();
    console.log('\n✅ Test complete');
  }
}

testDragDropMultipleFiles();
