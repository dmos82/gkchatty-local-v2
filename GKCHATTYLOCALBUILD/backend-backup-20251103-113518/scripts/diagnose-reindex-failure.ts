#!/usr/bin/env ts-node
/**
 * DIAGNOSE REINDEX FAILURE
 *
 * This script simulates the reindex process step-by-step to identify
 * where the failure is occurring.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { SystemKbDocument } from '../models/SystemKbDocument';
import { getSystemKbNamespace } from '../utils/pineconeNamespace';
import { getPineconeIndex } from '../utils/pineconeService';

async function diagnoseReindexFailure(): Promise<void> {
  console.log('🔍 DIAGNOSING REINDEX FAILURE');
  console.log('='.repeat(60));

  try {
    // Step 1: Check environment
    console.log('\n📊 Step 1: Environment Check');
    console.log(`MONGODB_URI: ${process.env.MONGODB_URI ? '[SET]' : '[MISSING]'}`);
    console.log(`PINECONE_API_KEY: ${process.env.PINECONE_API_KEY ? '[SET]' : '[MISSING]'}`);
    console.log(`PINECONE_INDEX_NAME: ${process.env.PINECONE_INDEX_NAME}`);
    console.log(`OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? '[SET]' : '[MISSING]'}`);
    console.log(
      `AWS_BUCKET_NAME: ${process.env.AWS_BUCKET_NAME || process.env.S3_BUCKET || '[MISSING]'}`
    );

    // Step 2: Check namespace resolution
    console.log('\n📊 Step 2: Namespace Resolution');
    const targetNamespace = getSystemKbNamespace();
    console.log(`Target namespace: "${targetNamespace}"`);

    // Step 3: Test Pinecone connection
    console.log('\n📊 Step 3: Pinecone Connection Test');
    try {
      const index = await getPineconeIndex();
      const stats = await index.describeIndexStats();
      console.log('✅ Pinecone connection successful');
      console.log(`Index: ${process.env.PINECONE_INDEX_NAME}`);
      console.log('Namespaces:', Object.keys(stats.namespaces || {}));
    } catch (error) {
      console.error('❌ Pinecone connection failed:', error);
      return;
    }

    // Step 4: Test namespace operations
    console.log('\n📊 Step 4: Testing Namespace Operations');
    const index = await getPineconeIndex();

    // Test query in target namespace
    console.log(`Testing query in namespace "${targetNamespace}"...`);
    try {
      const queryResult = await index.namespace(targetNamespace).query({
        vector: new Array(1536).fill(0),
        topK: 1,
      });
      console.log(`✅ Query successful. Matches: ${queryResult.matches?.length || 0}`);
    } catch (error) {
      console.error('❌ Query failed:', error);
    }

    // Test if we can delete from namespace
    console.log(`\nTesting delete operation in namespace "${targetNamespace}"...`);
    console.log('⚠️  SKIPPING actual delete to avoid data loss');
    console.log('(In real reindex, deleteAll() would be called here)');

    // Step 5: Connect to MongoDB and get one document
    console.log('\n📊 Step 5: MongoDB Document Test');
    await mongoose.connect(process.env.MONGODB_URI!);

    const testDoc = await SystemKbDocument.findOne({ status: 'completed' }).select(
      '_id filename s3Key mimeType textContent'
    );

    if (!testDoc) {
      console.error('❌ No completed System KB documents found');
      return;
    }

    console.log(`Found test document: ${testDoc.filename}`);
    console.log(`- ID: ${testDoc._id}`);
    console.log(`- S3 Key: ${testDoc.s3Key}`);
    console.log(
      `- Text Content: ${testDoc.textContent ? `${testDoc.textContent.length} chars` : 'MISSING'}`
    );

    // Step 6: Test document processing (dry run)
    console.log('\n📊 Step 6: Testing Document Processing (DRY RUN)');
    console.log('Would call processAndEmbedDocument with:');
    console.log(`- documentId: ${testDoc._id}`);
    console.log(`- s3Bucket: ${process.env.AWS_BUCKET_NAME || process.env.S3_BUCKET || 'MISSING'}`);
    console.log(`- s3Key: ${testDoc.s3Key}`);
    console.log(`- sourceType: system`);
    console.log(`- targetNamespace: "${targetNamespace}"`);

    // Check if S3 bucket is configured
    if (!process.env.AWS_BUCKET_NAME && !process.env.S3_BUCKET) {
      console.error('\n❌ CRITICAL: No S3 bucket configured!');
      console.error('This would cause processAndEmbedDocument to fail');
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📋 DIAGNOSIS SUMMARY:');

    const issues = [];
    if (!process.env.AWS_BUCKET_NAME && !process.env.S3_BUCKET) {
      issues.push('Missing S3 bucket configuration');
    }
    if (targetNamespace !== '') {
      issues.push(`Namespace targeting wrong: "${targetNamespace}" instead of ""`);
    }

    if (issues.length > 0) {
      console.log('❌ ISSUES FOUND:');
      issues.forEach(issue => console.log(`  - ${issue}`));
    } else {
      console.log('✅ Configuration appears correct');
      console.log('The issue might be in the actual document processing');
    }
  } catch (error) {
    console.error('❌ Diagnosis failed:', error);
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
  }
}

// Execute if run directly
if (require.main === module) {
  diagnoseReindexFailure().catch(console.error);
}

export { diagnoseReindexFailure };
