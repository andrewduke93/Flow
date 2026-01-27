// @ts-nocheck
// Playwright types are only available in CI where Playwright is installed; skip local TS checking for this config.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e/playwright',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html']] : [['list']],
  use: {
    actionTimeout: 5000,
    navigationTimeout: 15_000,
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    viewport: { width: 1280, height: 800 },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    }
  ],
  webServer: {
    command: 'npm run preview -- --port=5173',
    port: 5173,
    timeout: 120_000,
    reuseExistingServer: !!process.env.PLAYWRIGHT_REUSE_SERVER,
  },
});
