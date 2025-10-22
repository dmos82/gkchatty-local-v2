#!/usr/bin/env node

/**
 * GKCHATTY Document Audit Script
 * Task: GKCHATTY-PH4C-T18-PDF-VIEW-S3-404 - Data Audit
 *
 * This script audits the UserDocument collection to identify:
 * 1. Documents pointing to staging bucket that need production migration
 * 2. Documents with potentially missing S3 objects
 * 3. Inconsistencies in S3 key formats
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Import the UserDocument model
const { UserDocument } = require('../src/models/UserDocument');

const STAGING_BUCKET = 'gkchatty-staging-docs';
const PRODUCTION_BUCKET = 'gk-chatty-documents-goldkeyinsurance';

async function connectToDatabase() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI environment variable not set');
    }

    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    process.exit(1);
  }
}

async function auditDocuments() {
  console.log('\n=== GKCHATTY Document Audit ===\n');

  try {
    // Get all user documents
    const documents = await UserDocument.find({ sourceType: 'user' })
      .select('_id userId originalFileName s3Bucket s3Key file_extension status createdAt')
      .sort({ createdAt: -1 });

    console.log(`Found ${documents.length} user documents\n`);

    const auditResults = {
      stagingBucketDocs: [],
      productionBucketDocs: [],
      missingExtensions: [],
      suspiciousKeys: [],
      completedDocs: [],
      failedDocs: [],
    };

    for (const doc of documents) {
      const docInfo = {
        id: doc._id.toString(),
        userId: doc.userId.toString(),
        fileName: doc.originalFileName,
        bucket: doc.s3Bucket,
        key: doc.s3Key,
        extension: doc.file_extension,
        status: doc.status,
        createdAt: doc.createdAt,
      };

      // Categorize by bucket
      if (doc.s3Bucket === STAGING_BUCKET) {
        auditResults.stagingBucketDocs.push(docInfo);
      } else if (doc.s3Bucket === PRODUCTION_BUCKET) {
        auditResults.productionBucketDocs.push(docInfo);
      }

      // Check for missing file extensions
      if (!doc.file_extension || doc.file_extension === 'unknown') {
        auditResults.missingExtensions.push(docInfo);
      }

      // Check for suspicious S3 keys (should be UUIDs or proper paths)
      if (doc.s3Key && !doc.s3Key.match(/^[a-f0-9-]{36}$/) && !doc.s3Key.startsWith('user_docs/')) {
        auditResults.suspiciousKeys.push(docInfo);
      }

      // Categorize by status
      if (doc.status === 'completed') {
        auditResults.completedDocs.push(docInfo);
      } else if (doc.status === 'failed') {
        auditResults.failedDocs.push(docInfo);
      }
    }

    // Print audit results
    console.log('=== AUDIT RESULTS ===\n');

    console.log(`📊 Summary:`);
    console.log(`   Total Documents: ${documents.length}`);
    console.log(`   Staging Bucket: ${auditResults.stagingBucketDocs.length}`);
    console.log(`   Production Bucket: ${auditResults.productionBucketDocs.length}`);
    console.log(`   Completed Status: ${auditResults.completedDocs.length}`);
    console.log(`   Failed Status: ${auditResults.failedDocs.length}`);
    console.log(`   Missing Extensions: ${auditResults.missingExtensions.length}`);
    console.log(`   Suspicious Keys: ${auditResults.suspiciousKeys.length}\n`);

    // Documents in staging bucket (need migration)
    if (auditResults.stagingBucketDocs.length > 0) {
      console.log('🔄 Documents in Staging Bucket (May Need Migration):');
      auditResults.stagingBucketDocs.forEach(doc => {
        console.log(`   ${doc.id} | ${doc.fileName} | ${doc.status} | ${doc.key}`);
      });
      console.log('');
    }

    // Documents with missing extensions
    if (auditResults.missingExtensions.length > 0) {
      console.log('⚠️  Documents with Missing/Unknown Extensions:');
      auditResults.missingExtensions.forEach(doc => {
        console.log(`   ${doc.id} | ${doc.fileName} | ext: "${doc.extension}" | ${doc.key}`);
      });
      console.log('');
    }

    // Failed documents
    if (auditResults.failedDocs.length > 0) {
      console.log('❌ Failed Documents (May Have Orphaned S3 Objects):');
      auditResults.failedDocs.forEach(doc => {
        console.log(`   ${doc.id} | ${doc.fileName} | ${doc.bucket}/${doc.key}`);
      });
      console.log('');
    }

    // Generate migration commands for staging documents
    if (auditResults.stagingBucketDocs.length > 0) {
      console.log('=== MIGRATION COMMANDS ===\n');
      console.log('# AWS CLI commands to migrate staging documents to production:\n');

      auditResults.stagingBucketDocs.forEach(doc => {
        if (doc.status === 'completed' && doc.extension && doc.extension !== 'unknown') {
          const sourceKey = doc.key.startsWith('user_docs/')
            ? doc.key
            : `user_docs/${doc.userId}/${doc.key}`;
          const destKey = `user_docs/${doc.userId}/${doc.key.replace(/^user_docs\/[^\/]+\//, '')}.${doc.extension}`;

          console.log(`# ${doc.fileName} (${doc.id})`);
          console.log(
            `aws s3 cp "s3://${STAGING_BUCKET}/${sourceKey}" "s3://${PRODUCTION_BUCKET}/${destKey}"`
          );
          console.log('');
        }
      });
    }

    // Generate verification commands
    console.log('=== VERIFICATION COMMANDS ===\n');
    console.log('# Commands to verify production bucket contents:\n');

    auditResults.productionBucketDocs.forEach(doc => {
      if (doc.status === 'completed') {
        const expectedKey = doc.key.includes('.') ? doc.key : `${doc.key}.${doc.extension}`;
        console.log(`aws s3 ls "s3://${PRODUCTION_BUCKET}/${expectedKey}" # ${doc.fileName}`);
      }
    });
  } catch (error) {
    console.error('❌ Audit failed:', error.message);
    process.exit(1);
  }
}

async function main() {
  await connectToDatabase();
  await auditDocuments();
  await mongoose.disconnect();
  console.log('\n✅ Audit completed');
}

// Run the audit
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
}

module.exports = { auditDocuments };
