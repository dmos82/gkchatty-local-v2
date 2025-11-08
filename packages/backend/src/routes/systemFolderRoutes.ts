import express from 'express';
import {
  getSystemFolderTree,
  createSystemFolder,
  renameSystemItem,
  moveSystemItems,
  deleteSystemItems,
} from '../controllers/systemFolderController';
import { protect, checkSession } from '../middleware/authMiddleware';

const router = express.Router();

// All system folder routes require admin authentication
// Applied via protect middleware which checks for admin role in controller

// Get system folder tree
router.get('/tree', protect, checkSession, getSystemFolderTree);

// Create system folder
router.post('/', protect, checkSession, createSystemFolder);

// Rename system folder or file
router.patch('/:itemId/rename', protect, checkSession, renameSystemItem);

// Move system items
router.post('/move', protect, checkSession, moveSystemItems);

// Delete system items
router.post('/delete', protect, checkSession, deleteSystemItems);

export default router;
