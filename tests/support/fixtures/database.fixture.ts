import { test as base, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { createStandard, createStandards, createCachedStandards } from '../factories/standard-factory.js';

// Types for fixture context
export interface DatabaseFixture {
    db: Database;
    testDbPath: string;
    isTempDb: boolean;
    cleanup: () => void;
}

export interface CacheFixture {
    cacheManager: any; // Will be CacheManager when implemented
    ttl: number;
    maxSize: number;
    cleanup: () => void;
}

export interface SearchFixture {
    ftsEnabled: boolean;
    indexReady: boolean;
    sampleData: any[];
    cleanup: () => void;
}

// Database fixture with auto-cleanup
export const test = base.extend<DatabaseFixture & CacheFixture & SearchFixture>({
    // Database fixture
    db: async ({}, use) => {
        // Create unique test database
        const testDbPath = `test-db-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.db`;
        const db = new Database(testDbPath);

        // Enable foreign keys and WAL mode for testing
        db.exec('PRAGMA foreign_keys = ON');
        db.exec('PRAGMA journal_mode = WAL');
        db.exec('PRAGMA synchronous = NORMAL');
        db.exec('PRAGMA cache_size = 10000');
        db.exec('PRAGMA temp_store = MEMORY');

        await use({
            db,
            testDbPath,
            isTempDb: true,
            cleanup: () => {
                db.close();
                // Clean up temp file if it exists
                try {
                    // Note: Bun doesn't have fs.unlink yet, so we rely on temp cleanup
                    console.log(`Database cleanup: ${testDbPath}`);
                } catch (error) {
                    // Ignore cleanup errors
                }
            }
        });
    },

    // Cache fixture
    cacheManager: async ({}, use) => {
        // This will fail until CacheManager is implemented with SQLite support
        const { CacheManager } = await import('../../src/cache/cache-manager.js');
        const cacheManager = new CacheManager({
            ttl: 3600000, // 1 hour
            maxSize: 1000,
            enableSQLite: true,
            databasePath: ':memory:'
        });

        await use({
            cacheManager,
            ttl: 3600000,
            maxSize: 1000,
            cleanup: () => {
                cacheManager.clear();
            }
        });
    },

    // Search fixture
    ftsEnabled: async ({}, use) => {
        // This will fail until FTS is implemented
        const { SearchIndex } = await import('../../src/cache/search-index.js');
        const searchIndex = new SearchIndex({
            enableFTS: true,
            ftsVersion: 'FTS5',
            ranking: 'BM25'
        });

        await use({
            ftsEnabled: true,
            indexReady: false,
            sampleData: createStandards(5),
            cleanup: () => {
                searchIndex.cleanup();
            }
        });
    }
});

// Helper functions for database fixture
export const createDatabaseSchema = (db: Database) => {
    // Create standards_cache table
    db.exec(`
        CREATE TABLE IF NOT EXISTS standards_cache (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cache_key TEXT UNIQUE NOT NULL,
            data TEXT NOT NULL,
            ttl INTEGER NOT NULL,
            access_count INTEGER DEFAULT 1,
            created_at INTEGER NOT NULL,
            last_accessed INTEGER NOT NULL,
            checksum TEXT
        );
    `);

    // Create FTS5 virtual table
    db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS standards_fts USING fts5(
            title,
            content,
            language,
            category,
            tags,
            author,
            version,
            content='standards_cache',
            content_rowid='id'
        );
    `);

    // Create indexes
    db.exec('CREATE INDEX IF NOT EXISTS idx_cache_key ON standards_cache(cache_key);');
    db.exec('CREATE INDEX IF NOT EXISTS idx_ttl ON standards_cache(ttl);');
    db.exec('CREATE INDEX IF NOT EXISTS idx_last_accessed ON standards_cache(last_accessed);');

    // Create triggers for FTS synchronization
    db.exec(`
        CREATE TRIGGER IF NOT EXISTS standards_fts_insert AFTER INSERT ON standards_cache
        BEGIN
            INSERT INTO standards_fts(rowid, title, content, language, category, tags, author, version)
            VALUES (new.id, new.title, new.content, new.language, new.category, new.tags, new.author, new.version);
        END;
    `);

    db.exec(`
        CREATE TRIGGER IF NOT EXISTS standards_fts_delete AFTER DELETE ON standards_cache
        BEGIN
            DELETE FROM standards_fts WHERE rowid = old.id;
        END;
    `);

    db.exec(`
        CREATE TRIGGER IF NOT EXISTS standards_fts_update AFTER UPDATE ON standards_cache
        BEGIN
            DELETE FROM standards_fts WHERE rowid = old.id;
            INSERT INTO standards_fts(rowid, title, content, language, category, tags, author, version)
            VALUES (new.id, new.title, new.content, new.language, new.category, new.tags, new.author, new.version);
        END;
    `);
};

// Data seeding helpers
export const seedDatabaseWithStandards = (db: Database, count: number = 10) => {
    const standards = createStandards(count);
    const stmt = db.prepare(`
        INSERT INTO standards_cache (cache_key, data, ttl, access_count, created_at, last_accessed, checksum)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    standards.forEach(standard => {
        const cacheKey = `standard:${standard.language}:${standard.category}:${standard.id}`;
        const data = JSON.stringify(standard);
        const ttl = Date.now() + 3600000; // 1 hour from now
        const now = Date.now();
        const checksum = Buffer.from(data).toString('base64').slice(0, 16);

        stmt.run(cacheKey, data, ttl, 1, now, now, checksum);
    });

    // Insert into FTS table
    const ftsStmt = db.prepare(`
        INSERT INTO standards_fts (rowid, title, content, language, category, tags, author, version)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    standards.forEach((standard, index) => {
        const lastId = db.lastInsertRowid as number;
        const rowid = lastId - standards.length + index + 1;
        ftsStmt.run(
            rowid,
            standard.title,
            standard.content,
            standard.language,
            standard.category,
            JSON.stringify(standard.tags),
            standard.author,
            standard.version
        );
    });

    return standards;
};

// Performance testing helpers
export const measureQueryPerformance = async <T>(
    queryFn: () => T | Promise<T>,
    iterations: number = 100
) => {
    const times: number[] = [];
    const results: T[] = [];

    for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        const result = await queryFn();
        const end = performance.now();

        times.push(end - start);
        results.push(result);
    }

    return {
        averageTime: times.reduce((a, b) => a + b, 0) / times.length,
        minTime: Math.min(...times),
        maxTime: Math.max(...times),
        p95Time: times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)],
        totalIterations: iterations,
        sampleResult: results[0]
    };
};

// Concurrency testing helpers
export const runConcurrentOperations = async <T>(
    operations: Array<() => T | Promise<T>>,
    maxConcurrency: number = 5
) => {
    const results: Array<{ index: number; result: T; error?: Error; duration: number }> = [];

    const executeOperation = async (operation: () => T | Promise<T>, index: number) => {
        const start = performance.now();
        try {
            const result = await operation();
            const duration = performance.now() - start;
            return { index, result, duration };
        } catch (error) {
            const duration = performance.now() - start;
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

// Database corruption helpers
export const simulateDatabaseCorruption = (db: Database) => {
    // Simulate corruption by writing invalid data
    try {
        // Write invalid data to cause corruption
        const corruptData = Buffer.from([0xFF, 0xFE, 0x00, 0x00]);
        // Note: This is for testing purposes only
        db.exec('PRAGMA writable_schema = ON');
        // Direct manipulation would be done here in a real corruption scenario
        db.exec('PRAGMA writable_schema = OFF');
    } catch (error) {
        // Expected to fail in normal circumstances
    }
};

export const validateDatabaseIntegrity = (db: Database) => {
    try {
        const result = db.query('PRAGMA integrity_check').get() as { integrity_check: string };
        return result.integrity_check === 'ok';
    } catch (error) {
        return false;
    }
};

// WAL mode helpers
export const enableWALMode = (db: Database) => {
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA synchronous = NORMAL');
    db.exec('PRAGMA wal_autocheckpoint = 1000');
};

export const getWALStatus = (db: Database) => {
    const journalMode = db.query('PRAGMA journal_mode').get() as { journal_mode: string };
    const walCheckpoint = db.query('PRAGMA wal_checkpoint(PASSIVE)').get() as any;

    return {
        enabled: journalMode.journal_mode === 'wal',
        checkpointMode: 'PASSIVE',
        ...walCheckpoint
    };
};

export const performWALCheckpoint = (db: Database, mode: 'PASSIVE' | 'FULL' | 'RESTART' = 'PASSIVE') => {
    const result = db.query(`PRAGMA wal_checkpoint(${mode})`).get() as any;
    return {
        success: true,
        pagesWal: result.wal,
        pagesCheckpointed: result.checkpointed,
        checkpointSize: result.checkpointed * 4096, // Approximate size
    };
};