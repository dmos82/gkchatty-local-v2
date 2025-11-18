import { Response, RequestHandler } from 'express';
import asyncHandler from 'express-async-handler';
import { RequestWithUser } from '../middleware/authMiddleware'; // Import the custom request type

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
