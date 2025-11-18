import { Response, RequestHandler } from 'express';
import asyncHandler from 'express-async-handler';
import { RequestWithUser } from '../middleware/authMiddleware'; // Import the custom request type
import User from '../models/UserModel';

// @desc    Get user profile
// @route   GET /api/users/profile
// @access  Private
export const getUserProfile: RequestHandler = asyncHandler(
  async (req: RequestWithUser, res: Response) => {
    // req.user is attached by the 'protect' middleware
    const user = req.user;

    if (user) {
      // Remove return - asyncHandler handles sending the response
      res.json({
        _id: user._id,
        username: user.username,
        email: user.email,
        // Add other non-sensitive fields as needed
      });
    } else {
      res.status(404);
      throw new Error('User not found');
    }
  }
);

// @desc    Get all users (for permission picker)
// @route   GET /api/users
// @access  Private/Admin
export const getAllUsers: RequestHandler = asyncHandler(
  async (req: RequestWithUser, res: Response) => {
    const userRole = req.user?.role;

    // Only admins can get all users
    if (userRole !== 'admin') {
      res.status(403);
      throw new Error('Only administrators can access user list');
    }

    // Fetch all users, but only return necessary fields
    const users = await User.find({})
      .select('_id username email role')
      .sort({ username: 1 });

    res.json({
      success: true,
      users: users.map(user => ({
        _id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
      })),
    });
  }
);
