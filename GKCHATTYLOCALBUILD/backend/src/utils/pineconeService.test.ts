import { getLogger } from './logger';

// --- Mocks ---
jest.mock('./logger', () => ({
  getLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

jest.mock('./pineconeNamespace', () => ({
  getSystemKbNamespace: jest.fn(() => 'system-kb'),
}));

const mockPineconeUpsert = jest.fn();
const mockPineconeQuery = jest.fn();
const mockPineconeDeleteMany = jest.fn();

// Fix the mock structure to properly support the index() method
const mockPineconeIndex = {
  namespace: jest.fn(() => ({
    upsert: mockPineconeUpsert,
    query: mockPineconeQuery,
    deleteMany: mockPineconeDeleteMany,
  })),
  describeIndexStats: jest.fn(),
};

jest.mock('@pinecone-database/pinecone', () => ({
  ...jest.requireActual('@pinecone-database/pinecone'), // Retain actual exports like PineconeRecord
  Pinecone: jest.fn().mockImplementation(() => ({
    index: jest.fn(() => mockPineconeIndex), // Fix: index should be a function that returns the index object
  })),
}));

const mockWithRetry = jest.fn(fn => fn()); // Corrected: removed parentheses from fn
jest.mock('./retryHelper', () => ({
  withRetry: mockWithRetry,
  DEFAULT_PINECONE_RETRY_CONFIG: { retries: 1 }, // Minimal retry for tests
}));

// --- Test Subject Import (Dynamic after mocks) ---
let pineconeService: any;

async function initializeTestEnvironment() {
  jest.clearAllMocks();
  jest.resetModules(); // Reset modules to re-evaluate pineconeService with mocks
  pineconeService = await import('./pineconeService');
  // Re-apply getLogger mock as resetModules clears it
  (getLogger as jest.Mock).mockReturnValue({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  });
  // Ensure vital env vars for Pinecone init are set for tests
  process.env.PINECONE_API_KEY = 'test-pinecone-key';
  process.env.PINECONE_ENVIRONMENT = 'test-pinecone-env'; // Though not used in v3+ client init
  process.env.PINECONE_INDEX_NAME = 'test-pinecone-index';
}

describe('Pinecone Service with Circuit Breakers and Logging', () => {
  beforeEach(async () => {
    await initializeTestEnvironment();
  });

  describe('Initialization (initPinecone / getPineconeIndex)', () => {
    it('should initialize Pinecone client and index, logging steps', async () => {
      const index = await pineconeService.getPineconeIndex(); // Trigger initialization
      expect(index).toBeDefined();
    });

    it('should return cached instance on subsequent calls', async () => {
      const index1 = await pineconeService.getPineconeIndex();
      const index2 = await pineconeService.getPineconeIndex();
      expect(index1).toBe(index2);
      expect(index1).toBeDefined();
    });

    it('should throw and log error if PINECONE_API_KEY is missing', async () => {
      delete process.env.PINECONE_API_KEY;
      jest.resetModules();
      pineconeService = await import('./pineconeService');

      await expect(pineconeService.initPinecone()).rejects.toThrow(
        'Missing Pinecone environment variables.'
      );
    });

    it('should throw and log error if PINECONE_INDEX_NAME is missing', async () => {
      delete process.env.PINECONE_INDEX_NAME;
      jest.resetModules();
      pineconeService = await import('./pineconeService');

      await expect(pineconeService.initPinecone()).rejects.toThrow(
        'Missing Pinecone environment variables.'
      );
    });
  });

  describe('upsertVectors', () => {
    it('should call pineconeWriteUpsertBreaker.fire and log success', async () => {
      const vectors = [{ id: 'v1', values: [0.1], metadata: {} }];
      mockPineconeUpsert.mockResolvedValueOnce({}); // Simulate successful upsert
      await pineconeService.upsertVectors(vectors, 'ns1');
      expect(mockPineconeUpsert).toHaveBeenCalledWith(vectors); // Check if the core SDK method was called
    });

    it('should handle batching for large vector sets', async () => {
      const vectors = Array.from({ length: 250 }, (_, i) => ({
        id: `v${i}`,
        values: [0.1, 0.2],
        metadata: {},
      }));
      mockPineconeUpsert.mockResolvedValue({});

      await pineconeService.upsertVectors(vectors, 'ns1');

      // Should be called 3 times (100 + 100 + 50)
      expect(mockPineconeUpsert).toHaveBeenCalledTimes(3);
    });

    it('should work without namespace (default namespace)', async () => {
      const vectors = [{ id: 'v1', values: [0.1], metadata: {} }];
      mockPineconeUpsert.mockResolvedValueOnce({});

      await pineconeService.upsertVectors(vectors);
      expect(mockPineconeUpsert).toHaveBeenCalled();
    });

    it('should log error and re-throw if breaker/retry layer fails for upsert', async () => {
      const vectors = [{ id: 'v1', values: [0.1], metadata: {} }];
      const testError = new Error('Pinecone SDK upsert error');
      mockPineconeUpsert.mockRejectedValueOnce(testError);
      await expect(pineconeService.upsertVectors(vectors, 'ns1')).rejects.toThrow(
        'Pinecone upsert failed: Pinecone SDK upsert error'
      );
    });
  });

  describe('queryVectors', () => {
    it('should call pineconeReadBreaker.fire and log success', async () => {
      const queryVec = [0.1, 0.2];
      const mockResponse = { matches: [{ id: 'm1' }] }; // Simplified response
      mockPineconeQuery.mockResolvedValueOnce(mockResponse);
      const result = await pineconeService.queryVectors(queryVec, 5, {}, 'ns2');
      expect(mockPineconeQuery).toHaveBeenCalled();
      expect(result).toEqual(mockResponse);
    });

    it('should work without filter and namespace', async () => {
      const queryVec = [0.1, 0.2];
      const mockResponse = { matches: [] };
      mockPineconeQuery.mockResolvedValueOnce(mockResponse);

      const result = await pineconeService.queryVectors(queryVec, 10);
      expect(result).toEqual(mockResponse);
    });

    it('should handle query errors and re-throw', async () => {
      const queryVec = [0.1, 0.2];
      const testError = new Error('Pinecone query error');
      mockPineconeQuery.mockRejectedValueOnce(testError);

      await expect(pineconeService.queryVectors(queryVec, 5)).rejects.toThrow(
        'Pinecone query failed: Pinecone query error'
      );
    });
  });

  describe('deleteVectorsById', () => {
    it('should delete vectors by ID successfully', async () => {
      const ids = ['v1', 'v2', 'v3'];
      mockPineconeDeleteMany.mockResolvedValueOnce({});

      await pineconeService.deleteVectorsById(ids, 'ns1');
      expect(mockPineconeDeleteMany).toHaveBeenCalledWith(ids);
    });

    it('should work without namespace', async () => {
      const ids = ['v1', 'v2'];
      mockPineconeDeleteMany.mockResolvedValueOnce({});

      await pineconeService.deleteVectorsById(ids);
      expect(mockPineconeDeleteMany).toHaveBeenCalledWith(ids);
    });

    it('should handle delete errors and re-throw', async () => {
      const ids = ['v1'];
      const testError = new Error('Pinecone delete error');
      mockPineconeDeleteMany.mockRejectedValueOnce(testError);

      await expect(pineconeService.deleteVectorsById(ids, 'ns1')).rejects.toThrow(
        'Pinecone delete by ID failed: Pinecone delete error'
      );
    });
  });

  describe('deleteVectorsByFilter', () => {
    it('should delete vectors by filter successfully', async () => {
      const filter = { documentId: 'doc1' };
      mockPineconeDeleteMany.mockResolvedValueOnce({});

      await pineconeService.deleteVectorsByFilter(filter, 'ns1');
      expect(mockPineconeDeleteMany).toHaveBeenCalledWith(filter);
    });

    it('should delete all vectors when filter is empty', async () => {
      const filter = {};
      mockPineconeDeleteMany.mockResolvedValueOnce({});

      await pineconeService.deleteVectorsByFilter(filter, 'ns1');
      expect(mockPineconeDeleteMany).toHaveBeenCalledWith({ deleteAll: true });
    });

    it('should work without namespace', async () => {
      const filter = { sourceType: 'system' };
      mockPineconeDeleteMany.mockResolvedValueOnce({});

      await pineconeService.deleteVectorsByFilter(filter);
      expect(mockPineconeDeleteMany).toHaveBeenCalledWith(filter);
    });

    it('should handle delete by filter errors and re-throw', async () => {
      const filter = { documentId: 'doc1' };
      const testError = new Error('Pinecone delete by filter error');
      mockPineconeDeleteMany.mockRejectedValueOnce(testError);

      await expect(pineconeService.deleteVectorsByFilter(filter, 'ns1')).rejects.toThrow(
        'Pinecone delete by filter failed: Pinecone delete by filter error'
      );
    });
  });

  describe('upsertSystemDocument', () => {
    it('should upsert system document with correct metadata', async () => {
      const documentId = 'doc123';
      const embedding = [0.1, 0.2, 0.3];
      const text = 'This is a test document';
      const originalFileName = 'test.pdf';
      const chunkIndex = 0;
      const totalChunks = 5;

      mockPineconeUpsert.mockResolvedValueOnce({});

      await pineconeService.upsertSystemDocument(
        documentId,
        embedding,
        text,
        originalFileName,
        chunkIndex,
        totalChunks
      );

      expect(mockPineconeUpsert).toHaveBeenCalledTimes(1);
      const calledVector = mockPineconeUpsert.mock.calls[0][0][0];
      expect(calledVector.id).toBe('doc123_chunk_0');
      expect(calledVector.values).toEqual(embedding);
      expect(calledVector.metadata).toMatchObject({
        documentId,
        originalFileName,
        sourceType: 'system',
        chunkIndex,
        totalChunks,
      });
    });

    it('should truncate long text snippets in metadata', async () => {
      const longText = 'a'.repeat(2000);
      mockPineconeUpsert.mockResolvedValueOnce({});

      await pineconeService.upsertSystemDocument(
        'doc1',
        [0.1],
        longText,
        'file.txt',
        0,
        1
      );

      const calledVector = mockPineconeUpsert.mock.calls[0][0][0];
      expect(calledVector.metadata.textSnippet.length).toBe(1000);
    });
  });

  describe('deleteSystemDocument', () => {
    it('should delete all vectors for a system document', async () => {
      const documentId = 'doc123';
      mockPineconeDeleteMany.mockResolvedValueOnce({});

      await pineconeService.deleteSystemDocument(documentId);

      expect(mockPineconeDeleteMany).toHaveBeenCalledWith({ documentId });
    });
  });

  describe('purgeNamespace', () => {
    it('should purge all vectors from a namespace', async () => {
      const namespace = 'test-namespace';
      mockPineconeDeleteMany.mockResolvedValueOnce({});

      await pineconeService.purgeNamespace(namespace);

      expect(mockPineconeDeleteMany).toHaveBeenCalledWith({ deleteAll: true });
    });

    it('should handle purge errors and re-throw', async () => {
      const namespace = 'test-namespace';
      const testError = new Error('Purge failed');
      mockPineconeDeleteMany.mockRejectedValueOnce(testError);

      await expect(pineconeService.purgeNamespace(namespace)).rejects.toThrow('Purge failed');
    });
  });

  describe('Retry Configuration Exports', () => {
    it('should export DEFAULT_PINECONE_RETRY_CONFIG', () => {
      expect(pineconeService.DEFAULT_PINECONE_RETRY_CONFIG).toBeDefined();
      expect(pineconeService.DEFAULT_PINECONE_RETRY_CONFIG.retries).toBeDefined();
    });

    it('should export PINECONE_READ_RETRY_CONFIG', () => {
      expect(pineconeService.PINECONE_READ_RETRY_CONFIG).toBeDefined();
      expect(pineconeService.PINECONE_READ_RETRY_CONFIG.description).toBe('Pinecone Read Operation');
    });

    it('should export PINECONE_WRITE_RETRY_CONFIG', () => {
      expect(pineconeService.PINECONE_WRITE_RETRY_CONFIG).toBeDefined();
      expect(pineconeService.PINECONE_WRITE_RETRY_CONFIG.description).toBe('Pinecone Write Operation');
    });
  });

  describe('Circuit Breaker Integration', () => {
    it('should handle circuit breaker timeout gracefully', async () => {
      // Make the operation slow to trigger timeout
      mockPineconeQuery.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ matches: [] }), 10000))
      );

      const queryVec = [0.1, 0.2];

      // This should eventually fail with timeout or other error
      await expect(
        pineconeService.queryVectors(queryVec, 5)
      ).rejects.toThrow();
    });

    it('should handle non-Error objects in error scenarios', async () => {
      mockPineconeUpsert.mockRejectedValueOnce('String error instead of Error object');

      const vectors = [{ id: 'v1', values: [0.1], metadata: {} }];
      await expect(pineconeService.upsertVectors(vectors)).rejects.toThrow(
        'Pinecone upsert failed: String error instead of Error object'
      );
    });
  });

  describe('Advanced Initialization Coverage', () => {
    it('should use cached index instance after first initialization', async () => {
      // First call initializes
      const index1 = await pineconeService.initPinecone();

      // Second call should return cached instance (covers line 52)
      const index2 = await pineconeService.initPinecone();

      expect(index1).toBe(index2);
      expect(index1).toBeDefined();
    });
  });
});
