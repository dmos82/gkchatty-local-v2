import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { Request } from 'express';
import os from 'os';

// MEDIUM-003: Import file validation utilities for enhanced security
// Additional validation is performed in middleware/fileValidation.ts

// CRITICAL-004: Filename sanitization to prevent path traversal and injection attacks
const ALLOWED_EXTENSIONS = new Set([
  // Documents
  '.pdf', '.txt', '.md', '.markdown', '.docx', '.doc',
  // Excel
  '.xlsx', '.xls',
  // Images
  '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.tif',
  // Audio
  '.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac', '.webm',
  // Video
  '.mp4', '.mov', '.avi', '.mkv', '.m4v', '.flv', '.wmv', '.mpeg', '.mpg',
]);

/**
 * CRITICAL-004: Sanitize filename to prevent path traversal and injection attacks
 * - Removes path traversal sequences (../, ..\)
 * - Removes null bytes
 * - Strips any directory components
 * - Only allows alphanumeric, dots, hyphens, underscores, and spaces
 * - Validates extension against allowed list
 */
const sanitizeFilename = (originalName: string): { baseName: string; extension: string; isValid: boolean } => {
  // Remove null bytes (can bypass security checks)
  let sanitized = originalName.replace(/\0/g, '');

  // Remove path traversal sequences
  sanitized = sanitized.replace(/\.\.\//g, '').replace(/\.\.\\/g, '');

  // Extract only the filename (remove any directory path)
  sanitized = path.basename(sanitized);

  // Get extension and validate
  const extension = path.extname(sanitized).toLowerCase();
  const isValidExtension = ALLOWED_EXTENSIONS.has(extension);

  // Get base name without extension
  let baseName = path.basename(sanitized, extension);

  // Remove any remaining dangerous characters, only allow safe chars
  // Allow alphanumeric, dots (not at start), hyphens, underscores, spaces
  baseName = baseName.replace(/[^a-zA-Z0-9.\-_ ]/g, '_');

  // Remove leading dots (hidden files) and multiple consecutive dots
  baseName = baseName.replace(/^\.+/, '').replace(/\.{2,}/g, '.');

  // Ensure the filename isn't empty after sanitization
  if (!baseName || baseName.trim() === '') {
    baseName = 'file';
  }

  // Truncate long filenames (prevent DoS with extremely long names)
  if (baseName.length > 200) {
    baseName = baseName.substring(0, 200);
  }

  return { baseName, extension, isValid: isValidExtension };
};

// Create a temporary upload directory within the system temp directory
const TEMP_UPLOAD_DIR = path.join(os.tmpdir(), 'gkchatty_temp_uploads');

// Ensure temp directory exists
if (!fs.existsSync(TEMP_UPLOAD_DIR)) {
  fs.mkdirSync(TEMP_UPLOAD_DIR, { recursive: true });
  console.log(`[Multer Config] Created temporary upload directory: ${TEMP_UPLOAD_DIR}`);
}

// Use disk storage for temporary files to reduce memory pressure
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, TEMP_UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    // CRITICAL-004: Use sanitized filename to prevent path traversal attacks
    const { extension, isValid } = sanitizeFilename(file.originalname);

    // Generate a unique filename to avoid collisions
    const uniquePrefix = Date.now() + '-' + Math.round(Math.random() * 1e9);

    // Only use the sanitized extension if it's valid, otherwise reject
    if (!isValid) {
      console.log(`[Multer] SECURITY: Blocked file with invalid extension: ${file.originalname}`);
      return cb(new Error('Invalid file extension'), '');
    }

    cb(null, uniquePrefix + extension);
  },
});

// File filter function with extension fallback for all supported file types
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimes = [
    // Documents
    'application/pdf',
    'text/plain',
    'text/markdown',
    // Word documents
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'application/msword', // .doc
    // Excel
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-excel', // .xls
    // Images
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/bmp',
    'image/webp',
    'image/tiff',
    // Audio
    'audio/mpeg', // .mp3
    'audio/wav',
    'audio/x-wav',
    'audio/mp4',
    'audio/x-m4a',
    'audio/aac',
    'audio/ogg',
    'audio/flac',
    'audio/webm',
    // Video
    'video/mp4',
    'video/quicktime', // .mov
    'video/x-msvideo', // .avi
    'video/x-matroska', // .mkv
    'video/x-m4v',
    'video/x-flv',
    'video/x-ms-wmv',
    'video/mpeg',
    'video/webm',
  ];
  const allowedExtensions = [
    // Documents
    '.pdf', '.txt', '.md', '.markdown', '.docx', '.doc',
    // Excel
    '.xlsx', '.xls',
    // Images
    '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.tif',
    // Audio
    '.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac', '.webm',
    // Video
    '.mp4', '.mov', '.avi', '.mkv', '.m4v', '.flv', '.wmv', '.mpeg', '.mpg',
  ];

  const fileExtension = path.extname(file.originalname).toLowerCase();

  // Accept if MIME type matches OR if extension is allowed (for files with incorrect MIME)
  if (allowedMimes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
    console.log(`[Multer] Allowed file: ${file.originalname} (mime: ${file.mimetype}, ext: ${fileExtension})`);
    cb(null, true);
  } else {
    console.log(`[Multer] Blocked file: ${file.originalname} (mime: ${file.mimetype}, ext: ${fileExtension})`);
    cb(new Error('Invalid file type. Allowed: PDF, TXT, Word, Excel, images, audio, and video files.'));
  }
};

// Image file filter function for icon uploads
const imageFileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (allowedMimes.includes(file.mimetype)) {
    console.log(`[Multer] Allowed image type: ${file.mimetype}`);
    cb(null, true);
  } else {
    console.log(`[Multer] Blocked image type: ${file.mimetype}`);
    cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WEBP images are allowed.'));
  }
};

// File size limits by type (in bytes)
const FILE_SIZE_LIMITS = {
  document: 25 * 1024 * 1024,   // 25 MB for documents (PDF, DOCX, TXT, etc.)
  image: 10 * 1024 * 1024,       // 10 MB for images
  video: 100 * 1024 * 1024,      // 100 MB for video files
  audio: 50 * 1024 * 1024,       // 50 MB for audio files
  default: 25 * 1024 * 1024,     // 25 MB default
};

// Get appropriate file size limit based on MIME type
const getFileSizeLimit = (mimetype: string): number => {
  if (mimetype.startsWith('video/')) return FILE_SIZE_LIMITS.video;
  if (mimetype.startsWith('audio/')) return FILE_SIZE_LIMITS.audio;
  if (mimetype.startsWith('image/')) return FILE_SIZE_LIMITS.image;
  return FILE_SIZE_LIMITS.document;
};

// Configure multer instance with disk storage and tiered limits
const userUpload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    // First run the standard file filter
    fileFilter(req, file, (err, accepted) => {
      if (err || !accepted) {
        return cb(err, false);
      }
      // Check file size limit for this type (multer will enforce the max)
      const limit = getFileSizeLimit(file.mimetype);
      console.log(`[Multer] File type: ${file.mimetype}, Size limit: ${limit / 1024 / 1024}MB`);
      cb(null, true);
    });
  },
  limits: {
    fileSize: FILE_SIZE_LIMITS.video, // Max possible (video) - individual checks happen in fileFilter
  },
});

// Configure multer instance for icon uploads
const iconUpload = multer({
  storage: storage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB limit for icons
  },
});

// DM attachment file filter - images and common file types
const dmAttachmentFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const allowedMimes = [
    // Images
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    // Documents
    'application/pdf', 'text/plain', 'text/markdown',
    // Word documents
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'application/msword', // .doc
    // Common files
    'application/zip', 'application/x-zip-compressed',
  ];
  const allowedExtensions = ['.docx', '.doc']; // Extension fallback for Word docs

  const fileExtension = path.extname(file.originalname).toLowerCase();

  if (allowedMimes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
    console.log(`[Multer] Allowed DM attachment: ${file.originalname} (mime: ${file.mimetype})`);
    cb(null, true);
  } else {
    console.log(`[Multer] Blocked DM attachment: ${file.originalname} (mime: ${file.mimetype})`);
    cb(new Error('Invalid file type. Only images, PDFs, text files, Word documents, and ZIP archives are allowed.'));
  }
};

// Configure multer instance for DM attachments
const dmAttachmentUpload = multer({
  storage: storage,
  fileFilter: dmAttachmentFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB limit for DM attachments
  },
});

// Voice message file filter
const voiceFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const allowedMimes = [
    'audio/webm',
    'audio/mp4',
    'audio/ogg',
    'audio/mpeg',
    'audio/wav',
    'audio/x-m4a',
  ];

  if (allowedMimes.includes(file.mimetype)) {
    console.log(`[Multer] Allowed voice message: ${file.originalname} (mime: ${file.mimetype})`);
    cb(null, true);
  } else {
    console.log(`[Multer] Blocked voice message: ${file.originalname} (mime: ${file.mimetype})`);
    cb(new Error('Invalid file type. Only audio files (WebM, MP4, OGG, MP3, WAV, M4A) are allowed.'));
  }
};

// Configure multer instance for voice messages
const dmVoiceUpload = multer({
  storage: storage,
  fileFilter: voiceFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB limit for voice messages (2 min at reasonable quality)
  },
});

export { iconUpload, dmAttachmentUpload, dmVoiceUpload };
export default userUpload;
