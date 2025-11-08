import { config } from 'dotenv';
import * as path from 'path';
import { connectDB } from '../utils/mongoHelper';
import { queryVectors } from '../utils/pineconeService';
import { generateEmbeddings } from '../utils/openaiHelper';

// Load environment variables
config({ path: path.resolve(__dirname, '../../.env') });

async function testTenantQuery() {
  console.log('=== TESTING TENANT KB QUERY ===');

  try {
    await connectDB();
    console.log('✅ MongoDB connected');

    // Test query for MIN_CONFIDENCE_SCORE
    const query = 'MIN_CONFIDENCE_SCORE';
    const topK = 5;
    const filter = {
      sourceType: 'tenant',
      tenantKbId: '6856cdf8d516ea93f5057ed5',
    };
    const namespace = 'system-kb';

    console.log(`Querying for: "${query}"`);
    console.log(`Filter:`, filter);
    console.log(`Namespace: ${namespace}`);

    // Generate embedding for the query
    const embeddings = await generateEmbeddings([query]);
    const queryVector = embeddings[0];

    const results = await queryVectors(queryVector, topK, filter, namespace);

    console.log(`\n✅ Query successful! Found ${results.matches.length} matches`);

    results.matches.forEach((match: any, i: number) => {
      console.log(`\nMatch ${i + 1}:`);
      console.log(`  Score: ${match.score}`);
      console.log(`  Document ID: ${match.metadata?.documentId}`);
      console.log(`  Source Type: ${match.metadata?.sourceType}`);
      console.log(`  Tenant KB ID: ${match.metadata?.tenantKbId}`);
      console.log(`  File: ${match.metadata?.originalFileName}`);
      console.log(`  Text preview: ${match.metadata?.text?.substring(0, 200)}...`);
    });

    if (results.matches.length > 0) {
      console.log(
        '\n🎉 SUCCESS: The tenant KB document is searchable and contains MIN_CONFIDENCE_SCORE content!'
      );
    } else {
      console.log('\n⚠️  WARNING: No matches found for MIN_CONFIDENCE_SCORE query');
    }
  } catch (error: any) {
    console.error('❌ Query failed:', error.message);
    console.error('Error details:', error);
  }
}

testTenantQuery().catch(console.error);
