#!/usr/bin/env ts-node
/**
 * SYSTEM KB REINDEX VERIFICATION SCRIPT
 *
 * This script verifies the state of System KB documents and vectors
 * to diagnose why the reindexing didn't work as expected.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { SystemKbDocument } from '../models/SystemKbDocument';
import { getSystemKbNamespace } from '../utils/pineconeNamespace';
import { getPineconeIndex } from '../utils/pineconeService';
import { getLogger } from '../utils/logger';

const log = getLogger('verify-systemkb-reindex');

async function verifySystemKbState(): Promise<void> {
  console.log('🔍 SYSTEM KB REINDEX VERIFICATION');
  console.log('='.repeat(50));

  try {
    // Connect to MongoDB
    console.log('📊 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI!);
    console.log('✅ Connected to MongoDB');

    // Check System KB documents
    console.log('\n📋 Checking System KB Documents in MongoDB...');
    const systemDocs = await SystemKbDocument.find({}).select('_id filename status textContent');

    console.log(`Found ${systemDocs.length} System KB documents:`);
    systemDocs.forEach((doc, index) => {
      const hasText = doc.textContent && doc.textContent.length > 0;
      console.log(`  ${index + 1}. ${doc.filename}`);
      console.log(`     - ID: ${doc._id}`);
      console.log(`     - Status: ${doc.status}`);
      console.log(`     - Has Text: ${hasText ? `Yes (${doc.textContent.length} chars)` : 'No'}`);
    });

    // Check target namespace
    console.log('\n🎯 Checking Target Namespace...');
    const targetNamespace = getSystemKbNamespace();
    console.log(`Target namespace for System KB: "${targetNamespace}"`);
    console.log(`PINECONE_INDEX_NAME: ${process.env.PINECONE_INDEX_NAME}`);
    console.log(`PINECONE_NAMESPACE: ${process.env.PINECONE_NAMESPACE}`);

    // Check Pinecone state
    console.log('\n📊 Checking Pinecone Index Stats...');
    const index = await getPineconeIndex();
    const stats = await index.describeIndexStats();

    console.log('Pinecone namespaces:');
    Object.entries(stats.namespaces || {}).forEach(([ns, data]: [string, any]) => {
      console.log(`  "${ns}": ${data.vectorCount || data.recordCount || 0} vectors`);
    });

    // Check if we can query vectors
    console.log('\n🔍 Testing Vector Query in Target Namespace...');
    try {
      // Create a dummy query vector (all zeros)
      const dummyVector = new Array(1536).fill(0);
      const queryResponse = await index.namespace(targetNamespace).query({
        vector: dummyVector,
        topK: 5,
        includeMetadata: true,
      });

      console.log(`Query results in namespace "${targetNamespace}":`);
      console.log(`  Matches found: ${queryResponse.matches?.length || 0}`);

      if (queryResponse.matches && queryResponse.matches.length > 0) {
        console.log('  Sample metadata:');
        queryResponse.matches.slice(0, 3).forEach((match: any, i: number) => {
          console.log(`    ${i + 1}. ID: ${match.id}`);
          console.log(`       sourceType: ${match.metadata?.sourceType}`);
          console.log(`       documentId: ${match.metadata?.documentId}`);
        });
      }
    } catch (queryError) {
      console.error('Failed to query vectors:', queryError);
    }

    // Check for text content issues
    console.log('\n📝 Checking for Text Content Issues...');
    const docsWithoutText = systemDocs.filter(
      doc => !doc.textContent || doc.textContent.length === 0
    );
    if (docsWithoutText.length > 0) {
      console.log(`⚠️  WARNING: ${docsWithoutText.length} documents have no text content!`);
      console.log('These documents cannot be indexed without text:');
      docsWithoutText.forEach(doc => {
        console.log(`  - ${doc.filename} (${doc._id})`);
      });
    }

    console.log('\n' + '='.repeat(50));
    console.log('✅ Verification complete');
  } catch (error) {
    log.error('Verification failed:', error);
    console.error('❌ Verification failed:', error);
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
  }
}

// Execute if run directly
if (require.main === module) {
  verifySystemKbState();
}

export { verifySystemKbState };
