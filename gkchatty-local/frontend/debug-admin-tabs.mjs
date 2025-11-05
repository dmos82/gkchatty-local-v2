import { chromium } from '@playwright/test';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    console.log('🔐 Logging in as admin...');
    await page.goto('http://localhost:4003/auth');
    await page.fill('#login-username', 'dev');
    await page.fill('#login-password', 'dev123');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);

    console.log('📍 Navigating to admin page...');
    await page.goto('http://localhost:4003/admin');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    console.log('📸 Taking screenshot...');
    await page.screenshot({ path: 'admin-tabs-debug.png', fullPage: true });
    console.log('✅ Screenshot saved to admin-tabs-debug.png\n');

    console.log('🔍 Analyzing page structure...\n');

    // Find all tab-like elements
    const tabs = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('button, [role="tab"], [data-value]'));
      return elements
        .map(el => ({
          text: el.textContent?.trim() || '',
          tag: el.tagName,
          role: el.getAttribute('role'),
          class: el.className,
          dataValue: el.getAttribute('data-value'),
          ariaSelected: el.getAttribute('aria-selected')
        }))
        .filter(item => item.text.length > 0 && item.text.length < 50);
    });

    console.log('📋 All interactive elements:');
    tabs.forEach((tab, i) => {
      console.log(`${i + 1}. "${tab.text}" - ${tab.tag} ${tab.role ? `[role="${tab.role}"]` : ''} ${tab.dataValue ? `[data-value="${tab.dataValue}"]` : ''}`);
    });

    // Find specific tabs we need
    console.log('\n🎯 Looking for specific tabs:');
    const settingsTab = tabs.find(t => t.text.toLowerCase().includes('settings'));
    const usersTab = tabs.find(t => t.text.toLowerCase().includes('users'));
    const systemKBTab = tabs.find(t =>
      t.text.toLowerCase().includes('system') ||
      t.text.toLowerCase().includes('kb') ||
      t.text.toLowerCase().includes('knowledge')
    );

    if (settingsTab) console.log('✅ Settings tab:', settingsTab);
    else console.log('❌ Settings tab NOT FOUND');

    if (usersTab) console.log('✅ Users tab:', usersTab);
    else console.log('❌ Users tab NOT FOUND');

    if (systemKBTab) console.log('✅ System KB tab:', systemKBTab);
    else console.log('❌ System KB tab NOT FOUND');

    // Get page title and URL
    const title = await page.title();
    const url = page.url();
    console.log(`\n📄 Page: ${title}`);
    console.log(`🔗 URL: ${url}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
})();
