import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { CacheManager, McpResponseCache, mcpCache, CacheKeys, createCodeHash } from '../../src/cache/cache-manager.js';
import { GetStandardsResponse, SearchStandardsResponse, ValidateCodeResponse } from '../../src/types/mcp.js';

describe('CacheManager Integration Tests', () => {
    let cache: CacheManager<string>;

    beforeEach(() => {
        cache = new CacheManager<string>({ ttl: 1000, maxSize: 10 });
    });

    afterEach(() => {
        cache.clear();
    });

    describe('basic operations', () => {
        test('should store and retrieve values', () => {
            cache.set('key1', 'value1');
            expect(cache.get('key1')).toBe('value1');
        });

        test('should return null for non-existent keys', () => {
            expect(cache.get('nonexistent')).toBeNull();
        });

        test('should delete values', () => {
            cache.set('key1', 'value1');
            expect(cache.get('key1')).toBe('value1');

            expect(cache.delete('key1')).toBe(true);
            expect(cache.get('key1')).toBeNull();
        });

        test('should return false when deleting non-existent keys', () => {
            expect(cache.delete('nonexistent')).toBe(false);
        });
    });

    describe('TTL (Time To Live)', () => {
        test('should expire values after TTL', async () => {
            const shortTtlCache = new CacheManager<string>({ ttl: 50 });
            shortTtlCache.set('key1', 'value1');

            expect(shortTtlCache.get('key1')).toBe('value1');

            // Wait for expiration
            await new Promise(resolve => setTimeout(resolve, 60));

            expect(shortTtlCache.get('key1')).toBeNull();
        });

        test('should support custom TTL per entry', async () => {
            cache.set('key1', 'value1', 50);
            expect(cache.get('key1')).toBe('value1');

            // Wait for custom TTL expiration
            await new Promise(resolve => setTimeout(resolve, 60));

            expect(cache.get('key1')).toBeNull();
        });

        test('should not expire entries before TTL', async () => {
            cache.set('key1', 'value1', 200);

            expect(cache.get('key1')).toBe('value1');

            // Wait but not enough to expire
            await new Promise(resolve => setTimeout(resolve, 50));

            expect(cache.get('key1')).toBe('value1');
        });
    });

    describe('LRU eviction', () => {
        test('should evict oldest entries when max size is reached', () => {
            const smallCache = new CacheManager<string>({ maxSize: 3 });

            smallCache.set('key1', 'value1');
            smallCache.set('key2', 'value2');
            smallCache.set('key3', 'value3');

            expect(smallCache.get('key1')).toBe('value1');
            expect(smallCache.get('key2')).toBe('value2');
            expect(smallCache.get('key3')).toBe('value3');

            // Add one more to trigger eviction
            smallCache.set('key4', 'value4');

            // Should have evicted the oldest (key1)
            expect(smallCache.get('key1')).toBeNull();
            expect(smallCache.get('key2')).toBe('value2');
            expect(smallCache.get('key3')).toBe('value3');
            expect(smallCache.get('key4')).toBe('value4');
        });

        test('should update access order on retrieval', () => {
            const smallCache = new CacheManager<string>({ maxSize: 3 });

            smallCache.set('key1', 'value1');
            smallCache.set('key2', 'value2');
            smallCache.set('key3', 'value3');

            // Access key1 to make it most recently used
            smallCache.get('key1');

            // Add one more to trigger eviction
            smallCache.set('key4', 'value4');

            // Should have evicted key2 (now oldest)
            expect(smallCache.get('key1')).toBe('value1');
            expect(smallCache.get('key2')).toBeNull();
            expect(smallCache.get('key3')).toBe('value3');
            expect(smallCache.get('key4')).toBe('value4');
        });
    });

    describe('statistics', () => {
        test('should track cache hits and misses', () => {
            cache.set('key1', 'value1');

            // Hit
            cache.get('key1');
            // Miss
            cache.get('nonexistent');
            // Another hit
            cache.get('key1');

            const stats = cache.getStats();
            expect(stats.hits).toBe(2);
            expect(stats.misses).toBe(1);
            expect(stats.hitRate).toBe(66.67); // 2/3 * 100
        });

        test('should calculate hit rate correctly', () => {
            cache.set('key1', 'value1');
            cache.set('key2', 'value2');

            cache.get('key1'); // hit
            cache.get('key2'); // hit
            cache.get('nonexistent'); // miss
            cache.get('another-miss'); // miss

            const stats = cache.getStats();
            expect(stats.hits).toBe(2);
            expect(stats.misses).toBe(2);
            expect(stats.hitRate).toBe(50); // 2/4 * 100
        });

        test('should handle zero requests correctly', () => {
            const stats = cache.getStats();
            expect(stats.hits).toBe(0);
            expect(stats.misses).toBe(0);
            expect(stats.hitRate).toBe(0);
        });
    });

    describe('cleanup', () => {
        test('should remove expired entries', async () => {
            const shortTtlCache = new CacheManager<string>({ ttl: 50 });

            shortTtlCache.set('key1', 'value1');
            shortTtlCache.set('key2', 'value2', 100); // Longer TTL

            // Wait for first to expire
            await new Promise(resolve => setTimeout(resolve, 60));

            const cleanedCount = shortTtlCache.cleanup();
            expect(cleanedCount).toBe(1);

            expect(shortTtlCache.get('key1')).toBeNull();
            expect(shortTtlCache.get('key2')).toBe('value2');
        });

        test('should return 0 when no expired entries', () => {
            cache.set('key1', 'value1');
            const cleanedCount = cache.cleanup();
            expect(cleanedCount).toBe(0);
        });
    });

    describe('configuration', () => {
        test('should be able to enable/disable cache', () => {
            const disabledCache = new CacheManager<string>({ enabled: false });

            disabledCache.set('key1', 'value1');
            expect(disabledCache.get('key1')).toBeNull();
        });

        test('should update configuration', () => {
            cache.set('key1', 'value1');
            cache.set('key2', 'value2');

            cache.updateConfig({ maxSize: 1 });

            // Should have evicted entries to meet new size limit
            expect(cache.size()).toBeLessThanOrEqual(1);
        });

        test('should check if cache is enabled', () => {
            expect(cache.isEnabled()).toBe(true);

            const disabledCache = new CacheManager<string>({ enabled: false });
            expect(disabledCache.isEnabled()).toBe(false);
        });
    });

    describe('utility methods', () => {
        test('should check if key exists', () => {
            expect(cache.has('key1')).toBe(false);

            cache.set('key1', 'value1');
            expect(cache.has('key1')).toBe(true);

            cache.delete('key1');
            expect(cache.has('key1')).toBe(false);
        });

        test('should return all keys', () => {
            expect(cache.keys()).toEqual([]);

            cache.set('key1', 'value1');
            cache.set('key2', 'value2');

            const keys = cache.keys();
            expect(keys).toHaveLength(2);
            expect(keys).toContain('key1');
            expect(keys).toContain('key2');
        });
    });
});

describe('McpResponseCache Integration Tests', () => {
    let mcpCache: McpResponseCache;

    beforeEach(() => {
        mcpCache = new McpResponseCache({ ttl: 1000, maxSize: 10 });
    });

    afterEach(() => {
        mcpCache.clear();
    });

    describe('standards caching', () => {
        test('should cache and retrieve standards responses', () => {
            const standardsResponse: GetStandardsResponse = {
                standards: [],
                totalCount: 0,
                responseTime: 10,
                cached: false
            };

            mcpCache.setStandards('test-key', standardsResponse);
            const retrieved = mcpCache.getStandards('test-key');

            expect(retrieved).toEqual(standardsResponse);
        });

        test('should return null for non-existent standards responses', () => {
            const retrieved = mcpCache.getStandards('nonexistent');
            expect(retrieved).toBeNull();
        });
    });

    describe('search caching', () => {
        test('should cache and retrieve search responses', () => {
            const searchResponse: SearchStandardsResponse = {
                results: [],
                totalCount: 0,
                responseTime: 15
            };

            mcpCache.setSearch('search-key', searchResponse);
            const retrieved = mcpCache.getSearch('search-key');

            expect(retrieved).toEqual(searchResponse);
        });
    });

    describe('validation caching', () => {
        test('should cache and retrieve validation responses', () => {
            const validationResponse: ValidateCodeResponse = {
                valid: true,
                violations: [],
                score: 100,
                responseTime: 25
            };

            mcpCache.setValidation('validation-key', validationResponse);
            const retrieved = mcpCache.getValidation('validation-key');

            expect(retrieved).toEqual(validationResponse);
        });
    });

    describe('combined statistics', () => {
        test('should provide combined statistics for all cache types', () => {
            // Add some data to each cache
            mcpCache.setStandards('std-key', {
                standards: [],
                totalCount: 0,
                responseTime: 10,
                cached: false
            });

            mcpCache.setSearch('search-key', {
                results: [],
                totalCount: 0,
                responseTime: 15
            });

            mcpCache.setValidation('val-key', {
                valid: true,
                violations: [],
                score: 100,
                responseTime: 25
            });

            const stats = mcpCache.getStats();

            expect(stats.standards.size).toBe(1);
            expect(stats.search.size).toBe(1);
            expect(stats.validation.size).toBe(1);
            expect(stats.combined.size).toBe(3);
        });

        test('should calculate combined hit rate correctly', () => {
            // Add and retrieve some data
            mcpCache.setStandards('std-key1', {
                standards: [],
                totalCount: 0,
                responseTime: 10,
                cached: false
            });

            mcpCache.setSearch('search-key1', {
                results: [],
                totalCount: 0,
                responseTime: 15
            });

            // Generate some hits and misses
            mcpCache.getStandards('std-key1'); // hit
            mcpCache.getStandards('std-key2'); // miss
            mcpCache.getSearch('search-key1'); // hit
            mcpCache.getSearch('search-key2'); // miss

            const stats = mcpCache.getStats();
            expect(stats.combined.hits).toBe(2);
            expect(stats.combined.misses).toBe(2);
            expect(stats.combined.hitRate).toBe(50);
        });
    });

    describe('cache management', () => {
        test('should clear all caches', () => {
            mcpCache.setStandards('std-key', {
                standards: [],
                totalCount: 0,
                responseTime: 10,
                cached: false
            });

            mcpCache.setSearch('search-key', {
                results: [],
                totalCount: 0,
                responseTime: 15
            });

            mcpCache.setValidation('val-key', {
                valid: true,
                violations: [],
                score: 100,
                responseTime: 25
            });

            expect(mcpCache.getStandards('std-key')).toBeDefined();
            expect(mcpCache.getSearch('search-key')).toBeDefined();
            expect(mcpCache.getValidation('val-key')).toBeDefined();

            mcpCache.clear();

            expect(mcpCache.getStandards('std-key')).toBeNull();
            expect(mcpCache.getSearch('search-key')).toBeNull();
            expect(mcpCache.getValidation('val-key')).toBeNull();
        });

        test('should cleanup expired entries', async () => {
            const shortTtlCache = new McpResponseCache({ ttl: 50 });

            shortTtlCache.setStandards('std-key', {
                standards: [],
                totalCount: 0,
                responseTime: 10,
                cached: false
            });

            // Wait for expiration
            await new Promise(resolve => setTimeout(resolve, 60));

            const cleanedCount = shortTtlCache.cleanup();
            expect(cleanedCount).toBeGreaterThan(0);
        });

        test('should update configuration for all caches', () => {
            mcpCache.updateConfig({ maxSize: 1 });

            // Should limit all caches to the new size
            mcpCache.setStandards('std-key1', {
                standards: [],
                totalCount: 0,
                responseTime: 10,
                cached: false
            });

            mcpCache.setStandards('std-key2', {
                standards: [],
                totalCount: 0,
                responseTime: 10,
                cached: false
            });

            const stats = mcpCache.getStats();
            expect(stats.standards.size).toBeLessThanOrEqual(1);
        });
    });
});

describe('CacheKeys Integration Tests', () => {
    test('should generate correct standards cache keys', () => {
        expect(CacheKeys.standards()).toBe('standards:all:all');
        expect(CacheKeys.standards('typescript')).toBe('standards:typescript:all');
        expect(CacheKeys.standards('typescript', 'formatting')).toBe('standards:typescript:formatting');
        expect(CacheKeys.standards(undefined, 'formatting')).toBe('standards:all:formatting');
    });

    test('should generate correct search cache keys', () => {
        expect(CacheKeys.search('test')).toBe('search:test:all:fuzzy:10');
        expect(CacheKeys.search('test', 'typescript')).toBe('search:test:typescript:fuzzy:10');
        expect(CacheKeys.search('test', 'typescript', false)).toBe('search:test:typescript:exact:10');
        expect(CacheKeys.search('test', 'typescript', false, 5)).toBe('search:test:typescript:exact:5');
    });

    test('should generate correct validation cache keys', () => {
        const codeHash = createCodeHash('test code');
        expect(CacheKeys.validation(codeHash, 'typescript')).toBe(`validation:${codeHash}:typescript:default`);
        expect(CacheKeys.validation(codeHash, 'javascript', ['rule1', 'rule2']))
            .toBe(`validation:${codeHash}:javascript:rule1,rule2`);
    });
});

describe('createCodeHash Integration Tests', () => {
    test('should generate consistent hashes for same input', () => {
        const code = 'const x = 1;';
        const hash1 = createCodeHash(code);
        const hash2 = createCodeHash(code);

        expect(hash1).toBe(hash2);
        expect(hash1).toBeTruthy();
        expect(typeof hash1).toBe('string');
    });

    test('should generate different hashes for different inputs', () => {
        const code1 = 'const x = 1;';
        const code2 = 'const x = 2;';
        const hash1 = createCodeHash(code1);
        const hash2 = createCodeHash(code2);

        expect(hash1).not.toBe(hash2);
    });

    test('should handle empty strings', () => {
        const hash = createCodeHash('');
        expect(hash).toBeTruthy();
        expect(typeof hash).toBe('string');
    });

    test('should handle large code snippets', () => {
        const largeCode = 'const x = 1;'.repeat(1000);
        const hash = createCodeHash(largeCode);
        expect(hash).toBeTruthy();
        expect(typeof hash).toBe('string');
    });
});