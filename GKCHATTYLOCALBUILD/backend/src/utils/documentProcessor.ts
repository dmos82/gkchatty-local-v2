/* eslint-disable @typescript-eslint/no-unused-vars */
// LOCAL MODE: Document processor simplified for local-only operation
// - No vector embeddings
// - No external services (Pinecone, OpenAI, etc.)
// - Just text extraction + database storage
import { UserDocumentModel as UserDocument, IUserDocument } from '../utils/modelFactory';
import { SystemKbDocumentModel as SystemKbDocument, ISystemKbDocument } from '../utils/modelFactory';
import pdf from 'pdf-parse';
import { extractTextFromExcel } from './excelProcessor';
import { processImageWithText, isSupportedImageType } from './imageProcessor';
import { processAudioFile, isSupportedAudioType } from './audioProcessor';
import { processVideoFile, isSupportedVideoType } from './videoProcessor';
import { v4 as uuidv4 } from 'uuid';
import { IngestionErrorCode } from '../types/errorCodes';
import path from 'path';

// Storage interface - abstracts S3 and local filesystem
import storage from './storageInterface';
import { getLogger } from './logger';

const log = getLogger('documentProcessor');

/**
 * Extract text from a PDF buffer
 * @param pdfBuffer The PDF file as a Buffer
 * @returns Promise resolving to the extracted text
 */
export const extractTextFromPdf = async (pdfBuffer: Buffer): Promise<string> => {
  log.debug('[DocumentProcessor] Extracting text from PDF buffer...');
  try {
    const pdfData = await pdf(pdfBuffer);
    const extractedText = pdfData.text?.trim() || '';
    log.debug(
      `[DocumentProcessor] Successfully extracted ${extractedText.length} characters from PDF`
    );
    return extractedText;
  } catch (error) {
    log.error('[DocumentProcessor] Error extracting text from PDF:', error);
    throw new Error(
      `Failed to extract text from PDF: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

/**
 * LOCAL MODE: Simplified document processor
 * - Fetches document metadata from database
 * - Extracts text from local file
 * - Stores text in database
 * - Marks document as completed
 * - NO vector embeddings
 * - NO external services
 */
export const processAndEmbedDocument = async (
  documentId: string,
  userId?: string | null
): Promise<void> => {
  const correlationId = uuidv4();

  log.info(`[DocProcessor - ${correlationId}] === LOCAL MODE DOCUMENT PROCESSING START ===`);
  log.info(`[DocProcessor - ${correlationId}] Processing doc ID: ${documentId}, User: ${userId || 'system'}`);

  try {
    // Step 1: Fetch document from database to get metadata
    log.info(`[DocProcessor - ${correlationId}] Fetching document metadata from database`);

    const document = userId
      ? await UserDocument.findById(documentId)
      : await SystemKbDocument.findById(documentId);

    if (!document) {
      throw new Error(`Document not found: ${documentId}`);
    }

    log.info(`[DocProcessor - ${correlationId}] Document found: ${document.originalFileName}`);

    // Step 2: Update status to processing
    document.status = 'processing';
    document.statusDetail = 'Extracting text from file';
    await document.save();
    log.info(`[DocProcessor - ${correlationId}] Status updated to processing`);

    // Step 3: Fetch file from local storage
    const s3Key = document.s3Key;
    log.info(`[DocProcessor - ${correlationId}] Fetching file from local storage: ${s3Key}`);

    const fileStream = await storage.getFileStream(s3Key);
    log.info(`[DocProcessor - ${correlationId}] File stream obtained successfully`);

    // Step 4: Read file into buffer
    log.info(`[DocProcessor - ${correlationId}] Reading file stream into buffer`);
    const fileChunks: Buffer[] = [];
    for await (const chunk of fileStream) {
      fileChunks.push(Buffer.from(chunk));
    }
    const fileBuffer = Buffer.concat(fileChunks);
    log.info(
      `[DocProcessor - ${correlationId}] File buffer created. Size: ${fileBuffer.length} bytes`
    );

    // Step 5: Extract text based on file type
    log.info(`[DocProcessor - ${correlationId}] Starting text extraction`);
    let fullText = '';

    const mimeType = document.mimeType;
    const originalFileName = document.originalFileName;
    const fileExt = path.extname(originalFileName).toLowerCase();

    // Determine file type
    const isPdf = mimeType === 'application/pdf' || fileExt === '.pdf';
    const isText = mimeType === 'text/plain' || mimeType === 'text/markdown' || fileExt === '.txt' || fileExt === '.md';
    const isExcel =
      mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      mimeType === 'application/vnd.ms-excel';

    if (isPdf) {
      log.info(`[DocProcessor - ${correlationId}] Extracting text from PDF`);
      try {
        const pdfData = await pdf(fileBuffer);
        fullText = pdfData.text?.trim() || '';
        log.info(
          `[DocProcessor - ${correlationId}] PDF text extracted: ${fullText.length} characters`
        );
      } catch (pdfError: any) {
        log.error(`[DocProcessor - ${correlationId}] PDF extraction failed:`, pdfError);
        throw new Error(`Failed to extract PDF text: ${pdfError.message}`);
      }
    } else if (isText) {
      log.info(`[DocProcessor - ${correlationId}] Extracting text from TXT/MD file`);
      fullText = fileBuffer.toString('utf-8');
      log.info(
        `[DocProcessor - ${correlationId}] Text extracted: ${fullText.length} characters`
      );
    } else if (isExcel) {
      log.info(`[DocProcessor - ${correlationId}] Extracting text from Excel file`);
      try {
        fullText = await extractTextFromExcel(fileBuffer);
        log.info(
          `[DocProcessor - ${correlationId}] Excel text extracted: ${fullText.length} characters`
        );
      } catch (excelError: any) {
        log.error(`[DocProcessor - ${correlationId}] Excel extraction failed:`, excelError);
        throw new Error(`Failed to extract Excel text: ${excelError.message}`);
      }
    } else {
      log.warn(
        `[DocProcessor - ${correlationId}] Unsupported file type: ${mimeType}. Marking as completed without text extraction.`
      );
      fullText = '';
    }

    // Step 6: Save text to database and mark as completed
    log.info(`[DocProcessor - ${correlationId}] Saving extracted text to database`);

    document.textContent = fullText;
    document.status = 'completed';
    document.statusDetail = 'Text extraction completed successfully';
    document.errorCode = undefined;
    await document.save();

    log.info(
      `[DocProcessor - ${correlationId}] Document processing completed successfully. Extracted ${fullText.length} characters.`
    );
    log.info(`[DocProcessor - ${correlationId}] === LOCAL MODE DOCUMENT PROCESSING END ===`);
  } catch (error: any) {
    log.error(`[DocProcessor - ${correlationId}] Document processing FAILED:`, error);

    // Update document status to failed
    try {
      const document = userId
        ? await UserDocument.findById(documentId)
        : await SystemKbDocument.findById(documentId);

      if (document) {
        document.status = 'failed';
        document.statusDetail = error.message || 'Unknown processing error';
        document.errorCode = IngestionErrorCode.UNKNOWN_PROCESSING_ERROR;
        await document.save();
      }
    } catch (dbError) {
      log.error(`[DocProcessor - ${correlationId}] Failed to update document status:`, dbError);
    }

    log.info(`[DocProcessor - ${correlationId}] === LOCAL MODE DOCUMENT PROCESSING END (FAILED) ===`);
    throw error;
  }
};

log.debug('[DocumentProcessor] Module loaded (LOCAL MODE)');
