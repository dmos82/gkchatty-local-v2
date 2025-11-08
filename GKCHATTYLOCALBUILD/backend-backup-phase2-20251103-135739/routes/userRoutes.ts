import express, { Request, Response, Router, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { protect, checkSession } from '../middleware/authMiddleware';
import { UserModel as User } from '../utils/modelFactory';
import { IUser } from '../models/UserModel'; // Import User model
import {
  getOwnSettings,
  updateOwnSettings,
  uploadOwnIcon,
} from '../controllers/userSettingsController';
// import {
//   getUserAccessibleKBs,
//   toggleKBAccess,
//   updateKBPreferences,
//   trackKBUsage,
//   getUserKBsWithDocuments,
//   getUserTenantKBDocuments,
// } from '../controllers/userKBController';
import { iconUpload } from '../config/multerConfig';
import { getLogger } from '../utils/logger';
import { validatePasswordMiddleware } from '../middleware/passwordValidation'; // MEDIUM-005
import { sanitizeInputMiddleware } from '../middleware/inputSanitization'; // MEDIUM-007

const router: Router = express.Router();
const logger = getLogger('userRoutes');

// Apply protect and checkSession middleware to subsequent routes if needed globally
// For specific protection, apply directly to the route
// router.use(protect, checkSession);

// GET /api/users/me/usage - Fetch usage data for the logged-in user
router.get(
  '/me/usage',
  protect,
  checkSession,
  async (req: Request, res: Response): Promise<void | Response> => {
    logger.debug('User usage endpoint accessed');
    const userId = req.user?._id;

    if (!userId) {
      // Should be caught by protect middleware, but double-check
      return res
        .status(401)
        .json({ success: false, message: 'Authentication error: User ID not found.' });
    }

    logger.info({ userId }, 'Fetching usage data for user');

    try {
      const user = await User.findById(userId)
        .select(
          'usageMonthMarker currentMonthPromptTokens currentMonthCompletionTokens currentMonthCost'
        ) // Select only usage fields
        .lean(); // Use lean() for performance as we don't need Mongoose document methods

      if (!user) {
        logger.warn({ userId }, 'User not found for usage data request');
        return res.status(404).json({ success: false, message: 'User not found.' });
      }

      const promptTokens = user.currentMonthPromptTokens || 0;
      const completionTokens = user.currentMonthCompletionTokens || 0;

      logger.info({ userId, promptTokens, completionTokens }, 'Successfully fetched usage data');
      return res.status(200).json({
        success: true,
        usageMonthMarker: user.usageMonthMarker || null,
        promptTokens: promptTokens,
        completionTokens: completionTokens,
        totalTokens: promptTokens + completionTokens,
        estimatedCost: user.currentMonthCost || 0,
      });
    } catch (error) {
      logger.error({ error, userId }, 'Error fetching usage data for user');
      return res.status(500).json({
        success: false,
        message: 'Error fetching user usage data.',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

// --- REMOVE PUT /api/users/me/profile Route ---
/*
router.put('/me/profile', protect, async (req: Request, res: Response): Promise<void> => {
  // ... entire route handler logic ...
});
*/

// User routes will be added here

// Example: GET /api/users/me (to get profile later)
// router.get('/me', protect, ...)

// Middleware to authorize access to persona-related endpoints
const authorizePersonaAccess = (req: Request, res: Response, next: NextFunction) => {
  if (req.user && (req.user.role === 'admin' || req.user.canCustomizePersona)) {
    return next();
  }
  logger.warn(
    {
      userId: req.user?.id,
      role: req.user?.role,
      canCustomizePersona: req.user?.canCustomizePersona,
    },
    'Forbidden persona access attempt'
  );
  return res.status(403).json({
    success: false,
    message: 'Forbidden: Insufficient permissions to access persona settings.',
  });
};

// GET /api/user/settings - Get the current user's settings
router.get('/settings', protect, checkSession, getOwnSettings);

// GET /api/users/me/settings - Get the current user's settings (explicitly for '/me' prefix)
router.get('/me/settings', protect, checkSession, authorizePersonaAccess, getOwnSettings);

// PUT /api/users/me/settings - Update current user's own settings (custom prompt)
router.put('/me/settings', protect, checkSession, authorizePersonaAccess, sanitizeInputMiddleware, updateOwnSettings); // MEDIUM-007

// Knowledge Base routes
// router.get('/knowledge-bases', protect, checkSession, getUserAccessibleKBs);
// router.put('/knowledge-bases/:kbId/toggle', protect, checkSession, toggleKBAccess);
// router.put('/knowledge-bases/preferences', protect, checkSession, updateKBPreferences);
// router.post('/knowledge-bases/:kbId/track-usage', protect, checkSession, trackKBUsage);

// POST /api/users/me/icon - Upload and set user's own icon
router.post(
  '/me/icon',
  protect,
  checkSession,
  authorizePersonaAccess,
  iconUpload.single('icon'),
  uploadOwnIcon
);

// PUT /api/users/me/password - Change own password
router.put(
  '/me/password',
  protect,
  checkSession,
  validatePasswordMiddleware, // MEDIUM-005: Validate new password strength
  async (req: Request, res: Response): Promise<void | Response> => {
    const { currentPassword, newPassword } = req.body;
    const user = req.user as (IUser & { _id: any }) | null;

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
    }

    logger.info({ username: user.username, userId: user._id }, 'User requesting password change');

    // Validation
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters long',
      });
    }

    try {
      // Fetch user with password field
      const userWithPassword = await User.findById(user._id).select('+password');

      if (!userWithPassword || !userWithPassword.password) {
        return res.status(500).json({
          success: false,
          message: 'User data incomplete',
        });
      }

      // Verify current password
      const isMatch = await bcrypt.compare(currentPassword, userWithPassword.password);

      if (!isMatch) {
        // MEDIUM-006: Enhanced security logging for failed password change
        logger.warn(
          {
            username: user.username,
            userId: user._id,
            ip: req.ip,
            userAgent: req.get('user-agent'),
            timestamp: new Date().toISOString(),
            event: 'FAILED_PASSWORD_CHANGE',
            reason: 'INCORRECT_CURRENT_PASSWORD',
          },
          'Security Event: Failed password change attempt - incorrect current password'
        );
        return res.status(401).json({
          success: false,
          message: 'Current password is incorrect',
        });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 12);

      // Update password and clear forcePasswordChange flag
      userWithPassword.password = hashedPassword;
      userWithPassword.forcePasswordChange = false;
      await userWithPassword.save();

      // MEDIUM-006: Enhanced security logging for successful password change
      logger.info(
        {
          username: user.username,
          userId: user._id,
          ip: req.ip,
          userAgent: req.get('user-agent'),
          timestamp: new Date().toISOString(),
          event: 'SUCCESSFUL_PASSWORD_CHANGE',
          wasForced: userWithPassword.forcePasswordChange === true,
        },
        'Security Event: User password changed successfully'
      );

      return res.status(200).json({
        success: true,
        message: 'Password changed successfully',
        forcePasswordChange: false,
      });
    } catch (error) {
      logger.error({ error, userId: user?._id }, 'Error changing password');
      return res.status(500).json({
        success: false,
        message: 'Failed to change password',
      });
    }
  }
);

/**
 * @route   GET /api/users/knowledge-bases-with-documents
 * @desc    Get all accessible knowledge bases with their documents
 * @access  Private
 */
// router.get('/knowledge-bases-with-documents', protect, checkSession, getUserKBsWithDocuments);

/**
 * @route   GET /api/users/tenant-kb/:kbId/documents
 * @desc    Get documents for a specific tenant knowledge base
 * @access  Private
 */
// router.get('/tenant-kb/:kbId/documents', protect, checkSession, getUserTenantKBDocuments);

export default router;
