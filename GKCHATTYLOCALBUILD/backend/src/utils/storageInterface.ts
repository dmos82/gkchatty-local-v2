/**
 * Storage Interface - Unified abstraction for file storage
 *
 * Automatically switches between S3 and local filesystem based on FILE_STORAGE_MODE environment variable.
 * Maintains backward compatibility with S3 while enabling local-first operation.
 *
 * Usage:
 *   import storage from './storageInterface';
 *
 *   // Save file (works with both S3 and local FS)
 *   const url = await storage.saveFile(key, buffer, contentType);
 *
 *   // Get file
 *   const buffer = await storage.getFile(key);
 *
 *   // Get file stream
 *   const stream = await storage.getFileStream(key);
 *
 *   // Delete file
 *   await storage.deleteFile(key);
 */

import { isLocalStorage } from './storageModeHelper';
import * as localStorageHelper from './localStorageHelper';
import { getLogger } from './logger';

const log = getLogger('storageInterface');

/**
 * Storage Interface
 * Defines common operations for both S3 and local filesystem storage
 */
export interface IStorageInterface {
  saveFile(key: string, buffer: Buffer, contentType: string): Promise<string>;
  getFile(key: string): Promise<Buffer>;
  getFileStream(key: string): Promise<NodeJS.ReadableStream>;
  deleteFile(key: string): Promise<boolean>;
  deleteFolderContents(folderPath: string): Promise<{ deleted: number; errors: number }>;
  generatePresignedUrl?(key: string, expiresIn: number): Promise<string>; // S3 only
}

/**
 * Local Storage Implementation
 */
class LocalStorage implements IStorageInterface {
  async saveFile(key: string, buffer: Buffer, contentType: string): Promise<string> {
    log.debug(`[LocalStorage] Saving file: ${key}`);
    return localStorageHelper.saveFile(key, buffer, contentType);
  }

  async getFile(key: string): Promise<Buffer> {
    log.debug(`[LocalStorage] Getting file: ${key}`);
    return localStorageHelper.getFile(key);
  }

  async getFileStream(key: string): Promise<NodeJS.ReadableStream> {
    log.debug(`[LocalStorage] Getting file stream: ${key}`);
    return localStorageHelper.getFileStream(key);
  }

  async deleteFile(key: string): Promise<boolean> {
    log.debug(`[LocalStorage] Deleting file: ${key}`);
    return localStorageHelper.deleteFile(key);
  }

  async deleteFolderContents(folderPath: string): Promise<{ deleted: number; errors: number }> {
    log.debug(`[LocalStorage] Deleting folder contents: ${folderPath}`);
    return localStorageHelper.deleteFolderContents(folderPath);
  }

  // Local storage doesn't support presigned URLs
  async generatePresignedUrl(key: string, expiresIn: number): Promise<string> {
    throw new Error(
      'Presigned URLs are not supported in local storage mode. Use direct file access endpoints instead.'
    );
  }
}

/**
 * S3 Storage Implementation
 * Only loaded if in S3 mode to avoid dependencies in local mode
 */
class S3Storage implements IStorageInterface {
  private s3Helper: any;

  constructor() {
    // Lazy load S3 helper only if needed
    try {
      this.s3Helper = require('./s3Helper');
      log.info('[S3Storage] S3 helper loaded successfully');
    } catch (error) {
      log.warn('[S3Storage] Failed to load S3 helper. S3 operations will fail.');
      log.warn('[S3Storage] This is expected in local mode.');
    }
  }

  async saveFile(key: string, buffer: Buffer, contentType: string): Promise<string> {
    if (!this.s3Helper) {
      throw new Error('S3 helper not loaded. Cannot perform S3 operations.');
    }
    log.debug(`[S3Storage] Saving file to S3: ${key}`);
    return this.s3Helper.uploadFileToS3(buffer, key, contentType);
  }

  async getFile(key: string): Promise<Buffer> {
    if (!this.s3Helper) {
      throw new Error('S3 helper not loaded. Cannot perform S3 operations.');
    }
    log.debug(`[S3Storage] Getting file from S3: ${key}`);
    const stream = await this.s3Helper.getFileStream(key);

    // Convert stream to buffer
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async getFileStream(key: string): Promise<NodeJS.ReadableStream> {
    if (!this.s3Helper) {
      throw new Error('S3 helper not loaded. Cannot perform S3 operations.');
    }
    log.debug(`[S3Storage] Getting file stream from S3: ${key}`);
    return this.s3Helper.getFileStream(key);
  }

  async deleteFile(key: string): Promise<boolean> {
    if (!this.s3Helper) {
      throw new Error('S3 helper not loaded. Cannot perform S3 operations.');
    }
    log.debug(`[S3Storage] Deleting file from S3: ${key}`);
    await this.s3Helper.deleteFileFromS3(key);
    return true;
  }

  async deleteFolderContents(folderPath: string): Promise<{ deleted: number; errors: number }> {
    if (!this.s3Helper) {
      throw new Error('S3 helper not loaded. Cannot perform S3 operations.');
    }
    log.debug(`[S3Storage] Deleting folder contents from S3: ${folderPath}`);
    return this.s3Helper.deleteS3FolderContents(folderPath);
  }

  async generatePresignedUrl(key: string, expiresIn: number): Promise<string> {
    if (!this.s3Helper) {
      throw new Error('S3 helper not loaded. Cannot perform S3 operations.');
    }
    log.debug(`[S3Storage] Generating presigned URL for: ${key}`);
    return this.s3Helper.generatePresignedUrl(key, expiresIn);
  }
}

/**
 * Create storage instance based on environment configuration
 */
function createStorageInstance(): IStorageInterface {
  if (isLocalStorage()) {
    log.info('[StorageInterface] Using LOCAL filesystem storage');
    return new LocalStorage();
  } else {
    log.info('[StorageInterface] Using S3 cloud storage');
    return new S3Storage();
  }
}

/**
 * Export singleton instance
 */
const storage = createStorageInstance();

export default storage;
