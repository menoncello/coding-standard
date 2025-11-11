import { DatabaseConnection } from '../database/connection.js';
import { SqliteCacheBackend } from '../database/cache-backend.js';
import { FtsSearchEngine } from '../cache/search-index.js';
import { DatabaseRecoveryManager } from '../database/recovery.js';
import { DatabasePerformanceManager } from '../database/performance.js';
import { DatabaseAnalytics } from '../database/analytics.js';
import { DatabaseConfig } from '../types/database.js';
import { LoggerFactory } from '../utils/logger/logger-factory.js';

type Logger = ReturnType<typeof LoggerFactory.createLogger>;

/**
 * Factory for creating database-related services with Logger injection
 */
export class DatabaseFactory {
    private static logger: Logger = LoggerFactory.getInstance();

    /**
     * Create database connection with logger
     */
    static createDatabaseConnection(config?: Partial<DatabaseConfig>): DatabaseConnection {
        return new DatabaseConnection(config, this.logger);
    }

    /**
     * Create cache backend with logger
     */
    static createCacheBackend(config?: Partial<DatabaseConfig>): SqliteCacheBackend {
        const dbConnection = this.createDatabaseConnection(config);
        const cacheConfig = {
            persistToDisk: true,
            syncInterval: 60000, // 1 minute
            cleanupInterval: 300000, // 5 minutes
            compressionEnabled: true,
            database: dbConnection,
            maxSize: 1000,
            ttl: 3600000 // 1 hour
        };
        return new SqliteCacheBackend(cacheConfig, this.logger);
    }

    /**
     * Create search index with logger
     */
    static createSearchIndex(): FtsSearchEngine {
        const dbConnection = this.createDatabaseConnection();
        return new FtsSearchEngine(dbConnection);
    }

    /**
     * Create database recovery service with logger
     */
    static createDatabaseRecovery(config?: Partial<DatabaseConfig>): DatabaseRecoveryManager {
        const dbConnection = this.createDatabaseConnection(config);
        return new DatabaseRecoveryManager(dbConnection, this.logger);
    }

    /**
     * Create database performance service
     */
    static createDatabasePerformance(config?: Partial<DatabaseConfig>): DatabasePerformanceManager {
        const dbConnection = this.createDatabaseConnection(config);
        return new DatabasePerformanceManager(dbConnection);
    }

    /**
     * Create database analytics service with logger
     */
    static createDatabaseAnalytics(config?: Partial<DatabaseConfig>): DatabaseAnalytics {
        const dbConnection = this.createDatabaseConnection(config);
        return new DatabaseAnalytics(dbConnection, this.logger);
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