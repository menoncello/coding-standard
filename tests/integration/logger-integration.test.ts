import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { LoggerFactory } from '../../src/utils/logger/logger-factory.js';
import { DummyLogger } from '../../src/utils/logger/dummy-logger.js';
import { LogLevel } from '../../src/utils/logger/logger.js';

describe('Logger Integration Tests', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    LoggerFactory.resetInstance();
  });

  afterEach(() => {
    process.env = originalEnv;
    LoggerFactory.resetInstance();
  });

  test('should use DummyLogger in test environment', () => {
    process.env.NODE_ENV = 'test';
    const logger = LoggerFactory.getInstance();

    expect(logger).toBeInstanceOf(DummyLogger);

    // Should not produce any console output
    expect(() => {
      logger.info('This should not appear in console');
      logger.error('Neither should this error');
      logger.debug('Nor this debug message');
    }).not.toThrow();
  });

  test('should capture logs when explicitly enabled in tests', () => {
    const testLogger = LoggerFactory.createTestLogger(true);

    testLogger.info('User logged in');
    testLogger.error('Database connection failed');
    testLogger.warn('API rate limit exceeded');

    expect(testLogger.hasCapturedLogs()).toBe(true);
    expect(testLogger.getCapturedLogCount()).toBe(3);

    const errorLogs = testLogger.getCapturedLogsByLevel(LogLevel.ERROR);
    expect(errorLogs).toHaveLength(1);
    expect(errorLogs[0].message).toBe('Database connection failed');
  });

  test('should detect test environment correctly', () => {
    // Test NODE_ENV=test
    process.env.NODE_ENV = 'test';
    expect(LoggerFactory.isTestEnvironment()).toBe(true);

    // Reset and test TEST_ENV=true
    LoggerFactory.resetInstance();
    delete process.env.NODE_ENV;
    process.env.TEST_ENV = 'true';
    expect(LoggerFactory.isTestEnvironment()).toBe(true);

    // Reset and test CI=true
    LoggerFactory.resetInstance();
    delete process.env.TEST_ENV;
    process.env.CI = 'true';
    expect(LoggerFactory.isTestEnvironment()).toBe(true);
  });

  test('should handle logger configuration changes', () => {
    const testLogger = LoggerFactory.createTestLogger(true);

    // Should be able to update configuration
    expect(() => {
      testLogger.updateConfig({ level: LogLevel.ERROR });
    }).not.toThrow();

    const updatedConfig = testLogger.getConfig();
    expect(updatedConfig.level).toBe(LogLevel.ERROR);
  });
});