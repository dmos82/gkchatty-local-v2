/**
 * RAG Pipeline Evaluation Script
 *
 * Tests RAG retrieval quality with a structured dataset of queries
 * and expected document matches.
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { getContext } from '../src/services/ragService';

dotenv.config();

interface TestCase {
  query: string;
  expectedDocuments: string[];  // Partial filename matches
  minExpectedScore: number;
  category: 'user-guide' | 'godot' | 'project' | 'negative';
}

// Test dataset - based on ACTUAL documents in knowledge base
const TEST_CASES: TestCase[] = [
  // GKChatty User Guide queries (we know this document exists)
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
  // Godot documentation queries (many godot_ docs in KB)
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
  }[];
  metrics: {
    topScore: number;
    avgScore: number;
    resultCount: number;
    expectedDocFound: boolean;
  };
  error?: string;
}

async function evaluateRAG(testUserId: string): Promise<void> {
  console.log('='.repeat(60));
  console.log('RAG PIPELINE EVALUATION');
  console.log('='.repeat(60));
  console.log(`Test User ID: ${testUserId}`);
  console.log(`Test Cases: ${TEST_CASES.length}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('='.repeat(60));

  const results: EvaluationResult[] = [];

  for (const testCase of TEST_CASES) {
    console.log(`\n[Testing] "${testCase.query}"`);

    try {
      const context = await getContext(testCase.query, testUserId, {
        knowledgeBaseTarget: 'unified',
      });

      const resultDetails = context.map(r => ({
        fileName: r.fileName,
        score: r.score,
        matchedExpected: testCase.expectedDocuments.some(
          exp => r.fileName.toLowerCase().includes(exp.toLowerCase())
        ),
      }));

      const topScore = context.length > 0 ? Math.max(...context.map(r => r.score)) : 0;
      const avgScore = context.length > 0
        ? context.reduce((sum, r) => sum + r.score, 0) / context.length
        : 0;
      const expectedDocFound = resultDetails.some(r => r.matchedExpected);

      const passed = expectedDocFound && topScore >= testCase.minExpectedScore;

      results.push({
        query: testCase.query,
        category: testCase.category,
        passed,
        results: resultDetails,
        metrics: {
          topScore,
          avgScore,
          resultCount: context.length,
          expectedDocFound,
        },
      });

      console.log(`  Results: ${context.length}`);
      console.log(`  Top Score: ${topScore.toFixed(3)}`);
      console.log(`  Expected Found: ${expectedDocFound ? 'YES' : 'NO'}`);
      console.log(`  Status: ${passed ? '✅ PASS' : '❌ FAIL'}`);

      if (context.length > 0) {
        console.log(`  Top Match: "${context[0].fileName}" (${context[0].score.toFixed(3)})`);
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
    for (const failed of failedQueries) {
      console.log(`  - "${failed.query}"`);
      if (failed.error) {
        console.log(`    Error: ${failed.error}`);
      } else {
        console.log(`    Top Score: ${failed.metrics.topScore.toFixed(3)}, Expected Found: ${failed.metrics.expectedDocFound}`);
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
  await mongoose.connect(process.env.MONGODB_URI!);
  console.log('Connected to MongoDB');

  // Get a test user ID (use 'dev' user or first admin)
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

main().catch(console.error);
