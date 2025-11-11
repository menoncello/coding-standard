import { StandardsLoader } from '../standards/standards-loader.js';
import { Logger } from '../utils/logger/logger.js';
import { LoggerFactory } from '../utils/logger/logger-factory.js';

/**
 * Factory for creating standards-related services with Logger injection
 */
export class StandardsFactory {
    private static logger: Logger = LoggerFactory.getInstance();

    /**
     * Create StandardsLoader with logger
     */
    static createStandardsLoader(projectRoot?: string): StandardsLoader {
        return new StandardsLoader(projectRoot || process.cwd(), this.logger);
    }

    /**
     * Create StandardsLoader with custom logger
     */
    static createStandardsLoaderWithLogger(logger: Logger, projectRoot?: string): StandardsLoader {
        return new StandardsLoader(projectRoot || process.cwd(), logger);
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