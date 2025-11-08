import { Request, Response } from 'express';
import { FolderModel as Folder } from '../utils/modelFactory';
import { UserDocumentModel as UserDocument } from '../utils/modelFactory';
import { SystemKbDocumentModel as SystemKbDocument } from '../utils/modelFactory';
import { getLogger } from '../utils/logger';

// Import IFolder interface for type checking
import { IFolder } from '../models/FolderModel';

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
      _id: (doc._id as { toString: () => string }).toString(),
      name: fileName as string,
      type: 'file',
      parentId: (doc.folderId as { toString: () => string } | undefined)?.toString() || null,
      size: doc.fileSize as number,
      mimeType: doc.mimeType as string,
      uploadTimestamp:
        (doc.uploadTimestamp as { toString: () => string } | undefined)?.toString() ||
        (doc.createdAt as { toString: () => string } | undefined)?.toString(),
      s3Key: doc.s3Key as string,
    };

    if (node.parentId && folderMap.has(node.parentId)) {
      const parent = folderMap.get(node.parentId);
      if (parent && parent.children) {
        parent.children.push(node);
        docsWithFolder++;
      }
    } else if (!node.parentId) {
      rootFolders.push(node);
      docsWithoutFolder++;
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
    const { knowledgeBase } = req.query;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    // Build query
    const folderQuery: Record<string, unknown> = {};
    const docQuery: Record<string, unknown> = {};

    // For admin users, show system documents when no specific knowledge base is selected
    const isAdmin = req.user?.role === 'admin';

    log.info('getFolderTree - User details:', {
      userId: userId?.toString(),
      isAdmin,
      knowledgeBase,
    });

    if (knowledgeBase) {
      folderQuery.knowledgeBaseId = knowledgeBase;
      docQuery.tenantKbId = knowledgeBase;
      docQuery.sourceType = 'tenant';
    } else if (isAdmin) {
      // Admin viewing System KB sees all folders
      // Get all folders regardless of owner
      // This allows admins to organize system documents
      // folderQuery remains empty to get ALL folders

      // Admin can see both system and user documents
      docQuery.$or = [{ userId: userId, sourceType: 'user' }, { sourceType: 'system' }];
    } else {
      // Regular users only see their own folders and documents
      folderQuery.ownerId = userId;
      docQuery.userId = userId;
      docQuery.sourceType = 'user';
    }

    log.info('getFolderTree - Query details:', {
      folderQuery: JSON.stringify(folderQuery),
      docQuery: JSON.stringify(docQuery),
    });

    // Fetch folders and documents
    let documents: Record<string, unknown>[] = [];

    if (isAdmin && !knowledgeBase) {
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

    log.info('getFolderTree - Results:', {
      foldersCount: folders.length,
      documentsCount: documents.length,
      documentTypes: documents
        .map(d => ({
          name: d.originalFileName,
          sourceType: (d as Record<string, unknown>).sourceType,
          userId: (d as Record<string, unknown>).userId,
          folderId: (d as Record<string, unknown>).folderId,
        }))
        .slice(0, 5), // Show first 5 documents for debugging
    });

    log.debug(
      '[getFolderTree] Before buildTree - folders:',
      folders.length,
      'documents:',
      documents.length
    );
    const tree = buildTree(folders, documents);
    log.debug('[getFolderTree] After buildTree - tree items:', tree.length);

    log.info('getFolderTree - Final tree structure:', {
      treeItemCount: tree.length,
      treeStructure: JSON.stringify(
        tree.map(item => ({
          name: item.name,
          type: item.type,
          childrenCount: item.children?.length || 0,
        }))
      ),
    });

    return res.json({
      success: true,
      tree,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    log.error('[getFolderTree] DETAILED ERROR:', {
      errorMessage,
      errorStack,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
    });
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch folder tree',
      error: errorMessage,
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
    const folder = await Folder.create({
      name,
      parentId: parentId || null,
      knowledgeBaseId,
      ownerId: userId,
      path: '/', // Will be calculated by FolderModel.create
    });

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
    // For admins, also allow deletion of system documents
    const docDeleteQuery: Record<string, unknown> = { _id: { $in: itemIds } };

    if (isAdmin) {
      // Admin can delete both their own docs and system docs
      docDeleteQuery.$or = [{ userId: userId }, { sourceType: 'system' }];
    } else {
      // Regular users can only delete their own docs
      docDeleteQuery.userId = userId;
    }

    // First, find documents to be deleted to get their s3Keys for system docs
    const docsToDelete = await UserDocument.find(docDeleteQuery);
    const systemDocsS3Keys = docsToDelete
      .filter(doc => doc.sourceType === 'system')
      .map(doc => doc.s3Key);

    log.info('deleteItems - Documents to delete:', {
      totalDocs: docsToDelete.length,
      systemDocs: systemDocsS3Keys.length,
      systemDocsS3Keys,
    });

    // Delete from UserDocument collection
    const deleteResult = await UserDocument.deleteMany(docDeleteQuery);

    // Also delete system documents from SystemKbDocument collection if any
    if (systemDocsS3Keys.length > 0) {
      log.info('deleteItems - Deleting from SystemKbDocument collection:', systemDocsS3Keys);
      await SystemKbDocument.deleteMany({
        s3Key: { $in: systemDocsS3Keys },
      });
    }

    log.info('deleteItems - Delete results:', {
      userDocDeleted: deleteResult.deletedCount,
      systemDocsDeleted: systemDocsS3Keys.length,
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
