// Mock pdf-parse BEFORE importing pdfUtils
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

import pdf from 'pdf-parse';
import {
  renderPageWithNumber,
  extractPdfTextWithPages,
  chunkTextWithPages,
  PageText,
} from '../pdfUtils';

describe('pdfUtils', () => {
  const mockPdfParse = pdf as jest.MockedFunction<typeof pdf>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('renderPageWithNumber', () => {
    it('should render text from page data with single line', async () => {
      const mockPageData = {
        getTextContent: jest.fn().mockResolvedValue({
          items: [
            { str: 'Hello ', transform: [1, 0, 0, 1, 0, 100] },
            { str: 'World', transform: [1, 0, 0, 1, 20, 100] },
          ],
        }),
      };

      const result = await renderPageWithNumber(mockPageData);

      expect(result).toBe('Hello World');
      expect(mockPageData.getTextContent).toHaveBeenCalledWith({
        normalizeWhitespace: false,
        disableCombineTextItems: false,
      });
    });

    it('should add newlines when y-coordinate changes', async () => {
      const mockPageData = {
        getTextContent: jest.fn().mockResolvedValue({
          items: [
            { str: 'Line 1', transform: [1, 0, 0, 1, 0, 100] },
            { str: 'Line 2', transform: [1, 0, 0, 1, 0, 80] }, // Different Y
            { str: 'Line 3', transform: [1, 0, 0, 1, 0, 60] }, // Different Y
          ],
        }),
      };

      const result = await renderPageWithNumber(mockPageData);

      expect(result).toBe('Line 1\nLine 2\nLine 3');
    });

    it('should handle items on same line with same y-coordinate', async () => {
      const mockPageData = {
        getTextContent: jest.fn().mockResolvedValue({
          items: [
            { str: 'First ', transform: [1, 0, 0, 1, 0, 100] },
            { str: 'Second ', transform: [1, 0, 0, 1, 10, 100] },
            { str: 'Third', transform: [1, 0, 0, 1, 20, 100] },
          ],
        }),
      };

      const result = await renderPageWithNumber(mockPageData);

      expect(result).toBe('First Second Third');
    });

    it('should handle empty text content', async () => {
      const mockPageData = {
        getTextContent: jest.fn().mockResolvedValue({
          items: [],
        }),
      };

      const result = await renderPageWithNumber(mockPageData);

      expect(result).toBe('');
    });

    it('should handle first item without previous y-coordinate', async () => {
      const mockPageData = {
        getTextContent: jest.fn().mockResolvedValue({
          items: [
            { str: 'First item', transform: [1, 0, 0, 1, 0, 100] },
          ],
        }),
      };

      const result = await renderPageWithNumber(mockPageData);

      expect(result).toBe('First item');
    });

    it('should handle text items with special characters', async () => {
      const mockPageData = {
        getTextContent: jest.fn().mockResolvedValue({
          items: [
            { str: 'Special: @#$%', transform: [1, 0, 0, 1, 0, 100] },
            { str: 'Unicode: 你好', transform: [1, 0, 0, 1, 0, 80] },
          ],
        }),
      };

      const result = await renderPageWithNumber(mockPageData);

      expect(result).toContain('Special: @#$%');
      expect(result).toContain('Unicode: 你好');
    });

    it('should handle mixed y-coordinates', async () => {
      const mockPageData = {
        getTextContent: jest.fn().mockResolvedValue({
          items: [
            { str: 'A', transform: [1, 0, 0, 1, 0, 100] },
            { str: 'B', transform: [1, 0, 0, 1, 10, 100] }, // Same line
            { str: 'C', transform: [1, 0, 0, 1, 0, 80] }, // New line
            { str: 'D', transform: [1, 0, 0, 1, 10, 80] }, // Same line as C
          ],
        }),
      };

      const result = await renderPageWithNumber(mockPageData);

      expect(result).toBe('AB\nCD');
    });

    it('should handle getTextContent rejection', async () => {
      const mockPageData = {
        getTextContent: jest.fn().mockRejectedValue(new Error('Failed to get text content')),
      };

      await expect(renderPageWithNumber(mockPageData)).rejects.toThrow('Failed to get text content');
    });
  });

  describe('extractPdfTextWithPages', () => {
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

      const result = await extractPdfTextWithPages(mockPdfBuffer);

      expect(result).toEqual([
        { pageNumber: 1, text: 'This is extracted text from PDF' },
      ]);
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

      const result = await extractPdfTextWithPages(mockPdfBuffer);

      expect(result).toEqual([
        { pageNumber: 1, text: 'Extracted text with whitespace' },
      ]);
    });

    it('should handle PDF with multiple pages (returned as single page)', async () => {
      const mockPdfBuffer = Buffer.from('fake pdf content');
      const mockPdfData = {
        text: 'Page 1 content\nPage 2 content\nPage 3 content',
        numpages: 3,
        info: {},
        metadata: null,
        version: '1.7',
      };

      mockPdfParse.mockResolvedValue(mockPdfData);

      const result = await extractPdfTextWithPages(mockPdfBuffer);

      // pdf-parse returns combined text as single page
      expect(result).toEqual([
        { pageNumber: 1, text: 'Page 1 content\nPage 2 content\nPage 3 content' },
      ]);
    });

    it('should return empty array for PDF with no text', async () => {
      const mockPdfBuffer = Buffer.from('fake pdf content');
      const mockPdfData = {
        text: '',
        numpages: 1,
        info: {},
        metadata: null,
        version: '1.7',
      };

      mockPdfParse.mockResolvedValue(mockPdfData);

      const result = await extractPdfTextWithPages(mockPdfBuffer);

      expect(result).toEqual([]);
    });

    it('should return empty array for PDF with only whitespace', async () => {
      const mockPdfBuffer = Buffer.from('fake pdf content');
      const mockPdfData = {
        text: '   \n\n   \t\t   ',
        numpages: 1,
        info: {},
        metadata: null,
        version: '1.7',
      };

      mockPdfParse.mockResolvedValue(mockPdfData);

      const result = await extractPdfTextWithPages(mockPdfBuffer);

      expect(result).toEqual([]);
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

      const result = await extractPdfTextWithPages(mockPdfBuffer);

      expect(result).toEqual([]);
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

      const result = await extractPdfTextWithPages(mockPdfBuffer);

      expect(result).toEqual([]);
    });

    it('should handle large PDF with lots of text', async () => {
      const mockPdfBuffer = Buffer.from('fake pdf content');
      const longText = 'Lorem ipsum '.repeat(10000); // ~120KB of text
      const mockPdfData = {
        text: longText.trim(),
        numpages: 100,
        info: {},
        metadata: null,
        version: '1.7',
      };

      mockPdfParse.mockResolvedValue(mockPdfData);

      const result = await extractPdfTextWithPages(mockPdfBuffer);

      expect(result).toHaveLength(1);
      expect(result[0].text.length).toBeGreaterThan(100000);
      expect(result[0].text).toContain('Lorem ipsum');
      expect(result[0].pageNumber).toBe(1);
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

      const result = await extractPdfTextWithPages(mockPdfBuffer);

      expect(result[0].text).toContain('@#$%^&*()');
      expect(result[0].text).toContain('"quotes"');
      expect(result[0].text).toContain('—dashes—');
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

      const result = await extractPdfTextWithPages(mockPdfBuffer);

      expect(result[0].text).toContain('你好世界');
      expect(result[0].text).toContain('Привет мир');
      expect(result[0].text).toContain('こんにちは');
      expect(result[0].text).toContain('🌍🎉');
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

      const result = await extractPdfTextWithPages(mockPdfBuffer);

      expect(result[0].text).toBe('Line 1\nLine 2\tTabbed\n\nDouble newline');
    });

    it('should throw descriptive error when PDF parsing fails', async () => {
      const mockPdfBuffer = Buffer.from('fake pdf content');

      mockPdfParse.mockRejectedValue(new Error('Invalid PDF structure'));

      await expect(extractPdfTextWithPages(mockPdfBuffer)).rejects.toThrow(
        'Failed to extract text using pdf-parse: Invalid PDF structure'
      );
    });

    it('should handle non-Error exceptions gracefully', async () => {
      const mockPdfBuffer = Buffer.from('fake pdf content');

      mockPdfParse.mockRejectedValue('String error');

      await expect(extractPdfTextWithPages(mockPdfBuffer)).rejects.toThrow(
        'Failed to extract text using pdf-parse: String error'
      );
    });

    it('should throw error for corrupted PDF buffer', async () => {
      const mockPdfBuffer = Buffer.from('corrupted data');

      mockPdfParse.mockRejectedValue(new Error('PDF header not found'));

      await expect(extractPdfTextWithPages(mockPdfBuffer)).rejects.toThrow(
        'Failed to extract text using pdf-parse: PDF header not found'
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

      const result = await extractPdfTextWithPages(mockPdfBuffer);

      expect(result[0].text).toContain('Header Text');
      expect(result[0].text).toContain('Table Data');
      expect(result[0].text).toContain('Footer Text');
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

      await extractPdfTextWithPages(mockPdfBuffer);

      expect(mockPdfParse).toHaveBeenCalledTimes(1);
      expect(mockPdfParse).toHaveBeenCalledWith(mockPdfBuffer);
    });

    it('should handle object exceptions without message', async () => {
      const mockPdfBuffer = Buffer.from('fake pdf content');

      mockPdfParse.mockRejectedValue({ code: 'ERR_PARSE' });

      await expect(extractPdfTextWithPages(mockPdfBuffer)).rejects.toThrow(
        'Failed to extract text using pdf-parse: [object Object]'
      );
    });

    it('should handle number exceptions', async () => {
      const mockPdfBuffer = Buffer.from('fake pdf content');

      mockPdfParse.mockRejectedValue(404);

      await expect(extractPdfTextWithPages(mockPdfBuffer)).rejects.toThrow(
        'Failed to extract text using pdf-parse: 404'
      );
    });
  });

  describe('chunkTextWithPages', () => {
    it('should chunk text from single page into multiple chunks', () => {
      const pages: PageText[] = [
        { pageNumber: 1, text: 'A'.repeat(2000) },
      ];

      const result = chunkTextWithPages(pages, 750, 150);

      expect(result.length).toBeGreaterThan(1);
      result.forEach(chunk => {
        expect(chunk.text.length).toBeLessThanOrEqual(750);
        expect(chunk.pageNumbers).toEqual([1]);
      });
    });

    it('should use default chunk size and overlap when not specified', () => {
      const pages: PageText[] = [
        { pageNumber: 1, text: 'A'.repeat(2000) },
      ];

      const result = chunkTextWithPages(pages);

      expect(result.length).toBeGreaterThan(1);
      // Default chunk size is 750
      result.forEach(chunk => {
        expect(chunk.text.length).toBeLessThanOrEqual(750);
      });
    });

    it('should create overlapping chunks', () => {
      const text = 'A'.repeat(1000);
      const pages: PageText[] = [{ pageNumber: 1, text }];

      const result = chunkTextWithPages(pages, 500, 100);

      expect(result.length).toBeGreaterThan(2);

      // Check overlap between consecutive chunks
      for (let i = 0; i < result.length - 1; i++) {
        const currentEnd = result[i].text.slice(-50);
        const nextStart = result[i + 1].text.slice(0, 50);

        // Should have some overlapping content
        expect(currentEnd).toBe(nextStart);
      }
    });

    it('should handle text smaller than chunk size', () => {
      const pages: PageText[] = [
        { pageNumber: 1, text: 'Short text' },
      ];

      const result = chunkTextWithPages(pages, 750, 150);

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('Short text');
      expect(result[0].pageNumbers).toEqual([1]);
    });

    it('should skip pages with no text', () => {
      const pages: PageText[] = [
        { pageNumber: 1, text: '' },
        { pageNumber: 2, text: 'Some content' },
        { pageNumber: 3, text: '' },
      ];

      const result = chunkTextWithPages(pages, 750, 150);

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('Some content');
      expect(result[0].pageNumbers).toEqual([2]);
    });

    it('should skip pages with only whitespace', () => {
      const pages: PageText[] = [
        { pageNumber: 1, text: '   \n\n   ' },
        { pageNumber: 2, text: 'Real content' },
      ];

      const result = chunkTextWithPages(pages, 750, 150);

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('Real content');
      expect(result[0].pageNumbers).toEqual([2]);
    });

    it('should trim whitespace from chunks', () => {
      const pages: PageText[] = [
        { pageNumber: 1, text: '   Content with spaces   ' },
      ];

      const result = chunkTextWithPages(pages, 750, 150);

      expect(result[0].text).toBe('Content with spaces');
      expect(result[0].text).not.toContain('   Content');
    });

    it('should handle multiple pages', () => {
      const pages: PageText[] = [
        { pageNumber: 1, text: 'Page 1 content' },
        { pageNumber: 2, text: 'Page 2 content' },
        { pageNumber: 3, text: 'Page 3 content' },
      ];

      const result = chunkTextWithPages(pages, 750, 150);

      expect(result).toHaveLength(3);
      expect(result[0].pageNumbers).toEqual([1]);
      expect(result[1].pageNumbers).toEqual([2]);
      expect(result[2].pageNumbers).toEqual([3]);
    });

    it('should handle zero overlap', () => {
      const pages: PageText[] = [
        { pageNumber: 1, text: 'A'.repeat(1000) },
      ];

      const result = chunkTextWithPages(pages, 500, 0);

      expect(result.length).toBe(2);
      expect(result[0].text.length).toBe(500);
      expect(result[1].text.length).toBe(500);
    });

    it('should handle overlap larger than chunk size', () => {
      const pages: PageText[] = [
        { pageNumber: 1, text: 'A'.repeat(2000) },
      ];

      // Overlap (800) > chunk size (500) should still work
      const result = chunkTextWithPages(pages, 500, 800);

      expect(result.length).toBeGreaterThan(0);
      result.forEach(chunk => {
        expect(chunk.text.length).toBeLessThanOrEqual(500);
      });
    });

    it('should handle exact chunk size match', () => {
      const pages: PageText[] = [
        { pageNumber: 1, text: 'A'.repeat(750) },
      ];

      const result = chunkTextWithPages(pages, 750, 150);

      expect(result).toHaveLength(1);
      expect(result[0].text.length).toBe(750);
    });

    it('should handle text with newlines and preserve them in chunks', () => {
      const pages: PageText[] = [
        { pageNumber: 1, text: 'Line 1\nLine 2\nLine 3\n'.repeat(100) },
      ];

      const result = chunkTextWithPages(pages, 500, 100);

      expect(result.length).toBeGreaterThan(1);
      result.forEach(chunk => {
        // Chunks may contain newlines
        expect(chunk.text).toBeDefined();
      });
    });

    it('should handle empty pages array', () => {
      const pages: PageText[] = [];

      const result = chunkTextWithPages(pages, 750, 150);

      expect(result).toEqual([]);
    });

    it('should handle very small chunk size', () => {
      const pages: PageText[] = [
        { pageNumber: 1, text: 'Short text here' },
      ];

      const result = chunkTextWithPages(pages, 5, 2);

      expect(result.length).toBeGreaterThan(1);
      result.forEach(chunk => {
        expect(chunk.text.length).toBeLessThanOrEqual(5);
      });
    });

    it('should associate chunks with correct page numbers for multiple pages', () => {
      const pages: PageText[] = [
        { pageNumber: 5, text: 'A'.repeat(1000) },
        { pageNumber: 10, text: 'B'.repeat(1000) },
      ];

      const result = chunkTextWithPages(pages, 500, 100);

      // First few chunks should be from page 5
      expect(result[0].pageNumbers).toEqual([5]);
      expect(result[0].text[0]).toBe('A');

      // Last few chunks should be from page 10
      const lastChunk = result[result.length - 1];
      expect(lastChunk.pageNumbers).toEqual([10]);
      expect(lastChunk.text[0]).toBe('B');
    });

    it('should handle text with mixed whitespace', () => {
      const pages: PageText[] = [
        { pageNumber: 1, text: 'Word1   Word2\t\tWord3\n\nWord4' },
      ];

      const result = chunkTextWithPages(pages, 750, 150);

      expect(result).toHaveLength(1);
      expect(result[0].text).toContain('Word1');
      expect(result[0].text).toContain('Word4');
    });

    it('should handle Unicode characters in chunks', () => {
      const pages: PageText[] = [
        { pageNumber: 1, text: '你好世界 '.repeat(500) },
      ];

      const result = chunkTextWithPages(pages, 750, 150);

      expect(result.length).toBeGreaterThan(1);
      result.forEach(chunk => {
        expect(chunk.text).toContain('你好世界');
      });
    });

    it('should skip empty trimmed chunks', () => {
      // Create text with large whitespace sections
      const pages: PageText[] = [
        { pageNumber: 1, text: 'Start' + ' '.repeat(1000) + 'End' },
      ];

      const result = chunkTextWithPages(pages, 500, 100);

      // All chunks should have some non-whitespace content after trimming
      result.forEach(chunk => {
        expect(chunk.text.length).toBeGreaterThan(0);
      });
    });

    it('should handle very long single line text', () => {
      const pages: PageText[] = [
        { pageNumber: 1, text: 'A'.repeat(50000) },
      ];

      const result = chunkTextWithPages(pages, 750, 150);

      expect(result.length).toBeGreaterThan(50);

      // Check all chunks
      result.forEach((chunk, index) => {
        expect(chunk.text.length).toBeLessThanOrEqual(750);
        expect(chunk.pageNumbers).toEqual([1]);
        expect(chunk.text).toMatch(/^A+$/);
      });
    });

    it('should handle chunk with exact overlap at end', () => {
      // Create text where overlap is exactly at boundary
      const pages: PageText[] = [
        { pageNumber: 1, text: 'A'.repeat(1200) },
      ];

      const result = chunkTextWithPages(pages, 750, 150);

      expect(result.length).toBeGreaterThan(1);
      expect(result[0].text.length).toBe(750);
    });

    it('should maintain correct chunk boundaries with custom sizes', () => {
      const pages: PageText[] = [
        { pageNumber: 1, text: 'X'.repeat(3000) },
      ];

      const result = chunkTextWithPages(pages, 1000, 200);

      expect(result.length).toBeGreaterThan(2);

      // Verify chunk sizes
      result.slice(0, -1).forEach(chunk => {
        expect(chunk.text.length).toBe(1000);
      });

      // Last chunk might be smaller
      expect(result[result.length - 1].text.length).toBeLessThanOrEqual(1000);
    });
  });

  describe('integration: extractPdfTextWithPages + chunkTextWithPages', () => {
    it('should extract and chunk PDF text end-to-end', async () => {
      const mockPdfBuffer = Buffer.from('fake pdf content');
      const longText = 'This is a sentence. '.repeat(200); // ~4000 chars
      const mockPdfData = {
        text: longText,
        numpages: 1,
        info: {},
        metadata: null,
        version: '1.7',
      };

      mockPdfParse.mockResolvedValue(mockPdfData);

      // Extract
      const pages = await extractPdfTextWithPages(mockPdfBuffer);
      expect(pages).toHaveLength(1);
      expect(pages[0].pageNumber).toBe(1);

      // Chunk
      const chunks = chunkTextWithPages(pages, 750, 150);
      expect(chunks.length).toBeGreaterThan(3);

      chunks.forEach(chunk => {
        expect(chunk.text.length).toBeLessThanOrEqual(750);
        expect(chunk.pageNumbers).toEqual([1]);
        expect(chunk.text).toContain('This is a sentence.');
      });
    });

    it('should handle empty PDF extraction and chunking', async () => {
      const mockPdfBuffer = Buffer.from('fake pdf content');
      const mockPdfData = {
        text: '',
        numpages: 1,
        info: {},
        metadata: null,
        version: '1.7',
      };

      mockPdfParse.mockResolvedValue(mockPdfData);

      const pages = await extractPdfTextWithPages(mockPdfBuffer);
      expect(pages).toEqual([]);

      const chunks = chunkTextWithPages(pages, 750, 150);
      expect(chunks).toEqual([]);
    });

    it('should handle small PDF that creates single chunk', async () => {
      const mockPdfBuffer = Buffer.from('fake pdf content');
      const mockPdfData = {
        text: 'Small PDF with minimal content.',
        numpages: 1,
        info: {},
        metadata: null,
        version: '1.7',
      };

      mockPdfParse.mockResolvedValue(mockPdfData);

      const pages = await extractPdfTextWithPages(mockPdfBuffer);
      const chunks = chunkTextWithPages(pages, 750, 150);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].text).toBe('Small PDF with minimal content.');
      expect(chunks[0].pageNumbers).toEqual([1]);
    });
  });

  describe('PageText interface', () => {
    it('should accept valid PageText objects', () => {
      const validPageText: PageText = {
        pageNumber: 1,
        text: 'Sample text',
      };

      expect(validPageText.pageNumber).toBe(1);
      expect(validPageText.text).toBe('Sample text');
    });

    it('should work with array of PageText', () => {
      const pages: PageText[] = [
        { pageNumber: 1, text: 'Page 1' },
        { pageNumber: 2, text: 'Page 2' },
      ];

      expect(pages).toHaveLength(2);
      expect(pages[0].pageNumber).toBe(1);
      expect(pages[1].text).toBe('Page 2');
    });
  });
});
