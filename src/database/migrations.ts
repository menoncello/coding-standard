import { DatabaseConnection } from './connection.js';
import { DatabaseSchema } from './schema.js';

export interface Migration {
    id: string;
    version: string;
    description: string;
    up: (db: DatabaseConnection) => Promise<void>;
    down: (db: DatabaseConnection) => Promise<void>;
    dependencies?: string[];
}

/**
 * Database migration manager
 */
export class MigrationManager {
    private db: DatabaseConnection;
    private migrations: Map<string, Migration> = new Map();

    constructor(db: DatabaseConnection) {
        this.db = db;
        this.registerMigrations();
    }

    /**
     * Register all available migrations
     */
    private registerMigrations(): void {
        const migrations: Migration[] = [
            {
                id: '001_create_initial_schema',
                version: '1.0.0',
                description: 'Create initial database schema with cache, search, and analytics tables',
                up: async (db) => {
                    const schema = new DatabaseSchema(db);
                    await schema.initialize();
                },
                down: async (db) => {
                    const schema = new DatabaseSchema(db);
                    await schema.drop();
                }
            },
            {
                id: '002_add_cache_optimizations',
                version: '1.0.1',
                description: 'Add cache optimization indexes and performance triggers',
                up: async (db) => {
                    await db.execute(`
                        CREATE INDEX IF NOT EXISTS idx_standards_cache_composite_query
                        ON standards_cache(technology, category, expires_at)
                    `);

                    await db.execute(`
                        CREATE INDEX IF NOT EXISTS idx_standards_cache_frequent_access
                        ON standards_cache(access_count DESC, last_accessed DESC)
                    `);

                    // Add trigger for automatic cache statistics
                    await db.execute(`
                        CREATE TRIGGER IF NOT EXISTS update_cache_stats
                        AFTER UPDATE ON standards_cache
                        WHEN NEW.access_count % 100 = 0
                        BEGIN
                            INSERT INTO usage_analytics (id, event_type, timestamp, duration, metadata)
                            VALUES (
                                hex(randomblob(16)),
                                'cache_stats',
                                (strftime('%s', 'now') * 1000),
                                0,
                                json_object(
                                    'key', NEW.key,
                                    'access_count', NEW.access_count,
                                    'technology', NEW.technology
                                )
                            );
                        END
                    `);
                },
                down: async (db) => {
                    await db.execute('DROP INDEX IF EXISTS idx_standards_cache_composite_query');
                    await db.execute('DROP INDEX IF EXISTS idx_standards_cache_frequent_access');
                    await db.execute('DROP TRIGGER IF EXISTS update_cache_stats');
                },
                dependencies: ['001_create_initial_schema']
            },
            {
                id: '003_enhance_fts_search',
                version: '1.0.2',
                description: 'Enhance FTS search with better tokenization and ranking',
                up: async (db) => {
                    // Drop existing FTS table
                    await db.execute('DROP TABLE IF EXISTS standards_search');

                    // Recreate with enhanced configuration
                    await db.execute(`
                        CREATE VIRTUAL TABLE standards_search USING fts5(
                            title,
                            description,
                            technology,
                            category,
                            rules,
                            content='standards_search_content',
                            content_rowid='id',
                            tokenize = 'porter unicode61 remove_diacritics 1',
                            rank = 'bm25(10.0, 5.0, 2.0, 1.0, 0.5)'
                        )
                    `);

                    // Add FTS-specific indexes
                    await db.execute(`
                        CREATE INDEX IF NOT EXISTS idx_standards_search_content_rank
                        ON standards_search_content(last_updated DESC)
                    `);

                    // Update triggers for enhanced FTS
                    await db.execute(`
                        CREATE TRIGGER standards_search_ai AFTER INSERT ON standards_search_content BEGIN
                            INSERT INTO standards_search(rowid, title, description, technology, category, rules)
                            VALUES (new.id, new.title, new.description, new.technology, new.category, new.rules);
                        END
                    `);

                    await db.execute(`
                        CREATE TRIGGER standards_search_ad AFTER DELETE ON standards_search_content BEGIN
                            INSERT INTO standards_search(standards_search, rowid, title, description, technology, category, rules)
                            VALUES ('delete', old.id, old.title, old.description, old.technology, old.category, old.rules);
                        END
                    `);

                    await db.execute(`
                        CREATE TRIGGER standards_search_au AFTER UPDATE ON standards_search_content BEGIN
                            INSERT INTO standards_search(standards_search, rowid, title, description, technology, category, rules)
                            VALUES ('delete', old.id, old.title, old.description, old.technology, old.category, old.rules);
                            INSERT INTO standards_search(rowid, title, description, technology, category, rules)
                            VALUES (new.id, new.title, new.description, new.technology, new.category, new.rules);
                        END
                    `);
                },
                down: async (db) => {
                    await db.execute('DROP TRIGGER IF EXISTS standards_search_ai');
                    await db.execute('DROP TRIGGER IF EXISTS standards_search_ad');
                    await db.execute('DROP TRIGGER IF EXISTS standards_search_au');
                    await db.execute('DROP INDEX IF EXISTS idx_standards_search_content_rank');

                    // Recreate basic FTS table
                    await db.execute(`
                        CREATE VIRTUAL TABLE standards_search USING fts5(
                            title,
                            description,
                            technology,
                            category,
                            rules,
                            content='standards_search_content',
                            content_rowid='id'
                        )
                    `);
                },
                dependencies: ['001_create_initial_schema']
            },
            {
                id: '004_add_analytics_partitioning',
                version: '1.0.3',
                description: 'Add analytics partitioning and retention policies',
                up: async (db) => {
                    // Add retention policy metadata
                    await db.execute(`
                        CREATE TABLE IF NOT EXISTS analytics_retention (
                            event_type TEXT PRIMARY KEY,
                            retention_days INTEGER NOT NULL DEFAULT 30,
                            max_records INTEGER,
                            created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
                        )
                    `);

                    // Set default retention policies
                    await db.execute(`
                        INSERT OR IGNORE INTO analytics_retention (event_type, retention_days, max_records) VALUES
                        ('cache_hit', 7, 100000),
                        ('cache_miss', 7, 50000),
                        ('search', 30, 500000),
                        ('validation', 30, 100000)
                    `);

                    // Add cleanup trigger
                    await db.execute(`
                        CREATE TRIGGER IF NOT EXISTS cleanup_old_analytics
                        AFTER INSERT ON usage_analytics
                        WHEN (SELECT COUNT(*) FROM usage_analytics) > 1000000
                        BEGIN
                            DELETE FROM usage_analytics
                            WHERE timestamp < (
                                SELECT MIN(timestamp)
                                FROM (
                                    SELECT timestamp,
                                           ROW_NUMBER() OVER (PARTITION BY event_type ORDER BY timestamp DESC) as rn
                                    FROM usage_analytics
                                )
                                WHERE rn > (SELECT max_records FROM analytics_retention WHERE event_type = NEW.event_type)
                            );
                        END
                    `);
                },
                down: async (db) => {
                    await db.execute('DROP TRIGGER IF EXISTS cleanup_old_analytics');
                    await db.execute('DROP TABLE IF EXISTS analytics_retention');
                },
                dependencies: ['001_create_initial_schema']
            },
            {
                id: '005_add_backup_metadata',
                version: '1.0.4',
                description: 'Add backup and recovery metadata tables',
                up: async (db) => {
                    await db.execute(`
                        CREATE TABLE IF NOT EXISTS backup_metadata (
                            id TEXT PRIMARY KEY,
                            backup_path TEXT NOT NULL,
                            backup_type TEXT NOT NULL CHECK (backup_type IN ('full', 'incremental', 'wal')),
                            backup_size INTEGER NOT NULL,
                            created_at INTEGER NOT NULL,
                            checksum TEXT NOT NULL,
                            status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'verified', 'corrupted')),
                            metadata TEXT
                        ) WITHOUT ROWID
                    `);

                    await db.execute(`
                        CREATE INDEX IF NOT EXISTS idx_backup_created_at ON backup_metadata(created_at DESC)
                    `);

                    await db.execute(`
                        CREATE INDEX IF NOT EXISTS idx_backup_status ON backup_metadata(status)
                    `);

                    // Add backup trigger
                    await db.execute(`
                        CREATE TRIGGER IF NOT EXISTS log_database_backup
                        AFTER INSERT ON backup_metadata
                        BEGIN
                            INSERT INTO usage_analytics (id, event_type, timestamp, duration, metadata)
                            VALUES (
                                hex(randomblob(16)),
                                'backup',
                                NEW.created_at,
                                0,
                                json_object(
                                    'backup_type', NEW.backup_type,
                                    'backup_size', NEW.backup_size,
                                    'status', NEW.status
                                )
                            );
                        END
                    `);
                },
                down: async (db) => {
                    await db.execute('DROP TRIGGER IF EXISTS log_database_backup');
                    await db.execute('DROP INDEX IF EXISTS idx_backup_status');
                    await db.execute('DROP INDEX IF EXISTS idx_backup_created_at');
                    await db.execute('DROP TABLE IF EXISTS backup_metadata');
                },
                dependencies: ['001_create_initial_schema']
            }
        ];

        for (const migration of migrations) {
            this.migrations.set(migration.id, migration);
        }
    }

    /**
     * Initialize migration tracking table
     */
    private async initializeMigrationTable(): Promise<void> {
        const sql = `
            CREATE TABLE IF NOT EXISTS schema_migrations (
                id TEXT PRIMARY KEY,
                version TEXT NOT NULL,
                description TEXT NOT NULL,
                applied_at INTEGER NOT NULL,
                execution_time INTEGER,
                checksum TEXT
            ) WITHOUT ROWID
        `;
        await this.db.execute(sql);

        // Create index for performance
        await this.db.execute(`
            CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at
            ON schema_migrations(applied_at DESC)
        `);
    }

    /**
     * Get all applied migrations
     */
    async getAppliedMigrations(): Promise<Array<{
        id: string;
        version: string;
        description: string;
        applied_at: number;
        execution_time: number;
        checksum: string;
    }>> {
        await this.initializeMigrationTable();

        const result = await this.db.execute(`
            SELECT id, version, description, applied_at, execution_time, checksum
            FROM schema_migrations
            ORDER BY applied_at ASC
        `);

        return result;
    }

    /**
     * Get pending migrations
     */
    async getPendingMigrations(): Promise<Migration[]> {
        const applied = await this.getAppliedMigrations();
        const appliedIds = new Set(applied.map(m => m.id));

        const pending: Migration[] = [];

        for (const [id, migration] of this.migrations) {
            if (!appliedIds.has(id)) {
                // Check dependencies
                if (migration.dependencies) {
                    const depsSatisfied = migration.dependencies.every(dep => appliedIds.has(dep));
                    if (!depsSatisfied) {
                        continue; // Skip migration with unmet dependencies
                    }
                }
                pending.push(migration);
            }
        }

        // Sort by version to ensure correct order
        return pending.sort((a, b) => a.version.localeCompare(b.version));
    }

    /**
     * Apply a single migration
     */
    async applyMigration(migration: Migration): Promise<void> {
        await this.initializeMigrationTable();

        const startTime = Date.now();

        try {
            await this.db.transaction(async (db) => {
                await migration.up(db);

                const executionTime = Date.now() - startTime;
                const checksum = this.generateMigrationChecksum(migration);

                await db.execute(`
                    INSERT INTO schema_migrations (id, version, description, applied_at, execution_time, checksum)
                    VALUES (?, ?, ?, ?, ?, ?)
                `, [migration.id, migration.version, migration.description, startTime, executionTime, checksum]);
            });

            console.log(`Migration ${migration.id} (${migration.version}) applied successfully in ${Date.now() - startTime}ms`);

        } catch (error) {
            console.error(`Failed to apply migration ${migration.id}: ${error}`);
            throw error;
        }
    }

    /**
     * Rollback a migration
     */
    async rollbackMigration(migration: Migration): Promise<void> {
        await this.initializeMigrationTable();

        try {
            await this.db.transaction(async (db) => {
                await migration.down(db);
                await db.execute('DELETE FROM schema_migrations WHERE id = ?', [migration.id]);
            });

            console.log(`Migration ${migration.id} rolled back successfully`);

        } catch (error) {
            console.error(`Failed to rollback migration ${migration.id}: ${error}`);
            throw error;
        }
    }

    /**
     * Apply all pending migrations
     */
    async migrate(): Promise<{
        applied: string[];
        alreadyApplied: string[];
        errors: string[];
    }> {
        const applied: string[] = [];
        const alreadyApplied: string[] = [];
        const errors: string[] = [];

        const appliedMigrations = await this.getAppliedMigrations();
        alreadyApplied.push(...appliedMigrations.map(m => m.id));

        const pending = await this.getPendingMigrations();

        for (const migration of pending) {
            try {
                await this.applyMigration(migration);
                applied.push(migration.id);
            } catch (error) {
                errors.push(`${migration.id}: ${error}`);
                break; // Stop on first error to maintain consistency
            }
        }

        return {
            applied,
            alreadyApplied,
            errors
        };
    }

    /**
     * Rollback the last applied migration
     */
    async rollback(): Promise<{
        rolledBack: string[];
        errors: string[];
    }> {
        const rolledBack: string[] = [];
        const errors: string[] = [];

        const applied = await this.getAppliedMigrations();

        if (applied.length === 0) {
            return { rolledBack, errors: ['No migrations to rollback'] };
        }

        const lastMigration = applied[applied.length - 1];
        const migration = this.migrations.get(lastMigration.id);

        if (!migration) {
            return { rolledBack, errors: [`Migration ${lastMigration.id} not found`] };
        }

        try {
            await this.rollbackMigration(migration);
            rolledBack.push(migration.id);
        } catch (error) {
            errors.push(`${migration.id}: ${error}`);
        }

        return { rolledBack, errors };
    }

    /**
     * Get migration status
     */
    async getStatus(): Promise<{
        current: string | null;
        pending: string[];
        applied: Array<{ id: string; version: string; description: string; applied_at: number }>;
        total: number;
    }> {
        const applied = await this.getAppliedMigrations();
        const pending = await this.getPendingMigrations();

        const current = applied.length > 0 ? applied[applied.length - 1].id : null;

        return {
            current,
            pending: pending.map(m => m.id),
            applied: applied.map(m => ({
                id: m.id,
                version: m.version,
                description: m.description,
                applied_at: m.applied_at
            })),
            total: this.migrations.size
        };
    }

    /**
     * Get current schema version
     */
    async getCurrentVersion(): Promise<string | null> {
        const applied = await this.getAppliedMigrations();
        return applied.length > 0 ? applied[applied.length - 1].version : null;
    }

    /**
     * Generate checksum for migration
     */
    private generateMigrationChecksum(migration: Migration): string {
        const content = `${migration.id}:${migration.version}:${migration.description}`;
        // Simple hash function - in production, use a proper hash like SHA-256
        let hash = 0;
        for (let i = 0; i < content.length; i++) {
            const char = content.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16);
    }

    /**
     * Validate migration integrity
     */
    async validateMigrations(): Promise<{
        valid: boolean;
        issues: string[];
    }> {
        const applied = await this.getAppliedMigrations();
        const issues: string[] = [];

        for (const appliedMigration of applied) {
            const migration = this.migrations.get(appliedMigration.id);

            if (!migration) {
                issues.push(`Applied migration ${appliedMigration.id} not found in registry`);
                continue;
            }

            const currentChecksum = this.generateMigrationChecksum(migration);
            if (appliedMigration.checksum !== currentChecksum) {
                issues.push(`Migration ${appliedMigration.id} checksum mismatch`);
            }
        }

        // Check for dependency violations
        const appliedIds = new Set(applied.map(m => m.id));
        for (const [id, migration] of this.migrations) {
            if (appliedIds.has(id) && migration.dependencies) {
                for (const dep of migration.dependencies) {
                    if (!appliedIds.has(dep)) {
                        issues.push(`Migration ${id} has unmet dependency: ${dep}`);
                    }
                }
            }
        }

        return {
            valid: issues.length === 0,
            issues
        };
    }
}