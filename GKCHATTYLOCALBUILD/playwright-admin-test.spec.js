const { test, expect } = require('@playwright/test');

test.describe('Admin Dashboard Tests', () => {
  let adminToken;
  const baseURL = 'http://localhost:6001';
  const frontendURL = 'http://localhost:3000';

  test.beforeAll(async ({ request }) => {
    // Get admin token
    const response = await request.post(`${baseURL}/api/auth/login`, {
      data: {
        username: 'admin',
        password: 'admin'
      }
    });
    const data = await response.json();
    adminToken = data.token;
    console.log('Admin token obtained:', adminToken ? 'YES' : 'NO');
  });

  test('Admin Dashboard Page Loads', async ({ page }) => {
    await page.goto(frontendURL);
    
    // Login
    await page.fill('input[name="username"]', 'admin');
    await page.fill('input[name="password"]', 'admin');
    await page.click('button[type="submit"]');
    
    // Wait for redirect and take screenshot
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'docs/screenshots/01-after-login.png', fullPage: true });
    
    // Navigate to admin dashboard
    await page.goto(`${frontendURL}/admin`);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'docs/screenshots/02-admin-dashboard.png', fullPage: true });
    
    // Check what's visible
    const bodyText = await page.textContent('body');
    console.log('Admin page content preview:', bodyText.substring(0, 500));
  });

  test('Folder Creation in UI', async ({ page }) => {
    await page.goto(frontendURL);
    
    // Login
    await page.fill('input[name="username"]', 'admin');
    await page.fill('input[name="password"]', 'admin');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
    
    // Navigate to folders/documents area
    await page.goto(`${frontendURL}/admin`);
    await page.waitForTimeout(2000);
    
    // Look for folder creation button
    await page.screenshot({ path: 'docs/screenshots/03-before-folder-create.png', fullPage: true });
    
    // Try to find and click folder creation UI
    const createButton = await page.locator('button:has-text("Create"), button:has-text("New Folder"), button:has-text("Add Folder")').first();
    if (await createButton.isVisible()) {
      await createButton.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'docs/screenshots/04-folder-create-dialog.png', fullPage: true });
    } else {
      console.log('No folder create button found');
    }
  });

  test('User Creation in UI', async ({ page }) => {
    await page.goto(frontendURL);
    
    // Login
    await page.fill('input[name="username"]', 'admin');
    await page.fill('input[name="password"]', 'admin');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
    
    // Navigate to user management
    await page.goto(`${frontendURL}/admin`);
    await page.waitForTimeout(2000);
    
    // Look for users tab/section
    await page.screenshot({ path: 'docs/screenshots/05-user-management.png', fullPage: true });
    
    // Try to find user creation UI
    const userButton = await page.locator('button:has-text("Create User"), button:has-text("New User"), button:has-text("Add User")').first();
    if (await userButton.isVisible()) {
      await userButton.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'docs/screenshots/06-user-create-dialog.png', fullPage: true });
    } else {
      console.log('No user create button found');
    }
  });

  test('Settings Tab Model Selection', async ({ page }) => {
    await page.goto(frontendURL);
    
    // Login
    await page.fill('input[name="username"]', 'admin');
    await page.fill('input[name="password"]', 'admin');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
    
    // Navigate to settings
    await page.goto(`${frontendURL}/admin`);
    await page.waitForTimeout(2000);
    
    // Look for settings tab
    await page.screenshot({ path: 'docs/screenshots/07-settings-tab.png', fullPage: true });
    
    // Try to click settings
    const settingsTab = await page.locator('text=Settings, [role="tab"]:has-text("Settings")').first();
    if (await settingsTab.isVisible()) {
      await settingsTab.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'docs/screenshots/08-settings-models.png', fullPage: true });
      
      // Look for model selector
      const modelSelect = await page.locator('select, [role="combobox"]').first();
      if (await modelSelect.isVisible()) {
        console.log('Model selector found');
        const options = await modelSelect.locator('option').count();
        console.log('Model options available:', options);
      } else {
        console.log('No model selector found');
      }
    } else {
      console.log('No settings tab found');
    }
  });

  test('API Endpoints Direct Test', async ({ request }) => {
    console.log('\n=== TESTING API ENDPOINTS ===\n');
    
    // Test folder creation
    const folderResponse = await request.post(`${baseURL}/api/folders`, {
      headers: { 'Authorization': `Bearer ${adminToken}` },
      data: { name: 'Test Folder ' + Date.now(), parentId: null }
    });
    console.log('Folder creation:', folderResponse.status(), await folderResponse.text());
    
    // Test user creation
    const userResponse = await request.post(`${baseURL}/api/admin/users`, {
      headers: { 'Authorization': `Bearer ${adminToken}` },
      data: {
        username: 'testuser' + Date.now(),
        email: 'test' + Date.now() + '@test.com',
        password: 'Test123!',
        role: 'user'
      }
    });
    console.log('User creation:', userResponse.status(), await userResponse.text());
    
    // Test models endpoint
    const modelsResponse = await request.get(`${baseURL}/api/models`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    console.log('Models endpoint:', modelsResponse.status());
    
    // Test settings endpoint
    const settingsResponse = await request.get(`${baseURL}/api/admin/settings`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    console.log('Settings endpoint:', settingsResponse.status());
  });
});
