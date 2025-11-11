# Test Framework Guide

This project uses a dual-framework testing approach with complete separation between Bun test runner and Playwright. This prevents framework conflicts and ensures the right tool is used for the right job.

## 🏗️ Framework Architecture

### Bun Test Runner
**Purpose**: Unit tests, integration tests, performance tests, security tests
**Location**: `tests/unit/`, `tests/integration/`, `tests/performance/`, `tests/security/`
**Speed**: ⚡ Fast execution, ideal for rapid feedback
**Features**: Built-in coverage, TypeScript support, hot reloading

### Playwright Test Runner
**Purpose**: End-to-end (E2E) tests, web UI testing, browser automation
**Location**: `tests/e2e/` ONLY
**Features**: Cross-browser testing, mobile emulation, network interception

## 🚫 CRITICAL: Framework Separation

**NEVER** mix frameworks. Each test type has its designated framework:

| Test Type | Directory | Framework | Command |
|-----------|-----------|-----------|---------|
| Unit Tests | `tests/unit/` | Bun | `bun test tests/unit` |
| Integration Tests | `tests/integration/` | Bun | `bun test tests/integration` |
| Performance Tests | `tests/performance/` | Bun | `bun test tests/performance` |
| Security Tests | `tests/security/` | Bun | `bun test tests/security` |
| E2E Tests | `tests/e2e/` | Playwright | `npm run test:e2e` |

## ⚠️ Forbidden Commands

These commands will cause framework conflicts and are **BLOCKED**:

```bash
# ❌ NEVER RUN THESE - THEY CAUSE CONFLICTS
bun test tests/e2e/basic.test.ts          # Blocked: Playwright test with Bun
bun test tests/e2e/                       # Blocked: E2E directory with Bun
bun test playwright                       # Blocked: Playwright with Bun
node tests/e2e/basic.test.ts              # Blocked: Direct Node execution
```

## ✅ Correct Commands

### Bun Tests (Unit, Integration, Performance, Security)

```bash
# Run all Bun tests (excludes E2E automatically)
bun test

# Run specific test types
bun test tests/unit
bun test tests/integration
bun test tests/performance
bun test tests/security

# Coverage and watch modes
bun test --coverage
bun test --watch

# Using npm scripts
npm run test                    # Same as bun test
npm run test:unit              # Unit tests only
npm run test:integration       # Integration tests only
npm run test:performance       # Performance tests only
npm run test:security          # Security tests only
npm run test:coverage          # Coverage with Bun
```

### Playwright E2E Tests

```bash
# Run all E2E tests
npm run test:e2e

# E2E with different modes
npm run test:e2e:ui            # Interactive UI mode
npm run test:e2e:debug         # Debug mode
npm run test:e2e:headed        # Show browser window

# Using Playwright directly
npx playwright test tests/e2e
npx playwright test tests/e2e --ui
npx playwright test tests/e2e --debug
```

### Combined Testing

```bash
# Run both frameworks in sequence
npm run test:all               # Bun tests + E2E tests
npm run test:ci                # Coverage + E2E tests (for CI)
```

## 🔧 Configuration Files

- **Bun Configuration**: `bun.config.ts` - Excludes E2E tests
- **Playwright Configuration**: `playwright.config.ts` - E2E only
- **Bun Guard**: `test-setup/bun-guard.ts` - Prevents Playwright imports in Bun
- **Playwright Setup**: `test-setup/playwright-setup.ts` - E2E environment setup

## 🛡️ Safety Mechanisms

### Automatic Exclusion
Bun automatically excludes E2E tests via `bun.config.ts`:
```typescript
exclude: [
  'tests/e2e/**/*',
  'tests/e2e/**/*.test.ts',
  '**/e2e/**/*',
  '**/*playwright*',
]
```

### Import Guard
If Playwright is accidentally imported in a Bun test, it will error:
```
🚫 PLAYWRIGHT IMPORT BLOCKED IN BUN TEST RUNNER 🚫
```

### Framework Validation
The validation script helps you use the right framework:
```bash
bun scripts/validate-test-framework.ts e2e  # Runs correct Playwright command
bun scripts/validate-test-framework.ts unit # Runs correct Bun command
```

## 📁 Test File Structure

```
tests/
├── unit/                    # Bun test runner
│   ├── *.test.ts           # Unit tests
│   └── *.spec.ts           # Unit tests
├── integration/             # Bun test runner
│   ├── *.test.ts           # Integration tests
│   └── *.spec.ts           # Integration tests
├── performance/             # Bun test runner
│   ├── *.test.ts           # Performance tests
│   └── *.spec.ts           # Performance tests
├── security/                # Bun test runner
│   ├── *.test.ts           # Security tests
│   └── *.spec.ts           # Security tests
└── e2e/                     # Playwright test runner
    ├── *.test.ts           # E2E tests (Playwright imports)
    └── *.spec.ts           # E2E tests (Playwright imports)
```

## 🎯 When to Use Which Framework

### Use Bun Test Runner For:
- ✅ Unit testing individual functions and classes
- ✅ Integration testing between modules
- ✅ Performance testing and benchmarking
- ✅ Security testing and vulnerability scanning
- ✅ API testing without browser automation
- ✅ Database testing
- ✅ Fast feedback during development

### Use Playwright For:
- ✅ End-to-end user workflows
- ✅ Web UI component testing
- ✅ Cross-browser compatibility
- ✅ Mobile responsiveness testing
- ✅ Network request/response testing
- ✅ Browser automation scenarios
- ✅ Visual regression testing

## 🚨 Error Messages and Solutions

### Framework Conflict Error
```
🚫 FRAMEWORK CONFLICT DETECTED 🚫
You are trying to run a Playwright E2E test with Bun test runner.
```
**Solution**: Use `npm run test:e2e` instead of `bun test tests/e2e/`

### Playwright Import Error
```
🚫 PLAYWRIGHT IMPORT BLOCKED IN BUN TEST RUNNER 🚫
```
**Solution**: Move the test to `tests/e2e/` and use Playwright framework

### Test Not Found Error
If a test doesn't run, check:
1. Is it in the correct directory?
2. Are you using the right framework?
3. Is the file name correct (`.test.ts` or `.spec.ts`)?

## 🔄 Migration Guide

If you have existing tests in the wrong location:

### Moving Bun Tests to E2E
```bash
# From: tests/integration/web-ui.test.ts
# To:   tests/e2e/web-ui.test.ts
# Then: Change imports from 'bun:test' to '@playwright/test'
```

### Moving E2E Tests to Bun
```bash
# From: tests/e2e/api-endpoint.test.ts
# To:   tests/integration/api-endpoint.test.ts
# Then: Change imports from '@playwright/test' to 'bun:test'
```

## 📊 Reports and Coverage

### Bun Reports
- Coverage: `test-results/coverage/`
- Reports: Console output, HTML coverage reports

### Playwright Reports
- HTML Report: `test-results/playwright-report/`
- JSON Report: `test-results/playwright-results.json`
- Screenshots: `test-results/` (on failure)
- Videos: `test-results/` (on failure)

## 🆘 Troubleshooting

### Bun Tests Not Running E2E
This is **expected behavior**. E2E tests are excluded from Bun to prevent conflicts.

### Playwright Tests Not Running with Bun
This is **expected behavior**. Use `npm run test:e2e` instead.

### Both Frameworks Running Same Tests
Ensure tests are in the correct directory and using the right imports.

### CI Pipeline Issues
Use `npm run test:ci` which runs both frameworks in the correct order.

---

## 🎉 Summary

This dual-framework approach gives you the best of both worlds:
- **Bun**: Fast, efficient testing for backend logic
- **Playwright**: Powerful browser automation for E2E scenarios

The key is **maintaining strict separation** - use the right tool for the right job, and keep frameworks in their designated domains.