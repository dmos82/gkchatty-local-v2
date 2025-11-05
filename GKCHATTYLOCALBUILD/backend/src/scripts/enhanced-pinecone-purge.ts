import path from 'path';
import dotenv from 'dotenv';
import { Pinecone } from '@pinecone-database/pinecone';
import { generateEmbeddings } from '../utils/openaiHelper';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/**
 * ENHANCED PINECONE SYSTEM-KB PURGE SCRIPT
 *
 * This script provides multiple strategies for completely purging the system-kb namespace
 * with verification to ensure old vectors are completely removed.
 *
 * Usage: npx ts-node src/scripts/enhanced-pinecone-purge.ts [--verify-only]
 */

interface PurgeStrategy {
  name: string;
  execute: (index: any) => Promise<void>;
  description: string;
}

async function verifyNamespaceEmpty(index: any, namespace: string): Promise<boolean> {
  try {
    // Method 1: Check index stats
    const stats = await index.describeIndexStats();
    const namespaceStats = stats.namespaces?.[namespace];
    const recordCount = namespaceStats?.recordCount ?? 0;

    console.log(`📊 Index stats show ${recordCount} vectors in ${namespace} namespace`);

    if (recordCount > 0) {
      return false;
    }

    // Method 2: Try to query vectors
    console.log('🔍 Attempting to query vectors to double-check...');
    const testEmbeddings = await generateEmbeddings(['verification query']);
    const queryResult = await index.namespace(namespace).query({
      vector: testEmbeddings[0],
      topK: 10,
      includeMetadata: true,
    });

    const actualVectors = queryResult.matches?.length ?? 0;
    console.log(`🔍 Query returned ${actualVectors} vectors`);

    return actualVectors === 0;
  } catch (error: any) {
    console.log(`⚠️  Verification query failed (may indicate empty namespace): ${error.message}`);
    return true; // Assume empty if query fails
  }
}

async function waitForConsistency(seconds: number): Promise<void> {
  console.log(`⏳ Waiting ${seconds} seconds for Pinecone consistency...`);
  await new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

(async () => {
  try {
    const verifyOnly = process.argv.includes('--verify-only');

    console.log('🔧 ENHANCED PINECONE SYSTEM-KB PURGE');
    console.log('=====================================\n');

    // Initialize Pinecone
    const apiKey = process.env.PINECONE_API_KEY;
    const indexName = process.env.PINECONE_INDEX_NAME || 'gkchatty-staging';

    if (!apiKey) {
      console.error('❌ Missing PINECONE_API_KEY environment variable');
      process.exit(1);
    }

    console.log(`📊 Connecting to Pinecone index: ${indexName}`);
    const pinecone = new Pinecone({ apiKey });
    const index = pinecone.index(indexName);

    // Initial verification
    console.log('\n📈 INITIAL STATE VERIFICATION');
    console.log('------------------------------');

    const initialStats = await index.describeIndexStats();
    const initialCount = initialStats.namespaces?.['system-kb']?.recordCount ?? 0;
    console.log(`📊 Current vectors in system-kb: ${initialCount}`);

    if (verifyOnly) {
      console.log('\n🔍 VERIFICATION MODE - No purge will be performed');
      const isEmpty = await verifyNamespaceEmpty(index, 'system-kb');
      console.log(`\n✅ Namespace is ${isEmpty ? 'EMPTY' : 'NOT EMPTY'}`);
      return;
    }

    if (initialCount === 0) {
      console.log('✅ Namespace is already empty, no purge needed.');
      return;
    }

    // Define purge strategies
    const strategies: PurgeStrategy[] = [
      {
        name: 'Standard DeleteAll',
        description: 'Uses Pinecone deleteAll() method',
        execute: async idx => {
          await idx.namespace('system-kb').deleteMany({ deleteAll: true });
        },
      },
      {
        name: 'Explicit Empty Filter Delete',
        description: 'Uses deleteMany with empty filter object',
        execute: async idx => {
          await idx.namespace('system-kb').deleteMany({ filter: {} });
        },
      },
      {
        name: 'Source Type Filter Delete',
        description: 'Deletes by sourceType metadata filter',
        execute: async idx => {
          await idx.namespace('system-kb').deleteMany({
            filter: { sourceType: { $eq: 'system' } },
          });
        },
      },
    ];

    // Execute purge strategies
    for (let i = 0; i < strategies.length; i++) {
      const strategy = strategies[i];

      console.log(`\n🔧 STRATEGY ${i + 1}: ${strategy.name}`);
      console.log(`📝 ${strategy.description}`);
      console.log('-------------------------------------------');

      try {
        console.log(`🚀 Executing ${strategy.name}...`);
        await strategy.execute(index);
        console.log(`✅ ${strategy.name} completed without errors`);

        // Wait for consistency
        await waitForConsistency(5);

        // Verify results
        const isEmpty = await verifyNamespaceEmpty(index, 'system-kb');

        if (isEmpty) {
          console.log(`🎉 SUCCESS: ${strategy.name} successfully purged the namespace!`);
          break;
        } else {
          console.log(
            `⚠️  ${strategy.name} did not fully purge the namespace, trying next strategy...`
          );
        }
      } catch (error: any) {
        console.error(`❌ ${strategy.name} failed: ${error.message}`);

        if (i === strategies.length - 1) {
          console.error('❌ All purge strategies failed!');
          throw error;
        } else {
          console.log('🔄 Trying next strategy...');
        }
      }
    }

    // Final verification
    console.log('\n🏁 FINAL VERIFICATION');
    console.log('----------------------');

    await waitForConsistency(10); // Longer wait for final verification

    const finalEmpty = await verifyNamespaceEmpty(index, 'system-kb');
    const finalStats = await index.describeIndexStats();
    const finalCount = finalStats.namespaces?.['system-kb']?.recordCount ?? 0;

    console.log(`📊 Final vector count: ${finalCount}`);
    console.log(`✅ Namespace verified empty: ${finalEmpty}`);

    if (finalEmpty) {
      console.log('\n🎉 PURGE SUCCESSFUL!');
      console.log('The system-kb namespace has been completely cleared.');
      console.log('It is now safe to run the re-indexing process.');
    } else {
      console.log('\n❌ PURGE INCOMPLETE!');
      console.log('Some vectors may still remain in the namespace.');
      console.log('Manual intervention may be required.');
      process.exit(1);
    }
  } catch (error: any) {
    console.error('❌ Enhanced purge script failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  }
})();
