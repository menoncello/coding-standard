import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Configuration
 *
 * This configuration is specifically for E2E tests and is completely separate
 * from the Bun test runner configuration.
 *
 * ⚠️  IMPORTANT: This configuration should ONLY be used for tests/e2e/ files
 *    Never use Playwright for unit or integration tests - use Bun test runner instead.
 *
 * Usage:
 * - npm run test:e2e           - Run all E2E tests
 * - npm run test:e2e:ui       - Run E2E tests with UI
 * - npm run test:e2e:debug    - Run E2E tests in debug mode
 *
 * Test Structure:
 * - tests/e2e/ - Only E2E tests should be here (Playwright tests)
 * - tests/unit/, tests/integration/, etc. - Use Bun test runner for these
 *
 * Framework Separation:
 * ✅ Playwright: E2E tests, web UI testing, browser automation
 * ✅ Bun: Unit tests, integration tests, performance tests, security tests
 *
 * NEVER mix frameworks - always use the right tool for the right test type.
 */
export default defineConfig({
  testDir: './tests/e2e',

  // Run tests in files in parallel
  fullyParallel: true,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Opt out of parallel tests on CI
  workers: process.env.CI ? 1 : undefined,

  // Comprehensive reporting for E2E tests
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results/playwright-results.json' }],
    ['line'],
    ['junit', { outputFile: 'test-results/playwright-junit.xml' }],
  ],

  // Global setup for E2E test environment
  globalSetup: './test-setup/playwright-setup.ts',

  // Shared settings for all the projects below
  use: {
    // Base URL to use in actions like `await page.goto('/')`
    // Note: This is a backend coding standards project, so tests should mock endpoints
    baseURL: 'http://localhost:3000',

    // Collect trace when retrying the failed test
    trace: 'on-first-retry',

    // Take screenshot on failure
    screenshot: 'only-on-failure',

    // Record video on failure for debugging
    video: 'retain-on-failure',

    // Action and navigation timeouts
    actionTimeout: 10000,
    navigationTimeout: 30000,
  },

  // Configure projects for major browsers
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    // Test against mobile viewports for responsive design testing
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },

    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
  ],

  // For this backend project, we don't run a web server by default
  // E2E tests should mock their own endpoints or test against local server
  webServer: undefined,
});