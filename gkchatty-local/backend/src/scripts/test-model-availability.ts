/**
 * Test script to check which OpenAI models are accessible
 *
 * This script tests each model in ALLOWED_OPENAI_MODELS by making
 * a minimal API call to OpenAI. Models that return 404 or permission
 * errors are marked as unavailable.
 */

import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const MODELS_TO_TEST = [
  // GPT-5 Series (Released August 2025)
  'gpt-5',
  'gpt-5-mini',
  'gpt-5-nano',
  'gpt-5-chat-latest',

  // GPT-4.1 Series (2025)
  'gpt-4.1',
  'gpt-4.1-mini',

  // GPT-4o Series (2024-2025)
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4o-2024-11-20',
  'gpt-4o-2024-08-06',
  'gpt-4o-mini-2024-07-18',

  // GPT-4 Turbo Models (Legacy)
  'gpt-4-turbo',
  'gpt-4-turbo-2024-04-09',

  // O-Series Reasoning Models (2025)
  'o3',
  'o3-mini',
  'o3-pro',
  'o4-mini',

  // GPT-3.5 Models (Legacy support)
  'gpt-3.5-turbo',
  'gpt-3.5-turbo-0125',
];

async function testModel(openai: OpenAI, modelName: string): Promise<{ model: string; available: boolean; error?: string }> {
  try {
    console.log(`Testing ${modelName}...`);

    await openai.chat.completions.create({
      model: modelName,
      messages: [{ role: 'user', content: 'Hi' }],
      max_tokens: 5,
    });

    return { model: modelName, available: true };
  } catch (error: any) {
    const errorMessage = error.message || error.toString();

    // Check for specific error types
    if (error.status === 404 || errorMessage.includes('model_not_found')) {
      return { model: modelName, available: false, error: 'Model not found (404)' };
    }

    if (errorMessage.includes('organization must be verified')) {
      return { model: modelName, available: false, error: 'Requires verified organization' };
    }

    if (errorMessage.includes('does not exist')) {
      return { model: modelName, available: false, error: 'Model does not exist' };
    }

    // Other errors might be temporary or configuration issues
    return { model: modelName, available: false, error: `Error: ${errorMessage.substring(0, 100)}` };
  }
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.error('❌ OPENAI_API_KEY not found in environment');
    process.exit(1);
  }

  console.log('🔍 Testing OpenAI model availability...\n');
  console.log(`API Key: ${apiKey.substring(0, 7)}...${apiKey.substring(apiKey.length - 4)}\n`);

  const openai = new OpenAI({ apiKey });

  const results: { model: string; available: boolean; error?: string }[] = [];

  for (const model of MODELS_TO_TEST) {
    const result = await testModel(openai, model);
    results.push(result);

    if (result.available) {
      console.log(`✅ ${model} - AVAILABLE`);
    } else {
      console.log(`❌ ${model} - UNAVAILABLE (${result.error})`);
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80) + '\n');

  const available = results.filter(r => r.available);
  const unavailable = results.filter(r => !r.available);

  console.log(`✅ Available models (${available.length}):`);
  available.forEach(r => console.log(`   - ${r.model}`));

  console.log(`\n❌ Unavailable models (${unavailable.length}):`);
  unavailable.forEach(r => console.log(`   - ${r.model} (${r.error})`));

  console.log('\n' + '='.repeat(80));
  console.log('RECOMMENDED ACTION');
  console.log('='.repeat(80) + '\n');

  console.log('Remove these models from ALLOWED_OPENAI_MODELS:');
  console.log('[');
  unavailable.forEach(r => console.log(`  '${r.model}',  // ${r.error}`));
  console.log(']');

  console.log('\nKeep these models:');
  console.log('[');
  available.forEach(r => console.log(`  '${r.model}',`));
  console.log(']');
}

main().catch(console.error);
