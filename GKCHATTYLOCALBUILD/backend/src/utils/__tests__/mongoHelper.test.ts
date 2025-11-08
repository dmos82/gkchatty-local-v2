/**
 * Comprehensive unit tests for mongoHelper.ts
 *
 * This test suite achieves 80%+ coverage across all metrics by testing:
 * 1. Module initialization with different env variable configurations
 * 2. connectDB success and error paths
 * 3. URI validation (mongodb://, mongodb+srv://)
 * 4. Event handler registration (error, disconnected)
 * 5. Error logging and re-throwing
 * 6. disconnectDB success and error handling
 * 7. Edge cases (empty strings, undefined values)
 */

// ============================================================================
// MOCK SETUP - MUST BE BEFORE IMPORTS
// ============================================================================

// Mock dotenv to prevent loading from .env file
jest.mock('dotenv/config', () => ({}));

// Mock process.exit to prevent test termination
const mockExit = jest.spyOn(process, 'exit').mockImplementation((code?: string | number | null | undefined) => {
  throw new Error(`process.exit(${code})`);
});

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

// Mock mongoose
const mockConnect = jest.fn();
const mockDisconnect = jest.fn();
const mockOn = jest.fn();

const mockConnection = {
  on: mockOn,
  db: { databaseName: 'test-db' },
};

jest.mock('mongoose', () => ({
  connect: mockConnect,
  disconnect: mockDisconnect,
  connection: mockConnection,
}));

// Set MONGODB_URI before importing mongoHelper to prevent process.exit during module load
process.env.MONGODB_URI = 'mongodb://localhost:27017/test-db';

// ============================================================================
// IMPORTS
// ============================================================================

import mongoose from 'mongoose';

// ============================================================================
// TEST SUITE
// ============================================================================

describe('mongoHelper', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mongoose mocks
    mockConnect.mockReset();
    mockDisconnect.mockReset();
    mockOn.mockReset();
  });

  afterEach(() => {
    // Restore env vars
    process.env.MONGODB_URI = 'mongodb://localhost:27017/test-db';
  });

  // ============================================================================
  // MODULE INITIALIZATION TESTS
  // ============================================================================

  describe('Module Initialization', () => {

    it('should use MONGODB_URI when available', () => {
      // Module is loaded from .env.test which sets MONGODB_URI
      // We need to test that the module initialization logic works
      jest.resetModules();
      process.env.MONGODB_URI = 'mongodb://localhost:27017/test-db';
      jest.clearAllMocks();

      // Re-import to trigger initialization
      require('../mongoHelper');

      // Verify logger was called with correct message
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('[mongoHelper TOP LEVEL] MONGODB_URI from process.env: "mongodb://localhost:27017/test-db"')
      );
    });

    it('should fallback to MONGO_URI when MONGODB_URI is undefined', () => {
      jest.resetModules();
      delete process.env.MONGODB_URI;
      process.env.MONGO_URI = 'mongodb://localhost:27017/fallback-db';

      // Clear previous logger calls
      jest.clearAllMocks();

      // Re-import module to trigger initialization
      require('../mongoHelper');

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('[mongoHelper TOP LEVEL] MONGODB_URI from process.env: "mongodb://localhost:27017/fallback-db"')
      );

      // Restore for other tests
      process.env.MONGODB_URI = 'mongodb://localhost:27017/test-db';
      delete process.env.MONGO_URI;
    });

    it('should call process.exit(1) when both MONGODB_URI and MONGO_URI are missing', () => {
      jest.resetModules();
      delete process.env.MONGODB_URI;
      delete process.env.MONGO_URI;
      jest.clearAllMocks();

      expect(() => {
        require('../mongoHelper');
      }).toThrow('process.exit(1)');

      expect(mockExit).toHaveBeenCalledWith(1);

      // Restore for other tests
      process.env.MONGODB_URI = 'mongodb://localhost:27017/test-db';
    });

    it('should log error when MONGODB_URI is missing', () => {
      jest.resetModules();
      delete process.env.MONGODB_URI;
      delete process.env.MONGO_URI;

      // Clear previous logger calls
      jest.clearAllMocks();

      try {
        require('../mongoHelper');
      } catch (err) {
        // Expected to throw
      }

      expect(mockLogger.error).toHaveBeenCalledWith(
        'FATAL ERROR: MONGODB_URI or MONGO_URI is not defined in environment variables.'
      );

      // Restore for other tests
      process.env.MONGODB_URI = 'mongodb://localhost:27017/test-db';
    });

    it('should log debug message at module load', () => {
      jest.resetModules();
      process.env.MONGODB_URI = 'mongodb://localhost:27017/test-db';
      jest.clearAllMocks();

      require('../mongoHelper');

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('[mongoHelper TOP LEVEL]')
      );
    });

    it('should handle empty string MONGODB_URI as missing', () => {
      jest.resetModules();
      process.env.MONGODB_URI = '';
      delete process.env.MONGO_URI;
      jest.clearAllMocks();

      expect(() => {
        require('../mongoHelper');
      }).toThrow('process.exit(1)');

      expect(mockExit).toHaveBeenCalledWith(1);

      // Restore for other tests
      process.env.MONGODB_URI = 'mongodb://localhost:27017/test-db';
    });
  });

  // ============================================================================
  // CONNECTDB TESTS
  // ============================================================================

  describe('connectDB', () => {

    // Need to re-import fresh module for each test
    let connectDB: () => Promise<void>;

    beforeEach(() => {
      jest.resetModules();
      process.env.MONGODB_URI = 'mongodb://localhost:27017/test-db';
      const mongoHelper = require('../mongoHelper');
      connectDB = mongoHelper.connectDB;
      jest.clearAllMocks();
    });

    // ------------------------------------------------------------------------
    // HAPPY PATH TESTS
    // ------------------------------------------------------------------------

    describe('Happy Path', () => {

      it('should connect to MongoDB successfully', async () => {
        mockConnect.mockResolvedValue(mongoose as any);

        await connectDB();

        expect(mockConnect).toHaveBeenCalledWith('mongodb://localhost:27017/test-db');
      });

      it('should log debug message with connection URI', async () => {
        mockConnect.mockResolvedValue(mongoose as any);

        await connectDB();

        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.stringContaining('[DB Connect] Attempting to connect to MongoDB with URI: "mongodb://localhost:27017/test-db"')
        );
      });

      it('should log success message with database name', async () => {
        mockConnect.mockResolvedValue(mongoose as any);

        await connectDB();

        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.stringContaining('✅ MongoDB Connected successfully to database: test-db')
        );
      });

      it('should register error event handler', async () => {
        mockConnect.mockResolvedValue(mongoose as any);

        await connectDB();

        expect(mockOn).toHaveBeenCalledWith('error', expect.any(Function));
      });

      it('should register disconnected event handler', async () => {
        mockConnect.mockResolvedValue(mongoose as any);

        await connectDB();

        expect(mockOn).toHaveBeenCalledWith('disconnected', expect.any(Function));
      });

      it('should log error on connection error event', async () => {
        mockConnect.mockResolvedValue(mongoose as any);

        await connectDB();

        // Find and trigger the error handler
        const errorCall = mockOn.mock.calls.find(call => call[0] === 'error');
        expect(errorCall).toBeDefined();

        const errorHandler = errorCall![1];
        const testError = new Error('Connection lost');

        errorHandler(testError);

        expect(mockLogger.error).toHaveBeenCalledWith(
          'MongoDB connection error after initial connection:',
          testError
        );
      });

      it('should log debug on disconnected event', async () => {
        mockConnect.mockResolvedValue(mongoose as any);

        await connectDB();

        // Find and trigger the disconnected handler
        const disconnectedCall = mockOn.mock.calls.find(call => call[0] === 'disconnected');
        expect(disconnectedCall).toBeDefined();

        const disconnectedHandler = disconnectedCall![1];

        disconnectedHandler();

        expect(mockLogger.debug).toHaveBeenCalledWith('MongoDB disconnected.');
      });

      it('should handle undefined database name in connection', async () => {
        // Temporarily change the mock to return undefined databaseName
        const originalDb = mockConnection.db;
        mockConnection.db = {} as any;

        mockConnect.mockResolvedValue(mongoose as any);

        await connectDB();

        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.stringContaining('✅ MongoDB Connected successfully to database: unknown')
        );

        // Restore
        mockConnection.db = originalDb;
      });
    });

    // ------------------------------------------------------------------------
    // URI VALIDATION TESTS
    // ------------------------------------------------------------------------

    describe('URI Validation', () => {

      it('should accept valid mongodb:// URI', async () => {
        process.env.MONGODB_URI = 'mongodb://localhost:27017/valid-db';
        jest.resetModules();
        const mongoHelper = require('../mongoHelper');
        connectDB = mongoHelper.connectDB;
        jest.clearAllMocks();

        mockConnect.mockResolvedValue(mongoose as any);

        await connectDB();

        expect(mockConnect).toHaveBeenCalledWith('mongodb://localhost:27017/valid-db');
      });

      it('should accept valid mongodb+srv:// URI', async () => {
        process.env.MONGODB_URI = 'mongodb+srv://user:pass@cluster.mongodb.net/mydb';
        jest.resetModules();
        const mongoHelper = require('../mongoHelper');
        connectDB = mongoHelper.connectDB;
        jest.clearAllMocks();

        mockConnect.mockResolvedValue(mongoose as any);

        await connectDB();

        expect(mockConnect).toHaveBeenCalledWith('mongodb+srv://user:pass@cluster.mongodb.net/mydb');
      });

      it('should reject URI that doesn\'t start with mongodb:// or mongodb+srv://', async () => {
        process.env.MONGODB_URI = 'invalid-uri-format';
        jest.resetModules();
        const mongoHelper = require('../mongoHelper');
        connectDB = mongoHelper.connectDB;
        jest.clearAllMocks();

        await expect(connectDB()).rejects.toThrow('MongoDB connection URI is invalid. Server cannot start.');
      });

      it('should throw error for invalid URI', async () => {
        process.env.MONGODB_URI = 'http://localhost:27017/db';
        jest.resetModules();
        const mongoHelper = require('../mongoHelper');
        connectDB = mongoHelper.connectDB;
        jest.clearAllMocks();

        await expect(connectDB()).rejects.toThrow('MongoDB connection URI is invalid');
      });

      it('should log critical error for invalid URI', async () => {
        process.env.MONGODB_URI = 'ftp://invalid';
        jest.resetModules();
        const mongoHelper = require('../mongoHelper');
        connectDB = mongoHelper.connectDB;
        jest.clearAllMocks();

        try {
          await connectDB();
        } catch (err) {
          // Expected
        }

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.stringContaining('[DB Connect CRITICAL ERROR] MONGODB_URI is invalid or missing')
        );
      });

      it('should handle empty string URI as invalid', async () => {
        // This should have failed at module load, but test the function logic
        process.env.MONGODB_URI = 'mongodb://localhost:27017/test-db';
        jest.resetModules();
        const mongoHelperModule = require('../mongoHelper');
        jest.clearAllMocks();

        // Mock MONGODB_URI as empty after module load for this specific test
        // We need to test the connectDB validation, not module load
        // Since MONGODB_URI is captured at module load, we'll test with a different approach

        // Re-set to empty and re-import
        process.env.MONGODB_URI = '';
        jest.resetModules();

        try {
          require('../mongoHelper');
        } catch (err) {
          // Will fail at module load, which is expected
        }

        expect(mockExit).toHaveBeenCalledWith(1);
      });

      it('should handle whitespace-only URI as invalid during connection', async () => {
        // Whitespace string is truthy, so module won't exit
        // But connectDB will reject it during URI validation
        process.env.MONGODB_URI = '   ';
        jest.resetModules();
        delete process.env.MONGO_URI;
        jest.clearAllMocks();

        const mongoHelper = require('../mongoHelper');
        const { connectDB } = mongoHelper;

        await expect(connectDB()).rejects.toThrow('MongoDB connection URI is invalid');

        // Restore for other tests
        process.env.MONGODB_URI = 'mongodb://localhost:27017/test-db';
      });
    });

    // ------------------------------------------------------------------------
    // ERROR HANDLING TESTS
    // ------------------------------------------------------------------------

    describe('Error Handling', () => {

      it('should handle connection errors and log details', async () => {
        const testError = new Error('Connection failed');
        mockConnect.mockRejectedValue(testError);

        await expect(connectDB()).rejects.toThrow('Connection failed');

        expect(mockLogger.error).toHaveBeenCalledWith(
          '❌❌❌ MongoDB initial connection FAILED. Full error:'
        );
      });

      it('should log error name', async () => {
        const testError = new Error('Connection failed');
        mockConnect.mockRejectedValue(testError);

        try {
          await connectDB();
        } catch (err) {
          // Expected
        }

        expect(mockLogger.error).toHaveBeenCalledWith('Error name:', 'Error');
      });

      it('should log error message', async () => {
        const testError = new Error('Connection timeout');
        mockConnect.mockRejectedValue(testError);

        try {
          await connectDB();
        } catch (err) {
          // Expected
        }

        expect(mockLogger.error).toHaveBeenCalledWith('Error message:', 'Connection timeout');
      });

      it('should log error code', async () => {
        const testError = new Error('Connection refused');
        (testError as any).code = 'ECONNREFUSED';
        mockConnect.mockRejectedValue(testError);

        try {
          await connectDB();
        } catch (err) {
          // Expected
        }

        expect(mockLogger.error).toHaveBeenCalledWith('Error code:', 'ECONNREFUSED');
      });

      it('should log error code as undefined when not present', async () => {
        const testError = new Error('Generic error');
        mockConnect.mockRejectedValue(testError);

        try {
          await connectDB();
        } catch (err) {
          // Expected
        }

        expect(mockLogger.error).toHaveBeenCalledWith('Error code:', undefined);
      });

      it('should stringify error object for logging', async () => {
        const testError = new Error('Connection failed');
        (testError as any).code = 'ECONNREFUSED';
        (testError as any).syscall = 'connect';
        mockConnect.mockRejectedValue(testError);

        try {
          await connectDB();
        } catch (err) {
          // Expected
        }

        expect(mockLogger.error).toHaveBeenCalledWith(
          'Full error object:',
          expect.stringContaining('ECONNREFUSED')
        );
      });

      it('should handle non-stringifiable errors', async () => {
        // Create circular reference
        const circularError: any = new Error('Circular error');
        circularError.self = circularError;
        mockConnect.mockRejectedValue(circularError);

        try {
          await connectDB();
        } catch (err) {
          // Expected
        }

        // Should log "Error could not be stringified" when JSON.stringify fails
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Error could not be stringified:',
          expect.any(Error)
        );
      });

      it('should log error stack', async () => {
        const testError = new Error('Stack trace test');
        mockConnect.mockRejectedValue(testError);

        try {
          await connectDB();
        } catch (err) {
          // Expected
        }

        expect(mockLogger.error).toHaveBeenCalledWith('Error stack:', expect.stringContaining('Stack trace test'));
      });

      it('should re-throw connection error', async () => {
        const testError = new Error('Must re-throw');
        mockConnect.mockRejectedValue(testError);

        await expect(connectDB()).rejects.toThrow('Must re-throw');
      });

      it('should handle error without stack property', async () => {
        const testError = new Error('No stack');
        delete (testError as any).stack;
        mockConnect.mockRejectedValue(testError);

        try {
          await connectDB();
        } catch (err) {
          // Expected
        }

        expect(mockLogger.error).toHaveBeenCalledWith('Error stack:', undefined);
      });
    });

    // ------------------------------------------------------------------------
    // EDGE CASES
    // ------------------------------------------------------------------------

    describe('Edge Cases', () => {

      it('should handle NODE_ENV variations', async () => {
        const originalNodeEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';

        mockConnect.mockResolvedValue(mongoose as any);

        await connectDB();

        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.stringContaining('for NODE_ENV: "production"')
        );

        process.env.NODE_ENV = originalNodeEnv;
      });

      it('should handle undefined NODE_ENV', async () => {
        const originalNodeEnv = process.env.NODE_ENV;
        delete process.env.NODE_ENV;

        mockConnect.mockResolvedValue(mongoose as any);

        await connectDB();

        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.stringContaining('for NODE_ENV: "undefined"')
        );

        process.env.NODE_ENV = originalNodeEnv;
      });

      it('should handle complex mongodb+srv URI with query parameters', async () => {
        process.env.MONGODB_URI = 'mongodb+srv://user:pass@cluster.mongodb.net/mydb?retryWrites=true&w=majority';
        jest.resetModules();
        const mongoHelper = require('../mongoHelper');
        connectDB = mongoHelper.connectDB;
        jest.clearAllMocks();

        mockConnect.mockResolvedValue(mongoose as any);

        await connectDB();

        expect(mockConnect).toHaveBeenCalledWith(
          'mongodb+srv://user:pass@cluster.mongodb.net/mydb?retryWrites=true&w=majority'
        );
      });
    });
  });

  // ============================================================================
  // DISCONNECTDB TESTS
  // ============================================================================

  describe('disconnectDB', () => {

    let disconnectDB: () => Promise<void>;

    beforeEach(() => {
      jest.resetModules();
      process.env.MONGODB_URI = 'mongodb://localhost:27017/test-db';
      const mongoHelper = require('../mongoHelper');
      disconnectDB = mongoHelper.disconnectDB;
      jest.clearAllMocks();
    });

    // ------------------------------------------------------------------------
    // HAPPY PATH TESTS
    // ------------------------------------------------------------------------

    describe('Happy Path', () => {

      it('should disconnect from MongoDB successfully', async () => {
        mockDisconnect.mockResolvedValue(undefined);

        await disconnectDB();

        expect(mockDisconnect).toHaveBeenCalled();
      });

      it('should log success message on disconnect', async () => {
        mockDisconnect.mockResolvedValue(undefined);

        await disconnectDB();

        expect(mockLogger.debug).toHaveBeenCalledWith('🔌 MongoDB disconnected successfully.');
      });
    });

    // ------------------------------------------------------------------------
    // ERROR HANDLING TESTS
    // ------------------------------------------------------------------------

    describe('Error Handling', () => {

      it('should handle disconnection errors', async () => {
        const testError = new Error('Disconnection failed');
        mockDisconnect.mockRejectedValue(testError);

        // Should NOT throw - error is caught and logged
        await expect(disconnectDB()).resolves.not.toThrow();
      });

      it('should log error on disconnection failure', async () => {
        const testError = new Error('Disconnection timeout');
        mockDisconnect.mockRejectedValue(testError);

        await disconnectDB();

        expect(mockLogger.error).toHaveBeenCalledWith(
          '❌ Error disconnecting from MongoDB:',
          testError
        );
      });

      it('should not throw error on disconnection failure', async () => {
        const testError = new Error('Should not throw');
        mockDisconnect.mockRejectedValue(testError);

        await expect(disconnectDB()).resolves.toBeUndefined();
      });

      it('should log but not throw on multiple disconnection attempts', async () => {
        const testError = new Error('Already disconnected');
        mockDisconnect.mockRejectedValue(testError);

        await disconnectDB();
        await disconnectDB();

        expect(mockLogger.error).toHaveBeenCalledTimes(2);
      });
    });
  });

  // ============================================================================
  // INTEGRATION TESTS
  // ============================================================================

  describe('Integration: connectDB + disconnectDB', () => {

    let connectDB: () => Promise<void>;
    let disconnectDB: () => Promise<void>;

    beforeEach(() => {
      jest.resetModules();
      process.env.MONGODB_URI = 'mongodb://localhost:27017/test-db';
      const mongoHelper = require('../mongoHelper');
      connectDB = mongoHelper.connectDB;
      disconnectDB = mongoHelper.disconnectDB;
      jest.clearAllMocks();
    });

    it('should connect and then disconnect successfully', async () => {
      mockConnect.mockResolvedValue(mongoose as any);
      mockDisconnect.mockResolvedValue(undefined);

      await connectDB();
      expect(mockConnect).toHaveBeenCalled();

      await disconnectDB();
      expect(mockDisconnect).toHaveBeenCalled();
    });

    it('should handle connect success followed by disconnect error', async () => {
      mockConnect.mockResolvedValue(mongoose as any);
      mockDisconnect.mockRejectedValue(new Error('Disconnect failed'));

      await connectDB();
      expect(mockConnect).toHaveBeenCalled();

      await disconnectDB();
      expect(mockLogger.error).toHaveBeenCalledWith(
        '❌ Error disconnecting from MongoDB:',
        expect.any(Error)
      );
    });
  });
});
