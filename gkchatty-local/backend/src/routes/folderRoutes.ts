import express from 'express';
import { protect, checkSession } from '../middleware/authMiddleware';
import {
  getFolderTree,
  createFolder,
  renameItem,
  moveItems,
  deleteItems,
  updateFolderPermissions,
} from '../controllers/folderController';

const router = express.Router();

// All folder routes require authentication
router.use(protect, checkSession);

// Get folder tree
router.get('/tree', getFolderTree);

// Create new folder
router.post('/', createFolder);

// Rename folder or file
router.patch('/:itemId/rename', renameItem);

// Move items
router.post('/move', moveItems);

// Delete items
router.post('/delete', deleteItems);

// Update folder permissions (admin only)
router.patch('/:folderId/permissions', updateFolderPermissions);

export default router;
