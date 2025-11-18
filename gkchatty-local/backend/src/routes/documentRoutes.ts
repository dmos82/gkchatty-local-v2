/* eslint-disable no-await-in-loop */
import express, { Request, Response, Router, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { UserDocument, IUserDocument } from '../models/UserDocument';
import mongoose from 'mongoose';
import { getChatCompletion, generateEmbeddings } from '../utils/openaiHelper';
import { ChatCompletionMessageParam as OpenAIChatCompletionMessageParam } from 'openai/resources/chat';
import { protect, checkSession } from '../middleware/authMiddleware';
import { deleteVectorsByFilter, queryVectors } from '../utils/pineconeService';
import { processUserDocument } from '../services/userDocumentProcessor';
import { IngestionErrorCode } from '../types/errorCodes';
import { uploadLimiter } from '../middleware/rateLimiter';

// Import the configured multer instance (ensure it uses memoryStorage)
import userUpload from '../config/multerConfig';
// Import S3 helper functions
import { uploadFile, deleteFile } from '../utils/s3Helper';
import crypto from 'crypto';
import fs from 'fs';
import { default as ChatSession, IChat as IChatSession, IChatMessage } from '../models/ChatModel'; // Import Chat model as ChatSession and its interfaces
import { default as Persona, IPersona } from '../models/PersonaModel'; // Import Persona model as Persona and its interface
import { getContext } from '../services/ragService'; // Corrected import from contextService to ragService
import { getLogger } from '../utils/logger'; // Added import for getLogger

const router: Router = express.Router();

const log = getLogger('documentRoutes'); // Initialize logger

// Type interface for RAG source results
interface RAGSource {
  text: string;
  documentId: string;
  fileName: string;
  origin: string;
  type?: string;
  boostedScore: number;
}

// === ULTRA-EARLY DEBUG LOGGING FOR UPLOAD ROUTE ===
// This runs for ALL routes under /api/documents
router.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path === '/upload' && req.method === 'POST') {
    log.error({ timestamp: new Date().toISOString() }, 'Upload request received');
    log.error({ contentType: req.headers['content-type'] }, 'Content-Type');
    log.error({ contentLength: req.headers['content-length'] }, 'Content-Length');
    log.error({ authCookiePresent: !!req.cookies?.authToken }, 'Auth Cookie Present');
    log.error({ headers: req.headers }, 'Full Headers');
  }
  next();
});

// TEMPORARILY COMMENT OUT GLOBAL AUTH MIDDLEWARE TO TEST
// Middleware for all document routes
// router.use(protect, checkSession);

// Type augmentation for custom request properties (Ideally in a types file)
// eslint-disable-next-line @typescript-eslint/no-namespace
declare global {
  namespace Express {
    interface Request {
      fileFilterError?: string;
    }
  }
}

// ADD BACK SYSTEM PROMPT TEMPLATE
const SYSTEM_PROMPT_TEMPLATE = `You are an AI assistant specializing in the provided insurance documents. Your task is to answer the user's question accurately and concisely, based *exclusively* on the text within the 'Context' section below.

Instructions:
1. Read the user's question carefully.
2. Thoroughly analyze the provided 'Context' which contains relevant document excerpts.
3. Synthesize your answer using *only* the information found in the 'Context'. Do not use any prior knowledge or external information.
4. If the 'Context' contains the information needed to answer the question, provide the answer directly.
5. If the 'Context' does not contain the necessary information, state clearly: "I cannot answer this question based on the provided documents."
6. Do not make up information or speculate beyond the provided text.

Context:
------
\${context}
------`;

// GET /api/documents - List documents for the authenticated user
router.get(
  '/',
  // Add authentication middleware for document listing
  protect,
  checkSession,
  async (req: Request, res: Response): Promise<void | Response> => {
    const userId = req.user?._id;

    if (!userId) {
      // This shouldn't happen if protect middleware is working, but good practice
      return res.status(401).json({ success: false, message: 'Unauthorized: User ID missing.' });
    }

    try {
      log.info({ userId }, 'Fetching documents for user');
      // Find documents uploaded by this user, select relevant fields, sort by creation
      const documents = await UserDocument.find({
        userId: userId,
        sourceType: 'user', // Ensure we only get user uploads, not system KB
      })
        .select('originalFileName status createdAt uploadTimestamp contentHash') // Select fields for the list
        .sort({ createdAt: -1 }); // Sort by newest first

      log.info({ userId, count: documents.length }, 'Found documents for user');
      return res.status(200).json({ success: true, documents });
    } catch (error) {
      log.error({ error, userId }, 'Error fetching documents for user');
      return res.status(500).json({ success: false, message: 'Error fetching documents.' });
    }
  }
);

// === Refactored Upload Handler using memoryStorage and S3 ===
const handleDocumentUpload = async (req: Request, res: Response, next: NextFunction) => {
  const correlationId = String(req.id || uuidv4()); // Convert to string to fix TS error

  try {
    log.info({ correlationId }, 'DOCUMENT UPLOAD HANDLER ENTRY');

    const files = req.files as Express.Multer.File[] | undefined;

    // Log initial request details
    log.info(
      `[UploadDoc - ${correlationId}] Received request. User: ${req.user?.id || req.user?._id}, Files count: ${files?.length || 0}, Content-Length: ${req.headers['content-length']}`
    );

    if (!files || files.length === 0) {
      log.info(`[UploadDoc - ${correlationId}] Sending error response: No files uploaded`);
      return res.status(400).json({ success: false, message: 'No files uploaded.' });
    }
    if (!req.user?._id) {
      log.info(`[UploadDoc - ${correlationId}] Sending error response: Authentication required`);
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const s3Bucket = process.env.AWS_BUCKET_NAME;
    if (!s3Bucket) {
      log.error(
        `[UploadDoc - ${correlationId}] Server configuration error: AWS_BUCKET_NAME environment variable not set.`
      );
      log.info(`[UploadDoc - ${correlationId}] Sending error response: S3 bucket not configured`);
      return res
        .status(500)
        .json({ success: false, message: 'Server configuration error: S3 bucket not configured.' });
    }

    log.info(`[UploadDoc - ${correlationId}] Configuration validated. S3 Bucket: ${s3Bucket}`);

    const createdDocsMetadata: unknown[] = [];
    const processedFilesInfo = []; // To track outcomes for multiple file uploads

    log.info(
      `[UploadDoc - ${correlationId}] Starting file processing loop for ${files.length} file(s)`
    );

    for (const file of files) {
      const { originalname, /*buffer,*/ size, mimetype, path: tempFilePath } = file;
      const userId = req.user._id.toString();

      log.info(
        `[UploadDoc - ${correlationId}] Processing file: ${originalname}, Size: ${size}, Type: ${mimetype}, User: ${userId}`
      );

      // Read file from disk into buffer for hashing
      log.info(`[UploadDoc - ${correlationId}] Reading temporary file: ${tempFilePath}`);
      const buffer = await fs.promises.readFile(tempFilePath);
      log.info(
        `[UploadDoc - ${correlationId}] File read successful. Buffer size: ${buffer.length}`
      );

      // 1. Generate content hash
      log.info(
        `[UploadDoc - ${correlationId}] Starting content hash generation for ${originalname}`
      );
      const hash = crypto.createHash('sha256').update(buffer).digest('hex');
      log.info(
        `[UploadDoc - ${correlationId}] Content hash generated successfully. File: ${originalname}, SHA256: ${hash}`
      );

      try {
        // 2. Check for existing document with the same hash for this user
        log.info(`[UploadDoc - ${correlationId}] Starting duplicate check for hash: ${hash}`);
        const existingDoc = await UserDocument.findOne({
          userId: req.user._id,
          contentHash: hash,
          sourceType: 'user',
        });
        log.info(
          `[UploadDoc - ${correlationId}] Duplicate check completed. Existing document: ${existingDoc ? existingDoc._id : 'None'}`
        );

        if (existingDoc) {
          // Cast to IUserDocument first to fix TypeScript errors
          const typedDoc = existingDoc as unknown as IUserDocument & {
            _id: mongoose.Types.ObjectId;
          };
          const docId = typedDoc._id.toString();

          log.info(
            `[UploadDoc - ${correlationId}] Existing document found for hash ${hash}. Doc ID: ${docId}, Status: ${typedDoc.status}`
          );

          if (typedDoc.status === 'completed') {
            log.info(
              `[UploadDoc - ${correlationId}] Duplicate completed document detected. Skipping processing.`
            );
            processedFilesInfo.push({
              fileName: originalname,
              status: 'duplicate_completed',
              message: 'This file has already been successfully processed.',
              documentId: docId,
              existingDocument: {
                // Send back some info about the existing doc
                originalFileName: typedDoc.originalFileName,
                status: typedDoc.status,
                uploadTimestamp: typedDoc.uploadTimestamp,
                _id: typedDoc._id,
              },
            });
            continue; // Skip to next file
          } else if (typedDoc.status === 'processing' || typedDoc.status === 'pending') {
            log.info(
              `[UploadDoc - ${correlationId}] Duplicate processing document detected. Skipping processing.`
            );
            processedFilesInfo.push({
              fileName: originalname,
              status: 'duplicate_processing',
              message: 'This file is already being processed or is pending processing.',
              documentId: docId,
            });
            continue; // Skip to next file
          } else if (typedDoc.status === 'failed') {
            log.info(
              `[UploadDoc - ${correlationId}] Existing document ${docId} for hash ${hash} has 'failed' status. Starting cleanup and reprocessing.`
            );

            // Delete from S3
            if (typedDoc.s3Key) {
              try {
                log.info(
                  `[UploadDoc - ${correlationId}] Attempting to delete old S3 file: ${typedDoc.s3Key}`
                );
                await deleteFile(typedDoc.s3Key);
                log.info(
                  `[UploadDoc - ${correlationId}] S3 file deletion successful: ${typedDoc.s3Key} for failed duplicate ${docId}`
                );
              } catch (s3DeleteError) {
                log.error(
                  `[UploadDoc - ${correlationId}] S3 file deletion FAILED: ${typedDoc.s3Key} for failed duplicate ${docId}:`,
                  s3DeleteError
                );
                // Decide if this is critical enough to stop reprocessing. For now, we'll log and continue.
              }
            }

            // Delete from Pinecone (vectors are associated with documentId)
            try {
              log.info(
                `[UploadDoc - ${correlationId}] Attempting to delete Pinecone vectors for failed duplicate: ${docId}`
              );
              await deleteVectorsByFilter({ documentId: docId });
              log.info(
                `[UploadDoc - ${correlationId}] Pinecone vector deletion successful for failed duplicate: ${docId}`
              );
            } catch (pineconeDeleteError) {
              log.error(
                `[UploadDoc - ${correlationId}] Pinecone vector deletion FAILED for failed duplicate ${docId}:`,
                pineconeDeleteError
              );
            }

            // Delete the UserDocument record
            log.info(
              `[UploadDoc - ${correlationId}] Attempting to delete UserDocument record: ${docId}`
            );
            await UserDocument.findByIdAndDelete(typedDoc._id);
            log.info(
              `[UploadDoc - ${correlationId}] UserDocument record deletion successful: ${docId} for failed duplicate.`
            );
            // Proceed with uploading and processing as a new document (but with the same content hash)
          }
        }

        // 3. Upload to S3 and create UserDocument (if not a duplicate or if failed duplicate was handled)
        const fileExtension = path.extname(originalname);
        const extensionForStorage = fileExtension ? fileExtension.substring(1) : 'unknown';
        const s3Key = `user_docs/${userId}/${uuidv4()}/${originalname}`;

        log.info(
          `[UploadDoc - ${correlationId}] Starting S3 upload for ${originalname}. Bucket: ${s3Bucket}, Key: ${s3Key}`
        );

        // Use the temp file path for upload instead of buffer
        await uploadFile(tempFilePath, s3Key, mimetype, true); // Pass true to indicate it's a file path
        log.info(
          `[UploadDoc - ${correlationId}] S3 upload successful for ${originalname}. Key: ${s3Key}`
        );

        // Delete the temporary file after successful S3 upload
        try {
          log.info(
            `[UploadDoc - ${correlationId}] Attempting to delete temporary file: ${tempFilePath}`
          );
          await fs.promises.unlink(tempFilePath);
          log.info(
            `[UploadDoc - ${correlationId}] Temporary file deletion successful: ${tempFilePath}`
          );
        } catch (unlinkError) {
          log.error(
            `[UploadDoc - ${correlationId}] Temporary file deletion FAILED: ${tempFilePath}`,
            unlinkError
          );
          // Continue even if temp file deletion fails
        }

        const newDocData: Partial<IUserDocument> = {
          userId: req.user._id,
          originalFileName: originalname,
          s3Bucket: s3Bucket,
          s3Key: s3Key,
          file_extension: extensionForStorage, // Use the safe extension
          fileSize: size,
          mimeType: mimetype,
          sourceType: 'user',
          status: 'pending',
          contentHash: hash, // Store the content hash
          uploadTimestamp: new Date(),
        };

        log.info(
          `[UploadDoc - ${correlationId}] Saving document metadata to MongoDB for ${originalname}`
        );
        const doc = await UserDocument.create(newDocData);

        if (!doc || !doc._id) {
          log.error(
            `[UploadDoc - ${correlationId}] MongoDB metadata save FAILED: Failed to create document record or get ID for ${originalname}. Hash: ${hash}`
          );
          processedFilesInfo.push({
            fileName: originalname,
            status: 'error',
            message: 'Failed to create database record for this file after upload.',
          });
          continue;
        }
        const documentIdString = doc._id.toString();
        log.info(
          `[UploadDoc - ${correlationId}] Document metadata saved to MongoDB successfully. Doc ID: ${documentIdString}`
        );

        createdDocsMetadata.push({
          _id: doc._id,
          originalFileName: doc.originalFileName,
          status: doc.status,
          uploadTimestamp: doc.uploadTimestamp,
          contentHash: doc.contentHash,
        });
        processedFilesInfo.push({
          fileName: originalname,
          status: 'processing_started',
          message: 'Processing initiated.',
          documentId: documentIdString,
        });

        log.info(
          `[UploadDoc - ${correlationId}] Triggering background processing for new document ID: ${documentIdString}, S3Key: ${s3Key}, Hash: ${hash}`
        );

        // Pass reqId for downstream logging
        processUserDocument(
          documentIdString,
          s3Bucket,
          s3Key,
          req.user._id.toString(),
          String(correlationId) // Explicitly cast to string to fix TS error
        ).catch((procErr: unknown) => {
          log.error(
            `[UploadDoc - ${correlationId}] Background processing initiation FAILED for doc ${documentIdString}:`,
            procErr
          );
          // Note: The actual UserDocument status should be set to 'failed' within processUserDocument or its callees
        });
      } catch (error: unknown) {
        log.error(
          `[UploadDoc - ${correlationId}] File processing FAILED for ${originalname} (Hash: ${hash}):`,
          error
        );
        processedFilesInfo.push({
          fileName: originalname,
          status: 'error',
          message:
            error instanceof Error
              ? error.message
              : String(error) || 'An unexpected error occurred during upload.',
          errorCode: IngestionErrorCode.UNKNOWN_PROCESSING_ERROR, // Or more specific if identifiable here
        });
      }
    } // End of for...of loop for files

    log.info(
      `[UploadDoc - ${correlationId}] File processing loop completed. Processed files: ${processedFilesInfo.length}`
    );

    if (processedFilesInfo.length === 0 && files.length > 0) {
      // This case should ideally not be hit if errors are pushed to processedFilesInfo
      log.error(
        `[UploadDoc - ${correlationId}] Critical error: No files processed despite having ${files.length} files`
      );
      log.info(
        `[UploadDoc - ${correlationId}] Sending error response: Failed to process any uploaded documents`
      );
      return res
        .status(500)
        .json({ success: false, message: 'Failed to process any uploaded documents.' });
    }

    // Determine overall status for the response
    const allDuplicatesCompleted = processedFilesInfo.every(
      f => f.status === 'duplicate_completed'
    );
    const someProcessingStarted = processedFilesInfo.some(f => f.status === 'processing_started');
    const someErrors = processedFilesInfo.some(f => f.status === 'error');

    let overallMessage = `Processed ${files.length} file(s).`;
    let httpStatus = 200; // OK if all were duplicates

    if (someProcessingStarted && !someErrors) {
      overallMessage = `Successfully started processing for ${processedFilesInfo.filter(f => f.status === 'processing_started').length} document(s). Others may be duplicates.`;
      httpStatus = 201; // Created (if some new processing was started)
    } else if (allDuplicatesCompleted) {
      overallMessage =
        'All uploaded files were identified as duplicates of already completed documents.';
      httpStatus = 200; // OK
    } else if (someErrors) {
      httpStatus = 207; // Multi-Status, client should check individual file statuses
      overallMessage =
        'Some files were processed, some were duplicates, and some encountered errors. Check details.';
    }

    // Adjust message if only one file was uploaded
    if (files.length === 1) {
      overallMessage = processedFilesInfo[0].message || overallMessage;
      if (processedFilesInfo[0].status === 'duplicate_completed') httpStatus = 200;
      else if (processedFilesInfo[0].status === 'processing_started') httpStatus = 201;
      else if (processedFilesInfo[0].status === 'duplicate_processing')
        httpStatus = 409; // Conflict
      else if (processedFilesInfo[0].status === 'error') httpStatus = 500; // Or based on specific error
    }

    log.info(
      `[UploadDoc - ${correlationId}] Sending successful response to client. Status: ${httpStatus}, Message: ${overallMessage}`
    );
    return res.status(httpStatus).json({
      success: !someErrors, // Overall success true if no individual errors, or if only duplicates
      message: overallMessage,
      results: processedFilesInfo,
    });
  } catch (err) {
    // Catch errors from Express middleware (e.g. multer disk write error if we change to that)
    log.error(`[UploadDoc - ${correlationId}] Unhandled error in handleDocumentUpload:`, err);
    log.info(`[UploadDoc - ${correlationId}] Sending error response: Internal server error`);
    return next(err);
  }
};

// POST /api/documents/upload (Uses memory storage)
router.post(
  '/upload',
  // Add authentication middleware specifically for this route
  protect,
  checkSession,
  uploadLimiter,
  // Add pre-multer logging
  (req: Request, res: Response, next: NextFunction) => {
    log.error(`[UPLOAD - PRE-MULTER] ${new Date().toISOString()} Request reached upload handler`);
    log.error(`[UPLOAD - PRE-MULTER] Auth verified, about to process with multer`);
    log.error(`[UPLOAD - PRE-MULTER] Content-Type: ${req.headers['content-type']}`);
    log.error(`[UPLOAD - PRE-MULTER] User ID: ${req.user?._id}`);
    next();
  },
  userUpload.array('files', 10),
  handleDocumentUpload
);

// OPTIONS handler for /api/documents/get-presigned-url - Handle CORS preflight
router.options('/get-presigned-url', (req: Request, res: Response) => {
  log.debug('[CORS Preflight] OPTIONS request for /api/documents/get-presigned-url');
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.sendStatus(204);
});

// POST /api/documents/get-presigned-url - Generate pre-signed URL for direct S3 upload
router.post(
  '/get-presigned-url',
  protect,
  checkSession,
  uploadLimiter,
  async (req: Request, res: Response): Promise<void | Response> => {
    const correlationId = String(req.id || uuidv4());

    try {
      log.info(`[PreSignedURL - ${correlationId}] === PRESIGNED URL GENERATION ENTRY ===`);

      const { fileName, fileType, fileSize, tenantKbId } = req.body;
      const userId = req.user?._id?.toString();

      // Validate inputs
      if (!fileName || !fileType || !fileSize) {
        log.info(
          `[PreSignedURL - ${correlationId}] Sending error response: Missing required fields`
        );
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: fileName, fileType, and fileSize are required.',
        });
      }

      if (!userId) {
        log.info(
          `[PreSignedURL - ${correlationId}] Sending error response: Authentication required`
        );
        return res.status(401).json({ success: false, message: 'Authentication required.' });
      }

      // If tenantKbId is provided, validate user has access
      if (tenantKbId) {
        const { TenantKnowledgeBase } = await import('../models/TenantKnowledgeBase');
        const { UserKBAccess } = await import('../models/UserKBAccess');

        const kb = await TenantKnowledgeBase.findById(tenantKbId);
        if (!kb) {
          log.info(`[PreSignedURL - ${correlationId}] Invalid tenant KB ID: ${tenantKbId}`);
          return res.status(404).json({
            success: false,
            message: 'Knowledge base not found.',
          });
        }

        // Check if user has access - admins always have access
        const isAdmin = req.user?.role === 'admin';
        const userAccess = await UserKBAccess.findOne({ userId });
        const hasAccess =
          isAdmin ||
          kb.accessType === 'public' ||
          (userAccess && userAccess.enabledKnowledgeBases.includes(tenantKbId));

        if (!hasAccess) {
          log.info(
            `[PreSignedURL - ${correlationId}] User ${userId} does not have access to KB ${tenantKbId}`
          );
          return res.status(403).json({
            success: false,
            message: 'You do not have access to upload to this knowledge base.',
          });
        }
      }

      // Validate file size (25MB limit for Excel, 15MB for images, 100MB for audio, 10MB for others)
      const isExcel =
        fileType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        fileType === 'application/vnd.ms-excel' ||
        fileType === 'application/vnd.ms-excel.sheet.macroEnabled.12';
      const isImage = fileType.startsWith('image/');
      const isAudio = fileType.startsWith('audio/');
      const isVideo = fileType.startsWith('video/');

      let maxSize = 15 * 1024 * 1024; // Default 15MB (50% increase from 10MB)
      if (isExcel) {
        maxSize = 37.5 * 1024 * 1024; // 37.5MB for Excel (50% increase from 25MB)
      } else if (isImage) {
        maxSize = 22.5 * 1024 * 1024; // 22.5MB for images (50% increase from 15MB)
      } else if (isAudio) {
        maxSize = 37.5 * 1024 * 1024; // 37.5MB for audio files (50% increase from 25MB)
      } else if (isVideo) {
        maxSize = 150 * 1024 * 1024; // 150MB for video files (50% increase from 100MB)
      }

      if (fileSize > maxSize) {
        log.info(
          `[PreSignedURL - ${correlationId}] Sending error response: File too large (${fileSize} bytes, max: ${maxSize})`
        );
        const maxSizeMB = maxSize / (1024 * 1024);
        return res.status(400).json({
          success: false,
          message: `File too large. Maximum size is ${maxSizeMB}MB for ${
            isExcel
              ? 'Excel'
              : isImage
                ? 'image'
                : isAudio
                  ? 'audio'
                  : isVideo
                    ? 'video'
                    : 'this type of'
          } files.`,
        });
      }

      // Validate file type
      const allowedTypes = [
        'application/pdf',
        'text/plain',
        'text/markdown',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        'application/vnd.ms-excel', // .xls
        'application/vnd.ms-excel.sheet.macroEnabled.12', // .xlsm
        // Image types
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif',
        'image/bmp',
        'image/webp',
        'image/tiff',
        // Audio types
        'audio/mpeg',
        'audio/wav',
        'audio/mp4',
        'audio/x-m4a', // M4A files sometimes report as this
        'audio/m4a', // Alternative M4A MIME type
        'audio/aac',
        'audio/ogg',
        'audio/flac',
        'audio/webm',
        // Video types
        'video/mp4',
        'video/mpeg',
        'video/quicktime',
        'video/x-msvideo',
        'video/x-ms-wmv',
        'video/x-flv',
        'video/webm',
        'video/x-matroska',
        'video/x-m4v',
      ];
      if (!allowedTypes.includes(fileType)) {
        log.info(
          `[PreSignedURL - ${correlationId}] Sending error response: Invalid file type (${fileType})`
        );
        return res.status(400).json({
          success: false,
          message:
            'Invalid file type. Only PDF, TXT, Markdown, Excel, image, audio, and video files are allowed.',
        });
      }

      // Import S3 helper function
      const { getPresignedUrlForPut } = await import('../utils/s3Helper');

      // Generate unique S3 key based on whether it's for tenant KB or user docs
      const fileExtension = path.extname(fileName);
      let s3Key: string;

      if (tenantKbId) {
        // For tenant KB uploads, use the KB's S3 prefix
        const { TenantKnowledgeBase } = await import('../models/TenantKnowledgeBase');
        const kb = await TenantKnowledgeBase.findById(tenantKbId);
        s3Key = `${kb!.s3Prefix}${uuidv4()}${fileExtension || '.unknown'}`;
      } else {
        // For regular user uploads
        s3Key = `user_docs/${userId}/${uuidv4()}${fileExtension || '.unknown'}`;
      }

      log.info(
        `[PreSignedURL - ${correlationId}] Generating pre-signed URL for file: ${fileName}, Type: ${fileType}, S3 Key: ${s3Key}`
      );

      // === ADD DEBUG LOGGING ===
      log.debug(
        `[S3 PreSign DEBUG] Preparing to sign. Filename: ${fileName}, Input ContentType: ${fileType}`
      );
      log.debug(`[S3 PreSign DEBUG] S3 Key: ${s3Key}, Bucket: ${process.env.AWS_BUCKET_NAME}`);

      // Generate pre-signed URL with 5-minute expiry
      const presignedUrl = await getPresignedUrlForPut(s3Key, fileType, 300);

      // === ADD MORE DEBUG LOGGING ===
      log.debug(
        `[S3 PreSign DEBUG] Generated Signed URL (first 200 chars): ${presignedUrl.substring(0, 200)}...`
      );

      // Parse URL to check for checksum parameters
      try {
        const url = new URL(presignedUrl);
        const hasChecksumParams =
          url.searchParams.has('x-amz-checksum-crc32') ||
          url.searchParams.has('x-amz-sdk-checksum-algorithm');
        log.debug(`[S3 PreSign DEBUG] URL has checksum parameters: ${hasChecksumParams}`);
        if (hasChecksumParams) {
          log.warn(`[S3 PreSign DEBUG] WARNING: Checksum parameters detected in URL!`);
        }
      } catch (urlErr) {
        log.error(`[S3 PreSign DEBUG] Error parsing URL for debug:`, urlErr);
      }

      log.info(
        `[PreSignedURL - ${correlationId}] Successfully generated pre-signed URL for S3 key: ${s3Key}`
      );

      return res.status(200).json({
        success: true,
        presignedUrl,
        s3Key,
        expiresIn: 300,
        tenantKbId: tenantKbId || null,
      });
    } catch (error) {
      log.error(`[PreSignedURL - ${correlationId}] Error generating pre-signed URL:`, error);
      return res.status(500).json({
        success: false,
        message: 'Failed to generate upload URL. Please try again.',
      });
    }
  }
);

// OPTIONS handler for /api/documents/process-uploaded-file - Handle CORS preflight
router.options('/process-uploaded-file', (req: Request, res: Response) => {
  log.debug('[CORS Preflight] OPTIONS request for /api/documents/process-uploaded-file');
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.sendStatus(204);
});

// POST /api/documents/process-uploaded-file - Process file after direct S3 upload
router.post(
  '/process-uploaded-file',
  protect,
  checkSession,
  async (req: Request, res: Response): Promise<void | Response> => {
    const correlationId = String(req.id || uuidv4());

    try {
      log.info(`[ProcessUploaded - ${correlationId}] === POST-UPLOAD PROCESSING ENTRY ===`);

      const { s3Key, originalFileName, fileSize, fileType, extractedText, tenantKbId, folderId } = req.body;
      const userId = req.user?._id?.toString();

      // Validate inputs
      if (!s3Key || !originalFileName || !fileSize || !fileType) {
        log.info(
          `[ProcessUploaded - ${correlationId}] Sending error response: Missing required fields`
        );
        return res.status(400).json({
          success: false,
          message:
            'Missing required fields: s3Key, originalFileName, fileSize, and fileType are required.',
        });
      }

      if (!userId) {
        log.info(
          `[ProcessUploaded - ${correlationId}] Sending error response: Authentication required`
        );
        return res.status(401).json({ success: false, message: 'Authentication required.' });
      }

      // Determine the bucket (or local storage placeholder)
      const s3Bucket = process.env.AWS_BUCKET_NAME || 'local';

      // When running in local-storage mode we intentionally allow a placeholder bucket
      // so the rest of the processing pipeline can proceed using the LocalStorageHelper.
      // Only block the request if we are NOT in local mode *and* the env var is missing.
      const isLocalStorage =
        (process.env.FILE_STORAGE_MODE ?? '').toLowerCase() === 'local' || s3Bucket === 'local';

      if (!isLocalStorage && !process.env.AWS_BUCKET_NAME) {
        log.error(
          `[ProcessUploaded - ${correlationId}] Server configuration error: AWS_BUCKET_NAME not set and FILE_STORAGE_MODE is not 'local'.`
        );
        return res.status(500).json({
          success: false,
          message: 'Server configuration error: S3 bucket not configured.',
        });
      }

      log.info(
        `[ProcessUploaded - ${correlationId}] Processing uploaded file: ${originalFileName}, S3 Key: ${s3Key}${tenantKbId ? `, Tenant KB: ${tenantKbId}` : ''}`
      );

      // Import necessary functions
      const { getFileStream } = await import('../utils/s3Helper');

      // Read file from S3 to calculate content hash
      log.info(`[ProcessUploaded - ${correlationId}] Reading file from S3 for hash calculation`);

      const stream = await getFileStream(s3Key);
      const chunks: Buffer[] = [];

      // Collect chunks from stream
      await new Promise<void>((resolve, reject) => {
        stream.on('data', chunk => chunks.push(Buffer.from(chunk)));
        stream.on('error', reject);
        stream.on('end', resolve);
      });

      const buffer = Buffer.concat(chunks);
      const hash = crypto.createHash('sha256').update(buffer).digest('hex');

      log.info(`[ProcessUploaded - ${correlationId}] Content hash generated: ${hash}`);

      // Determine source type based on whether it's a tenant KB upload
      const sourceType = tenantKbId ? 'tenant' : 'user';

      // Check for existing document with same hash
      const existingDocQuery: {
        contentHash: string;
        sourceType: string;
        tenantKbId?: unknown;
        userId?: unknown;
      } = {
        contentHash: hash,
        sourceType: sourceType,
      };

      if (tenantKbId) {
        existingDocQuery.tenantKbId = tenantKbId;
      } else {
        existingDocQuery.userId = req.user!._id;
      }

      const existingDoc = await UserDocument.findOne(existingDocQuery);

      if (existingDoc) {
        const typedDoc = existingDoc as unknown as IUserDocument & {
          _id: mongoose.Types.ObjectId;
        };
        const docId = typedDoc._id.toString();

        log.info(
          `[ProcessUploaded - ${correlationId}] Duplicate document found: ${docId}, Status: ${typedDoc.status}`
        );

        if (typedDoc.status === 'completed') {
          return res.status(200).json({
            success: true,
            message: 'This file has already been successfully processed.',
            documentId: docId,
            status: 'duplicate_completed',
          });
        } else if (typedDoc.status === 'processing' || typedDoc.status === 'pending') {
          return res.status(200).json({
            success: true,
            message: 'This file is already being processed.',
            documentId: docId,
            status: 'duplicate_processing',
          });
        }
        // If status is 'failed', continue with processing (reprocess)
      }

      // Extract file extension for storage
      const fileExtension = path.extname(originalFileName);
      const extensionForStorage = fileExtension ? fileExtension.substring(1) : 'unknown';

      // Create UserDocument record
      const newDocData: Partial<IUserDocument> = {
        originalFileName: originalFileName,
        s3Bucket: s3Bucket,
        s3Key: s3Key,
        file_extension: extensionForStorage,
        fileSize: fileSize,
        mimeType: fileType,
        sourceType: sourceType as 'user' | 'system' | 'tenant',
        status: 'pending',
        contentHash: hash,
        uploadTimestamp: new Date(),
        folderId: folderId || null, // Add folderId support for folder uploads
      };

      // Add appropriate reference based on source type
      if (tenantKbId) {
        newDocData.tenantKbId = tenantKbId;
        newDocData.userId = req.user!._id; // Still track who uploaded it
      } else {
        newDocData.userId = req.user!._id;
      }

      log.info(`[ProcessUploaded - ${correlationId}] Creating document record in MongoDB`);

      const doc = await UserDocument.create(newDocData);

      if (!doc || !doc._id) {
        log.error(`[ProcessUploaded - ${correlationId}] Failed to create document record`);
        return res.status(500).json({
          success: false,
          message: 'Failed to create database record for the uploaded file.',
        });
      }

      const documentIdString = doc._id.toString();
      log.info(
        `[ProcessUploaded - ${correlationId}] Document created with ID: ${documentIdString}`
      );

      // Update document count for tenant KB if applicable
      if (tenantKbId) {
        const { TenantKnowledgeBase } = await import('../models/TenantKnowledgeBase');
        await TenantKnowledgeBase.findByIdAndUpdate(tenantKbId, { $inc: { documentCount: 1 } });
      }

      // Trigger background processing
      log.info(
        `[ProcessUploaded - ${correlationId}] Triggering background processing for document ${documentIdString}`
      );

      processUserDocument(
        documentIdString,
        s3Bucket,
        s3Key,
        userId,
        String(correlationId), // Explicitly cast to string to fix TS error
        extractedText // Pass the extracted text from frontend OCR
      ).catch((procErr: unknown) => {
        log.error(
          `[ProcessUploaded - ${correlationId}] Background processing failed for doc ${documentIdString}:`,
          procErr
        );
      });

      return res.status(201).json({
        success: true,
        message: 'Document processing started successfully.',
        documentId: documentIdString,
        status: 'processing_started',
      });
    } catch (error) {
      log.error(`[ProcessUploaded - ${correlationId}] Error processing uploaded file:`, error);
      return res.status(500).json({
        success: false,
        message: 'Failed to process the uploaded file. Please try again.',
      });
    }
  }
);

// POST /api/chat - Main chat endpoint (currently in documentRoutes.ts)
router.post('/chat', protect, checkSession, async (req: Request, res: Response) => {
  const correlationId = String(req.id || uuidv4());
  log.info(`[Chat - ${correlationId}] Chat request received.`);

  const { chatSessionId, message, searchMode, personaId, tenantKbId, initialSystemMessage } =
    req.body;
  const userId = req.user?._id;

  if (!userId) {
    log.warn(`[Chat - ${correlationId}] Unauthorized chat attempt: User ID missing.`);
    return res.status(401).json({ success: false, message: 'Unauthorized.' });
  }

  // Add input validation for message content
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    log.warn(
      `[Chat - ${correlationId}] Invalid message content received: ${typeof message}, value: ${message}`
    );
    return res.status(400).json({
      success: false,
      message: 'Message content is required and cannot be empty.',
    });
  }

  log.debug(
    `[Chat - ${correlationId}] User ID: ${userId}, Session ID: ${chatSessionId}, Search Mode: ${searchMode}, Persona ID: ${personaId}, Tenant KB ID: ${tenantKbId || 'N/A'}`
  );

  let chatSession: IChatSession | null = null;

  // 1. Load or create chat session
  if (chatSessionId) {
    chatSession = await ChatSession.findById(chatSessionId);
    if (!chatSession) {
      log.warn(`[Chat - ${correlationId}] Chat session not found: ${chatSessionId}. Creating new.`);
    }
  }

  if (!chatSession) {
    log.info(
      `[Chat - ${correlationId}] Creating new chat session for user: ${userId} with persona: ${personaId}`
    );
    chatSession = new ChatSession({
      userId,
      personaId,
      messages: [],
      currentSearchMode: searchMode || 'unified',
      activeTenantKbId: tenantKbId || undefined,
    });
    await chatSession.save();
    log.info(`[Chat - ${correlationId}] New chat session created: ${chatSession._id}`);
  }

  // Ensure persona is loaded and active
  let persona: IPersona | null = null;
  if (personaId) {
    persona = await Persona.findById(personaId);
    if (!persona) {
      log.warn(
        `[Chat - ${correlationId}] Persona ${personaId} not found. Falling back to default.`
      );
    }
  }

  if (!persona) {
    // Attempt to find a default persona if none found or specified
    persona = await Persona.findOne({ isDefault: true });
    if (!persona) {
      log.error(
        `[Chat - ${correlationId}] No default persona found. This is a configuration error.`
      );
      return res.status(500).json({
        success: false,
        message: 'Server configuration error: No default AI persona found.',
      });
    }
    log.info(`[Chat - ${correlationId}] Using default persona: ${persona.name}`);
  }

  // Update chat session with latest persona/search mode if they changed
  if (chatSession.personaId?.toString() !== persona._id.toString()) {
    chatSession.personaId = persona._id;
    log.debug(`[Chat - ${correlationId}] Updated chat session persona to: ${persona.name}`);
  }
  if (chatSession.currentSearchMode !== searchMode) {
    chatSession.currentSearchMode = searchMode;
    log.debug(`[Chat - ${correlationId}] Updated chat session search mode to: ${searchMode}`);
  }
  if (
    (tenantKbId && chatSession.activeTenantKbId?.toString() !== tenantKbId) ||
    (!tenantKbId && chatSession.activeTenantKbId)
  ) {
    chatSession.activeTenantKbId = tenantKbId || undefined;
    log.debug(
      `[Chat - ${correlationId}] Updated chat session active tenant KB ID to: ${tenantKbId || 'N/A'}`
    );
  }
  await chatSession.save();

  // Add user message to history with validation
  const sanitizedMessage = message.trim();
  chatSession.messages.push({
    role: 'user',
    content: sanitizedMessage,
    timestamp: new Date(),
  });

  // Save the chat session immediately after adding user message
  await chatSession.save();
  log.debug(`[Chat - ${correlationId}] Saved user message to chat session`);

  // 2. Determine RAG context
  let context = '';
  let sources: unknown[] = [];

  // CRITICAL FIX: Add searchMode to knowledgeBaseTarget mapping
  // This mapping logic was missing from documentRoutes.ts but exists in chatRoutes.ts
  let knowledgeBaseTarget = searchMode || 'unified';

  // Map frontend searchMode values to backend knowledgeBaseTarget values
  switch (knowledgeBaseTarget) {
    case 'system-kb':
      knowledgeBaseTarget = 'kb';
      break;
    case 'user-docs':
      knowledgeBaseTarget = 'user';
      break;
    case 'hybrid':
      knowledgeBaseTarget = 'unified';
      break;
    case 'my-docs':
      knowledgeBaseTarget = 'user';
      break;
    default:
      // Leave as-is for 'user', 'system', 'kb', 'unified'
      break;
  }

  log.debug(
    `[Chat - ${correlationId}] Mapped searchMode '${searchMode}' to knowledgeBaseTarget '${knowledgeBaseTarget}'`
  );

  log.debug(
    `[Chat - ${correlationId}] Calling getContext with knowledgeBaseTarget: ${knowledgeBaseTarget}`
  );
  try {
    sources = await getContext(message, userId.toString(), {
      knowledgeBaseTarget: knowledgeBaseTarget,
      tenantKbId: tenantKbId,
    });

    log.debug(
      `[Chat - ${correlationId}] Raw sources from getContext: ${sources.length} sources found.`
    );

    if (sources && sources.length > 0) {
      // Sort sources by boosted score in descending order
      const typedSources = sources as RAGSource[];
      typedSources.sort((a, b) => b.boostedScore - a.boostedScore);

      // Concatenate text from relevant sources to form context, ensuring it doesn't exceed a reasonable length
      const MAX_CONTEXT_LENGTH = 3000; // Define a max context length
      let currentContextLength = 0;
      const contextChunks: string[] = [];
      const usedSourceIds = new Set<string>(); // To track unique document IDs used in context

      for (const source of typedSources) {
        if (source.text) {
          const chunkId = source.documentId; // Assuming documentId is unique per document
          if (!usedSourceIds.has(chunkId)) {
            const newChunk = `Document: ${source.fileName}, Source Type: ${source.origin}\n${source.text}\n`;
            if (currentContextLength + newChunk.length <= MAX_CONTEXT_LENGTH) {
              contextChunks.push(newChunk);
              currentContextLength += newChunk.length;
              usedSourceIds.add(chunkId);
            } else {
              log.debug(
                `[Chat - ${correlationId}] Max context length reached. Skipping further sources.`
              );
              break; // Stop if adding more would exceed limit
            }
          }
        }
      }
      context = contextChunks.join('\n---\n');
      log.info(
        `[Chat - ${correlationId}] Context generated from ${contextChunks.length} unique sources. Total context length: ${currentContextLength} characters.`
      );
    } else {
      context = 'No relevant context found in documents.';
      log.info(
        `[Chat - ${correlationId}] No relevant document chunks found in Pinecone for the query.`
      );
    }
  } catch (ragError: unknown) {
    log.error(ragError, `[Chat - ${correlationId}] RAG service failed to retrieve context.`);
    context = 'Error retrieving context from documents.';
    sources = []; // Clear sources if RAG fails
    // Potentially return a more user-friendly message or fall back to general AI
  }

  // Check if the LLM should answer purely from general knowledge due to lack of context
  const shouldAnswerFromGeneralKnowledge =
    context === 'No relevant context found in documents.' ||
    context === 'Error retrieving context from documents.';
  let finalSystemPrompt = persona.systemPrompt;

  if (!shouldAnswerFromGeneralKnowledge) {
    // Only inject context if relevant documents were found
    finalSystemPrompt = SYSTEM_PROMPT_TEMPLATE.replace('${context}', context);
    log.debug(
      `[Chat - ${correlationId}] Final System Prompt with Context: ${finalSystemPrompt.substring(0, 500)}...`
    );
  } else {
    // Adjust prompt to signal general knowledge response if no context
    finalSystemPrompt =
      'You are an AI assistant. I cannot answer this question based on the provided documents. Please respond based on your general knowledge or state that you cannot answer based on documents.\n\n' +
      persona.systemPrompt;
    log.info(
      `[Chat - ${correlationId}] Responding based on general knowledge (or returning specific message).`
    );
  }

  // Debug: Check for any messages with null/empty content
  const invalidMessages = chatSession.messages.filter((entry: IChatMessage) => !entry.content);
  if (invalidMessages.length > 0) {
    log.warn(
      `[Chat - ${correlationId}] Found ${invalidMessages.length} messages with null/empty content. These will be filtered out.`
    );
    invalidMessages.forEach((msg, index) => {
      log.debug(
        `[Chat - ${correlationId}] Invalid message ${index}: role=${msg.role}, content=${msg.content}, timestamp=${msg.timestamp}`
      );
    });
  }

  const messages: OpenAIChatCompletionMessageParam[] = [
    { role: 'system', content: finalSystemPrompt },
    ...chatSession.messages
      .filter((entry: IChatMessage) => entry.content != null && entry.content !== '') // Filter out null/undefined/empty content
      .map((entry: IChatMessage) => ({
        role: entry.role as 'user' | 'assistant', // Explicitly cast role type
        content: entry.content || '', // Fallback to empty string just in case
      })),
  ];

  if (initialSystemMessage) {
    // Add the initial system message if provided (e.g., from persona welcome)
    messages.unshift({ role: 'system', content: initialSystemMessage });
  }

  log.info(`[Chat - ${correlationId}] Sending request to OpenAI...`);
  try {
    // Ensure openaiResponse is not null before accessing properties
    const openaiResponse = await getChatCompletion(messages);
    const rawAssistantResponse = openaiResponse?.choices?.[0]?.message?.content;
    const refusalReason = (openaiResponse?.choices?.[0]?.message as any)?.refusal || null; // Capture refusal reason (not in all OpenAI types)

    // Validate assistant response content to prevent null/empty values
    let assistantResponse = '';
    if (
      rawAssistantResponse &&
      typeof rawAssistantResponse === 'string' &&
      rawAssistantResponse.trim().length > 0
    ) {
      assistantResponse = rawAssistantResponse.trim();
    } else {
      log.warn(
        `[Chat - ${correlationId}] OpenAI returned invalid content: ${typeof rawAssistantResponse}, value: ${rawAssistantResponse}`
      );
      assistantResponse =
        'I apologize, but I was unable to generate a proper response. Please try again.';
    }

    log.info(`[Chat - ${correlationId}] Received response from OpenAI.`);

    // Add assistant message to history with validated content
    chatSession.messages.push({
      role: 'assistant',
      content: assistantResponse,
      timestamp: new Date(),
      sources: (sources as RAGSource[]).map(s => ({
        documentId: s.documentId,
        fileName: s.fileName,
        type: s.type as 'user' | 'system',
        origin: s.origin,
      })),
    } as IChatMessage);
    await chatSession.save();

    if (refusalReason) {
      log.warn(
        `[Chat - ${correlationId}] OpenAI refused to answer: ${refusalReason}. Responding with generic message.`
      );
      // The LLM itself indicated refusal, use its refusal message or a predefined one.
      return res.status(200).json({
        success: true,
        message: `I cannot answer this question based on the provided documents. ${refusalReason}`,
        sources: [], // No sources if LLM explicitly refused to use them
      });
    }

    log.info(
      `[Chat - ${correlationId}] Sending final response. Answer length: ${assistantResponse.length}, Sources count: ${sources.length}`
    );

    return res.status(200).json({
      success: true,
      message: assistantResponse,
      sources: (sources as RAGSource[]).map(s => ({
        documentId: s.documentId,
        fileName: s.fileName,
        type: s.type,
        origin: s.origin,
      })),
    });
  } catch (openaiError: unknown) {
    log.error(openaiError, `[Chat - ${correlationId}] OpenAI chat completion failed.`);
    // Check if it's an OpenAI refusal within the error structure
    const errorMessage =
      openaiError instanceof Error
        ? openaiError.message
        : String(openaiError) || 'An error occurred while generating the response.';
    const isRefusal =
      errorMessage.includes('I cannot answer this question based on the provided documents') ||
      errorMessage.includes('refusal');

    // Ensure error response content is never null or empty
    const errorResponseContent =
      'I apologize, but I encountered an error while processing your request. Please try again.';

    chatSession.messages.push({
      role: 'assistant',
      content: errorResponseContent,
      timestamp: new Date(),
      sources: [],
    });
    await chatSession.save();

    return res.status(500).json({
      success: false,
      message: isRefusal
        ? errorMessage
        : `I apologize, but I encountered an error while processing your request. Please try again. ${errorMessage}`,
      sources: [],
    });
  }
});

// Extend Multer Request interface to include potential filter error
// (The global declaration above already handles this)

// Add multer error handling middleware *before* the routes that use multer
router.use((err: unknown, _req: Request, res: Response, next: NextFunction): void => {
  if (err instanceof multer.MulterError) {
    log.warn('[MulterError]', err.code, err instanceof Error ? err.message : String(err));
    res.status(400).json({
      success: false,
      message: `File upload error: ${err instanceof Error ? err.message : String(err)}`,
    });
    return;
  } else if (
    err && err instanceof Error
      ? err.message
      : String(err) && err instanceof Error
        ? err.message
        : String(err).startsWith('Invalid file type')
  ) {
    // Handle the custom error from fileFilter
    log.warn('[FileType Error]', err instanceof Error ? err.message : String(err));
    res
      .status(400)
      .json({ success: false, message: err instanceof Error ? err.message : String(err) });
    return;
  }
  // If it's not a handled error, explicitly pass it to the next error handler
  if (!res.headersSent) {
    next(err);
  }
});

// --- Refactored View Document Handler (Direct S3 Fetch) ---
const handleServeUserDocument = async (req: Request, res: Response, next: NextFunction) => {
  // Existing param extraction
  const { docId } = req.params; // Use docId consistently
  const userId = req.user?._id;
  const userRole = req.user?.role;

  // --- START: Added Logging ---
  log.debug(`[Serve Doc] ENTER - docId: ${docId}, userId: ${userId}, role: ${userRole}`);
  // --- END: Added Logging ---

  if (!mongoose.Types.ObjectId.isValid(docId)) {
    log.warn(`[Serve Doc] Invalid document ID format: ${docId}`);
    return res.status(400).json({ success: false, message: 'Invalid document ID format.' });
  }
  if (!userId) {
    log.error('[Serve Doc] Unauthorized access attempt - User ID missing.');
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }

  // --- START: Added Try/Catch Block ---
  try {
    // --- START: Added Logging ---
    log.debug(`[Serve Doc] Attempting DB lookup for docId: ${docId}, userId: ${userId}`);
    // --- END: Added Logging ---

    // First, find the document to determine its type
    const document = await UserDocument.findOne({
      _id: new mongoose.Types.ObjectId(docId),
    }).select(
      's3Bucket s3Key file_extension originalFileName mimeType userId sourceType tenantKbId'
    );

    if (!document) {
      log.warn(`[Serve Doc] Document not found: ${docId}`);
      return res.status(404).json({ success: false, message: 'Document not found.' });
    }

    // Check access permissions based on document type
    if (document.sourceType === 'user') {
      // User documents: only owner can view
      if (!document.userId || document.userId.toString() !== userId.toString()) {
        log.warn(`[Serve Doc] User ${userId} denied access to user document ${docId}`);
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }
    } else if (document.sourceType === 'tenant' && document.tenantKbId) {
      // Tenant KB documents: check if user has access or is admin
      if (userRole !== 'admin') {
        const { TenantKnowledgeBase } = await import('../models/TenantKnowledgeBase');
        const { UserKBAccess } = await import('../models/UserKBAccess');

        const kb = await TenantKnowledgeBase.findById(document.tenantKbId);
        const userAccess = await UserKBAccess.findOne({ userId });

        const hasAccess =
          kb &&
          (kb.accessType === 'public' ||
            (userAccess &&
              userAccess.enabledKnowledgeBases.some(
                id => id.toString() === document!.tenantKbId!.toString()
              )));

        if (!hasAccess) {
          log.warn(`[Serve Doc] User ${userId} denied access to tenant document ${docId}`);
          return res
            .status(403)
            .json({ success: false, message: 'Access denied to this document.' });
        }
      }
    } else if (document.sourceType === 'system') {
      // System KB documents: only admins can view
      if (userRole !== 'admin') {
        log.warn(`[Serve Doc] Non-admin user ${userId} denied access to system document ${docId}`);
        return res
          .status(403)
          .json({ success: false, message: 'Only administrators can view system documents.' });
      }
    }

    // --- START: Added Logging ---
    log.debug(
      `[Serve Doc] DB Lookup SUCCESS - Found document: ${document.originalFileName} (type: ${document.sourceType})`
    );
    // --- END: Added Logging ---

    // --- START METADATA CHECK FIX ---
    if (!document.s3Bucket || !document.s3Key || !document.originalFileName || !document.mimeType) {
      // --- START: Added Logging ---
      log.error(
        `[Serve Doc] Missing required S3/metadata properties for docId: ${docId}. Doc: ${JSON.stringify(document)}`
      );
      // --- END: Added Logging ---
      // Return 404 Not Found instead of 500, as the file data is essentially missing/incomplete
      return res
        .status(404)
        .json({ success: false, message: 'Document file information is incomplete or missing.' });
    }
    // --- END METADATA CHECK FIX ---

    log.debug(
      `[Serve Doc] Found document: ${document.originalFileName}. Fetching from S3: bucket=${document.s3Bucket}, key=${document.s3Key}`
    );

    // --- START: Added Logging ---
    // Validate required fields for S3 key construction
    if (!document.s3Key || !document.file_extension) {
      log.error(
        `[Serve Doc] Essential document properties (s3Key or file_extension) missing for docId: ${docId}. Doc: ${JSON.stringify(document)}`
      );
      // Return 409 Conflict if essential data for S3 key is missing, indicating resource not in correct state.
      return res.status(409).json({
        success: false,
        message: 'Document is not yet ready for viewing or essential data is missing.',
      });
    }

    // FIXED: Smart S3 key construction to handle all document types
    let s3KeyForFetch: string;

    // Check if s3Key already contains the full path
    if (document.s3Key.includes('/') || document.s3Key.includes('.')) {
      s3KeyForFetch = document.s3Key;
    } else {
      // s3Key is just a UUID, construct the full path based on document type
      if (document.sourceType === 'user' && document.userId) {
        s3KeyForFetch = `user_docs/${document.userId.toString()}/${document.s3Key}.${document.file_extension}`;
      } else if (document.sourceType === 'tenant' && document.tenantKbId) {
        s3KeyForFetch = `tenant_kb/${document.tenantKbId.toString()}/${document.s3Key}.${document.file_extension}`;
      } else if (document.sourceType === 'system') {
        s3KeyForFetch = `system_kb/${document.s3Key}.${document.file_extension}`;
      } else {
        log.error(
          `[Serve Doc] Unable to construct S3 key for document ${docId} with sourceType: ${document.sourceType}`
        );
        return res
          .status(500)
          .json({ success: false, message: 'Document storage path could not be determined.' });
      }
    }

    log.debug(
      `[Serve Doc] Constructed S3 key for presigned URL: ${s3KeyForFetch}. Bucket: ${document.s3Bucket}`
    );
    // --- END: Added Logging ---
    // const fileStream = await getFileStream(s3KeyForFetch); // Old direct stream logic

    // New: Generate a presigned URL instead of streaming
    const { getPresignedUrlForView } = await import('../utils/s3Helper');

    // CRITICAL FIX: Always use the current bucket from environment regardless of what's stored in the document
    // This ensures we're looking in the right bucket no matter where the document record says it was originally stored
    const currentBucket = process.env.AWS_BUCKET_NAME || 'local';
    const bucketForPresignedUrl = currentBucket;

    log.debug(
      `[Serve Doc] BUCKET FIX: Document record has bucket=${document.s3Bucket}, but we're using current bucket=${currentBucket}`
    );

    log.debug(
      `[Serve Doc] Using bucket for presigned URL: ${bucketForPresignedUrl}, S3 key: ${s3KeyForFetch}`
    );

    const presignedUrl = await getPresignedUrlForView(s3KeyForFetch, 3600, bucketForPresignedUrl); // 1 hour expiry with bucket override

    if (!presignedUrl) {
      log.error(`[Serve Doc] Failed to generate presigned URL for key: ${s3KeyForFetch}`);
      return res
        .status(500)
        .json({ success: false, message: 'Could not generate secure link for the document.' });
    }

    log.debug(`[Serve Doc] Generated presigned URL for ${document.originalFileName}`);

    return res.status(200).json({
      success: true,
      url: presignedUrl,
      fileName: document.originalFileName, // Send filename for context
      message: 'Presigned URL generated successfully.',
    });

    // --- START: Modified Original Catch Block ---
  } catch (error) {
    log.error(`[Serve Doc] ERROR during processing for docId ${docId}, userId ${userId}:`, error);
    // Check if error originates from S3 helper specifically
    if (
      error instanceof Error && error instanceof Error
        ? error.message
        : String(error).includes('S3 GetObject Failed')
    ) {
      log.error(`[Serve Doc] Specific S3 GetObject failure for docId: ${docId}`);
      // Avoid sending detailed S3 errors potentially, but keep specific log
      // Ensure we don't call next() if we send a response here
      if (!res.headersSent) {
        return res
          .status(500)
          .json({ success: false, message: 'Could not retrieve the document file from storage.' });
      }
      // If headers sent, just log and let it end (though Express might complain at runtime)
      log.error('[Serve Doc] Headers already sent when S3 GetObject error occurred.');
      return; // Explicitly return undefined here
    }

    // For all other errors, pass to the final error handler if possible
    if (!res.headersSent) {
      log.debug(`[Serve Doc] Passing error to next middleware for docId: ${docId}`);
      return next(error); // Ensure we return after calling next
    } else {
      // If headers are sent, we can't safely call next() or send another response.
      // Log the issue, the request will likely hang or terminate uncleanly.
      log.error(
        `[Serve Doc] Cannot pass error to next middleware - headers already sent for docId: ${docId}. Error:`,
        error
      );
      // Explicitly return to satisfy TS compiler, though the request is likely broken.
      return;
    }
  }
  // --- END: Modified Original Catch Block ---
};

// GET /api/documents/view/:docId (Uses Direct S3 Fetch)
router.get('/view/:docId', protect, checkSession, handleServeUserDocument);

// GET /api/documents/:docId/download - Download document
router.get(
  '/:docId/download',
  protect,
  checkSession,
  async (req: Request, res: Response, next: NextFunction) => {
    const { docId } = req.params;
    const userId = req.user?._id;

    log.debug(`[Download Doc] Request to download document ${docId} by user ${userId}`);

    if (!mongoose.Types.ObjectId.isValid(docId)) {
      return res.status(400).json({ success: false, message: 'Invalid document ID format.' });
    }
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    try {
      // Check if it's a user document
      const document = await UserDocument.findOne({
        _id: new mongoose.Types.ObjectId(docId),
        $or: [{ userId: userId, sourceType: 'user' }, { sourceType: 'tenant' }],
      }).select(
        's3Bucket s3Key file_extension originalFileName mimeType userId sourceType tenantKbId'
      );

      // If it's a tenant document, verify user has access
      if (document && document.sourceType === 'tenant' && document.tenantKbId) {
        const { TenantKnowledgeBase } = await import('../models/TenantKnowledgeBase');
        const { UserKBAccess } = await import('../models/UserKBAccess');

        const kb = await TenantKnowledgeBase.findById(document.tenantKbId);
        const userAccess = await UserKBAccess.findOne({ userId });

        const hasAccess =
          kb &&
          (kb.accessType === 'public' ||
            (userAccess &&
              userAccess.enabledKnowledgeBases.some(
                id => id.toString() === document!.tenantKbId!.toString()
              )));

        if (!hasAccess) {
          log.warn(
            `[Download Doc] User ${userId} does not have access to tenant document ${docId}`
          );
          return res
            .status(403)
            .json({ success: false, message: 'Access denied to this document.' });
        }
      } else if (!document) {
        log.warn(
          `[Download Doc] Document ${docId} not found or user ${userId} does not have access`
        );
        return res
          .status(404)
          .json({ success: false, message: 'Document not found or access denied.' });
      }

      if (!document.s3Key || !document.originalFileName || !document.mimeType) {
        log.error(`[Download Doc] Missing required properties for document ${docId}`);
        return res
          .status(404)
          .json({ success: false, message: 'Document file information is incomplete.' });
      }

      // Get file stream from S3
      const { getFileStream } = await import('../utils/s3Helper');

      // Construct S3 key
      let s3KeyForFetch: string;
      if (document.s3Key.includes('/') || document.s3Key.includes('.')) {
        s3KeyForFetch = document.s3Key;
      } else {
        const prefix =
          document.sourceType === 'tenant' && document.tenantKbId
            ? `tenant_kb/${document.tenantKbId}`
            : `user_docs/${document.userId}`;
        s3KeyForFetch = `${prefix}/${document.s3Key}.${document.file_extension}`;
      }

      log.debug(`[Download Doc] Fetching from S3: ${s3KeyForFetch}`);

      const fileStream = await getFileStream(s3KeyForFetch);

      // Set headers for download
      res.setHeader('Content-Type', document.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${document.originalFileName}"`);

      // Pipe the stream to response
      fileStream.pipe(res);

      fileStream.on('error', error => {
        log.error(`[Download Doc] Stream error for document ${docId}:`, error);
        if (!res.headersSent) {
          res.status(500).json({ success: false, message: 'Error downloading document.' });
        }
      });
    } catch (error) {
      log.error(`[Download Doc] Error downloading document ${docId}:`, error);
      if (!res.headersSent) {
        return next(error);
      }
    }
  }
);

// --- Refactored Delete Single User Document Handler ---
const handleDeleteDocument = async (req: Request, res: Response, next: NextFunction) => {
  const { docId } = req.params;
  const userId = req.user?._id;
  const userRole = req.user?.role;

  log.debug(
    `[Delete Single Doc] User ${userId} (role: ${userRole}) deleting document ID: ${docId}`
  );

  if (!mongoose.Types.ObjectId.isValid(docId)) {
    return res.status(400).json({ success: false, message: 'Invalid document ID format.' });
  }
  if (!userId) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  try {
    // First, try to find the document to determine its type
    const document = await UserDocument.findOne({
      _id: docId,
      $or: [
        { userId: userId, sourceType: 'user' }, // User's own document
        { sourceType: 'tenant' }, // Tenant KB document
        { sourceType: 'system' }, // System KB document (admin only)
      ],
    }).select('s3Bucket s3Key sourceType tenantKbId userId');

    if (!document) {
      return res
        .status(404)
        .json({ success: false, message: 'Document not found or access denied.' });
    }

    // Check permissions based on document type
    if (document.sourceType === 'system') {
      // Only admins can delete system documents
      if (userRole !== 'admin') {
        log.warn(
          `[Delete Single Doc] Non-admin user ${userId} attempted to delete system document ${docId}`
        );
        return res
          .status(403)
          .json({ success: false, message: 'Only administrators can delete system documents.' });
      }
    } else if (document.sourceType === 'tenant' && document.tenantKbId) {
      // Only admins can delete tenant KB documents
      if (userRole !== 'admin') {
        log.warn(
          `[Delete Single Doc] Non-admin user ${userId} attempted to delete tenant document ${docId}`
        );
        return res.status(403).json({
          success: false,
          message: 'Only administrators can delete tenant knowledge base documents.',
        });
      }
    } else if (document.sourceType === 'user') {
      // Users can only delete their own documents
      if (!document.userId || document.userId.toString() !== userId.toString()) {
        log.warn(
          `[Delete Single Doc] User ${userId} attempted to delete another user's document ${docId}`
        );
        return res
          .status(403)
          .json({ success: false, message: 'You can only delete your own documents.' });
      }
    }

    // Delete vectors (assuming stored with documentId metadata)
    log.debug(`[Delete Single Doc] Deleting Pinecone vectors for doc ID: ${docId}`);
    await deleteVectorsByFilter({ documentId: docId });
    log.debug(`[Delete Single Doc] Pinecone deletion complete for doc ID: ${docId}`);

    // Delete S3 object
    if (document.s3Bucket && document.s3Key) {
      try {
        log.debug(`[Delete Single Doc] Deleting S3 object: ${document.s3Bucket}/${document.s3Key}`);
        await deleteFile(document.s3Key);
        log.debug(`[Delete Single Doc] S3 deletion complete for doc ID: ${docId}`);
      } catch (s3Error: unknown) {
        log.error('[Delete Single Doc] S3 deletion failed (continuing):', s3Error);
      }
    } else {
      log.warn(`[Delete Single Doc] Skipping S3 deletion - info missing for doc ID: ${docId}`);
    }

    // Delete DB record
    await UserDocument.deleteOne({ _id: docId });
    log.debug(`[Delete Single Doc] Deleted MongoDB record for doc ID: ${docId}`);

    // If it was a tenant KB document, update the document count
    if (document.sourceType === 'tenant' && document.tenantKbId) {
      const { TenantKnowledgeBase } = await import('../models/TenantKnowledgeBase');
      await TenantKnowledgeBase.findByIdAndUpdate(document.tenantKbId, {
        $inc: { documentCount: -1 },
      });
      log.debug(`[Delete Single Doc] Updated document count for tenant KB ${document.tenantKbId}`);
    }

    return res.status(200).json({ success: true, message: 'Document deleted successfully.' });
  } catch (error) {
    log.error(`[Delete Single Doc] Error for doc ID ${docId}:`, error);
    return next(error);
  }
};

// --- Refactored Delete All User Documents Handler ---
const handleDeleteAllUserDocuments = async (req: Request, res: Response, next: NextFunction) => {
  const userId = req.user?._id;
  const userIdString = userId?.toString();

  log.debug(`[Delete All Docs S3] User ${userIdString} deleting all documents.`);
  if (!userId) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  let deletedDbCount = 0;
  let successfulS3Deletions = 0;
  let attemptedS3Deletions = 0;
  const failedS3Keys: string[] = [];

  try {
    const documentsToDelete = await UserDocument.find({
      userId: userId,
      sourceType: 'user',
    }).select('s3Bucket s3Key');
    log.debug(
      `[Delete All Docs S3] Found ${documentsToDelete.length} documents for user ${userIdString}.`
    );

    if (documentsToDelete.length === 0) {
      return res
        .status(200)
        .json({ success: true, message: 'No documents to delete.', deletedDbCount: 0 });
    }

    // Delete Pinecone vectors
    const pineconeFilter = { userId: userIdString, sourceType: 'user' };
    log.debug('[Delete All Docs S3] Deleting Pinecone vectors:', pineconeFilter);
    deleteVectorsByFilter(pineconeFilter)
      .then(() =>
        log.debug(`[Delete All Docs S3] Pinecone deletion initiated for user ${userIdString}.`)
      )
      .catch(pineconeError =>
        log.error('[Delete All Docs S3] Pinecone deletion error:', pineconeError)
      );

    // Delete S3 objects
    attemptedS3Deletions = documentsToDelete.length;
    log.debug(`[Delete All Docs S3] Deleting ${attemptedS3Deletions} S3 objects...`);
    for (const doc of documentsToDelete) {
      if (doc.s3Bucket && doc.s3Key) {
        try {
          log.debug(`[Delete All Docs] Deleting S3 object: ${doc.s3Bucket}/${doc.s3Key}`);
          await deleteFile(doc.s3Key);
          log.debug(`[Delete All Docs] S3 object deleted: ${doc.s3Key}`);
          successfulS3Deletions++;
        } catch (s3Error: unknown) {
          log.error(`[Delete All Docs S3] Failed S3 delete: ${doc.s3Key}`, s3Error);
          failedS3Keys.push(doc.s3Key);
        }
      } else {
        failedS3Keys.push(`RecordID:${doc._id}(Missing S3 Info)`);
      }
    }
    log.debug(
      `[Delete All Docs S3] S3 deletion summary: ${successfulS3Deletions}/${attemptedS3Deletions} succeeded.`
    );

    // Delete DB records
    const deleteResult = await UserDocument.deleteMany({ userId: userId, sourceType: 'user' });
    deletedDbCount = deleteResult.deletedCount;
    log.debug(`[Delete All Docs S3] Deleted ${deletedDbCount} MongoDB records.`);

    return res.status(200).json({
      success: true,
      message: `Deleted ${deletedDbCount} documents. S3: ${successfulS3Deletions}/${attemptedS3Deletions} deleted.`,
      deletedDbCount,
      s3Deletions: {
        attempted: attemptedS3Deletions,
        successful: successfulS3Deletions,
        failed: failedS3Keys.length > 0 ? failedS3Keys : undefined,
      },
    });
  } catch (error) {
    log.error('[Delete All Docs S3] Error:', error);
    return next(error);
  }
};

// --- DELETE Routes using refactored handlers ---
router.delete('/all', protect, checkSession, handleDeleteAllUserDocuments);
router.delete('/:docId', protect, checkSession, handleDeleteDocument);

// POST /api/documents/generate-chat (Keep original for now, might need refactor later if sources change)
// router.post('/generate-chat', ... existing code ... );

// Final Error Handler (Keep original)
router.use((err: unknown, req: Request, res: Response, next: NextFunction): void => {
  log.error('[Global Error Handler] Caught error:', err);
  const statusCode = (err as any)?.statusCode || 500;
  const message =
    err instanceof Error ? err.message : String(err) || 'An unexpected error occurred.';
  res.status(statusCode).json({
    success: false,
    message: message,
    // In production, avoid sending full error stack to client
    // error: process.env.NODE_ENV === 'development' ? err instanceof Error ? err.stack : undefined : undefined,
  });
});

export { handleDeleteDocument };
export default router;
