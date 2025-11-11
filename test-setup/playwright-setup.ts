/**
 * Playwright Global Setup
 *
 * This runs before all Playwright E2E tests and sets up the test environment.
 * This is completely separate from Bun test setup.
 */

import { chromium, FullConfig } from '@playwright/test';

async function globalSetup(config: FullConfig) {
  console.log('\n🎭 Setting up Playwright E2E test environment...\n');

  // Validate that we're not accidentally running Bun tests
  if (process.env.BUN_TEST || process.env.BUN_TEST_FILE_PATH) {
    throw new Error(`
      🚫 FRAMEWORK CONFLICT DETECTED 🚫

      Playwright setup detected Bun test environment variables.
      This indicates a framework mixing issue.

      ✅ For E2E tests: npm run test:e2e
      ✅ For Bun tests: bun test (without e2e files)

      NEVER run E2E tests with Bun test runner.
    `);
  }

  // Ensure test directories exist
  const fs = await import('node:fs');
  const testResultsDir = './test-results';

  if (!fs.existsSync(testResultsDir)) {
    fs.mkdirSync(testResultsDir, { recursive: true });
    console.log('📁 Created test-results directory');
  }

  // Browser launch options for consistent testing
  const browser = await chromium.launch({
    headless: process.env.CI ? true : false,
  });

  console.log('✅ Playwright test environment ready\n');

  // Store browser instance for use in tests if needed
  // Note: In most cases, tests should create their own browser instances
  await browser.close();
}

export default globalSetup;