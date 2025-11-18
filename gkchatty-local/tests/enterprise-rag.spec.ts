/**
 * Enterprise Hybrid RAG - Comprehensive Automated Tests
 *
 * Tests all three modes:
 * 1. Strict RAG-Only (allowGeneralQuestions: false)
 * 2. Docs-First Hybrid (allowGeneralQuestions: true + has docs)
 * 3. General Knowledge (allowGeneralQuestions: true + no docs)
 *
 * Prerequisites:
 * - Backend running on http://localhost:4001
 * - Frontend running on http://localhost:4003
 * - User "dev" with password "dev123" exists
 */

import { test, expect, Page } from '@playwright/test';
import path from 'path';

// Test configuration
const BACKEND_URL = 'http://localhost:4001';
const FRONTEND_URL = 'http://localhost:4003';
const TEST_USER = 'dev';
const TEST_PASSWORD = 'dev123';

// Helper: Login and get auth token
async function loginAndGetToken(page: Page): Promise<string> {
  // Login via API to get token
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

// Helper: Set feature flag via API
async function setFeatureFlag(
  page: Page,
  token: string,
  flagName: string,
  value: boolean
): Promise<void> {
  const response = await page.request.put(`${BACKEND_URL}/api/settings/features`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    data: {
      [flagName]: value,
    },
  });

  expect(response.ok()).toBeTruthy();
  const data = await response.json();
  expect(data.success).toBe(true);

  console.log(`✅ Feature flag ${flagName} set to ${value}`);
}

// Helper: Get current feature flags
async function getFeatureFlags(page: Page, token: string): Promise<any> {
  const response = await page.request.get(`${BACKEND_URL}/api/settings/features`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  expect(response.ok()).toBeTruthy();
  const data = await response.json();

  console.log('📊 Current feature flags:', data);
  return data;
}

// Helper: Send chat message and get response
async function sendChatMessage(
  page: Page,
  token: string,
  message: string,
  knowledgeBaseTarget: string = 'system'
): Promise<any> {
  const response = await page.request.post(`${BACKEND_URL}/api/chats`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    data: {
      query: message,
      knowledgeBaseTarget,
    },
  });

  expect(response.ok()).toBeTruthy();
  const data = await response.json();

  console.log(`📨 Sent: "${message}"`);
  console.log(`📬 Response: "${data.answer?.substring(0, 100)}..."`);

  return data;
}

// Helper: Navigate to chat page with auth
async function navigateToChatWithAuth(page: Page, token: string): Promise<void> {
  // Set auth token in localStorage before navigating
  await page.goto(FRONTEND_URL);
  await page.evaluate((token) => {
    localStorage.setItem('token', token);
  }, token);

  // Now navigate to chat page
  await page.goto(`${FRONTEND_URL}/chat`);
  await page.waitForLoadState('networkidle');

  console.log('✅ Navigated to chat page with auth');
}

test.describe('Enterprise Hybrid RAG - Complete Test Suite', () => {
  let authToken: string;

  test.beforeAll(async ({ browser }) => {
    // Get auth token once for all tests
    const page = await browser.newPage();
    authToken = await loginAndGetToken(page);
    await page.close();
  });

  test('Phase 1: Verify initial feature flag state', async ({ page }) => {
    const flags = await getFeatureFlags(page, authToken);

    expect(flags.features).toHaveProperty('allowGeneralQuestions');
    console.log(`Initial allowGeneralQuestions: ${flags.features.allowGeneralQuestions}`);
  });

  test('Mode 1: Strict RAG-Only (allowGeneralQuestions: false)', async ({ page }) => {
    // Step 1: Disable general questions
    await setFeatureFlag(page, authToken, 'allowGeneralQuestions', false);

    // Step 2: Verify flag is set
    const flags = await getFeatureFlags(page, authToken);
    expect(flags.features.allowGeneralQuestions).toBe(false);

    // Step 3: Ask general knowledge question (no docs exist for this)
    const response = await sendChatMessage(
      page,
      authToken,
      'What is the capital of France?',
      'system'
    );

    // Step 4: Assert "no sources" message
    expect(response.answer).toMatch(
      /no matching|no relevant|not found|outside the scope/i
    );
    expect(response.answer).not.toMatch(/paris/i); // Should NOT answer from general knowledge

    console.log('✅ MODE 1 PASSED: Strict RAG-only blocks general knowledge');

    // Step 5: Navigate to UI and take screenshot
    await navigateToChatWithAuth(page, authToken);
    await page.screenshot({
      path: 'tests/screenshots/mode1-strict-rag-only.png',
      fullPage: true,
    });
  });

  test('Mode 2: Docs-First Hybrid (allowGeneralQuestions: true + has docs)', async ({
    page,
  }) => {
    // Step 1: Enable general questions
    await setFeatureFlag(page, authToken, 'allowGeneralQuestions', true);

    // Step 2: Verify flag is set
    const flags = await getFeatureFlags(page, authToken);
    expect(flags.features.allowGeneralQuestions).toBe(true);

    // Step 3: Ask question that should use docs-first hybrid
    // NOTE: This assumes you have some documents in the system KB
    // If not, this test will behave like Mode 3
    const response = await sendChatMessage(
      page,
      authToken,
      'What is GKChatty?', // Assuming you have docs about GKChatty
      'system'
    );

    // Step 4: Assert response (either from docs or general knowledge)
    expect(response.answer).toBeTruthy();
    expect(response.answer.length).toBeGreaterThan(10);

    // Check if docs were used (look for citations or "According to" patterns)
    const usedDocs =
      response.sources?.length > 0 ||
      response.answer.match(/according to|the documents|documentation/i);

    if (usedDocs) {
      console.log('✅ MODE 2 PASSED: Docs-first hybrid used documents');
    } else {
      console.log('⚠️  MODE 2: No relevant docs found, used general knowledge fallback');
    }

    // Step 5: Navigate to UI and take screenshot
    await navigateToChatWithAuth(page, authToken);
    await page.screenshot({
      path: 'tests/screenshots/mode2-docs-first-hybrid.png',
      fullPage: true,
    });
  });

  test('Mode 3: General Knowledge (allowGeneralQuestions: true + no docs)', async ({
    page,
  }) => {
    // Step 1: Ensure general questions are enabled
    await setFeatureFlag(page, authToken, 'allowGeneralQuestions', true);

    // Step 2: Verify flag is set
    const flags = await getFeatureFlags(page, authToken);
    expect(flags.features.allowGeneralQuestions).toBe(true);

    // Step 3: Ask general knowledge question (no docs exist)
    const response = await sendChatMessage(
      page,
      authToken,
      'What is the capital of Spain?',
      'system'
    );

    // Step 4: Assert general knowledge response
    expect(response.answer).toBeTruthy();
    expect(response.answer).toMatch(/madrid/i); // Should answer from general knowledge
    expect(response.answer).not.toMatch(/no matching|no relevant|not found/i);

    // Should indicate it's from general knowledge
    const usedGeneralKnowledge = response.answer.match(
      /general knowledge|don't have specific documents|not in the documents/i
    );
    expect(usedGeneralKnowledge).toBeTruthy();

    console.log('✅ MODE 3 PASSED: General knowledge mode works correctly');

    // Step 5: Navigate to UI and take screenshot
    await navigateToChatWithAuth(page, authToken);
    await page.screenshot({
      path: 'tests/screenshots/mode3-general-knowledge.png',
      fullPage: true,
    });
  });

  test('Phase 5: Test UI Chat Flow with Playwright', async ({ page }) => {
    // Step 1: Navigate to chat with auth
    await navigateToChatWithAuth(page, authToken);

    // Step 2: Find chat input (try multiple selectors)
    const chatInput = page.locator('textarea').or(page.locator('input[type="text"]')).first();
    await expect(chatInput).toBeVisible({ timeout: 10000 });

    // Step 3: Type a test message
    await chatInput.fill('What is the capital of Italy?');

    // Step 4: Click send button
    const sendButton = page.locator('button[type="submit"], button:has-text("Send")').first();
    await sendButton.click();

    // Step 5: Wait for response
    await page.waitForTimeout(3000); // Wait for LLM response

    // Step 6: Take final screenshot
    await page.screenshot({
      path: 'tests/screenshots/ui-chat-flow.png',
      fullPage: true,
    });

    console.log('✅ UI Chat Flow completed');
  });

  test.afterAll(async ({ browser }) => {
    // Restore original state (enable general questions)
    const page = await browser.newPage();
    await setFeatureFlag(page, authToken, 'allowGeneralQuestions', true);
    console.log('✅ Restored allowGeneralQuestions to true');
    await page.close();
  });
});
