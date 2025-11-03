/* eslint-disable no-await-in-loop */
import dotenv from 'dotenv';
dotenv.config({ path: '../../.env' }); // Load from root .env

import { ChromaClient, Collection, OpenAIEmbeddingFunction, Metadata } from 'chromadb';
import * as fs from 'fs/promises';
import path from 'path';
/* eslint-disable @typescript-eslint/no-unused-vars */
import { v4 as uuidv4 } from 'uuid';
import {
  extractPdfTextWithPages,
  chunkTextWithPages,
  renderPageWithNumber,
} from '../utils/pdfUtils';
import pdf from 'pdf-parse';
import { connectDB, disconnectDB } from '../utils/mongoHelper'; // Added: MongoDB connection helpers
import { UserDocument } from '../models/UserDocument'; // Added: UserDocument model
import { processAndEmbedDocument } from '../utils/documentProcessor'; // Ensure correct path
import { KNOWLEDGE_BASE_S3_PREFIX } from '../config/storageConfig'; // <-- Import centralized config
import { RAG_CONFIG } from '../config/ragConfig';

// --- Configuration ---
const CHROMA_URL = process.env.CHROMA_URL || 'http://localhost:8000';
const COLLECTION_NAME = 'system_knowledge';
// Use OpenAI API key and embedding model from environment
const API_KEY = process.env.OPENAI_API_KEY;
const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
console.log(`[LoadScript] Using OpenAI key for embeddings with model: ${EMBEDDING_MODEL}`);
// Use centralized RAG configuration for consistency
const CHUNK_SIZE = RAG_CONFIG.CHUNK_SIZE;
const CHUNK_OVERLAP = RAG_CONFIG.CHUNK_OVERLAP;

// Type definitions for document processing
interface DocumentChunk {
  text: string;
  pageNumbers: number[];
}

type ChunkMetadata = Metadata & {
  fileName: string;
  chunkIndex: number;
  sourcePath: string;
  pageNumbers: string; // Store as JSON string to comply with ChromaDB metadata requirements
  uuid: string;
  uploadTimestamp: string;
  [key: string]: unknown; // Required by ChromaDB's Metadata type
};

interface ChunkData {
  ids: string[];
  documents: string[];
  metadatas: ChunkMetadata[];
}

// --- Helper Functions ---

/**
 * Enhanced PDF text extraction that ensures proper page separation
 */
async function extractPdfTextWithPagesEnhanced(
  pdfBuffer: Buffer
): Promise<{ pageNumber: number; text: string }[]> {
  const pageTexts: { pageNumber: number; text: string }[] = [];

  try {
    // First extract basic PDF information to get page count
    const data = await pdf(pdfBuffer);
    const pageCount = data.numpages;

    console.log(`[LoadScript] PDF has ${pageCount} pages total`);

    // Initialize an array to collect rendered page texts
    const pageContents: string[] = [];
    let currentPageNum = 0;

    // Create a single parsing operation with a custom renderer that tracks pages
    const result = await pdf(pdfBuffer, {
      // Custom page renderer that captures each page's text separately
      pagerender: async (pageData: any) => {
        currentPageNum++;
        console.log(`[LoadScript] Rendering page ${currentPageNum}/${pageCount}`);

        // Use the renderPageWithNumber function from pdfUtils
        const pageText = await renderPageWithNumber(pageData);
        pageContents.push(pageText);

        // Return the text to satisfy the interface
        return pageText;
      },
    });

    // Process each collected page text
    pageContents.forEach((text, index) => {
      const trimmedText = text.trim();
      if (trimmedText) {
        pageTexts.push({
          pageNumber: index + 1,
          text: trimmedText,
        });
      }
    });

    console.log(`[LoadScript] Successfully collected text from ${pageTexts.length} pages`);
  } catch (error) {
    console.error('[LoadScript] Error in PDF extraction:', error);
  }

  return pageTexts;
}

/**
 * Extracts text content from PDF or TXT file with page numbers.
 */
async function extractTextFromFile(filePath: string): Promise<DocumentChunk[]> {
  const fileExtension = path.extname(filePath).toLowerCase();
  try {
    console.log(`[LoadScript] Processing ${fileExtension} file: ${path.basename(filePath)}`);
    const buffer = await fs.readFile(filePath);

    if (fileExtension === '.pdf') {
      console.log('[LoadScript] Extracting text with page numbers from PDF...');
      const pages = await extractPdfTextWithPagesEnhanced(buffer);
      console.log(`[LoadScript] Successfully extracted ${pages.length} pages from PDF`);
      return chunkTextWithPages(pages, CHUNK_SIZE, CHUNK_OVERLAP);
    } else if (fileExtension === '.txt') {
      console.log('[LoadScript] Processing TXT file with default page number [1]');
      const text = buffer.toString('utf-8');
      return chunkTextWithPages([{ pageNumber: 1, text }], CHUNK_SIZE, CHUNK_OVERLAP);
    } else {
      console.warn(`[LoadScript] Skipping unsupported file type: ${filePath}`);
      return [];
    }
  } catch (error) {
    console.error(`[LoadScript] Error processing file ${filePath}:`, error);
    if (error instanceof Error) {
      console.error(`[LoadScript] Error details: ${error.message}`);
      console.error(`[LoadScript] Stack trace: ${error.stack}`);
    }
    return [];
  }
}

// --- Main Script Logic ---

const filesToProcess: string[] = [];

async function loadSystemKnowledge() {
  console.log('[LoadScript] Starting knowledge base loading process...');
  console.log(
    '[LoadScript] NOTE: This script currently DOES NOT process files due to S3 migration.'
  );
  console.log(
    `[LoadScript] Please upload System KB files manually to S3 bucket '${process.env.AWS_BUCKET_NAME}' under prefix '${KNOWLEDGE_BASE_S3_PREFIX}'`
  );
  console.log('[LoadScript] and update MongoDB records accordingly.');

  if (!API_KEY) {
    console.error('[LoadScript] ERROR: OPENAI_API_KEY environment variable is not set.');
    process.exit(1);
  }

  try {
    console.log('[LoadScript] Connecting to MongoDB...');
    await connectDB();
    console.log('[LoadScript] MongoDB connection successful.');

    // Initialize ChromaDB Client (can keep for potential cleanup or future use)
    const chromaClient = new ChromaClient({ path: CHROMA_URL });

    // Note: ChromaDB's OpenAIEmbeddingFunction doesn't directly support custom base URLs
    // If using OpenRouter, we'll adjust our setup approach
    console.log('[LoadScript] Using OpenAI key for embeddings');

    const embedder = new OpenAIEmbeddingFunction({
      openai_api_key: API_KEY,
      openai_model: EMBEDDING_MODEL,
    });

    // --- TEMPORARY: Delete existing collection before loading ---
    try {
      console.log(
        `[LoadScript] TEMPORARY STEP: Attempting to delete existing collection '${COLLECTION_NAME}'...`
      );
      await chromaClient.deleteCollection({ name: COLLECTION_NAME });
      console.log(
        `[LoadScript] TEMPORARY STEP: Existing collection '${COLLECTION_NAME}' deleted successfully.`
      );
    } catch (error: any) {
      // Ignore error if collection doesn't exist, log others
      if (
        error.message &&
        (error.message.includes("doesn't exist") || error.message.includes('not found'))
      ) {
        console.log(
          `[LoadScript] TEMPORARY STEP: Collection '${COLLECTION_NAME}' does not exist or already deleted, proceeding.`
        );
      } else {
        console.error(
          `[LoadScript] TEMPORARY STEP: Error deleting collection '${COLLECTION_NAME}':`,
          error
        );
        // Optional: Exit if deletion fails unexpectedly
        // console.error("Exiting due to unexpected error during collection deletion.");
        // process.exit(1);
      }
    }
    // --- END TEMPORARY ---

    // 2. Get or Create ChromaDB Collection
    let collection: Collection;
    try {
      console.log(`[LoadScript] Getting or creating ChromaDB collection '${COLLECTION_NAME}'...`);
      collection = await chromaClient.getOrCreateCollection({
        name: COLLECTION_NAME,
        embeddingFunction: embedder,
      });
      console.log(`[LoadScript] ChromaDB Collection '${COLLECTION_NAME}' ready.`);
    } catch (error) {
      console.error('[LoadScript] Error getting or creating ChromaDB collection:', error);
      throw error; // Rethrow to be caught by outer try/catch
    }

    // --- REMOVE/DISABLE FILE PROCESSING LOGIC ---
    console.warn('[LoadScript] Skipping file system scan and processing loop.');
    /*
        // 3. Read Files from Knowledge Base Directory
        try {
            const allFiles = await fs.readdir(KNOWLEDGE_BASE_DIR);
            filesToProcess = allFiles.filter(file => {
                const ext = path.extname(file).toLowerCase();
                return ext === '.txt' || ext === '.pdf';
            });
            console.log(`[LoadScript] Found ${filesToProcess.length} TXT/PDF files to process.`);
        } catch (error) {
            console.error(`[LoadScript] Error reading knowledge base directory ${KNOWLEDGE_BASE_DIR}:`, error);
            process.exit(1);
        }

        if (filesToProcess.length === 0) {
            console.log('[LoadScript] No files found to process. Exiting.');
            return;
        }

        // 4. Process Each File (Chunk, Prepare Data, Add to ChromaDB & MongoDB)
        let totalChunksAdded = 0;
        for (const originalFileName of filesToProcess) {
            const filePath = path.join(KNOWLEDGE_BASE_DIR, originalFileName);
            console.log(`\n[LoadScript] Processing file: ${originalFileName}`);

            let chunks: DocumentChunk[] = [];
            let fileSizeBytes = 0;
            let fileMimeType = '';
            const generatedFileName = `${uuidv4()}${path.extname(originalFileName)}`;

            try {
                // 1. Extract text and get file stats
                const stats = await fs.stat(filePath);
                fileSizeBytes = stats.size;
                const fileExtension = path.extname(originalFileName).toLowerCase();
                fileMimeType = fileExtension === '.pdf' ? 'application/pdf' : (fileExtension === '.txt' ? 'text/plain' : 'application/octet-stream');

                chunks = await extractTextFromFile(filePath);
                if (chunks.length === 0) {
                    console.warn(`[LoadScript] No text extracted or file skipped: ${originalFileName}`);
                    continue;
                }
                console.log(`[LoadScript] Extracted ${chunks.length} initial chunks from ${originalFileName}`);

                // 2. Check MongoDB for existing document with the same originalFileName
                const mongoDoc = await UserDocument.findOne({ originalFileName: originalFileName, sourceType: 'system' });

                if (mongoDoc && mongoDoc.status === 'completed') {
                    console.log(`[LoadScript] Skipping already processed file: ${originalFileName} (ID: ${(mongoDoc as any)._id})`);
                    continue; // Skip this file
                }

                // If exists but not completed, or doesn't exist, proceed with processing
                console.log(`[LoadScript] Processing file: ${originalFileName} (Existing Doc ID: ${mongoDoc ? (mongoDoc as any)._id : 'N/A'})`);

                // 3. Create/Update MongoDB document first to get the ID
                console.log(`[LoadScript] Upserting MongoDB document for ${originalFileName}...`);
                const mongoDocUpdate = await UserDocument.findOneAndUpdate(
                    { originalFileName: originalFileName, sourceType: 'system' }, // Query criteria
                    {
                        $set: { // Fields to set/update
                            fileName: generatedFileName,
                            originalFileName: originalFileName,
                            uploadTimestamp: new Date(),
                            mimeType: fileMimeType,
                            totalChunks: chunks.length, // Use actual chunk count
                            // chromaIds will be updated later if needed, or maybe removed if docId in chroma is sufficient
                            fileSize: fileSizeBytes,
                            sourceType: 'system',
                            userId: null
                        },
                        $setOnInsert: {}
                    },
                    {
                        upsert: true,
                        new: true,
                        runValidators: true
                    }
                );

                if (!mongoDocUpdate?._id) {
                    console.error(`[LoadScript] Failed to upsert MongoDB document or retrieve ID for ${originalFileName}`);
                    continue; // Skip to the next file if DB upsert failed
                }

                const mongoDocId = mongoDocUpdate._id.toString(); // Get the ID as string
                console.log(`[LoadScript] MongoDB document upserted successfully for ${originalFileName} (ID: ${mongoDocId})`);

                // 4. Prepare chunk data for ChromaDB, adding the MongoDB ID
                const chunkData: ChunkData = { ids: [], documents: [], metadatas: [] };
                const allChromaIdsForFile: string[] = []; // Still collect these?

                chunks.forEach((chunk, index) => {
                    const chunkId = `${generatedFileName}_chunk_${index}`;
                    allChromaIdsForFile.push(chunkId);

                    chunkData.ids.push(chunkId);
                    chunkData.documents.push(chunk.text);
                    chunkData.metadatas.push({
                        fileName: generatedFileName,
                        originalFileName: originalFileName,
                        chunkIndex: index,
                        sourcePath: filePath,
                        pageNumbers: JSON.stringify(chunk.pageNumbers),
                        uuid: chunkId, // Keep for potential compatibility?
                        uploadTimestamp: new Date().toISOString(),
                        sourceType: 'system',
                        documentId: mongoDocId // **** ADDED MONGODB ID ****
                        // Add any other relevant metadata needed for filtering/display
                    });
                });

                // 5. Add chunks to ChromaDB
                if (chunkData.ids.length > 0) {
                    console.log(`[LoadScript] Adding ${chunkData.ids.length} chunks to ChromaDB for ${originalFileName}...`);
                    await collection.add({
                        ids: chunkData.ids,
                        documents: chunkData.documents,
                        metadatas: chunkData.metadatas,
                    });
                    totalChunksAdded += chunkData.ids.length;
                    console.log(`[LoadScript] Successfully added chunks to ChromaDB for ${originalFileName}.`);

                    // Optional: Update mongoDoc with chromaIds if needed later
                    // await UserDocument.updateOne({ _id: mongoDoc._id }, { $set: { chromaIds: allChromaIdsForFile } });

                } else {
                    console.warn(`[LoadScript] No chunks generated for ${originalFileName}, skipping ChromaDB update.`);
                }

            } catch (fileProcessingError) {
                console.error(`[LoadScript] Error processing file ${originalFileName}:`, fileProcessingError);
                // Continue to the next file instead of exiting
            }
        } // End of file processing loop

        console.log(`\n[LoadScript] Finished processing all files.`);
        console.log(`[LoadScript] Total chunks added to ChromaDB: ${totalChunksAdded}`);
        */
    // --- END DISABLED FILE PROCESSING LOGIC ---
  } catch (error) {
    console.error('[LoadScript] A critical error occurred:', error);
    process.exitCode = 1;
  } finally {
    console.log('[LoadScript] Disconnecting from MongoDB...');
    await disconnectDB();
    console.log('[LoadScript] MongoDB disconnected. Script finished.');
    // console.log(`[LoadScript] Total files found: ${filesToProcess ? filesToProcess.length : 0}`);
  }
}

// --- Script Execution ---
loadSystemKnowledge();
