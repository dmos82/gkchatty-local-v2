/**
 * Folder Permission Security Test
 *
 * Tests that folder permissions are properly enforced in:
 * - RAG service (chat queries)
 * - Search endpoints (filename search)
 *
 * Test Scenarios:
 * 1. Admin can access admin-only folders
 * 2. Regular user CANNOT access admin-only folders
 * 3. All users can access 'all' permission folders
 * 4. Only specified users can access 'specific-users' folders
 * 5. Documents at root (no folder) are accessible to all
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:4001';
const DEV_USER = { username: 'dev', password: 'dev123' }; // Admin user
const TEST_USER = { username: 'testuser', password: 'test123' }; // Regular user (needs to be created)

// Color codes for output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

let adminToken = null;
let testUserToken = null;
let testUserId = null;

async function login(username, password) {
  try {
    const response = await axios.post(`${BASE_URL}/api/auth/login`, {
      username,
      password,
    });
    return response.data.token;
  } catch (error) {
    throw new Error(`Login failed for ${username}: ${error.response?.data?.message || error.message}`);
  }
}

async function createTestUser() {
  try {
    const response = await axios.post(
      `${BASE_URL}/api/auth/register`,
      {
        username: TEST_USER.username,
        password: TEST_USER.password,
        email: 'test@example.com',
      }
    );
    console.log(`${GREEN}✓${RESET} Test user created: ${TEST_USER.username}`);
    return response.data.user._id;
  } catch (error) {
    if (error.response?.status === 409 || error.response?.status === 400) {
      console.log(`${YELLOW}ℹ${RESET} Test user already exists`);
      // Login to get user ID
      const token = await login(TEST_USER.username, TEST_USER.password);
      const profile = await axios.get(`${BASE_URL}/api/users/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return profile.data._id;
    }
    throw error;
  }
}

async function createTestFolder(name, permissionType, allowedUsers = []) {
  try {
    const response = await axios.post(
      `${BASE_URL}/api/admin/system-folders`,
      {
        name,
        permissions: {
          type: permissionType,
          allowedUsers: allowedUsers,
        },
      },
      {
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );
    console.log(`${GREEN}✓${RESET} Created folder: ${name} (${permissionType})`);
    return response.data.folder._id;
  } catch (error) {
    console.error(`${RED}✗${RESET} Failed to create folder ${name}:`, error.response?.data || error.message);
    throw error;
  }
}

async function uploadTestDocument(folderId, filename, content) {
  const FormData = require('form-data');
  const form = new FormData();

  // Create a simple text file buffer
  const buffer = Buffer.from(content, 'utf-8');
  form.append('files', buffer, filename);
  if (folderId) {
    form.append('folderId', folderId);
  }

  try {
    const response = await axios.post(
      `${BASE_URL}/api/admin/system-kb/upload`,
      form,
      {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${adminToken}`,
        },
      }
    );
    console.log(`${GREEN}✓${RESET} Uploaded document: ${filename} to folder ${folderId || 'root'}`);
    return response.data;
  } catch (error) {
    console.error(`${RED}✗${RESET} Failed to upload document:`, error.response?.data || error.message);
    throw error;
  }
}

async function testChatQuery(token, query, expectedToFind, shouldContain) {
  try {
    const response = await axios.post(
      `${BASE_URL}/api/chat`,
      {
        message: query,
        searchMode: 'system-kb',
      },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    const foundContent = response.data.sources?.some(source =>
      source.text.includes(shouldContain)
    );

    if (expectedToFind === foundContent) {
      console.log(`${GREEN}✓${RESET} Chat query behaved correctly (expected to find: ${expectedToFind}, found: ${foundContent})`);
      return true;
    } else {
      console.log(`${RED}✗${RESET} Chat query failed (expected to find: ${expectedToFind}, found: ${foundContent})`);
      console.log('Sources returned:', response.data.sources?.length || 0);
      return false;
    }
  } catch (error) {
    console.error(`${RED}✗${RESET} Chat query error:`, error.response?.data || error.message);
    return false;
  }
}

async function testFilenameSearch(token, query, expectedToFind, shouldContain) {
  try {
    const response = await axios.get(
      `${BASE_URL}/api/search/filename`,
      {
        params: { q: query },
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    const foundFile = response.data.results?.some(result =>
      result.originalFileName.includes(shouldContain)
    );

    if (expectedToFind === foundFile) {
      console.log(`${GREEN}✓${RESET} Filename search behaved correctly (expected to find: ${expectedToFind}, found: ${foundFile})`);
      return true;
    } else {
      console.log(`${RED}✗${RESET} Filename search failed (expected to find: ${expectedToFind}, found: ${foundFile})`);
      console.log('Results returned:', response.data.results?.length || 0);
      return false;
    }
  } catch (error) {
    console.error(`${RED}✗${RESET} Filename search error:`, error.response?.data || error.message);
    return false;
  }
}

async function cleanupTestData(folderIds) {
  console.log(`\n${BLUE}Cleaning up test data...${RESET}`);
  for (const folderId of folderIds) {
    try {
      await axios.delete(
        `${BASE_URL}/api/admin/system-folders/${folderId}`,
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );
      console.log(`${GREEN}✓${RESET} Deleted test folder: ${folderId}`);
    } catch (error) {
      console.log(`${YELLOW}⚠${RESET} Could not delete folder ${folderId}`);
    }
  }
}

async function runTests() {
  console.log(`${BLUE}═══════════════════════════════════════════════════════${RESET}`);
  console.log(`${BLUE}  Folder Permission Security Test${RESET}`);
  console.log(`${BLUE}═══════════════════════════════════════════════════════${RESET}\n`);

  const testFolders = [];
  let passed = 0;
  let failed = 0;

  try {
    // Setup: Login as admin
    console.log(`${BLUE}[Setup] Logging in as admin...${RESET}`);
    adminToken = await login(DEV_USER.username, DEV_USER.password);
    console.log(`${GREEN}✓${RESET} Admin logged in\n`);

    // Setup: Create test user
    console.log(`${BLUE}[Setup] Creating test user...${RESET}`);
    testUserId = await createTestUser();
    testUserToken = await login(TEST_USER.username, TEST_USER.password);
    console.log(`${GREEN}✓${RESET} Test user ready\n`);

    // Setup: Create test folders and documents
    console.log(`${BLUE}[Setup] Creating test folders and documents...${RESET}`);

    const adminFolder = await createTestFolder('Test Admin Only', 'admin');
    testFolders.push(adminFolder);
    await uploadTestDocument(adminFolder, 'admin-secret.txt', 'This is admin-only content about SECRET_ADMIN_DATA');

    const allFolder = await createTestFolder('Test All Users', 'all');
    testFolders.push(allFolder);
    await uploadTestDocument(allFolder, 'public-info.txt', 'This is public content about PUBLIC_INFO');

    const specificFolder = await createTestFolder('Test Specific Users', 'specific-users', [testUserId]);
    testFolders.push(specificFolder);
    await uploadTestDocument(specificFolder, 'user-specific.txt', 'This is specific content about SPECIFIC_USER_DATA');

    // Upload one document at root level (no folder)
    await uploadTestDocument(null, 'root-level.txt', 'This is root level content about ROOT_LEVEL_DATA');

    console.log(`${GREEN}✓${RESET} Test data created\n`);

    // Test 1: Admin can access admin-only folders via chat
    console.log(`${BLUE}[Test 1] Admin accessing admin-only folder via chat${RESET}`);
    if (await testChatQuery(adminToken, 'SECRET_ADMIN_DATA', true, 'admin-only content')) {
      passed++;
    } else {
      failed++;
    }

    // Test 2: Regular user CANNOT access admin-only folders via chat
    console.log(`\n${BLUE}[Test 2] Regular user accessing admin-only folder via chat (should fail)${RESET}`);
    if (await testChatQuery(testUserToken, 'SECRET_ADMIN_DATA', false, 'admin-only content')) {
      passed++;
    } else {
      failed++;
    }

    // Test 3: All users can access 'all' permission folders via chat
    console.log(`\n${BLUE}[Test 3] Regular user accessing 'all' permission folder via chat${RESET}`);
    if (await testChatQuery(testUserToken, 'PUBLIC_INFO', true, 'public content')) {
      passed++;
    } else {
      failed++;
    }

    // Test 4: Specific user can access their folder via chat
    console.log(`\n${BLUE}[Test 4] Specific user accessing their permitted folder via chat${RESET}`);
    if (await testChatQuery(testUserToken, 'SPECIFIC_USER_DATA', true, 'specific content')) {
      passed++;
    } else {
      failed++;
    }

    // Test 5: All users can access root-level documents via chat
    console.log(`\n${BLUE}[Test 5] Regular user accessing root-level document via chat${RESET}`);
    if (await testChatQuery(testUserToken, 'ROOT_LEVEL_DATA', true, 'root level content')) {
      passed++;
    } else {
      failed++;
    }

    // Test 6: Admin can find admin-only files via filename search
    console.log(`\n${BLUE}[Test 6] Admin searching for admin-only file${RESET}`);
    if (await testFilenameSearch(adminToken, 'admin-secret', true, 'admin-secret')) {
      passed++;
    } else {
      failed++;
    }

    // Test 7: Regular user CANNOT find admin-only files via filename search
    console.log(`\n${BLUE}[Test 7] Regular user searching for admin-only file (should fail)${RESET}`);
    if (await testFilenameSearch(testUserToken, 'admin-secret', false, 'admin-secret')) {
      passed++;
    } else {
      failed++;
    }

    // Test 8: Regular user CAN find 'all' permission files via filename search
    console.log(`\n${BLUE}[Test 8] Regular user searching for public file${RESET}`);
    if (await testFilenameSearch(testUserToken, 'public-info', true, 'public-info')) {
      passed++;
    } else {
      failed++;
    }

    // Cleanup
    await cleanupTestData(testFolders);

  } catch (error) {
    console.error(`\n${RED}✗ Test suite error:${RESET}`, error.message);
    await cleanupTestData(testFolders);
    process.exit(1);
  }

  // Summary
  console.log(`\n${BLUE}═══════════════════════════════════════════════════════${RESET}`);
  console.log(`${BLUE}  Test Results${RESET}`);
  console.log(`${BLUE}═══════════════════════════════════════════════════════${RESET}`);
  console.log(`${GREEN}Passed:${RESET} ${passed}`);
  console.log(`${RED}Failed:${RESET} ${failed}`);
  console.log(`${BLUE}Total:${RESET}  ${passed + failed}\n`);

  if (failed > 0) {
    console.log(`${RED}❌ Some tests failed - security permissions not working correctly${RESET}`);
    process.exit(1);
  } else {
    console.log(`${GREEN}✅ All tests passed - folder permissions are properly enforced${RESET}`);
    process.exit(0);
  }
}

// Run tests
runTests().catch(error => {
  console.error(`${RED}Fatal error:${RESET}`, error);
  process.exit(1);
});
