import { DatabaseConnection } from './connection.js';
import { performanceMonitor } from '../utils/performance-monitor.js';

/**
 * Performance monitoring and optimization for database operations
 */
export class DatabasePerformanceManager {
    private db: DatabaseConnection;
    private metricsCache = new Map<string, any>();
    private cacheTimeout = 60000; // 1 minute cache timeout

    constructor(db: DatabaseConnection) {
        this.db = db;
    }

    /**
     * Analyze database performance and provide recommendations
     */
    async analyzePerformance(): Promise<{
        overallScore: number;
        queryPerformance: QueryPerformanceMetrics;
        indexHealth: IndexHealthMetrics;
        cacheEfficiency: CacheEfficiencyMetrics;
        concurrencyMetrics: ConcurrencyMetrics;
        recommendations: PerformanceRecommendation[];
    }> {
        const queryPerformance = await this.analyzeQueryPerformance();
        const indexHealth = await this.analyzeIndexHealth();
        const cacheEfficiency = await this.analyzeCacheEfficiency();
        const concurrencyMetrics = await this.analyzeConcurrencyMetrics();

        const overallScore = this.calculateOverallScore({
            queryPerformance,
            indexHealth,
            cacheEfficiency,
            concurrencyMetrics
        });

        const recommendations = this.generateRecommendations({
            queryPerformance,
            indexHealth,
            cacheEfficiency,
            concurrencyMetrics
        });

        return {
            overallScore,
            queryPerformance,
            indexHealth,
            cacheEfficiency,
            concurrencyMetrics,
            recommendations
        };
    }

    /**
     * Analyze query performance
     */
    private async analyzeQueryPerformance(): Promise<QueryPerformanceMetrics> {
        const cacheKey = 'query_performance';
        const cached = this.getCachedMetrics(cacheKey);

        if (cached) {
            return cached;
        }

        try {
            // Get query plan analysis
            const queryPlans = await this.db.execute(`
                EXPLAIN QUERY PLAN
                SELECT * FROM standards_cache WHERE technology = 'javascript' AND category = 'formatting'
            `);

            // Get slow queries from analytics
            const slowQueries = await this.db.execute(`
                SELECT
                    json_extract(metadata, '$.query') as query,
                    AVG(duration) as avg_duration,
                    COUNT(*) as count
                FROM usage_analytics
                WHERE event_type = 'search' AND duration > 100
                GROUP BY json_extract(metadata, '$.query')
                ORDER BY avg_duration DESC
                LIMIT 10
            `);

            // Get database operation metrics
            const dbMetrics = this.db.getMetrics();

            const avgQueryTime = dbMetrics.totalQueries > 0 ? dbMetrics.queryTime / dbMetrics.totalQueries : 0;

            const metrics: QueryPerformanceMetrics = {
                avgQueryTime: Math.round(avgQueryTime * 100) / 100,
                slowQueryCount: slowQueries.length,
                totalQueries: dbMetrics.totalQueries,
                queryEfficiency: this.calculateQueryEfficiency(avgQueryTime),
                topSlowQueries: slowQueries.map((row: any) => ({
                    query: row.query || 'unknown',
                    avgDuration: Math.round(row.avg_duration * 100) / 100,
                    count: row.count
                })),
                indexUsage: await this.analyzeIndexUsage()
            };

            this.setCachedMetrics(cacheKey, metrics);
            return metrics;

        } catch (error) {
            console.error('Failed to analyze query performance:', error);
            return {
                avgQueryTime: 0,
                slowQueryCount: 0,
                totalQueries: 0,
                queryEfficiency: 0,
                topSlowQueries: [],
                indexUsage: 0
            };
        }
    }

    /**
     * Analyze index health
     */
    private async analyzeIndexHealth(): Promise<IndexHealthMetrics> {
        const cacheKey = 'index_health';
        const cached = this.getCachedMetrics(cacheKey);

        if (cached) {
            return cached;
        }

        try {
            // Get index statistics
            const indexStats = await this.db.execute(`
                SELECT name, tbl_name, sql
                FROM sqlite_master
                WHERE type = 'index' AND name NOT LIKE 'sqlite_%'
            `);

            // Get index usage statistics
            const indexUsage = await this.db.execute(`
                SELECT name, stat
                FROM sqlite_stat1
                WHERE tbl_name IN ('standards_cache', 'standards_search_content', 'usage_analytics')
            `);

            // Check for fragmented indexes
            const fragmentation = await this.checkIndexFragmentation();

            // Get missing indexes suggestions
            const missingIndexes = await this.identifyMissingIndexes();

            const metrics: IndexHealthMetrics = {
                totalIndexes: indexStats.length,
                usedIndexes: indexUsage.length,
                fragmentationRate: fragmentation,
                avgIndexSize: await this.calculateAverageIndexSize(indexStats),
                missingIndexes,
                indexUsageRate: indexStats.length > 0 ? (indexUsage.length / indexStats.length) * 100 : 0
            };

            this.setCachedMetrics(cacheKey, metrics);
            return metrics;

        } catch (error) {
            console.error('Failed to analyze index health:', error);
            return {
                totalIndexes: 0,
                usedIndexes: 0,
                fragmentationRate: 0,
                avgIndexSize: 0,
                missingIndexes: [],
                indexUsageRate: 0
            };
        }
    }

    /**
     * Analyze cache efficiency
     */
    private async analyzeCacheEfficiency(): Promise<CacheEfficiencyMetrics> {
        const cacheKey = 'cache_efficiency';
        const cached = this.getCachedMetrics(cacheKey);

        if (cached) {
            return cached;
        }

        try {
            // Get cache statistics from analytics
            const cacheStats = await this.db.execute(`
                SELECT
                    event_type,
                    COUNT(*) as count,
                    AVG(duration) as avg_duration
                FROM usage_analytics
                WHERE event_type IN ('cache_hit', 'cache_miss')
                GROUP BY event_type
            `);

            const hits = cacheStats.find(r => r.event_type === 'cache_hit');
            const misses = cacheStats.find(r => r.event_type === 'cache_miss');

            const totalHits = hits?.count || 0;
            const totalMisses = misses?.count || 0;
            const totalRequests = totalHits + totalMisses;

            const hitRate = totalRequests > 0 ? (totalHits / totalRequests) * 100 : 0;
            const avgHitTime = hits?.avg_duration || 0;
            const avgMissTime = misses?.avg_duration || 0;

            // Get cache size metrics
            const cacheSize = await this.db.execute(`
                SELECT
                    COUNT(*) as total_entries,
                    SUM(LENGTH(data)) as total_size,
                    AVG(expires_at - created_at) as avg_ttl
                FROM standards_cache
            `);

            // Calculate cache fragmentation
            const fragmentation = await this.calculateCacheFragmentation();

            const metrics: CacheEfficiencyMetrics = {
                hitRate: Math.round(hitRate * 100) / 100,
                totalEntries: cacheSize[0].total_entries,
                totalSize: cacheSize[0].total_size || 0,
                avgHitTime: Math.round(avgHitTime * 100) / 100,
                avgMissTime: Math.round(avgMissTime * 100) / 100,
                avgTTL: cacheSize[0].avg_ttl || 0,
                fragmentationRate: fragmentation,
                efficiency: this.calculateCacheEfficiency(hitRate, avgHitTime, avgMissTime)
            };

            this.setCachedMetrics(cacheKey, metrics);
            return metrics;

        } catch (error) {
            console.error('Failed to analyze cache efficiency:', error);
            return {
                hitRate: 0,
                totalEntries: 0,
                totalSize: 0,
                avgHitTime: 0,
                avgMissTime: 0,
                avgTTL: 0,
                fragmentationRate: 0,
                efficiency: 0
            };
        }
    }

    /**
     * Analyze concurrency metrics
     */
    private async analyzeConcurrencyMetrics(): Promise<ConcurrencyMetrics> {
        const cacheKey = 'concurrency_metrics';
        const cached = this.getCachedMetrics(cacheKey);

        if (cached) {
            return cached;
        }

        try {
            const dbMetrics = this.db.getMetrics();

            // Get WAL mode information
            const walInfo = await this.db.execute('PRAGMA journal_mode');
            const walCheckpoint = await this.db.execute('PRAGMA wal_checkpoint(PASSIVE)');

            // Check lock status
            const lockStatus = await this.db.execute(`
                SELECT COUNT(*) as active_connections
                FROM pragma_database_list()
                WHERE name = 'main'
            `);

            // Get concurrent operation metrics
            const concurrentOps = await this.db.execute(`
                SELECT
                    event_type,
                    COUNT(*) as count,
                    AVG(duration) as avg_duration
                FROM usage_analytics
                WHERE timestamp > ?
                GROUP BY event_type
            `, [Date.now() - 60000]); // Last minute

            const metrics: ConcurrencyMetrics = {
                walMode: walInfo[0].journal_mode === 'wal',
                activeConnections: dbMetrics.connectionsActive,
                totalConnections: dbMetrics.connectionsTotal,
                avgConcurrentOps: concurrentOps.reduce((sum, op) => sum + op.count, 0),
                lockContentions: await this.detectLockContentions(),
                checkpointEfficiency: this.calculateCheckpointEfficiency(walCheckpoint),
                concurrencyScore: this.calculateConcurrencyScore(dbMetrics)
            };

            this.setCachedMetrics(cacheKey, metrics);
            return metrics;

        } catch (error) {
            console.error('Failed to analyze concurrency metrics:', error);
            return {
                walMode: false,
                activeConnections: 0,
                totalConnections: 0,
                avgConcurrentOps: 0,
                lockContentions: 0,
                checkpointEfficiency: 0,
                concurrencyScore: 0
            };
        }
    }

    /**
     * Calculate overall performance score
     */
    private calculateOverallScore(metrics: {
        queryPerformance: QueryPerformanceMetrics;
        indexHealth: IndexHealthMetrics;
        cacheEfficiency: CacheEfficiencyMetrics;
        concurrencyMetrics: ConcurrencyMetrics;
    }): number {
        const scores = [
            metrics.queryPerformance.queryEfficiency,
            metrics.indexHealth.indexUsageRate,
            metrics.cacheEfficiency.efficiency,
            metrics.concurrencyMetrics.concurrencyScore
        ];

        return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
    }

    /**
     * Generate performance recommendations
     */
    private generateRecommendations(metrics: {
        queryPerformance: QueryPerformanceMetrics;
        indexHealth: IndexHealthMetrics;
        cacheEfficiency: CacheEfficiencyMetrics;
        concurrencyMetrics: ConcurrencyMetrics;
    }): PerformanceRecommendation[] {
        const recommendations: PerformanceRecommendation[] = [];

        // Query performance recommendations
        if (metrics.queryPerformance.avgQueryTime > 50) {
            recommendations.push({
                type: 'query_optimization',
                priority: 'high',
                title: 'Slow query performance detected',
                description: `Average query time is ${metrics.queryPerformance.avgQueryTime}ms, which exceeds the 50ms target.`,
                action: 'Consider adding missing indexes or optimizing query patterns.',
                impact: 'high'
            });
        }

        // Index health recommendations
        if (metrics.indexHealth.fragmentationRate > 20) {
            recommendations.push({
                type: 'index_maintenance',
                priority: 'medium',
                title: 'Index fragmentation detected',
                description: `Index fragmentation rate is ${metrics.indexHealth.fragmentationRate}%.`,
                action: 'Run REINDEX or VACUUM to defragment indexes.',
                impact: 'medium'
            });
        }

        if (metrics.indexHealth.missingIndexes.length > 0) {
            recommendations.push({
                type: 'index_creation',
                priority: 'high',
                title: 'Missing recommended indexes',
                description: `${metrics.indexHealth.missingIndexes.length} potentially beneficial indexes are missing.`,
                action: 'Create the recommended indexes to improve query performance.',
                impact: 'high'
            });
        }

        // Cache efficiency recommendations
        if (metrics.cacheEfficiency.hitRate < 70) {
            recommendations.push({
                type: 'cache_optimization',
                priority: 'medium',
                title: 'Low cache hit rate',
                description: `Cache hit rate is ${metrics.cacheEfficiency.hitRate}%, below the 70% target.`,
                action: 'Review cache TTL settings and consider warming up the cache with frequently accessed data.',
                impact: 'medium'
            });
        }

        if (metrics.cacheEfficiency.fragmentationRate > 15) {
            recommendations.push({
                type: 'cache_maintenance',
                priority: 'low',
                title: 'Cache fragmentation detected',
                description: `Cache fragmentation rate is ${metrics.cacheEfficiency.fragmentationRate}%.`,
                action: 'Run cache cleanup and compaction routines.',
                impact: 'low'
            });
        }

        // Concurrency recommendations
        if (!metrics.concurrencyMetrics.walMode) {
            recommendations.push({
                type: 'concurrency_optimization',
                priority: 'high',
                title: 'WAL mode not enabled',
                description: 'Database is not running in WAL mode, which limits concurrent access.',
                action: 'Enable WAL mode for better read/write concurrency.',
                impact: 'high'
            });
        }

        if (metrics.concurrencyMetrics.lockContentions > 5) {
            recommendations.push({
                type: 'lock_optimization',
                priority: 'medium',
                title: 'Lock contentions detected',
                description: `${metrics.concurrencyMetrics.lockContentions} lock contentions detected.`,
                action: 'Optimize transactions and consider using connection pooling.',
                impact: 'medium'
            });
        }

        return recommendations.sort((a, b) => {
            const priorityOrder = { high: 3, medium: 2, low: 1 };
            return priorityOrder[b.priority] - priorityOrder[a.priority];
        });
    }

    /**
     * Helper methods for analysis
     */
    private calculateQueryEfficiency(avgQueryTime: number): number {
        return Math.max(0, 100 - (avgQueryTime / 2)); // 50ms target = 100% score
    }

    private async analyzeIndexUsage(): Promise<number> {
        try {
            const result = await this.db.execute(`
                SELECT COUNT(*) as used_indexes
                FROM sqlite_stat1
                WHERE stat IS NOT NULL
            `);
            return result[0].used_indexes || 0;
        } catch (error) {
            return 0;
        }
    }

    private async checkIndexFragmentation(): Promise<number> {
        try {
            const result = await this.db.execute(`
                SELECT COUNT(*) as total_pages
                FROM dbstat
                WHERE name IN ('standards_cache', 'standards_search_content', 'usage_analytics')
            `);
            // Simple fragmentation calculation - would need more sophisticated analysis
            return Math.random() * 10; // Placeholder
        } catch (error) {
            return 0;
        }
    }

    private async identifyMissingIndexes(): Promise<string[]> {
        // This would analyze query patterns and suggest missing indexes
        // For now, return empty array as placeholder
        return [];
    }

    private async calculateAverageIndexSize(indexStats: any[]): Promise<number> {
        if (indexStats.length === 0) return 0;
        // Placeholder calculation
        return 1024; // 1KB average
    }

    private async calculateCacheFragmentation(): Promise<number> {
        try {
            const result = await this.db.execute(`
                SELECT COUNT(*) as fragmented_entries
                FROM standards_cache
                WHERE last_accessed < (strftime('%s', 'now') * 1000 - 86400000)
            `);
            const totalEntries = await this.db.execute('SELECT COUNT(*) as total FROM standards_cache');
            const total = totalEntries[0].total;
            return total > 0 ? (result[0].fragmented_entries / total) * 100 : 0;
        } catch (error) {
            return 0;
        }
    }

    private calculateCacheEfficiency(hitRate: number, avgHitTime: number, avgMissTime: number): number {
        const timeBenefit = avgMissTime > 0 ? (avgMissTime - avgHitTime) / avgMissTime : 0;
        return Math.round((hitRate + (timeBenefit * 100)) / 2);
    }

    private async detectLockContentions(): Promise<number> {
        try {
            // This would monitor lock contention - placeholder implementation
            return 0;
        } catch (error) {
            return 0;
        }
    }

    private calculateCheckpointEfficiency(walCheckpoint: any): number {
        if (!walCheckpoint || walCheckpoint.length === 0) return 100;
        // Calculate checkpoint efficiency based on WAL size vs checkpointed pages
        return 85; // Placeholder
    }

    private calculateConcurrencyScore(dbMetrics: any): number {
        const connectionEfficiency = dbMetrics.connectionsTotal > 0 ?
            (dbMetrics.connectionsActive / dbMetrics.connectionsTotal) * 100 : 0;
        return Math.min(100, connectionEfficiency);
    }

    /**
     * Cache management
     */
    private getCachedMetrics(key: string): any {
        const cached = this.metricsCache.get(key);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data;
        }
        return null;
    }

    private setCachedMetrics(key: string, data: any): void {
        this.metricsCache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    /**
     * Performance optimization actions
     */
    async optimizeDatabase(): Promise<{
        actions: string[];
        duration: number;
        improvements: Record<string, number>;
    }> {
        const startTime = performance.now();
        const actions: string[] = [];
        const improvements: Record<string, number> = {};

        try {
            performanceMonitor.startTimer('db_optimize');

            // Analyze tables
            await this.db.execute('ANALYZE');
            actions.push('Analyzed database tables');

            // Optimize indexes if needed
            const indexHealth = await this.analyzeIndexHealth();
            if (indexHealth.fragmentationRate > 20) {
                await this.db.execute('REINDEX');
                actions.push('Reindexed fragmented indexes');
                improvements.indexFragmentation = indexHealth.fragmentationRate;
            }

            // Vacuum if database is fragmented
            const stats = await this.db.execute(`
                SELECT SUM(pgsize) as size, COUNT(*) as pages
                FROM dbstat
                WHERE name NOT LIKE 'sqlite_%'
            `);

            if (stats[0].pages > 1000) {
                await this.db.execute('VACUUM');
                actions.push('Vacuumed database to reclaim space');
                improvements.databaseSize = stats[0].size;
            }

            // Optimize WAL checkpoint
            await this.db.checkpoint('RESTART');
            actions.push('Optimized WAL checkpoint');

            // Clear performance cache
            this.metricsCache.clear();
            actions.push('Cleared performance cache');

            const duration = performance.now() - startTime;

            performanceMonitor.endTimer('db_optimize');
            performanceMonitor.recordMetric('db_optimize_duration_ms', duration);

            console.log(`Database optimization completed in ${duration.toFixed(2)}ms`);

            return {
                actions,
                duration,
                improvements
            };

        } catch (error) {
            performanceMonitor.endTimer('db_optimize');
            console.error('Database optimization failed:', error);
            throw error;
        }
    }

    /**
     * Get real-time performance metrics
     */
    async getRealTimeMetrics(): Promise<{
        timestamp: number;
        queryTime: number;
        activeConnections: number;
        cacheHitRate: number;
        memoryUsage: number;
    }> {
        const dbMetrics = this.db.getMetrics();
        const cacheStats = await this.analyzeCacheEfficiency();

        return {
            timestamp: Date.now(),
            queryTime: dbMetrics.queryTime,
            activeConnections: dbMetrics.connectionsActive,
            cacheHitRate: cacheStats.hitRate,
            memoryUsage: dbMetrics.databaseSize
        };
    }

    /**
     * Monitor performance thresholds
     */
    async monitorThresholds(thresholds: {
        maxQueryTime: number;
        minCacheHitRate: number;
        maxConnections: number;
        maxDatabaseSize: number;
    }): Promise<{
        alerts: PerformanceAlert[];
        status: 'healthy' | 'warning' | 'critical';
    }> {
        const metrics = await this.getRealTimeMetrics();
        const alerts: PerformanceAlert[] = [];

        if (metrics.queryTime > thresholds.maxQueryTime) {
            alerts.push({
                type: 'query_performance',
                severity: 'warning',
                message: `Query time (${metrics.queryTime}ms) exceeds threshold (${thresholds.maxQueryTime}ms)`,
                value: metrics.queryTime,
                threshold: thresholds.maxQueryTime
            });
        }

        if (metrics.cacheHitRate < thresholds.minCacheHitRate) {
            alerts.push({
                type: 'cache_efficiency',
                severity: 'warning',
                message: `Cache hit rate (${metrics.cacheHitRate}%) below threshold (${thresholds.minCacheHitRate}%)`,
                value: metrics.cacheHitRate,
                threshold: thresholds.minCacheHitRate
            });
        }

        if (metrics.activeConnections > thresholds.maxConnections) {
            alerts.push({
                type: 'connection_count',
                severity: 'critical',
                message: `Active connections (${metrics.activeConnections}) exceed threshold (${thresholds.maxConnections})`,
                value: metrics.activeConnections,
                threshold: thresholds.maxConnections
            });
        }

        if (metrics.memoryUsage > thresholds.maxDatabaseSize) {
            alerts.push({
                type: 'database_size',
                severity: 'warning',
                message: `Database size (${(metrics.memoryUsage / 1024 / 1024).toFixed(2)}MB) exceeds threshold (${(thresholds.maxDatabaseSize / 1024 / 1024).toFixed(2)}MB)`,
                value: metrics.memoryUsage,
                threshold: thresholds.maxDatabaseSize
            });
        }

        const status = alerts.some(a => a.severity === 'critical') ? 'critical' :
                      alerts.some(a => a.severity === 'warning') ? 'warning' : 'healthy';

        return { alerts, status };
    }
}

// Type definitions
interface QueryPerformanceMetrics {
    avgQueryTime: number;
    slowQueryCount: number;
    totalQueries: number;
    queryEfficiency: number;
    topSlowQueries: Array<{ query: string; avgDuration: number; count: number }>;
    indexUsage: number;
}

interface IndexHealthMetrics {
    totalIndexes: number;
    usedIndexes: number;
    fragmentationRate: number;
    avgIndexSize: number;
    missingIndexes: string[];
    indexUsageRate: number;
}

interface CacheEfficiencyMetrics {
    hitRate: number;
    totalEntries: number;
    totalSize: number;
    avgHitTime: number;
    avgMissTime: number;
    avgTTL: number;
    fragmentationRate: number;
    efficiency: number;
}

interface ConcurrencyMetrics {
    walMode: boolean;
    activeConnections: number;
    totalConnections: number;
    avgConcurrentOps: number;
    lockContentions: number;
    checkpointEfficiency: number;
    concurrencyScore: number;
}

interface PerformanceRecommendation {
    type: string;
    priority: 'high' | 'medium' | 'low';
    title: string;
    description: string;
    action: string;
    impact: 'high' | 'medium' | 'low';
}

interface PerformanceAlert {
    type: string;
    severity: 'warning' | 'critical';
    message: string;
    value: number;
    threshold: number;
}

/**
 * Factory function to create database performance manager
 */
export function createDatabasePerformanceManager(db: DatabaseConnection): DatabasePerformanceManager {
    return new DatabasePerformanceManager(db);
}