import express, { Router } from 'express';
import { getSystemPrompt, updateSystemPrompt } from '../controllers/settingsController';
import { protect, checkSession } from '../middleware/authMiddleware';
import { adminProtect } from '../middleware/adminAuthMiddleware';

const router: Router = express.Router();

// Apply protect and checkSession middleware to all settings routes
router.use(protect, checkSession);

// GET /api/settings - Get a specific setting (e.g., systemPrompt)
// NOTE: Route changed to /system-prompt to match controller function logic
router.get('/system-prompt', adminProtect, getSystemPrompt);

// PUT /api/settings/:key - Update a specific setting (e.g., systemPrompt)
// NOTE: Route changed to /system-prompt to match controller function logic
router.put('/system-prompt', adminProtect, updateSystemPrompt);

export default router;
