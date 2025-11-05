#!/usr/bin/env npx ts-node

/**
 * EMERGENCY PRODUCTION FIX
 * Purge stale Pinecone vectors causing 404 errors
 * Run: npx ts-node apps/api/src/scripts/emergency-production-fix.ts
 */

import { Pinecone } from '@pinecone-database/pinecone';
import { config } from 'dotenv';

// Load environment variables
config();

const STALE_DOCUMENT_IDS = [
  '685a13b614e026eb1089a897', // Known problematic ID causing 404s
];

async function emergencyFix() {
  console.log('🚨 EMERGENCY PRODUCTION FIX - STARTING');
  console.log('=====================================');

  try {
    // Initialize Pinecone
    const apiKey = process.env.PINECONE_API_KEY;
    const indexName = process.env.PINECONE_INDEX_NAME || 'gkchatty-staging';

    if (!apiKey) {
      throw new Error('Missing PINECONE_API_KEY');
    }

    console.log('🔧 Connecting to Pinecone...');
    const pinecone = new Pinecone({ apiKey });
    const index = pinecone.index(indexName);
    const systemNamespace = index.namespace('system-kb');

    // Step 1: Query vectors with stale document IDs
    console.log('🔍 Step 1: Identifying stale vectors...');

    const testEmbedding = Array(1536).fill(0.1); // Dummy embedding for query
    const queryResult = await systemNamespace.query({
      vector: testEmbedding,
      topK: 100,
      includeMetadata: true,
    });

    const staleVectorIds: string[] = [];

    for (const match of queryResult.matches || []) {
      const documentId = match.metadata?.documentId as string;
      if (documentId && STALE_DOCUMENT_IDS.includes(documentId)) {
        staleVectorIds.push(match.id);
        console.log(`❌ Found stale vector: ${match.id} (documentId: ${documentId})`);
      }
    }

    console.log(`📊 Found ${staleVectorIds.length} stale vectors to delete`);

    // Step 2: Delete stale vectors
    if (staleVectorIds.length > 0) {
      console.log('🗑️  Step 2: Deleting stale vectors...');

      // Delete in batches of 100
      const batchSize = 100;
      for (let i = 0; i < staleVectorIds.length; i += batchSize) {
        const batch = staleVectorIds.slice(i, i + batchSize);
        console.log(
          `   Deleting batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(staleVectorIds.length / batchSize)}...`
        );

        await systemNamespace.deleteMany(batch);

        // Wait for consistency
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      console.log('✅ Stale vectors deleted successfully');
    } else {
      console.log('✅ No stale vectors found');
    }

    // Step 3: Verify cleanup
    console.log('🔍 Step 3: Verifying cleanup...');

    const verifyResult = await systemNamespace.query({
      vector: testEmbedding,
      topK: 50,
      includeMetadata: true,
    });

    let foundStaleAfterCleanup = false;
    for (const match of verifyResult.matches || []) {
      const documentId = match.metadata?.documentId as string;
      if (documentId && STALE_DOCUMENT_IDS.includes(documentId)) {
        console.log(`❌ WARNING: Stale vector still found: ${match.id}`);
        foundStaleAfterCleanup = true;
      }
    }

    if (!foundStaleAfterCleanup) {
      console.log('✅ Cleanup verification passed - no stale vectors found');
    }

    // Step 4: Get current stats
    console.log('📊 Step 4: Current namespace stats...');
    const stats = await index.describeIndexStats();
    const systemKbCount = stats.namespaces?.['system-kb']?.recordCount || 0;
    console.log(`📊 Current system-kb vector count: ${systemKbCount}`);

    console.log('\n✅ EMERGENCY FIX COMPLETE');
    console.log('========================');
    console.log('🎯 This should resolve the 404 errors immediately');
    console.log('🔄 Test by refreshing the frontend and clicking source documents');
  } catch (error) {
    console.error('❌ EMERGENCY FIX FAILED:', error);
    throw error;
  }
}

// Run the fix
emergencyFix()
  .then(() => {
    console.log('✅ Emergency fix completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Emergency fix failed:', error);
    process.exit(1);
  });
