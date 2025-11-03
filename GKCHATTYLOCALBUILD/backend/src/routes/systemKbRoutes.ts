import express, { Request, Response, Router } from 'express';
import mongoose from 'mongoose';
import path from 'path';
import { protect, isAdmin, checkSession } from '../middleware/authMiddleware';
import { UserDocumentModel as UserDocument, IUserDocument } from '../utils/modelFactory';
import { deleteVectorsByFilter } from '../utils/pineconeService';
import { deleteFile } from '../utils/s3Helper'; // Removed getPresignedUrlForView, getFileStream
// import { processAndEmbedDocument } from '../utils/documentProcessor'; // Removed processAndEmbedDocument
import { NextFunction } from 'express';
import { KNOWLEDGE_BASE_S3_PREFIX } from '../config/storageConfig';
import { getLogger } from '../utils/logger';

const router: Router = express.Router();
const logger = getLogger('systemKbRoutes');

// Apply middleware per-route instead of globally for this router
// router.use(protect, checkSession, isAdmin); <-- REMOVED

// --- Publicly Accessible Route (Authenticated Users) ---

/**
 * @route   GET /api/system-kb/documents
 * @desc    Get list of COMPLETED system knowledge base documents (metadata for selection)
 * @access  Private (Requires login, NO admin needed)
 */
router.get(
  '/documents',
  protect,
  checkSession,
  async (req: Request, res: Response): Promise<void | Response> => {
    logger.info('Public system KB documents list request received');
    try {
      // Fetch docs from SystemKbDocument collection only
      const { SystemKbDocument } = await import('../models/SystemKbDocument');
      const docs = await SystemKbDocument.find({}).select('_id filename').lean();

      // Format and sort documents
      const responseDocs = docs
        .map(d => ({
          _id: d._id.toString(),
          filename: d.filename,
        }))
        .sort((a, b) => a.filename.localeCompare(b.filename));

      logger.info({ count: responseDocs.length }, 'Public system KB documents returned');

      return res.status(200).json({ success: true, documents: responseDocs });
    } catch (error) {
      logger.error({ error }, 'Error fetching public system documents');
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch system document list.',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

// --- Admin Only Routes ---

/**
 * @route   GET /api/system-kb/
 * @desc    Admin: Get list of ALL system knowledge base documents (full metadata)
 * @access  Private (Admin only)
 */
router.get(
  '/',
  protect,
  checkSession,
  isAdmin,
  async (req: Request, res: Response): Promise<void | Response> => {
    logger.info('Admin fetching system KB documents');

    if (!req.user) {
      logger.error('User context missing after protect/checkSession middleware');
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    try {
      const systemDocuments = await UserDocument.find({
        sourceType: 'system',
      })
        .select('_id originalFileName uploadTimestamp fileSize mimeType status') // Consistent fields
        .sort({ originalFileName: 1 })
        .lean<IUserDocument[]>(); // Use lean with type

      logger.info({ count: systemDocuments.length }, 'Admin system KB documents found');

      return res.status(200).json({ success: true, documents: systemDocuments });
    } catch (error) {
      logger.error({ error }, 'Admin error fetching system documents');
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch system knowledge base documents.',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/**
 * @route   GET /api/system-kb/download/:id
 * @desc    Serve a specific System Knowledge Base document file (for viewing)
 * @access  Private (Requires login, NO admin needed)
 */
router.get(
  '/download/:id',
  protect,
  checkSession,
  async (req: Request, res: Response, next: NextFunction): Promise<void | Response> => {
    const { id: docId } = req.params; // Rename to docId for clarity
    const userId = req.user?._id; // Logged for context

    logger.info({ docId, userId }, 'Serve system document request');

    if (!mongoose.Types.ObjectId.isValid(docId)) {
      logger.warn({ docId }, 'Invalid document ID format');
      return res.status(400).json({ success: false, message: 'Invalid document ID format.' });
    }

    // --- START: Added Try/Catch Block ---
    try {
      // Try legacy collection first
      let document: any = await UserDocument.findOne({
        _id: new mongoose.Types.ObjectId(docId),
        sourceType: 'system',
      }).select('s3Bucket s3Key originalFileName mimeType');

      if (!document) {
        const { SystemKbDocument } = await import('../models/SystemKbDocument');
        document = await SystemKbDocument.findById(docId).select('s3Key filename mimeType');
        if (document) {
          // Normalize field names to match legacy logic
          (document as any).originalFileName = document.filename;
          if (!document.mimeType) {
            document.mimeType = document.filename.endsWith('.pdf')
              ? 'application/pdf'
              : 'text/plain';
          }
          // If s3Bucket is missing (which is expected for new SystemKbDocument records), default to the configured bucket name so downstream checks pass.
          if (!('s3Bucket' in document) || !document.s3Bucket) {
            (document as any).s3Bucket = process.env.AWS_BUCKET_NAME || 'local';
          }
        }
      }

      if (!document) {
        logger.warn({ docId }, 'DB lookup failed - system document not found');
        return res.status(404).json({ success: false, message: 'System document not found.' });
      }

      const isLocalStorage = process.env.AWS_BUCKET_NAME === 'local';
      if (
        (!isLocalStorage && !document.s3Bucket) ||
        !document.s3Key ||
        !document.originalFileName ||
        !document.mimeType
      ) {
        logger.error(
          { docId, document },
          'Missing required document properties (S3 info, filename, or mimetype)'
        );
        return res
          .status(500)
          .json({ success: false, message: 'System document metadata is incomplete.' });
      }

      logger.debug(
        {
          filename: document.originalFileName,
          s3Bucket: document.s3Bucket,
          s3Key: document.s3Key,
        },
        'Found document, attempting S3 fetch'
      );

      const { getPresignedUrlForView: getS3PresignedUrl } = await import('../utils/s3Helper');

      let s3KeyToFetch = document.s3Key;

      // If s3Key from DB does not contain a file extension, it's likely a UUID.
      // Construct the full S3 key using the original filename's extension
      if (!s3KeyToFetch.includes('.')) {
        // Extract file extension from original filename
        const fileExtension = path.extname(document.originalFileName) || '.pdf';
        s3KeyToFetch = `${KNOWLEDGE_BASE_S3_PREFIX}${s3KeyToFetch}${fileExtension}`;
        logger.debug(
          { s3KeyToFetch, extension: fileExtension, originalFileName: document.originalFileName },
          'Constructed S3 key for UUID'
        );
      } else if (isLocalStorage && !s3KeyToFetch.startsWith(KNOWLEDGE_BASE_S3_PREFIX)) {
        // This handles the legacy local storage case where s3Key might be just FILENAME.pdf
        s3KeyToFetch = `${KNOWLEDGE_BASE_S3_PREFIX}${s3KeyToFetch}`;
        logger.debug({ s3KeyToFetch }, 'Local storage path correction applied');
      }
      // If s3KeyToFetch already starts with 'system-kb/' and has an extension, use as is.

      logger.debug({ s3KeyToFetch }, 'Final S3 key for getPresignedUrlForView');
      // const fileStream = await getS3FileStream(s3KeyToFetch); // Old direct stream logic

      // New: Generate a presigned URL instead of streaming
      const presignedUrl = await getS3PresignedUrl(s3KeyToFetch, 3600); // 1 hour expiry

      if (!presignedUrl) {
        logger.error({ s3Key: s3KeyToFetch }, 'Failed to generate presigned URL');
        return res.status(500).json({
          success: false,
          message: 'Could not generate secure link for the system document.',
        });
      }

      logger.info({ filename: document.originalFileName }, 'Generated presigned URL');

      return res.status(200).json({
        success: true,
        url: presignedUrl,
        fileName: document.originalFileName, // Send filename for context
        message: 'Presigned URL generated successfully for system document.',
      });
    } catch (error) {
      logger.error({ error, docId, userId }, 'ERROR during system document processing');

      if (error instanceof Error && error.message.includes('S3 GetObject Failed')) {
        logger.error({ docId }, 'Specific S3 GetObject failure');
        if (!res.headersSent) {
          return res.status(500).json({
            success: false,
            message: 'Could not retrieve the system document file from storage.',
          });
        }
        logger.error('Headers already sent when S3 GetObject error occurred');
        return; // Explicitly return undefined here
      }
      if (!res.headersSent) {
        logger.debug({ docId }, 'Passing error to next middleware');
        return next(error); // Ensure we return after calling next
      } else {
        logger.error(
          { docId, error },
          'Cannot pass error to next middleware - headers already sent'
        );
        return;
      }
    }
  }
);

// --- START: Add System Document View Endpoint ---

// Utility function to sanitize filename (prevent path traversal)
// const sanitizeFilename = (filename: string): string | null => { // <-- DELETE/COMMENT
//   // Remove potentially harmful characters and path traversal sequences
//   const cleaned = path.basename(filename).replace(/\.\.\//g, '').replace(/\.\.\\/g, '');
//   // Basic check for allowed characters (adjust regex as needed for your specific filenames)
//   if (!/^[a-zA-Z0-9_\-\s\.()]+$/.test(cleaned)) {
//       console.warn(`[Sanitize Filename] Invalid characters detected in: ${filename} -> ${cleaned}`);
//       return null;
//   }
//   // Ensure it ends with expected extensions
//   if (!cleaned.endsWith('.pdf') && !cleaned.endsWith('.txt')) {
//      console.warn(`[Sanitize Filename] Invalid extension in: ${filename} -> ${cleaned}`);
//      return null;
//   }
//   return cleaned;
// }; // <-- DELETE/COMMENT

// Utility function to get content type (duplicate from documentRoutes, consider moving to utils)
// const getContentType = (filename: string): string => { // <-- DELETE/COMMENT
//     return filename.endsWith('.pdf') ? 'application/pdf' : 'text/plain';
// }; // <-- DELETE/COMMENT

// Handler to serve a specific system KB document by filename
// const handleServeSystemKbDocument = async (req: Request, res: Response, next: NextFunction) => { // <-- DELETE/COMMENT
//   const { filename } = req.params;
//   const userId = req.user?._id; // Logged for context, not used for authorization here

//   console.log(`[Serve System Doc] User ${userId} attempting to view system document filename: ${filename}`);

//   // 1. Sanitize the filename
//   const sanitized = sanitizeFilename(filename);
//   if (!sanitized) {
//     console.error(`[Serve System Doc] Invalid or potentially unsafe filename requested: ${filename}`);
//     return res.status(400).json({ success: false, message: 'Invalid filename.' });
//   }

//   // 2. Lookup metadata for the requested system document
//   console.log(`[Serve System Doc] Looking up metadata for originalFileName: ${sanitized}`);
//   const docMeta = await UserDocument.findOne(
//     { sourceType: 'system', originalFileName: sanitized }
//   )
//     .select('fileName originalFileName mimeType')
//     .lean<IUserDocument>();
//   if (!docMeta) {
//     console.warn(`[Serve System Doc] No metadata found for originalFileName: ${sanitized}`);
//     return res.status(404).json({ success: false, message: 'System document not found.' });
//   }
//   // 3. Construct actual file path using stored fileName
//   const storedFileName = docMeta.fileName;
//   const storedFilePath = path.join(KNOWLEDGE_BASE_DIR, storedFileName);
//   console.log(`[Serve System Doc] Constructed path to stored file: ${storedFilePath} (original: ${sanitized})`);

//   try {
//     // 4. Check if file exists
//     await fsPromises.access(storedFilePath);
//     console.log(`[Serve System Doc] File access confirmed for ${storedFilePath}`);

//     // 5. Determine Content-Type
//     const contentType = getContentType(sanitized);
//     console.log(`[Serve System Doc] Serving file ${sanitized} with Content-Type: ${contentType}`);

//     // 6. Send the file
//     res.setHeader('Content-Type', contentType);
//     res.setHeader('Content-Disposition', `inline; filename="${sanitized}"`); // Use sanitized name

//     res.sendFile(storedFilePath, (err) => {
//       if (err) {
//         console.error(`[Serve System Doc] Error sending file ${storedFilePath}:`, err);
//         if (!res.headersSent) {
//           return next(err);
//         }
//       }
//     });

//   } catch (error: any) {
//     if (error.code === 'ENOENT') {
//       console.warn(`[Serve System Doc] File not found on disk: ${storedFilePath}`);
//       return res.status(404).json({ success: false, message: 'System document file not found on server.' });
//     } else {
//       console.error(`[Serve System Doc] Error processing request for file ${sanitized}:`, error);
//       if (!res.headersSent) {
//           return next(error);
//       }
//       return;
//     }
//   }
// }; // <-- DELETE/COMMENT

// GET /api/system-kb/view/:filename - Serve a specific system document file (requires login)
// router.get('/view/:filename', protect, checkSession, handleServeSystemKbDocument); // <-- DELETE/COMMENT

// --- END: Add System Document View Endpoint ---

// --- START: Add Delete All System KB Endpoint ---

/**
 * @route   DELETE /api/system-kb/all
 * @desc    Admin: Delete ALL System Knowledge Base documents and vectors
 * @access  Private (Admin only)
 */
router.delete(
  '/all',
  protect,
  checkSession,
  isAdmin,
  async (req: Request, res: Response): Promise<void | Response> => {
    logger.info('Admin delete all system KB documents request received');

    if (!req.user) {
      logger.error('User context missing after protect/checkSession middleware');
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    let deletedDbCount = 0;
    let successfulS3Deletions = 0;
    let attemptedS3Deletions = 0;
    const failedS3Keys: string[] = [];

    try {
      // 1. Find all system document metadata to get S3 keys
      const documentsToDelete = await UserDocument.find({ sourceType: 'system' }).select(
        's3Bucket s3Key'
      );
      attemptedS3Deletions = documentsToDelete.length;
      logger.info({ count: attemptedS3Deletions }, 'Found system documents to delete');

      if (documentsToDelete.length === 0) {
        return res.status(200).json({
          success: true,
          message: 'No system documents found to delete.',
          deletedCount: 0,
        });
      }

      // 2. Delete corresponding vectors from Pinecone
      const pineconeFilter = { sourceType: 'system' };
      logger.info('Deleting system vectors from Pinecone');
      deleteVectorsByFilter(pineconeFilter)
        .then(() => logger.info('Pinecone deletion initiated'))
        .catch(pineconeError => logger.error({ error: pineconeError }, 'Pinecone deletion error'));

      // 3. Delete S3 objects
      logger.info({ count: attemptedS3Deletions }, 'Deleting S3 objects');
      for (const doc of documentsToDelete) {
        if (doc.s3Bucket && doc.s3Key) {
          try {
            await deleteFile(doc.s3Key);
            successfulS3Deletions++;
          } catch (s3Error: any) {
            logger.error({ s3Key: doc.s3Key, error: s3Error }, 'Failed S3 delete');
            failedS3Keys.push(doc.s3Key);
          }
        } else {
          failedS3Keys.push(`RecordID:${doc._id}(Missing S3 Info)`);
        }
      }
      logger.info(
        { successful: successfulS3Deletions, attempted: attemptedS3Deletions },
        'S3 deletion summary'
      );

      // 4. Delete documents from MongoDB
      logger.info('Deleting system document metadata from MongoDB');
      const mongoDeleteResult = await UserDocument.deleteMany({ sourceType: 'system' });
      deletedDbCount = mongoDeleteResult.deletedCount;
      logger.info({ deletedCount: deletedDbCount }, 'MongoDB deletion result');

      return res.status(200).json({
        success: true,
        message: `Deleted ${deletedDbCount} system documents. S3: ${successfulS3Deletions}/${attemptedS3Deletions} deleted.`,
        deletedCount: deletedDbCount,
        s3Deletions: {
          attempted: attemptedS3Deletions,
          successful: successfulS3Deletions,
          failed: failedS3Keys.length > 0 ? failedS3Keys : undefined,
        },
      });
    } catch (error) {
      logger.error({ error }, 'Error deleting system documents');
      return res.status(500).json({
        success: false,
        message: 'Failed to delete system documents.' /*...error details...*/,
      });
    }
  }
);

// --- END: Add Delete All System KB Endpoint ---

export default router;
