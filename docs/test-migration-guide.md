# Test Migration Guide: Logger Injection

## Overview

This guide explains how to migrate existing tests to use the new Logger injection system, which ensures zero console output during test execution while providing comprehensive logging capabilities for production and development environments.

## Goal

- **Before**: Tests produce console output pollution
- **After**: Tests run silently with `NODE_ENV=test` while maintaining full logging capabilities in production/development

## Migration Checklist

### 1. Add Logger Imports

```typescript
// Add these imports at the top of your test file
import { LoggerFactory } from '../../src/utils/logger/logger-factory.js';

// Add factory imports as needed for your test
import { DatabaseFactory } from '../../src/factories/database-factory.js';
import { CacheFactory } from '../../src/factories/cache-factory.js';
import { ToolHandlersFactory } from '../../src/factories/tool-handlers-factory.js';
// ... other factories as needed
```

### 2. Setup Test Logger

```typescript
describe('Your Test Suite', () => {
    // Test logger setup (add this after the describe line)
    const testLogger = LoggerFactory.createTestLogger(true);

    // Your existing test code...
});
```

### 3. Replace Console Calls

Search and replace in your test file:

```typescript
// Replace console.warn calls
console.warn('Failed to cleanup:', error);
// Becomes:
testLogger.warn('Failed to cleanup:', error);

// Replace console.error calls
console.error('Database error:', error);
// Becomes:
testLogger.error('Database error:', error);

// Replace console.log calls (use sparingly in tests)
console.log('Debug info:', data);
// Becomes:
testLogger.info('Debug info:', data);
```

### 4. Update Constructor Calls

Replace direct constructor instantiations with factory calls:

```typescript
// Before (old pattern)
const db = new DatabaseConnection({
    path: './test.db',
    walMode: true,
    foreignKeys: true
});

// After (new pattern)
const db = DatabaseFactory.createDatabaseConnection({
    path: './test.db',
    walMode: true,
    foreignKeys: true
}, testLogger);

// Cache backend example
const cache = new SqliteCacheBackend({
    database: db,
    ttl: 5000,
    enabled: true
});

// Becomes:
const cache = CacheFactory.createCacheBackend({
    database: db,
    ttl: 5000,
    enabled: true
}, testLogger);
```

## Common Migration Patterns

### Database Tests

```typescript
import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { DatabaseFactory } from '../../src/factories/database-factory.js';
import { LoggerFactory } from '../../src/utils/logger/logger-factory.js';

describe('Database Tests', () => {
    const testLogger = LoggerFactory.createTestLogger(true);
    let db: DatabaseConnection;
    let testDbPath: string;

    beforeAll(async () => {
        testDbPath = `./test-data-${Date.now()}.db`;
        db = DatabaseFactory.createDatabaseConnection({
            path: testDbPath,
            walMode: true,
            foreignKeys: true,
            cacheSize: 1000,
            busyTimeout: 5000
        }, testLogger);

        await db.initialize();
    });

    afterAll(async () => {
        if (db) {
            await db.close();
        }

        // Cleanup
        const fs = require('node:fs');
        try {
            if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
            if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
            if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
        } catch (error) {
            testLogger.warn('Failed to cleanup test files:', error);
        }
    });

    // Your tests...
});
```

### Cache Tests

```typescript
import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { CacheFactory } from '../../src/factories/cache-factory.js';
import { DatabaseFactory } from '../../src/factories/database-factory.js';
import { LoggerFactory } from '../../src/utils/logger/logger-factory.js';

describe('Cache Tests', () => {
    const testLogger = LoggerFactory.createTestLogger(true);
    let db: DatabaseConnection;
    let cache: SqliteCacheBackend<string>;

    beforeEach(async () => {
        const testDbPath = `./test-cache-${Date.now()}.db`;
        db = DatabaseFactory.createDatabaseConnection({
            path: testDbPath,
            walMode: true,
            foreignKeys: true,
        }, testLogger);

        await db.initialize();

        cache = CacheFactory.createCacheBackend({
            database: db,
            ttl: 5000,
            maxSize: 100,
            enabled: true
        }, testLogger);
    });

    afterEach(async () => {
        if (cache) {
            await cache.close();
        }
        if (db) {
            await db.close();
        }
    });

    // Your tests...
});
```

### MCP Server Tests

```typescript
import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { McpFactory } from '../../src/factories/mcp-factory.js';
import { LoggerFactory } from '../../src/utils/logger/logger-factory.js';

describe('MCP Server Tests', () => {
    const testLogger = LoggerFactory.createTestLogger(true);
    let server: CodingStandardsServer;

    beforeEach(() => {
        server = McpFactory.createServer(testLogger);
    });

    afterEach(() => {
        // Cleanup if needed
    });

    test('should initialize server correctly', () => {
        expect(server).toBeDefined();
    });

    // Your tests...
});
```

## Testing Logger Behavior

### Verify Silent Operation

```typescript
test('should not produce console output in test environment', () => {
    const testLogger = LoggerFactory.createTestLogger(true);

    // These calls should not produce any console output
    testLogger.debug('Debug message');
    testLogger.info('Info message');
    testLogger.warn('Warning message');
    testLogger.error('Error message');

    expect(true).toBe(true); // Test passes if no exceptions thrown
});
```

### Test Log Capture

```typescript
test('should capture logs when enabled', () => {
    const testLogger = LoggerFactory.createTestLogger(true);

    testLogger.info('Test message');
    testLogger.error('Error message');

    expect(testLogger.getCapturedLogCount()).toBe(2);

    const errorLogs = testLogger.getCapturedLogsByLevel(LogLevel.ERROR);
    expect(errorLogs).toHaveLength(1);
    expect(errorLogs[0].message).toContain('Error message');
});
```

## Migration Script Usage

The project includes a migration script to help automate the process:

```bash
# Run the migration script
bun scripts/migrate-tests.ts

# This will:
# 1. Analyze all test files
# 2. Add necessary imports
# 3. Replace console calls with testLogger calls
# 4. Update constructor calls to use factories
# 5. Create backup files before making changes
```

## Validation

### Test Silent Execution

```bash
# Run tests in test environment - should produce no console output
NODE_ENV=test bun test

# Verify zero console output from application code
# Only test framework output should be visible
```

### Development Environment Testing

```bash
# Run tests in development environment - should show logs
NODE_ENV=development bun test

# Production environment testing
NODE_ENV=production bun test
```

## Common Issues and Solutions

### Import Path Errors

**Issue**: Cannot find module errors
**Solution**: Ensure correct relative paths from test file location
```typescript
// From tests/integration/database/
import { DatabaseFactory } from '../../src/factories/database-factory.js';
import { LoggerFactory } from '../../src/utils/logger/logger-factory.js';
```

### Constructor Parameter Mismatches

**Issue**: Factory calls don't match original constructor signatures
**Solution**: Use object notation for config parameters
```typescript
// Correct pattern
DatabaseFactory.createDatabaseConnection({
    path: './test.db',
    walMode: true,
    foreignKeys: true
}, testLogger);

// Incorrect - missing object braces
DatabaseFactory.createDatabaseConnection(
    path: './test.db',  // ❌ This causes syntax errors
    walMode: true,
    foreignKeys: true
, testLogger);
```

### Missing Logger in Existing Tests

**Issue**: Tests that don't use Logger yet but still need cleanup
**Solution**: Add Logger setup and replace console calls
```typescript
// Simple fix for existing tests
const testLogger = LoggerFactory.createTestLogger(true);

// Replace any console.warn calls
console.warn('Cleanup failed:', error);
// Becomes:
testLogger.warn('Cleanup failed:', error);
```

## Best Practices

### 1. Consistent Logger Setup

Always use the same Logger setup pattern:
```typescript
const testLogger = LoggerFactory.createTestLogger(true);
```

### 2. Import Organization

Group imports logically:
```typescript
// Test framework imports
import { test, expect, describe, beforeAll, afterAll } from 'bun:test';

// Source code imports
import { DatabaseConnection } from '../../src/database/connection.js';

// Factory imports
import { DatabaseFactory } from '../../src/factories/database-factory.js';
import { LoggerFactory } from '../../src/utils/logger/logger-factory.js';
```

### 3. Error Handling in Tests

Use testLogger for error reporting:
```typescript
try {
    await someOperation();
} catch (error) {
    testLogger.error('Operation failed:', error);
    throw error; // Re-throw to fail the test
}
```

### 4. Cleanup Operations

Use testLogger for cleanup messages:
```typescript
afterAll(async () => {
    try {
        await cleanup();
    } catch (error) {
        testLogger.warn('Cleanup failed:', error);
    }
});
```

## Verification Checklist

After migrating your tests, verify:

- [ ] No `console.log`, `console.error`, `console.warn` calls remain
- [ ] All constructor calls use factory pattern with Logger injection
- [ ] Test runs silently with `NODE_ENV=test`
- [ ] No import errors or TypeScript compilation issues
- [ ] All existing functionality still works correctly
- [ ] Log capture functionality works when enabled

## Support

For issues during migration:

1. Check import paths are correct
2. Verify factory parameter syntax
3. Ensure testLogger is properly initialized
4. Run tests with explicit NODE_ENV=test setting
5. Check for remaining console calls with: `grep -r "console\." tests/`

## Result

When migration is complete, running `NODE_ENV=test bun test` should produce only the test framework output, with zero console pollution from application code, while maintaining full logging capabilities in development and production environments.