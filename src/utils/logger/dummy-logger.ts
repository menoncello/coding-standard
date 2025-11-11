import { Logger, LogLevel, LoggerConfig } from './logger';

/**
 * Dummy Logger implementation for test environments
 * Silently discards all log messages to prevent console output during tests
 * Optionally can capture logs for testing purposes
 */
export class DummyLogger implements Logger {
  private config: LoggerConfig;
  private captureLogs: boolean;
  private capturedLogs: Array<{
    level: LogLevel;
    message: string;
    args: any[];
    timestamp: Date;
  }> = [];

  constructor(config: Partial<LoggerConfig> = {}, captureLogs: boolean = false) {
    this.config = {
      level: LogLevel.DEBUG,
      enableTimestamp: false,
      enableColors: false,
      ...config,
    };
    this.captureLogs = captureLogs;
  }

  debug(message: string, ...args: any[]): void {
    this.capture(LogLevel.DEBUG, message, args);
  }

  info(message: string, ...args: any[]): void {
    this.capture(LogLevel.INFO, message, args);
  }

  warn(message: string, ...args: any[]): void {
    this.capture(LogLevel.WARN, message, args);
  }

  error(message: string, ...args: any[]): void {
    this.capture(LogLevel.ERROR, message, args);
  }

  log(message: string, ...args: any[]): void {
    this.capture(LogLevel.LOG, message, args);
  }

  private capture(level: LogLevel, message: string, args: any[]): void {
    if (this.captureLogs) {
      this.capturedLogs.push({
        level,
        message,
        args,
        timestamp: new Date(),
      });
    }
    // Silently discard all log messages - no console output
  }

  /**
   * Enable or disable log capturing for testing purposes
   */
  setCaptureLogs(capture: boolean): void {
    this.captureLogs = capture;
  }

  /**
   * Get all captured logs
   */
  getCapturedLogs(): Array<{
    level: LogLevel;
    message: string;
    args: any[];
    timestamp: Date;
  }> {
    return [...this.capturedLogs];
  }

  /**
   * Get captured logs filtered by level
   */
  getCapturedLogsByLevel(level: LogLevel): Array<{
    level: LogLevel;
    message: string;
    args: any[];
    timestamp: Date;
  }> {
    return this.capturedLogs.filter(log => log.level === level);
  }

  /**
   * Get captured logs filtered by message content
   */
  getCapturedLogsByMessage(searchTerm: string): Array<{
    level: LogLevel;
    message: string;
    args: any[];
    timestamp: Date;
  }> {
    return this.capturedLogs.filter(log =>
      log.message.includes(searchTerm)
    );
  }

  /**
   * Clear all captured logs
   */
  clearCapturedLogs(): void {
    this.capturedLogs = [];
  }

  /**
   * Get count of captured logs
   */
  getCapturedLogCount(): number {
    return this.capturedLogs.length;
  }

  /**
   * Check if any logs were captured
   */
  hasCapturedLogs(): boolean {
    return this.capturedLogs.length > 0;
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