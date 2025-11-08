import { Request, Response } from 'express';
import { Folder, IFolder } from '../models/FolderModel';
import { UserDocument } from '../models/UserDocument';
import { SystemKbDocument } from '../models/SystemKbDocument';
import { getLogger } from '../utils/logger';

const log = getLogger('folderController');

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
}

// Build tree structure from flat data
const buildTree = (folders: IFolder[], documents: Record<string, unknown>[]): FolderNode[] => {
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

  documents.forEach(doc => {
    // Handle both UserDocument (originalFileName) and SystemKbDocument (filename)
    const fileName = doc.originalFileName || doc.filename;

    if (!fileName) {
      log.debug('[buildTree] Warning: Document without name:', doc._id);
      return;
    }

    const node: FolderNode = {
      _id: doc._id?.toString ? doc._id.toString() : String(doc._id),
      name: fileName as string,
      type: 'file',
      parentId: doc.folderId ? (typeof doc.folderId === 'string' ? doc.folderId : doc.folderId.toString()) : null,
      size: doc.fileSize as number || 0,
      mimeType: doc.mimeType as string || 'application/octet-stream',
      uploadTimestamp:
        doc.uploadTimestamp?.toString ? doc.uploadTimestamp.toString() :
        doc.createdAt?.toString ? doc.createdAt.toString() :
        new Date().toISOString(),
      s3Key: doc.s3Key as string || '',
    };

    if (node.parentId && folderMap.has(node.parentId)) {
      const parent = folderMap.get(node.parentId);
      if (parent && parent.children) {
        parent.children.push(node);
        docsWithFolder++;
      }
    } else {
      // Add to root if no parentId OR if parentId references non-existent folder (orphaned document)
      rootFolders.push(node);
      docsWithoutFolder++;
      if (node.parentId) {
        log.debug(
          `[buildTree] Document ${node.name} has folderId ${node.parentId} but folder not found - adding to root`
        );
      }
    }
  });

  log.debug(
    '[buildTree] Documents added - with folder:',
    docsWithFolder,
    'without folder:',
    docsWithoutFolder
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

// Get folder tree
export const getFolderTree = async (req: Request, res: Response) => {
  try {
    const userId = req.user?._id;
    const { knowledgeBase, sourceType } = req.query;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    // Build query
    const folderQuery: Record<string, unknown> = {};
    let docQuery: Record<string, unknown> = {};

    // For admin users, show system documents when no specific knowledge base is selected
    const isAdmin = req.user?.role === 'admin';

    // If sourceType=user is explicitly requested, force user documents view
    if (sourceType === 'user') {
      folderQuery.ownerId = userId;
      docQuery.userId = userId;
      docQuery.sourceType = 'user';
    } else if (knowledgeBase) {
      folderQuery.knowledgeBaseId = knowledgeBase;
      docQuery.tenantKbId = knowledgeBase;
      docQuery.sourceType = 'tenant';
    } else if (isAdmin) {
      // Admin viewing System KB sees all folders
      // Get all folders regardless of owner
      // This allows admins to organize system documents
      // folderQuery remains empty to get ALL folders

      // IMPORTANT: docQuery is NOT USED for admin System KB mode
      // We fetch directly from SystemKbDocument collection (see lines 206-213)
      // Leave docQuery empty as a safety measure
      // This prevents any accidental inclusion of user documents
      docQuery = {}; // Will be ignored - we use SystemKbDocument.find({}) below
    } else {
      // Regular users only see their own folders and documents
      folderQuery.ownerId = userId;
      docQuery.userId = userId;
      docQuery.sourceType = 'user';
    }

    // Fetch folders and documents
    let documents: Record<string, unknown>[] = [];

    // If sourceType=user is explicitly requested, ALWAYS use UserDocument collection
    if (sourceType === 'user') {
      documents = (await UserDocument.find(docQuery).sort({
        originalFileName: 1,
      })) as unknown as Record<string, unknown>[];
    } else if (isAdmin && !knowledgeBase) {
      // For admin viewing system KB, ONLY fetch from SystemKbDocument collection
      // User documents should NOT appear in the admin System KB dashboard
      documents = (await SystemKbDocument.find({}).sort({ filename: 1 })) as unknown as Record<
        string,
        unknown
      >[];
    } else {
      // For other cases, use regular UserDocument query
      documents = (await UserDocument.find(docQuery).sort({
        originalFileName: 1,
      })) as unknown as Record<string, unknown>[];
    }

    const folders = await Folder.find(folderQuery).sort({ name: 1 });
    const tree = buildTree(folders, documents);

    return res.json({
      success: true,
      tree,
    });
  } catch (error: unknown) {
    // Enhanced error logging to show actual error details
    if (error instanceof Error) {
      log.error(`Error fetching folder tree: ${error.message}`, {
        name: error.name,
        message: error.message,
        stack: error.stack,
        errorObject: error,
      });
      console.error('FULL ERROR DETAILS:', error);
    } else {
      log.error('Error fetching folder tree (non-Error type):', {
        errorType: typeof error,
        errorValue: error,
        errorString: String(error),
      });
      console.error('FULL ERROR DETAILS:', error);
    }
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch folder tree',
    });
  }
};

// Create folder
export const createFolder = async (req: Request, res: Response) => {
  try {
    const userId = req.user?._id;
    const { name, parentId, knowledgeBaseId } = req.body;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!name) {
      return res.status(400).json({ success: false, message: 'Folder name is required' });
    }

    // Validate parent folder exists if provided
    if (parentId) {
      const parentFolder = await Folder.findOne({
        _id: parentId,
        ownerId: userId,
      });

      if (!parentFolder) {
        return res.status(404).json({
          success: false,
          message: 'Parent folder not found',
        });
      }
    }

    // Create folder
    const folder = new Folder({
      name,
      parentId: parentId || null,
      knowledgeBaseId,
      ownerId: userId,
      path: '/', // Will be updated by pre-save hook
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
    log.error('Error creating folder:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create folder',
    });
  }
};

// Rename folder or file
export const renameItem = async (req: Request, res: Response) => {
  try {
    const userId = req.user?._id;
    const { itemId } = req.params;
    const { name } = req.body;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!name) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }

    // Check if it's a folder
    const folder = await Folder.findOne({
      _id: itemId,
      ownerId: userId,
    });

    if (folder) {
      folder.name = name;
      await folder.save();

      // Update paths of all child folders
      const childFolders = await Folder.find({
        path: new RegExp(`^${folder.path}/`),
        ownerId: userId,
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
    const doc = await UserDocument.findOne({
      _id: itemId,
      userId: userId,
    });

    if (doc) {
      doc.originalFileName = name;
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
    log.error('Error renaming item:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to rename item',
    });
  }
};

// Move items
export const moveItems = async (req: Request, res: Response) => {
  try {
    const userId = req.user?._id;
    const { itemIds, targetFolderId } = req.body;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!itemIds || !Array.isArray(itemIds)) {
      return res.status(400).json({
        success: false,
        message: 'Item IDs are required',
      });
    }

    // Validate target folder if provided
    if (targetFolderId) {
      const targetFolder = await Folder.findOne({
        _id: targetFolderId,
        ownerId: userId,
      });

      if (!targetFolder) {
        return res.status(404).json({
          success: false,
          message: 'Target folder not found',
        });
      }
    }

    // Move folders
    const folders = await Folder.find({
      _id: { $in: itemIds },
      ownerId: userId,
    });

    for (const folder of folders) {
      // Prevent moving folder into itself or its descendants
      if (targetFolderId) {
        const targetFolder = await Folder.findById(targetFolderId);
        if (targetFolder && targetFolder.path.startsWith(folder.path)) {
          continue; // Skip this folder
        }
      }

      folder.parentId = targetFolderId || null;
      await folder.save();
    }

    // Move documents
    await UserDocument.updateMany(
      {
        _id: { $in: itemIds },
        userId: userId,
      },
      {
        $set: { folderId: targetFolderId || null },
      }
    );

    // Also move System KB documents if user is admin
    if (req.user?.role === 'admin') {
      await SystemKbDocument.updateMany(
        {
          _id: { $in: itemIds },
        },
        {
          $set: { folderId: targetFolderId || null },
        }
      );
    }

    return res.json({
      success: true,
      message: `${itemIds.length} item(s) moved successfully`,
    });
  } catch (error: unknown) {
    log.error('Error moving items:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to move items',
    });
  }
};

// Delete items
export const deleteItems = async (req: Request, res: Response) => {
  try {
    const userId = req.user?._id;
    const isAdmin = req.user?.role === 'admin';
    const { itemIds } = req.body;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!itemIds || !Array.isArray(itemIds)) {
      return res.status(400).json({
        success: false,
        message: 'Item IDs are required',
      });
    }

    log.info('deleteItems - Request details:', {
      userId: userId.toString(),
      isAdmin,
      itemIds,
    });

    // Find all folders to delete (including descendants)
    const folderQuery: Record<string, unknown> = { _id: { $in: itemIds } };

    // Admin can delete any folder, regular users only their own
    if (!isAdmin) {
      folderQuery.ownerId = userId;
    }

    const foldersToDelete = await Folder.find(folderQuery);

    const allFolderIds: string[] = [];

    for (const folder of foldersToDelete) {
      allFolderIds.push(folder._id.toString());

      // Find all descendant folders
      const descendants = await Folder.find({
        path: new RegExp(`^${folder.path}/`),
        ownerId: userId,
      });

      allFolderIds.push(...descendants.map(d => d._id.toString()));
    }

    // Delete all folders
    if (allFolderIds.length > 0) {
      await Folder.deleteMany({
        _id: { $in: allFolderIds },
      });

      // Delete all documents in these folders
      await UserDocument.deleteMany({
        folderId: { $in: allFolderIds },
        userId: userId,
      });
    }

    // Delete documents that were directly selected
    let userDocDeleted = 0;
    let systemDocsDeleted = 0;

    // For admins, delete from SystemKbDocument collection directly
    if (isAdmin) {
      log.info('deleteItems - Admin deleting from SystemKbDocument:', itemIds);
      const systemDeleteResult = await SystemKbDocument.deleteMany({
        _id: { $in: itemIds },
      });
      systemDocsDeleted = systemDeleteResult.deletedCount || 0;
      log.info('deleteItems - SystemKbDocument deleted:', systemDocsDeleted);
    }

    // Also check UserDocument collection for regular user documents
    const docDeleteQuery: Record<string, unknown> = { _id: { $in: itemIds } };

    if (isAdmin) {
      // Admin can delete both their own docs and system docs
      docDeleteQuery.$or = [{ userId: userId }, { sourceType: 'system' }];
    } else {
      // Regular users can only delete their own docs
      docDeleteQuery.userId = userId;
    }

    const deleteResult = await UserDocument.deleteMany(docDeleteQuery);
    userDocDeleted = deleteResult.deletedCount || 0;

    log.info('deleteItems - Delete results:', {
      userDocDeleted,
      systemDocsDeleted,
      totalDeleted: userDocDeleted + systemDocsDeleted,
    });

    return res.json({
      success: true,
      message: 'Items deleted successfully',
    });
  } catch (error: unknown) {
    log.error('Error deleting items:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete items',
    });
  }
};
