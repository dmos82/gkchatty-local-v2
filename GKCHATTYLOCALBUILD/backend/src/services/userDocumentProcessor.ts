/* eslint-disable @typescript-eslint/no-unused-vars */
import { processAndEmbedDocument } from '../utils/documentProcessor';
import { upsertVectors, PineconeVector, queryVectors } from '../utils/pineconeService';
import { UserDocumentModel as UserDocument } from '../utils/modelFactory';
import { v4 as uuidv4 } from 'uuid';
import { IngestionErrorCode } from '../types/errorCodes';
import { getLogger } from '../utils/logger';

const log = getLogger('userDocumentProcessor');

/**
 * Processes a user‑uploaded document from S3: fetches content, extracts text, chunks, embeds, indexes to Pinecone,
 * and updates the corresponding MongoDB `UserDocument` record.
 *
 * @param documentId  MongoDB _id of the UserDocument record.
 * @param s3Bucket    S3 bucket where the file is stored.
 * @param s3Key       S3 key (path) of the file.
 * @param userId      Uploader's userId (string).
 * @param reqId       Optional request ID for improved logging correlation.
 */
export async function processUserDocument(
  documentId: string,
  s3Bucket: string,
  s3Key: string,
  userId: string,
  reqId?: string,
  extractedText?: string
): Promise<void> {
  const correlationId = reqId || uuidv4();
  log.debug(
    `>>> BACKGROUND PROCESSING STARTED for document ID: ${documentId} (Corr ID: ${correlationId})`
  );

  try {
    log.debug(
      `[UserDocProcessor S3 - START CorrID: ${correlationId}] Processing doc ${documentId} for user ${userId}. S3: s3://${s3Bucket}/${s3Key}`
    );

    try {
      await UserDocument.findByIdAndUpdate(documentId, {
        status: 'processing',
        processingError: null,
      });
      log.debug(
        `[UserDocProcessor S3 - ${documentId} CorrID: ${correlationId}] Status set to 'processing'.`
      );
    } catch (updateErr) {
      log.error(
        `[UserDocProcessor S3 - ${documentId} CorrID: ${correlationId}] Pre-check: Failed to set status to 'processing':`,
        updateErr
      );
    }

    let docRecord;
    try {
      // 1. Fetch document metadata (including mimeType)
      log.debug(
        `[UserDocProcessor S3 - ${documentId} CorrID: ${correlationId}] Fetching document metadata...`
      );
      docRecord = await UserDocument.findById(documentId).select('originalFileName mimeType');
      if (!docRecord) {
        throw new Error(`Document metadata ${documentId} not found during processing.`);
      }
      if (!docRecord.mimeType) {
        log.error(
          `[UserDocProcessor S3 - ${documentId} CorrID: ${correlationId}] Document metadata is missing required mimeType. Cannot process.`
        );
        throw new Error(`Document metadata ${documentId} is missing mimeType.`);
      }
      log.debug(
        `[UserDocProcessor S3 - ${documentId} CorrID: ${correlationId}] Fetched metadata. Original Filename: ${docRecord.originalFileName}, MimeType: ${docRecord.mimeType}`
      );

      // 2. Call processAndEmbedDocument (Handles S3 fetch, processing, upsert, status updates)
      try {
        log.debug(
          `[UserDocProcessor S3 - ${documentId} CorrID: ${correlationId}] Calling processAndEmbedDocument...`
        );
        await processAndEmbedDocument(
          documentId,
          s3Bucket,
          s3Key,
          'user',
          docRecord.originalFileName,
          docRecord.mimeType,
          userId,
          correlationId,
          extractedText
        );
        log.debug(
          `[UserDocProcessor S3 - ${documentId} CorrID: ${correlationId}] processAndEmbedDocument call completed (final status handled internally).`
        );
      } catch (processingError) {
        log.error(
          `[UserDocProcessor S3 - ${documentId} CorrID: ${correlationId}] processAndEmbedDocument call FAILED.`,
          processingError
        );
        throw processingError;
      }
    } catch (processingError: any) {
      log.error(
        `[UserDocProcessor S3 - INNER CATCH ERROR CorrID: ${correlationId}] Processing failed for document ${documentId}:`,
        processingError
      );
      throw processingError;
    }
  } catch (error: any) {
    log.error(
      `>>> FATAL ERROR in background processing for doc ID: ${documentId} (Corr ID: ${correlationId})`,
      error
    );
    log.error('>>> Error Message:', error.message);
    log.error('>>> Error Name:', error.name);
    log.error('>>> Error Stack:', error.stack);
    try {
      await UserDocument.findByIdAndUpdate(documentId, {
        status: 'failed',
        processingError: error.message || 'Unknown processing error',
        errorCode: error.errorCode || IngestionErrorCode.UNKNOWN_PROCESSING_ERROR,
      });
      log.debug(
        `>>> Set document status to FAILED for doc ID: ${documentId} (Corr ID: ${correlationId})`
      );
    } catch (updateError) {
      log.error(
        `>>> FAILED TO UPDATE STATUS to failed for doc ID: ${documentId} (Corr ID: ${correlationId})`,
        updateError
      );
    }
  }
}
