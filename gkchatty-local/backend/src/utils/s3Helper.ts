import 'dotenv/config'; // Make sure this is at the top
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ServiceOutputTypes,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as fs from 'fs';
import * as fsp from 'fs/promises'; // fs/promises for async operations
import * as path from 'path';
import { Readable } from 'stream'; // Node.js stream
import { getLogger } from './logger';

const log = getLogger('s3Helper');

// --- NEW FLAG DEFINITION ---
const IS_LOCAL_STORAGE =
  (process.env.FILE_STORAGE_MODE ?? '').toLowerCase() === 'local' ||
  (process.env.AWS_BUCKET_NAME ?? 'local').toLowerCase() === 'local';
log.debug(
  '[Storage Helper] Initializing... IS_LOCAL_STORAGE:',
  IS_LOCAL_STORAGE,
  '| FILE_STORAGE_MODE:',
  process.env.FILE_STORAGE_MODE,
  '| AWS_BUCKET_NAME:',
  process.env.AWS_BUCKET_NAME
);
// --- END NEW FLAG DEFINITION ---

// --- Configuration ---
const BUCKET_NAME = process.env.AWS_BUCKET_NAME || 'local'; // Default should likely not matter if IS_LOCAL_STORAGE is true
// CRITICAL FIX: Hardcode the correct S3 region to us-east-2 which is where the bucket is actually hosted
// This overrides the AWS_REGION env var which might be incorrectly set to us-east-1
const S3_REGION = 'us-east-2'; // Hardcoded to match actual bucket region
const S3_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const S3_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;

// Log region configuration to ensure visibility
log.debug(`[S3 Helper] Using S3 region: ${S3_REGION} (hardcoded to match actual bucket region)`);
log.debug(`[S3 Helper] Configured bucket: ${BUCKET_NAME}`);

// --- STAGING PREFIX CONFIGURATION ---
const STAGING_PREFIX = '_staging_environment_data_/';
const IS_STAGING = process.env.NODE_ENV === 'staging';

/**
 * Adds staging prefix to S3 keys when running in staging environment
 * @param key The original S3 key
 * @returns The key with staging prefix if in staging environment, otherwise unchanged
 */
const addStagingPrefix = (key: string): string => {
  if (IS_STAGING && !IS_LOCAL_STORAGE) {
    // Only add prefix if we're in staging AND using S3 storage
    // Don't add prefix if the key already starts with the staging prefix
    if (!key.startsWith(STAGING_PREFIX)) {
      log.debug(`[Storage Helper] Adding staging prefix to key: ${key} -> ${STAGING_PREFIX}${key}`);
      return `${STAGING_PREFIX}${key}`;
    }
  }
  return key;
};
// --- END STAGING PREFIX CONFIGURATION ---

// --- NEW LOCAL_STORAGE_PATH DEFINITION ---
// This line prints the setting from your .env file to double-check it's being read
log.debug(
  `[Storage Helper Check ENV] Path setting from .env: ${process.env.LOCAL_FILE_STORAGE_DIR}`
);

// This line takes the path directly from your .env setting
const LOCAL_STORAGE_PATH: string = process.env.LOCAL_FILE_STORAGE_DIR || '';

// Validate LOCAL_STORAGE_PATH only when running in local storage mode
if (IS_LOCAL_STORAGE) {
  if (!LOCAL_STORAGE_PATH) {
    log.error(
      'STOPPING SERVER: The LOCAL_FILE_STORAGE_DIR setting is missing in your apps/api/.env file!'
    );
    throw new Error(
      'LOCAL_FILE_STORAGE_DIR setting is required when FILE_STORAGE_MODE is "local". Please check apps/api/.env'
    );
  }

  // Print the final path the server will actually use
  log.debug(`[Storage Helper Path Check] Server will use this folder: ${LOCAL_STORAGE_PATH}`);
}
// --- END NEW LOCAL_STORAGE_PATH DEFINITION ---

let s3ClientInstance: S3Client | null = null;

if (IS_LOCAL_STORAGE) {
  log.debug(`[Storage Helper] Using LOCAL storage based on Path Check above.`); // Updated log message
  // Ensure local storage directory exists
  if (!fs.existsSync(LOCAL_STORAGE_PATH)) {
    try {
      fs.mkdirSync(LOCAL_STORAGE_PATH, { recursive: true });
      log.debug(`[Storage Helper] Local storage directory created: ${LOCAL_STORAGE_PATH}`);
    } catch (error) {
      log.error(
        `[Storage Helper] CRITICAL: Failed to create local storage directory at ${LOCAL_STORAGE_PATH}:`,
        error
      );
      // Potentially throw here to prevent app start if local storage is essential and directory can't be made
      process.exit(1);
    }
  }
} else {
  // S3 Storage - Validate essential S3 configuration
  if (!S3_REGION || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
    log.error(
      '[Storage Helper] FATAL ERROR: AWS S3 configuration (Region, Access Key ID, Secret Access Key) is missing from environment variables, but S3 storage is selected (AWS_BUCKET_NAME is not "local").'
    );
    // Don't initialize S3 client if missing configuration
    // This will cause an error when S3 operations are attempted
  } else {
    s3ClientInstance = new S3Client({
      region: S3_REGION,
      credentials: {
        accessKeyId: S3_ACCESS_KEY_ID,
        secretAccessKey: S3_SECRET_ACCESS_KEY,
      },
      // Disable automatic checksum calculation to prevent signature mismatches
      // with pre-signed URLs when the browser doesn't send checksum headers
      requestChecksumCalculation: 'WHEN_REQUIRED',
      // Disable automatic response checksum validation
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
    log.debug(
      `[Storage Helper] S3 Client initialized for region: ${S3_REGION}, bucket: ${BUCKET_NAME}`
    );
  }
}

/**
 * Uploads a file buffer or file path to the configured storage (S3 or Local).
 * @param fileBufferOrPath The file content as a Buffer or file path string.
 * @param key The desired key (path/filename) for the object.
 * @param contentType The MIME type of the file (used by S3).
 * @param isFilePath Optional flag to indicate if fileBufferOrPath is a file path (true) or buffer (false).
 * @returns Promise resolving on successful upload. S3 returns ServiceOutputTypes, local returns void.
 */
export const uploadFile = async (
  fileBufferOrPath: Buffer | string,
  key: string,
  contentType: string,
  isFilePath: boolean = false
): Promise<ServiceOutputTypes | void> => {
  // Apply staging prefix to the key
  const finalKey = addStagingPrefix(key);

  // Convert file path to buffer if isFilePath=true
  let fileBuffer: Buffer;
  if (isFilePath && typeof fileBufferOrPath === 'string') {
    log.debug(`[Storage Helper] Reading file from path: ${fileBufferOrPath}`);
    try {
      fileBuffer = await fsp.readFile(fileBufferOrPath);
    } catch (error) {
      log.error(`[Storage Helper] Error reading file from path ${fileBufferOrPath}:`, error);
      throw new Error(
        `File Read Failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  } else if (Buffer.isBuffer(fileBufferOrPath)) {
    fileBuffer = fileBufferOrPath;
  } else {
    throw new Error(
      'Invalid input: fileBufferOrPath must be a Buffer or a file path string with isFilePath=true'
    );
  }

  // Rest of upload logic with fileBuffer
  if (IS_LOCAL_STORAGE) {
    const filePath = path.join(LOCAL_STORAGE_PATH, finalKey);
    const dirName = path.dirname(filePath);
    try {
      if (!fs.existsSync(dirName)) {
        await fsp.mkdir(dirName, { recursive: true });
      }
      await fsp.writeFile(filePath, fileBuffer);
      log.debug(`[Storage Helper] Successfully saved ${finalKey} to local storage: ${filePath}`);
      return;
    } catch (error) {
      log.error(`[Storage Helper] Error saving ${finalKey} to local storage:`, error);
      throw new Error(
        `Local File Upload Failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  } else {
    if (!s3ClientInstance) {
      log.error('[Storage Helper] S3 client not initialized. Cannot upload to S3.');
      throw new Error('S3 client not initialized. Check S3 configuration.');
    }
    log.debug(
      `[Storage Helper] Uploading to S3 bucket: ${BUCKET_NAME}, key: ${finalKey}, contentType: ${contentType}`
    );
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: finalKey,
      Body: fileBuffer,
      ContentType: contentType,
    });
    try {
      const response = await s3ClientInstance.send(command);
      log.debug(
        `[S3 Helper] Successfully uploaded ${finalKey} to S3 bucket ${BUCKET_NAME}. ETag: ${response.ETag}`
      );
      return response;
    } catch (error) {
      log.error(`[S3 Helper] Error uploading ${finalKey} to S3 bucket ${BUCKET_NAME}:`, error);
      throw new Error(
        `S3 Upload Failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
};

/**
 * Generates a pre-signed URL for reading an object from S3,
 * OR for local storage, returns a conventional API path to retrieve the file.
 * @param key The key (path/filename) of the object.
 * @param expiresInSeconds The duration (in seconds) for which the S3 URL should be valid.
 * @param bucketName Optional bucket name override. If not provided, uses the default BUCKET_NAME.
 * @returns Promise resolving to the URL string or local API path.
 */
export const getPresignedUrlForView = async (
  key: string,
  expiresInSeconds: number = 3600,
  bucketName?: string
): Promise<string> => {
  // Apply staging prefix to the key
  const finalKey = addStagingPrefix(key);

  if (IS_LOCAL_STORAGE) {
    // IMPORTANT: This function seems designed for generating URLs the frontend can use directly.
    // For local files, we usually serve them through an API endpoint instead of giving a direct file path.
    // The route handler for this path will use getFileStream.
    // Encode each path segment separately to preserve slashes but encode special characters in filenames
    const encodedPath = finalKey.split('/').map(segment => encodeURIComponent(segment)).join('/');
    const localFileServePath = `/api/files/local/${encodedPath}`;
    const apiPort = process.env.PORT || '4001';
    const fullUrl = `http://localhost:${apiPort}${localFileServePath}`;
    log.debug(`[Storage Helper] Generating local file API serve URL for ${finalKey}: ${fullUrl}`);
    return Promise.resolve(fullUrl);
  } else {
    if (!s3ClientInstance) {
      log.error('[Storage Helper] S3 client not initialized. Cannot generate presigned URL.');
      throw new Error('S3 client not initialized. Check S3 configuration.');
    }

    const targetBucket = bucketName || BUCKET_NAME;
    log.debug(
      `[Storage Helper] Generating S3 signed URL for bucket: ${targetBucket}, key: ${finalKey}, expiresIn: ${expiresInSeconds}s`
    );
    const command = new GetObjectCommand({
      Bucket: targetBucket,
      Key: finalKey,
    });
    try {
      const signedUrl = await getSignedUrl(s3ClientInstance, command, {
        expiresIn: expiresInSeconds,
      });
      log.debug(
        `[S3 Helper] Successfully generated S3 signed URL for ${finalKey} in bucket ${targetBucket}`
      );
      return signedUrl;
    } catch (error) {
      log.error(
        `[S3 Helper] Error generating S3 signed URL for ${finalKey} in bucket ${targetBucket}:`,
        error
      );
      throw new Error(
        `S3 Signed URL Generation Failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
};

/**
 * Retrieves a file stream from the configured storage.
 * @param key The key (path/filename) of the object.
 * @returns Promise resolving to a Readable stream of the file content.
 */
export const getFileStream = async (key: string): Promise<Readable> => {
  // Apply staging prefix to the key
  const finalKey = addStagingPrefix(key);

  if (IS_LOCAL_STORAGE) {
    // Use direct filesystem access for local storage
    const filePath = path.join(LOCAL_STORAGE_PATH, finalKey); // Uses the corrected LOCAL_STORAGE_PATH
    log.debug(`[Storage Helper] Getting file stream from local storage for: ${filePath}`);
    try {
      // Check if file exists and is readable
      await fsp.access(filePath, fs.constants.R_OK); // Check for read access

      // If file exists, return a readable stream
      return fs.createReadStream(filePath);
    } catch (error: any) {
      // Added :any to access error.code
      log.error(
        `[Storage Helper] Error getting file stream for ${finalKey} from local storage at ${filePath}:`,
        error
      );
      // Throw a more specific error if file not found or permissions issue
      if (error.code === 'ENOENT') {
        throw new Error(`Local File Stream Failed: File not found at ${filePath}`);
      } else if (error.code === 'EACCES') {
        throw new Error(`Local File Stream Failed: Permission denied for file at ${filePath}`);
      }
      throw new Error(
        `Local File Stream Failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  } else {
    // S3 storage mode - requires S3 client
    if (!s3ClientInstance) {
      log.error('[Storage Helper] S3 client not initialized. Cannot get file stream from S3.');
      throw new Error('S3 client not initialized. Check S3 configuration.');
    }

    log.debug(
      `[Storage Helper] Getting object stream from S3 bucket: ${BUCKET_NAME}, key: ${finalKey}`
    );

    // Create S3 GetObject command
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: finalKey,
    });

    try {
      // Send command to S3
      const response = await s3ClientInstance.send(command);

      // Check if response body exists
      if (!response.Body) {
        throw new Error('S3 GetObject response body is empty or undefined.');
      }

      // Return response body as a readable stream
      return response.Body as Readable;
    } catch (error) {
      log.error(
        `[Storage Helper] Error getting object stream ${finalKey} from S3 bucket ${BUCKET_NAME}:`,
        error
      );
      throw new Error(
        `S3 GetObject Stream Failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
};

/**
 * Deletes a file from the configured storage (S3 or Local).
 * @param key The key (path/filename) of the object to delete.
 * @returns Promise resolving on successful deletion. S3 returns ServiceOutputTypes, local returns void.
 */
export const deleteFile = async (key: string): Promise<ServiceOutputTypes | void> => {
  // Apply staging prefix to the key
  const finalKey = addStagingPrefix(key);

  if (IS_LOCAL_STORAGE) {
    const filePath = path.join(LOCAL_STORAGE_PATH, finalKey);
    log.debug(`[Storage Helper] Deleting from local storage: ${filePath}`);
    try {
      await fsp.access(filePath, fs.constants.F_OK); // Check if file exists before trying to delete
      await fsp.unlink(filePath);
      log.debug(`[Storage Helper] Successfully deleted ${finalKey} from local storage.`);
      return;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File not found is not an error for deletion
        log.debug(
          `[Storage Helper] File ${finalKey} not found at ${filePath}. Assuming already deleted.`
        );
        return; // Treat as success if file doesn't exist
      }
      log.error(`[Storage Helper] Error deleting ${finalKey} from local storage:`, error);
      throw new Error(
        `Local File Deletion Failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  } else {
    if (!s3ClientInstance) {
      log.error('[Storage Helper] S3 client not initialized. Cannot delete from S3.');
      throw new Error('S3 client not initialized. Check S3 configuration.');
    }
    log.debug(`[Storage Helper] Deleting from S3 bucket: ${BUCKET_NAME}, key: ${finalKey}`);
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: finalKey,
    });
    try {
      const response = await s3ClientInstance.send(command);
      log.debug(`[S3 Helper] Successfully deleted ${finalKey} from S3 bucket ${BUCKET_NAME}.`);
      return response;
    } catch (error) {
      log.error(
        `[Storage Helper] Error deleting ${finalKey} from S3 bucket ${BUCKET_NAME}:`,
        error
      );
      throw new Error(
        `S3 Deletion Failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
};

/**
 * Generates a pre-signed URL for uploading an object directly to S3,
 * OR for local storage, returns a conventional API path to upload the file.
 * @param key The key (path/filename) of the object.
 * @param contentType The MIME type of the file.
 * @param expiresInSeconds The duration (in seconds) for which the S3 URL should be valid.
 * @param bucketName Optional bucket name override. If not provided, uses the default BUCKET_NAME.
 * @returns Promise resolving to the URL string or local API path.
 */
export const getPresignedUrlForPut = async (
  key: string,
  contentType: string,
  expiresInSeconds: number = 300, // 5 minutes default
  bucketName?: string
): Promise<string> => {
  // Apply staging prefix to the key
  const finalKey = addStagingPrefix(key);

  if (IS_LOCAL_STORAGE) {
    // For local storage, return a full URL that the frontend can use with new URL()
    // Encode each path segment separately to preserve slashes but encode special characters in filenames
    const encodedPath = finalKey.split('/').map(segment => encodeURIComponent(segment)).join('/');
    const localFileUploadPath = `/api/files/local/upload/${encodedPath}`;
    const apiPort = process.env.PORT || '4001';
    const fullUrl = `http://localhost:${apiPort}${localFileUploadPath}`;
    log.debug(`[Storage Helper] Generating local file API upload URL for ${finalKey}: ${fullUrl}`);
    return Promise.resolve(fullUrl);
  } else {
    if (!s3ClientInstance) {
      log.error('[Storage Helper] S3 client not initialized. Cannot generate presigned PUT URL.');
      throw new Error('S3 client not initialized. Check S3 configuration.');
    }

    const targetBucket = bucketName || BUCKET_NAME;
    log.debug(
      `[Storage Helper] Generating S3 signed PUT URL for bucket: ${targetBucket}, key: ${finalKey}, contentType: ${contentType}, expiresIn: ${expiresInSeconds}s`
    );

    // === ENHANCED DEBUG LOGGING ===
    log.debug(`[S3 PreSign DEBUG] === PRE-SIGNED URL GENERATION START ===`);
    log.debug(`[S3 PreSign DEBUG] Input params:`, {
      key: finalKey,
      contentType,
      targetBucket,
      expiresInSeconds,
      awsRegion: S3_REGION,
      s3ClientConfig: {
        region: S3_REGION,
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
      },
    });

    // Create PutObjectCommand with minimal parameters to avoid signature mismatches
    // DO NOT include ChecksumAlgorithm or other optional parameters that the browser won't send
    const command = new PutObjectCommand({
      Bucket: targetBucket,
      Key: finalKey,
      ContentType: contentType,
      // Explicitly DO NOT include:
      // - ChecksumAlgorithm
      // - ChecksumCRC32
      // - ACL
      // - ServerSideEncryption (rely on bucket's default encryption)
      // - Metadata
      // - Any other headers that the browser won't automatically send
    });

    // === ENHANCED DEBUG LOGGING FOR COMMAND ===
    log.debug(`[S3 PreSign DEBUG] PutObjectCommand params:`, {
      Bucket: targetBucket,
      Key: finalKey,
      ContentType: contentType,
      // Log the actual command input to see if SDK adds anything
      _commandInput: JSON.stringify((command as any).input),
    });

    try {
      // Generate the pre-signed URL
      const signedUrl = await getSignedUrl(s3ClientInstance, command, {
        expiresIn: expiresInSeconds,
        // Don't include any additional options that might affect the signature
      });

      // === ENHANCED DEBUG LOGGING FOR GENERATED URL ===
      const urlObj = new URL(signedUrl);
      log.debug(`[S3 PreSign DEBUG] Generated URL analysis:`, {
        protocol: urlObj.protocol,
        hostname: urlObj.hostname,
        pathname: urlObj.pathname,
        queryParams: {
          'X-Amz-Algorithm': urlObj.searchParams.get('X-Amz-Algorithm'),
          'X-Amz-Credential': urlObj.searchParams.get('X-Amz-Credential')?.substring(0, 50) + '...',
          'X-Amz-Date': urlObj.searchParams.get('X-Amz-Date'),
          'X-Amz-Expires': urlObj.searchParams.get('X-Amz-Expires'),
          'X-Amz-SignedHeaders': urlObj.searchParams.get('X-Amz-SignedHeaders'),
          'X-Amz-Signature': urlObj.searchParams.get('X-Amz-Signature')?.substring(0, 20) + '...',
          'x-id': urlObj.searchParams.get('x-id'),
        },
      });

      log.debug(`[S3 PreSign DEBUG] Full URL (first 300 chars): ${signedUrl.substring(0, 300)}...`);
      log.debug(`[S3 PreSign DEBUG] === PRE-SIGNED URL GENERATION END ===`);

      log.debug(
        `[S3 Helper] Successfully generated S3 signed PUT URL for ${finalKey} in bucket ${targetBucket}`
      );
      return signedUrl;
    } catch (error) {
      log.error(
        `[S3 Helper] Error generating S3 signed PUT URL for ${finalKey} in bucket ${targetBucket}:`,
        error
      );
      throw new Error(
        `S3 Signed PUT URL Generation Failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
};

/**
 * Save a file to S3 or local storage and return a URL
 * This is a convenience wrapper around uploadFile that returns a URL string
 * @param key The S3 key or path for the file
 * @param fileBuffer The file content as a Buffer
 * @param contentType The MIME type of the file
 * @returns Promise resolving to a URL string (S3 URL or local API path)
 */
export const saveFile = async (
  key: string,
  fileBuffer: Buffer,
  contentType: string
): Promise<string> => {
  // First upload the file using the existing function
  await uploadFile(fileBuffer, key, contentType);

  // Then generate a URL/path for the file
  // Use getPresignedUrlForView for both local and S3 storage
  // For S3, this returns a signed URL that provides temporary access
  // For local, this returns an API path to serve the file
  return getPresignedUrlForView(key);
};

/**
 * Delete all files in a folder/prefix in S3 or local storage
 * @param prefix The folder/prefix to delete all files from
 * @returns Promise resolving to a result object with counts of deleted files
 */
export const deleteFolderContents = async (
  prefix: string
): Promise<{ deleted: number; errors: number }> => {
  // Apply staging prefix to the folder prefix
  const finalPrefix = addStagingPrefix(prefix);

  let deleted = 0;
  let errors = 0;

  if (IS_LOCAL_STORAGE) {
    // For local storage, use Node.js file system operations
    const folderPath = path.join(LOCAL_STORAGE_PATH, finalPrefix);
    log.debug(`[Storage Helper] Deleting contents of local folder: ${folderPath}`);

    try {
      // Check if folder exists
      try {
        await fsp.access(folderPath, fs.constants.F_OK);
      } catch (err: any) {
        if (err.code === 'ENOENT') {
          log.debug(`[Storage Helper] Folder doesn't exist, nothing to delete: ${folderPath}`);
          return { deleted: 0, errors: 0 };
        }
        throw err; // Re-throw other errors
      }

      // Read directory contents
      const files = await fsp.readdir(folderPath);

      // Delete each file
      for (const file of files) {
        const filePath = path.join(folderPath, file);

        try {
          const stats = await fsp.stat(filePath);

          // Skip directories (only delete files)
          if (stats.isDirectory()) {
            log.debug(`[Storage Helper] Skipping directory: ${filePath}`);
            continue;
          }

          // Delete file
          await fsp.unlink(filePath);
          deleted++;
          log.debug(`[Storage Helper] Deleted file: ${filePath}`);
        } catch (err) {
          log.error(`[Storage Helper] Error deleting file: ${filePath}`, err);
          errors++;
        }
      }

      log.debug(
        `[Storage Helper] Folder cleanup complete for prefix ${finalPrefix}. Deleted: ${deleted}, Errors: ${errors}`
      );
      return { deleted, errors };
    } catch (error) {
      log.error(`[Storage Helper] Error cleaning up folder: ${folderPath}`, error);
      // Rethrow or handle as appropriate
      throw error;
    }
  } else {
    // For S3, need to list objects with the prefix and delete them
    if (!s3ClientInstance) {
      log.error('[Storage Helper] S3 client not initialized. Cannot delete folder contents.');
      throw new Error('S3 client not initialized. Check S3 configuration.');
    }

    log.debug(
      `[Storage Helper] Listing and deleting objects with prefix: ${finalPrefix} in bucket: ${BUCKET_NAME}`
    );

    try {
      // Placeholder: S3 batch deletion is complex and requires handling pagination.
      // For now, just log the intent. Replace with ListObjectsV2Command and DeleteObjectsCommand for production.
      log.warn(
        `[Storage Helper] S3 folder deletion (prefix: ${finalPrefix}) not fully implemented. Requires ListObjectsV2 and DeleteObjects.`
      );

      // A real implementation would:
      // 1. Use ListObjectsV2Command with Prefix parameter.
      // 2. Collect Keys from the response.
      // 3. Use DeleteObjectsCommand with the collected Keys (max 1000 per request).
      // 4. Handle pagination (NextContinuationToken) if more than 1000 objects.

      return { deleted: 0, errors: 0 }; // Return 0 until implemented
    } catch (error) {
      log.error(
        `[Storage Helper] Error during S3 folder deletion for prefix: ${finalPrefix}`,
        error
      );
      throw error;
    }
  }
};

log.debug('[Storage Helper] Module loaded. Storage configuration complete.'); // Updated final log
