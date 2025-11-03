/* eslint-disable quotes */
import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';
import User, { IUser } from '../models/UserModel'; // Assuming UserModel exports IUser

// Define the structure of the decoded JWT payload
interface DecodedUserPayload extends jwt.JwtPayload {
  // Extend jwt.JwtPayload to include standard claims like jti
  userId: string;
  _id?: string; // Add _id alias for userId to fix type errors
  username: string;
  email?: string; // Add email field to fix type errors
  iat: number; // Issued at timestamp
  exp: number; // Expiration timestamp
  role?: 'user' | 'admin'; // Added optional role
  jti?: string; // JWT ID claim
}

// Define the RequestWithUser interface
export interface RequestWithUser extends Request {
  user?: (IUser & { _id: any }) | DecodedUserPayload | null | undefined;
}

// --- Augment Express Request type ---
// This uses declaration merging to add a 'user' property to the Request object.
// It's best practice to put this in a dedicated types file (e.g., types/express/index.d.ts)
// but including it here for simplicity for now.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: (IUser & { _id: any }) | DecodedUserPayload | null; // Allow for Mongoose doc, payload, or null
    }
  }
}
// ------------------------------------

/**
 * Express middleware to protect routes by verifying JWT.
 * Extracts token from 'Authorization: Bearer <token>' header.
 * Verifies token and attaches user info (initially decoded payload, potentially full user) to req.user.
 */
export const protect = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction
): Promise<void | Response> => {
  // --- START DEBUG LOG ---
  console.log('\n--- MIDDLEWARE: protect ---');
  console.log('Path:', req.path);
  console.log('Params:', req.params);
  console.log('--------------------------\n');
  // --- END DEBUG LOG ---

  console.log('[Protect Middleware ENTRY] Path:', req.path); // Added ENTRY log
  let token: string | undefined;

  // Log headers and cookies for debugging
  console.log('[Protect Middleware] Headers:', JSON.stringify(req.headers));
  console.log('[Protect Middleware] Cookies:', req.cookies);

  // First try to get token from HttpOnly cookie
  if (req.cookies?.authToken) {
    token = req.cookies.authToken;
    console.log(
      '[Protect Middleware] Token found in cookie:',
      token ? `${token.substring(0, 15)}...` : 'NONE'
    );
  }
  // Fallback to Authorization header for backward compatibility
  else {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
      console.log(
        '[Protect Middleware] Token found in header:',
        token ? `${token.substring(0, 15)}...` : 'NONE'
      );
    } else {
      console.log('[Protect Middleware] No token found in cookie or auth header.');
    }
  }

  if (!token) {
    console.log('[Protect Middleware] REJECTING: No token provided in cookie or header.');
    console.log('[Protect Middleware EXIT - sending error] Path:', req.path, 'Error: No token');
    return res.status(401).json({ message: 'Not authorized, no token' });
  }

  try {
    // Validate JWT_SECRET is configured
    const verificationSecret = process.env.JWT_SECRET;
    if (!verificationSecret) {
      console.error('[Auth] JWT_SECRET not configured');
      throw new Error('Server configuration error: Verification key missing.');
    }

    // Verify token
    const decoded = jwt.verify(token, verificationSecret) as DecodedUserPayload;
    // Add _id as an alias for userId for easier type compatibility
    decoded._id = decoded.userId;
    console.log('[Protect Middleware] Token VERIFIED. Decoded payload:', JSON.stringify(decoded));

    // ---> ADD LOG BEFORE DB CALL <---
    console.log(`[Protect Middleware] Attempting to find user by ID: ${decoded.userId}`);

    // Get user from the token ID and attach to request
    // Select necessary fields explicitly, excluding password
    const userFromDb = await User.findById(decoded.userId).select(
      '_id username email role activeSessionIds forcePasswordChange'
    );

    // ---> ADD LOG AFTER DB CALL (Check if user exists) <---
    if (!userFromDb) {
      console.log(
        `[Protect Middleware] REJECTING: User with ID ${decoded.userId} not found in DB.`
      );
      // Use 401 as the user identified by the token doesn't exist
      console.log(
        '[Protect Middleware EXIT - sending error] Path:',
        req.path,
        `Error: User ${decoded.userId} not found`
      ); // Added EXIT log
      return res.status(401).json({ message: 'Not authorized, user not found' });
    }
    console.log('[Protect Middleware] User found in DB. Attaching to req.user...');

    req.user = userFromDb; // Attach the full user document (minus password)

    // ---> ADD DISTINCT LOG BEFORE next() <---
    console.log('[Protect Middleware] User attached. Preparing to call next().');
    console.log('[Protect Middleware EXIT - calling next()] Path:', req.path); // Added EXIT log
    next(); // Proceed to the next middleware/route handler
  } catch (error: any) {
    // Log specific JWT errors
    console.error('[Protect Middleware] REJECTING: Token verification failed.', error.message);
    // Use 401 for any token validation failure
    console.log(
      '[Protect Middleware EXIT - sending error] Path:',
      req.path,
      'Error: Token verification failed',
      error.message
    ); // Added EXIT log
    res.status(401).json({ message: 'Not authorized, token failed', error: error.message }); // Optionally include error message
  }
};

/**
 * Middleware to check if the authenticated user has the 'admin' role.
 * Must be used AFTER the 'protect' middleware.
 */
export const isAdmin = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    // Check req.user exists and has role property with value 'admin'
    // Need type assertion or check because req.user might be DecodedUserPayload if DB fetch fails (though protect should handle that)
    const user = req.user as (IUser & { _id: any }) | null | undefined;

    if (user && user.role === 'admin') {
      console.log(
        `[isAdmin Middleware] Access GRANTED for admin user ${user.username} (ID: ${user._id}) to ${req.originalUrl}`
      );
      next(); // User is admin, proceed
    } else {
      console.warn(
        `[isAdmin Middleware] Access DENIED: User ${user?._id || 'unknown'} with role ${user?.role || 'none'} tried to access admin route ${req.originalUrl}`
      );
      res.status(403).json({ message: 'Forbidden: Admin access required' });
    }
  } catch (error) {
    console.error('[isAdmin Middleware] Error:', error);
    res.status(500).json({ message: 'Internal server error during admin authorization check' });
  }
};

/**
 * Middleware to check if the current JWT's ID (jti) matches the user's activeSessionId.
 * Must be used AFTER the 'protect' middleware, which attaches the user document to req.user
 * and verifies the token initially.
 */
export const checkSession = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction
): Promise<void | Response> => {
  // --- START DEBUG LOG ---
  console.log('\n--- MIDDLEWARE: checkSession ---');
  console.log('Path:', req.path);
  console.log('Params:', req.params);
  console.log('-----------------------------\n');
  // --- END DEBUG LOG ---

  console.log('[checkSession Middleware ENTRY] Path:', req.path); // Added ENTRY log
  // 1. Ensure user is attached by 'protect' middleware
  // We need the full user document here, not just the decoded payload.
  // Type assertion is needed because req.user can be DecodedUserPayload or null.
  const userFromDb = req.user as (IUser & { _id: any }) | null | undefined;

  if (!userFromDb) {
    console.error(
      "[checkSession Middleware] REJECTING: No user object found on request. 'protect' middleware might have failed or wasn't used."
    );
    // Use 401 as this indicates an authentication issue (missing user context)
    console.log(
      '[checkSession Middleware EXIT - sending error] Path:',
      req.path,
      'Reason: User context missing'
    ); // Added EXIT log
    return res.status(401).json({ message: 'Not authorized, user context missing.' });
  }

  // 2. Extract JWT ID (jti) from the verified token (should still be accessible if needed,
  //    but ideally we rely on protect having verified it. Re-decoding is inefficient.
  //    Let's assume the token is available or re-verify if necessary, but it's better to
  //    pass the jti through or trust 'protect'. For now, let's re-verify for robustness,
  //    acknowledging the performance cost.

  let token: string | undefined;

  // Try to get token from cookie first
  if (req.cookies?.authToken) {
    token = req.cookies.authToken;
  }
  // Fallback to Authorization header
  else {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }
  }

  if (!token) {
    console.warn('[checkSession Middleware] REJECTING: No token found in cookie or header.');
    console.log(
      '[checkSession Middleware EXIT - sending error] Path:',
      req.path,
      'Reason: No token found'
    );
    return res.status(401).json({ message: 'Not authorized, no token.' });
  }

  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('[checkSession Middleware] FATAL ERROR: JWT_SECRET is not defined.');
      console.log(
        '[checkSession Middleware EXIT - sending error] Path:',
        req.path,
        'Reason: JWT_SECRET missing'
      ); // Added EXIT log
      return res.status(500).json({ message: 'Server configuration error' });
    }

    // Enhanced JWT_SECRET debug logging for checkSession
    console.log('[checkSession - JWT DEBUG] ===== JWT SESSION CHECK DEBUG INFO =====');
    console.log(`[checkSession - JWT DEBUG] Secret Length: ${jwtSecret.length}`);
    console.log(`[checkSession - JWT DEBUG] Secret First 5: ${jwtSecret.substring(0, 5)}`);
    console.log(`[checkSession - JWT DEBUG] Secret Last 5: ${jwtSecret.slice(-5)}`);
    console.log(
      `[checkSession - JWT DEBUG] Contains quotes: ${jwtSecret.includes('"') || jwtSecret.includes("'")}`
    );
    console.log(
      `[checkSession - JWT DEBUG] Has whitespace: ${jwtSecret.startsWith(' ') || jwtSecret.endsWith(' ')}`
    );
    console.log('[checkSession - JWT DEBUG] =========================================');

    const decoded = jwt.verify(token, jwtSecret, { ignoreExpiration: false }) as DecodedUserPayload;
    // Add _id as an alias for userId for type compatibility
    decoded._id = decoded.userId;
    const jti = decoded.jti;

    // 3. Compare JWT ID (jti) with user\'s activeSessionId
    // ---> ADD DETAILED LOGGING HERE <---
    console.log(
      `[checkSession Middleware] DATA FOR COMPARISON - User ID: ${userFromDb._id}, Username: ${userFromDb.username}`
    );
    console.log(
      `[checkSession Middleware] DATA FOR COMPARISON - Token JTI (from decoded token): >>${jti}<<`
    );
    console.log(
      `[checkSession Middleware] DATA FOR COMPARISON - DB activeSessionIds (from req.user): >>${JSON.stringify(userFromDb.activeSessionIds)}<<`
    );
    console.log(
      `[checkSession Middleware] Comparing Token JTI: ${jti} with DB activeSessionIds array`
    );

    if (!jti) {
      console.warn('[checkSession Middleware] REJECTING: Token is missing JWT ID (jti) claim.');
      console.log(
        '[checkSession Middleware EXIT - sending error] Path:',
        req.path,
        'Reason: Missing JTI'
      ); // Added EXIT log
      return res
        .status(401)
        .json({ message: 'Not authorized, invalid session token (missing jti).' });
    }

    if (!userFromDb.activeSessionIds || userFromDb.activeSessionIds.length === 0) {
      console.warn(
        `[checkSession Middleware] REJECTING: User ${userFromDb.username} has no active sessions in DB.`
      );
      // This could mean the user logged out, but the token is still valid. Reject.
      console.log(
        '[checkSession Middleware EXIT - sending error] Path:',
        req.path,
        'Reason: No activeSessionIds in DB'
      ); // Added EXIT log
      return res.status(401).json({ message: 'Not authorized, session not active or expired.' });
    }

    if (!userFromDb.activeSessionIds.includes(jti)) {
      console.warn(
        `[checkSession Middleware] REJECTING: Token JTI (${jti}) not found in active DB sessions (${JSON.stringify(userFromDb.activeSessionIds)}) for user ${userFromDb.username}.`
      );
      // This indicates the token belongs to an older session.
      console.log(
        '[checkSession Middleware EXIT - sending error] Path:',
        req.path,
        'Reason: JTI not in activeSessionIds array'
      ); // Added EXIT log
      return res.status(401).json({
        message: 'Not authorized, session expired or invalidated.',
        code: 'INVALID_SESSION',
      });
    }

    // 4. Session is valid, proceed
    console.log(
      `[checkSession Middleware] Session check PASSED for user ${userFromDb.username}. JTI found in activeSessionIds array.`
    );
    console.log('[checkSession Middleware EXIT - calling next()] Path:', req.path); // Added EXIT log
    next();
  } catch (error: any) {
    // Handle potential errors during token re-verification (e.g., expired token if ignoreExpiration wasn't true)
    console.error(
      '[checkSession Middleware] REJECTING: Error during token verification or session check:',
      error.message
    );
    // Use 401 for any failure during this check
    console.log(
      '[checkSession Middleware EXIT - sending error] Path:',
      req.path,
      'Reason: Exception during check',
      error.message
    ); // Added EXIT log
    res
      .status(401)
      .json({ message: 'Not authorized, session check failed.', error: error.message });
  }
};

/**
 * Middleware to check if a user needs to change their password.
 * Must be used AFTER the 'protect' middleware.
 * Allows access to password change endpoint even if forcePasswordChange is true.
 */
export const checkPasswordChangeRequired = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction
): Promise<void | Response> => {
  // Skip check for password change endpoints
  const passwordChangeEndpoints = ['/api/auth/change-password', '/api/users/me/password'];

  if (passwordChangeEndpoints.some(endpoint => req.path.includes(endpoint))) {
    return next();
  }

  // Get user from request (attached by protect middleware)
  const user = req.user as (IUser & { _id: any }) | null | undefined;

  // Check if user needs to change password
  if (user && user.forcePasswordChange) {
    console.log(
      `[CheckPasswordChange] User ${user.username} must change password before accessing ${req.path}`
    );
    return res.status(403).json({
      message: 'Password change required',
      code: 'PASSWORD_CHANGE_REQUIRED',
      forcePasswordChange: true,
    });
  }

  next();
};
