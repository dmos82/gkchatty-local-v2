import { Request, Response } from 'express';
import { SystemFolder, ISystemFolder } from '../models/SystemFolderModel';
import { SystemKbDocument } from '../models/SystemKbDocument';
import { getLogger } from '../utils/logger';

const log = getLogger('systemFolderController');

interface FolderNode {
  _id: string;
  name: string;
  type: 'folder' | 'file';
  parentId?: string | null;
  children?: FolderNode[];
  size?: number;
  mimeType?: string;
  uploadTimestamp?: string;
  path?: string;
  s3Key?: string;
  permissions?: {
    type: 'all' | 'admin' | 'specific-users';
    allowedUsers?: string[];
  };
}

// Build tree structure from flat data
const buildTree = (folders: ISystemFolder[], documents: Record<string, unknown>[]): FolderNode[] => {
  log.debug(
    '[buildTree] Starting with',
    folders.length,
    'folders and',
    documents.length,
    'documents'
  );
  const folderMap = new Map<string, FolderNode>();
  const rootFolders: FolderNode[] = [];

  // Create folder nodes
  folders.forEach(folder => {
    const node: FolderNode = {
      _id: folder._id.toString(),
      name: folder.name,
      type: 'folder',
      parentId: folder.parentId?.toString() || null,
      path: folder.path,
      children: [],
      permissions: folder.permissions ? {
        type: folder.permissions.type,
        allowedUsers: folder.permissions.allowedUsers?.map(id => id.toString()) || []
      } : undefined,
    };
    folderMap.set(node._id, node);
  });

  log.debug('[buildTree] Created folder nodes:', folderMap.size);

  // Build folder hierarchy
  folderMap.forEach(folder => {
    if (folder.parentId && folderMap.has(folder.parentId)) {
      const parent = folderMap.get(folder.parentId);
      if (parent && parent.children) {
        parent.children.push(folder);
      }
    } else if (!folder.parentId) {
      rootFolders.push(folder);
    }
  });

  log.debug('[buildTree] Root folders after hierarchy:', rootFolders.length);

  // Add documents to their folders
  let docsWithFolder = 0;
  let docsWithoutFolder = 0;
  let orphanedDocs = 0;

  documents.forEach(doc => {
    const fileName = doc.filename;

    if (!fileName) {
      log.debug('[buildTree] Warning: Document without name:', doc._id);
      return;
    }

    const node: FolderNode = {
      _id: (doc._id as { toString: () => string }).toString(),
      name: fileName as string,
      type: 'file',
      parentId: (doc.folderId as { toString: () => string } | undefined)?.toString() || null,
      size: doc.fileSize as number,
      mimeType: doc.mimeType as string,
      uploadTimestamp: (doc.createdAt as { toString: () => string } | undefined)?.toString(),
      s3Key: doc.s3Key as string,
    };

    if (node.parentId && folderMap.has(node.parentId)) {
      // Document has a valid parent folder - add to that folder
      const parent = folderMap.get(node.parentId);
      if (parent && parent.children) {
        parent.children.push(node);
        docsWithFolder++;
      }
    } else if (!node.parentId) {
      // Document has no folder - show at root
      rootFolders.push(node);
      docsWithoutFolder++;
    } else {
      // Document has parentId but folder doesn't exist (orphaned) - show at root
      log.debug(`[buildTree] Warning: Orphaned document ${fileName} - folder ${node.parentId} not found`);
      node.parentId = null; // Clear invalid parentId
      rootFolders.push(node);
      orphanedDocs++;
    }
  });

  log.debug(
    '[buildTree] Documents added - with folder:',
    docsWithFolder,
    'without folder:',
    docsWithoutFolder,
    'orphaned (auto-moved to root):',
    orphanedDocs
  );
  log.debug('[buildTree] Final root items:', rootFolders.length);

  // Sort function to order files before folders
  const sortChildren = (items: FolderNode[]): FolderNode[] => {
    return items.sort((a, b) => {
      // Files come before folders
      if (a.type === 'file' && b.type === 'folder') return -1;
      if (a.type === 'folder' && b.type === 'file') return 1;
      // Within same type, sort alphabetically
      return a.name.localeCompare(b.name);
    });
  };

  // Apply sorting recursively to all levels
  const applySorting = (nodes: FolderNode[]): FolderNode[] => {
    const sorted = sortChildren(nodes);
    sorted.forEach(node => {
      if (node.children && node.children.length > 0) {
        node.children = applySorting(node.children);
      }
    });
    return sorted;
  };

  const sortedTree = applySorting(rootFolders);
  log.debug('[buildTree] Tree sorted - final items:', sortedTree.length);

  return sortedTree;
};

// Get system folder tree
export const getSystemFolderTree = async (req: Request, res: Response) => {
  try {
    const userId = req.user?._id;
    const isAdmin = req.user?.role === 'admin';

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    log.info('getSystemFolderTree - User:', {
      userId: userId?.toString(),
      isAdmin,
    });

    // Fetch ALL system folders - visibility is not restricted
    // Permission checks happen when user tries to access document content
    const folders = await SystemFolder.find({}).sort({ name: 1 });

    // Fetch system documents
    const documents = (await SystemKbDocument.find({}).sort({ filename: 1 })) as unknown as Record<
      string,
      unknown
    >[];

    log.info('getSystemFolderTree - Results:', {
      foldersCount: folders.length,
      documentsCount: documents.length,
    });

    const tree = buildTree(folders, documents);

    log.info('getSystemFolderTree - Final tree structure:', {
      treeItemCount: tree.length,
    });

    return res.json({
      success: true,
      tree,
    });
  } catch (error: unknown) {
    log.error('Error fetching system folder tree:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch system folder tree',
    });
  }
};

// Create system folder
export const createSystemFolder = async (req: Request, res: Response) => {
  try {
    const userId = req.user?._id;
    const isAdmin = req.user?.role === 'admin';
    const { name, parentId } = req.body;

    if (!userId || !isAdmin) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    if (!name) {
      return res.status(400).json({ success: false, message: 'Folder name is required' });
    }

    // Validate parent folder exists if provided
    if (parentId) {
      const parentFolder = await SystemFolder.findById(parentId);

      if (!parentFolder) {
        return res.status(404).json({
          success: false,
          message: 'Parent folder not found',
        });
      }
    }

    // Create folder
    const folder = new SystemFolder({
      name,
      parentId: parentId || null,
      path: '/', // Will be updated by pre-save hook
      metadata: {
        createdBy: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    await folder.save();

    return res.status(201).json({
      success: true,
      folder: {
        _id: folder._id,
        name: folder.name,
        type: 'folder',
        parentId: folder.parentId,
        path: folder.path,
      },
    });
  } catch (error: unknown) {
    log.error('Error creating system folder:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create system folder',
    });
  }
};

// Rename system folder or file
export const renameSystemItem = async (req: Request, res: Response) => {
  try {
    const userId = req.user?._id;
    const isAdmin = req.user?.role === 'admin';
    const { itemId } = req.params;
    const { name } = req.body;

    if (!userId || !isAdmin) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    if (!name) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }

    // Check if it's a folder
    const folder = await SystemFolder.findById(itemId);

    if (folder) {
      folder.name = name;
      await folder.save();

      // Update paths of all child folders
      const childFolders = await SystemFolder.find({
        path: new RegExp(`^${folder.path}/`),
      });

      for (const child of childFolders) {
        await child.save(); // Triggers path rebuild
      }

      return res.json({
        success: true,
        message: 'Folder renamed successfully',
      });
    }

    // Check if it's a document
    const doc = await SystemKbDocument.findById(itemId);

    if (doc) {
      doc.filename = name;
      await doc.save();

      return res.json({
        success: true,
        message: 'File renamed successfully',
      });
    }

    return res.status(404).json({
      success: false,
      message: 'Item not found',
    });
  } catch (error: unknown) {
    log.error('Error renaming system item:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to rename item',
    });
  }
};

// Move system items
export const moveSystemItems = async (req: Request, res: Response) => {
  try {
    const userId = req.user?._id;
    const isAdmin = req.user?.role === 'admin';
    const { itemIds, targetFolderId } = req.body;

    if (!userId || !isAdmin) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    if (!itemIds || !Array.isArray(itemIds)) {
      return res.status(400).json({
        success: false,
        message: 'Item IDs are required',
      });
    }

    // Validate target folder if provided
    if (targetFolderId) {
      const targetFolder = await SystemFolder.findById(targetFolderId);

      if (!targetFolder) {
        return res.status(404).json({
          success: false,
          message: 'Target folder not found',
        });
      }
    }

    // Move folders
    const folders = await SystemFolder.find({
      _id: { $in: itemIds },
    });

    for (const folder of folders) {
      // Prevent moving folder into itself or its descendants
      if (targetFolderId) {
        const targetFolder = await SystemFolder.findById(targetFolderId);
        if (targetFolder && targetFolder.path.startsWith(folder.path)) {
          continue; // Skip this folder
        }
      }

      folder.parentId = targetFolderId || null;
      await folder.save();
    }

    // Move documents
    await SystemKbDocument.updateMany(
      {
        _id: { $in: itemIds },
      },
      {
        $set: { folderId: targetFolderId || null },
      }
    );

    return res.json({
      success: true,
      message: `${itemIds.length} item(s) moved successfully`,
    });
  } catch (error: unknown) {
    log.error('Error moving system items:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to move items',
    });
  }
};

// Delete system items
export const deleteSystemItems = async (req: Request, res: Response) => {
  try {
    const userId = req.user?._id;
    const isAdmin = req.user?.role === 'admin';
    const { itemIds } = req.body;

    if (!userId || !isAdmin) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    if (!itemIds || !Array.isArray(itemIds)) {
      return res.status(400).json({
        success: false,
        message: 'Item IDs are required',
      });
    }

    log.info('deleteSystemItems - Request details:', {
      userId: userId.toString(),
      itemIds,
    });

    // Find all folders to delete (including descendants)
    const foldersToDelete = await SystemFolder.find({ _id: { $in: itemIds } });

    const allFolderIds: string[] = [];

    for (const folder of foldersToDelete) {
      allFolderIds.push(folder._id.toString());

      // Find all descendant folders
      const descendants = await SystemFolder.find({
        path: new RegExp(`^${folder.path}/`),
      });

      allFolderIds.push(...descendants.map(d => d._id.toString()));
    }

    // Delete all folders
    if (allFolderIds.length > 0) {
      await SystemFolder.deleteMany({
        _id: { $in: allFolderIds },
      });

      // Delete all documents in these folders
      await SystemKbDocument.deleteMany({
        folderId: { $in: allFolderIds },
      });
    }

    // Delete documents that were directly selected
    const deleteResult = await SystemKbDocument.deleteMany({
      _id: { $in: itemIds },
    });

    log.info('deleteSystemItems - Delete results:', {
      foldersDeleted: allFolderIds.length,
      documentsDeleted: deleteResult.deletedCount,
    });

    return res.json({
      success: true,
      message: 'Items deleted successfully',
    });
  } catch (error: unknown) {
    log.error('Error deleting system items:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete items',
    });
  }
};

// Update system folder permissions
export const updateSystemFolderPermissions = async (req: Request, res: Response) => {
  try {
    console.log('[updateSystemFolderPermissions] CALLED - URL:', req.url);
    console.log('[updateSystemFolderPermissions] CALLED - params:', JSON.stringify(req.params));
    console.log('[updateSystemFolderPermissions] CALLED - body:', JSON.stringify(req.body));
    const { folderId } = req.params;
    console.log('[updateSystemFolderPermissions] folderId extracted:', folderId);
    const { permissionType, allowedUsers } = req.body;
    const userId = req.user?._id;
    const userRole = req.user?.role;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    // Only admins can update system folder permissions
    if (userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only administrators can update system folder permissions'
      });
    }

    // Validate permission type
    const validTypes = ['all', 'admin', 'specific-users'];
    if (!validTypes.includes(permissionType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid permission type. Must be one of: all, admin, specific-users'
      });
    }

    // If specific-users, validate allowedUsers array
    if (permissionType === 'specific-users') {
      if (!allowedUsers || !Array.isArray(allowedUsers) || allowedUsers.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'allowedUsers array is required when permission type is specific-users'
        });
      }

      // TODO: Validate that all user IDs exist in database
    }

    // Find and update the system folder
    const folder = await SystemFolder.findById(folderId);

    if (!folder) {
      return res.status(404).json({
        success: false,
        message: 'System folder not found'
      });
    }

    // Update permissions
    folder.permissions = {
      type: permissionType as 'all' | 'admin' | 'specific-users',
      allowedUsers: permissionType === 'specific-users' ? allowedUsers : undefined,
    };

    await folder.save();

    log.info(`System folder permissions updated for ${folderId} by user ${userId}`);

    return res.json({
      success: true,
      folder: {
        _id: folder._id,
        name: folder.name,
        permissions: folder.permissions,
      },
    });
  } catch (error: unknown) {
    log.error('Error updating system folder permissions:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update system folder permissions',
    });
  }
};
