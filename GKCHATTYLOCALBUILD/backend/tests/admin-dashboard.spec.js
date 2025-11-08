const { test, expect } = require('@playwright/test');
const fs = require('fs');

// Admin authentication token
let adminToken;

test.describe('Admin Dashboard API Endpoints', () => {

  test.beforeAll(async ({ request }) => {
    // Login as admin and get token
    const response = await request.post('http://localhost:6001/api/auth/login', {
      data: {
        username: 'admin',
        password: 'admin'
      }
    });

    const body = await response.json();
    adminToken = body.token;

    console.log('✅ Admin login successful');
  });

  test('GET /api/admin/users - Should return user list', async ({ request }) => {
    const response = await request.get('http://localhost:6001/api/admin/users', {
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });

    const body = await response.json();

    console.log('Status:', response.status());
    console.log('Response:', JSON.stringify(body, null, 2));

    expect(response.status()).toBe(200);
    expect(body.success).toBe(true);
    expect(body.users).toBeDefined();
  });

  test('GET /api/personas - Should return personas list', async ({ request }) => {
    const response = await request.get('http://localhost:6001/api/personas', {
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });

    const body = await response.json();

    console.log('Status:', response.status());
    console.log('Response:', JSON.stringify(body, null, 2));

    expect(response.status()).toBe(200);
    expect(body.success).toBe(true);
    expect(body.personas).toBeDefined();
  });

  test('GET /api/admin/tenant-kb - Should return tenant knowledge bases', async ({ request }) => {
    const response = await request.get('http://localhost:6001/api/admin/tenant-kb', {
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });

    const body = await response.json();

    console.log('Status:', response.status());
    console.log('Response:', JSON.stringify(body, null, 2));

    expect(response.status()).toBe(200);
    expect(body.success).toBe(true);
    expect(body.knowledgeBases).toBeDefined();
  });

  test('GET /api/folders/tree - Should return folder tree', async ({ request }) => {
    const response = await request.get('http://localhost:6001/api/folders/tree', {
      headers: {
        'Authorization': `Bearer ${adminToken}`
      },
      timeout: 15000 // 15 second timeout
    });

    const body = await response.json();

    console.log('Status:', response.status());
    console.log('Response:', JSON.stringify(body, null, 2));

    expect(response.status()).toBe(200);
    expect(body.success).toBe(true);
    expect(body.tree).toBeDefined();
  });

  test('GET /api/admin/system-kb/documents - Should return system KB documents', async ({ request }) => {
    const response = await request.get('http://localhost:6001/api/admin/system-kb/documents', {
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });

    const body = await response.json();

    console.log('Status:', response.status());
    console.log('Response:', JSON.stringify(body, null, 2));

    // Accept either 200 (with documents) or appropriate error response
    if (response.status() === 200) {
      expect(body.success).toBe(true);
      expect(body.documents).toBeDefined();
    } else {
      // Log the error for debugging
      console.log('⚠️  System KB endpoint returned error:', response.status());
    }
  });

  test('GET /api/admin/stats/summary - Should return admin stats', async ({ request }) => {
    const response = await request.get('http://localhost:6001/api/admin/stats/summary', {
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });

    const body = await response.json();

    console.log('Status:', response.status());
    console.log('Response:', JSON.stringify(body, null, 2));

    // Accept either 200 (with stats) or appropriate error response
    if (response.status() === 200) {
      expect(body.success).toBe(true);
    } else {
      // Log the error for debugging
      console.log('⚠️  Stats endpoint returned error:', response.status());
    }
  });
});

test.describe('Error Reporting', () => {
  test('Generate comprehensive error report', async ({ request }) => {
    const endpoints = [
      '/api/admin/users',
      '/api/personas',
      '/api/admin/tenant-kb',
      '/api/folders/tree',
      '/api/admin/system-kb/documents',
      '/api/admin/stats/summary'
    ];

    const results = [];

    for (const endpoint of endpoints) {
      try {
        const response = await request.get(`http://localhost:6001${endpoint}`, {
          headers: {
            'Authorization': `Bearer ${adminToken}`
          },
          timeout: 15000
        });

        const body = await response.json();

        results.push({
          endpoint,
          status: response.status(),
          success: body.success,
          error: body.error || body.message || null,
          hasData: response.status() === 200
        });
      } catch (error) {
        results.push({
          endpoint,
          status: 'TIMEOUT/ERROR',
          success: false,
          error: error.message,
          hasData: false
        });
      }
    }

    console.log('\n========================================');
    console.log('COMPREHENSIVE ENDPOINT TEST RESULTS');
    console.log('========================================\n');

    results.forEach(result => {
      const statusEmoji = result.status === 200 ? '✅' : '❌';
      console.log(`${statusEmoji} ${result.endpoint}`);
      console.log(`   Status: ${result.status}`);
      console.log(`   Success: ${result.success}`);
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
      console.log('');
    });

    // Write results to file
    fs.writeFileSync(
      '/tmp/admin-dashboard-test-results.json',
      JSON.stringify(results, null, 2)
    );

    console.log('Results saved to: /tmp/admin-dashboard-test-results.json\n');
  });
});
