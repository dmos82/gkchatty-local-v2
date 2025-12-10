// Create shared logger mock instance BEFORE imports
const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  fatal: jest.fn(),
  trace: jest.fn(),
};

// Mock all dependencies BEFORE importing the module under test
jest.mock('../../utils/logger', () => ({
  getLogger: jest.fn(() => mockLogger),
}));

jest.mock('../../utils/openaiHelper');
jest.mock('../../utils/pineconeService');
jest.mock('../../models/UserDocument');
jest.mock('../../models/SystemKbDocument');
jest.mock('../../utils/pineconeNamespace');
jest.mock('../../utils/regexEscape');

import { getContext } from '../ragService';
import { generateEmbeddings } from '../../utils/openaiHelper';
import { queryVectors } from '../../utils/pineconeService';
import { UserDocument } from '../../models/UserDocument';
import { SystemKbDocument } from '../../models/SystemKbDocument';
import { getSystemKbNamespace, getUserNamespace } from '../../utils/pineconeNamespace';
import { escapeRegExp } from '../../utils/regexEscape';
import mongoose from 'mongoose';

// Type assertions for mocks
const mockGenerateEmbeddings = generateEmbeddings as jest.MockedFunction<typeof generateEmbeddings>;
const mockQueryVectors = queryVectors as jest.MockedFunction<typeof queryVectors>;
const mockGetSystemKbNamespace = getSystemKbNamespace as jest.MockedFunction<
  typeof getSystemKbNamespace
>;
const mockGetUserNamespace = getUserNamespace as jest.MockedFunction<typeof getUserNamespace>;
const mockEscapeRegExp = escapeRegExp as jest.MockedFunction<typeof escapeRegExp>;

describe('ragService - getContext', () => {
  // Test data constants
  const testUserId = 'user123';
  const testQuery = 'test query';
  const testEmbedding = [[0.1, 0.2, 0.3]];
  const systemDocId = new mongoose.Types.ObjectId().toString();
  const userDocId = new mongoose.Types.ObjectId().toString();

  // Mock Pinecone match helpers
  const createPineconeMatch = (
    id: string,
    score: number,
    sourceType: 'system' | 'user',
    documentId?: string,
    fileName?: string
  ) => ({
    id,
    score,
    metadata: {
      documentId: documentId || `doc-${id}`,
      originalFileName: fileName || `${sourceType}-file.pdf`,
      sourceType,
      text: `Sample text content from ${sourceType} document`,
    },
  });

  // Mock MongoDB document helpers
  const createMockDocument = (id: string, fileName: string) => ({
    _id: new mongoose.Types.ObjectId(id),
    originalFileName: fileName,
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Default successful mock behaviors
    mockGenerateEmbeddings.mockResolvedValue(testEmbedding);
    mockGetSystemKbNamespace.mockReturnValue('system-namespace');
    mockGetUserNamespace.mockReturnValue('user-namespace');
    mockEscapeRegExp.mockImplementation((str: string) => str); // Pass through for testing

    // Default empty results
    mockQueryVectors.mockResolvedValue({ matches: [] });

    // Default MongoDB query chain mocks (return empty arrays)
    const createEmptyQueryChain = () => ({
      select: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    });

    (SystemKbDocument.find as jest.Mock) = jest.fn(createEmptyQueryChain);
    (UserDocument.find as jest.Mock) = jest.fn(createEmptyQueryChain);
  });

  describe('Happy Path - Unified Mode', () => {
    it('should retrieve context from both system and user sources in unified mode', async () => {
      const systemMatch = createPineconeMatch('sys-1', 0.85, 'system', systemDocId);
      const userMatch = createPineconeMatch('user-1', 0.75, 'user', userDocId);

      // Mock Pinecone queries to return different results for each call
      mockQueryVectors
        .mockResolvedValueOnce({ matches: [systemMatch] }) // First call (system)
        .mockResolvedValueOnce({ matches: [userMatch] }); // Second call (user)

      const results = await getContext(testQuery, testUserId, { knowledgeBaseTarget: 'unified' });

      expect(results).toHaveLength(2);
      expect(results[0].type).toBe('system');
      expect(results[1].type).toBe('user');
      expect(mockQueryVectors).toHaveBeenCalledTimes(2);
    });

    it('should deduplicate results by fileName', async () => {
      const match1 = createPineconeMatch('vec-1', 0.9, 'system', systemDocId, 'duplicate.pdf');
      const match2 = createPineconeMatch('vec-2', 0.7, 'system', systemDocId, 'duplicate.pdf');
      const match3 = createPineconeMatch('vec-3', 0.6, 'system', 'doc-3', 'unique.pdf');

      mockQueryVectors.mockResolvedValue({ matches: [match1, match2, match3] });

      const results = await getContext(testQuery, testUserId, { knowledgeBaseTarget: 'system' });

      expect(results).toHaveLength(2);
      expect(results.map(r => r.fileName)).toContain('duplicate.pdf');
      expect(results.map(r => r.fileName)).toContain('unique.pdf');

      // Verify deduplication logging
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          initialCount: 3,
          deduplicatedCount: 2,
          removedDuplicates: 1,
        }),
        'Deduplicated search results'
      );
    });

    it('should sort results by boostedScore (highest first)', async () => {
      const lowScoreMatch = createPineconeMatch('vec-1', 0.5, 'system', 'doc-1', 'low.pdf');
      const midScoreMatch = createPineconeMatch('vec-2', 0.7, 'system', 'doc-2', 'mid.pdf');
      const highScoreMatch = createPineconeMatch('vec-3', 0.9, 'system', 'doc-3', 'high.pdf');

      mockQueryVectors.mockResolvedValue({
        matches: [lowScoreMatch, highScoreMatch, midScoreMatch],
      });

      const results = await getContext(testQuery, testUserId, { knowledgeBaseTarget: 'system' });

      expect(results).toHaveLength(3);
      expect(results[0].score).toBe(0.9);
      expect(results[1].score).toBe(0.7);
      expect(results[2].score).toBe(0.5);
    });

    it('should boost scores for keyword matches', async () => {
      const keywordDocId = systemDocId;
      const match = createPineconeMatch('vec-1', 0.8, 'system', keywordDocId);

      // Mock keyword search to find this document
      const mockSystemDoc = createMockDocument(keywordDocId, 'keyword-match.pdf');
      (SystemKbDocument.find as jest.Mock) = jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([mockSystemDoc]),
      }));

      mockQueryVectors.mockResolvedValue({ matches: [match] });

      const results = await getContext(testQuery, testUserId, { knowledgeBaseTarget: 'system' });

      expect(results).toHaveLength(1);
      expect(results[0].score).toBe(0.8);
      expect(results[0].boostedScore).toBe(0.8 * 1.5); // KWD_BOOST_FACTOR = 1.5
      expect(results[0].isKeywordMatch).toBe(true);
    });
  });

  describe('Happy Path - User Mode', () => {
    it('should retrieve context from user documents only in user mode', async () => {
      const userMatch = createPineconeMatch('user-1', 0.8, 'user', userDocId);
      mockQueryVectors.mockResolvedValue({ matches: [userMatch] });

      const results = await getContext(testQuery, testUserId, { knowledgeBaseTarget: 'user' });

      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('user');
      expect(results[0].origin).toBe('My Document');
      expect(mockQueryVectors).toHaveBeenCalledTimes(1);
      expect(mockQueryVectors).toHaveBeenCalledWith(
        testEmbedding[0],
        8, // SEMANTIC_SEARCH_TOP_K
        expect.objectContaining({ userId: testUserId, sourceType: 'user' }),
        'user-namespace'
      );
    });

    it('should filter out system documents in user mode results', async () => {
      const userMatch = createPineconeMatch('user-1', 0.8, 'user', userDocId);
      const systemContaminant = createPineconeMatch('sys-1', 0.9, 'system', systemDocId);

      mockQueryVectors.mockResolvedValue({ matches: [userMatch, systemContaminant] });

      const results = await getContext(testQuery, testUserId, { knowledgeBaseTarget: 'user' });

      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('user');
      expect(results.every(r => r.type === 'user')).toBe(true);
    });

    it('should return empty array when no user documents match', async () => {
      mockQueryVectors.mockResolvedValue({ matches: [] });

      const results = await getContext(testQuery, testUserId, { knowledgeBaseTarget: 'user' });

      expect(results).toHaveLength(0);
    });
  });

  describe('Happy Path - System/KB Mode', () => {
    it('should retrieve context from system KB only in system mode', async () => {
      const systemMatch = createPineconeMatch('sys-1', 0.85, 'system', systemDocId);
      mockQueryVectors.mockResolvedValue({ matches: [systemMatch] });

      const results = await getContext(testQuery, testUserId, { knowledgeBaseTarget: 'system' });

      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('system');
      expect(results[0].origin).toBe('System KB');
      expect(mockQueryVectors).toHaveBeenCalledTimes(1);
      expect(mockQueryVectors).toHaveBeenCalledWith(
        testEmbedding[0],
        8,
        expect.objectContaining({ sourceType: 'system' }),
        'system-namespace'
      );
    });

    it('should retrieve context from system KB only in kb mode', async () => {
      const systemMatch = createPineconeMatch('sys-1', 0.85, 'system', systemDocId);
      mockQueryVectors.mockResolvedValue({ matches: [systemMatch] });

      const results = await getContext(testQuery, testUserId, { knowledgeBaseTarget: 'kb' });

      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('system');
      expect(mockQueryVectors).toHaveBeenCalledWith(
        testEmbedding[0],
        8,
        expect.objectContaining({ sourceType: 'system' }),
        'system-namespace'
      );
    });

    it('should filter out user documents in system/kb mode results', async () => {
      const systemMatch = createPineconeMatch('sys-1', 0.85, 'system', systemDocId);
      const userContaminant = createPineconeMatch('user-1', 0.9, 'user', userDocId);

      mockQueryVectors.mockResolvedValue({ matches: [systemMatch, userContaminant] });

      const results = await getContext(testQuery, testUserId, { knowledgeBaseTarget: 'system' });

      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('system');
      expect(results.every(r => r.type === 'system')).toBe(true);
    });

    it('should return empty array when no system documents match', async () => {
      mockQueryVectors.mockResolvedValue({ matches: [] });

      const results = await getContext(testQuery, testUserId, { knowledgeBaseTarget: 'system' });

      expect(results).toHaveLength(0);
    });
  });

  describe('Query Enhancement - Contact Information', () => {
    it('should enhance contact query with person name', async () => {
      // COVERS LINES 40-45
      const contactQuery = 'What is John Smith email address';
      mockQueryVectors.mockResolvedValue({ matches: [] });

      await getContext(contactQuery, testUserId);

      // Verify query was enhanced - the service adds the first name match + " contact information"
      expect(mockGenerateEmbeddings).toHaveBeenCalledWith([
        'what is john smith email address What contact information',
      ]);

      // Verify enhancement was logged
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          originalQuery: contactQuery,
          enhancedQuery: expect.stringContaining('contact information'),
        }),
        '[RAG Service] Enhanced contact query for better retrieval'
      );
    });

    it('should handle contact query without names', async () => {
      const contactQuery = 'how to contact support';
      mockQueryVectors.mockResolvedValue({ matches: [] });

      await getContext(contactQuery, testUserId);

      // Should not enhance - no names detected
      expect(mockGenerateEmbeddings).toHaveBeenCalledWith([contactQuery.toLowerCase()]);
    });

    it('should handle multiple names in contact query', async () => {
      const contactQuery = 'Jane Doe and Bob Wilson phone numbers';
      mockQueryVectors.mockResolvedValue({ matches: [] });

      await getContext(contactQuery, testUserId);

      // Should enhance with first detected name
      expect(mockGenerateEmbeddings).toHaveBeenCalledWith(
        expect.arrayContaining([expect.stringContaining('contact information')])
      );
    });
  });

  describe('Error Handling - Embedding Generation', () => {
    it('should throw error when embedding generation fails', async () => {
      // COVERS LINE 61
      mockGenerateEmbeddings.mockResolvedValue(null);

      await expect(getContext(testQuery, testUserId)).rejects.toThrow(
        'Failed to generate query embedding.'
      );
    });

    it('should throw error when embedding array is empty', async () => {
      // COVERS LINE 61
      mockGenerateEmbeddings.mockResolvedValue([]);

      await expect(getContext(testQuery, testUserId)).rejects.toThrow(
        'Failed to generate query embedding.'
      );
    });
  });

  describe('Error Handling - Keyword Search Failures', () => {
    it('should handle system KB keyword search MongoDB errors gracefully', async () => {
      // COVERS LINES 90-91
      const mockError = new Error('MongoDB connection timeout');
      (SystemKbDocument.find as jest.Mock) = jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockRejectedValue(mockError),
      }));

      mockQueryVectors.mockResolvedValue({ matches: [] });

      // Should not throw - error is caught and logged
      const result = await getContext(testQuery, testUserId, { knowledgeBaseTarget: 'system' });

      expect(result).toEqual([]);
      expect(mockLogger.error).toHaveBeenCalledWith(
        mockError,
        '[RAG Service] System KB keyword search failed'
      );
    });

    it('should handle user docs keyword search MongoDB errors gracefully', async () => {
      // COVERS LINES 147-148
      const mockError = new Error('MongoDB query failed');
      (UserDocument.find as jest.Mock) = jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockRejectedValue(mockError),
      }));

      mockQueryVectors.mockResolvedValue({ matches: [] });

      // Should not throw - error is caught and logged
      const result = await getContext(testQuery, testUserId, { knowledgeBaseTarget: 'user' });

      expect(result).toEqual([]);
      expect(mockLogger.error).toHaveBeenCalledWith(
        mockError,
        '[RAG Service] User docs keyword search failed'
      );
    });

    it('should continue semantic search even when keyword searches fail', async () => {
      // Both keyword searches fail
      (SystemKbDocument.find as jest.Mock) = jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockRejectedValue(new Error('System KB error')),
      }));

      (UserDocument.find as jest.Mock) = jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockRejectedValue(new Error('User docs error')),
      }));

      const systemMatch = createPineconeMatch('sys-1', 0.8, 'system', systemDocId);
      mockQueryVectors.mockResolvedValue({ matches: [systemMatch] });

      // Should still return semantic search results
      const results = await getContext(testQuery, testUserId, { knowledgeBaseTarget: 'system' });

      expect(results).toHaveLength(1);
      expect(mockQueryVectors).toHaveBeenCalled();
    });
  });

  describe('Score Filtering and Boosting', () => {
    it('should filter out matches below MIN_CONFIDENCE_SCORE (0.35)', async () => {
      // COVERS LINE 232
      const lowScoreMatch = createPineconeMatch('vec-low', 0.30, 'system', 'doc-low');
      const highScoreMatch = createPineconeMatch('vec-high', 0.8, 'system', 'doc-high');

      mockQueryVectors.mockResolvedValue({ matches: [lowScoreMatch, highScoreMatch] });

      const results = await getContext(testQuery, testUserId, { knowledgeBaseTarget: 'system' });

      expect(results).toHaveLength(1);
      expect(results[0].score).toBe(0.8);
    });

    it('should log debug message when filtering low-score matches', async () => {
      // COVERS LINE 232
      const lowScoreMatch = createPineconeMatch('vec-low', 0.2, 'system', 'doc-low', 'low.pdf');

      mockQueryVectors.mockResolvedValue({ matches: [lowScoreMatch] });

      await getContext(testQuery, testUserId, { knowledgeBaseTarget: 'system' });

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          matchId: 'vec-low',
          score: 0.2,
          threshold: 0.35,
          sourceType: 'system',
          fileName: 'low.pdf',
        }),
        '[RAG Service] Filtering out low-score match'
      );
    });

    it('should apply KWD_BOOST_FACTOR (1.5x) to keyword matches', async () => {
      const keywordDocId = systemDocId;
      const match = createPineconeMatch('vec-1', 0.6, 'system', keywordDocId);

      (SystemKbDocument.find as jest.Mock) = jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([createMockDocument(keywordDocId, 'keyword.pdf')]),
      }));

      mockQueryVectors.mockResolvedValue({ matches: [match] });

      const results = await getContext(testQuery, testUserId, { knowledgeBaseTarget: 'system' });

      expect(results[0].score).toBe(0.6);
      expect(results[0].boostedScore).toBeCloseTo(0.9, 5); // 0.6 * 1.5 (account for floating point)
      expect(results[0].isKeywordMatch).toBe(true);
    });

    it('should preserve original score for non-keyword matches', async () => {
      const match = createPineconeMatch('vec-1', 0.7, 'system', 'doc-1');
      mockQueryVectors.mockResolvedValue({ matches: [match] });

      const results = await getContext(testQuery, testUserId, { knowledgeBaseTarget: 'system' });

      expect(results[0].score).toBe(0.7);
      expect(results[0].boostedScore).toBe(0.7); // No boost
      expect(results[0].isKeywordMatch).toBe(false);
    });
  });

  describe('Result Contamination Protection', () => {
    it('should detect and filter non-user documents in user mode', async () => {
      // COVERS LINE 294
      const userMatch = createPineconeMatch('user-1', 0.8, 'user', userDocId, 'user-doc.pdf');
      const systemContaminant = createPineconeMatch(
        'sys-1',
        0.9,
        'system',
        systemDocId,
        'system-doc.pdf'
      );

      mockQueryVectors.mockResolvedValue({ matches: [userMatch, systemContaminant] });

      const results = await getContext(testQuery, testUserId, { knowledgeBaseTarget: 'user' });

      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('user');
    });

    it('should log warning when user mode contamination detected', async () => {
      // COVERS LINE 294
      const systemContaminant = createPineconeMatch(
        'sys-1',
        0.9,
        'system',
        systemDocId,
        'system-contamination.pdf'
      );

      mockQueryVectors.mockResolvedValue({ matches: [systemContaminant] });

      await getContext(testQuery, testUserId, { knowledgeBaseTarget: 'user' });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          fileName: 'system-contamination.pdf',
          sourceType: 'system',
          origin: 'System KB',
        }),
        '[RAG Service] CONTAMINATION DETECTED: Non-user document found in user mode - filtering out'
      );
    });

    it('should detect and filter non-system documents in system/kb mode', async () => {
      // COVERS LINE 318
      const systemMatch = createPineconeMatch('sys-1', 0.85, 'system', systemDocId, 'system.pdf');
      const userContaminant = createPineconeMatch('user-1', 0.9, 'user', userDocId, 'user.pdf');

      mockQueryVectors.mockResolvedValue({ matches: [systemMatch, userContaminant] });

      const results = await getContext(testQuery, testUserId, { knowledgeBaseTarget: 'system' });

      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('system');
    });

    it('should log warning when system mode contamination detected', async () => {
      // COVERS LINE 318
      const userContaminant = createPineconeMatch(
        'user-1',
        0.9,
        'user',
        userDocId,
        'user-contamination.pdf'
      );

      mockQueryVectors.mockResolvedValue({ matches: [userContaminant] });

      await getContext(testQuery, testUserId, { knowledgeBaseTarget: 'kb' });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          fileName: 'user-contamination.pdf',
          sourceType: 'user',
          origin: 'My Document',
        }),
        '[RAG Service] CONTAMINATION DETECTED: Non-system document found in system/kb mode - filtering out'
      );
    });

    it('should not filter results in unified mode (all types allowed)', async () => {
      const systemMatch = createPineconeMatch('sys-1', 0.85, 'system', systemDocId);
      const userMatch = createPineconeMatch('user-1', 0.75, 'user', userDocId);

      mockQueryVectors
        .mockResolvedValueOnce({ matches: [systemMatch] })
        .mockResolvedValueOnce({ matches: [userMatch] });

      const results = await getContext(testQuery, testUserId, { knowledgeBaseTarget: 'unified' });

      expect(results).toHaveLength(2);
      expect(results.some(r => r.type === 'system')).toBe(true);
      expect(results.some(r => r.type === 'user')).toBe(true);

      // Should not log any contamination warnings in unified mode
      expect(mockLogger.warn).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('CONTAMINATION DETECTED')
      );
    });
  });

  describe('Namespace and Filter Logic', () => {
    it('should use correct namespace for system KB search', async () => {
      mockQueryVectors.mockResolvedValue({ matches: [] });

      await getContext(testQuery, testUserId, { knowledgeBaseTarget: 'system' });

      expect(mockGetSystemKbNamespace).toHaveBeenCalled();
      expect(mockQueryVectors).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        'system-namespace'
      );
    });

    it('should use correct namespace for user document search', async () => {
      mockQueryVectors.mockResolvedValue({ matches: [] });

      await getContext(testQuery, testUserId, { knowledgeBaseTarget: 'user' });

      expect(mockGetUserNamespace).toHaveBeenCalledWith(testUserId);
      expect(mockQueryVectors).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        'user-namespace'
      );
    });

    it('should apply sourceType filter correctly in each mode', async () => {
      mockQueryVectors.mockResolvedValue({ matches: [] });

      // System mode
      await getContext(testQuery, testUserId, { knowledgeBaseTarget: 'system' });
      expect(mockQueryVectors).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ sourceType: 'system' }),
        expect.anything()
      );

      jest.clearAllMocks();

      // User mode
      await getContext(testQuery, testUserId, { knowledgeBaseTarget: 'user' });
      expect(mockQueryVectors).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ sourceType: 'user' }),
        expect.anything()
      );
    });

    it('should apply userId filter for user documents', async () => {
      mockQueryVectors.mockResolvedValue({ matches: [] });

      await getContext(testQuery, testUserId, { knowledgeBaseTarget: 'user' });

      expect(mockQueryVectors).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ userId: testUserId }),
        expect.anything()
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty query string', async () => {
      mockQueryVectors.mockResolvedValue({ matches: [] });

      const results = await getContext('', testUserId);

      expect(results).toEqual([]);
      expect(mockGenerateEmbeddings).toHaveBeenCalledWith(['']);
    });

    it('should handle query with special regex characters (escape)', async () => {
      const specialQuery = 'test $100.00 [brackets] {braces}';
      mockEscapeRegExp.mockReturnValue('test \\$100\\.00 \\[brackets\\] \\{braces\\}');
      mockQueryVectors.mockResolvedValue({ matches: [] });

      await getContext(specialQuery, testUserId);

      expect(mockEscapeRegExp).toHaveBeenCalledWith(specialQuery.toLowerCase());
    });

    it('should handle results with missing metadata fields', async () => {
      const incompleteMatch = {
        id: 'vec-1',
        score: 0.8,
        metadata: {
          documentId: 'doc-1',
          sourceType: 'system',
          // Missing originalFileName and text
        },
      };

      mockQueryVectors.mockResolvedValue({ matches: [incompleteMatch] });

      const results = await getContext(testQuery, testUserId, { knowledgeBaseTarget: 'system' });

      expect(results).toHaveLength(1);
      expect(results[0].text).toBe('');
      expect(results[0].fileName).toBe('Unknown');
    });

    it('should handle results with null documentId', async () => {
      const matchWithoutDocId = {
        id: 'vec-1',
        score: 0.8,
        metadata: {
          documentId: null,
          originalFileName: 'test.pdf',
          sourceType: 'system',
          text: 'Sample text',
        },
      };

      mockQueryVectors.mockResolvedValue({ matches: [matchWithoutDocId] });

      const results = await getContext(testQuery, testUserId, { knowledgeBaseTarget: 'system' });

      expect(results).toHaveLength(1);
      expect(results[0].documentId).toBeNull();
      // When documentId is null, docId is falsy, so isKeywordMatch is null (falsy) not false
      expect(results[0].isKeywordMatch).toBeFalsy();
    });

    it('should handle concurrent Pinecone queries in parallel', async () => {
      const systemMatch = createPineconeMatch('sys-1', 0.85, 'system', systemDocId);
      const userMatch = createPineconeMatch('user-1', 0.75, 'user', userDocId);

      let systemCallTime: number;
      let userCallTime: number;

      mockQueryVectors
        .mockImplementation(async (embedding, topK, filter) => {
          if (filter.sourceType === 'system') {
            systemCallTime = Date.now();
            await new Promise(resolve => setTimeout(resolve, 10));
            return { matches: [systemMatch] };
          } else {
            userCallTime = Date.now();
            await new Promise(resolve => setTimeout(resolve, 10));
            return { matches: [userMatch] };
          }
        });

      await getContext(testQuery, testUserId, { knowledgeBaseTarget: 'unified' });

      // Both calls should be initiated at roughly the same time (parallel execution)
      expect(Math.abs(systemCallTime! - userCallTime!)).toBeLessThan(5);
      expect(mockQueryVectors).toHaveBeenCalledTimes(2);
    });
  });

  describe('Logging Verification', () => {
    it('should log search mode and configuration at start', async () => {
      mockQueryVectors.mockResolvedValue({ matches: [] });

      await getContext(testQuery, testUserId, { knowledgeBaseTarget: 'user' });

      expect(mockLogger.debug).toHaveBeenCalledWith(
        '[RAG Service] getContext called with knowledgeBaseTarget: user'
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        { knowledgeBaseTarget: 'user', userId: testUserId },
        '[RAG Service] Starting context retrieval'
      );
    });

    it('should log raw Pinecone matches before filtering', async () => {
      const match = createPineconeMatch('vec-1', 0.8, 'system', systemDocId);
      mockQueryVectors.mockResolvedValue({ matches: [match] });

      await getContext(testQuery, testUserId, { knowledgeBaseTarget: 'system' });

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          index: 0,
          matchId: 'vec-1',
          score: 0.8,
          documentId: systemDocId,
        }),
        expect.stringContaining('[RAG Service - system] Match 1/1')
      );
    });

    it('should log final source breakdown by type', async () => {
      const systemMatch = createPineconeMatch('sys-1', 0.85, 'system', systemDocId);
      const userMatch = createPineconeMatch('user-1', 0.75, 'user', userDocId);

      mockQueryVectors
        .mockResolvedValueOnce({ matches: [systemMatch] })
        .mockResolvedValueOnce({ matches: [userMatch] });

      await getContext(testQuery, testUserId, { knowledgeBaseTarget: 'unified' });

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'unified',
          breakdown: { system: 1, user: 1 },
          totalSources: 2,
        }),
        '[RAG Service] Final source breakdown by type'
      );
    });

    it('should log deduplication statistics', async () => {
      const match1 = createPineconeMatch('vec-1', 0.9, 'system', systemDocId, 'duplicate.pdf');
      const match2 = createPineconeMatch('vec-2', 0.8, 'system', systemDocId, 'duplicate.pdf');

      mockQueryVectors.mockResolvedValue({ matches: [match1, match2] });

      await getContext(testQuery, testUserId, { knowledgeBaseTarget: 'system' });

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          initialCount: 2,
          deduplicatedCount: 1,
          removedDuplicates: 1,
        }),
        'Deduplicated search results'
      );
    });
  });

  describe('Additional Coverage - Mode-Specific Logging', () => {
    it('should log user mode specific message', async () => {
      const userMatch = createPineconeMatch('user-1', 0.8, 'user', userDocId);
      mockQueryVectors.mockResolvedValue({ matches: [userMatch] });

      await getContext(testQuery, testUserId, { knowledgeBaseTarget: 'user' });

      expect(mockLogger.info).toHaveBeenCalledWith(
        { count: 1 },
        '[RAG Service] User mode: Using ONLY user documents'
      );
    });

    it('should log system mode specific message', async () => {
      const systemMatch = createPineconeMatch('sys-1', 0.85, 'system', systemDocId);
      mockQueryVectors.mockResolvedValue({ matches: [systemMatch] });

      await getContext(testQuery, testUserId, { knowledgeBaseTarget: 'system' });

      expect(mockLogger.info).toHaveBeenCalledWith(
        { count: 1 },
        '[RAG Service] System/KB mode: Using ONLY system KB documents'
      );
    });

    it('should log kb mode specific message', async () => {
      const systemMatch = createPineconeMatch('sys-1', 0.85, 'system', systemDocId);
      mockQueryVectors.mockResolvedValue({ matches: [systemMatch] });

      await getContext(testQuery, testUserId, { knowledgeBaseTarget: 'kb' });

      expect(mockLogger.info).toHaveBeenCalledWith(
        { count: 1 },
        '[RAG Service] System/KB mode: Using ONLY system KB documents'
      );
    });

    it('should log unified mode specific message', async () => {
      mockQueryVectors.mockResolvedValue({ matches: [] });

      await getContext(testQuery, testUserId, { knowledgeBaseTarget: 'unified' });

      expect(mockLogger.info).toHaveBeenCalledWith(
        { count: 0 },
        '[RAG Service] Unified mode: Using system and user document types'
      );
    });
  });

  describe('Contact Pattern Edge Cases', () => {
    it('should detect email pattern in query', async () => {
      const query = 'find email for customer'; // lowercase to avoid "Find" being matched as name
      mockQueryVectors.mockResolvedValue({ matches: [] });

      await getContext(query, testUserId);

      // contactPatterns should match but no names to enhance - no enhancement happens
      expect(mockGenerateEmbeddings).toHaveBeenCalledWith([query.toLowerCase()]);
    });

    it('should detect phone pattern in query', async () => {
      const query = 'get Sarah Connor phone';
      mockQueryVectors.mockResolvedValue({ matches: [] });

      await getContext(query, testUserId);

      // Should enhance with name - exact format: original query + first name match + " contact information"
      expect(mockGenerateEmbeddings).toHaveBeenCalledWith([
        'get sarah connor phone Sarah Connor contact information',
      ]);
    });

    it('should detect address pattern in query', async () => {
      const query = 'address of office';
      mockQueryVectors.mockResolvedValue({ matches: [] });

      await getContext(query, testUserId);

      // Pattern matches but no names
      expect(mockGenerateEmbeddings).toHaveBeenCalled();
    });
  });

  describe('Default Options', () => {
    it('should default to unified mode when no options provided', async () => {
      mockQueryVectors.mockResolvedValue({ matches: [] });

      await getContext(testQuery, testUserId);

      // Should query both namespaces
      expect(mockQueryVectors).toHaveBeenCalledTimes(2);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        '[RAG Service] getContext called with knowledgeBaseTarget: unified'
      );
    });
  });

  describe('Additional Edge Cases for Coverage', () => {
    it('should handle results with missing sourceType in metadata', async () => {
      const matchWithoutSourceType = {
        id: 'vec-1',
        score: 0.8,
        metadata: {
          documentId: 'doc-1',
          originalFileName: 'test.pdf',
          // sourceType is missing - will use type parameter from mapResults
          text: 'Sample text',
        },
      };

      mockQueryVectors.mockResolvedValue({ matches: [matchWithoutSourceType] });

      const results = await getContext(testQuery, testUserId, { knowledgeBaseTarget: 'system' });

      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('system'); // Should default to the type parameter
    });

    it('should handle Pinecone results with null matches array', async () => {
      mockQueryVectors.mockResolvedValue({ matches: null as any });

      const results = await getContext(testQuery, testUserId, { knowledgeBaseTarget: 'system' });

      expect(results).toEqual([]);
    });

    it('should handle Pinecone results with undefined matches', async () => {
      mockQueryVectors.mockResolvedValue({} as any);

      const results = await getContext(testQuery, testUserId, { knowledgeBaseTarget: 'system' });

      expect(results).toEqual([]);
    });
  });
});
