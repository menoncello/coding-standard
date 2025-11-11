import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { LRUCache, MemoryPressureLevel } from '../../../src/cache/lru-cache.js';
import { createStandard, createStandards } from '../../support/factories/standard-factory.js';

describe('LRUCache - Performance Layer', () => {
    let lruCache: LRUCache<number>;

    beforeEach(() => {
        // GIVEN: Fresh LRU cache for each test
        lruCache = new LRUCache<number>({
            maxSize: 5,
            memoryLimit: 1024 * 1024, // 1MB
            enableMemoryPressure: true,
            enableMetrics: true,
            cleanupInterval: 0 // Disable auto cleanup for tests
        });
    });

    afterEach(() => {
        lruCache.destroy();
    });

    test('LRU-001: should store and retrieve values correctly', () => {
        // GIVEN: A value to cache
        const key = 'test-key';
        const value = 42;

        // WHEN: Setting and getting the value
        lruCache.set(key, value);
        const result = lruCache.get(key);

        // THEN: Value should be retrieved correctly
        expect(result).toBe(42);
    });

    test('LRU-002: should return undefined for non-existent keys', () => {
        // GIVEN: No values in cache
        // WHEN: Getting non-existent key
        const result = lruCache.get('non-existent');

        // THEN: Should return undefined
        expect(result).toBeUndefined();
    });

    test('should evict least recently used items when capacity exceeded', () => {
        // GIVEN: Cache at maximum capacity
        lruCache.set('key1', 1);
        lruCache.set('key2', 2);
        lruCache.set('key3', 3);
        lruCache.set('key4', 4);
        lruCache.set('key5', 5);

        // WHEN: Access key1 (making it most recently used) and add new item
        lruCache.get('key1'); // key1 becomes most recently used
        lruCache.set('key6', 6); // Should evict key2 (least recently used)

        // THEN: key1 should still exist, key2 should be evicted
        expect(lruCache.get('key1')).toBe(1);
        expect(lruCache.get('key2')).toBeUndefined();
        expect(lruCache.get('key6')).toBe(6);

        // Cache size should remain at max
        expect(lruCache.size()).toBe(5);
    });

    test('should update access order on get operations', () => {
        // GIVEN: Cache with multiple items at capacity
        lruCache.set('key1', 1);
        lruCache.set('key2', 2);
        lruCache.set('key3', 3);
        lruCache.set('key4', 4);
        lruCache.set('key5', 5); // Cache is now at max capacity (5)

        // WHEN: Accessing key1 (should make it most recently used)
        lruCache.get('key1');

        // THEN: Adding new item should evict key2 (oldest, not key1)
        lruCache.set('key6', 6); // Should trigger eviction
        expect(lruCache.get('key1')).toBe(1); // Still exists (recently accessed)
        expect(lruCache.get('key2')).toBeUndefined(); // Evicted (least recently used)
        expect(lruCache.get('key3')).toBe(3); // Still exists
        expect(lruCache.get('key4')).toBe(4); // Still exists
        expect(lruCache.get('key5')).toBe(5); // Still exists
        expect(lruCache.get('key6')).toBe(6); // New item
    });

    test.skip('should handle TTL expiration correctly', async () => {
        // GIVEN: Cache with very short TTL
        const shortTTLCache = new LRUCache<number>({
            maxSize: 10,
            ttl: 100 // 100ms
        });

        shortTTLCache.set('expiring-key', 123);

        // WHEN: Waiting for TTL to expire
        await new Promise(resolve => setTimeout(resolve, 150));

        // THEN: Value should be expired and return undefined
        const result = shortTTLCache.get('expiring-key');
        expect(result).toBeUndefined();
    });

    test('should clear all items', () => {
        // GIVEN: Cache with items
        lruCache.set('key1', 1);
        lruCache.set('key2', 2);
        lruCache.set('key3', 3);
        expect(lruCache.size()).toBe(3);

        // WHEN: Clearing cache
        lruCache.clear();

        // THEN: Cache should be empty
        expect(lruCache.size()).toBe(0);
        expect(lruCache.get('key1')).toBeUndefined();
        expect(lruCache.get('key2')).toBeUndefined();
        expect(lruCache.get('key3')).toBeUndefined();
    });

    test('should provide cache statistics', () => {
        // GIVEN: Empty cache
        let stats = lruCache.getStats();
        expect(stats.size).toBe(0);
        expect(stats.hits).toBe(0);
        expect(stats.misses).toBe(0);
        expect(stats.hitRate).toBe(0);

        // WHEN: Performing operations
        lruCache.set('key1', 1);
        lruCache.set('key2', 2);

        lruCache.get('key1'); // Hit
        lruCache.get('key3'); // Miss
        lruCache.get('key2'); // Hit
        lruCache.get('key4'); // Miss

        // THEN: Statistics should be accurate
        stats = lruCache.getStats();
        expect(stats.size).toBe(2);
        expect(stats.hits).toBe(2);
        expect(stats.misses).toBe(2);
        expect(stats.hitRate).toBe(50); // 2 hits out of 4 total requests
    });

    test('should handle complex objects as values', () => {
        // GIVEN: Complex object
        const standard = createStandard({
            technology: 'typescript',
            category: 'naming'
        });

        // WHEN: Storing and retrieving complex object
        lruCache.set('standard-key', standard);
        const result = lruCache.get('standard-key');

        // THEN: Object should be retrieved correctly
        expect(result).toEqual(standard);
        expect(result?.technology).toBe('typescript');
        expect(result?.category).toBe('naming');
    });

    test('should delete specific items', () => {
        // GIVEN: Cache with multiple items
        lruCache.set('key1', 1);
        lruCache.set('key2', 2);
        lruCache.set('key3', 3);

        // WHEN: Deleting specific item
        const deleted = lruCache.delete('key2');

        // THEN: Item should be deleted and others should remain
        expect(deleted).toBeTruthy();
        expect(lruCache.get('key1')).toBe(1);
        expect(lruCache.get('key2')).toBeUndefined();
        expect(lruCache.get('key3')).toBe(3);
        expect(lruCache.size()).toBe(2);
    });

    test('should return false when deleting non-existent item', () => {
        // GIVEN: Empty cache
        // WHEN: Deleting non-existent item
        const deleted = lruCache.delete('non-existent');

        // THEN: Should return false
        expect(deleted).toBeFalsy();
    });

    test('should check if key exists', () => {
        // GIVEN: Cache with item
        lruCache.set('existing-key', 123);

        // WHEN: Checking existence
        const exists = lruCache.has('existing-key');
        const notExists = lruCache.has('non-existing-key');

        // THEN: Should return correct existence status
        expect(exists).toBeTruthy();
        expect(notExists).toBeFalsy();
    });

    test('should handle concurrent access correctly', async () => {
        // GIVEN: Cache and concurrent operations
        const operations = 100;
        const promises: Promise<void>[] = [];

        // WHEN: Performing concurrent set operations
        for (let i = 0; i < operations; i++) {
            promises.push(Promise.resolve(lruCache.set(`key${i}`, i)));
        }

        // Concurrent get operations
        for (let i = 0; i < operations; i++) {
            promises.push(Promise.resolve(lruCache.get(`key${i % 10}`)));
        }

        await Promise.all(promises);

        // THEN: Cache should be in consistent state
        expect(lruCache.size()).toBeLessThanOrEqual(5); // Max size
        const stats = lruCache.getStats();
        expect(stats.hits + stats.misses).toBeGreaterThan(0);
    });

    describe('Memory Pressure Handling', () => {
        test('should detect memory pressure levels correctly', () => {
            // GIVEN: Cache with very small memory limit
            const smallCache = new LRUCache<string>({
                maxSize: 10,
                memoryLimit: 1000, // Very small limit
                enableMemoryPressure: true
            });

            // WHEN: Adding data that exceeds memory limit
            const largeData = 'x'.repeat(100);
            for (let i = 0; i < 10; i++) {
                smallCache.set(`key${i}`, largeData);
            }

            // THEN: Should detect memory pressure
            const pressureLevel = smallCache.getMemoryPressureLevel();
            expect([MemoryPressureLevel.HIGH, MemoryPressureLevel.CRITICAL, MemoryPressureLevel.MEDIUM])
                .toContain(pressureLevel);

            smallCache.destroy();
        });

        test('should force eviction under memory pressure', () => {
            // GIVEN: Memory-limited cache
            const memoryLimitedCache = new LRUCache<string>({
                maxSize: 100,
                memoryLimit: 500, // Very small limit
                enableMemoryPressure: true
            });

            // WHEN: Filling with data that exceeds memory limit
            const largeData = 'x'.repeat(50);
            for (let i = 0; i < 20; i++) {
                memoryLimitedCache.set(`key${i}`, largeData);
            }

            // THEN: Should be able to force eviction
            const evicted = memoryLimitedCache.forceEviction(5);
            expect(evicted).toBeGreaterThan(0);
            expect(memoryLimitedCache.size()).toBeLessThanOrEqual(5);

            memoryLimitedCache.destroy();
        });
    });

    describe('Performance Requirements', () => {
        test('should meet sub-30ms response time requirement', () => {
            // GIVEN: Pre-populated cache
            for (let i = 0; i < 1000; i++) {
                lruCache.set(`key${i}`, i);
            }

            // WHEN: Measuring get performance
            const iterations = 1000;
            const startTime = performance.now();

            for (let i = 0; i < iterations; i++) {
                lruCache.get(`key${i % 100}`);
            }

            // THEN: Should meet performance target
            const endTime = performance.now();
            const averageTime = (endTime - startTime) / iterations;
            expect(averageTime).toBeLessThan(30); // Under 30ms
        });

        test('should maintain >80% hit rate for frequent access', () => {
            // GIVEN: Cache with popular keys
            const popularKeys = ['popular1', 'popular2', 'popular3', 'popular4', 'popular5'];
            popularKeys.forEach(key => lruCache.set(key, 1));

            // WHEN: Simulating deterministic access pattern (85% popular keys)
            const totalRequests = 1000;
            let hits = 0;

            for (let i = 0; i < totalRequests; i++) {
                // Use deterministic pattern: first 850 requests are popular keys, last 150 are random
                if (i < 850) {
                    const key = popularKeys[i % popularKeys.length];
                    if (lruCache.get(key)) hits++;
                } else {
                    lruCache.get(`random-${i}`);
                }
            }

            // THEN: Should maintain high hit rate
            const hitRate = (hits / totalRequests) * 100;
            expect(hitRate).toBeGreaterThan(80);
        });
    });

    describe('Enhanced Metrics', () => {
        test('should track detailed performance metrics', () => {
            // GIVEN: Empty cache
            // WHEN: Performing operations
            lruCache.set('key1', 1);
            lruCache.get('key1'); // hit
            lruCache.get('nonexistent'); // miss

            // THEN: Should track metrics correctly
            const metrics = lruCache.getMetrics();
            expect(metrics.hits).toBe(1);
            expect(metrics.misses).toBe(1);
            expect(metrics.hitRate).toBe(50);
            expect(metrics.averageGetTime).toBeGreaterThanOrEqual(0);
            expect(metrics.memoryUsage).toBeGreaterThan(0);
        });

        test('should track memory pressure level in metrics', () => {
            // GIVEN: Cache with memory pressure
            const metrics = lruCache.getMetrics();

            // THEN: Should include memory pressure level
            expect(metrics.memoryPressureLevel).toBeDefined();
            expect(Object.values(MemoryPressureLevel)).toContain(metrics.memoryPressureLevel);
        });
    });
});