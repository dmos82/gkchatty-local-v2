#!/usr/bin/env node

/**
 * Load Testing Script for GKChatty
 * Simulates 50 concurrent users to test system capacity
 *
 * Usage:
 *   npm install axios dotenv
 *   node scripts/load-test-50-users.js
 *
 * Or with different user counts:
 *   node scripts/load-test-50-users.js 25
 *   node scripts/load-test-50-users.js 100
 */

const axios = require('axios');
require('dotenv').config();

// Configuration
const BASE_URL = process.env.API_URL || 'http://localhost:4001';
const TARGET_USERS = parseInt(process.argv[2]) || 50;
const RAMP_UP_TIME = 10000; // 10 seconds to ramp up to target users
const TEST_DURATION = 60000; // 60 seconds total test
const DELAY_BETWEEN_USERS = RAMP_UP_TIME / TARGET_USERS;

// Test credentials (you'll need to create test users first)
const TEST_USER_PREFIX = 'loadtest_user_';
const TEST_PASSWORD = 'LoadTest123!';  // Updated to match created users

// Statistics tracking
const stats = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  rateLimitErrors: 0,
  authErrors: 0,
  serverErrors: 0,
  responseTimes: [],
  startTime: null,
  endTime: null,
};

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

/**
 * Create a test user if it doesn't exist
 */
async function createTestUser(userId) {
  const username = `${TEST_USER_PREFIX}${userId}`;
  const email = `${username}@test.com`;

  try {
    await axios.post(`${BASE_URL}/api/auth/register`, {
      username,
      email,
      password: TEST_PASSWORD,
    });
    console.log(`${colors.green}✓${colors.reset} Created user: ${username}`);
  } catch (error) {
    if (error.response?.status === 409) {
      // User already exists, that's fine
      console.log(`${colors.yellow}↻${colors.reset} User exists: ${username}`);
    } else {
      console.error(`${colors.red}✗${colors.reset} Failed to create user ${username}:`, error.message);
    }
  }
}

/**
 * Authenticate a test user and get JWT token
 */
async function authenticateUser(userId) {
  const username = `${TEST_USER_PREFIX}${userId}`;

  try {
    const response = await axios.post(`${BASE_URL}/api/auth/login`, {
      username,
      password: TEST_PASSWORD,
    });

    return response.data.token;
  } catch (error) {
    console.error(`${colors.red}✗${colors.reset} Failed to authenticate ${username}:`, error.message);
    stats.authErrors++;
    return null;
  }
}

/**
 * Simulate a single user's chat behavior
 */
async function simulateUser(userId, token) {
  const username = `${TEST_USER_PREFIX}${userId}`;
  let requestCount = 0;

  // Create axios instance with auth header
  const api = axios.create({
    baseURL: BASE_URL,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    timeout: 30000, // 30 second timeout
  });

  // Simulate user behavior for the test duration
  const interval = setInterval(async () => {
    if (Date.now() - stats.startTime > TEST_DURATION) {
      clearInterval(interval);
      return;
    }

    const startTime = Date.now();
    requestCount++;

    try {
      // Make a chat request
      const response = await api.post('/api/chat', {
        messages: [
          {
            role: 'user',
            content: `Test message ${requestCount} from ${username} at ${new Date().toISOString()}`,
          },
        ],
      });

      const responseTime = Date.now() - startTime;
      stats.responseTimes.push(responseTime);
      stats.successfulRequests++;

      console.log(
        `${colors.green}✓${colors.reset} User ${userId}: Request ${requestCount} ` +
        `(${responseTime}ms)`
      );
    } catch (error) {
      const responseTime = Date.now() - startTime;
      stats.failedRequests++;

      if (error.response?.status === 429) {
        stats.rateLimitErrors++;
        console.log(
          `${colors.yellow}⚠${colors.reset} User ${userId}: Rate limited ` +
          `(retry after ${error.response.data.retryAfter}s)`
        );
      } else if (error.response?.status >= 500) {
        stats.serverErrors++;
        console.log(
          `${colors.red}✗${colors.reset} User ${userId}: Server error ${error.response.status}`
        );
      } else {
        console.log(
          `${colors.red}✗${colors.reset} User ${userId}: Error - ${error.message}`
        );
      }
    }

    stats.totalRequests++;
  }, 3000); // Each user makes a request every 3 seconds

  return interval;
}

/**
 * Main load test orchestrator
 */
async function runLoadTest() {
  console.log(`${colors.bright}${colors.cyan}═══════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}GKChatty Load Test - ${TARGET_USERS} Concurrent Users${colors.reset}`);
  console.log(`${colors.cyan}═══════════════════════════════════════════${colors.reset}\n`);

  console.log(`${colors.blue}Configuration:${colors.reset}`);
  console.log(`  API URL: ${BASE_URL}`);
  console.log(`  Target Users: ${TARGET_USERS}`);
  console.log(`  Ramp-up Time: ${RAMP_UP_TIME / 1000}s`);
  console.log(`  Test Duration: ${TEST_DURATION / 1000}s\n`);

  // Step 1: Create test users (SKIP if already created)
  console.log(`${colors.blue}Step 1: Checking/Creating test users...${colors.reset}`);
  console.log(`${colors.yellow}Assuming users already exist (created via create-load-test-users.js)${colors.reset}`);
  // const userCreationPromises = [];
  // for (let i = 1; i <= TARGET_USERS; i++) {
  //   userCreationPromises.push(createTestUser(i));
  // }
  // await Promise.all(userCreationPromises);
  console.log();

  // Step 2: Authenticate all users
  console.log(`${colors.blue}Step 2: Authenticating users...${colors.reset}`);
  const tokens = [];
  for (let i = 1; i <= TARGET_USERS; i++) {
    const token = await authenticateUser(i);
    if (token) {
      tokens.push({ userId: i, token });
    }
  }
  console.log(`Authenticated ${tokens.length}/${TARGET_USERS} users\n`);

  if (tokens.length === 0) {
    console.error(`${colors.red}No users authenticated. Aborting test.${colors.reset}`);
    return;
  }

  // Step 3: Start the load test
  console.log(`${colors.blue}Step 3: Starting load test...${colors.reset}`);
  stats.startTime = Date.now();

  const intervals = [];

  // Ramp up users gradually
  for (let i = 0; i < tokens.length; i++) {
    setTimeout(async () => {
      const { userId, token } = tokens[i];
      console.log(`${colors.cyan}▶${colors.reset} Starting user ${userId} (${i + 1}/${tokens.length})`);
      const interval = await simulateUser(userId, token);
      intervals.push(interval);
    }, i * DELAY_BETWEEN_USERS);
  }

  // Wait for test duration
  setTimeout(() => {
    stats.endTime = Date.now();

    // Stop all user simulations
    intervals.forEach(interval => clearInterval(interval));

    // Print results
    printResults();
  }, TEST_DURATION + RAMP_UP_TIME);
}

/**
 * Print test results
 */
function printResults() {
  const duration = (stats.endTime - stats.startTime) / 1000;
  const avgResponseTime =
    stats.responseTimes.length > 0
      ? (stats.responseTimes.reduce((a, b) => a + b, 0) / stats.responseTimes.length).toFixed(0)
      : 0;

  const p95ResponseTime =
    stats.responseTimes.length > 0
      ? stats.responseTimes.sort((a, b) => a - b)[Math.floor(stats.responseTimes.length * 0.95)]
      : 0;

  const successRate =
    stats.totalRequests > 0
      ? ((stats.successfulRequests / stats.totalRequests) * 100).toFixed(1)
      : 0;

  console.log(`\n${colors.cyan}═══════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}Load Test Results${colors.reset}`);
  console.log(`${colors.cyan}═══════════════════════════════════════════${colors.reset}\n`);

  console.log(`${colors.blue}Test Duration:${colors.reset} ${duration}s`);
  console.log(`${colors.blue}Target Users:${colors.reset} ${TARGET_USERS}\n`);

  console.log(`${colors.blue}Request Statistics:${colors.reset}`);
  console.log(`  Total Requests: ${stats.totalRequests}`);
  console.log(`  ${colors.green}Successful: ${stats.successfulRequests}${colors.reset}`);
  console.log(`  ${colors.red}Failed: ${stats.failedRequests}${colors.reset}`);
  console.log(`  ${colors.yellow}Rate Limited: ${stats.rateLimitErrors}${colors.reset}`);
  console.log(`  Auth Errors: ${stats.authErrors}`);
  console.log(`  Server Errors: ${stats.serverErrors}\n`);

  console.log(`${colors.blue}Performance Metrics:${colors.reset}`);
  console.log(`  Success Rate: ${successRate}%`);
  console.log(`  Avg Response Time: ${avgResponseTime}ms`);
  console.log(`  P95 Response Time: ${p95ResponseTime}ms`);
  console.log(`  Requests/Second: ${(stats.totalRequests / duration).toFixed(1)}\n`);

  // Verdict
  console.log(`${colors.bright}Verdict:${colors.reset}`);
  if (parseFloat(successRate) >= 95 && stats.rateLimitErrors === 0) {
    console.log(`${colors.green}✓ PASSED - System handled ${TARGET_USERS} users successfully!${colors.reset}`);
  } else if (parseFloat(successRate) >= 80) {
    console.log(`${colors.yellow}⚠ PARTIAL - System struggled but maintained ${successRate}% success rate${colors.reset}`);
  } else {
    console.log(`${colors.red}✗ FAILED - System could not handle ${TARGET_USERS} concurrent users${colors.reset}`);
    console.log(`${colors.red}  ${stats.rateLimitErrors} requests were rate limited${colors.reset}`);
  }

  console.log(`\n${colors.cyan}═══════════════════════════════════════════${colors.reset}\n`);

  // Exit
  process.exit(parseFloat(successRate) >= 80 ? 0 : 1);
}

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error(`${colors.red}Unhandled error:${colors.reset}`, error);
  process.exit(1);
});

// Run the test
runLoadTest().catch(console.error);