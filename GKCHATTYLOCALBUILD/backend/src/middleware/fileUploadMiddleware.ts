/**
 * File Upload Middleware - Multer configuration for local file uploads
 *
 * Handles multipart/form-data file uploads for document manager.
 * Replaces S3 presigned URL upload flow with direct backend upload.
 */

import multer from 'multer';
import path from 'path';
import { getLogger } from '../utils/logger';

const log = getLogger('fileUploadMiddleware');

// Allowed file types
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
  'text/markdown',
  'application/json',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp'
];

// File extensions corresponding to mime types
const ALLOWED_EXTENSIONS = [
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.txt',
  '.csv',
  '.md',
  '.json',
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp'
];

// Max file size: 50MB
const MAX_FILE_SIZE = 50 * 1024 * 1024;

/**
 * Multer storage configuration - memory storage
 * Files stored in memory as Buffer for processing
 */
const storage = multer.memoryStorage();

/**
 * File filter - validate file type
 */
const fileFilter = (
  req: any,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const mimeType = file.mimetype.toLowerCase();

  log.debug(
    `[FileUploadMiddleware] Validating file: ${file.originalname}, mime: ${mimeType}, ext: ${ext}`
  );

  // Check both mime type and extension
  if (ALLOWED_MIME_TYPES.includes(mimeType) && ALLOWED_EXTENSIONS.includes(ext)) {
    cb(null, true);
  } else {
    log.warn(
      `[FileUploadMiddleware] File rejected - invalid type: ${file.originalname}`
    );
    cb(
      new Error(
        `File type not allowed. Allowed types: ${ALLOWED_EXTENSIONS.join(', ')}`
      )
    );
  }
};

/**
 * Multer upload configuration
 */
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1 // Single file upload
  }
});

/**
 * Error handler for multer errors
 */
export const handleMulterError = (err: any, req: any, res: any, next: any) => {
  if (err instanceof multer.MulterError) {
    log.error('[FileUploadMiddleware] Multer error:', err);

    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB`
      });
    }

    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files. Only one file allowed per upload.'
      });
    }

    return res.status(400).json({
      success: false,
      message: 'File upload error: ' + err.message
    });
  } else if (err) {
    log.error('[FileUploadMiddleware] Upload error:', err);
    return res.status(400).json({
      success: false,
      message: err.message || 'File upload failed'
    });
  }

  next();
};
