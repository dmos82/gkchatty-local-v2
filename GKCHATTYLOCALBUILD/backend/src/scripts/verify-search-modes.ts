import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { connectDB } from '../utils/mongoHelper';
import { getContext } from '../services/ragService';
import { UserKBAccess } from '../models/UserKBAccess';
import { TenantKnowledgeBase } from '../models/TenantKnowledgeBase';
import User from '../models/UserModel';
import logger from '../utils/logger';

dotenv.config();

const log = logger.child({ module: 'verify-search-modes' });

/**
 * This script tests the new RAG search logic with different search modes
 * to verify that the correct documents are returned in each mode.
 */
const verifySearchModes = async () => {
  log.info('Starting search mode verification...');

  try {
    await connectDB();
    log.info('Database connected.');

    // Step 1: Find a test user
    const testUserEmail = process.env.TEST_USER_EMAIL || 'dev@example.com';
    const testUser = await User.findOne({ email: testUserEmail });

    if (!testUser) {
      log.error(
        `Test user with email ${testUserEmail} not found. Please provide a valid test user.`
      );
      return;
    }

    const userId = testUser._id.toString();
    log.info({ userId, email: testUser.email }, 'Found test user');

    // Step 2: Verify the user's KB access
    const userAccess = await UserKBAccess.findOne({ userId });

    if (!userAccess || !userAccess.enabledKnowledgeBases?.length) {
      log.warn('The test user has no enabled tenant KBs. Run setup-test-user-kb-access.ts first.');
    } else {
      log.info(`User has ${userAccess.enabledKnowledgeBases.length} enabled tenant KBs:`);

      for (const kbId of userAccess.enabledKnowledgeBases) {
        const kb = await TenantKnowledgeBase.findById(kbId);
        log.info({ kbId: kbId.toString(), name: kb?.name || 'Unknown KB' }, 'Enabled KB');
      }
    }

    // Step 3: Test different search modes with a sample query
    const testQuery = 'application architecture design';
    log.info({ query: testQuery }, 'Using test query');

    // Test KB mode
    log.info('\n=== Testing KB Search Mode ===');
    try {
      const kbResults = await getContext(testQuery, userId, { knowledgeBaseTarget: 'kb' });
      log.info(`Found ${kbResults.length} results in KB mode`);

      // Group results by type
      const systemResults = kbResults.filter(r => r.type === 'system');
      const tenantResults = kbResults.filter(r => r.type === 'tenant');
      const userResults = kbResults.filter(r => r.type === 'user');

      log.info(`System KB results: ${systemResults.length}`);
      log.info(`Tenant KB results: ${tenantResults.length}`);
      log.info(`User document results: ${userResults.length} (should be 0 in KB mode)`);

      if (userResults.length > 0) {
        log.error('ISSUE DETECTED: User documents appearing in KB mode search results!');
      }

      // Show sample results
      if (kbResults.length > 0) {
        log.info('Sample results:');
        kbResults.slice(0, 3).forEach((result, i) => {
          log.info(
            {
              index: i + 1,
              fileName: result.fileName,
              type: result.type,
              origin: result.origin,
              score: result.score,
              documentId: result.documentId,
            },
            'Result'
          );
        });
      }
    } catch (error) {
      log.error({ error }, 'Error testing KB search mode');
    }

    // Test User mode
    log.info('\n=== Testing User Search Mode ===');
    try {
      const userResults = await getContext(testQuery, userId, { knowledgeBaseTarget: 'user' });
      log.info(`Found ${userResults.length} results in User mode`);

      // Group results by type
      const systemResults = userResults.filter(r => r.type === 'system');
      const tenantResults = userResults.filter(r => r.type === 'tenant');
      const myDocResults = userResults.filter(r => r.type === 'user');

      log.info(`System KB results: ${systemResults.length} (should be 0 in User mode)`);
      log.info(`Tenant KB results: ${tenantResults.length} (should be 0 in User mode)`);
      log.info(`User document results: ${myDocResults.length}`);

      if (systemResults.length > 0 || tenantResults.length > 0) {
        log.error(
          'ISSUE DETECTED: System KB or Tenant KB documents appearing in User mode search results!'
        );
      }

      // Show sample results
      if (userResults.length > 0) {
        log.info('Sample results:');
        userResults.slice(0, 3).forEach((result, i) => {
          log.info(
            {
              index: i + 1,
              fileName: result.fileName,
              type: result.type,
              origin: result.origin,
              score: result.score,
              documentId: result.documentId,
            },
            'Result'
          );
        });
      }
    } catch (error) {
      log.error({ error }, 'Error testing User search mode');
    }

    // Test Hybrid mode
    log.info('\n=== Testing Hybrid Search Mode ===');
    try {
      const hybridResults = await getContext(testQuery, userId, { knowledgeBaseTarget: 'unified' });
      log.info(`Found ${hybridResults.length} total results in Hybrid mode`);

      // Group results by type
      const systemResults = hybridResults.filter(r => r.type === 'system');
      const tenantResults = hybridResults.filter(r => r.type === 'tenant');
      const myDocResults = hybridResults.filter(r => r.type === 'user');

      log.info(`System KB results: ${systemResults.length}`);
      log.info(`Tenant KB results: ${tenantResults.length}`);
      log.info(`User document results: ${myDocResults.length}`);

      // Check for duplicates
      const documentIds = hybridResults.filter(r => r.documentId).map(r => r.documentId);

      const uniqueDocumentIds = new Set(documentIds);

      if (documentIds.length !== uniqueDocumentIds.size) {
        log.error(
          `ISSUE DETECTED: Found ${documentIds.length - uniqueDocumentIds.size} duplicate documents in Hybrid mode!`
        );
      } else {
        log.info('✅ No duplicates found in Hybrid mode');
      }

      // Show sample results
      if (hybridResults.length > 0) {
        log.info('Sample results:');
        hybridResults.slice(0, 5).forEach((result, i) => {
          log.info(
            {
              index: i + 1,
              fileName: result.fileName,
              type: result.type,
              origin: result.origin,
              score: result.score,
              documentId: result.documentId,
            },
            'Result'
          );
        });
      }
    } catch (error) {
      log.error({ error }, 'Error testing Hybrid search mode');
    }

    log.info('\n=== Search Mode Verification Complete ===');
  } catch (error) {
    log.error({ error }, 'An error occurred during verification.');
  } finally {
    await mongoose.connection.close();
    log.info('Database connection closed.');
  }
};

verifySearchModes();
