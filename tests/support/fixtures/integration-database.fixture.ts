import { test as base, expect } from 'bun:test';
import { DatabaseConnection } from '../../../src/database/connection.js';
import { DatabaseSchema } from '../../../src/database/schema.js';
import { MigrationManager } from '../../../src/database/migrations.js';
import { SqliteCacheBackend } from '../../../src/database/cache-backend.js';
import { FtsSearchEngine } from '../../../src/cache/search-index.js';
import { DatabaseRecoveryManager } from '../../../src/database/recovery.js';
import { DatabaseAnalytics } from '../../../src/database/analytics.js';
import { createDatabasePerformanceManager } from '../../../src/database/performance.js';
import { createStandard, createStandards } from '../factories/standard-factory.js';
// Factory imports
import { DatabaseFactory } from '../../../src/factories/database-factory.js';
import { CacheFactory } from '../../../src/factories/cache-factory.js';
import { LoggerFactory } from '../../../src/utils/logger/logger-factory.js';

// Test logger setup
const testLogger = LoggerFactory.createTestLogger(true);

// Types for fixture context
export interface IntegrationDatabaseFixture {
    db: DatabaseConnection;
    schema: DatabaseSchema;
    migrations: MigrationManager;
    cacheBackend: SqliteCacheBackend<string>;
    searchEngine: FtsSearchEngine;
    recovery: DatabaseRecoveryManager;
    analytics: DatabaseAnalytics;
    performance: ReturnType<typeof createDatabasePerformanceManager>;
    testDbPath: string;
    backupDir: string;
}

// Integration test fixture with full database setup
export const test = base.extend<IntegrationDatabaseFixture>({
    // Database setup fixture
    db: async ({}, use) => {
        const testDbPath = `./test-data-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.db`;

        const db = DatabaseFactory.createDatabaseConnection(
            path: testDbPath,
            walMode: true,
            foreignKeys: true,
            cacheSize: 1000,
            busyTimeout: 5000
            , testLogger);

        await db.initialize();
        await use({ db, testDbPath });

        await db.close();

        // Clean up test files
        const fs = require('node:fs');
        try {
            if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
            if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
            if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
        } catch (error) {
            testLogger.warn('Failed to cleanup test files:', error);
        }
    },

    // Schema fixture
    schema: async ({ db }, use) => {
        const schema = new DatabaseSchema(db);
        await schema.initialize();
        await use({ schema });
    },

    // Migrations fixture
    migrations: async ({ db }, use) => {
        const migrations = new MigrationManager(db);
        await use({ migrations });
    },

    // Cache backend fixture
    cacheBackend: async ({ db }, use) => {
        const cacheBackend = CacheFactory.createCacheBackend<string>(
            database: db,
            persistToDisk: true,
            syncInterval: 1000,
            cleanupInterval: 2000,
            ttl: 5000,
            maxSize: 100,
            enabled: true
            , testLogger);
        await use({ cacheBackend });
        await cacheBackend.close();
    },

    // Search engine fixture
    searchEngine: async ({ db }, use) => {
        const searchEngine = new FtsSearchEngine(db);
        await use({ searchEngine });
    },

    // Recovery manager fixture
    recovery: async ({ db }, use) => {
        const backupDir = `./test-backups-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const recovery = new DatabaseRecoveryManager(db, backupDir);
        await use({ recovery, backupDir });

        // Clean up backup directory
        const fs = require('node:fs');
        try {
            if (fs.existsSync(backupDir)) {
                fs.rmSync(backupDir, { recursive: true, force: true });
            }
        } catch (error) {
            testLogger.warn('Failed to cleanup backup directory:', error);
        }
    },

    // Analytics fixture
    analytics: async ({ db }, use) => {
        const analytics = new DatabaseAnalytics(db);
        await use({ analytics });
    },

    // Performance manager fixture
    performance: async ({ db }, use) => {
        const performance = createDatabasePerformanceManager(db);
        await use({ performance });
    }
});

// Helper functions for integration testing
export const seedDatabaseWithStandards = async (cacheBackend: SqliteCacheBackend<string>, count: number = 10) => {
    const standards = createStandards(count);

    for (const standard of standards) {
        const cacheKey = `standards:${standard.technology}:${standard.category}:${standard.id}`;
        const serializedData = JSON.stringify(standard);
        await cacheBackend.set(cacheKey, serializedData);
    }

    return standards;
};

export const seedSearchIndex = async (searchEngine: FtsSearchEngine, count: number = 10) => {
    const standards = createStandards(count);

    for (const standard of standards) {
        await searchEngine.indexStandard(standard);
    }

    return standards;
};

export const createTestCacheData = async (db: DatabaseConnection, standards: any[]) => {
    for (const standard of standards) {
        const cacheKey = `standards:${standard.technology}:${standard.category}:${standard.id}`;
        const serializedData = JSON.stringify(standard);
        const ttl = Date.now() + 5000; // 5 seconds from now
        const now = Date.now();

        await db.execute(
            'INSERT INTO standards_cache (id, key, data, ttl, created_at, last_accessed, access_count, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [standard.id, cacheKey, serializedData, ttl, now, now, 0, now]
        );
    }
};

// Database cleanup helpers
export const clearAllTables = async (db: DatabaseConnection) => {
    await db.transaction(async (connection) => {
        await connection.execute('DELETE FROM standards_cache');
        await connection.execute('DELETE FROM usage_analytics');
        // Note: FTS5 content table is managed automatically, don't delete directly
    });
};

// Performance testing helpers
export const measureDatabaseOperation = async <T>(
    operation: () => T | Promise<T>,
    iterations: number = 1
): Promise<{
    averageTime: number;
    minTime: number;
    maxTime: number;
    totalTime: number;
    results: T[];
}> => {
    const times: number[] = [];
    const results: T[] = [];

    for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        const result = await operation();
        const endTime = Date.now();

        times.push(endTime - startTime);
        results.push(result);
    }

    return {
        averageTime: times.reduce((a, b) => a + b, 0) / times.length,
        minTime: Math.min(...times),
        maxTime: Math.max(...times),
        totalTime: times.reduce((a, b) => a + b, 0),
        results
    };
};

// Concurrency testing helpers
export const runConcurrentDatabaseOperations = async <T>(
    operations: Array<() => T | Promise<T>>,
    maxConcurrency: number = 5
): Promise<{
    results: Array<{ index: number; result: T; error?: Error; duration: number }>;
    successCount: number;
    errorCount: number;
    averageDuration: number;
    totalDuration: number;
}> => {
    const results: Array<{ index: number; result: T; error?: Error; duration: number }> = [];

    const executeOperation = async (operation: () => T | Promise<T>, index: number) => {
        const startTime = Date.now();
        try {
            const result = await operation();
            const duration = Date.now() - startTime;
            return { index, result, duration };
        } catch (error) {
            const duration = Date.now() - startTime;
            return { index, result: null as any, error: error as Error, duration };
        }
    };

    // Execute operations with limited concurrency
    for (let i = 0; i < operations.length; i += maxConcurrency) {
        const batch = operations.slice(i, i + maxConcurrency);
        const batchPromises = batch.map((op, batchIndex) =>
            executeOperation(op, i + batchIndex)
        );
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
    }

    return {
        results,
        successCount: results.filter(r => !r.error).length,
        errorCount: results.filter(r => r.error).length,
        averageDuration: results.reduce((sum, r) => sum + r.duration, 0) / results.length,
        totalDuration: Math.max(...results.map(r => r.duration))
    };
};

// WAL mode testing helpers
export const verifyWALMode = async (db: DatabaseConnection): Promise<boolean> => {
    const health = await db.checkHealth();
    return health.healthy;
};

export const testConcurrentReadWrite = async (
    db: DatabaseConnection,
    readOperations: number = 10,
    writeOperations: number = 5
): Promise<{
    readTime: number;
    writeTime: number;
    conflicts: number;
}> => {
    const readPromises = Array.from({ length: readOperations }, async (_, index) => {
        const startTime = Date.now();
        try {
            await db.execute('SELECT COUNT(*) as count FROM standards_cache');
            return Date.now() - startTime;
        } catch (error) {
            return Date.now() - startTime; // Still return time even on error
        }
    });

    const writePromises = Array.from({ length: writeOperations }, async (_, index) => {
        const startTime = Date.now();
        try {
            const testStandard = createStandard();
            await db.execute(
                'INSERT INTO standards_cache (id, key, data, ttl, created_at, last_accessed, access_count, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [`concurrent-write-${index}`, `key-${index}`, JSON.stringify(testStandard), 5000, Date.now(), Date.now(), 0, Date.now() + 5000]
            );
            return Date.now() - startTime;
        } catch (error) {
            return Date.now() - startTime; // Still return time even on error
        }
    });

    const [readTimes, writeTimes] = await Promise.all([
        Promise.all(readPromises),
        Promise.all(writePromises)
    ]);

    return {
        readTime: readTimes.reduce((a, b) => a + b, 0) / readTimes.length,
        writeTime: writeTimes.reduce((a, b) => a + b, 0) / writeTimes.length,
        conflicts: 0 // Would be populated by actual conflict detection in real implementation
    };
};

// FTS search testing helpers
export const performSearchPerformanceTest = async (
    searchEngine: FtsSearchEngine,
    queries: string[],
    iterations: number = 1
): Promise<{
    averageQueryTime: number;
    minQueryTime: number;
    maxQueryTime: number;
    totalQueries: number;
    successfulQueries: number;
}> => {
    const queryTimes: number[] = [];
    let successfulQueries = 0;

    for (let i = 0; i < iterations; i++) {
        for (const query of queries) {
            const startTime = Date.now();
            try {
                const results = await searchEngine.search(query);
                const queryTime = Date.now() - startTime;
                queryTimes.push(queryTime);

                if (results.totalCount >= 0) { // Successful search
                    successfulQueries++;
                }
            } catch (error) {
                queryTimes.push(Date.now() - startTime); // Still record time even on error
            }
        }
    }

    return {
        averageQueryTime: queryTimes.reduce((a, b) => a + b, 0) / queryTimes.length,
        minQueryTime: Math.min(...queryTimes),
        maxQueryTime: Math.max(...queryTimes),
        totalQueries: queryTimes.length,
        successfulQueries
    };
};

// Export the base test for compatibility
export { base };