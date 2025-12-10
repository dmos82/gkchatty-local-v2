/* eslint-disable @typescript-eslint/no-unused-vars */
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'; // Import S3 client
import { UserDocument, IUserDocument } from '../models/UserDocument'; // Import UserDocument model and interface
import { SystemKbDocument, ISystemKbDocument } from '../models/SystemKbDocument'; // ADDED: Import SystemKbDocument and interface
import pdf from 'pdf-parse';
import mammoth from 'mammoth'; // Import mammoth for DOCX parsing
import { extractTextFromExcel } from './excelProcessor'; // Import Excel processor
import { processImageWithText, isSupportedImageType } from './imageProcessor'; // Import image processor
import { processAudioFile, isSupportedAudioType } from './audioProcessor'; // Import audio processor
import { processVideoFile, isSupportedVideoType } from './videoProcessor'; // Import video processor
import { generateEmbeddings } from './openaiHelper';
import { upsertVectors, PineconeVector } from './pineconeService'; // Import upsertVectors
import { v4 as uuidv4 } from 'uuid'; // For generating correlation ID if not provided
import { IngestionErrorCode } from '../types/errorCodes'; // For error handling
import path from 'path'; // Import path
import { KNOWLEDGE_BASE_S3_PREFIX } from '../config/storageConfig';
import { getSystemKbNamespace, getUserNamespace } from './pineconeNamespace';
import { RAG_CONFIG } from '../config/ragConfig';
// import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter'; // Remove or fix import

// Use centralized RAG configuration for consistency across the application
const MAX_CHUNK_SIZE = RAG_CONFIG.CHUNK_SIZE;
const CHUNK_OVERLAP = RAG_CONFIG.CHUNK_OVERLAP;

// S3 Client (assuming configured elsewhere or configure here)
// const s3Client = new S3Client({ region: process.env.AWS_REGION });

// Import getFileFromS3 helper (assuming it exists and is correctly configured)
import { getFileStream } from './s3Helper';
import { getLogger } from './logger';
import { socketService } from '../services/socketService';

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
 * Processes a document: fetches from S3, extracts text, splits, generates embeddings, and upserts to Pinecone.
 * Handles both 'user' and 'system' source types.
 * Updates document status in MongoDB.
 */
export const processAndEmbedDocument = async (
  documentId: string,
  s3Bucket: string,
  s3Key: string,
  sourceType: 'user' | 'system' | 'tenant',
  originalFileName: string, // Need original filename for logging/type check
  mimeType: string, // Need mimeType for type check
  userId?: string, // Optional: Only relevant for user documents
  reqId?: string, // Added optional reqId for improved logging correlation
  extractedText?: string, // Optional: Pre-extracted text from frontend OCR
  tenantKbId?: string // Optional: Only relevant for tenant documents
): Promise<void> => {
  const correlationId = reqId || uuidv4(); // Use provided reqId or generate a new one
  let errorCode: IngestionErrorCode | undefined = undefined;

  log.info(`[DocProcessor - ${correlationId}] === DOCUMENT PROCESSING START ===`);
  log.info(
    `[DocProcessor - ${correlationId}] Processing doc ID: ${documentId}, Type: ${sourceType}, User: ${userId || 'N/A'}, Filename: ${originalFileName}`
  );

  let docStatus: 'processing' | 'completed' | 'failed' = 'processing';
  let statusDetail = '';

  const updateDocStatus = async (
    update: Partial<IUserDocument | ISystemKbDocument> & {
      status: string;
      statusDetail: string;
      textContent?: string;
      totalChunks?: number;
      errorCode?: IngestionErrorCode;
    }
  ) => {
    log.info(
      `[DocProcessor - ${correlationId}] Updating document status to: ${update.status}, Detail: ${update.statusDetail}`
    );
    const updatePayload = { ...update };
    if (sourceType === 'system') {
      await SystemKbDocument.findByIdAndUpdate(documentId, updatePayload);
    } else {
      await UserDocument.findByIdAndUpdate(documentId, updatePayload);
    }
    log.info(`[DocProcessor - ${correlationId}] Document status update successful`);
  };

  try {
    log.info(`[DocProcessor - ${correlationId}] Setting initial status to 'processing'`);
    await updateDocStatus({ status: 'processing', statusDetail: 'Fetching from S3' });

    let s3KeyForFetching = s3Key;
    if (sourceType === 'system') {
      // Check if s3Key already has the prefix and extension
      if (!s3Key.startsWith(KNOWLEDGE_BASE_S3_PREFIX)) {
        // Legacy format: s3Key is just the UUID, need to add prefix and extension
        const fileExtension = path.extname(originalFileName);
        s3KeyForFetching = `${KNOWLEDGE_BASE_S3_PREFIX}${s3Key}${fileExtension}`;
        log.info(
          `[DocProcessor - ${correlationId}] Legacy format detected. Constructed S3 key: ${s3KeyForFetching}`
        );
      } else {
        // New format: s3Key already contains the full path
        s3KeyForFetching = s3Key;
        log.info(`[DocProcessor - ${correlationId}] Using existing S3 key: ${s3KeyForFetching}`);
      }
    }
    // For user documents, s3Key is already the full path.

    log.info(
      `[DocProcessor - ${correlationId}] Starting S3 file fetch from: s3://${s3Bucket}/${s3KeyForFetching}`
    );
    const fileStream = await getFileStream(s3KeyForFetching);
    log.info(`[DocProcessor - ${correlationId}] S3 file stream obtained successfully`);

    log.info(`[DocProcessor - ${correlationId}] Reading file stream into buffer`);
    const fileChunks: Buffer[] = [];
    for await (const chunk of fileStream) {
      fileChunks.push(Buffer.from(chunk));
    }
    const fileBuffer = Buffer.concat(fileChunks);
    log.info(
      `[DocProcessor - ${correlationId}] File buffer created successfully. Size: ${fileBuffer.length} bytes`
    );

    log.info(`[DocProcessor - ${correlationId}] Starting text extraction phase`);
    await updateDocStatus({ status: 'processing', statusDetail: 'Extracting text' });
    let fullText = '';

    // Handle missing mimeType for System KB documents
    let effectiveMimeType = mimeType;
    if (!mimeType && sourceType === 'system') {
      // Infer mimeType from filename for System KB documents
      const ext = path.extname(originalFileName).toLowerCase();
      if (ext === '.pdf') {
        effectiveMimeType = 'application/pdf';
        log.info(
          `[DocProcessor - ${correlationId}] No mimeType provided for system doc. Inferred from filename: application/pdf`
        );
      }
    }

    // Check file extension as fallback for MIME type detection
    const fileExt = path.extname(originalFileName).toLowerCase();
    const isMarkdownExt = fileExt === '.md' || fileExt === '.markdown';
    const isTextExt = fileExt === '.txt';
    const isPdfExt = fileExt === '.pdf';
    const isDocxExt = fileExt === '.docx';
    const isDocExt = fileExt === '.doc';

    const isPdf = effectiveMimeType === 'application/pdf' || isPdfExt;
    const isDocx = effectiveMimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || isDocxExt;
    const isDoc = effectiveMimeType === 'application/msword' || isDocExt;
    const isText = effectiveMimeType === 'text/plain' || effectiveMimeType === 'text/markdown' || isTextExt || isMarkdownExt;
    const isExcel =
      effectiveMimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      effectiveMimeType === 'application/vnd.ms-excel' ||
      effectiveMimeType === 'application/vnd.ms-excel.sheet.macroEnabled.12';
    const isImage = isSupportedImageType(effectiveMimeType);
    const isAudio = isSupportedAudioType(effectiveMimeType, originalFileName);
    const isVideo = isSupportedVideoType(effectiveMimeType, originalFileName);

    if (isPdf) {
      log.info(`[DocProcessor - ${correlationId}] Starting PDF parsing for ${originalFileName}`);
      try {
        const pdfData = await pdf(fileBuffer);
        fullText = pdfData.text?.trim() || '';
        log.info(
          `[DocProcessor - ${correlationId}] PDF parsing successful. Pages: ${pdfData.numpages || 'N/A'}. Text length: ${fullText.length} characters`
        );
      } catch (pdfError: any) {
        log.error(`[DocProcessor - ${correlationId}] PDF parsing FAILED:`, pdfError);
        errorCode = IngestionErrorCode.PDF_PARSE_FAILED;
        throw new Error(`Failed to parse PDF: ${pdfError.message}`);
      }
    } else if (isDocx) {
      log.info(`[DocProcessor - ${correlationId}] Starting DOCX parsing for ${originalFileName}`);
      try {
        const result = await mammoth.extractRawText({ buffer: fileBuffer });
        fullText = result.value?.trim() || '';
        log.info(
          `[DocProcessor - ${correlationId}] DOCX parsing successful. Text length: ${fullText.length} characters`
        );
        if (result.messages && result.messages.length > 0) {
          log.warn(`[DocProcessor - ${correlationId}] DOCX warnings:`, result.messages);
        }
      } catch (docxError: any) {
        log.error(`[DocProcessor - ${correlationId}] DOCX parsing FAILED:`, docxError);
        errorCode = IngestionErrorCode.UNKNOWN_PROCESSING_ERROR;
        throw new Error(`Failed to parse DOCX: ${docxError.message}`);
      }
    } else if (isDoc) {
      // .doc files (older Word format) - mammoth doesn't support them natively
      log.error(`[DocProcessor - ${correlationId}] DOC format (legacy Word) is not supported. Please convert to DOCX.`);
      errorCode = IngestionErrorCode.UNSUPPORTED_FILE_TYPE;
      throw new Error('DOC format (legacy Word) is not supported. Please convert to DOCX format.');
    } else if (isText) {
      log.info(`[DocProcessor - ${correlationId}] Extracting text from TXT/MD buffer`);
      fullText = fileBuffer.toString('utf-8');
      log.info(
        `[DocProcessor - ${correlationId}] Text extraction successful. Text length: ${fullText.length} characters`
      );
    } else if (isExcel) {
      log.info(`[DocProcessor - ${correlationId}] Starting Excel parsing for ${originalFileName}`);
      try {
        fullText = await extractTextFromExcel(fileBuffer);
        log.info(
          `[DocProcessor - ${correlationId}] Excel parsing successful. Text length: ${fullText.length} characters`
        );
      } catch (excelError: any) {
        log.error(`[DocProcessor - ${correlationId}] Excel parsing FAILED:`, excelError);
        errorCode = IngestionErrorCode.EXCEL_PARSE_FAILED;
        throw new Error(`Failed to parse Excel file: ${excelError.message}`);
      }
    } else if (isImage) {
      log.info(`[DocProcessor - ${correlationId}] Processing image for ${originalFileName}`);
      try {
        fullText = await processImageWithText(fileBuffer, extractedText || '', mimeType);
        log.info(
          `[DocProcessor - ${correlationId}] Image processing successful. Text length: ${fullText.length} characters`
        );
        if (!fullText) {
          log.warn(
            `[DocProcessor - ${correlationId}] No text extracted from image ${originalFileName}`
          );
        }
      } catch (imageError: any) {
        log.error(`[DocProcessor - ${correlationId}] Image processing FAILED:`, imageError);
        errorCode = IngestionErrorCode.IMAGE_PROCESS_FAILED;
        throw new Error(`Failed to process image: ${imageError.message}`);
      }
    } else if (isAudio) {
      log.info(`[DocProcessor - ${correlationId}] Processing audio for ${originalFileName}`);
      try {
        const audioResult = await processAudioFile(fileBuffer, originalFileName, {
          uploadDate: new Date(),
          fileSize: fileBuffer.length,
          userId,
          mimeType,
        });

        fullText = audioResult.transcriptionText;
        log.info(
          `[DocProcessor - ${correlationId}] Audio processing successful. Text length: ${fullText.length} characters`
        );

        // Store the generated DOCX in S3 (replace the original audio file)
        // The DOCX will be what users see when they view the document
        log.info(`[DocProcessor - ${correlationId}] Storing generated DOCX in S3`);
        const { uploadFile, deleteFile } = await import('./s3Helper');
        const docxKey = s3Key.replace(/\.[^/.]+$/, '.docx'); // Replace extension with .docx
        await uploadFile(audioResult.docxBuffer, docxKey, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

        // Update document record to reflect it's now a DOCX
        const updateData: any = {
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          originalFileName: audioResult.metadata.generatedFileName,
          s3Key: docxKey, // Update the s3Key to point to the DOCX
          file_extension: 'docx', // Update the file extension
        };

        if (sourceType === 'user') {
          await UserDocument.findByIdAndUpdate(documentId, updateData);
        } else {
          await SystemKbDocument.findByIdAndUpdate(documentId, updateData);
        }

        // Delete the original audio file from S3
        try {
          log.info(
            `[DocProcessor - ${correlationId}] Deleting original audio file from S3: ${s3Key}`
          );
          await deleteFile(s3Key);
          log.info(`[DocProcessor - ${correlationId}] Original audio file deleted successfully`);
        } catch (deleteError) {
          log.warn(
            `[DocProcessor - ${correlationId}] Failed to delete original audio file:`,
            deleteError
          );
          // Continue processing even if deletion fails
        }

        log.info(
          `[DocProcessor - ${correlationId}] Audio file converted to DOCX and stored successfully. New S3 key: ${docxKey}`
        );

        // Notify user via socket that document was processed (audio → DOCX)
        if (userId) {
          socketService.sendToUser(userId, 'document:processed', {
            documentId,
            originalFileName,
            newFileName: audioResult.metadata.generatedFileName,
            type: 'audio_transcription',
          });
          log.debug(`[DocProcessor - ${correlationId}] Sent document:processed socket event to user ${userId}`);
        }

        if (!fullText) {
          log.warn(
            `[DocProcessor - ${correlationId}] No text extracted from audio ${originalFileName}`
          );
        }
      } catch (audioError: any) {
        log.error(`[DocProcessor - ${correlationId}] Audio processing FAILED:`, audioError);
        errorCode = IngestionErrorCode.AUDIO_PROCESS_FAILED;
        throw new Error(`Failed to process audio: ${audioError.message}`);
      }
    } else if (isVideo) {
      log.info(`[DocProcessor - ${correlationId}] Processing video for ${originalFileName}`);
      try {
        const videoResult = await processVideoFile(fileBuffer, originalFileName, {
          uploadDate: new Date(),
          fileSize: fileBuffer.length,
          userId,
          mimeType,
        });

        fullText = videoResult.transcriptionText;
        log.info(
          `[DocProcessor - ${correlationId}] Video processing successful. Text length: ${fullText.length} characters`
        );

        // Store the generated DOCX in S3 (replace the original video file)
        log.info(`[DocProcessor - ${correlationId}] Storing generated DOCX in S3`);
        const { uploadFile, deleteFile } = await import('./s3Helper');
        const docxKey = s3Key.replace(/\.[^/.]+$/, '.docx'); // Replace extension with .docx
        await uploadFile(videoResult.docxBuffer, docxKey, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

        // Update document record to reflect it's now a DOCX
        const updateData: any = {
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          originalFileName: videoResult.metadata.generatedFileName,
          s3Key: docxKey, // Update the s3Key to point to the DOCX
          file_extension: 'docx', // Update the file extension
        };

        if (sourceType === 'user') {
          await UserDocument.findByIdAndUpdate(documentId, updateData);
        } else {
          await SystemKbDocument.findByIdAndUpdate(documentId, updateData);
        }

        // Delete the original video file from S3
        try {
          log.info(
            `[DocProcessor - ${correlationId}] Deleting original video file from S3: ${s3Key}`
          );
          await deleteFile(s3Key);
          log.info(`[DocProcessor - ${correlationId}] Original video file deleted successfully`);
        } catch (deleteError) {
          log.warn(
            `[DocProcessor - ${correlationId}] Failed to delete original video file:`,
            deleteError
          );
          // Continue processing even if deletion fails
        }

        log.info(
          `[DocProcessor - ${correlationId}] Video file converted to DOCX and stored successfully. New S3 key: ${docxKey}`
        );

        // Notify user via socket that document was processed (video → DOCX)
        if (userId) {
          socketService.sendToUser(userId, 'document:processed', {
            documentId,
            originalFileName,
            newFileName: videoResult.metadata.generatedFileName,
            type: 'video_transcription',
          });
          log.debug(`[DocProcessor - ${correlationId}] Sent document:processed socket event to user ${userId}`);
        }

        if (!fullText) {
          log.warn(
            `[DocProcessor - ${correlationId}] No text extracted from video ${originalFileName}`
          );
        }
      } catch (videoError: any) {
        log.error(`[DocProcessor - ${correlationId}] Video processing FAILED:`, videoError);
        errorCode = IngestionErrorCode.VIDEO_PROCESS_FAILED;
        throw new Error(`Failed to process video: ${videoError.message}`);
      }
    } else {
      log.error(
        `[DocProcessor - ${correlationId}] Unsupported file type: ${effectiveMimeType || mimeType}`
      );
      errorCode = IngestionErrorCode.UNSUPPORTED_FILE_TYPE;
      throw new Error(`Unsupported file type (${effectiveMimeType || mimeType})`);
    }

    if (!fullText) {
      log.warn(`[DocProcessor - ${correlationId}] No text content extracted from document`);
      docStatus = 'failed';
      statusDetail = 'No text content could be extracted from the document.';
      errorCode = IngestionErrorCode.NO_TEXT_EXTRACTED;
      throw new Error(statusDetail);
    }

    log.info(`[DocProcessor - ${correlationId}] Starting text chunking phase`);
    await updateDocStatus({
      status: 'processing',
      statusDetail: 'Chunking text',
      textContent: fullText,
    });
    log.info(
      `[DocProcessor - ${correlationId}] Creating text chunks with size: ${MAX_CHUNK_SIZE}, overlap: ${CHUNK_OVERLAP}`
    );
    const textChunks: string[] = [];
    for (let i = 0; i < fullText.length; i += MAX_CHUNK_SIZE - CHUNK_OVERLAP) {
      const chunk = fullText.substring(i, i + MAX_CHUNK_SIZE);
      if (chunk.trim()) {
        textChunks.push(chunk);
        // Log chunk details for debugging RAG retrieval issues
        log.info(
          `[DocProcessor - ${correlationId}] Chunk ${textChunks.length - 1} (chars ${i}-${i + chunk.length}): "${chunk.substring(0, 100)}..."`
        );
        // Log if chunk contains potential contact info patterns
        if (chunk.match(/(?:email|mail|@|phone|tel|contact)/i)) {
          log.info(
            `[DocProcessor - ${correlationId}] ⚠️ Chunk ${textChunks.length - 1} contains potential contact information`
          );
        }
      }
    }
    log.info(
      `[DocProcessor - ${correlationId}] Text chunking successful. Created: ${textChunks.length} chunks`
    );

    if (textChunks.length === 0 && fullText.length > 0) {
      log.warn(
        `[DocProcessor - ${correlationId}] Text chunking resulted in 0 chunks, though text was present`
      );
      docStatus = 'failed';
      statusDetail = 'Document text could not be split into processable chunks.';
      errorCode = IngestionErrorCode.NO_TEXT_EXTRACTED;
      throw new Error(statusDetail);
    }

    log.info(`[DocProcessor - ${correlationId}] Starting embedding generation phase`);
    await updateDocStatus({
      status: 'processing',
      statusDetail: `Generating ${textChunks.length} embeddings`,
    });
    log.info(
      `[DocProcessor - ${correlationId}] Requesting embeddings for ${textChunks.length} chunks`
    );
    let embeddings: number[][] = [];
    try {
      embeddings = await generateEmbeddings(textChunks);
      log.info(
        `[DocProcessor - ${correlationId}] Embeddings generated successfully for ${textChunks.length} chunks`
      );
    } catch (embedError: any) {
      log.error(`[DocProcessor - ${correlationId}] Embedding generation FAILED:`, embedError);
      errorCode = IngestionErrorCode.OPENAI_EMBEDDING_FAILED;
      throw new Error(`OpenAI embedding generation failed: ${embedError.message}`);
    }

    if (embeddings.length !== textChunks.length) {
      log.error(
        `[DocProcessor - ${correlationId}] Chunk/embedding count mismatch. Chunks: ${textChunks.length}, Embeddings: ${embeddings.length}`
      );
      errorCode = IngestionErrorCode.CHUNK_EMBEDDING_MISMATCH;
      throw new Error(
        `Mismatch between chunk count (${textChunks.length}) and embedding count (${embeddings.length})`
      );
    }

    log.info(`[DocProcessor - ${correlationId}] Starting Pinecone upsert phase`);
    await updateDocStatus({
      status: 'processing',
      statusDetail: `Upserting ${textChunks.length} vectors`,
      totalChunks: textChunks.length,
    });
    log.info(
      `[DocProcessor - ${correlationId}] Preparing ${textChunks.length} vectors for Pinecone upsert`
    );
    const vectors: PineconeVector[] = textChunks.map((chunkText, index) => {
      type BaseVectorMetadata = {
        documentId: string;
        originalFileName: string;
        sourceType: 'user' | 'system' | 'tenant';
        chunkIndex: number;
        text: string;
        tenantKbId?: string;
      };
      const baseMetadata: BaseVectorMetadata = {
        documentId: documentId,
        originalFileName: originalFileName,
        sourceType: sourceType,
        chunkIndex: index,
        text: chunkText,
      };

      // Add tenantKbId to metadata if provided and source is a tenant document
      if (sourceType === 'tenant' && tenantKbId) {
        baseMetadata.tenantKbId = tenantKbId;
      }

      // Add userId to metadata for user documents
      const finalMetadata =
        (sourceType === 'user' || sourceType === 'tenant') && userId
          ? { ...baseMetadata, userId: userId }
          : baseMetadata;
      return {
        id: `${documentId}_chunk_${index}`,
        values: embeddings[index],
        metadata: finalMetadata,
      };
    });

    // Determine the correct Pinecone namespace using the utility
    let targetNamespace: string;
    if (sourceType === 'system' || sourceType === 'tenant') {
      targetNamespace = getSystemKbNamespace();
    } else if (sourceType === 'user' && userId) {
      targetNamespace = getUserNamespace(userId);
    } else {
      log.error(
        `[DocProcessor - ${correlationId}] Invalid configuration: Could not determine namespace.`,
        { sourceType, userId, documentId }
      );
      errorCode = IngestionErrorCode.NAMESPACE_ERROR;
      throw new Error('Could not determine target namespace for document processing.');
    }

    log.info(
      `[DocProcessor - ${correlationId}] Upserting ${vectors.length} vectors to Pinecone namespace: "${targetNamespace}"`
    );
    await updateDocStatus({
      status: 'processing',
      statusDetail: `Embedding complete. Upserting to Pinecone namespace: ${targetNamespace}.`,
      totalChunks: textChunks.length,
    });

    // Upsert vectors to Pinecone
    await upsertVectors(vectors, targetNamespace);

    log.info(`[DocProcessor - ${correlationId}] Pinecone upsert successful`);

    docStatus = 'completed';
    statusDetail = 'Document processed and embedded successfully.';
    errorCode = undefined;
  } catch (error: any) {
    log.error(`[DocProcessor - ${correlationId}] Document processing FAILED:`, error);
    docStatus = 'failed';
    statusDetail = error.message || 'An unknown processing error occurred.';
    if (!errorCode) {
      errorCode = IngestionErrorCode.UNKNOWN_PROCESSING_ERROR;
    }
  } finally {
    log.info(
      `[DocProcessor - ${correlationId}] Saving document metadata to MongoDB. Final status: ${docStatus}, Detail: ${statusDetail}, ErrorCode: ${errorCode || 'N/A'}`
    );
    const finalUpdate: Partial<IUserDocument | ISystemKbDocument> & {
      status: string;
      statusDetail: string;
      errorCode?: IngestionErrorCode;
    } = {
      status: docStatus,
      statusDetail: statusDetail,
      errorCode: errorCode,
    };

    try {
      if (sourceType === 'system') {
        await SystemKbDocument.findByIdAndUpdate(documentId, finalUpdate);
      } else {
        await UserDocument.findByIdAndUpdate(documentId, finalUpdate);
      }
      log.info(
        `[DocProcessor - ${correlationId}] Document metadata saved to MongoDB successfully. Doc ID: ${documentId}`
      );
    } catch (dbUpdateError: any) {
      log.error(`[DocProcessor - ${correlationId}] MongoDB metadata save FAILED:`, dbUpdateError);
    }

    log.info(`[DocProcessor - ${correlationId}] === DOCUMENT PROCESSING END ===`);
  }
};

log.debug('[DocumentProcessor] Module loaded.');
