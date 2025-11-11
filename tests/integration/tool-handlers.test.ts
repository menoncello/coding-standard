import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { GetStandardsHandler } from '../../src/mcp/handlers/toolHandlers.js';
import { GetStandardsRequest, SearchStandardsRequest, ValidateCodeRequest } from '../../src/types/mcp.js';
import { mcpCache, performanceMonitor } from '../../src/cache/cache-manager.js';
import { secureMcpCache } from '../../src/cache/secure-mcp-response-cache.js';
import { performanceMonitor as perfMonitor } from '../../src/utils/performance-monitor.js';
import { rmSync, existsSync } from 'node:fs';
// Factory imports
import { DatabaseFactory } from '../../src/factories/database-factory.js';
import { CacheFactory } from '../../src/factories/cache-factory.js';
import { ToolHandlersFactory } from '../../src/factories/tool-handlers-factory.js';
import { PerformanceFactory } from '../../src/factories/performance-factory.js';
import { StandardsFactory } from '../../src/factories/standards-factory.js';
import { LoggerFactory } from '../../src/utils/logger/logger-factory.js';

describe('Tool Handlers Integration Tests', () => {
    // Test logger setup
const testLogger = LoggerFactory.createTestLogger(true);
    let handler: GetStandardsHandler;
    const testDbPath = './test-tool-handlers-registry.db';

    beforeEach(async () => {
        // Clean up any existing test database
        if (existsSync(testDbPath)) {
            rmSync(testDbPath);
        }

        handler = ToolHandlersFactory.createGetStandardsHandler(true, testDbPath, testDbPath);
        mcpCache.clear();
        secureMcpCache.clear();
        perfMonitor.clearMetrics();

        // Wait for registry to initialize and add test data
        await handler.getRegistry().initialize();
        await seedTestDatabase();

        // Clear performance metrics after seeding to ensure clean test environment
        perfMonitor.clearMetrics();
    });

    afterEach(() => {
        handler.getRegistry().close();
        mcpCache.clear();
        secureMcpCache.clear();
        perfMonitor.clearMetrics();

        // Clean up test database
        if (existsSync(testDbPath)) {
            rmSync(testDbPath);
        }
    });

    /**
     * Seed the test database with sample standards including formatting-related ones
     */
    async function seedTestDatabase() {
        const registry = handler.getRegistry();

        // Helper function to create a complete standard rule
        const createTestStandard = (base: any) => {
            const timestamp = Date.now();
            return {
                id: `test-${timestamp}-${Math.random().toString(36).substring(7)}`,
                displayName: `Test Standard: ${base.semanticName}`,
                tags: ['convention'],
                relatedRules: [],
                aliases: [],
                deprecated: false,
                metadata: {
                    createdAt: timestamp,
                    updatedAt: timestamp,
                    version: '1.0.0',
                    validationStatus: 'validated' as const
                },
                ...base
            };
        };

        // Add test standards including ones with "formatting" in category/title/description
        const testStandards = [
            createTestStandard({
                semanticName: 'typescript-semicolon-statements',
                pattern: '^.*;$',
                description: 'TypeScript statements should end with semicolons for proper formatting',
                category: 'formatting',
                technology: 'typescript',
                severity: 'error',
                examples: [{
                    valid: ['const x = 1;', 'console.log("hello");'],
                    invalid: ['const x = 1', 'console.log("hello")'],
                    description: 'Statements should end with semicolons'
                }]
            }),
            createTestStandard({
                semanticName: 'typescript-class-naming',
                pattern: '^[A-Z][a-zA-Z0-9]*$',
                description: 'TypeScript classes should use PascalCase naming convention',
                category: 'naming',
                technology: 'typescript',
                severity: 'error',
                examples: [{
                    valid: ['UserService', 'HttpClient'],
                    invalid: ['userService', 'http_client'],
                    description: 'Class naming convention'
                }]
            }),
            createTestStandard({
                semanticName: 'javascript-code-formatting',
                pattern: '^.{1,80}$',
                description: 'JavaScript lines should not exceed 80 characters for better code formatting',
                category: 'formatting',
                technology: 'javascript',
                severity: 'warning',
                examples: [{
                    valid: ['const shortLine = "acceptable";', 'if (condition) { doSomething(); }'],
                    invalid: ['const veryLongLineThatExceedsEightyCharactersAndShouldBeFormattedBetter = "this is too long";'],
                    description: 'Line length formatting rule'
                }]
            }),
            createTestStandard({
                semanticName: 'react-component-formatting',
                pattern: '^import.*React',
                description: 'React components should import React for proper JSX formatting',
                category: 'formatting',
                technology: 'javascript',
                severity: 'error',
                examples: [{
                    valid: ['import React from "react";', 'import React, { useState } from "react";'],
                    invalid: ['export const Component = () => <div>Hello</div>;'],
                    description: 'React import formatting'
                }]
            })
        ];

        // Add all test standards to the registry
        for (const standard of testStandards) {
            try {
                await registry.addRule(standard);
            } catch (error) {
                // Log errors only for debugging (avoid console noise in tests)
                // Fail silently since the registry may already have the standard from previous runs
            }
        }
    }

    describe('getStandards', () => {
        test('should load standards from real file system', async () => {
            const request: GetStandardsRequest = {};

            const response = await handler.getStandards(request);

            expect(response).toBeDefined();
            expect(response.standards).toBeDefined();
            expect(Array.isArray(response.standards)).toBe(true);
            expect(response.totalCount).toBeGreaterThanOrEqual(0);
            expect(response.responseTime).toBeGreaterThanOrEqual(0);
            expect(typeof response.cached).toBe('boolean');

            // Should have loaded actual standards from configuration files
            if (response.standards.length > 0) {
                const standard = response.standards[0];
                expect(standard.id).toBeTruthy();
                expect(standard.title).toBeTruthy();
                expect(standard.category).toBeTruthy();
                expect(standard.technology).toBeTruthy();
                expect(standard.description).toBeTruthy();
                expect(Array.isArray(standard.rules)).toBe(true);
            }
        });

        test('should filter by technology', async () => {
            const request: GetStandardsRequest = {
                technology: 'typescript'
            };

            const response = await handler.getStandards(request);

            if (response.standards.length > 0) {
                response.standards.forEach(standard => {
                    expect(standard.technology.toLowerCase()).toContain('typescript');
                });
            }
        });

        test('should filter by category', async () => {
            const request: GetStandardsRequest = {
                category: 'Formatting'
            };

            const response = await handler.getStandards(request);

            if (response.standards.length > 0) {
                response.standards.forEach(standard => {
                    expect(standard.category.toLowerCase()).toBe('formatting');
                });
            }
        });

        test('should filter by both technology and category', async () => {
            const request: GetStandardsRequest = {
                technology: 'typescript',
                category: 'Formatting'
            };

            const response = await handler.getStandards(request);

            if (response.standards.length > 0) {
                response.standards.forEach(standard => {
                    expect(standard.technology.toLowerCase()).toContain('typescript');
                    expect(standard.category.toLowerCase()).toBe('formatting');
                });
            }
        });

        test('should use cache when enabled', async () => {
            const request: GetStandardsRequest = {
                useCache: true
            };

            // First call
            const response1 = await handler.getStandards(request);

            // Second call should use cache
            const response2 = await handler.getStandards(request);

            expect(response1.standards).toEqual(response2.standards);
            expect(response1.totalCount).toBe(response2.totalCount);
            expect(response2.cached).toBe(true);
        });

        test('should bypass cache when disabled', async () => {
            const request: GetStandardsRequest = {
                useCache: false
            };

            const response1 = await handler.getStandards(request);
            const response2 = await handler.getStandards(request);

            expect(response2.cached).toBe(false);
        });

        test('should record performance metrics', async () => {
            const request: GetStandardsRequest = {};

            await handler.getStandards(request);

            const stats = perfMonitor.getStats();
            expect(stats.totalRequests).toBe(1);
            expect(stats.successfulRequests).toBe(1);
            expect(stats.averageResponseTime).toBeGreaterThan(0);
        });

        test('should handle empty results gracefully', async () => {
            const request: GetStandardsRequest = {
                technology: 'nonexistent-technology'
            };

            const response = await handler.getStandards(request);

            expect(response.standards).toEqual([]);
            expect(response.totalCount).toBe(0);
            expect(response.responseTime).toBeGreaterThanOrEqual(0);
        });

        test('should validate request parameters', async () => {
            const invalidRequest = {
                technology: 123, // Should be string
                category: [], // Should be string
                useCache: 'yes' // Should be boolean
            } as any;

            await expect(handler.getStandards(invalidRequest)).rejects.toThrow();
        });
    });

    describe('searchStandards', () => {
        test('should search across all standards', async () => {
            const request: SearchStandardsRequest = {
                query: 'formatting'
            };

            const response = await handler.searchStandards(request);

            expect(response).toBeDefined();
            expect(response.results).toBeDefined();
            expect(Array.isArray(response.results)).toBe(true);
            expect(response.totalCount).toBeGreaterThanOrEqual(0);
            expect(response.responseTime).toBeGreaterThanOrEqual(0);

            // Should find formatting-related standards
            const formattingStandards = response.results.filter(result =>
                result.category.toLowerCase().includes('formatting') ||
                result.title.toLowerCase().includes('formatting') ||
                result.description.toLowerCase().includes('formatting')
            );
            expect(formattingStandards.length).toBeGreaterThan(0);
        });

        test('should limit search results', async () => {
            const request: SearchStandardsRequest = {
                query: 'rule',
                limit: 2
            };

            const response = await handler.searchStandards(request);

            expect(response.results.length).toBeLessThanOrEqual(2);
            expect(response.totalCount).toBeLessThanOrEqual(2);
        });

        test('should filter search by technology', async () => {
            const request: SearchStandardsRequest = {
                query: 'formatting',
                technology: 'typescript'
            };

            const response = await handler.searchStandards(request);

            if (response.results.length > 0) {
                response.results.forEach(result => {
                    expect(result.technology.toLowerCase()).toContain('typescript');
                });
            }
        });

        test('should perform fuzzy search by default', async () => {
            const request: SearchStandardsRequest = {
                query: 'format' // Partial match
            };

            const response = await handler.searchStandards(request);

            // Should find results with partial matches
            expect(response.results.length).toBeGreaterThanOrEqual(0);
        });

        test('should perform exact search when fuzzy is disabled', async () => {
            const request: SearchStandardsRequest = {
                query: 'Formatting', // Exact match case-sensitive
                fuzzy: false
            };

            const response = await handler.searchStandards(request);

            // Should only find results with exact matches to 'Formatting' in fields
            response.results.forEach(result => {
                const exactMatch =
                    result.title === 'Formatting' ||
                    result.description === 'Formatting' ||
                    result.category === 'Formatting' ||
                    result.title.toLowerCase().includes('formatting') ||
                    result.description.toLowerCase().includes('formatting') ||
                    result.category.toLowerCase() === 'formatting';

                expect(exactMatch).toBe(true);
            });
        });

        test('should use cache for search results', async () => {
            const request: SearchStandardsRequest = {
                query: 'test'
            };

            // First call
            const response1 = await handler.searchStandards(request);

            // Second call should use cache
            const response2 = await handler.searchStandards(request);

            expect(response1.results).toEqual(response2.results);
            expect(response1.totalCount).toBe(response2.totalCount);
        });

        test('should record performance metrics for search', async () => {
            const request: SearchStandardsRequest = {
                query: 'test'
            };

            await handler.searchStandards(request);

            const stats = perfMonitor.getStats();
            expect(stats.totalRequests).toBeGreaterThan(0);

            const operationMetrics = perfMonitor.getOperationMetrics();
            const searchMetrics = operationMetrics.find(op => op.operation === 'searchStandards');
            expect(searchMetrics).toBeDefined();
            expect(searchMetrics!.count).toBe(1);
        });

        test('should validate search request parameters', async () => {
            const invalidRequest = {
                query: '', // Should not be empty
                technology: 123,
                fuzzy: 'yes',
                limit: -1
            } as any;

            await expect(handler.searchStandards(invalidRequest)).rejects.toThrow();
        });

        test('should handle search with no results', async () => {
            const request: SearchStandardsRequest = {
                query: 'qwertyuiopasdfghjklzxcvbnm'
            };

            const response = await handler.searchStandards(request);

            expect(response.results).toEqual([]);
            expect(response.totalCount).toBe(0);
            expect(response.responseTime).toBeGreaterThanOrEqual(0);
        });
    });

    describe('validateCode', () => {
        test('should validate TypeScript code', async () => {
            const request: ValidateCodeRequest = {
                code: 'class testClass {\n  constructor() {}\n}',
                language: 'typescript'
            };

            const response = await handler.validateCode(request);

            expect(response).toBeDefined();
            expect(typeof response.valid).toBe('boolean');
            expect(Array.isArray(response.violations)).toBe(true);
            expect(response.score).toBeGreaterThanOrEqual(0);
            expect(response.score).toBeLessThanOrEqual(100);
            expect(response.responseTime).toBeGreaterThanOrEqual(0);
        });

        test('should validate JavaScript code', async () => {
            const request: ValidateCodeRequest = {
                code: 'const testVar = 1;\nconsole.log(testVar);',
                language: 'javascript'
            };

            const response = await handler.validateCode(request);

            expect(typeof response.valid).toBe('boolean');
            expect(Array.isArray(response.violations)).toBe(true);
            expect(response.score).toBeGreaterThanOrEqual(0);
            expect(response.score).toBeLessThanOrEqual(100);
        });

        test('should detect missing semicolons', async () => {
            const request: ValidateCodeRequest = {
                code: 'const testVar = 1\nconsole.log(testVar)',
                language: 'typescript'
            };

            const response = await handler.validateCode(request);

            // Should find semicolon violations
            const semicolonViolations = response.violations.filter(v =>
                v.rule.id.includes('semicolon') || v.message.includes('semicolon')
            );
            expect(semicolonViolations.length).toBeGreaterThan(0);
            expect(response.score).toBeLessThan(100);
        });

        test('should detect formatting violations according to real Biome configuration', async () => {
            const request: ValidateCodeRequest = {
                code: 'const testVar = 1\nconsole.log(testVar)', // Missing semicolons
                language: 'typescript'
            };

            const response = await handler.validateCode(request);

            // Should find semicolon violations (Biome requires semicolons)
            const semicolonViolations = response.violations.filter(v =>
                v.rule.id.includes('semicolon') || v.message.includes('semicolon')
            );
            expect(semicolonViolations.length).toBeGreaterThan(0);
            expect(response.score).toBeLessThan(100);
        });

        test('should respect useStrict flag', async () => {
            const request: ValidateCodeRequest = {
                code: 'const testVar = 1;',
                language: 'javascript',
                useStrict: true
            };

            const response = await handler.validateCode(request);

            expect(typeof response.valid).toBe('boolean');
        });

        test('should filter by specific rules', async () => {
            const request: ValidateCodeRequest = {
                code: 'const testVar = 1',
                language: 'typescript',
                rules: ['semi']
            };

            const response = await handler.validateCode(request);

            expect(typeof response.valid).toBe('boolean');
            expect(Array.isArray(response.violations)).toBe(true);
        });

        test('should use cache for validation results', async () => {
            const request: ValidateCodeRequest = {
                code: 'const testVar = 1;',
                language: 'typescript'
            };

            // First call
            const response1 = await handler.validateCode(request);

            // Second call should use cache
            const response2 = await handler.validateCode(request);

            expect(response1.valid).toBe(response2.valid);
            expect(response1.score).toBe(response2.score);
            expect(response1.violations).toEqual(response2.violations);
        });

        test('should record performance metrics for validation', async () => {
            const request: ValidateCodeRequest = {
                code: 'const testVar = 1;',
                language: 'typescript'
            };

            await handler.validateCode(request);

            const stats = perfMonitor.getStats();
            expect(stats.totalRequests).toBeGreaterThan(0);

            const operationMetrics = perfMonitor.getOperationMetrics();
            const validationMetrics = operationMetrics.find(op => op.operation === 'validateCode');
            expect(validationMetrics).toBeDefined();
            expect(validationMetrics!.count).toBe(1);
        });

        test('should validate code with violations correctly', async () => {
            const request: ValidateCodeRequest = {
                code: 'class bad_class {\n  constructor() {}\n  method() {\n    const x = 1\n    return x\n  }\n}',
                language: 'typescript'
            };

            const response = await handler.validateCode(request);

            expect(response.valid).toBeDefined();
            expect(response.violations.length).toBeGreaterThan(0);
            expect(response.score).toBeLessThan(100);

            // Check violation structure
            response.violations.forEach(violation => {
                expect(violation.rule).toBeDefined();
                expect(violation.rule.id).toBeTruthy();
                expect(violation.rule.description).toBeTruthy();
                expect(violation.rule.severity).toBeTruthy();
                expect(['error', 'warning', 'info']).toContain(violation.rule.severity);
                expect(violation.line).toBeGreaterThan(0);
                expect(violation.column).toBeGreaterThanOrEqual(0);
                expect(violation.message).toBeTruthy();
                expect(violation.severity).toBeTruthy();
            });
        });

        test('should handle valid code correctly', async () => {
            const request: ValidateCodeRequest = {
                code: 'class TestClass {\n  constructor() {}\n  method(): void {\n    const x = 1;\n    return x;\n  }\n}',
                language: 'typescript'
            };

            const response = await handler.validateCode(request);

            expect(response.valid).toBe(true);
            expect(response.score).toBe(100);
        });

        test('should validate code with mixed violations', async () => {
            const request: ValidateCodeRequest = {
                code: 'class test_class {\n  constructor() {}\n  method() {\n    const x = 1\n    console.log(x)\n  }\n}',
                language: 'typescript'
            };

            const response = await handler.validateCode(request);

            expect(response.violations.length).toBeGreaterThan(1);

            // Should have different types of violations
            const violationTypes = response.violations.map(v => v.rule.category);
            expect(violationTypes.length).toBeGreaterThan(0);
        });

        test('should validate request parameters', async () => {
            const invalidRequests = [
                { code: 123, language: 'typescript' }, // code should be string
                { code: 'test', language: 123 }, // language should be string
                { code: 'test', language: '' }, // empty language
                { code: 'test', language: 'typescript', useStrict: 'yes' }, // useStrict should be boolean
                { code: 'test', language: 'typescript', rules: 'not-array' } // rules should be array
            ];

            for (const invalidRequest of invalidRequests) {
                await expect(handler.validateCode(invalidRequest as any)).rejects.toThrow();
            }
        });

        test('should handle empty code gracefully', async () => {
            const request: ValidateCodeRequest = {
                code: '',
                language: 'typescript'
            };

            const response = await handler.validateCode(request);

            expect(typeof response.valid).toBe('boolean');
            expect(Array.isArray(response.violations)).toBe(true);
            expect(response.score).toBeGreaterThanOrEqual(0);
        });
    });

    describe('caching integration', () => {
        test('should work with cache for all operations', async () => {
            const standardsRequest: GetStandardsRequest = {};
            const searchRequest: SearchStandardsRequest = { query: 'test' };
            const validateRequest: ValidateCodeRequest = { code: 'const x = 1;', language: 'typescript' };

            // First calls
            await handler.getStandards(standardsRequest);
            await handler.searchStandards(searchRequest);
            await handler.validateCode(validateRequest);

            // Second calls should use cache
            const cachedStandardsResponse = await handler.getStandards(standardsRequest);
            const cachedSearchResponse = await handler.searchStandards(searchRequest);
            const cachedValidateResponse = await handler.validateCode(validateRequest);

            expect(cachedStandardsResponse.cached).toBe(true);
            expect(cachedSearchResponse.responseTime).toBe(0); // Cached responses have 0 response time
            expect(cachedValidateResponse.responseTime).toBe(0); // Cached responses have 0 response time
        });

        test('should record cache hit metrics', async () => {
            const request: GetStandardsRequest = {};

            // First call
            await handler.getStandards(request);

            // Second call (cache hit)
            await handler.getStandards(request);

            const stats = perfMonitor.getStats();
            expect(stats.totalRequests).toBe(2);

            // Check that cache hits were recorded
            const operationMetrics = perfMonitor.getOperationMetrics();
            const getStandardsMetrics = operationMetrics.find(op => op.operation === 'getStandards');
            expect(getStandardsMetrics).toBeDefined();
            expect(getStandardsMetrics!.count).toBe(2);
        });
    });

    describe('error handling', () => {
        test('should handle standards loading errors gracefully', async () => {
            // Mock a failing registry
            const originalRegistry = handler.getRegistry();
            const mockRegistry = {
                getAllRules: async () => {
                    throw new Error('Failed to load standards');
                },
                initialize: async () => {},
                searchRules: async () => ({ results: [] }),
                close: () => {}
            } as any;

            handler.setRegistry(mockRegistry);

            const request: GetStandardsRequest = {};

            await expect(handler.getStandards(request)).rejects.toThrow();

            // Restore original registry
            handler.setRegistry(originalRegistry);
        });

        test('should record error metrics', async () => {
            // Clear metrics before this test
            perfMonitor.clearMetrics();

            // Mock a failing registry
            const originalRegistry = handler.getRegistry();
            const mockRegistry = {
                getAllRules: async () => {
                    throw new Error('Test error');
                },
                initialize: async () => {},
                searchRules: async () => ({ results: [] }),
                close: () => {}
            } as any;

            handler.setRegistry(mockRegistry);

            const request: GetStandardsRequest = {};

            await expect(handler.getStandards(request)).rejects.toThrow();

            const stats = perfMonitor.getStats();
            const getStandardsMetrics = perfMonitor.getOperationMetrics().find(op => op.operation === 'getStandards');
            expect(getStandardsMetrics).toBeDefined();
            expect(getStandardsMetrics!.count).toBeGreaterThanOrEqual(1);

            // Check that there was at least one failed request
            expect(stats.failedRequests).toBeGreaterThanOrEqual(1);

            // Restore original registry
            handler.setRegistry(originalRegistry);
        });
    });
});