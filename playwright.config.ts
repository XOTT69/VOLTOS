import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
 testDir: './e2e', fullyParallel: true, workers: 2, retries: 0,
 use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
 projects: [
  { name: 'iphone-webkit', use: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, browserName: 'webkit', colorScheme: 'light' } },
  { name: 'mobile-chromium', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, colorScheme: 'light' } },
 ],
 webServer: { command: 'npm run dev -- --host 127.0.0.1', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI },
});
