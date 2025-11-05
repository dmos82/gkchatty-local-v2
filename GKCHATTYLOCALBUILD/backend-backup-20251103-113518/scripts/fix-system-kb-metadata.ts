import mongoose from 'mongoose';
import { SystemKbDocument, ISystemKbDocument } from '../models/SystemKbDocument';
import { getPineconeIndex } from '../utils/pineconeService';
import { getLogger } from '../utils/logger';
import { getSystemKbNamespace } from '../utils/pineconeNamespace';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const log = getLogger('fix-system-kb-metadata');

interface MetadataFixOptions {
  dryRun?: boolean;
  batchSize?: number;
  delayBetweenBatches?: number;
}

interface VectorMetadata {
  documentId?: string;
  originalFileName?: string;
  sourceType?: string;
  chunkIndex?: number;
  text?: string;
  [key: string]: any;
}

export async function fixSystemKbMetadata(options: MetadataFixOptions = {}): Promise<void> {
  const { dryRun = false, batchSize = 100, delayBetweenBatches = 2000 } = options;

  console.log('🔧 Starting System KB Metadata Fix Process...');
  console.log(`📋 Configuration:`);
  console.log(`  - Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE RUN'}`);
  console.log(`  - Batch Size: ${batchSize}`);
  console.log(`  - Delay Between Batches: ${delayBetweenBatches}ms`);
  console.log(`  - Target Index: ${process.env.PINECONE_INDEX_NAME}`);
  console.log(`  - Target Namespace: ${getSystemKbNamespace()}`);

  log.info('Starting metadata fix process', { dryRun, batchSize });

  try {
    // Step 1: Connect to MongoDB if needed
    if (mongoose.connection.readyState !== 1) {
      const mongoUri = process.env.MONGO_URI;
      if (!mongoUri) {
        throw new Error('MONGO_URI environment variable is required');
      }
      console.log('📊 Connecting to MongoDB...');
      await mongoose.connect(mongoUri);
      console.log('✅ Connected to MongoDB');
    }

    // Step 2: Get all System KB documents from MongoDB
    console.log('📚 Fetching System KB documents from MongoDB...');
    const systemDocs = await SystemKbDocument.find({
      status: 'completed',
    }).lean<ISystemKbDocument[]>();

    console.log(`📖 Found ${systemDocs.length} completed System KB documents`);

    if (systemDocs.length === 0) {
      console.log('❌ No completed System KB documents found. Exiting.');
      return;
    }

    // Step 3: Get Pinecone index
    const index = await getPineconeIndex();
    const namespace = getSystemKbNamespace();

    // Step 4: Get current namespace stats
    console.log(`📊 Checking current namespace (${namespace}) stats...`);
    const stats = await index.describeIndexStats();
    const namespaceStats = stats.namespaces?.[namespace];

    if (!namespaceStats || namespaceStats.recordCount === 0) {
      console.log(`❌ Namespace '${namespace}' is empty or doesn't exist`);
      return;
    }

    console.log(`📈 Found ${namespaceStats.recordCount} vectors in namespace '${namespace}'`);

    // Step 5: Process vectors in batches
    let totalProcessed = 0;
    let totalUpdated = 0;
    let totalErrors = 0;

    // Create a set of valid document IDs for quick lookup
    const validDocIds = new Set(systemDocs.map(doc => doc._id.toString()));
    console.log(`✅ Loaded ${validDocIds.size} valid System KB document IDs`);

    // Since we can't list vectors directly, we'll need to query by document IDs
    console.log('\n🔄 Processing vectors by document ID...');

    for (const doc of systemDocs) {
      try {
        const docId = doc._id.toString();
        console.log(`\n📄 Processing document: ${doc.filename} (${docId})`);

        // Fetch vectors for this document
        // We'll use a prefix-based approach for vector IDs
        const vectorIdPrefix = `${docId}_chunk_`;

        // Fetch up to 1000 chunks per document (should be more than enough)
        const vectorIds: string[] = [];
        for (let i = 0; i < 1000; i++) {
          vectorIds.push(`${vectorIdPrefix}${i}`);
        }

        // Fetch vectors in batches
        for (let i = 0; i < vectorIds.length; i += batchSize) {
          const batchIds = vectorIds.slice(i, i + batchSize);

          try {
            // Fetch the vectors
            const fetchResponse = await index.namespace(namespace).fetch(batchIds);

            if (!fetchResponse.records || Object.keys(fetchResponse.records).length === 0) {
              // No more vectors for this document
              break;
            }

            const vectorsToUpdate: any[] = [];

            for (const [vectorId, vector] of Object.entries(fetchResponse.records)) {
              totalProcessed++;

              const metadata = (vector as any).metadata as VectorMetadata;

              // Check if this vector needs updating
              if (metadata.sourceType !== 'system') {
                console.log(
                  `  🔍 Found vector ${vectorId} with sourceType: '${metadata.sourceType}'`
                );

                if (!dryRun) {
                  // Prepare updated metadata
                  const updatedMetadata = {
                    ...metadata,
                    sourceType: 'system',
                    correctedAt: new Date().toISOString(),
                    originalSourceType: metadata.sourceType || 'unknown',
                  };

                  vectorsToUpdate.push({
                    id: vectorId,
                    values: (vector as any).values,
                    metadata: updatedMetadata,
                  });
                }

                totalUpdated++;
              }
            }

            // Update vectors if not in dry run mode
            if (!dryRun && vectorsToUpdate.length > 0) {
              console.log(`  📤 Updating ${vectorsToUpdate.length} vectors...`);
              await index.namespace(namespace).upsert(vectorsToUpdate);
              console.log(`  ✅ Updated ${vectorsToUpdate.length} vectors`);
            }

            // Small delay between batches
            if (i + batchSize < vectorIds.length) {
              await new Promise(resolve => setTimeout(resolve, 100));
            }
          } catch (batchError: any) {
            console.error(`  ❌ Error processing batch: ${batchError.message}`);
            totalErrors++;
          }
        }
      } catch (docError: any) {
        console.error(`❌ Error processing document ${doc.filename}: ${docError.message}`);
        totalErrors++;
      }

      // Delay between documents
      await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
    }

    // Step 6: Final verification
    console.log('\n🔍 Final verification...');

    if (!dryRun) {
      // Wait for changes to propagate
      console.log('⏳ Waiting 5 seconds for changes to propagate...');
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Sample some vectors to verify
      console.log('📊 Sampling vectors to verify changes...');

      const sampleDoc = systemDocs[0];
      const sampleVectorId = `${sampleDoc._id}_chunk_0`;

      try {
        const sampleFetch = await index.namespace(namespace).fetch([sampleVectorId]);
        if (sampleFetch.records?.[sampleVectorId]) {
          const metadata = sampleFetch.records[sampleVectorId].metadata as VectorMetadata;
          console.log('📋 Sample vector metadata:');
          console.log(`  - Vector ID: ${sampleVectorId}`);
          console.log(`  - Source Type: ${metadata.sourceType}`);
          console.log(`  - Original Filename: ${metadata.originalFileName}`);
          console.log(`  - Corrected At: ${metadata.correctedAt || 'N/A'}`);
        }
      } catch (verifyError: any) {
        console.warn(`⚠️  Could not verify sample vector: ${verifyError.message}`);
      }
    }

    // Summary
    console.log('\n🎉 Metadata Fix Process Complete!');
    console.log(`📊 Summary:`);
    console.log(`  - Mode: ${dryRun ? 'DRY RUN' : 'LIVE RUN'}`);
    console.log(`  - Vectors Processed: ${totalProcessed}`);
    console.log(`  - Vectors ${dryRun ? 'Would Be' : ''} Updated: ${totalUpdated}`);
    console.log(`  - Errors: ${totalErrors}`);

    log.info('Metadata fix process completed', {
      dryRun,
      totalProcessed,
      totalUpdated,
      totalErrors,
    });
  } catch (error: any) {
    console.error('❌ Error during metadata fix:', error.message);
    log.error({ error: error.message, stack: error.stack }, 'Error during metadata fix');
    throw error;
  }
}

// Allow running this script directly
if (require.main === module) {
  const args = process.argv.slice(2);
  const options: MetadataFixOptions = {};

  if (args.includes('--dry-run')) {
    options.dryRun = true;
  }

  if (args.includes('--batch-size')) {
    const batchSizeIndex = args.indexOf('--batch-size');
    if (batchSizeIndex !== -1 && args[batchSizeIndex + 1]) {
      options.batchSize = parseInt(args[batchSizeIndex + 1], 10);
    }
  }

  fixSystemKbMetadata(options)
    .then(() => {
      console.log('✅ Metadata fix script completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Metadata fix script failed:', error);
      process.exit(1);
    });
}
