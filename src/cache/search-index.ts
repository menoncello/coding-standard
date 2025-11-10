import { DatabaseConnection } from '../database/connection.js';
import { SearchOptions, SearchResult } from '../types/database.js';
import { Standard } from '../types/mcp.js';

/**
 * FTS5 search engine with BM25 ranking and relevance scoring
 */
export class FtsSearchEngine {
    private db: DatabaseConnection;
    private readonly tableName = 'standards_search_idx';
    private readonly contentTable = 'standards_search_data';

    constructor(db: DatabaseConnection) {
        this.db = db;
    }

    /**
     * Index a standard for full-text search
     */
    async indexStandard(standard: Standard): Promise<void> {
        const startTime = performance.now();

        try {
            const rulesText = standard.rules.map(rule =>
                `${rule.description} ${rule.example || ''} ${rule.category}`
            ).join(' ');

            const now = Date.now();

            await this.db.transaction(async (connection) => {
                // Check if standard already exists
                const existing = await connection.execute(`
                    SELECT id FROM ${this.contentTable} WHERE standard_id = ?
                `, [standard.id]);

                let contentId: number;

                if (existing.length > 0) {
                    // Update existing record
                    contentId = existing[0].id;
                    await connection.execute(`
                        UPDATE ${this.contentTable}
                        SET title = ?, description = ?, technology = ?, category = ?,
                            rules = ?, last_updated = ?, updated_at = ?
                        WHERE standard_id = ?
                    `, [
                        standard.title,
                        standard.description,
                        standard.technology,
                        standard.category,
                        rulesText,
                        standard.lastUpdated,
                        now,
                        standard.id
                    ]);

                    // Update FTS5 index
                    await connection.execute(`
                        DELETE FROM ${this.tableName} WHERE standard_id = ?
                    `, [standard.id]);

                    await connection.execute(`
                        INSERT INTO ${this.tableName} (standard_id, title, description, technology, category, rules)
                        VALUES (?, ?, ?, ?, ?, ?)
                    `, [
                        standard.id,
                        standard.title,
                        standard.description,
                        standard.technology,
                        standard.category,
                        rulesText
                    ]);
                } else {
                    // Insert new record
                    const result = await connection.execute(`
                        INSERT INTO ${this.contentTable}
                        (standard_id, title, description, technology, category, rules,
                         last_updated, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        standard.id,
                        standard.title,
                        standard.description,
                        standard.technology,
                        standard.category,
                        rulesText,
                        standard.lastUpdated,
                        now,
                        now
                    ]);

                    contentId = result.lastInsertRowid as number;

                    // Insert into FTS5 index
                    await connection.execute(`
                        INSERT INTO ${this.tableName} (standard_id, title, description, technology, category, rules)
                        VALUES (?, ?, ?, ?, ?, ?)
                    `, [
                        standard.id,
                        standard.title,
                        standard.description,
                        standard.technology,
                        standard.category,
                        rulesText
                    ]);
                }
            });

            const indexTime = performance.now() - startTime;

            console.log(`Indexed standard ${standard.id} in ${indexTime.toFixed(2)}ms`);

        } catch (error) {
            console.error(`Failed to index standard ${standard.id}:`, error);
            throw error;
        }
    }

    /**
     * Remove a standard from the search index
     */
    async removeStandard(standardId: string): Promise<void> {
        try {
            await this.db.transaction(async (connection) => {
                // Remove from FTS5 index
                await connection.execute(`
                    DELETE FROM ${this.tableName} WHERE standard_id = ?
                `, [standardId]);

                // Remove from content table
                await connection.execute(`
                    DELETE FROM ${this.contentTable} WHERE standard_id = ?
                `, [standardId]);

                console.log(`Removed standard ${standardId} from search index`);
            });

        } catch (error) {
            console.error(`Failed to remove standard ${standardId} from search index:`, error);
            throw error;
        }
    }

    /**
     * Perform full-text search with BM25 ranking
     */
    async search(query: string, options: SearchOptions = {}): Promise<{
        results: SearchResult[];
        totalCount: number;
        queryTime: number;
    }> {
        const startTime = performance.now();

        try {
            const {
                limit = 10,
                offset = 0,
                technology,
                category,
                fuzzy = true,
                orderBy = 'rank',
                orderDirection = 'DESC'
            } = options;

            // Build search query
            let ftsQuery = this.buildFtsQuery(query, fuzzy);
            let sql = `
                SELECT
                    sc.standard_id,
                    sc.title,
                    sc.description,
                    sc.technology,
                    sc.category,
                    sc.rules,
                    sc.last_updated,
                    rank
                FROM ${this.tableName} ft
                JOIN ${this.contentTable} sc ON ft.standard_id = sc.standard_id
                WHERE ${this.tableName} MATCH ?
            `;

            const params: any[] = [ftsQuery];

            // Add filters
            if (technology) {
                sql += ` AND sc.technology = ?`;
                params.push(technology);
            }

            if (category) {
                sql += ` AND sc.category = ?`;
                params.push(category);
            }

            // Add ordering
            if (orderBy === 'rank') {
                sql += ` ORDER BY rank ${orderDirection}`;
            } else if (orderBy === 'lastUpdated') {
                sql += ` ORDER BY sc.last_updated ${orderDirection}`;
            }

            // Add pagination
            sql += ` LIMIT ? OFFSET ?`;
            params.push(limit, offset);

            // Execute search query
            const results = await this.db.execute(sql, params);

            // Get total count
            const countSql = `
                SELECT COUNT(*) as total
                FROM ${this.tableName} ft
                JOIN ${this.contentTable} sc ON ft.standard_id = sc.standard_id
                WHERE ${this.tableName} MATCH ?
                ${technology ? 'AND sc.technology = ?' : ''}
                ${category ? 'AND sc.category = ?' : ''}
            `;

            const countParams = [ftsQuery];
            if (technology) countParams.push(technology);
            if (category) countParams.push(category);

            const countResult = await this.db.execute(countSql, countParams);
            const totalCount = countResult[0].total;

            // Format results
            const searchResults: SearchResult[] = results.map((row: any) => ({
                standardId: row.standard_id,
                title: row.title,
                description: row.description,
                technology: row.technology,
                category: row.category,
                rules: this.parseRules(row.rules),
                lastUpdated: row.last_updated,
                rank: row.rank || 0,
                bm25Score: this.calculateBM25Score(row.rank || 0)
            }));

            const queryTime = performance.now() - startTime;

            // Log search analytics
            await this.logSearchAnalytics(query, options, searchResults.length, queryTime);

            return {
                results: searchResults,
                totalCount,
                queryTime
            };

        } catch (error) {
            console.error(`Search query failed for "${query}":`, error);
            throw error;
        }
    }

    /**
     * Build FTS query with optional fuzzy matching
     */
    private buildFtsQuery(query: string, fuzzy: boolean): string {
        if (!query.trim()) {
            throw new Error('Search query cannot be empty');
        }

        // Clean and tokenize the query
        let cleanQuery = query.trim()
            .replace(/[^\w\s.-]/g, ' ') // Replace special chars with spaces
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim();

        if (!cleanQuery) {
            throw new Error('Invalid search query');
        }

        const terms = cleanQuery.split(' ').filter(term => term.length > 0);

        if (fuzzy) {
            // Use NEAR operator for fuzzy matching (FTS5 syntax)
            return terms.map(term => `"${term}"`).join(' NEAR ');
        } else {
            // Exact phrase matching with AND logic
            return terms.map(term => `"${term}"`).join(' AND ');
        }
    }

    /**
     * Calculate BM25 score from FTS rank
     */
    private calculateBM25Score(rank: number): number {
        // FTS5 rank is negative, convert to positive BM25 score
        return Math.max(0, -rank);
    }

    /**
     * Parse rules JSON string
     */
    private parseRules(rulesText: string): Array<{
        id: string;
        description: string;
        severity: 'error' | 'warning' | 'info';
        category: string;
        example?: string;
    }> {
        try {
            return JSON.parse(rulesText);
        } catch (error) {
            console.warn('Failed to parse rules JSON:', error);
            return [];
        }
    }

    /**
     * Generate unique search ID
     */
    private generateSearchId(standardId: string): string {
        return `search_${standardId}`;
    }

    /**
     * Log search analytics
     */
    private async logSearchAnalytics(
        query: string,
        options: SearchOptions,
        resultCount: number,
        queryTime: number
    ): Promise<void> {
        try {
            const metadata = {
                query,
                technology: options.technology,
                category: options.category,
                fuzzy: options.fuzzy,
                limit: options.limit,
                resultCount,
                queryTime
            };

            await this.db.execute(`
                INSERT INTO usage_analytics (id, event_type, timestamp, duration, metadata)
                VALUES (?, ?, ?, ?, ?)
            `, [
                this.generateAnalyticsId(),
                'search',
                Date.now(),
                queryTime,
                JSON.stringify(metadata)
            ]);
        } catch (error) {
            console.debug('Failed to log search analytics:', error);
        }
    }

    /**
     * Generate analytics ID
     */
    private generateAnalyticsId(): string {
        return `analytics_search_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get search suggestions based on partial query
     */
    async getSuggestions(partialQuery: string, limit: number = 5): Promise<string[]> {
        if (!partialQuery || partialQuery.length < 2) {
            return [];
        }

        try {
            const results = await this.db.execute(`
                SELECT DISTINCT title, technology, category
                FROM ${this.contentTable}
                WHERE title LIKE ? OR description LIKE ? OR technology LIKE ? OR category LIKE ?
                LIMIT ?
            `, [
                `%${partialQuery}%`,
                `%${partialQuery}%`,
                `%${partialQuery}%`,
                `%${partialQuery}%`,
                limit
            ]);

            const suggestions = new Set<string>();

            for (const row of results) {
                suggestions.add(row.title);
                if (row.technology && row.technology.toLowerCase().includes(partialQuery.toLowerCase())) {
                    suggestions.add(row.technology);
                }
                if (row.category && row.category.toLowerCase().includes(partialQuery.toLowerCase())) {
                    suggestions.add(row.category);
                }
            }

            return Array.from(suggestions).slice(0, limit);

        } catch (error) {
            console.error('Failed to get search suggestions:', error);
            return [];
        }
    }

    /**
     * Get popular search terms from analytics
     */
    async getPopularTerms(limit: number = 10): Promise<Array<{
        term: string;
        count: number;
        avgResults: number;
    }>> {
        try {
            const results = await this.db.execute(`
                SELECT
                    json_extract(metadata, '$.query') as term,
                    COUNT(*) as count,
                    AVG(json_extract(metadata, '$.resultCount')) as avg_results
                FROM usage_analytics
                WHERE event_type = 'search'
                    AND json_extract(metadata, '$.query') IS NOT NULL
                    AND json_extract(metadata, '$.query') != ''
                GROUP BY json_extract(metadata, '$.query')
                HAVING count > 1
                ORDER BY count DESC, avg_results DESC
                LIMIT ?
            `, [limit]);

            return results.map((row: any) => ({
                term: row.term,
                count: row.count,
                avgResults: Math.round(row.avg_results * 100) / 100
            }));

        } catch (error) {
            console.error('Failed to get popular search terms:', error);
            return [];
        }
    }

    /**
     * Get search statistics
     */
    async getStatistics(): Promise<{
        totalStandards: number;
        totalSearches: number;
        avgQueryTime: number;
        topTechnologies: Array<{ technology: string; count: number }>;
        topCategories: Array<{ category: string; count: number }>;
        recentQueries: Array<{ query: string; timestamp: number; resultCount: number }>;
    }> {
        try {
            // Get total standards in index
            const totalStandardsResult = await this.db.execute(`
                SELECT COUNT(*) as count FROM ${this.contentTable}
            `);

            // Get search statistics
            const searchStatsResult = await this.db.execute(`
                SELECT
                    COUNT(*) as total_searches,
                    AVG(json_extract(metadata, '$.queryTime')) as avg_query_time
                FROM usage_analytics
                WHERE event_type = 'search'
            `);

            // Get top technologies
            const techResult = await this.db.execute(`
                SELECT technology, COUNT(*) as count
                FROM ${this.contentTable}
                WHERE technology IS NOT NULL
                GROUP BY technology
                ORDER BY count DESC
                LIMIT 10
            `);

            // Get top categories
            const categoryResult = await this.db.execute(`
                SELECT category, COUNT(*) as count
                FROM ${this.contentTable}
                WHERE category IS NOT NULL
                GROUP BY category
                ORDER BY count DESC
                LIMIT 10
            `);

            // Get recent queries
            const recentResult = await this.db.execute(`
                SELECT
                    json_extract(metadata, '$.query') as query,
                    timestamp,
                    json_extract(metadata, '$.resultCount') as result_count
                FROM usage_analytics
                WHERE event_type = 'search'
                    AND json_extract(metadata, '$.query') IS NOT NULL
                ORDER BY timestamp DESC
                LIMIT 10
            `);

            return {
                totalStandards: totalStandardsResult[0].count,
                totalSearches: searchStatsResult[0].total_searches || 0,
                avgQueryTime: searchStatsResult[0].avg_query_time || 0,
                topTechnologies: techResult,
                topCategories: categoryResult,
                recentQueries: recentResult.map((row: any) => ({
                    query: row.query,
                    timestamp: row.timestamp,
                    resultCount: row.result_count
                }))
            };

        } catch (error) {
            console.error('Failed to get search statistics:', error);
            return {
                totalStandards: 0,
                totalSearches: 0,
                avgQueryTime: 0,
                topTechnologies: [],
                topCategories: [],
                recentQueries: []
            };
        }
    }

    /**
     * Optimize search index for better performance
     */
    async optimize(): Promise<void> {
        try {
            // Rebuild FTS index
            await this.db.execute(`INSERT INTO ${this.tableName}(${this.tableName}) VALUES('rebuild')`);

            // Analyze content table for query optimization
            await this.db.execute(`ANALYZE ${this.contentTable}`);

            console.log('Search index optimized successfully');

        } catch (error) {
            console.error('Failed to optimize search index:', error);
            throw error;
        }
    }

    /**
     * Clear search index
     */
    async clear(): Promise<void> {
        try {
            // Clear FTS5 index
            await this.db.execute(`DELETE FROM ${this.tableName}`);

            console.log('Search index cleared');

        } catch (error) {
            console.error('Failed to clear search index:', error);
            throw error;
        }
    }

    /**
     * Check search index health
     */
    async checkHealth(): Promise<{
        healthy: boolean;
        totalEntries: number;
        ftsSize: number;
        lastIndexed: number;
        issues: string[];
    }> {
        const issues: string[] = [];

        try {
            // Check if FTS table exists
            const ftsCheck = await this.db.execute(`
                SELECT name FROM sqlite_master
                WHERE type='table' AND name='${this.tableName}'
            `);

            if (ftsCheck.length === 0) {
                issues.push('FTS table does not exist');
            }

            // Check content table
            const contentCheck = await this.db.execute(`
                SELECT name FROM sqlite_master
                WHERE type='table' AND name='${this.contentTable}'
            `);

            if (contentCheck.length === 0) {
                issues.push('Content table does not exist');
            }

            // Get statistics
            let totalEntries = 0;
            let lastIndexed = 0;

            if (contentCheck.length > 0) {
                const stats = await this.db.execute(`
                    SELECT COUNT(*) as count, MAX(updated_at) as last_updated
                    FROM ${this.contentTable}
                `);
                totalEntries = stats[0].count;
                lastIndexed = stats[0].last_updated || 0;
            }

            // Check FTS integrity
            let ftsSize = 0;
            if (ftsCheck.length > 0) {
                const sizeCheck = await this.db.execute(`
                    SELECT COUNT(*) as count FROM ${this.tableName}
                `);
                ftsSize = sizeCheck[0].count;
            }

            if (totalEntries > 0 && ftsSize !== totalEntries) {
                issues.push(`FTS index out of sync: ${ftsSize} vs ${totalEntries} entries`);
            }

            return {
                healthy: issues.length === 0,
                totalEntries,
                ftsSize,
                lastIndexed,
                issues
            };

        } catch (error) {
            issues.push(`Health check failed: ${error}`);
            return {
                healthy: false,
                totalEntries: 0,
                ftsSize: 0,
                lastIndexed: 0,
                issues
            };
        }
    }
}

/**
 * Factory function to create FTS search engine
 */
export function createFtsSearchEngine(db: DatabaseConnection): FtsSearchEngine {
    return new FtsSearchEngine(db);
}