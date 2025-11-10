import { test as base, expect } from 'bun:test';
import { PerformanceLayer } from '../../../src/cache/performance-layer.js';
import { LRUCache } from '../../../src/cache/lru-cache.js';
import { CacheWarmer } from '../../../src/cache/cache-warming.js';
import { CacheStatistics } from '../../../src/cache/cache-statistics.js';
import {
    createCacheTestStandard,
    createCacheTestStandards,
    createAccessPattern,
    createCacheConfig,
    createPerformanceBenchmark,
    CACHE_TEST_SCENARIOS,
    type CacheTestStandard,
    type CacheTestScenario
} from '../factories/cache-performance-factory.js';

// Types for cache performance fixture context
export interface CachePerformanceFixture {
    performanceLayer: PerformanceLayer;
    lruCache: LRUCache<string>;
    cacheWarmer: CacheWarmer;
    cacheStatistics: CacheStatistics;
    testStandards: CacheTestStandard[];
    accessPattern: Array<{
        cacheKey: string;
        standard: CacheTestStandard;
        timestamp: Date;
        operation: string;
    }>;
    performanceBenchmark: any;
}

// Cache performance test fixture with comprehensive setup
export const test = base.extend<CachePerformanceFixture>({
    // Performance layer fixture
    performanceLayer: async ({}, use) => {
        const config = createCacheConfig({
            performanceMonitorEnabled: true,
            enableDetailedMetrics: true
        });

        const performanceLayer = new PerformanceLayer(config);

        // Initialize with test data
        await performanceLayer.initialize();

        await use({ performanceLayer });

        await performanceLayer.cleanup();
    },

    // LRU cache fixture
    lruCache: async ({}, use) => {
        const lruCache = new LRUCache<string>({
            maxSize: 100,
            ttl: 300000 // 5 minutes
        });

        await use({ lruCache });

        lruCache.clear();
    },

    // Cache warmer fixture
    cacheWarmer: async ({ lruCache }, use) => {
        const cacheWarmer = new CacheWarmer(lruCache);
        await use({ cacheWarmer });
    },

    // Cache statistics fixture
    cacheStatistics: async ({}, use) => {
        const cacheStatistics = new CacheStatistics({
            enableDetailedTracking: true,
            enableSLAMonitoring: true,
            slaThresholds: {
                maxResponseTime: 30,
                minCacheHitRate: 80,
                maxMemoryUsage: 50 * 1024 * 1024
            }
        });

        await use({ cacheStatistics });
    },

    // Test standards fixture
    testStandards: async ({}, use) => {
        const standards = createCacheTestStandards(20, {
            priority: faker.helpers.weightedArrayElement([
                { weight: 20, value: 'critical' },
                { weight: 30, value: 'high' },
                { weight: 30, value: 'medium' },
                { weight: 20, value: 'low' }
            ])
        });

        await use({ testStandards });
    },

    // Access pattern fixture
    accessPattern: async ({ testStandards }, use) => {
        const pattern = createAccessPattern(testStandards);
        await use({ accessPattern });
    },

    // Performance benchmark fixture
    performanceBenchmark: async ({ testStandards }, use) => {
        const scenario: CacheTestScenario = {
            name: 'Default Performance Test',
            description: 'Standard performance test configuration',
            standards: testStandards,
            expectedHitRate: 85,
            expectedResponseTime: 20,
            memoryPressure: false
        };

        const benchmark = createPerformanceBenchmark(scenario);
        await use({ performanceBenchmark });
    }
});

// Helper functions for cache performance testing
export const seedCacheWithStandards = async (
    performanceLayer: PerformanceLayer,
    standards: CacheTestStandard[],
    count: number = standards.length
) => {
    const selectedStandards = standards.slice(0, count);
    const seededKeys: string[] = [];

    for (const standard of selectedStandards) {
        const cacheKey = `standards:${standard.technology}:${standard.category}:${standard.id}`;
        await performanceLayer.set(cacheKey, standard);
        seededKeys.push(cacheKey);
    }

    return {
        seededKeys,
        seededCount: selectedStandards.length,
        standards: selectedStandards
    };
};

export const simulateCacheAccess = async (
    performanceLayer: PerformanceLayer,
    accessPattern: Array<{ cacheKey: string; standard: CacheTestStandard; operation: string }>,
    iterations: number = 1
) => {
    const results = {
        hits: 0,
        misses: 0,
        errors: 0,
        responseTimes: [] as number[],
        operations: [] as Array<{
            cacheKey: string;
            operation: string;
            result: any;
            responseTime: number;
            timestamp: Date;
        }>
    };

    for (let i = 0; i < iterations; i++) {
        for (const access of accessPattern) {
            const startTime = performance.now();

            try {
                let result: any;

                switch (access.operation) {
                    case 'get':
                        result = await performanceLayer.get(access.cacheKey);
                        break;
                    case 'set':
                        result = await performanceLayer.set(access.cacheKey, access.standard);
                        break;
                    case 'delete':
                        result = await performanceLayer.delete(access.cacheKey);
                        break;
                    default:
                        throw new Error(`Unknown operation: ${access.operation}`);
                }

                const responseTime = performance.now() - startTime;
                results.responseTimes.push(responseTime);

                // Track hit/miss for get operations
                if (access.operation === 'get') {
                    if (result !== undefined) {
                        results.hits++;
                    } else {
                        results.misses++;
                    }
                }

                results.operations.push({
                    cacheKey: access.cacheKey,
                    operation: access.operation,
                    result,
                    responseTime,
                    timestamp: new Date()
                });

            } catch (error) {
                results.errors++;
                const responseTime = performance.now() - startTime;
                results.responseTimes.push(responseTime);

                results.operations.push({
                    cacheKey: access.cacheKey,
                    operation: access.operation,
                    result: null,
                    responseTime,
                    timestamp: new Date()
                });
            }
        }
    }

    return {
        ...results,
        totalOperations: results.hits + results.misses + results.errors,
        hitRate: results.hits + results.misses > 0 ? (results.hits / (results.hits + results.misses)) * 100 : 0,
        averageResponseTime: results.responseTimes.length > 0
            ? results.responseTimes.reduce((a, b) => a + b, 0) / results.responseTimes.length
            : 0,
        maxResponseTime: results.responseTimes.length > 0 ? Math.max(...results.responseTimes) : 0,
        minResponseTime: results.responseTimes.length > 0 ? Math.min(...results.responseTimes) : 0
    };
};

export const runPerformanceBenchmark = async (
    performanceLayer: PerformanceLayer,
    benchmark: any,
    standards: CacheTestStandard[]
) => {
    // Seed cache with critical standards
    const criticalStandards = standards.filter(s => s.priority === 'critical');
    await seedCacheWithStandards(performanceLayer, criticalStandards);

    const startTime = Date.now();
    const endTime = startTime + benchmark.testDuration;

    const results = {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        responseTimes: [] as number[],
        hitRate: 0,
        throughput: 0,
        errors: [] as string[]
    };

    // Simulate concurrent user load
    const userPromises = Array.from({ length: benchmark.concurrentUsers }, async (_, userIndex) => {
        while (Date.now() < endTime) {
            const requestStartTime = performance.now();

            try {
                // Select random standard to access
                const standard = standards[Math.floor(Math.random() * standards.length)];
                const cacheKey = `standards:${standard.technology}:${standard.category}:${standard.id}`;

                const result = await performanceLayer.get(cacheKey);
                const responseTime = performance.now() - requestStartTime;

                results.responseTimes.push(responseTime);
                results.totalRequests++;
                results.successfulRequests++;

                // Rate limiting per user
                if (benchmark.requestsPerSecond > 0) {
                    const delay = 1000 / benchmark.requestsPerSecond;
                    await new Promise(resolve => setTimeout(resolve, delay));
                }

            } catch (error) {
                results.totalRequests++;
                results.failedRequests++;
                results.errors.push(error instanceof Error ? error.message : 'Unknown error');
            }
        }
    });

    await Promise.all(userPromises);

    // Calculate final metrics
    const actualDuration = Date.now() - startTime;
    results.hitRate = (results.successfulRequests / results.totalRequests) * 100;
    results.throughput = results.totalRequests / (actualDuration / 1000); // requests per second

    // Calculate percentiles
    const sortedResponseTimes = results.responseTimes.sort((a, b) => a - b);
    const percentiles = {
        p50: sortedResponseTimes[Math.floor(sortedResponseTimes.length * 0.5)] || 0,
        p90: sortedResponseTimes[Math.floor(sortedResponseTimes.length * 0.9)] || 0,
        p95: sortedResponseTimes[Math.floor(sortedResponseTimes.length * 0.95)] || 0,
        p99: sortedResponseTimes[Math.floor(sortedResponseTimes.length * 0.99)] || 0
    };

    return {
        ...results,
        duration: actualDuration,
        averageResponseTime: results.responseTimes.length > 0
            ? results.responseTimes.reduce((a, b) => a + b, 0) / results.responseTimes.length
            : 0,
        percentiles,
        meetsRequirements: {
            responseTime: results.averageResponseTime <= benchmark.requirements.maxResponseTime,
            hitRate: results.hitRate >= benchmark.requirements.minHitRate,
            throughput: results.throughput >= 1000 // Basic throughput requirement
        }
    };
};

export const measureMemoryUsage = (performanceLayer: PerformanceLayer) => {
    const stats = performanceLayer.getMemoryStats();
    return {
        usedMemory: stats.usedMemory,
        totalMemory: stats.totalMemory,
        memoryUsagePercent: (stats.usedMemory / stats.totalMemory) * 100,
        cacheSize: stats.cacheSize,
        evictions: stats.evictions
    };
};

export const createScenarioTest = (scenarioName: keyof typeof CACHE_TEST_SCENARIOS) => {
    const scenario = CACHE_TEST_SCENARIOS[scenarioName];

    return {
        scenario,
        run: async (performanceLayer: PerformanceLayer) => {
            // Setup based on scenario
            if (scenario.memoryPressure) {
                // Create memory pressure by loading many large standards
                const largeStandards = createCacheTestStandards(200, {
                    size: faker.number.int({ min: 10240, max: 51200 }) // 10KB - 50KB
                });
                await seedCacheWithStandards(performanceLayer, largeStandards, 150);
            }

            // Run access simulation
            const accessPattern = createAccessPattern(scenario.standards);
            const results = await simulateCacheAccess(performanceLayer, accessPattern, 3);

            // Validate against expected metrics
            return {
                ...results,
                meetsExpectations: {
                    hitRate: results.hitRate >= scenario.expectedHitRate,
                    responseTime: results.averageResponseTime <= scenario.expectedResponseTime
                },
                scenario
            };
        }
    };
};

// Export the base test for compatibility
export { base };