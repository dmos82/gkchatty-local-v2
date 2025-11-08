/**
 * Standard error response structure for API endpoints
 */
export interface ApiErrorResponse {
  success: false;
  message: string;
  code?: string;
  details?: any;
}

/**
 * Helper function to create a standard error response
 * @param message User-friendly error message
 * @param code Optional error code for client categorization (e.g., 'INVALID_INPUT', 'NOT_FOUND')
 * @param details Optional additional error details (omitted in production for security)
 * @returns Standardized error response object
 */
export const createErrorResponse = (
  message: string,
  code?: string,
  details?: any
): ApiErrorResponse => {
  // In production, we might want to omit the details
  const isProd = process.env.NODE_ENV === 'production';

  return {
    success: false,
    message,
    ...(code && { code }),
    ...(details && !isProd ? { details } : {}),
  };
};

/**
 * Custom error class that includes status code and optional error code
 */
export class ApiError extends Error {
  statusCode: number;
  code?: string;
  details?: any;

  constructor(message: string, statusCode: number, code?: string, details?: any) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;

    // Maintains proper stack trace for where our error was thrown
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Helper to create common HTTP error instances
 */
export const errorTypes = {
  badRequest: (message: string, code?: string, details?: any) =>
    new ApiError(message, 400, code || 'BAD_REQUEST', details),

  unauthorized: (message: string, code?: string, details?: any) =>
    new ApiError(message, 401, code || 'UNAUTHORIZED', details),

  forbidden: (message: string, code?: string, details?: any) =>
    new ApiError(message, 403, code || 'FORBIDDEN', details),

  notFound: (message: string, code?: string, details?: any) =>
    new ApiError(message, 404, code || 'NOT_FOUND', details),

  conflict: (message: string, code?: string, details?: any) =>
    new ApiError(message, 409, code || 'CONFLICT', details),

  serverError: (message: string, code?: string, details?: any) =>
    new ApiError(message, 500, code || 'SERVER_ERROR', details),
};
