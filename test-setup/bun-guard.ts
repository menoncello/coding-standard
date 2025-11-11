/**
 * Bun Test Guard
 *
 * This script prevents Bun from accidentally running Playwright tests.
 * It acts as a safety mechanism to ensure framework separation.
 */

// Check if we're in a Bun test environment
const isBunTest = process.env.BUN_TEST === '1' || !!process.env.BUN_TEST_FILE_PATH;

if (isBunTest) {
  // Check if the current test file is a Playwright test
  const currentFile = process.env.BUN_TEST_FILE_PATH || '';

  // Patterns that indicate this is a Playwright test
  const playwrightPatterns = [
    '/e2e/',
    'playwright',
    '.e2e.test.ts',
    '.e2e.ts',
  ];

  const isPlaywrightTest = playwrightPatterns.some(pattern =>
    currentFile.includes(pattern)
  );

  // If this looks like a Playwright test, throw an error immediately
  if (isPlaywrightTest) {
    console.error('\n🚫 FRAMEWORK CONFLICT DETECTED 🚫');
    console.error('You are trying to run a Playwright E2E test with Bun test runner.');
    console.error('This causes conflicts because both frameworks define a global `test()` function.');
    console.error('\n✅ SOLUTIONS:');
    console.error('1. For E2E tests: npm run test:e2e');
    console.error('2. For unit/integration tests: bun test (without specifying e2e files)');
    console.error('3. For specific unit tests: bun test tests/unit/your-test.test.ts');
    console.error('\n❌ NEVER run: bun test tests/e2e/*.ts');
    console.error('\nPlease use the correct test framework for your test type.\n');

    // Exit with a clear error code
    process.exit(1);
  }
}

// Override the Playwright import to prevent accidental loading in Bun
if (isBunTest) {
  const originalRequire = require;
  require = function(id: string) {
    if (id === '@playwright/test' || id.includes('playwright')) {
      throw new Error(`
        🚫 PLAYWRIGHT IMPORT BLOCKED IN BUN TEST RUNNER 🚫

        Cannot import Playwright in Bun test runner. This prevents framework conflicts.

        ✅ Use Playwright tests in tests/e2e/ directory with: npm run test:e2e
        ✅ Use Bun tests for unit/integration tests with: bun test

        Current test file: ${process.env.BUN_TEST_FILE_PATH || 'unknown'}
      `);
    }
    return originalRequire.apply(this, arguments as any);
  };

  // For ES modules, we also need to handle import statements
  const originalImport = globalThis.import;
  if (originalImport) {
    globalThis.import = function(id: string) {
      if (id === '@playwright/test' || id.includes('playwright')) {
        return Promise.reject(new Error(`
          🚫 PLAYWRIGHT IMPORT BLOCKED IN BUN TEST RUNNER 🚫

          Cannot import Playwright in Bun test runner. This prevents framework conflicts.

          ✅ Use Playwright tests in tests/e2e/ directory with: npm run test:e2e
          ✅ Use Bun tests for unit/integration tests with: bun test

          Current test file: ${process.env.BUN_TEST_FILE_PATH || 'unknown'}
        `));
      }
      return originalImport.call(this, id);
    };
  }
}