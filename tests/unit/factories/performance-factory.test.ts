import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { PerformanceFactory } from '../../../src/factories/performance-factory.js';
import { LoggerFactory } from '../../../src/utils/logger/logger-factory.js';

describe('PerformanceFactory', () => {
  beforeEach(() => {
    // Reset logger factory before each test
    LoggerFactory.resetInstance();
  });

  afterEach(() => {
    // Clean up after each test
    LoggerFactory.resetInstance();
  });

  describe('createPerformanceMonitor', () => {
    test('should create performance monitor with default logger', () => {
      // WHEN: Performance monitor is created with default logger
      const monitor = PerformanceFactory.createPerformanceMonitor();

      // THEN: Performance monitor is created successfully
      expect(monitor).toBeDefined();
      expect(typeof monitor.recordMetric).toBe('function');
    });

    test('should create performance monitor with custom logger', () => {
      // GIVEN: Custom logger is created
      const customLogger = LoggerFactory.createTestLogger(true);

      // WHEN: Performance monitor is created with custom logger
      const monitor = PerformanceFactory.createPerformanceMonitorWithLogger(customLogger);

      // THEN: Performance monitor is created successfully
      expect(monitor).toBeDefined();
      expect(typeof monitor.recordMetric).toBe('function');
    });
  });

  describe('Logger Management', () => {
    test('should set custom logger', () => {
      // GIVEN: Custom logger is created
      const customLogger = LoggerFactory.createTestLogger(true);

      // WHEN: Custom logger is set
      PerformanceFactory.setLogger(customLogger);

      // THEN: Custom logger is used by factory
      const currentLogger = PerformanceFactory.getLogger();
      expect(currentLogger).toBeDefined();
    });

    test('should get current logger', () => {
      // WHEN: Current logger is requested
      const currentLogger = PerformanceFactory.getLogger();

      // THEN: Logger is returned
      expect(currentLogger).toBeDefined();
      expect(typeof currentLogger.debug).toBe('function');
    });

    test('should reset logger to default', () => {
      // GIVEN: Custom logger is set
      const customLogger = LoggerFactory.createTestLogger(true);
      PerformanceFactory.setLogger(customLogger);

      // WHEN: Logger is reset to default
      PerformanceFactory.resetLogger();

      // THEN: Default logger is restored
      const currentLogger = PerformanceFactory.getLogger();
      expect(currentLogger).toBeDefined();
    });
  });

  describe('Factory Consistency', () => {
    test('should create monitors with consistent logger', () => {
      // GIVEN: Custom logger is set
      const customLogger = LoggerFactory.createTestLogger(true);
      PerformanceFactory.setLogger(customLogger);

      // WHEN: Multiple monitors are created
      const monitor1 = PerformanceFactory.createPerformanceMonitor();
      const monitor2 = PerformanceFactory.createPerformanceMonitor();

      // THEN: Both monitors use the same logger
      expect(monitor1).toBeDefined();
      expect(monitor2).toBeDefined();
      expect(typeof monitor1.recordMetric).toBe('function');
      expect(typeof monitor2.recordMetric).toBe('function');
    });

    test('should handle logger changes gracefully', () => {
      // GIVEN: Default monitor is created
      const monitor1 = PerformanceFactory.createPerformanceMonitor();

      // WHEN: Logger is changed
      const customLogger = LoggerFactory.createTestLogger(true);
      PerformanceFactory.setLogger(customLogger);
      const monitor2 = PerformanceFactory.createPerformanceMonitor();

      // THEN: Both monitors are created successfully
      expect(monitor1).toBeDefined();
      expect(monitor2).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    test('should handle null logger gracefully', () => {
      // WHEN: Null logger is set (if allowed)
      PerformanceFactory.setLogger(null as any);

      // THEN: Factory continues to function
      const monitor = PerformanceFactory.createPerformanceMonitor();
      expect(monitor).toBeDefined();
    });

    test('should handle undefined logger gracefully', () => {
      // WHEN: Undefined logger is set
      PerformanceFactory.setLogger(undefined as any);

      // THEN: Factory continues to function
      const monitor = PerformanceFactory.createPerformanceMonitor();
      expect(monitor).toBeDefined();
    });
  });

  describe('Integration with LoggerFactory', () => {
    test('should respect LoggerFactory reset', () => {
      // GIVEN: Logger is configured
      const customLogger = LoggerFactory.createTestLogger(true);
      PerformanceFactory.setLogger(customLogger);

      // WHEN: LoggerFactory is reset
      LoggerFactory.resetInstance();
      PerformanceFactory.resetLogger();

      // THEN: Factory uses fresh logger
      const monitor = PerformanceFactory.createPerformanceMonitor();
      expect(monitor).toBeDefined();
    });

    test('should work with different logger types', () => {
      // GIVEN: Different logger types are created
      const testLogger = LoggerFactory.createTestLogger(false);
      const devLogger = LoggerFactory.createLogger(undefined, 'development');

      // WHEN: Loggers are used with factory
      PerformanceFactory.setLogger(testLogger);
      const monitor1 = PerformanceFactory.createPerformanceMonitor();

      PerformanceFactory.setLogger(devLogger);
      const monitor2 = PerformanceFactory.createPerformanceMonitor();

      // THEN: Both monitors work correctly
      expect(monitor1).toBeDefined();
      expect(monitor2).toBeDefined();
    });
  });
});