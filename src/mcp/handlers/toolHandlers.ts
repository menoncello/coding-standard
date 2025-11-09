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

// Mock data for now - will be replaced with actual file system implementation
const mockStandards: Standard[] = [
    {
        id: 'ts-naming-001',
        title: 'Use PascalCase for class names',
        category: 'Naming',
        technology: 'typescript',
        description: 'Class names should follow PascalCase convention',
        rules: [
            {
                id: 'ts-naming-001-rule',
                description: 'Class names must be PascalCase',
                severity: 'error',
                category: 'naming'
            }
        ],
        lastUpdated: '2025-11-09'
    },
    {
        id: 'ts-format-001',
        title: 'Use semicolons at end of statements',
        category: 'Formatting',
        technology: 'typescript',
        description: 'All statements should end with semicolons',
        rules: [
            {
                id: 'ts-format-001-rule',
                description: 'Statements must end with semicolon',
                severity: 'error',
                category: 'formatting'
            }
        ],
        lastUpdated: '2025-11-09'
    }
];

export class GetStandardsHandler {
    async getStandards(request: GetStandardsRequest): Promise<GetStandardsResponse> {
        this.validateGetStandardsRequest(request);

        try {
            let filteredStandards = mockStandards;

            if (request.technology) {
                filteredStandards = filteredStandards.filter(s =>
                    s.technology.toLowerCase() === request.technology!.toLowerCase()
                );
            }

            if (request.category) {
                filteredStandards = filteredStandards.filter(s =>
                    s.category.toLowerCase() === request.category!.toLowerCase()
                );
            }

            return {
                standards: filteredStandards,
                totalCount: filteredStandards.length,
                responseTime: 0, // Will be set by server
                cached: false
            };
        } catch (error) {
            throw McpErrorHandler.handleError(error);
        }
    }

    async searchStandards(request: SearchStandardsRequest): Promise<SearchStandardsResponse> {
        this.validateSearchStandardsRequest(request);

        try {
            const query = request.query.toLowerCase();
            let results = mockStandards;

            if (request.technology) {
                results = results.filter(s =>
                    s.technology.toLowerCase() === request.technology!.toLowerCase()
                );
            }

            if (request.fuzzy !== false) {
                // Simple fuzzy search
                results = results.filter(s =>
                    s.title.toLowerCase().includes(query) ||
                    s.description.toLowerCase().includes(query) ||
                    s.category.toLowerCase().includes(query)
                );
            } else {
                // Exact match
                results = results.filter(s =>
                    s.title.toLowerCase() === query ||
                    s.description.toLowerCase() === query ||
                    s.category.toLowerCase() === query
                );
            }

            const limit = request.limit || 10;
            const limitedResults = results.slice(0, limit);

            return {
                results: limitedResults,
                totalCount: limitedResults.length,
                responseTime: 0 // Will be set by server
            };
        } catch (error) {
            throw McpErrorHandler.handleError(error);
        }
    }

    async validateCode(request: ValidateCodeRequest): Promise<ValidateCodeResponse> {
        this.validateValidateCodeRequest(request);

        try {
            const violations: Violation[] = [];
            let score = 100;

            // Simple validation logic for demonstration
            if (request.language.toLowerCase() === 'typescript' || request.language.toLowerCase() === 'javascript') {
                const lines = request.code.split('\n');

                lines.forEach((line, index) => {
                    // Check for missing semicolons
                    if (line.trim() && !line.trim().endsWith(';') && !line.trim().endsWith('{') && !line.trim().endsWith('}')) {
                        violations.push({
                            rule: {
                                id: 'missing-semicolon',
                                description: 'Statements should end with semicolons',
                                severity: 'warning',
                                category: 'formatting'
                            },
                            line: index + 1,
                            column: line.length,
                            message: 'Missing semicolon at end of statement',
                            severity: 'warning'
                        });
                        score -= 5;
                    }

                    // Check for class naming
                    const classMatch = line.match(/class\s+(\w+)/);
                    if (classMatch && !/^[A-Z][a-zA-Z0-9]*$/.test(classMatch[1])) {
                        violations.push({
                            rule: {
                                id: 'class-naming',
                                description: 'Class names should follow PascalCase',
                                severity: 'error',
                                category: 'naming'
                            },
                            line: index + 1,
                            column: line.indexOf(classMatch[0]) + 1,
                            message: `Class name "${classMatch[1]}" should be PascalCase`,
                            severity: 'error'
                        });
                        score -= 10;
                    }
                });
            }

            return {
                valid: violations.filter(v => v.severity === 'error').length === 0,
                violations,
                score: Math.max(0, score),
                responseTime: 0 // Will be set by server
            };
        } catch (error) {
            throw McpErrorHandler.handleError(error);
        }
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
        if (!request.code || typeof request.code !== 'string') {
            throw McpErrorHandler.invalidParams('code is required and must be a string');
        }
        if (!request.language || typeof request.language !== 'string') {
            throw McpErrorHandler.invalidParams('language is required and must be a string');
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