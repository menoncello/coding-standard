#!/usr/bin/env bun

/**
 * Test Framework Validation Script
 *
 * This script validates that you're using the correct test framework
 * for the type of tests you want to run.
 */

const args = process.argv.slice(2);
const command = args[0];

if (!command) {
  console.log(`
🧪 Test Framework Validation

Usage:
  bun scripts/validate-test-framework.ts <test-type>

Test Types:
  unit        - Run unit tests with Bun
  integration - Run integration tests with Bun
  performance - Run performance tests with Bun
  security    - Run security tests with Bun
  e2e         - Run E2E tests with Playwright
  coverage    - Run coverage tests with Bun
  all         - Run all tests with appropriate frameworks

Examples:
  bun scripts/validate-test-framework.ts unit
  bun scripts/validate-test-framework.ts e2e
  bun scripts/validate-test-framework.ts all

Quick Commands:
  bun test                    # Run all Bun tests (unit, integration, performance, security)
  npm run test:e2e            # Run E2E tests with Playwright
  npm run test:all            # Run all tests with correct frameworks
  npm run test:coverage       # Run coverage with Bun
  npm run test:e2e:ui         # Run E2E tests with Playwright UI
`);
  process.exit(0);
}

const testCommands = {
  unit: 'bun test tests/unit',
  integration: 'bun test tests/integration --exclude=\'cache-performance-web-example.test.ts\'',
  performance: 'bun test tests/performance',
  security: 'bun test tests/security',
  coverage: 'bun test --coverage',
  e2e: 'npx playwright test tests/e2e',
  'e2e:ui': 'npx playwright test tests/e2e --ui',
  'e2e:debug': 'npx playwright test tests/e2e --debug',
  all: 'npm run test && npm run test:e2e',
};

if (command in testCommands) {
  const cmd = testCommands[command as keyof typeof testCommands];
  console.log(`\n🚀 Running: ${cmd}\n`);

  const { execSync } = await import('child_process');
  try {
    execSync(cmd, { stdio: 'inherit', cwd: process.cwd() });
  } catch (error) {
    console.error(`\n❌ Command failed: ${cmd}`);
    process.exit(1);
  }
} else {
  console.error(`\n❌ Unknown test type: ${command}`);
  console.log('Available types:', Object.keys(testCommands).join(', '));
  process.exit(1);
}