#!/usr/bin/env ts-node
/**
 * Rate Limit Testing Script
 * Tests all rate limiting scenarios for gkchatty-local
 *
 * Usage: pnpm test:rate-limits
 */

import axios, { AxiosError } from 'axios';
import colors from 'colors';

const API_BASE = process.env.API_BASE_URL || 'http://localhost:4001';

interface TestResult {
  endpoint: string;
  limit: string;
  totalRequests: number;
  successCount: number;
  rateLimitedCount: number;
  timeElapsed: number;
  limitHitAt?: number;
}

interface TestUser {
  username: string;
  password: string;
  token?: string;
}

// Color themes
const success = (text: string) => colors.green(text);
const error = (text: string) => colors.red(text);
const warning = (text: string) => colors.yellow(text);
const info = (text: string) => colors.cyan(text);
const header = (text: string) => colors.bold.white(text);

// Test users
const testUsers: TestUser[] = [
  { username: 'davidmorinmusic', password: '123123' },
  { username: 'testuser1', password: 'test123' },
  { username: 'testuser2', password: 'test123' },
];

/**
 * Login and get JWT token
 */
async function login(user: TestUser): Promise<string | null> {
  try {
    const response = await axios.post(`${API_BASE}/api/auth/login`, {
      username: user.username,
      password: user.password,
    });
    return response.data.token;
  } catch (err) {
    console.log(error(`Failed to login as ${user.username}`));
    return null;
  }
}

/**
 * Test standard endpoint rate limit (100 req/15min per user)
 */
async function testStandardEndpoint(token: string): Promise<TestResult> {
  console.log(header('\n📊 Testing Standard Endpoint Rate Limit (100 req/15min)'));
  console.log(info('Endpoint: GET /api/embeddings/providers'));

  const startTime = Date.now();
  let successCount = 0;
  let rateLimitedCount = 0;
  let limitHitAt: number | undefined;
  const totalRequests = 110; // Test beyond limit

  for (let i = 1; i <= totalRequests; i++) {
    try {
      await axios.get(`${API_BASE}/api/embeddings/providers`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      successCount++;
      process.stdout.write(success('.'));
    } catch (err) {
      const axiosErr = err as AxiosError;
      if (axiosErr.response?.status === 429) {
        rateLimitedCount++;
        if (!limitHitAt) limitHitAt = i;
        process.stdout.write(error('X'));
      } else {
        process.stdout.write(warning('?'));
      }
    }

    // Progress indicator every 10 requests
    if (i % 10 === 0) process.stdout.write(` ${i}`);
  }

  const timeElapsed = Date.now() - startTime;
  console.log('\n');

  return {
    endpoint: 'GET /api/embeddings/providers',
    limit: '100 req/15min per user',
    totalRequests,
    successCount,
    rateLimitedCount,
    timeElapsed,
    limitHitAt,
  };
}

/**
 * Test AI endpoint rate limit (30 req/min shared)
 */
async function testAIEndpoint(token: string): Promise<TestResult> {
  console.log(header('\n🤖 Testing AI Endpoint Rate Limit (30 req/min shared)'));
  console.log(info('Endpoint: POST /api/chat'));

  const startTime = Date.now();
  let successCount = 0;
  let rateLimitedCount = 0;
  let limitHitAt: number | undefined;
  const totalRequests = 35; // Test beyond limit

  for (let i = 1; i <= totalRequests; i++) {
    try {
      await axios.post(
        `${API_BASE}/api/chat`,
        { message: 'test', mode: 'system-kb' },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      successCount++;
      process.stdout.write(success('.'));
    } catch (err) {
      const axiosErr = err as AxiosError;
      if (axiosErr.response?.status === 429) {
        rateLimitedCount++;
        if (!limitHitAt) limitHitAt = i;
        process.stdout.write(error('X'));
      } else {
        process.stdout.write(warning('?'));
      }
    }

    if (i % 5 === 0) process.stdout.write(` ${i}`);
  }

  const timeElapsed = Date.now() - startTime;
  console.log('\n');

  return {
    endpoint: 'POST /api/chat',
    limit: '30 req/min shared',
    totalRequests,
    successCount,
    rateLimitedCount,
    timeElapsed,
    limitHitAt,
  };
}

/**
 * Test auth endpoint rate limit (10 req/15min)
 */
async function testAuthEndpoint(): Promise<TestResult> {
  console.log(header('\n🔐 Testing Auth Endpoint Rate Limit (10 req/15min)'));
  console.log(info('Endpoint: POST /api/auth/login'));

  const startTime = Date.now();
  let successCount = 0;
  let rateLimitedCount = 0;
  let limitHitAt: number | undefined;
  const totalRequests = 15; // Test beyond limit

  for (let i = 1; i <= totalRequests; i++) {
    try {
      await axios.post(`${API_BASE}/api/auth/login`, {
        username: 'testuser999',
        password: 'wrongpassword',
      });
      successCount++;
      process.stdout.write(success('.'));
    } catch (err) {
      const axiosErr = err as AxiosError;
      if (axiosErr.response?.status === 429) {
        rateLimitedCount++;
        if (!limitHitAt) limitHitAt = i;
        process.stdout.write(error('X'));
      } else if (axiosErr.response?.status === 401) {
        // Expected - invalid credentials
        successCount++;
        process.stdout.write(success('.'));
      } else {
        process.stdout.write(warning('?'));
      }
    }

    if (i % 5 === 0) process.stdout.write(` ${i}`);
  }

  const timeElapsed = Date.now() - startTime;
  console.log('\n');

  return {
    endpoint: 'POST /api/auth/login',
    limit: '10 req/15min per IP',
    totalRequests,
    successCount,
    rateLimitedCount,
    timeElapsed,
    limitHitAt,
  };
}

/**
 * Test concurrent users scenario (50+ users)
 */
async function testConcurrentUsers(tokens: string[]): Promise<TestResult> {
  console.log(header('\n👥 Testing Concurrent Users (50+ users simulation)'));
  console.log(info(`Simulating ${tokens.length} users making 20 requests each`));

  const startTime = Date.now();
  let successCount = 0;
  let rateLimitedCount = 0;
  const requestsPerUser = 20;
  const totalRequests = tokens.length * requestsPerUser;

  // Create concurrent requests from all users
  const promises = tokens.flatMap((token, userIndex) =>
    Array(requestsPerUser)
      .fill(0)
      .map(async (_, reqIndex) => {
        try {
          await axios.get(`${API_BASE}/api/embeddings/providers`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          successCount++;
          process.stdout.write(success('.'));
          return true;
        } catch (err) {
          const axiosErr = err as AxiosError;
          if (axiosErr.response?.status === 429) {
            rateLimitedCount++;
            process.stdout.write(error('X'));
            return false;
          }
          process.stdout.write(warning('?'));
          return false;
        }
      })
  );

  await Promise.all(promises);

  const timeElapsed = Date.now() - startTime;
  console.log('\n');

  return {
    endpoint: 'GET /api/embeddings/providers (concurrent)',
    limit: '100 req/15min per user',
    totalRequests,
    successCount,
    rateLimitedCount,
    timeElapsed,
  };
}

/**
 * Print test results
 */
function printResults(results: TestResult[]) {
  console.log(header('\n╔════════════════════════════════════════════════════════════════╗'));
  console.log(header('║                    RATE LIMIT TEST RESULTS                     ║'));
  console.log(header('╚════════════════════════════════════════════════════════════════╝\n'));

  results.forEach((result) => {
    const passRate = ((result.successCount / result.totalRequests) * 100).toFixed(1);
    const limitRate = ((result.rateLimitedCount / result.totalRequests) * 100).toFixed(1);

    console.log(info(`Endpoint: ${result.endpoint}`));
    console.log(`  Limit:          ${result.limit}`);
    console.log(`  Total Requests: ${result.totalRequests}`);
    console.log(success(`  ✅ Success:     ${result.successCount} (${passRate}%)`));
    console.log(error(`  ❌ Rate Limited: ${result.rateLimitedCount} (${limitRate}%)`));

    if (result.limitHitAt) {
      console.log(warning(`  ⚠️  Limit hit at request #${result.limitHitAt}`));
    }

    console.log(`  ⏱️  Time elapsed: ${(result.timeElapsed / 1000).toFixed(2)}s`);
    console.log('');
  });

  // Overall summary
  const totalRequests = results.reduce((sum, r) => sum + r.totalRequests, 0);
  const totalSuccess = results.reduce((sum, r) => sum + r.successCount, 0);
  const totalLimited = results.reduce((sum, r) => sum + r.rateLimitedCount, 0);
  const totalTime = results.reduce((sum, r) => sum + r.timeElapsed, 0);

  console.log(header('═══════════════════════════════════════════════════════════════'));
  console.log(header('OVERALL SUMMARY'));
  console.log(header('═══════════════════════════════════════════════════════════════'));
  console.log(`Total Requests:    ${totalRequests}`);
  console.log(success(`✅ Total Success:  ${totalSuccess}`));
  console.log(error(`❌ Total Limited:  ${totalLimited}`));
  console.log(`⏱️  Total Time:     ${(totalTime / 1000).toFixed(2)}s\n`);
}

/**
 * Main test runner
 */
async function main() {
  console.log(header('\n╔════════════════════════════════════════════════════════════════╗'));
  console.log(header('║          GKCHATTY RATE LIMIT TESTING SUITE                     ║'));
  console.log(header('║          Insurance Company - 50+ User Deployment               ║'));
  console.log(header('╚════════════════════════════════════════════════════════════════╝\n'));

  console.log(info(`🔗 Testing against: ${API_BASE}\n`));

  // Login test user
  console.log(header('🔐 Authenticating test user...'));
  const token = await login(testUsers[0]);

  if (!token) {
    console.log(error('❌ Failed to authenticate. Ensure backend is running and credentials are correct.'));
    console.log(info('   Expected user: davidmorinmusic / 123123'));
    process.exit(1);
  }

  console.log(success('✅ Authentication successful\n'));

  // Run all tests
  const results: TestResult[] = [];

  try {
    // Test 1: Standard endpoint
    results.push(await testStandardEndpoint(token));

    // Wait 2 seconds between tests
    console.log(info('⏳ Waiting 2 seconds before next test...\n'));
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test 2: Auth endpoint
    results.push(await testAuthEndpoint());

    console.log(info('⏳ Waiting 2 seconds before next test...\n'));
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test 3: AI endpoint (optional - only if you want to test it)
    // Uncomment to enable:
    // results.push(await testAIEndpoint(token));
    // console.log(info('⏳ Waiting 2 seconds before next test...\n'));
    // await new Promise(resolve => setTimeout(resolve, 2000));

    // Test 4: Concurrent users (if multiple users are available)
    if (testUsers.length > 1) {
      console.log(header('🔐 Authenticating additional test users...'));
      const tokens = await Promise.all(
        testUsers.map(async (user) => {
          const userToken = await login(user);
          if (userToken) console.log(success(`✅ ${user.username} authenticated`));
          return userToken;
        })
      );

      const validTokens = tokens.filter((t): t is string => t !== null);

      if (validTokens.length > 1) {
        results.push(await testConcurrentUsers(validTokens));
      }
    }

    // Print results
    printResults(results);

    console.log(success('✅ Rate limit testing complete!\n'));

  } catch (err) {
    console.log(error(`\n❌ Test suite failed: ${err}`));
    process.exit(1);
  }
}

// Run tests
main().catch(console.error);
