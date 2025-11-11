# Logger System

This project provides a flexible logging system with different implementations for production and test environments.

## Features

- **Interface-based design** for easy testing and mocking
- **Environment-based logger selection**
- **ConsoleLogger** for production with formatting and colors
- **DummyLogger** for tests that prevents console output
- **Optional log capturing** in tests for verification
- **Configurable log levels** and formatting options

## Basic Usage

### Import the default logger
```typescript
import { logger } from '../utils/logger/index.js';

// Use throughout your application
logger.info('Server started');
logger.error('Error occurred:', error);
logger.debug('Debug information');
```

### Create custom logger instances
```typescript
import { LoggerFactory, LogLevel } from '../utils/logger/index.js';

// Create logger for specific component
const componentLogger = LoggerFactory.createLogger({
  level: LogLevel.DEBUG,
  enableTimestamp: true,
  enableColors: false
});
```

## Environment Detection

The system automatically detects the environment and creates appropriate logger:

- **Test Environment** (`NODE_ENV=test`, `TEST_ENV=true`, `CI=true`): Creates `DummyLogger`
- **Production Environment** (`NODE_ENV=production`): Creates `ConsoleLogger` with production settings
- **Development Environment** (default): Creates `ConsoleLogger` with development settings

## Logger Implementations

### ConsoleLogger
Used in production and development environments.

Features:
- Configurable log levels (DEBUG, INFO, WARN, ERROR, LOG)
- Optional timestamps
- Optional colors (disabled in production)
- Log level filtering

```typescript
import { ConsoleLogger, LogLevel } from '../utils/logger/console-logger.js';

const logger = new ConsoleLogger({
  level: LogLevel.INFO,
  enableTimestamp: true,
  enableColors: true
});
```

### DummyLogger
Used in test environments to prevent console output.

Features:
- No console output by default
- Optional log capturing for testing
- Log filtering and inspection methods
- Useful for assertions in tests

```typescript
import { DummyLogger } from '../utils/logger/dummy-logger.js';

// Silent logger (no output, no capture)
const silentLogger = new DummyLogger();

// Logger with capturing for testing
const testLogger = new DummyLogger({}, true);

testLogger.info('Test message');
expect(testLogger.hasCapturedLogs()).toBe(true);

const logs = testLogger.getCapturedLogs();
expect(logs).toHaveLength(1);
expect(logs[0].message).toBe('Test message');
```

## Testing with Logger

### Test Logger Functionality
```typescript
import { LoggerFactory } from '../utils/logger/index.js';

test('should log error messages', () => {
  const testLogger = LoggerFactory.createTestLogger(true);

  // Use the logger in your code
  testLogger.error('Database connection failed');

  // Verify logs were captured
  expect(testLogger.hasCapturedLogs()).toBe(true);
  expect(testLogger.getCapturedLogCount()).toBe(1);

  const errorLogs = testLogger.getCapturedLogsByLevel(LogLevel.ERROR);
  expect(errorLogs).toHaveLength(1);
  expect(errorLogs[0].message).toBe('Database connection failed');
});
```

### Mock Console in Tests
```typescript
import { ConsoleLogger } from '../utils/logger/console-logger.js';

test('should format console output correctly', () => {
  const originalConsole = global.console;
  global.console = {
    ...originalConsole,
    info: jest.fn()
  } as any;

  const logger = new ConsoleLogger({
    enableTimestamp: false,
    enableColors: false
  });

  logger.info('Test message');

  expect(console.info).toHaveBeenCalledWith('[INFO ] Test message');

  // Restore console
  global.console = originalConsole;
});
```

## Environment Configuration

### Development Mode
```bash
# Default behavior - uses ConsoleLogger with colors and debug level
npm start
```

### Production Mode
```bash
# Sets NODE_ENV=production - uses ConsoleLogger without colors
NODE_ENV=production npm start
```

### Test Mode
```bash
# Sets NODE_ENV=test - uses DummyLogger silently
npm test

# Or set TEST_ENV=true
TEST_ENV=true npm test
```

## Integration with Existing Code

To migrate from `console.log` to the new logger system:

1. **Import the logger:**
```typescript
import { logger } from '../utils/logger/index.js';
```

2. **Replace console calls:**
```typescript
// Before
console.log('Server started');
console.error('Error occurred:', error);

// After
logger.info('Server started');
logger.error('Error occurred:', error);
```

3. **For new components, consider dependency injection:**
```typescript
class DatabaseService {
  constructor(private logger: Logger = LoggerFactory.getInstance()) {}

  connect() {
    this.logger.info('Connecting to database...');
  }
}
```

This approach makes testing easier and provides better control over logging behavior.