import { StandardsRegistry } from './registry.js';
import { StandardRule } from './types.js';
import { StandardValidator } from './validator.js';
import { FileChange } from '../utils/file-watcher.js';
import { Logger, LoggerFactory } from '../utils/logger/logger-factory.js';
import { performanceMonitor } from '../utils/performance-monitor.js';

/**
 * Hot reload operation result
 */
export interface HotReloadResult {
    success: boolean;
    processedFiles: string[];
    errors: string[];
    warnings: string[];
    addedRules: string[];
    updatedRules: string[];
    removedRules: string[];
    rollbackData?: RollbackData;
    duration: number;
}

/**
 * Validation result for file changes
 */
export interface ValidationResult {
    isValid: boolean;
    errors: Array<{ file: string; message: string }>;
    warnings: Array<{ file: string; message: string }>;
    validFiles: string[];
}

/**
 * Rollback data for failed operations
 */
export interface RollbackData {
    addedRules: StandardRule[];
    updatedRules: Array<{ id: string; originalRule: StandardRule }>;
    removedRules: Array<{ id: string; originalRule: StandardRule }>;
}

/**
 * Hot reload configuration
 */
export interface HotReloadConfig {
    enabled: boolean;
    validateBeforeUpdate: boolean;
    enableRollback: boolean;
    maxConcurrentOperations: number;
    operationTimeoutMs: number;
    conflictResolution: 'fail' | 'overwrite' | 'merge';
}

/**
 * Hot reload manager for registry updates with conflict detection and rollback
 */
export class HotReloadManager {
    private registry: StandardsRegistry;
    private validator: StandardValidator;
    private config: HotReloadConfig;
    private logger: Logger;
    private ongoingOperations = new Set<string>();

    constructor(
        registry: StandardsRegistry,
        config: Partial<HotReloadConfig> = {}
    ) {
        this.registry = registry;
        this.validator = new StandardValidator();
        this.logger = LoggerFactory.getInstance();

        this.config = {
            enabled: true,
            validateBeforeUpdate: true,
            enableRollback: true,
            maxConcurrentOperations: 5,
            operationTimeoutMs: 30000, // 30 seconds
            conflictResolution: 'fail',
            ...config
        };
    }

    /**
     * Process file changes and update registry
     */
    async processChanges(changes: FileChange[]): Promise<HotReloadResult> {
        const startTime = Date.now();
        const operationId = this.generateOperationId();

        try {
            if (!this.config.enabled) {
                return {
                    success: false,
                    processedFiles: [],
                    errors: ['Hot reload is disabled'],
                    warnings: [],
                    addedRules: [],
                    updatedRules: [],
                    removedRules: [],
                    duration: Date.now() - startTime
                };
            }

            // Check concurrent operation limit
            if (this.ongoingOperations.size >= this.config.maxConcurrentOperations) {
                return {
                    success: false,
                    processedFiles: [],
                    errors: ['Too many concurrent hot reload operations'],
                    warnings: [],
                    addedRules: [],
                    updatedRules: [],
                    removedRules: [],
                    duration: Date.now() - startTime
                };
            }

            this.ongoingOperations.add(operationId);
            this.logger.info(`Starting hot reload operation ${operationId}`, {
                fileCount: changes.length,
                operationId
            });

            // Validate changes
            const validationResult = await this.validateChanges(changes);
            if (!validationResult.isValid && this.config.validateBeforeUpdate) {
                this.ongoingOperations.delete(operationId);
                return {
                    success: false,
                    processedFiles: [],
                    errors: validationResult.errors.map(e => `${e.file}: ${e.message}`),
                    warnings: validationResult.warnings.map(w => `${w.file}: ${w.message}`),
                    addedRules: [],
                    updatedRules: [],
                    removedRules: [],
                    duration: Date.now() - startTime
                };
            }

            // Process valid files
            const result = await this.processValidFiles(
                validationResult.validFiles,
                changes
            );

            // Add validation warnings to result
            result.warnings.push(...validationResult.warnings.map(w => `${w.file}: ${w.message}`));

            result.duration = Date.now() - startTime;

            // Record performance metric
            performanceMonitor.recordMetricSimple('hot_reload_operation', result.duration, {
                operationId,
                success: result.success,
                filesProcessed: result.processedFiles.length,
                rulesAdded: result.addedRules.length,
                rulesUpdated: result.updatedRules.length,
                rulesRemoved: result.removedRules.length
            });

            this.logger.info(`Hot reload operation ${operationId} completed`, {
                success: result.success,
                duration: result.duration,
                filesProcessed: result.processedFiles.length,
                rulesModified: result.addedRules.length + result.updatedRules.length + result.removedRules.length
            });

            return result;

        } catch (error) {
            const duration = Date.now() - startTime;
            this.logger.error(`Hot reload operation ${operationId} failed`, {
                error: error instanceof Error ? error.message : String(error),
                duration
            });

            return {
                success: false,
                processedFiles: [],
                errors: [error instanceof Error ? error.message : 'Unknown error'],
                warnings: [],
                addedRules: [],
                updatedRules: [],
                removedRules: [],
                duration
            };
        } finally {
            this.ongoingOperations.delete(operationId);
        }
    }

    /**
     * Validate file changes before processing
     */
    async validateChanges(changes: FileChange[]): Promise<ValidationResult> {
        const startTime = Date.now();
        const errors: Array<{ file: string; message: string }> = [];
        const warnings: Array<{ file: string; message: string }> = [];
        const validFiles: string[] = [];

        this.logger.debug(`Validating ${changes.length} file changes`);

        for (const change of changes) {
            try {
                // Skip deleted files for validation
                if (change.type === 'delete') {
                    validFiles.push(change.path);
                    continue;
                }

                // Validate file exists and is readable
                const file = Bun.file(change.path);
                const exists = await file.exists();
                if (!exists) {
                    errors.push({ file: change.path, message: 'File does not exist' });
                    continue;
                }

                // Parse file based on extension
                const content = await file.text();
                const parsedData = await this.parseFileContent(change.path, content);

                if (!parsedData) {
                    errors.push({ file: change.path, message: 'Failed to parse file content' });
                    continue;
                }

                // Validate as standard rule if applicable
                if (this.isStandardsFile(change.path)) {
                    const validationResult = await this.validateStandardRule(
                        parsedData as Partial<StandardRule>
                    );

                    if (!validationResult.isValid) {
                        errors.push({
                            file: change.path,
                            message: validationResult.errors.join('; ')
                        });
                        continue;
                    }

                    if (validationResult.warnings.length > 0) {
                        warnings.push({
                            file: change.path,
                            message: validationResult.warnings.join('; ')
                        });
                    }
                }

                validFiles.push(change.path);

            } catch (error) {
                errors.push({
                    file: change.path,
                    message: error instanceof Error ? error.message : 'Validation error'
                });
            }
        }

        const duration = Date.now() - startTime;
        performanceMonitor.recordMetricSimple('hot_reload_validation', duration, {
            fileCount: changes.length,
            validFiles: validFiles.length,
            errors: errors.length,
            warnings: warnings.length
        });

        return {
            isValid: errors.length === 0,
            errors,
            warnings,
            validFiles
        };
    }

    /**
     * Rollback failed hot reload operations
     */
    async rollbackFailedOperations(rollbackData: RollbackData): Promise<void> {
        const startTime = Date.now();

        try {
            this.logger.info('Starting rollback operation', {
                addedRulesCount: rollbackData.addedRules.length,
                updatedRulesCount: rollbackData.updatedRules.length,
                removedRulesCount: rollbackData.removedRules.length
            });

            // Rollback added rules (remove them)
            for (const rule of rollbackData.addedRules) {
                try {
                    await this.registry.removeRule(rule.id, true);
                } catch (error) {
                    this.logger.warn(`Failed to rollback added rule ${rule.id}`, { error });
                }
            }

            // Rollback updated rules (restore originals)
            for (const { id, originalRule } of rollbackData.updatedRules) {
                try {
                    await this.registry.updateRule(id, originalRule);
                } catch (error) {
                    this.logger.warn(`Failed to rollback updated rule ${id}`, { error });
                }
            }

            // Rollback removed rules (re-add them)
            for (const { originalRule } of rollbackData.removedRules) {
                try {
                    await this.registry.addRule(originalRule);
                } catch (error) {
                    this.logger.warn(`Failed to re-add removed rule ${originalRule.id}`, { error });
                }
            }

            const duration = Date.now() - startTime;
            performanceMonitor.recordMetricSimple('hot_reload_rollback', duration, {
                rolledBackRules: rollbackData.addedRules.length +
                                rollbackData.updatedRules.length +
                                rollbackData.removedRules.length
            });

            this.logger.info('Rollback operation completed', { duration });

        } catch (error) {
            this.logger.error('Rollback operation failed', { error });
            throw error;
        }
    }

    /**
     * Get hot reload statistics
     */
    getStats(): {
        config: HotReloadConfig;
        ongoingOperations: number;
        isHealthy: boolean;
    } {
        return {
            config: { ...this.config },
            ongoingOperations: this.ongoingOperations.size,
            isHealthy: this.ongoingOperations.size < this.config.maxConcurrentOperations
        };
    }

    /**
     * Update hot reload configuration
     */
    updateConfig(config: Partial<HotReloadConfig>): void {
        this.config = { ...this.config, ...config };
        this.logger.info('Hot reload configuration updated', { config: this.config });
    }

    /**
     * Process valid files and update registry
     */
    private async processValidFiles(
        validFiles: string[],
        allChanges: FileChange[]
    ): Promise<HotReloadResult> {
        const result: HotReloadResult = {
            success: true,
            processedFiles: [],
            errors: [],
            warnings: [],
            addedRules: [],
            updatedRules: [],
            removedRules: [],
            duration: 0
        };

        const rollbackData: RollbackData = {
            addedRules: [],
            updatedRules: [],
            removedRules: []
        };

        try {
            // Process files based on change type
            for (const filePath of validFiles) {
                const change = allChanges.find(c => c.path === filePath);
                if (!change) continue;

                this.logger.debug(`Processing file change: ${change.type} - ${filePath}`);

                try {
                    await this.processFileChange(change, rollbackData, result);
                    result.processedFiles.push(filePath);
                } catch (error) {
                    const errorMessage = `Failed to process ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`;
                    result.errors.push(errorMessage);
                    this.logger.error(errorMessage, { error });
                }
            }

            // If any errors occurred and rollback is enabled, rollback changes
            if (result.errors.length > 0 && this.config.enableRollback) {
                this.logger.warn('Rolling back due to processing errors', {
                    errorCount: result.errors.length
                });

                await this.rollbackFailedOperations(rollbackData);
                result.success = false;
                result.addedRules = [];
                result.updatedRules = [];
                result.removedRules = [];
                result.rollbackData = undefined;
            } else {
                result.rollbackData = this.config.enableRollback ? rollbackData : undefined;
            }

            return result;

        } catch (error) {
            this.logger.error('Critical error during file processing', { error });

            // Attempt rollback if enabled
            if (this.config.enableRollback) {
                try {
                    await this.rollbackFailedOperations(rollbackData);
                } catch (rollbackError) {
                    this.logger.error('Rollback failed', { error: rollbackError });
                }
            }

            result.success = false;
            result.errors.push(`Critical processing error: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return result;
        }
    }

    /**
     * Process individual file change
     */
    private async processFileChange(
        change: FileChange,
        rollbackData: RollbackData,
        result: HotReloadResult
    ): Promise<void> {
        if (change.type === 'delete') {
            await this.handleFileDeletion(change.path, rollbackData, result);
        } else {
            await this.handleFileCreationOrUpdate(change.path, rollbackData, result);
        }
    }

    /**
     * Handle file deletion
     */
    private async handleFileDeletion(
        filePath: string,
        rollbackData: RollbackData,
        result: HotReloadResult
    ): Promise<void> {
        if (!this.isStandardsFile(filePath)) {
            return; // Only process standards files
        }

        const ruleId = this.extractRuleIdFromPath(filePath);
        if (!ruleId) {
            return;
        }

        // Get existing rule before deletion for rollback
        const existingRule = await this.registry.getRule(ruleId);
        if (existingRule) {
            rollbackData.removedRules.push({
                id: ruleId,
                originalRule: { ...existingRule }
            });
        }

        await this.registry.removeRule(ruleId, true);
        result.removedRules.push(ruleId);

        this.logger.debug(`Removed rule due to file deletion: ${ruleId}`);
    }

    /**
     * Handle file creation or update
     */
    private async handleFileCreationOrUpdate(
        filePath: string,
        rollbackData: RollbackData,
        result: HotReloadResult
    ): Promise<void> {
        if (!this.isStandardsFile(filePath)) {
            return; // Only process standards files
        }

        // Read and parse file content
        const file = Bun.file(filePath);
        const content = await file.text();
        const ruleData = await this.parseFileContent(filePath, content);

        if (!ruleData || !this.isStandardRuleData(ruleData)) {
            return;
        }

        const rule = this.createStandardRuleFromData(ruleData, filePath);
        const ruleId = this.extractRuleIdFromPath(filePath) || rule.id;

        // Check if rule already exists
        const existingRule = await this.registry.getRule(ruleId);

        if (existingRule) {
            // Update existing rule
            if (this.config.enableRollback) {
                rollbackData.updatedRules.push({
                    id: ruleId,
                    originalRule: { ...existingRule }
                });
            }

            await this.registry.updateRule(existingRule.id, rule);
            result.updatedRules.push(ruleId);

            this.logger.debug(`Updated rule: ${ruleId}`);
        } else {
            // Add new rule
            if (this.config.enableRollback) {
                rollbackData.addedRules.push({ ...rule });
            }

            await this.registry.addRule(rule);
            result.addedRules.push(ruleId);

            this.logger.debug(`Added new rule: ${ruleId}`);
        }
    }

    /**
     * Parse file content based on extension
     */
    private async parseFileContent(filePath: string, content: string): Promise<any> {
        const ext = filePath.toLowerCase().split('.').pop();

        try {
            switch (ext) {
                case 'json':
                    return JSON.parse(content);
                case 'yaml':
                case 'yml':
                    // Use Bun's YAML parser if available, otherwise fallback
                    return this.parseYaml(content);
                case 'md':
                    return this.parseMarkdown(content, filePath);
                default:
                    return null;
            }
        } catch (error) {
            this.logger.warn(`Failed to parse ${filePath}`, { error });
            return null;
        }
    }

    /**
     * Parse YAML content (simple implementation)
     */
    private parseYaml(content: string): any {
        // Simple YAML parser for basic structures
        // In production, use a proper YAML library
        try {
            // This is a simplified implementation
            // Consider using a proper YAML parser like js-yaml
            const lines = content.split('\n');
            const result: any = {};
            let currentKey: string | null = null;
            let inMultiline = false;
            let multilineValue = '';

            for (const line of lines) {
                const trimmed = line.trim();

                if (trimmed.startsWith('#') || trimmed === '') continue;

                if (inMultiline) {
                    if (trimmed.startsWith('  ') || trimmed === '') {
                        multilineValue += line + '\n';
                    } else {
                        result[currentKey] = multilineValue.trim();
                        inMultiline = false;
                        currentKey = null;
                        multilineValue = '';
                    }
                }

                if (!inMultiline) {
                    const colonIndex = trimmed.indexOf(':');
                    if (colonIndex > 0) {
                        currentKey = trimmed.substring(0, colonIndex).trim();
                        const value = trimmed.substring(colonIndex + 1).trim();

                        if (value === '' || value === '|') {
                            inMultiline = true;
                        } else if (value.startsWith('"') && value.endsWith('"')) {
                            result[currentKey] = value.slice(1, -1);
                        } else if (value === 'true' || value === 'false') {
                            result[currentKey] = value === 'true';
                        } else if (!isNaN(Number(value))) {
                            result[currentKey] = Number(value);
                        } else {
                            result[currentKey] = value;
                        }
                    }
                }
            }

            if (inMultiline && currentKey) {
                result[currentKey] = multilineValue.trim();
            }

            return result;
        } catch (error) {
            throw new Error(`YAML parsing failed: ${error}`);
        }
    }

    /**
     * Parse markdown content
     */
    private parseMarkdown(content: string, filePath: string): any {
        // Extract front matter from markdown
        const frontMatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
        if (frontMatterMatch) {
            return this.parseYaml(frontMatterMatch[1]);
        }

        // For standards files without front matter, create a basic structure
        return {
            displayName: this.extractDisplayNameFromPath(filePath),
            description: this.extractDescriptionFromMarkdown(content),
            category: 'uncategorized',
            technology: 'general',
            pattern: '',
            severity: 'medium',
            tags: [],
            examples: [],
            relatedRules: [],
            aliases: []
        };
    }

    /**
     * Check if file is a standards file
     */
    private isStandardsFile(filePath: string): boolean {
        return filePath.toLowerCase().includes('standard') ||
               filePath.toLowerCase().includes('rule') ||
               filePath.toLowerCase().endsWith('.json') ||
               filePath.toLowerCase().endsWith('.yaml') ||
               filePath.toLowerCase().endsWith('.yml');
    }

    /**
     * Validate standard rule
     */
    private async validateStandardRule(ruleData: Partial<StandardRule>): Promise<{
        isValid: boolean;
        errors: string[];
        warnings: string[];
    }> {
        try {
            // Convert to StandardRule format for validation
            const rule = this.ensureValidStandardRule(ruleData);

            // Use existing validator
            const existingRules = Array.from((await this.registry.getAllRules()));
            const validation = this.validator.validateRule(rule, existingRules);

            return {
                isValid: validation.isValid,
                errors: validation.errors.map(e => `${e.field}: ${e.message}`),
                warnings: validation.warnings.map(w => `${w.field}: ${w.message}`)
            };
        } catch (error) {
            return {
                isValid: false,
                errors: [error instanceof Error ? error.message : 'Validation error'],
                warnings: []
            };
        }
    }

    /**
     * Extract rule ID from file path
     */
    private extractRuleIdFromPath(filePath: string): string | null {
        const basename = filePath.split('/').pop()?.replace(/\.(json|yaml|yml|md)$/i, '');
        return basename || null;
    }

    /**
     * Extract display name from path
     */
    private extractDisplayNameFromPath(filePath: string): string {
        const basename = filePath.split('/').pop()?.replace(/\.(json|yaml|yml|md)$/i, '');
        return basename || 'Unknown Rule';
    }

    /**
     * Extract description from markdown content
     */
    private extractDescriptionFromMarkdown(content: string): string {
        const lines = content.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('---')) {
                return trimmed;
            }
        }
        return 'No description available';
    }

    /**
     * Check if parsed data looks like a standard rule
     */
    private isStandardRuleData(data: any): boolean {
        return data &&
               typeof data === 'object' &&
               (data.displayName || data.display_name || data.name);
    }

    /**
     * Ensure data conforms to StandardRule format
     */
    private ensureValidStandardRule(data: any): Partial<StandardRule> {
        return {
            id: data.id || this.generateRuleId(),
            semanticName: data.semanticName || data.semantic_name || this.extractDisplayNameFromPath(''),
            displayName: data.displayName || data.display_name || data.name || 'Unknown Rule',
            description: data.description || 'No description provided',
            category: data.category || 'general',
            technology: data.technology || 'general',
            pattern: data.pattern || '',
            severity: data.severity || 'medium',
            tags: Array.isArray(data.tags) ? data.tags : [],
            examples: Array.isArray(data.examples) ? data.examples : [],
            relatedRules: Array.isArray(data.relatedRules) ? data.relatedRules : [],
            aliases: Array.isArray(data.aliases) ? data.aliases : [],
            deprecated: Boolean(data.deprecated),
            deprecationMessage: data.deprecationMessage || data.deprecation_message,
            metadata: {
                createdAt: data.metadata?.createdAt || data.created_at || Date.now(),
                updatedAt: data.metadata?.updatedAt || data.updated_at || Date.now(),
                version: data.metadata?.version || '1.0.0',
                author: data.metadata?.author || 'hot-reload',
                source: 'file-watch'
            }
        };
    }

    /**
     * Create StandardRule from parsed data
     */
    private createStandardRuleFromData(data: any, filePath: string): StandardRule {
        const ruleData = this.ensureValidStandardRule(data);

        // Generate rule ID if not present
        if (!ruleData.id) {
            ruleData.id = this.generateRuleId();
        }

        // Generate semantic name if not present
        if (!ruleData.semanticName) {
            ruleData.semanticName = this.generateSemanticName(ruleData, filePath);
        }

        return ruleData as StandardRule;
    }

    /**
     * Generate unique rule ID
     */
    private generateRuleId(): string {
        return `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Generate semantic name for rule
     */
    private generateSemanticName(rule: Partial<StandardRule>, filePath: string): string {
        const tech = rule.technology?.toLowerCase().replace(/[^a-z0-9]/g, '-') || 'general';
        const category = rule.category?.toLowerCase().replace(/[^a-z0-9]/g, '-') || 'general';
        const name = rule.displayName?.toLowerCase().replace(/[^a-z0-9]/g, '-') || 'unknown';

        return `${tech}-${category}-${name}`;
    }

    /**
     * Generate operation ID for tracking
     */
    private generateOperationId(): string {
        return `hot_reload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}