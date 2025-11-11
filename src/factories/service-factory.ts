import { LoggerFactory } from '../utils/logger/logger-factory.js';

type Logger = ReturnType<typeof LoggerFactory.createLogger>;

/**
 * Generic factory for creating services with Logger injection
 * Provides dependency injection for consistent testing and production behavior
 */
export abstract class ServiceFactory {
    protected static defaultLogger: Logger = LoggerFactory.getInstance();

    /**
     * Create service with injected logger
     */
    static createService<T>(
        ServiceClass: new (logger: Logger, ...args: any[]) => T,
        ...args: any[]
    ): T {
        return new ServiceClass(this.defaultLogger, ...args);
    }

    /**
     * Create service with custom logger
     */
    static createServiceWithCustomLogger<T>(
        ServiceClass: new (logger: Logger, ...args: any[]) => T,
        logger: Logger,
        ...args: any[]
    ): T {
        return new ServiceClass(logger, ...args);
    }

    /**
     * Set default logger for all service creation
     */
    static setDefaultLogger(logger: Logger): void {
        this.defaultLogger = logger;
    }

    /**
     * Get current default logger
     */
    static getDefaultLogger(): Logger {
        return this.defaultLogger;
    }

    /**
     * Create logger for testing with capture enabled
     */
    static createTestLogger(capture: boolean = true) {
        return LoggerFactory.createTestLogger(capture);
    }

    /**
     * Reset default logger (useful for testing)
     */
    static resetDefaultLogger(): void {
        this.defaultLogger = LoggerFactory.getInstance();
        LoggerFactory.resetInstance();
    }
}

/**
 * Helper function to quickly create services with logger
 */
export function createServiceWithLogger<T>(
    ServiceClass: new (logger: Logger, ...args: any[]) => T,
    ...args: any[]
): T {
    return ServiceFactory.createService(ServiceClass, ...args);
}

/**
 * Helper function to create services with custom logger
 */
export function createServiceWithCustomLogger<T>(
    ServiceClass: new (logger: Logger, ...args: any[]) => T,
    logger: Logger,
    ...args: any[]
): T {
    return ServiceFactory.createServiceWithCustomLogger(ServiceClass, logger, ...args);
}