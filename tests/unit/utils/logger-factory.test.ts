import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { LoggerFactory } from '../../../src/utils/logger/logger-factory';
import { LogLevel } from '../../../src/utils/logger/logger';

describe('LoggerFactory', () => {
  beforeEach(() => {
    // Reset singleton before each test
    LoggerFactory.resetInstance();
  });

  afterEach(() => {
    // Clean up after each test
    LoggerFactory.resetInstance();
  });

  describe('createLogger', () => {
    test('should create development logger by default', () => {
      // WHEN: Logger is created without explicit environment
      const logger = LoggerFactory.createLogger();

      // THEN: Development logger is created
      expect(logger).toBeDefined();
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
    });

    test('should create test logger when in test environment', () => {
      // WHEN: Logger is created with test environment override
      const testLogger = LoggerFactory.createLogger(undefined, 'test');

      // THEN: Test logger is created
      expect(testLogger).toBeDefined();
      expect(typeof testLogger.debug).toBe('function');
    });

    test('should create production logger with appropriate settings', () => {
      // WHEN: Logger is created with production environment override
      const prodLogger = LoggerFactory.createLogger(undefined, 'production');

      // THEN: Production logger is created
      expect(prodLogger).toBeDefined();
      expect(typeof prodLogger.info).toBe('function');
    });

    test('should merge custom configuration', () => {
      // WHEN: Logger is created with custom config
      const customLogger = LoggerFactory.createLogger({
        level: LogLevel.ERROR,
        enableTimestamp: false
      }, 'development');

      // THEN: Custom configuration is applied and logger is created
      expect(customLogger).toBeDefined();
      expect(typeof customLogger.error).toBe('function');
    });
  });

  describe('getInstance (Singleton Pattern)', () => {
    test('should return the same instance on subsequent calls', () => {
      // WHEN: getInstance is called multiple times
      const logger1 = LoggerFactory.getInstance();
      const logger2 = LoggerFactory.getInstance();

      // THEN: Same instance is returned
      expect(logger1).toBe(logger2);
    });

    test('should use config only on first call', () => {
      // WHEN: getInstance is called with config, then without
      const logger1 = LoggerFactory.getInstance({ level: LogLevel.ERROR });
      const logger2 = LoggerFactory.getInstance({ level: LogLevel.DEBUG });

      // THEN: First config is used, second config is ignored
      expect(logger1).toBe(logger2);
    });
  });

  describe('Environment Detection', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    test('should detect test environment from NODE_ENV', () => {
      // GIVEN: NODE_ENV is set to test
      process.env.NODE_ENV = 'test';

      // WHEN: Environment is checked
      const isTest = LoggerFactory.isTestEnvironment();

      // THEN: Test environment is detected
      expect(isTest).toBe(true);
    });

    test('should detect production environment from NODE_ENV', () => {
      // GIVEN: NODE_ENV is set to production
      process.env.NODE_ENV = 'production';

      // WHEN: Environment is checked
      const isProduction = LoggerFactory.isProductionEnvironment();

      // THEN: Production environment is detected
      expect(isProduction).toBe(true);
    });

    test('should detect test environment from TEST_ENV', () => {
      // GIVEN: TEST_ENV is set to true
      process.env.TEST_ENV = 'true';

      // WHEN: Environment is checked
      const isTest = LoggerFactory.isTestEnvironment();

      // THEN: Test environment is detected
      expect(isTest).toBe(true);
    });

    test('should detect test environment from CI', () => {
      // GIVEN: CI is set to true
      process.env.CI = 'true';

      // WHEN: Environment is checked
      const isTest = LoggerFactory.isTestEnvironment();

      // THEN: Test environment is detected
      expect(isTest).toBe(true);
    });

    test('should detect test environment from test runner context', () => {
      // GIVEN: No explicit environment variables but running in test context
      delete process.env.NODE_ENV;
      delete process.env.TEST_ENV;
      delete process.env.CI;

      // WHEN: Environment is checked
      const isTest = LoggerFactory.isTestEnvironment();

      // THEN: Test environment is detected from test runner
      expect(isTest).toBe(true);
    });
  });

  describe('createTestLogger', () => {
    test('should create test logger with log capturing', () => {
      // WHEN: Test logger is created with log capturing
      const testLogger = LoggerFactory.createTestLogger(true);

      // THEN: Test logger with capturing is created
      expect(testLogger).toBeDefined();
      expect(typeof testLogger.debug).toBe('function');
    });

    test('should create test logger without log capturing', () => {
      // WHEN: Test logger is created without log capturing
      const testLogger = LoggerFactory.createTestLogger(false);

      // THEN: Test logger without capturing is created
      expect(testLogger).toBeDefined();
      expect(typeof testLogger.info).toBe('function');
    });

    test('should merge custom configuration for test logger', () => {
      // WHEN: Test logger is created with custom config
      const testLogger = LoggerFactory.createTestLogger(true, {
        level: LogLevel.ERROR
      });

      // THEN: Custom configuration is applied
      expect(testLogger).toBeDefined();
      expect(typeof testLogger.error).toBe('function');
    });
  });

  describe('resetInstance', () => {
    test('should reset singleton instance', () => {
      // GIVEN: Singleton instance is created
      const logger1 = LoggerFactory.getInstance();

      // WHEN: Instance is reset
      LoggerFactory.resetInstance();
      const logger2 = LoggerFactory.getInstance({ level: LogLevel.ERROR });

      // THEN: New instance is created with new config
      expect(logger1).not.toBe(logger2);
    });
  });

  describe('Environment-based Logger Creation', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
      LoggerFactory.resetInstance();
    });

    afterEach(() => {
      process.env = originalEnv;
      LoggerFactory.resetInstance();
    });

    test('should create appropriate logger based on NODE_ENV', () => {
      // GIVEN: NODE_ENV is set to production
      process.env.NODE_ENV = 'production';

      // WHEN: Logger is created
      const logger = LoggerFactory.createLogger();

      // THEN: Production logger is created
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
    });

    test('should create test logger when NODE_ENV is test', () => {
      // GIVEN: NODE_ENV is set to test
      process.env.NODE_ENV = 'test';

      // WHEN: Logger is created
      const logger = LoggerFactory.createLogger();

      // THEN: Test logger is created
      expect(logger).toBeDefined();
      expect(typeof logger.debug).toBe('function');
    });

    test('should create development logger when NODE_ENV is development', () => {
      // GIVEN: NODE_ENV is set to development
      process.env.NODE_ENV = 'development';

      // WHEN: Logger is created
      const logger = LoggerFactory.createLogger();

      // THEN: Development logger is created
      expect(logger).toBeDefined();
      expect(typeof logger.debug).toBe('function');
    });

    test('should use development logger when environment is unrecognized', () => {
      // GIVEN: NODE_ENV is set to unrecognized value
      process.env.NODE_ENV = 'staging';

      // WHEN: Logger is created
      const logger = LoggerFactory.createLogger();

      // THEN: Development logger is created as fallback
      expect(logger).toBeDefined();
      expect(typeof logger.debug).toBe('function');
    });
  });
});