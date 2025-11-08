import 'dotenv/config';
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { UserDocument, IUserDocument } from '../models/UserDocument';
import { processAndEmbedDocument } from '../utils/documentProcessor';
import { getLogger } from '../utils/logger';

const log = getLogger('reindex-all-users-docs');

/**
 * Re-index every existing UserDocument in MongoDB into Pinecone.
 *
 * This is a one-time migration script meant to backfill vectors for all user
 * documents that were uploaded before the embedding pipeline existed.
 *
 * The logic mirrors `direct-system-kb-reindex.ts` but operates across the
 * `user` namespace(s) – grouping by userId and upserting vectors into the
 * appropriate `user-${userId}` namespace (or default namespace in prod).
 */
export async function reindexAllUserDocuments(): Promise<void> {
  log.info('🚀 Starting one-time re-indexing for ALL user documents');

  // 1. Sanity checks & Mongo connection
  // Prefer MONGODB_URI but fall back to legacy/prod variable MONGO_URI
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;

  if (!mongoUri) {
    log.error('FATAL: Neither MONGODB_URI nor MONGO_URI environment variable is set.');
    throw new Error('FATAL: Neither MONGODB_URI nor MONGO_URI environment variable is set.');
  }

  await mongoose.connect(mongoUri);
  log.info('✅ Connected to MongoDB');

  // 2. Fetch all user documents still missing embeddings (or all, to be safe)
  //    We intentionally only fetch `sourceType:"user"` so system / tenant docs
  //    are excluded. Selecting minimal fields keeps memory footprint small.
  const userDocs: Array<IUserDocument> = await UserDocument.find({
    sourceType: 'user',
  }).select('_id userId s3Key originalFileName mimeType fileSize');

  if (userDocs.length === 0) {
    log.info('🎉 No user documents found – nothing to re-index.');
    await mongoose.disconnect();
    return;
  }

  log.info(`📄 Found ${userDocs.length} user documents to process.`);

  // 3. Group docs by userId for clearer logging
  const docsByUser = new Map<string, IUserDocument[]>();
  for (const doc of userDocs) {
    const uid = doc.userId?.toString() || 'unknown-user';
    if (!docsByUser.has(uid)) {
      docsByUser.set(uid, []);
    }
    docsByUser.get(uid)!.push(doc);
  }

  let processedDocs = 0;
  const failedDocs: Array<{ documentId: string; fileName: string; error: string }> = [];

  const s3Bucket = process.env.S3_BUCKET_NAME || process.env.AWS_BUCKET_NAME || 'gkchatty-uploads';

  // 4. Iterate users → documents
  for (const [userId, docs] of Array.from(docsByUser.entries())) {
    log.info(`👤 Processing ${docs.length} documents for user ${userId}`);

    for (const doc of docs) {
      const docId = doc._id.toString();
      const correlationId = `reindex-${uuidv4()}`;
      try {
        await processAndEmbedDocument(
          docId,
          s3Bucket,
          doc.s3Key,
          'user',
          doc.originalFileName,
          doc.mimeType,
          userId,
          correlationId
        );
        processedDocs++;
        log.info({ userId, docId }, '✅ Re-indexed document');
      } catch (error: any) {
        log.error({ userId, docId, err: error }, '❌ Failed to re-index document');
        failedDocs.push({
          documentId: docId,
          fileName: doc.originalFileName,
          error: error.message || 'Unknown error',
        });
      }
    }
  }

  // 5. Disconnect & summary
  await mongoose.disconnect();
  log.info('🔌 Disconnected from MongoDB');

  log.info('📊 Re-indexing complete', {
    totalDocs: userDocs.length,
    processedDocs,
    failures: failedDocs.length,
  });

  if (failedDocs.length) {
    console.table(failedDocs);
  }
}

// If executed directly via `ts-node`, run immediately.
if (require.main === module) {
  reindexAllUserDocuments().catch(err => {
    log.error({ err }, 'Unhandled error during re-indexing');
    process.exit(1);
  });
}
