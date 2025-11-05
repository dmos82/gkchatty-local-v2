#!/usr/bin/env ts-node
/**
 * PRODUCTION S3 KEYS VERIFICATION
 *
 * This script analyzes the s3Key field in production System KB documents
 * to determine if incorrect S3 paths are causing the reindex failure.
 *
 * Expected S3 structure: gk-chatty-documents-goldkeyinsurance/system-kb/[filename]
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { SystemKbDocument, ISystemKbDocument } from '../models/SystemKbDocument';

interface S3KeyAnalysis {
  documentId: string;
  filename: string;
  s3Key: string;
  hasSystemKbPrefix: boolean;
  looksLikeUUID: boolean;
  hasFileExtension: boolean;
  expectedS3Path: string;
  analysis: string;
}

async function verifyProductionS3Keys(): Promise<void> {
  console.log('🔍 PRODUCTION S3 KEYS VERIFICATION');
  console.log('='.repeat(70));

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('❌ MONGODB_URI environment variable is required');
    process.exit(1);
  }

  try {
    // Connect to MongoDB
    console.log('📊 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    const dbName = mongoose.connection.db?.databaseName;
    console.log(`📁 Database: ${dbName}`);
    console.log(`🪣 Expected S3 Bucket: gk-chatty-documents-goldkeyinsurance`);
    console.log(`📂 Expected S3 Prefix: system-kb/`);

    // Query all System KB documents
    console.log('\n🔍 Querying systemkbdocuments collection...');
    const documents = await SystemKbDocument.find({})
      .select('_id filename s3Key status')
      .lean<ISystemKbDocument[]>();

    console.log(`📋 Found ${documents.length} System KB documents\n`);

    // Analyze each document's S3 key
    const analyses: S3KeyAnalysis[] = [];

    console.log('📄 S3 KEY ANALYSIS:');
    console.log('-'.repeat(100));
    console.log(
      'No. | Filename                                          | S3 Key                                     | Analysis'
    );
    console.log('-'.repeat(100));

    documents.forEach((doc, index) => {
      const s3Key = doc.s3Key || '';
      const hasSystemKbPrefix = s3Key.startsWith('system-kb/');
      const looksLikeUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        s3Key
      );
      const hasFileExtension = s3Key.includes('.');
      const expectedS3Path = `system-kb/${doc.filename}`;

      let analysis = '';
      if (!s3Key) {
        analysis = '❌ MISSING';
      } else if (looksLikeUUID && !hasFileExtension) {
        analysis = '❌ UUID only (missing prefix & extension)';
      } else if (!hasSystemKbPrefix) {
        analysis = '❌ Missing system-kb/ prefix';
      } else if (s3Key === expectedS3Path) {
        analysis = '✅ Correct';
      } else {
        analysis = '⚠️  Has prefix but path differs';
      }

      analyses.push({
        documentId: doc._id.toString(),
        filename: doc.filename,
        s3Key: s3Key,
        hasSystemKbPrefix,
        looksLikeUUID,
        hasFileExtension,
        expectedS3Path,
        analysis,
      });

      // Print row
      const num = `${index + 1}.`.padEnd(4);
      const fname = doc.filename.padEnd(50).substring(0, 50);
      const key = (s3Key || '[MISSING]').padEnd(42).substring(0, 42);
      console.log(`${num}| ${fname} | ${key} | ${analysis}`);
    });

    console.log('-'.repeat(100));

    // Summary statistics
    console.log('\n📊 SUMMARY STATISTICS:');
    const correctKeys = analyses.filter(a => a.analysis.includes('✅')).length;
    const uuidOnlyKeys = analyses.filter(a => a.looksLikeUUID && !a.hasFileExtension).length;
    const missingPrefixKeys = analyses.filter(a => a.s3Key && !a.hasSystemKbPrefix).length;
    const missingKeys = analyses.filter(a => !a.s3Key).length;

    console.log(`Total Documents: ${documents.length}`);
    console.log(`✅ Correct S3 Keys: ${correctKeys}`);
    console.log(`❌ UUID-only Keys: ${uuidOnlyKeys}`);
    console.log(`❌ Missing Prefix: ${missingPrefixKeys}`);
    console.log(`❌ Missing S3 Key: ${missingKeys}`);

    // Critical finding
    console.log('\n🚨 CRITICAL FINDING:');
    if (uuidOnlyKeys > 0) {
      console.log(
        `❌ ${uuidOnlyKeys} documents have UUID-only S3 keys without system-kb/ prefix or file extension!`
      );
      console.log('This explains why processAndEmbedDocument cannot fetch the PDFs from S3.');
      console.log('\n📋 REQUIRED ACTION:');
      console.log('1. Update s3Key field to include "system-kb/" prefix and file extension');
      console.log(
        '2. Example: Change "1427d8ed-0093-4e02-bb30-ab98c967b034" to "system-kb/1427d8ed-0093-4e02-bb30-ab98c967b034.pdf"'
      );
      console.log('3. Re-run the System KB reindexing process');
    } else if (missingPrefixKeys > 0) {
      console.log(
        `❌ ${missingPrefixKeys} documents are missing the system-kb/ prefix in their S3 keys!`
      );
    } else if (correctKeys === documents.length) {
      console.log('✅ All documents have correct S3 keys with system-kb/ prefix.');
      console.log('The reindexing failure must have a different cause.');
    }

    // Show examples of what needs fixing
    if (uuidOnlyKeys > 0 || missingPrefixKeys > 0) {
      console.log('\n📝 EXAMPLES OF REQUIRED FIXES:');
      const needsFix = analyses.filter(a => a.looksLikeUUID && !a.hasFileExtension);
      needsFix.slice(0, 5).forEach(doc => {
        console.log(`\nDocument: ${doc.filename}`);
        console.log(`Current s3Key: ${doc.s3Key}`);
        console.log(`Should be: system-kb/${doc.s3Key}.pdf`);
      });
    }

    console.log('\n' + '='.repeat(70));
    console.log('✅ S3 Key verification complete');
  } catch (error) {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
      console.log('📊 Disconnected from MongoDB');
    }
  }
}

// Execute if run directly
if (require.main === module) {
  verifyProductionS3Keys().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { verifyProductionS3Keys };
