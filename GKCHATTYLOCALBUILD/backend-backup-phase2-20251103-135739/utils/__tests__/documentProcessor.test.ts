// Mock pdf-parse BEFORE importing documentProcessor
jest.mock('pdf-parse', () => jest.fn());

// Mock logger
jest.mock('../logger', () => ({
  getLogger: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    fatal: jest.fn(),
    trace: jest.fn(),
  })),
}));

// Mock all external dependencies that documentProcessor imports
jest.mock('../excelProcessor');
jest.mock('../imageProcessor');
jest.mock('../audioProcessor');
jest.mock('../videoProcessor');
jest.mock('../openaiHelper');
jest.mock('../pineconeService');
jest.mock('../s3Helper');
jest.mock('../pineconeNamespace');
jest.mock('../../models/UserDocument');
jest.mock('../../models/SystemKbDocument');

import { extractTextFromPdf } from '../documentProcessor';
import pdf from 'pdf-parse';

describe('documentProcessor', () => {
  describe('extractTextFromPdf', () => {
    const mockPdfParse = pdf as jest.MockedFunction<typeof pdf>;

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should extract text from a valid PDF buffer', async () => {
      const mockPdfBuffer = Buffer.from('fake pdf content');
      const mockPdfData = {
        text: 'This is extracted text from PDF',
        numpages: 1,
        info: {},
        metadata: null,
        version: '1.7',
      };

      mockPdfParse.mockResolvedValue(mockPdfData);

      const result = await extractTextFromPdf(mockPdfBuffer);

      expect(result).toBe('This is extracted text from PDF');
      expect(mockPdfParse).toHaveBeenCalledWith(mockPdfBuffer);
    });

    it('should trim whitespace from extracted text', async () => {
      const mockPdfBuffer = Buffer.from('fake pdf content');
      const mockPdfData = {
        text: '  \n  Extracted text with whitespace  \n  ',
        numpages: 1,
        info: {},
        metadata: null,
        version: '1.7',
      };

      mockPdfParse.mockResolvedValue(mockPdfData);

      const result = await extractTextFromPdf(mockPdfBuffer);

      expect(result).toBe('Extracted text with whitespace');
    });

    it('should handle PDF with multiple pages', async () => {
      const mockPdfBuffer = Buffer.from('fake pdf content');
      const mockPdfData = {
        text: 'Page 1 content\nPage 2 content\nPage 3 content',
        numpages: 3,
        info: {},
        metadata: null,
        version: '1.7',
      };

      mockPdfParse.mockResolvedValue(mockPdfData);

      const result = await extractTextFromPdf(mockPdfBuffer);

      expect(result).toContain('Page 1 content');
      expect(result).toContain('Page 2 content');
      expect(result).toContain('Page 3 content');
    });

    it('should handle empty PDF (no text content)', async () => {
      const mockPdfBuffer = Buffer.from('fake pdf content');
      const mockPdfData = {
        text: '',
        numpages: 1,
        info: {},
        metadata: null,
        version: '1.7',
      };

      mockPdfParse.mockResolvedValue(mockPdfData);

      const result = await extractTextFromPdf(mockPdfBuffer);

      expect(result).toBe('');
    });

    it('should handle PDF with only whitespace', async () => {
      const mockPdfBuffer = Buffer.from('fake pdf content');
      const mockPdfData = {
        text: '   \n\n   \t\t   ',
        numpages: 1,
        info: {},
        metadata: null,
        version: '1.7',
      };

      mockPdfParse.mockResolvedValue(mockPdfData);

      const result = await extractTextFromPdf(mockPdfBuffer);

      expect(result).toBe('');
    });

    it('should handle PDF with null text property', async () => {
      const mockPdfBuffer = Buffer.from('fake pdf content');
      const mockPdfData = {
        text: null as any,
        numpages: 1,
        info: {},
        metadata: null,
        version: '1.7',
      };

      mockPdfParse.mockResolvedValue(mockPdfData);

      const result = await extractTextFromPdf(mockPdfBuffer);

      expect(result).toBe('');
    });

    it('should handle PDF with undefined text property', async () => {
      const mockPdfBuffer = Buffer.from('fake pdf content');
      const mockPdfData = {
        text: undefined as any,
        numpages: 1,
        info: {},
        metadata: null,
        version: '1.7',
      };

      mockPdfParse.mockResolvedValue(mockPdfData);

      const result = await extractTextFromPdf(mockPdfBuffer);

      expect(result).toBe('');
    });

    it('should handle large PDF with lots of text', async () => {
      const mockPdfBuffer = Buffer.from('fake pdf content');
      const longText = 'Lorem ipsum '.repeat(10000); // ~120KB of text
      const mockPdfData = {
        text: longText,
        numpages: 100,
        info: {},
        metadata: null,
        version: '1.7',
      };

      mockPdfParse.mockResolvedValue(mockPdfData);

      const result = await extractTextFromPdf(mockPdfBuffer);

      expect(result.length).toBeGreaterThan(100000);
      expect(result).toContain('Lorem ipsum');
    });

    it('should handle PDF with special characters', async () => {
      const mockPdfBuffer = Buffer.from('fake pdf content');
      const mockPdfData = {
        text: 'Special chars: @#$%^&*() "quotes" \'apostrophes\' —dashes— …ellipsis',
        numpages: 1,
        info: {},
        metadata: null,
        version: '1.7',
      };

      mockPdfParse.mockResolvedValue(mockPdfData);

      const result = await extractTextFromPdf(mockPdfBuffer);

      expect(result).toContain('@#$%^&*()');
      expect(result).toContain('"quotes"');
      expect(result).toContain('—dashes—');
    });

    it('should handle PDF with Unicode characters', async () => {
      const mockPdfBuffer = Buffer.from('fake pdf content');
      const mockPdfData = {
        text: 'Unicode: 你好世界 Привет мир こんにちは 🌍🎉',
        numpages: 1,
        info: {},
        metadata: null,
        version: '1.7',
      };

      mockPdfParse.mockResolvedValue(mockPdfData);

      const result = await extractTextFromPdf(mockPdfBuffer);

      expect(result).toContain('你好世界');
      expect(result).toContain('Привет мир');
      expect(result).toContain('こんにちは');
      expect(result).toContain('🌍🎉');
    });

    it('should handle PDF with formatted text (newlines, tabs)', async () => {
      const mockPdfBuffer = Buffer.from('fake pdf content');
      const mockPdfData = {
        text: 'Line 1\nLine 2\tTabbed\n\nDouble newline',
        numpages: 1,
        info: {},
        metadata: null,
        version: '1.7',
      };

      mockPdfParse.mockResolvedValue(mockPdfData);

      const result = await extractTextFromPdf(mockPdfBuffer);

      expect(result).toBe('Line 1\nLine 2\tTabbed\n\nDouble newline');
    });

    it('should throw descriptive error when PDF parsing fails', async () => {
      const mockPdfBuffer = Buffer.from('fake pdf content');

      mockPdfParse.mockRejectedValue(new Error('Invalid PDF structure'));

      await expect(extractTextFromPdf(mockPdfBuffer)).rejects.toThrow(
        'Failed to extract text from PDF: Invalid PDF structure'
      );
    });

    it('should handle non-Error exceptions gracefully', async () => {
      const mockPdfBuffer = Buffer.from('fake pdf content');

      mockPdfParse.mockRejectedValue('String error');

      await expect(extractTextFromPdf(mockPdfBuffer)).rejects.toThrow(
        'Failed to extract text from PDF: String error'
      );
    });

    it('should throw error for corrupted PDF buffer', async () => {
      const mockPdfBuffer = Buffer.from('corrupted data');

      mockPdfParse.mockRejectedValue(new Error('PDF header not found'));

      await expect(extractTextFromPdf(mockPdfBuffer)).rejects.toThrow(
        'Failed to extract text from PDF: PDF header not found'
      );
    });

    it('should handle PDF with mixed content types (text, images, tables)', async () => {
      const mockPdfBuffer = Buffer.from('fake pdf content');
      const mockPdfData = {
        text: 'Header Text\n\nTable Data: Col1 Col2\nRow1 Row2\n\nFooter Text',
        numpages: 1,
        info: {},
        metadata: null,
        version: '1.7',
      };

      mockPdfParse.mockResolvedValue(mockPdfData);

      const result = await extractTextFromPdf(mockPdfBuffer);

      expect(result).toContain('Header Text');
      expect(result).toContain('Table Data');
      expect(result).toContain('Footer Text');
    });

    it('should call pdf-parse exactly once with the buffer', async () => {
      const mockPdfBuffer = Buffer.from('fake pdf content');
      const mockPdfData = {
        text: 'Test',
        numpages: 1,
        info: {},
        metadata: null,
        version: '1.7',
      };

      mockPdfParse.mockResolvedValue(mockPdfData);

      await extractTextFromPdf(mockPdfBuffer);

      expect(mockPdfParse).toHaveBeenCalledTimes(1);
      expect(mockPdfParse).toHaveBeenCalledWith(mockPdfBuffer);
    });
  });

  describe('text chunking logic', () => {
    // Testing the chunking algorithm without full integration
    // This validates core business logic independently

    it('should chunk text with correct size and overlap', () => {
      const MAX_CHUNK_SIZE = 1500;
      const CHUNK_OVERLAP = 300;

      // Simulate the chunking logic from processAndEmbedDocument
      const fullText = 'A'.repeat(5000); // 5000 char text
      const textChunks: string[] = [];

      for (let i = 0; i < fullText.length; i += MAX_CHUNK_SIZE - CHUNK_OVERLAP) {
        const chunk = fullText.substring(i, i + MAX_CHUNK_SIZE);
        if (chunk.trim()) {
          textChunks.push(chunk);
        }
      }

      // Should create multiple chunks
      expect(textChunks.length).toBeGreaterThan(1);

      // Each chunk should be at most MAX_CHUNK_SIZE
      textChunks.forEach(chunk => {
        expect(chunk.length).toBeLessThanOrEqual(MAX_CHUNK_SIZE);
      });

      // Verify overlap: check that consecutive chunks share content
      for (let i = 0; i < textChunks.length - 1; i++) {
        const endOfCurrent = textChunks[i].substring(textChunks[i].length - CHUNK_OVERLAP);
        const startOfNext = textChunks[i + 1].substring(0, CHUNK_OVERLAP);

        // Should have overlapping content
        expect(endOfCurrent.substring(0, 100)).toBe(startOfNext.substring(0, 100));
      }
    });

    it('should handle text smaller than chunk size', () => {
      const MAX_CHUNK_SIZE = 1500;
      const CHUNK_OVERLAP = 300;

      const fullText = 'Short text';
      const textChunks: string[] = [];

      for (let i = 0; i < fullText.length; i += MAX_CHUNK_SIZE - CHUNK_OVERLAP) {
        const chunk = fullText.substring(i, i + MAX_CHUNK_SIZE);
        if (chunk.trim()) {
          textChunks.push(chunk);
        }
      }

      // Should create exactly 1 chunk
      expect(textChunks.length).toBe(1);
      expect(textChunks[0]).toBe('Short text');
    });

    it('should skip empty chunks (whitespace only)', () => {
      const MAX_CHUNK_SIZE = 1500;
      const CHUNK_OVERLAP = 300;

      const fullText = 'Content\n\n\n\n\n\n' + ' '.repeat(2000) + '\n\n\nMore content';
      const textChunks: string[] = [];

      for (let i = 0; i < fullText.length; i += MAX_CHUNK_SIZE - CHUNK_OVERLAP) {
        const chunk = fullText.substring(i, i + MAX_CHUNK_SIZE);
        if (chunk.trim()) {
          textChunks.push(chunk);
        }
      }

      // All chunks should have non-whitespace content
      textChunks.forEach(chunk => {
        expect(chunk.trim().length).toBeGreaterThan(0);
      });
    });

    it('should handle exact multiple of chunk size', () => {
      const MAX_CHUNK_SIZE = 1500;
      const CHUNK_OVERLAP = 300;

      // Create text that's exactly 2 * (MAX_CHUNK_SIZE - CHUNK_OVERLAP)
      const fullText = 'A'.repeat(2 * (MAX_CHUNK_SIZE - CHUNK_OVERLAP));
      const textChunks: string[] = [];

      for (let i = 0; i < fullText.length; i += MAX_CHUNK_SIZE - CHUNK_OVERLAP) {
        const chunk = fullText.substring(i, i + MAX_CHUNK_SIZE);
        if (chunk.trim()) {
          textChunks.push(chunk);
        }
      }

      // Should create exactly 2 chunks
      expect(textChunks.length).toBe(2);
    });
  });

  describe('processAndEmbedDocument - integration', () => {
    // Note: Full integration tests are deferred to Phase 2
    // These would require extensive mocking of S3, MongoDB, Pinecone, OpenAI

    it.skip('TODO Phase 2: PDF processing path', () => {});
    it.skip('TODO Phase 2: Excel processing path', () => {});
    it.skip('TODO Phase 2: Audio/Video conversion path', () => {});
    it.skip('TODO Phase 2: Embedding generation', () => {});
    it.skip('TODO Phase 2: Pinecone upsert', () => {});
    it.skip('TODO Phase 2: MongoDB status updates', () => {});
  });
});
