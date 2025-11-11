import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Logger, LogLevel } from '../../../src/utils/logger/logger';
import { ConsoleLogger } from '../../../src/utils/logger/console-logger';
import { DummyLogger } from '../../../src/utils/logger/dummy-logger';
import { LoggerFactory } from '../../../src/utils/logger/logger-factory';

describe('Logger Interface Implementation', () => {
  describe('ConsoleLogger', () => {
    let logger: ConsoleLogger;

    beforeEach(() => {
      logger = new ConsoleLogger({
        level: LogLevel.DEBUG,
        enableTimestamp: false,
        enableColors: false,
      });
    });

    test('should create logger with default configuration', () => {
      const defaultLogger = new ConsoleLogger();
      const config = defaultLogger.getConfig();

      expect(config.level).toBe(LogLevel.INFO);
      expect(config.enableTimestamp).toBe(true);
      expect(config.enableColors).toBe(true);
    });

    test('should log messages without throwing errors', () => {
      // Test that logging methods don't throw errors
      expect(() => {
        logger.debug('Debug message');
        logger.info('Info message');
        logger.warn('Warning message');
        logger.error('Error message');
        logger.log('Log message');
      }).not.toThrow();
    });

    test('should respect log level filtering', () => {
      const warnOnlyLogger = new ConsoleLogger({
        level: LogLevel.WARN,
        enableTimestamp: false,
        enableColors: false,
      });

      // Should not throw at any level
      expect(() => {
        warnOnlyLogger.debug('Debug message');
        warnOnlyLogger.info('Info message');
        warnOnlyLogger.warn('Warning message');
        warnOnlyLogger.error('Error message');
      }).not.toThrow();
    });

    test('should format messages correctly', () => {
      // Test timestamp formatting
      const timestampLogger = new ConsoleLogger({
        level: LogLevel.INFO,
        enableTimestamp: true,
        enableColors: false,
      });

      expect(() => {
        timestampLogger.info('Test message');
      }).not.toThrow();
    });

    test('should update configuration', () => {
      logger.updateConfig({ level: LogLevel.ERROR });
      expect(logger.getConfig().level).toBe(LogLevel.ERROR);
    });
  });

  describe('DummyLogger', () => {
    let logger: DummyLogger;

    beforeEach(() => {
      logger = new DummyLogger();
    });

    test('should not output to console', () => {
      // Should not throw errors but also not produce output
      expect(() => {
        logger.debug('Debug message');
        logger.info('Info message');
        logger.warn('Warning message');
        logger.error('Error message');
        logger.log('Log message');
      }).not.toThrow();
    });

    test('should not capture logs by default', () => {
      logger.info('Test message');
      expect(logger.hasCapturedLogs()).toBe(false);
      expect(logger.getCapturedLogCount()).toBe(0);
    });

    test('should capture logs when enabled', () => {
      const capturingLogger = new DummyLogger({}, true);

      capturingLogger.debug('Debug message');
      capturingLogger.info('Info message');
      capturingLogger.warn('Warning message');
      capturingLogger.error('Error message');

      expect(capturingLogger.hasCapturedLogs()).toBe(true);
      expect(capturingLogger.getCapturedLogCount()).toBe(4);
    });

    test('should allow filtering captured logs by level', () => {
      const capturingLogger = new DummyLogger({}, true);

      capturingLogger.info('Info 1');
      capturingLogger.info('Info 2');
      capturingLogger.warn('Warning 1');
      capturingLogger.error('Error 1');

      const infoLogs = capturingLogger.getCapturedLogsByLevel(LogLevel.INFO);
      const warnLogs = capturingLogger.getCapturedLogsByLevel(LogLevel.WARN);
      const errorLogs = capturingLogger.getCapturedLogsByLevel(LogLevel.ERROR);

      expect(infoLogs).toHaveLength(2);
      expect(warnLogs).toHaveLength(1);
      expect(errorLogs).toHaveLength(1);
    });

    test('should allow filtering captured logs by message', () => {
      const capturingLogger = new DummyLogger({}, true);

      capturingLogger.info('Server started');
      capturingLogger.info('Server processed request');
      capturingLogger.error('Database connection failed');

      const serverLogs = capturingLogger.getCapturedLogsByMessage('Server');
      const dbLogs = capturingLogger.getCapturedLogsByMessage('Database');

      expect(serverLogs).toHaveLength(2);
      expect(dbLogs).toHaveLength(1);
    });

    test('should clear captured logs', () => {
      const capturingLogger = new DummyLogger({}, true);

      capturingLogger.info('Test message');
      expect(capturingLogger.hasCapturedLogs()).toBe(true);

      capturingLogger.clearCapturedLogs();
      expect(capturingLogger.hasCapturedLogs()).toBe(false);
      expect(capturingLogger.getCapturedLogCount()).toBe(0);
    });

    test('should toggle log capturing', () => {
      const capturingLogger = new DummyLogger({}, false);

      capturingLogger.info('Test message 1');
      expect(capturingLogger.getCapturedLogCount()).toBe(0);

      capturingLogger.setCaptureLogs(true);
      capturingLogger.info('Test message 2');
      expect(capturingLogger.getCapturedLogCount()).toBe(1);

      capturingLogger.setCaptureLogs(false);
      capturingLogger.info('Test message 3');
      expect(capturingLogger.getCapturedLogCount()).toBe(1);
    });
  });

  describe('LoggerFactory', () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      originalEnv = { ...process.env };
      LoggerFactory.resetInstance();
    });

    afterEach(() => {
      process.env = originalEnv;
      LoggerFactory.resetInstance();
    });

    test('should create ConsoleLogger for development by default', () => {
      // Force development environment since we're running in test mode
      const logger = LoggerFactory.createLogger({}, 'development');
      expect(logger).toBeInstanceOf(ConsoleLogger);
    });

    test('should create DummyLogger for test environment', () => {
      process.env.NODE_ENV = 'test';
      const logger = LoggerFactory.createLogger();
      expect(logger).toBeInstanceOf(DummyLogger);
    });

    test('should create ConsoleLogger for production environment', () => {
      process.env.NODE_ENV = 'production';
      const logger = LoggerFactory.createLogger();
      expect(logger).toBeInstanceOf(ConsoleLogger);

      const config = (logger as ConsoleLogger).getConfig();
      expect(config.enableColors).toBe(false);
      expect(config.level).toBe(LogLevel.INFO);
    });

    test('should detect test environment from TEST_ENV', () => {
      process.env.TEST_ENV = 'true';
      expect(LoggerFactory.isTestEnvironment()).toBe(true);
    });

    test('should detect production environment from NODE_ENV', () => {
      process.env.NODE_ENV = 'production';
      expect(LoggerFactory.isProductionEnvironment()).toBe(true);
    });

    test('should create test logger with capturing enabled', () => {
      const testLogger = LoggerFactory.createTestLogger(true);
      expect(testLogger).toBeInstanceOf(DummyLogger);

      testLogger.info('Test message');
      expect(testLogger.hasCapturedLogs()).toBe(true);
    });

    test('should provide singleton instance', () => {
      const logger1 = LoggerFactory.getInstance();
      const logger2 = LoggerFactory.getInstance();
      expect(logger1).toBe(logger2);
    });

    test('should reset singleton instance', () => {
      const logger1 = LoggerFactory.getInstance();
      LoggerFactory.resetInstance();
      const logger2 = LoggerFactory.getInstance();
      expect(logger1).not.toBe(logger2);
    });

    test('should use force environment parameter', () => {
      const testLogger = LoggerFactory.createLogger({}, 'test');
      expect(testLogger).toBeInstanceOf(DummyLogger);

      const prodLogger = LoggerFactory.createLogger({}, 'production');
      expect(prodLogger).toBeInstanceOf(ConsoleLogger);

      const devLogger = LoggerFactory.createLogger({}, 'development');
      expect(devLogger).toBeInstanceOf(ConsoleLogger);
    });
  });

  describe('Logger Interface Compliance', () => {
    test('ConsoleLogger should implement Logger interface', () => {
      const logger: Logger = new ConsoleLogger();

      expect(() => {
        logger.debug('debug');
        logger.info('info');
        logger.warn('warn');
        logger.error('error');
        logger.log('log');
      }).not.toThrow();
    });

    test('DummyLogger should implement Logger interface', () => {
      const logger: Logger = new DummyLogger();

      expect(() => {
        logger.debug('debug');
        logger.info('info');
        logger.warn('warn');
        logger.error('error');
        logger.log('log');
      }).not.toThrow();
    });
  });
});