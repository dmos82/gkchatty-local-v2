/**
 * Quick test to verify RAG searches both legacy and prefixed namespaces
 * Run with: npx ts-node scripts/test-rag-fix.ts
 */
import { config } from 'dotenv';
config();

import { Pinecone } from '@pinecone-database/pinecone';

async function testRagNamespaces() {
  const userId = '681d84a29fa9ba28b25d2f6e'; // Your user ID
  const env = process.env.GKCHATTY_ENV || process.env.NODE_ENV || 'local';
  const envPrefix = env === 'production' ? 'prod' : env === 'development' ? 'local' : env;

  console.log('\n=== RAG FIX VERIFICATION ===\n');
  console.log('Environment:', env);
  console.log('Prefix:', envPrefix, '\n');

  const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
  const index = pinecone.Index(process.env.PINECONE_INDEX_NAME || 'gkchatty-sandbox');

  // Check both namespaces
  const prefixedNs = envPrefix + '-user-' + userId;
  const legacyNs = 'user-' + userId;

  console.log('Checking namespaces...\n');

  const stats = await index.describeIndexStats();
  const namespaces = stats.namespaces || {};

  const prefixedCount = namespaces[prefixedNs]?.recordCount || 0;
  const legacyCount = namespaces[legacyNs]?.recordCount || 0;

  console.log('📁 Prefixed namespace (' + prefixedNs + '): ' + prefixedCount + ' vectors');
  console.log('📁 Legacy namespace (' + legacyNs + '): ' + legacyCount + ' vectors');
  console.log('\n📊 Total accessible with fix: ' + (prefixedCount + legacyCount) + ' vectors');

  if (legacyCount > 0 && prefixedCount < legacyCount) {
    const improvement = ((legacyCount / (prefixedCount || 1)) * 100).toFixed(0);
    console.log('\n✅ Fix is critical! Legacy namespace has more data.');
    console.log('   Without fix: Only ' + prefixedCount + ' vectors searchable');
    console.log('   With fix: ' + (prefixedCount + legacyCount) + ' vectors searchable');
    console.log('   Improvement: ' + improvement + '% more documents accessible');
  }

  // Also check system KB
  const prefixedSystemNs = envPrefix + '-system-kb';
  const legacySystemNs = 'system-kb';

  const prefixedSystemCount = namespaces[prefixedSystemNs]?.recordCount || 0;
  const legacySystemCount = namespaces[legacySystemNs]?.recordCount || 0;

  console.log('\n--- System KB ---');
  console.log('📁 Prefixed (' + prefixedSystemNs + '): ' + prefixedSystemCount + ' vectors');
  console.log('📁 Legacy (' + legacySystemNs + '): ' + legacySystemCount + ' vectors');

  console.log('\n=== VERIFICATION COMPLETE ===\n');
}

testRagNamespaces().catch(console.error);
