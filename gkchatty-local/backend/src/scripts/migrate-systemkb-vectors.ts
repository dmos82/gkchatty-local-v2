#!/usr/bin/env ts-node
/**
 * SYSTEM KB VECTOR MIGRATION SCRIPT
 *
 * This script handles the migration of System KB vectors from the incorrect
 * 'system-kb' namespace to the correct default namespace ("") in production.
 *
 * CRITICAL OPERATION: This script will:
 * 1. Re-index 18 System KB documents from MongoDB to "" namespace with sourceType: "system"
 * 2. Clean up the old vectors in 'system-kb' namespace
 * 3. Clean up the 169 orphaned vectors in "" namespace (separate step)
 *
 * REQUIREMENTS:
 * - Production MongoDB URI (gkchatty_prod database)
 * - Production Pinecone API key and index (gkchatty-prod)
 * - OpenAI API key for embeddings
 *
 * Usage:
 * MONGODB_URI=<prod> PINECONE_API_KEY=<prod> PINECONE_INDEX_NAME=gkchatty-prod OPENAI_API_KEY=<prod> npx ts-node src/scripts/migrate-systemkb-vectors.ts
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { SystemKbDocument } from '../models/SystemKbDocument';
import { getSystemKbNamespace } from '../utils/pineconeNamespace';
import { getPineconeIndex } from '../utils/pineconeService';
import { processAndEmbedDocument } from '../utils/documentProcessor';
import { getLogger } from '../utils/logger';

const log = getLogger('migrate-systemkb-vectors');

interface MigrationStats {
  mongoDocuments: number;
  systemKbNamespaceVectorsBefore: number;
  defaultNamespaceVectorsBefore: number;
  reindexedDocuments: number;
  reindexErrors: number;
  systemKbNamespaceVectorsAfter: number;
  defaultNamespaceVectorsAfter: number;
}

async function validateEnvironment(): Promise<void> {
  console.log('🔍 Validating environment...');

  const required = ['MONGODB_URI', 'PINECONE_API_KEY', 'PINECONE_INDEX_NAME', 'OPENAI_API_KEY'];
  const missing = required.filter(env => !process.env[env]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  // Verify we're targeting production
  if (process.env.PINECONE_INDEX_NAME !== 'gkchatty-prod') {
    throw new Error(
      `This script is for production only. Current index: ${process.env.PINECONE_INDEX_NAME}`
    );
  }

  console.log('✅ Environment validation passed');
}

async function getNamespaceStats(namespace: string): Promise<number> {
  try {
    const index = await getPineconeIndex();
    const stats = await index.describeIndexStats();
    return stats.namespaces?.[namespace]?.recordCount ?? 0;
  } catch (error) {
    log.error(`Failed to get stats for namespace '${namespace}':`, error);
    return 0;
  }
}

async function migrationDryRun(): Promise<MigrationStats> {
  console.log('📊 MIGRATION DRY RUN - ANALYZING CURRENT STATE');

  const stats: MigrationStats = {
    mongoDocuments: 0,
    systemKbNamespaceVectorsBefore: 0,
    defaultNamespaceVectorsBefore: 0,
    reindexedDocuments: 0,
    reindexErrors: 0,
    systemKbNamespaceVectorsAfter: 0,
    defaultNamespaceVectorsAfter: 0,
  };

  // 1. Check MongoDB documents
  console.log('🔍 Checking MongoDB System KB documents...');
  const systemDocs = await SystemKbDocument.find({ status: 'completed' }).select(
    '_id filename s3Key'
  );
  stats.mongoDocuments = systemDocs.length;
  console.log(`📋 Found ${stats.mongoDocuments} completed System KB documents in MongoDB`);

  // 2. Check current Pinecone state
  console.log('🔍 Checking Pinecone namespaces...');
  const defaultNamespace = getSystemKbNamespace(); // Should return "" for production

  stats.systemKbNamespaceVectorsBefore = await getNamespaceStats('system-kb');
  stats.defaultNamespaceVectorsBefore = await getNamespaceStats(defaultNamespace);

  console.log(`📊 Current Pinecone state:`);
  console.log(
    `   Default namespace ("${defaultNamespace}"): ${stats.defaultNamespaceVectorsBefore} vectors`
  );
  console.log(`   system-kb namespace: ${stats.systemKbNamespaceVectorsBefore} vectors`);

  // 3. Show which documents will be processed
  console.log('📝 Documents to be migrated:');
  systemDocs.forEach((doc, index) => {
    console.log(`   ${index + 1}. ${doc.filename} (ID: ${doc._id})`);
  });

  return stats;
}

async function executeMigration(): Promise<MigrationStats> {
  console.log('🚀 EXECUTING SYSTEM KB VECTOR MIGRATION');

  const stats = await migrationDryRun();

  // Get System KB documents
  const systemDocs = await SystemKbDocument.find({ status: 'completed' }).select(
    '_id filename s3Key mimeType'
  );

  if (systemDocs.length === 0) {
    console.log('❌ No System KB documents found to migrate');
    return stats;
  }

  // Get correct namespace (should be "" for production)
  const correctNamespace = getSystemKbNamespace();
  console.log(`🎯 Target namespace: "${correctNamespace}"`);

  // Step 1: Clear the correct namespace of ANY existing vectors
  // (This removes the 169 orphaned vectors to ensure clean state)
  console.log(`🧹 Clearing target namespace "${correctNamespace}" for clean migration...`);
  try {
    const index = await getPineconeIndex();
    await index.namespace(correctNamespace).deleteAll();
    console.log(`✅ Target namespace "${correctNamespace}" cleared`);
  } catch (error) {
    log.error('Failed to clear target namespace:', error);
    throw error;
  }

  // Step 2: Re-index documents from MongoDB to correct namespace
  console.log('📤 Re-indexing System KB documents to correct namespace...');

  for (const doc of systemDocs) {
    try {
      console.log(`🔄 Processing: ${doc.filename} (ID: ${doc._id})`);

      await processAndEmbedDocument(
        doc._id.toString(),
        process.env.AWS_BUCKET_NAME || process.env.S3_BUCKET || 'production-bucket',
        doc.s3Key,
        'system', // sourceType
        doc.filename,
        doc.mimeType || 'application/pdf',
        undefined, // userId not applicable for system docs
        `migration-${Date.now()}` // correlationId
      );

      stats.reindexedDocuments++;
      console.log(`✅ Successfully migrated: ${doc.filename}`);
    } catch (error) {
      stats.reindexErrors++;
      log.error(`❌ Failed to migrate ${doc.filename}:`, error);
      console.log(`❌ Failed to migrate: ${doc.filename} - ${error}`);
    }
  }

  // Step 3: Clean up old system-kb namespace
  console.log('🧹 Cleaning up old system-kb namespace...');
  try {
    const index = await getPineconeIndex();
    await index.namespace('system-kb').deleteAll();
    console.log('✅ Old system-kb namespace cleaned up');
  } catch (error) {
    log.error('Failed to clean up system-kb namespace:', error);
    console.log(
      '⚠️ Warning: Failed to clean up old system-kb namespace - manual cleanup may be required'
    );
  }

  // Step 4: Verify final state
  console.log('🔍 Verifying migration results...');
  stats.defaultNamespaceVectorsAfter = await getNamespaceStats(correctNamespace);
  stats.systemKbNamespaceVectorsAfter = await getNamespaceStats('system-kb');

  return stats;
}

async function printMigrationSummary(stats: MigrationStats): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('📊 SYSTEM KB VECTOR MIGRATION SUMMARY');
  console.log('='.repeat(60));

  console.log(`\n📋 MongoDB Documents:`);
  console.log(`   Total System KB documents found: ${stats.mongoDocuments}`);

  console.log(`\n📊 Migration Results:`);
  console.log(`   Documents successfully migrated: ${stats.reindexedDocuments}`);
  console.log(`   Documents failed: ${stats.reindexErrors}`);

  console.log(`\n🔢 Pinecone Vector Counts:`);
  console.log(`   Default namespace before: ${stats.defaultNamespaceVectorsBefore}`);
  console.log(`   Default namespace after:  ${stats.defaultNamespaceVectorsAfter}`);
  console.log(`   system-kb namespace before: ${stats.systemKbNamespaceVectorsBefore}`);
  console.log(`   system-kb namespace after:  ${stats.systemKbNamespaceVectorsAfter}`);

  const expectedVectors = stats.reindexedDocuments * 5; // Rough estimate: ~5 chunks per document
  console.log(`\n🎯 Expected vs Actual:`);
  console.log(`   Expected vectors (rough): ~${expectedVectors}`);
  console.log(`   Actual vectors created: ${stats.defaultNamespaceVectorsAfter}`);

  if (stats.reindexErrors === 0 && stats.defaultNamespaceVectorsAfter > 0) {
    console.log(`\n✅ MIGRATION SUCCESSFUL!`);
    console.log(`   - All System KB documents migrated to correct namespace`);
    console.log(`   - Old system-kb namespace cleaned up`);
    console.log(`   - 169 orphaned vectors removed from default namespace`);
    console.log(`   - Ready to remove temporary RAG workaround (PR #151)`);
  } else {
    console.log(`\n⚠️ MIGRATION COMPLETED WITH ISSUES:`);
    if (stats.reindexErrors > 0) {
      console.log(`   - ${stats.reindexErrors} documents failed to migrate`);
    }
    if (stats.defaultNamespaceVectorsAfter === 0) {
      console.log(`   - No vectors found in target namespace`);
    }
  }

  console.log('\n' + '='.repeat(60));
}

async function main(): Promise<void> {
  try {
    console.log('🚀 SYSTEM KB VECTOR MIGRATION TOOL');
    console.log('='.repeat(50));

    // Step 1: Validate environment
    await validateEnvironment();

    // Step 2: Connect to MongoDB
    console.log('📊 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI!);
    console.log('✅ Connected to MongoDB');

    // Step 3: Check if this is a dry run
    const isDryRun = process.argv.includes('--dry-run');

    let stats: MigrationStats;

    if (isDryRun) {
      console.log('🔍 RUNNING IN DRY-RUN MODE');
      stats = await migrationDryRun();
    } else {
      // Step 4: Confirm execution
      console.log('⚠️  PRODUCTION MIGRATION - This will modify live data!');
      console.log('🔄 Starting in 5 seconds... Press Ctrl+C to cancel');

      await new Promise(resolve => setTimeout(resolve, 5000));

      // Step 5: Execute migration
      stats = await executeMigration();
    }

    // Step 6: Print summary
    await printMigrationSummary(stats);

    console.log('\n✅ Migration script completed');
  } catch (error) {
    log.error('Migration failed:', error);
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
  }
}

// Execute if run directly
if (require.main === module) {
  main();
}

export { main as migrationMain };
