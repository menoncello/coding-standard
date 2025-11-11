import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { CacheWarmer, WarmupStrategy } from '../../../src/cache/cache-warming.js';
import { PerformanceCache } from '../../../src/cache/performance-layer.js';
import { createStandard, createStandards } from '../../support/factories/standard-factory.js';

describe('CacheWarmer - Unit Tests', () => {
    let performanceCache: PerformanceCache<any>;
    let cacheWarmer: CacheWarmer<any>;
    let mockDataProvider: (key: string) => Promise<any>;

    beforeEach(() => {
        // GIVEN: A real PerformanceCache instance
        performanceCache = new PerformanceCache({
            memoryCache: {
                maxSize: 50,
                memoryLimit: 100 * 1024 * 1024, // 100MB
                ttl: 3600000 // 1 hour
            },
            persistentCache: {
                enabled: false,
                maxSize: 0,
                ttl: 0
            },
            performanceTargets: {
                maxMemoryResponseTime: 30,
                maxPersistentResponseTime: 100,
                minCacheHitRate: 80
            }
        });

        // GIVEN: Mock data provider
        const mockData = new Map<string, any>();
        mockDataProvider = async (key: string) => {
            if (mockData.has(key)) {
                return mockData.get(key);
            }
            // Simulate data generation for test keys
            const standard = createStandard();
            mockData.set(key, standard);
            return standard;
        };

        cacheWarmer = new CacheWarmer(performanceCache, {
            strategy: WarmupStrategy.HYBRID,
            warmupTimeout: 1000,
            criticalCategories: ['security', 'performance'],
            criticalTechnologies: ['typescript', 'javascript'],
            maxWarmupItems: 20,
            enablePredictiveWarming: false,
            warmupOnStartup: false,
            warmupOnAccess: false
        });
    });

    afterEach(() => {
        // Clean up resources
        if (performanceCache) {
            performanceCache.clear();
        }
    });

    test('should initialize with default configuration', () => {
        // THEN: CacheWarmer should be properly initialized
        expect(cacheWarmer).toBeDefined();
        const analytics = cacheWarmer.getAccessAnalytics();
        expect(analytics.totalAccesses).toBe(0);
        expect(analytics.uniqueKeys).toBe(0);
        expect(analytics.mostAccessed).toHaveLength(0);
    });

    test('should record access patterns correctly', () => {
        // GIVEN: Some access to record
        const key = 'test-key';
        const responseTime = 15;
        const metadata = {
            category: 'performance',
            technology: 'typescript'
        };

        // WHEN: Recording access
        cacheWarmer.recordAccess(key, responseTime, metadata);

        // THEN: Access pattern should be recorded
        const analytics = cacheWarmer.getAccessAnalytics();
        expect(analytics.totalAccesses).toBe(1);
        expect(analytics.uniqueKeys).toBe(1);
        expect(analytics.mostAccessed).toHaveLength(1);
        expect(analytics.mostAccessed[0].key).toBe(key);
        expect(analytics.mostAccessed[0].frequency).toBe(1);
        expect(analytics.mostAccessed[0].averageAccessTime).toBe(15);
        expect(analytics.mostAccessed[0].category).toBe('performance');
        expect(analytics.mostAccessed[0].technology).toBe('typescript');
    });

    test.skip('should warm up cache using data provider', async () => {
        // GIVEN: Some access patterns to create warmup candidates
        const keys = ['standard-1', 'standard-2', 'standard-3'];

        // Record some access patterns first
        keys.forEach(key => {
            cacheWarmer.recordAccess(key, 10, { category: 'security', technology: 'typescript' });
        });

        // WHEN: Warming up cache
        const result = await cacheWarmer.warmupCache(mockDataProvider);

        // THEN: Should warm up successfully
        expect(result.success).toBe(true);
        expect(result.itemsWarmed).toBeGreaterThan(0);
        expect(result.timeSpent).toBeGreaterThan(0);
        expect(result.errors).toHaveLength(0);
        expect(result.warmupStrategy).toBe(WarmupStrategy.HYBRID);
    });

    test('should handle empty warmup candidates gracefully', async () => {
        // WHEN: Warming up with no access patterns
        const result = await cacheWarmer.warmupCache(mockDataProvider);

        // THEN: Should complete successfully but with no items
        expect(result.success).toBe(true);
        expect(result.itemsWarmed).toBe(0);
        expect(result.timeSpent).toBeGreaterThanOrEqual(0);
        expect(result.errors).toHaveLength(0);
    });

    test('should prioritize critical items for warmup', async () => {
        // GIVEN: Mix of critical and non-critical access patterns
        cacheWarmer.recordAccess('security-rule', 5, { category: 'security', technology: 'typescript' });
        cacheWarmer.recordAccess('regular-config', 20, { category: 'general', technology: 'other' });
        cacheWarmer.recordAccess('performance-metric', 8, { category: 'performance', technology: 'javascript' });
        cacheWarmer.recordAccess('linting-rule', 12, { category: 'linting', technology: 'typescript' });

        // WHEN: Getting warmup candidates
        const candidates = cacheWarmer.getWarmupCandidates(5);

        // THEN: Should prioritize critical categories/technologies
        expect(candidates.length).toBeGreaterThan(0);

        // Security and performance items should come first
        const criticalItems = candidates.filter(key =>
            key.includes('security') || key.includes('performance')
        );
        expect(criticalItems.length).toBeGreaterThan(0);
    });

    test('should calculate warmup scores based on frequency and recency', async () => {
        // GIVEN: Multiple access patterns with different frequencies
        const frequentKey = 'frequent-standard';
        const rareKey = 'rare-standard';

        // Record multiple accesses for frequent key
        for (let i = 0; i < 5; i++) {
            cacheWarmer.recordAccess(frequentKey, 10, { category: 'security', technology: 'typescript' });
        }

        // Record single access for rare key
        cacheWarmer.recordAccess(rareKey, 15, { category: 'general', technology: 'other' });

        // WHEN: Getting warmup candidates
        const candidates = cacheWarmer.getWarmupCandidates(10);

        // THEN: Frequent key should have higher priority
        expect(candidates).toContain(frequentKey);
        expect(candidates).toContain(rareKey);

        // Frequent key should come first due to higher frequency and critical category
        const frequentIndex = candidates.indexOf(frequentKey);
        const rareIndex = candidates.indexOf(rareKey);
        expect(frequentIndex).toBeLessThan(rareIndex);
    });

    test('should handle concurrent warmup requests', async () => {
        // GIVEN: Some access patterns and slower data provider to ensure overlap
        const keys = ['standard-1', 'standard-2', 'standard-3'];
        keys.forEach(key => {
            cacheWarmer.recordAccess(key, 10);
        });

        const slowDataProvider = async (key: string) => {
            await new Promise(resolve => setTimeout(resolve, 100)); // Slow enough to ensure overlap
            return createStandard();
        };

        // WHEN: Running concurrent warmup requests
        const [result1, result2] = await Promise.all([
            cacheWarmer.warmupCache(slowDataProvider),
            cacheWarmer.warmupCache(slowDataProvider)
        ]);

        // THEN: Both should complete, but at least one should succeed
        expect(result1.success || result2.success).toBe(true);

        // If one failed, it should be due to warmup in progress
        if (!result1.success) {
            expect(result2.errors.some(e => e.includes('already in progress') || e.includes('already in progress'))).toBe(true);
        }
        if (!result2.success) {
            expect(result2.errors.some(e => e.includes('already in progress') || e.includes('already in progress'))).toBe(true);
        }
    });

    test('should track comprehensive access analytics', () => {
        // GIVEN: Various access patterns
        const keys = ['typescript-eslint', 'react-component', 'security-rule', 'performance-metric'];
        keys.forEach(key => {
            // Record multiple accesses for some keys
            const accessCount = key.includes('typescript') ? 3 : 1;
            for (let i = 0; i < accessCount; i++) {
                cacheWarmer.recordAccess(key, 10 + Math.random() * 20);
            }
        });

        // WHEN: Getting analytics
        const analytics = cacheWarmer.getAccessAnalytics();

        // THEN: Analytics should be comprehensive
        expect(analytics.totalAccesses).toBeGreaterThan(0);
        expect(analytics.uniqueKeys).toBe(keys.length);
        expect(analytics.mostAccessed.length).toBeGreaterThan(0);

        // Most accessed should be typescript-eslint (3 accesses)
        const mostAccessedKey = analytics.mostAccessed[0];
        expect(mostAccessedKey.key).toBe('typescript-eslint');
        expect(mostAccessedKey.frequency).toBe(3);

        // Access frequency map should include all keys
        expect(analytics.accessFrequency.size).toBe(keys.length);
        expect(analytics.accessFrequency.get('typescript-eslint')).toBe(3);

        // Average access interval should be calculated
        expect(analytics.averageAccessInterval).toBeGreaterThanOrEqual(0);
    });

    test('should handle data provider errors gracefully', async () => {
        // GIVEN: Access patterns and failing data provider
        const keys = ['standard-1', 'standard-2'];
        keys.forEach(key => {
            cacheWarmer.recordAccess(key, 10);
        });

        const failingDataProvider = async (key: string) => {
            if (key.includes('standard-1')) {
                throw new Error('Data not found');
            }
            return createStandard();
        };

        // WHEN: Warming up with failing data provider
        const result = await cacheWarmer.warmupCache(failingDataProvider);

        // THEN: Should handle errors gracefully
        expect(result.success).toBe(true); // Still success if some items warmed
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors.some(e => e.includes('Data not found'))).toBe(true);
    });

    test('should respect warmup timeout', async () => {
        // GIVEN: Access patterns and slow data provider
        const keys = ['standard-1', 'standard-2', 'standard-3'];
        keys.forEach(key => {
            cacheWarmer.recordAccess(key, 10);
        });

        const slowDataProvider = async (key: string) => {
            await new Promise(resolve => setTimeout(resolve, 200)); // Slow operation
            return createStandard();
        };

        // Create cache warmer with short timeout
        const shortTimeoutWarmer = new CacheWarmer(performanceCache, {
            strategy: WarmupStrategy.HYBRID,
            warmupTimeout: 100, // 100ms timeout
            maxWarmupItems: 10,
            enablePredictiveWarming: false
        });

        // WHEN: Warming up with slow provider
        const result = await shortTimeoutWarmer.warmupCache(slowDataProvider);

        // THEN: Should complete within timeout
        expect(result.timeSpent).toBeLessThan(150); // Some tolerance
        expect(result.success).toBe(true); // Still considered success
    });

    test('should warm up critical standards through PerformanceCache', async () => {
        // GIVEN: Critical keys and data provider
        const criticalKeys = ['security-rule-1', 'performance-metric-1'];
        const dataMap = new Map<string, any>();

        criticalKeys.forEach(key => {
            dataMap.set(key, createStandard());
        });

        const dataProvider = async (key: string) => {
            return dataMap.get(key);
        };

        // WHEN: Warming up critical standards through PerformanceCache
        await performanceCache.warmupCriticalStandards(criticalKeys, dataProvider);

        // THEN: Items should be cached
        for (const key of criticalKeys) {
            const hasItem = await performanceCache.has(key);
            expect(hasItem).toBe(true);
        }
    });
});