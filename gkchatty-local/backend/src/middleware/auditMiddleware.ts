import { Request, Response, NextFunction } from 'express';
import { logAuditEvent, AuditEventInput } from '../services/auditService';
import { AuditAction, AuditResource } from '../models/AuditLogModel';
import { RequestWithUser } from './authMiddleware';
import { v4 as uuidv4 } from 'uuid';

// Extend Request to include audit data
declare global {
  namespace Express {
    interface Request {
      auditCorrelationId?: string;
    }
  }
}

/**
 * Extract client IP address from request
 */
function getClientIP(req: Request): string {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    const ips = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor.split(',')[0];
    return ips.trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

/**
 * Get user agent from request
 */
function getUserAgent(req: Request): string {
  return req.headers['user-agent'] || '';
}

/**
 * Middleware to add correlation ID to requests
 */
export function correlationIdMiddleware(req: Request, _res: Response, next: NextFunction): void {
  req.auditCorrelationId = req.headers['x-correlation-id'] as string || uuidv4();
  next();
}

/**
 * Create an audit middleware for specific actions
 */
export function auditAction(
  action: AuditAction,
  resource: AuditResource,
  options: {
    getResourceId?: (req: RequestWithUser) => string | null;
    getDetails?: (req: RequestWithUser, res: Response) => Record<string, unknown>;
    logOnSuccess?: boolean;
    logOnFailure?: boolean;
  } = {}
) {
  const {
    getResourceId = () => null,
    getDetails = () => ({}),
    logOnSuccess = true,
    logOnFailure = true,
  } = options;

  return async function auditMiddleware(
    req: RequestWithUser,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    // Capture the original end function
    const originalEnd = res.end;
    const startTime = Date.now();

    // Override res.end to capture the response
    res.end = function (this: Response, ...args: Parameters<typeof res.end>) {
      const success = res.statusCode >= 200 && res.statusCode < 400;
      const shouldLog = (success && logOnSuccess) || (!success && logOnFailure);

      if (shouldLog) {
        const auditEvent: AuditEventInput = {
          userId: req.user?._id?.toString() || null,
          username: (req.user as { username?: string })?.username || null,
          action,
          resource,
          resourceId: getResourceId(req),
          details: {
            ...getDetails(req, res),
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            responseTimeMs: Date.now() - startTime,
          },
          ipAddress: getClientIP(req),
          userAgent: getUserAgent(req),
          sessionId: (req.user as { jti?: string })?.jti || null,
          success,
          errorMessage: success ? null : `HTTP ${res.statusCode}`,
          correlationId: req.auditCorrelationId || null,
        };

        // Log asynchronously - don't block response
        logAuditEvent(auditEvent).catch((err) => {
          console.error('Failed to log audit event:', err);
        });
      }

      // Call the original end function
      return originalEnd.apply(this, args);
    } as typeof res.end;

    next();
  };
}

/**
 * Pre-built audit middlewares for common actions
 */
export const auditLogin = auditAction('LOGIN', 'USER', {
  getDetails: (req) => ({
    username: req.body?.username,
  }),
  logOnSuccess: true,
  logOnFailure: true,
});

export const auditLoginFailed = auditAction('LOGIN_FAILED', 'USER', {
  getDetails: (req) => ({
    username: req.body?.username,
    reason: 'Invalid credentials',
  }),
  logOnSuccess: false,
  logOnFailure: true,
});

export const auditLogout = auditAction('LOGOUT', 'USER', {
  logOnSuccess: true,
  logOnFailure: false,
});

export const auditChatQuery = auditAction('CHAT_QUERY', 'CHAT', {
  getDetails: (req) => ({
    queryLength: req.body?.message?.length || 0,
    knowledgeBaseTarget: req.body?.knowledgeBaseTarget,
  }),
});

export const auditDocumentUpload = auditAction('DOCUMENT_UPLOADED', 'DOCUMENT', {
  getResourceId: (req) => req.params?.id || null,
  getDetails: (req) => ({
    filename: (req as Request & { file?: { originalname: string } }).file?.originalname,
  }),
});

export const auditDocumentDelete = auditAction('DOCUMENT_DELETED', 'DOCUMENT', {
  getResourceId: (req) => req.params?.id || null,
});

export const auditUserCreated = auditAction('USER_CREATED', 'USER', {
  getResourceId: (req) => req.body?.username || null,
  getDetails: (req) => ({
    newUsername: req.body?.username,
    role: req.body?.role,
  }),
});

export const auditUserUpdated = auditAction('USER_UPDATED', 'USER', {
  getResourceId: (req) => req.params?.id || null,
});

export const auditUserDeleted = auditAction('USER_DELETED', 'USER', {
  getResourceId: (req) => req.params?.id || null,
});

export const auditSettingsUpdated = auditAction('SETTINGS_UPDATED', 'SETTINGS', {
  getDetails: (req) => ({
    settingsChanged: Object.keys(req.body || {}),
  }),
});

export const auditFeatureToggle = auditAction('FEATURE_TOGGLE_CHANGED', 'FEATURE', {
  getResourceId: (req) => req.params?.feature || null,
  getDetails: (req) => ({
    feature: req.params?.feature,
    enabled: req.body?.enabled,
  }),
});

export const auditAdminAction = auditAction('ADMIN_ACTION', 'SYSTEM', {
  getDetails: (req) => ({
    adminAction: req.path,
  }),
});

/**
 * Log a manual audit event (for use outside of middleware)
 */
export async function logManualAuditEvent(
  req: RequestWithUser,
  action: AuditAction,
  resource: AuditResource,
  options: {
    resourceId?: string | null;
    details?: Record<string, unknown>;
    success?: boolean;
    errorMessage?: string | null;
  } = {}
): Promise<void> {
  const auditEvent: AuditEventInput = {
    userId: req.user?._id?.toString() || null,
    username: (req.user as { username?: string })?.username || null,
    action,
    resource,
    resourceId: options.resourceId || null,
    details: options.details || {},
    ipAddress: getClientIP(req),
    userAgent: getUserAgent(req),
    sessionId: (req.user as { jti?: string })?.jti || null,
    success: options.success !== undefined ? options.success : true,
    errorMessage: options.errorMessage || null,
    correlationId: req.auditCorrelationId || null,
  };

  await logAuditEvent(auditEvent);
}
