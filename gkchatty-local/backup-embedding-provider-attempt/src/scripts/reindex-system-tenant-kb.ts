import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { connectDB } from '../utils/mongoHelper';
import { UserDocument } from '../models/UserDocument';
import { SystemKbDocument } from '../models/SystemKbDocument';
import { TenantKnowledgeBase } from '../models/TenantKnowledgeBase';
import logger from '../utils/logger';
import { processAndEmbedDocument } from '../utils/documentProcessor';
import { deleteVectorsByFilter } from '../utils/pineconeService';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const log = logger.child({ module: 'reindex-system-tenant-kb' });

/**
 * This script performs a full re-indexing of all System KB and Tenant KB documents.
 * It first clears the system-kb namespace in Pinecone, then re-processes all documents
 * with the correct metadata format required by the new RAG search logic.
 */
const reindexSystemAndTenantKB = async () => {
  log.info('Starting full re-indexing of System KB and Tenant KB documents...');

  try {
    await connectDB();
    log.info('Database connected.');

    // Confirm action
    const args = process.argv.slice(2);
    const confirmed = args.includes('--confirm');

    if (!confirmed) {
      log.warn(
        'This script will DELETE ALL VECTORS in the system-kb namespace and re-index all documents.'
      );
      log.warn('To confirm this action, run the script with the --confirm flag.');
      return;
    }

    // Step 1: Clear the system-kb namespace in Pinecone
    log.info('Clearing system-kb namespace in Pinecone...');
    try {
      await deleteVectorsByFilter({}, 'system-kb');
      log.info('Successfully cleared system-kb namespace in Pinecone.');
    } catch (error) {
      log.error({ error }, 'Failed to clear system-kb namespace. Aborting.');
      return;
    }

    // Step 2: Re-index System KB documents
    log.info('Starting re-indexing of System KB documents...');
    const systemKbDocs = await SystemKbDocument.find({ status: 'completed' });
    log.info(`Found ${systemKbDocs.length} System KB documents to re-index.`);

    let systemSuccess = 0;
    let systemFailed = 0;

    for (const doc of systemKbDocs) {
      const correlationId = uuidv4();
      log.info(
        { docId: doc._id, fileName: doc.filename, corrId: correlationId },
        'Processing System KB document'
      );

      try {
        await processAndEmbedDocument(
          doc._id.toString(),
          process.env.AWS_BUCKET_NAME || 'local',
          doc.s3Key,
          'system',
          doc.filename,
          doc.mimeType || 'application/pdf',
          undefined, // No userId for system docs
          correlationId
        );
        systemSuccess++;
        log.info(
          { docId: doc._id, corrId: correlationId },
          'Successfully re-indexed System KB document'
        );
      } catch (error) {
        systemFailed++;
        log.error(
          { docId: doc._id, error, corrId: correlationId },
          'Failed to re-index System KB document'
        );
      }
    }

    // Step 3: Re-index Tenant KB documents
    log.info('Starting re-indexing of Tenant KB documents...');
    const tenantKBs = await TenantKnowledgeBase.find();
    log.info(`Found ${tenantKBs.length} Tenant KBs.`);

    let tenantSuccess = 0;
    let tenantFailed = 0;

    for (const kb of tenantKBs) {
      log.info({ kbId: kb._id, kbName: kb.name }, 'Processing Tenant KB');

      const tenantDocs = await UserDocument.find({
        tenantKbId: kb._id,
        sourceType: 'tenant',
        status: 'completed',
      });

      log.info({ kbId: kb._id, docsCount: tenantDocs.length }, 'Found Tenant KB documents');

      for (const doc of tenantDocs) {
        const correlationId = uuidv4();
        log.info(
          {
            docId: doc._id,
            fileName: doc.originalFileName,
            kbId: kb._id,
            kbName: kb.name,
            corrId: correlationId,
          },
          'Processing Tenant KB document'
        );

        try {
          await processAndEmbedDocument(
            doc._id.toString(),
            process.env.AWS_BUCKET_NAME || 'local',
            doc.s3Key,
            'tenant',
            doc.originalFileName,
            doc.mimeType,
            doc.userId?.toString(), // Pass userId for tracking
            correlationId,
            undefined, // No extracted text
            kb._id.toString() // Pass tenantKbId - CRITICAL for proper filtering
          );
          tenantSuccess++;
          log.info(
            { docId: doc._id, kbId: kb._id, corrId: correlationId },
            'Successfully re-indexed Tenant KB document'
          );
        } catch (error) {
          tenantFailed++;
          log.error(
            { docId: doc._id, kbId: kb._id, error, corrId: correlationId },
            'Failed to re-index Tenant KB document'
          );
        }
      }
    }

    // Summary
    log.info('\n=== Re-indexing Summary ===');
    log.info(`System KB Documents: ${systemSuccess} succeeded, ${systemFailed} failed`);
    log.info(`Tenant KB Documents: ${tenantSuccess} succeeded, ${tenantFailed} failed`);
    log.info('Total Documents Re-indexed: ' + (systemSuccess + tenantSuccess));
    log.info('Total Documents Failed: ' + (systemFailed + tenantFailed));

    if (systemFailed > 0 || tenantFailed > 0) {
      log.warn('Some documents failed to re-index. Check the logs for details.');
    } else {
      log.info('All documents successfully re-indexed with the correct metadata format!');
    }

    log.info('Re-indexing process completed.');
  } catch (error) {
    log.error({ error }, 'An error occurred during re-indexing.');
  } finally {
    await mongoose.connection.close();
    log.info('Database connection closed.');
  }
};

reindexSystemAndTenantKB();
