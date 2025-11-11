/**
 * Bun Test Runner Wrapper
 *
 * This wrapper prevents accidental execution of Playwright tests with Bun.
 * It's designed to be used as a custom test runner or as a safety check.
 */

import { spawn } from 'child_process';

const args = process.argv.slice(2);

// Check if any of the args are trying to run E2E tests
const e2ePatterns = [
  'tests/e2e',
  '/e2e/',
  'e2e/',
  'playwright',
  '.e2e.test',
];

const isTryingToRunE2E = args.some(arg =>
  e2ePatterns.some(pattern => arg.includes(pattern))
);

if (isTryingToRunE2E) {
  console.error('\n🚫 FRAMEWORK CONFLICT DETECTED 🚫');
  console.error('You are trying to run E2E tests with Bun test runner.');
  console.error('E2E tests use Playwright, which conflicts with Bun\'s test() function.');
  console.error('\n✅ CORRECT COMMANDS:');
  console.error('  npm run test:e2e           # Run E2E tests with Playwright');
  console.error('  npm run test:e2e:ui       # Run E2E tests with UI');
  console.error('  npm run test:e2e:debug    # Run E2E tests in debug mode');
  console.error('\n✅ FOR BUN TESTS:');
  console.error('  bun test                  # Run all Bun tests (unit, integration, performance)');
  console.error('  bun test tests/unit       # Run unit tests only');
  console.error('  bun test tests/integration # Run integration tests only');
  console.error('\n❌ NEVER RUN:');
  console.error('  bun test tests/e2e/*      # This causes framework conflicts');
  console.error('\n📁 Test Structure:');
  console.error('  tests/unit/         → Bun test runner');
  console.error('  tests/integration/  → Bun test runner');
  console.error('  tests/performance/  → Bun test runner');
  console.error('  tests/security/     → Bun test runner');
  console.error('  tests/e2e/          → Playwright test runner');
  process.exit(1);
}

// If we're here, it's safe to proceed with Bun test
const bunTest = spawn('bun', ['test', ...args], {
  stdio: 'inherit',
  env: process.env,
});

bunTest.on('close', (code) => {
  process.exit(code || 0);
});