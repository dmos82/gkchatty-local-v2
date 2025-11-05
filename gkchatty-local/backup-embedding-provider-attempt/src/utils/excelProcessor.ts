import xlsx from 'node-xlsx';
import { getLogger } from './logger';

const log = getLogger('excelProcessor');

/**
 * Extract text content from Excel files (.xlsx, .xls)
 * @param buffer Excel file buffer
 * @returns Promise resolving to extracted text content
 */
export const extractTextFromExcel = async (buffer: Buffer): Promise<string> => {
  log.debug('[ExcelProcessor] Starting Excel text extraction...');

  try {
    // Parse the Excel file
    const workbook = xlsx.parse(buffer) as Array<{ name: string; data: any[][] }>;
    log.debug(`[ExcelProcessor] Parsed workbook with ${workbook.length} sheet(s)`);

    let extractedText = '';

    // Process each worksheet
    workbook.forEach((worksheet: { name: string; data: any[][] }, sheetIndex: number) => {
      const { name, data } = worksheet;
      log.debug(
        `[ExcelProcessor] Processing sheet ${sheetIndex + 1}: "${name}" with ${data.length} rows`
      );

      // Add sheet header for multi-sheet workbooks
      if (workbook.length > 1) {
        extractedText += `\n=== Sheet: ${name} ===\n`;
      }

      // Process each row
      data.forEach((row: any[]) => {
        if (Array.isArray(row) && row.length > 0) {
          // Convert row cells to text, handling different data types
          const rowText = row
            .map(cell => {
              if (cell === null || cell === undefined) return '';
              if (typeof cell === 'string') return cell.trim();
              if (typeof cell === 'number') return cell.toString();
              if (typeof cell === 'boolean') return cell.toString();
              if (cell instanceof Date) return cell.toISOString().split('T')[0]; // YYYY-MM-DD format
              return String(cell).trim();
            })
            .filter(cellText => cellText.length > 0) // Remove empty cells
            .join(' | '); // Separate cells with pipe for structure

          if (rowText.length > 0) {
            extractedText += rowText + '\n';
          }
        }
      });

      extractedText += '\n'; // Add spacing between sheets
    });

    const finalText = extractedText.trim();
    log.debug(
      `[ExcelProcessor] Successfully extracted ${finalText.length} characters from Excel file`
    );

    if (finalText.length === 0) {
      throw new Error('No text content found in Excel file');
    }

    return finalText;
  } catch (error) {
    log.error('[ExcelProcessor] Error extracting text from Excel:', error);
    throw new Error(
      `Failed to extract text from Excel file: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};
