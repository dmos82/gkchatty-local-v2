import { Request, Response, NextFunction } from 'express';
import DOMPurify from 'isomorphic-dompurify';
import { getLogger } from '../utils/logger';

const logger = getLogger('inputSanitization');

/**
 * MEDIUM-007: Input Sanitization Middleware
 *
 * Prevents stored XSS attacks by sanitizing user-generated content
 * before it reaches the database or is returned to clients.
 *
 * Security Rationale:
 * - OWASP Top 10: A03:2021 - Injection (XSS)
 * - CWE-79: Improper Neutralization of Input During Web Page Generation
 * - CVSS 3.1 Base Score: 4.9 (MEDIUM)
 *
 * Sanitization Strategy:
 * - Uses DOMPurify to remove malicious HTML/JavaScript
 * - Preserves safe formatting (basic HTML tags)
 * - Applies to all text fields that may contain user content
 *
 * Fields Sanitized:
 * - customPrompt (user persona settings)
 * - username (on creation/update)
 * - displayName, bio, description (if added in future)
 *
 * Configuration:
 * - SANITIZATION_STRICT_MODE: Strip all HTML (env var, default: false)
 * - SANITIZATION_LOG_REMOVALS: Log sanitized content (env var, default: false)
 */

/**
 * DOMPurify configuration for safe HTML sanitization
 *
 * Allowed tags: Basic formatting only (p, br, strong, em, u)
 * Forbidden tags: script, iframe, object, embed, style, link, base
 * Forbidden attributes: All on* event handlers, javascript: URLs
 */
const ALLOWED_TAGS = ['p', 'br', 'strong', 'em', 'u', 'b', 'i'];
const ALLOWED_ATTR: string[] = []; // No attributes allowed for maximum security

/**
 * Sanitize a single string value
 */
function sanitizeString(value: string, fieldName: string): string {
  const strictMode = process.env.SANITIZATION_STRICT_MODE === 'true';
  const logRemovals = process.env.SANITIZATION_LOG_REMOVALS === 'true';

  const original = value;
  let sanitized: string;

  if (strictMode) {
    // Strict mode: Remove ALL HTML tags
    sanitized = DOMPurify.sanitize(value, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
  } else {
    // Standard mode: Allow basic formatting tags
    sanitized = DOMPurify.sanitize(value, {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
      KEEP_CONTENT: true, // Preserve text content even if tags are removed
    });
  }

  // Trim whitespace
  sanitized = sanitized.trim();

  // Log if content was modified
  if (logRemovals && original !== sanitized) {
    logger.warn({
      fieldName,
      original: original.substring(0, 100), // Limit log size
      sanitized: sanitized.substring(0, 100),
      event: 'CONTENT_SANITIZED',
    }, 'Security Event: Potentially malicious content removed during sanitization');
  }

  return sanitized;
}

/**
 * Recursively sanitize all string values in an object
 *
 * @param obj - Object to sanitize
 * @param path - Current path in object (for logging)
 */
function sanitizeObject(obj: any, path: string = 'body'): any {
  if (typeof obj === 'string') {
    return sanitizeString(obj, path);
  }

  if (Array.isArray(obj)) {
    return obj.map((item, index) => sanitizeObject(item, `${path}[${index}]`));
  }

  if (obj !== null && typeof obj === 'object') {
    const sanitized: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        sanitized[key] = sanitizeObject(obj[key], `${path}.${key}`);
      }
    }
    return sanitized;
  }

  return obj; // Return as-is for numbers, booleans, null, etc.
}

/**
 * Fields that should be sanitized (whitelist approach)
 *
 * Only explicitly listed fields will be sanitized to avoid
 * unintended side effects on structured data (JSON, etc.)
 */
const SANITIZABLE_FIELDS = [
  'customPrompt',
  'username',
  'displayName',
  'bio',
  'description',
  'title',
  'content',
  'message',
  'comment',
  'note',
] as const;

/**
 * Main sanitization middleware
 *
 * Sanitizes request body fields that may contain user-generated content.
 * Uses whitelist approach to only sanitize known text fields.
 */
export function sanitizeInputMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    // Only sanitize if there's a request body
    if (!req.body || typeof req.body !== 'object') {
      return next();
    }

    // Sanitize each whitelisted field if present
    for (const field of SANITIZABLE_FIELDS) {
      if (req.body[field] !== undefined && req.body[field] !== null) {
        if (typeof req.body[field] === 'string') {
          req.body[field] = sanitizeString(req.body[field], field);
        }
      }
    }

    next();
  } catch (error) {
    logger.error({ error }, 'Error during input sanitization');
    // Don't block the request on sanitization errors
    // Log and continue (sanitization is defense-in-depth)
    next();
  }
}

/**
 * Strict sanitization middleware for high-security endpoints
 *
 * Removes ALL HTML tags, not just dangerous ones.
 * Use for endpoints where HTML is never expected.
 */
export function strictSanitizeInputMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Temporarily set strict mode
  const originalStrictMode = process.env.SANITIZATION_STRICT_MODE;
  process.env.SANITIZATION_STRICT_MODE = 'true';

  sanitizeInputMiddleware(req, res, (err) => {
    // Restore original setting
    process.env.SANITIZATION_STRICT_MODE = originalStrictMode;

    if (err) {
      return next(err);
    }
    next();
  });
}

/**
 * Utility function to manually sanitize a string
 * For use in controllers/services where middleware isn't appropriate
 */
export function sanitize(input: string): string {
  return sanitizeString(input, 'manual');
}
