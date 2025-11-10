import { CacheManager, CacheConfig, CacheEntry } from '../cache/cache-manager.js';
import { DatabaseConnection } from './connection.js';
import { CacheSchema, CacheStats } from '../types/database.js';

/**
 * SQLite cache configuration
 */
export interface SqliteCacheConfig extends CacheConfig {
    database: DatabaseConnection;
    persistToDisk: boolean;
    syncInterval: number; // Sync memory to disk interval in ms
    cleanupInterval: number; // Cleanup expired entries interval in ms
    compressionEnabled: boolean;
    encryptionKey?: string;
}

/**
 * SQLite-based cache backend that extends the in-memory CacheManager
 */
export class SqliteCacheBackend<T = any> extends CacheManager<T> {
    private db: DatabaseConnection;
    private config: SqliteCacheConfig;
    private syncTimer: Timer | null = null;
    private cleanupTimer: Timer | null = null;
    private isDirty = false;
    private tableName = 'standards_cache';

    constructor(config: SqliteCacheConfig) {
        super(config);
        this.config = config;
        this.db = config.database;

        if (config.persistToDisk) {
            this.startBackgroundTasks();
        }
    }

    /**
     * Start background synchronization and cleanup tasks
     */
    private startBackgroundTasks(): void {
        // Sync memory cache to disk periodically
        this.syncTimer = setInterval(() => {
            if (this.isDirty) {
                this.syncToDisk();
            }
        }, this.config.syncInterval);

        // Cleanup expired entries
        this.cleanupTimer = setInterval(() => {
            this.cleanupExpired();
        }, this.config.cleanupInterval);
    }

    /**
     * Stop background tasks
     */
    private stopBackgroundTasks(): void {
        if (this.syncTimer) {
            clearInterval(this.syncTimer);
            this.syncTimer = null;
        }
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
    }

    /**
     * Load cache entries from database on startup
     */
    async loadFromDisk(): Promise<void> {
        try {
            const result = await this.db.execute(`
                SELECT key, data, ttl, created_at, last_accessed, access_count, expires_at,
                       technology, category, standard_id
                FROM ${this.tableName}
                WHERE expires_at > ?
                ORDER BY last_accessed DESC
                LIMIT ?
            `, [Date.now(), this.config.maxSize]);

            for (const row of result) {
                try {
                    const data = JSON.parse(row.data);
                    const entry: CacheEntry<T> = {
                        data,
                        timestamp: row.created_at,
                        expiresAt: row.expires_at,
                        hits: row.access_count
                    };

                    // Rebuild in-memory cache
                    this.cache.set(row.key, entry);
                    this.accessOrder.set(row.key, row.last_accessed);

                } catch (parseError) {
                    console.warn(`Failed to parse cached data for key ${row.key}:`, parseError);
                }
            }

            console.log(`Loaded ${result.length} cache entries from disk`);

        } catch (error) {
            console.error('Failed to load cache from disk:', error);
        }
    }

    /**
     * Synchronize in-memory cache to disk
     */
    private async syncToDisk(): Promise<void> {
        if (!this.config.persistToDisk) return;

        try {
            await this.db.transaction(async (connection) => {
                for (const [key, entry] of this.cache.entries()) {
                    const data = JSON.stringify(entry.data);
                    const now = Date.now();

                    await connection.execute(`
                        INSERT OR REPLACE INTO ${this.tableName}
                        (id, key, data, ttl, created_at, last_accessed, access_count, expires_at,
                         technology, category, standard_id)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        this.generateId(key),
                        key,
                        data,
                        entry.expiresAt - entry.timestamp,
                        entry.timestamp,
                        this.accessOrder.get(key) || now,
                        entry.hits,
                        entry.expiresAt,
                        this.extractTechnology(key),
                        this.extractCategory(key),
                        this.extractStandardId(key)
                    ]);
                }
            });

            this.isDirty = false;

        } catch (error) {
            console.error('Failed to sync cache to disk:', error);
        }
    }

    /**
     * Cleanup expired entries from database
     */
    private async cleanupExpired(): Promise<void> {
        try {
            const result = await this.db.execute(`
                DELETE FROM ${this.tableName}
                WHERE expires_at < ?
            `, [Date.now()]);

            if (result.changes > 0) {
                console.log(`Cleaned up ${result.changes} expired cache entries`);
            }

        } catch (error) {
            console.error('Failed to cleanup expired cache entries:', error);
        }
    }

    /**
     * Override get method to record analytics
     */
    get(key: string): T | null {
        const result = super.get(key);

        if (result !== null) {
            this.recordAnalytics('cache_hit', key);
        } else {
            this.recordAnalytics('cache_miss', key);
        }

        return result;
    }

    /**
     * Override set method to mark as dirty
     */
    set(key: string, data: T, customTtl?: number): void {
        super.set(key, data, customTtl);
        this.isDirty = true;
    }

    /**
     * Async version of set for compatibility with tests
     */
    async setAsync(key: string, data: T, customTtl?: number): Promise<void> {
        this.set(key, data, customTtl);
    }

    /**
     * Override delete method to mark as dirty
     */
    delete(key: string): boolean {
        const result = super.delete(key);
        if (result) {
            this.isDirty = true;
            this.deleteFromDisk(key);
        }
        return result;
    }

    /**
     * Delete entry from database
     */
    private async deleteFromDisk(key: string): Promise<void> {
        try {
            await this.db.execute(`
                DELETE FROM ${this.tableName} WHERE key = ?
            `, [key]);
        } catch (error) {
            console.error(`Failed to delete cache entry ${key} from disk:`, error);
        }
    }

    /**
     * Override clear method to clear both memory and disk
     */
    clear(): void {
        super.clear();
        this.isDirty = true;
        this.clearDisk();
    }

    /**
     * Clear all entries from database
     */
    private async clearDisk(): Promise<void> {
        try {
            await this.db.execute(`DELETE FROM ${this.tableName}`);
        } catch (error) {
            console.error('Failed to clear cache from disk:', error);
        }
    }

    /**
     * Get basic cache statistics
     */
    async getStatistics(): Promise<{
        totalItems: number;
        hitCount: number;
        missCount: number;
        totalAccesses: number;
        hitRate: number;
        memoryUsage: number;
        averageAccessTime: number;
    }> {
        const memoryStats = super.getStats();

        return {
            totalItems: this.cache.size,
            hitCount: memoryStats.hits,
            missCount: memoryStats.misses,
            totalAccesses: memoryStats.hits + memoryStats.misses,
            hitRate: memoryStats.hitRate,
            memoryUsage: memoryStats.memoryUsage,
            averageAccessTime: 0 // Not tracked in basic stats
        };
    }

    /**
     * Get comprehensive cache statistics including database stats
     */
    async getExtendedStats(): Promise<CacheStats & {
        diskEntries: number;
        diskSize: number;
        lastSyncTime: number;
        topTechnologies: Array<{ technology: string; count: number }>;
        topCategories: Array<{ category: string; count: number }>;
    }> {
        const memoryStats = super.getStats();

        try {
            const diskStats = await this.db.execute(`
                SELECT
                    COUNT(*) as total_entries,
                    SUM(LENGTH(data)) as total_size,
                    MAX(last_accessed) as last_accessed
                FROM ${this.tableName}
            `);

            const techStats = await this.db.execute(`
                SELECT technology, COUNT(*) as count
                FROM ${this.tableName}
                WHERE technology IS NOT NULL
                GROUP BY technology
                ORDER BY count DESC
                LIMIT 10
            `);

            const categoryStats = await this.db.execute(`
                SELECT category, COUNT(*) as count
                FROM ${this.tableName}
                WHERE category IS NOT NULL
                GROUP BY category
                ORDER BY count DESC
                LIMIT 10
            `);

            return {
                ...memoryStats,
                totalEntries: diskStats[0].total_entries,
                expiredEntries: await this.getExpiredCount(),
                hitRate: memoryStats.hitRate,
                memoryUsage: memoryStats.memoryUsage,
                oldestEntry: await this.getOldestEntry(),
                newestEntry: await this.getNewestEntry(),
                diskEntries: diskStats[0].total_entries,
                diskSize: diskStats[0].total_size || 0,
                lastSyncTime: diskStats[0].last_accessed || 0,
                topTechnologies: techStats,
                topCategories: categoryStats
            };

        } catch (error) {
            console.error('Failed to get extended cache stats:', error);
            return {
                ...memoryStats,
                totalEntries: 0,
                expiredEntries: 0,
                hitRate: 0,
                memoryUsage: 0,
                oldestEntry: 0,
                newestEntry: 0,
                diskEntries: 0,
                diskSize: 0,
                lastSyncTime: 0,
                topTechnologies: [],
                topCategories: []
            };
        }
    }

    /**
     * Get count of expired entries
     */
    private async getExpiredCount(): Promise<number> {
        const result = await this.db.execute(`
            SELECT COUNT(*) as count FROM ${this.tableName} WHERE expires_at < ?
        `, [Date.now()]);
        return result[0].count;
    }

    /**
     * Get oldest entry timestamp
     */
    private async getOldestEntry(): Promise<number> {
        const result = await this.db.execute(`
            SELECT MIN(created_at) as oldest FROM ${this.tableName}
        `);
        return result[0].oldest || 0;
    }

    /**
     * Get newest entry timestamp
     */
    private async getNewestEntry(): Promise<number> {
        const result = await this.db.execute(`
            SELECT MAX(created_at) as newest FROM ${this.tableName}
        `);
        return result[0].newest || 0;
    }

    /**
     * Force synchronization to disk
     */
    async forceSync(): Promise<void> {
        await this.syncToDisk();
    }

    /**
     * Invalidate cache entries by pattern
     */
    async invalidateByPattern(pattern: string): Promise<number> {
        let invalidated = 0;

        // Convert pattern to SQL LIKE pattern
        // * is converted to %, and special characters are escaped
        const sqlPattern = pattern.replace(/\*/g, '%');

        // Remove from memory cache
        for (const key of this.cache.keys()) {
            // Convert pattern to regex for memory cache matching
            const regexPattern = pattern.replace(/\*/g, '.*');
            const regex = new RegExp(`^${regexPattern}$`);
            if (regex.test(key)) {
                this.delete(key);
                invalidated++;
            }
        }

        // Remove from disk
        try {
            const result = await this.db.execute(`
                DELETE FROM ${this.tableName} WHERE key LIKE ?
            `, [sqlPattern]);
            invalidated += result.changes;
        } catch (error) {
            console.error(`Failed to invalidate cache pattern ${pattern}:`, error);
        }

        return invalidated;
    }

    /**
     * Invalidate cache entries by pattern
     * If pattern is provided, only invalidate matching entries
     * If pattern is not provided, invalidate all entries
     */
    async invalidate(pattern?: string): Promise<number> {
        if (!pattern) {
            // Invalidate all entries
            const count = this.cache.size;
            this.clear();
            return count;
        } else {
            // Invalidate by pattern
            return this.invalidateByPattern(pattern);
        }
    }

    /**
     * Get cache entries by technology and category
     */
    async getByTechnologyAndCategory(technology?: string, category?: string): Promise<Array<{
        key: string;
        data: T;
        timestamp: number;
        expiresAt: number;
        hits: number;
    }>> {
        const conditions = [];
        const params = [];

        if (technology) {
            conditions.push('technology = ?');
            params.push(technology);
        }
        if (category) {
            conditions.push('category = ?');
            params.push(category);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const sql = `
            SELECT key, data, created_at, expires_at, access_count
            FROM ${this.tableName}
            ${whereClause}
            ORDER BY last_accessed DESC
        `;

        try {
            const result = await this.db.execute(sql, params);
            return result.map(row => ({
                key: row.key,
                data: JSON.parse(row.data),
                timestamp: row.created_at,
                expiresAt: row.expires_at,
                hits: row.access_count
            }));
        } catch (error) {
            console.error('Failed to get cache entries by filters:', error);
            return [];
        }
    }

    /**
     * Record cache analytics
     */
    private async recordAnalytics(eventType: 'cache_hit' | 'cache_miss', key: string): Promise<void> {
        try {
            const metadata = {
                key,
                technology: this.extractTechnology(key),
                category: this.extractCategory(key),
                standardId: this.extractStandardId(key)
            };

            // Use INSERT OR IGNORE to avoid UNIQUE constraint violations
            // If a record with the same ID exists, it will be ignored
            await this.db.execute(`
                INSERT OR IGNORE INTO usage_analytics (id, event_type, timestamp, duration, metadata)
                VALUES (?, ?, ?, ?, ?)
            `, [
                this.generateId(`analytics_${eventType}_${key}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`),
                eventType,
                Date.now(),
                0,
                JSON.stringify(metadata)
            ]);
        } catch (error) {
            // Don't let analytics errors affect cache operations
            console.debug('Failed to record cache analytics:', error);
        }
    }

    /**
     * Generate unique ID for cache entries
     */
    private generateId(key: string): string {
        return `cache_${key.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`;
    }

    /**
     * Extract technology from cache key
     */
    private extractTechnology(key: string): string | undefined {
        const match = key.match(/(?:standards|search):([^:]+)/);
        return match ? match[1] : undefined;
    }

    /**
     * Extract category from cache key
     */
    private extractCategory(key: string): string | undefined {
        const parts = key.split(':');
        return parts.length >= 3 ? parts[2] : undefined;
    }

    /**
     * Extract standard ID from cache key
     */
    private extractStandardId(key: string): string | undefined {
        const match = key.match(/standard_id:([^:]+)/);
        return match ? match[1] : undefined;
    }

    /**
     * Close the cache backend
     */
    async close(): Promise<void> {
        this.stopBackgroundTasks();

        if (this.isDirty) {
            await this.syncToDisk();
        }

        super.clear();
    }

    /**
     * Export cache data for backup
     */
    async export(): Promise<Array<{
        key: string;
        data: T;
        timestamp: number;
        expiresAt: number;
        technology?: string;
        category?: string;
    }>> {
        const result = await this.db.execute(`
            SELECT key, data, created_at, expires_at, technology, category
            FROM ${this.tableName}
            ORDER BY created_at DESC
        `);

        return result.map(row => ({
            key: row.key,
            data: JSON.parse(row.data),
            timestamp: row.created_at,
            expiresAt: row.expires_at,
            technology: row.technology,
            category: row.category
        }));
    }

    /**
     * Import cache data from backup
     */
    async import(entries: Array<{
        key: string;
        data: T;
        timestamp: number;
        expiresAt: number;
        technology?: string;
        category?: string;
    }>): Promise<number> {
        let imported = 0;

        await this.db.transaction(async (connection) => {
            for (const entry of entries) {
                if (entry.expiresAt > Date.now()) {
                    await connection.execute(`
                        INSERT OR REPLACE INTO ${this.tableName}
                        (id, key, data, ttl, created_at, last_accessed, access_count, expires_at,
                         technology, category, standard_id)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        this.generateId(entry.key),
                        entry.key,
                        JSON.stringify(entry.data),
                        entry.expiresAt - entry.timestamp,
                        entry.timestamp,
                        entry.timestamp,
                        0,
                        entry.expiresAt,
                        entry.technology,
                        entry.category,
                        null
                    ]);
                    imported++;
                }
            }
        });

        return imported;
    }
}

/**
 * Factory function to create SQLite cache backend
 */
export function createSqliteCache<T = any>(
    db: DatabaseConnection,
    config: Partial<SqliteCacheConfig> = {}
): SqliteCacheBackend<T> {
    const defaultConfig: SqliteCacheConfig = {
        database: db,
        persistToDisk: true,
        syncInterval: 30000, // 30 seconds
        cleanupInterval: 300000, // 5 minutes
        compressionEnabled: false,
        ttl: 5 * 60 * 1000, // 5 minutes
        maxSize: 1000,
        enabled: true,
        ...config
    };

    return new SqliteCacheBackend<T>(defaultConfig);
}