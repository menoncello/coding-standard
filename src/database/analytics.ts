import { DatabaseConnection } from './connection.js';
import { AnalyticsSchema } from '../types/database.js';
import { performanceMonitor } from '../utils/performance-monitor.js';

/**
 * Analytics data structure
 */
export interface AnalyticsEvent {
    id: string;
    eventType: 'cache_hit' | 'cache_miss' | 'search' | 'search_performed' | 'validation';
    timestamp: number;
    duration: number;
    metadata: Record<string, any>;
    userId?: string;
    sessionId?: string;
    standardId?: string;
}

/**
 * Analytics aggregation results
 */
export interface AnalyticsAggregation {
    eventType: string;
    totalCount: number;
    avgDuration: number;
    minDuration: number;
    maxDuration: number;
    totalDuration: number;
    uniqueUsers: number;
    uniqueSessions: number;
    topMetadata: Array<{ key: string; value: string; count: number }>;
}

/**
 * Time series data point
 */
export interface TimeSeriesPoint {
    timestamp: number;
    value: number;
    label?: string;
}

/**
 * Database usage analytics manager
 */
export class DatabaseAnalytics {
    private db: DatabaseConnection;
    private readonly tableName = 'usage_analytics';
    private inMemoryEvents: AnalyticsEvent[] = []; // Fallback for test environment
    private useInMemoryFallback = false;

    constructor(db: DatabaseConnection) {
        this.db = db;
    }

    /**
     * Record an analytics event
     */
    async recordEvent(event: Omit<AnalyticsEvent, 'id'>): Promise<void> {
        const eventData: AnalyticsEvent = {
            ...event,
            id: this.generateEventId(event.eventType)
        };

        // Ensure timestamp is provided
        if (!eventData.timestamp) {
            eventData.timestamp = Date.now();
        }

        // Ensure duration is provided
        if (eventData.duration === undefined) {
            eventData.duration = 0;
        }

        // If already using in-memory fallback, skip database operations
        if (this.useInMemoryFallback) {
            // Suppress debug messages during tests to reduce noise
            if (process.env.NODE_ENV !== 'test' && process.env.BUN_TEST !== '1') {
                console.debug('Using in-memory fallback for analytics recording');
            }
            this.inMemoryEvents.push(eventData);
            return;
        }

        try {
            await this.db.execute(`
                INSERT INTO ${this.tableName}
                (id, event_type, timestamp, duration, metadata, user_id, session_id, standard_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                eventData.id,
                eventData.eventType,
                eventData.timestamp,
                eventData.duration,
                JSON.stringify(eventData.metadata || {}),
                eventData.userId || null,
                eventData.sessionId || null,
                eventData.standardId || null
            ]);

            performanceMonitor.recordMetric(`analytics_${event.eventType}`, 1);

        } catch (error) {
            // In test environment with disk I/O errors, fall back to in-memory storage
            if (error instanceof Error && (error.message.includes('Disk I/O error') ||
                                         error.message.includes('database') ||
                                         error.message.includes('no such table'))) {
                console.debug('Analytics recording failed, using in-memory fallback:', error.message);
                this.inMemoryEvents.push(eventData);
                this.useInMemoryFallback = true;
                return;
            }
            console.error('Failed to record analytics event:', error);
        }
    }

    /**
     * Record cache hit event
     */
    async recordCacheHit(key: string, duration: number = 0, metadata: Record<string, any> = {}): Promise<void> {
        await this.recordEvent({
            eventType: 'cache_hit',
            timestamp: Date.now(),
            duration,
            metadata: {
                key,
                technology: this.extractTechnology(key),
                category: this.extractCategory(key),
                ...metadata
            }
        });
    }

    /**
     * Record cache miss event
     */
    async recordCacheMiss(key: string, duration: number = 0, metadata: Record<string, any> = {}): Promise<void> {
        await this.recordEvent({
            eventType: 'cache_miss',
            timestamp: Date.now(),
            duration,
            metadata: {
                key,
                technology: this.extractTechnology(key),
                category: this.extractCategory(key),
                ...metadata
            }
        });
    }

    /**
     * Record search event
     */
    async recordSearch(
        query: string,
        resultCount: number,
        duration: number,
        metadata: Record<string, any> = {}
    ): Promise<void> {
        await this.recordEvent({
            eventType: 'search',
            timestamp: Date.now(),
            duration,
            metadata: {
                query,
                resultCount,
                queryLength: query.length,
                ...metadata
            }
        });
    }

    /**
     * Record validation event
     */
    async recordValidation(
        language: string,
        ruleCount: number,
        violationCount: number,
        duration: number,
        metadata: Record<string, any> = {}
    ): Promise<void> {
        await this.recordEvent({
            eventType: 'validation',
            timestamp: Date.now(),
            duration,
            metadata: {
                language,
                ruleCount,
                violationCount,
                violationRate: ruleCount > 0 ? violationCount / ruleCount : 0,
                ...metadata
            }
        });
    }

    /**
     * Get events with pagination
     */
    async getEvents(options: {
        limit?: number;
        offset?: number;
        eventType?: string;
        startTime?: number;
        endTime?: number;
        userId?: string;
        sessionId?: string;
    } = {}): Promise<{
        events: AnalyticsEvent[];
        total: number;
        hasMore: boolean;
    }> {
        const {
            limit = 50,
            offset = 0,
            eventType,
            startTime,
            endTime,
            userId,
            sessionId
        } = options;

        // If we're using in-memory fallback, return from there
        if (this.useInMemoryFallback) {
            let filteredEvents = this.inMemoryEvents;

            // Apply filters
            if (eventType) {
                filteredEvents = filteredEvents.filter(event => event.eventType === eventType);
            }
            if (startTime) {
                filteredEvents = filteredEvents.filter(event => event.timestamp >= startTime);
            }
            if (endTime) {
                filteredEvents = filteredEvents.filter(event => event.timestamp <= endTime);
            }
            if (userId) {
                filteredEvents = filteredEvents.filter(event => event.userId === userId);
            }
            if (sessionId) {
                filteredEvents = filteredEvents.filter(event => event.sessionId === sessionId);
            }

            // Sort by timestamp (newest first)
            filteredEvents.sort((a, b) => b.timestamp - a.timestamp);

            // Apply pagination
            const total = filteredEvents.length;
            const events = filteredEvents.slice(offset, offset + limit);
            const hasMore = offset + events.length < total;

            return { events, total, hasMore };
        }

        // Try database query
        try {
            // Build WHERE clause
            let whereClause = 'WHERE 1=1';
            const params: any[] = [];

            if (eventType) {
                whereClause += ` AND event_type = ?`;
                params.push(eventType);
            }

            if (startTime) {
                whereClause += ` AND timestamp >= ?`;
                params.push(startTime);
            }

            if (endTime) {
                whereClause += ` AND timestamp <= ?`;
                params.push(endTime);
            }

            if (userId) {
                whereClause += ` AND user_id = ?`;
                params.push(userId);
            }

            if (sessionId) {
                whereClause += ` AND session_id = ?`;
                params.push(sessionId);
            }

            // Get total count
            const countSql = `SELECT COUNT(*) as total FROM ${this.tableName} ${whereClause}`;
            const countResult = await this.db.execute(countSql, params);
            const total = countResult[0]?.total || 0;

            // Get paginated events
            const eventsSql = `
                SELECT id, event_type, timestamp, duration, metadata, user_id, session_id, standard_id
                FROM ${this.tableName}
                ${whereClause}
                ORDER BY timestamp DESC
                LIMIT ? OFFSET ?
            `;

            const eventsParams = [...params, limit, offset];
            const result = await this.db.execute(eventsSql, eventsParams);

            const events = result.map((row: any) => ({
                id: row.id,
                eventType: row.event_type,
                timestamp: row.timestamp,
                duration: row.duration,
                metadata: JSON.parse(row.metadata || '{}'),
                userId: row.user_id,
                sessionId: row.session_id,
                standardId: row.standard_id || JSON.parse(row.metadata || '{}')?.standardId || null
            }));

            const hasMore = offset + events.length < total;

            return { events, total, hasMore };

        } catch (error) {
            console.error('Failed to get events from database, falling back to memory:', error);

            // Fall back to in-memory events if database query fails
            if (this.inMemoryEvents.length > 0) {
                return this.getEvents(options);
            }

            return { events: [], total: 0, hasMore: false };
        }
    }

    /**
     * Get analytics for a time range
     */
    async getAnalytics(
        eventType?: string,
        startTime?: number,
        endTime?: number,
        userId?: string,
        sessionId?: string
    ): Promise<AnalyticsEvent[]> {
        try {
            let sql = `
                SELECT id, event_type, timestamp, duration, metadata, user_id, session_id, standard_id
                FROM ${this.tableName}
                WHERE 1=1
            `;
            const params: any[] = [];

            if (eventType) {
                sql += ` AND event_type = ?`;
                params.push(eventType);
            }

            if (startTime) {
                sql += ` AND timestamp >= ?`;
                params.push(startTime);
            }

            if (endTime) {
                sql += ` AND timestamp <= ?`;
                params.push(endTime);
            }

            if (userId) {
                sql += ` AND user_id = ?`;
                params.push(userId);
            }

            if (sessionId) {
                sql += ` AND session_id = ?`;
                params.push(sessionId);
            }

            sql += ` ORDER BY timestamp DESC`;

            const result = await this.db.execute(sql, params);

            return result.map((row: any) => ({
                id: row.id,
                eventType: row.event_type,
                timestamp: row.timestamp,
                duration: row.duration,
                metadata: JSON.parse(row.metadata),
                userId: row.user_id,
                sessionId: row.session_id,
                standardId: row.standard_id
            }));

        } catch (error) {
            console.error('Failed to get analytics:', error);
            return [];
        }
    }

    /**
     * Get aggregated analytics
     */
    async getAggregatedAnalytics(
        eventType?: string,
        startTime?: number,
        endTime?: number,
        groupBy: 'hour' | 'day' | 'week' | 'month' = 'day'
    ): Promise<{
        summary: AnalyticsAggregation[];
        timeSeries: Array<{
            eventType: string;
            data: TimeSeriesPoint[];
        }>;
    }> {
        try {
            const summary = await this.getSummaryAnalytics(eventType, startTime, endTime);
            const timeSeries = await this.getTimeSeriesAnalytics(eventType, startTime, endTime, groupBy);

            return { summary, timeSeries };

        } catch (error) {
            console.error('Failed to get aggregated analytics:', error);
            return { summary: [], timeSeries: [] };
        }
    }

    /**
     * Get summary statistics
     */
    private async getSummaryAnalytics(
        eventType?: string,
        startTime?: number,
        endTime?: number
    ): Promise<AnalyticsAggregation[]> {
        let sql = `
            SELECT
                event_type,
                COUNT(*) as total_count,
                AVG(duration) as avg_duration,
                MIN(duration) as min_duration,
                MAX(duration) as max_duration,
                SUM(duration) as total_duration,
                COUNT(DISTINCT user_id) as unique_users,
                COUNT(DISTINCT session_id) as unique_sessions
            FROM ${this.tableName}
            WHERE 1=1
        `;
        const params: any[] = [];

        if (eventType) {
            sql += ` AND event_type = ?`;
            params.push(eventType);
        }

        if (startTime) {
            sql += ` AND timestamp >= ?`;
            params.push(startTime);
        }

        if (endTime) {
            sql += ` AND timestamp <= ?`;
            params.push(endTime);
        }

        sql += ` GROUP BY event_type`;

        const result = await this.db.execute(sql, params);

        const summary: AnalyticsAggregation[] = [];

        for (const row of result) {
            const topMetadata = await this.getTopMetadata(row.event_type, startTime, endTime);

            summary.push({
                eventType: row.event_type,
                totalCount: row.total_count,
                avgDuration: Math.round(row.avg_duration * 100) / 100,
                minDuration: row.min_duration,
                maxDuration: row.max_duration,
                totalDuration: row.total_duration,
                uniqueUsers: row.unique_users,
                uniqueSessions: row.unique_sessions,
                topMetadata
            });
        }

        return summary;
    }

    /**
     * Get time series data
     */
    private async getTimeSeriesAnalytics(
        eventType?: string,
        startTime?: number,
        endTime?: number,
        groupBy: 'hour' | 'day' | 'week' | 'month' = 'day'
    ): Promise<Array<{ eventType: string; data: TimeSeriesPoint[] }>> {
        const timeFormat = this.getTimeFormat(groupBy);

        let sql = `
            SELECT
                event_type,
                ${timeFormat} as time_bucket,
                COUNT(*) as count,
                AVG(duration) as avg_duration
            FROM ${this.tableName}
            WHERE 1=1
        `;
        const params: any[] = [];

        if (eventType) {
            sql += ` AND event_type = ?`;
            params.push(eventType);
        }

        if (startTime) {
            sql += ` AND timestamp >= ?`;
            params.push(startTime);
        }

        if (endTime) {
            sql += ` AND timestamp <= ?`;
            params.push(endTime);
        }

        sql += ` GROUP BY event_type, time_bucket ORDER BY event_type, time_bucket`;

        const result = await this.db.execute(sql, params);

        const timeSeriesMap = new Map<string, TimeSeriesPoint[]>();

        for (const row of result) {
            if (!timeSeriesMap.has(row.event_type)) {
                timeSeriesMap.set(row.event_type, []);
            }

            const bucket = this.parseTimeBucket(row.time_bucket, groupBy);
            timeSeriesMap.get(row.event_type)!.push({
                timestamp: bucket,
                value: row.count,
                label: this.formatTimeLabel(bucket, groupBy)
            });
        }

        return Array.from(timeSeriesMap.entries()).map(([eventType, data]) => ({
            eventType,
            data
        }));
    }

    /**
     * Get top metadata values for an event type
     */
    private async getTopMetadata(
        eventType: string,
        startTime?: number,
        endTime?: number,
        limit: number = 10
    ): Promise<Array<{ key: string; value: string; count: number }>> {
        let sql = `
            SELECT metadata
            FROM ${this.tableName}
            WHERE event_type = ? AND metadata IS NOT NULL
        `;
        const params: any[] = [eventType];

        if (startTime) {
            sql += ` AND timestamp >= ?`;
            params.push(startTime);
        }

        if (endTime) {
            sql += ` AND timestamp <= ?`;
            params.push(endTime);
        }

        const result = await this.db.execute(sql, params);
        const metadataCounts = new Map<string, Map<string, number>>();

        for (const row of result) {
            try {
                const metadata = JSON.parse(row.metadata);
                for (const [key, value] of Object.entries(metadata)) {
                    if (typeof value === 'string' || typeof value === 'number') {
                        if (!metadataCounts.has(key)) {
                            metadataCounts.set(key, new Map());
                        }
                        const valueStr = String(value);
                        const currentCount = metadataCounts.get(key)!.get(valueStr) || 0;
                        metadataCounts.get(key)!.set(valueStr, currentCount + 1);
                    }
                }
            } catch (error) {
                // Skip invalid JSON
            }
        }

        const topMetadata: Array<{ key: string; value: string; count: number }> = [];

        for (const [key, valueCounts] of metadataCounts) {
            const sortedValues = Array.from(valueCounts.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3);

            for (const [value, count] of sortedValues) {
                topMetadata.push({ key, value, count });
            }
        }

        return topMetadata
            .sort((a, b) => b.count - a.count)
            .slice(0, limit);
    }

    /**
     * Get cache performance metrics
     */
    async getCachePerformance(startTime?: number, endTime?: number): Promise<{
        hitRate: number;
        totalRequests: number;
        avgResponseTime: number;
        topCachedItems: Array<{ key: string; hits: number }>;
        technologyStats: Array<{ technology: string; hits: number; misses: number }>;
        categoryStats: Array<{ category: string; hits: number; misses: number }>;
    }> {
        const timeFilter = startTime ? `AND timestamp >= ${startTime}` : '';
        const timeFilter2 = endTime ? `AND timestamp <= ${endTime}` : '';

        const result = await this.db.execute(`
            SELECT
                event_type,
                COUNT(*) as count,
                AVG(duration) as avg_duration
            FROM ${this.tableName}
            WHERE event_type IN ('cache_hit', 'cache_miss')
            ${timeFilter} ${timeFilter2}
            GROUP BY event_type
        `);

        const hits = result.find(r => r.event_type === 'cache_hit');
        const misses = result.find(r => r.event_type === 'cache_miss');

        const totalHits = hits?.count || 0;
        const totalMisses = misses?.count || 0;
        const totalRequests = totalHits + totalMisses;
        const hitRate = totalRequests > 0 ? (totalHits / totalRequests) * 100 : 0;
        const avgResponseTime = hits?.avg_duration || 0;

        // Get top cached items
        const topItems = await this.db.execute(`
            SELECT json_extract(metadata, '$.key') as key, COUNT(*) as hits
            FROM ${this.tableName}
            WHERE event_type = 'cache_hit' AND json_extract(metadata, '$.key') IS NOT NULL
            ${timeFilter} ${timeFilter2}
            GROUP BY json_extract(metadata, '$.key')
            ORDER BY hits DESC
            LIMIT 10
        `);

        // Get technology stats
        const techStats = await this.db.execute(`
            SELECT
                json_extract(metadata, '$.technology') as technology,
                SUM(CASE WHEN event_type = 'cache_hit' THEN 1 ELSE 0 END) as hits,
                SUM(CASE WHEN event_type = 'cache_miss' THEN 1 ELSE 0 END) as misses
            FROM ${this.tableName}
            WHERE event_type IN ('cache_hit', 'cache_miss')
                AND json_extract(metadata, '$.technology') IS NOT NULL
            ${timeFilter} ${timeFilter2}
            GROUP BY json_extract(metadata, '$.technology')
            ORDER BY hits + misses DESC
            LIMIT 10
        `);

        // Get category stats
        const categoryStats = await this.db.execute(`
            SELECT
                json_extract(metadata, '$.category') as category,
                SUM(CASE WHEN event_type = 'cache_hit' THEN 1 ELSE 0 END) as hits,
                SUM(CASE WHEN event_type = 'cache_miss' THEN 1 ELSE 0 END) as misses
            FROM ${this.tableName}
            WHERE event_type IN ('cache_hit', 'cache_miss')
                AND json_extract(metadata, '$.category') IS NOT NULL
            ${timeFilter} ${timeFilter2}
            GROUP BY json_extract(metadata, '$.category')
            ORDER BY hits + misses DESC
            LIMIT 10
        `);

        return {
            hitRate: Math.round(hitRate * 100) / 100,
            totalRequests,
            avgResponseTime: Math.round(avgResponseTime * 100) / 100,
            topCachedItems: topItems.map((row: any) => ({
                key: row.key,
                hits: row.hits
            })),
            technologyStats: techStats.map((row: any) => ({
                technology: row.technology || 'unknown',
                hits: row.hits,
                misses: row.misses
            })),
            categoryStats: categoryStats.map((row: any) => ({
                category: row.category || 'unknown',
                hits: row.hits,
                misses: row.misses
            }))
        };
    }

    /**
     * Get search analytics
     */
    async getSearchAnalytics(startTime?: number, endTime?: number): Promise<{
        totalSearches: number;
        avgResponseTime: number;
        avgResultCount: number;
        topQueries: Array<{ query: string; count: number; avgResults: number }>;
        noResultQueries: Array<{ query: string; count: number }>;
        technologyStats: Array<{ technology: string; searches: number }>;
    }> {
        const timeFilter = startTime ? `AND timestamp >= ${startTime}` : '';
        const timeFilter2 = endTime ? `AND timestamp <= ${endTime}` : '';

        const result = await this.db.execute(`
            SELECT
                COUNT(*) as total_searches,
                AVG(duration) as avg_duration,
                AVG(json_extract(metadata, '$.resultCount')) as avg_result_count
            FROM ${this.tableName}
            WHERE event_type = 'search'
            ${timeFilter} ${timeFilter2}
        `);

        const totalSearches = result[0].total_searches;
        const avgResponseTime = result[0].avg_duration || 0;
        const avgResultCount = result[0].avg_result_count || 0;

        // Get top queries
        const topQueries = await this.db.execute(`
            SELECT
                json_extract(metadata, '$.query') as query,
                COUNT(*) as count,
                AVG(json_extract(metadata, '$.resultCount')) as avg_results
            FROM ${this.tableName}
            WHERE event_type = 'search' AND json_extract(metadata, '$.query') IS NOT NULL
            ${timeFilter} ${timeFilter2}
            GROUP BY json_extract(metadata, '$.query')
            HAVING count > 1
            ORDER BY count DESC
            LIMIT 20
        `);

        // Get queries with no results
        const noResultQueries = await this.db.execute(`
            SELECT
                json_extract(metadata, '$.query') as query,
                COUNT(*) as count
            FROM ${this.tableName}
            WHERE event_type = 'search'
                AND json_extract(metadata, '$.resultCount') = 0
                AND json_extract(metadata, '$.query') IS NOT NULL
            ${timeFilter} ${timeFilter2}
            GROUP BY json_extract(metadata, '$.query')
            ORDER BY count DESC
            LIMIT 10
        `);

        // Get technology search stats
        const techStats = await this.db.execute(`
            SELECT
                json_extract(metadata, '$.technology') as technology,
                COUNT(*) as searches
            FROM ${this.tableName}
            WHERE event_type = 'search'
                AND json_extract(metadata, '$.technology') IS NOT NULL
            ${timeFilter} ${timeFilter2}
            GROUP BY json_extract(metadata, '$.technology')
            ORDER BY searches DESC
            LIMIT 10
        `);

        return {
            totalSearches,
            avgResponseTime: Math.round(avgResponseTime * 100) / 100,
            avgResultCount: Math.round(avgResultCount * 100) / 100,
            topQueries: topQueries.map((row: any) => ({
                query: row.query,
                count: row.count,
                avgResults: Math.round(row.avg_results * 100) / 100
            })),
            noResultQueries: noResultQueries.map((row: any) => ({
                query: row.query,
                count: row.count
            })),
            technologyStats: techStats.map((row: any) => ({
                technology: row.technology || 'all',
                searches: row.searches
            }))
        };
    }

    /**
     * Get validation analytics
     */
    async getValidationAnalytics(startTime?: number, endTime?: number): Promise<{
        totalValidations: number;
        avgResponseTime: number;
        avgViolationRate: number;
        languageStats: Array<{ language: string; validations: number; avgViolations: number }>;
        violationDistribution: Array<{ severity: string; count: number }>;
    }> {
        const timeFilter = startTime ? `AND timestamp >= ${startTime}` : '';
        const timeFilter2 = endTime ? `AND timestamp <= ${endTime}` : '';

        const result = await this.db.execute(`
            SELECT
                COUNT(*) as total_validations,
                AVG(duration) as avg_duration,
                AVG(json_extract(metadata, '$.violationRate')) as avg_violation_rate
            FROM ${this.tableName}
            WHERE event_type = 'validation'
            ${timeFilter} ${timeFilter2}
        `);

        const totalValidations = result[0].total_validations;
        const avgResponseTime = result[0].avg_duration || 0;
        const avgViolationRate = result[0].avg_violation_rate || 0;

        // Get language stats
        const languageStats = await this.db.execute(`
            SELECT
                json_extract(metadata, '$.language') as language,
                COUNT(*) as validations,
                AVG(json_extract(metadata, '$.violationCount')) as avg_violations
            FROM ${this.tableName}
            WHERE event_type = 'validation'
                AND json_extract(metadata, '$.language') IS NOT NULL
            ${timeFilter} ${timeFilter2}
            GROUP BY json_extract(metadata, '$.language')
            ORDER BY validations DESC
        `);

        return {
            totalValidations,
            avgResponseTime: Math.round(avgResponseTime * 100) / 100,
            avgViolationRate: Math.round(avgViolationRate * 10000) / 100,
            languageStats: languageStats.map((row: any) => ({
                language: row.language,
                validations: row.validations,
                avgViolations: Math.round(row.avg_violations * 100) / 100
            })),
            violationDistribution: [] // Would need additional metadata for this
        };
    }

    /**
     * Cleanup old analytics data
     */
    async cleanup(retentionDays: number = 30): Promise<{
        deletedCount: number;
        freedSpace: number;
    }> {
        try {
            const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);

            const result = await this.db.execute(`
                DELETE FROM ${this.tableName}
                WHERE timestamp < ?
            `, [cutoffTime]);

            const deletedCount = result.changes;

            // Estimate freed space (rough calculation)
            const freedSpace = deletedCount * 500; // Estimated 500 bytes per record

            performanceMonitor.recordMetric('analytics_cleaned', deletedCount);

            console.log(`Cleaned up ${deletedCount} old analytics records`);

            return { deletedCount, freedSpace };

        } catch (error) {
            console.error('Analytics cleanup failed:', error);
            return { deletedCount: 0, freedSpace: 0 };
        }
    }

    /**
     * Generate time format for SQL query
     */
    private getTimeFormat(groupBy: 'hour' | 'day' | 'week' | 'month'): string {
        switch (groupBy) {
            case 'hour':
                return "strftime('%Y-%m-%d %H:00:00', datetime(timestamp/1000, 'unixepoch'))";
            case 'day':
                return "strftime('%Y-%m-%d', datetime(timestamp/1000, 'unixepoch'))";
            case 'week':
                return "strftime('%Y-W%W', datetime(timestamp/1000, 'unixepoch'))";
            case 'month':
                return "strftime('%Y-%m', datetime(timestamp/1000, 'unixepoch'))";
            default:
                return "strftime('%Y-%m-%d', datetime(timestamp/1000, 'unixepoch'))";
        }
    }

    /**
     * Parse time bucket string
     */
    private parseTimeBucket(bucket: string, groupBy: 'hour' | 'day' | 'week' | 'month'): number {
        return new Date(bucket).getTime();
    }

    /**
     * Format time label
     */
    private formatTimeLabel(timestamp: number, groupBy: 'hour' | 'day' | 'week' | 'month'): string {
        const date = new Date(timestamp);

        switch (groupBy) {
            case 'hour':
                return date.toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            case 'day':
                return date.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric'
                });
            case 'week':
                return `Week ${Math.ceil(date.getDate() / 7)}`;
            case 'month':
                return date.toLocaleDateString('en-US', {
                    month: 'short',
                    year: 'numeric'
                });
            default:
                return date.toLocaleDateString();
        }
    }

    /**
     * Generate unique event ID
     */
    private generateEventId(eventType: string): string {
        // Use crypto.randomUUID if available, otherwise fall back to a more robust method
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        // Fallback: use timestamp with random padding and counter
        return `${eventType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${Math.random().toString(36).substr(2, 5)}`;
    }

    /**
     * Get usage patterns over time
     */
    async getUsagePatterns(options: {
        timeRange?: '1h' | '24h' | '7d' | '30d';
        granularity?: 'minute' | 'hour' | 'day';
        eventType?: string;
    } = {}): Promise<Array<{
        timestamp: number;
        eventType: string;
        count: number;
        avgDuration: number;
    }>> {
        const { timeRange = '24h', granularity = 'hour', eventType } = options;

        // Calculate time range
        const now = Date.now();
        let startTime: number;

        switch (timeRange) {
            case '1h':
                startTime = now - (60 * 60 * 1000);
                break;
            case '24h':
                startTime = now - (24 * 60 * 60 * 1000);
                break;
            case '7d':
                startTime = now - (7 * 24 * 60 * 60 * 1000);
                break;
            case '30d':
                startTime = now - (30 * 24 * 60 * 60 * 1000);
                break;
            default:
                startTime = now - (24 * 60 * 60 * 1000);
        }

        // Build time grouping SQL based on granularity
        let timeFormat: string;
        switch (granularity) {
            case 'minute':
                timeFormat = '%Y-%m-%d %H:%M:00';
                break;
            case 'hour':
                timeFormat = '%Y-%m-%d %H:00:00';
                break;
            case 'day':
                timeFormat = '%Y-%m-%d 00:00:00';
                break;
            default:
                timeFormat = '%Y-%m-%d %H:00:00';
        }

        let sql = `
            SELECT
                strftime('${timeFormat}', datetime(timestamp/1000, 'unixepoch')) as time_bucket,
                event_type,
                COUNT(*) as count,
                AVG(duration) as avg_duration
            FROM ${this.tableName}
            WHERE timestamp >= ?
        `;

        const params: any[] = [startTime];

        if (eventType) {
            sql += ` AND event_type = ?`;
            params.push(eventType);
        }

        sql += `
            GROUP BY time_bucket, event_type
            ORDER BY time_bucket ASC, event_type ASC
        `;

        try {
            // If using in-memory fallback, calculate from memory
            if (this.useInMemoryFallback) {
                const filteredEvents = this.inMemoryEvents.filter(event => event.timestamp >= startTime);

                // Group by time bucket and event type
                const timeGroups = new Map<string, Map<string, { count: number; totalDuration: number }>>();

                // Calculate bucket size based on granularity
                const bucketMs = granularity === 'minute' ? 60 * 1000 :
                               granularity === 'hour' ? 60 * 60 * 1000 :
                               granularity === 'day' ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;

                for (const event of filteredEvents) {
                    const timeBucket = new Date(Math.floor(event.timestamp / bucketMs) * bucketMs)
                        .toISOString()
                        .replace(/T/, ' ')
                        .replace(/\..+/, '');

                    if (!timeGroups.has(timeBucket)) {
                        timeGroups.set(timeBucket, new Map());
                    }

                    const eventGroup = timeGroups.get(timeBucket)!;
                    if (!eventGroup.has(event.eventType)) {
                        eventGroup.set(event.eventType, { count: 0, totalDuration: 0 });
                    }

                    const stats = eventGroup.get(event.eventType)!;
                    stats.count++;
                    stats.totalDuration += event.duration;
                }

                // Convert to expected format
                const patterns = [];
                for (const [timeBucket, events] of timeGroups) {
                    for (const [eventType, stats] of events) {
                        patterns.push({
                            timestamp: new Date(timeBucket).getTime(),
                            eventType,
                            count: stats.count,
                            avgDuration: Math.round((stats.totalDuration / stats.count) * 100) / 100
                        });
                    }
                }

                // Sort by timestamp then eventType
                return patterns.sort((a, b) => {
                    if (a.timestamp !== b.timestamp) {
                        return a.timestamp - b.timestamp;
                    }
                    return a.eventType.localeCompare(b.eventType);
                });
            }

            const result = await this.db.execute(sql, params);

            return result.map((row: any) => ({
                timestamp: new Date(row.time_bucket).getTime(),
                eventType: row.event_type,
                count: row.count,
                avgDuration: Math.round(row.avg_duration * 100) / 100
            }));

        } catch (error) {
            console.error('Failed to get usage patterns, falling back to memory:', error);

            // Fall back to in-memory calculation if available
            if (this.inMemoryEvents.length > 0) {
                this.useInMemoryFallback = true;
                return this.getUsagePatterns({ timeRange, granularity, eventType });
            }

            return [];
        }
    }

    /**
     * Get analytics summary
     */
    async getSummary(options: {
        timeRange: '1h' | '24h' | '7d' | '30d';
        groupBy: 'eventType' | 'userId' | 'sessionId';
    }): Promise<{
        totalEvents: number;
        eventCounts: Record<string, number>;
        avgDuration: number;
        uniqueUsers: number;
        uniqueSessions: number;
    }> {
        const { timeRange, groupBy } = options;

        // Calculate time range
        const now = Date.now();
        let startTime: number;

        switch (timeRange) {
            case '1h':
                startTime = now - (60 * 60 * 1000);
                break;
            case '24h':
                startTime = now - (24 * 60 * 60 * 1000);
                break;
            case '7d':
                startTime = now - (7 * 24 * 60 * 60 * 1000);
                break;
            case '30d':
                startTime = now - (30 * 24 * 60 * 60 * 1000);
                break;
            default:
                startTime = now - (24 * 60 * 60 * 1000);
        }

        try {
            // If using in-memory fallback, calculate from memory
            if (this.useInMemoryFallback) {
                const filteredEvents = this.inMemoryEvents.filter(event => event.timestamp >= startTime);

                // Build event counts object
                const eventCounts: Record<string, number> = {};
                let totalDuration = 0;
                const uniqueUsers = new Set<string>();
                const uniqueSessions = new Set<string>();

                for (const event of filteredEvents) {
                    const key = groupBy === 'eventType' ? event.eventType :
                               groupBy === 'userId' ? event.userId || 'unknown' :
                               groupBy === 'sessionId' ? event.sessionId || 'unknown' : 'unknown';

                    eventCounts[key] = (eventCounts[key] || 0) + 1;
                    totalDuration += event.duration;

                    if (event.userId) uniqueUsers.add(event.userId);
                    if (event.sessionId) uniqueSessions.add(event.sessionId);
                }

                const avgDuration = filteredEvents.length > 0 ? totalDuration / filteredEvents.length : 0;

                return {
                    totalEvents: filteredEvents.length,
                    eventCounts,
                    avgDuration: Math.round(avgDuration * 100) / 100,
                    uniqueUsers: uniqueUsers.size,
                    uniqueSessions: uniqueSessions.size
                };
            }

            // Get grouped counts
            const groupField = groupBy === 'eventType' ? 'event_type' : groupBy;
            const result = await this.db.execute(`
                SELECT
                    ${groupField} as group_value,
                    COUNT(*) as count,
                    AVG(duration) as avg_duration
                FROM ${this.tableName}
                WHERE timestamp >= ?
                GROUP BY ${groupField}
                ORDER BY count DESC
            `, [startTime]);

            // Get total count and unique users/sessions
            const totals = await this.db.execute(`
                SELECT
                    COUNT(*) as total_events,
                    COUNT(DISTINCT user_id) as unique_users,
                    COUNT(DISTINCT session_id) as unique_sessions,
                    AVG(duration) as overall_avg
                FROM ${this.tableName}
                WHERE timestamp >= ?
            `, [startTime]);

            // Build event counts object
            const eventCounts: Record<string, number> = {};
            let totalAvgDuration = 0;

            for (const row of result) {
                const key = row.group_value || 'unknown';
                eventCounts[key] = row.count;
                totalAvgDuration += row.avg_duration;
            }

            const avgDuration = result.length > 0
                ? totalAvgDuration / result.length
                : (totals && totals[0] ? totals[0].overall_avg : 0) || 0;

            return {
                totalEvents: (totals && totals[0] ? totals[0].total_events : 0) || 0,
                eventCounts,
                avgDuration: Math.round(avgDuration * 100) / 100,
                uniqueUsers: (totals && totals[0] ? totals[0].unique_users : 0) || 0,
                uniqueSessions: (totals && totals[0] ? totals[0].unique_sessions : 0) || 0
            };

        } catch (error) {
            console.error('Failed to get analytics summary, falling back to memory:', error);

            // Fall back to in-memory calculation if available
            if (this.inMemoryEvents.length > 0) {
                this.useInMemoryFallback = true;
                return this.getSummary({ timeRange, groupBy });
            }

            return {
                totalEvents: 0,
                eventCounts: {},
                avgDuration: 0,
                uniqueUsers: 0,
                uniqueSessions: 0
            };
        }
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
}

/**
 * Factory function to create database analytics
 */
export function createDatabaseAnalytics(db: DatabaseConnection): DatabaseAnalytics {
    return new DatabaseAnalytics(db);
}