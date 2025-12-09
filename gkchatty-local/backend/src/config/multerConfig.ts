import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { Request } from 'express';
import os from 'os';

// MEDIUM-003: Import file validation utilities for enhanced security
// Additional validation is performed in middleware/fileValidation.ts

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
    // Generate a unique filename to avoid collisions
    const uniquePrefix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    // Keep original extension
    const extension = path.extname(file.originalname);
    cb(null, uniquePrefix + extension);
  },
});

// File filter function with extension fallback for markdown files
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimes = [
    'application/pdf',
    'text/plain',
    'text/markdown',
    // Word documents
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'application/msword', // .doc
  ];
  const allowedExtensions = ['.pdf', '.txt', '.md', '.markdown', '.docx', '.doc'];

  const fileExtension = path.extname(file.originalname).toLowerCase();

  // Accept if MIME type matches OR if extension is allowed (for .md files with incorrect MIME)
  if (allowedMimes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
    console.log(`[Multer] Allowed file: ${file.originalname} (mime: ${file.mimetype}, ext: ${fileExtension})`);
    cb(null, true);
  } else {
    console.log(`[Multer] Blocked file: ${file.originalname} (mime: ${file.mimetype}, ext: ${fileExtension})`);
    cb(new Error('Invalid file type. Only PDF, TXT, Markdown, and Word documents are allowed.'));
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

// Configure multer instance with disk storage
const userUpload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 22.5 * 1024 * 1024, // 22.5 MB limit (50% increase from 15MB)
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
