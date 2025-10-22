// Create shared logger mock instance
const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  fatal: jest.fn(),
  trace: jest.fn(),
};

// Mock dependencies BEFORE importing the module under test
jest.mock('../../utils/documentProcessor');
jest.mock('../../models/UserDocument');
jest.mock('uuid');
jest.mock('../../utils/logger', () => ({
  getLogger: jest.fn(() => mockLogger),
}));

import { processUserDocument } from '../userDocumentProcessor';
import { processAndEmbedDocument } from '../../utils/documentProcessor';
import { UserDocument } from '../../models/UserDocument';
import { v4 as uuidv4 } from 'uuid';
import { IngestionErrorCode } from '../../types/errorCodes';
import { getLogger } from '../../utils/logger';

describe('userDocumentProcessor', () => {
  describe('processUserDocument', () => {
    // Mock instances
    const mockProcessAndEmbedDocument = processAndEmbedDocument as jest.MockedFunction<
      typeof processAndEmbedDocument
    >;
    const mockUuidv4 = uuidv4 as jest.MockedFunction<typeof uuidv4>;

    // Test data
    const testDocumentId = '507f1f77bcf86cd799439011';
    const testS3Bucket = 'test-bucket';
    const testS3Key = 'documents/test-file.pdf';
    const testUserId = 'user123';
    const testReqId = 'req-correlation-id-123';
    const testGeneratedUuid = 'generated-uuid-456';

    beforeEach(() => {
      jest.clearAllMocks();

      // Default UUID mock behavior
      mockUuidv4.mockReturnValue(testGeneratedUuid);

      // Default successful behavior for processAndEmbedDocument
      mockProcessAndEmbedDocument.mockResolvedValue(undefined);
    });

    describe('Happy Path - Successful Processing', () => {
      it('should process document successfully with all parameters including reqId', async () => {
        // Mock UserDocument methods
        const mockFindByIdAndUpdate = jest.fn().mockResolvedValue({});
        const mockFindById = jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue({
            originalFileName: 'test.pdf',
            mimeType: 'application/pdf',
          }),
        });

        (UserDocument.findByIdAndUpdate as jest.Mock) = mockFindByIdAndUpdate;
        (UserDocument.findById as jest.Mock) = mockFindById;

        await processUserDocument(
          testDocumentId,
          testS3Bucket,
          testS3Key,
          testUserId,
          testReqId
        );

        // Verify initial status update
        expect(mockFindByIdAndUpdate).toHaveBeenCalledWith(testDocumentId, {
          status: 'processing',
          processingError: null,
        });

        // Verify metadata fetch
        expect(mockFindById).toHaveBeenCalledWith(testDocumentId);

        // Verify processAndEmbedDocument was called with correct parameters
        expect(mockProcessAndEmbedDocument).toHaveBeenCalledWith(
          testDocumentId,
          testS3Bucket,
          testS3Key,
          'user',
          'test.pdf',
          'application/pdf',
          testUserId,
          testReqId, // Should use provided reqId
          undefined // extractedText not provided
        );

        // UUID should NOT be called when reqId is provided
        expect(mockUuidv4).not.toHaveBeenCalled();
      });

      it('should generate correlation ID when reqId is not provided', async () => {
        const mockFindByIdAndUpdate = jest.fn().mockResolvedValue({});
        const mockFindById = jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue({
            originalFileName: 'test.pdf',
            mimeType: 'application/pdf',
          }),
        });

        (UserDocument.findByIdAndUpdate as jest.Mock) = mockFindByIdAndUpdate;
        (UserDocument.findById as jest.Mock) = mockFindById;

        await processUserDocument(
          testDocumentId,
          testS3Bucket,
          testS3Key,
          testUserId
          // No reqId provided
        );

        // UUID should be called to generate correlation ID
        expect(mockUuidv4).toHaveBeenCalled();

        // processAndEmbedDocument should receive generated UUID
        expect(mockProcessAndEmbedDocument).toHaveBeenCalledWith(
          testDocumentId,
          testS3Bucket,
          testS3Key,
          'user',
          'test.pdf',
          'application/pdf',
          testUserId,
          testGeneratedUuid, // Should use generated UUID
          undefined
        );
      });

      it('should pass extractedText parameter when provided', async () => {
        const mockFindByIdAndUpdate = jest.fn().mockResolvedValue({});
        const mockFindById = jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue({
            originalFileName: 'test.pdf',
            mimeType: 'application/pdf',
          }),
        });

        (UserDocument.findByIdAndUpdate as jest.Mock) = mockFindByIdAndUpdate;
        (UserDocument.findById as jest.Mock) = mockFindById;

        const extractedText = 'Pre-extracted text content';

        await processUserDocument(
          testDocumentId,
          testS3Bucket,
          testS3Key,
          testUserId,
          testReqId,
          extractedText
        );

        // Verify extractedText is passed through
        expect(mockProcessAndEmbedDocument).toHaveBeenCalledWith(
          testDocumentId,
          testS3Bucket,
          testS3Key,
          'user',
          'test.pdf',
          'application/pdf',
          testUserId,
          testReqId,
          extractedText // Should pass extractedText
        );
      });

      it('should complete successfully with different file types', async () => {
        const mockFindByIdAndUpdate = jest.fn().mockResolvedValue({});
        const mockFindById = jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue({
            originalFileName: 'spreadsheet.xlsx',
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          }),
        });

        (UserDocument.findByIdAndUpdate as jest.Mock) = mockFindByIdAndUpdate;
        (UserDocument.findById as jest.Mock) = mockFindById;

        await processUserDocument(
          testDocumentId,
          testS3Bucket,
          'documents/spreadsheet.xlsx',
          testUserId,
          testReqId
        );

        expect(mockProcessAndEmbedDocument).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(String),
          expect.any(String),
          'user',
          'spreadsheet.xlsx',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          expect.any(String),
          expect.any(String),
          undefined
        );
      });
    });

    describe('Error Handling - Document Not Found', () => {
      it('should throw error when document metadata is not found', async () => {
        const mockFindByIdAndUpdate = jest.fn().mockResolvedValue({});
        const mockFindById = jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue(null), // Document not found
        });

        (UserDocument.findByIdAndUpdate as jest.Mock) = mockFindByIdAndUpdate;
        (UserDocument.findById as jest.Mock) = mockFindById;

        await processUserDocument(
          testDocumentId,
          testS3Bucket,
          testS3Key,
          testUserId,
          testReqId
        );

        // Should update status to 'processing' initially
        expect(mockFindByIdAndUpdate).toHaveBeenNthCalledWith(1, testDocumentId, {
          status: 'processing',
          processingError: null,
        });

        // Should attempt to set status to 'failed' after error
        expect(mockFindByIdAndUpdate).toHaveBeenNthCalledWith(2, testDocumentId, {
          status: 'failed',
          processingError: `Document metadata ${testDocumentId} not found during processing.`,
          errorCode: IngestionErrorCode.UNKNOWN_PROCESSING_ERROR,
        });

        // processAndEmbedDocument should NOT be called
        expect(mockProcessAndEmbedDocument).not.toHaveBeenCalled();
      });
    });

    describe('Error Handling - Missing MimeType', () => {
      it('should throw error when mimeType is missing', async () => {
        const mockFindByIdAndUpdate = jest.fn().mockResolvedValue({});
        const mockFindById = jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue({
            originalFileName: 'test.pdf',
            mimeType: null, // Missing mimeType
          }),
        });

        (UserDocument.findByIdAndUpdate as jest.Mock) = mockFindByIdAndUpdate;
        (UserDocument.findById as jest.Mock) = mockFindById;

        await processUserDocument(
          testDocumentId,
          testS3Bucket,
          testS3Key,
          testUserId,
          testReqId
        );

        // Should attempt to set status to 'failed'
        expect(mockFindByIdAndUpdate).toHaveBeenCalledWith(testDocumentId, {
          status: 'failed',
          processingError: `Document metadata ${testDocumentId} is missing mimeType.`,
          errorCode: IngestionErrorCode.UNKNOWN_PROCESSING_ERROR,
        });

        // processAndEmbedDocument should NOT be called
        expect(mockProcessAndEmbedDocument).not.toHaveBeenCalled();
      });

      it('should throw error when mimeType is empty string', async () => {
        const mockFindByIdAndUpdate = jest.fn().mockResolvedValue({});
        const mockFindById = jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue({
            originalFileName: 'test.pdf',
            mimeType: '', // Empty string (falsy)
          }),
        });

        (UserDocument.findByIdAndUpdate as jest.Mock) = mockFindByIdAndUpdate;
        (UserDocument.findById as jest.Mock) = mockFindById;

        await processUserDocument(
          testDocumentId,
          testS3Bucket,
          testS3Key,
          testUserId,
          testReqId
        );

        // Should set status to 'failed'
        expect(mockFindByIdAndUpdate).toHaveBeenCalledWith(testDocumentId, {
          status: 'failed',
          processingError: `Document metadata ${testDocumentId} is missing mimeType.`,
          errorCode: IngestionErrorCode.UNKNOWN_PROCESSING_ERROR,
        });
      });

      it('should throw error when mimeType is undefined', async () => {
        const mockFindByIdAndUpdate = jest.fn().mockResolvedValue({});
        const mockFindById = jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue({
            originalFileName: 'test.pdf',
            mimeType: undefined,
          }),
        });

        (UserDocument.findByIdAndUpdate as jest.Mock) = mockFindByIdAndUpdate;
        (UserDocument.findById as jest.Mock) = mockFindById;

        await processUserDocument(
          testDocumentId,
          testS3Bucket,
          testS3Key,
          testUserId,
          testReqId
        );

        expect(mockFindByIdAndUpdate).toHaveBeenCalledWith(testDocumentId, {
          status: 'failed',
          processingError: `Document metadata ${testDocumentId} is missing mimeType.`,
          errorCode: IngestionErrorCode.UNKNOWN_PROCESSING_ERROR,
        });
      });
    });

    describe('Error Handling - Initial Status Update Failure', () => {
      it('should continue processing even if initial status update fails', async () => {
        const mockFindByIdAndUpdate = jest
          .fn()
          .mockRejectedValueOnce(new Error('MongoDB connection error')) // First call fails
          .mockResolvedValueOnce({}); // Second call (in error handler) succeeds

        const mockFindById = jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue({
            originalFileName: 'test.pdf',
            mimeType: 'application/pdf',
          }),
        });

        (UserDocument.findByIdAndUpdate as jest.Mock) = mockFindByIdAndUpdate;
        (UserDocument.findById as jest.Mock) = mockFindById;

        await processUserDocument(
          testDocumentId,
          testS3Bucket,
          testS3Key,
          testUserId,
          testReqId
        );

        // Should attempt initial status update
        expect(mockFindByIdAndUpdate).toHaveBeenNthCalledWith(1, testDocumentId, {
          status: 'processing',
          processingError: null,
        });

        // Should log error but continue
        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.stringContaining('Pre-check: Failed to set status'),
          expect.any(Error)
        );

        // Should still fetch metadata and call processAndEmbedDocument
        expect(mockFindById).toHaveBeenCalled();
        expect(mockProcessAndEmbedDocument).toHaveBeenCalled();
      });
    });

    describe('Error Handling - processAndEmbedDocument Failures', () => {
      it('should handle processAndEmbedDocument error and update status to failed', async () => {
        const processingError = new Error('Failed to extract text from PDF');

        const mockFindByIdAndUpdate = jest.fn().mockResolvedValue({});
        const mockFindById = jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue({
            originalFileName: 'test.pdf',
            mimeType: 'application/pdf',
          }),
        });

        (UserDocument.findByIdAndUpdate as jest.Mock) = mockFindByIdAndUpdate;
        (UserDocument.findById as jest.Mock) = mockFindById;

        // Mock processAndEmbedDocument to throw error
        mockProcessAndEmbedDocument.mockRejectedValueOnce(processingError);

        await processUserDocument(
          testDocumentId,
          testS3Bucket,
          testS3Key,
          testUserId,
          testReqId
        );

        // Should update status to 'failed'
        expect(mockFindByIdAndUpdate).toHaveBeenCalledWith(testDocumentId, {
          status: 'failed',
          processingError: 'Failed to extract text from PDF',
          errorCode: IngestionErrorCode.UNKNOWN_PROCESSING_ERROR,
        });

        // Should log fatal error
        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.stringContaining('FATAL ERROR'),
          processingError
        );
      });

      it('should handle error with custom errorCode', async () => {
        const processingError: any = new Error('PDF parsing failed');
        processingError.errorCode = IngestionErrorCode.PDF_PARSE_FAILED;

        const mockFindByIdAndUpdate = jest.fn().mockResolvedValue({});
        const mockFindById = jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue({
            originalFileName: 'test.pdf',
            mimeType: 'application/pdf',
          }),
        });

        (UserDocument.findByIdAndUpdate as jest.Mock) = mockFindByIdAndUpdate;
        (UserDocument.findById as jest.Mock) = mockFindById;

        mockProcessAndEmbedDocument.mockRejectedValueOnce(processingError);

        await processUserDocument(
          testDocumentId,
          testS3Bucket,
          testS3Key,
          testUserId,
          testReqId
        );

        // Should use custom errorCode
        // Check the second call (first is status='processing', second is status='failed')
        const failedStatusCall = mockFindByIdAndUpdate.mock.calls.find(
          (call) => call[1].status === 'failed'
        );
        expect(failedStatusCall).toBeDefined();
        expect(failedStatusCall![1]).toEqual({
          status: 'failed',
          processingError: 'PDF parsing failed',
          errorCode: IngestionErrorCode.PDF_PARSE_FAILED, // Custom error code
        });
      });

      it('should handle error with null message', async () => {
        const processingError: any = new Error();
        processingError.message = null;

        const mockFindByIdAndUpdate = jest.fn().mockResolvedValue({});
        const mockFindById = jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue({
            originalFileName: 'test.pdf',
            mimeType: 'application/pdf',
          }),
        });

        (UserDocument.findByIdAndUpdate as jest.Mock) = mockFindByIdAndUpdate;
        (UserDocument.findById as jest.Mock) = mockFindById;

        mockProcessAndEmbedDocument.mockRejectedValueOnce(processingError);

        await processUserDocument(
          testDocumentId,
          testS3Bucket,
          testS3Key,
          testUserId,
          testReqId
        );

        // Should use fallback error message
        expect(mockFindByIdAndUpdate).toHaveBeenCalledWith(testDocumentId, {
          status: 'failed',
          processingError: 'Unknown processing error',
          errorCode: IngestionErrorCode.UNKNOWN_PROCESSING_ERROR,
        });
      });

      it('should handle error with empty string message', async () => {
        const processingError = new Error('');

        const mockFindByIdAndUpdate = jest.fn().mockResolvedValue({});
        const mockFindById = jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue({
            originalFileName: 'test.pdf',
            mimeType: 'application/pdf',
          }),
        });

        (UserDocument.findByIdAndUpdate as jest.Mock) = mockFindByIdAndUpdate;
        (UserDocument.findById as jest.Mock) = mockFindById;

        mockProcessAndEmbedDocument.mockRejectedValueOnce(processingError);

        await processUserDocument(
          testDocumentId,
          testS3Bucket,
          testS3Key,
          testUserId,
          testReqId
        );

        // Should use fallback message when error.message is empty
        expect(mockFindByIdAndUpdate).toHaveBeenCalledWith(testDocumentId, {
          status: 'failed',
          processingError: 'Unknown processing error',
          errorCode: IngestionErrorCode.UNKNOWN_PROCESSING_ERROR,
        });
      });
    });

    describe('Error Handling - Nested Status Update Failure', () => {
      it('should handle failure when updating status to failed', async () => {
        const processingError = new Error('Processing failed');
        const updateError = new Error('MongoDB update failed');

        const mockFindByIdAndUpdate = jest
          .fn()
          .mockResolvedValueOnce({}) // Initial status update succeeds
          .mockRejectedValueOnce(updateError); // Error status update fails

        const mockFindById = jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue({
            originalFileName: 'test.pdf',
            mimeType: 'application/pdf',
          }),
        });

        (UserDocument.findByIdAndUpdate as jest.Mock) = mockFindByIdAndUpdate;
        (UserDocument.findById as jest.Mock) = mockFindById;

        mockProcessAndEmbedDocument.mockRejectedValueOnce(processingError);

        await processUserDocument(
          testDocumentId,
          testS3Bucket,
          testS3Key,
          testUserId,
          testReqId
        );

        // Should attempt to update status to 'failed'
        expect(mockFindByIdAndUpdate).toHaveBeenCalledWith(testDocumentId, {
          status: 'failed',
          processingError: 'Processing failed',
          errorCode: IngestionErrorCode.UNKNOWN_PROCESSING_ERROR,
        });

        // Should log nested error
        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.stringContaining('FAILED TO UPDATE STATUS to failed'),
          updateError
        );

        // Should log original processing error
        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.stringContaining('FATAL ERROR'),
          processingError
        );
      });
    });

    describe('Logging Verification', () => {
      it('should log debug messages at key processing steps', async () => {
        const mockFindByIdAndUpdate = jest.fn().mockResolvedValue({});
        const mockFindById = jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue({
            originalFileName: 'test.pdf',
            mimeType: 'application/pdf',
          }),
        });

        (UserDocument.findByIdAndUpdate as jest.Mock) = mockFindByIdAndUpdate;
        (UserDocument.findById as jest.Mock) = mockFindById;

        await processUserDocument(
          testDocumentId,
          testS3Bucket,
          testS3Key,
          testUserId,
          testReqId
        );

        // Should log background processing start
        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.stringContaining('BACKGROUND PROCESSING STARTED')
        );

        // Should log S3 processing start
        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.stringContaining('S3 - START')
        );

        // Should log status set to processing
        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.stringContaining("Status set to 'processing'")
        );

        // Should log metadata fetch
        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.stringContaining('Fetching document metadata')
        );

        // Should log calling processAndEmbedDocument
        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.stringContaining('Calling processAndEmbedDocument')
        );
      });

      it('should log error details when processing fails', async () => {
        const processingError: any = new Error('Test error');
        processingError.name = 'TestError';
        processingError.stack = 'Error stack trace';

        const mockFindByIdAndUpdate = jest.fn().mockResolvedValue({});
        const mockFindById = jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue({
            originalFileName: 'test.pdf',
            mimeType: 'application/pdf',
          }),
        });

        (UserDocument.findByIdAndUpdate as jest.Mock) = mockFindByIdAndUpdate;
        (UserDocument.findById as jest.Mock) = mockFindById;

        mockProcessAndEmbedDocument.mockRejectedValueOnce(processingError);

        await processUserDocument(
          testDocumentId,
          testS3Bucket,
          testS3Key,
          testUserId,
          testReqId
        );

        // Should log error message
        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.stringContaining('Error Message:'),
          'Test error'
        );

        // Should log error name
        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.stringContaining('Error Name:'),
          'TestError'
        );

        // Should log error stack
        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.stringContaining('Error Stack:'),
          'Error stack trace'
        );
      });
    });
  });
});
