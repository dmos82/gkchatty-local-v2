import pdf from 'pdf-parse';
import { getLogger } from './logger';
import { RAG_CONFIG } from '../config/ragConfig';

const log = getLogger('pdfUtils');

export interface PageText {
  pageNumber: number;
  text: string;
}

/**
 * Custom render callback for pdf-parse that preserves page numbers
 */
export function renderPageWithNumber(pageData: any): Promise<string> {
  const renderOptions = {
    normalizeWhitespace: false,
    disableCombineTextItems: false,
  };

  return pageData.getTextContent(renderOptions).then((textContent: any) => {
    let lastY: number | undefined;
    let text = '';

    for (const item of textContent.items) {
      if (lastY === item.transform[5] || !lastY) {
        text += item.str;
      } else {
        text += '\\n' + item.str;
      }
      lastY = item.transform[5];
    }

    return text;
  });
}

/**
 * Extracts text from a PDF buffer using pdf-parse.
 * Returns text mapped to page numbers (though pdf-parse v1 doesn't easily separate pages).
 * For simplicity, it returns an array containing one entry with the full text and page 1.
 * Callers might need adjustment if page-specific chunking was relying on the previous structure.
 */
export async function extractPdfTextWithPages(pdfBuffer: Buffer): Promise<PageText[]> {
  log.debug('[pdfUtils] Extracting PDF text using pdf-parse...');
  try {
    const data = await pdf(pdfBuffer);
    // pdf-parse combines text. Return as single page for consistency with interface.
    const text = data.text?.trim() || '';
    log.debug(
      `[pdfUtils] pdf-parse extracted text. Length: ${text.length}, Pages: ${data.numpages}`
    );
    if (text) {
      return [{ pageNumber: 1, text: text }]; // Return full text as page 1
    } else {
      return [];
    }
  } catch (error: unknown) {
    log.error('[pdfUtils] Error extracting PDF text with pdf-parse:', error);
    throw new Error(
      `Failed to extract text using pdf-parse: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Chunks text while preserving page number information (Now expects PageText[] structure).
 * Uses centralized RAG configuration for default chunk size and overlap.
 */
export function chunkTextWithPages(
  pages: PageText[],
  chunkSize: number = RAG_CONFIG.PDF_CHUNK_SIZE,
  overlap: number = RAG_CONFIG.CHUNK_OVERLAP
): { text: string; pageNumbers: number[] }[] {
  const chunks: { text: string; pageNumbers: number[] }[] = [];

  // Process potentially multiple pages (though pdf-parse currently provides only one)
  pages.forEach(({ pageNumber, text }) => {
    if (!text) return; // Skip pages with no text
    let i = 0;
    while (i < text.length) {
      const end = Math.min(i + chunkSize, text.length);
      const chunk = text.substring(i, end);

      if (chunk.trim()) {
        chunks.push({
          text: chunk.trim(),
          pageNumbers: [pageNumber], // Associate with the current page number
        });
      }

      i += chunkSize - overlap;
      if (i < overlap && end === text.length) break;
      if (i >= end) i = end;
    }
  });

  return chunks;
}
