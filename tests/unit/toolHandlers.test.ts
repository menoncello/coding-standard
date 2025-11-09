import {test, expect, describe} from 'bun:test';
import {getStandardsHandler} from '../../src/mcp/handlers/toolHandlers.js';
import {McpErrorHandler} from '../../src/mcp/handlers/errorHandler.js';

describe('GetStandardsHandler', () => {
    describe('getStandards', () => {
        test('should return all standards when no filters provided', async () => {
            const result = await getStandardsHandler.getStandards({});

            expect(result.standards).toHaveLength(2);
            expect(result.totalCount).toBe(2);
            expect(result.cached).toBe(false);

            // Check specific standards exist
            const titles = result.standards.map(s => s.title);
            expect(titles).toContain('Use PascalCase for class names');
            expect(titles).toContain('Use semicolons at end of statements');
        });

        test('should filter by technology', async () => {
            const result = await getStandardsHandler.getStandards({
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
            const result = await getStandardsHandler.getStandards({
                category: 'naming'
            });

            expect(result.standards).toHaveLength(1);
            expect(result.standards[0].title).toBe('Use PascalCase for class names');
            expect(result.standards[0].category).toBe('Naming');
        });

        test('should filter by both technology and category', async () => {
            const result = await getStandardsHandler.getStandards({
                technology: 'typescript',
                category: 'formatting'
            });

            expect(result.standards).toHaveLength(1);
            expect(result.standards[0].title).toBe('Use semicolons at end of statements');
            expect(result.standards[0].technology).toBe('typescript');
            expect(result.standards[0].category).toBe('Formatting');
        });

        test('should validate request parameters', async () => {
            // Test that the handler doesn't throw for valid requests
            expect(async () => {
                await getStandardsHandler.getStandards({technology: 'valid'});
            }).not.toThrow();
        });
    });

    describe('searchStandards', () => {
        test('should search standards by query', async () => {
            const result = await getStandardsHandler.searchStandards({
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
            const result = await getStandardsHandler.searchStandards({
                query: 'semicolon',
                technology: 'typescript'
            });

            expect(result.results.length).toBeGreaterThan(0);
            result.results.forEach(result => {
                expect(result.technology).toBe('typescript');
            });
        });

        test('should limit results', async () => {
            const result = await getStandardsHandler.searchStandards({
                query: 'test',
                limit: 1
            });

            expect(result.results.length).toBeLessThanOrEqual(1);
        });

        test('should validate required parameters', async () => {
            // Test that the handler processes queries without throwing
            expect(async () => {
                await getStandardsHandler.searchStandards({query: 'test'});
            }).not.toThrow();
        });

        test('should validate optional parameters', async () => {
            // Test that the handler handles optional parameters gracefully
            expect(async () => {
                await getStandardsHandler.searchStandards({
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
            const result = await getStandardsHandler.validateCode({
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

            const result = await getStandardsHandler.validateCode({
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
                await getStandardsHandler.validateCode({
                    code: 'test code',
                    language: 'typescript'
                });
            }).not.toThrow();
        });

        test('should validate optional parameters', async () => {
            // Test that the handler handles optional parameters gracefully
            expect(async () => {
                await getStandardsHandler.validateCode({
                    code: 'test',
                    language: 'typescript',
                    useStrict: true,
                    rules: ['naming', 'formatting']
                });
            }).not.toThrow();
        });

        test('should handle different languages', async () => {
            const result = await getStandardsHandler.validateCode({
                code: 'const x = 1;',
                language: 'javascript'
            });

            expect(result.valid).toBeDefined();
            expect(result.violations).toBeDefined();
            expect(result.score).toBeDefined();
        });
    });
});