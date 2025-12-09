/**
 * Check metadata in legacy namespace to understand why filtered queries fail
 */
import { config } from 'dotenv';
config();

import { Pinecone } from '@pinecone-database/pinecone';

async function checkLegacyMetadata() {
  const userId = '681d84a29fa9ba28b25d2f6e';
  const legacyNs = `user-${userId}`;

  console.log('=== LEGACY NAMESPACE METADATA CHECK ===\n');
  console.log('Checking namespace:', legacyNs);

  const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
  const index = pinecone.Index(process.env.PINECONE_INDEX_NAME || 'gkchatty-sandbox');

  // Query WITHOUT filter to get raw vectors
  console.log('\n--- Query WITHOUT filter (raw vectors) ---');
  const rawResult = await index.namespace(legacyNs).query({
    vector: new Array(1536).fill(0.01),
    topK: 5,
    includeMetadata: true,
  });

  if (rawResult.matches && rawResult.matches.length > 0) {
    console.log(`Found ${rawResult.matches.length} raw vectors\n`);
    rawResult.matches.forEach((match, idx) => {
      console.log(`Match ${idx + 1}:`);
      console.log(`  ID: ${match.id}`);
      console.log(`  Score: ${match.score}`);
      console.log(`  Metadata keys:`, Object.keys(match.metadata || {}));
      console.log(`  userId: ${(match.metadata as any)?.userId || 'NOT SET'}`);
      console.log(`  sourceType: ${(match.metadata as any)?.sourceType || 'NOT SET'}`);
      console.log(`  originalFileName: ${(match.metadata as any)?.originalFileName || 'NOT SET'}`);
      console.log('');
    });
  } else {
    console.log('No vectors found in raw query');
  }

  // Query WITH filter (userId + sourceType)
  console.log('\n--- Query WITH filter (userId + sourceType: user) ---');
  try {
    const filteredResult = await index.namespace(legacyNs).query({
      vector: new Array(1536).fill(0.01),
      topK: 5,
      includeMetadata: true,
      filter: {
        userId: userId,
        sourceType: 'user'
      }
    });

    console.log(`Found ${filteredResult.matches?.length || 0} filtered vectors\n`);
    if (filteredResult.matches && filteredResult.matches.length > 0) {
      filteredResult.matches.forEach((match, idx) => {
        console.log(`Match ${idx + 1}: ${match.id} (${(match.metadata as any)?.originalFileName})`);
      });
    }
  } catch (e: any) {
    console.log('Filter query failed:', e.message);
  }

  // Query with ONLY userId filter
  console.log('\n--- Query with ONLY userId filter ---');
  try {
    const userIdOnlyResult = await index.namespace(legacyNs).query({
      vector: new Array(1536).fill(0.01),
      topK: 5,
      includeMetadata: true,
      filter: {
        userId: userId
      }
    });

    console.log(`Found ${userIdOnlyResult.matches?.length || 0} vectors with userId filter only\n`);
  } catch (e: any) {
    console.log('userId-only filter query failed:', e.message);
  }

  // Query with ONLY sourceType filter
  console.log('\n--- Query with ONLY sourceType filter ---');
  try {
    const sourceTypeOnlyResult = await index.namespace(legacyNs).query({
      vector: new Array(1536).fill(0.01),
      topK: 5,
      includeMetadata: true,
      filter: {
        sourceType: 'user'
      }
    });

    console.log(`Found ${sourceTypeOnlyResult.matches?.length || 0} vectors with sourceType filter only\n`);
  } catch (e: any) {
    console.log('sourceType-only filter query failed:', e.message);
  }

  console.log('\n=== DIAGNOSIS ===');
  console.log('If raw query returns results but filtered queries return 0,');
  console.log('then the legacy vectors are missing the required metadata fields.');
  console.log('The fix must query WITHOUT filters for legacy namespaces.');
}

checkLegacyMetadata().catch(console.error);
