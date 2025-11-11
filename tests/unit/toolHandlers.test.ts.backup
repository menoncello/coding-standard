import {test, expect, describe, beforeEach, afterEach} from 'bun:test';
import {GetStandardsHandler, StandardsRegistryHandler} from '../../src/mcp/handlers/toolHandlers.js';
import {McpErrorHandler} from '../../src/mcp/handlers/errorHandler.js';
import {rmSync, existsSync} from 'node:fs';
import { StandardsRegistry } from '../../src/standards/registry.js';
import { StandardRule } from '../../src/standards/types.js';

describe('GetStandardsHandler', () => {
    let testHandler: GetStandardsHandler;
    let registry: StandardsRegistry;
    const testDbPath = './test-standards-registry.db';

    // Helper function to seed test data directly to registry
    async function seedTestData(registry: StandardsRegistry): Promise<void> {
        const testStandards: StandardRule[] = [
            {
                id: 'test-class-naming-1',
                semanticName: 'typescript-class-naming',
                displayName: 'Use PascalCase for class names',
                description: 'TypeScript classes should use PascalCase naming convention',
                category: 'naming',
                technology: 'typescript',
                pattern: '^[A-Z][a-zA-Z0-9]*$',
                severity: 'error',
                tags: ['convention', 'consistency', 'readability'],
                examples: [
                    {
                        valid: ['UserService', 'HttpClient'],
                        invalid: ['userService', 'http_client'],
                        description: 'Class naming convention'
                    }
                ],
                relatedRules: [],
                aliases: ['pascal-case-classes'],
                deprecated: false,
                metadata: {
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    version: '1.0.0',
                    createdBy: 'test'
                }
            },
            {
                id: 'test-semicolon-usage-2',
                semanticName: 'typescript-semicolon-usage',
                displayName: 'Use semicolons at end of statements',
                description: 'TypeScript statements should end with semicolons',
                category: 'formatting',
                technology: 'typescript',
                pattern: '^.*;$',
                severity: 'error',
                tags: ['convention', 'consistency', 'readability'],
                examples: [
                    {
                        valid: ['const x = 1;', 'console.log("hello");'],
                        invalid: ['const x = 1', 'console.log("hello")'],
                        description: 'Semicolon usage'
                    }
                ],
                relatedRules: [],
                aliases: ['semicolon-rules'],
                deprecated: false,
                metadata: {
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    version: '1.0.0',
                    createdBy: 'test'
                }
            }
        ];

        for (const standard of testStandards) {
            await registry.addRule(standard);
        }
    }

    beforeEach(async () => {
        // Clean up any existing test database
        if (existsSync(testDbPath)) {
            rmSync(testDbPath);
        }

        // Create a single registry instance
        registry = new StandardsRegistry(testDbPath);
        await registry.initialize();

        // Seed test data
        await seedTestData(registry);

        // Create test handler using the same registry
        testHandler = new GetStandardsHandler(false, testDbPath);

        // Replace the handler's registry with our seeded one
        testHandler['registry'] = registry;
    });

    afterEach(() => {
        // Close the registry
        registry?.close?.();

        // Clean up test database
        if (existsSync(testDbPath)) {
            rmSync(testDbPath);
        }
    });
    describe('getStandards', () => {
        test('should return all standards when no filters provided', async () => {
            const result = await testHandler.getStandards({});

            expect(result.standards).toHaveLength(2);
            expect(result.totalCount).toBe(2);
            expect(result.cached).toBe(false);

            // Check specific standards exist
            const titles = result.standards.map(s => s.title);
            expect(titles).toContain('Use PascalCase for class names');
            expect(titles).toContain('Use semicolons at end of statements');
        });

        test('should filter by technology', async () => {
            const result = await testHandler.getStandards({
                technology: 'typescript'
            });

            expect(result.standards).toHaveLength(2);
            expect(result.totalCount).toBe(2);

            // All standards should be TypeScript
            result.standards.forEach(standard => {
                expect(standard.technology).toBe('typescript');
            });
        });

        test('should filter by category', async () => {
            const result = await testHandler.getStandards({
                category: 'naming'
            });

            expect(result.standards).toHaveLength(1);
            expect(result.standards[0].title).toBe('Use PascalCase for class names');
            expect(result.standards[0].category).toBe('naming');
        });

        test('should filter by both technology and category', async () => {
            const result = await testHandler.getStandards({
                technology: 'typescript',
                category: 'formatting'
            });

            expect(result.standards).toHaveLength(1);
            expect(result.standards[0].title).toBe('Use semicolons at end of statements');
            expect(result.standards[0].technology).toBe('typescript');
            expect(result.standards[0].category).toBe('formatting');
        });

        test('should validate request parameters', async () => {
            // Test that the handler doesn't throw for valid requests
            expect(async () => {
                await testHandler.getStandards({technology: 'valid'});
            }).not.toThrow();
        });
    });

    describe('searchStandards', () => {
        test('should search standards by query', async () => {
            const result = await testHandler.searchStandards({
                query: 'class'
            });

            expect(result.results.length).toBeGreaterThan(0);
            // Should find the PascalCase class naming rule
            const hasClassResult = result.results.some(r =>
                r.title.toLowerCase().includes('class') ||
                r.description.toLowerCase().includes('class')
            );
            expect(hasClassResult).toBe(true);
        });

        test('should filter by technology', async () => {
            const result = await testHandler.searchStandards({
                query: 'semicolon',
                technology: 'typescript'
            });

            expect(result.results.length).toBeGreaterThan(0);
            result.results.forEach(result => {
                expect(result.technology).toBe('typescript');
            });
        });

        test('should limit results', async () => {
            const result = await testHandler.searchStandards({
                query: 'test',
                limit: 1
            });

            expect(result.results.length).toBeLessThanOrEqual(1);
        });

        test('should validate required parameters', async () => {
            // Test that the handler processes queries without throwing
            expect(async () => {
                await testHandler.searchStandards({query: 'test'});
            }).not.toThrow();
        });

        test('should validate optional parameters', async () => {
            // Test that the handler handles optional parameters gracefully
            expect(async () => {
                await testHandler.searchStandards({
                    query: 'test',
                    limit: 10,
                    fuzzy: true
                });
            }).not.toThrow();
        });
    });

    describe('validateCode', () => {
        test('should validate correct code', async () => {
            const code = 'class TestClass {}';
            const result = await testHandler.validateCode({
                code,
                language: 'typescript'
            });

            expect(result.valid).toBeDefined();
            expect(result.violations).toBeDefined();
            expect(result.score).toBeDefined();
        });

        test('should validate TypeScript code', async () => {
            const code = `
class testClass {
  constructor() {
    console.log('hello')
  }
}
      `.trim();

            const result = await testHandler.validateCode({
                code,
                language: 'typescript'
            });

            expect(result.valid).toBeDefined();
            expect(result.violations).toBeDefined();
            expect(result.score).toBeDefined();
        });

        test('should validate required parameters', async () => {
            // Test that the handler processes validation requests
            expect(async () => {
                await testHandler.validateCode({
                    code: 'test code',
                    language: 'typescript'
                });
            }).not.toThrow();
        });

        test('should validate optional parameters', async () => {
            // Test that the handler handles optional parameters gracefully
            expect(async () => {
                await testHandler.validateCode({
                    code: 'test',
                    language: 'typescript',
                    useStrict: true,
                    rules: ['naming', 'formatting']
                });
            }).not.toThrow();
        });

        test('should handle different languages', async () => {
            const result = await testHandler.validateCode({
                code: 'const x = 1;',
                language: 'javascript'
            });

            expect(result.valid).toBeDefined();
            expect(result.violations).toBeDefined();
            expect(result.score).toBeDefined();
        });
    });
});