import { Request, Response, NextFunction } from 'express';
import { validatePasswordStrength } from '../utils/passwordUtils';
import { getLogger } from '../utils/logger';

const logger = getLogger('passwordValidation');

/**
 * MEDIUM-005: Password Complexity Validation Middleware
 * 
 * This middleware enforces password complexity requirements to prevent weak passwords.
 * It integrates the existing validatePasswordStrength utility into the request pipeline.
 * 
 * Security Benefits:
 * - Enforces strong password requirements (uppercase, lowercase, numbers, special chars)
 * - Minimum 6 characters (can be increased)
 * - Prevents common weak passwords
 * - Provides clear error messages for user feedback
 * 
 * Compliance:
 * - OWASP ASVS 2.1.1: Password strength requirements
 * - NIST SP 800-63B: Authentication and Lifecycle Management
 * - CWE-521: Weak Password Requirements
 */

/**
 * Middleware to validate password strength for registration and password changes
 * 
 * Checks the request body for 'password' or 'newPassword' fields and validates
 * them against the strength requirements defined in passwordUtils.
 * 
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 */
export function validatePasswordMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Extract password from request body
  // Support both 'password' (registration) and 'newPassword' (password change)
  const password = req.body.password || req.body.newPassword;
  
  // If no password in request, skip validation (not all routes require passwords)
  if (!password) {
    return next();
  }
  
  // Log password validation attempt (without logging the actual password)
  logger.debug({
    path: req.path,
    method: req.method,
    hasPassword: !!password,
    passwordLength: password?.length,
  }, 'Validating password strength');
  
  // Validate password strength using existing utility
  const validation = validatePasswordStrength(password);
  
  if (!validation.isValid) {
    // MEDIUM-005: Enhanced security logging for weak password attempts
    logger.warn({
      ip: req.ip,
      userAgent: req.get('user-agent'),
      path: req.path,
      validationMessage: validation.message,
      event: 'WEAK_PASSWORD_REJECTED',
    }, 'Security Event: Weak password rejected');
    
    // Return 400 Bad Request with validation error
    res.status(400).json({
      success: false,
      message: validation.message,
      field: 'password',
    });
    return;
  }
  
  // Password is valid, proceed to next middleware
  logger.debug({
    path: req.path,
    event: 'PASSWORD_VALIDATED',
  }, 'Password validation passed');
  
  next();
}

/**
 * Feature flag for password validation
 * 
 * Set ENFORCE_PASSWORD_COMPLEXITY=false in environment to disable validation
 * Useful for:
 * - Development/testing
 * - Gradual rollout
 * - Backward compatibility during migration
 */
export function createPasswordValidationMiddleware(options?: {
  enforced?: boolean;
  auditOnly?: boolean;
}): (req: Request, res: Response, next: NextFunction) => void {
  const enforced = options?.enforced ?? process.env.ENFORCE_PASSWORD_COMPLEXITY !== 'false';
  const auditOnly = options?.auditOnly ?? false;
  
  return (req: Request, res: Response, next: NextFunction) => {
    const password = req.body.password || req.body.newPassword;
    
    if (!password) {
      return next();
    }
    
    const validation = validatePasswordStrength(password);
    
    if (!validation.isValid) {
      // Always log weak password attempts
      logger.warn({
        ip: req.ip,
        userAgent: req.get('user-agent'),
        path: req.path,
        validationMessage: validation.message,
        mode: auditOnly ? 'AUDIT_ONLY' : 'ENFORCED',
        event: 'WEAK_PASSWORD_DETECTED',
      }, auditOnly 
        ? 'Audit: Weak password detected (not enforced)'
        : 'Security Event: Weak password rejected'
      );
      
      // In audit-only mode, allow weak passwords but log them
      if (auditOnly || !enforced) {
        logger.info('Password validation in audit-only mode, allowing request');
        return next();
      }
      
      // Enforced mode: reject weak passwords
      res.status(400).json({
        success: false,
        message: validation.message,
        field: 'password',
      });
      return;
    }
    
    next();
  };
}

/**
 * Export both middleware variants:
 * - validatePasswordMiddleware: Simple, always-enforced version
 * - createPasswordValidationMiddleware: Configurable with feature flags
 */
export default validatePasswordMiddleware;
