#!/usr/bin/env node

const http = require('http');

// Get admin token first
async function getToken() {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      username: 'admin',
      password: 'admin'
    });

    const options = {
      hostname: 'localhost',
      port: 6001,
      path: '/api/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve(json.token);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Test an endpoint
async function testEndpoint(method, path, token, body = null, timeout = 15000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve({
        path,
        method,
        status: 'TIMEOUT',
        success: false,
        error: `Request timed out after ${timeout}ms`
      });
    }, timeout);

    const bodyData = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'localhost',
      port: 6001,
      path,
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    };

    if (bodyData) {
      options.headers['Content-Length'] = bodyData.length;
    }

    const req = http.request(options, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => responseBody += chunk);
      res.on('end', () => {
        clearTimeout(timer);
        try {
          const json = JSON.parse(responseBody);
          resolve({
            path,
            method,
            status: res.statusCode,
            success: json.success,
            error: json.error || json.message || null,
            body: json
          });
        } catch (e) {
          resolve({
            path,
            method,
            status: res.statusCode,
            success: false,
            error: `Failed to parse JSON: ${e.message}`,
            body: responseBody.substring(0, 200)
          });
        }
      });
    });

    req.on('error', (error) => {
      clearTimeout(timer);
      resolve({
        path,
        method,
        status: 'ERROR',
        success: false,
        error: error.message
      });
    });

    if (bodyData) {
      req.write(bodyData);
    }
    req.end();
  });
}

async function main() {
  console.log('🔐 Getting admin token...\n');

  const token = await getToken();
  console.log('✅ Token obtained\n');

  console.log('========================================');
  console.log('TESTING ADMIN OPERATIONS');
  console.log('========================================\n');

  const results = [];

  // Test 1: Create folder
  console.log('📁 Test 1: Create folder');
  const folderResult = await testEndpoint('POST', '/api/folders', token, {
    name: 'Test Folder ' + Date.now(),
    parentId: null
  });
  results.push(folderResult);
  console.log(`${folderResult.status === 201 ? '✅' : '❌'} Status: ${folderResult.status}`);
  if (folderResult.error) console.log(`   Error: ${folderResult.error}`);
  console.log('');

  // Test 2: Create user
  console.log('👤 Test 2: Create user');
  const randomEmail = `testuser${Date.now()}@test.com`;
  const userResult = await testEndpoint('POST', '/api/admin/users', token, {
    username: `testuser${Date.now()}`,
    email: randomEmail,
    password: 'Test123!',
    role: 'user'
  });
  results.push(userResult);
  console.log(`${userResult.status === 201 ? '✅' : '❌'} Status: ${userResult.status}`);
  if (userResult.error) console.log(`   Error: ${userResult.error}`);
  console.log('');

  // Test 3: Get models list
  console.log('🤖 Test 3: Get available models');
  const modelsResult = await testEndpoint('GET', '/api/models', token);
  results.push(modelsResult);
  console.log(`${modelsResult.status === 200 ? '✅' : '❌'} Status: ${modelsResult.status}`);
  if (modelsResult.error) console.log(`   Error: ${modelsResult.error}`);
  if (modelsResult.body && modelsResult.body.models) {
    console.log(`   Models count: ${modelsResult.body.models.length}`);
  }
  console.log('');

  // Test 4: Get settings
  console.log('⚙️  Test 4: Get system settings');
  const settingsResult = await testEndpoint('GET', '/api/admin/settings', token);
  results.push(settingsResult);
  console.log(`${settingsResult.status === 200 ? '✅' : '❌'} Status: ${settingsResult.status}`);
  if (settingsResult.error) console.log(`   Error: ${settingsResult.error}`);
  console.log('');

  // Test 5: Update user role (if user was created)
  if (userResult.status === 201 && userResult.body && userResult.body.user) {
    console.log('👥 Test 5: Update user role');
    const userId = userResult.body.user._id || userResult.body.user.id;
    const updateRoleResult = await testEndpoint('PUT', `/api/admin/users/${userId}`, token, {
      role: 'admin'
    });
    results.push(updateRoleResult);
    console.log(`${updateRoleResult.status === 200 ? '✅' : '❌'} Status: ${updateRoleResult.status}`);
    if (updateRoleResult.error) console.log(`   Error: ${updateRoleResult.error}`);
    console.log('');
  }

  console.log('\n========================================');
  console.log('SUMMARY');
  console.log('========================================\n');

  const passing = results.filter(r => r.status === 200 || r.status === 201).length;
  const failing = results.length - passing;

  console.log(`✅ Passing: ${passing}/${results.length}`);
  console.log(`❌ Failing: ${failing}/${results.length}\n`);

  if (failing > 0) {
    console.log('Failed operations:');
    results
      .filter(r => r.status !== 200 && r.status !== 201)
      .forEach(r => {
        console.log(`  - ${r.method} ${r.path} (${r.status}): ${r.error || 'Unknown error'}`);
      });
  }

  // Save results
  require('fs').writeFileSync(
    '/tmp/admin-operations-test-results.json',
    JSON.stringify(results, null, 2)
  );

  console.log('\n📄 Full results saved to: /tmp/admin-operations-test-results.json');
}

main().catch(console.error);
