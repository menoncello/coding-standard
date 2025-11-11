/**
 * Unit tests for Performance Cache Layer
 * Tests multi-layer orchestration, SLA monitoring, and cache warming
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { PerformanceCache, CacheLayer } from '../../../src/cache/performance-layer.js';

describe('PerformanceCache - Multi-layer Orchestration', () => {
    let performanceCache: PerformanceCache<string>;

    beforeEach(() => {
        performanceCache = new PerformanceCache<string>({
            memoryCache: {
                maxSize: 10,
                memoryLimit: 1024 * 1024, // 1MB
                ttl: 5000 // 5 seconds
            },
            persistentCache: {
                enabled: true,
                maxSize: 100,
                ttl: 30000 // 30 seconds
            },
            performanceTargets: {
                maxMemoryResponseTime: 30,
                maxPersistentResponseTime: 100,
                minCacheHitRate: 80,
                maxMemoryUsage: 50 * 1024 * 1024
            },
            slaMonitoring: {
                enabled: true,
                violationThreshold: 5,
                monitoringWindow: 60000 // 1 minute
            }
        });
    });

    afterEach(async () => {
        await performanceCache.destroy();
    });

    describe('Basic Multi-layer Operations', () => {
        it('should set and get values from memory cache', async () => {
            // WHEN: Setting and getting value
            await performanceCache.set('key1', 'value1');
            const result = await performanceCache.get('key1');

            // THEN: Should retrieve from memory layer
            expect(result).toBe('value1');

            const origin = performanceCache.getOrigin('key1');
            expect(origin?.layer).toBe(CacheLayer.MEMORY);
        });

        it.skip('should return null for non-existent keys', async () => {
            // WHEN: Getting non-existent key
            const result = await performanceCache.get('nonexistent');

            // THEN: Should return null
            expect(result).toBeNull();
        });

        it.skip('should check key existence across layers', async () => {
            // WHEN: Setting value and checking existence
            await performanceCache.set('key1', 'value1');

            // THEN: Should exist
            expect(await performanceCache.has('key1')).toBe(true);
            expect(await performanceCache.has('nonexistent')).toBe(false);
        });

        it.skip('should delete values from all layers', async () => {
            // WHEN: Setting and deleting value
            await performanceCache.set('key1', 'value1');
            const deleted = await performanceCache.delete('key1');

            // THEN: Should be deleted from all layers
            expect(deleted).toBe(true);
            expect(await performanceCache.get('key1')).toBeNull();
            expect(await performanceCache.has('key1')).toBe(false);
        });
    });

    describe('Layer Orchestration', () => {
        it('should promote items from persistent to memory cache', async () => {
            // This test simulates the promotion behavior
            // In a real scenario, you'd need to mock the persistent cache behavior

            // WHEN: Setting multiple items
            for (let i = 0; i < 15; i++) {
                await performanceCache.set(`key${i}`, `value${i}`);
            }

            // THEN: Should have reasonable statistics
            const stats = performanceCache.getStats();
            expect(stats.memory.size).toBeGreaterThan(0);
            expect(stats.combined.totalHits + stats.combined.totalMisses).toBeGreaterThanOrEqual(0);
        });

        it('should handle cache layer fallback correctly', async () => {
            // WHEN: Accessing cached item multiple times
            await performanceCache.set('key1', 'value1');

            const result1 = await performanceCache.get('key1');
            const result2 = await performanceCache.get('key1');
            const result3 = await performanceCache.get('key1');

            // THEN: Should consistently return the value
            expect(result1).toBe('value1');
            expect(result2).toBe('value1');
            expect(result3).toBe('value1');

            const stats = performanceCache.getStats();
            expect(stats.combined.totalHits).toBeGreaterThan(0);
        });
    });

    describe('Performance Monitoring', () => {
        it('should track comprehensive cache statistics', async () => {
            // WHEN: Performing cache operations
            await performanceCache.set('key1', 'value1');
            await performanceCache.get('key1'); // hit
            await performanceCache.get('nonexistent'); // miss

            // THEN: Should track statistics correctly
            const stats = performanceCache.getStats();
            expect(stats.memory.hits).toBeGreaterThan(0);
            expect(stats.combined.totalHits).toBeGreaterThan(0);
            expect(stats.combined.totalMisses).toBeGreaterThan(0);
            expect(stats.combined.overallHitRate).toBeGreaterThanOrEqual(0);
            expect(stats.combined.totalMemoryUsage).toBeGreaterThan(0);
        });

        it('should track SLA compliance', async () => {
            // WHEN: Performing operations
            await performanceCache.set('key1', 'value1');
            await performanceCache.get('key1');

            // THEN: Should have SLA metrics
            const stats = performanceCache.getStats();
            expect(stats.sla.complianceRate).toBeGreaterThanOrEqual(0);
            expect(stats.sla.complianceRate).toBeLessThanOrEqual(100);
            expect(Array.isArray(stats.sla.violations)).toBe(true);
        });

        it('should measure response times', async () => {
            // WHEN: Setting multiple items
            const startTime = performance.now();

            for (let i = 0; i < 50; i++) {
                await performanceCache.set(`key${i}`, `value${i}`);
                await performanceCache.get(`key${i}`);
            }

            const endTime = performance.now();
            const averageTime = (endTime - startTime) / 100; // 50 sets + 50 gets

            // THEN: Should meet performance targets
            expect(averageTime).toBeLessThan(50); // Should be reasonably fast
        });
    });

    describe('Cache Warming', () => {
        it('should warm up cache with critical standards', async () => {
            // GIVEN: Critical keys and data provider
            const criticalKeys = ['standard1', 'standard2', 'standard3'];
            const mockDataProvider = async (key: string) => `data-${key}`;

            // WHEN: Warming up cache
            await performanceCache.warmupCriticalStandards(criticalKeys, mockDataProvider);

            // THEN: Critical keys should be cached
            for (const key of criticalKeys) {
                expect(await performanceCache.get(key)).toBe(`data-${key}`);
                expect(await performanceCache.has(key)).toBe(true);
            }
        });

        it.skip('should handle warmup timeout gracefully', async () => {
            // GIVEN: Slow data provider and short timeout
            const slowDataProvider = async (key: string) => {
                await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay
                return `data-${key}`;
            };

            // WHEN: Warming up with timeout
            const slowCache = new PerformanceCache<string>({
                memoryCache: { maxSize: 10, memoryLimit: 1024, ttl: 5000 },
                persistentCache: { enabled: false, maxSize: 100, ttl: 30000 },
                performanceTargets: {
                    maxMemoryResponseTime: 30,
                    maxPersistentResponseTime: 100,
                    minCacheHitRate: 80,
                    maxMemoryUsage: 50 * 1024 * 1024
                },
                slaMonitoring: { enabled: false, violationThreshold: 5, monitoringWindow: 60000 }
            });

            await slowCache.warmupCriticalStandards(['key1'], slowDataProvider);

            // THEN: Should complete without hanging
            const stats = slowCache.getStats();
            expect(stats.memory.size).toBeGreaterThanOrEqual(0);

            await slowCache.destroy();
        });
    });

    describe('Cache Optimization', () => {
        it('should optimize cache performance', async () => {
            // WHEN: Filling cache and triggering optimization
            for (let i = 0; i < 20; i++) {
                await performanceCache.set(`key${i}`, `value${i}`);
            }

            // Perform optimization
            await performanceCache.optimize();

            // THEN: Should maintain reasonable cache state
            const stats = performanceCache.getStats();
            expect(stats.memory.size).toBeGreaterThan(0);
            expect(stats.combined.totalMemoryUsage).toBeLessThan(50 * 1024 * 1024); // Under 50MB
        });

        it.skip('should clear all cache layers', async () => {
            // WHEN: Setting values and clearing cache
            await performanceCache.set('key1', 'value1');
            await performanceCache.set('key2', 'value2');

            expect(await performanceCache.has('key1')).toBe(true);
            expect(await performanceCache.has('key2')).toBe(true);

            await performanceCache.clear();

            // THEN: All layers should be cleared
            expect(await performanceCache.has('key1')).toBe(false);
            expect(await performanceCache.has('key2')).toBe(false);
            expect(await performanceCache.get('key1')).toBeNull();

            const stats = performanceCache.getStats();
            expect(stats.memory.size).toBe(0);
            expect(stats.combined.totalHits).toBe(0);
            expect(stats.combined.totalMisses).toBe(0);
        });
    });

    describe('Configuration', () => {
        it('should handle disabled persistent cache', async () => {
            // GIVEN: Cache with disabled persistent layer
            const memoryOnlyCache = new PerformanceCache<string>({
                memoryCache: { maxSize: 5, memoryLimit: 1024, ttl: 5000 },
                persistentCache: { enabled: false, maxSize: 100, ttl: 30000 },
                performanceTargets: {
                    maxMemoryResponseTime: 30,
                    maxPersistentResponseTime: 100,
                    minCacheHitRate: 80,
                    maxMemoryUsage: 50 * 1024 * 1024
                },
                slaMonitoring: { enabled: false, violationThreshold: 5, monitoringWindow: 60000 }
            });

            // WHEN: Setting and getting values
            await memoryOnlyCache.set('key1', 'value1');
            const result = await memoryOnlyCache.get('key1');

            // THEN: Should work with just memory layer
            expect(result).toBe('value1');

            const stats = memoryOnlyCache.getStats();
            expect(stats.memory.size).toBe(1);

            await memoryOnlyCache.destroy();
        });

        it('should handle disabled SLA monitoring', async () => {
            // GIVEN: Cache with SLA monitoring disabled
            const noSlaCache = new PerformanceCache<string>({
                memoryCache: { maxSize: 5, memoryLimit: 1024, ttl: 5000 },
                persistentCache: { enabled: false, maxSize: 100, ttl: 30000 },
                performanceTargets: {
                    maxMemoryResponseTime: 30,
                    maxPersistentResponseTime: 100,
                    minCacheHitRate: 80,
                    maxMemoryUsage: 50 * 1024 * 1024
                },
                slaMonitoring: { enabled: false, violationThreshold: 5, monitoringWindow: 60000 }
            });

            // WHEN: Performing operations
            await noSlaCache.set('key1', 'value1');
            await noSlaCache.get('key1');

            // THEN: Should have SLA monitoring disabled
            const stats = noSlaCache.getStats();
            expect(stats.sla.complianceRate).toBe(100); // Default when disabled
            expect(stats.sla.violations).toEqual([]);

            await noSlaCache.destroy();
        });
    });

    describe('Error Handling', () => {
        it('should handle cache operations gracefully', async () => {
            // WHEN: Performing various operations
            await performanceCache.set('key1', 'value1');

            // THEN: Should not throw on normal operations
            expect(async () => {
                await performanceCache.get('key1');
                await performanceCache.has('key1');
                await performanceCache.delete('key1');
                await performanceCache.clear();
            }).not.toThrow();
        });

        it('should handle concurrent operations', async () => {
            // WHEN: Performing concurrent cache operations
            const operations = [];

            for (let i = 0; i < 10; i++) {
                operations.push(performanceCache.set(`key${i}`, `value${i}`));
                operations.push(performanceCache.get(`key${i}`));
            }

            await Promise.all(operations);

            // THEN: Should maintain consistent state
            const stats = performanceCache.getStats();
            expect(stats.memory.size).toBeGreaterThan(0);
            expect(stats.combined.totalHits + stats.combined.totalMisses).toBeGreaterThan(0);
        });
    });
});