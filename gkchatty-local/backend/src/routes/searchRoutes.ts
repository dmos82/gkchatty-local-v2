import express, { Request, Response, Router } from 'express';
import { UserDocument } from '../models/UserDocument';
import { SystemKbDocument } from '../models/SystemKbDocument';
import { protect, checkSession } from '../middleware/authMiddleware'; // Import checkSession
import mongoose from 'mongoose';
import { getLogger } from '../utils/logger';
import { getContext } from '../services/ragService';
import { getAccessibleFolderIds } from '../utils/folderPermissionHelper';

const router: Router = express.Router();
const logger = getLogger('searchRoutes');

/**
 * @route   GET /api/search/filename
 * @desc    Search documents by filename using text index (searches both User Documents and System KB)
 * @access  Private
 * @param   {string} q - The search query string for the filename
 */
router.get(
  '/filename',
  protect,
  checkSession,
  async (req: Request, res: Response): Promise<void | Response> => {
    const searchQuery = req.query.q as string;

    if (!searchQuery || typeof searchQuery !== 'string' || searchQuery.trim() === '') {
      return res
        .status(400)
        .json({ success: false, message: "Search query parameter 'q' is required." });
    }

    // Added user check after protect/checkSession
    if (!req.user?._id) {
      return res.status(401).json({ success: false, message: 'User not authenticated properly.' });
    }

    try {
      logger.info({ userId: req.user._id, searchQuery }, 'Filename search initiated');

      // SECURITY: Get accessible folders for the user
      const userRole = req.user?.role || 'user';
      const isAdmin = userRole === 'admin';
      const accessibleFolderIds = await getAccessibleFolderIds(req.user._id.toString(), isAdmin);

      logger.debug(
        {
          userId: req.user._id,
          isAdmin,
          accessibleFolderCount: accessibleFolderIds.length,
        },
        '[Search Routes - SECURITY] Retrieved accessible folders for filename search'
      );

      // Search User Documents
      const userDocuments = await UserDocument.find(
        {
          // Search only documents belonging to the authenticated user
          userId: req.user._id,
          $text: { $search: searchQuery },
        },
        { score: { $meta: 'textScore' } } // Project relevance score
      )
        .select('originalFileName _id uploadTimestamp') // Select only necessary fields
        .sort({ score: { $meta: 'textScore' } }) // Sort by relevance
        .limit(10) // Limit user results
        .lean(); // Use lean for performance

      // SECURITY FIX: Search System KB Documents with folder permission filtering
      const systemDocuments = await SystemKbDocument.find(
        {
          $text: { $search: searchQuery },
          // Filter by accessible folders OR root level
          $or: [
            { folderId: { $in: accessibleFolderIds } }, // In accessible folder
            { folderId: null }, // Or at root level (no folder)
            { folderId: { $exists: false } }, // Or folderId field doesn't exist
          ],
        },
        { score: { $meta: 'textScore' } } // Project relevance score
      )
        .select('filename _id createdAt') // Select necessary fields (note: SystemKbDocument uses 'filename', not 'originalFileName')
        .sort({ score: { $meta: 'textScore' } }) // Sort by relevance
        .limit(10) // Limit system results
        .lean(); // Use lean for performance

      // Combine and format results with source type information
      const combinedResults = [
        // Add user documents with 'user' sourceType
        ...userDocuments.map(doc => ({
          _id: doc._id,
          originalFileName: doc.originalFileName,
          uploadTimestamp: doc.uploadTimestamp,
          sourceType: 'user' as const,
          score: (doc as any).score,
        })),
        // Add system documents with 'system' sourceType
        ...systemDocuments.map(doc => ({
          _id: doc._id,
          originalFileName: doc.filename, // Map 'filename' to 'originalFileName' for consistency
          uploadTimestamp: doc.createdAt, // Map 'createdAt' to 'uploadTimestamp' for consistency
          sourceType: 'system' as const,
          score: (doc as any).score,
        })),
      ];

      // Sort combined results by relevance score
      combinedResults.sort((a, b) => (b.score || 0) - (a.score || 0));

      // Limit final results
      const finalResults = combinedResults.slice(0, 20);

      logger.info(
        {
          userId: req.user._id,
          userDocsCount: userDocuments.length,
          systemDocsCount: systemDocuments.length,
          totalResults: finalResults.length,
        },
        'Filename search completed'
      );

      res.status(200).json({ success: true, results: finalResults });
      return; // Explicitly return after sending success response
    } catch (error) {
      logger.error({ error, userId: req.user?._id, searchQuery }, 'Error during filename search');
      if (error instanceof mongoose.Error) {
        // Handle specific Mongoose errors if necessary
        return res.status(500).json({ success: false, message: 'Database error during search.' });
      } else if (error instanceof Error) {
        // Handle cases like index not existing, though Mongoose might not throw distinctly for this specific case easily.
        // A common error string for missing text index is "text index required for $text query"
        if (error.message.includes('text index required')) {
          logger.error('Text index missing in UserDocument or SystemKbDocument schema');
          return res.status(500).json({
            success: false,
            message: 'Search configuration error. Text index might be missing.',
          });
        }
        return res
          .status(500)
          .json({ success: false, message: 'Internal server error during search.' });
      } else {
        return res
          .status(500)
          .json({ success: false, message: 'An unknown error occurred during search.' });
      }
    }
  }
);

/**
 * @route   POST /api/search
 * @desc    Perform a RAG search against System KB, User documents, or Tenant KBs
 * @access  Private
 */
router.post('/', protect, checkSession, async (req: Request, res: Response) => {
  const { query, knowledgeBaseTarget = 'system', tenantKbId } = req.body;
  const userId = req.user?._id;

  if (!userId) {
    return res.status(401).json({ success: false, message: 'User not authenticated' });
  }

  if (!query) {
    return res.status(400).json({ success: false, message: 'Query is required' });
  }

  logger.info(
    { userId, knowledgeBaseTarget, tenantKbId, queryLength: query.length },
    'Received search request'
  );

  try {
    const searchResults = await getContext(query, userId.toString(), {
      knowledgeBaseTarget,
      tenantKbId,
    });

    logger.info(
      {
        userId,
        knowledgeBaseTarget,
        resultCount: searchResults.length,
      },
      'Search completed successfully'
    );

    res.status(200).json({
      success: true,
      results: searchResults,
    });
  } catch (error: any) {
    logger.error(
      {
        userId,
        knowledgeBaseTarget,
        error: { message: error.message, stack: error.stack },
      },
      'Search request failed'
    );
    res.status(500).json({ success: false, message: 'Server error during search' });
  }
});

/**
 * @route   POST /api/search/mcp
 * @desc    MCP-specific search endpoint for builder-pro integration (no auth required)
 * @access  Public (for MCP servers)
 */
router.post('/mcp', async (req: Request, res: Response) => {
  const { query, knowledgeBaseTarget = 'system' } = req.body;

  if (!query) {
    return res.status(400).json({ success: false, message: 'Query is required' });
  }

  logger.info(
    { knowledgeBaseTarget, queryLength: query.length, source: 'mcp' },
    'Received MCP search request'
  );

  try {
    // Use a system/default user ID for MCP requests
    const systemUserId = 'system';

    const searchResults = await getContext(query, systemUserId, {
      knowledgeBaseTarget,
    });

    logger.info(
      {
        knowledgeBaseTarget,
        resultCount: searchResults.length,
        source: 'mcp',
      },
      'MCP search completed successfully'
    );

    res.status(200).json({
      success: true,
      searchResults, // Use 'searchResults' key to match builder-pro expectation
    });
  } catch (error: any) {
    logger.error(
      {
        knowledgeBaseTarget,
        error: { message: error.message, stack: error.stack },
        source: 'mcp',
      },
      'MCP search request failed'
    );
    res.status(500).json({ success: false, message: 'Server error during search' });
  }
});

export default router;
