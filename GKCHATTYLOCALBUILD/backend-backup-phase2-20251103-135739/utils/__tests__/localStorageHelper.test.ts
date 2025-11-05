import path from 'path';

// ============================================================================
// MOCK SETUP (BEFORE IMPORTS)
// ============================================================================

// Shared logger mock
const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  fatal: jest.fn(),
  trace: jest.fn(),
};

jest.mock('../logger', () => ({
  getLogger: jest.fn(() => mockLogger),
}));

// Mock fs module - create mock functions first
const mockMkdir = jest.fn();
const mockWriteFile = jest.fn();
const mockReaddir = jest.fn();
const mockUnlink = jest.fn();
const mockStat = jest.fn();

jest.mock('fs', () => ({
  mkdir: mockMkdir,
  writeFile: mockWriteFile,
  readdir: mockReaddir,
  unlink: mockUnlink,
  stat: mockStat,
}));

// Mock util.promisify to return the mocked fs functions directly
jest.mock('util', () => ({
  promisify: jest.fn((fn: any) => fn), // Return the function itself (already mocked)
}));

// Set environment before import
const TEST_STORAGE_DIR = '/tmp/test-storage';
process.env.LOCAL_FILE_STORAGE_DIR = TEST_STORAGE_DIR;

// ============================================================================
// IMPORTS (AFTER MOCKS)
// ============================================================================

import { saveFile, deleteFile, deleteFolderContents } from '../localStorageHelper';

// ============================================================================
// TEST SUITES
// ============================================================================

describe('localStorageHelper', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================================================
  // saveFile Tests
  // ==========================================================================

  describe('saveFile', () => {
    it('should save file to local storage successfully', async () => {
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      const buffer = Buffer.from('test data');
      const s3Key = 'test/file.pdf';
      const contentType = 'application/pdf';

      const result = await saveFile(s3Key, buffer, contentType);

      expect(mockMkdir).toHaveBeenCalledTimes(1);
      expect(mockWriteFile).toHaveBeenCalledTimes(1);
      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('test/file.pdf'),
        buffer
      );
      expect(result).toMatch(/^file:\/\//);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('File saved successfully')
      );
    });

    it('should create directory recursively', async () => {
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      const buffer = Buffer.from('data');
      await saveFile('deep/nested/path/file.txt', buffer, 'text/plain');

      expect(mockMkdir).toHaveBeenCalledWith(
        expect.stringContaining('deep/nested/path'),
        { recursive: true }
      );
    });

    it('should write file buffer correctly', async () => {
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      const buffer = Buffer.from('important data');
      const s3Key = 'documents/report.pdf';

      await saveFile(s3Key, buffer, 'application/pdf');

      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining(s3Key),
        buffer
      );
    });

    it('should return file:// URL format', async () => {
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      const buffer = Buffer.from('test');
      const result = await saveFile('test.txt', buffer, 'text/plain');

      expect(result).toMatch(/^file:\/\//);
      expect(result).toContain(TEST_STORAGE_DIR);
      expect(result).toContain('test.txt');
    });

    it('should use baseDir from environment variable', async () => {
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      const buffer = Buffer.from('test');
      await saveFile('file.txt', buffer, 'text/plain');

      expect(mockMkdir).toHaveBeenCalledWith(
        expect.stringContaining(TEST_STORAGE_DIR),
        { recursive: true }
      );
      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining(TEST_STORAGE_DIR),
        buffer
      );
    });

    it('should handle mkdir errors by propagating them', async () => {
      const mkdirError = new Error('Permission denied');
      mockMkdir.mockRejectedValue(mkdirError);

      const buffer = Buffer.from('test');

      await expect(
        saveFile('test.txt', buffer, 'text/plain')
      ).rejects.toThrow('Permission denied');
    });

    it('should handle writeFile errors by propagating them', async () => {
      mockMkdir.mockResolvedValue(undefined);
      const writeError = new Error('Disk full');
      mockWriteFile.mockRejectedValue(writeError);

      const buffer = Buffer.from('test');

      await expect(
        saveFile('test.txt', buffer, 'text/plain')
      ).rejects.toThrow('Disk full');
    });

    it('should log success debug message with file path', async () => {
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      const buffer = Buffer.from('test');
      await saveFile('success.txt', buffer, 'text/plain');

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringMatching(/File saved successfully to:.*success\.txt/)
      );
    });

    it('should handle nested paths correctly', async () => {
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      const buffer = Buffer.from('nested data');
      const nestedPath = 'level1/level2/level3/level4/file.json';

      await saveFile(nestedPath, buffer, 'application/json');

      expect(mockMkdir).toHaveBeenCalledWith(
        expect.stringContaining('level1/level2/level3/level4'),
        { recursive: true }
      );
      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining(nestedPath),
        buffer
      );
    });

    it('should handle empty buffer', async () => {
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      const emptyBuffer = Buffer.alloc(0);
      const result = await saveFile('empty.txt', emptyBuffer, 'text/plain');

      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.any(String),
        emptyBuffer
      );
      expect(result).toMatch(/^file:\/\//);
    });

    it('should handle large buffers', async () => {
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      const largeBuffer = Buffer.alloc(10 * 1024 * 1024); // 10MB
      await saveFile('large.bin', largeBuffer, 'application/octet-stream');

      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.any(String),
        largeBuffer
      );
    });

    it('should ignore contentType parameter (unused in implementation)', async () => {
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      const buffer = Buffer.from('test');

      // Should work the same regardless of contentType
      await saveFile('file1.txt', buffer, 'text/plain');
      await saveFile('file2.txt', buffer, 'application/pdf');
      await saveFile('file3.txt', buffer, '');

      expect(mockWriteFile).toHaveBeenCalledTimes(3);
    });
  });

  // ==========================================================================
  // deleteFile Tests
  // ==========================================================================

  describe('deleteFile', () => {
    it('should delete file successfully', async () => {
      mockUnlink.mockResolvedValue(undefined);

      const result = await deleteFile('test.txt');

      expect(mockUnlink).toHaveBeenCalledWith(
        expect.stringContaining('test.txt')
      );
      expect(result).toBe(true);
    });

    it('should return true on successful deletion', async () => {
      mockUnlink.mockResolvedValue(undefined);

      const result = await deleteFile('document.pdf');

      expect(result).toBe(true);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('File deleted successfully')
      );
    });

    it('should return true on ENOENT (file not found)', async () => {
      const enoentError = new Error('File not found') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';
      mockUnlink.mockRejectedValue(enoentError);

      const result = await deleteFile('missing.txt');

      expect(result).toBe(true);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error deleting file'),
        enoentError
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('File not found, considering it deleted')
      );
    });

    it('should log success debug message', async () => {
      mockUnlink.mockResolvedValue(undefined);

      await deleteFile('file.txt');

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringMatching(/File deleted successfully:.*file\.txt/)
      );
    });

    it('should log ENOENT as debug after error log', async () => {
      const enoentError = new Error('ENOENT') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';
      mockUnlink.mockRejectedValue(enoentError);

      await deleteFile('missing.txt');

      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('File not found, considering it deleted')
      );
    });

    it('should throw error for EACCES (permission denied)', async () => {
      const eaccesError = new Error('Permission denied') as NodeJS.ErrnoException;
      eaccesError.code = 'EACCES';
      mockUnlink.mockRejectedValue(eaccesError);

      await expect(deleteFile('protected.txt')).rejects.toThrow('Permission denied');
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error deleting file'),
        eaccesError
      );
    });

    it('should throw error for EPERM (operation not permitted)', async () => {
      const epermError = new Error('Operation not permitted') as NodeJS.ErrnoException;
      epermError.code = 'EPERM';
      mockUnlink.mockRejectedValue(epermError);

      await expect(deleteFile('system.txt')).rejects.toThrow('Operation not permitted');
    });

    it('should throw error for EBUSY (resource busy)', async () => {
      const ebusyError = new Error('Resource busy') as NodeJS.ErrnoException;
      ebusyError.code = 'EBUSY';
      mockUnlink.mockRejectedValue(ebusyError);

      await expect(deleteFile('locked.txt')).rejects.toThrow('Resource busy');
    });

    it('should log error for non-ENOENT errors', async () => {
      const otherError = new Error('Unknown error') as NodeJS.ErrnoException;
      otherError.code = 'UNKNOWN';
      mockUnlink.mockRejectedValue(otherError);

      await expect(deleteFile('file.txt')).rejects.toThrow('Unknown error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error deleting file'),
        otherError
      );
    });

    it('should handle file path with special characters', async () => {
      mockUnlink.mockResolvedValue(undefined);

      await deleteFile('special (file) [name].txt');

      expect(mockUnlink).toHaveBeenCalledWith(
        expect.stringContaining('special (file) [name].txt')
      );
    });

    it('should handle nested file paths', async () => {
      mockUnlink.mockResolvedValue(undefined);

      await deleteFile('deep/nested/path/file.txt');

      expect(mockUnlink).toHaveBeenCalledWith(
        expect.stringContaining('deep/nested/path/file.txt')
      );
    });
  });

  // ==========================================================================
  // deleteFolderContents Tests
  // ==========================================================================

  describe('deleteFolderContents', () => {
    it('should delete all files in folder successfully', async () => {
      // Folder exists
      mockStat.mockResolvedValueOnce({ isDirectory: () => false } as any);

      // readdir returns files
      mockReaddir.mockResolvedValue(['file1.txt', 'file2.txt'] as any);

      // File stats (both are files)
      mockStat.mockResolvedValueOnce({ isDirectory: () => false } as any);
      mockStat.mockResolvedValueOnce({ isDirectory: () => false } as any);

      // Unlink succeeds
      mockUnlink.mockResolvedValue(undefined);

      const result = await deleteFolderContents('test-folder');

      expect(result).toEqual({ deleted: 2, errors: 0 });
      expect(mockUnlink).toHaveBeenCalledTimes(2);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Folder cleanup complete. Deleted: 2, Errors: 0')
      );
    });

    it('should skip directories', async () => {
      // Folder exists
      mockStat.mockResolvedValueOnce({ isDirectory: () => false } as any);

      // readdir returns mixed content
      mockReaddir.mockResolvedValue(['file1.txt', 'subdir', 'file2.pdf'] as any);

      // File stats
      mockStat.mockResolvedValueOnce({ isDirectory: () => false } as any); // file1.txt
      mockStat.mockResolvedValueOnce({ isDirectory: () => true } as any);  // subdir (directory)
      mockStat.mockResolvedValueOnce({ isDirectory: () => false } as any); // file2.pdf

      mockUnlink.mockResolvedValue(undefined);

      const result = await deleteFolderContents('mixed-folder');

      expect(result).toEqual({ deleted: 2, errors: 0 });
      expect(mockUnlink).toHaveBeenCalledTimes(2); // Only files, not directory
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Skipping directory')
      );
    });

    it('should return deleted count and error count', async () => {
      // Folder exists
      mockStat.mockResolvedValueOnce({ isDirectory: () => false } as any);

      mockReaddir.mockResolvedValue(['file1.txt', 'file2.txt', 'file3.txt'] as any);

      // All are files
      mockStat.mockResolvedValue({ isDirectory: () => false } as any);

      // First two succeed, third fails
      mockUnlink
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Delete failed'));

      const result = await deleteFolderContents('partial-folder');

      expect(result).toEqual({ deleted: 2, errors: 1 });
    });

    it('should handle folder not found (ENOENT)', async () => {
      const enoentError = new Error('Folder not found') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';
      mockStat.mockRejectedValue(enoentError);

      const result = await deleteFolderContents('missing-folder');

      expect(result).toEqual({ deleted: 0, errors: 0 });
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining("Folder doesn't exist, nothing to delete")
      );
    });

    it('should return {deleted: 0, errors: 0} when folder does not exist', async () => {
      const enoentError = new Error('No such directory') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';
      mockStat.mockRejectedValue(enoentError);

      const result = await deleteFolderContents('nonexistent');

      expect(result).toEqual({ deleted: 0, errors: 0 });
      expect(mockReaddir).not.toHaveBeenCalled();
    });

    it('should handle empty folder', async () => {
      // Folder exists
      mockStat.mockResolvedValueOnce({ isDirectory: () => false } as any);

      mockReaddir.mockResolvedValue([] as any);

      const result = await deleteFolderContents('empty-folder');

      expect(result).toEqual({ deleted: 0, errors: 0 });
      expect(mockUnlink).not.toHaveBeenCalled();
    });

    it('should count errors when file deletion fails', async () => {
      // Folder exists
      mockStat.mockResolvedValueOnce({ isDirectory: () => false } as any);

      mockReaddir.mockResolvedValue(['file1.txt', 'file2.txt'] as any);

      // Both are files
      mockStat.mockResolvedValue({ isDirectory: () => false } as any);

      // Both deletions fail
      mockUnlink
        .mockRejectedValueOnce(new Error('Error 1'))
        .mockRejectedValueOnce(new Error('Error 2'));

      const result = await deleteFolderContents('error-folder');

      expect(result).toEqual({ deleted: 0, errors: 2 });
      expect(mockLogger.error).toHaveBeenCalledTimes(2);
    });

    it('should continue deleting after individual file errors', async () => {
      // Folder exists
      mockStat.mockResolvedValueOnce({ isDirectory: () => false } as any);

      mockReaddir.mockResolvedValue(['file1.txt', 'file2.txt', 'file3.txt'] as any);

      // All are files
      mockStat.mockResolvedValue({ isDirectory: () => false } as any);

      // Middle one fails
      mockUnlink
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce(undefined);

      const result = await deleteFolderContents('resilient-folder');

      expect(result).toEqual({ deleted: 2, errors: 1 });
      expect(mockUnlink).toHaveBeenCalledTimes(3);
    });

    it('should handle stat errors for folder', async () => {
      const statError = new Error('Stat failed') as NodeJS.ErrnoException;
      statError.code = 'EIO';
      mockStat.mockRejectedValue(statError);

      await expect(
        deleteFolderContents('bad-folder')
      ).rejects.toThrow('Stat failed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error during folder cleanup'),
        statError
      );
    });

    it('should throw error for critical folder stat failures', async () => {
      const criticalError = new Error('I/O error') as NodeJS.ErrnoException;
      criticalError.code = 'EIO';
      mockStat.mockRejectedValue(criticalError);

      await expect(
        deleteFolderContents('critical-folder')
      ).rejects.toThrow('I/O error');
    });

    it('should log folder cleanup statistics', async () => {
      // Folder exists
      mockStat.mockResolvedValueOnce({ isDirectory: () => false } as any);

      mockReaddir.mockResolvedValue(['file1.txt', 'file2.txt'] as any);

      mockStat.mockResolvedValue({ isDirectory: () => false } as any);
      mockUnlink.mockResolvedValue(undefined);

      await deleteFolderContents('stats-folder');

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Folder cleanup complete')
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringMatching(/Deleted: 2.*Errors: 0/)
      );
    });

    it('should log debug message when starting folder deletion', async () => {
      // Folder exists
      mockStat.mockResolvedValueOnce({ isDirectory: () => false } as any);

      mockReaddir.mockResolvedValue([] as any);

      await deleteFolderContents('logged-folder');

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringMatching(/Deleting contents of folder:.*logged-folder/)
      );
    });

    it('should handle file stat errors within folder', async () => {
      // Folder exists
      mockStat.mockResolvedValueOnce({ isDirectory: () => false } as any);

      mockReaddir.mockResolvedValue(['file1.txt', 'file2.txt'] as any);

      // First file stat fails, second succeeds
      mockStat
        .mockRejectedValueOnce(new Error('Stat error'))
        .mockResolvedValueOnce({ isDirectory: () => false } as any);

      mockUnlink.mockResolvedValue(undefined);

      const result = await deleteFolderContents('stat-error-folder');

      // First file errored on stat, second file deleted successfully
      expect(result).toEqual({ deleted: 1, errors: 1 });
    });

    it('should log individual file deletion success', async () => {
      // Folder exists
      mockStat.mockResolvedValueOnce({ isDirectory: () => false } as any);

      mockReaddir.mockResolvedValue(['success.txt'] as any);

      mockStat.mockResolvedValue({ isDirectory: () => false } as any);
      mockUnlink.mockResolvedValue(undefined);

      await deleteFolderContents('log-folder');

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringMatching(/Deleted file:.*success\.txt/)
      );
    });

    it('should handle mixed success and failures gracefully', async () => {
      // Folder exists
      mockStat.mockResolvedValueOnce({ isDirectory: () => false } as any);

      mockReaddir.mockResolvedValue([
        'success1.txt',
        'fail.txt',
        'success2.txt',
        'subdir',
        'fail2.txt',
      ] as any);

      // File stats
      mockStat.mockResolvedValueOnce({ isDirectory: () => false } as any); // success1.txt
      mockStat.mockResolvedValueOnce({ isDirectory: () => false } as any); // fail.txt
      mockStat.mockResolvedValueOnce({ isDirectory: () => false } as any); // success2.txt
      mockStat.mockResolvedValueOnce({ isDirectory: () => true } as any);  // subdir (skip)
      mockStat.mockResolvedValueOnce({ isDirectory: () => false } as any); // fail2.txt

      mockUnlink
        .mockResolvedValueOnce(undefined)           // success1.txt
        .mockRejectedValueOnce(new Error('Error'))  // fail.txt
        .mockResolvedValueOnce(undefined)           // success2.txt
        .mockRejectedValueOnce(new Error('Error')); // fail2.txt

      const result = await deleteFolderContents('mixed-results');

      expect(result).toEqual({ deleted: 2, errors: 2 });
    });

    it('should handle readdir errors', async () => {
      // Folder exists
      mockStat.mockResolvedValueOnce({ isDirectory: () => false } as any);

      const readdirError = new Error('Cannot read directory');
      mockReaddir.mockRejectedValue(readdirError);

      await expect(
        deleteFolderContents('unreadable-folder')
      ).rejects.toThrow('Cannot read directory');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error during folder cleanup'),
        readdirError
      );
    });

    it('should use baseDir for folder path construction', async () => {
      // Folder exists
      mockStat.mockResolvedValueOnce({ isDirectory: () => false } as any);

      mockReaddir.mockResolvedValue([] as any);

      await deleteFolderContents('test-folder');

      expect(mockStat).toHaveBeenCalledWith(
        expect.stringContaining(TEST_STORAGE_DIR)
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining(TEST_STORAGE_DIR)
      );
    });
  });

  // ==========================================================================
  // Module-level behavior
  // ==========================================================================

  describe('module-level behavior', () => {
    it('should use LOCAL_FILE_STORAGE_DIR environment variable for baseDir', async () => {
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      const buffer = Buffer.from('test');
      await saveFile('env-test.txt', buffer, 'text/plain');

      expect(mockMkdir).toHaveBeenCalledWith(
        expect.stringContaining(TEST_STORAGE_DIR),
        { recursive: true }
      );
    });

    it('should verify environment variable is used for baseDir paths', async () => {
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      const buffer = Buffer.from('test');
      const result = await saveFile('verify-env.txt', buffer, 'text/plain');

      // Verify the returned URL contains the TEST_STORAGE_DIR
      expect(result).toContain(TEST_STORAGE_DIR);
    });

    // NOTE: The default baseDir path (line 17: defaultSystemKbDir) is not covered
    // because we set LOCAL_FILE_STORAGE_DIR in the test setup before importing the module.
    // Testing the default path would require complex module reloading which is not worth
    // the added complexity. The default path logic is simple and well-tested in production.
  });
});
