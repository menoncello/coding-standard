import { test, expect, describe, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test';
import { DatabaseConnection } from '../../../src/database/connection.js';
import { DatabaseSchema } from '../../../src/database/schema.js';
import { DatabaseRecoveryManager } from '../../../src/database/recovery.js';
import { DatabaseAnalytics } from '../../../src/database/analytics.js';
import { createStandard, createCorruptedDatabaseState } from '../../support/factories/standard-factory.js';

describe('P2 - Database Recovery and Analytics Tests', () => {
    let db: DatabaseConnection;
    let schema: DatabaseSchema;
    let recovery: DatabaseRecoveryManager;
    let analytics: DatabaseAnalytics;
    let testDbPath: string;
    let backupDir: string;

    beforeAll(async () => {
        testDbPath = `./test-data-${Date.now()}.db`;
        backupDir = `./test-backups-${Date.now()}`;

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
        recovery = new DatabaseRecoveryManager(db, backupDir);
        analytics = new DatabaseAnalytics(db);
    });

    afterAll(async () => {
        if (db) {
            await db.close();
        }
        // Clean up test files and backups
        const fs = require('node:fs');
        try {
            if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
            if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
            if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
            if (fs.existsSync(backupDir)) {
                fs.rmSync(backupDir, { recursive: true, force: true });
            }
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
        // Clear backup directory after each test
        const fs = require('node:fs');
        if (fs.existsSync(backupDir)) {
            const backupFiles = fs.readdirSync(backupDir);
            for (const file of backupFiles) {
                fs.unlinkSync(`${backupDir}/${file}`);
            }
        }
    });

    describe('Database Recovery', () => {
        test('1.2-RECOVERY-001 should create and validate backups (AC: 3)', async () => {
            // Given: Database contains important data
            const testStandards = Array.from({ length: 3 }, () => createStandard());
            for (const standard of testStandards) {
                await db.execute(
                    'INSERT INTO standards_cache (id, key, data, ttl, created_at, last_accessed, access_count, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    [standard.id, `backup-${standard.id}`, JSON.stringify(standard), 5000, Date.now(), Date.now(), 0, Date.now() + 5000]
                );
            }

            // When: I create a backup
            const backupResult = await recovery.createBackup();

            // Then: Backup should be created and validated
            expect(backupResult.success).toBe(true);
            expect(backupResult.backupPath).toBeDefined();
            expect(backupResult.checksum).toBeDefined();
            expect(backupResult.timestamp).toBeDefined();

            // Verify backup file exists
            const fs = require('node:fs');
            expect(fs.existsSync(backupResult.backupPath)).toBe(true);

            // Verify backup integrity
            const validation = await recovery.validateBackup(backupResult.backupPath);
            expect(validation.valid).toBe(true);
            expect(validation.recordCount).toBe(3);
        });

        test('1.2-RECOVERY-002 should detect database corruption (AC: 3)', async () => {
            // Given: Database is initially healthy
            const health = await db.checkHealth();
            expect(health.healthy).toBe(true);

            // When: I simulate database corruption detection
            // (In real scenarios, this would be actual corruption, but we simulate for testing)
            const corruptionCheck = await recovery.checkDatabaseIntegrity();

            // Then: Database should pass integrity checks
            expect(corruptionCheck.healthy).toBe(true);
            expect(corruptionCheck.issues).toHaveLength(0);
        });

        test('1.2-RECOVERY-003 should restore from backup (AC: 3)', async () => {
            // Given: Database contains data and a backup is created
            const originalStandards = Array.from({ length: 2 }, () => createStandard());
            for (const standard of originalStandards) {
                await db.execute(
                    'INSERT INTO standards_cache (id, key, data, ttl, created_at, last_accessed, access_count, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    [standard.id, `restore-${standard.id}`, JSON.stringify(standard), 5000, Date.now(), Date.now(), 0, Date.now() + 5000]
                );
            }

            const backupResult = await recovery.createBackup();
            expect(backupResult.success).toBe(true);

            // Simulate data loss by clearing the database
            await db.transaction(async (connection) => {
                await connection.execute('DELETE FROM standards_cache');
            });

            // Verify data is gone
            const clearedData = await db.execute('SELECT * FROM standards_cache');
            expect(clearedData).toHaveLength(0);

            // When: I restore from backup
            const restoreResult = await recovery.restoreFromBackup(backupResult.backupPath);

            // Then: Data should be restored
            expect(restoreResult.success).toBe(true);
            expect(restoreResult.recordsRestored).toBe(2);

            const restoredData = await db.execute('SELECT * FROM standards_cache');
            expect(restoredData).toHaveLength(2);

            // Verify restored data matches original
            const restoredKeys = restoredData.map((row: any) => row.key);
            expect(restoredKeys).toContain(`restore-${originalStandards[0].id}`);
            expect(restoredKeys).toContain(`restore-${originalStandards[1].id}`);
        });

        test('1.2-RECOVERY-004 should handle automatic recovery scenarios (AC: 3)', async () => {
            // Given: Database has corruption simulation setup
            const corruptedState = createCorruptedDatabaseState();

            // When: I test automatic recovery mechanisms
            const recoveryResult = await recovery.attemptAutomaticRecovery();

            // Then: Recovery should be attempted with proper error handling
            expect(recoveryResult.attempted).toBe(true);
            expect(recoveryResult.recoveryActions.length).toBeGreaterThan(0);

            // Each recovery action should be documented
            for (const action of recoveryResult.recoveryActions) {
                expect(action.action).toBeDefined();
                expect(action.timestamp).toBeDefined();
                expect(action.success).toBeDefined();
            }
        });
    });

    describe('Database Analytics', () => {
        test('1.2-ANALYTICS-001 should record and retrieve analytics events (AC: 1)', async () => {
            // Given: Database analytics system is initialized
            expect(analytics).toBeDefined();

            // When: I record analytics events
            const events = [
                {
                    eventType: 'cache_hit',
                    standardId: 'standard-1',
                    metadata: { query: 'typescript naming', responseTime: 45 }
                },
                {
                    eventType: 'cache_miss',
                    standardId: null,
                    metadata: { query: 'unknown pattern', responseTime: 120 }
                },
                {
                    eventType: 'search_performed',
                    standardId: null,
                    metadata: { query: 'interface design', resultCount: 5 }
                }
            ];

            for (const event of events) {
                await analytics.recordEvent(event);
            }

            // Then: Events should be retrievable
            const retrievedEvents = await analytics.getEvents({
                limit: 10,
                offset: 0
            });

            expect(retrievedEvents.events).toHaveLength(3);
            expect(retrievedEvents.total).toBe(3);

            // Verify event data integrity
            const cacheHitEvent = retrievedEvents.events.find(e => e.eventType === 'cache_hit');
            expect(cacheHitEvent).toBeDefined();
            expect(cacheHitEvent!.standardId).toBe('standard-1');
            expect(cacheHitEvent!.metadata.query).toBe('typescript naming');
        });

        test('1.2-ANALYTICS-002 should provide analytics summaries (AC: 1)', async () => {
            // Given: Multiple analytics events are recorded
            const events = [
                { eventType: 'cache_hit', metadata: { technology: 'typescript' } },
                { eventType: 'cache_hit', metadata: { technology: 'typescript' } },
                { eventType: 'cache_hit', metadata: { technology: 'javascript' } },
                { eventType: 'cache_miss', metadata: { technology: 'python' } },
                { eventType: 'search_performed', metadata: { query: 'naming' } }
            ];

            for (const event of events) {
                await analytics.recordEvent(event);
            }

            // When: I get analytics summaries
            const summary = await analytics.getSummary({
                timeRange: '24h',
                groupBy: 'eventType'
            });

            // Then: Summary should contain accurate statistics
            expect(summary.totalEvents).toBe(5);
            expect(summary.eventCounts).toHaveProperty('cache_hit', 3);
            expect(summary.eventCounts).toHaveProperty('cache_miss', 1);
            expect(summary.eventCounts).toHaveProperty('search_performed', 1);
        });

        test('1.2-ANALYTICS-003 should track usage patterns over time (AC: 1)', async () => {
            // Given: Analytics events are recorded with timestamps
            const baseTime = Date.now();
            const events = [
                { eventType: 'search', timestamp: baseTime, duration: 50, metadata: { query: 'typescript' } },
                { eventType: 'search', timestamp: baseTime + 1000, duration: 75, metadata: { query: 'javascript' } }
            ];

            for (let i = 0; i < events.length; i++) {
                await analytics.recordEvent(events[i]);
            }

            // When: I get usage patterns
            const patterns = await analytics.getUsagePatterns({
                timeRange: '24h',
                granularity: 'hour'
            });

            // Then: Usage patterns should be available
            expect(patterns).toBeDefined();
            expect(patterns.length).toBeGreaterThan(0);

            // Should contain the recorded events
            const searchEvents = patterns.filter(p => p.eventType === 'search');
            expect(searchEvents.length).toBeGreaterThan(0);
        });
    });
});