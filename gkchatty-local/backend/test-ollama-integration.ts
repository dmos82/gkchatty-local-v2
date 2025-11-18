/**
 * Ollama Integration Test Script
 *
 * Tests the complete Ollama integration including:
 * - Health check
 * - Model listing
 * - Chat completion
 * - Fallback to OpenAI
 *
 * Run with: npx ts-node test-ollama-integration.ts
 */

import 'dotenv/config';
import { ollamaService } from './src/services/ollamaService';
import { chatService } from './src/services/chatService';

console.log('\n========================================');
console.log('  OLLAMA INTEGRATION TEST');
console.log('========================================\n');

async function runTests() {
  let testsRun = 0;
  let testsPassed = 0;
  let testsFailed = 0;

  // ===== TEST 1: Health Check =====
  console.log('--- Test 1: Health Check ---');
  testsRun++;
  try {
    const health = await ollamaService.healthCheck();

    if (health.status === 'healthy') {
      console.log('✅ PASS: Ollama is healthy');
      console.log(`   Version: ${health.version}`);
      console.log(`   Models: ${health.models}`);
      testsPassed++;
    } else {
      console.log('❌ FAIL: Ollama is unhealthy');
      console.log(`   Error: ${health.error}`);
      testsFailed++;
    }
  } catch (error: any) {
    console.log('❌ FAIL: Health check threw error');
    console.log(`   Error: ${error.message}`);
    testsFailed++;
  }

  console.log('');

  // ===== TEST 2: List Models =====
  console.log('--- Test 2: List Models ---');
  testsRun++;
  try {
    const models = await ollamaService.getSimpleModelList();

    if (models.length > 0) {
      console.log(`✅ PASS: Found ${models.length} models`);
      models.forEach((model) => {
        console.log(`   - ${model.name} (${model.size}, ${model.parameterSize})`);
      });
      testsPassed++;
    } else {
      console.log('⚠️  WARN: No models found (may need to pull models)');
      console.log('   Run: ollama pull llama3.2:1b');
      testsFailed++;
    }
  } catch (error: any) {
    console.log('❌ FAIL: List models threw error');
    console.log(`   Error: ${error.message}`);
    testsFailed++;
  }

  console.log('');

  // ===== TEST 3: Check Specific Model =====
  console.log('--- Test 3: Check for llama3.2:3b ---');
  testsRun++;
  try {
    const hasModel = await ollamaService.hasModel('llama3.2:3b');

    if (hasModel) {
      console.log('✅ PASS: llama3.2:3b is available');
      testsPassed++;
    } else {
      console.log('⚠️  WARN: llama3.2:3b not found');
      console.log('   Run: ollama pull llama3.2:3b');
      testsFailed++;
    }
  } catch (error: any) {
    console.log('❌ FAIL: Model check threw error');
    console.log(`   Error: ${error.message}`);
    testsFailed++;
  }

  console.log('');

  // ===== TEST 4: Simple Chat Request (Ollama) =====
  console.log('--- Test 4: Simple Chat (Ollama Mode) ---');
  testsRun++;
  try {
    console.log('Sending: "What is 2+2? Answer in one word."');

    const response = await chatService.getChatCompletion({
      messages: [
        {
          role: 'user',
          content: 'What is 2+2? Answer in one word.',
        },
      ],
      modelMode: 'ollama',
      model: 'llama3.2:3b',
      temperature: 0.1,
      enableFallback: false, // Don't fallback for this test
    });

    console.log(`✅ PASS: Received response from ${response.modelUsed}`);
    console.log(`   Mode: ${response.modelMode}`);
    console.log(`   Response: "${response.content.substring(0, 100)}"`);
    console.log(`   Fallback used: ${response.fallbackUsed}`);

    if (response.usage) {
      console.log(`   Tokens: ${response.usage.total_tokens}`);
    }

    testsPassed++;
  } catch (error: any) {
    console.log('❌ FAIL: Ollama chat threw error');
    console.log(`   Error: ${error.message}`);
    console.log('   (This is expected if Ollama is not running or model not pulled)');
    testsFailed++;
  }

  console.log('');

  // ===== TEST 5: Chat with Fallback =====
  console.log('--- Test 5: Chat with Fallback (Ollama → OpenAI) ---');
  testsRun++;
  try {
    console.log('Sending: "Say hello in one word"');
    console.log('Using non-existent model to trigger fallback...');

    const response = await chatService.getChatCompletion({
      messages: [
        {
          role: 'user',
          content: 'Say hello in one word',
        },
      ],
      modelMode: 'ollama',
      model: 'nonexistent-model:999', // This will fail
      temperature: 0.1,
      enableFallback: true, // Allow fallback to OpenAI
    });

    console.log(`✅ PASS: Fallback mechanism works`);
    console.log(`   Final mode: ${response.modelMode}`);
    console.log(`   Model used: ${response.modelUsed}`);
    console.log(`   Fallback used: ${response.fallbackUsed ? 'YES' : 'NO'}`);
    console.log(`   Response: "${response.content.substring(0, 50)}"`);

    if (response.fallbackUsed && response.modelMode === 'openai') {
      console.log('   ✅ Successfully fell back to OpenAI');
      testsPassed++;
    } else {
      console.log('   ⚠️  Fallback did not work as expected');
      testsFailed++;
    }
  } catch (error: any) {
    console.log('❌ FAIL: Fallback test threw error');
    console.log(`   Error: ${error.message}`);
    testsFailed++;
  }

  console.log('');

  // ===== TEST 6: OpenAI Direct =====
  console.log('--- Test 6: Direct OpenAI Call ---');
  testsRun++;
  try {
    console.log('Sending: "What is TypeScript? Answer in 10 words or less."');

    const response = await chatService.getChatCompletion({
      messages: [
        {
          role: 'user',
          content: 'What is TypeScript? Answer in 10 words or less.',
        },
      ],
      modelMode: 'openai',
      temperature: 0.1,
    });

    console.log(`✅ PASS: OpenAI mode works`);
    console.log(`   Mode: ${response.modelMode}`);
    console.log(`   Model: ${response.modelUsed}`);
    console.log(`   Response: "${response.content}"`);

    if (response.usage) {
      console.log(`   Tokens: ${response.usage.total_tokens}`);
    }

    testsPassed++;
  } catch (error: any) {
    console.log('❌ FAIL: OpenAI call threw error');
    console.log(`   Error: ${error.message}`);
    testsFailed++;
  }

  // ===== SUMMARY =====
  console.log('\n========================================');
  console.log('  TEST SUMMARY');
  console.log('========================================\n');

  console.log(`Total Tests: ${testsRun}`);
  console.log(`✅ Passed: ${testsPassed}`);
  console.log(`❌ Failed: ${testsFailed}`);
  console.log('');

  if (testsFailed === 0) {
    console.log('🎉 All tests passed!');
  } else {
    console.log('⚠️  Some tests failed. Check the output above.');
    console.log('');
    console.log('Common fixes:');
    console.log('  - Make sure Ollama is running: ollama serve');
    console.log('  - Pull required models: ollama pull llama3.2:3b');
    console.log('  - Check OLLAMA_BASE_URL in .env');
    console.log('  - Ensure FEATURE_OLLAMA_MODELS=true in .env');
  }

  console.log('\n========================================\n');
}

// Run the tests
runTests().catch((error) => {
  console.error('Fatal error running tests:', error);
  process.exit(1);
});
