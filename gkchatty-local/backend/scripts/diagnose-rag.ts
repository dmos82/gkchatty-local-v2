/**
 * Diagnostic script to check Pinecone namespace state and RAG configuration
 * Run with: npx ts-node scripts/diagnose-rag.ts
 */

import { config } from 'dotenv';
import { Pinecone } from '@pinecone-database/pinecone';

config();

async function diagnoseRAG() {
  console.log('=== RAG DIAGNOSTIC REPORT ===\n');

  // 1. Check environment configuration
  console.log('1. ENVIRONMENT CONFIGURATION:');
  console.log('   GKCHATTY_ENV:', process.env.GKCHATTY_ENV || 'NOT SET');
  console.log('   NODE_ENV:', process.env.NODE_ENV || 'NOT SET');
  console.log('   PINECONE_INDEX_NAME:', process.env.PINECONE_INDEX_NAME || 'NOT SET');
  console.log('   PINECONE_NAMESPACE:', process.env.PINECONE_NAMESPACE || 'NOT SET (will use defaults)');
  console.log('');

  // 2. Calculate expected namespaces
  const env = process.env.GKCHATTY_ENV || process.env.NODE_ENV || 'local';
  const envPrefix = env === 'production' ? 'prod' : env === 'development' ? 'local' : env;

  console.log('2. EXPECTED NAMESPACE CONFIGURATION:');
  console.log(`   Environment Prefix: ${envPrefix}`);
  console.log(`   Expected System KB Namespace: ${envPrefix}-system-kb`);
  console.log(`   Expected User Namespace Pattern: ${envPrefix}-user-{userId}`);
  console.log('');

  // 3. Connect to Pinecone and check namespaces
  console.log('3. PINECONE NAMESPACE ANALYSIS:');

  if (!process.env.PINECONE_API_KEY) {
    console.log('   ERROR: PINECONE_API_KEY not set');
    return;
  }

  try {
    const pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY,
    });

    const indexName = process.env.PINECONE_INDEX_NAME || 'gkchatty-sandbox';
    const index = pinecone.Index(indexName);

    // Get overall index stats
    const stats = await index.describeIndexStats();
    console.log(`   Index: ${indexName}`);
    console.log(`   Total Vectors: ${stats.totalRecordCount}`);
    console.log(`   Dimension: ${stats.dimension}`);
    console.log('');

    // Check each namespace
    console.log('   NAMESPACES FOUND:');
    const namespaces = stats.namespaces || {};
    const namespaceNames = Object.keys(namespaces);

    if (namespaceNames.length === 0) {
      console.log('   (No namespaces found - all data may be in default namespace)');
    } else {
      for (const ns of namespaceNames) {
        const nsStats = namespaces[ns];
        console.log(`   - "${ns || '(default)'}": ${nsStats.recordCount} vectors`);
      }
    }
    console.log('');

    // 4. Check specific namespaces we expect
    console.log('4. NAMESPACE VERIFICATION:');

    const namespacesToCheck = [
      '', // default
      'system-kb', // legacy
      `${envPrefix}-system-kb`, // current expected
      'prod-system-kb',
      'staging-system-kb',
      'local-system-kb',
    ];

    for (const ns of namespacesToCheck) {
      const nsIndex = index.namespace(ns);
      try {
        const nsStats = await nsIndex.describeIndexStats();
        const count = nsStats.namespaces?.[ns]?.recordCount || 0;
        if (count > 0) {
          console.log(`   ✅ "${ns || '(default)'}": ${count} vectors`);
        } else {
          console.log(`   ❌ "${ns || '(default)'}": empty`);
        }
      } catch (e) {
        console.log(`   ❌ "${ns || '(default)'}": error checking`);
      }
    }
    console.log('');

    // 5. Sample query to check metadata structure
    console.log('5. SAMPLE VECTOR METADATA CHECK:');
    const expectedNs = `${envPrefix}-system-kb`;
    try {
      const queryResult = await index.namespace(expectedNs).query({
        vector: new Array(1536).fill(0.01), // dummy vector
        topK: 1,
        includeMetadata: true,
      });

      if (queryResult.matches && queryResult.matches.length > 0) {
        const sample = queryResult.matches[0];
        console.log(`   Found vector in ${expectedNs}:`);
        console.log(`   - ID: ${sample.id}`);
        console.log(`   - Metadata:`, JSON.stringify(sample.metadata, null, 2));
      } else {
        console.log(`   No vectors found in ${expectedNs}`);

        // Try legacy namespace
        const legacyResult = await index.namespace('system-kb').query({
          vector: new Array(1536).fill(0.01),
          topK: 1,
          includeMetadata: true,
        });

        if (legacyResult.matches && legacyResult.matches.length > 0) {
          console.log(`   ⚠️  Found vectors in LEGACY 'system-kb' namespace instead!`);
          console.log(`   - ID: ${legacyResult.matches[0].id}`);
          console.log(`   - Metadata:`, JSON.stringify(legacyResult.matches[0].metadata, null, 2));
        }
      }
    } catch (e: any) {
      console.log(`   Error querying: ${e.message}`);
    }

    console.log('\n=== DIAGNOSIS COMPLETE ===');

    // Summary
    console.log('\n📋 SUMMARY:');
    const hasLegacyData = namespaces['system-kb']?.recordCount > 0;
    const hasNewData = namespaces[`${envPrefix}-system-kb`]?.recordCount > 0;

    if (hasLegacyData && !hasNewData) {
      console.log('   ⚠️  ISSUE: Data exists in legacy "system-kb" namespace but RAG queries');
      console.log(`      are looking in "${envPrefix}-system-kb" namespace.`);
      console.log('   FIX: Reindex all documents OR adjust namespace configuration.');
    } else if (hasNewData && hasLegacyData) {
      console.log('   ⚠️  WARNING: Data exists in BOTH legacy and new namespaces.');
      console.log('      This could cause inconsistencies.');
    } else if (hasNewData) {
      console.log('   ✅ Data is in the correct namespace.');
    } else {
      console.log('   ❌ No data found in expected namespaces!');
    }

  } catch (error: any) {
    console.log('   ERROR:', error.message);
  }
}

diagnoseRAG().catch(console.error);
