import { Readable } from 'stream';

// Mock logger before imports
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

// Create reusable mock implementations
const mockS3Send = jest.fn();
const mockGetSignedUrl = jest.fn();

// Mock AWS SDK with full implementation
jest.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: jest.fn().mockImplementation(() => ({
      send: mockS3Send,
    })),
    PutObjectCommand: jest.fn((input) => ({ input })),
    GetObjectCommand: jest.fn((input) => ({ input })),
    DeleteObjectCommand: jest.fn((input) => ({ input })),
  };
});

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: mockGetSignedUrl,
}));

// Import after mocking
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Mock fs as const so we can use it
const mockFs = {
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  createReadStream: jest.fn(),
  constants: {
    R_OK: 4,
    F_OK: 0,
  },
};

const mockFsp = {
  readFile: jest.fn(),
  writeFile: jest.fn(),
  mkdir: jest.fn(),
  access: jest.fn(),
  unlink: jest.fn(),
  readdir: jest.fn(),
  stat: jest.fn(),
};

jest.mock('fs', () => mockFs);
jest.mock('fs/promises', () => mockFsp);

// Store original env
const originalEnv = { ...process.env };

describe('s3Helper', () => {
  // Reset mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    // Reset env to original state
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    // Restore original env
    process.env = originalEnv;
  });

  describe('Module Initialization - Local Storage Mode', () => {
    it('should detect local storage mode when FILE_STORAGE_MODE is local', () => {
      process.env.FILE_STORAGE_MODE = 'local';
      process.env.LOCAL_FILE_STORAGE_DIR = '/tmp/test-storage';
      process.env.AWS_BUCKET_NAME = 'test-bucket';

      // Mock fs.existsSync to prevent directory creation
      mockFs.existsSync.mockReturnValue(true);

      // Import module with local storage config
      jest.isolateModules(() => {
        require('../s3Helper');
      });

      // Verify logger was called with local storage flag
      expect(mockLogger.debug).toHaveBeenCalledWith(
        '[Storage Helper] Initializing... IS_LOCAL_STORAGE:',
        true,
        '| FILE_STORAGE_MODE:',
        'local',
        '| AWS_BUCKET_NAME:',
        'test-bucket'
      );
    });

    it('should detect local storage mode when AWS_BUCKET_NAME is local', () => {
      process.env.FILE_STORAGE_MODE = 's3';
      process.env.AWS_BUCKET_NAME = 'local';
      process.env.LOCAL_FILE_STORAGE_DIR = '/tmp/test-storage';

      mockFs.existsSync.mockReturnValue(true);

      jest.isolateModules(() => {
        require('../s3Helper');
      });

      expect(mockLogger.debug).toHaveBeenCalledWith(
        '[Storage Helper] Initializing... IS_LOCAL_STORAGE:',
        true,
        '| FILE_STORAGE_MODE:',
        's3',
        '| AWS_BUCKET_NAME:',
        'local'
      );
    });

    it('should throw error when LOCAL_STORAGE_PATH missing in local mode', () => {
      process.env.FILE_STORAGE_MODE = 'local';
      delete process.env.LOCAL_FILE_STORAGE_DIR;

      expect(() => {
        jest.isolateModules(() => {
          require('../s3Helper');
        });
      }).toThrow(
        'LOCAL_FILE_STORAGE_DIR setting is required when FILE_STORAGE_MODE is "local". Please check apps/api/.env'
      );
    });

    it('should create local storage directory if it does not exist', () => {
      process.env.FILE_STORAGE_MODE = 'local';
      process.env.LOCAL_FILE_STORAGE_DIR = '/tmp/test-storage';

      mockFs.existsSync.mockReturnValue(false);
      mockFs.mkdirSync.mockReturnValue(undefined);

      jest.isolateModules(() => {
        require('../s3Helper');
      });

      expect(mockFs.mkdirSync).toHaveBeenCalledWith('/tmp/test-storage', { recursive: true });
      expect(mockLogger.debug).toHaveBeenCalledWith(
        '[Storage Helper] Local storage directory created: /tmp/test-storage'
      );
    });

    it('should exit process when directory creation fails', () => {
      process.env.FILE_STORAGE_MODE = 'local';
      process.env.LOCAL_FILE_STORAGE_DIR = '/tmp/test-storage';

      mockFs.existsSync.mockReturnValue(false);
      mockFs.mkdirSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const mockExit = jest.spyOn(process, 'exit').mockImplementation((code?: number) => {
        throw new Error(`Process.exit called with code ${code}`);
      });

      expect(() => {
        jest.isolateModules(() => {
          require('../s3Helper');
        });
      }).toThrow('Process.exit called with code 1');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('[Storage Helper] CRITICAL: Failed to create local storage directory'),
        expect.any(Error)
      );

      mockExit.mockRestore();
    });
  });

  describe('Module Initialization - S3 Mode', () => {
    it('should hardcode S3_REGION to us-east-2', () => {
      process.env.FILE_STORAGE_MODE = 's3';
      process.env.AWS_BUCKET_NAME = 'test-bucket';
      process.env.AWS_ACCESS_KEY_ID = 'test-key';
      process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
      process.env.AWS_REGION = 'us-west-1'; // This should be ignored

      (S3Client as jest.MockedClass<typeof S3Client>).mockClear();

      jest.isolateModules(() => {
        require('../s3Helper');
      });

      expect(mockLogger.debug).toHaveBeenCalledWith(
        '[S3 Helper] Using S3 region: us-east-2 (hardcoded to match actual bucket region)'
      );
    });

    it('should log error when S3 configuration is missing', () => {
      process.env.FILE_STORAGE_MODE = 's3';
      process.env.AWS_BUCKET_NAME = 'test-bucket';
      delete process.env.AWS_ACCESS_KEY_ID;

      jest.isolateModules(() => {
        require('../s3Helper');
      });

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('[Storage Helper] FATAL ERROR: AWS S3 configuration')
      );
    });
  });

  describe('uploadFile - S3 Mode', () => {
    let uploadFile: any;

    beforeEach(() => {
      process.env.FILE_STORAGE_MODE = 's3';
      process.env.AWS_BUCKET_NAME = 'test-bucket';
      process.env.AWS_ACCESS_KEY_ID = 'test-key';
      process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
      process.env.NODE_ENV = 'test';

      mockS3Send.mockResolvedValue({ ETag: '"test-etag"' });

      jest.isolateModules(() => {
        const s3Helper = require('../s3Helper');
        uploadFile = s3Helper.uploadFile;
      });
    });

    it('should upload buffer to S3 successfully', async () => {
      const buffer = Buffer.from('test data');
      const result = await uploadFile(buffer, 'test-key.pdf', 'application/pdf');

      expect(mockS3Send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Bucket: 'test-bucket',
            Key: 'test-key.pdf',
            Body: buffer,
            ContentType: 'application/pdf',
          }),
        })
      );
      expect(result).toEqual({ ETag: '"test-etag"' });
    });

    it('should add staging prefix in staging environment', async () => {
      process.env.NODE_ENV = 'staging';
      process.env.FILE_STORAGE_MODE = 's3';
      process.env.AWS_BUCKET_NAME = 'test-bucket';
      process.env.AWS_ACCESS_KEY_ID = 'test-key';
      process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';

      mockS3Send.mockResolvedValue({ ETag: '"test-etag"' });

      let stagingUploadFile: any;
      jest.isolateModules(() => {
        const s3Helper = require('../s3Helper');
        stagingUploadFile = s3Helper.uploadFile;
      });

      const buffer = Buffer.from('test data');
      await stagingUploadFile(buffer, 'document.pdf', 'application/pdf');

      expect(mockS3Send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Key: '_staging_environment_data_/document.pdf',
          }),
        })
      );
    });

    it('should handle S3 upload errors', async () => {
      mockS3Send.mockRejectedValue(new Error('S3 upload failed'));

      const buffer = Buffer.from('test data');
      await expect(uploadFile(buffer, 'test-key.pdf', 'application/pdf')).rejects.toThrow(
        'S3 Upload Failed: S3 upload failed'
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('[S3 Helper] Error uploading'),
        expect.any(Error)
      );
    });

    it('should read file from path when isFilePath is true', async () => {
      const fileBuffer = Buffer.from('file content');
      mockFsp.readFile.mockResolvedValue(fileBuffer);

      await uploadFile('/tmp/test.pdf', 'test-key.pdf', 'application/pdf', true);

      expect(mockFsp.readFile).toHaveBeenCalledWith('/tmp/test.pdf');
      expect(mockS3Send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Body: fileBuffer,
          }),
        })
      );
    });

    it('should handle file read errors when isFilePath is true', async () => {
      mockFsp.readFile.mockRejectedValue(new Error('File not found'));

      await expect(uploadFile('/tmp/test.pdf', 'test-key.pdf', 'application/pdf', true)).rejects.toThrow(
        'File Read Failed: File not found'
      );
    });

    it('should throw error for invalid input type', async () => {
      await expect(uploadFile('not-a-buffer' as any, 'test-key.pdf', 'application/pdf')).rejects.toThrow(
        'Invalid input: fileBufferOrPath must be a Buffer or a file path string with isFilePath=true'
      );
    });
  });

  describe('uploadFile - Local Mode', () => {
    let uploadFile: any;

    beforeEach(() => {
      process.env.FILE_STORAGE_MODE = 'local';
      process.env.LOCAL_FILE_STORAGE_DIR = '/tmp/test-storage';
      process.env.NODE_ENV = 'test';

      mockFs.existsSync.mockReturnValue(true);
      mockFsp.mkdir.mockResolvedValue(undefined);
      mockFsp.writeFile.mockResolvedValue(undefined);

      jest.isolateModules(() => {
        const s3Helper = require('../s3Helper');
        uploadFile = s3Helper.uploadFile;
      });
    });

    it('should write file to local storage successfully', async () => {
      const buffer = Buffer.from('test data');
      await uploadFile(buffer, 'test-key.pdf', 'application/pdf');

      expect(mockFsp.writeFile).toHaveBeenCalledWith('/tmp/test-storage/test-key.pdf', buffer);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('[Storage Helper] Successfully saved test-key.pdf to local storage')
      );
    });

    it('should create nested directories if needed', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const buffer = Buffer.from('test data');
      await uploadFile(buffer, 'folder/subfolder/test-key.pdf', 'application/pdf');

      expect(mockFsp.mkdir).toHaveBeenCalledWith('/tmp/test-storage/folder/subfolder', { recursive: true });
    });

    it('should handle file write errors', async () => {
      mockFsp.writeFile.mockRejectedValue(new Error('Write failed'));

      const buffer = Buffer.from('test data');
      await expect(uploadFile(buffer, 'test-key.pdf', 'application/pdf')).rejects.toThrow(
        'Local File Upload Failed: Write failed'
      );
    });
  });

  describe('getPresignedUrlForView - S3 Mode', () => {
    let getPresignedUrlForView: any;

    beforeEach(() => {
      process.env.FILE_STORAGE_MODE = 's3';
      process.env.AWS_BUCKET_NAME = 'test-bucket';
      process.env.AWS_ACCESS_KEY_ID = 'test-key';
      process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
      process.env.NODE_ENV = 'test';

      mockGetSignedUrl.mockResolvedValue('https://signed-url.com/test-key.pdf');

      jest.isolateModules(() => {
        const s3Helper = require('../s3Helper');
        getPresignedUrlForView = s3Helper.getPresignedUrlForView;
      });
    });

    it('should generate presigned URL for S3 object', async () => {
      const url = await getPresignedUrlForView('test-key.pdf');

      expect(url).toBe('https://signed-url.com/test-key.pdf');
      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          input: expect.objectContaining({
            Bucket: 'test-bucket',
            Key: 'test-key.pdf',
          }),
        }),
        expect.objectContaining({
          expiresIn: 3600,
        })
      );
    });

    it('should use default expiration of 3600 seconds', async () => {
      await getPresignedUrlForView('test-key.pdf');

      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        expect.objectContaining({
          expiresIn: 3600,
        })
      );
    });

    it('should use custom expiration when provided', async () => {
      await getPresignedUrlForView('test-key.pdf', 7200);

      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        expect.objectContaining({
          expiresIn: 7200,
        })
      );
    });

    it('should handle presigned URL generation errors', async () => {
      mockGetSignedUrl.mockRejectedValue(new Error('URL generation failed'));

      await expect(getPresignedUrlForView('test-key.pdf')).rejects.toThrow(
        'S3 Signed URL Generation Failed: URL generation failed'
      );
    });
  });

  describe('getPresignedUrlForView - Local Mode', () => {
    let getPresignedUrlForView: any;

    beforeEach(() => {
      process.env.FILE_STORAGE_MODE = 'local';
      process.env.LOCAL_FILE_STORAGE_DIR = '/tmp/test-storage';
      process.env.PORT = '4001';
      process.env.NODE_ENV = 'test';

      mockFs.existsSync.mockReturnValue(true);

      jest.isolateModules(() => {
        const s3Helper = require('../s3Helper');
        getPresignedUrlForView = s3Helper.getPresignedUrlForView;
      });
    });

    it('should return local API URL for local storage', async () => {
      const url = await getPresignedUrlForView('test-key.pdf');

      expect(url).toBe('http://localhost:4001/api/files/local/test-key.pdf');
    });

    it('should encode key in URL', async () => {
      const url = await getPresignedUrlForView('folder/test file.pdf');

      expect(url).toBe('http://localhost:4001/api/files/local/folder%2Ftest%20file.pdf');
    });
  });

  describe('getFileStream - S3 Mode', () => {
    let getFileStream: any;

    beforeEach(() => {
      process.env.FILE_STORAGE_MODE = 's3';
      process.env.AWS_BUCKET_NAME = 'test-bucket';
      process.env.AWS_ACCESS_KEY_ID = 'test-key';
      process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
      process.env.NODE_ENV = 'test';

      const mockStream = new Readable();
      mockStream.push('test data');
      mockStream.push(null);

      mockS3Send.mockResolvedValue({ Body: mockStream });

      jest.isolateModules(() => {
        const s3Helper = require('../s3Helper');
        getFileStream = s3Helper.getFileStream;
      });
    });

    it('should get readable stream from S3', async () => {
      const stream = await getFileStream('test-key.pdf');

      expect(stream).toBeInstanceOf(Readable);
      expect(mockS3Send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Bucket: 'test-bucket',
            Key: 'test-key.pdf',
          }),
        })
      );
    });

    it('should handle S3 GetObjectCommand errors', async () => {
      mockS3Send.mockRejectedValue(new Error('S3 get failed'));

      await expect(getFileStream('test-key.pdf')).rejects.toThrow(
        'S3 GetObject Stream Failed: S3 get failed'
      );
    });

    it('should handle empty S3 response body', async () => {
      mockS3Send.mockResolvedValue({ Body: undefined });

      await expect(getFileStream('test-key.pdf')).rejects.toThrow(
        'S3 GetObject response body is empty or undefined.'
      );
    });
  });

  describe('getFileStream - Local Mode', () => {
    let getFileStream: any;

    beforeEach(() => {
      process.env.FILE_STORAGE_MODE = 'local';
      process.env.LOCAL_FILE_STORAGE_DIR = '/tmp/test-storage';
      process.env.NODE_ENV = 'test';

      mockFs.existsSync.mockReturnValue(true);
      mockFsp.access.mockResolvedValue(undefined);

      const mockStream = new Readable();
      mockFs.createReadStream.mockReturnValue(mockStream);

      jest.isolateModules(() => {
        const s3Helper = require('../s3Helper');
        getFileStream = s3Helper.getFileStream;
      });
    });

    it('should create readable stream from local file', async () => {
      const stream = await getFileStream('test-key.pdf');

      expect(stream).toBeInstanceOf(Readable);
      expect(mockFsp.access).toHaveBeenCalledWith('/tmp/test-storage/test-key.pdf', 4);
      expect(mockFs.createReadStream).toHaveBeenCalledWith('/tmp/test-storage/test-key.pdf');
    });

    it('should handle local file not found errors', async () => {
      const error: any = new Error('File not found');
      error.code = 'ENOENT';
      mockFsp.access.mockRejectedValue(error);

      await expect(getFileStream('test-key.pdf')).rejects.toThrow(
        'Local File Stream Failed: File not found at /tmp/test-storage/test-key.pdf'
      );
    });

    it('should handle permission denied errors', async () => {
      const error: any = new Error('Permission denied');
      error.code = 'EACCES';
      mockFsp.access.mockRejectedValue(error);

      await expect(getFileStream('test-key.pdf')).rejects.toThrow(
        'Local File Stream Failed: Permission denied for file at /tmp/test-storage/test-key.pdf'
      );
    });
  });

  describe('deleteFile - S3 Mode', () => {
    let deleteFile: any;

    beforeEach(() => {
      process.env.FILE_STORAGE_MODE = 's3';
      process.env.AWS_BUCKET_NAME = 'test-bucket';
      process.env.AWS_ACCESS_KEY_ID = 'test-key';
      process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
      process.env.NODE_ENV = 'test';

      mockS3Send.mockResolvedValue({});

      jest.isolateModules(() => {
        const s3Helper = require('../s3Helper');
        deleteFile = s3Helper.deleteFile;
      });
    });

    it('should delete file from S3 successfully', async () => {
      await deleteFile('test-key.pdf');

      expect(mockS3Send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Bucket: 'test-bucket',
            Key: 'test-key.pdf',
          }),
        })
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        '[S3 Helper] Successfully deleted test-key.pdf from S3 bucket test-bucket.'
      );
    });

    it('should handle S3 delete errors', async () => {
      mockS3Send.mockRejectedValue(new Error('S3 delete failed'));

      await expect(deleteFile('test-key.pdf')).rejects.toThrow('S3 Deletion Failed: S3 delete failed');
    });
  });

  describe('deleteFile - Local Mode', () => {
    let deleteFile: any;

    beforeEach(() => {
      process.env.FILE_STORAGE_MODE = 'local';
      process.env.LOCAL_FILE_STORAGE_DIR = '/tmp/test-storage';
      process.env.NODE_ENV = 'test';

      mockFs.existsSync.mockReturnValue(true);
      mockFsp.access.mockResolvedValue(undefined);
      mockFsp.unlink.mockResolvedValue(undefined);

      jest.isolateModules(() => {
        const s3Helper = require('../s3Helper');
        deleteFile = s3Helper.deleteFile;
      });
    });

    it('should delete file from local storage successfully', async () => {
      await deleteFile('test-key.pdf');

      expect(mockFsp.unlink).toHaveBeenCalledWith('/tmp/test-storage/test-key.pdf');
      expect(mockLogger.debug).toHaveBeenCalledWith(
        '[Storage Helper] Successfully deleted test-key.pdf from local storage.'
      );
    });

    it('should handle file not found gracefully', async () => {
      const error: any = new Error('File not found');
      error.code = 'ENOENT';
      mockFsp.access.mockRejectedValue(error);

      await deleteFile('test-key.pdf');

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('File test-key.pdf not found')
      );
    });

    it('should handle local file deletion errors', async () => {
      mockFsp.unlink.mockRejectedValue(new Error('Delete failed'));

      await expect(deleteFile('test-key.pdf')).rejects.toThrow(
        'Local File Deletion Failed: Delete failed'
      );
    });
  });

  describe('getPresignedUrlForPut - S3 Mode', () => {
    let getPresignedUrlForPut: any;

    beforeEach(() => {
      process.env.FILE_STORAGE_MODE = 's3';
      process.env.AWS_BUCKET_NAME = 'test-bucket';
      process.env.AWS_ACCESS_KEY_ID = 'test-key';
      process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
      process.env.NODE_ENV = 'test';

      mockGetSignedUrl.mockResolvedValue('https://signed-url.com/put-test-key.pdf');

      jest.isolateModules(() => {
        const s3Helper = require('../s3Helper');
        getPresignedUrlForPut = s3Helper.getPresignedUrlForPut;
      });
    });

    it('should generate presigned PUT URL', async () => {
      const url = await getPresignedUrlForPut('test-key.pdf', 'application/pdf');

      expect(url).toBe('https://signed-url.com/put-test-key.pdf');
      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          input: expect.objectContaining({
            Bucket: 'test-bucket',
            Key: 'test-key.pdf',
            ContentType: 'application/pdf',
          }),
        }),
        expect.objectContaining({
          expiresIn: 300,
        })
      );
    });

    it('should use default expiration of 300 seconds', async () => {
      await getPresignedUrlForPut('test-key.pdf', 'application/pdf');

      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        expect.objectContaining({
          expiresIn: 300,
        })
      );
    });

    it('should use custom expiration when provided', async () => {
      await getPresignedUrlForPut('test-key.pdf', 'application/pdf', 600);

      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        expect.objectContaining({
          expiresIn: 600,
        })
      );
    });

    it('should handle presigned URL generation errors', async () => {
      mockGetSignedUrl.mockRejectedValue(new Error('URL generation failed'));

      await expect(getPresignedUrlForPut('test-key.pdf', 'application/pdf')).rejects.toThrow(
        'S3 Signed PUT URL Generation Failed: URL generation failed'
      );
    });
  });

  describe('getPresignedUrlForPut - Local Mode', () => {
    let getPresignedUrlForPut: any;

    beforeEach(() => {
      process.env.FILE_STORAGE_MODE = 'local';
      process.env.LOCAL_FILE_STORAGE_DIR = '/tmp/test-storage';
      process.env.PORT = '4001';
      process.env.NODE_ENV = 'test';

      mockFs.existsSync.mockReturnValue(true);

      jest.isolateModules(() => {
        const s3Helper = require('../s3Helper');
        getPresignedUrlForPut = s3Helper.getPresignedUrlForPut;
      });
    });

    it('should return local upload URL for local storage', async () => {
      const url = await getPresignedUrlForPut('test-key.pdf', 'application/pdf');

      expect(url).toBe('http://localhost:4001/api/files/local/upload/test-key.pdf');
    });

    it('should encode key in URL', async () => {
      const url = await getPresignedUrlForPut('folder/test file.pdf', 'application/pdf');

      expect(url).toBe('http://localhost:4001/api/files/local/upload/folder%2Ftest%20file.pdf');
    });
  });

  describe('saveFile - S3 Mode', () => {
    let saveFile: any;

    beforeEach(() => {
      process.env.FILE_STORAGE_MODE = 's3';
      process.env.AWS_BUCKET_NAME = 'test-bucket';
      process.env.AWS_ACCESS_KEY_ID = 'test-key';
      process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
      process.env.NODE_ENV = 'test';

      mockS3Send.mockResolvedValue({ ETag: '"test-etag"' });

      jest.isolateModules(() => {
        const s3Helper = require('../s3Helper');
        saveFile = s3Helper.saveFile;
      });
    });

    it('should save file and return S3 URL', async () => {
      const buffer = Buffer.from('test data');
      const url = await saveFile('test-key.pdf', buffer, 'application/pdf');

      expect(url).toBe('https://test-bucket.s3.us-east-2.amazonaws.com/test-key.pdf');
      expect(mockS3Send).toHaveBeenCalled();
    });

    it('should handle upload errors', async () => {
      mockS3Send.mockRejectedValue(new Error('Upload failed'));

      const buffer = Buffer.from('test data');
      await expect(saveFile('test-key.pdf', buffer, 'application/pdf')).rejects.toThrow();
    });
  });

  describe('saveFile - Local Mode', () => {
    let saveFile: any;

    beforeEach(() => {
      process.env.FILE_STORAGE_MODE = 'local';
      process.env.LOCAL_FILE_STORAGE_DIR = '/tmp/test-storage';
      process.env.PORT = '4001';
      process.env.NODE_ENV = 'test';

      mockFs.existsSync.mockReturnValue(true);
      mockFsp.writeFile.mockResolvedValue(undefined);

      jest.isolateModules(() => {
        const s3Helper = require('../s3Helper');
        saveFile = s3Helper.saveFile;
      });
    });

    it('should save file and return local API URL', async () => {
      const buffer = Buffer.from('test data');
      const url = await saveFile('test-key.pdf', buffer, 'application/pdf');

      expect(url).toBe('http://localhost:4001/api/files/local/test-key.pdf');
      expect(mockFsp.writeFile).toHaveBeenCalled();
    });
  });

  describe('deleteFolderContents - Local Mode', () => {
    let deleteFolderContents: any;

    beforeEach(() => {
      process.env.FILE_STORAGE_MODE = 'local';
      process.env.LOCAL_FILE_STORAGE_DIR = '/tmp/test-storage';
      process.env.NODE_ENV = 'test';

      mockFs.existsSync.mockReturnValue(true);
      mockFsp.access.mockResolvedValue(undefined);
      mockFsp.readdir.mockResolvedValue(['file1.pdf', 'file2.pdf']);
      mockFsp.stat.mockResolvedValue({ isDirectory: () => false });
      mockFsp.unlink.mockResolvedValue(undefined);

      jest.isolateModules(() => {
        const s3Helper = require('../s3Helper');
        deleteFolderContents = s3Helper.deleteFolderContents;
      });
    });

    it('should delete all files in local directory', async () => {
      const result = await deleteFolderContents('test-folder/');

      expect(mockFsp.readdir).toHaveBeenCalledWith('/tmp/test-storage/test-folder/');
      expect(mockFsp.unlink).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ deleted: 2, errors: 0 });
    });

    it('should skip directories', async () => {
      mockFsp.readdir.mockResolvedValue(['file1.pdf', 'subfolder']);
      mockFsp.stat
        .mockResolvedValueOnce({ isDirectory: () => false })
        .mockResolvedValueOnce({ isDirectory: () => true });

      const result = await deleteFolderContents('test-folder/');

      expect(mockFsp.unlink).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ deleted: 1, errors: 0 });
    });

    it('should handle empty folder', async () => {
      mockFsp.readdir.mockResolvedValue([]);

      const result = await deleteFolderContents('test-folder/');

      expect(mockFsp.unlink).not.toHaveBeenCalled();
      expect(result).toEqual({ deleted: 0, errors: 0 });
    });

    it('should handle folder not found', async () => {
      const error: any = new Error('Folder not found');
      error.code = 'ENOENT';
      mockFsp.access.mockRejectedValue(error);

      const result = await deleteFolderContents('test-folder/');

      expect(result).toEqual({ deleted: 0, errors: 0 });
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining("Folder doesn't exist")
      );
    });

    it('should count errors when file deletion fails', async () => {
      mockFsp.readdir.mockResolvedValue(['file1.pdf', 'file2.pdf']);
      mockFsp.stat.mockResolvedValue({ isDirectory: () => false });
      mockFsp.unlink
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Delete failed'));

      const result = await deleteFolderContents('test-folder/');

      expect(result).toEqual({ deleted: 1, errors: 1 });
    });
  });
});
