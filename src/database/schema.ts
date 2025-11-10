import { DatabaseConnection } from './connection.js';
import { CacheSchema, FtsSchema, AnalyticsSchema } from '../types/database.js';

/**
 * Database schema definitions and migration support
 */
export class DatabaseSchema {
    private db: DatabaseConnection;

    constructor(db: DatabaseConnection) {
        this.db = db;
    }

    /**
     * Initialize all database tables
     */
    async initialize(): Promise<void> {
        await this.db.transaction(async (connection) => {
            await this.createStandardsCacheTable(connection);
            await this.createStandardsSearchTable(connection);
            await this.createUsageAnalyticsTable(connection);
            await this.createBackupMetadataTable(connection);
            await this.createIndexes(connection);
            await this.createTriggers(connection);
        });
    }

    /**
     * Create standards_cache table with TTL support
     */
    private async createStandardsCacheTable(db: DatabaseConnection): Promise<void> {
        const sql = `
            CREATE TABLE IF NOT EXISTS standards_cache (
                id TEXT PRIMARY KEY,
                key TEXT UNIQUE NOT NULL,
                data TEXT NOT NULL,
                ttl INTEGER NOT NULL,
                created_at INTEGER NOT NULL,
                last_accessed INTEGER NOT NULL,
                access_count INTEGER DEFAULT 0,
                expires_at INTEGER NOT NULL,
                technology TEXT,
                category TEXT,
                standard_id TEXT
            ) WITHOUT ROWID
        `;
        await db.execute(sql);
    }

    /**
     * Create FTS5 virtual table for full-text search
     */
    private async createStandardsSearchTable(db: DatabaseConnection): Promise<void> {
        // Drop all existing tables to ensure clean state
        await db.execute(`DROP TABLE IF EXISTS standards_search_idx`);
        await db.execute(`DROP TABLE IF EXISTS standards_search_data`);
        await db.execute(`DROP TABLE IF EXISTS standards_search`);

        // Create content table
        const contentSql = `
            CREATE TABLE standards_search_data (
                id INTEGER PRIMARY KEY,
                standard_id TEXT UNIQUE NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                technology TEXT NOT NULL,
                category TEXT NOT NULL,
                rules TEXT NOT NULL,
                last_updated TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )
        `;
        await db.execute(contentSql);

        // Create standalone FTS5 virtual table (no content parameter)
        const ftsSql = `
            CREATE VIRTUAL TABLE standards_search_idx USING fts5(
                standard_id,
                title,
                description,
                technology,
                category,
                rules,
                tokenize = 'porter unicode61 remove_diacritics 1'
            )
        `;
        await db.execute(ftsSql);
    }

    /**
     * Create usage_analytics table for performance monitoring
     */
    private async createUsageAnalyticsTable(db: DatabaseConnection): Promise<void> {
        const sql = `
            CREATE TABLE IF NOT EXISTS usage_analytics (
                id TEXT PRIMARY KEY,
                event_type TEXT NOT NULL CHECK (event_type IN ('cache_hit', 'cache_miss', 'search', 'validation')),
                timestamp INTEGER NOT NULL,
                duration INTEGER NOT NULL,
                metadata TEXT,
                user_id TEXT,
                session_id TEXT,
                created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
            ) WITHOUT ROWID
        `;
        await db.execute(sql);
    }

    /**
     * Create backup_metadata table for tracking backups
     */
    private async createBackupMetadataTable(db: DatabaseConnection): Promise<void> {
        const sql = `
            CREATE TABLE IF NOT EXISTS backup_metadata (
                id TEXT PRIMARY KEY,
                backup_path TEXT NOT NULL,
                backup_type TEXT NOT NULL CHECK (backup_type IN ('full', 'incremental')),
                backup_size INTEGER NOT NULL,
                created_at INTEGER NOT NULL,
                checksum TEXT NOT NULL,
                status TEXT NOT NULL CHECK (status IN ('created', 'verified', 'restored', 'deleted')),
                metadata TEXT,
                execution_time INTEGER
            ) WITHOUT ROWID
        `;
        await db.execute(sql);
    }

    /**
     * Create database indexes for performance
     */
    private async createIndexes(db: DatabaseConnection): Promise<void> {
        const indexes = [
            // Cache table indexes
            'CREATE INDEX IF NOT EXISTS idx_standards_cache_key ON standards_cache(key)',
            'CREATE INDEX IF NOT EXISTS idx_standards_cache_expires_at ON standards_cache(expires_at)',
            'CREATE INDEX IF NOT EXISTS idx_standards_cache_technology ON standards_cache(technology)',
            'CREATE INDEX IF NOT EXISTS idx_standards_cache_category ON standards_cache(category)',
            'CREATE INDEX IF NOT EXISTS idx_standards_cache_last_accessed ON standards_cache(last_accessed)',
            'CREATE INDEX IF NOT EXISTS idx_standards_cache_standard_id ON standards_cache(standard_id)',

            // Search content table indexes
            'CREATE INDEX IF NOT EXISTS idx_standards_search_technology ON standards_search_data(technology)',
            'CREATE INDEX IF NOT EXISTS idx_standards_search_category ON standards_search_data(category)',
            'CREATE INDEX IF NOT EXISTS idx_standards_search_standard_id ON standards_search_data(standard_id)',
            'CREATE INDEX IF NOT EXISTS idx_standards_search_last_updated ON standards_search_data(last_updated)',

            // Analytics table indexes
            'CREATE INDEX IF NOT EXISTS idx_usage_analytics_event_type ON usage_analytics(event_type)',
            'CREATE INDEX IF NOT EXISTS idx_usage_analytics_timestamp ON usage_analytics(timestamp)',
            'CREATE INDEX IF NOT EXISTS idx_usage_analytics_user_id ON usage_analytics(user_id)',
            'CREATE INDEX IF NOT EXISTS idx_usage_analytics_session_id ON usage_analytics(session_id)',
            'CREATE INDEX IF NOT EXISTS idx_usage_analytics_created_at ON usage_analytics(created_at)',

            // Composite indexes for common queries
            'CREATE INDEX IF NOT EXISTS idx_cache_tech_category ON standards_cache(technology, category)',
            'CREATE INDEX IF NOT EXISTS idx_search_tech_category ON standards_search_data(technology, category)',
            'CREATE INDEX IF NOT EXISTS idx_analytics_event_timestamp ON usage_analytics(event_type, timestamp)'
        ];

        for (const index of indexes) {
            await db.execute(index);
        }
    }

    /**
     * Create database triggers for automatic maintenance
     */
    private async createTriggers(db: DatabaseConnection): Promise<void> {
        const triggers = [
            // Auto-update last_accessed and access_count for cache entries
            `CREATE TRIGGER IF NOT EXISTS update_cache_access_on_read
                AFTER SELECT ON standards_cache
                WHEN NEW.last_accessed IS NULL OR NEW.last_accessed < (strftime('%s', 'now') * 1000) - 1000
                BEGIN
                    UPDATE standards_cache
                    SET last_accessed = (strftime('%s', 'now') * 1000),
                        access_count = access_count + 1
                    WHERE id = OLD.id;
                END`,

            // Auto-cleanup expired cache entries
            `CREATE TRIGGER IF NOT EXISTS cleanup_expired_cache
                AFTER INSERT ON standards_cache
                WHEN NEW.expires_at < (strftime('%s', 'now') * 1000)
                BEGIN
                    DELETE FROM standards_cache WHERE expires_at < (strftime('%s', 'now') * 1000);
                END`,

            // Log cache operations for analytics
            `CREATE TRIGGER IF NOT EXISTS log_cache_hit
                AFTER UPDATE ON standards_cache
                WHEN NEW.access_count > OLD.access_count
                BEGIN
                    INSERT INTO usage_analytics (id, event_type, timestamp, duration, metadata)
                    VALUES (
                        hex(randomblob(16)),
                        'cache_hit',
                        (strftime('%s', 'now') * 1000),
                        0,
                        json_object('key', NEW.key, 'technology', NEW.technology, 'category', NEW.category)
                    );
                END`,

            // Log search operations
            `CREATE TRIGGER IF NOT EXISTS log_search_operation
                AFTER INSERT ON usage_analytics
                WHEN NEW.event_type = 'search'
                BEGIN
                    UPDATE standards_search_data
                    SET updated_at = (strftime('%s', 'now') * 1000)
                    WHERE standard_id = (
                        SELECT json_extract(NEW.metadata, '$.standard_id')
                        WHERE json_extract(NEW.metadata, '$.standard_id') IS NOT NULL
                    );
                END`
        ];

        // Note: Triggers are disabled for simplicity and to avoid shadow table conflicts
        // Cache analytics and maintenance will be handled programmatically
        // Uncomment the following lines if you want to enable triggers:
        // for (const trigger of triggers) {
        //     await db.execute(trigger);
        // }
    }

    /**
     * Validate table structures
     */
    async validate(): Promise<{
        valid: boolean;
        errors: string[];
        tables: string[];
        indexes: string[];
        triggers: string[];
    }> {
        const errors: string[] = [];
        const tables: string[] = [];
        const indexes: string[] = [];
        const triggers: string[] = [];

        try {
            // Check required tables
            const requiredTables = ['standards_cache', 'standards_search_data', 'standards_search_idx', 'usage_analytics', 'backup_metadata'];
            const tableResults = await this.db.execute(`
                SELECT name FROM sqlite_master
                WHERE type='table' AND name IN (${requiredTables.map(() => '?').join(',')})
            `, requiredTables);

            const foundTables = tableResults.map((row: any) => row.name);
            tables.push(...foundTables);

            for (const table of requiredTables) {
                if (!foundTables.includes(table)) {
                    errors.push(`Missing required table: ${table}`);
                }
            }

            // Check FTS virtual table
            const ftsCheck = await this.db.execute(`
                SELECT sql FROM sqlite_master
                WHERE type='table' AND name='standards_search' AND sql LIKE '%VIRTUAL TABLE%'
            `);

            if (ftsCheck.length === 0) {
                errors.push('FTS5 virtual table not found or not properly configured');
            }

            // Check important indexes
            const requiredIndexes = [
                'idx_standards_cache_key',
                'idx_standards_cache_expires_at',
                'idx_standards_search_technology',
                'idx_usage_analytics_timestamp'
            ];

            const indexResults = await this.db.execute(`
                SELECT name FROM sqlite_master
                WHERE type='index' AND name IN (${requiredIndexes.map(() => '?').join(',')})
            `, requiredIndexes);

            const foundIndexes = indexResults.map((row: any) => row.name);
            indexes.push(...foundIndexes);

            for (const index of requiredIndexes) {
                if (!foundIndexes.includes(index)) {
                    errors.push(`Missing important index: ${index}`);
                }
            }

            // Note: FTS triggers are not used with FTS5 content parameter
            // No custom triggers needed for this implementation
            const triggerResults = await this.db.execute(`
                SELECT name FROM sqlite_master WHERE type='trigger'
            `);
            triggers.push(...triggerResults.map((row: any) => row.name));

            // Check foreign key constraints
            const fkCheck = await this.db.execute('PRAGMA foreign_key_check');
            if (fkCheck.length > 0) {
                errors.push(`Foreign key violations detected: ${fkCheck.length}`);
            }

            return {
                valid: errors.length === 0,
                errors,
                tables,
                indexes,
                triggers
            };

        } catch (error) {
            errors.push(`Schema validation failed: ${error}`);
            return {
                valid: false,
                errors,
                tables,
                indexes,
                triggers
            };
        }
    }

    /**
     * Get table statistics
     */
    async getStatistics(): Promise<{
        tables: Array<{ name: string; rows: number; size: number }>;
        totalSize: number;
    }> {
        const tables = await this.db.execute(`
            SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'
        `);

        const stats = [];

        for (const table of tables) {
            const countResult = await this.db.execute(`SELECT COUNT(*) as count FROM ${table.name}`);
            const sizeResult = await this.db.execute(`
                SELECT SUM(pgsize) as size FROM dbstat WHERE name = ?
            `, [table.name]);

            stats.push({
                name: table.name,
                rows: countResult[0].count,
                size: sizeResult[0].size || 0
            });
        }

        const totalSize = await this.db.execute(`
            SELECT SUM(pgsize) as size FROM dbstat
        `);

        return {
            tables: stats,
            totalSize: totalSize[0].size || 0
        };
    }

    /**
     * Optimize database tables
     */
    async optimize(): Promise<void> {
        // Vacuum to rebuild database and reclaim space (cannot run in transaction)
        await this.db.execute('VACUUM');

        await this.db.transaction(async (connection) => {
            // Analyze tables to update query planner statistics
            await connection.execute('ANALYZE');

            // Rebuild indexes
            const tables = await connection.execute(`
                SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'
            `);

            for (const table of tables) {
                await connection.execute(`REINDEX ${table.name}`);
            }
        });
    }

    /**
     * Drop all tables (for testing/reset purposes)
     */
    async drop(): Promise<void> {
        await this.db.transaction(async (connection) => {
            // Drop triggers first
            const triggers = await connection.execute(`
                SELECT name FROM sqlite_master WHERE type='trigger'
            `);

            for (const trigger of triggers) {
                await connection.execute(`DROP TRIGGER IF EXISTS ${trigger.name}`);
            }

            // Drop views
            const views = await connection.execute(`
                SELECT name FROM sqlite_master WHERE type='view'
            `);

            for (const view of views) {
                await connection.execute(`DROP VIEW IF EXISTS ${view.name}`);
            }

            // Drop indexes
            const indexes = await connection.execute(`
                SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'
            `);

            for (const index of indexes) {
                await connection.execute(`DROP INDEX IF EXISTS ${index.name}`);
            }

            // Drop tables
            const tables = await connection.execute(`
                SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'
            `);

            for (const table of tables) {
                await connection.execute(`DROP TABLE IF EXISTS ${table.name}`);
            }
        });
    }
}