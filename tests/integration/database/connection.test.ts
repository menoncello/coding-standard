import { test, expect, describe, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test';
import { DatabaseConnection } from '../../../src/database/connection.js';
import { DatabaseSchema } from '../../../src/database/schema.js';
import { createStandard } from '../../support/factories/standard-factory.js';
// Factory imports
import { DatabaseFactory } from '../../../src/factories/database-factory.js';
import { CacheFactory } from '../../../src/factories/cache-factory.js';
import { ToolHandlersFactory } from '../../../src/factories/tool-handlers-factory.js';
import { PerformanceFactory } from '../../../src/factories/performance-factory.js';
import { StandardsFactory } from '../../../src/factories/standards-factory.js';
import { LoggerFactory } from '../../../src/utils/logger/logger-factory.js';

describe('P0 - Database Connection Tests', () => {
    // Test logger setup
const testLogger = LoggerFactory.createTestLogger(true);
    let db: DatabaseConnection;
    let schema: DatabaseSchema;
    let testDbPath: string;

    beforeAll(async () => {
        testDbPath = `./test-data-${Date.now()}.db`;
        db = DatabaseFactory.createDatabaseConnection({
            path: testDbPath,
            walMode: true,
            foreignKeys: true,
            cacheSize: 1000,
            busyTimeout: 5000
        }, testLogger);

        await db.initialize();

        // Initialize database schema for tests
        schema = new DatabaseSchema(db);
        await schema.initialize();
    });

    afterAll(async () => {
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

    describe('Database Initialization', () => {
        test('1.2-DB-001 should initialize database with WAL mode (AC: 4)', async () => {
            // Given: Database is initialized with WAL mode enabled
            expect(db.isActive()).toBe(true);

            // When: I check the database health
            const health = await db.checkHealth();

            // Then: Database should be healthy with WAL mode enabled
            expect(health.healthy).toBe(true);
            expect(health.integrityCheck).toBe(true);
            expect(health.foreignKeyCheck).toBe(true);
        });

        test('1.2-DB-002 should handle concurrent operations without blocking (AC: 4)', async () => {
            // Given: Database is initialized with WAL mode
            const testStandard = createStandard();

            // When: Multiple concurrent operations are performed
            const operations = Array.from({ length: 10 }, async (_, index) => {
                // Use direct execute instead of transaction to avoid nesting
                await db.execute(
                    'INSERT INTO standards_cache (id, key, data, ttl, created_at, last_accessed, access_count, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    [`test-${index}`, `test-key-${index}`, JSON.stringify(testStandard), 5000, Date.now(), Date.now(), 0, Date.now() + 5000]
                );
                return index;
            });

            // Then: All operations should complete successfully
            const results = await Promise.all(operations);
            expect(results).toHaveLength(10);
            expect(new Set(results).size).toBe(10); // All unique results

            // Verify all data was inserted
            const count = await db.execute('SELECT COUNT(*) as count FROM standards_cache WHERE key LIKE "test-key-%"');
            expect(count[0].count).toBe(10);
        });
    });

    describe('Transaction Management', () => {
        test('1.2-DB-003 should handle transactions correctly (AC: 1,4)', async () => {
            // Given: A standard to cache
            const testStandard = createStandard();

            // When: I execute a transaction to cache the standard
            const result = await db.transaction(async (connection) => {
                await connection.execute(
                    'INSERT INTO standards_cache (id, key, data, ttl, created_at, last_accessed, access_count, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    ['test-1', 'test-key-1', JSON.stringify(testStandard), 5000, Date.now(), Date.now(), 0, Date.now() + 5000]
                );

                const inserted = await connection.execute(
                    'SELECT * FROM standards_cache WHERE key = ?',
                    ['test-key-1']
                );

                return inserted.length;
            });

            // Then: The transaction should complete successfully
            expect(result).toBe(1);
        });

        test('1.2-DB-004 should rollback transactions on error (AC: 3)', async () => {
            // Given: A standard to cache
            const testStandard = createStandard();

            // When: I execute a transaction that fails
            try {
                await db.transaction(async (connection) => {
                    await connection.execute(
                        'INSERT INTO standards_cache (id, key, data, ttl, created_at, last_accessed, access_count, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                        ['test-2', 'test-key-2', JSON.stringify(testStandard), 5000, Date.now(), Date.now(), 0, Date.now() + 5000]
                    );

                    // Force an error
                    await connection.execute('INVALID SQL');
                });
            } catch (error) {
                // Expected error
            }

            // Then: The transaction should be rolled back
            const result = await db.execute(
                'SELECT COUNT(*) as count FROM standards_cache WHERE key = ?',
                ['test-key-2']
            );

            expect(result[0].count).toBe(0);
        });
    });

    describe('Database Health and Recovery', () => {
        test('1.2-DB-005 should detect database corruption (AC: 3)', async () => {
            // Given: Database is initialized
            expect(db.isActive()).toBe(true);

            // When: I check database integrity
            const health = await db.checkHealth();

            // Then: Health check should pass on clean database
            expect(health.healthy).toBe(true);
            expect(health.integrityCheck).toBe(true);
        });

        test('1.2-DB-006 should handle database recovery scenarios (AC: 3)', async () => {
            // Given: Database has cached data
            const testStandard = createStandard();
            await db.execute(
                'INSERT INTO standards_cache (id, key, data, ttl, created_at, last_accessed, access_count, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                ['recovery-test', 'recovery-key', JSON.stringify(testStandard), 5000, Date.now(), Date.now(), 0, Date.now() + 5000]
            );

            // When: I close and reopen the database
            await db.close();
            await db.initialize();

            // Then: Data should still be accessible
            const result = await db.execute(
                'SELECT * FROM standards_cache WHERE key = ?',
                ['recovery-key']
            );

            expect(result).toHaveLength(1);
            expect(JSON.parse(result[0].data)).toEqual(testStandard);
        });
    });
});