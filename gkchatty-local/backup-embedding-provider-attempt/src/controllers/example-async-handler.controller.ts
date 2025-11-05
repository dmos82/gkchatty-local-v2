import { Request, Response } from 'express';
import asyncHandler from '../middleware/asyncHandler';
import { errorTypes } from '../utils/errorResponse';
import mongoose from 'mongoose';
import User from '../models/UserModel';

/**
 * Example controller demonstrating asyncHandler usage
 *
 * @desc    Get a user by ID
 * @route   GET /api/users/:userId
 * @access  Private
 */
export const getUser = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.params;

  // Input validation
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    // This will reject with an error that asyncHandler will catch
    throw errorTypes.badRequest('Invalid user ID format', 'INVALID_USER_ID');
  }

  // The following async operations won't need try-catch
  // Any error will be caught by asyncHandler and passed to the global error handler

  const user = await User.findById(userId);

  if (!user) {
    throw errorTypes.notFound('User not found', 'USER_NOT_FOUND');
  }

  // Success case
  res.status(200).json({
    success: true,
    data: {
      id: user._id,
      username: user.username,
      email: user.email,
      createdAt: user.createdAt,
    },
  });
});

/**
 * @desc    Process some data
 * @route   POST /api/process
 * @access  Private
 */
export const processData = asyncHandler(async (req: Request, res: Response) => {
  const { data } = req.body;

  if (!data) {
    throw errorTypes.badRequest('Data is required', 'MISSING_DATA');
  }

  // Process data...
  // Any errors in async operations are automatically caught

  res.status(200).json({
    success: true,
    message: 'Data processed successfully',
    result: { processedData: data },
  });
});
