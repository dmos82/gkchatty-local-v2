#!/usr/bin/env node

/**
 * GKChatty User Creator via API
 *
 * Creates project-specific admin users through the GKChatty API.
 * This version uses HTTP requests instead of direct database access.
 *
 * @date 2025-10-27
 */

const http = require('http');
const crypto = require('crypto');

const GKCHATTY_ENDPOINT = process.env.GKCHATTY_ENDPOINT || 'http://localhost:4003';
const ADMIN_USERNAME = 'gkchattymcp';
const ADMIN_PASSWORD = 'Gkchatty1!';

/**
 * Generate a secure random password
 */
function generateSecurePassword() {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const special = '!@#$%^&*()_+-=[]{}|;:,.<>?';

  let password = '';
  password += uppercase[crypto.randomInt(uppercase.length)];
  password += lowercase[crypto.randomInt(lowercase.length)];
  password += numbers[crypto.randomInt(numbers.length)];
  password += special[crypto.randomInt(special.length)];

  const allChars = uppercase + lowercase + numbers + special;
  for (let i = 0; i < 12; i++) {
    password += allChars[crypto.randomInt(allChars.length)];
  }

  return password.split('').sort(() => 0.5 - Math.random()).join('');
}

/**
 * Make an HTTP request to GKChatty
 */
function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(GKCHATTY_ENDPOINT);

    const reqOptions = {
      hostname: url.hostname.replace('[', '').replace(']', ''),
      port: url.port || 4003,
      path: options.path,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    };

    const req = http.request(reqOptions, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${parsed.error || parsed.message || responseData}`));
          }
        } catch (e) {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(responseData);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
          }
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

/**
 * Login as admin and get auth token
 */
async function loginAsAdmin() {
  console.log('🔐 Logging in as admin...');

  try {
    const response = await makeRequest({
      path: '/api/auth/login',
      method: 'POST'
    }, {
      username: ADMIN_USERNAME,
      password: ADMIN_PASSWORD
    });

    if (response.token) {
      console.log('✅ Admin login successful');
      return response.token;
    } else {
      throw new Error('No token received from login');
    }
  } catch (error) {
    console.error('❌ Admin login failed:', error.message);
    throw error;
  }
}

/**
 * Create a new user via admin endpoint
 */
async function createUserViaAPI(username, password, token) {
  console.log(`👤 Creating user '${username}'...`);

  // First, try to create via admin endpoint (if it exists)
  // If not, we'll need to use a different approach

  try {
    // Try admin user creation endpoint
    const response = await makeRequest({
      path: '/api/admin/users',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }, {
      username: username,
      password: password,
      role: 'admin',
      email: `${username}@gkchatty.local`
    });

    console.log('✅ User created via admin API');
    return response;
  } catch (error) {
    console.log('⚠️ Admin endpoint not available, trying alternative method...');

    // Alternative: Try to use the registration endpoint if available
    try {
      const response = await makeRequest({
        path: '/api/auth/register',
        method: 'POST'
      }, {
        username: username,
        password: password,
        email: `${username}@gkchatty.local`
      });

      console.log('✅ User created via registration endpoint');
      return response;
    } catch (regError) {
      console.error('❌ Registration failed:', regError.message);

      // If registration is disabled, we need to use direct database access
      console.log('\n⚠️ API methods unavailable. Use the MongoDB script instead:');
      console.log('   node gkchatty-user-creator.js ' + username);
      throw regError;
    }
  }
}

/**
 * Check if user exists by trying to login
 */
async function checkUserExists(username, password) {
  try {
    const response = await makeRequest({
      path: '/api/auth/login',
      method: 'POST'
    }, {
      username: username,
      password: password
    });

    if (response.token || response.success) {
      return true;
    }
  } catch (error) {
    // Login failed, user probably doesn't exist
    return false;
  }
  return false;
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
GKChatty User Creator (API Version)

Usage:
  node gkchatty-create-user-api.js <username> [password]

Examples:
  node gkchatty-create-user-api.js commisocial
  node gkchatty-create-user-api.js commisocial MySecurePass123!

Environment:
  GKCHATTY_ENDPOINT - API endpoint (default: http://localhost:4003)

Notes:
  - Creates an admin user for project-specific knowledge base
  - If no password provided, generates a secure password
  - Requires GKChatty backend to be running
    `);
    process.exit(0);
  }

  const username = args[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  const password = args[1] || generateSecurePassword();

  console.log('\n🚀 GKChatty User Creator\n');
  console.log(`Endpoint: ${GKCHATTY_ENDPOINT}`);
  console.log(`Username: ${username}`);
  console.log(`Password: ${password}`);
  console.log('─'.repeat(40));

  try {
    // Check if backend is running
    console.log('🔍 Checking GKChatty backend...');
    await makeRequest({ path: '/health', method: 'GET' }).catch(() => {
      console.log('⚠️ Health check failed, but continuing...');
    });

    // Check if user already exists
    console.log(`🔍 Checking if user '${username}' exists...`);
    const exists = await checkUserExists(username, password);

    if (exists) {
      console.log(`✅ User '${username}' already exists and password is correct!`);
      console.log('\n💡 You can now use:');
      console.log(`   mcp__gkchatty_kb__switch_user("${username}", "${password}")`);
      return;
    }

    // Login as admin
    const token = await loginAsAdmin();

    // Create the new user
    await createUserViaAPI(username, password, token);

    console.log('\n✅ Success! User created.');
    console.log('─'.repeat(40));
    console.log(`Username: ${username}`);
    console.log(`Password: ${password}`);
    console.log('─'.repeat(40));
    console.log('\n💡 Next steps:');
    console.log(`1. Switch to this user in Claude Code:`);
    console.log(`   mcp__gkchatty_kb__switch_user("${username}", "${password}")`);
    console.log(`2. Upload documents to this user's knowledge base`);
    console.log(`3. Query documents using this user's context`);

  } catch (error) {
    console.error('\n❌ Failed to create user:', error.message);
    console.log('\n💡 Alternative: Use the direct MongoDB script:');
    console.log(`   cd /Users/davidjmorin/GOLDKEY\\ CHATTY/gkchatty-ecosystem`);
    console.log(`   npm install mongoose bcryptjs`);
    console.log(`   node orchestrator/gkchatty-user-creator.js ${username} "${password}"`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}