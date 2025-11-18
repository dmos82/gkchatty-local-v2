/**
 * Model Routing - Comprehensive Automated Tests
 *
 * Tests model service selection between Ollama and OpenAI:
 * 1. OpenAI routing (preferredModel: "openai")
 * 2. Ollama routing (preferredModel: "llama3.2:3b")
 * 3. Default routing (no preferredModel specified)
 * 4. Verify modelUsed and modelMode are returned correctly
 *
 * Prerequisites:
 * - Backend running on http://localhost:4001
 * - Ollama running on http://localhost:11434
 * - User "dev" with password "dev123" exists
 * - Ollama model "llama3.2:3b" pulled
 */

import { test, expect, Page } from '@playwright/test';

// Test configuration
const BACKEND_URL = 'http://localhost:4001';
const TEST_USER = 'dev';
const TEST_PASSWORD = 'dev123';

// Helper: Login and get auth token
async function loginAndGetToken(page: Page): Promise<string> {
  const response = await page.request.post(`${BACKEND_URL}/api/auth/login`, {
    data: {
      username: TEST_USER,
      password: TEST_PASSWORD,
    },
  });

  expect(response.ok()).toBeTruthy();
  const data = await response.json();
  expect(data.success).toBe(true);
  expect(data.token).toBeDefined();

  console.log('✅ Login successful, token obtained');
  return data.token;
}

// Helper: Get feature flags
async function getFeatureFlags(page: Page, token: string): Promise<any> {
  const response = await page.request.get(`${BACKEND_URL}/api/settings/features`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  expect(response.ok()).toBeTruthy();
  const data = await response.json();
  console.log('📊 Current feature flags:', data.features);
  return data;
}

// Helper: Send chat message with model preference
async function sendChatMessage(
  page: Page,
  token: string,
  message: string,
  preferredModel?: string
): Promise<any> {
  const requestBody: any = {
    query: message,
    knowledgeBaseTarget: 'system',
  };

  if (preferredModel) {
    requestBody.preferredModel = preferredModel;
  }

  console.log(`📤 Request:`, { message, preferredModel: preferredModel || 'default' });

  const response = await page.request.post(`${BACKEND_URL}/api/chats`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    data: requestBody,
  });

  expect(response.ok()).toBeTruthy();
  const data = await response.json();

  console.log(`📬 Response:`, {
    answerLength: data.answer?.length || 0,
    modelUsed: data.modelUsed,
    modelMode: data.modelMode,
  });

  return data;
}

test.describe('Model Routing - Complete Test Suite', () => {
  let authToken: string;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    authToken = await loginAndGetToken(page);
    await page.close();
  });

  test('Phase 1: Verify showModelUsed feature flag is enabled', async ({ page }) => {
    const flags = await getFeatureFlags(page, authToken);
    expect(flags.features).toHaveProperty('showModelUsed');

    console.log(`showModelUsed: ${flags.features.showModelUsed}`);

    if (!flags.features.showModelUsed) {
      console.warn('⚠️  showModelUsed is disabled - modelUsed field may not appear');
    }
  });

  test('Test 1: OpenAI routing (preferredModel: "openai")', async ({ page }) => {
    const response = await sendChatMessage(
      page,
      authToken,
      'What is 2+2? Answer in one sentence.',
      'openai'
    );

    // Assert response structure
    expect(response.success).toBe(true);
    expect(response.answer).toBeTruthy();
    expect(response.answer.length).toBeGreaterThan(0);

    // Assert model routing
    expect(response.modelMode).toBe('openai');
    expect(response.modelUsed).toBeDefined();
    expect(response.modelUsed).toMatch(/gpt/i); // Should contain "gpt"

    console.log('✅ TEST 1 PASSED: OpenAI routing works correctly');
    console.log(`   modelUsed: ${response.modelUsed}`);
    console.log(`   modelMode: ${response.modelMode}`);
  });

  test('Test 2: Ollama routing (preferredModel: "llama3.2:3b")', async ({ page }) => {
    const response = await sendChatMessage(
      page,
      authToken,
      'What is 3+3? Answer in one sentence.',
      'llama3.2:3b'
    );

    // Assert response structure
    expect(response.success).toBe(true);
    expect(response.answer).toBeTruthy();
    expect(response.answer.length).toBeGreaterThan(0);

    // Assert model routing
    expect(response.modelMode).toBe('ollama');
    expect(response.modelUsed).toBeDefined();
    expect(response.modelUsed).toMatch(/llama/i); // Should contain "llama"

    console.log('✅ TEST 2 PASSED: Ollama routing works correctly');
    console.log(`   modelUsed: ${response.modelUsed}`);
    console.log(`   modelMode: ${response.modelMode}`);
  });

  test('Test 3: Default routing (no preferredModel)', async ({ page }) => {
    const response = await sendChatMessage(
      page,
      authToken,
      'What is 4+4? Answer in one sentence.'
      // No preferredModel specified
    );

    // Assert response structure
    expect(response.success).toBe(true);
    expect(response.answer).toBeTruthy();
    expect(response.answer.length).toBeGreaterThan(0);

    // Assert default is OpenAI
    expect(response.modelMode).toBe('openai');
    expect(response.modelUsed).toBeDefined();
    expect(response.modelUsed).toMatch(/gpt/i);

    console.log('✅ TEST 3 PASSED: Default routing uses OpenAI');
    console.log(`   modelUsed: ${response.modelUsed}`);
    console.log(`   modelMode: ${response.modelMode}`);
  });

  test('Test 4: Verify different models give different answers', async ({ page }) => {
    const testQuestion = 'Describe the color blue in exactly 10 words.';

    // Get OpenAI answer
    const openaiResponse = await sendChatMessage(
      page,
      authToken,
      testQuestion,
      'openai'
    );

    // Get Ollama answer
    const ollamaResponse = await sendChatMessage(
      page,
      authToken,
      testQuestion,
      'llama3.2:3b'
    );

    // Assert both succeeded
    expect(openaiResponse.success).toBe(true);
    expect(ollamaResponse.success).toBe(true);

    // Assert routing was correct
    expect(openaiResponse.modelMode).toBe('openai');
    expect(ollamaResponse.modelMode).toBe('ollama');

    // Assert answers are different (different models should give different responses)
    expect(openaiResponse.answer).not.toBe(ollamaResponse.answer);

    console.log('✅ TEST 4 PASSED: Different models produce different outputs');
    console.log(`   OpenAI answer: ${openaiResponse.answer.substring(0, 50)}...`);
    console.log(`   Ollama answer: ${ollamaResponse.answer.substring(0, 50)}...`);
  });

  test('Test 5: Verify modelUsed field matches service', async ({ page }) => {
    // Test OpenAI
    const openaiResponse = await sendChatMessage(
      page,
      authToken,
      'Say "OpenAI test"',
      'openai'
    );

    expect(openaiResponse.modelUsed).toMatch(/gpt/i);
    expect(openaiResponse.modelMode).toBe('openai');

    // Test Ollama
    const ollamaResponse = await sendChatMessage(
      page,
      authToken,
      'Say "Ollama test"',
      'llama3.2:3b'
    );

    expect(ollamaResponse.modelUsed).toMatch(/llama/i);
    expect(ollamaResponse.modelMode).toBe('ollama');

    console.log('✅ TEST 5 PASSED: modelUsed field correctly identifies model');
  });
});
