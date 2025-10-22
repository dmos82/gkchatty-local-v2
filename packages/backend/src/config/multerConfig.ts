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

// File filter function (remains the same but add markdown support)
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimes = ['application/pdf', 'text/plain', 'text/markdown'];
  if (allowedMimes.includes(file.mimetype)) {
    console.log(`[Multer] Allowed file type: ${file.mimetype}`);
    cb(null, true);
  } else {
    console.log(`[Multer] Blocked file type: ${file.mimetype}`);
    cb(new Error('Invalid file type. Only PDF, TXT, and Markdown files are allowed.'));
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
    fileSize: 3 * 1024 * 1024, // 3 MB limit for icons (50% increase from 2MB)
  },
});

export { iconUpload };
export default userUpload;
