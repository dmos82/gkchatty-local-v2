import { Request, Response } from 'express';
import * as s3Helper from '../utils/s3Helper';
import * as localStorageHelper from '../utils/localStorageHelper';
import * as documentProcessor from '../utils/documentProcessor';
import { v4 as uuidv4 } from 'uuid'; // Import uuid
import path from 'path'; // Import path
import { SystemKbDocumentModel as SystemKbDocument } from '../utils/modelFactory';
import { Document, Types } from 'mongoose';
import { isS3Storage } from '../utils/storageModeHelper';
import { KNOWLEDGE_BASE_S3_PREFIX } from '../config/storageConfig';
import { getLogger } from '../utils/logger';

const logger = getLogger('adminSystemKbController');

// Define an interface for the expected shape of SystemKbDocument after creation for type safety
interface ISystemKbDocumentRecord extends Document {
  _id: Types.ObjectId;
  filename: string;
  s3Key: string;
  fileUrl: string;
  fileSize: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  statusDetail?: string;
  createdAt: Date;
  updatedAt: Date;
  // textContent?: string; // Optional if not always present
}

// Verify the model is correctly defined
logger.info('[AdminSystemKbController] SystemKbDocument model loaded:', {
  modelName: SystemKbDocument.modelName,
  collection: SystemKbDocument.collection.name,
});

const CONTROLLER_VERSION = 'adminSystemKbController_v1.0_UUID_FIX_20250527_PM';

/**
 * Upload system knowledge base document
 * @route   POST /api/admin/system-kb/upload
 * @access  Private (Admin only)
 */
export const uploadSystemKb = async (req: Request, res: Response) => {
  logger.info(`[Admin Upload] Entered uploadSystemKb. Controller Version: ${CONTROLLER_VERSION}`);
  const useS3 = isS3Storage();
  const s3Configured = process.env.AWS_BUCKET_NAME && process.env.AWS_REGION;
  logger.info(`[Admin Upload] Initial isS3Storage(): ${useS3}, s3Configured: ${s3Configured}`);

  // Debug: Log all form data received
  logger.info(`[Admin Upload] req.body:`, req.body);
  logger.info(`[Admin Upload] folderId from body:`, req.body.folderId);

  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No files uploaded',
      });
    }

    const uploadedDocuments = [];
    const skippedDocuments = [];
    const errors = [];

    // Check for existing documents by filename to detect duplicates
    const existingDocs = await SystemKbDocument.find({}).select('filename');
    const existingFilenames = new Set(existingDocs.map(doc => doc.filename));

    const useS3ForStorage = isS3Storage();
    const s3Configured = process.env.AWS_BUCKET_NAME && process.env.AWS_REGION;
    const storageBucketName = process.env.AWS_BUCKET_NAME || 'local';

    logger.info(`[Admin Upload] Storage mode: ${useS3ForStorage && s3Configured ? 'S3' : 'Local'}`);
    logger.info(`[Admin Upload] Processing ${files.length} files...`);

    // Process each file
    for (const file of files) {
      const originalFileName = file.originalname;

      // Check for duplicates
      if (existingFilenames.has(originalFileName)) {
        logger.info(`[Admin Upload] Skipping duplicate file: ${originalFileName}`);
        skippedDocuments.push({
          filename: originalFileName,
          reason: 'Duplicate file already exists',
        });
        continue;
      }

      const fileBuffer = file.buffer;
      const fileExtension = path.extname(originalFileName);
      const s3Uuid = uuidv4();
      const s3ObjectKey = `${KNOWLEDGE_BASE_S3_PREFIX}${s3Uuid}${fileExtension}`;
      const s3KeyForDb = s3Uuid;
      let fileUrl = '';

      try {
        // Save file to storage
        if (useS3ForStorage && s3Configured) {
          fileUrl = await s3Helper.saveFile(s3ObjectKey, fileBuffer, file.mimetype);
        } else {
          fileUrl = await localStorageHelper.saveFile(s3ObjectKey, fileBuffer, file.mimetype);
        }
        logger.info(`[Admin Upload] File saved successfully: ${originalFileName} at ${fileUrl}`);

        // Save document metadata to MongoDB
        const documentRecord = (await SystemKbDocument.create({
          filename: originalFileName,
          s3Key: s3KeyForDb,
          fileUrl,
          fileSize: file.size,
          status: 'processing',
          statusDetail: 'Awaiting embedding',
          createdAt: new Date(),
          updatedAt: new Date(),
        })) as ISystemKbDocumentRecord;

        logger.info(
          `[Admin Upload] MongoDB save successful for ${originalFileName}, ID: ${documentRecord._id}`
        );

        // Trigger background processing
        documentProcessor
          .processAndEmbedDocument(
            documentRecord._id.toString(),
            storageBucketName,
            s3KeyForDb,
            'system',
            originalFileName,
            file.mimetype,
            undefined
          )
          .then(() => {
            logger.info(`[Admin Upload] Processing completed for ${documentRecord._id}`);
          })
          .catch(processingError => {
            logger.error(
              `[Admin Upload] Processing error for ${documentRecord._id}:`,
              processingError
            );
          });

        uploadedDocuments.push({
          id: documentRecord._id,
          filename: originalFileName,
          status: 'processing',
        });
      } catch (error: any) {
        logger.error(`[Admin Upload] Error processing file ${originalFileName}:`, error);
        errors.push({
          filename: originalFileName,
          error: error.message,
        });

        // Try to clean up if storage succeeded but DB failed
        if (fileUrl && error.message.includes('save initial document metadata')) {
          try {
            if (useS3ForStorage && s3Configured) {
              await s3Helper.deleteFile(s3ObjectKey);
            } else {
              await localStorageHelper.deleteFile(s3ObjectKey);
            }
          } catch (cleanupError) {
            logger.error('[Admin Upload] Cleanup failed:', cleanupError);
          }
        }
      }
    }

    logger.info(
      `[Admin Upload] Upload summary: ${uploadedDocuments.length} uploaded, ${skippedDocuments.length} skipped, ${errors.length} errors`
    );

    return res.status(202).json({
      success: uploadedDocuments.length > 0,
      message: `Upload completed: ${uploadedDocuments.length} files uploaded, ${skippedDocuments.length} skipped`,
      uploadedDocuments,
      skippedDocuments,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: unknown) {
    logger.error('[Admin Upload] Unexpected error in uploadSystemKb endpoint:', error);
    // Generic error if something unexpected happened before processing could be handed off
    return res.status(500).json({
      success: false,
      message: `Unexpected error during upload: ${(error as Error).message}`,
      error,
    });
  }
};

/**
 * Delete all system knowledge base documents
 * @route   DELETE /api/admin/system-kb/all
 * @access  Private (Admin only)
 */
export const deleteAllSystemDocuments = async (req: Request, res: Response) => {
  try {
    logger.info('[SystemKB Delete All] Request received.');
    const startTime = Date.now();

    // Determine whether we're using S3 or local storage
    const useS3 = isS3Storage();
    const s3Configured = process.env.AWS_BUCKET_NAME && process.env.AWS_REGION;

    logger.info(`[SystemKB Delete All] Storage mode: ${useS3 && s3Configured ? 'S3' : 'Local'}`);

    // 1. Fetch all system documents from MongoDB to get their s3Keys and IDs
    logger.info('[SystemKB Delete All] Fetching all system documents...');
    const allDocuments = await SystemKbDocument.find<ISystemKbDocumentRecord>({}).lean();
    logger.info(`[SystemKB Delete All] Found ${allDocuments.length} system documents to delete.`);

    if (allDocuments.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No system documents to delete.',
        details: {
          mongoDbDeleted: 0,
          storage: useS3 && s3Configured ? 'S3' : 'Local',
          storageSuccess: 0,
          storageFailed: 0,
        },
      });
    }

    // Extract document IDs and S3 keys for batch operations
    const documentIds = allDocuments.map(doc => doc._id);
    const s3Keys = allDocuments.map(doc => doc.s3Key);

    // Keep track of results
    const results = {
      mongoDbDeleted: 0,
      pineconeDeleted: 0,
      storageDeleted: 0,
      errors: [] as string[],
    };

    // 2. Batch delete from MongoDB
    try {
      logger.info('[SystemKB Delete All] Batch deleting from MongoDB...');
      const mongoResult = await SystemKbDocument.deleteMany({ _id: { $in: documentIds } });
      results.mongoDbDeleted = mongoResult.deletedCount || 0;
      logger.info(`[SystemKB Delete All] Deleted ${results.mongoDbDeleted} documents from MongoDB`);
    } catch (mongoError: any) {
      logger.error('[SystemKB Delete All] MongoDB batch delete failed:', mongoError);
      results.errors.push(`MongoDB: ${mongoError.message}`);
    }

    // 3. Batch delete from Pinecone using namespace purge
    try {
      logger.info('[SystemKB Delete All] Purging system-kb namespace from Pinecone...');
      const { purgeNamespace } = await import('../utils/pineconeService');
      await purgeNamespace('system-kb');
      results.pineconeDeleted = allDocuments.length; // Assume all were deleted
      logger.info('[SystemKB Delete All] Purged system-kb namespace from Pinecone');
    } catch (pineconeError: any) {
      logger.error('[SystemKB Delete All] Pinecone purge failed:', pineconeError);
      results.errors.push(`Pinecone: ${pineconeError.message}`);
    }

    // 4. Delete from storage (S3 or local)
    try {
      if (useS3 && s3Configured) {
        logger.info('[SystemKB Delete All] Deleting from S3...');
        // Delete entire folder contents for efficiency
        await s3Helper.deleteFolderContents(KNOWLEDGE_BASE_S3_PREFIX);
        results.storageDeleted = s3Keys.length;
      } else {
        logger.info('[SystemKB Delete All] Deleting from local storage...');
        const cleanupResult =
          await localStorageHelper.deleteFolderContents(KNOWLEDGE_BASE_S3_PREFIX);
        results.storageDeleted = cleanupResult.deleted;
      }
      logger.info(`[SystemKB Delete All] Deleted ${results.storageDeleted} files from storage`);
    } catch (storageError: any) {
      logger.error('[SystemKB Delete All] Storage deletion failed:', storageError);
      results.errors.push(`Storage: ${storageError.message}`);
    }

    const elapsedTime = Date.now() - startTime;
    logger.info(`[SystemKB Delete All] Deletion complete in ${elapsedTime}ms`);

    return res.status(200).json({
      success: true,
      message: `Deleted ${results.mongoDbDeleted} system documents.`,
      details: {
        mongoDbDeleted: results.mongoDbDeleted,
        pineconeDeleted: results.pineconeDeleted,
        storageDeleted: results.storageDeleted,
        storage: useS3 && s3Configured ? 'S3' : 'Local',
        errors: results.errors,
        elapsedTimeMs: elapsedTime,
      },
    });
  } catch (error: unknown) {
    logger.error('[SystemKB Delete All] Unexpected error:', error);
    return res.status(500).json({
      success: false,
      message: `Failed to delete system documents: ${(error as Error).message}`,
      error,
    });
  }
};
