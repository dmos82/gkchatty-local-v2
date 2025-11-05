import { chromium } from '@playwright/test';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  console.log('Navigating to login page...');
  await page.goto('http://localhost:4003/auth');
  await page.screenshot({ path: '/Users/davidjmorin/GOLDKEY CHATTY/gkckb/e2e-screenshots/01-login-page.png', fullPage: true });
  
  console.log('Logging in...');
  await page.fill('#login-username', 'dev');
  await page.fill('#login-password', 'dev123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  
  console.log('Capturing main chat page...');
  await page.screenshot({ path: '/Users/davidjmorin/GOLDKEY CHATTY/gkckb/e2e-screenshots/02-main-chat-page.png', fullPage: true });
  
  console.log('Navigating to documents page...');
  await page.click('button:has-text("Document Manager")');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/Users/davidjmorin/GOLDKEY CHATTY/gkckb/e2e-screenshots/03-documents-page.png', fullPage: true });
  
  console.log('Navigating to admin page...');
  await page.goto('http://localhost:4003/admin');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/Users/davidjmorin/GOLDKEY CHATTY/gkckb/e2e-screenshots/04-admin-page.png', fullPage: true });
  
  console.log('Checking admin System KB tab...');
  await page.click('button:has-text("System KB")');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/Users/davidjmorin/GOLDKEY CHATTY/gkckb/e2e-screenshots/05-admin-system-kb.png', fullPage: true });
  
  console.log('Navigating to usage page...');
  await page.goto('http://localhost:4003/usage');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/Users/davidjmorin/GOLDKEY CHATTY/gkckb/e2e-screenshots/06-usage-page.png', fullPage: true });
  
  console.log('All screenshots captured!');
  await browser.close();
})();
