import CodingStandardsServer from '../mcp/server.js';
import { LoggerFactory } from '../utils/logger/logger-factory.js';

type Logger = ReturnType<typeof LoggerFactory.createLogger>;

/**
 * Factory for creating MCP-related services with Logger injection
 */
export class McpFactory {
    private static logger: Logger = LoggerFactory.getInstance();

    /**
     * Create MCP server with logger
     */
    static createServer(): CodingStandardsServer {
        return new CodingStandardsServer(this.logger);
    }

    /**
     * Create MCP server with custom logger
     */
    static createServerWithCustomLogger(logger: Logger): CodingStandardsServer {
        return new CodingStandardsServer(logger);
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
}