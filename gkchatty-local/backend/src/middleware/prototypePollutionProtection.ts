import { Request, Response, NextFunction } from 'express';

/**
 * HIGH-007: Prototype Pollution Protection Middleware
 *
 * Prevents prototype pollution attacks by rejecting requests containing
 * dangerous property names like __proto__, constructor, or prototype.
 *
 * Prototype pollution can allow attackers to:
 * - Modify Object.prototype, affecting all objects in the application
 * - Bypass authentication or authorization
 * - Execute arbitrary code
 *
 * @see https://owasp.org/www-community/vulnerabilities/Prototype_Pollution
 */

// Dangerous keys that could pollute prototypes
const DANGEROUS_KEYS = ['__proto__', 'constructor', 'prototype'];

/**
 * Recursively check an object for dangerous keys
 */
const containsDangerousKeys = (obj: unknown, path = ''): string | null => {
  if (obj === null || typeof obj !== 'object') {
    return null;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const result = containsDangerousKeys(obj[i], `${path}[${i}]`);
      if (result) return result;
    }
    return null;
  }

  // Check object keys
  for (const key of Object.keys(obj)) {
    // Check if key itself is dangerous
    if (DANGEROUS_KEYS.includes(key.toLowerCase())) {
      return `${path}${path ? '.' : ''}${key}`;
    }

    // Recursively check nested objects
    const result = containsDangerousKeys(
      (obj as Record<string, unknown>)[key],
      `${path}${path ? '.' : ''}${key}`
    );
    if (result) return result;
  }

  return null;
};

/**
 * Middleware to protect against prototype pollution attacks
 */
export const prototypePollutionProtection = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Check request body
  if (req.body) {
    const dangerousPath = containsDangerousKeys(req.body, 'body');
    if (dangerousPath) {
      console.warn(
        `[Security] Prototype pollution attempt blocked - dangerous key at: ${dangerousPath}`,
        {
          ip: req.ip,
          path: req.path,
          method: req.method,
          correlationId: (req as unknown as Record<string, unknown>).reqId,
        }
      );
      res.status(400).json({
        success: false,
        error: 'Invalid request: contains prohibited property names',
      });
      return;
    }
  }

  // Check query parameters
  if (req.query) {
    const dangerousPath = containsDangerousKeys(req.query, 'query');
    if (dangerousPath) {
      console.warn(
        `[Security] Prototype pollution attempt blocked in query - dangerous key at: ${dangerousPath}`,
        {
          ip: req.ip,
          path: req.path,
          method: req.method,
          correlationId: (req as unknown as Record<string, unknown>).reqId,
        }
      );
      res.status(400).json({
        success: false,
        error: 'Invalid request: contains prohibited property names',
      });
      return;
    }
  }

  next();
};

export default prototypePollutionProtection;
