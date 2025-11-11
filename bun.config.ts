import type { BunTestConfig } from 'bun:test';

/**
 * Bun Test Configuration
 *
 * This configuration separates Bun tests from Playwright tests to avoid conflicts.
 *
 * Test Structure:
 * - tests/unit/         - Unit tests for Bun test runner
 * - tests/integration/  - Integration tests for Bun test runner
 * - tests/performance/  - Performance tests for Bun test runner
 * - tests/security/     - Security tests for Bun test runner
 * - tests/e2e/          - E2E tests for Playwright test runner (EXCLUDED from Bun)
 *
 * Usage:
 * - bun test            - Run all Bun tests (excludes tests/e2e)
 * - bun test tests/unit - Run unit tests only
 * - npm run test:e2e    - Run Playwright E2E tests
 */
export default {
  // Aggressively exclude E2E tests that use Playwright to prevent framework conflicts
  // This prevents Bun from ever trying to run Playwright tests
  exclude: [
    'tests/e2e/**/*',
    'tests/e2e/**/*.test.ts',
    'tests/e2e/**/*.spec.ts',
    '**/e2e/**/*',
    '**/*playwright*',
    '**/*.e2e.test.ts',
    '**/*.e2e.ts',
  ],

  // Preload a guard script that will error out if Playwright tests are accidentally loaded
  setupFiles: ['./test-setup/bun-guard.ts'],

  // Coverage configuration
  coverage: {
    enabled: true,
    include: ['src/**/*.ts'],
    exclude: [
      'src/**/*.d.ts',
      'src/**/*.test.ts',
      'src/mcp/start-server.ts',
    ],
    reporter: ['text', 'html'],
  },
} satisfies BunTestConfig;