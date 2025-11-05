import express, { Request, Response, Router } from 'express';
import User from '../models/UserModel';
import { protect, isAdmin } from '../middleware/authMiddleware';
import { getLogger } from '../utils/logger';

const router: Router = express.Router();
const logger = getLogger('adminRoutes');

// GET /api/admin/users - Fetch all users (Admin only)
router.get('/users', protect, isAdmin, async (req: Request, res: Response) => {
  try {
    // Find users and explicitly select fields needed for the admin view
    const users = await User.find({})
      .select('_id username email role createdAt')
      .sort({ createdAt: -1 });

    res.json({ success: true, users });
  } catch (error) {
    logger.error({ error }, 'Error fetching users in admin route');
    res.status(500).json({ success: false, message: 'Failed to fetch users.' });
  }
});

// ... other admin routes (e.g., for submissions) ...

export default router;
