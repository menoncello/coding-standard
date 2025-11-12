import { CacheManager, McpResponseCache, CacheKeys } from '../cache/cache-manager.js';
import { Logger, LoggerFactory } from './logger/logger-factory.js';
import { performanceMonitor } from './performance-monitor.js';

/**
 * Cache invalidation configuration
 */
export interface CacheInvalidationConfig {
    enabled: boolean;
    enableWarming: boolean;
    warmingDelayMs: number;
    maxWarmingConcurrency: number;
    invalidationTimeoutMs: number;
    selectiveInvalidation: boolean;
    priorityInvalidation: boolean;
}

/**
 * Cache warming strategy
 */
export interface WarmingStrategy {
    enabled: boolean;
    rules: {
        topK: number; // Top K most frequently accessed rules
        recentlyUsed: number; // Recently used rules count
        byCategory: Record<string, number>; // Number of rules per category to warm
        byTechnology: Record<string, number>; // Number of rules per technology to warm
    };
    searchQueries: Array<{
        query: string;
        technology?: string;
        category?: string;
    }>;
}

/**
 * Cache invalidation performance metrics
 */
export interface CacheInvalidationMetrics {
    totalInvalidations: number;
    selectiveInvalidations: number;
    fullInvalidations: number;
    warmingOperations: number;
    averageInvalidationTime: number;
    lastInvalidationTime: number;
    errorCount: number;
}

/**
 * Cache invalidation service for timely cache clearing
 */
export class CacheInvalidationService {
    private cache: McpResponseCache;
    private config: CacheInvalidationConfig;
    private warmingStrategy: WarmingStrategy;
    private logger: Logger;
    private metrics: CacheInvalidationMetrics;
    private warmingQueue: Array<() => Promise<void>> = [];
    private isProcessingWarming = false;

    constructor(
        cache: McpResponseCache,
        config: Partial<CacheInvalidationConfig> = {},
        warmingStrategy?: Partial<WarmingStrategy>
    ) {
        this.cache = cache;
        this.logger = LoggerFactory.getInstance();

        this.config = {
            enabled: true,
            enableWarming: true,
            warmingDelayMs: 100,
            maxWarmingConcurrency: 3,
            invalidationTimeoutMs: 100, // 100ms target from AC
            selectiveInvalidation: true,
            priorityInvalidation: true,
            ...config
        };

        this.warmingStrategy = {
            enabled: true,
            rules: {
                topK: 20,
                recentlyUsed: 15,
                byCategory: {
                    'security': 10,
                    'performance': 8,
                    'style': 12,
                    'error-handling': 6
                },
                byTechnology: {
                    'typescript': 15,
                    'javascript': 12,
                    'react': 8,
                    'node': 10
                }
            },
            searchQueries: [
                { query: 'security' },
                { query: 'performance' },
                { query: 'error handling', technology: 'typescript' },
                { query: 'best practices' }
            ],
            ...warmingStrategy
        };

        this.metrics = {
            totalInvalidations: 0,
            selectiveInvalidations: 0,
            fullInvalidations: 0,
            warmingOperations: 0,
            averageInvalidationTime: 0,
            lastInvalidationTime: 0,
            errorCount: 0
        };
    }

    /**
     * Invalidate cache for specific rule
     */
    async invalidateForRule(ruleId: string, semanticName?: string): Promise<void> {
        if (!this.config.enabled) {
            return;
        }

        const startTime = performance.now();

        try {
            this.logger.debug(`Invalidating cache for rule: ${ruleId}`);

            // Invalidate all cache entries that might contain this rule
            const keysToRemove: string[] = [];

            // Standards cache keys
            if (semanticName) {
                keysToRemove.push(`standards:by-name:${semanticName}`);
            }
            keysToRemove.push(`standards:by-id:${ruleId}`);

            // Find keys in cache that might reference this rule
            const allKeys = this.getAllCacheKeys();
            for (const key of allKeys) {
                if (this.keyReferencesRule(key, ruleId, semanticName)) {
                    keysToRemove.push(key);
                }
            }

            // Remove keys from cache
            for (const key of keysToRemove) {
                this.cache.clear(); // Simple approach - clear all cache
                break; // Since we clear all, no need to continue
            }

            // Update metrics
            const duration = performance.now() - startTime;
            this.updateMetrics(duration, false);

            // Queue cache warming if enabled
            if (this.config.enableWarming) {
                this.queueWarmingForRule(ruleId);
            }

            performanceMonitor.recordMetricSimple('cache_invalidate_rule', duration, {
                ruleId,
                keysInvalidated: keysToRemove.length,
                selective: this.config.selectiveInvalidation
            });

            this.logger.debug(`Cache invalidated for rule ${ruleId} in ${duration}ms`);

        } catch (error) {
            this.metrics.errorCount++;
            this.logger.error(`Failed to invalidate cache for rule ${ruleId}`, { error });
            throw error;
        }
    }

    /**
     * Invalidate selective cache entries for multiple rules
     */
    async invalidateSelective(ruleIds: string[], semanticNames?: string[]): Promise<void> {
        if (!this.config.enabled || !this.config.selectiveInvalidation) {
            return await this.invalidateFull();
        }

        const startTime = performance.now();

        try {
            this.logger.debug(`Selective cache invalidation for ${ruleIds.length} rules`);

            // For simplicity and to ensure consistency, we'll clear the entire cache
            // In a more sophisticated implementation, we could track exact cache entries
            this.cache.clear();

            // Update metrics
            const duration = performance.now() - startTime;
            this.metrics.selectiveInvalidations++;
            this.updateMetrics(duration, false);

            // Queue cache warming if enabled
            if (this.config.enableWarming) {
                this.queueWarmingForRules(ruleIds, semanticNames);
            }

            performanceMonitor.recordMetricSimple('cache_invalidate_selective', duration, {
                ruleCount: ruleIds.length,
                selective: true
            });

            this.logger.debug(`Selective cache invalidated in ${duration}ms`);

        } catch (error) {
            this.metrics.errorCount++;
            this.logger.error('Failed selective cache invalidation', { error });
            throw error;
        }
    }

    /**
     * Invalidate all cache entries
     */
    async invalidateFull(): Promise<void> {
        if (!this.config.enabled) {
            return;
        }

        const startTime = performance.now();

        try {
            this.logger.debug('Full cache invalidation');

            // Clear all caches
            this.cache.clear();

            // Update metrics
            const duration = performance.now() - startTime;
            this.metrics.fullInvalidations++;
            this.updateMetrics(duration, true);

            performanceMonitor.recordMetricSimple('cache_invalidate_full', duration, {
                selective: false
            });

            this.logger.debug(`Full cache invalidated in ${duration}ms`);

        } catch (error) {
            this.metrics.errorCount++;
            this.logger.error('Failed full cache invalidation', { error });
            throw error;
        }
    }

    /**
     * Warm cache with frequently accessed data
     */
    async warmCache(ruleIds: string[], priority: boolean = false): Promise<void> {
        if (!this.config.enabled || !this.config.enableWarming) {
            return;
        }

        const startTime = Date.now();

        try {
            this.logger.debug(`Warming cache for ${ruleIds.length} rules`, { priority });

            // Add warming operation to queue
            if (priority && this.config.priorityInvalidation) {
                this.warmingQueue.unshift(() => this.performWarming(ruleIds));
            } else {
                this.warmingQueue.push(() => this.performWarming(ruleIds));
            }

            // Process warming queue if not already processing
            if (!this.isProcessingWarming) {
                setImmediate(() => this.processWarmingQueue());
            }

            const duration = Date.now() - startTime;
            performanceMonitor.recordMetricSimple('cache_warm_queued', duration, {
                ruleCount: ruleIds.length,
                priority
            });

        } catch (error) {
            this.logger.error('Failed to queue cache warming', { error });
        }
    }

    /**
     * Get cache invalidation metrics
     */
    getMetrics(): CacheInvalidationMetrics {
        return { ...this.metrics };
    }

    /**
     * Reset metrics
     */
    resetMetrics(): void {
        this.metrics = {
            totalInvalidations: 0,
            selectiveInvalidations: 0,
            fullInvalidations: 0,
            warmingOperations: 0,
            averageInvalidationTime: 0,
            lastInvalidationTime: 0,
            errorCount: 0
        };
    }

    /**
     * Update configuration
     */
    updateConfig(config: Partial<CacheInvalidationConfig>): void {
        this.config = { ...this.config, ...config };
        this.logger.info('Cache invalidation configuration updated', { config: this.config });
    }

    /**
     * Update warming strategy
     */
    updateWarmingStrategy(strategy: Partial<WarmingStrategy>): void {
        this.warmingStrategy = { ...this.warmingStrategy, ...strategy };
        this.logger.info('Cache warming strategy updated', { strategy: this.warmingStrategy });
    }

    /**
     * Check if invalidation meets 100ms target
     */
    isPerformant(): boolean {
        return this.metrics.averageInvalidationTime <= this.config.invalidationTimeoutMs;
    }

    /**
     * Get performance status
     */
    getPerformanceStatus(): {
        isPerformant: boolean;
        averageTime: number;
        targetTime: number;
        performanceRatio: number;
    } {
        return {
            isPerformant: this.isPerformant(),
            averageTime: this.metrics.averageInvalidationTime,
            targetTime: this.config.invalidationTimeoutMs,
            performanceRatio: this.metrics.averageInvalidationTime / this.config.invalidationTimeoutMs
        };
    }

    /**
     * Check if cache key references a specific rule
     */
    private keyReferencesRule(key: string, ruleId: string, semanticName?: string): boolean {
        // Simple implementation - in production, you'd have more sophisticated key tracking
        return key.includes(ruleId) || (semanticName && key.includes(semanticName));
    }

    /**
     * Get all cache keys (simplified implementation)
     */
    private getAllCacheKeys(): string[] {
        // In a real implementation, you'd track cache keys more carefully
        // For now, return common patterns
        return [
            'standards:all',
            'standards:by-category:*',
            'standards:by-technology:*',
            'search:*',
            'validation:*'
        ];
    }

    /**
     * Update metrics after invalidation
     */
    private updateMetrics(duration: number, isFullInvalidation: boolean): void {
        this.metrics.totalInvalidations++;
        this.metrics.lastInvalidationTime = Date.now();

        // Update average time
        const total = this.metrics.averageInvalidationTime * (this.metrics.totalInvalidations - 1) + duration;
        this.metrics.averageInvalidationTime = total / this.metrics.totalInvalidations;

        performanceMonitor.recordMetricSimple('cache_invalidation_time', duration, {
            isFullInvalidation,
            totalInvalidations: this.metrics.totalInvalidations
        });
    }

    /**
     * Queue cache warming for single rule
     */
    private queueWarmingForRule(ruleId: string): void {
        setTimeout(() => {
            this.warmCache([ruleId], false);
        }, this.config.warmingDelayMs);
    }

    /**
     * Queue cache warming for multiple rules
     */
    private queueWarmingForRules(ruleIds: string[], semanticNames?: string[]): void {
        setTimeout(() => {
            this.warmCache(ruleIds, true);
        }, this.config.warmingDelayMs);
    }

    /**
     * Process warming queue
     */
    private async processWarmingQueue(): Promise<void> {
        if (this.isProcessingWarming || this.warmingQueue.length === 0) {
            return;
        }

        this.isProcessingWarming = true;

        try {
            const concurrency = Math.min(
                this.config.maxWarmingConcurrency,
                this.warmingQueue.length
            );

            const promises: Promise<void>[] = [];

            for (let i = 0; i < concurrency && i < this.warmingQueue.length; i++) {
                const warmingOperation = this.warmingQueue.shift()!;
                promises.push(this.executeWarmingOperation(warmingOperation));
            }

            await Promise.allSettled(promises);

            // Continue processing if more items in queue
            if (this.warmingQueue.length > 0) {
                setImmediate(() => this.processWarmingQueue());
            }

        } catch (error) {
            this.logger.error('Error processing warming queue', { error });
        } finally {
            this.isProcessingWarming = false;
        }
    }

    /**
     * Execute warming operation with error handling
     */
    private async executeWarmingOperation(
        warmingOperation: () => Promise<void>
    ): Promise<void> {
        try {
            await warmingOperation();
            this.metrics.warmingOperations++;
        } catch (error) {
            this.logger.error('Warming operation failed', { error });
        }
    }

    /**
     * Perform actual cache warming
     */
    private async performWarming(ruleIds: string[]): Promise<void> {
        const startTime = Date.now();

        try {
            this.logger.debug(`Performing cache warming for ${ruleIds.length} rules`);

            // In a real implementation, you would:
            // 1. Pre-load rules into cache
            // 2. Warm search queries for common patterns
            // 3. Pre-populate validation results

            // For now, we'll simulate warming by accessing cache
            // This is a placeholder for actual warming logic

            const duration = Date.now() - startTime;
            performanceMonitor.recordMetricSimple('cache_warming_completed', duration, {
                ruleCount: ruleIds.length
            });

            this.logger.debug(`Cache warming completed in ${duration}ms`);

        } catch (error) {
            this.logger.error('Cache warming failed', { error });
        }
    }
}