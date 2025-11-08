#!/usr/bin/env ts-node
/**
 * PRODUCTION MONGODB TEXTCONTENT VERIFICATION
 *
 * This script connects to PRODUCTION MongoDB and verifies the textContent
 * field in all System KB documents. This is critical for understanding
 * why the reindexing process didn't generate any vectors.
 *
 * Usage:
 * MONGODB_URI=<prod-uri> npx ts-node src/scripts/verify-prod-mongo-textcontent.ts
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { SystemKbDocument, ISystemKbDocument } from '../models/SystemKbDocument';

interface TextContentStats {
  totalDocuments: number;
  documentsWithText: number;
  documentsWithoutText: number;
  documentsWithEmptyText: number;
  averageTextLength: number;
  documentDetails: Array<{
    id: string;
    filename: string;
    status: string;
    hasTextContent: boolean;
    textLength: number;
    s3Key: string;
  }>;
}

async function verifyProductionTextContent(): Promise<void> {
  console.log('🔍 PRODUCTION MONGODB TEXTCONTENT VERIFICATION');
  console.log('='.repeat(60));

  // Verify we're targeting production
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('❌ MONGODB_URI environment variable is required');
    process.exit(1);
  }

  const isProduction =
    mongoUri.includes('gkchatty_prod') || mongoUri.includes('gkchatty-prod-cluster');
  console.log(
    `📊 MongoDB URI: ${mongoUri.replace(/mongodb\+srv:\/\/[^@]+@/, 'mongodb+srv://***@')}`
  );
  console.log(`🎯 Target Database: ${isProduction ? 'PRODUCTION' : 'NOT PRODUCTION'}`);

  if (!isProduction) {
    console.warn('⚠️  WARNING: This does not appear to be the production database!');
    console.warn('⚠️  Production URI should contain "gkchatty_prod" or "gkchatty-prod-cluster"');
    console.log('Continue anyway? Press Ctrl+C to abort...');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  try {
    // Connect to MongoDB
    console.log('\n📊 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Get database name from connection
    const dbName = mongoose.connection.db?.databaseName;
    console.log(`📁 Database Name: ${dbName}`);

    // Query all System KB documents
    console.log('\n🔍 Querying systemkbdocuments collection...');
    const documents = await SystemKbDocument.find({})
      .select('_id filename status textContent s3Key fileUrl createdAt updatedAt')
      .lean<ISystemKbDocument[]>();

    console.log(`📋 Found ${documents.length} System KB documents\n`);

    // Analyze text content
    const stats: TextContentStats = {
      totalDocuments: documents.length,
      documentsWithText: 0,
      documentsWithoutText: 0,
      documentsWithEmptyText: 0,
      averageTextLength: 0,
      documentDetails: [],
    };

    let totalTextLength = 0;

    // Detailed analysis
    console.log('📄 DOCUMENT ANALYSIS:');
    console.log('-'.repeat(80));

    documents.forEach((doc, index) => {
      const hasTextField = 'textContent' in doc && doc.textContent !== undefined;
      const textLength = doc.textContent ? doc.textContent.length : 0;
      const hasContent = textLength > 0;

      // Count statistics
      if (!hasTextField || doc.textContent === null || doc.textContent === undefined) {
        stats.documentsWithoutText++;
      } else if (textLength === 0) {
        stats.documentsWithEmptyText++;
      } else {
        stats.documentsWithText++;
        totalTextLength += textLength;
      }

      // Store details
      stats.documentDetails.push({
        id: doc._id.toString(),
        filename: doc.filename,
        status: doc.status,
        hasTextContent: hasContent,
        textLength: textLength,
        s3Key: doc.s3Key,
      });

      // Print details
      console.log(`${index + 1}. ${doc.filename}`);
      console.log(`   ID: ${doc._id}`);
      console.log(`   Status: ${doc.status}`);
      console.log(`   S3 Key: ${doc.s3Key}`);
      console.log(
        `   Text Content: ${
          !hasTextField
            ? '❌ FIELD MISSING'
            : doc.textContent === null
              ? '❌ NULL'
              : doc.textContent === undefined
                ? '❌ UNDEFINED'
                : textLength === 0
                  ? '⚠️  EMPTY STRING'
                  : `✅ ${textLength.toLocaleString()} characters`
        }`
      );

      if (hasContent && textLength < 100) {
        console.log(`   Preview: "${doc.textContent?.substring(0, 50)}..."`);
      }
      console.log();
    });

    // Calculate average
    if (stats.documentsWithText > 0) {
      stats.averageTextLength = Math.round(totalTextLength / stats.documentsWithText);
    }

    // Print summary
    console.log('-'.repeat(80));
    console.log('\n📊 SUMMARY STATISTICS:');
    console.log(`Total Documents: ${stats.totalDocuments}`);
    console.log(
      `Documents WITH text content: ${stats.documentsWithText} (${((stats.documentsWithText / stats.totalDocuments) * 100).toFixed(1)}%)`
    );
    console.log(
      `Documents WITHOUT text field: ${stats.documentsWithoutText} (${((stats.documentsWithoutText / stats.totalDocuments) * 100).toFixed(1)}%)`
    );
    console.log(
      `Documents with EMPTY text: ${stats.documentsWithEmptyText} (${((stats.documentsWithEmptyText / stats.totalDocuments) * 100).toFixed(1)}%)`
    );

    if (stats.documentsWithText > 0) {
      console.log(`Average text length: ${stats.averageTextLength.toLocaleString()} characters`);
    }

    // Critical finding
    console.log('\n🚨 CRITICAL FINDING:');
    if (stats.documentsWithText === 0) {
      console.log('❌ NO DOCUMENTS HAVE TEXT CONTENT!');
      console.log(
        'This explains why reindexing failed - there is no text to generate embeddings from.'
      );
      console.log('\n📋 REQUIRED ACTION:');
      console.log('1. Run a text extraction process to populate textContent from source PDFs');
      console.log('2. Verify all documents have textContent populated');
      console.log('3. Re-run the System KB reindexing process');
    } else if (stats.documentsWithText < stats.totalDocuments) {
      console.log(
        `⚠️  Only ${stats.documentsWithText} out of ${stats.totalDocuments} documents have text content!`
      );
      console.log('Partial reindexing may have occurred, but incomplete.');
    } else {
      console.log(`✅ All ${stats.totalDocuments} documents have text content.`);
      console.log('The reindexing failure must have a different cause.');
    }

    // Check for completed status
    const completedDocs = documents.filter(d => d.status === 'completed');
    console.log(`\n📋 Document Status:`);
    console.log(`Completed: ${completedDocs.length}`);
    console.log(`Other: ${documents.length - completedDocs.length}`);

    if (completedDocs.length < documents.length) {
      console.log(
        '\n⚠️  Some documents are not in "completed" status, which may prevent indexing.'
      );
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Verification complete');
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
  verifyProductionTextContent().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { verifyProductionTextContent };
