import { test, expect, describe, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test';
import { DatabaseConnection } from '../../../src/database/connection.js';
import { DatabaseSchema } from '../../../src/database/schema.js';
import { SqliteCacheBackend } from '../../../src/database/cache-backend.js';
import { createStandard, createCachedStandard } from '../../support/factories/standard-factory.js';

describe('P0 - Cache Backend Tests', () => {
    let db: DatabaseConnection;
    let schema: DatabaseSchema;
    let cacheBackend: SqliteCacheBackend<string>;
    let testDbPath: string;

    beforeAll(async () => {
        testDbPath = `./test-data-${Date.now()}.db`;
        db = new DatabaseConnection({
            path: testDbPath,
            walMode: true,
            foreignKeys: true,
            cacheSize: 1000,
            busyTimeout: 5000
        });

        await db.initialize();
        schema = new DatabaseSchema(db);
        await schema.initialize();

        cacheBackend = new SqliteCacheBackend<string>({
            database: db,
            persistToDisk: true,
            syncInterval: 1000,
            cleanupInterval: 2000,
            ttl: 5000,
            maxSize: 100,
            enabled: true
        });
    });

    afterAll(async () => {
        if (cacheBackend) {
            await cacheBackend.close();
        }
        if (db) {
            await db.close();
        }
        // Clean up test files
        const fs = require('node:fs');
        try {
            if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
            if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
            if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
        } catch (error) {
            console.warn('Failed to cleanup test files:', error);
        }
    });

    beforeEach(async () => {
        // Clear database before each test
        await db.transaction(async (connection) => {
            await connection.execute('DELETE FROM standards_cache');
            await connection.execute('DELETE FROM usage_analytics');
        });
    });

    afterEach(async () => {
        // Force sync cache after each test
        if (cacheBackend) {
            await cacheBackend.forceSync();
        }
    });

    describe('Cache Storage and Retrieval', () => {
        test('1.2-CACHE-001 should store and retrieve cache entries (AC: 1)', async () => {
            // Given: A standard to cache
            const testStandard = createStandard();
            const cacheKey = 'standards:test-key';
            const serializedData = JSON.stringify(testStandard);

            // When: I store the standard in cache
            await cacheBackend.set(cacheKey, serializedData);

            // Then: The standard should be retrievable
            const cachedData = await cacheBackend.get(cacheKey);
            expect(cachedData).toBe(serializedData);

            const parsedData = JSON.parse(cachedData!);
            expect(parsedData).toEqual(testStandard);
        });

        test('1.2-CACHE-002 should respect TTL expiration (AC: 1)', async () => {
            // Given: A cached standard with short TTL
            const testStandard = createStandard();
            const cacheKey = 'standards:ttl-test';
            const serializedData = JSON.stringify(testStandard);

            // Create cache backend with very short TTL for testing
            const shortTtlCache = new SqliteCacheBackend<string>({
                database: db,
                persistToDisk: true,
                syncInterval: 100,
                cleanupInterval: 100,
                ttl: 100, // 100ms TTL
                maxSize: 10,
                enabled: true
            });

            // When: I store the data and wait for expiration
            await shortTtlCache.set(cacheKey, serializedData);

            // Data should be immediately available
            let cachedData = await shortTtlCache.get(cacheKey);
            expect(cachedData).toBe(serializedData);

            // Wait for TTL to expire
            await new Promise(resolve => setTimeout(resolve, 150));

            // Then: Data should be expired
            cachedData = await shortTtlCache.get(cacheKey);
            expect(cachedData).toBeNull();

            await shortTtlCache.close();
        });

        test('1.2-CACHE-003 should persist cache to disk (AC: 1)', async () => {
            // Given: Multiple standards cached in memory
            const standards = Array.from({ length: 5 }, () => createStandard());

            for (let i = 0; i < standards.length; i++) {
                await cacheBackend.set(`standards:test-${i}`, JSON.stringify(standards[i]));
            }

            // When: I force synchronization to disk
            await cacheBackend.forceSync();

            // Then: Data should be persisted in database
            const persistedData = await db.execute('SELECT * FROM standards_cache WHERE key LIKE "standards:test-%"');
            expect(persistedData).toHaveLength(5);

            for (let i = 0; i < standards.length; i++) {
                const cacheKey = `standards:test-${i}`;
                const record = persistedData.find((row: any) => row.key === cacheKey);
                expect(record).toBeDefined();
                expect(JSON.parse(record.data)).toEqual(standards[i]);
            }
        });

        test('1.2-CACHE-004 should track access metadata (AC: 1)', async () => {
            // Given: A cached standard
            const testStandard = createStandard();
            const cacheKey = 'standards:metadata-test';
            const serializedData = JSON.stringify(testStandard);

            // When: I store and access the data multiple times
            await cacheBackend.set(cacheKey, serializedData);

            // Access the data several times
            for (let i = 0; i < 3; i++) {
                await cacheBackend.get(cacheKey);
            }

            // Force sync to update database
            await cacheBackend.forceSync();

            // Then: Access metadata should be tracked
            const metadata = await db.execute(
                'SELECT access_count, last_accessed FROM standards_cache WHERE key = ?',
                [cacheKey]
            );

            expect(metadata).toHaveLength(1);
            expect(metadata[0].access_count).toBeGreaterThan(0);
            expect(typeof metadata[0].last_accessed).toBe('number');
        });
    });

    describe('Cache Management', () => {
        test('1.2-CACHE-005 should provide extended statistics (AC: 1)', async () => {
            // Given: Multiple cached items with different access patterns
            const standards = Array.from({ length: 3 }, () => createStandard());

            for (let i = 0; i < standards.length; i++) {
                await cacheBackend.set(`standards:stats-${i}`, JSON.stringify(standards[i]));

                // Access some items more than others
                if (i < 2) {
                    await cacheBackend.get(`standards:stats-${i}`);
                    await cacheBackend.get(`standards:stats-${i}`);
                }
            }

            await cacheBackend.forceSync();

            // When: I get cache statistics
            const stats = await cacheBackend.getStatistics();

            // Then: Statistics should reflect usage patterns
            expect(stats.totalItems).toBe(3);
            expect(stats.hitCount).toBeGreaterThan(0);
            expect(stats.totalAccesses).toBeGreaterThan(0);
            expect(stats.averageAccessTime).toBeGreaterThanOrEqual(0);
        });

        test('1.2-CACHE-006 should invalidate cache by pattern (AC: 1)', async () => {
            // Given: Multiple cached standards with different key patterns
            const standards = Array.from({ length: 5 }, () => createStandard());

            await cacheBackend.set('standards:typescript:naming', JSON.stringify(standards[0]));
            await cacheBackend.set('standards:javascript:formatting', JSON.stringify(standards[1]));
            await cacheBackend.set('standards:typescript:types', JSON.stringify(standards[2]));
            await cacheBackend.set('other:cache:item', JSON.stringify(standards[3]));
            await cacheBackend.set('standards:python:style', JSON.stringify(standards[4]));

            await cacheBackend.forceSync();

            // When: I invalidate standards cache entries
            const invalidatedCount = await cacheBackend.invalidate('standards:*');

            // Then: Only standards cache entries should be invalidated
            expect(invalidatedCount).toBe(4); // standards: entries only

            // Non-matching entries should still exist
            const remainingData = await cacheBackend.get('other:cache:item');
            expect(remainingData).toBe(JSON.stringify(standards[3]));

            // Standards entries should be gone
            const standardsData = await cacheBackend.get('standards:typescript:naming');
            expect(standardsData).toBeNull();
        });
    });

    describe('Cache Performance', () => {
        test('1.2-CACHE-007 should handle large datasets efficiently (AC: 1)', async () => {
            // Given: A large number of standards to cache
            const largeStandardSet = Array.from({ length: 50 }, () => createCachedStandard());
            const startTime = Date.now();

            // When: I cache all standards
            for (const cachedStandard of largeStandardSet) {
                await cacheBackend.set(cachedStandard.cacheKey, JSON.stringify(cachedStandard));
            }

            const storeTime = Date.now() - startTime;

            // Then: Storage should complete within reasonable time
            expect(storeTime).toBeLessThan(5000); // 5 seconds max

            // And retrieval should also be fast
            const retrieveStartTime = Date.now();
            const retrievedStandards: string[] = [];

            for (const cachedStandard of largeStandardSet) {
                const data = await cacheBackend.get(cachedStandard.cacheKey);
                if (data) {
                    retrievedStandards.push(data);
                }
            }

            const retrieveTime = Date.now() - retrieveStartTime;
            expect(retrieveTime).toBeLessThan(1000); // 1 second max for retrieval
            expect(retrievedStandards).toHaveLength(50);
        });
    });
});