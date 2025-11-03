/**
 * GKChatty Local - Embedding Service Error Types
 *
 * Custom error classes for different failure scenarios in the embedding system.
 * Provides structured error handling with context and recovery suggestions.
 *
 * @module services/embedding/errors
 */

/**
 * Base error class for all embedding-related errors
 */
export class EmbeddingError extends Error {
  public readonly code: string;
  public readonly recoverable: boolean;
  public readonly context?: Record<string, any>;

  constructor(
    message: string,
    code: string,
    recoverable: boolean = true,
    context?: Record<string, any>
  ) {
    super(message);
    this.name = 'EmbeddingError';
    this.code = code;
    this.recoverable = recoverable;
    this.context = context;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      recoverable: this.recoverable,
      context: this.context,
      stack: this.stack,
    };
  }
}

/**
 * Provider not found or unavailable
 */
export class ProviderNotFoundError extends EmbeddingError {
  constructor(providerId: string, context?: Record<string, any>) {
    super(
      `Provider not found: ${providerId}`,
      'PROVIDER_NOT_FOUND',
      true,
      { providerId, ...context }
    );
    this.name = 'ProviderNotFoundError';
  }
}

/**
 * Provider initialization failed
 */
export class ProviderInitializationError extends EmbeddingError {
  constructor(providerId: string, reason: string, context?: Record<string, any>) {
    super(
      `Failed to initialize provider ${providerId}: ${reason}`,
      'PROVIDER_INIT_FAILED',
      true,
      { providerId, reason, ...context }
    );
    this.name = 'ProviderInitializationError';
  }
}

/**
 * Provider health check failed
 */
export class ProviderHealthCheckError extends EmbeddingError {
  constructor(providerId: string, reason: string, context?: Record<string, any>) {
    super(
      `Provider health check failed for ${providerId}: ${reason}`,
      'PROVIDER_UNHEALTHY',
      true,
      { providerId, reason, ...context }
    );
    this.name = 'ProviderHealthCheckError';
  }
}

/**
 * Network-related errors (timeouts, connection failures)
 */
export class NetworkError extends EmbeddingError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'NETWORK_ERROR', true, context);
    this.name = 'NetworkError';
  }
}

/**
 * API rate limit exceeded
 */
export class RateLimitError extends EmbeddingError {
  public readonly retryAfter?: number;

  constructor(providerId: string, retryAfter?: number, context?: Record<string, any>) {
    super(
      `Rate limit exceeded for provider ${providerId}`,
      'RATE_LIMIT_EXCEEDED',
      true,
      { providerId, retryAfter, ...context }
    );
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

/**
 * API authentication failed
 */
export class AuthenticationError extends EmbeddingError {
  constructor(providerId: string, context?: Record<string, any>) {
    super(
      `Authentication failed for provider ${providerId}`,
      'AUTH_FAILED',
      false, // Usually not recoverable without fixing API key
      { providerId, ...context }
    );
    this.name = 'AuthenticationError';
  }
}

/**
 * Model not found or unavailable
 */
export class ModelNotFoundError extends EmbeddingError {
  constructor(modelId: string, context?: Record<string, any>) {
    super(
      `Model not found: ${modelId}`,
      'MODEL_NOT_FOUND',
      false,
      { modelId, ...context }
    );
    this.name = 'ModelNotFoundError';
  }
}

/**
 * Model download failed
 */
export class ModelDownloadError extends EmbeddingError {
  constructor(modelId: string, reason: string, context?: Record<string, any>) {
    super(
      `Failed to download model ${modelId}: ${reason}`,
      'MODEL_DOWNLOAD_FAILED',
      true,
      { modelId, reason, ...context }
    );
    this.name = 'ModelDownloadError';
  }
}

/**
 * Insufficient disk space
 */
export class DiskSpaceError extends EmbeddingError {
  constructor(required: number, available: number, context?: Record<string, any>) {
    super(
      `Insufficient disk space. Required: ${required}GB, Available: ${available}GB`,
      'INSUFFICIENT_DISK_SPACE',
      false,
      { required, available, ...context }
    );
    this.name = 'DiskSpaceError';
  }
}

/**
 * Insufficient memory
 */
export class MemoryError extends EmbeddingError {
  constructor(required: number, available: number, context?: Record<string, any>) {
    super(
      `Insufficient memory. Required: ${required}MB, Available: ${available}MB`,
      'INSUFFICIENT_MEMORY',
      true, // May be recoverable by freeing memory
      { required, available, ...context }
    );
    this.name = 'MemoryError';
  }
}

/**
 * Invalid input provided to embedding function
 */
export class InvalidInputError extends EmbeddingError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'INVALID_INPUT', false, context);
    this.name = 'InvalidInputError';
  }
}

/**
 * Embedding generation timeout
 */
export class TimeoutError extends EmbeddingError {
  constructor(providerId: string, timeoutMs: number, context?: Record<string, any>) {
    super(
      `Embedding generation timed out after ${timeoutMs}ms for provider ${providerId}`,
      'TIMEOUT',
      true,
      { providerId, timeoutMs, ...context }
    );
    this.name = 'TimeoutError';
  }
}

/**
 * Provider-specific error
 */
export class ProviderError extends EmbeddingError {
  constructor(providerId: string, message: string, context?: Record<string, any>) {
    super(
      `Provider error (${providerId}): ${message}`,
      'PROVIDER_ERROR',
      true,
      { providerId, ...context }
    );
    this.name = 'ProviderError';
  }
}

/**
 * Configuration error
 */
export class ConfigurationError extends EmbeddingError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'CONFIGURATION_ERROR', false, context);
    this.name = 'ConfigurationError';
  }
}

/**
 * Type guard to check if error is an EmbeddingError
 */
export function isEmbeddingError(error: any): error is EmbeddingError {
  return error instanceof EmbeddingError;
}

/**
 * Type guard to check if error is recoverable
 */
export function isRecoverableError(error: any): boolean {
  if (isEmbeddingError(error)) {
    return error.recoverable;
  }
  return false;
}

/**
 * Extract error details for logging
 */
export function extractErrorDetails(error: any): Record<string, any> {
  if (isEmbeddingError(error)) {
    return {
      name: error.name,
      message: error.message,
      code: error.code,
      recoverable: error.recoverable,
      context: error.context,
    };
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    error: String(error),
  };
}

/**
 * Convert common errors to EmbeddingError
 */
export function normalizeError(error: any, providerId?: string): EmbeddingError {
  // Already an EmbeddingError
  if (isEmbeddingError(error)) {
    return error;
  }

  // Network errors
  if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
    return new NetworkError(error.message, { originalError: error.code });
  }

  // API errors
  if (error.response) {
    const status = error.response.status;

    if (status === 401 || status === 403) {
      return new AuthenticationError(providerId || 'unknown', {
        status,
        statusText: error.response.statusText,
      });
    }

    if (status === 429) {
      const retryAfter = error.response.headers?.['retry-after'];
      return new RateLimitError(providerId || 'unknown', retryAfter ? parseInt(retryAfter) : undefined, {
        status,
      });
    }

    if (status === 404) {
      return new ModelNotFoundError(providerId || 'unknown', {
        status,
        statusText: error.response.statusText,
      });
    }

    if (status >= 500) {
      return new NetworkError(`Server error: ${error.message}`, {
        status,
        statusText: error.response.statusText,
      });
    }
  }

  // Timeout errors
  if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
    return new TimeoutError(providerId || 'unknown', 30000, { originalError: error.message });
  }

  // Generic error
  return new ProviderError(providerId || 'unknown', error.message || String(error), {
    originalError: error,
  });
}
