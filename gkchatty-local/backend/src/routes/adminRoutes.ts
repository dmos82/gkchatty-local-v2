import express, { Request, Response, Router } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import path from 'path';
import fs from 'fs'; // Use synchronous fs for initial check/create
import { protect, isAdmin, checkSession } from '../middleware/authMiddleware';
import asyncHandler from '../middleware/asyncHandler';
import { UserDocument, IUserDocument } from '../models/UserDocument';
import { SystemKbDocument } from '../models/SystemKbDocument'; // Added import for SystemKbDocument
import User from '../models/UserModel';
import bcrypt from 'bcryptjs';
import { BCRYPT_SALT_ROUNDS } from '../config/constants';
import { adminLimiter } from '../middleware/rateLimiter'; // Import admin rate limiter
import { validatePasswordMiddleware } from '../middleware/passwordValidation'; // MEDIUM-005
import { sanitizeInputMiddleware } from '../middleware/inputSanitization'; // MEDIUM-007
// --- Import Utilities ---
import { deleteVectorsByFilter, deleteSystemDocument } from '../utils/pineconeService';
// Import S3 Helper
import * as s3Helper from '../utils/s3Helper';
// Import LocalStorage Helper
import * as localStorageHelper from '../utils/localStorageHelper';
// Import Feedback Admin Controllers
import {
  getAllFeedback,
  deleteFeedbackById,
  deleteAllFeedback,
  updateUserRole,
  getSystemGrandTotals,
  reindexUserDocuments,
  purgeDocumentsFromDefaultNamespace,
  reindexSystemKb,
  getPineconeNamespaceStats,
  triggerUserReindexing,
} from '../controllers/admin.controller';
// Imports - add our new controller
import { uploadSystemKb, deleteAllSystemDocuments } from '../controllers/adminSystemKbController';
import { isS3Storage } from '../utils/storageModeHelper';
import {
  getAllUserSettings,
  getUserSettings,
  updateUserSettings,
  deleteUserSettings,
} from '../controllers/userSettingsController';
// Import Tenant KB Controllers
import {
  createTenantKB,
  getAllTenantKBs,
  getTenantKBById,
  updateTenantKB,
  deleteTenantKB,
  addUsersToKB,
  removeUsersFromKB,
  getTenantKBDocuments,
} from '../controllers/tenantKBController';
// import { GIT_COMMIT_SHA } from '../config/version'; // Import build identifier - Temporarily removed
import { KNOWLEDGE_BASE_S3_PREFIX } from '../config/storageConfig';
import { getLogger } from '../utils/logger';
// Import Audit and Feature Toggle Services
import {
  getAuditLogs,
  getAuditStats,
  exportAuditLogs,
  AuditLogFilters,
} from '../services/auditService';
import {
  getAllFeatureToggles,
  setFeatureToggle,
  initializeFeatureToggles,
} from '../services/featureToggleService';
import { FeatureName } from '../models/FeatureToggleModel';
import { AuditAction, AuditResource } from '../models/AuditLogModel';
import { auditFeatureToggle, auditAdminAction } from '../middleware/auditMiddleware';
// Import Knowledge Gap Service
import {
  getKnowledgeGaps,
  getNewGapCount,
  getTopKnowledgeGaps,
  updateGapStatus,
  getGapStats,
  deleteGap,
} from '../services/knowledgeGapService';
import { GapStatus } from '../models/KnowledgeGapModel';

const router: Router = express.Router();
const logger = getLogger('adminRoutes');

// Type definitions for Pinecone query results
interface PineconeMatch {
  id: string;
  score: number;
  metadata?: {
    originalFileName?: string;
    fileName?: string;
    documentId?: string;
    sourceType?: string;
    [key: string]: unknown;
  };
}

interface PineconeQueryResult {
  matches?: PineconeMatch[];
}

// Extend Express Request type for file filter errors
interface RequestWithFileError extends Request {
  fileFilterError?: string;
}

// Define temporary upload directory (using /tmp is fine)
const TEMP_UPLOAD_DIR = '/tmp/gkchatty_uploads';
fs.mkdirSync(TEMP_UPLOAD_DIR, { recursive: true }); // Ensure temp dir exists

// Use MemoryStorage for admin uploads as well, to pass buffer to S3
// const storage = multer.diskStorage({ ... }); // REMOVE
const storage = multer.memoryStorage(); // USE MEMORY STORAGE

const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Accept only specific file types
  const allowedMimes = ['application/pdf', 'text/plain', 'text/markdown'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    // Pass the error message through the request object
    (req as RequestWithFileError).fileFilterError =
      `Invalid file type: ${file.mimetype}. Only PDF, TXT, MD allowed for System KB.`;
    cb(null, false);
  }
};

const upload = multer({
  storage: storage, // Use memory storage
  fileFilter: fileFilter,
  limits: { fileSize: 1024 * 1024 * 50 }, // 50MB limit
});

// Apply protect and isAdmin middleware to all admin routes (removed checkSession to avoid unnecessary 401 errors)
router.use(protect, isAdmin);

// Apply admin rate limiter to all admin routes
router.use(adminLimiter);

// --- DEPRECATED: Simplified Test Endpoint for S3 Key Logic ---
/*
router.post('/system-kb/debug-s3-key', async (req: Request, res: Response) => {
  console.log(`[Admin Debug S3 Key] Entered. Test Endpoint v1.0`); // Simplified version log
  try {
    const s3Uuid = uuidv4();
    const fileExtension = '.pdf'; // Assuming PDF for test
    const originalFileName = `test-doc-${s3Uuid}${fileExtension}`;
    const s3ObjectKey = `${KNOWLEDGE_BASE_S3_PREFIX}${s3Uuid}${fileExtension}`;
    const s3KeyForDb = s3Uuid;

    console.log(`[Admin Debug S3 Key] Generated UUID: ${s3Uuid}`);
    console.log(`[Admin Debug S3 Key] Constructed s3ObjectKey for S3: ${s3ObjectKey}`);
    console.log(`[Admin Debug S3 Key] s3Key to be stored in DB: ${s3KeyForDb}`);

    const mockFileUrl = `https://mock-s3-url.com/${s3ObjectKey}`;

    const documentRecord = await SystemKbDocument.create({
      filename: originalFileName,
      s3Key: s3KeyForDb,
      fileUrl: mockFileUrl,
      fileSize: 12345, // Mock size
      status: 'completed', // Mock status
      statusDetail: 'Debug S3 Key Test Record',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    console.log('[Admin Debug S3 Key] Mock MongoDB record created:', documentRecord.toJSON());
    return res.status(201).json({
      success: true,
      message: 'Debug S3 key test record created successfully.',
      document: documentRecord,
      // gitCommitSha: GIT_COMMIT_SHA || 'N/A', // Temporarily removed
    });
  } catch (error: unknown) {
    console.error('[Admin Debug S3 Key] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error in debug S3 key test endpoint.',
      error: error instanceof Error ? error.message : String(error),
      // gitCommitSha: GIT_COMMIT_SHA || 'N/A', // Temporarily removed
    });
  }
});
*/

// --- DEPRECATED: System KB Pinecone Diagnostic Endpoint (Replaced by /pinecone-namespace-stats) ---
/*
router.get(
  '/system-kb/pinecone-stats',
  asyncHandler(async (req: Request, res: Response) => {
    console.log('[Admin System KB Pinecone Stats] Diagnostic endpoint called');

    try {
      const { queryVectors } = await import('../utils/pineconeService');
      const { generateEmbeddings } = await import('../utils/openaiHelper');

      // Test query for "architecture" (same as user's query)
      const testQuery = 'architecture of GKChatty';
      console.log(`[Admin System KB Pinecone Stats] Testing query: ${testQuery}`);

      // Generate embedding for the test query
      const queryEmbedding = await generateEmbeddings([testQuery.toLowerCase()]);
      if (!queryEmbedding || queryEmbedding.length === 0) {
        throw new Error('Failed to generate test query embedding');
      }

      // Test search in system-kb namespace
      const systemFilter = { sourceType: 'system' };
      const systemNamespace = 'system-kb';

      console.log(
        `[Admin System KB Pinecone Stats] Querying system-kb namespace with filter:`,
        systemFilter
      );
      const systemResults = await queryVectors(
        queryEmbedding[0],
        10, // Get top 10 results
        systemFilter,
        systemNamespace
      );

      // Test search without filter (to see if there's any data at all)
      console.log(`[Admin System KB Pinecone Stats] Querying system-kb namespace WITHOUT filter`);
      const systemResultsNoFilter = await queryVectors(
        queryEmbedding[0],
        10,
        undefined, // No filter
        systemNamespace
      );

      // Also test default namespace to see if vectors are there
      console.log(`[Admin System KB Pinecone Stats] Querying DEFAULT namespace with system filter`);
      const defaultNamespaceResults = await queryVectors(
        queryEmbedding[0],
        10,
        systemFilter,
        undefined // Default namespace
      );

      // Get sample metadata from each result set
      const getMetadataSample = (results: PineconeQueryResult) => {
        if (!results?.matches?.length) return [];
        return results.matches.slice(0, 3).map((match: PineconeMatch) => ({
          id: match.id,
          score: match.score,
          metadata: match.metadata,
        }));
      };

      const diagnosticInfo = {
        testQuery,
        systemKbNamespace: {
          withFilter: {
            totalMatches: systemResults?.matches?.length ?? 0,
            hasMatches: (systemResults?.matches?.length ?? 0) > 0,
            sampleMetadata: getMetadataSample(systemResults),
          },
          withoutFilter: {
            totalMatches: systemResultsNoFilter?.matches?.length ?? 0,
            hasMatches: (systemResultsNoFilter?.matches?.length ?? 0) > 0,
            sampleMetadata: getMetadataSample(systemResultsNoFilter),
          },
        },
        defaultNamespace: {
          withSystemFilter: {
            totalMatches: defaultNamespaceResults?.matches?.length ?? 0,
            hasMatches: (defaultNamespaceResults?.matches?.length ?? 0) > 0,
            sampleMetadata: getMetadataSample(defaultNamespaceResults),
          },
        },
      };

      console.log(
        '[Admin System KB Pinecone Stats] Diagnostic complete:',
        JSON.stringify(diagnosticInfo, null, 2)
      );

      return res.status(200).json({
        success: true,
        message: 'System KB Pinecone diagnostic completed',
        data: diagnosticInfo,
      });
    } catch (error: unknown) {
      console.error('[Admin System KB Pinecone Stats] Error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error running System KB Pinecone diagnostic',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })
);
*/

// --- System KB Re-indexing Endpoint ---
router.post(
  '/reindex-system-kb',
  asyncHandler(async (req: Request, res: Response) => {
    logger.info('Re-indexing endpoint called');

    try {
      // Import the re-indexing function
      const { reindexSystemKB } = await import('../scripts/reindex-system-kb');

      // Extract options from request body
      const { forceFullCleanup = false, clearAllNamespaces = false } = req.body;

      // Start re-indexing process with options
      logger.info(
        { forceFullCleanup, clearAllNamespaces },
        'Starting re-indexing process with options'
      );
      await reindexSystemKB({ forceFullCleanup, clearAllNamespaces });

      logger.info('Re-indexing completed successfully');
      return res.status(200).json({
        success: true,
        message: 'System KB re-indexing completed successfully',
      });
    } catch (error: unknown) {
      logger.error({ error }, 'Error during re-indexing');
      return res.status(500).json({
        success: false,
        message: 'Error during System KB re-indexing',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

// --- System KB Targeted Vector Cleanup ---
router.post(
  '/system-kb/cleanup-vectors',
  asyncHandler(async (req: Request, res: Response) => {
    logger.info('Targeted vector cleanup endpoint called');

    try {
      const { documentIds = [], vectorIds = [], clearNumericFilenames = false } = req.body;
      const { deleteVectorsByFilter, queryVectors } = await import('../utils/pineconeService');
      const { generateEmbeddings } = await import('../utils/openaiHelper');

      let deletedCount = 0;

      // Delete specific document IDs
      if (documentIds.length > 0) {
        logger.info({ documentIds }, 'Deleting vectors for document IDs');
        for (const docId of documentIds) {
          try {
            // Delete from both namespaces
            await deleteVectorsByFilter({ documentId: docId }, 'system-kb');
            await deleteVectorsByFilter({ documentId: docId }, undefined);
            deletedCount++;
            logger.debug({ docId }, 'Deleted vectors for document ID');
          } catch (error: unknown) {
            logger.warn(
              { docId, error: error instanceof Error ? error.message : String(error) },
              'Error deleting document vectors'
            );
          }
        }
      }

      // Delete specific vector IDs
      if (vectorIds.length > 0) {
        logger.info({ vectorIds }, 'Deleting specific vector IDs');
        try {
          // Use the deleteVectorsById function if available, otherwise use filter
          const { deleteVectorsById } = await import('../utils/pineconeService');
          await deleteVectorsById(vectorIds, 'system-kb');
          await deleteVectorsById(vectorIds, undefined);
          deletedCount += vectorIds.length;
        } catch (error: unknown) {
          logger.warn(
            { error: error instanceof Error ? error.message : String(error) },
            'Error deleting vector IDs'
          );
        }
      }

      // Clear all vectors with numeric filenames
      if (clearNumericFilenames) {
        logger.info('Finding and deleting all numeric filename vectors');
        try {
          const testEmbedding = await generateEmbeddings(['test query']);

          // Check both namespaces
          const namespaces = ['system-kb', undefined];

          for (const namespace of namespaces) {
            const namespaceName = namespace || 'default';
            logger.debug({ namespace: namespaceName }, 'Checking namespace');

            const results = await queryVectors(
              testEmbedding[0],
              100, // Get more results
              undefined, // No filter to get all
              namespace
            );

            if (results?.matches) {
              const numericVectors = (results.matches as unknown as PineconeMatch[]).filter((match: PineconeMatch) => {
                const fileName = match.metadata?.originalFileName || match.metadata?.fileName;
                return fileName && /^\d{13}-\d+\.pdf$/.test(fileName);
              });

              if (numericVectors.length > 0) {
                logger.info(
                  { count: numericVectors.length, namespace: namespaceName },
                  'Found numeric vectors'
                );

                // Delete by vector IDs
                const numericVectorIds = (numericVectors as PineconeMatch[]).map(v => v.id);
                const { deleteVectorsById } = await import('../utils/pineconeService');
                await deleteVectorsById(numericVectorIds, namespace);
                deletedCount += numericVectors.length;

                logger.info(
                  { count: numericVectors.length, namespace: namespaceName },
                  'Deleted numeric vectors'
                );
              } else {
                logger.debug({ namespace: namespaceName }, 'No numeric vectors found');
              }
            }
          }
        } catch (error: unknown) {
          logger.warn(
            { error: error instanceof Error ? error.message : String(error) },
            'Error during numeric filename cleanup'
          );
        }
      }

      logger.info({ deletedCount }, 'Cleanup completed');
      return res.status(200).json({
        success: true,
        message: `Targeted cleanup completed. Deleted ${deletedCount} vectors.`,
        deletedCount,
      });
    } catch (error: unknown) {
      logger.error({ error }, 'Error during targeted cleanup');
      return res.status(500).json({
        success: false,
        message: 'Error during targeted cleanup',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

// ================================================
//        SYSTEM KB DOCUMENT ROUTES
// ================================================

// --- GET List System KB Documents ---
router.get(
  '/system-kb/documents',
  async (req: Request, res: Response): Promise<void | Response> => {
    logger.info('Request received for listing System KB documents');
    try {
      // UPDATED: Use SystemKbDocument model instead of UserDocument to match what's used in controllers
      logger.debug('Querying SystemKbDocument model');
      const systemDocs = await SystemKbDocument.find({})
        .select('_id filename s3Key fileUrl fileSize createdAt updatedAt')
        .sort({ createdAt: -1 });

      // Convert to format expected by frontend
      const formattedDocs = systemDocs.map(doc => ({
        _id: doc._id,
        originalFileName: doc.filename,
        uploadTimestamp: doc.createdAt,
        fileSize: doc.fileSize || 0, // Use fileSize from the model or default to 0
        // Set default values for other expected fields
        mimeType: 'application/pdf',
        status: 'completed',
      }));

      logger.info({ count: formattedDocs.length }, 'Found System KB documents');
      return res.status(200).json({ success: true, documents: formattedDocs });
    } catch (error) {
      logger.error({ error }, 'Error fetching System KB documents');
      return res.status(500).json({
        success: false,
        message: 'Error fetching System KB documents.',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/**
 * @route   POST /api/admin/system-kb/upload
 * @desc    Upload a document to the System Knowledge Base
 * @access  Private (Admin only)
 */
router.post('/system-kb/upload', upload.array('files', 50), uploadSystemKb);

// --- DELETE System KB Document ---
router.delete('/system-kb/documents/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const adminUserId = req.user?._id; // ID of the admin performing the action

  logger.info({ documentId: id, adminUserId }, 'Request to delete System KB document');

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: 'Invalid document ID format.' });
  }

  try {
    // 1. Find the document to ensure it exists & get storage info
    const document = await SystemKbDocument.findById(id);

    if (!document) {
      logger.warn({ documentId: id }, 'System KB document not found');
      return res.status(404).json({ success: false, message: 'System KB document not found.' });
    }

    // 2. Delete vectors from Pinecone
    logger.debug({ documentId: id }, 'Deleting vectors for System KB doc');
    await deleteSystemDocument(id);
    logger.debug({ documentId: id }, 'Pinecone deletion complete');

    // 3. Delete the file from storage (S3 or local)
    try {
      const useS3 = isS3Storage();

      if (useS3) {
        logger.debug({ s3Key: document.s3Key }, 'Deleting S3 object');
        await s3Helper.deleteFile(document.s3Key);
      } else {
        logger.debug({ s3Key: document.s3Key }, 'Deleting local file');
        await localStorageHelper.deleteFile(document.s3Key);
      }
      logger.debug({ documentId: id }, 'Storage deletion complete');
    } catch (storageError) {
      logger.error({ storageError }, 'Storage deletion failed (continuing)');
    }

    // 4. Delete the document metadata from MongoDB
    await SystemKbDocument.findByIdAndDelete(id);
    logger.info({ documentId: id }, 'Deleted MongoDB record');

    return res
      .status(200)
      .json({ success: true, message: 'System KB document deleted successfully.' });
  } catch (error) {
    logger.error({ error, documentId: id }, 'Error deleting System KB document');
    return res.status(500).json({
      success: false,
      message: 'Error deleting System KB document.',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// --- RE-INDEX System KB Document ---
router.post('/system-kb/reindex/:documentId', async (req: Request, res: Response) => {
  const { documentId } = req.params;
  const adminUserId = req.user?._id;

  logger.info({ documentId, adminUserId }, 'Request received to re-index System KB document');

  if (!mongoose.Types.ObjectId.isValid(documentId)) {
    return res.status(400).json({ success: false, message: 'Invalid document ID format.' });
  }

  let document: IUserDocument | null = null;

  try {
    // 1. Fetch Document Metadata & Verify Type & S3 Info
    document = (await UserDocument.findById(documentId).select(
      's3Bucket s3Key originalFileName sourceType'
    )) as IUserDocument | null; // Get S3 info and sourceType
    if (!document || document.sourceType !== 'system' || !document.s3Bucket || !document.s3Key) {
      return res.status(404).json({
        success: false,
        message: 'System document not found, invalid type, or missing S3 info.',
      });
    }
    await UserDocument.findByIdAndUpdate(documentId, {
      status: 'reindexing',
      processingError: null,
    }); // Clear previous error
    logger.debug({ documentId }, 'Document status set to reindexing');

    // 2. Delete Existing Vectors from Pinecone
    logger.debug({ documentId }, 'Deleting existing vectors for document');
    await deleteVectorsByFilter({ documentId: documentId });
    logger.debug('Deleted existing vectors');

    // 3. Trigger async processing (The processing function needs to fetch from S3)
    logger.debug({ documentId }, 'TODO: Trigger async processing for doc using S3 info');
    // Example: triggerSystemDocProcessing(documentId, document.s3Bucket, document.s3Key);
    // Since processing is async, we return success here, status will update later.

    // Note: We don't re-process synchronously here anymore.
    // The background process will fetch from S3, process, embed, upsert vectors, and update status.

    return res.status(200).json({
      success: true,
      message: `Re-indexing started for document '${document.originalFileName}'. Status will update upon completion.`,
      documentId: documentId,
    });
  } catch (error: unknown) {
    logger.error({ error, documentId }, 'Error starting re-index');
    if (documentId) {
      // Attempt to mark as failed if possible
      await UserDocument.findByIdAndUpdate(documentId, {
        status: 'failed',
        processingError: `Re-indexing failed: ${error instanceof Error ? error.message : String(error)}`,
      }).catch(_err => {});
    }
    return res.status(500).json({
      success: false,
      message: 'Failed to start re-indexing.',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @route   DELETE /api/admin/system-kb/all
 * @desc    Delete all system knowledge base documents
 * @access  Private (Admin only)
 */
router.delete('/system-kb/all', deleteAllSystemDocuments);

// --- NEW: DOWNLOAD System KB Document ---
router.get('/system-kb/download/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.user?._id;
  const isAdmin = req.user?.role === 'admin';

  logger.info({ documentId: id, userId }, 'Request to download System KB document');

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: 'Invalid document ID format.' });
  }

  try {
    // Fetch the document metadata from SystemKbDocument collection
    const document = await SystemKbDocument.findById(id).select('filename s3Key fileUrl folderId');

    if (!document) {
      logger.warn({ documentId: id }, 'System KB document not found');
      return res.status(404).json({ success: false, message: 'System document not found.' });
    }

    // PERMISSION CHECK: Verify user has access to this document's folder
    if (document.folderId) {
      const { hasAccessToFolder } = await import('../utils/folderPermissionHelper');
      const hasAccess = await hasAccessToFolder(
        userId.toString(),
        isAdmin,
        document.folderId.toString()
      );

      if (!hasAccess) {
        logger.warn(
          { documentId: id, userId, folderId: document.folderId },
          'User denied access to document - insufficient folder permissions'
        );
        return res.status(403).json({
          success: false,
          message: 'Access denied. You do not have permission to access this document.',
        });
      }
    }
    // Documents at root level (no folderId) are accessible to all authenticated users

    // Determine storage mode
    const useS3 = isS3Storage();

    let s3KeyToFetch = document.s3Key; // This should be the UUID

    // If s3Key from DB does not contain a file extension, it's the new UUID format.
    // Construct the full S3 object key: system_docs/UUID.file_extension
    if (!s3KeyToFetch.includes('.')) {
      const fileExtension = path.extname(document.filename); // Get extension from original filename
      if (!fileExtension) {
        logger.error({ filename: document.filename }, 'Could not determine file extension');
        return res.status(500).json({
          success: false,
          message: 'Could not determine file type for S3 key construction.',
        });
      }
      s3KeyToFetch = `${KNOWLEDGE_BASE_S3_PREFIX}${s3KeyToFetch}${fileExtension}`;
      logger.debug({ s3Key: s3KeyToFetch }, 'Constructed S3 key for UUID');
    } else if (useS3 && !s3KeyToFetch.startsWith(KNOWLEDGE_BASE_S3_PREFIX)) {
      // This handles a legacy local storage case where s3Key might be just FILENAME.ext
      // or if a full path was stored for some reason and it's local.
      s3KeyToFetch = `${KNOWLEDGE_BASE_S3_PREFIX}${s3KeyToFetch}`;
      logger.debug({ s3Key: s3KeyToFetch }, 'Local storage path correction applied');
    }
    // If s3KeyToFetch already starts with 'system-kb/' and has an extension (e.g. old format still in DB, or user doc), use as is.

    logger.debug({ s3Key: s3KeyToFetch }, 'Fetching file stream for final key');
    const { getFileStream } = await import('../utils/s3Helper');
    const fileStream = await getFileStream(s3KeyToFetch);

    // Accumulate stream into buffer (could also pipe)
    const chunks: Buffer[] = [];
    for await (const chunk of fileStream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const fileBuffer = Buffer.concat(chunks);

    // Basic MIME type detection from extension
    const contentType = document.filename.endsWith('.pdf')
      ? 'application/pdf'
      : 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${document.filename}"`);
    res.setHeader('Content-Length', fileBuffer.length.toString());

    logger.info({ filename: document.filename, size: fileBuffer.length }, 'Streaming file');
    return res.send(fileBuffer);
  } catch (error) {
    logger.error({ error, documentId: id }, 'Error downloading System KB document');
    return res.status(500).json({
      success: false,
      message: 'Error downloading System KB document.',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
// --- END NEW ROUTE ---

// ================================================
//          USER MANAGEMENT ROUTES
// ================================================

// --- GET List All Users (Admin) ---
/**
 * @route   GET /api/admin/users
 * @desc    Get a list of all users (excluding passwords)
 * @access  Private (Admin only)
 */
router.get('/users', async (req: Request, res: Response): Promise<void | Response> => {
  logger.info({ adminUserId: req.user?._id }, 'Request received for user list');
  try {
    // Fetch all users, excluding password and potentially other sensitive fields
    const users = await User.find()
      .select('-password') // Exclude password
      .sort({ username: 1 }); // Sort alphabetically by username

    logger.info({ count: users.length }, 'Found users');
    return res.status(200).json({ success: true, users });
  } catch (error) {
    logger.error({ error }, 'Error fetching users');
    return res.status(500).json({
      success: false,
      message: 'Error fetching user list.',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// --- DELETE User (Admin) ---
/**
 * @route   DELETE /api/admin/users/:userId
 * @desc    Delete a user account
 * @access  Private (Admin only)
 */
router.delete(
  '/users/:userId',
  protect,
  checkSession,
  isAdmin,
  async (req: Request, res: Response) => {
    const userIdToDelete = req.params.userId;
    const adminUserId = req.user?._id;

    logger.info({ userIdToDelete, adminUserId }, 'Request to delete user');

    // Basic validation
    if (!mongoose.Types.ObjectId.isValid(userIdToDelete)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID format.' });
    }
    if (adminUserId && adminUserId.toString() === userIdToDelete) {
      return res
        .status(400)
        .json({ success: false, message: 'Admin cannot delete their own account.' });
    }

    try {
      const result = await User.deleteOne({ _id: userIdToDelete });
      if (result.deletedCount === 0) {
        return res.status(404).json({ success: false, message: 'User not found.' });
      }
      logger.info({ userId: userIdToDelete }, 'User deleted successfully');
      return res.status(200).json({ success: true, message: 'User deleted successfully.' });
    } catch (error: unknown) {
      logger.error({ error, userId: userIdToDelete }, 'Error deleting user');
      return res.status(500).json({
        success: false,
        message: 'Error deleting user.',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

// --- PUT Change User Password (Admin) ---
/**
 * @route   PUT /api/admin/users/:userId/password
 * @desc    Change a specific user's password
 * @access  Private (Admin only)
 */
router.put(
  '/users/:userId/password',
  protect,
  checkSession,
  isAdmin,
  async (req: Request, res: Response) => {
    const userIdToUpdate = req.params.userId;
    const { newPassword } = req.body;

    logger.info({ userId: userIdToUpdate }, 'Request to change password for user');

    // Basic validation
    if (!mongoose.Types.ObjectId.isValid(userIdToUpdate)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID format.' });
    }
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
      return res
        .status(400)
        .json({ success: false, message: 'New password must be at least 6 characters long.' });
    }

    try {
      const user = await User.findById(userIdToUpdate);
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found.' });
      }
      // Use centralized bcrypt work factor
      user.password = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
      user.forcePasswordChange = false; // Clear the force password change flag
      await user.save();
      logger.info({ userId: userIdToUpdate }, 'Password updated for user');
      return res
        .status(200)
        .json({ success: true, message: 'User password updated successfully.' });
    } catch (error: unknown) {
      logger.error({ error, userId: userIdToUpdate }, 'Error updating password for user');
      return res.status(500).json({
        success: false,
        message: 'Error updating user password.',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

// --- POST Create User (Admin) ---
/**
 * @route   POST /api/admin/users
 * @desc    Create a new user (Admin only)
 * @access  Private (Admin only)
 */
router.post(
  '/users',
  protect,
  checkSession,
  isAdmin,
  sanitizeInputMiddleware, // MEDIUM-007: Sanitize username and other text fields
  validatePasswordMiddleware, // MEDIUM-005: Validate password if provided
  async (req: Request, res: Response): Promise<void | Response> => {
    const { username, email, role = 'user', password } = req.body;

    logger.info({ username, role }, 'Request to create user');

    // Validation
    if (!username || typeof username !== 'string' || username.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Username is required',
      });
    }

    // Email is optional for now (placeholder for future implementation)
    // Generate placeholder email if not provided
    const emailRegex = /^\S+@\S+\.\S+$/;
    let finalEmail = email;

    if (!email || typeof email !== 'string' || email.trim() === '') {
      // Generate placeholder email: username@placeholder.local
      finalEmail = `${username.trim()}@placeholder.local`;
      logger.info({ username, generatedEmail: finalEmail }, 'No email provided, generated placeholder');
    } else if (!emailRegex.test(email)) {
      // If email provided but invalid format, reject
      return res.status(400).json({
        success: false,
        message: 'Invalid email format',
      });
    }

    // Validate role
    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role. Must be either "user" or "admin"',
      });
    }

    const trimmedUsername = username.trim();
    const trimmedEmail = finalEmail.trim().toLowerCase();

    try {
      // Check if user already exists
      const existingUser = await User.findOne({
        $or: [{ username: trimmedUsername }, { email: trimmedEmail }],
      });

      if (existingUser) {
        const field = existingUser.username === trimmedUsername ? 'Username' : 'Email';
        return res.status(409).json({
          success: false,
          message: `${field} already exists`,
        });
      }

      // Import password utilities
      const { generateSecurePassword } = await import('../utils/passwordUtils');
      const { sendWelcomeEmail } = await import('../services/emailService');

      // Use provided password or generate temporary password
      const tempPassword = password || generateSecurePassword();
      const hashedPassword = await bcrypt.hash(tempPassword, BCRYPT_SALT_ROUNDS);
      const shouldForcePasswordChange = !password; // Only force password change if password was auto-generated

      // Create new user
      const newUser = await User.create({
        username: trimmedUsername,
        email: trimmedEmail,
        password: hashedPassword,
        role,
        forcePasswordChange: shouldForcePasswordChange, // Only force if password was auto-generated
        // Default persona settings
        isPersonaEnabled: false,
        canCustomizePersona: false,
      });

      logger.info({ userId: newUser._id }, 'Successfully created user');

      // Send welcome email with temporary password (only if real email provided)
      let emailSent = false;
      const isPlaceholderEmail = trimmedEmail.endsWith('@placeholder.local');

      if (!isPlaceholderEmail) {
        emailSent = await sendWelcomeEmail(trimmedEmail, trimmedUsername, tempPassword);
        if (!emailSent) {
          logger.warn({ email: trimmedEmail }, 'Failed to send welcome email');
        }
      } else {
        logger.info({ username: trimmedUsername }, 'Placeholder email detected, skipping welcome email');
      }

      // Return success response with temp password for admin to share
      return res.status(201).json({
        success: true,
        message: 'User created successfully',
        user: {
          _id: newUser._id,
          username: newUser.username,
          email: newUser.email,
          role: newUser.role,
          createdAt: newUser.createdAt,
        },
        tempPassword,
        emailSent,
      });
    } catch (error: unknown) {
      logger.error({ error }, 'Error creating user');
      return res.status(500).json({
        success: false,
        message: 'Failed to create user',
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }
);

// --- PATCH Update User Role (Admin) ---
/**
 * @route   PATCH /api/admin/users/:userId/role
 * @desc    Update a user's role (user/admin)
 * @access  Private (Admin only)
 */
router.patch('/users/:userId/role', updateUserRole);

// --- GET User By ID (Admin) --- Needs implementation or use controller if exists
router.get('/users/:userId', async (req, res) => {
  // Example: Logic for getting user by ID
  res.status(501).json({ message: 'Get user by ID endpoint not fully implemented' });
});

// ================================================
//          FEEDBACK MANAGEMENT ROUTES (Admin)
// ================================================

// --- GET All Feedback ---
/**
 * @route   GET /api/admin/feedback
 * @desc    Get all user feedback entries
 * @access  Private (Admin only)
 */
router.get('/feedback', getAllFeedback); // Middleware applied via router.use()

// --- DELETE Feedback by ID ---
/**
 * @route   DELETE /api/admin/feedback/:feedbackId
 * @desc    Delete a specific feedback entry
 * @access  Private (Admin only)
 */
router.delete('/feedback/:feedbackId', deleteFeedbackById); // Middleware applied via router.use()

// --- DELETE All Feedback ---
/**
 * @route   DELETE /api/admin/feedback
 * @desc    Delete all feedback entries
 * @access  Private (Admin only)
 */
router.delete('/feedback', deleteAllFeedback); // Middleware applied via router.use()

// ================================================
//          USAGE STATISTICS ROUTES (Admin)
// ================================================

// --- GET Grand Total System Statistics ---
/**
 * @route   GET /api/admin/stats/summary
 * @desc    Get grand total system statistics
 * @access  Private (Admin only)
 */
router.get('/stats/summary', getSystemGrandTotals);

/**
 * @route   GET /api/admin/stats
 * @desc    Get grand total system statistics (alias for /stats/summary)
 * @access  Private (Admin only)
 */
router.get('/stats', getSystemGrandTotals);

// --- GET All User Usage Data ---
/**
 * @route   GET /api/admin/usage
 * @desc    Get usage statistics for all users
 * @access  Private (Admin only)
 */
router.get('/usage', async (req: Request, res: Response): Promise<void | Response> => {
  logger.info('Request received to fetch usage for all users');
  try {
    const usersUsage = await User.find({}) // Find all users
      .select(
        'username role usageMonthMarker currentMonthPromptTokens currentMonthCompletionTokens currentMonthCost'
      )
      .lean(); // Use lean for performance

    // Optional: Add totalTokens to each user object
    const formattedUsage = usersUsage.map(u => ({
      ...u,
      totalTokens: (u.currentMonthPromptTokens || 0) + (u.currentMonthCompletionTokens || 0),
    }));

    logger.info({ count: formattedUsage.length }, 'Found usage data for users');
    res.status(200).json({ success: true, usersUsage: formattedUsage });
  } catch (error) {
    logger.error({ error }, 'Error fetching all users usage');
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user usage data.',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// --- USER SETTINGS ROUTES ---
/**
 * @route   GET /api/admin/user-settings
 * @desc    Get all user settings
 * @access  Private (Admin only)
 */
router.get('/user-settings', getAllUserSettings);

/**
 * @route   GET /api/admin/user-settings/:userId
 * @desc    Get settings for a specific user
 * @access  Private (Admin only)
 */
router.get('/user-settings/:userId', getUserSettings);

/**
 * @route   PUT /api/admin/user-settings/:userId
 * @desc    Update settings for a specific user
 * @access  Private (Admin only)
 */
router.put('/user-settings/:userId', updateUserSettings);

/**
 * @route   DELETE /api/admin/user-settings/:userId
 * @desc    Delete settings for a specific user
 * @access  Private (Admin only)
 */
router.delete('/user-settings/:userId', deleteUserSettings);

// ================================================
//          DOCUMENT MANAGEMENT ROUTES
// ================================================

/**
 * @route   POST /api/admin/reindex-user-documents
 * @desc    Re-index all documents for a specific user (fixes data integrity issues)
 * @access  Private (Admin only)
 */
router.post('/reindex-user-documents', reindexUserDocuments);

/**
 * @route   POST /api/admin/purge-documents-from-default-namespace
 * @desc    Purge specific documents from the default Pinecone namespace (One-time cleanup tool)
 * @access  Private (Admin only)
 */
router.post('/purge-documents-from-default-namespace', purgeDocumentsFromDefaultNamespace);

// ================================================
//          TENANT KNOWLEDGE BASE ROUTES
// ================================================

/**
 * @route   POST /api/admin/tenant-kb
 * @desc    Create a new tenant knowledge base
 * @access  Private (Admin only)
 */
router.post('/tenant-kb', createTenantKB);

/**
 * @route   GET /api/admin/tenant-kb
 * @desc    Get all tenant knowledge bases
 * @access  Private (Admin only)
 */
router.get('/tenant-kb', getAllTenantKBs);

/**
 * @route   GET /api/admin/tenant-kb/:id
 * @desc    Get a specific tenant knowledge base
 * @access  Private (Admin only)
 */
router.get('/tenant-kb/:id', getTenantKBById);

/**
 * @route   PUT /api/admin/tenant-kb/:id
 * @desc    Update a tenant knowledge base
 * @access  Private (Admin only)
 */
router.put('/tenant-kb/:id', updateTenantKB);

/**
 * @route   DELETE /api/admin/tenant-kb/:id
 * @desc    Delete a tenant knowledge base
 * @access  Private (Admin only)
 */
router.delete('/tenant-kb/:id', deleteTenantKB);

/**
 * @route   GET /api/admin/tenant-kb/:id/documents
 * @desc    Get all documents for a specific tenant knowledge base
 * @access  Private (Admin only)
 */
router.get('/tenant-kb/:id/documents', getTenantKBDocuments);

/**
 * @route   POST /api/admin/tenant-kb/:id/users
 * @desc    Add users to a tenant knowledge base
 * @access  Private (Admin only)
 */
router.post('/tenant-kb/:id/users', addUsersToKB);

/**
 * @route   DELETE /api/admin/tenant-kb/:id/users
 * @desc    Remove users from a tenant knowledge base
 * @access  Private (Admin only)
 */
router.delete('/tenant-kb/:id/users', removeUsersFromKB);

// Route to re-index all System KB documents
router.post('/reindex-system-kb', reindexSystemKb);

/**
 * @route   POST /api/admin/fix-metadata-dryrun
 * @desc    Run System KB metadata fix in dry-run mode
 * @access  Admin only
 */
router.post(
  '/fix-metadata-dryrun',
  asyncHandler(async (req: Request, res: Response) => {
    const adminUserId = req.user?._id;
    logger.info({ adminUserId }, 'Metadata fix dry-run requested');

    try {
      // Import the fix function
      const { fixSystemKbMetadata } = await import('../scripts/fix-system-kb-metadata');

      // Capture console output
      const logs: string[] = [];
      const originalLog = console.log;
      const originalError = console.error;

      console.log = (...args) => {
        logs.push(args.join(' '));
        originalLog(...args);
      };

      console.error = (...args) => {
        logs.push(`ERROR: ${args.join(' ')}`);
        originalError(...args);
      };

      // Run in dry-run mode
      await fixSystemKbMetadata({ dryRun: true });

      // Restore console
      console.log = originalLog;
      console.error = originalError;

      return res.status(200).json({
        success: true,
        message: 'Metadata fix dry-run completed',
        logs: logs,
        timestamp: new Date().toISOString(),
      });
    } catch (error: unknown) {
      logger.error({ error }, 'Metadata fix dry-run failed');
      return res.status(500).json({
        success: false,
        message: 'Metadata fix dry-run failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

// Route to get stats for a Pinecone namespace
router.get('/pinecone-namespace-stats', getPineconeNamespaceStats);

// Add this after other admin routes, before the export
router.get(
  '/pinecone-stats',
  protect,
  checkSession,
  isAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const { getPineconeIndex } = await import('../utils/pineconeService');

    try {
      const index = await getPineconeIndex();

      // Get stats for different namespaces
      const namespaces = ['', 'system-kb']; // '' is the default namespace
      const stats: Record<string, unknown> = {};

      for (const namespace of namespaces) {
        const nsStats = await index.namespace(namespace).describeIndexStats();
        stats[namespace || 'default'] = nsStats;
      }

      res.json({
        success: true,
        stats,
        indexName: process.env.PINECONE_INDEX_NAME,
      });
    } catch (error: unknown) {
      logger.error({ error }, 'Error fetching Pinecone stats');
      res.status(500).json({
        success: false,
        message: 'Failed to fetch Pinecone stats',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

// Route: One-off re-indexing of *all* user documents
router.post('/reindex-user-docs', triggerUserReindexing);

// Route: Get server information
router.get(
  '/server-info',
  protect,
  checkSession,
  isAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const uptime = process.uptime();
      const memoryUsage = process.memoryUsage();

      res.json({
        success: true,
        serverInfo: {
          version: process.env.npm_package_version || '1.0.0',
          environment: process.env.NODE_ENV || 'development',
          nodeVersion: process.version,
          uptime: {
            seconds: Math.floor(uptime),
            formatted: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`,
          },
          memory: {
            rss: memoryUsage.rss,
            heapTotal: memoryUsage.heapTotal,
            heapUsed: memoryUsage.heapUsed,
            external: memoryUsage.external,
            arrayBuffers: memoryUsage.arrayBuffers,
            formatted: {
              rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
              heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
              heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
            },
          },
          database: {
            status: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
            host: mongoose.connection.host,
            name: mongoose.connection.name,
          },
        },
      });
    } catch (error: unknown) {
      logger.error({ error }, 'Error fetching server info');
      res.status(500).json({
        success: false,
        message: 'Failed to fetch server info',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

// ================================================
//          AUDIT LOG ROUTES
// ================================================

/**
 * @route   GET /api/admin/audit-logs
 * @desc    Get audit logs with filters and pagination
 * @access  Private (Admin only)
 */
router.get(
  '/audit-logs',
  asyncHandler(async (req: Request, res: Response) => {
    logger.info({ adminUserId: req.user?._id }, 'Request for audit logs');

    try {
      // Parse query parameters
      const filters: AuditLogFilters = {};

      if (req.query.userId) filters.userId = req.query.userId as string;
      if (req.query.username) filters.username = req.query.username as string;
      if (req.query.action) filters.action = req.query.action as AuditAction;
      if (req.query.resource) filters.resource = req.query.resource as AuditResource;
      if (req.query.success !== undefined) filters.success = req.query.success === 'true';
      if (req.query.correlationId) filters.correlationId = req.query.correlationId as string;
      if (req.query.ipAddress) filters.ipAddress = req.query.ipAddress as string;
      if (req.query.startDate) filters.startDate = new Date(req.query.startDate as string);
      if (req.query.endDate) filters.endDate = new Date(req.query.endDate as string);

      const pagination = {
        page: parseInt(req.query.page as string) || 1,
        limit: Math.min(parseInt(req.query.limit as string) || 50, 100),
        sortBy: (req.query.sortBy as string) || 'timestamp',
        sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
      };

      const result = await getAuditLogs(filters, pagination);

      logger.info({ count: result.logs.length, total: result.total }, 'Returning audit logs');
      return res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error: unknown) {
      logger.error({ error }, 'Error fetching audit logs');
      return res.status(500).json({
        success: false,
        message: 'Error fetching audit logs',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

/**
 * @route   GET /api/admin/audit-logs/stats
 * @desc    Get aggregated audit statistics
 * @access  Private (Admin only)
 */
router.get(
  '/audit-logs/stats',
  asyncHandler(async (req: Request, res: Response) => {
    logger.info({ adminUserId: req.user?._id }, 'Request for audit stats');

    try {
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

      const stats = await getAuditStats(startDate, endDate);

      logger.info({ totalEvents: stats.totalEvents }, 'Returning audit stats');
      return res.status(200).json({
        success: true,
        stats,
      });
    } catch (error: unknown) {
      logger.error({ error }, 'Error fetching audit stats');
      return res.status(500).json({
        success: false,
        message: 'Error fetching audit statistics',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

/**
 * @route   GET /api/admin/audit-logs/export
 * @desc    Export audit logs to JSON or CSV
 * @access  Private (Admin only)
 */
router.get(
  '/audit-logs/export',
  asyncHandler(async (req: Request, res: Response) => {
    logger.info({ adminUserId: req.user?._id }, 'Request to export audit logs');

    try {
      const filters: AuditLogFilters = {};

      if (req.query.userId) filters.userId = req.query.userId as string;
      if (req.query.action) filters.action = req.query.action as AuditAction;
      if (req.query.resource) filters.resource = req.query.resource as AuditResource;
      if (req.query.startDate) filters.startDate = new Date(req.query.startDate as string);
      if (req.query.endDate) filters.endDate = new Date(req.query.endDate as string);

      const format = (req.query.format as 'json' | 'csv') || 'json';
      const exportData = await exportAuditLogs(filters, format);

      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=audit-logs.csv');
      } else {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename=audit-logs.json');
      }

      logger.info({ format }, 'Exporting audit logs');
      return res.send(exportData);
    } catch (error: unknown) {
      logger.error({ error }, 'Error exporting audit logs');
      return res.status(500).json({
        success: false,
        message: 'Error exporting audit logs',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

/**
 * @route   DELETE /api/admin/audit-logs/all
 * @desc    Delete all audit logs (DANGER ZONE)
 * @access  Private (Admin only)
 */
router.delete(
  '/audit-logs/all',
  auditAdminAction,
  asyncHandler(async (req: Request, res: Response) => {
    const adminUserId = req.user?._id;

    logger.warn({ adminUserId }, 'DANGER ZONE: Request to delete ALL audit logs');

    try {
      const AuditLog = (await import('../models/AuditLogModel')).default;
      const result = await AuditLog.deleteMany({});

      logger.warn({ deletedCount: result.deletedCount, adminUserId }, 'All audit logs deleted');
      return res.status(200).json({
        success: true,
        message: `Deleted ${result.deletedCount} audit logs`,
        deletedCount: result.deletedCount,
      });
    } catch (error: unknown) {
      logger.error({ error }, 'Error deleting all audit logs');
      return res.status(500).json({
        success: false,
        message: 'Error deleting all audit logs',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

// ================================================
//          FEATURE TOGGLE ROUTES
// ================================================

/**
 * @route   GET /api/admin/features
 * @desc    Get all feature toggles
 * @access  Private (Admin only)
 */
router.get(
  '/features',
  asyncHandler(async (req: Request, res: Response) => {
    logger.info({ adminUserId: req.user?._id }, 'Request for feature toggles');

    try {
      const features = await getAllFeatureToggles();

      logger.info({ count: features.length }, 'Returning feature toggles');
      return res.status(200).json({
        success: true,
        features,
      });
    } catch (error: unknown) {
      logger.error({ error }, 'Error fetching feature toggles');
      return res.status(500).json({
        success: false,
        message: 'Error fetching feature toggles',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

/**
 * @route   PUT /api/admin/features/:feature
 * @desc    Update a feature toggle
 * @access  Private (Admin only)
 */
router.put(
  '/features/:feature',
  auditFeatureToggle,
  asyncHandler(async (req: Request, res: Response) => {
    const { feature } = req.params;
    const { enabled, config } = req.body;
    const adminUserId = req.user?._id;

    logger.info({ feature, enabled, adminUserId }, 'Request to update feature toggle');

    // Validate feature name
    const validFeatures: FeatureName[] = [
      'audit_logs',
      'session_management',
      'budget_enforcement',
      'pii_detection',
      'ip_whitelist',
      'realtime_dashboard',
    ];

    if (!validFeatures.includes(feature as FeatureName)) {
      return res.status(400).json({
        success: false,
        message: `Invalid feature name. Valid features: ${validFeatures.join(', ')}`,
      });
    }

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'enabled must be a boolean',
      });
    }

    try {
      const updatedToggle = await setFeatureToggle(
        feature as FeatureName,
        enabled,
        adminUserId,
        config
      );

      if (!updatedToggle) {
        return res.status(500).json({
          success: false,
          message: 'Failed to update feature toggle',
        });
      }

      logger.info({ feature, enabled }, 'Feature toggle updated');
      return res.status(200).json({
        success: true,
        message: `Feature '${feature}' ${enabled ? 'enabled' : 'disabled'}`,
        feature: updatedToggle,
      });
    } catch (error: unknown) {
      logger.error({ error, feature }, 'Error updating feature toggle');
      return res.status(500).json({
        success: false,
        message: 'Error updating feature toggle',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

/**
 * @route   POST /api/admin/features/initialize
 * @desc    Initialize all feature toggles with defaults
 * @access  Private (Admin only)
 */
router.post(
  '/features/initialize',
  asyncHandler(async (req: Request, res: Response) => {
    const adminUserId = req.user?._id;

    logger.info({ adminUserId }, 'Request to initialize feature toggles');

    try {
      await initializeFeatureToggles(adminUserId);
      const features = await getAllFeatureToggles();

      logger.info({ count: features.length }, 'Feature toggles initialized');
      return res.status(200).json({
        success: true,
        message: 'Feature toggles initialized',
        features,
      });
    } catch (error: unknown) {
      logger.error({ error }, 'Error initializing feature toggles');
      return res.status(500).json({
        success: false,
        message: 'Error initializing feature toggles',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

// =====================================================
// Knowledge Gap Management Endpoints
// =====================================================

/**
 * @route   GET /api/admin/knowledge-gaps
 * @desc    Get all knowledge gaps with filtering and pagination
 * @access  Private (Admin only)
 */
router.get(
  '/knowledge-gaps',
  asyncHandler(async (req: Request, res: Response) => {
    const {
      status,
      minOccurrences,
      page,
      limit,
      sortBy,
      sortOrder,
    } = req.query;

    logger.info({ query: req.query }, 'Request to get knowledge gaps');

    try {
      // Parse status - can be single value or comma-separated list
      let statusFilter: GapStatus | GapStatus[] | undefined;
      if (status) {
        const statusStr = status as string;
        if (statusStr.includes(',')) {
          statusFilter = statusStr.split(',') as GapStatus[];
        } else {
          statusFilter = statusStr as GapStatus;
        }
      }

      const result = await getKnowledgeGaps({
        status: statusFilter,
        minOccurrences: minOccurrences ? parseInt(minOccurrences as string) : undefined,
        page: page ? parseInt(page as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
        sortBy: sortBy as 'occurrenceCount' | 'lastAskedAt' | 'firstAskedAt' | undefined,
        sortOrder: sortOrder as 'asc' | 'desc' | undefined,
      });

      return res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error: unknown) {
      logger.error({ error }, 'Error fetching knowledge gaps');
      return res.status(500).json({
        success: false,
        message: 'Error fetching knowledge gaps',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

/**
 * @route   GET /api/admin/knowledge-gaps/count
 * @desc    Get count of new (unreviewed) knowledge gaps for notification badge
 * @access  Private (Admin only)
 */
router.get(
  '/knowledge-gaps/count',
  asyncHandler(async (req: Request, res: Response) => {
    logger.debug('Request to get new knowledge gap count');

    try {
      const count = await getNewGapCount();

      return res.status(200).json({
        success: true,
        count,
      });
    } catch (error: unknown) {
      logger.error({ error }, 'Error fetching knowledge gap count');
      return res.status(500).json({
        success: false,
        message: 'Error fetching knowledge gap count',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

/**
 * @route   GET /api/admin/knowledge-gaps/top
 * @desc    Get top knowledge gaps (most frequently asked unanswered questions)
 * @access  Private (Admin only)
 */
router.get(
  '/knowledge-gaps/top',
  asyncHandler(async (req: Request, res: Response) => {
    const { limit } = req.query;

    logger.info({ limit }, 'Request to get top knowledge gaps');

    try {
      const gaps = await getTopKnowledgeGaps(limit ? parseInt(limit as string) : 10);

      return res.status(200).json({
        success: true,
        gaps,
      });
    } catch (error: unknown) {
      logger.error({ error }, 'Error fetching top knowledge gaps');
      return res.status(500).json({
        success: false,
        message: 'Error fetching top knowledge gaps',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

/**
 * @route   GET /api/admin/knowledge-gaps/stats
 * @desc    Get knowledge gap statistics
 * @access  Private (Admin only)
 */
router.get(
  '/knowledge-gaps/stats',
  asyncHandler(async (req: Request, res: Response) => {
    logger.info('Request to get knowledge gap stats');

    try {
      const stats = await getGapStats();

      return res.status(200).json({
        success: true,
        stats,
      });
    } catch (error: unknown) {
      logger.error({ error }, 'Error fetching knowledge gap stats');
      return res.status(500).json({
        success: false,
        message: 'Error fetching knowledge gap stats',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

/**
 * @route   PUT /api/admin/knowledge-gaps/:gapId
 * @desc    Update a knowledge gap status
 * @access  Private (Admin only)
 */
router.put(
  '/knowledge-gaps/:gapId',
  asyncHandler(async (req: Request, res: Response) => {
    const { gapId } = req.params;
    const { status, notes, suggestedDocTitle } = req.body;
    const adminUserId = req.user?._id;

    logger.info({ gapId, status, adminUserId }, 'Request to update knowledge gap');

    if (!gapId || !mongoose.Types.ObjectId.isValid(gapId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid gap ID',
      });
    }

    if (!status || !['new', 'reviewed', 'addressed', 'dismissed'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be one of: new, reviewed, addressed, dismissed',
      });
    }

    if (!adminUserId) {
      return res.status(401).json({
        success: false,
        message: 'Admin user ID required',
      });
    }

    try {
      const gap = await updateGapStatus(
        gapId,
        status as GapStatus,
        adminUserId.toString(),
        notes,
        suggestedDocTitle
      );

      if (!gap) {
        return res.status(404).json({
          success: false,
          message: 'Knowledge gap not found',
        });
      }

      logger.info({ gapId, status }, 'Knowledge gap updated');
      return res.status(200).json({
        success: true,
        gap,
      });
    } catch (error: unknown) {
      logger.error({ error, gapId }, 'Error updating knowledge gap');
      return res.status(500).json({
        success: false,
        message: 'Error updating knowledge gap',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

/**
 * @route   DELETE /api/admin/knowledge-gaps/all
 * @desc    Delete all knowledge gaps (DANGER ZONE)
 * @access  Private (Admin only)
 */
router.delete(
  '/knowledge-gaps/all',
  auditAdminAction,
  asyncHandler(async (req: Request, res: Response) => {
    const adminUserId = req.user?._id;

    logger.warn({ adminUserId }, 'DANGER ZONE: Request to delete ALL knowledge gaps');

    try {
      const KnowledgeGap = (await import('../models/KnowledgeGapModel')).default;
      const result = await KnowledgeGap.deleteMany({});

      logger.warn({ deletedCount: result.deletedCount, adminUserId }, 'All knowledge gaps deleted');
      return res.status(200).json({
        success: true,
        message: `Deleted ${result.deletedCount} knowledge gaps`,
        deletedCount: result.deletedCount,
      });
    } catch (error: unknown) {
      logger.error({ error }, 'Error deleting all knowledge gaps');
      return res.status(500).json({
        success: false,
        message: 'Error deleting all knowledge gaps',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

/**
 * @route   DELETE /api/admin/knowledge-gaps/:gapId
 * @desc    Delete a knowledge gap
 * @access  Private (Admin only)
 */
router.delete(
  '/knowledge-gaps/:gapId',
  asyncHandler(async (req: Request, res: Response) => {
    const { gapId } = req.params;

    logger.info({ gapId }, 'Request to delete knowledge gap');

    if (!gapId || !mongoose.Types.ObjectId.isValid(gapId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid gap ID',
      });
    }

    try {
      const deleted = await deleteGap(gapId);

      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: 'Knowledge gap not found',
        });
      }

      logger.info({ gapId }, 'Knowledge gap deleted');
      return res.status(200).json({
        success: true,
        message: 'Knowledge gap deleted',
      });
    } catch (error: unknown) {
      logger.error({ error, gapId }, 'Error deleting knowledge gap');
      return res.status(500).json({
        success: false,
        message: 'Error deleting knowledge gap',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

export default router;
