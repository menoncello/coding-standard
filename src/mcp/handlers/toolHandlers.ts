import {
    GetStandardsRequest,
    GetStandardsResponse,
    SearchStandardsRequest,
    SearchStandardsResponse,
    ValidateCodeRequest,
    ValidateCodeResponse,
    Standard,
    Rule,
    Violation
} from '../../types/mcp.js';
import {McpErrorHandler} from './errorHandler.js';
import { StandardsRegistry } from '../../standards/registry.js';
import { StandardRule } from '../../standards/types.js';
import { mcpCache, CacheKeys, createCodeHash } from '../../cache/cache-manager.js';
import { secureMcpCache, SecureCacheKeys } from '../../cache/secure-mcp-response-cache.js';
import { performanceMonitor, measureAsyncFunction } from '../../utils/performance-monitor.js';

export class GetStandardsHandler {
    private registry: StandardsRegistry;
    private useSecureCache: boolean;

    constructor(useSecureCache: boolean = true, dbPath?: string) {
        this.registry = new StandardsRegistry(dbPath || './standards-registry.db');
        this.useSecureCache = useSecureCache;
        // Initialize registry in background
        this.registry.initialize().catch(console.error);
    }

    // For testing purposes - allow registry to be replaced
    setRegistry(registry: StandardsRegistry) {
        this.registry = registry;
    }

    getRegistry() {
        return this.registry;
    }

    /**
     * Create access context from request
     */
    private createAccessContext(request: any) {
        if (!this.useSecureCache) return undefined;

        // Extract user information from request (if available)
        // In a real implementation, this would come from authentication headers
        const userId = (request as any).userId || (request as any).user?.id;
        const role = (request as any).role || 'user'; // Default to user role
        const sessionId = (request as any).sessionId;

        return secureMcpCache.createAccessContext({
            userId,
            role,
            sessionId
        });
    }

    async getStandards(request: GetStandardsRequest): Promise<GetStandardsResponse> {
        this.validateGetStandardsRequest(request);

        const accessContext = this.createAccessContext(request);
        const cacheKey = this.useSecureCache
            ? SecureCacheKeys.standards(request.technology, request.category)
            : CacheKeys.standards(request.technology, request.category);

        // Check cache first if enabled
        if (request.useCache !== false) {
            try {
                let cached;
                if (this.useSecureCache) {
                    cached = secureMcpCache.getStandards(cacheKey, accessContext);
                } else {
                    cached = mcpCache.getStandards(cacheKey);
                }

                if (cached) {
                    performanceMonitor.recordMetric({
                        responseTime: 0,
                        memoryUsage: this.getMemoryUsage(),
                        timestamp: Date.now(),
                        operation: 'getStandards',
                        success: true,
                        cacheHit: true
                    });
                    return { ...cached, cached: true };
                }
            } catch (error) {
                // Log security errors but continue with non-cached data
                console.warn('Cache access error:', error instanceof Error ? error.message : 'Unknown error');
            }
        }

        try {
            const { result: standards, responseTime } = await measureAsyncFunction(
                'getStandards',
                async () => {
                    // Convert registry rules to MCP format
                    const registryRules = await this.registry.getAllRules({
                        category: request.category || undefined,
                        technology: request.technology?.toLowerCase() || undefined
                    });

                    return registryRules.map(this.convertRegistryRuleToMCPStandard);
                },
                {
                    filteredBy: { technology: request.technology, category: request.category },
                    resultCount: 0 // Will be updated after filtering
                }
            );

            const response: GetStandardsResponse = {
                standards,
                totalCount: standards.length,
                responseTime,
                cached: false
            };

            // Cache the result if enabled
            if (request.useCache !== false) {
                try {
                    if (this.useSecureCache) {
                        secureMcpCache.setStandards(cacheKey, response, accessContext);
                    } else {
                        mcpCache.setStandards(cacheKey, response);
                    }
                } catch (error) {
                    // Log security errors but continue - caching failure shouldn't break the response
                    console.warn('Cache storage error:', error instanceof Error ? error.message : 'Unknown error');
                }
            }

            return response;
        } catch (error) {
            // Record the error metric
            performanceMonitor.recordMetric({
                responseTime: 0,
                memoryUsage: this.getMemoryUsage(),
                timestamp: Date.now(),
                operation: 'getStandards',
                success: false
            });
            throw McpErrorHandler.handleError(error);
        }
    }

    async searchStandards(request: SearchStandardsRequest): Promise<SearchStandardsResponse> {
        this.validateSearchStandardsRequest(request);

        const accessContext = this.createAccessContext(request);
        const cacheKey = this.useSecureCache
            ? SecureCacheKeys.search(request.query, request.technology, request.fuzzy, request.limit)
            : CacheKeys.search(request.query, request.technology, request.fuzzy, request.limit);

        // Check cache first
        try {
            let cached;
            if (this.useSecureCache) {
                cached = secureMcpCache.getSearch(cacheKey, accessContext);
            } else {
                cached = mcpCache.getSearch(cacheKey);
            }

            if (cached) {
                performanceMonitor.recordMetric({
                    responseTime: 0,
                    memoryUsage: this.getMemoryUsage(),
                    timestamp: Date.now(),
                    operation: 'searchStandards',
                    success: true,
                    cacheHit: true
                });
                return { ...cached, responseTime: 0 };
            }
        } catch (error) {
            console.warn('Cache access error:', error instanceof Error ? error.message : 'Unknown error');
        }

        try {
            const { result: searchResults, responseTime } = await measureAsyncFunction(
                'searchStandards',
                async () => {
                    // Use registry search functionality
                    const { results: registryResults } = await this.registry.searchRules({
                        query: request.query,
                        technology: request.technology?.toLowerCase(),
                        fuzzy: request.fuzzy,
                        limit: request.limit || 10,
                        includeDeprecated: false
                    });

                    // Convert registry results to MCP format
                    return registryResults.map(r => ({
                        ...this.convertRegistryRuleToMCPStandard(r.rule),
                        relevance: r.relevance,
                        matchType: r.matchType
                    }));
                },
                {
                    query: request.query,
                    resultCount: 0, // Will be updated after filtering
                    fuzzy: request.fuzzy
                }
            );

            const response: SearchStandardsResponse = {
                results: searchResults,
                totalCount: searchResults.length,
                responseTime
            };

            // Cache the result
            try {
                if (this.useSecureCache) {
                    secureMcpCache.setSearch(cacheKey, response, accessContext);
                } else {
                    mcpCache.setSearch(cacheKey, response);
                }
            } catch (error) {
                console.warn('Cache storage error:', error instanceof Error ? error.message : 'Unknown error');
            }

            return response;
        } catch (error) {
            throw McpErrorHandler.handleError(error);
        }
    }

    async validateCode(request: ValidateCodeRequest): Promise<ValidateCodeResponse> {
        this.validateValidateCodeRequest(request);

        const accessContext = this.createAccessContext(request);
        const codeHash = createCodeHash(request.code);
        const cacheKey = this.useSecureCache
            ? SecureCacheKeys.validation(codeHash, request.language, request.rules)
            : CacheKeys.validation(codeHash, request.language, request.rules);

        // Check cache first
        try {
            let cached;
            if (this.useSecureCache) {
                cached = secureMcpCache.getValidation(cacheKey, accessContext);
            } else {
                cached = mcpCache.getValidation(cacheKey);
            }

            if (cached) {
                performanceMonitor.recordMetric({
                    responseTime: 0,
                    memoryUsage: this.getMemoryUsage(),
                    timestamp: Date.now(),
                    operation: 'validateCode',
                    success: true,
                    cacheHit: true
                });
                return { ...cached, responseTime: 0 };
            }
        } catch (error) {
            console.warn('Cache access error:', error instanceof Error ? error.message : 'Unknown error');
        }

        try {
            const { result: validationResult, responseTime } = await measureAsyncFunction(
                'validateCode',
                async () => {
                    const violations: Violation[] = [];
                    let score = 100;

                    // Get relevant standards for validation from registry
                    const relevantStandards = await this.registry.getAllRules({
                        technology: request.language.toLowerCase()
                    });

                    // Apply validation rules based on registry standards
                    if (request.language.toLowerCase() === 'typescript' || request.language.toLowerCase() === 'javascript') {
                        const lines = request.code.split('\n');

                        lines.forEach((line, index) => {
                            // Apply standards-based validation
                            for (const standard of relevantStandards) {
                                // Convert registry examples to validation rules
                                for (const example of standard.examples) {
                                    const violation = this.validateLineWithStandard(line, index + 1, standard, example, request);
                                    if (violation) {
                                        violations.push(violation);
                                        score -= this.getScorePenalty(standard.severity);
                                    }
                                }

                                // Pattern-based validation
                                try {
                                    const regex = new RegExp(standard.pattern);
                                    if (regex.test(line.trim()) && standard.severity === 'error') {
                                        // If line matches pattern and should be error, check if it's actually invalid
                                        // This is a simplified validation - in production, you'd have more sophisticated logic
                                        if (!this.isValidByPattern(line.trim(), standard.pattern)) {
                                            violations.push({
                                                rule: {
                                                    id: standard.id,
                                                    description: standard.description,
                                                    severity: standard.severity,
                                                    category: standard.category
                                                },
                                                line: index + 1,
                                                column: 1,
                                                message: `Line violates pattern: ${standard.pattern}`,
                                                severity: standard.severity
                                            });
                                            score -= this.getScorePenalty(standard.severity);
                                        }
                                    }
                                } catch (error) {
                                    // Skip invalid regex patterns
                                }
                            }

                            // Special case: Check for obvious missing semicolons in common patterns
                            const trimmedLine = line.trim();
                            if (trimmedLine &&
                                !trimmedLine.endsWith(';') &&
                                !trimmedLine.endsWith('{') &&
                                !trimmedLine.endsWith('}') &&
                                !trimmedLine.startsWith('//') &&
                                !trimmedLine.startsWith('/*') &&
                                !trimmedLine.startsWith('*') &&
                                !trimmedLine.endsWith('*/') &&
                                !trimmedLine.startsWith('import') &&
                                !trimmedLine.startsWith('export') &&
                                !trimmedLine.startsWith('return') &&
                                !trimmedLine.includes('=>') &&
                                !trimmedLine.includes('if ') &&
                                !trimmedLine.includes('for ') &&
                                !trimmedLine.includes('while ') &&
                                !trimmedLine.includes('function ') &&
                                !trimmedLine.includes('class ') &&
                                !trimmedLine.includes('interface ') &&
                                !trimmedLine.includes('type ')) {

                                // Check for common patterns that should have semicolons
                                const semicolonPatterns = [
                                    /^\s*const\s+\w+\s*=\s*[^;{};]+$/, // const x = something (excluding objects and functions)
                                    /^\s*let\s+\w+\s*=\s*[^;{};]+$/,   // let x = something (excluding objects and functions)
                                    /^\s*var\s+\w+\s*=\s*[^;{};]+$/,   // var x = something (excluding objects and functions)
                                    /^\s*console\.\w+\s*\([^)]*\)\s*[^;]*$/, // console.log(...)
                                    /^\s*(?:return|throw)\s+[^;{};]+$/, // return/throw statements
                                    /^\s*\w+\s*\([^)]*\)\s*[^;{};]*$/, // function calls (but not function declarations)
                                ];

                                // Exclude patterns that don't need semicolons
                                const excludePatterns = [
                                    /^\s*function\s+\w+\s*\(/, // function declarations
                                    /^\s*\w+\s*:\s*\w/, // type annotations
                                    /^\s*\w+\s*\([^)]*\)\s*=>/, // arrow functions
                                    /^\s*if\s*\(/, // if statements
                                    /^\s*for\s*\(/, // for loops
                                    /^\s*while\s*\(/, // while loops
                                    /^\s*switch\s*\(/, // switch statements
                                    /^\s*try\s*{/, // try blocks
                                    /^\s*catch\s*\(/, // catch blocks
                                    /^\s*finally\s*{/, // finally blocks
                                    /^\s*class\s+/, // class declarations
                                    /^\s*interface\s+/, // interface declarations
                                    /^\s*type\s+/, // type declarations
                                    /^\s*import\s+/, // import statements
                                    /^\s*export\s+/, // export statements
                                ];

                                const shouldHaveSemicolon = semicolonPatterns.some(pattern => pattern.test(trimmedLine)) &&
                                                        !excludePatterns.some(pattern => pattern.test(trimmedLine));

                                if (shouldHaveSemicolon) {
                                    violations.push({
                                        rule: {
                                            id: 'missing-semicolon',
                                            description: 'Statements should end with semicolons',
                                            severity: 'error',
                                            category: 'formatting'
                                        },
                                        line: index + 1,
                                        column: trimmedLine.length + 1,
                                        message: 'Missing semicolon at end of statement',
                                        severity: 'error'
                                    });
                                    score -= 10;
                                }
                            }

                            // Additional language-specific validations
                            if (!request.useStrict) {
                                // Check for 'use strict' directive recommendation
                                if (index === 0 && !line.includes('use strict') && request.language === 'javascript') {
                                    violations.push({
                                        rule: {
                                            id: 'missing-use-strict',
                                            description: 'Consider using "use strict" directive',
                                            severity: 'warning',
                                            category: 'best-practices'
                                        },
                                        line: 1,
                                        column: 1,
                                        message: 'Missing "use strict" directive',
                                        severity: 'warning'
                                    });
                                    score -= 2;
                                }
                            }
                        });
                    }

                    return {
                        valid: violations.filter(v => v.severity === 'error').length === 0,
                        violations,
                        score: Math.max(0, score)
                    };
                },
                {
                    language: request.language,
                    violationsCount: 0, // Will be updated after validation
                    score: 0 // Will be updated after validation
                }
            );

            const response: ValidateCodeResponse = {
                ...validationResult,
                responseTime
            };

            // Cache the result
            try {
                if (this.useSecureCache) {
                    secureMcpCache.setValidation(cacheKey, response, accessContext);
                } else {
                    mcpCache.setValidation(cacheKey, response);
                }
            } catch (error) {
                console.warn('Cache storage error:', error instanceof Error ? error.message : 'Unknown error');
            }

            return response;
        } catch (error) {
            throw McpErrorHandler.handleError(error);
        }
    }

    /**
     * Convert Registry StandardRule to MCP Standard format
     */
    private convertRegistryRuleToMCPStandard = (rule: StandardRule): Standard => {
        return {
            id: rule.id,
            title: rule.displayName,
            description: rule.description,
            technology: rule.technology,
            category: rule.category,
            rules: rule.examples.map((example, index) => ({
                id: `${rule.id}-rule-${index}`,
                description: example.description || `Rule ${index + 1} for ${rule.displayName}`,
                severity: rule.severity,
                category: rule.category,
                example: example.valid?.concat(example.invalid || []).join(', ')
            })),
            lastUpdated: new Date(rule.metadata.updatedAt).toISOString()
        };
    };

    /**
     * Validate line against registry standard examples
     */
    private validateLineWithStandard(line: string, lineNumber: number, standard: StandardRule, example: any, request: ValidateCodeRequest): Violation | null {
        const trimmedLine = line.trim();

        // Special handling for semicolon rule
        if (standard.id.includes('semicolon') || standard.semanticName?.includes('semicolon')) {
            // Check if this is a statement that should end with semicolon
            if (trimmedLine &&
                !trimmedLine.endsWith(';') &&
                !trimmedLine.endsWith('{') &&
                !trimmedLine.endsWith('}') &&
                !trimmedLine.startsWith('//') &&
                !trimmedLine.startsWith('/*') &&
                !trimmedLine.startsWith('*') &&
                !trimmedLine.endsWith('*/') &&
                !trimmedLine.startsWith('import') &&
                !trimmedLine.startsWith('export') &&
                !trimmedLine.startsWith('return') && // return statements can be complex
                !trimmedLine.includes('=>') && // arrow functions
                !trimmedLine.includes('if ') &&
                !trimmedLine.includes('for ') &&
                !trimmedLine.includes('while ') &&
                !trimmedLine.includes('function ') &&
                !trimmedLine.includes('class ') &&
                !trimmedLine.includes('interface ') &&
                !trimmedLine.includes('type ')) {

                return {
                    rule: {
                        id: standard.id,
                        description: standard.description || 'Statements should end with semicolons',
                        severity: standard.severity,
                        category: standard.category
                    },
                    line: lineNumber,
                    column: trimmedLine.length + 1,
                    message: 'Missing semicolon at end of statement',
                    severity: standard.severity
                };
            }
        }

        // Check invalid examples
        if (example.invalid) {
            for (const invalidExample of example.invalid) {
                // Only flag as violation if the line actually matches the invalid pattern
                // not just contains it as a substring
                if (trimmedLine === invalidExample ||
                    (trimmedLine.startsWith(invalidExample) &&
                     (invalidExample.endsWith(';') || trimmedLine.length === invalidExample.length))) {
                    return {
                        rule: {
                            id: standard.id,
                            description: example.description || `Invalid example for ${standard.displayName}`,
                            severity: standard.severity,
                            category: standard.category
                        },
                        line: lineNumber,
                        column: 1,
                        message: `Line contains invalid pattern: ${invalidExample}`,
                        severity: standard.severity
                    };
                }
            }
        }

        return null;
    }

    /**
     * Check if line is valid against a pattern (simplified implementation)
     */
    private isValidByPattern(line: string, pattern: string): boolean {
        try {
            const regex = new RegExp(`^${pattern}$`);
            return regex.test(line);
        } catch (error) {
            // If pattern is invalid, assume line is valid to avoid false positives
            return true;
        }
    }

    /**
     * Validate a single line of code against a rule
     */
    private validateLine(line: string, lineNumber: number, rule: Rule, request: ValidateCodeRequest): Violation | null {
        const trimmedLine = line.trim();

        // Apply specific rule validations
        switch (rule.id.toLowerCase()) {
            case 'semi':
            case 'missing-semicolon':
            case 'biome-semicolons':
                // Check for missing semicolons (Biome requires semicolons)
                if (trimmedLine &&
                    !trimmedLine.endsWith(';') &&
                    !trimmedLine.endsWith('{') &&
                    !trimmedLine.endsWith('}') &&
                    !trimmedLine.startsWith('//') &&
                    !trimmedLine.startsWith('/*') &&
                    !trimmedLine.startsWith('*') &&
                    !trimmedLine.endsWith('*/') &&
                    !trimmedLine.startsWith('import') &&
                    !trimmedLine.startsWith('export') &&
                    !trimmedLine.startsWith('return') && // return statements can be complex
                    !trimmedLine.includes('=>') && // arrow functions
                    !trimmedLine.includes('if ') &&
                    !trimmedLine.includes('for ') &&
                    !trimmedLine.includes('while ') &&
                    !trimmedLine.includes('function ') &&
                    !trimmedLine.includes('class ') &&
                    !trimmedLine.includes('interface ') &&
                    !trimmedLine.includes('type ')) {
                    return {
                        rule,
                        line: lineNumber,
                        column: trimmedLine.length + 1,
                        message: 'Missing semicolon at end of statement',
                        severity: rule.severity
                    };
                }
                break;

            case 'class-naming':
            case 'pascalcase':
            case 'biome-nursery-camelcase':
                const classMatch = line.match(/(?:class|interface|type)\s+(\w+)/);
                if (classMatch && !/^[A-Z][a-zA-Z0-9]*$/.test(classMatch[1])) {
                    return {
                        rule,
                        line: lineNumber,
                        column: line.indexOf(classMatch[0]) + 1,
                        message: `${classMatch[0]} should use PascalCase`,
                        severity: rule.severity
                    };
                }
                break;

            case 'camelcase':
                const varMatch = line.match(/(?:const|let|var)\s+(\w+)/);
                if (varMatch && !/^[a-z][a-zA-Z0-9]*$/.test(varMatch[1])) {
                    return {
                        rule,
                        line: lineNumber,
                        column: line.indexOf(varMatch[0]) + 1,
                        message: `Variable "${varMatch[1]}" should use camelCase`,
                        severity: rule.severity
                    };
                }
                break;

            case 'quotes':
                // Check for consistent quote usage
                const hasSingleQuotes = line.includes("'") && !line.includes("'");
                const hasDoubleQuotes = line.includes('"') && !line.includes('"');
                if ((hasSingleQuotes || hasDoubleQuotes) && trimmedLine) {
                    return {
                        rule,
                        line: lineNumber,
                        column: 1,
                        message: 'Use consistent quote style',
                        severity: rule.severity
                    };
                }
                break;

            default:
                // For rules that don't have specific validation logic, don't generate violations
                // In a real implementation, you'd parse the actual rule logic from Biome/ESLint configs
                break;
        }

        return null;
    }

    /**
     * Get score penalty based on rule severity
     */
    private getScorePenalty(severity: string): number {
        switch (severity) {
            case 'error': return 10;
            case 'warning': return 5;
            case 'info': return 2;
            default: return 1;
        }
    }

    /**
     * Get current memory usage
     */
    private getMemoryUsage() {
        const usage = process.memoryUsage();
        return {
            heapUsed: usage.heapUsed,
            heapTotal: usage.heapTotal,
            external: usage.external,
            rss: usage.rss
        };
    }

    private validateGetStandardsRequest(request: GetStandardsRequest): void {
        if (request.technology && typeof request.technology !== 'string') {
            throw McpErrorHandler.invalidParams('technology must be a string');
        }
        if (request.category && typeof request.category !== 'string') {
            throw McpErrorHandler.invalidParams('category must be a string');
        }
        if (request.context && typeof request.context !== 'string') {
            throw McpErrorHandler.invalidParams('context must be a string');
        }
        if (request.useCache !== undefined && typeof request.useCache !== 'boolean') {
            throw McpErrorHandler.invalidParams('useCache must be a boolean');
        }
    }

    private validateSearchStandardsRequest(request: SearchStandardsRequest): void {
        if (!request.query || typeof request.query !== 'string') {
            throw McpErrorHandler.invalidParams('query is required and must be a string');
        }
        if (request.technology && typeof request.technology !== 'string') {
            throw McpErrorHandler.invalidParams('technology must be a string');
        }
        if (request.fuzzy !== undefined && typeof request.fuzzy !== 'boolean') {
            throw McpErrorHandler.invalidParams('fuzzy must be a boolean');
        }
        if (request.limit !== undefined && (typeof request.limit !== 'number' || request.limit < 1)) {
            throw McpErrorHandler.invalidParams('limit must be a positive number');
        }
    }

    private validateValidateCodeRequest(request: ValidateCodeRequest): void {
        if (request.code === null || request.code === undefined || typeof request.code !== 'string') {
            throw McpErrorHandler.invalidParams('code is required and must be a string');
        }
        if (request.language === null || request.language === undefined || typeof request.language !== 'string' || request.language === '') {
            throw McpErrorHandler.invalidParams('language is required and must be a non-empty string');
        }
        if (request.useStrict !== undefined && typeof request.useStrict !== 'boolean') {
            throw McpErrorHandler.invalidParams('useStrict must be a boolean');
        }
        if (request.rules && (!Array.isArray(request.rules) || request.rules.some(r => typeof r !== 'string'))) {
            throw McpErrorHandler.invalidParams('rules must be an array of strings');
        }
    }
}

// Use secure cache by default, but allow configuration
export const getStandardsHandler = new GetStandardsHandler(true); // Enable secure cache

// Also export non-secure version for fallback if needed
export const getStandardsHandlerInsecure = new GetStandardsHandler(false);

// Standards Registry Management Handlers
export class StandardsRegistryHandler {
    private registry: StandardsRegistry;
    private useSecureCache: boolean;

    constructor(useSecureCache: boolean = true, dbPath?: string) {
        this.registry = new StandardsRegistry(dbPath || './standards-registry.db');
        this.useSecureCache = useSecureCache;
        this.registry.initialize().catch(console.error);
    }

    /**
     * Add a new standard to the registry
     */
    async addStandard(request: {
        semanticName: string;
        pattern: string;
        description: string;
        category?: string;
        technology?: string;
        severity?: 'error' | 'warning' | 'info';
        examples?: any[];
    }): Promise<{ success: boolean; id?: string; message?: string }> {
        try {
            const rule: StandardRule = {
                id: `std-${Date.now()}-${Math.random().toString(36).substring(7)}`,
                semanticName: request.semanticName,
                displayName: request.semanticName.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                description: request.description,
                category: request.category || 'general',
                technology: request.technology || 'generic',
                pattern: request.pattern,
                severity: request.severity || 'error',
                tags: [],
                examples: request.examples || [{
                    valid: [],
                    invalid: [],
                    description: request.description
                }],
                relatedRules: [],
                aliases: [],
                deprecated: false,
                metadata: {
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    version: '1.0.0',
                    createdBy: 'mcp-client'
                }
            };

            await this.registry.addRule(rule);

            return {
                success: true,
                id: rule.id,
                message: `Standard "${request.semanticName}" added successfully`
            };
        } catch (error) {
            return {
                success: false,
                message: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    /**
     * Remove a standard from the registry
     */
    async removeStandard(request: {
        semanticName: string;
        force?: boolean;
    }): Promise<{ success: boolean; message: string }> {
        try {
            const rule = await this.registry.getRuleBySemanticName(request.semanticName);
            if (!rule) {
                return {
                    success: false,
                    message: `Standard "${request.semanticName}" not found`
                };
            }

            await this.registry.removeRule(rule.id, request.force);

            return {
                success: true,
                message: `Standard "${request.semanticName}" removed successfully`
            };
        } catch (error) {
            return {
                success: false,
                message: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    /**
     * Get registry statistics
     */
    async getRegistryStats(): Promise<{
        totalRules: number;
        rulesByCategory: Record<string, number>;
        rulesByTechnology: Record<string, number>;
        cacheStats: any;
    }> {
        const stats = await this.registry.getStats();
        const cacheStats = this.registry.getCacheStats();

        return {
            totalRules: stats.totalRules,
            rulesByCategory: stats.rulesByCategory,
            rulesByTechnology: stats.rulesByTechnology,
            cacheStats
        };
    }

    /**
     * Close the registry
     */
    close(): void {
        this.registry.close();
    }
}

// Export registry handlers
export const standardsRegistryHandler = new StandardsRegistryHandler(true);
export const standardsRegistryHandlerInsecure = new StandardsRegistryHandler(false);