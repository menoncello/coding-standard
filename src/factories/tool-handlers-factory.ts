import { GetStandardsHandler, StandardsRegistryHandler } from '../mcp/handlers/toolHandlers.js';
import { LoggerFactory } from '../utils/logger/logger-factory.js';
import type { Logger } from '../utils/logger/logger.js';

/**
 * Factory for creating MCP tool handlers with Logger injection
 */
export class ToolHandlersFactory {
    private static logger: Logger = LoggerFactory.getInstance();

    /**
     * Create GetStandardsHandler with logger
     */
    static createGetStandardsHandler(useSecureCache: boolean = true, dbPath?: string): GetStandardsHandler {
        return new GetStandardsHandler(useSecureCache, dbPath, this.logger);
    }

    /**
     * Create GetStandardsHandler with custom logger
     */
    static createGetStandardsHandlerWithLogger(logger: Logger, useSecureCache: boolean = true, dbPath?: string): GetStandardsHandler {
        return new GetStandardsHandler(useSecureCache, dbPath, logger);
    }

    /**
     * Create StandardsRegistryHandler with logger
     */
    static createStandardsRegistryHandler(useSecureCache: boolean = true, dbPath?: string): StandardsRegistryHandler {
        return new StandardsRegistryHandler(useSecureCache, dbPath, this.logger);
    }

    /**
     * Create StandardsRegistryHandler with custom logger
     */
    static createStandardsRegistryHandlerWithLogger(logger: Logger, useSecureCache: boolean = true, dbPath?: string): StandardsRegistryHandler {
        return new StandardsRegistryHandler(useSecureCache, dbPath, logger);
    }

    /**
     * Create insecure GetStandardsHandler with logger
     */
    static createGetStandardsHandlerInsecure(dbPath?: string): GetStandardsHandler {
        return new GetStandardsHandler(false, dbPath, this.logger);
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