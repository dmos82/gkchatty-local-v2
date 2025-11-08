#!/usr/bin/env ts-node
/**
 * FIX PRODUCTION S3 KEYS
 *
 * This script updates all S3 keys in production System KB documents
 * to include the correct system-kb/ prefix and .pdf extension.
 *
 * CRITICAL: This will modify production data!
 *
 * Usage:
 * MONGODB_URI=<prod-uri> npx ts-node src/scripts/fix-prod-s3keys.ts [--execute]
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { SystemKbDocument, ISystemKbDocument } from '../models/SystemKbDocument';

async function fixProductionS3Keys(execute: boolean = false): Promise<void> {
  console.log('🔧 FIX PRODUCTION S3 KEYS');
  console.log('='.repeat(70));

  if (!execute) {
    console.log('🔍 RUNNING IN DRY-RUN MODE (no changes will be made)');
    console.log('To execute changes, run with --execute flag');
  } else {
    console.log('⚠️  RUNNING IN EXECUTE MODE - WILL MODIFY PRODUCTION DATA!');
    console.log('Starting in 5 seconds... Press Ctrl+C to abort');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('❌ MONGODB_URI environment variable is required');
    process.exit(1);
  }

  try {
    // Connect to MongoDB
    console.log('\n📊 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    const dbName = mongoose.connection.db?.databaseName;
    console.log(`📁 Database: ${dbName}`);

    // Query all System KB documents
    console.log('\n🔍 Querying systemkbdocuments collection...');
    const documents = await SystemKbDocument.find({})
      .select('_id filename s3Key')
      .lean<ISystemKbDocument[]>();

    console.log(`📋 Found ${documents.length} System KB documents\n`);

    // Process each document
    let updatedCount = 0;
    let skippedCount = 0;

    console.log('📄 PROCESSING DOCUMENTS:');
    console.log('-'.repeat(80));

    for (const doc of documents) {
      const currentS3Key = doc.s3Key || '';

      // Check if it's a UUID-only key
      const isUuidOnly = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        currentS3Key
      );

      if (isUuidOnly) {
        // Construct the correct S3 key
        const correctedS3Key = `system-kb/${currentS3Key}.pdf`;

        console.log(`\n📄 ${doc.filename}`);
        console.log(`   Current s3Key: ${currentS3Key}`);
        console.log(`   New s3Key:     ${correctedS3Key}`);

        if (execute) {
          // Update the document
          await SystemKbDocument.findByIdAndUpdate(doc._id, {
            s3Key: correctedS3Key,
          });
          console.log(`   ✅ UPDATED`);
          updatedCount++;
        } else {
          console.log(`   🔍 Would update (dry-run mode)`);
          updatedCount++;
        }
      } else if (currentS3Key.startsWith('system-kb/')) {
        console.log(`\n📄 ${doc.filename}`);
        console.log(`   s3Key: ${currentS3Key}`);
        console.log(`   ✅ Already correct - skipping`);
        skippedCount++;
      } else {
        console.log(`\n📄 ${doc.filename}`);
        console.log(`   s3Key: ${currentS3Key}`);
        console.log(`   ⚠️  Unexpected format - manual review needed`);
        skippedCount++;
      }
    }

    console.log('\n' + '-'.repeat(80));

    // Summary
    console.log('\n📊 SUMMARY:');
    console.log(`Total Documents: ${documents.length}`);
    console.log(`${execute ? 'Updated' : 'Would Update'}: ${updatedCount}`);
    console.log(`Skipped: ${skippedCount}`);

    if (!execute && updatedCount > 0) {
      console.log('\n💡 To apply these changes, run:');
      console.log('npx ts-node src/scripts/fix-prod-s3keys.ts --execute');
    } else if (execute && updatedCount > 0) {
      console.log('\n✅ S3 keys have been updated successfully!');
      console.log('\n📋 NEXT STEPS:');
      console.log('1. Verify the S3 files exist at the new paths');
      console.log('2. Re-run the System KB reindexing process');
      console.log('3. Verify vectors are created in the correct namespace');
    }

    console.log('\n' + '='.repeat(70));
    console.log('✅ S3 key fix complete');
  } catch (error) {
    console.error('❌ Fix failed:', error);
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
  const execute = process.argv.includes('--execute');
  fixProductionS3Keys(execute).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { fixProductionS3Keys };
