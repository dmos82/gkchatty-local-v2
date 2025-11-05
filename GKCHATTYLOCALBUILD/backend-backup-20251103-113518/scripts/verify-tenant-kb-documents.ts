import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { connectDB } from '../utils/mongoHelper';
import { UserDocument } from '../models/UserDocument';
import { TenantKnowledgeBase } from '../models/TenantKnowledgeBase';
import logger from '../utils/logger';
import { queryVectors } from '../utils/pineconeService';

dotenv.config();

const log = logger.child({ module: 'verify-tenant-kb-documents' });

/**
 * This script checks both MongoDB and Pinecone to verify the consistency
 * of Tenant KB documents metadata, which is important for the new RAG search logic.
 */
const verifyTenantKBDocuments = async () => {
  log.info('Starting Tenant KB document verification...');

  try {
    await connectDB();
    log.info('Database connected.');

    // Get all Tenant KBs
    const tenantKBs = await TenantKnowledgeBase.find().select('_id name s3Prefix documentCount');
    log.info(`Found ${tenantKBs.length} Tenant KBs`);

    for (const kb of tenantKBs) {
      log.info(`\n=== Checking Tenant KB: ${kb.name} (${kb._id}) ===`);

      // Find documents in MongoDB for this Tenant KB
      const documents = await UserDocument.find({
        tenantKbId: kb._id,
        sourceType: 'tenant',
      }).select('_id originalFileName s3Key status');

      log.info(
        `MongoDB: Found ${documents.length} documents (reported count: ${kb.documentCount})`
      );

      if (documents.length > 0) {
        log.info('Sample document from MongoDB:');
        log.info({
          id: documents[0]._id,
          fileName: documents[0].originalFileName,
          s3Key: documents[0].s3Key,
          status: documents[0].status,
        });

        // Try to query Pinecone for documents from this Tenant KB
        try {
          // Query Pinecone using the filter
          const pineconeFilter = {
            sourceType: 'tenant',
            tenantKbId: kb._id.toString(),
          };

          // Mock query vector (not actually used for matching, just required by API)
          const mockVector = Array(1536).fill(0);

          // Query with a high topK to try to get all documents
          const results = await queryVectors(mockVector, 100, pineconeFilter, 'system-kb');

          const matchCount = results?.matches?.length || 0;
          log.info(`Pinecone: Found ${matchCount} vectors with tenantKbId filter`);

          // Display metadata of first match if available
          if (matchCount > 0 && results.matches[0].metadata) {
            log.info('Sample vector metadata from Pinecone:');
            log.info({
              id: results.matches[0].id,
              metadata: results.matches[0].metadata,
            });

            // Check if vectors have the correct metadata
            const hasSourceType = !!results.matches[0].metadata.sourceType;
            const hasTenantKbId = !!results.matches[0].metadata.tenantKbId;

            if (!hasSourceType || !hasTenantKbId) {
              log.warn('METADATA ISSUE: Vectors are missing required metadata fields');
              log.warn(`Has sourceType: ${hasSourceType}, Has tenantKbId: ${hasTenantKbId}`);
              log.warn('These documents need to be re-indexed with the new metadata format');
            } else {
              log.info('✅ Vectors have the correct metadata format');
            }
          } else {
            log.error('NO VECTORS FOUND in Pinecone for this Tenant KB');
            log.error('These documents need to be indexed in Pinecone');
          }
        } catch (error) {
          log.error({ error }, 'Error querying Pinecone');
        }
      } else {
        log.warn('No documents found in MongoDB for this Tenant KB');
      }
    }

    log.info('\n=== Verification Complete ===');
    log.info('If any Tenant KB is missing proper metadata in Pinecone, a re-index is required.');
  } catch (error) {
    log.error({ error }, 'An error occurred during verification.');
  } finally {
    await mongoose.connection.close();
    log.info('Database connection closed.');
  }
};

verifyTenantKBDocuments();
