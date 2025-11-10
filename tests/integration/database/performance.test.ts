import { test, expect, describe, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test';
import { DatabaseConnection } from '../../../src/database/connection.js';
import { DatabaseSchema } from '../../../src/database/schema.js';
import { SqliteCacheBackend } from '../../../src/database/cache-backend.js';
import { FtsSearchEngine } from '../../../src/cache/search-index.js';
import { createDatabasePerformanceManager } from '../../../src/database/performance.js';
import { createStandard, createLargeStandardsDataset } from '../../support/factories/standard-factory.js';

describe('P1 - Database Performance Tests', () => {
    let db: DatabaseConnection;
    let schema: DatabaseSchema;
    let cacheBackend: SqliteCacheBackend<string>;
    let searchEngine: FtsSearchEngine;
    let performance: ReturnType<typeof createDatabasePerformanceManager>;
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

        searchEngine = new FtsSearchEngine(db);
        performance = createDatabasePerformanceManager(db);
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

    describe('Database Connection Performance', () => {
        test('1.2-PERF-001 should initialize database under 100ms (AC: 4)', async () => {
            // Given: A new database file path
            const newDbPath = `./test-data-perf-${Date.now()}.db`;

            // When: I initialize a new database connection
            const startTime = Date.now();
            const newDb = new DatabaseConnection({
                path: newDbPath,
                walMode: true,
                foreignKeys: true,
                cacheSize: 1000,
                busyTimeout: 5000
            });

            await newDb.initialize();
            const initTime = Date.now() - startTime;

            await newDb.close();

            // Clean up test database
            const fs = require('node:fs');
            try {
                if (fs.existsSync(newDbPath)) fs.unlinkSync(newDbPath);
                if (fs.existsSync(`${newDbPath}-wal`)) fs.unlinkSync(`${newDbPath}-wal`);
                if (fs.existsSync(`${newDbPath}-shm`)) fs.unlinkSync(`${newDbPath}-shm`);
            } catch (error) {
                console.warn('Failed to cleanup perf test files:', error);
            }

            // Then: Database initialization should complete under 100ms
            expect(initTime).toBeLessThan(100);
        });

        test('1.2-PERF-002 should handle concurrent operations efficiently (AC: 2,4)', async () => {
            // Given: WAL mode is enabled for concurrency
            expect(db.isActive()).toBe(true);

            // When: I perform concurrent database operations
            const concurrentOperations = Array.from({ length: 20 }, async (_, index) => {
                const standard = createStandard();
                const startTime = Date.now();

                await db.transaction(async (connection) => {
                    await connection.execute(
                        'INSERT INTO standards_cache (id, key, data, ttl, created_at, last_accessed, access_count, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                        [`concurrent-${index}`, `key-${index}`, JSON.stringify(standard), 5000, Date.now(), Date.now(), 0, Date.now() + 5000]
                    );
                });

                return Date.now() - startTime;
            });

            const operationTimes = await Promise.all(concurrentOperations);
            const averageTime = operationTimes.reduce((a, b) => a + b, 0) / operationTimes.length;

            // Then: Concurrent operations should complete efficiently
            expect(averageTime).toBeLessThan(50); // Average under 50ms per operation
            expect(Math.max(...operationTimes)).toBeLessThan(200); // No operation over 200ms

            // Verify all operations completed successfully
            const result = await db.execute('SELECT COUNT(*) as count FROM standards_cache WHERE key LIKE "key-%"');
            expect(result[0].count).toBe(20);
        });
    });

    describe('Cache Performance', () => {
        test('1.2-PERF-003 should store and retrieve cached data under 10ms (AC: 1)', async () => {
            // Given: A standard to cache
            const testStandard = createStandard();
            const cacheKey = 'performance-test-standard';
            const serializedData = JSON.stringify(testStandard);

            // When: I store and retrieve cached data
            const storeStartTime = Date.now();
            await cacheBackend.set(cacheKey, serializedData);
            const storeTime = Date.now() - storeStartTime;

            const retrieveStartTime = Date.now();
            const cachedData = await cacheBackend.get(cacheKey);
            const retrieveTime = Date.now() - retrieveStartTime;

            // Then: Both operations should complete under 10ms
            expect(storeTime).toBeLessThan(10);
            expect(retrieveTime).toBeLessThan(10);
            expect(cachedData).toBe(serializedData);
        });

        test('1.2-PERF-004 should handle large cache datasets efficiently (AC: 1)', async () => {
            // Given: A large dataset of standards
            const largeStandardSet = createLargeStandardsDataset(100);
            const storeTimes: number[] = [];

            // When: I store all standards in cache
            for (let i = 0; i < largeStandardSet.length; i++) {
                const startTime = Date.now();
                await cacheBackend.set(`perf-test-${i}`, JSON.stringify(largeStandardSet[i]));
                storeTimes.push(Date.now() - startTime);
            }

            const averageStoreTime = storeTimes.reduce((a, b) => a + b, 0) / storeTimes.length;

            // Then: Average storage time should be reasonable
            expect(averageStoreTime).toBeLessThan(20); // Average under 20ms per item

            // Retrieval should also be efficient
            const retrieveTimes: number[] = [];
            for (let i = 0; i < largeStandardSet.length; i++) {
                const startTime = Date.now();
                const data = await cacheBackend.get(`perf-test-${i}`);
                retrieveTimes.push(Date.now() - startTime);
                expect(data).toBeDefined();
            }

            const averageRetrieveTime = retrieveTimes.reduce((a, b) => a + b, 0) / retrieveTimes.length;
            expect(averageRetrieveTime).toBeLessThan(5); // Average under 5ms for retrieval
        });
    });

    describe('Search Performance', () => {
        test('1.2-PERF-005 should perform FTS search under 100ms (AC: 2)', async () => {
            // Given: A large dataset of searchable standards
            const searchableStandards = createLargeStandardsDataset(200);

            for (const standard of searchableStandards) {
                await searchEngine.indexStandard(standard);
            }

            const searchQueries = [
                'typescript naming convention',
                'javascript function patterns',
                'python coding standards',
                'interface design principles',
                'error handling best practices',
                'performance optimization techniques',
                'security considerations',
                'testing methodologies'
            ];

            // When: I perform multiple search queries
            const searchTimes: number[] = [];
            const searchResults: any[] = [];

            for (const query of searchQueries) {
                const startTime = Date.now();
                const results = await searchEngine.search(query);
                const queryTime = Date.now() - startTime;

                searchTimes.push(queryTime);
                searchResults.push(results);

                // Each individual search should be under 100ms
                expect(queryTime).toBeLessThan(100);
                expect(results.queryTime).toBeLessThan(100);
            }

            // Then: Average search time should also be under 100ms
            const averageSearchTime = searchTimes.reduce((a, b) => a + b, 0) / searchTimes.length;
            expect(averageSearchTime).toBeLessThan(100);

            // All searches should return results (unless no matches exist)
            expect(searchResults.some(r => r.totalCount > 0)).toBe(true);
        });

        test('1.2-PERF-006 should maintain performance with complex queries (AC: 2)', async () => {
            // Given: Standards are indexed for searching
            const standards = createLargeStandardsDataset(100);
            for (const standard of standards) {
                await searchEngine.indexStandard(standard);
            }

            const complexQueries = [
                'typescript interface naming convention type annotation',
                'javascript function variable declaration arrow function',
                'python class method inheritance property decorator',
                'performance optimization async await promise callback'
            ];

            // When: I perform complex multi-term searches
            const complexSearchTimes: number[] = [];

            for (const query of complexQueries) {
                const startTime = Date.now();
                const results = await searchEngine.search(query);
                const queryTime = Date.now() - startTime;

                complexSearchTimes.push(queryTime);

                // Complex queries should still be under 100ms
                expect(queryTime).toBeLessThan(100);
                expect(results.queryTime).toBeLessThan(100);
            }

            // Then: Even complex queries should maintain performance
            const averageComplexSearchTime = complexSearchTimes.reduce((a, b) => a + b, 0) / complexSearchTimes.length;
            expect(averageComplexSearchTime).toBeLessThan(100);
        });
    });

    describe('Database Performance Monitoring', () => {
        test('1.2-PERF-007 should track and report performance metrics (AC: 2)', async () => {
            // Given: Performance monitoring is enabled
            expect(performance).toBeDefined();

            // When: I perform various database operations
            const standard = createStandard();

            await performance.measure('cache_set', async () => {
                await cacheBackend.set('metrics-test', JSON.stringify(standard));
            });

            await performance.measure('cache_get', async () => {
                await cacheBackend.get('metrics-test');
            });

            await performance.measure('search', async () => {
                await searchEngine.search('typescript');
            });

            // Then: Performance metrics should be available
            const metrics = await performance.getMetrics();
            expect(metrics.operations).toHaveProperty('cache_set');
            expect(metrics.operations).toHaveProperty('cache_get');
            expect(metrics.operations).toHaveProperty('search');

            // Each operation should have timing data
            for (const [operation, data] of Object.entries(metrics.operations)) {
                expect(data).toHaveProperty('count');
                expect(data).toHaveProperty('averageTime');
                expect(data).toHaveProperty('minTime');
                expect(data).toHaveProperty('maxTime');
                expect(data.count).toBeGreaterThan(0);
                expect(data.averageTime).toBeGreaterThanOrEqual(0);
            }
        });

        test('1.2-PERF-008 should identify performance bottlenecks (AC: 2)', async () => {
            // Given: Performance monitoring is tracking operations
            expect(performance).toBeDefined();

            // When: I perform operations with varying performance characteristics
            const standards = createLargeStandardsDataset(50);

            for (const standard of standards) {
                await performance.measure('bulk_cache', async () => {
                    await cacheBackend.set(`bulk-${standard.id}`, JSON.stringify(standard));
                });
            }

            for (const standard of standards.slice(0, 20)) {
                await performance.measure('search_index', async () => {
                    await searchEngine.indexStandard(standard);
                });
            }

            // Then: Performance analysis should identify patterns
            const analysis = await performance.analyzePerformance();
            expect(analysis.slowOperations).toBeDefined();
            expect(analysis.recommendations).toBeDefined();
            expect(analysis.overallScore).toBeGreaterThan(0);
            expect(analysis.overallScore).toBeLessThanOrEqual(100);

            // Should provide actionable recommendations
            if (analysis.slowOperations.length > 0) {
                expect(analysis.recommendations.length).toBeGreaterThan(0);
            }
        });
    });
});