/**
 * Search for "kei meetings" document specifically
 */
import { config } from 'dotenv';
config();

import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';

async function searchKeiMeetings() {
  const userId = '681d84a29fa9ba28b25d2f6e';
  const query = 'kei meetings';

  console.log('=== SEARCHING FOR "KEI MEETINGS" ===\n');

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
  const index = pinecone.Index(process.env.PINECONE_INDEX_NAME || 'gkchatty-sandbox');

  // Generate embedding for the query
  console.log('Generating embedding for query:', query);
  const embeddingResponse = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query,
  });
  const queryVector = embeddingResponse.data[0].embedding;

  // Check BOTH namespaces
  const prefixedNs = `staging-user-${userId}`;
  const legacyNs = `user-${userId}`;

  console.log('\n--- Searching PREFIXED namespace:', prefixedNs, '---');
  const prefixedResult = await index.namespace(prefixedNs).query({
    vector: queryVector,
    topK: 10,
    includeMetadata: true,
    filter: { userId, sourceType: 'user' }
  });

  console.log(`Found ${prefixedResult.matches?.length || 0} matches`);
  if (prefixedResult.matches && prefixedResult.matches.length > 0) {
    prefixedResult.matches.forEach((match, idx) => {
      const fileName = (match.metadata as any)?.originalFileName || 'unknown';
      const text = ((match.metadata as any)?.text || '').substring(0, 100);
      console.log(`  ${idx + 1}. ${fileName} (score: ${match.score?.toFixed(4)})`);
      console.log(`     Preview: ${text}...`);
    });
  }

  console.log('\n--- Searching LEGACY namespace:', legacyNs, '---');
  const legacyResult = await index.namespace(legacyNs).query({
    vector: queryVector,
    topK: 10,
    includeMetadata: true,
    filter: { userId, sourceType: 'user' }
  });

  console.log(`Found ${legacyResult.matches?.length || 0} matches`);
  if (legacyResult.matches && legacyResult.matches.length > 0) {
    legacyResult.matches.forEach((match, idx) => {
      const fileName = (match.metadata as any)?.originalFileName || 'unknown';
      const text = ((match.metadata as any)?.text || '').substring(0, 100);
      console.log(`  ${idx + 1}. ${fileName} (score: ${match.score?.toFixed(4)})`);
      console.log(`     Preview: ${text}...`);
    });
  }

  // Also list all namespaces to see what exists
  console.log('\n--- All namespaces in index ---');
  const stats = await index.describeIndexStats();
  const namespaces = stats.namespaces || {};
  Object.entries(namespaces).forEach(([ns, data]) => {
    if (ns.includes(userId) || ns.includes('user')) {
      console.log(`  ${ns}: ${(data as any).recordCount} vectors`);
    }
  });

  // Search by filename pattern
  console.log('\n--- Searching for files containing "kei" in name ---');
  const legacyNoFilterResult = await index.namespace(legacyNs).query({
    vector: queryVector,
    topK: 50,
    includeMetadata: true,
  });

  const keiFiles = (legacyNoFilterResult.matches || []).filter(m => {
    const fileName = ((m.metadata as any)?.originalFileName || '').toLowerCase();
    return fileName.includes('kei');
  });

  console.log(`Found ${keiFiles.length} files with "kei" in name:`);
  keiFiles.forEach((match, idx) => {
    const fileName = (match.metadata as any)?.originalFileName || 'unknown';
    console.log(`  ${idx + 1}. ${fileName} (score: ${match.score?.toFixed(4)})`);
  });
}

searchKeiMeetings().catch(console.error);
