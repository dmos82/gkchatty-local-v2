/**
 * Upload Routes - Handle multipart file uploads for local mode
 *
 * Replaces S3 presigned URL flow with direct backend upload.
 * Files are saved to local filesystem and processed immediately.
 */

import { Router } from 'express';
import { upload, handleMulterError } from '../middleware/fileUploadMiddleware';
import { protect, isAdmin } from '../middleware/authMiddleware';
import storage from '../utils/storageInterface';
import { getLogger } from '../utils/logger';
import { UserDocumentModel, SystemKbDocumentModel } from '../utils/modelFactory';
import { processAndEmbedDocument } from '../utils/documentProcessor';

const router = Router();
const log = getLogger('uploadRoutes');

/**
 * POST /api/upload/document
 * Upload user document (requires authentication)
 */
router.post(
  '/document',
  protect,
  upload.single('file'),
  handleMulterError,
  async (req: any, res: any) => {
    try {
      const file = req.file;
      const user = req.user;

      if (!file) {
        log.warn('[Upload] No file provided in request');
        return res.status(400).json({
          success: false,
          message: 'No file provided'
        });
      }

      log.info(
        `[Upload] Processing upload from user ${user._id}: ${file.originalname}`
      );

      // Generate unique filename: userId_timestamp_originalName
      const timestamp = Date.now();
      const safeFilename = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
      const s3Key = `user-documents/${user._id}/${timestamp}_${safeFilename}`;

      // Save file to local storage
      log.debug(`[Upload] Saving file to: ${s3Key}`);
      const fileUrl = await storage.saveFile(s3Key, file.buffer, file.mimetype);

      log.debug(`[Upload] File saved successfully: ${fileUrl}`);

      // Extract file extension
      const fileExtension = file.originalname.split('.').pop()?.toLowerCase() || '';

      // Create document record in database
      const documentData = {
        userId: user._id.toString(),
        originalFileName: file.originalname,
        s3Key: s3Key,
        s3Bucket: 'local', // Marker for local storage
        mimeType: file.mimetype,
        fileSize: file.size,
        file_extension: fileExtension,
        status: 'pending',
        sourceType: req.body.sourceType || 'user',
        uploadedAt: new Date()
      };

      log.debug('[Upload] Creating document record:', documentData);
      const document = await UserDocumentModel.create(documentData);

      log.info(
        `[Upload] Document created: ${document._id} - Status: ${document.status}`
      );

      // Trigger background processing
      log.debug(`[Upload] Triggering background processing for: ${document._id}`);
      processAndEmbedDocument(document._id.toString(), user._id.toString())
        .then(() => {
          log.info(`[Upload] Document processed successfully: ${document._id}`);
        })
        .catch((error) => {
          log.error(`[Upload] Document processing failed: ${document._id}`, error);
        });

      // Return success response
      return res.status(200).json({
        success: true,
        message: 'File uploaded successfully',
        documentId: document._id.toString(),
        status: document.status,
        fileName: document.originalFileName
      });
    } catch (error) {
      log.error('[Upload] Upload failed:', error);
      return res.status(500).json({
        success: false,
        message: 'Upload failed: ' + (error as Error).message
      });
    }
  }
);

/**
 * POST /api/upload/system-kb
 * Upload system knowledge base document (admin only)
 */
router.post(
  '/system-kb',
  protect,
  isAdmin,
  upload.single('file'),
  handleMulterError,
  async (req: any, res: any) => {
    try {
      const file = req.file;
      const user = req.user;

      // Check admin permission
      if (user.role !== 'admin') {
        log.warn(
          `[Upload] Unauthorized system KB upload attempt by user: ${user.userId}`
        );
        return res.status(403).json({
          success: false,
          message: 'Admin permission required'
        });
      }

      if (!file) {
        log.warn('[Upload] No file provided in request');
        return res.status(400).json({
          success: false,
          message: 'No file provided'
        });
      }

      log.info(`[Upload] Processing system KB upload: ${file.originalname}`);

      // Generate unique filename for system KB
      const timestamp = Date.now();
      const safeFilename = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
      const s3Key = `system-kb/${timestamp}_${safeFilename}`;

      // Save file to local storage
      log.debug(`[Upload] Saving system KB file to: ${s3Key}`);
      const fileUrl = await storage.saveFile(s3Key, file.buffer, file.mimetype);

      log.debug(`[Upload] System KB file saved successfully: ${fileUrl}`);

      // Extract file extension
      const fileExtension = file.originalname.split('.').pop()?.toLowerCase() || '';

      // Create document record in database
      const documentData = {
        originalFileName: file.originalname,
        s3Key: s3Key,
        s3Bucket: 'local',
        mimeType: file.mimetype,
        fileSize: file.size,
        file_extension: fileExtension,
        status: 'pending',
        sourceType: 'system_kb',
        uploadedAt: new Date()
      };

      log.debug('[Upload] Creating system KB document record:', documentData);
      const document = await SystemKbDocumentModel.create(documentData);

      log.info(
        `[Upload] System KB document created: ${document._id} - Status: ${document.status}`
      );

      // Trigger background processing
      log.debug(
        `[Upload] Triggering background processing for system KB: ${document._id}`
      );
      processAndEmbedDocument(document._id.toString(), null)
        .then(() => {
          log.info(
            `[Upload] System KB document processed successfully: ${document._id}`
          );
        })
        .catch((error) => {
          log.error(
            `[Upload] System KB document processing failed: ${document._id}`,
            error
          );
        });

      // Return success response
      return res.status(200).json({
        success: true,
        message: 'System KB file uploaded successfully',
        documentId: document._id.toString(),
        status: document.status,
        fileName: document.originalFileName
      });
    } catch (error) {
      log.error('[Upload] System KB upload failed:', error);
      return res.status(500).json({
        success: false,
        message: 'Upload failed: ' + (error as Error).message
      });
    }
  }
);

export default router;
