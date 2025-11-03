/**
 * Manual test script for Phase 7 error handling
 * Run with: node test-error-handling.js
 */

console.log('🧪 Testing Phase 7 Error Handling Implementation\n');

// Test 1: Error Classes
console.log('Test 1: Error Classes');
try {
  const {
    ProviderNotFoundError,
    NetworkError,
    CircuitBreaker,
    checkResources,
    FallbackChain
  } = require('./dist/services/embedding/errors');

  // Create a test error
  const error = new ProviderNotFoundError('test-provider', { test: true });
  console.log('✅ ProviderNotFoundError created:', error.message);
  console.log('   - Code:', error.code);
  console.log('   - Recoverable:', error.recoverable);
  console.log('   - Context:', JSON.stringify(error.context));
} catch (err) {
  console.log('❌ Error class test failed:', err.message);
}

// Test 2: Circuit Breaker
console.log('\nTest 2: Circuit Breaker');
try {
  const { CircuitBreaker } = require('./dist/services/embedding/retry');
  const breaker = new CircuitBreaker();

  console.log('✅ Circuit breaker created');
  console.log('   - Initial state:', breaker.getState());

  // Simulate failures
  for (let i = 0; i < 5; i++) {
    breaker.recordFailure();
  }
  console.log('   - After 5 failures:', breaker.getState());
  console.log('   - Is allowed?', breaker.isAllowed());

  // Reset
  breaker.reset();
  console.log('   - After reset:', breaker.getState());
} catch (err) {
  console.log('❌ Circuit breaker test failed:', err.message);
}

// Test 3: Resource Monitoring
console.log('\nTest 3: Resource Monitoring');
try {
  const {
    getDiskSpace,
    getMemoryInfo,
    checkResources
  } = require('./dist/services/embedding/resourceMonitor');

  const disk = getDiskSpace();
  console.log('✅ Disk space check:');
  console.log('   - Total:', disk.totalGB, 'GB');
  console.log('   - Free:', disk.freeGB, 'GB');
  console.log('   - Used:', disk.usedPercent.toFixed(1), '%');

  const memory = getMemoryInfo();
  console.log('✅ Memory check:');
  console.log('   - Total:', memory.totalMB, 'MB');
  console.log('   - Free:', memory.freeMB, 'MB');
  console.log('   - Used:', memory.usedPercent.toFixed(1), '%');

  const status = checkResources();
  console.log('✅ Resource status:');
  console.log('   - Disk status:', status.disk.status);
  console.log('   - Memory status:', status.memory.status);
} catch (err) {
  console.log('❌ Resource monitoring test failed:', err.message);
}

// Test 4: Retry Logic
console.log('\nTest 4: Retry Logic with Exponential Backoff');
try {
  const { withRetry } = require('./dist/services/embedding/retry');

  let attemptCount = 0;
  const testFunction = async () => {
    attemptCount++;
    if (attemptCount < 3) {
      throw new Error('Simulated failure');
    }
    return 'Success!';
  };

  console.log('✅ Starting retry test...');
  withRetry(testFunction, { maxAttempts: 3, initialDelayMs: 100 })
    .then(result => {
      console.log('   - Result:', result);
      console.log('   - Attempts needed:', attemptCount);
    })
    .catch(err => {
      console.log('   - Failed after retries:', err.message);
    });
} catch (err) {
  console.log('❌ Retry logic test failed:', err.message);
}

// Test 5: Error Normalization
console.log('\nTest 5: Error Normalization');
try {
  const { normalizeError } = require('./dist/services/embedding/errors');

  // Test network error
  const networkErr = { code: 'ECONNREFUSED', message: 'Connection refused' };
  const normalized = normalizeError(networkErr, 'test-provider');
  console.log('✅ Network error normalized:');
  console.log('   - Type:', normalized.name);
  console.log('   - Message:', normalized.message);
  console.log('   - Recoverable:', normalized.recoverable);

  // Test API error
  const apiErr = {
    response: {
      status: 429,
      statusText: 'Too Many Requests',
      headers: { 'retry-after': '60' }
    }
  };
  const normalizedApi = normalizeError(apiErr, 'openai');
  console.log('✅ API error normalized:');
  console.log('   - Type:', normalizedApi.name);
  console.log('   - Retry after:', normalizedApi.retryAfter, 'seconds');
} catch (err) {
  console.log('❌ Error normalization test failed:', err.message);
}

console.log('\n🎉 Phase 7 Error Handling Tests Complete!\n');
