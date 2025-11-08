/**
 * Unit tests for retry logic and circuit breaker
 */

import {
  CircuitBreaker,
  CircuitState,
  withRetry,
  DEFAULT_RETRY_CONFIG,
} from '../retry';
import { NetworkError, TimeoutError, AuthenticationError } from '../errors';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 1000,
      successThreshold: 2,
    });
  });

  describe('Initial State', () => {
    it('should start in CLOSED state', () => {
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      expect(breaker.isAllowed()).toBe(true);
    });

    it('should have zero failures', () => {
      const stats = breaker.getStats();
      expect(stats.failureCount).toBe(0);
      expect(stats.successCount).toBe(0);
    });
  });

  describe('State Transitions', () => {
    it('should transition to OPEN after threshold failures', () => {
      breaker.recordFailure();
      expect(breaker.getState()).toBe(CircuitState.CLOSED);

      breaker.recordFailure();
      expect(breaker.getState()).toBe(CircuitState.CLOSED);

      breaker.recordFailure();
      expect(breaker.getState()).toBe(CircuitState.OPEN);
      expect(breaker.isAllowed()).toBe(false);
    });

    it('should transition to HALF_OPEN after timeout', async () => {
      // Trip the circuit
      for (let i = 0; i < 3; i++) {
        breaker.recordFailure();
      }
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Should transition to HALF_OPEN on next check
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
      expect(breaker.isAllowed()).toBe(true);
    });

    it('should transition back to OPEN if failure in HALF_OPEN', async () => {
      // Trip and wait
      for (let i = 0; i < 3; i++) {
        breaker.recordFailure();
      }
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Now in HALF_OPEN
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

      // Fail again
      breaker.recordFailure();
      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });

    it('should transition to CLOSED after success threshold in HALF_OPEN', async () => {
      // Trip and wait
      for (let i = 0; i < 3; i++) {
        breaker.recordFailure();
      }
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Now in HALF_OPEN
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

      // Succeed twice
      breaker.recordSuccess();
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

      breaker.recordSuccess();
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe('Success Recording', () => {
    it('should decrement failure count on success in CLOSED', () => {
      breaker.recordFailure();
      breaker.recordFailure();

      let stats = breaker.getStats();
      expect(stats.failureCount).toBe(2);

      breaker.recordSuccess();
      stats = breaker.getStats();
      expect(stats.failureCount).toBe(1);
    });

    it('should not go below zero failures', () => {
      breaker.recordSuccess();
      const stats = breaker.getStats();
      expect(stats.failureCount).toBe(0);
    });
  });

  describe('Reset', () => {
    it('should reset all state', () => {
      for (let i = 0; i < 3; i++) {
        breaker.recordFailure();
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      breaker.reset();

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      const stats = breaker.getStats();
      expect(stats.failureCount).toBe(0);
      expect(stats.successCount).toBe(0);
      expect(stats.lastFailureTime).toBeNull();
    });
  });

  describe('Statistics', () => {
    it('should track failure count', () => {
      breaker.recordFailure();
      breaker.recordFailure();

      const stats = breaker.getStats();
      expect(stats.failureCount).toBe(2);
      expect(stats.lastFailureTime).not.toBeNull();
    });

    it('should track success count in HALF_OPEN', async () => {
      // Trip and wait
      for (let i = 0; i < 3; i++) {
        breaker.recordFailure();
      }
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Check state to trigger transition to HALF_OPEN
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

      breaker.recordSuccess();
      const stats = breaker.getStats();
      expect(stats.successCount).toBe(1);
    });
  });
});

describe('withRetry', () => {
  describe('Successful Operations', () => {
    it('should return result on first attempt', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const result = await withRetry(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('Retryable Errors', () => {
    it('should retry NetworkError', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new NetworkError('Connection failed'))
        .mockResolvedValueOnce('success');

      const result = await withRetry(fn, {
        maxAttempts: 2,
        initialDelayMs: 10,
        jitter: false,
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should retry TimeoutError', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new TimeoutError('test', 1000))
        .mockResolvedValueOnce('success');

      const result = await withRetry(fn, {
        maxAttempts: 2,
        initialDelayMs: 10,
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should respect maxAttempts', async () => {
      const fn = jest.fn().mockRejectedValue(new NetworkError('Always fails'));

      await expect(
        withRetry(fn, {
          maxAttempts: 3,
          initialDelayMs: 10,
        })
      ).rejects.toThrow('Always fails');

      expect(fn).toHaveBeenCalledTimes(3);
    });
  });

  describe('Non-Retryable Errors', () => {
    it('should not retry AuthenticationError', async () => {
      const fn = jest.fn().mockRejectedValue(new AuthenticationError('test'));

      await expect(
        withRetry(fn, { maxAttempts: 3, initialDelayMs: 10 })
      ).rejects.toThrow('Authentication failed');

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should not retry generic Error', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Generic'));

      await expect(
        withRetry(fn, { maxAttempts: 3, initialDelayMs: 10 })
      ).rejects.toThrow('Generic');

      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('Exponential Backoff', () => {
    it('should increase delay exponentially', async () => {
      const delays: number[] = [];
      const fn = jest.fn().mockRejectedValue(new NetworkError('Test'));

      const startTime = Date.now();
      try {
        await withRetry(fn, {
          maxAttempts: 3,
          initialDelayMs: 100,
          backoffMultiplier: 2,
          jitter: false,
        });
      } catch (error) {
        // Expected to fail
      }
      const totalTime = Date.now() - startTime;

      // Should take at least: 100ms + 200ms = 300ms
      // (delays between attempts, not including execution time)
      expect(totalTime).toBeGreaterThanOrEqual(290);
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should cap delay at maxDelayMs', async () => {
      const fn = jest.fn().mockRejectedValue(new NetworkError('Test'));

      const startTime = Date.now();
      try {
        await withRetry(fn, {
          maxAttempts: 4,
          initialDelayMs: 1000,
          maxDelayMs: 100, // Cap at 100ms
          backoffMultiplier: 2,
          jitter: false,
        });
      } catch (error) {
        // Expected
      }
      const totalTime = Date.now() - startTime;

      // Should be capped: 100ms + 100ms + 100ms = 300ms max
      expect(totalTime).toBeLessThan(500);
    });
  });

  describe('Timeout', () => {
    it('should timeout long-running operations', async () => {
      const fn = jest.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 5000))
      );

      await expect(
        withRetry(fn, {
          maxAttempts: 1,
          timeoutMs: 100,
        })
      ).rejects.toThrow(TimeoutError);
    });
  });

  describe('Custom Retry Logic', () => {
    it('should use custom shouldRetry function', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Custom'));

      const shouldRetry = jest.fn().mockReturnValue(true);

      try {
        await withRetry(fn, {
          maxAttempts: 2,
          initialDelayMs: 10,
          shouldRetry,
        });
      } catch (error) {
        // Expected
      }

      expect(shouldRetry).toHaveBeenCalled();
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });
});

describe('DEFAULT_RETRY_CONFIG', () => {
  it('should have sensible defaults', () => {
    expect(DEFAULT_RETRY_CONFIG.maxAttempts).toBe(3);
    expect(DEFAULT_RETRY_CONFIG.initialDelayMs).toBe(1000);
    expect(DEFAULT_RETRY_CONFIG.maxDelayMs).toBe(10000);
    expect(DEFAULT_RETRY_CONFIG.backoffMultiplier).toBe(2);
    expect(DEFAULT_RETRY_CONFIG.jitter).toBe(true);
    expect(DEFAULT_RETRY_CONFIG.timeoutMs).toBe(30000);
  });
});
