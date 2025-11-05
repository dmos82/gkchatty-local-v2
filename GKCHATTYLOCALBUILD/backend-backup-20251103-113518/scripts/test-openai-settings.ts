import 'dotenv/config';
import mongoose from 'mongoose';
import { updateOpenAIConfig, getOpenAIConfig } from '../services/settingsService';

async function testOpenAISettings() {
  try {
    console.log('[Test OpenAI Settings] Starting test...');

    // Connect using the same method as the API server
    const { connectDB } = await import('../utils/mongoHelper');
    await connectDB();

    console.log(
      '[Test OpenAI Settings] Connected to database:',
      mongoose.connection.db?.databaseName
    );

    // Test 1: Get initial config (should be empty)
    console.log('\n=== TEST 1: Get initial config ===');
    const initialConfig = await getOpenAIConfig();
    console.log('Initial config:', initialConfig);

    // Test 2: Save a test configuration
    console.log('\n=== TEST 2: Save test configuration ===');
    const saveResult = await updateOpenAIConfig({
      modelId: 'gpt-4o-mini',
      apiKey: 'sk-test-key-123456789',
    });
    console.log('Save result:', saveResult);

    // Test 3: Get config after saving
    console.log('\n=== TEST 3: Get config after saving ===');
    const afterSaveConfig = await getOpenAIConfig();
    console.log('Config after save:', afterSaveConfig);

    // Test 4: Clear the API key (empty string)
    console.log('\n=== TEST 4: Clear API key ===');
    const clearResult = await updateOpenAIConfig({
      apiKey: '',
    });
    console.log('Clear result:', clearResult);

    // Test 5: Get config after clearing
    console.log('\n=== TEST 5: Get config after clearing ===');
    const afterClearConfig = await getOpenAIConfig();
    console.log('Config after clear:', afterClearConfig);

    await mongoose.disconnect();
    console.log('\n[Test OpenAI Settings] Test complete!');
  } catch (error) {
    console.error('[Test OpenAI Settings] Error:', error);
    process.exit(1);
  }
}

testOpenAISettings();
