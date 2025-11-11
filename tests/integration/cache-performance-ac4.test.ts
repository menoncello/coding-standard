import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { PerformanceCache } from '../../src/cache/performance-layer.js';
import { createStandards } from '../support/factories/standard-factory.js';

describe('Caching and Performance Layer - Story 1.3 AC4: Cache Warm-up', () => {
    let performanceCache: PerformanceCache<any>;
    let testStandards: any[];

    beforeEach(async () => {
        // GIVEN: A fresh performance cache instance for each test
        performanceCache = new PerformanceCache({
            memoryCache: {
                maxSize: 1000,
                memoryLimit: 50 * 1024 * 1024, // 50MB
                ttl: 300000 // 5 minutes
            },
            persistentCache: {
                enabled: true,
                maxSize: 5000,
                ttl: 600000 // 10 minutes
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
                monitoringWindow: 60000
            }
        });

        testStandards = createStandards(10);
    });

    afterEach(async () => {
        await performanceCache?.destroy();
    });

    test('1.3-AC4-001: should complete warm-up within 200ms with critical standards pre-loaded', async () => {
        // GIVEN: Critical standards identified for warm-up
        const criticalStandards = createStandards(5);

        // WHEN: Initializing performance cache with cold cache and warm-up requirements
        const startTime = performance.now();

        const warmupEnabled = new PerformanceCache({
            memoryCache: {
                maxSize: 100,
                memoryLimit: 1024 * 1024,
                ttl: 300000
            },
            persistentCache: {
                enabled: false,
                maxSize: 0,
                ttl: 0
            },
            performanceTargets: {
                maxMemoryResponseTime: 30,
                maxPersistentResponseTime: 100,
                minCacheHitRate: 80,
                maxMemoryUsage: 1024 * 1024
            },
            slaMonitoring: {
                enabled: false,
                violationThreshold: 5,
                monitoringWindow: 60000
            }
        });

        // Create a data provider for warmup
        const dataProvider = async (key: string) => {
            // Parse the key to extract standard info and return matching standard
            const keyParts = key.split(':');
            if (keyParts.length >= 4 && keyParts[0] === 'standards') {
                const technology = keyParts[1];
                const category = keyParts[2];
                const id = keyParts[3];
                return criticalStandards.find(s => s.technology === technology && s.category === category && s.id === id);
            }
            return null;
        };

        // Trigger warm-up process
        const criticalKeys = criticalStandards.map(s => `standards:${s.technology}:${s.category}:${s.id}`);
        await warmupEnabled.warmupCriticalStandards(criticalKeys, dataProvider);

        const warmupTime = performance.now() - startTime;

        // THEN: Warm-up should complete within 200ms with critical standards cached
        expect(warmupTime).toBeLessThan(200);

        // Verify critical standards are pre-loaded
        for (const standard of criticalStandards) {
            const cacheKey = `standards:${standard.technology}:${standard.category}:${standard.id}`;
            const result = await warmupEnabled.get(cacheKey);
            expect(result).toEqual(standard);
        }

        await warmupEnabled.destroy();
    });

    test('1.3-AC4-002: should handle warm-up failures gracefully and report partial success', async () => {
        // GIVEN: Valid standards for warm-up
        const validStandards = createStandards(3);
        const criticalKeys = validStandards.map(s => `standards:${s.technology}:${s.category}:${s.id}`);

        // WHEN: Attempting warm-up with some keys that might fail
        const gracefulWarmup = new PerformanceCache({
            memoryCache: {
                maxSize: 100,
                memoryLimit: 1024 * 1024,
                ttl: 300000
            },
            persistentCache: {
                enabled: false,
                maxSize: 0,
                ttl: 0
            },
            performanceTargets: {
                maxMemoryResponseTime: 30,
                maxPersistentResponseTime: 100,
                minCacheHitRate: 80,
                maxMemoryUsage: 1024 * 1024
            },
            slaMonitoring: {
                enabled: false,
                violationThreshold: 5,
                monitoringWindow: 60000
            }
        });

        // Create a data provider that simulates some failures
        const dataProvider = async (key: string) => {
            const keyParts = key.split(':');
            if (keyParts.length >= 4 && keyParts[0] === 'standards') {
                const technology = keyParts[1];
                const category = keyParts[2];
                const id = keyParts[3];

                // Simulate some keys failing to load
                if (id.includes('invalid')) {
                    throw new Error(`Failed to load data for key: ${key}`);
                }

                return validStandards.find(s => s.technology === technology && s.category === category && s.id === id);
            }
            return null;
        };

        const startTime = performance.now();

        // Warmup should handle failures gracefully
        await gracefulWarmup.warmupCriticalStandards(criticalKeys, dataProvider);

        const warmupTime = performance.now() - startTime;

        // THEN: Should handle failures gracefully and complete within timeout
        expect(warmupTime).toBeLessThan(200);

        // Valid standards should be cached
        for (const standard of validStandards) {
            const cacheKey = `standards:${standard.technology}:${standard.category}:${standard.id}`;
            const result = await gracefulWarmup.get(cacheKey);
            expect(result).toEqual(standard);
        }

        await gracefulWarmup.destroy();
    });
});