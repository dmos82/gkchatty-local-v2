/**
 * Smart Routing Test & Demo Script
 *
 * Tests the QueryAnalyzer and ModelRouter with real-world examples
 * to validate that the routing logic makes sensible decisions.
 *
 * Run with: npx ts-node test-smart-routing.ts
 */

import { QueryAnalyzer } from './src/services/queryAnalyzer';
import { ModelRouter } from './src/services/modelRouter';

// Test queries with expected complexity levels
const testQueries = [
  // SIMPLE queries (should use small/fast models)
  {
    query: 'What is React?',
    expected: 'simple',
    category: 'Simple definition',
  },
  {
    query: 'How do I install Node.js?',
    expected: 'simple',
    category: 'Simple how-to',
  },
  {
    query: 'List the main features of TypeScript',
    expected: 'simple',
    category: 'Simple list',
  },
  {
    query: 'Can you tell me about MongoDB?',
    expected: 'simple',
    category: 'Simple information request',
  },

  // MEDIUM queries (should use balanced models)
  {
    query: 'Explain the difference between let and const in JavaScript',
    expected: 'medium',
    category: 'Comparison question',
  },
  {
    query: 'How do React hooks work and when should I use them?',
    expected: 'medium',
    category: 'How + when question',
  },
  {
    query: 'What are the best practices for error handling in Node.js applications?',
    expected: 'medium',
    category: 'Best practices question',
  },

  // COMPLEX queries (should use powerful models)
  {
    query:
      'Design a scalable microservices architecture for an e-commerce platform with high availability requirements',
    expected: 'complex',
    category: 'Architecture design',
  },
  {
    query:
      'Analyze the trade-offs between using Redux vs Context API for state management in a large React application. Consider performance, maintainability, and developer experience.',
    expected: 'complex',
    category: 'Deep analysis with multiple factors',
  },
  {
    query:
      'Compare and contrast SQL and NoSQL databases, explaining when to use each, providing specific examples, and discussing migration strategies',
    expected: 'complex',
    category: 'Complex comparison with examples',
  },
  {
    query: `Given this code:
\`\`\`typescript
function processData(items: any[]) {
  return items.map(x => x.value).filter(Boolean);
}
\`\`\`
Explain the issues, suggest improvements, and rewrite it with proper TypeScript types`,
    expected: 'complex',
    category: 'Code review with multiple steps',
  },
];

// Initialize services
const analyzer = new QueryAnalyzer();
const router = new ModelRouter();

console.log('\n========================================');
console.log('  SMART ROUTING TEST & VALIDATION');
console.log('========================================\n');

// Test each query
let correctPredictions = 0;
let totalTests = testQueries.length;

testQueries.forEach((test, index) => {
  console.log(`\n--- Test ${index + 1}: ${test.category} ---`);
  console.log(`Query: "${test.query.substring(0, 80)}${test.query.length > 80 ? '...' : ''}"`);

  // Analyze complexity
  const complexity = analyzer.analyze(test.query);

  // Get routing decisions for both modes
  const ollamaRoute = router.selectModel(complexity, 'ollama');
  const openaiRoute = router.selectModel(complexity, 'openai');

  // Check if prediction matches expected
  const isCorrect = complexity.level === test.expected;
  if (isCorrect) correctPredictions++;

  console.log(`\nComplexity: ${complexity.level.toUpperCase()} (score: ${complexity.score})`);
  console.log(`Expected:   ${test.expected.toUpperCase()}`);
  console.log(`Status:     ${isCorrect ? '✅ CORRECT' : '❌ INCORRECT'}`);
  console.log(`Confidence: ${(complexity.confidence * 100).toFixed(1)}%`);

  console.log(`\nIndicators:`);
  complexity.indicators.forEach((indicator) => {
    console.log(`  • ${indicator}`);
  });

  console.log(`\nRouting Decisions:`);
  console.log(`  Ollama:  ${ollamaRoute.model} (${ollamaRoute.estimatedSpeed})`);
  console.log(`  OpenAI:  ${openaiRoute.model} ($${openaiRoute.estimatedCost?.toFixed(5)}/1K tokens)`);
  console.log(`  Reason:  ${ollamaRoute.reason}`);
});

// Summary statistics
console.log('\n========================================');
console.log('  SUMMARY');
console.log('========================================\n');

const accuracy = (correctPredictions / totalTests) * 100;
console.log(`Accuracy: ${accuracy.toFixed(1)}% (${correctPredictions}/${totalTests} correct)`);

// Get overall statistics
const allComplexities = testQueries.map((t) => analyzer.analyze(t.query));
const stats = analyzer.getStatistics(testQueries.map((t) => t.query));

console.log(`\nComplexity Distribution:`);
console.log(`  Simple:  ${stats.simple} (${((stats.simple / stats.total) * 100).toFixed(1)}%)`);
console.log(`  Medium:  ${stats.medium} (${((stats.medium / stats.total) * 100).toFixed(1)}%)`);
console.log(`  Complex: ${stats.complex} (${((stats.complex / stats.total) * 100).toFixed(1)}%)`);
console.log(`\nAverage Score: ${stats.averageScore.toFixed(1)}`);

// Routing statistics
const ollamaStats = router.getRoutingStatistics(allComplexities, 'ollama');
const openaiStats = router.getRoutingStatistics(allComplexities, 'openai');

console.log(`\nOllama Model Usage:`);
Object.entries(ollamaStats.byModel).forEach(([model, count]) => {
  console.log(`  ${model}: ${count} queries`);
});

console.log(`\nOpenAI Model Usage:`);
Object.entries(openaiStats.byModel).forEach(([model, count]) => {
  console.log(`  ${model}: ${count} queries`);
});

if (openaiStats.totalCost) {
  console.log(`\nEstimated OpenAI Cost: $${openaiStats.totalCost.toFixed(5)} for ${totalTests} queries`);
}

// Performance insights
console.log('\n========================================');
console.log('  INSIGHTS');
console.log('========================================\n');

if (accuracy >= 90) {
  console.log('✅ Excellent accuracy! The routing logic is working very well.');
} else if (accuracy >= 70) {
  console.log('⚠️  Good accuracy, but some edge cases need refinement.');
} else {
  console.log('❌ Poor accuracy. The scoring algorithm needs adjustment.');
}

console.log(`\n💡 Recommendations:`);
if (stats.simple / stats.total < 0.3) {
  console.log('  • Most queries are medium/complex - users benefit from smart routing');
} else {
  console.log('  • Many simple queries - fast models will save costs/time');
}

if (openaiStats.totalCost && openaiStats.totalCost > 0.01) {
  console.log('  • Smart routing could reduce OpenAI costs by ~40-60%');
}

console.log('\n========================================\n');

// Export results for potential CI integration
const results = {
  accuracy,
  totalTests,
  correctPredictions,
  distribution: stats,
  routing: {
    ollama: ollamaStats,
    openai: openaiStats,
  },
};

// Uncomment to save results to file
// import fs from 'fs';
// fs.writeFileSync('test-smart-routing-results.json', JSON.stringify(results, null, 2));
// console.log('Results saved to test-smart-routing-results.json\n');
