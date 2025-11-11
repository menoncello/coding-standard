import { Logger, LogLevel, LoggerConfig } from './logger';
import { ConsoleLogger } from './console-logger';
import { DummyLogger } from './dummy-logger';

/**
 * Environment-based logger factory
 * Creates appropriate logger instance based on current environment
 */
export class LoggerFactory {
  private static instance: Logger | null = null;

  /**
   * Create logger instance based on environment
   * @param config Optional logger configuration
   * @param forceEnvironment Optional environment override
   * @returns Logger instance
   */
  static createLogger(
    config?: Partial<LoggerConfig>,
    forceEnvironment?: 'production' | 'test' | 'development'
  ): Logger {
    const environment = forceEnvironment || this.getEnvironment();

    switch (environment) {
      case 'test':
        return new DummyLogger(config);

      case 'production':
        return new ConsoleLogger({
          level: LogLevel.INFO,
          enableTimestamp: true,
          enableColors: false, // Disable colors in production
          ...config,
        });

      case 'development':
      default:
        return new ConsoleLogger({
          level: LogLevel.DEBUG,
          enableTimestamp: true,
          enableColors: true,
          ...config,
        });
    }
  }

  /**
   * Get singleton logger instance
   * @param config Optional configuration (only used on first call)
   * @returns Logger instance
   */
  static getInstance(config?: Partial<LoggerConfig>): Logger {
    if (this.instance === null) {
      this.instance = this.createLogger(config);
    }
    return this.instance;
  }

  /**
   * Reset singleton instance (useful for testing)
   */
  static resetInstance(): void {
    this.instance = null;
  }

  /**
   * Detect current environment
   * @returns Environment string
   */
  private static getEnvironment(): 'production' | 'test' | 'development' {
    // Check explicit environment variables
    if (process.env.NODE_ENV === 'production') {
      return 'production';
    }

    if (process.env.NODE_ENV === 'test') {
      return 'test';
    }

    if (process.env.TEST_ENV === 'true' || process.env.CI === 'true') {
      return 'test';
    }

    // Check if we're in a test runner context
    if (typeof Bun !== 'undefined' && Bun.argv?.some(arg => arg.includes('test'))) {
      return 'test';
    }

    // Default to development
    return 'development';
  }

  /**
   * Check if current environment is test
   * @returns True if in test environment
   */
  static isTestEnvironment(): boolean {
    return this.getEnvironment() === 'test';
  }

  /**
   * Check if current environment is production
   * @returns True if in production environment
   */
  static isProductionEnvironment(): boolean {
    return this.getEnvironment() === 'production';
  }

  /**
   * Check if current environment is development
   * @returns True if in development environment
   */
  static isDevelopmentEnvironment(): boolean {
    return this.getEnvironment() === 'development';
  }

  /**
   * Create logger for testing with optional log capturing
   * @param captureLogs Whether to capture logs for testing
   * @param config Optional configuration
   * @returns DummyLogger instance
   */
  static createTestLogger(captureLogs: boolean = false, config?: Partial<LoggerConfig>): DummyLogger {
    return new DummyLogger(config, captureLogs);
  }
}

/**
 * Default logger instance for application use
 * Use this export for convenient access to the default logger
 */
export const logger: Logger = LoggerFactory.getInstance();