import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { LoggerFactory } from '../../src/utils/logger/logger-factory.js';
import { DummyLogger } from '../../src/utils/logger/dummy-logger.js';
import { LogLevel } from '../../src/utils/logger/logger.js';

describe('Logger Injection Integration Tests', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    LoggerFactory.resetInstance();
  });

  afterEach(() => {
    process.env = originalEnv;
    LoggerFactory.resetInstance();
  });

  test('should use DummyLogger in test environment with zero console output', () => {
    process.env.NODE_ENV = 'test';

    // This should create a DummyLogger automatically
    const logger = LoggerFactory.getInstance();
    expect(logger).toBeInstanceOf(DummyLogger);

    // All logging should be silent
    expect(() => {
      logger.info('This should not appear');
      logger.error('This should not appear');
      logger.warn('This should not appear');
      logger.debug('This should not appear');
      logger.log('This should not appear');
    }).not.toThrow();
  });

  test('should capture logs when explicitly enabled in tests', () => {
    const testLogger = LoggerFactory.createTestLogger(true);

    testLogger.info('Operation started');
    testLogger.error('Operation failed');
    testLogger.warn('Warning message');
    testLogger.debug('Debug information');

    expect(testLogger.hasCapturedLogs()).toBe(true);
    expect(testLogger.getCapturedLogCount()).toBe(4);

    const allLogs = testLogger.getCapturedLogs();
    expect(allLogs).toHaveLength(4);
    expect(allLogs[0].message).toBe('Operation started');
    expect(allLogs[1].message).toBe('Operation failed');
    expect(allLogs[2].message).toBe('Warning message');
    expect(allLogs[3].message).toBe('Debug information');
  });

  test('should filter captured logs by level', () => {
    const testLogger = LoggerFactory.createTestLogger(true);

    testLogger.info('Info message');
    testLogger.error('Error message');
    testLogger.warn('Warning message');
    testLogger.info('Another info');

    const errorLogs = testLogger.getCapturedLogsByLevel(LogLevel.ERROR);
    const infoLogs = testLogger.getCapturedLogsByLevel(LogLevel.INFO);
    const warnLogs = testLogger.getCapturedLogsByLevel(LogLevel.WARN);

    expect(errorLogs).toHaveLength(1);
    expect(infoLogs).toHaveLength(2);
    expect(warnLogs).toHaveLength(1);

    expect(errorLogs[0].message).toBe('Error message');
    expect(infoLogs[0].message).toBe('Info message');
    expect(infoLogs[1].message).toBe('Another info');
  });

  test('should filter captured logs by message content', () => {
    const testLogger = LoggerFactory.createTestLogger(true);

    testLogger.info('User login successful');
    testLogger.info('User logout');
    testLogger.error('Database connection failed');
    testLogger.warn('User action timeout');

    const userLogs = testLogger.getCapturedLogsByMessage('User');
    expect(userLogs).toHaveLength(3);

    const dbLogs = testLogger.getCapturedLogsByMessage('Database');
    expect(dbLogs).toHaveLength(1);
  });

  test('should clear captured logs', () => {
    const testLogger = LoggerFactory.createTestLogger(true);

    testLogger.info('First message');
    testLogger.error('Second message');

    expect(testLogger.hasCapturedLogs()).toBe(true);
    expect(testLogger.getCapturedLogCount()).toBe(2);

    testLogger.clearCapturedLogs();

    expect(testLogger.hasCapturedLogs()).toBe(false);
    expect(testLogger.getCapturedLogCount()).toBe(0);
  });

  test('should toggle log capturing', () => {
    const testLogger = new DummyLogger({}, false);

    testLogger.info('This should not be captured');

    expect(testLogger.getCapturedLogCount()).toBe(0);

    testLogger.setCaptureLogs(true);

    testLogger.info('This should be captured');

    expect(testLogger.getCapturedLogCount()).toBe(1);
    expect(testLogger.getCapturedLogs()[0].message).toBe('This should be captured');

    testLogger.setCaptureLogs(false);

    testLogger.info('This should not be captured again');

    expect(testLogger.getCapturedLogCount()).toBe(1); // Still 1 from before
  });

  test('should handle multiple environment detection methods', () => {
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

    // Reset and test production
    LoggerFactory.resetInstance();
    delete process.env.CI;
    process.env.NODE_ENV = 'production';
    expect(LoggerFactory.isProductionEnvironment()).toBe(true);
    expect(LoggerFactory.isTestEnvironment()).toBe(false);
  });

  test('should include timestamps and metadata in captured logs', () => {
    const testLogger = LoggerFactory.createTestLogger(true);

    const beforeTime = Date.now();
    testLogger.error('Test error message');

    const logs = testLogger.getCapturedLogs();
    expect(logs).toHaveLength(1);

    const log = logs[0];
    expect(log.level).toBe(LogLevel.ERROR);
    expect(log.message).toBe('Test error message');
    expect(Number(log.timestamp)).toBeGreaterThanOrEqual(beforeTime);
    expect(Number(log.timestamp)).toBeLessThanOrEqual(Date.now());
    expect(Array.isArray(log.args)).toBe(true);
    expect(log.args).toHaveLength(0);
  });

  test('should handle log arguments correctly', () => {
    const testLogger = LoggerFactory.createTestLogger(true);

    const testData = { id: 123, name: 'test' };
    const error = new Error('Test error');

    testLogger.info('User data:', testData);
    testLogger.error('Error occurred:', error);

    const logs = testLogger.getCapturedLogs();
    expect(logs).toHaveLength(2);

    expect(logs[0].args).toHaveLength(1);
    expect(logs[0].args[0]).toBe(testData);

    expect(logs[1].args).toHaveLength(1);
    expect(logs[1].args[0]).toBe(error);
  });
});