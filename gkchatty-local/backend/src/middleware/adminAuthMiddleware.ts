import { Request, Response, NextFunction, RequestHandler } from 'express';
import { protect } from './authMiddleware'; // Assuming protect adds user to req

/**
 * SEC-004 FIX: Middleware to check admin role
 * Use with proper middleware composition: [protect, isAdmin]
 */
export const isAdmin: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  // req.user should be populated by protect middleware
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    console.warn(
      `[Admin Protect] Forbidden: User ${req.user?._id || 'unknown'} with role ${req.user?.role || 'unknown'} attempted admin access.`
    );
    res
      .status(403)
      .json({ success: false, message: 'Forbidden: Administrator access required.' });
  }
};

/**
 * SEC-004 FIX: Proper middleware composition
 * Use as: router.get('/admin-route', adminProtect, handler)
 * This is an array of middlewares that run in sequence
 */
export const adminProtect: RequestHandler[] = [protect, isAdmin];
