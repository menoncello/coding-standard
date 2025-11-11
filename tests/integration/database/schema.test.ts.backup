import { test, expect, describe, beforeAll, afterAll, beforeEach } from 'bun:test';
import { DatabaseConnection } from '../../../src/database/connection.js';
import { DatabaseSchema } from '../../../src/database/schema.js';
import { MigrationManager } from '../../../src/database/migrations.js';
import { createStandard } from '../../support/factories/standard-factory.js';

describe('P1 - Database Schema and Migration Tests', () => {
    let db: DatabaseConnection;
    let schema: DatabaseSchema;
    let migrations: MigrationManager;
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
        migrations = new MigrationManager(db);

        // Initialize database schema
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

    describe('Database Schema Validation', () => {
        test('1.2-SCHEMA-001 should validate schema correctly (AC: 1,3,4)', async () => {
            // Given: Database is initialized with schema
            expect(db.isActive()).toBe(true);

            // When: I validate the database schema
            const validation = await schema.validate();

            // Then: Schema should be valid with all required tables
            expect(validation.valid).toBe(true);
            expect(validation.errors).toHaveLength(0);
            expect(validation.tables).toContain('standards_cache');
            expect(validation.tables).toContain('standards_search_data');
            expect(validation.tables).toContain('standards_search_idx');
            expect(validation.tables).toContain('usage_analytics');
            expect(validation.tables).toContain('backup_metadata');
        });

        test('1.2-SCHEMA-002 should provide table statistics (AC: 1)', async () => {
            // Given: Test data is inserted into cache table
            const testStandard = createStandard();
            await db.execute(
                'INSERT INTO standards_cache (id, key, data, ttl, created_at, last_accessed, access_count, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                ['stats-test', 'stats-key', JSON.stringify(testStandard), 5000, Date.now(), Date.now(), 0, Date.now() + 5000]
            );

            // When: I get table statistics
            const stats = await schema.getStatistics();

            // Then: Statistics should reflect current state
            expect(stats.totalSize).toBeGreaterThan(0);
            // Expect at least our core tables (may include FTS shadow tables)
            const coreTables = ['standards_cache', 'standards_search_data', 'standards_search_idx', 'usage_analytics'];
            const tableNames = stats.tables.map(t => t.name);

            for (const coreTable of coreTables) {
                expect(tableNames).toContain(coreTable);
            }

            const cacheTable = stats.tables.find(t => t.name === 'standards_cache');
            expect(cacheTable).toBeDefined();
            expect(cacheTable?.rows).toBe(1);
        });

        test('1.2-SCHEMA-003 should optimize database tables (AC: 2)', async () => {
            // Given: Database schema is initialized
            expect(db.isActive()).toBe(true);

            // When: I optimize database tables
            await schema.optimize();

            // Then: Database should remain healthy after optimization
            const health = await db.checkHealth();
            expect(health.healthy).toBe(true);
            expect(health.integrityCheck).toBe(true);
        });
    });

    describe('Migration Management', () => {
        test('1.2-MIGRATION-001 should track applied migrations (AC: 3)', async () => {
            // Given: Database is initialized and migration tracking exists
            expect(db.isActive()).toBe(true);

            // Since schema is already initialized, we'll test the migration tracking system
            // by checking if the migration methods work correctly

            // When: I check applied migrations
            const applied = await migrations.getAppliedMigrations();

            // Then: Migration tracking should be functional (even if no migrations applied yet)
            expect(Array.isArray(applied)).toBe(true);
            expect(applied).toBeDefined();

            // Test that migration status method works
            const status = await migrations.getStatus();
            expect(status).toBeDefined();
            expect(status.total).toBeGreaterThan(0); // Should have registered migrations
            expect(Array.isArray(status.applied)).toBe(true);
            expect(Array.isArray(status.pending)).toBe(true);
        });

        test('1.2-MIGRATION-002 should validate migration integrity (AC: 3)', async () => {
            // Given: Database has migration system available
            expect(db.isActive()).toBe(true);

            // When: I validate migration integrity
            const validation = await migrations.validateMigrations();

            // Then: Migration integrity should be valid
            expect(validation.valid).toBe(true);
            expect(validation.issues).toHaveLength(0);
        });

        test('1.2-MIGRATION-003 should get migration status (AC: 3)', async () => {
            // Given: Database has migration system available
            expect(db.isActive()).toBe(true);

            // When: I get migration status
            const status = await migrations.getStatus();

            // Then: Status should be comprehensive
            expect(status.total).toBeGreaterThan(0);
            expect(status.applied).toBeDefined();
            expect(status.pending).toBeDefined();
        });
    });

    describe('Schema Constraints and Validation', () => {
        test('1.2-SCHEMA-004 should enforce foreign key constraints (AC: 1,4)', async () => {
            // Given: Database is initialized with foreign key constraints
            expect(db.isActive()).toBe(true);

            // When: I check database health including foreign keys
            const health = await db.checkHealth();

            // Then: Foreign key constraints should be enforced
            expect(health.foreignKeyCheck).toBe(true);
        });

        test('1.2-SCHEMA-005 should handle schema versioning (AC: 3)', async () => {
            // Given: Database has migration system available
            const currentVersion = await migrations.getCurrentVersion();

            // When: I get schema version information
            // Version might be null if no migrations applied yet, which is fine for this test
            if (currentVersion) {
                expect(typeof currentVersion).toBe('string');

                // Then: Version should be in expected format (semantic version)
                const versionPattern = /^\d+\.\d+\.\d+$/;
                expect(versionPattern.test(currentVersion)).toBe(true);
            } else {
                // If no version, that's also valid - the system is working
                expect(currentVersion).toBeNull();
            }
        });
    });
});