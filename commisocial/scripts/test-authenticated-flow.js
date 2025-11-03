#!/usr/bin/env node

/**
 * Session-Persistent Authenticated Testing with Playwright
 *
 * This script maintains browser session across multiple steps,
 * allowing us to test authenticated admin flows.
 *
 * Usage:
 *   node scripts/test-authenticated-flow.js
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// Configuration
const CONFIG = {
  baseURL: 'http://localhost:3000',
  credentials: {
    email: process.env.TEST_USER_EMAIL || 'test-admin@commisocial.local',
    password: process.env.TEST_USER_PASSWORD || 'TestAdmin123!'
  },
  screenshotDir: path.join(__dirname, '../docs/screenshots/authenticated'),
  timeout: 30000,
  headless: false // Set to true for CI/CD
};

// Ensure screenshot directory exists
if (!fs.existsSync(CONFIG.screenshotDir)) {
  fs.mkdirSync(CONFIG.screenshotDir, { recursive: true });
}

// Test flow definition
const TEST_FLOW = [
  {
    name: 'Login',
    url: '/login',
    actions: async (page) => {
      await page.screenshot({ path: path.join(CONFIG.screenshotDir, '01-login-page.png') });

      // Fill login form
      await page.fill('#email', CONFIG.credentials.email);
      await page.fill('#password', CONFIG.credentials.password);

      await page.screenshot({ path: path.join(CONFIG.screenshotDir, '02-login-filled.png') });

      // Submit
      await page.click('button[type="submit"]');

      // Wait for navigation
      await page.waitForURL(/\/(feed|admin)/, { timeout: 10000 });

      await page.screenshot({ path: path.join(CONFIG.screenshotDir, '03-login-success.png') });

      console.log('✅ Login successful');
      console.log('   Current URL:', page.url());
    }
  },
  {
    name: 'Access Admin Dashboard',
    url: '/admin',
    actions: async (page) => {
      await page.screenshot({ path: path.join(CONFIG.screenshotDir, '04-admin-dashboard.png') });

      // Check if we're on admin page (not redirected)
      const currentURL = page.url();
      if (!currentURL.includes('/admin')) {
        throw new Error(`Not on admin page. Current URL: ${currentURL}`);
      }

      // Check for dashboard content
      const hasUserManagement = await page.locator('text=User Management').count() > 0;
      const hasStatCards = await page.locator('[class*="stat"]').count() > 0;

      console.log('✅ Admin dashboard loaded');
      console.log('   Has user management:', hasUserManagement);
      console.log('   Has stat cards:', hasStatCards);
    }
  },
  {
    name: 'Navigate to Users Page',
    url: '/admin/users',
    actions: async (page) => {
      await page.screenshot({ path: path.join(CONFIG.screenshotDir, '05-users-page.png') });

      // Wait for user table to load
      await page.waitForSelector('table, [role="table"]', { timeout: 5000 }).catch(() => {
        console.log('⚠️  No table found, checking for empty state');
      });

      const userCount = await page.locator('tbody tr').count();

      console.log('✅ Users page loaded');
      console.log('   Users visible:', userCount);
    }
  },
  {
    name: 'Test User Search',
    url: '/admin/users',
    actions: async (page) => {
      // Find search input
      const searchInput = page.locator('input[placeholder*="Search"], input[type="search"]').first();

      if (await searchInput.count() > 0) {
        await searchInput.fill('david');
        await page.screenshot({ path: path.join(CONFIG.screenshotDir, '06-search-filled.png') });

        // Wait a bit for results to filter
        await page.waitForTimeout(1000);

        await page.screenshot({ path: path.join(CONFIG.screenshotDir, '07-search-results.png') });

        console.log('✅ Search functionality tested');
      } else {
        console.log('⚠️  No search input found');
      }
    }
  },
  {
    name: 'Navigate to Audit Logs',
    url: '/admin/audit-logs',
    actions: async (page) => {
      await page.screenshot({ path: path.join(CONFIG.screenshotDir, '08-audit-logs.png') });

      // Check if audit logs table exists
      const hasTable = await page.locator('table').count() > 0;
      const logCount = await page.locator('tbody tr').count();

      console.log('✅ Audit logs page loaded');
      console.log('   Has table:', hasTable);
      console.log('   Log entries visible:', logCount);
    }
  },
  {
    name: 'Navigate to Settings',
    url: '/admin/settings',
    actions: async (page) => {
      await page.screenshot({ path: path.join(CONFIG.screenshotDir, '09-settings.png') });

      // Check if we're on settings page or redirected
      const currentURL = page.url();
      if (!currentURL.includes('/admin/settings')) {
        console.log('⚠️  Redirected from settings (might require super_admin)');
        console.log('   Current URL:', currentURL);
      } else {
        console.log('✅ Settings page loaded (super_admin access confirmed)');
      }
    }
  }
];

async function runAuthenticatedTests() {
  console.log('🚀 Starting Authenticated Flow Testing\n');
  console.log('Configuration:');
  console.log('  Base URL:', CONFIG.baseURL);
  console.log('  Email:', CONFIG.credentials.email);
  console.log('  Screenshot dir:', CONFIG.screenshotDir);
  console.log('  Headless:', CONFIG.headless);
  console.log('');

  const browser = await chromium.launch({
    headless: CONFIG.headless,
    slowMo: 100 // Slow down actions for visibility
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    // Session persistence happens automatically via cookies
    storageState: undefined // Start fresh
  });

  const page = await context.newPage();

  // Enable console logging
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('   ❌ Console error:', msg.text());
    }
  });

  // Enable error tracking
  page.on('pageerror', err => {
    console.log('   ❌ Page error:', err.message);
  });

  const results = {
    passed: [],
    failed: [],
    skipped: []
  };

  try {
    for (const step of TEST_FLOW) {
      console.log(`\n📋 Step: ${step.name}`);
      console.log(`   URL: ${step.url}`);

      try {
        // Navigate to URL
        await page.goto(CONFIG.baseURL + step.url, {
          waitUntil: 'networkidle',
          timeout: CONFIG.timeout
        });

        // Run step actions
        await step.actions(page);

        results.passed.push(step.name);
        console.log(`   ✅ PASS`);

      } catch (error) {
        results.failed.push({ name: step.name, error: error.message });
        console.log(`   ❌ FAIL: ${error.message}`);

        // Take error screenshot
        await page.screenshot({
          path: path.join(CONFIG.screenshotDir, `ERROR-${step.name.replace(/\s+/g, '-')}.png`)
        });
      }
    }

  } finally {
    // Save session state for future use
    const sessionState = await context.storageState();
    fs.writeFileSync(
      path.join(CONFIG.screenshotDir, '../session-state.json'),
      JSON.stringify(sessionState, null, 2)
    );

    await browser.close();
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  console.log('');
  console.log(`✅ Passed: ${results.passed.length}/${TEST_FLOW.length}`);
  console.log(`❌ Failed: ${results.failed.length}/${TEST_FLOW.length}`);
  console.log('');

  if (results.failed.length > 0) {
    console.log('Failed Steps:');
    results.failed.forEach(({ name, error }) => {
      console.log(`  - ${name}: ${error}`);
    });
    console.log('');
  }

  console.log('Screenshots saved to:', CONFIG.screenshotDir);
  console.log('Session state saved to:', path.join(CONFIG.screenshotDir, '../session-state.json'));
  console.log('');

  // Exit with error if any tests failed
  process.exit(results.failed.length > 0 ? 1 : 0);
}

// Run tests
runAuthenticatedTests().catch(error => {
  console.error('❌ Test runner error:', error);
  process.exit(1);
});
