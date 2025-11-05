#!/usr/bin/env ts-node
/**
 * Insurance Company Load Testing
 * Simulates realistic workload: 15 active customers making 20 queries each per day
 *
 * Usage: NODE_ENV=production ts-node scripts/test-insurance-load.ts
 */

import axios, { AxiosError } from 'axios';
import colors from 'colors';

const API_BASE = process.env.API_BASE_URL || 'http://localhost:4001';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

interface LoadTestResult {
  scenario: string;
  totalUsers: number;
  activeUsers: number;
  queriesPerUser: number;
  totalQueries: number;
  successfulQueries: number;
  rateLimitedQueries: number;
  failedQueries: number;
  avgResponseTime: number;
  maxResponseTime: number;
  minResponseTime: number;
  timeElapsed: number;
}

// Color themes
const success = (text: string) => colors.green(text);
const error = (text: string) => colors.red(text);
const warning = (text: string) => colors.yellow(text);
const info = (text: string) => colors.cyan(text);
const header = (text: string) => colors.bold.white(text);

/**
 * Login user and get token
 */
async function login(username: string, password: string): Promise<string | null> {
  try {
    const response = await axios.post(`${API_BASE}/api/auth/login`, {
      username,
      password,
    });
    return response.data.token;
  } catch (err) {
    return null;
  }
}

/**
 * Make a query to the embeddings endpoint (simulates checking available AI providers)
 */
async function makeQuery(token: string): Promise<{ success: boolean; responseTime: number; status: number }> {
  const startTime = Date.now();

  try {
    await axios.get(`${API_BASE}/api/embeddings/providers`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    return {
      success: true,
      responseTime: Date.now() - startTime,
      status: 200,
    };
  } catch (err) {
    const axiosErr = err as AxiosError;
    return {
      success: false,
      responseTime: Date.now() - startTime,
      status: axiosErr.response?.status || 0,
    };
  }
}

/**
 * Simulate realistic insurance company workload
 */
async function simulateInsuranceWorkload(): Promise<LoadTestResult> {
  const totalUsers = 50;
  const activeUsers = 15; // 15 customers active during peak hours
  const queriesPerUser = 20; // Average queries per active user per day
  const totalQueries = activeUsers * queriesPerUser; // 300 total queries

  console.log(header('\n╔════════════════════════════════════════════════════════════════╗'));
  console.log(header('║         INSURANCE COMPANY WORKLOAD SIMULATION                  ║'));
  console.log(header('╚════════════════════════════════════════════════════════════════╝\n'));

  console.log(info(`Environment: ${IS_PRODUCTION ? 'PRODUCTION' : 'DEVELOPMENT'}`));
  console.log(info(`API Base: ${API_BASE}`));
  console.log(info(`Total Users: ${totalUsers} (insurance employees)`));
  console.log(info(`Active Users: ${activeUsers} (customers with queries today)`));
  console.log(info(`Queries/User: ${queriesPerUser} (average per day)`));
  console.log(info(`Total Queries: ${totalQueries}\n`));

  if (!IS_PRODUCTION) {
    console.log(warning('⚠️  WARNING: Running in DEVELOPMENT mode'));
    console.log(warning('   Rate limits are relaxed. Set NODE_ENV=production for realistic testing.\n'));
  }

  // Step 1: Authenticate active users
  console.log(header('🔐 Step 1: Authenticating active users...'));
  const tokens: { username: string; token: string }[] = [];

  for (let i = 1; i <= activeUsers; i++) {
    const username = `testuser${i}`;
    const token = await login(username, 'test123');

    if (token) {
      tokens.push({ username, token });
      process.stdout.write(success('.'));
    } else {
      process.stdout.write(error('X'));
    }
  }

  console.log(`\n✅ Authenticated ${tokens.length}/${activeUsers} users\n`);

  if (tokens.length === 0) {
    console.log(error('❌ No users authenticated. Ensure test users exist.'));
    console.log(info('   Run: pnpm create-test-users\n'));
    process.exit(1);
  }

  // Step 2: Simulate queries
  console.log(header('📊 Step 2: Simulating workload...\n'));
  console.log(info('Legend: . = success | X = rate limited | ? = other error\n'));

  const startTime = Date.now();
  let successfulQueries = 0;
  let rateLimitedQueries = 0;
  let failedQueries = 0;
  const responseTimes: number[] = [];

  // Simulate queries from all users concurrently (realistic peak load)
  const promises = tokens.flatMap(({ username, token }) =>
    Array(queriesPerUser)
      .fill(0)
      .map(async (_, queryIndex) => {
        const result = await makeQuery(token);
        responseTimes.push(result.responseTime);

        if (result.success) {
          successfulQueries++;
          process.stdout.write(success('.'));
        } else if (result.status === 429) {
          rateLimitedQueries++;
          process.stdout.write(error('X'));
        } else {
          failedQueries++;
          process.stdout.write(warning('?'));
        }

        // Show progress every 20 queries
        const total = successfulQueries + rateLimitedQueries + failedQueries;
        if (total % 20 === 0) {
          process.stdout.write(` ${total}`);
        }
      })
  );

  await Promise.all(promises);
  const timeElapsed = Date.now() - startTime;

  console.log('\n');

  // Calculate statistics
  const avgResponseTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
  const maxResponseTime = Math.max(...responseTimes);
  const minResponseTime = Math.min(...responseTimes);

  return {
    scenario: 'Insurance Company Daily Load',
    totalUsers,
    activeUsers: tokens.length,
    queriesPerUser,
    totalQueries,
    successfulQueries,
    rateLimitedQueries,
    failedQueries,
    avgResponseTime,
    maxResponseTime,
    minResponseTime,
    timeElapsed,
  };
}

/**
 * Print results
 */
function printResults(result: LoadTestResult) {
  console.log(header('╔════════════════════════════════════════════════════════════════╗'));
  console.log(header('║                    LOAD TEST RESULTS                           ║'));
  console.log(header('╚════════════════════════════════════════════════════════════════╝\n'));

  console.log(info(`Scenario: ${result.scenario}`));
  console.log(`  Total Users: ${result.totalUsers}`);
  console.log(`  Active Users: ${result.activeUsers}`);
  console.log(`  Queries/User: ${result.queriesPerUser}`);
  console.log(`  Total Queries: ${result.totalQueries}\n`);

  const successRate = ((result.successfulQueries / result.totalQueries) * 100).toFixed(1);
  const rateLimitRate = ((result.rateLimitedQueries / result.totalQueries) * 100).toFixed(1);
  const failureRate = ((result.failedQueries / result.totalQueries) * 100).toFixed(1);

  console.log(success(`✅ Successful: ${result.successfulQueries} (${successRate}%)`));
  console.log(error(`❌ Rate Limited: ${result.rateLimitedQueries} (${rateLimitRate}%)`));
  console.log(warning(`⚠️  Failed: ${result.failedQueries} (${failureRate}%)\n`));

  console.log(info('Response Times:'));
  console.log(`  Average: ${result.avgResponseTime.toFixed(2)}ms`);
  console.log(`  Min: ${result.minResponseTime}ms`);
  console.log(`  Max: ${result.maxResponseTime}ms\n`);

  console.log(info(`⏱️  Total Time: ${(result.timeElapsed / 1000).toFixed(2)}s\n`));

  // Verdict
  console.log(header('═══════════════════════════════════════════════════════════════'));
  console.log(header('VERDICT'));
  console.log(header('═══════════════════════════════════════════════════════════════\n'));

  if (result.rateLimitedQueries === 0 && result.failedQueries === 0) {
    console.log(success('✅ PASS: System handled workload without rate limiting'));
    console.log(info('   Rate limits are appropriate for 15 concurrent users making 20 queries each.\n'));
  } else if (result.rateLimitedQueries > 0) {
    console.log(error(`❌ RATE LIMITED: ${result.rateLimitedQueries} queries were rate limited`));
    console.log(warning('\n   Recommendations:'));
    console.log(warning('   1. Increase standard rate limit (currently 100 req/15min)'));
    console.log(warning('   2. Distribute queries over time instead of concurrent burst'));
    console.log(warning('   3. Implement queue system for non-urgent queries\n'));
  } else {
    console.log(warning('⚠️  PARTIAL: Some queries failed for reasons other than rate limiting'));
    console.log(info('   Check backend logs for details.\n'));
  }

  // Production readiness assessment
  if (IS_PRODUCTION) {
    console.log(header('PRODUCTION READINESS'));
    console.log(header('═══════════════════════════════════════════════════════════════\n'));

    const checks = [
      {
        name: 'Rate Limits',
        pass: result.rateLimitedQueries === 0,
        message: result.rateLimitedQueries === 0
          ? 'No queries rate limited'
          : `${result.rateLimitedQueries} queries rate limited`,
      },
      {
        name: 'Success Rate',
        pass: successRate === '100.0',
        message: `${successRate}% success rate`,
      },
      {
        name: 'Response Time',
        pass: result.avgResponseTime < 500,
        message: `${result.avgResponseTime.toFixed(2)}ms average (target: <500ms)`,
      },
    ];

    checks.forEach((check) => {
      const icon = check.pass ? success('✅') : error('❌');
      console.log(`${icon} ${check.name}: ${check.message}`);
    });

    const allPass = checks.every((c) => c.pass);
    console.log('');

    if (allPass) {
      console.log(success('🎉 READY FOR PRODUCTION DEPLOYMENT\n'));
    } else {
      console.log(error('⚠️  NOT READY - Address issues above before deployment\n'));
    }
  }
}

/**
 * Main test runner
 */
async function main() {
  try {
    const result = await simulateInsuranceWorkload();
    printResults(result);
  } catch (err) {
    console.error(error(`\n❌ Test failed: ${err}\n`));
    process.exit(1);
  }
}

main();
