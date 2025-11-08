#!/usr/bin/env ts-node
/**
 * PRODUCTION EMERGENCY RECOVERY SCRIPT
 *
 * This script completes Phase 2 of the GKChatty System KB recovery:
 * 1. Connects to production MongoDB and Pinecone
 * 2. Reads PDF files from knowledge_base_docs/ directory
 * 3. Extracts text content and updates MongoDB records
 * 4. Generates embeddings and populates Pinecone vectors
 *
 * REQUIREMENTS:
 * - Production MongoDB URI
 * - Production Pinecone API key and index (gkchatty-prod)
 * - OpenAI API key for embeddings
 *
 * Usage in production:
 * MONGODB_URI=<prod> PINECONE_API_KEY=<prod> PINECONE_INDEX_NAME=gkchatty-prod OPENAI_API_KEY=<prod> npx ts-node src/scripts/production-recovery-reindex.ts
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { SystemKbDocument } from '../models/SystemKbDocument';
import { generateEmbeddings } from '../utils/openaiHelper';
import { upsertVectors, PineconeVector, getPineconeIndex } from '../utils/pineconeService';
import * as fs from 'fs';
import * as path from 'path';
import pdf from 'pdf-parse';

// Text chunking function
function chunkText(text: string, maxChunkSize: number = 1000): string[] {
  if (!text || text.trim().length === 0) return [];

  const sentences = text.split(/[.!?]\s+|\n\s*\n/);
  const chunks: string[] = [];
  let currentChunk = '';

  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length + 1 <= maxChunkSize) {
      currentChunk += (currentChunk ? ' ' : '') + sentence;
    } else {
      if (currentChunk) chunks.push(currentChunk.trim());
      currentChunk = sentence;
    }
  }

  if (currentChunk) chunks.push(currentChunk.trim());
  return chunks.filter(chunk => chunk.trim().length > 20);
}

async function productionRecoveryReindex() {
  console.log('🚨 PRODUCTION EMERGENCY RECOVERY - PHASE 2');
  console.log('==========================================');
  console.log('Completing Pinecone reindexing process...\n');

  // Verify environment variables
  const requiredEnvVars = {
    MONGODB_URI: process.env.MONGODB_URI,
    PINECONE_API_KEY: process.env.PINECONE_API_KEY,
    PINECONE_INDEX_NAME: process.env.PINECONE_INDEX_NAME,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  };

  console.log('🔧 Environment Check:');
  for (const [key, value] of Object.entries(requiredEnvVars)) {
    const status = value ? '✅ SET' : '❌ MISSING';
    console.log(`  ${key}: ${status}`);
    if (!value) {
      console.error(`❌ Missing required environment variable: ${key}`);
      process.exit(1);
    }
  }

  if (process.env.PINECONE_INDEX_NAME !== 'gkchatty-prod') {
    console.log(`⚠️  WARNING: Index is ${process.env.PINECONE_INDEX_NAME}, expected gkchatty-prod`);
    console.log('   This script is designed for production recovery. Continue? (5 sec to cancel)');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  try {
    // Step 1: Connect to MongoDB
    console.log('📊 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI!);
    console.log('✅ Connected to MongoDB');

    // Step 2: Get documents from MongoDB (should be 22 from Phase 1)
    console.log('📋 Fetching SystemKbDocument records...');
    const mongoDocuments = await SystemKbDocument.find({}).lean();
    console.log(`📊 Found ${mongoDocuments.length} documents in MongoDB`);

    if (mongoDocuments.length === 0) {
      console.error('❌ No documents found in MongoDB. Phase 1 recovery may not have completed.');
      process.exit(1);
    }

    // Step 3: Process PDF files and extract text content
    const knowledgeBaseDir = path.join(process.cwd(), '../../knowledge_base_docs');
    console.log(`📁 Processing PDFs from: ${knowledgeBaseDir}`);

    if (!fs.existsSync(knowledgeBaseDir)) {
      console.error(`❌ Knowledge base directory not found: ${knowledgeBaseDir}`);
      process.exit(1);
    }

    const pdfFiles = fs.readdirSync(knowledgeBaseDir).filter(f => f.toLowerCase().endsWith('.pdf'));
    console.log(`📄 Found ${pdfFiles.length} PDF files`);

    // Step 4: Clear Pinecone system-kb namespace
    console.log('🧹 Clearing Pinecone system-kb namespace...');
    const index = await getPineconeIndex();
    await index.namespace('system-kb').deleteAll();
    console.log('✅ Pinecone namespace cleared');

    // Wait for consistency
    console.log('⏳ Waiting 8 seconds for Pinecone consistency...');
    await new Promise(resolve => setTimeout(resolve, 8000));

    // Step 5: Process each document
    let processedDocs = 0;
    let totalVectors = 0;

    for (const mongoDoc of mongoDocuments) {
      try {
        console.log(`\n📄 Processing: ${mongoDoc.filename}`);

        // Find corresponding PDF file
        const originalName = mongoDoc.filename;
        const matchingPdfFile = pdfFiles.find(pdfFile => {
          const cleanName = pdfFile.replace(/^\d+-/, '');
          return cleanName === originalName;
        });

        if (!matchingPdfFile) {
          console.log(`  ⚠️  PDF file not found for: ${originalName}`);
          continue;
        }

        // Extract text from PDF
        const pdfPath = path.join(knowledgeBaseDir, matchingPdfFile);
        const pdfBuffer = fs.readFileSync(pdfPath);
        const pdfData = await pdf(pdfBuffer);
        const textContent = pdfData.text;

        console.log(`  📝 Extracted ${textContent.length} characters`);

        // Update MongoDB with text content if missing
        if (!mongoDoc.textContent) {
          await SystemKbDocument.findByIdAndUpdate(mongoDoc._id, {
            textContent: textContent,
            status: 'completed',
            updatedAt: new Date(),
          });
          console.log(`  📊 Updated MongoDB with text content`);
        }

        // Chunk the text
        const chunks = chunkText(textContent, 1000);
        console.log(`  ✂️  Created ${chunks.length} chunks`);

        if (chunks.length === 0) {
          console.log(`  ⚠️  No chunks created, skipping`);
          continue;
        }

        // Generate embeddings
        console.log(`  🧠 Generating embeddings...`);
        const embeddings = await generateEmbeddings(chunks);

        if (!embeddings || embeddings.length !== chunks.length) {
          console.log(`  ❌ Failed to generate embeddings`);
          continue;
        }

        // Create Pinecone vectors
        const vectors: PineconeVector[] = chunks.map((chunk, chunkIndex) => ({
          id: `${mongoDoc._id}_chunk_${chunkIndex}`,
          values: embeddings[chunkIndex],
          metadata: {
            documentId: mongoDoc._id.toString(),
            originalFileName: mongoDoc.filename,
            sourceType: 'system',
            text: chunk,
            chunkIndex: chunkIndex,
            totalChunks: chunks.length,
            s3Key: mongoDoc.s3Key,
            fileUrl: mongoDoc.fileUrl,
            recoveredAt: new Date().toISOString(),
            recoveryPhase: '2',
          },
        }));

        // Upsert to Pinecone
        console.log(`  📤 Upserting ${vectors.length} vectors to Pinecone...`);
        await upsertVectors(vectors, 'system-kb');

        totalVectors += vectors.length;
        processedDocs++;
        console.log(`  ✅ Successfully processed ${mongoDoc.filename} (${vectors.length} vectors)`);

        // Small delay to be nice to APIs
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (docError: any) {
        console.log(`  ❌ Error processing ${mongoDoc.filename}: ${docError.message}`);
      }
    }

    // Step 6: Final verification
    console.log('\n🔍 Final verification...');
    const indexStats = await index.describeIndexStats();
    const systemKbVectorCount = indexStats.namespaces?.['system-kb']?.recordCount ?? 0;

    console.log('\n🎉 PRODUCTION RECOVERY COMPLETE!');
    console.log('=================================');
    console.log(`📊 Summary:`);
    console.log(`  - MongoDB documents: ${mongoDocuments.length}`);
    console.log(`  - Documents processed: ${processedDocs}`);
    console.log(`  - Total vectors created: ${totalVectors}`);
    console.log(`  - Pinecone system-kb vectors: ${systemKbVectorCount}`);
    console.log(`  - Expected result: ~110-120 vectors`);

    if (systemKbVectorCount > 0) {
      console.log('\n✅ SUCCESS: System KB should now be fully functional!');
      console.log('🔍 Next steps:');
      console.log('  1. Test document search in production');
      console.log('  2. Verify source document viewing works');
      console.log('  3. Confirm 404 errors are resolved');
    } else {
      console.log('\n❌ WARNING: No vectors found in Pinecone after processing');
      console.log('   Manual investigation may be required');
    }

    await mongoose.disconnect();
    console.log('\n📴 Disconnected from MongoDB');
  } catch (error: any) {
    console.error('\n❌ RECOVERY FAILED:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Execute recovery
productionRecoveryReindex();
