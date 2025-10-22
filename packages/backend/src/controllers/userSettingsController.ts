import { Request, Response, RequestHandler } from 'express';
import mongoose from 'mongoose';
import UserSettings from '../models/UserSettings';
import * as asyncHandlerModule from 'express-async-handler';
import { getLogger } from '../utils/logger';
import { saveFile } from '../utils/s3Helper';
import path from 'path';
import fs from 'fs';
import User from '../models/UserModel';

const asyncHandler = asyncHandlerModule.default || asyncHandlerModule;
// Create logger but use it in future updates
const log = getLogger('userSettingsController');

/**
 * @desc    Get settings for a specific user
 * @route   GET /api/admin/user-settings/:userId
 * @access  Private (Admin only)
 */
const getUserSettings: RequestHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params;
    const reqId = req.reqId;

    log.info({ reqId, userId, msg: 'Fetching user settings for specific user' });

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      log.warn({ reqId, userId, msg: 'Invalid user ID format provided' });
      res.status(400);
      throw new Error('Invalid user ID format');
    }

    try {
      const userSettings = await UserSettings.findOne({ userId });

      // Return empty settings if none exist yet
      if (!userSettings) {
        log.info({ reqId, userId, msg: 'No settings found for user, returning default values' });
        res.status(200).json({
          success: true,
          settings: {
            userId,
            customPrompt: null,
            iconUrl: null,
          },
        });
        return;
      }

      log.info({ reqId, userId, msg: 'Successfully fetched user settings' });
      res.status(200).json({
        success: true,
        settings: userSettings,
      });
    } catch (err) {
      log.error({ reqId, userId, err, msg: 'Error fetching user settings' });
      throw err;
    }
  }
);

/**
 * @desc    Get settings for all users
 * @route   GET /api/admin/user-settings
 * @access  Private (Admin only)
 */
const getAllUserSettings: RequestHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const reqId = req.reqId;
    const adminId = req.user?._id;

    log.info({ reqId, adminId, msg: 'Admin fetching all user settings' });

    try {
      const userSettings = await UserSettings.find().sort({ updatedAt: -1 });

      log.info({
        reqId,
        adminId,
        count: userSettings.length,
        msg: 'Successfully fetched all user settings',
      });
      res.status(200).json({
        success: true,
        settings: userSettings,
      });
    } catch (err) {
      log.error({ reqId, adminId, err, msg: 'Error fetching all user settings' });
      throw err;
    }
  }
);

/**
 * @desc    Update or create settings for a user
 * @route   PUT /api/admin/user-settings/:userId
 * @access  Private (Admin only)
 */
const updateUserSettings: RequestHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params;
    const { customPrompt, iconUrl } = req.body;
    const reqId = req.reqId;
    const adminId = req.user?._id;

    log.info({ reqId, adminId, userId, msg: 'Updating user settings' });

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      log.warn({ reqId, adminId, userId, msg: 'Invalid user ID format provided' });
      res.status(400);
      throw new Error('Invalid user ID format');
    }

    // Create an update object with only the fields that are provided
    const updateData: { customPrompt?: string; iconUrl?: string } = {};

    if (customPrompt !== undefined) {
      log.debug({ reqId, adminId, userId, msg: 'Including customPrompt in update' });
      updateData.customPrompt = customPrompt;
    }

    if (iconUrl !== undefined) {
      log.debug({ reqId, adminId, userId, msg: 'Including iconUrl in update' });
      updateData.iconUrl = iconUrl;
    }

    // If no fields were provided, return an error
    if (Object.keys(updateData).length === 0) {
      log.warn({ reqId, adminId, userId, msg: 'No valid fields provided for update' });
      res.status(400);
      throw new Error('No valid fields provided for update');
    }

    try {
      const updatedUserSettings = await UserSettings.findOneAndUpdate(
        { userId },
        { $set: updateData },
        {
          new: true,
          upsert: true,
          runValidators: true,
        }
      );

      log.info({
        reqId,
        adminId,
        userId,
        isNewDocument:
          updatedUserSettings.createdAt.getTime() === updatedUserSettings.updatedAt.getTime(),
        msg: 'Successfully updated user settings',
      });

      res.status(200).json({
        success: true,
        message: 'User settings updated successfully',
        settings: updatedUserSettings,
      });
    } catch (err) {
      log.error({ reqId, adminId, userId, err, msg: 'Error updating user settings' });
      throw err;
    }
  }
);

/**
 * @desc    Delete settings for a user
 * @route   DELETE /api/admin/user-settings/:userId
 * @access  Private (Admin only)
 */
const deleteUserSettings: RequestHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params;
    const reqId = req.reqId;
    const adminId = req.user?._id;

    log.info({ reqId, adminId, userId, msg: 'Attempting to delete user settings' });

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      log.warn({ reqId, adminId, userId, msg: 'Invalid user ID format provided' });
      res.status(400);
      throw new Error('Invalid user ID format');
    }

    try {
      const result = await UserSettings.findOneAndDelete({ userId });

      if (!result) {
        log.warn({ reqId, adminId, userId, msg: 'User settings not found for deletion' });
        res.status(404).json({
          success: false,
          message: 'User settings not found',
        });
        return;
      }

      log.info({ reqId, adminId, userId, msg: 'Successfully deleted user settings' });
      res.status(200).json({
        success: true,
        message: 'User settings deleted successfully',
      });
    } catch (err) {
      log.error({ reqId, adminId, userId, err, msg: 'Error deleting user settings' });
      throw err;
    }
  }
);

/**
 * @desc    Get current user's own settings (for authenticated user)
 * @route   GET /api/user/settings
 * @access  Private (Any authenticated user)
 */
const getOwnSettings: RequestHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?._id;
    const reqId = req.reqId;

    log.info({ reqId, userId, msg: 'User fetching their own settings' });

    if (!userId) {
      log.warn({ reqId, msg: 'Not authorized, no user ID found' });
      res.status(401);
      throw new Error('Not authorized, no user ID found');
    }

    try {
      const userSettings = await UserSettings.findOne({ userId });

      // Fetch persona flags from the User document
      const userFlags = await User.findById(userId).select('isPersonaEnabled canCustomizePersona');

      const personaEnabled = userFlags?.isPersonaEnabled || false;
      const canCustomizePersona = userFlags?.canCustomizePersona || false;

      // Return empty settings if none exist yet
      if (!userSettings) {
        log.info({ reqId, userId, msg: 'No settings found for user, returning default values' });
        res.status(200).json({
          success: true,
          settings: {
            userId,
            customPrompt: null,
            iconUrl: null,
            isPersonaEnabled: personaEnabled,
            canCustomizePersona: canCustomizePersona,
          },
        });
        return;
      }

      log.info({ reqId, userId, msg: 'Successfully fetched user settings' });
      res.status(200).json({
        success: true,
        settings: {
          ...userSettings.toObject(),
          isPersonaEnabled: personaEnabled,
          canCustomizePersona: canCustomizePersona,
        },
      });
    } catch (err) {
      log.error({ reqId, userId, err, msg: 'Error fetching user settings' });
      throw err;
    }
  }
);

/**
 * @desc    Update current user's own settings (custom prompt only)
 * @route   PUT /api/users/me/settings
 * @access  Private (Any authenticated user)
 */
const updateOwnSettings: RequestHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?._id;
    const { customPrompt, isPersonaEnabled } = req.body;
    const reqId = req.reqId;

    log.info({ reqId, userId, msg: 'User updating their own settings' });

    if (!userId) {
      log.warn({ reqId, msg: 'Not authorized, no user ID found' });
      res.status(401);
      throw new Error('Not authorized, no user ID found');
    }

    // Validate that customPrompt is a string or null
    if (customPrompt !== undefined && customPrompt !== null && typeof customPrompt !== 'string') {
      log.warn({ reqId, userId, msg: 'Invalid customPrompt format provided' });
      res.status(400);
      throw new Error('customPrompt must be a string or null');
    }

    // Validate isPersonaEnabled if provided
    if (isPersonaEnabled !== undefined && typeof isPersonaEnabled !== 'boolean') {
      log.warn({ reqId, userId, msg: 'Invalid isPersonaEnabled format provided' });
      res.status(400);
      throw new Error('isPersonaEnabled must be a boolean');
    }

    try {
      const updatedUserSettings = await UserSettings.findOneAndUpdate(
        { userId },
        { $set: { customPrompt } },
        {
          new: true,
          upsert: true,
          runValidators: true,
        }
      );

      // Also update isPersonaEnabled flag in User document if provided
      if (isPersonaEnabled !== undefined) {
        await User.findByIdAndUpdate(userId, { isPersonaEnabled }, { new: true });
      }

      // Fetch updated persona flags
      const userFlags = await User.findById(userId).select('isPersonaEnabled canCustomizePersona');

      res.status(200).json({
        success: true,
        message: 'Your settings were updated successfully',
        settings: {
          ...updatedUserSettings.toObject(),
          isPersonaEnabled: userFlags?.isPersonaEnabled || false,
          canCustomizePersona: userFlags?.canCustomizePersona || false,
        },
      });
    } catch (err) {
      log.error({ reqId, userId, err, msg: 'Error updating user settings' });
      throw err;
    }
  }
);

/**
 * @desc    Upload and set user's own icon
 * @route   POST /api/users/me/icon
 * @access  Private (Any authenticated user)
 */
const uploadOwnIcon: RequestHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?._id;
    const reqId = req.reqId;

    log.info({ reqId, userId, msg: 'User uploading their own icon' });

    if (!userId) {
      log.warn({ reqId, msg: 'Not authorized, no user ID found' });
      res.status(401);
      throw new Error('Not authorized, no user ID found');
    }

    // Check if file is present in the request
    if (!req.file) {
      log.warn({ reqId, userId, msg: 'No file uploaded' });
      res.status(400);
      throw new Error('Please upload an image file');
    }

    try {
      // Define file path for storage
      const userIdStr = userId.toString();
      const fileExtension = path.extname(req.file.originalname);
      const fileName = `user-icon-${Date.now()}${fileExtension}`;
      const filePath = `user_icons/${userIdStr}/${fileName}`;

      let iconUrl: string;

      // Check if S3 is enabled
      if (process.env.S3_ENABLED === 'true') {
        log.info({ reqId, userId, msg: 'Uploading icon to S3' });
        // Upload to S3
        iconUrl = await saveFile(
          filePath,
          req.file.buffer || (await fs.promises.readFile(req.file.path)),
          req.file.mimetype
        );
      } else {
        log.info({ reqId, userId, msg: 'Using local storage for icon' });
        // For local storage
        iconUrl = `/api/files/local/${encodeURIComponent(filePath)}`;

        // Save the file using the saveFile utility which handles both S3 and local
        await saveFile(
          filePath,
          req.file.buffer || (await fs.promises.readFile(req.file.path)),
          req.file.mimetype
        );
      }

      // Update user settings with the icon URL
      const updatedUserSettings = await UserSettings.findOneAndUpdate(
        { userId },
        { $set: { iconUrl } },
        {
          new: true,
          upsert: true,
          runValidators: true,
        }
      );

      log.info({
        reqId,
        userId,
        iconUrl,
        isNewDocument:
          updatedUserSettings.createdAt.getTime() === updatedUserSettings.updatedAt.getTime(),
        msg: 'Successfully updated user icon',
      });

      res.status(200).json({
        success: true,
        message: 'Your icon was uploaded and set successfully',
        settings: updatedUserSettings,
      });
    } catch (err) {
      log.error({ reqId, userId, err, msg: 'Error uploading user icon' });
      throw err;
    }
  }
);

export {
  getUserSettings,
  getAllUserSettings,
  updateUserSettings,
  deleteUserSettings,
  getOwnSettings,
  updateOwnSettings,
  uploadOwnIcon,
};
