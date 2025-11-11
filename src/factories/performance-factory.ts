import { PerformanceMonitor } from '../utils/performance-monitor.js';
import { LoggerFactory } from '../utils/logger/logger-factory.js';

type Logger = ReturnType<typeof LoggerFactory.createLogger>;

/**
 * Factory for creating performance monitoring services with Logger injection
 */
export class PerformanceFactory {
    private static logger: Logger = LoggerFactory.getInstance();

    /**
     * Create performance monitor with default logger
     */
    static createPerformanceMonitor(): PerformanceMonitor {
        return new PerformanceMonitor(this.logger);
    }

    /**
     * Create performance monitor with custom logger
     */
    static createPerformanceMonitorWithLogger(logger: Logger): PerformanceMonitor {
        return new PerformanceMonitor(logger);
    }

    /**
     * Set custom logger for factory
     */
    static setLogger(logger: Logger): void {
        this.logger = logger;
    }

    /**
     * Get current logger
     */
    static getLogger(): Logger {
        return this.logger;
    }

    /**
     * Reset logger to default (useful for testing)
     */
    static resetLogger(): void {
        this.logger = LoggerFactory.getInstance();
        LoggerFactory.resetInstance();
    }
}