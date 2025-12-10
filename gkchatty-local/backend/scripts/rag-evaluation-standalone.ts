/**
 * RAG Pipeline Evaluation Script (Standalone)
 *
 * Tests RAG retrieval quality with a structured dataset.
 * Bypasses application stack by directly querying Pinecone.
 */

import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Configuration
const PINECONE_INDEX = process.env.PINECONE_INDEX_NAME || process.env.PINECONE_INDEX || 'gkchatty-sandbox';
const MIN_CONFIDENCE_SCORE = 0.35;
const TOP_K = 5;

interface TestCase {
  query: string;
  expectedDocuments: string[];  // Partial filename matches
  minExpectedScore: number;
  category: 'user-guide' | 'godot' | 'project' | 'negative';
}

// Test dataset - based on ACTUAL documents in knowledge base
const TEST_CASES: TestCase[] = [
  // GKChatty User Guide queries
  {
    query: 'How do I login to GKChatty?',
    expectedDocuments: ['User Guide', 'user guide'],
    minExpectedScore: 0.4,
    category: 'user-guide',
  },
  {
    query: 'How do I use the chat interface?',
    expectedDocuments: ['User Guide', 'user guide'],
    minExpectedScore: 0.5,
    category: 'user-guide',
  },
  {
    query: 'What is the Knowledge Base toggle?',
    expectedDocuments: ['User Guide', 'user guide'],
    minExpectedScore: 0.4,
    category: 'user-guide',
  },
  {
    query: 'How do I upload documents?',
    expectedDocuments: ['User Guide', 'user guide'],
    minExpectedScore: 0.4,
    category: 'user-guide',
  },
  // Godot documentation queries
  {
    query: 'How do I handle input events in Godot?',
    expectedDocuments: ['godot', 'input'],
    minExpectedScore: 0.4,
    category: 'godot',
  },
  {
    query: 'What are the core classes in Godot?',
    expectedDocuments: ['godot', 'core_classes'],
    minExpectedScore: 0.4,
    category: 'godot',
  },
  {
    query: 'How do I use GDScript?',
    expectedDocuments: ['godot', 'gdscript'],
    minExpectedScore: 0.4,
    category: 'godot',
  },
  {
    query: 'How do 2D nodes work in Godot?',
    expectedDocuments: ['godot', '2d_nodes'],
    minExpectedScore: 0.4,
    category: 'godot',
  },
  // BMAD/Project docs
  {
    query: 'What is the HILMOS execution plan?',
    expectedDocuments: ['HILMOS', 'BMAD'],
    minExpectedScore: 0.35,
    category: 'project',
  },
  {
    query: 'What is Space Hole game design?',
    expectedDocuments: ['SPACE_HOLE', 'GAME_DESIGN'],
    minExpectedScore: 0.35,
    category: 'project',
  },
  // Negative test - query that shouldn't find anything specific
  {
    query: 'What is the weather forecast for tomorrow?',
    expectedDocuments: [],  // Should NOT find relevant docs
    minExpectedScore: 0.0,
    category: 'negative',
  },
];

interface EvaluationResult {
  query: string;
  category: string;
  passed: boolean;
  results: {
    fileName: string;
    score: number;
    matchedExpected: boolean;
    namespace: string;
  }[];
  metrics: {
    topScore: number;
    avgScore: number;
    resultCount: number;
    expectedDocFound: boolean;
  };
  error?: string;
}

async function getEmbedding(text: string, openai: OpenAI): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return response.data[0].embedding;
}

interface PineconeMatch {
  id: string;
  score?: number;
  metadata?: Record<string, unknown>;
}

async function queryPineconeWithNamespaces(
  index: ReturnType<Pinecone['index']>,
  embedding: number[],
  namespaces: string[],
  topK: number
): Promise<Array<PineconeMatch & { namespace: string }>> {
  const allResults: Array<PineconeMatch & { namespace: string }> = [];

  for (const namespace of namespaces) {
    try {
      const ns = index.namespace(namespace);
      const queryResponse = await ns.query({
        vector: embedding,
        topK,
        includeMetadata: true,
      });

      const matches = queryResponse.matches || [];
      for (const match of matches) {
        allResults.push({
          ...match,
          namespace,
        });
      }
    } catch (error) {
      // Namespace might not exist, skip it
      console.log(`  [Debug] Namespace ${namespace} query failed (may not exist)`);
    }
  }

  // Sort by score descending and return top K
  return allResults
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, topK);
}

async function evaluateRAG(testUserId: string): Promise<void> {
  console.log('='.repeat(60));
  console.log('RAG PIPELINE EVALUATION (Standalone)');
  console.log('='.repeat(60));
  console.log(`Pinecone Index: ${PINECONE_INDEX}`);
  console.log(`Test User ID: ${testUserId}`);
  console.log(`Test Cases: ${TEST_CASES.length}`);
  console.log(`Min Confidence Score: ${MIN_CONFIDENCE_SCORE}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('='.repeat(60));

  // Initialize clients
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
  const index = pinecone.index(PINECONE_INDEX);

  // Define namespaces to query (unified mode = user + system-kb)
  const namespacesToQuery = [
    `user-${testUserId}`,
    'system-kb',
    // Also try legacy namespace patterns
    `user_${testUserId}`,
    testUserId,
  ];

  console.log(`\nNamespaces to query: ${namespacesToQuery.join(', ')}`);

  const results: EvaluationResult[] = [];

  for (const testCase of TEST_CASES) {
    console.log(`\n[Testing] "${testCase.query}"`);

    try {
      // Generate embedding
      const embedding = await getEmbedding(testCase.query, openai);

      // Query Pinecone across all namespaces
      const matches = await queryPineconeWithNamespaces(
        index,
        embedding,
        namespacesToQuery,
        TOP_K
      );

      // Filter by confidence score
      const filteredMatches = matches.filter(m => (m.score || 0) >= MIN_CONFIDENCE_SCORE);

      const resultDetails = filteredMatches.map(m => ({
        fileName: (m.metadata?.fileName as string) || (m.metadata?.originalFileName as string) || 'unknown',
        score: m.score || 0,
        matchedExpected: testCase.expectedDocuments.length === 0 ? false :
          testCase.expectedDocuments.some(
            exp => ((m.metadata?.fileName as string) || '').toLowerCase().includes(exp.toLowerCase()) ||
                   ((m.metadata?.originalFileName as string) || '').toLowerCase().includes(exp.toLowerCase())
          ),
        namespace: m.namespace,
      }));

      const topScore = filteredMatches.length > 0 ? Math.max(...filteredMatches.map(m => m.score || 0)) : 0;
      const avgScore = filteredMatches.length > 0
        ? filteredMatches.reduce((sum, m) => sum + (m.score || 0), 0) / filteredMatches.length
        : 0;
      const expectedDocFound = testCase.expectedDocuments.length === 0
        ? filteredMatches.length === 0  // For negative tests, pass if no results
        : resultDetails.some(r => r.matchedExpected);

      // For negative tests, pass if we don't find high-scoring matches
      const passed = testCase.category === 'negative'
        ? topScore < 0.5  // Negative test passes if nothing relevant found
        : expectedDocFound && topScore >= testCase.minExpectedScore;

      results.push({
        query: testCase.query,
        category: testCase.category,
        passed,
        results: resultDetails,
        metrics: {
          topScore,
          avgScore,
          resultCount: filteredMatches.length,
          expectedDocFound,
        },
      });

      console.log(`  Results: ${filteredMatches.length} (${matches.length} before filtering)`);
      console.log(`  Top Score: ${topScore.toFixed(3)}`);
      console.log(`  Expected Found: ${expectedDocFound ? 'YES' : 'NO'}`);
      console.log(`  Status: ${passed ? '✅ PASS' : '❌ FAIL'}`);

      if (filteredMatches.length > 0) {
        const topMatch = filteredMatches[0];
        const fileName = (topMatch.metadata?.fileName as string) || (topMatch.metadata?.originalFileName as string) || 'unknown';
        console.log(`  Top Match: "${fileName}" (${(topMatch.score || 0).toFixed(3)}) [${topMatch.namespace}]`);
      }

    } catch (error) {
      results.push({
        query: testCase.query,
        category: testCase.category,
        passed: false,
        results: [],
        metrics: {
          topScore: 0,
          avgScore: 0,
          resultCount: 0,
          expectedDocFound: false,
        },
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      console.log(`  Status: ❌ ERROR - ${error}`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('EVALUATION SUMMARY');
  console.log('='.repeat(60));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const passRate = ((passed / results.length) * 100).toFixed(1);

  console.log(`\nOverall: ${passed}/${results.length} passed (${passRate}%)`);

  // By category
  const categories = [...new Set(results.map(r => r.category))];
  for (const category of categories) {
    const categoryResults = results.filter(r => r.category === category);
    const categoryPassed = categoryResults.filter(r => r.passed).length;
    console.log(`  ${category}: ${categoryPassed}/${categoryResults.length}`);
  }

  // Score distribution
  const allScores = results
    .flatMap(r => r.results.map(res => res.score))
    .filter(s => s > 0);

  if (allScores.length > 0) {
    console.log('\nScore Distribution:');
    console.log(`  Min: ${Math.min(...allScores).toFixed(3)}`);
    console.log(`  Max: ${Math.max(...allScores).toFixed(3)}`);
    console.log(`  Avg: ${(allScores.reduce((a, b) => a + b, 0) / allScores.length).toFixed(3)}`);
  }

  // Failed queries
  const failedQueries = results.filter(r => !r.passed);
  if (failedQueries.length > 0) {
    console.log('\nFailed Queries:');
    for (const f of failedQueries) {
      console.log(`  - "${f.query}"`);
      if (f.error) {
        console.log(`    Error: ${f.error}`);
      } else {
        console.log(`    Top Score: ${f.metrics.topScore.toFixed(3)}, Expected Found: ${f.metrics.expectedDocFound}`);
        if (f.results.length > 0) {
          console.log(`    Got: ${f.results.map(r => `${r.fileName} [${r.namespace}]`).join(', ')}`);
        }
      }
    }
  }

  // Recommendations
  console.log('\n' + '='.repeat(60));
  console.log('RECOMMENDATIONS');
  console.log('='.repeat(60));

  if (parseFloat(passRate) < 70) {
    console.log('⚠️  Pass rate below 70% - consider:');
    console.log('   - Lowering MIN_CONFIDENCE_SCORE threshold');
    console.log('   - Re-indexing documents with better chunking');
    console.log('   - Adding more relevant documents to knowledge base');
  } else if (parseFloat(passRate) >= 90) {
    console.log('✅ Excellent pass rate! RAG pipeline is performing well.');
  } else {
    console.log('📊 Good pass rate. Review failed queries for improvement opportunities.');
  }

  console.log('\n');
}

async function main() {
  // Connect to MongoDB to get test user
  await mongoose.connect(process.env.MONGODB_URI!);
  console.log('Connected to MongoDB');

  const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
  const testUser = await User.findOne({ role: 'admin' }).select('_id username');

  if (!testUser) {
    console.error('No admin user found for testing');
    process.exit(1);
  }

  console.log(`Using test user: ${(testUser as any).username} (${testUser._id})`);

  await evaluateRAG(testUser._id.toString());

  await mongoose.disconnect();
}

// Run evaluation
main().catch(console.error);
