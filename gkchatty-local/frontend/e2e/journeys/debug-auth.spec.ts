import { test, expect } from '@playwright/test';

/**
 * Debug test to verify authentication cookie persistence
 */
test.describe('Debug: Authentication Cookie Persistence', () => {
  test('should verify cookies are set and persist', async ({ page }) => {
    console.log('\n=== STEP 1: Navigate to auth page ===');
    await page.goto('http://localhost:4003/auth');

    console.log('\n=== STEP 2: Check cookies before login ===');
    let cookies = await page.context().cookies();
    console.log('Cookies before login:', cookies.map(c => ({ name: c.name, value: c.value.substring(0, 20) + '...' })));

    console.log('\n=== STEP 3: Perform login ===');
    await page.fill('#login-username', 'dev');
    await page.fill('#login-password', 'dev123');
    await page.click('button[type="submit"]');

    console.log('\n=== STEP 4: Wait for redirect ===');
    await page.waitForURL((url) => !url.pathname.includes('/auth'), { timeout: 15000 });
    console.log('Current URL after login:', page.url());

    console.log('\n=== STEP 5: Check cookies after login ===');
    cookies = await page.context().cookies();
    console.log('Cookies after login:', cookies.map(c => ({ name: c.name, value: c.value.substring(0, 20) + '...', httpOnly: c.httpOnly })));

    const authToken = cookies.find(c => c.name === 'authToken');
    console.log('\n=== STEP 6: Verify authToken cookie exists ===');
    console.log('authToken found:', !!authToken);
    if (authToken) {
      console.log('authToken details:', {
        domain: authToken.domain,
        path: authToken.path,
        httpOnly: authToken.httpOnly,
        secure: authToken.secure,
        sameSite: authToken.sameSite
      });
    }
    expect(authToken).toBeDefined();

    console.log('\n=== STEP 7: Navigate to chat page ===');
    await page.goto('http://localhost:4003/');
    await page.waitForLoadState('networkidle');

    console.log('\n=== STEP 8: Check cookies after navigation ===');
    cookies = await page.context().cookies();
    console.log('Cookies after navigation to chat:', cookies.map(c => ({ name: c.name, value: c.value.substring(0, 20) + '...' })));

    const authTokenAfterNav = cookies.find(c => c.name === 'authToken');
    console.log('authToken still exists after navigation:', !!authTokenAfterNav);
    expect(authTokenAfterNav).toBeDefined();

    console.log('\n=== STEP 9: Intercept network request to /api/chats ===');
    const requestPromise = page.waitForRequest(request =>
      request.url().includes('/api/chats') && request.method() === 'POST',
      { timeout: 60000 }
    );

    console.log('\n=== STEP 10: Send a test message ===');
    // Wait for chat input to be ready
    await page.waitForSelector('textarea[placeholder*="message"], input[type="text"][placeholder*="message"]', { timeout: 10000 });

    await page.fill('textarea[placeholder*="message"], input[type="text"][placeholder*="message"]', 'test message');
    await page.click('button[type="submit"]:has-text("Send"), button:has([data-icon="send"])');

    console.log('\n=== STEP 11: Capture the request ===');
    const request = await requestPromise;
    console.log('Request URL:', request.url());
    console.log('Request method:', request.method());
    console.log('Request headers:', request.headers());

    // Check if Cookie header is present
    const cookieHeader = request.headers()['cookie'];
    console.log('\n=== STEP 12: Check Cookie header ===');
    console.log('Cookie header present:', !!cookieHeader);
    console.log('Cookie header value:', cookieHeader ? cookieHeader.substring(0, 100) + '...' : 'NONE');
    console.log('Contains authToken:', cookieHeader ? cookieHeader.includes('authToken') : false);

    if (!cookieHeader || !cookieHeader.includes('authToken')) {
      console.error('\n❌ PROBLEM FOUND: Request does not include authToken cookie!');
      console.error('This explains why backend returns 401 Unauthorized');
    } else {
      console.log('\n✅ Request includes authToken cookie');
    }

    // Wait a bit to see if we get a response
    console.log('\n=== STEP 13: Wait for response ===');
    try {
      const responsePromise = page.waitForResponse(response =>
        response.url().includes('/api/chats') && response.request().method() === 'POST',
        { timeout: 10000 }
      );
      const response = await responsePromise;
      console.log('Response status:', response.status());
      console.log('Response status text:', response.statusText());

      if (response.status() === 401) {
        console.error('\n❌ CONFIRMED: Backend returned 401 Unauthorized');
        const body = await response.text();
        console.log('Response body:', body);
      } else if (response.status() === 200) {
        console.log('\n✅ Backend returned 200 OK');
        const body = await response.json();
        console.log('Response success:', body.success);
      }
    } catch (error) {
      console.error('\n❌ Response timeout or error:', error);
    }
  });
});
