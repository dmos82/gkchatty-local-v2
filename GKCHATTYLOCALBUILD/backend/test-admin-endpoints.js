#!/usr/bin/env node

const https = require('http');

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

    const req = https.request(options, (res) => {
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
async function testEndpoint(path, token, timeout = 15000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve({
        path,
        status: 'TIMEOUT',
        success: false,
        error: `Request timed out after ${timeout}ms`
      });
    }, timeout);

    const options = {
      hostname: 'localhost',
      port: 6001,
      path,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        clearTimeout(timer);
        try {
          const json = JSON.parse(body);
          resolve({
            path,
            status: res.statusCode,
            success: json.success,
            error: json.error || json.message || null,
            body: json
          });
        } catch (e) {
          resolve({
            path,
            status: res.statusCode,
            success: false,
            error: `Failed to parse JSON: ${e.message}`,
            body: body.substring(0, 200)
          });
        }
      });
    });

    req.on('error', (error) => {
      clearTimeout(timer);
      resolve({
        path,
        status: 'ERROR',
        success: false,
        error: error.message
      });
    });

    req.end();
  });
}

async function main() {
  console.log('🔐 Getting admin token...\n');

  const token = await getToken();
  console.log('✅ Token obtained\n');

  const endpoints = [
    '/api/admin/users',
    '/api/personas',
    '/api/admin/tenant-kb',
    '/api/folders/tree',
    '/api/admin/system-kb/documents',
    '/api/admin/stats/summary'
  ];

  console.log('========================================');
  console.log('TESTING ADMIN DASHBOARD ENDPOINTS');
  console.log('========================================\n');

  const results = [];

  for (const endpoint of endpoints) {
    console.log(`Testing: ${endpoint}`);
    const result = await testEndpoint(endpoint, token);
    results.push(result);

    const emoji = result.status === 200 ? '✅' : '❌';
    console.log(`${emoji} Status: ${result.status}`);
    console.log(`   Success: ${result.success}`);

    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }

    if (result.status === 200 && result.body) {
      const keys = Object.keys(result.body);
      console.log(`   Response keys: ${keys.join(', ')}`);
    }

    console.log('');
  }

  console.log('\n========================================');
  console.log('SUMMARY');
  console.log('========================================\n');

  const passing = results.filter(r => r.status === 200).length;
  const failing = results.length - passing;

  console.log(`✅ Passing: ${passing}/${results.length}`);
  console.log(`❌ Failing: ${failing}/${results.length}\n`);

  if (failing > 0) {
    console.log('Failed endpoints:');
    results
      .filter(r => r.status !== 200)
      .forEach(r => {
        console.log(`  - ${r.path} (${r.status}): ${r.error || 'Unknown error'}`);
      });
  }

  // Save results
  require('fs').writeFileSync(
    '/tmp/admin-endpoint-test-results.json',
    JSON.stringify(results, null, 2)
  );

  console.log('\n📄 Full results saved to: /tmp/admin-endpoint-test-results.json');
}

main().catch(console.error);
