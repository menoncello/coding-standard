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
import { StandardsLoader } from '../../standards/standards-loader.js';
import { mcpCache, CacheKeys, createCodeHash } from '../../cache/cache-manager.js';
import { performanceMonitor, measureAsyncFunction } from '../../utils/performance-monitor.js';

export class GetStandardsHandler {
    private standardsLoader: StandardsLoader;

    constructor() {
        this.standardsLoader = new StandardsLoader();
    }

    async getStandards(request: GetStandardsRequest): Promise<GetStandardsResponse> {
        this.validateGetStandardsRequest(request);

        const cacheKey = CacheKeys.standards(request.technology, request.category);

        // Check cache first if enabled
        if (request.useCache !== false) {
            const cached = mcpCache.getStandards(cacheKey);
            if (cached) {
                performanceMonitor.recordMetric({
                    responseTime: 0,
                    memoryUsage: this.getMemoryUsage(),
                    timestamp: Date.now(),
                    operation: 'getStandards',
                    success: true,
                    cacheHit: true,
                    data: { cached: true }
                });
                return { ...cached, cached: true };
            }
        }

        try {
            const { result: standards, responseTime } = await measureAsyncFunction(
                'getStandards',
                async () => {
                    let filteredStandards = await this.standardsLoader.loadStandards();

                    if (request.technology) {
                        filteredStandards = filteredStandards.filter(s =>
                            s.technology.toLowerCase().includes(request.technology!.toLowerCase())
                        );
                    }

                    if (request.category) {
                        filteredStandards = filteredStandards.filter(s =>
                            s.category.toLowerCase() === request.category!.toLowerCase()
                        );
                    }

                    return filteredStandards;
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
                mcpCache.setStandards(cacheKey, response);
            }

            return response;
        } catch (error) {
            throw McpErrorHandler.handleError(error);
        }
    }

    async searchStandards(request: SearchStandardsRequest): Promise<SearchStandardsResponse> {
        this.validateSearchStandardsRequest(request);

        const cacheKey = CacheKeys.search(request.query, request.technology, request.fuzzy, request.limit);

        // Check cache first
        const cached = mcpCache.getSearch(cacheKey);
        if (cached) {
            performanceMonitor.recordMetric({
                responseTime: 0,
                memoryUsage: this.getMemoryUsage(),
                timestamp: Date.now(),
                operation: 'searchStandards',
                success: true,
                cacheHit: true,
                data: { cached: true }
            });
            return { ...cached, responseTime: 0 };
        }

        try {
            const { result: searchResults, responseTime } = await measureAsyncFunction(
                'searchStandards',
                async () => {
                    const standards = await this.standardsLoader.loadStandards();
                    const query = request.query.toLowerCase();
                    let results = standards;

                    // Filter by technology if specified
                    if (request.technology) {
                        results = results.filter(s =>
                            s.technology.toLowerCase().includes(request.technology!.toLowerCase())
                        );
                    }

                    // Search logic
                    if (request.fuzzy !== false) {
                        // Fuzzy search - look for query in title, description, or category
                        results = results.filter(s =>
                            s.title.toLowerCase().includes(query) ||
                            s.description.toLowerCase().includes(query) ||
                            s.category.toLowerCase().includes(query) ||
                            s.rules.some(rule => rule.description.toLowerCase().includes(query))
                        );
                    } else {
                        // Exact match search
                        results = results.filter(s =>
                            s.title.toLowerCase() === query ||
                            s.description.toLowerCase() === query ||
                            s.category.toLowerCase() === query
                        );
                    }

                    // Limit results
                    const limit = request.limit || 10;
                    return results.slice(0, limit);
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
            mcpCache.setSearch(cacheKey, response);

            return response;
        } catch (error) {
            throw McpErrorHandler.handleError(error);
        }
    }

    async validateCode(request: ValidateCodeRequest): Promise<ValidateCodeResponse> {
        this.validateValidateCodeRequest(request);

        const codeHash = createCodeHash(request.code);
        const cacheKey = CacheKeys.validation(codeHash, request.language, request.rules);

        // Check cache first
        const cached = mcpCache.getValidation(cacheKey);
        if (cached) {
            performanceMonitor.recordMetric({
                responseTime: 0,
                memoryUsage: this.getMemoryUsage(),
                timestamp: Date.now(),
                operation: 'validateCode',
                success: true,
                cacheHit: true,
                data: { cached: true }
            });
            return { ...cached, responseTime: 0 };
        }

        try {
            const { result: validationResult, responseTime } = await measureAsyncFunction(
                'validateCode',
                async () => {
                    const violations: Violation[] = [];
                    let score = 100;

                    // Get relevant standards for validation
                    const standards = await this.standardsLoader.loadStandards();
                    const relevantStandards = standards.filter(s =>
                        s.technology.toLowerCase().includes(request.language.toLowerCase())
                    );

                    // Apply validation rules based on loaded standards
                    if (request.language.toLowerCase() === 'typescript' || request.language.toLowerCase() === 'javascript') {
                        const lines = request.code.split('\n');

                        lines.forEach((line, index) => {
                            // Apply standards-based validation
                            for (const standard of relevantStandards) {
                                for (const rule of standard.rules) {
                                    const violation = this.validateLine(line, index + 1, rule, request);
                                    if (violation) {
                                        violations.push(violation);
                                        score -= this.getScorePenalty(rule.severity);
                                    }
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
            mcpCache.setValidation(cacheKey, response);

            return response;
        } catch (error) {
            throw McpErrorHandler.handleError(error);
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
                if (trimmedLine &&
                    !trimmedLine.endsWith(';') &&
                    !trimmedLine.endsWith('{') &&
                    !trimmedLine.endsWith('}') &&
                    !trimmedLine.startsWith('//') &&
                    !trimmedLine.startsWith('/*') &&
                    !trimmedLine.startsWith('*') &&
                    !trimmedLine.endsWith('*/')) {
                    return {
                        rule,
                        line: lineNumber,
                        column: line.length,
                        message: 'Missing semicolon at end of statement',
                        severity: rule.severity
                    };
                }
                break;

            case 'class-naming':
            case 'pascalcase':
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

export const getStandardsHandler = new GetStandardsHandler();