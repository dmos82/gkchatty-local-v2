#!/usr/bin/env ts-node
/**
 * TEMPORARY ADMIN UTILITY SCRIPT
 *
 * This script manually triggers the Pinecone re-indexing endpoint on the Staging API.
 * It is NOT intended for production use or to be included in any CI/CD pipeline.
 *
 * USAGE:
 * 1. First, obtain your JWT token from the browser:
 *    - Log into the Staging Admin UI (https://app.gkchatty.com/admin)
 *    - Open browser Developer Tools (F12)
 *    - Go to Application/Storage → Local Storage → https://app.gkchatty.com
 *    - Find the 'token' key and copy its value (without quotes)
 *
 * 2. Run this script with the token:
 *    cd apps/api
 *    npx ts-node src/scripts/trigger-reindex.ts YOUR_JWT_TOKEN_HERE
 *
 * OR using environment variable:
 *    ADMIN_JWT_TOKEN=YOUR_JWT_TOKEN_HERE npx ts-node src/scripts/trigger-reindex.ts
 */

import * as https from 'https';

// Get JWT token from command line argument or environment variable
const jwtToken = process.argv[2] || process.env.ADMIN_JWT_TOKEN;

if (!jwtToken) {
  console.error('❌ ERROR: JWT token is required!');
  console.error('\nUsage:');
  console.error('  npx ts-node src/scripts/trigger-reindex.ts YOUR_JWT_TOKEN');
  console.error('OR');
  console.error('  ADMIN_JWT_TOKEN=YOUR_JWT_TOKEN npx ts-node src/scripts/trigger-reindex.ts');
  process.exit(1);
}

// Validate token format (basic check)
if (!jwtToken.includes('.')) {
  console.error('❌ ERROR: Invalid JWT token format!');
  console.error('Make sure you copied the entire token value from browser local storage.');
  process.exit(1);
}

console.log('🚀 Triggering Pinecone re-indexing on Staging API...\n');

// Request configuration
const requestBody = JSON.stringify({
  forceFullCleanup: true,
  clearAllNamespaces: false,
});

const options = {
  hostname: 'api.gkchatty.com',
  port: 443,
  path: '/api/admin/reindex-system-kb',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(requestBody),
    Authorization: `Bearer ${jwtToken}`,
  },
};

// Make the HTTPS request
const req = https.request(options, res => {
  let responseData = '';

  res.on('data', chunk => {
    responseData += chunk;
  });

  res.on('end', () => {
    const statusCode = res.statusCode || 0;
    console.log(`📡 Response Status: ${statusCode} ${res.statusMessage}`);
    console.log(`📋 Response Headers:`, res.headers);
    console.log('\n📄 Response Body:');

    try {
      const jsonResponse = JSON.parse(responseData);
      console.log(JSON.stringify(jsonResponse, null, 2));

      if (statusCode === 200 || statusCode === 202) {
        console.log('\n✅ SUCCESS: Re-indexing triggered successfully!');
        console.log('The process may take a few minutes to complete.');
        console.log('Check the Render logs for detailed progress.');
      } else if (statusCode === 401) {
        console.error('\n❌ AUTHENTICATION ERROR: Your JWT token may be expired or invalid.');
        console.error('Please obtain a fresh token from the browser and try again.');
      } else {
        console.error('\n❌ ERROR: Re-indexing request failed.');
        console.error('Check the response above for details.');
      }
    } catch (parseError) {
      console.log('Raw response:', responseData);
      if (statusCode >= 200 && statusCode < 300) {
        console.log('\n✅ Request completed successfully (non-JSON response)');
      } else {
        console.error('\n❌ ERROR: Unexpected response format');
      }
    }
  });
});

req.on('error', error => {
  console.error('\n❌ REQUEST ERROR:', error.message);
  console.error('Details:', error);
});

// Send the request
console.log('📤 Sending POST request to: https://api.gkchatty.com/api/admin/reindex-system-kb');
console.log('📦 Request body:', requestBody);
console.log(
  '🔑 Using JWT token:',
  jwtToken.substring(0, 20) + '...' + jwtToken.substring(jwtToken.length - 10)
);
console.log('\n');

req.write(requestBody);
req.end();
