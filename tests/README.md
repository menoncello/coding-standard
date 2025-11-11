# Test Structure and Usage

This project uses **two separate test frameworks** to avoid conflicts and provide the best testing experience for different scenarios:

## Test Frameworks

### 1. Bun Test Runner
**Used for**: Unit tests, integration tests, performance tests, and security tests
- **Location**: `tests/unit/`, `tests/integration/`, `tests/performance/`, `tests/security/`
- **Command**: `bun test`
- **Features**: Fast execution, built-in coverage, TypeScript support

### 2. Playwright Test Runner
**Used for**: End-to-end (E2E) browser tests
- **Location**: `tests/e2e/`
- **Command**: `npx playwright test`
- **Features**: Browser automation, cross-browser testing, E2E scenarios

## Running Tests

### Bun Tests
```bash
# Run all Bun tests (unit, integration, performance, security)
bun test

# Run specific test categories
bun test tests/unit                    # Unit tests only
bun test tests/integration             # Integration tests only
bun test tests/performance             # Performance tests only
bun test tests/security                # Security tests only

# Run with coverage
bun test --coverage

# Run in watch mode during development
bun test --watch
```

### Playwright E2E Tests
```bash
# Run all E2E tests
npm run test:e2e
# or
npx playwright test

# Run on specific browsers
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit

# Run with UI mode for debugging
npx playwright test --ui
```

### All Tests
```bash
# Run both Bun and Playwright tests
npm run test:all
```

## Test Directory Structure

```
tests/
├── unit/                    # Unit tests (Bun)
│   ├── database/
│   ├── cache/
│   ├── standards/
│   └── *.test.ts
├── integration/             # Integration tests (Bun)
│   ├── cache-performance-*.test.ts
│   ├── database/
│   ├── mcp-protocol.test.ts
│   └── *.test.ts
├── performance/             # Performance tests (Bun)
│   ├── registry-performance.test.ts
│   └── load.test.ts
├── security/                # Security tests (Bun)
│   └── mcp-security.test.ts
└── e2e/                     # E2E tests (Playwright)
    ├── basic.test.ts
    └── playwright-working.test.ts
```

## Configuration Files

- **`bun.config.ts`** - Bun test runner configuration (excludes `tests/e2e/`)
- **`playwright.config.ts`** - Playwright test runner configuration (targets `tests/e2e/`)

## Why Separate Test Runners?

1. **Framework Conflicts**: Playwright and Bun both export `test()` and `expect()` functions, causing conflicts when mixed
2. **Optimized Performance**: Bun's test runner is extremely fast for unit/integration tests
3. **Browser Capabilities**: Playwright provides robust browser automation for E2E testing
4. **Clear Separation**: Each test type uses the most appropriate tool for the job

## Writing New Tests

### For Bun Test Runner
```typescript
// tests/unit/example.test.ts
import { test, expect } from "bun:test";

test("example unit test", () => {
  expect(1 + 1).toBe(2);
});
```

### For Playwright Test Runner
```typescript
// tests/e2e/example.test.ts
import { test, expect } from '@playwright/test';

test("example E2E test", async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toBeVisible();
});
```

## Important Notes

- **NEVER** import `@playwright/test` in files that will be run by Bun
- **NEVER** import `bun:test` in files that will be run by Playwright
- Keep test files in their appropriate directories
- Use the correct npm scripts to run the right type of tests