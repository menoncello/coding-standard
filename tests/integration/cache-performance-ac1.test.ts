import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { PerformanceCache } from '../../src/cache/performance-layer.js';
import { createStandards } from '../support/factories/standard-factory.js';

describe('Caching and Performance Layer - Story 1.3 AC1: Performance Target', () => {
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

    test('1.3-AC1-001: should respond under 30ms for cached standards with >80% hit rate', async () => {
        // GIVEN: Standard is cached and performance cache is initialized
        const standard = testStandards[0];
        const cacheKey = `standards:${standard.technology}:${standard.category}:${standard.id}`;

        // First, cache the standard
        await performanceCache.set(cacheKey, standard);

        // WHEN: Requesting the same standard multiple times to establish hit rate
        const responseTimes: number[] = [];
        const iterations = 100;

        for (let i = 0; i < iterations; i++) {
            const startTime = performance.now();
            const result = await performanceCache.get(cacheKey);
            const endTime = performance.now();

            responseTimes.push(endTime - startTime);
            expect(result).toEqual(standard);
        }

        // THEN: Response times should be under 30ms and cache hit rate >80%
        const averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
        const maxResponseTime = Math.max(...responseTimes);

        expect(averageResponseTime).toBeLessThan(30);
        expect(maxResponseTime).toBeLessThan(30);

        const statistics = performanceCache.getStats();
        expect(statistics.combined.overallHitRate).toBeGreaterThan(80);
    });

    test('1.3-AC1-002: should maintain sub-30ms response times under concurrent load', async () => {
        // GIVEN: Multiple standards cached in the system
        for (const standard of testStandards) {
            const cacheKey = `standards:${standard.technology}:${standard.category}:${standard.id}`;
            await performanceCache.set(cacheKey, standard);
        }

        // WHEN: Making concurrent requests for cached standards
        const concurrentRequests = 50;
        const responseTimes: number[] = [];

        const promises = Array.from({ length: concurrentRequests }, async (_, index) => {
            const standard = testStandards[index % testStandards.length];
            const cacheKey = `standards:${standard.technology}:${standard.category}:${standard.id}`;

            const startTime = performance.now();
            const result = await performanceCache.get(cacheKey);
            const endTime = performance.now();

            responseTimes.push(endTime - startTime);
            return result;
        });

        await Promise.all(promises);

        // THEN: All response times should be under 30ms
        const averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
        const maxResponseTime = Math.max(...responseTimes);

        expect(averageResponseTime).toBeLessThan(30);
        expect(maxResponseTime).toBeLessThan(30);
    });
});