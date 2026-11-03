import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  testMatch: '*.spec.js',
  timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:4300' },
  projects: [
    { name: 'iphone', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
    { name: 'android', use: { ...devices['Pixel 7'] } },
  ],
  webServer: { command: 'node scripts/serve.mjs . 4300', port: 4300, reuseExistingServer: true },
});
