/**
 * Audit Logging Load Test
 *
 * Simulates 20 staff members making queries over 10 minutes to test
 * the audit logging system under realistic load.
 *
 * Usage:
 *   node scripts/audit-load-test.js [--api-url=URL] [--users=N] [--duration=MINS]
 *
 * Options:
 *   --api-url    API base URL (default: http://localhost:4001)
 *   --users      Number of test users (default: 20)
 *   --duration   Test duration in minutes (default: 10)
 *   --skip-chat  Skip actual chat queries (just login/logout)
 *   --cleanup    Delete test users after test
 */

const API_URL = process.env.API_URL || 'http://localhost:4001';

// Parse command line arguments
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, value] = arg.replace('--', '').split('=');
  acc[key] = value || true;
  return acc;
}, {});

const CONFIG = {
  apiUrl: args['api-url'] || API_URL,
  userCount: parseInt(args['users']) || 20,
  durationMinutes: parseInt(args['duration']) || 10,
  skipChat: args['skip-chat'] || false,
  cleanup: args['cleanup'] || false,
  adminUsername: 'testadmin',
  adminPassword: 'testpassword',
  testUserPrefix: 'auditloadtest',
  testUserPassword: 'LoadTest123!',
};

// Sample queries that staff might ask
const SAMPLE_QUERIES = [
  "What are the company's vacation policies?",
  "How do I submit an expense report?",
  "What is the process for requesting time off?",
  "Where can I find the employee handbook?",
  "What are the health insurance options?",
  "How do I set up direct deposit?",
  "What is the dress code policy?",
  "How do I book a conference room?",
  "What are the remote work guidelines?",
  "How do I access the company intranet?",
  "What training resources are available?",
  "How do I request IT support?",
  "What is the performance review process?",
  "How do I update my emergency contacts?",
  "What are the parking options at the office?",
  "How do I enroll in the 401k plan?",
  "What is the company's PTO policy?",
  "How do I file a workplace complaint?",
  "What are the company holidays this year?",
  "How do I request equipment for my home office?",
];

// Stats tracking
const stats = {
  usersCreated: 0,
  loginsSuccessful: 0,
  loginsFailed: 0,
  queriesSent: 0,
  queriesSuccessful: 0,
  queriesFailed: 0,
  logoutsSuccessful: 0,
  errors: [],
  startTime: null,
  endTime: null,
};

// Helper function for delays
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Random delay between min and max milliseconds
const randomDelay = (minMs, maxMs) => {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
};

// Make HTTP request
async function fetchApi(endpoint, options = {}) {
  const url = `${CONFIG.apiUrl}${endpoint}`;
  const defaultHeaders = {
    'Content-Type': 'application/json',
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers: { ...defaultHeaders, ...options.headers },
    });

    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    return { ok: false, status: 0, error: error.message };
  }
}

// Admin login to create users
async function adminLogin() {
  console.log('\n[SETUP] Logging in as admin...');
  const result = await fetchApi('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      username: CONFIG.adminUsername,
      password: CONFIG.adminPassword,
    }),
  });

  if (!result.ok) {
    throw new Error(`Admin login failed: ${result.data?.message || result.error}`);
  }

  console.log('[SETUP] Admin login successful');
  return result.data.token;
}

// Create a test user
async function createTestUser(adminToken, userNumber) {
  const username = `${CONFIG.testUserPrefix}${userNumber}`;
  const email = `${username}@loadtest.local`;

  const result = await fetchApi('/api/admin/users', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      username,
      email,
      password: CONFIG.testUserPassword,
      role: 'user',
    }),
  });

  if (result.ok) {
    stats.usersCreated++;
    return { username, password: CONFIG.testUserPassword, created: true };
  } else if (result.data?.message?.includes('already exists')) {
    return { username, password: CONFIG.testUserPassword, created: false };
  } else {
    console.error(`[ERROR] Failed to create user ${username}: ${result.data?.message}`);
    return null;
  }
}

// Delete test user
async function deleteTestUser(adminToken, username) {
  // First get user ID
  const usersResult = await fetchApi('/api/admin/users', {
    method: 'GET',
    headers: { Authorization: `Bearer ${adminToken}` },
  });

  if (!usersResult.ok) return false;

  const user = usersResult.data.users?.find(u => u.username === username);
  if (!user) return false;

  const result = await fetchApi(`/api/admin/users/${user._id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminToken}` },
  });

  return result.ok;
}

// User login
async function userLogin(username, password) {
  const result = await fetchApi('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });

  if (result.ok) {
    stats.loginsSuccessful++;
    return result.data.token;
  } else {
    stats.loginsFailed++;
    stats.errors.push(`Login failed for ${username}: ${result.data?.message}`);
    return null;
  }
}

// User logout
async function userLogout(token) {
  const result = await fetchApi('/api/auth/logout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (result.ok) {
    stats.logoutsSuccessful++;
  }
  return result.ok;
}

// Send a chat query
async function sendChatQuery(token, message) {
  stats.queriesSent++;

  const result = await fetchApi('/api/chat', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      message,
      knowledgeBaseTarget: 'system',
    }),
  });

  if (result.ok) {
    stats.queriesSuccessful++;
  } else {
    stats.queriesFailed++;
    stats.errors.push(`Chat query failed: ${result.data?.message || result.error}`);
  }

  return result.ok;
}

// Simulate a user session
async function simulateUserSession(user, sessionNumber, totalSessions) {
  const userLabel = `[User ${user.username}]`;

  // Login
  console.log(`${userLabel} Session ${sessionNumber}/${totalSessions} - Logging in...`);
  const token = await userLogin(user.username, user.password);

  if (!token) {
    console.log(`${userLabel} Login failed, skipping session`);
    return;
  }

  // Make 2-5 queries per session
  if (!CONFIG.skipChat) {
    const queryCount = randomDelay(2, 5);
    for (let i = 0; i < queryCount; i++) {
      await sleep(randomDelay(5000, 15000)); // 5-15 seconds between queries
      const query = SAMPLE_QUERIES[Math.floor(Math.random() * SAMPLE_QUERIES.length)];
      console.log(`${userLabel} Sending query ${i + 1}/${queryCount}...`);
      await sendChatQuery(token, query);
    }
  }

  // Wait a bit before logout
  await sleep(randomDelay(2000, 5000));

  // Logout
  console.log(`${userLabel} Logging out...`);
  await userLogout(token);
}

// Simulate a user's behavior over the test duration
async function simulateUser(user, durationMs) {
  const sessionsPerUser = Math.floor(randomDelay(2, 4)); // Each user does 2-4 sessions
  const sessionInterval = durationMs / sessionsPerUser;

  for (let session = 1; session <= sessionsPerUser; session++) {
    await simulateUserSession(user, session, sessionsPerUser);

    // Wait before next session (except for last session)
    if (session < sessionsPerUser) {
      const waitTime = randomDelay(sessionInterval * 0.5, sessionInterval * 1.5);
      console.log(`[User ${user.username}] Waiting ${Math.round(waitTime / 1000)}s before next session...`);
      await sleep(waitTime);
    }
  }
}

// Get audit log stats from API
async function getAuditStats(adminToken) {
  const result = await fetchApi('/api/admin/audit-logs/stats', {
    method: 'GET',
    headers: { Authorization: `Bearer ${adminToken}` },
  });

  return result.ok ? result.data.stats : null;
}

// Get audit logs for analysis
async function getAuditLogs(adminToken, filters = {}) {
  const params = new URLSearchParams(filters);
  const result = await fetchApi(`/api/admin/audit-logs?${params.toString()}&limit=1000`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${adminToken}` },
  });

  return result.ok ? result.data : null;
}

// Generate test report
async function generateReport(adminToken) {
  console.log('\n' + '='.repeat(60));
  console.log('AUDIT LOAD TEST REPORT');
  console.log('='.repeat(60));

  const durationMs = stats.endTime - stats.startTime;
  const durationMins = (durationMs / 60000).toFixed(2);

  console.log('\n--- TEST CONFIGURATION ---');
  console.log(`API URL: ${CONFIG.apiUrl}`);
  console.log(`Test Users: ${CONFIG.userCount}`);
  console.log(`Planned Duration: ${CONFIG.durationMinutes} minutes`);
  console.log(`Actual Duration: ${durationMins} minutes`);

  console.log('\n--- TEST STATISTICS ---');
  console.log(`Users Created: ${stats.usersCreated}`);
  console.log(`Logins Successful: ${stats.loginsSuccessful}`);
  console.log(`Logins Failed: ${stats.loginsFailed}`);
  console.log(`Queries Sent: ${stats.queriesSent}`);
  console.log(`Queries Successful: ${stats.queriesSuccessful}`);
  console.log(`Queries Failed: ${stats.queriesFailed}`);
  console.log(`Logouts Successful: ${stats.logoutsSuccessful}`);

  // Calculate expected audit events
  const expectedLogins = stats.loginsSuccessful + stats.loginsFailed;
  const expectedLogouts = stats.logoutsSuccessful;
  const expectedChats = stats.queriesSent;
  const totalExpectedEvents = expectedLogins + expectedLogouts + expectedChats;

  console.log('\n--- EXPECTED AUDIT EVENTS ---');
  console.log(`Login Events (success + failed): ${expectedLogins}`);
  console.log(`Logout Events: ${expectedLogouts}`);
  console.log(`Chat Query Events: ${expectedChats}`);
  console.log(`TOTAL Expected: ${totalExpectedEvents}`);

  // Get actual audit stats from API
  console.log('\n--- ACTUAL AUDIT LOG DATA ---');
  const auditStats = await getAuditStats(adminToken);

  if (auditStats) {
    console.log(`Total Audit Events: ${auditStats.totalEvents}`);
    console.log(`Failed Events: ${auditStats.failedEvents}`);
    console.log(`Unique Users: ${auditStats.uniqueUsers}`);
    console.log(`Unique IPs: ${auditStats.uniqueIPs}`);

    console.log('\nEvents by Action:');
    Object.entries(auditStats.eventsByAction || {}).forEach(([action, count]) => {
      console.log(`  ${action}: ${count}`);
    });

    console.log('\nEvents by Resource:');
    Object.entries(auditStats.eventsByResource || {}).forEach(([resource, count]) => {
      console.log(`  ${resource}: ${count}`);
    });

    // Check for data integrity
    console.log('\n--- DATA INTEGRITY CHECK ---');
    const loginEvents = (auditStats.eventsByAction?.LOGIN || 0) +
                       (auditStats.eventsByAction?.LOGIN_FAILED || 0);
    const logoutEvents = auditStats.eventsByAction?.LOGOUT || 0;
    const chatEvents = auditStats.eventsByAction?.CHAT_QUERY || 0;

    console.log(`Login Events Logged: ${loginEvents} (expected: ${expectedLogins})`);
    console.log(`Logout Events Logged: ${logoutEvents} (expected: ${expectedLogouts})`);
    console.log(`Chat Events Logged: ${chatEvents} (expected: ${expectedChats})`);

    const loginMatch = loginEvents >= expectedLogins;
    const logoutMatch = logoutEvents >= expectedLogouts;

    console.log(`\nLogin Integrity: ${loginMatch ? 'PASS' : 'FAIL'}`);
    console.log(`Logout Integrity: ${logoutMatch ? 'PASS' : 'FAIL'}`);
  } else {
    console.log('(Could not retrieve audit stats from API)');
  }

  // Get recent audit logs for sample
  const recentLogs = await getAuditLogs(adminToken, { limit: 10 });
  if (recentLogs?.logs?.length > 0) {
    console.log('\n--- SAMPLE AUDIT LOGS (last 10) ---');
    recentLogs.logs.forEach(log => {
      const timestamp = new Date(log.timestamp).toLocaleTimeString();
      console.log(`  [${timestamp}] ${log.action} - ${log.username || 'N/A'} - ${log.success ? 'OK' : 'FAIL'}`);
    });
  }

  if (stats.errors.length > 0) {
    console.log('\n--- ERRORS ENCOUNTERED ---');
    stats.errors.slice(0, 10).forEach(err => console.log(`  - ${err}`));
    if (stats.errors.length > 10) {
      console.log(`  ... and ${stats.errors.length - 10} more errors`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('END OF REPORT');
  console.log('='.repeat(60) + '\n');
}

// Main function
async function main() {
  console.log('='.repeat(60));
  console.log('AUDIT LOGGING LOAD TEST');
  console.log('='.repeat(60));
  console.log(`\nConfiguration:`);
  console.log(`  API URL: ${CONFIG.apiUrl}`);
  console.log(`  Users: ${CONFIG.userCount}`);
  console.log(`  Duration: ${CONFIG.durationMinutes} minutes`);
  console.log(`  Skip Chat: ${CONFIG.skipChat}`);
  console.log(`  Cleanup After: ${CONFIG.cleanup}`);

  try {
    // Admin login
    const adminToken = await adminLogin();

    // Create test users
    console.log(`\n[SETUP] Creating ${CONFIG.userCount} test users...`);
    const users = [];
    for (let i = 1; i <= CONFIG.userCount; i++) {
      const user = await createTestUser(adminToken, i);
      if (user) {
        users.push(user);
        console.log(`  Created/Found: ${user.username} ${user.created ? '(new)' : '(existing)'}`);
      }
    }
    console.log(`[SETUP] ${users.length} test users ready`);

    // Start the test
    console.log(`\n[TEST] Starting ${CONFIG.durationMinutes}-minute load test with ${users.length} users...`);
    stats.startTime = Date.now();
    const durationMs = CONFIG.durationMinutes * 60 * 1000;

    // Run all user simulations concurrently
    const userPromises = users.map(user => simulateUser(user, durationMs));
    await Promise.all(userPromises);

    stats.endTime = Date.now();
    console.log('\n[TEST] Load test completed!');

    // Generate report
    await generateReport(adminToken);

    // Cleanup if requested
    if (CONFIG.cleanup) {
      console.log('\n[CLEANUP] Deleting test users...');
      for (const user of users) {
        const deleted = await deleteTestUser(adminToken, user.username);
        console.log(`  ${user.username}: ${deleted ? 'deleted' : 'failed'}`);
      }
    }

  } catch (error) {
    console.error('\n[FATAL ERROR]', error.message);
    process.exit(1);
  }
}

// Run the test
main().catch(console.error);
