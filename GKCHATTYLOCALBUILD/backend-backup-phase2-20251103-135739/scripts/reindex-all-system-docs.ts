import 'dotenv/config';
import mongoose from 'mongoose';
import { SystemKbDocument } from '../models/SystemKbDocument';
import { processAndEmbedDocument } from '../utils/documentProcessor';

async function reindexAllSystemDocuments() {
  try {
    console.log('[Reindex All] Starting re-indexing of all system documents...');

    if (!process.env.MONGODB_URI) {
      console.error('[Reindex All] MONGODB_URI environment variable is not set');
      process.exit(1);
    }

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI!, { dbName: 'gkchatty' });
    const dbName = mongoose.connection.db?.databaseName;
    console.log(`[Reindex All] Connected to MongoDB, database name: ${dbName}`);

    // Get all system documents from SystemKbDocument collection
    const systemDocs = await SystemKbDocument.find({}).select('_id filename s3Key');
    console.log(`[Reindex All] Found ${systemDocs.length} system documents to re-index`);

    if (systemDocs.length === 0) {
      console.log('[Reindex All] No system documents found. Exiting.');
      await mongoose.disconnect();
      return;
    }

    console.log(
      '[Reindex All] Note: system-kb namespace should be cleared before running this script'
    );

    // Re-index each document
    let successful = 0;
    let failed = 0;

    for (const doc of systemDocs) {
      const documentId = (doc._id as mongoose.Types.ObjectId).toString();
      console.log(`[Reindex All] Processing document: ${doc.filename} (ID: ${documentId})`);

      try {
        // Use the existing processAndEmbedDocument function
        // For system documents, s3Key contains the full path like "system_docs/1747174847635-Epic - Checklist.pdf"
        // We need to pass this full path as the s3Key parameter

        await processAndEmbedDocument(
          documentId,
          '',
          doc.s3Key,
          'system',
          doc.filename,
          'application/pdf',
          undefined,
          `reindex-${Date.now()}`
        );

        console.log(`[Reindex All] ✅ Successfully processed: ${doc.filename}`);
        successful++;
      } catch (error) {
        console.error(`[Reindex All] ❌ Failed to process ${doc.filename}:`, error);
        failed++;
      }
    }

    console.log('[Reindex All] Re-indexing complete!');
    console.log(`[Reindex All] Results: ${successful} successful, ${failed} failed`);

    await mongoose.disconnect();
    console.log('[Reindex All] Disconnected from MongoDB');
  } catch (error) {
    console.error('[Reindex All] Error during re-indexing:', error);
    process.exit(1);
  }
}

// Run the script
reindexAllSystemDocuments();
