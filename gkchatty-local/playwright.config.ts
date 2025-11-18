import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Configuration for GKChatty Local
 * Enterprise Hybrid RAG Testing
 */

export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // Run tests sequentially for feature flag changes
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker to avoid race conditions with feature flags
  reporter: [
    ['html', { outputFolder: 'tests/playwright-report' }],
    ['list'],
  ],
  use: {
    baseURL: 'http://localhost:4003',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Start servers before running tests
  webServer: [
    {
      command: 'cd backend && pnpm dev',
      url: 'http://localhost:4001/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
    },
    {
      command: 'cd frontend && pnpm dev',
      url: 'http://localhost:4003',
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
    },
  ],
});
