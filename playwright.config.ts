import { defineConfig, devices } from '@playwright/test';

const localBaseURL = 'http://127.0.0.1:3000';
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? localBaseURL;
const hostname = new URL(baseURL).hostname;
const isLoopback = hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1';

if (!isLoopback && process.env.ALLOW_DESTRUCTIVE_TESTS !== 'true') {
  throw new Error(
    `Refusing destructive Playwright target '${baseURL}'. Set ALLOW_DESTRUCTIVE_TESTS=true explicitly.`
  );
}

export default defineConfig({
  testDir: './tests/specs',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'playwright-report/test-results.json' }],
  ],
  globalSetup: require.resolve('./tests/global-setup'),
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'npx next dev -p 3000',
        url: localBaseURL,
        reuseExistingServer: false,
        timeout: 120000,
        env: {
          ...process.env,
          KV_REST_API_URL: '',
          KV_REST_API_TOKEN: '',
          UPSTASH_REDIS_REST_URL: '',
          UPSTASH_REDIS_REST_TOKEN: '',
        },
      },
  use: {
    baseURL,
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    launchOptions: {
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
    actionTimeout: 10000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
});
