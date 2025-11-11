import { Database } from 'bun:sqlite';
import { StandardRule, SearchQuery, SearchResult, RegistryStats, RegistryConfig, Conflict } from './types.js';
import { StandardValidator } from './validator.js';
import { SemanticNamingService } from './semantic-naming.js';
import { performanceMonitor } from '../utils/performance-monitor.js';

/**
 * Standards Registry with memory → SQLite → file system architecture
 */
export class StandardsRegistry {
    private db: Database;
    private validator: StandardValidator;
    private semanticNaming: SemanticNamingService;
    private config: RegistryConfig;
    private rules: Map<string, StandardRule> = new Map();
    private isInitialized = false;

    constructor(dbPath: string = './standards-registry.db', config?: Partial<RegistryConfig>) {
        this.config = {
            cacheEnabled: true,
            cacheTtl: 5 * 60 * 1000, // 5 minutes
            maxCacheSize: 1000,
            validationEnabled: true,
            performanceMonitoring: true,
            conflictDetection: true,
            ...config
        };

        try {
            this.db = new Database(dbPath);
            this.validator = new StandardValidator();
            this.semanticNaming = new SemanticNamingService({
                ttl: this.config.cacheTtl,
                maxSize: this.config.maxCacheSize
            });

            this.initializeDatabase();
        } catch (error) {
            throw new Error(`Failed to create registry database: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Initialize database schema
     */
    private initializeDatabase(): void {
        // Create standards table
        this.db.run(`
            CREATE TABLE IF NOT EXISTS standards (
                id TEXT PRIMARY KEY,
                semantic_name TEXT UNIQUE NOT NULL,
                display_name TEXT NOT NULL,
                description TEXT NOT NULL,
                category TEXT NOT NULL,
                technology TEXT NOT NULL,
                pattern TEXT NOT NULL,
                severity TEXT NOT NULL,
                tags TEXT NOT NULL,
                examples TEXT NOT NULL,
                related_rules TEXT NOT NULL,
                aliases TEXT NOT NULL,
                deprecated INTEGER DEFAULT 0,
                deprecation_message TEXT,
                metadata TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )
        `);

        // Create indexes for performance
        this.db.run('CREATE INDEX IF NOT EXISTS idx_standards_semantic_name ON standards(semantic_name)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_standards_category ON standards(category)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_standards_technology ON standards(technology)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_standards_severity ON standards(severity)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_standards_updated_at ON standards(updated_at)');

        // Create FTS table for full-text search
        this.db.run(`
            CREATE VIRTUAL TABLE IF NOT EXISTS standards_fts USING fts5(
                semantic_name,
                display_name,
                description,
                category,
                technology,
                tags,
                aliases,
                content='standards',
                content_rowid='rowid'
            )
        `);

        // Create triggers for FTS
        this.db.run(`
            CREATE TRIGGER IF NOT EXISTS standards_fts_insert AFTER INSERT ON standards
            BEGIN
                INSERT INTO standards_fts(
                    semantic_name,
                    display_name,
                    description,
                    category,
                    technology,
                    tags,
                    aliases
                ) VALUES (
                    new.semantic_name,
                    new.display_name,
                    new.description,
                    new.category,
                    new.technology,
                    new.tags,
                    new.aliases
                );
            END
        `);

        this.db.run(`
            CREATE TRIGGER IF NOT EXISTS standards_fts_delete AFTER DELETE ON standards
            BEGIN
                DELETE FROM standards_fts WHERE rowid = old.rowid;
            END
        `);

        this.db.run(`
            CREATE TRIGGER IF NOT EXISTS standards_fts_update AFTER UPDATE ON standards
            BEGIN
                DELETE FROM standards_fts WHERE rowid = old.rowid;
                INSERT INTO standards_fts(
                    semantic_name,
                    display_name,
                    description,
                    category,
                    technology,
                    tags,
                    aliases
                ) VALUES (
                    new.semantic_name,
                    new.display_name,
                    new.description,
                    new.category,
                    new.technology,
                    new.tags,
                    new.aliases
                );
            END
        `);
    }

    /**
     * Initialize the registry by loading all rules from database
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        const startTime = Date.now();

        try {
            // Load all rules from SQLite
            const query = this.db.query('SELECT * FROM standards ORDER BY updated_at DESC');
            const results = query.all() as any[];

            // Convert database rows to StandardRule objects
            for (const row of results) {
                const rule = this.mapRowToRule(row);
                this.rules.set(rule.id, rule);
            }

            this.isInitialized = true;

            if (this.config.performanceMonitoring) {
                const duration = Date.now() - startTime;
                performanceMonitor.recordMetricSimple('registry_init', duration, {
                    rulesLoaded: this.rules.size
                });
            }
        } catch (error) {
            throw new Error(`Failed to initialize standards registry: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Add a new standard rule to the registry
     */
    async addRule(rule: StandardRule): Promise<void> {
        const startTime = Date.now();

        // Ensure registry is initialized
        if (!this.isInitialized) {
            await this.initialize();
        }

        try {
            // Validate rule if enabled
            if (this.config.validationEnabled) {
                const existingRules = Array.from(this.rules.values());
                const validation = this.validator.validateRule(rule, existingRules);

                if (!validation.isValid) {
                    const errorMessages = validation.errors.map(e => `${e.field}: ${e.message}`).join('; ');
                    throw new Error(`Validation failed: ${errorMessages}`);
                }

                // Log warnings
                if (validation.warnings.length > 0) {
                    const warningMessages = validation.warnings.map(w => `${w.field}: ${w.message}`).join('; ');
                    console.warn(`Validation warnings for rule ${rule.semanticName}: ${warningMessages}`);
                }
            }

            // Check for conflicts if enabled
            if (this.config.conflictDetection) {
                const existingRules = Array.from(this.rules.values());
                const conflicts = this.validator.detectConflicts(rule, existingRules);

                if (conflicts.length > 0) {
                    const conflictMessages = conflicts.map(c => `${c.type}: ${c.description}`).join('; ');
                    throw new Error(`Conflicts detected: ${conflictMessages}`);
                }
            }

            // Add to memory cache
            this.rules.set(rule.id, rule);

            // Add to SQLite database
            this.db.run(`
                INSERT INTO standards (
                    id, semantic_name, display_name, description, category, technology,
                    pattern, severity, tags, examples, related_rules, aliases,
                    deprecated, deprecation_message, metadata, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                rule.id,
                rule.semanticName,
                rule.displayName,
                rule.description,
                rule.category,
                rule.technology,
                rule.pattern,
                rule.severity,
                JSON.stringify(rule.tags),
                JSON.stringify(rule.examples),
                JSON.stringify(rule.relatedRules),
                JSON.stringify(rule.aliases),
                rule.deprecated ? 1 : 0,
                rule.deprecationMessage || null,
                JSON.stringify(rule.metadata),
                rule.metadata.createdAt,
                rule.metadata.updatedAt
            ]);

            // Clear semantic naming cache
            this.semanticNaming.clearCache();

            if (this.config.performanceMonitoring) {
                const duration = Date.now() - startTime;
                performanceMonitor.recordMetricSimple('add_rule', duration, {
                    ruleId: rule.id,
                    semanticName: rule.semanticName
                });
            }

        } catch (error) {
            // Rollback memory changes
            this.rules.delete(rule.id);
            throw error;
        }
    }

    /**
     * Update an existing standard rule
     */
    async updateRule(ruleId: string, updates: Partial<StandardRule>): Promise<void> {
        const startTime = Date.now();

        // Ensure registry is initialized
        if (!this.isInitialized) {
            await this.initialize();
        }

        const existingRule = this.rules.get(ruleId);
        if (!existingRule) {
            throw new Error(`Rule with ID ${ruleId} not found`);
        }

        try {
            // Ensure the timestamp is always greater than the original
            const currentTime = Date.now();
            const newTimestamp = existingRule.metadata.updatedAt >= currentTime
                ? existingRule.metadata.updatedAt + 1
                : currentTime;

            // Create updated rule
            const updatedRule: StandardRule = {
                ...existingRule,
                ...updates,
                id: ruleId, // Ensure ID doesn't change
                metadata: {
                    ...existingRule.metadata,
                    ...updates.metadata,
                    updatedAt: newTimestamp
                }
            };

            // Validate updated rule if enabled
            if (this.config.validationEnabled) {
                const otherRules = Array.from(this.rules.values()).filter(r => r.id !== ruleId);
                const validation = this.validator.validateRule(updatedRule, otherRules);

                if (!validation.isValid) {
                    const errorMessages = validation.errors.map(e => `${e.field}: ${e.message}`).join('; ');
                    throw new Error(`Validation failed: ${errorMessages}`);
                }
            }

            // Update memory cache
            this.rules.set(ruleId, updatedRule);

            // Update SQLite database
            this.db.run(`
                UPDATE standards SET
                    display_name = ?, description = ?, category = ?, technology = ?,
                    pattern = ?, severity = ?, tags = ?, examples = ?, related_rules = ?,
                    aliases = ?, deprecated = ?, deprecation_message = ?, metadata = ?,
                    updated_at = ?
                WHERE id = ?
            `, [
                updatedRule.displayName,
                updatedRule.description,
                updatedRule.category,
                updatedRule.technology,
                updatedRule.pattern,
                updatedRule.severity,
                JSON.stringify(updatedRule.tags),
                JSON.stringify(updatedRule.examples),
                JSON.stringify(updatedRule.relatedRules),
                JSON.stringify(updatedRule.aliases),
                updatedRule.deprecated ? 1 : 0,
                updatedRule.deprecationMessage || null,
                JSON.stringify(updatedRule.metadata),
                updatedRule.metadata.updatedAt,
                ruleId
            ]);

            // Clear semantic naming cache
            this.semanticNaming.clearCache();

            if (this.config.performanceMonitoring) {
                const duration = Date.now() - startTime;
                performanceMonitor.recordMetricSimple('update_rule', duration, {
                    ruleId,
                    semanticName: updatedRule.semanticName
                });
            }

        } catch (error) {
            // Rollback memory changes
            this.rules.set(ruleId, existingRule);
            throw error;
        }
    }

    /**
     * Remove a standard rule from the registry
     */
    async removeRule(ruleId: string, force: boolean = false): Promise<void> {
        const startTime = Date.now();

        // Ensure registry is initialized
        if (!this.isInitialized) {
            await this.initialize();
        }

        const rule = this.rules.get(ruleId);
        if (!rule) {
            throw new Error(`Rule with ID ${ruleId} not found`);
        }

        // Check if rule is referenced by other rules
        if (!force) {
            const referencingRules = Array.from(this.rules.values()).filter(r =>
                r.relatedRules.includes(ruleId)
            );

            if (referencingRules.length > 0) {
                const referencingNames = referencingRules.map(r => r.semanticName).join(', ');
                throw new Error(`Cannot delete rule: it is referenced by ${referencingRules.length} other rules: ${referencingNames}`);
            }
        }

        try {
            // Remove from memory cache
            this.rules.delete(ruleId);

            // Remove from SQLite database
            this.db.run('DELETE FROM standards WHERE id = ?', [ruleId]);

            // Update related rules references
            if (force) {
                const allRules = Array.from(this.rules.values());
                for (const otherRule of allRules) {
                    const updatedRelated = otherRule.relatedRules.filter(id => id !== ruleId);
                    if (updatedRelated.length !== otherRule.relatedRules.length) {
                        await this.updateRule(otherRule.id, { relatedRules: updatedRelated });
                    }
                }
            }

            // Clear semantic naming cache
            this.semanticNaming.clearCache();

            if (this.config.performanceMonitoring) {
                const duration = Date.now() - startTime;
                performanceMonitor.recordMetricSimple('remove_rule', duration, {
                    ruleId,
                    semanticName: rule.semanticName
                });
            }

        } catch (error) {
            // Rollback memory changes
            this.rules.set(ruleId, rule);
            throw error;
        }
    }

    /**
     * Get a rule by its ID
     */
    async getRule(ruleId: string): Promise<StandardRule | null> {
        // Ensure registry is initialized
        if (!this.isInitialized) {
            await this.initialize();
        }

        return this.rules.get(ruleId) || null;
    }

    /**
     * Get a rule by its semantic name
     */
    async getRuleBySemanticName(semanticName: string, useCache: boolean = true): Promise<StandardRule | null> {
        // Ensure registry is initialized
        if (!this.isInitialized) {
            await this.initialize();
        }

        const rules = Array.from(this.rules.values());
        return await this.semanticNaming.resolveSemanticName(semanticName, rules, useCache);
    }

    /**
     * Search for rules based on query and filters
     */
    async searchRules(
        query: SearchQuery,
        sort?: { field: string; order: 'asc' | 'desc' },
        pagination?: { limit: number; offset: number }
    ): Promise<{ results: SearchResult[]; total: number }> {
        // Ensure registry is initialized
        if (!this.isInitialized) {
            await this.initialize();
        }

        const rules = Array.from(this.rules.values());
        return await this.semanticNaming.searchRules(query, rules, sort, pagination);
    }

    /**
     * Get all rules with optional filtering
     */
    async getAllRules(filters?: Partial<SearchQuery>): Promise<StandardRule[]> {
        // Ensure registry is initialized
        if (!this.isInitialized) {
            await this.initialize();
        }

        let rules = Array.from(this.rules.values());

        if (filters) {
            if (filters.category) {
                rules = rules.filter(rule => rule.category.toLowerCase() === filters.category!.toLowerCase());
            }

            if (filters.technology) {
                rules = rules.filter(rule => rule.technology.toLowerCase() === filters.technology!.toLowerCase());
            }

            if (filters.severity && filters.severity.length > 0) {
                rules = rules.filter(rule => filters.severity!.includes(rule.severity));
            }

            if (filters.tags && filters.tags.length > 0) {
                rules = rules.filter(rule =>
                    filters.tags!.some(tag => rule.tags.includes(tag))
                );
            }

            if (filters.includeDeprecated === false) {
                rules = rules.filter(rule => !rule.deprecated);
            }
        }

        return rules;
    }

    /**
     * Get registry statistics
     */
    async getStats(): Promise<RegistryStats> {
        // Ensure registry is initialized
        if (!this.isInitialized) {
            await this.initialize();
        }

        const rules = Array.from(this.rules.values());

        const rulesByCategory: Record<string, number> = {};
        const rulesByTechnology: Record<string, number> = {};
        const rulesBySeverity: Record<string, number> = {};

        for (const rule of rules) {
            rulesByCategory[rule.category] = (rulesByCategory[rule.category] || 0) + 1;
            rulesByTechnology[rule.technology] = (rulesByTechnology[rule.technology] || 0) + 1;
            rulesBySeverity[rule.severity] = (rulesBySeverity[rule.severity] || 0) + 1;
        }

        return {
            totalRules: rules.length,
            rulesByCategory,
            rulesByTechnology,
            rulesBySeverity,
            deprecatedRules: rules.filter(rule => rule.deprecated).length,
            lastUpdated: Math.max(...rules.map(rule => rule.metadata.updatedAt))
        };
    }

    /**
     * Get suggestions for semantic names
     */
    async getSemanticNameSuggestions(partial: string, limit: number = 10): Promise<string[]> {
        // Ensure registry is initialized
        if (!this.isInitialized) {
            await this.initialize();
        }

        const rules = Array.from(this.rules.values());
        return await this.semanticNaming.getSemanticNameSuggestions(partial, rules, limit);
    }

    /**
     * Find related rules for a given rule
     */
    async findRelatedRules(ruleId: string, limit: number = 5): Promise<SearchResult[]> {
        // Ensure registry is initialized
        if (!this.isInitialized) {
            await this.initialize();
        }

        const rule = this.rules.get(ruleId);
        if (!rule) {
            throw new Error(`Rule with ID ${ruleId} not found`);
        }

        const rules = Array.from(this.rules.values());
        return await this.semanticNaming.findRelatedRules(rule, rules, limit);
    }

    /**
     * Close the registry and database connection
     */
    close(): void {
        if (this.db) {
            this.db.close();
        }
        this.semanticNaming.clearCache();
        this.rules.clear();
        this.isInitialized = false;
    }

    /**
     * Get cache statistics
     */
    getCacheStats() {
        return this.semanticNaming.getCacheStats();
    }

    /**
     * Map database row to StandardRule object
     */
    private mapRowToRule(row: any): StandardRule {
        return {
            id: row.id,
            semanticName: row.semantic_name,
            displayName: row.display_name,
            description: row.description,
            category: row.category,
            technology: row.technology,
            pattern: row.pattern,
            severity: row.severity,
            tags: JSON.parse(row.tags),
            examples: JSON.parse(row.examples),
            relatedRules: JSON.parse(row.related_rules),
            aliases: JSON.parse(row.aliases),
            deprecated: Boolean(row.deprecated),
            deprecationMessage: row.deprecation_message,
            metadata: JSON.parse(row.metadata)
        };
    }
}