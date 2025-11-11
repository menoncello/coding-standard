# Logger Migration Guide

This guide explains how to migrate from `console.log` statements to the new Logger injection system for better testability and environment-specific behavior.

## Problem Statement

Using direct `console.log`, `console.error`, etc. in production code causes:
- ❌ Console output during tests (polluting test output)
- ❌ Inability to capture logs for test assertions
- ❌ No environment-specific logging behavior
- ❌ Difficult to mock logging in unit tests

## Solution: Logger Injection Pattern

The new system provides:
- ✅ **Zero console output in test environments** (DummyLogger)
- ✅ **Formatted logging in production** (ConsoleLogger)
- ✅ **Log capture for test assertions**
- ✅ **Dependency injection for easy testing**
- ✅ **Environment auto-detection**

## Migration Steps

### 1. Convert Class to Accept Logger

**Before:**
```typescript
export class DatabaseService {
  constructor(config: DatabaseConfig) {
    this.config = config;
  }

  async connect() {
    console.log('Connecting to database');
    // ...
  }
}
```

**After:**
```typescript
import { Logger } from '../utils/logger/logger.js';

export class DatabaseService {
  private logger: Logger;

  constructor(config: DatabaseConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  async connect() {
    this.logger.info('Connecting to database');
    // ...
  }
}
```

### 2. Use Factory for Service Creation

**Create a factory:**
```typescript
// src/factories/database-factory.ts
import { DatabaseService } from '../services/database.js';
import { LoggerFactory } from '../utils/logger/logger-factory.js';

export class DatabaseFactory {
  private static logger = LoggerFactory.getInstance();

  static createService(config?: DatabaseConfig): DatabaseService {
    return new DatabaseService(config || {}, this.logger);
  }

  static createServiceWithLogger(logger: Logger, config?: DatabaseConfig): DatabaseService {
    return new DatabaseService(config || {}, logger);
  }
}
```

**Usage in production:**
```typescript
import { DatabaseFactory } from '../factories/database-factory.js';

const dbService = DatabaseFactory.createService(config);
```

**Usage in tests:**
```typescript
import { DatabaseFactory } from '../factories/database-factory.js';
import { DummyLogger } from '../utils/logger/dummy-logger.js';

const testLogger = new DummyLogger({}, true); // Enable capture
const dbService = DatabaseFactory.createServiceWithLogger(testLogger, config);

// Test service behavior
await dbService.connect();

// Assert logs were captured
expect(testLogger.hasCapturedLogs()).toBe(true);
const logs = testLogger.getCapturedLogs();
expect(logs).toHaveLength(1);
expect(logs[0].message).toBe('Connecting to database');
```

### 3. Update Service Instantiation

**Before:**
```typescript
// Direct instantiation
const service = new MyService(config);
```

**After:**
```typescript
// Factory-based instantiation
import { MyFactory } from '../factories/my-factory.js';
const service = MyFactory.createService(config);
```

## Completed Migrations

### ✅ MCP Server
- **File:** `src/mcp/server.ts`
- **Pattern:** Constructor injection
- **Factory:** `src/factories/mcp-factory.ts`

### ✅ Database Connection
- **File:** `src/database/connection.ts`
- **Pattern:** Constructor injection
- **Factory:** `src/factories/database-factory.ts`

### ✅ Cache Backend
- **File:** `src/database/cache-backend.ts`
- **Pattern:** Constructor injection
- **Factory:** `src/factories/database-factory.ts`

## Pending Migrations

### 🔄 Files Still Using console.log
- `src/cache/cache-security.ts`
- `src/utils/performance-monitor.ts`
- `src/mcp/handlers/toolHandlers.ts`
- `src/database/recovery.ts`
- `src/database/analytics.ts`
- `src/cache/secure-cache-manager.ts`
- `src/cache/search-index.ts`
- `src/standards/registry.ts`
- `src/database/performance.ts`
- `src/cache/cache-warming.ts`
- `src/cache/performance-layer.ts`
- `src/standards/standards-loader.ts`
- `src/database/migrations.ts`

## Factory Patterns

### 1. Generic Service Factory
```typescript
import { ServiceFactory } from '../factories/service-factory.js';

// Create with default logger
const service = ServiceFactory.createService(MyService, arg1, arg2);

// Create with custom logger
const testLogger = ServiceFactory.createTestLogger();
const service = ServiceFactory.createServiceWithCustomLogger(MyService, testLogger, arg1, arg2);
```

### 2. Specific Factory
```typescript
import { DatabaseFactory } from '../factories/database-factory.js';

// Each factory is specific to a domain
const connection = DatabaseFactory.createDatabaseConnection(config);
const cacheBackend = DatabaseFactory.createCacheBackend(config);
```

## Testing Patterns

### 1. Test with DummyLogger
```typescript
import { DummyLogger } from '../utils/logger/dummy-logger.js';

test('should log operations correctly', () => {
  const logger = new DummyLogger({}, true); // Enable capture
  const service = new MyService(config, logger);

  // Execute service operations
  service.doSomething();

  // Assert logs
  expect(logger.hasCapturedLogs()).toBe(true);
  const logs = logger.getCapturedLogs();
  expect(logs).toHaveLength(2);
  expect(logs[0].message).toContain('started');
  expect(logs[1].message).toContain('completed');
});
```

### 2. Test with Specific Log Levels
```typescript
test('should handle errors correctly', () => {
  const logger = new DummyLogger({}, true);
  const service = new MyService(config, logger);

  // Simulate error condition
  service.simulateError();

  // Assert error logs
  const errorLogs = logger.getCapturedLogsByLevel(LogLevel.ERROR);
  expect(errorLogs).toHaveLength(1);
  expect(errorLogs[0].message).toBe('Database connection failed');
});
```

### 3. Test with Log Content Filtering
```typescript
test('should log user operations', () => {
  const logger = new DummyLogger({}, true);
  const service = new MyService(config, logger);

  // Process multiple operations
  service.processUser('user1');
  service.processUser('user2');

  // Assert specific log content
  const userLogs = logger.getCapturedLogsByMessage('user');
  expect(userLogs).toHaveLength(2);
});
```

## Environment Behavior

### Production Mode
```bash
NODE_ENV=production bun run app.js
```
- Uses `ConsoleLogger`
- Shows formatted timestamps
- Shows colors (disabled in CI)
- Logs INFO level and above

### Development Mode
```bash
NODE_ENV=development bun run app.js
```
- Uses `ConsoleLogger`
- Shows DEBUG level and above
- Shows colors and timestamps

### Test Mode
```bash
NODE_ENV=test bun run app.js
# OR
TEST_ENV=true bun run app.js
# OR
CI=true bun run app.js
```
- Uses `DummyLogger`
- **Zero console output**
- Silent operation (unless capture enabled)

## Benefits Achieved

### ✅ Test Environment
- **No console pollution** during test runs
- **Log capture** for test assertions
- **Deterministic test output**

### ✅ Production Environment
- **Structured logging** with timestamps
- **Configurable log levels**
- **Professional formatting**

### ✅ Development Environment
- **Verbose debugging** output
- **Color-coded log levels**
- **Helpful error context**

### ✅ Code Quality
- **Dependency injection** for better testing
- **Separation of concerns** (logging vs business logic)
- **Interface-based design** for easier mocking

## Migration Checklist

For each class that uses `console.*`:

- [ ] Add `Logger` import
- [ ] Add `logger` parameter to constructor
- [ ] Store logger as instance property
- [ ] Replace all `console.*` calls with `logger.*` calls
- [ ] Create or update factory for the service
- [ ] Update all instantiation points to use factory
- [ ] Add tests for logging behavior
- [ ] Verify no console output in test mode
- [ ] Verify formatted output in production mode

This migration ensures consistent, testable, and environment-appropriate logging across the entire codebase.