import express, { Router } from 'express';
import { protect } from '../middleware/authMiddleware';
import { submitFeedback } from '../controllers/feedback.controller';
import { errorTypes } from '../utils/errorResponse';

const router: Router = express.Router();

// Apply authentication middleware to all feedback routes
router.use(protect);

/**
 * @route   POST /api/feedback
 * @desc    Submit new feedback
 * @access  Private (User)
 * @body    { feedbackText: string, chatId?: string }
 */
router.post('/', submitFeedback);

// Example of handling 405 Method Not Allowed using our error utilities
router.all('/', (req, res, next) => {
  if (req.method !== 'POST') {
    next(
      errorTypes.forbidden(
        `Method ${req.method} not allowed on this endpoint`,
        'METHOD_NOT_ALLOWED'
      )
    );
  } else {
    next();
  }
});

export default router;
