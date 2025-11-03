/**
 * Unit tests for error handling classes
 */

import {
  EmbeddingError,
  ProviderNotFoundError,
  ProviderInitializationError,
  NetworkError,
  RateLimitError,
  AuthenticationError,
  ModelNotFoundError,
  TimeoutError,
  isEmbeddingError,
  isRecoverableError,
  extractErrorDetails,
  normalizeError,
} from '../errors';

describe('Error Classes', () => {
  describe('EmbeddingError', () => {
    it('should create error with all properties', () => {
      const error = new EmbeddingError('Test error', 'TEST_CODE', true, { foo: 'bar' });

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(EmbeddingError);
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.recoverable).toBe(true);
      expect(error.context).toEqual({ foo: 'bar' });
      expect(error.name).toBe('EmbeddingError');
    });

    it('should default to recoverable', () => {
      const error = new EmbeddingError('Test', 'CODE');
      expect(error.recoverable).toBe(true);
    });

    it('should serialize to JSON', () => {
      const error = new EmbeddingError('Test', 'CODE', false, { test: true });
      const json = error.toJSON();

      expect(json.name).toBe('EmbeddingError');
      expect(json.message).toBe('Test');
      expect(json.code).toBe('CODE');
      expect(json.recoverable).toBe(false);
      expect(json.context).toEqual({ test: true });
      expect(json.stack).toBeDefined();
    });
  });

  describe('ProviderNotFoundError', () => {
    it('should create with provider ID', () => {
      const error = new ProviderNotFoundError('test-provider');

      expect(error.message).toBe('Provider not found: test-provider');
      expect(error.code).toBe('PROVIDER_NOT_FOUND');
      expect(error.recoverable).toBe(true);
      expect(error.context?.providerId).toBe('test-provider');
    });

    it('should include additional context', () => {
      const error = new ProviderNotFoundError('test', { reason: 'not initialized' });

      expect(error.context).toEqual({
        providerId: 'test',
        reason: 'not initialized',
      });
    });
  });

  describe('RateLimitError', () => {
    it('should create with retry-after', () => {
      const error = new RateLimitError('openai', 60);

      expect(error.message).toContain('Rate limit exceeded');
      expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(error.retryAfter).toBe(60);
      expect(error.recoverable).toBe(true);
    });

    it('should work without retry-after', () => {
      const error = new RateLimitError('openai');

      expect(error.retryAfter).toBeUndefined();
      expect(error.recoverable).toBe(true);
    });
  });

  describe('AuthenticationError', () => {
    it('should be non-recoverable', () => {
      const error = new AuthenticationError('openai');

      expect(error.code).toBe('AUTH_FAILED');
      expect(error.recoverable).toBe(false);
      expect(error.message).toContain('Authentication failed');
    });
  });

  describe('TimeoutError', () => {
    it('should include timeout duration', () => {
      const error = new TimeoutError('test-provider', 5000);

      expect(error.message).toContain('5000ms');
      expect(error.code).toBe('TIMEOUT');
      expect(error.recoverable).toBe(true);
      expect(error.context?.timeoutMs).toBe(5000);
    });
  });
});

describe('Error Utilities', () => {
  describe('isEmbeddingError', () => {
    it('should return true for EmbeddingError instances', () => {
      const error = new EmbeddingError('Test', 'CODE');
      expect(isEmbeddingError(error)).toBe(true);
    });

    it('should return true for subclasses', () => {
      const error = new NetworkError('Test');
      expect(isEmbeddingError(error)).toBe(true);
    });

    it('should return false for generic Error', () => {
      const error = new Error('Test');
      expect(isEmbeddingError(error)).toBe(false);
    });

    it('should return false for non-errors', () => {
      expect(isEmbeddingError('string')).toBe(false);
      expect(isEmbeddingError(null)).toBe(false);
      expect(isEmbeddingError(undefined)).toBe(false);
    });
  });

  describe('isRecoverableError', () => {
    it('should return true for recoverable errors', () => {
      const error = new NetworkError('Test');
      expect(isRecoverableError(error)).toBe(true);
    });

    it('should return false for non-recoverable errors', () => {
      const error = new AuthenticationError('test');
      expect(isRecoverableError(error)).toBe(false);
    });

    it('should return false for generic errors', () => {
      const error = new Error('Test');
      expect(isRecoverableError(error)).toBe(false);
    });
  });

  describe('extractErrorDetails', () => {
    it('should extract EmbeddingError details', () => {
      const error = new NetworkError('Connection failed', { host: 'localhost' });
      const details = extractErrorDetails(error);

      expect(details.name).toBe('NetworkError');
      expect(details.message).toBe('Connection failed');
      expect(details.code).toBe('NETWORK_ERROR');
      expect(details.recoverable).toBe(true);
      expect(details.context).toEqual({ host: 'localhost' });
    });

    it('should extract generic Error details', () => {
      const error = new Error('Generic error');
      const details = extractErrorDetails(error);

      expect(details.name).toBe('Error');
      expect(details.message).toBe('Generic error');
      expect(details.stack).toBeDefined();
    });

    it('should handle non-Error values', () => {
      const details = extractErrorDetails('string error');
      expect(details.error).toBe('string error');
    });
  });

  describe('normalizeError', () => {
    it('should return EmbeddingError as-is', () => {
      const error = new NetworkError('Test');
      const normalized = normalizeError(error);

      expect(normalized).toBe(error);
    });

    it('should convert ECONNREFUSED to NetworkError', () => {
      const error = { code: 'ECONNREFUSED', message: 'Connection refused' };
      const normalized = normalizeError(error, 'test-provider');

      expect(normalized).toBeInstanceOf(NetworkError);
      expect(normalized.message).toBe('Connection refused');
    });

    it('should convert 401 response to AuthenticationError', () => {
      const error = {
        response: {
          status: 401,
          statusText: 'Unauthorized',
        },
      };
      const normalized = normalizeError(error, 'openai');

      expect(normalized).toBeInstanceOf(AuthenticationError);
      expect(normalized.context?.status).toBe(401);
    });

    it('should convert 429 response to RateLimitError', () => {
      const error = {
        response: {
          status: 429,
          headers: { 'retry-after': '60' },
        },
      };
      const normalized = normalizeError(error, 'openai');

      expect(normalized).toBeInstanceOf(RateLimitError);
      expect((normalized as RateLimitError).retryAfter).toBe(60);
    });

    it('should convert 404 response to ModelNotFoundError', () => {
      const error = {
        response: {
          status: 404,
          statusText: 'Not Found',
        },
      };
      const normalized = normalizeError(error, 'test-model');

      expect(normalized).toBeInstanceOf(ModelNotFoundError);
    });

    it('should convert 500+ response to NetworkError', () => {
      const error = {
        response: {
          status: 503,
          statusText: 'Service Unavailable',
        },
      };
      const normalized = normalizeError(error);

      expect(normalized).toBeInstanceOf(NetworkError);
      expect(normalized.message).toContain('Server error');
    });

    it('should convert timeout errors to TimeoutError', () => {
      const error = { code: 'ETIMEDOUT', message: 'Timeout' };
      const normalized = normalizeError(error, 'test');

      expect(normalized).toBeInstanceOf(TimeoutError);
    });

    it('should convert unknown errors to ProviderError', () => {
      const error = new Error('Unknown error');
      const normalized = normalizeError(error, 'test-provider');

      expect(normalized.code).toBe('PROVIDER_ERROR');
      expect(normalized.message).toContain('Unknown error');
    });
  });
});
