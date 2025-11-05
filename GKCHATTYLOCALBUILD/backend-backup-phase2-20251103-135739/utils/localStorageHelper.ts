import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { getLogger } from './logger';

const log = getLogger('localStorageHelper');

const mkdir = promisify(fs.mkdir);
const writeFile = promisify(fs.writeFile);
const readdir = promisify(fs.readdir);
const unlink = promisify(fs.unlink);
const stat = promisify(fs.stat);

// More robust path resolution
const projectRoot = path.resolve(__dirname, '../../..'); // Adjust based on file location in compiled output
const defaultSystemKbDir = path.join(projectRoot, 'apps', 'api', 'system_kb_uploads');
const baseDir = process.env.LOCAL_FILE_STORAGE_DIR || defaultSystemKbDir;

log.debug(`[LocalStorageHelper] Base directory configured as: ${baseDir}`);

/**
 * Save file to local storage
 */
export const saveFile = async (
  s3Key: string,
  fileBuffer: Buffer,
  _contentType: string
): Promise<string> => {
  const filePath = path.join(baseDir, s3Key);

  // Ensure directory exists
  const dirPath = path.dirname(filePath);
  await mkdir(dirPath, { recursive: true });

  // Write file
  await writeFile(filePath, fileBuffer);
  log.debug(`[LocalStorageHelper] File saved successfully to: ${filePath}`);

  // Return local file path (not directly accessible in browser, but used internally)
  return `file://${filePath}`;
};

/**
 * Delete file from local storage
 */
export const deleteFile = async (s3Key: string): Promise<boolean> => {
  const filePath = path.join(baseDir, s3Key);

  try {
    await unlink(filePath);
    log.debug(`[LocalStorageHelper] File deleted successfully: ${filePath}`);
    return true;
  } catch (error: unknown) {
    log.error(`[LocalStorageHelper] Error deleting file ${filePath}:`, error);
    const err = error as NodeJS.ErrnoException;
    // Don't throw on ENOENT (file not found) - consider it deleted successfully
    if (err.code === 'ENOENT') {
      log.debug(`[LocalStorageHelper] File not found, considering it deleted: ${filePath}`);
      return true;
    }
    throw err;
  }
};

/**
 * Delete all files in a specified folder
 */
export const deleteFolderContents = async (
  folderPath: string
): Promise<{ deleted: number; errors: number }> => {
  const fullFolderPath = path.join(baseDir, folderPath);
  let deleted = 0;
  let errors = 0;

  try {
    log.debug(`[LocalStorageHelper] Deleting contents of folder: ${fullFolderPath}`);

    // Check if folder exists
    try {
      await stat(fullFolderPath);
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        log.debug(
          `[LocalStorageHelper] Folder doesn't exist, nothing to delete: ${fullFolderPath}`
        );
        return { deleted: 0, errors: 0 };
      }
      throw err;
    }

    // Read directory contents
    const files = await readdir(fullFolderPath);

    // Delete each file
    for (const file of files) {
      const filePath = path.join(fullFolderPath, file);

      try {
        const fileStat = await stat(filePath);

        // Skip directories
        if (fileStat.isDirectory()) {
          log.debug(`[LocalStorageHelper] Skipping directory: ${filePath}`);
          continue;
        }

        // Delete file
        await unlink(filePath);
        deleted++;
        log.debug(`[LocalStorageHelper] Deleted file: ${filePath}`);
      } catch (err) {
        log.error(`[LocalStorageHelper] Error deleting file ${filePath}:`, err);
        errors++;
      }
    }

    log.debug(
      `[LocalStorageHelper] Folder cleanup complete. Deleted: ${deleted}, Errors: ${errors}`
    );
    return { deleted, errors };
  } catch (error) {
    log.error(`[LocalStorageHelper] Error during folder cleanup: ${fullFolderPath}`, error);
    throw error;
  }
};
