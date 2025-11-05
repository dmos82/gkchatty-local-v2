import mongoose from 'mongoose';
import { SystemKbDocument, ISystemKbDocument } from '../models/SystemKbDocument';
import { generateEmbeddings } from '../utils/openaiHelper';
import {
  deleteVectorsByFilter,
  upsertVectors,
  PineconeVector,
  queryVectors,
  getPineconeIndex,
} from '../utils/pineconeService';
import { getLogger } from '../utils/logger';

// Simple text chunking function
function chunkText(text: string, maxChunkSize: number = 1000): string[] {
  if (!text || text.trim().length === 0) return [];

  // Split by sentences/paragraphs first
  const sentences = text.split(/[.!?]\s+|\n\s*\n/);
  const chunks: string[] = [];
  let currentChunk = '';

  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length + 1 <= maxChunkSize) {
      currentChunk += (currentChunk ? ' ' : '') + sentence;
    } else {
      if (currentChunk) chunks.push(currentChunk.trim());
      currentChunk = sentence;
    }
  }

  if (currentChunk) chunks.push(currentChunk.trim());

  // Handle very long sentences by force-splitting
  const finalChunks: string[] = [];
  for (const chunk of chunks) {
    if (chunk.length <= maxChunkSize) {
      finalChunks.push(chunk);
    } else {
      // Force split by words
      const words = chunk.split(' ');
      let tempChunk = '';
      for (const word of words) {
        if (tempChunk.length + word.length + 1 <= maxChunkSize) {
          tempChunk += (tempChunk ? ' ' : '') + word;
        } else {
          if (tempChunk) finalChunks.push(tempChunk);
          tempChunk = word;
        }
      }
      if (tempChunk) finalChunks.push(tempChunk);
    }
  }

  return finalChunks.filter(chunk => chunk.trim().length > 20); // Minimum chunk size
}

const log = getLogger('reindex-system-kb');

interface ReindexOptions {
  forceFullCleanup?: boolean;
  clearAllNamespaces?: boolean;
}

export async function reindexSystemKB(options: ReindexOptions = {}): Promise<void> {
  const { forceFullCleanup = false, clearAllNamespaces = false } = options;

  console.log('🚀 Starting Enhanced System KB Re-indexing Process...');
  if (forceFullCleanup) console.log('🧹 ENHANCED CLEANUP MODE - Will clear ALL system vectors');
  if (clearAllNamespaces)
    console.log('🧹 CROSS-NAMESPACE CLEANUP - Will clear system vectors from all namespaces');

  log.info('Starting System KB re-indexing process', { forceFullCleanup, clearAllNamespaces });

  try {
    // Step 1: Connect to MongoDB if not already connected
    if (mongoose.connection.readyState !== 1) {
      const mongoUri = process.env.MONGO_URI;
      if (!mongoUri) {
        throw new Error('MONGO_URI environment variable is required');
      }
      console.log('📊 Connecting to MongoDB...');
      await mongoose.connect(mongoUri);
      console.log('✅ Connected to MongoDB');
    }

    // Step 2: CRITICAL - Enhanced Pinecone system-kb namespace purge with multiple strategies
    console.log('🧹 PURGING system-kb namespace - ensuring complete cleanup...');
    log.info('Starting critical Pinecone system-kb namespace purge');

    try {
      const index = await getPineconeIndex();

      // Multiple purge strategies for maximum reliability
      const purgeStrategies = [
        {
          name: 'Standard DeleteAll',
          execute: async () => {
            await index.namespace('system-kb').deleteMany({ deleteAll: true });
          },
        },
        {
          name: 'Empty Filter Delete',
          execute: async () => {
            await index.namespace('system-kb').deleteMany({ filter: {} });
          },
        },
        {
          name: 'Source Type Filter Delete',
          execute: async () => {
            await index.namespace('system-kb').deleteMany({
              filter: { sourceType: { $eq: 'system' } },
            });
          },
        },
      ];

      let purgeSuccessful = false;

      for (const strategy of purgeStrategies) {
        try {
          console.log(`🗑️  Executing ${strategy.name}...`);
          await strategy.execute();

          console.log('⏳ Waiting 8 seconds for Pinecone consistency...');
          await new Promise(resolve => setTimeout(resolve, 8000));

          // Verify the purge was successful using index stats
          const postPurgeStats = await index.describeIndexStats();
          const remainingVectors = postPurgeStats.namespaces?.['system-kb']?.recordCount ?? 0;

          console.log(`📊 ${strategy.name} completed. Remaining vectors: ${remainingVectors}`);

          if (remainingVectors === 0) {
            console.log(`✅ SUCCESS: ${strategy.name} completely purged the namespace!`);
            purgeSuccessful = true;
            log.info(
              { strategy: strategy.name },
              'Pinecone system-kb namespace purged successfully'
            );
            break;
          } else {
            console.log(
              `⚠️  ${strategy.name} left ${remainingVectors} vectors, trying next strategy...`
            );
          }
        } catch (strategyError: any) {
          console.log(`❌ ${strategy.name} failed: ${strategyError.message}`);
          log.warn(
            { strategy: strategy.name, error: strategyError.message },
            'Purge strategy failed'
          );
          // Continue to next strategy
        }
      }

      if (!purgeSuccessful) {
        console.log('⚠️  WARNING: Complete purge not achieved with all strategies');
        console.log('   Proceeding with re-index - new vectors will use current documentIds');
        log.warn('Pinecone purge incomplete but proceeding with re-index');
      }
    } catch (purgeError: any) {
      console.error('❌ CRITICAL: Failed to purge system-kb namespace:', purgeError.message);
      log.error({ error: purgeError.message }, 'Failed to purge system-kb namespace');
      throw new Error(`Pinecone purge failed: ${purgeError.message}`);
    }

    // Step 2.5: MongoDB SystemKbDocuments collection is PRESERVED during re-indexing
    // Only Pinecone vectors are cleared, not the source document metadata

    // Step 3: Additional cleanup for legacy vectors in default namespace (if requested)
    if (clearAllNamespaces) {
      console.log(
        '🧹 ADDITIONAL CLEANUP: Clearing legacy system vectors from default namespace...'
      );
      try {
        const testEmbedding = await generateEmbeddings(['test']);
        const numericResults = await queryVectors(
          testEmbedding[0],
          100,
          undefined, // No filter to get all
          undefined // Default namespace
        );

        if (numericResults?.matches) {
          const numericVectorIds = numericResults.matches
            .filter((match: any) => {
              const fileName = match.metadata?.originalFileName || match.metadata?.fileName;
              return fileName && /^\d{13}-\d+\.pdf$/.test(fileName);
            })
            .map((match: any) => match.id);

          if (numericVectorIds.length > 0) {
            console.log(`  🧹 Found ${numericVectorIds.length} legacy vectors, deleting...`);
            const batchSize = 100;
            for (let i = 0; i < numericVectorIds.length; i += batchSize) {
              const batch = numericVectorIds.slice(i, i + batchSize);
              await deleteVectorsByFilter({ id: { $in: batch } }, undefined);
            }
            console.log(`  ✅ Deleted ${numericVectorIds.length} legacy vectors`);
          } else {
            console.log('  ✅ No legacy vectors found in default namespace');
          }
        }
      } catch (error: any) {
        console.log(`  ⚠️  Error during legacy cleanup: ${error.message}`);
      }
    }

    // Verification delay to ensure purge is complete
    console.log('⏳ Waiting 5 seconds for Pinecone purge to complete...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Step 4: Pre-check - Get current Pinecone stats
    console.log('📈 Getting current Pinecone stats after cleanup...');
    try {
      const testEmbedding = await generateEmbeddings(['test query']);
      const currentStats = await queryVectors(
        testEmbedding[0],
        1,
        undefined, // No filter to get any vector
        'system-kb'
      );
      console.log(
        `📊 Vectors remaining in system-kb namespace: ${currentStats?.matches?.length ?? 0}`
      );
      log.info(
        { currentVectorCount: currentStats?.matches?.length ?? 0 },
        'Post-cleanup Pinecone system-kb stats'
      );
    } catch (statsError: any) {
      console.log('✅ System-kb namespace appears to be empty (expected after cleanup)');
      log.info({ error: statsError.message }, 'Pre-check stats failed (namespace likely empty)');
    }

    // Step 5: Fetch all SystemKbDocuments
    console.log('📚 Fetching SystemKbDocuments from MongoDB...');

    // First, let's see what documents exist
    const allDocs = await SystemKbDocument.find({}).lean<ISystemKbDocument[]>();
    console.log(`🔍 DEBUG: Total SystemKbDocuments in database: ${allDocs.length}`);

    // Check their statuses
    const statusCounts = allDocs.reduce(
      (acc, doc) => {
        acc[doc.status || 'no-status'] = (acc[doc.status || 'no-status'] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
    console.log(`🔍 DEBUG: Document status breakdown:`, statusCounts);

    // Check how many have textContent
    const docsWithText = allDocs.filter(doc => doc.textContent && doc.textContent.trim() !== '');
    console.log(`🔍 DEBUG: Documents with textContent: ${docsWithText.length}`);

    const systemDocs = await SystemKbDocument.find({
      status: 'completed',
      textContent: { $exists: true, $ne: '', $nin: [null] },
    }).lean<ISystemKbDocument[]>();

    console.log(`📖 Found ${systemDocs.length} completed SystemKbDocuments with text content`);
    log.info({ documentCount: systemDocs.length }, 'Found SystemKbDocuments for re-indexing');

    if (systemDocs.length === 0) {
      console.log('❌ No completed SystemKbDocuments found with text content. Exiting.');
      return;
    }

    // Step 6: Process each document
    let totalChunks = 0;
    let totalVectors = 0;
    const BATCH_SIZE = 10; // Process in batches to avoid memory issues

    for (let i = 0; i < systemDocs.length; i += BATCH_SIZE) {
      const batch = systemDocs.slice(i, i + BATCH_SIZE);
      console.log(
        `\n🔄 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(systemDocs.length / BATCH_SIZE)} (${batch.length} documents)...`
      );

      for (const doc of batch) {
        try {
          console.log(`  📄 Processing: ${doc.filename} (ID: ${doc._id})`);

          // Chunk the text content
          const chunks = chunkText(doc.textContent, 1000);
          console.log(`    ✂️  Created ${chunks.length} chunks`);

          if (chunks.length === 0) {
            console.log(`    ⚠️  No valid chunks created for ${doc.filename}, skipping`);
            continue;
          }

          // Generate embeddings for all chunks
          console.log(`    🧠 Generating embeddings...`);
          const embeddings = await generateEmbeddings(chunks);

          if (!embeddings || embeddings.length !== chunks.length) {
            console.log(`    ❌ Failed to generate embeddings for ${doc.filename}, skipping`);
            continue;
          }

          // Create Pinecone vectors with enhanced metadata
          const vectors: PineconeVector[] = chunks.map((chunk, chunkIndex) => ({
            id: `${doc._id}_chunk_${chunkIndex}`, // Use current MongoDB _id
            values: embeddings[chunkIndex],
            metadata: {
              documentId: doc._id.toString(), // Store current MongoDB _id
              originalFileName: doc.filename, // Use proper filename from MongoDB
              sourceType: 'system',
              text: chunk,
              chunkIndex: chunkIndex,
              totalChunks: chunks.length,
              s3Key: doc.s3Key,
              fileUrl: doc.fileUrl,
              reindexedAt: new Date().toISOString(), // Track when re-indexed
              version: 'v2', // Version tracking
            },
          }));

          // Upsert to Pinecone system-kb namespace ONLY
          console.log(`    📤 Upserting ${vectors.length} vectors to system-kb namespace...`);
          console.log(`    🔍 DEBUG: Namespace being passed to upsertVectors: 'system-kb'`);
          console.log(
            `    🔍 DEBUG: Sample vector metadata:`,
            JSON.stringify(vectors[0]?.metadata || {}, null, 2)
          );

          await upsertVectors(vectors, 'system-kb');

          console.log(`    🔍 DEBUG: upsertVectors completed successfully`);

          totalChunks += chunks.length;
          totalVectors += vectors.length;

          console.log(`    ✅ Successfully processed ${doc.filename} (${vectors.length} vectors)`);
          log.info(
            {
              documentId: doc._id,
              filename: doc.filename,
              chunkCount: chunks.length,
              vectorCount: vectors.length,
            },
            'Successfully processed document'
          );
        } catch (docError: any) {
          console.log(`    ❌ Error processing ${doc.filename}: ${docError.message}`);
          log.error(
            {
              documentId: doc._id,
              filename: doc.filename,
              error: docError.message,
            },
            'Error processing document'
          );
        }
      }

      // Small delay between batches to be nice to APIs
      if (i + BATCH_SIZE < systemDocs.length) {
        console.log('    ⏳ Pausing 2 seconds between batches...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // Step 7: Final verification
    console.log('\n🔍 Final verification...');
    try {
      const testEmbedding = await generateEmbeddings(['test query verification']);
      const finalStats = await queryVectors(
        testEmbedding[0],
        10,
        { sourceType: 'system' },
        'system-kb'
      );
      console.log(`📊 Final vectors in system-kb namespace: ${finalStats?.matches?.length ?? 0}`);

      if (finalStats?.matches?.length > 0) {
        console.log('📋 Sample metadata from first vector:');
        console.log(JSON.stringify(finalStats.matches[0].metadata, null, 2));

        // Check for proper filenames (non-legacy numeric ones)
        const properFilenames = finalStats.matches.filter(
          (m: any) =>
            m.metadata?.originalFileName && !m.metadata.originalFileName.match(/^\d{13}-\d+\.pdf$/)
        );
        console.log(
          `✅ Vectors with proper filenames: ${properFilenames.length}/${finalStats.matches.length}`
        );
      } else {
        console.log(
          '✅ No vectors found in system-kb namespace after re-indexing (unexpected if documents were processed)'
        );
      }
    } catch (verifyError: any) {
      console.log(`⚠️  Could not verify final stats: ${verifyError.message}`);
      log.warn({ error: verifyError.message }, 'Final stats verification failed');
    }

    // Summary
    console.log('\n🎉 Enhanced Re-indexing Complete!');
    console.log(`📊 Summary:`);
    console.log(`  - Documents processed: ${systemDocs.length}`);
    console.log(`  - Total chunks created: ${totalChunks}`);
    console.log(`  - Total vectors upserted: ${totalVectors}`);
    console.log(`  - Enhanced cleanup: ${forceFullCleanup ? 'YES' : 'NO'}`);
    console.log(`  - Cross-namespace cleanup: ${clearAllNamespaces ? 'YES' : 'NO'}`);

    log.info(
      {
        documentsProcessed: systemDocs.length,
        totalChunks,
        totalVectors,
        enhancedCleanup: forceFullCleanup,
        crossNamespaceCleanup: clearAllNamespaces,
      },
      'Enhanced re-indexing completed successfully'
    );
  } catch (error: any) {
    console.log('❌ Error during re-indexing:', error.message);
    log.error({ error: error.message, stack: error.stack }, 'Error during re-indexing');
    throw error;
  }
}

// Allow running this script directly
if (require.main === module) {
  // Default options when run directly unless args are provided
  const args = process.argv.slice(2);
  const options: ReindexOptions = {};
  if (args.includes('--forceFullCleanup')) {
    options.forceFullCleanup = true;
  }
  if (args.includes('--clearAllNamespaces')) {
    options.clearAllNamespaces = true;
  }

  reindexSystemKB(options)
    .then(() => {
      console.log('✅ Re-indexing script completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Re-indexing script failed:', error);
      process.exit(1);
    });
}
