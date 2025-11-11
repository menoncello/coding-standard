/**
 * Multi-layer cache orchestration with performance optimization
 * Implements memory → SQLite → file system hierarchy with SLA monitoring
 */

import { LRUCache, LRUCacheMetrics, MemoryPressureLevel } from './lru-cache.js';
import { SqliteCacheBackend } from '../database/cache-backend.js';
import { PerformanceFactory } from '../factories/performance-factory.js';
import { Logger } from '../utils/logger/logger.js';

/**
 * Cache layer types
 */
export enum CacheLayer {
    MEMORY = 'memory',
    PERSISTENT = 'persistent',
    FILE_SYSTEM = 'file_system'
}

/**
 * Cache entry origin tracking
 */
export interface CacheOrigin {
    layer: CacheLayer;
    timestamp: number;
    hitTime: number;
}

/**
 * Performance cache configuration
 */
export interface PerformanceCacheConfig {
    // Memory layer config
    memoryCache: {
        maxSize: number;
        memoryLimit: number;
        ttl: number;
    };

    // Persistent layer config
    persistentCache: {
        enabled: boolean;
        maxSize: number;
        ttl: number;
    };

    // Performance targets
    performanceTargets: {
        maxMemoryResponseTime: number; // 30ms target
        maxPersistentResponseTime: number; // 100ms target
        minCacheHitRate: number; // 80% target
        maxMemoryUsage: number; // 50MB limit
    };

    // SLA monitoring
    slaMonitoring: {
        enabled: boolean;
        violationThreshold: number; // Percentage of requests that can violate SLA
        monitoringWindow: number; // Time window in milliseconds
    };
}

/**
 * SLA violation report
 */
export interface SLAViolation {
    type: 'response_time' | 'hit_rate' | 'memory_usage';
    layer: CacheLayer;
    actualValue: number;
    targetValue: number;
    timestamp: number;
    severity: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Cache statistics across all layers
 */
export interface PerformanceCacheStats {
    memory: LRUCacheMetrics;
    persistent: {
        hits: number;
        misses: number;
        size: number;
        hitRate: number;
        averageResponseTime: number;
    };
    combined: {
        totalHits: number;
        totalMisses: number;
        overallHitRate: number;
        averageResponseTime: number;
        totalMemoryUsage: number;
    };
    sla: {
        violations: SLAViolation[];
        complianceRate: number;
        lastViolation: number | null;
    };
}

/**
 * Multi-layer performance cache with orchestration
 */
export class PerformanceCache<T = any> {
    private memoryCache: LRUCache<T>;
    private persistentCache: SqliteCacheBackend<T> | null = null;
    private performanceMonitor: any;
    private config: PerformanceCacheConfig;
    private stats: PerformanceCacheStats;
    private origins = new Map<string, CacheOrigin>();
    private slaViolations: SLAViolation[] = [];
    private logger: Logger;

    constructor(config: Partial<PerformanceCacheConfig> = {}, logger?: Logger) {
        this.config = this.mergeConfig(config);
        this.logger = logger || PerformanceFactory.getLogger() as any;
        this.performanceMonitor = PerformanceFactory.createPerformanceMonitor();

        // Initialize memory cache
        this.memoryCache = new LRUCache<T>({
            maxSize: this.config.memoryCache.maxSize,
            memoryLimit: this.config.memoryCache.memoryLimit,
            cleanupInterval: 30000, // 30 seconds
            enableMemoryPressure: true,
            enableMetrics: true
        });

        // Initialize persistent cache
        if (this.config.persistentCache.enabled) {
            this.persistentCache = new SqliteCacheBackend<T>({
                maxSize: this.config.persistentCache.maxSize,
                defaultTtl: this.config.persistentCache.ttl
            }, this.logger);
        }

        // Initialize statistics
        this.stats = {
            memory: this.memoryCache.getMetrics(),
            persistent: {
                hits: 0,
                misses: 0,
                size: 0,
                hitRate: 0,
                averageResponseTime: 0
            },
            combined: {
                totalHits: 0,
                totalMisses: 0,
                overallHitRate: 0,
                averageResponseTime: 0,
                totalMemoryUsage: 0
            },
            sla: {
                violations: [],
                complianceRate: 100,
                lastViolation: null
            }
        };
    }

    /**
     * Get value from cache with layer orchestration
     */
    async get(key: string): Promise<T | null> {
        const timerId = this.performanceMonitor.startTimer('cache_get');
        const startTime = Date.now();

        try {
            // Layer 1: Memory cache (fastest)
            let value = this.memoryCache.get(key);
            if (value !== null) {
                this.recordOrigin(key, CacheLayer.MEMORY, Date.now() - startTime);
                this.performanceMonitor.endTimer(timerId, 'cache_get', true, true);
                this.updateStats('memory_hit');
                this.checkSLA('response_time', CacheLayer.MEMORY, Date.now() - startTime);
                return value;
            }

            // Layer 2: Persistent cache (SQLite)
            if (this.persistentCache) {
                const persistentResult = await this.persistentCache.get(key);
                if (persistentResult.success && persistentResult.data) {
                    value = persistentResult.data;

                    // Promote to memory cache for faster future access
                    this.memoryCache.set(key, value, this.config.memoryCache.ttl);

                    this.recordOrigin(key, CacheLayer.PERSISTENT, Date.now() - startTime);
                    this.performanceMonitor.endTimer(timerId, 'cache_get', true, false);
                    this.updateStats('persistent_hit');
                    this.checkSLA('response_time', CacheLayer.PERSISTENT, Date.now() - startTime);
                    return value;
                }
            }

            // Cache miss in all layers
            this.performanceMonitor.endTimer(timerId, 'cache_get', true, false);
            this.updateStats('miss');
            return null;

        } catch (error) {
            this.performanceMonitor.endTimer(timerId, 'cache_get', false, false);
            this.logger.error('Cache get error:', error);
            return null;
        }
    }

    /**
     * Set value in cache with layer orchestration
     */
    async set(key: string, data: T, ttl?: number): Promise<void> {
        const timerId = this.performanceMonitor.startTimer('cache_set');

        try {
            // Set in memory cache
            this.memoryCache.set(key, data, ttl || this.config.memoryCache.ttl);

            // Set in persistent cache
            if (this.persistentCache) {
                await this.persistentCache.set(key, data, ttl || this.config.persistentCache.ttl);
            }

            this.performanceMonitor.endTimer(timerId, 'cache_set', true);
        } catch (error) {
            this.performanceMonitor.endTimer(timerId, 'cache_set', false);
            this.logger.error('Cache set error:', error);
        }
    }

    /**
     * Delete value from all cache layers
     */
    async delete(key: string): Promise<boolean> {
        const memoryDeleted = this.memoryCache.delete(key);
        let persistentDeleted = true;

        if (this.persistentCache) {
            const result = await this.persistentCache.delete(key);
            persistentDeleted = result.success;
        }

        this.origins.delete(key);
        return memoryDeleted && persistentDeleted;
    }

    /**
     * Check if key exists in any cache layer
     */
    async has(key: string): Promise<boolean> {
        // Check memory first (fastest)
        if (this.memoryCache.has(key)) {
            return true;
        }

        // Check persistent cache
        if (this.persistentCache) {
            const result = await this.persistentCache.has(key);
            return result.success && result.exists;
        }

        return false;
    }

    /**
     * Clear all cache layers
     */
    async clear(): Promise<void> {
        this.memoryCache.clear();

        if (this.persistentCache) {
            await this.persistentCache.clear();
        }

        this.origins.clear();
        this.slaViolations = [];
    }

    /**
     * Get comprehensive cache statistics
     */
    getStats(): PerformanceCacheStats {
        const memoryStats = this.memoryCache.getMetrics();

        // Update combined statistics
        const totalHits = memoryStats.hits + this.stats.persistent.hits;
        const totalMisses = memoryStats.misses + this.stats.persistent.misses;
        const overallHitRate = (totalHits + totalMisses) > 0 ?
            (totalHits / (totalHits + totalMisses)) * 100 : 0;

        return {
            memory: memoryStats,
            persistent: this.stats.persistent,
            combined: {
                totalHits,
                totalMisses,
                overallHitRate: Math.round(overallHitRate * 100) / 100,
                averageResponseTime: this.stats.combined.averageResponseTime,
                totalMemoryUsage: memoryStats.memoryUsage
            },
            sla: {
                violations: [...this.slaViolations],
                complianceRate: this.calculateSLACompliance(),
                lastViolation: this.stats.sla.lastViolation
            }
        };
    }

    /**
     * Warm up cache with critical standards
     */
    async warmupCriticalStandards(criticalKeys: string[], dataProvider: (key: string) => Promise<T>): Promise<void> {
        const timerId = this.performanceMonitor.startTimer('cache_warmup');
        const startTime = Date.now();

        try {
            const warmupPromises = criticalKeys.map(async (key) => {
                try {
                    // Check if already cached
                    if (await this.has(key)) {
                        return;
                    }

                    // Load data and cache it
                    const data = await dataProvider(key);
                    if (data) {
                        await this.set(key, data);
                    }
                } catch (error) {
                    this.logger.warn(`Failed to warm up cache for key ${key}:`, error);
                }
            });

            await Promise.all(warmupPromises);

            const warmupTime = Date.now() - startTime;
            this.performanceMonitor.endTimer(timerId, 'cache_warmup', true);

            // Check if warmup meets SLA requirements
            if (warmupTime > 200) { // 200ms target
                this.recordSLAViolation({
                    type: 'response_time',
                    layer: CacheLayer.MEMORY,
                    actualValue: warmupTime,
                    targetValue: 200,
                    timestamp: Date.now(),
                    severity: 'medium'
                });
            }

        } catch (error) {
            this.performanceMonitor.endTimer(timerId, 'cache_warmup', false);
            this.logger.error('Cache warmup failed:', error);
        }
    }

    /**
     * Optimize cache performance based on usage patterns
     */
    async optimize(): Promise<void> {
        // Force memory cleanup if under pressure
        const memoryPressure = this.memoryCache.getMemoryPressureLevel();
        if (memoryPressure !== MemoryPressureLevel.NONE) {
            this.memoryCache.forceEviction();
        }

        // Cleanup expired entries
        this.memoryCache.cleanup();

        // Cleanup persistent cache
        if (this.persistentCache) {
            await this.persistentCache.cleanup();
        }

        // Check SLA compliance
        this.checkAllSLAs();
    }

    /**
     * Get cache entry origin information
     */
    getOrigin(key: string): CacheOrigin | null {
        return this.origins.get(key) || null;
    }

    /**
     * Destroy cache and cleanup resources
     */
    async destroy(): Promise<void> {
        this.memoryCache.destroy();

        if (this.persistentCache) {
            await this.persistentCache.close();
        }

        this.origins.clear();
        this.slaViolations = [];
    }

    /**
     * Merge configuration with defaults
     */
    private mergeConfig(config: Partial<PerformanceCacheConfig>): PerformanceCacheConfig {
        return {
            memoryCache: {
                maxSize: 1000,
                memoryLimit: 50 * 1024 * 1024, // 50MB
                ttl: 5 * 60 * 1000, // 5 minutes
                ...config.memoryCache
            },
            persistentCache: {
                enabled: true,
                maxSize: 10000,
                ttl: 60 * 60 * 1000, // 1 hour
                ...config.persistentCache
            },
            performanceTargets: {
                maxMemoryResponseTime: 30, // 30ms
                maxPersistentResponseTime: 100, // 100ms
                minCacheHitRate: 80, // 80%
                maxMemoryUsage: 50 * 1024 * 1024, // 50MB
                ...config.performanceTargets
            },
            slaMonitoring: {
                enabled: true,
                violationThreshold: 5, // 5% of requests can violate SLA
                monitoringWindow: 5 * 60 * 1000, // 5 minutes
                ...config.slaMonitoring
            }
        };
    }

    /**
     * Record cache entry origin
     */
    private recordOrigin(key: string, layer: CacheLayer, hitTime: number): void {
        this.origins.set(key, {
            layer,
            timestamp: Date.now(),
            hitTime
        });
    }

    /**
     * Update cache statistics
     */
    private updateStats(type: 'memory_hit' | 'persistent_hit' | 'miss'): void {
        switch (type) {
            case 'memory_hit':
                // Memory cache handles its own stats
                break;
            case 'persistent_hit':
                this.stats.persistent.hits++;
                break;
            case 'miss':
                this.stats.persistent.misses++;
                break;
        }

        // Update persistent cache hit rate
        const totalPersistent = this.stats.persistent.hits + this.stats.persistent.misses;
        this.stats.persistent.hitRate = totalPersistent > 0 ?
            (this.stats.persistent.hits / totalPersistent) * 100 : 0;
    }

    /**
     * Check SLA compliance for response times
     */
    private checkSLA(type: 'response_time' | 'hit_rate' | 'memory_usage',
                    layer: CacheLayer, actualValue: number): void {
        if (!this.config.slaMonitoring.enabled) return;

        let targetValue: number;
        switch (type) {
            case 'response_time':
                targetValue = layer === CacheLayer.MEMORY ?
                    this.config.performanceTargets.maxMemoryResponseTime :
                    this.config.performanceTargets.maxPersistentResponseTime;
                break;
            case 'hit_rate':
                targetValue = this.config.performanceTargets.minCacheHitRate;
                break;
            case 'memory_usage':
                targetValue = this.config.performanceTargets.maxMemoryUsage;
                break;
        }

        if (actualValue > targetValue) {
            this.recordSLAViolation({
                type,
                layer,
                actualValue,
                targetValue,
                timestamp: Date.now(),
                severity: this.calculateSeverity(actualValue, targetValue)
            });
        }
    }

    /**
     * Check all SLA metrics
     */
    private checkAllSLAs(): void {
        const stats = this.getStats();

        // Check hit rate
        this.checkSLA('hit_rate', CacheLayer.MEMORY, stats.combined.overallHitRate);

        // Check memory usage
        this.checkSLA('memory_usage', CacheLayer.MEMORY, stats.combined.totalMemoryUsage);
    }

    /**
     * Record SLA violation
     */
    private recordSLAViolation(violation: SLAViolation): void {
        this.slaViolations.push(violation);
        this.stats.sla.lastViolation = violation.timestamp;

        // Keep only recent violations (within monitoring window)
        const cutoff = Date.now() - this.config.slaMonitoring.monitoringWindow;
        this.slaViolations = this.slaViolations.filter(v => v.timestamp > cutoff);

        // Log violation
        this.logger.warn(`SLA Violation: ${violation.type} for ${violation.layer} - ` +
                    `Actual: ${violation.actualValue}, Target: ${violation.targetValue}`);
    }

    /**
     * Calculate violation severity
     */
    private calculateSeverity(actual: number, target: number): 'low' | 'medium' | 'high' | 'critical' {
        const ratio = actual / target;
        if (ratio >= 3) return 'critical';
        if (ratio >= 2) return 'high';
        if (ratio >= 1.5) return 'medium';
        return 'low';
    }

    /**
     * Calculate SLA compliance rate
     */
    private calculateSLACompliance(): number {
        const recentViolations = this.slaViolations.filter(
            v => Date.now() - v.timestamp < this.config.slaMonitoring.monitoringWindow
        );

        // Simple compliance calculation based on number of violations
        const maxAllowedViolations = 10; // Arbitrary threshold
        const compliance = Math.max(0, 100 - (recentViolations.length / maxAllowedViolations) * 100);

        return Math.round(compliance * 100) / 100;
    }
}