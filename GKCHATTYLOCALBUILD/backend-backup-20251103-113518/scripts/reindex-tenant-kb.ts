import mongoose from 'mongoose';
import { config } from 'dotenv';
import { UserDocument } from '../models/UserDocument';
import { TenantKnowledgeBase } from '../models/TenantKnowledgeBase';
import { processAndEmbedDocument } from '../utils/documentProcessor';
import { deleteVectorsByFilter } from '../utils/pineconeService';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';

// Load environment variables from the correct path
config({ path: path.resolve(__dirname, '../../.env') });

/**
 * Script to reindex all documents for a specific Tenant Knowledge Base
 *
 * This script:
 * 1. Connects to MongoDB
 * 2. Fetches the specified Tenant KB
 * 3. Clears all existing vectors for this KB from Pinecone
 * 4. Fetches all documents associated with the KB
 * 5. Re-processes each document using the existing pipeline
 * 6. Updates document counts on the Tenant KB
 *
 * Usage: ts-node apps/api/src/scripts/reindex-tenant-kb.ts <tenantKbId>
 * Example:
 *   ts-node apps/api/src/scripts/reindex-tenant-kb.ts 6841d3e39dfec2f57c3c8421
 */
async function reindexTenantKB(): Promise<void> {
  const correlationId = uuidv4();

  // Get tenantKbId from command line arguments
  const tenantKbId = process.argv[2];

  if (!tenantKbId) {
    console.error('❌ Error: tenantKbId is required');
    console.error('Usage: ts-node apps/api/src/scripts/reindex-tenant-kb.ts <tenantKbId>');
    console.error(
      'Example: ts-node apps/api/src/scripts/reindex-tenant-kb.ts 6841d3e39dfec2f57c3c8421'
    );
    process.exit(1);
  }

  console.log(`\n=== TENANT KB REINDEX SCRIPT START ===`);
  console.log(`Correlation ID: ${correlationId}`);
  console.log(`Tenant KB ID: ${tenantKbId}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`MongoDB URI: ${process.env.MONGODB_URI ? '[CONFIGURED]' : '[MISSING]'}`);
  console.log(`Pinecone API Key: ${process.env.PINECONE_API_KEY ? '[CONFIGURED]' : '[MISSING]'}\n`);

  try {
    // Step 1: Connect to MongoDB
    console.log('🔌 Step 1: Connecting to MongoDB...');
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI environment variable is not set');
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB successfully\n');

    // Step 2: Fetch and validate Tenant KB
    console.log('🔍 Step 2: Fetching Tenant KB...');
    const tenantKb = await TenantKnowledgeBase.findById(tenantKbId);

    if (!tenantKb) {
      throw new Error(`Tenant KB with ID ${tenantKbId} not found`);
    }

    console.log(`✅ Found Tenant KB: "${tenantKb.name}"`);
    console.log(`   - Slug: ${tenantKb.slug}`);
    console.log(`   - S3 Prefix: ${tenantKb.s3Prefix}`);
    console.log(`   - Current Document Count: ${tenantKb.documentCount}`);
    console.log(`   - Is Active: ${tenantKb.isActive}\n`);

    // Step 3: Clear existing vectors from Pinecone
    console.log('🧹 Step 3: Clearing existing vectors from Pinecone...');
    try {
      // Delete vectors using metadata filter for this tenant KB
      // Tenant KB vectors are stored in the system-kb namespace
      const vectorFilter = { tenantKbId: tenantKbId };

      console.log(`   - Filter: ${JSON.stringify(vectorFilter)}`);
      console.log('   - Namespace: system-kb');

      await deleteVectorsByFilter(vectorFilter, 'system-kb');

      console.log('✅ Vector deletion request submitted to Pinecone');
      console.log('   Note: Pinecone deletion is asynchronous and may take a few moments');

      // Wait for deletion to propagate
      console.log('⏳ Waiting 5 seconds for vector deletion to propagate...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      console.log('✅ Deletion wait period completed\n');
    } catch (deleteError: any) {
      console.warn(`⚠️  Warning: Error deleting vectors from Pinecone: ${deleteError.message}`);
      console.log('   Continuing with reindexing process...\n');
    }

    // Step 4: Fetch documents to reindex
    console.log('📄 Step 4: Fetching documents to reindex...');
    const documents = await UserDocument.find({
      tenantKbId: tenantKbId,
      sourceType: 'tenant',
    }).select('_id originalFileName s3Bucket s3Key mimeType file_extension fileSize status userId');

    console.log(`✅ Found ${documents.length} documents for Tenant KB "${tenantKb.name}"`);

    if (documents.length === 0) {
      console.log('ℹ️  No documents found for this Tenant KB. Updating counts and exiting.\n');

      // Update document counts to reflect reality
      await TenantKnowledgeBase.findByIdAndUpdate(tenantKbId, {
        documentCount: 0,
        lastModifiedBy: tenantKb.createdBy, // Use creator as modifier since this is a system operation
      });

      console.log('✅ Document counts updated successfully');
      console.log('\n=== TENANT KB REINDEX COMPLETED ===');
      return;
    }

    console.log('📋 Documents to process:');
    documents.forEach((doc, index) => {
      console.log(`   ${index + 1}. ${doc.originalFileName} (${doc.status})`);
    });
    console.log('');

    // Step 5: Reprocess each document
    console.log('🔄 Step 5: Reprocessing documents...');
    let successCount = 0;
    let failureCount = 0;
    const failedDocs: Array<{ id: string; name: string; error: string }> = [];

    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      const progressPrefix = `[${i + 1}/${documents.length}]`;

      console.log(`${progressPrefix} Processing: ${doc.originalFileName}`);
      console.log(`   - Document ID: ${doc._id}`);
      console.log(`   - S3 Key: ${doc.s3Key}`);
      console.log(`   - Current Status: ${doc.status}`);

      try {
        // Prepare parameters for processUserDocument
        const documentId = doc._id.toString();
        const s3Bucket = doc.s3Bucket;
        const s3Key = doc.s3Key;
        const userId = doc.userId?.toString() || tenantKb.createdBy.toString();

        // Call the document processing pipeline with correct parameters for tenant documents
        await processAndEmbedDocument(
          documentId,
          s3Bucket,
          s3Key,
          'tenant', // Correct source type for tenant KB documents
          doc.originalFileName,
          doc.mimeType,
          userId,
          correlationId, // Pass correlation ID for logging
          undefined, // No extracted text
          tenantKbId // Pass the tenant KB ID for proper metadata
        );

        successCount++;
        console.log(`   ✅ Successfully processed: ${doc.originalFileName}\n`);
      } catch (error: any) {
        failureCount++;
        const errorMessage = error.message || 'Unknown processing error';
        failedDocs.push({
          id: doc._id.toString(),
          name: doc.originalFileName,
          error: errorMessage,
        });

        console.error(`   ❌ Failed to process: ${doc.originalFileName}`);
        console.error(`   Error: ${errorMessage}\n`);

        // Continue processing other documents
        continue;
      }
    }

    // Step 6: Update Tenant KB counts
    console.log('📊 Step 6: Updating Tenant KB document counts...');

    // Count completed documents
    const completedDocs = await UserDocument.countDocuments({
      tenantKbId: tenantKbId,
      sourceType: 'tenant',
      status: 'completed',
    });

    const totalDocs = await UserDocument.countDocuments({
      tenantKbId: tenantKbId,
      sourceType: 'tenant',
    });

    // Update the Tenant KB with accurate counts
    await TenantKnowledgeBase.findByIdAndUpdate(tenantKbId, {
      documentCount: totalDocs,
      lastModifiedBy: tenantKb.createdBy, // Use creator as modifier since this is a system operation
    });

    console.log(`✅ Updated Tenant KB counts:`);
    console.log(`   - Total Documents: ${totalDocs}`);
    console.log(`   - Completed Documents: ${completedDocs}\n`);

    // Step 7: Display final summary
    console.log('📋 REINDEX SUMMARY:');
    console.log(`   - Tenant KB: "${tenantKb.name}" (${tenantKb.slug})`);
    console.log(`   - Total Documents Found: ${documents.length}`);
    console.log(`   - Successfully Processed: ${successCount}`);
    console.log(`   - Failed to Process: ${failureCount}`);
    console.log(`   - Final Document Count: ${totalDocs}`);
    console.log(`   - Final Completed Count: ${completedDocs}`);

    if (failedDocs.length > 0) {
      console.log('\n❌ FAILED DOCUMENTS:');
      failedDocs.forEach((failed, index) => {
        console.log(`   ${index + 1}. ${failed.name} (ID: ${failed.id})`);
        console.log(`      Error: ${failed.error}`);
      });
    }

    console.log(`\n✅ Reindex process completed successfully for Tenant KB: "${tenantKb.name}"`);
    console.log(`   Processed ${successCount} documents with ${failureCount} failures`);
  } catch (error: any) {
    console.error('\n❌ FATAL ERROR during reindex process:');
    console.error(`   Error: ${error.message}`);
    console.error(`   Stack: ${error.stack}`);
    process.exit(1);
  } finally {
    // Step 8: Cleanup - Close MongoDB connection
    console.log('\n🔌 Closing MongoDB connection...');
    try {
      await mongoose.disconnect();
      console.log('✅ MongoDB connection closed successfully');
    } catch (disconnectError: any) {
      console.error(`❌ Error closing MongoDB connection: ${disconnectError.message}`);
    }

    console.log('\n=== TENANT KB REINDEX SCRIPT END ===');
    console.log(`Timestamp: ${new Date().toISOString()}`);
  }
}

// Execute the script if called directly
if (require.main === module) {
  reindexTenantKB().catch(error => {
    console.error('\n💥 UNHANDLED ERROR:', error);
    process.exit(1);
  });
}

export { reindexTenantKB };
