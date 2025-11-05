import { chromium } from '@playwright/test';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  console.log('🔐 Logging in as admin...');
  await page.goto('http://localhost:4003/auth');
  await page.fill('#login-username', 'dev');
  await page.fill('#login-password', 'dev123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);

  console.log('📊 Navigating to /admin...');
  await page.goto('http://localhost:4003/admin');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  // Take screenshot of default admin page
  await page.screenshot({ path: 'admin-default-view.png', fullPage: true });
  console.log('📸 Screenshot saved: admin-default-view.png');

  console.log('🔍 Looking for Users tab...');
  const usersTab = page.locator('button[role="tab"]:has-text("Users")').first();
  const usersTabExists = await usersTab.count() > 0;
  console.log(`Users tab exists: ${usersTabExists}`);

  if (usersTabExists) {
    console.log('👆 Clicking Users tab...');
    await usersTab.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Take screenshot of Users tab
    await page.screenshot({ path: 'admin-users-tab.png', fullPage: true });
    console.log('📸 Screenshot saved: admin-users-tab.png');

    // Analyze all interactive elements
    const elements = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const inputs = Array.from(document.querySelectorAll('input, select, textarea'));

      return {
        buttons: buttons.map(el => ({
          text: el.textContent?.trim(),
          dataTestId: el.getAttribute('data-testid'),
          ariaLabel: el.getAttribute('aria-label'),
          className: el.className,
          type: el.getAttribute('type')
        })).filter(b => b.text || b.dataTestId),
        inputs: inputs.map(el => ({
          name: el.getAttribute('name'),
          id: el.id,
          placeholder: el.getAttribute('placeholder'),
          dataTestId: el.getAttribute('data-testid'),
          type: el.getAttribute('type')
        }))
      };
    });

    console.log('\n📋 BUTTONS on Users tab:');
    elements.buttons.forEach((btn, idx) => {
      console.log(`  ${idx + 1}. Text: "${btn.text}" | data-testid: ${btn.dataTestId} | aria-label: ${btn.ariaLabel}`);
    });

    console.log('\n📝 INPUTS on Users tab:');
    elements.inputs.forEach((input, idx) => {
      console.log(`  ${idx + 1}. Name: ${input.name} | ID: ${input.id} | Placeholder: ${input.placeholder} | data-testid: ${input.dataTestId}`);
    });

    // Check for "Create User" button specifically
    console.log('\n🔍 Looking for "Create User" button...');
    const createUserBtn = page.locator('button:has-text("Create User"), button:has-text("Add User"), button:has-text("New User")');
    const createUserExists = await createUserBtn.count();
    console.log(`"Create User" button count: ${createUserExists}`);

    if (createUserExists > 0) {
      console.log('👆 Clicking Create User button...');
      await createUserBtn.first().click();
      await page.waitForTimeout(1000);

      // Take screenshot of create user modal
      await page.screenshot({ path: 'admin-create-user-modal.png', fullPage: true });
      console.log('📸 Screenshot saved: admin-create-user-modal.png');

      // Analyze modal inputs
      const modalInputs = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input, select, textarea'));
        return inputs.map(el => ({
          name: el.getAttribute('name'),
          id: el.id,
          placeholder: el.getAttribute('placeholder'),
          dataTestId: el.getAttribute('data-testid'),
          type: el.getAttribute('type'),
          visible: el.offsetParent !== null
        })).filter(i => i.visible);
      });

      console.log('\n📝 INPUTS in Create User modal:');
      modalInputs.forEach((input, idx) => {
        console.log(`  ${idx + 1}. Name: ${input.name} | ID: ${input.id} | Placeholder: ${input.placeholder} | data-testid: ${input.dataTestid} | Type: ${input.type}`);
      });

      // Check role dropdown
      const roleInfo = await page.evaluate(() => {
        const labels = Array.from(document.querySelectorAll('label'));
        const roleLabel = labels.find(l => l.textContent?.trim() === 'Role');
        if (roleLabel) {
          const container = roleLabel.closest('div');
          const select = container?.querySelector('select');
          const button = container?.querySelector('button');

          return {
            hasNativeSelect: !!select,
            hasButton: !!button,
            buttonText: button?.textContent?.trim(),
            buttonRole: button?.getAttribute('role'),
            selectOptions: select ? Array.from(select.options).map(o => ({value: o.value, text: o.text})) : null
          };
        }
        return null;
      });

      console.log('\n🎯 Role field info:');
      console.log(JSON.stringify(roleInfo, null, 2));
    } else {
      console.log('❌ No "Create User" button found!');

      // Check if user management is even implemented
      console.log('\n🔍 Checking if any user-related UI exists...');
      const userListExists = await page.locator('table, [role="table"], .user-list, [data-testid*="user"]').count();
      console.log(`User list/table elements found: ${userListExists}`);
    }
  } else {
    console.log('❌ Users tab not found!');
  }

  console.log('\n✅ Debug complete.');
  await browser.close();
})();
