const { chromium } = require('playwright');

async function inspectDOM() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    // Login first
    console.log('Logging in...');
    await page.goto('http://localhost:4003/login');
    await page.fill('input[name="username"], input[type="text"]', 'e2e-test-user');
    await page.fill('input[name="password"], input[type="password"]', 'Test123!@#');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
    
    // Navigate to documents
    console.log('Navigating to documents page...');
    await page.goto('http://localhost:4003/documents');
    await page.waitForTimeout(3000);
    
    // Take screenshot
    await page.screenshot({ path: 'documents-page.png', fullPage: true });
    console.log('Screenshot saved: documents-page.png');
    
    // Get page HTML
    const html = await page.content();
    console.log('\n=== PAGE HTML (first 2000 chars) ===');
    console.log(html.substring(0, 2000));
    
    // Try to find document list elements
    console.log('\n=== SEARCHING FOR DOCUMENT LIST ELEMENTS ===');
    
    const selectors = [
      '[class*="document"]',
      '[data-testid*="document"]',
      'li',
      'div[role="listitem"]',
      'table tr',
      '[class*="list"]',
    ];
    
    for (const selector of selectors) {
      const count = await page.locator(selector).count();
      if (count > 0) {
        console.log(`\n✓ Found ${count} elements matching: ${selector}`);
        const first = await page.locator(selector).first();
        const html = await first.evaluate(el => el.outerHTML);
        console.log('First element HTML:', html.substring(0, 300));
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
}

inspectDOM();
