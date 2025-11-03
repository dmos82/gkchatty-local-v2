import { Pinecone } from '@pinecone-database/pinecone';
import dotenv from 'dotenv';
import path from 'path';
import { generateEmbeddings } from '../utils/openaiHelper';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/**
 * PINECONE SYSTEM-KB NAMESPACE DIAGNOSTIC SCRIPT
 *
 * This script investigates the state of the Pinecone system-kb namespace
 * to understand why old vector metadata persists after re-indexing operations.
 *
 * Usage: npx ts-node src/scripts/diagnose-pinecone-system-kb.ts
 */

interface VectorMetadata {
  documentId?: string;
  originalFileName?: string;
  sourceType?: string;
  reindexedAt?: string;
  version?: string;
  s3Key?: string;
  chunkIndex?: number;
  totalChunks?: number;
}

(async () => {
  try {
    console.log('🔍 PINECONE SYSTEM-KB NAMESPACE DIAGNOSTIC');
    console.log('==========================================\n');

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

    // Step 1: Get overall index statistics
    console.log('\n📈 STEP 1: Index Statistics');
    console.log('----------------------------');

    const indexStats = await index.describeIndexStats();
    console.log('📋 Full Index Stats:', JSON.stringify(indexStats, null, 2));

    const systemKbStats = indexStats.namespaces?.['system-kb'];
    const systemKbCount = systemKbStats?.recordCount ?? 0;

    console.log(`📊 Total vectors in system-kb namespace: ${systemKbCount}`);
    console.log(`📊 Expected vectors (21 docs × ~5 chunks): ~105-110 vectors`);

    if (systemKbCount === 0) {
      console.log('⚠️  WARNING: No vectors found in system-kb namespace!');
      console.log('   This suggests the purge worked but re-indexing failed.');
      return;
    }

    // Step 2: Query vectors to inspect metadata
    console.log('\n🔍 STEP 2: Vector Metadata Analysis');
    console.log('------------------------------------');

    // Generate a test embedding for querying
    console.log('🧠 Generating test embedding for vector queries...');
    const testEmbeddings = await generateEmbeddings(['test query for metadata inspection']);
    const testEmbedding = testEmbeddings[0];

    // Query a larger sample of vectors
    console.log('🔍 Querying 50 vectors from system-kb namespace...');
    const queryResult = await index.namespace('system-kb').query({
      vector: testEmbedding,
      topK: 50,
      includeMetadata: true,
    });

    const vectors = queryResult.matches || [];
    console.log(`📋 Retrieved ${vectors.length} vectors for analysis`);

    if (vectors.length === 0) {
      console.log('⚠️  WARNING: No vectors returned from query!');
      return;
    }

    // Step 3: Analyze metadata patterns
    console.log('\n📊 STEP 3: Metadata Pattern Analysis');
    console.log('-------------------------------------');

    const documentIds = new Set<string>();
    const reindexVersions = new Set<string>();
    const reindexDates = new Set<string>();
    const sourceTypes = new Set<string>();

    let oldFormatCount = 0;
    let newFormatCount = 0;

    vectors.forEach((vector, index) => {
      const metadata = vector.metadata as VectorMetadata;

      if (metadata.documentId) {
        documentIds.add(metadata.documentId);
      }

      if (metadata.version) {
        reindexVersions.add(metadata.version);
      }

      if (metadata.reindexedAt) {
        reindexDates.add(metadata.reindexedAt.split('T')[0]); // Group by date
      }

      if (metadata.sourceType) {
        sourceTypes.add(metadata.sourceType);
      }

      // Check if this looks like old vs new format
      const hasReindexedAt = !!metadata.reindexedAt;
      const hasVersion = !!metadata.version;

      if (hasReindexedAt && hasVersion) {
        newFormatCount++;
      } else {
        oldFormatCount++;
      }

      // Show first 5 vectors in detail
      if (index < 5) {
        console.log(`\n📄 Vector ${index + 1} (ID: ${vector.id}):`);
        console.log(`   Score: ${vector.score}`);
        console.log(`   DocumentId: ${metadata.documentId || 'MISSING'}`);
        console.log(`   FileName: ${metadata.originalFileName || 'MISSING'}`);
        console.log(`   Version: ${metadata.version || 'MISSING'}`);
        console.log(`   ReindexedAt: ${metadata.reindexedAt || 'MISSING'}`);
        console.log(`   SourceType: ${metadata.sourceType || 'MISSING'}`);
        console.log(`   ChunkIndex: ${metadata.chunkIndex ?? 'MISSING'}`);
      }
    });

    // Step 4: Summary Analysis
    console.log('\n📊 STEP 4: Summary Analysis');
    console.log('----------------------------');

    console.log(`📊 Unique Document IDs found: ${documentIds.size}`);
    console.log(`📊 Reindex versions found: ${Array.from(reindexVersions).join(', ') || 'NONE'}`);
    console.log(`📊 Reindex dates found: ${Array.from(reindexDates).join(', ') || 'NONE'}`);
    console.log(`📊 Source types found: ${Array.from(sourceTypes).join(', ') || 'NONE'}`);
    console.log(`📊 New format vectors (with reindexedAt): ${newFormatCount}`);
    console.log(`📊 Old format vectors (without reindexedAt): ${oldFormatCount}`);

    // Step 5: Document ID Analysis
    console.log('\n🔍 STEP 5: Document ID Analysis');
    console.log('--------------------------------');

    const documentIdArray = Array.from(documentIds);
    console.log('\n📋 All unique Document IDs found:');
    documentIdArray.forEach((docId, index) => {
      console.log(`   ${index + 1}. ${docId}`);
    });

    // Check for problematic IDs (the one mentioned in the issue)
    const problematicId = '685a13b614e026eb1089a897';
    const hasProblematicId = documentIds.has(problematicId);

    console.log(
      `\n🚨 Problematic ID (${problematicId}) present: ${hasProblematicId ? 'YES' : 'NO'}`
    );

    if (hasProblematicId) {
      console.log('❌ ISSUE CONFIRMED: Old document ID still present in Pinecone!');
      console.log('   This explains why source document viewing fails with 404.');
    }

    // Step 6: Recommendations
    console.log('\n💡 STEP 6: Diagnostic Conclusions & Recommendations');
    console.log('---------------------------------------------------');

    if (oldFormatCount > 0) {
      console.log('❌ ISSUE: Old format vectors detected without reindexedAt timestamp');
      console.log('   Recommendation: The deleteAll operation may not be working properly');
    }

    if (hasProblematicId) {
      console.log('❌ ISSUE: Stale document IDs present in vector metadata');
      console.log('   Recommendation: Implement more aggressive purge strategy');
    }

    if (systemKbCount > 150) {
      console.log('⚠️  WARNING: Vector count higher than expected');
      console.log('   This suggests old vectors may not be fully purged');
    }

    if (reindexVersions.size === 0) {
      console.log('❌ ISSUE: No version metadata found');
      console.log('   This suggests vectors are from old indexing process');
    }

    console.log('\n🔧 RECOMMENDED ACTIONS:');
    console.log('1. Implement namespace-specific deleteAll with verification');
    console.log('2. Add longer delay after purge before re-indexing');
    console.log('3. Implement vector count verification before/after operations');
    console.log("4. Consider using Pinecone's deleteAll() followed by manual verification");
  } catch (error: any) {
    console.error('❌ Diagnostic script failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  }
})();
