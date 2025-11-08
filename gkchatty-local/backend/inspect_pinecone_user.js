const { Pinecone } = require('@pinecone-database/pinecone');
const mongoose = require('mongoose');
require('dotenv').config();

async function inspectUserVectors() {
  try {
    // Connect to MongoDB to get davidmorinmusic user ID
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB');

    const userSchema = new mongoose.Schema({}, { strict: false, collection: 'users' });
    const User = mongoose.model('User', userSchema);

    const user = await User.findOne({ username: 'davidmorinmusic' });
    if (!user) {
      console.log('❌ User davidmorinmusic not found');
      process.exit(1);
    }

    const userId = user._id.toString();
    console.log('\n=== DAVIDMORINMUSIC USER ===');
    console.log('User ID:', userId);
    console.log('Username:', user.username);
    console.log('');

    // Connect to Pinecone
    const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
    const index = pinecone.index(process.env.PINECONE_INDEX_NAME);

    console.log('=== PINECONE INDEX STATS ===');
    const stats = await index.describeIndexStats();
    console.log('Total vectors:', stats.totalRecordCount);
    console.log('Namespaces:');
    if (stats.namespaces) {
      for (const [ns, data] of Object.entries(stats.namespaces)) {
        console.log(`  - ${ns}: ${data.recordCount} vectors`);
      }
    }
    console.log('');

    // Query user's namespace
    const userNamespace = `user-${userId}`;
    console.log(`=== QUERYING NAMESPACE: ${userNamespace} ===`);

    try {
      // Get stats for this specific namespace
      const namespaceStats = stats.namespaces?.[userNamespace];
      if (namespaceStats) {
        console.log(`Found ${namespaceStats.recordCount} vectors in user namespace`);
      } else {
        console.log('⚠️  No vectors found in user namespace');
      }

      // Try to fetch some vectors with user filter
      console.log('\n=== SAMPLE QUERY (looking for Marie Elena Sanchez) ===');
      const dummyEmbedding = new Array(1536).fill(0); // Dummy embedding for test query

      const queryResult = await index.namespace(userNamespace).query({
        vector: dummyEmbedding,
        topK: 10,
        includeMetadata: true,
        filter: { userId: userId }
      });

      console.log(`Found ${queryResult.matches.length} matches with user filter`);
      queryResult.matches.forEach((match, i) => {
        console.log(`\n  Match ${i + 1}:`);
        console.log(`    ID: ${match.id}`);
        console.log(`    Score: ${match.score}`);
        console.log(`    File: ${match.metadata?.originalFileName || 'Unknown'}`);
        console.log(`    User ID: ${match.metadata?.userId || 'MISSING'}`);
        console.log(`    Source Type: ${match.metadata?.sourceType || 'MISSING'}`);
        console.log(`    Doc ID: ${match.metadata?.documentId || 'MISSING'}`);
      });

      // Also check default namespace (where ghost embeddings might be)
      console.log('\n=== CHECKING DEFAULT NAMESPACE FOR MARIE ELENA ===');
      const defaultNamespaceQuery = await index.namespace('').query({
        vector: dummyEmbedding,
        topK: 20,
        includeMetadata: true
      });

      console.log(`Found ${defaultNamespaceQuery.matches.length} matches in default namespace`);
      const marieMatches = defaultNamespaceQuery.matches.filter(m =>
        m.metadata?.originalFileName?.toLowerCase().includes('marie')
      );

      console.log(`\nMatches containing "marie": ${marieMatches.length}`);
      marieMatches.forEach((match, i) => {
        console.log(`\n  Match ${i + 1}:`);
        console.log(`    ID: ${match.id}`);
        console.log(`    File: ${match.metadata?.originalFileName || 'Unknown'}`);
        console.log(`    User ID: ${match.metadata?.userId || 'MISSING ⚠️'}`);
        console.log(`    Source Type: ${match.metadata?.sourceType || 'MISSING'}`);
        console.log(`    Doc ID: ${match.metadata?.documentId || 'MISSING'}`);
      });

    } catch (err) {
      console.error('Query error:', err.message);
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

inspectUserVectors();
