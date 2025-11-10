/**
 * Database configuration and connection types
 */

export interface DatabaseConfig {
    path: string;
    walMode: boolean;
    foreignKeys: boolean;
    journalMode: 'WAL' | 'DELETE' | 'TRUNCATE' | 'PERSIST' | 'MEMORY' | 'OFF';
    synchronous: 'OFF' | 'NORMAL' | 'FULL' | 'EXTRA';
    cacheSize: number;
    tempStore: 'DEFAULT' | 'FILE' | 'MEMORY';
    mmapSize: number;
    busyTimeout: number;
}

export interface CacheSchema {
    id: string;
    key: string;
    data: string; // JSON string
    ttl: number;
    createdAt: number;
    lastAccessed: number;
    accessCount: number;
    expiresAt: number;
    technology?: string;
    category?: string;
    standardId?: string;
}

export interface FtsSchema {
    id: string;
    standardId: string;
    title: string;
    description: string;
    technology: string;
    category: string;
    rules: string; // JSON array of rules
    lastUpdated: string;
}

export interface AnalyticsSchema {
    id: string;
    eventType: 'cache_hit' | 'cache_miss' | 'search' | 'validation';
    timestamp: number;
    duration: number;
    metadata: string; // JSON string
    userId?: string;
    sessionId?: string;
}

export interface DatabaseSchema {
    standards_cache: CacheSchema;
    standards_search: FtsSchema;
    usage_analytics: AnalyticsSchema;
}

export interface SearchOptions {
    limit?: number;
    offset?: number;
    technology?: string;
    category?: string;
    fuzzy?: boolean;
    orderBy?: 'rank' | 'lastUpdated';
    orderDirection?: 'ASC' | 'DESC';
}

export interface SearchResult {
    standardId: string;
    standard: {
        id: string;
        title: string;
        description: string;
        technology: string;
        category: string;
        rules: Array<{
            id: string;
            description: string;
            severity: 'error' | 'warning' | 'info';
            category: string;
            example?: string;
        }>;
        lastUpdated: string;
    };
    rank: number;
    bm25Score: number;
    score?: number; // Legacy property for backward compatibility
}

export interface CacheStats {
    totalEntries: number;
    expiredEntries: number;
    hitRate: number;
    memoryUsage: number;
    oldestEntry: number;
    newestEntry: number;
    topTechnologies: Array<{ technology: string; count: number }>;
    topCategories: Array<{ category: string; count: number }>;
}

export interface DatabaseMetrics {
    queryTime: number;
    cacheHits: number;
    cacheMisses: number;
    totalQueries: number;
    connectionsActive: number;
    connectionsTotal: number;
    transactionsCommitted: number;
    transactionsRolledBack: number;
    databaseSize: number;
    journalSize: number;
}

export interface ConnectionPoolConfig {
    minConnections: number;
    maxConnections: number;
    acquireTimeout: number;
    idleTimeout: number;
    reapInterval: number;
}

export interface BackupOptions {
    path: string;
    includeWal: boolean;
    compress: boolean;
    encryptionKey?: string;
}

export interface RecoveryOptions {
    backupPath?: string;
    rebuildFromScratch: boolean;
    validateIntegrity: boolean;
    maxRetries: number;
}