import { Logger, LogLevel, LoggerConfig } from './logger';

/**
 * Console Logger implementation for production environments
 * Outputs messages to the console with formatting and colors
 */
export class ConsoleLogger implements Logger {
  private config: LoggerConfig;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      level: LogLevel.INFO,
      enableTimestamp: true,
      enableColors: true,
      ...config,
    };
  }

  debug(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      const formattedMessage = this.formatMessage(message, LogLevel.DEBUG);
      console.debug(formattedMessage, ...args);
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.INFO)) {
      const formattedMessage = this.formatMessage(message, LogLevel.INFO);
      console.info(formattedMessage, ...args);
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.WARN)) {
      const formattedMessage = this.formatMessage(message, LogLevel.WARN);
      console.warn(formattedMessage, ...args);
    }
  }

  error(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      const formattedMessage = this.formatMessage(message, LogLevel.ERROR);
      console.error(formattedMessage, ...args);
    }
  }

  log(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.LOG)) {
      const formattedMessage = this.formatMessage(message, LogLevel.LOG);
      console.log(formattedMessage, ...args);
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR, LogLevel.LOG];
    const currentLevelIndex = levels.indexOf(this.config.level);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex >= currentLevelIndex;
  }

  private formatMessage(message: string, level: LogLevel): string {
    let formatted = message;

    if (this.config.enableTimestamp) {
      const timestamp = new Date().toISOString();
      formatted = `[${timestamp}] ${formatted}`;
    }

    if (this.config.enableColors) {
      const colors = {
        [LogLevel.DEBUG]: '\x1b[36m', // Cyan
        [LogLevel.INFO]: '\x1b[32m',  // Green
        [LogLevel.WARN]: '\x1b[33m',  // Yellow
        [LogLevel.ERROR]: '\x1b[31m', // Red
        [LogLevel.LOG]: '\x1b[0m',    // Default
      };
      const reset = '\x1b[0m';
      formatted = `${colors[level]}${formatted}${reset}`;
    }

    // Add level prefix
    const prefix = level.toUpperCase().padEnd(5);
    formatted = `[${prefix}] ${formatted}`;

    return formatted;
  }

  /**
   * Update logger configuration
   */
  updateConfig(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current logger configuration
   */
  getConfig(): LoggerConfig {
    return { ...this.config };
  }
}