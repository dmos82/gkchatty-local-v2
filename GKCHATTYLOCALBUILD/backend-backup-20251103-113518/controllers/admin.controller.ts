import { Request, Response } from 'express';
import Feedback from '../models/Feedback.model';
import mongoose from 'mongoose';
import { createErrorResponse } from '../utils/errorResponse';
import User from '../models/UserModel';
import { SystemKbDocument } from '../models/SystemKbDocument';
import { UserDocument } from '../models/UserDocument';
import Chat from '../models/ChatModel';
import { processAndEmbedDocument } from '../utils/documentProcessor';
import { getLogger } from '../utils/logger';
import { deleteVectorsByFilter, getPineconeIndex } from '../utils/pineconeService';
import { getSystemKbNamespace } from '../utils/pineconeNamespace';

const log = getLogger('adminController');

/**
 * @desc    Get all feedback entries (Admin)
 * @route   GET /api/admin/feedback
 * @access  Private (Admin)
 */
export const getAllFeedback = async (req: Request, res: Response): Promise<void> => {
  try {
    const feedbackEntries = await Feedback.find()
      .sort({ createdAt: -1 }) // Sort by newest first
      .populate('userId', 'username email'); // Optionally populate user details

    res
      .status(200)
      .json({ success: true, count: feedbackEntries.length, feedback: feedbackEntries });
  } catch (error: unknown) {
    log.error('[Admin] Error fetching feedback:', error);
    res
      .status(500)
      .json(
        createErrorResponse(
          'Server error while fetching feedback.',
          'FEEDBACK_FETCH_FAILED',
          process.env.NODE_ENV !== 'production'
            ? error instanceof Error
              ? error.message
              : String(error)
            : undefined
        )
      );
  }
};

/**
 * @desc    Delete a specific feedback entry (Admin)
 * @route   DELETE /api/admin/feedback/:feedbackId
 * @access  Private (Admin)
 */
export const deleteFeedbackById = async (req: Request, res: Response): Promise<void> => {
  const { feedbackId } = req.params;

  // Validate feedbackId
  if (!mongoose.Types.ObjectId.isValid(feedbackId)) {
    res.status(400).json(createErrorResponse('Invalid feedback ID format.', 'INVALID_FEEDBACK_ID'));
    return;
  }

  try {
    const feedbackToDelete = await Feedback.findById(feedbackId);

    if (!feedbackToDelete) {
      res.status(404).json(createErrorResponse('Feedback entry not found.', 'FEEDBACK_NOT_FOUND'));
      return;
    }

    await feedbackToDelete.deleteOne(); // Use deleteOne on the document

    log.debug(`[Admin] Deleted feedback entry: ${feedbackId} by user: ${req.user?.username}`);
    res.status(200).json({ success: true, message: 'Feedback deleted successfully.' });
  } catch (error: unknown) {
    log.error(`[Admin] Error deleting feedback ${feedbackId}:`, error);
    res
      .status(500)
      .json(createErrorResponse('Server error while deleting feedback.', 'FEEDBACK_DELETE_FAILED'));
  }
};

/**
 * @desc    Delete all feedback entries (Admin)
 * @route   DELETE /api/admin/feedback
 * @access  Private (Admin)
 */
export const deleteAllFeedback = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await Feedback.deleteMany({});

    log.debug(
      `[Admin] Deleted all feedback entries (${result.deletedCount}) by user: ${req.user?.username}`
    );
    res.status(200).json({
      success: true,
      message: `All feedback entries deleted successfully (${result.deletedCount} entries).`,
      deletedCount: result.deletedCount,
    });
  } catch (error: unknown) {
    log.error('[Admin] Error deleting all feedback:', error);
    res
      .status(500)
      .json(
        createErrorResponse(
          'Server error while deleting all feedback.',
          'FEEDBACK_DELETE_ALL_FAILED'
        )
      );
  }
};

/**
 * @desc    Update user role (Admin)
 * @route   PATCH /api/admin/users/:userId/role
 * @access  Private (Admin)
 */
export const updateUserRole = async (req: Request, res: Response): Promise<void> => {
  const { userId } = req.params;
  const { role } = req.body;
  const adminUserId = req.user?._id;

  log.debug(`[Admin] Request to update role for user ${userId} to ${role} by admin ${adminUserId}`);

  // Validate userId
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    res.status(400).json(createErrorResponse('Invalid user ID format.', 'INVALID_USER_ID'));
    return;
  }

  // Validate role
  if (!role || !['user', 'admin'].includes(role)) {
    res
      .status(400)
      .json(
        createErrorResponse('Invalid role. Role must be either "user" or "admin".', 'INVALID_ROLE')
      );
    return;
  }

  // Prevent admin from changing their own role
  if (adminUserId && adminUserId.toString() === userId) {
    res
      .status(400)
      .json(
        createErrorResponse('Admin cannot change their own role.', 'SELF_ROLE_CHANGE_FORBIDDEN')
      );
    return;
  }

  try {
    const user = await User.findById(userId);

    if (!user) {
      res.status(404).json(createErrorResponse('User not found.', 'USER_NOT_FOUND'));
      return;
    }

    // Update the user's role
    user.role = role;
    await user.save();

    log.debug(`[Admin] Successfully updated role for user ${userId} to ${role}`);
    res.status(200).json({
      success: true,
      message: `User role updated successfully to ${role}.`,
      user: {
        _id: user._id,
        username: user.username,
        role: user.role,
      },
    });
  } catch (error: unknown) {
    log.error(`[Admin] Error updating role for user ${userId}:`, error);
    res
      .status(500)
      .json(
        createErrorResponse('Server error while updating user role.', 'USER_ROLE_UPDATE_FAILED')
      );
  }
};

/**
 * @desc    Get grand total system statistics (Admin)
 * @route   GET /api/admin/stats/summary
 * @access  Private (Admin)
 */
export const getSystemGrandTotals = async (req: Request, res: Response): Promise<void> => {
  log.debug('[Admin Controller] Request received for system grand totals.');
  try {
    const { startDate, endDate } = req.query; // Expecting YYYY-MM-DD string

    const dateFilter: { createdAt?: { $gte: Date; $lte: Date } } = {};
    if (startDate && typeof startDate === 'string' && endDate && typeof endDate === 'string') {
      const start = new Date(startDate);
      const end = new Date(endDate);

      // Basic validation for dates
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        end.setHours(23, 59, 59, 999); // Ensure end date includes the entire day
        dateFilter.createdAt = { $gte: start, $lte: end };
        log.debug('[Admin Controller] Applying date filter:', dateFilter.createdAt);
      } else {
        log.warn('[Admin Controller] Invalid startDate or endDate query parameters received.');
        // Potentially return an error or ignore if strict validation is needed
      }
    }

    const totalSystemDocs = await SystemKbDocument.countDocuments(dateFilter);
    const totalUserDocs = await UserDocument.countDocuments(dateFilter);
    const totalChatSessions = await Chat.countDocuments(dateFilter);

    // Aggregate total messages
    const messagesAggregationPipeline: mongoose.PipelineStage[] = [];

    if (dateFilter.createdAt) {
      messagesAggregationPipeline.push({ $match: { createdAt: dateFilter.createdAt } });
    }

    messagesAggregationPipeline.push({
      $group: {
        _id: null,
        totalMessages: { $sum: { $size: '$messages' } },
      },
    });

    const messagesAggregation = await Chat.aggregate(messagesAggregationPipeline);
    const totalMessages = messagesAggregation.length > 0 ? messagesAggregation[0].totalMessages : 0;

    const stats = {
      totalSystemDocs,
      totalUserDocs,
      totalChatSessions,
      totalMessages,
    };

    log.debug('[Admin Controller] Successfully fetched system grand totals:', stats);
    res.status(200).json({ success: true, data: stats });
  } catch (error: unknown) {
    log.error('[Admin Controller] Error fetching system grand totals:', error);
    res
      .status(500)
      .json(
        createErrorResponse(
          'Server error while fetching system grand totals.',
          'GRAND_TOTALS_FETCH_FAILED',
          process.env.NODE_ENV !== 'production'
            ? error instanceof Error
              ? error.message
              : String(error)
            : undefined
        )
      );
  }
};

/**
 * @desc    Re-index all documents for a specific user
 * @route   POST /api/admin/reindex-user-documents
 * @access  Private (Admin)
 */
export const reindexUserDocuments = async (req: Request, res: Response): Promise<void> => {
  const { userId } = req.body;
  const adminUser = req.user;

  // Validate userId
  if (!userId || typeof userId !== 'string') {
    res
      .status(400)
      .json(createErrorResponse('userId is required and must be a string.', 'MISSING_USER_ID'));
    return;
  }

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    res.status(400).json(createErrorResponse('Invalid user ID format.', 'INVALID_USER_ID'));
    return;
  }

  log.info(
    {
      userId,
      adminUserId: adminUser?._id,
      adminUsername: adminUser?.username,
    },
    '[Admin] Starting user document re-indexing process'
  );

  try {
    // Verify the user exists
    const targetUser = await User.findById(userId);
    if (!targetUser) {
      res.status(404).json(createErrorResponse('User not found.', 'USER_NOT_FOUND'));
      return;
    }

    log.info(
      {
        userId,
        targetUsername: targetUser.username,
      },
      '[Admin] Target user found, fetching documents'
    );

    // Find all UserDocument records for this user
    const userDocuments = await UserDocument.find({
      userId,
      sourceType: 'user',
    }).select('_id s3Key originalFileName mimeType fileSize status statusDetail');

    log.info(
      {
        userId,
        documentCount: userDocuments.length,
      },
      '[Admin] Found user documents for re-indexing'
    );

    if (userDocuments.length === 0) {
      res.status(200).json({
        success: true,
        message: `No documents found for user ${targetUser.username} (${userId}).`,
        documentsProcessed: 0,
        vectorsAdded: 0,
        failedDocuments: [],
      });
      return;
    }

    // Process each document
    let documentsProcessed = 0;
    let totalVectorsAdded = 0;
    const failedDocuments: Array<{ documentId: string; fileName: string; error: string }> = [];

    const s3Bucket = process.env.S3_BUCKET_NAME || 'gkchatty-uploads';

    for (const document of userDocuments) {
      const docId = document._id.toString();
      const fileName = document.originalFileName;

      log.info(
        {
          userId,
          documentId: docId,
          fileName,
        },
        '[Admin] Processing document for re-indexing'
      );

      try {
        // Call the existing processAndEmbedDocument function
        await processAndEmbedDocument(
          docId,
          s3Bucket,
          document.s3Key,
          'user',
          document.originalFileName,
          document.mimeType,
          userId,
          `admin-reindex-${Date.now()}` // Correlation ID for tracking
        );

        documentsProcessed++;

        // Estimate vectors added (this is approximate since we don't get exact count back)
        // Most documents create 5-20 chunks/vectors depending on size
        const estimatedVectors = Math.max(1, Math.floor(document.fileSize / 1000));
        totalVectorsAdded += estimatedVectors;

        log.info(
          {
            userId,
            documentId: docId,
            fileName,
            estimatedVectors,
          },
          '[Admin] Successfully re-indexed document'
        );
      } catch (docError: unknown) {
        const errorMessage =
          docError instanceof Error
            ? docError.message
            : String(docError) || 'Unknown error during processing';

        log.error(
          {
            userId,
            documentId: docId,
            fileName,
            error: errorMessage,
          },
          '[Admin] Failed to re-index document'
        );

        failedDocuments.push({
          documentId: docId,
          fileName,
          error: errorMessage,
        });
      }
    }

    log.info(
      {
        userId,
        documentsProcessed,
        totalVectorsAdded,
        failedCount: failedDocuments.length,
      },
      '[Admin] User document re-indexing process completed'
    );

    res.status(200).json({
      success: true,
      message: `Re-indexing complete for user ${targetUser.username}.`,
      userId,
      username: targetUser.username,
      documentsProcessed,
      totalDocuments: userDocuments.length,
      vectorsAdded: totalVectorsAdded,
      failedDocuments,
    });
  } catch (error: unknown) {
    log.error(
      {
        userId,
        error: error instanceof Error ? error.message : String(error),
        adminUserId: adminUser?._id,
      },
      '[Admin] Error during user document re-indexing'
    );

    res
      .status(500)
      .json(
        createErrorResponse(
          'Server error during user document re-indexing.',
          'REINDEX_FAILED',
          process.env.NODE_ENV !== 'production'
            ? error instanceof Error
              ? error.message
              : String(error)
            : undefined
        )
      );
  }
};

/**
 * @desc    Purge specific documents from the default Pinecone namespace (One-time cleanup tool)
 * @route   POST /api/admin/purge-documents-from-default-namespace
 * @access  Private (Admin)
 */
export const purgeDocumentsFromDefaultNamespace = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { documentIds } = req.body;
  const adminUser = req.user;

  // Validate input
  if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
    res
      .status(400)
      .json(
        createErrorResponse(
          'documentIds is required and must be a non-empty array.',
          'MISSING_DOCUMENT_IDS'
        )
      );
    return;
  }

  // Validate all documentIds are strings
  if (!documentIds.every(id => typeof id === 'string' && id.trim().length > 0)) {
    res
      .status(400)
      .json(
        createErrorResponse('All documentIds must be non-empty strings.', 'INVALID_DOCUMENT_IDS')
      );
    return;
  }

  log.info(
    {
      documentIds,
      documentCount: documentIds.length,
      adminUserId: adminUser?._id,
      adminUsername: adminUser?.username,
    },
    '[Admin] Starting purge operation for documents in default namespace'
  );

  const results = {
    message: 'Cleanup complete.',
    purgedDocuments: 0,
    errors: [] as Array<{ documentId: string; error: string }>,
  };

  try {
    // Process each document ID
    for (const documentId of documentIds) {
      const trimmedDocId = documentId.trim();

      log.info(
        {
          documentId: trimmedDocId,
          adminUserId: adminUser?._id,
        },
        '[Admin] Attempting to purge document from default namespace'
      );

      try {
        // Create filter to match all vectors for this document
        const filter = {
          documentId: trimmedDocId,
        };

        // Delete from default namespace (undefined means default namespace)
        await deleteVectorsByFilter(filter, undefined);

        results.purgedDocuments++;

        log.info(
          {
            documentId: trimmedDocId,
            adminUserId: adminUser?._id,
          },
          '[Admin] Successfully purged document from default namespace'
        );
      } catch (docError: unknown) {
        const errorMessage =
          docError instanceof Error
            ? docError.message
            : String(docError) || 'Unknown error during vector deletion';

        log.error(
          {
            documentId: trimmedDocId,
            error: errorMessage,
            adminUserId: adminUser?._id,
          },
          '[Admin] Failed to purge document from default namespace'
        );

        results.errors.push({
          documentId: trimmedDocId,
          error: errorMessage,
        });
      }
    }

    log.info(
      {
        totalDocuments: documentIds.length,
        purgedDocuments: results.purgedDocuments,
        errorCount: results.errors.length,
        adminUserId: adminUser?._id,
      },
      '[Admin] Purge operation completed'
    );

    res.status(200).json({
      success: true,
      ...results,
    });
  } catch (error: unknown) {
    log.error(
      {
        error: error instanceof Error ? error.message : String(error),
        adminUserId: adminUser?._id,
        documentIds,
      },
      '[Admin] Critical error during purge operation'
    );

    res
      .status(500)
      .json(
        createErrorResponse(
          'Server error during document purge operation.',
          'PURGE_OPERATION_FAILED',
          process.env.NODE_ENV !== 'production'
            ? error instanceof Error
              ? error.message
              : String(error)
            : undefined
        )
      );
  }
};

/**
 * @desc    Re-index all documents in the System KB
 * @route   POST /api/admin/reindex-system-kb
 * @access  Private (Admin)
 */
export const reindexSystemKb = async (req: Request, res: Response): Promise<void> => {
  log.info('[Admin] System KB re-indexing process started by admin.');

  try {
    // 1. Get correct namespace for production environment
    const systemKbNamespace = getSystemKbNamespace();
    log.info(`[Admin] Using System KB namespace: "${systemKbNamespace}"`);
    // 1. Purge Pinecone Namespace
    log.info(`[Admin] Purging "${systemKbNamespace}" namespace from Pinecone...`);
    const pineconeIndex = await getPineconeIndex();
    await pineconeIndex.namespace(systemKbNamespace).deleteAll();
    log.info(`[Admin] "${systemKbNamespace}" namespace successfully purged.`);

    // 2. Fetch All System KB Documents from MongoDB
    log.info('[Admin] Fetching all System KB document records from MongoDB...');
    // Fetch fields required by processAndEmbedDocument
    const documents = await SystemKbDocument.find({}).select('_id s3Key filename mimeType').lean();
    log.info(`[Admin] Found ${documents.length} System KB documents to re-index.`);

    // 3. Re-run Ingestion for Each Document
    let reindexedCount = 0;
    const errors: { documentId: string; filename: string; error: string }[] = [];

    for (const doc of documents) {
      try {
        log.info(`[Admin] Re-indexing document: ${doc.filename} (ID: ${doc._id})`);
        await processAndEmbedDocument(
          doc._id.toString(),
          process.env.S3_BUCKET_NAME ||
            process.env.AWS_BUCKET_NAME ||
            'gk-chatty-documents-goldkeyinsurance',
          doc.s3Key,
          'system',
          doc.filename,
          doc.mimeType,
          undefined, // userId is not applicable for system docs
          String(req.id) // Pass request ID for correlation
        );
        reindexedCount++;
      } catch (error: unknown) {
        log.error(
          `[Admin] Failed to re-index document ${doc._id}: ${error instanceof Error ? error.message : String(error)}`,
          {
            documentId: doc._id,
            filename: doc.filename,
            error,
          }
        );
        errors.push({
          documentId: doc._id.toString(),
          filename: doc.filename,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    log.info(
      `[Admin] System KB re-indexing process completed. Re-indexed ${reindexedCount} documents.`
    );

    if (errors.length > 0) {
      res.status(207).json({
        success: true,
        message: `System KB re-indexing completed with some failures.`,
        reindexedCount,
        totalDocuments: documents.length,
        failures: errors,
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'System KB re-indexed successfully.',
      reindexedCount,
    });
  } catch (error: unknown) {
    log.error(
      `[Admin] Critical error during System KB re-indexing: ${error instanceof Error ? error.message : String(error)}`,
      { error }
    );
    res
      .status(500)
      .json(
        createErrorResponse(
          'A critical error occurred during the re-indexing process.',
          'SYSTEM_KB_REINDEX_FAILED',
          error instanceof Error ? error.message : String(error)
        )
      );
  }
};

/**
 * @desc    Get statistics for a specific Pinecone namespace
 * @route   GET /api/admin/pinecone-namespace-stats
 * @access  Private (Admin)
 */
export const getPineconeNamespaceStats = async (req: Request, res: Response): Promise<void> => {
  const { namespace } = req.query;

  if (!namespace || typeof namespace !== 'string') {
    res
      .status(400)
      .json(createErrorResponse('Namespace query parameter is required.', 'MISSING_NAMESPACE'));
    return;
  }

  log.info(`[Admin] Fetching Pinecone stats for namespace: "${namespace}"`);

  try {
    const pineconeIndex = await getPineconeIndex();
    const stats = await pineconeIndex.namespace(namespace).describeIndexStats();

    res.status(200).json({
      success: true,
      namespace,
      stats,
    });
  } catch (error: unknown) {
    log.error(
      `[Admin] Error fetching stats for Pinecone namespace "${namespace}": ${error instanceof Error ? error.message : String(error)}`,
      {
        error,
        namespace,
      }
    );
    res
      .status(500)
      .json(
        createErrorResponse(
          `Failed to fetch stats for namespace: ${namespace}.`,
          'PINECONE_STATS_FAILED',
          error instanceof Error ? error.message : String(error)
        )
      );
  }
};

/**
 * @desc    Initiate re-indexing of ALL user documents across every user account.
 *          This is a one-time migration endpoint that kicks off the
 *          `reindexAllUserDocuments` script asynchronously.
 * @route   POST /api/admin/reindex-user-docs
 * @access  Private (Admin)
 */
export const triggerUserReindexing = async (req: Request, res: Response): Promise<void> => {
  try {
    // Dynamically import to avoid circular deps & heavy startup cost.
    const { reindexAllUserDocuments } = await import('../scripts/reindex-all-users-docs');

    // Fire-and-forget – we do NOT await completion so the request returns quickly.
    reindexAllUserDocuments()
      .then(() => {
        log.debug('[Admin] Global user document re-indexing completed.');
      })
      .catch(err => {
        log.error('[Admin] Error during global user document re-indexing:', err);
      });

    res.status(200).json({
      success: true,
      message: 'User document re-indexing process initiated successfully.',
    });
  } catch (error: unknown) {
    log.error('[Admin] Failed to start user document re-indexing:', error);
    res
      .status(500)
      .json(
        createErrorResponse(
          'Failed to start user document re-indexing.',
          'REINDEX_START_FAILED',
          process.env.NODE_ENV !== 'production'
            ? error instanceof Error
              ? error.message
              : String(error)
            : undefined
        )
      );
  }
};
