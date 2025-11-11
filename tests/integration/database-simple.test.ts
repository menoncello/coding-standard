import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { DatabaseConnection } from '../../src/database/connection.js';
// Factory imports
import { DatabaseFactory } from '../../src/factories/database-factory.js';
import { LoggerFactory } from '../../src/utils/logger/logger-factory.js';

describe('Database Simple Tests', () => {
    // Test logger setup
const testLogger = LoggerFactory.createTestLogger(true);
    let db: DatabaseConnection;

    beforeAll(async () => {
        db = DatabaseFactory.createDatabaseConnection({
            path: './test-simple.db',
            walMode: true,
            foreignKeys: true,
            cacheSize: 1000,
            busyTimeout: 5000
        }, testLogger);

        await db.initialize();
    });

    afterAll(async () => {
        if (db) {
            await db.close();
        }
        // Clean up test files
        const fs = require('node:fs');
        try {
            if (fs.existsSync('./test-simple.db')) fs.unlinkSync('./test-simple.db');
            if (fs.existsSync('./test-simple.db-wal')) fs.unlinkSync('./test-simple.db-wal');
            if (fs.existsSync('./test-simple.db-shm')) fs.unlinkSync('./test-simple.db-shm');
        } catch (error) {
            testLogger.warn('Failed to cleanup test files:', error);
        }
    });

    test('should initialize database', () => {
        expect(db.isActive()).toBe(true);
    });

    test('should execute simple query', async () => {
        const result = await db.execute('SELECT 1 as test');
        expect(result).toHaveLength(1);
        expect(result[0].test).toBe(1);
    });

    test('should handle basic table operations', async () => {
        // Create a simple table
        await db.execute(`
            CREATE TABLE IF NOT EXISTS test_table (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                created_at INTEGER NOT NULL
            )
        `);

        // Insert data
        await db.execute(`
            INSERT INTO test_table (name, created_at) VALUES (?, ?)
        `, ['test_name', Date.now()]);

        // Query data
        const result = await db.execute('SELECT * FROM test_table WHERE name = ?', ['test_name']);
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('test_name');
    });

    test('should handle transactions', async () => {
        const result = await db.transaction(async (connection) => {
            await connection.execute('INSERT INTO test_table (name, created_at) VALUES (?, ?)',
                ['transaction_test', Date.now()]);

            const count = await connection.execute('SELECT COUNT(*) as count FROM test_table');
            return count[0].count;
        });

        expect(result).toBeGreaterThan(1);
    });
});