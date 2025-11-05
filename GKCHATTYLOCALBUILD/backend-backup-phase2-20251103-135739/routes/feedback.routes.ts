import express, { Router } from 'express';
import { submitFeedback } from '../controllers/feedback.controller';
import { protect, checkSession } from '../middleware/authMiddleware';

const router: Router = express.Router();

// Route to submit feedback
// POST /api/feedback
router.post('/', protect, checkSession, submitFeedback);

export default router;
