#!/usr/bin/env ts-node
/**
 * LOCAL RECOVERY TEST SCRIPT
 *
 * This script tests the recovery process using staging environment
 * to verify everything works before production deployment.
 *
 * It will:
 * 1. Test PDF text extraction
 * 2. Test embedding generation
 * 3. Test Pinecone vector operations
 * 4. Verify the complete pipeline
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { SystemKbDocument } from '../models/SystemKbDocument';
import { generateEmbeddings } from '../utils/openaiHelper';
import { upsertVectors, PineconeVector, getPineconeIndex } from '../utils/pineconeService';
import * as fs from 'fs';
import * as path from 'path';
import pdf from 'pdf-parse';

async function testRecoveryProcess() {
  console.log('🧪 TESTING RECOVERY PROCESS LOCALLY');
  console.log('==================================');
  console.log('Using staging environment to verify recovery logic...\n');

  try {
    // Step 1: Test PDF processing
    console.log('📄 Step 1: Testing PDF text extraction...');
    const knowledgeBaseDir = path.join(process.cwd(), '../../knowledge_base_docs');
    const pdfFiles = fs.readdirSync(knowledgeBaseDir).filter(f => f.toLowerCase().endsWith('.pdf'));

    console.log(`Found ${pdfFiles.length} PDF files`);

    // Test with first PDF
    const testPdfPath = path.join(knowledgeBaseDir, pdfFiles[0]);
    const pdfBuffer = fs.readFileSync(testPdfPath);
    const pdfData = await pdf(pdfBuffer);

    console.log(`✅ Successfully extracted ${pdfData.text.length} characters from ${pdfFiles[0]}`);

    // Step 2: Test text chunking
    console.log('\n✂️  Step 2: Testing text chunking...');
    const chunks = chunkText(pdfData.text, 1000);
    console.log(`✅ Created ${chunks.length} chunks from extracted text`);

    // Step 3: Test embedding generation (small sample)
    console.log('\n🧠 Step 3: Testing embedding generation...');
    const sampleChunks = chunks.slice(0, 2); // Test with just 2 chunks
    const embeddings = await generateEmbeddings(sampleChunks);
    console.log(`✅ Generated ${embeddings.length} embeddings`);

    // Step 4: Test MongoDB connection
    console.log('\n📊 Step 4: Testing MongoDB connection...');
    await mongoose.connect(process.env.MONGODB_URI!);
    console.log('✅ Connected to MongoDB');

    const docCount = await SystemKbDocument.countDocuments();
    console.log(`Found ${docCount} documents in SystemKbDocument collection`);

    // Step 5: Test Pinecone connection
    console.log('\n📍 Step 5: Testing Pinecone connection...');
    const index = await getPineconeIndex();
    await index.describeIndexStats();
    console.log(`✅ Connected to Pinecone index: ${process.env.PINECONE_INDEX_NAME}`);

    // Step 6: Test vector operations (to staging namespace)
    console.log('\n🔧 Step 6: Testing vector operations...');
    const testVectors: PineconeVector[] = sampleChunks.map((chunk, idx) => ({
      id: `test_recovery_${idx}`,
      values: embeddings[idx],
      metadata: {
        documentId: 'test-doc-id',
        originalFileName: 'test-file.pdf',
        sourceType: 'system',
        text: chunk,
        chunkIndex: idx,
        totalChunks: sampleChunks.length,
        testRecovery: true,
      },
    }));

    // Use a test namespace to avoid affecting staging data
    await upsertVectors(testVectors, 'test-recovery');
    console.log(`✅ Successfully upserted ${testVectors.length} test vectors`);

    // Clean up test vectors
    await index.namespace('test-recovery').deleteMany({
      filter: { testRecovery: { $eq: true } },
    });
    console.log('✅ Cleaned up test vectors');

    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');

    console.log('\n🎉 RECOVERY PROCESS TEST SUCCESSFUL!');
    console.log('===================================');
    console.log('✅ PDF text extraction: WORKING');
    console.log('✅ Text chunking: WORKING');
    console.log('✅ Embedding generation: WORKING');
    console.log('✅ MongoDB operations: WORKING');
    console.log('✅ Pinecone operations: WORKING');
    console.log('\n🚀 Ready for production deployment!');
  } catch (error: any) {
    console.error('\n❌ RECOVERY TEST FAILED:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

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

// Execute test
testRecoveryProcess();
