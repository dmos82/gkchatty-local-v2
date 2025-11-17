import { Request } from 'express';
import path from 'path';
import { fileTypeFromBuffer } from 'file-type';

/**
 * MEDIUM-003: Content Type Validation Middleware
 * 
 * This middleware provides comprehensive file validation:
 * 1. MIME type matches file extension (prevents spoofing)
 * 2. Magic number validation (actual file content verification)
 * 3. Whitelist-based approach for security
 * 
 * Security Benefits:
 * - Prevents malicious file upload attacks
 * - Detects file extension spoofing
 * - Validates actual file content vs declared MIME type
 */

// Allowed MIME types with their corresponding file extensions
export const ALLOWED_FILE_TYPES = {
  // Document types
  'application/pdf': ['.pdf'],
  'text/plain': ['.txt'],
  'text/markdown': ['.md', '.markdown'],
  
  // Image types (for icons)
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/gif': ['.gif'],
  'image/webp': ['.webp'],
} as const;

// Type for allowed MIME types
export type AllowedMimeType = keyof typeof ALLOWED_FILE_TYPES;

/**
 * Validates that the file extension matches the declared MIME type
 * 
 * @param mimetype - Declared MIME type from upload
 * @param filename - Original filename with extension
 * @returns true if extension matches MIME type, false otherwise
 */
export function validateMimeTypeExtension(mimetype: string, filename: string): boolean {
  const allowedExtensions = ALLOWED_FILE_TYPES[mimetype as AllowedMimeType];

  if (!allowedExtensions) {
    console.log(`[File Validation] Blocked unknown MIME type: ${mimetype}`);
    return false;
  }

  const fileExtension = path.extname(filename).toLowerCase();
  const isValid = (allowedExtensions as readonly string[]).includes(fileExtension);
  
  if (!isValid) {
    console.log(
      `[File Validation] MIME type mismatch: ${mimetype} does not match extension ${fileExtension}`
    );
  }
  
  return isValid;
}

/**
 * Validates file content matches declared MIME type using magic numbers
 * 
 * This is an async validation that reads the file buffer to verify
 * the actual file type matches what was declared.
 * 
 * @param buffer - File buffer to validate
 * @param declaredMimeType - MIME type declared during upload
 * @returns true if content matches declared type, false otherwise
 */
export async function validateFileContent(
  buffer: Buffer,
  declaredMimeType: string
): Promise<boolean> {
  try {
    // Use file-type library to detect actual file type from magic numbers
    const detectedType = await fileTypeFromBuffer(buffer);
    
    if (!detectedType) {
      // Some text files (txt, md) may not have magic numbers
      // Allow them if MIME type is text/*
      if (declaredMimeType.startsWith('text/')) {
        console.log(`[File Validation] Text file without magic number accepted: ${declaredMimeType}`);
        return true;
      }
      
      console.log(`[File Validation] Could not detect file type from content`);
      return false;
    }
    
    // Check if detected MIME type matches declared MIME type
    const isValid = detectedType.mime === declaredMimeType;
    
    if (!isValid) {
      console.log(
        `[File Validation] Content mismatch: declared ${declaredMimeType}, detected ${detectedType.mime}`
      );
    } else {
      console.log(`[File Validation] Content validation passed: ${declaredMimeType}`);
    }
    
    return isValid;
  } catch (error) {
    console.error(`[File Validation] Error validating file content:`, error);
    return false;
  }
}

/**
 * Express middleware for validating uploaded files
 * 
 * Usage:
 * router.post('/upload', upload.single('file'), validateUploadedFile, async (req, res) => {
 *   // File is validated at this point
 * });
 */
export async function validateUploadedFile(
  req: Request,
  res: any,
  next: any
): Promise<void> {
  const file = req.file;
  
  if (!file) {
    // No file uploaded, let the route handler decide if this is an error
    return next();
  }
  
  // Step 1: Validate MIME type matches extension
  const extensionValid = validateMimeTypeExtension(file.mimetype, file.originalname);
  
  if (!extensionValid) {
    return res.status(400).json({
      success: false,
      message: 'File type validation failed: extension does not match MIME type',
      details: {
        filename: file.originalname,
        mimetype: file.mimetype,
      },
    });
  }
  
  // Step 2: Validate file content matches declared MIME type
  // Note: This requires reading the file buffer, which may impact performance
  // For production, consider making this optional or only for sensitive uploads
  
  // Read file buffer for content validation
  const fs = require('fs').promises;
  try {
    const buffer = await fs.readFile(file.path);
    const contentValid = await validateFileContent(buffer, file.mimetype);
    
    if (!contentValid) {
      // Delete the uploaded file since validation failed
      await fs.unlink(file.path).catch(() => {});
      
      return res.status(400).json({
        success: false,
        message: 'File content validation failed: content does not match declared type',
        details: {
          filename: file.originalname,
          mimetype: file.mimetype,
        },
      });
    }
    
    // Validation passed
    console.log(`[File Validation] ✅ File validated successfully: ${file.originalname}`);
    next();
  } catch (error) {
    console.error(`[File Validation] Error reading file for validation:`, error);
    return res.status(500).json({
      success: false,
      message: 'File validation error',
    });
  }
}

/**
 * Lightweight version of file validation (extension only, no content check)
 * Use this for better performance when content validation is not critical
 */
export function validateUploadedFileQuick(
  req: Request,
  res: any,
  next: any
): void {
  const file = req.file;
  
  if (!file) {
    return next();
  }
  
  const extensionValid = validateMimeTypeExtension(file.mimetype, file.originalname);
  
  if (!extensionValid) {
    return res.status(400).json({
      success: false,
      message: 'File type validation failed: extension does not match MIME type',
      details: {
        filename: file.originalname,
        mimetype: file.mimetype,
      },
    });
  }
  
  console.log(`[File Validation] ✅ File extension validated: ${file.originalname}`);
  next();
}
