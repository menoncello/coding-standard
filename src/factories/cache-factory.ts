import { PerformanceCache } from '../cache/performance-layer.js';
import { CacheManager } from '../cache/cache-manager.js';
import { Logger } from '../utils/logger/logger.js';
import { LoggerFactory } from '../utils/logger/logger-factory.js';

/**
 * Factory for creating cache services with Logger injection
 */
export class CacheFactory {
    private static logger: Logger = LoggerFactory.getInstance();

    /**
     * Create PerformanceCache with logger
     */
    static createPerformanceCache<T = any>(config?: any): PerformanceCache<T> {
        return new PerformanceCache<T>(config, this.logger);
    }

    /**
     * Create PerformanceCache with custom logger
     */
    static createPerformanceCacheWithLogger<T = any>(logger: Logger, config?: any): PerformanceCache<T> {
        return new PerformanceCache<T>(config, logger);
    }

    /**
     * Create CacheManager with logger
     */
    static createCacheManager<T = any>(config?: any): CacheManager<T> {
        return new CacheManager<T>(config);
    }

    /**
     * Create CacheManager with custom logger
     */
    static createCacheManagerWithLogger<T = any>(logger: Logger, config?: any): CacheManager<T> {
        return new CacheManager<T>(config);
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