import { test, describe, expect, beforeEach } from 'bun:test';
import { SemanticNamingService } from '../../../src/standards/semantic-naming.js';
import { StandardRule, SearchResult } from '../../../src/standards/types.js';

describe('SemanticNamingService', () => {
    let service: SemanticNamingService;
    let testRules: StandardRule[];

    beforeEach(() => {
        service = new SemanticNamingService({
            ttl: 60000, // 1 minute for testing
            maxSize: 100
        });

        testRules = [
            {
                id: 'rule1',
                semanticName: 'typescript-class',
                displayName: 'TypeScript Class Naming',
                description: 'Enforces PascalCase for TypeScript classes',
                category: 'naming',
                technology: 'typescript',
                pattern: '^[A-Z][a-zA-Z0-9]*$',
                severity: 'error',
                tags: ['convention', 'linting', 'typescript'],
                examples: [{
                    valid: ['UserService', 'HttpClient'],
                    invalid: ['userService', 'http_client']
                }],
                relatedRules: [],
                aliases: ['ts-class', 'typescript-class-convention'],
                deprecated: false,
                metadata: {
                    createdAt: Date.now() - 86400000,
                    updatedAt: Date.now(),
                    version: '1.0.0'
                }
            },
            {
                id: 'rule2',
                semanticName: 'javascript-function',
                displayName: 'JavaScript Function Naming',
                description: 'Enforces camelCase for JavaScript functions',
                category: 'naming',
                technology: 'javascript',
                pattern: '^[a-z][a-zA-Z0-9]*$',
                severity: 'warning',
                tags: ['convention', 'linting', 'javascript'],
                examples: [{
                    valid: ['getUserData', 'calculateTotal'],
                    invalid: ['GetUserData', 'calculate_total']
                }],
                relatedRules: [],
                aliases: ['js-function'],
                deprecated: false,
                metadata: {
                    createdAt: Date.now() - 86400000,
                    updatedAt: Date.now(),
                    version: '1.0.0'
                }
            },
            {
                id: 'rule3',
                semanticName: 'typescript-format',
                displayName: 'TypeScript Formatting',
                description: 'General TypeScript formatting rules',
                category: 'formatting',
                technology: 'typescript',
                pattern: '.*',
                severity: 'info',
                tags: ['formatting', 'typescript'],
                examples: [],
                relatedRules: ['rule1'],
                aliases: [],
                deprecated: false,
                metadata: {
                    createdAt: Date.now() - 86400000,
                    updatedAt: Date.now(),
                    version: '1.0.0'
                }
            },
            {
                id: 'rule4',
                semanticName: 'python-class',
                displayName: 'Python Class Naming',
                description: 'Enforces PascalCase for Python classes',
                category: 'naming',
                technology: 'python',
                pattern: '^[A-Z][a-zA-Z0-9]*$',
                severity: 'error',
                tags: ['convention', 'python'],
                examples: [{
                    valid: ['UserService', 'DataProcessor'],
                    invalid: ['user_service', 'userservice']
                }],
                relatedRules: [],
                aliases: ['py-class'],
                deprecated: true,
                metadata: {
                    createdAt: Date.now() - 86400000,
                    updatedAt: Date.now(),
                    version: '1.0.0'
                }
            }
        ];
    });

    describe('Semantic Name Resolution', () => {
        test('should resolve exact semantic name match', async () => {
            const result = await service.resolveSemanticName('typescript-class', testRules);
            expect(result).not.toBeNull();
            expect(result!.semanticName).toBe('typescript-class');
        });

        test('should resolve using alias', async () => {
            const result = await service.resolveSemanticName('ts-class', testRules);
            expect(result).not.toBeNull();
            expect(result!.semanticName).toBe('typescript-class');
        });

        test('should return null for non-existent semantic name', async () => {
            const result = await service.resolveSemanticName('non-existent-rule', testRules);
            expect(result).toBeNull();
        });

        test('should handle fuzzy matching for close matches', async () => {
            const result = await service.resolveSemanticName('typescript-clas', testRules); // Missing 's'
            expect(result).not.toBeNull();
            expect(result!.semanticName).toBe('typescript-class');
        });

        test('should match by display name', async () => {
            const result = await service.resolveSemanticName('typescript class naming', testRules);
            expect(result).not.toBeNull();
            expect(result!.semanticName).toBe('typescript-class');
        });

        test('should respect cache settings', async () => {
            // First call should populate cache
            const result1 = await service.resolveSemanticName('typescript-class', testRules, true);
            expect(result1).not.toBeNull();

            // Second call should use cache
            const result2 = await service.resolveSemanticName('typescript-class', testRules, true);
            expect(result2).not.toBeNull();
            expect(result2!.id).toBe(result1!.id);
        });

        test('should bypass cache when requested', async () => {
            const result1 = await service.resolveSemanticName('typescript-class', testRules, false);
            const result2 = await service.resolveSemanticName('typescript-class', testRules, false);

            expect(result1).not.toBeNull();
            expect(result2).not.toBeNull();
            expect(result1!.id).toBe(result2!.id);
        });
    });

    describe('Search Functionality', () => {
        test('should return all rules when no query provided', async () => {
            const result = await service.searchRules({}, testRules);
            expect(result.results.length).toBe(3); // Excludes deprecated rules by default
            expect(result.total).toBe(3);
        });

        test('should search by text query', async () => {
            const result = await service.searchRules({ query: 'typescript' }, testRules);
            expect(result.results.length).toBe(3); // Includes javascript due to fuzzy matching
            expect(result.results.filter(r => r.rule.technology === 'typescript').length).toBe(2);
        });

        test('should search by category', async () => {
            const result = await service.searchRules({ category: 'naming' }, testRules);
            expect(result.results.length).toBe(2); // Excludes deprecated rule4
            expect(result.results.every(r => r.rule.category === 'naming')).toBe(true);
        });

        test('should search by technology', async () => {
            const result = await service.searchRules({ technology: 'typescript' }, testRules);
            expect(result.results.length).toBe(2); // rule1 and rule3, neither deprecated
            expect(result.results.every(r => r.rule.technology === 'typescript')).toBe(true);
        });

        test('should search by severity', async () => {
            const result = await service.searchRules({ severity: ['error'] }, testRules);
            expect(result.results.length).toBe(1); // Only rule1, rule4 is deprecated
            expect(result.results.every(r => r.rule.severity === 'error')).toBe(true);
        });

        test('should search by tags', async () => {
            const result = await service.searchRules({ tags: ['typescript'] }, testRules);
            expect(result.results.length).toBe(2);
            expect(result.results.every(r => r.rule.tags.includes('typescript'))).toBe(true);
        });

        test('should exclude deprecated rules by default', async () => {
            const result = await service.searchRules({}, testRules);
            expect(result.results.every(r => !r.rule.deprecated)).toBe(true);
            expect(result.results.length).toBe(3); // Should exclude rule4 (deprecated)
        });

        test('should include deprecated rules when requested', async () => {
            const result = await service.searchRules({ includeDeprecated: true }, testRules);
            expect(result.results.length).toBe(4);
            expect(result.results.some(r => r.rule.deprecated)).toBe(true);
        });

        test('should limit results', async () => {
            const result = await service.searchRules({ limit: 2 }, testRules);
            expect(result.results.length).toBe(2);
            expect(result.total).toBe(3); // Total should still be 3 (excluding deprecated)
        });

        test('should offset results', async () => {
            const result = await service.searchRules({ limit: 2, offset: 1 }, testRules);
            expect(result.results.length).toBe(2);
            expect(result.total).toBe(3);
        });

        test('should sort results by relevance', async () => {
            const result = await service.searchRules({ query: 'class naming' }, testRules);
            expect(result.results.length).toBeGreaterThan(0);

            // Results should be sorted by relevance (descending)
            for (let i = 0; i < result.results.length - 1; i++) {
                expect(result.results[i].relevance).toBeGreaterThanOrEqual(result.results[i + 1].relevance);
            }
        });

        test('should handle custom sorting', async () => {
            const result = await service.searchRules(
                { query: 'class' },
                testRules,
                { field: 'semanticName', order: 'asc' }
            );

            // Results should be sorted by semantic name (ascending)
            for (let i = 0; i < result.results.length - 1; i++) {
                expect(result.results[i].rule.semanticName <= result.results[i + 1].rule.semanticName).toBe(true);
            }
        });

        test('should set correct match types', async () => {
            const exactResult = await service.searchRules({ query: 'typescript-class' }, testRules);
            expect(exactResult.results[0].matchType).toBe('exact');

            const partialResult = await service.searchRules({ query: 'typescript' }, testRules);
            expect(partialResult.results[0].matchType).toMatch(/^(exact|semantic|fuzzy|partial)$/);
        });

        test('should identify matched fields', async () => {
            const result = await service.searchRules({ query: 'typescript naming' }, testRules);
            expect(result.results.length).toBeGreaterThan(0);

            const topResult = result.results[0];
            expect(topResult.matchedFields.length).toBeGreaterThan(0);
            expect(topResult.matchedFields.some(f => ['semanticName', 'displayName', 'description'].includes(f))).toBe(true);
        });
    });

    describe('Semantic Name Suggestions', () => {
        test('should provide suggestions for partial input', async () => {
            const suggestions = await service.getSemanticNameSuggestions('typescript', testRules);
            expect(suggestions.length).toBeGreaterThan(0);
            expect(suggestions.every(s => s.toLowerCase().includes('typescript'))).toBe(true);
        });

        test('should limit suggestions', async () => {
            const suggestions = await service.getSemanticNameSuggestions('t', testRules, 2);
            expect(suggestions.length).toBeLessThanOrEqual(2);
        });

        test('should provide suggestions based on display names', async () => {
            const suggestions = await service.getSemanticNameSuggestions('class naming', testRules);
            expect(suggestions.length).toBeGreaterThan(0);
        });

        test('should provide suggestions based on descriptions', async () => {
            const suggestions = await service.getSemanticNameSuggestions('enforces', testRules);
            expect(suggestions.length).toBeGreaterThan(0);
        });

        test('should return empty suggestions for unknown input', async () => {
            const suggestions = await service.getSemanticNameSuggestions('xyz123unknown', testRules);
            expect(suggestions).toEqual([]);
        });

        test('should remove duplicates from suggestions', async () => {
            const suggestions = await service.getSemanticNameSuggestions('class', testRules);
            const uniqueSuggestions = [...new Set(suggestions)];
            expect(suggestions).toEqual(uniqueSuggestions);
        });
    });

    describe('Related Rules Discovery', () => {
        test('should find rules by same category', async () => {
            const baseRule = testRules[0]; // typescript-class (naming category)
            const related = await service.findRelatedRules(baseRule, testRules);

            expect(related.length).toBeGreaterThan(0);
            expect(related.some(r => r.rule.category === 'naming' && r.rule.id !== baseRule.id)).toBe(true);
        });

        test('should find rules by same technology', async () => {
            const baseRule = testRules[0]; // typescript-class (typescript)
            const related = await service.findRelatedRules(baseRule, testRules);

            expect(related.some(r => r.rule.technology === 'typescript' && r.rule.id !== baseRule.id)).toBe(true);
        });

        test('should find rules by shared tags', async () => {
            const baseRule = testRules[0]; // typescript-class
            const related = await service.findRelatedRules(baseRule, testRules);

            // Should find rules with 'convention' or 'linting' or 'typescript' tags
            expect(related.some(r =>
                r.rule.tags.some(tag => baseRule.tags.includes(tag))
            )).toBe(true);
        });

        test('should limit related rules', async () => {
            const baseRule = testRules[0];
            const related = await service.findRelatedRules(baseRule, testRules, 1);
            expect(related.length).toBeLessThanOrEqual(1);
        });

        test('should calculate relevance scores for related rules', async () => {
            const baseRule = testRules[0];
            const related = await service.findRelatedRules(baseRule, testRules);

            // All related rules should have positive relevance scores
            expect(related.every(r => r.relevance > 0)).toBe(true);

            // Results should be sorted by relevance (descending)
            for (let i = 0; i < related.length - 1; i++) {
                expect(related[i].relevance).toBeGreaterThanOrEqual(related[i + 1].relevance);
            }
        });

        test('should handle rule with no relations', async () => {
            const isolatedRule: StandardRule = {
                id: 'isolated',
                semanticName: 'isolated-rule',
                displayName: 'Isolated Rule',
                description: 'A rule with no relations',
                category: 'unique-category',
                technology: 'unique-tech',
                pattern: '.*',
                severity: 'info',
                tags: ['unique-tag'],
                examples: [],
                relatedRules: [],
                aliases: [],
                deprecated: false,
                metadata: {
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    version: '1.0.0'
                }
            };

            const related = await service.findRelatedRules(isolatedRule, [isolatedRule]);
            expect(related.length).toBe(0);
        });
    });

    describe('Cache Management', () => {
        test('should provide cache statistics', () => {
            const stats = service.getCacheStats();
            expect(stats).toHaveProperty('hits');
            expect(stats).toHaveProperty('misses');
            expect(stats).toHaveProperty('size');
            expect(stats).toHaveProperty('hitRate');
            expect(typeof stats.hits).toBe('number');
            expect(typeof stats.misses).toBe('number');
            expect(typeof stats.size).toBe('number');
            expect(typeof stats.hitRate).toBe('number');
        });

        test('should clear cache', async () => {
            // Populate cache
            await service.resolveSemanticName('typescript-class', testRules, true);
            await service.searchRules({ query: 'typescript' }, testRules);

            const statsBefore = service.getCacheStats();
            expect(statsBefore.size).toBeGreaterThan(0);

            // Clear cache
            service.clearCache();

            const statsAfter = service.getCacheStats();
            expect(statsAfter.size).toBe(0);
            expect(statsAfter.hits).toBe(0);
            expect(statsAfter.misses).toBe(0);
        });

        test('should respect cache TTL', async () => {
            const shortLivedService = new SemanticNamingService({
                ttl: 1, // 1ms TTL
                maxSize: 100
            });

            // First call
            await shortLivedService.resolveSemanticName('typescript-class', testRules, true);

            // Wait for TTL to expire
            await new Promise(resolve => setTimeout(resolve, 10));

            // Second call should miss cache
            await shortLivedService.resolveSemanticName('typescript-class', testRules, true);

            const stats = shortLivedService.getCacheStats();
            expect(stats.misses).toBeGreaterThan(0);
        });
    });

    describe('Fuzzy Matching', () => {
        test('should handle typos and misspellings', async () => {
            const testCases = [
                { input: 'typescript-clas', expected: 'typescript-class' },
                { input: 'javscript-function', expected: 'javascript-function' },
                { input: 'python-clss', expected: 'python-class' }
            ];

            for (const testCase of testCases) {
                const result = await service.resolveSemanticName(testCase.input, testRules);
                expect(result).not.toBeNull();
                expect(result!.semanticName).toBe(testCase.expected);
            }
        });

        test('should respect fuzzy matching threshold', async () => {
            // Very different input should not match
            const result = await service.resolveSemanticName('completely-unrelated-input', testRules);
            expect(result).toBeNull();
        });

        test('should allow disabling fuzzy matching', async () => {
            const result = await service.searchRules(
                { query: 'typescript-clas', fuzzy: false },
                testRules
            );

            // Should still find exact/partial matches without fuzzy matching
            expect(result.results.length).toBe(1);
            expect(result.results[0].rule.semanticName).toBe('typescript-class');
        });
    });

    describe('Performance', () => {
        test('should handle large rule sets efficiently', async () => {
            // Create a large set of test rules
            const largeRuleSet: StandardRule[] = [];
            for (let i = 0; i < 1000; i++) {
                largeRuleSet.push({
                    id: `rule-${i}`,
                    semanticName: `rule-${i}`,
                    displayName: `Rule ${i}`,
                    description: `Description for rule ${i}`,
                    category: 'test',
                    technology: 'test',
                    pattern: '.*',
                    severity: 'info',
                    tags: ['test'],
                    examples: [],
                    relatedRules: [],
                    aliases: [`alias-${i}`],
                    deprecated: false,
                    metadata: {
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                        version: '1.0.0'
                    }
                });
            }

            const startTime = Date.now();

            // Test search performance
            const result = await service.searchRules({ query: 'rule' }, largeRuleSet);

            const duration = Date.now() - startTime;
            expect(duration).toBeLessThan(100); // Should complete within 100ms
            expect(result.results.length).toBe(1000);
        });

        test('should cache search results for performance', async () => {
            const firstCallStart = Date.now();
            await service.searchRules({ query: 'typescript' }, testRules);
            const firstCallDuration = Date.now() - firstCallStart;

            const secondCallStart = Date.now();
            await service.searchRules({ query: 'typescript' }, testRules);
            const secondCallDuration = Date.now() - secondCallStart;

            // Second call should be faster due to caching
            expect(secondCallDuration).toBeLessThanOrEqual(firstCallDuration);
        });
    });

    describe('Edge Cases', () => {
        test('should handle empty rule set', async () => {
            const result = await service.resolveSemanticName('anything', []);
            expect(result).toBeNull();

            const searchResult = await service.searchRules({ query: 'anything' }, []);
            expect(searchResult.results).toEqual([]);
            expect(searchResult.total).toBe(0);
        });

        test('should handle rules with missing optional fields', async () => {
            const minimalRule: StandardRule = {
                id: 'minimal',
                semanticName: 'minimal-rule',
                displayName: 'Minimal Rule',
                description: 'A minimal rule',
                category: 'test',
                technology: 'test',
                pattern: '.*',
                severity: 'info',
                tags: [],
                examples: [],
                relatedRules: [],
                aliases: [],
                deprecated: false,
                metadata: {
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    version: '1.0.0'
                }
            };

            const result = await service.resolveSemanticName('minimal-rule', [minimalRule]);
            expect(result).not.toBeNull();
            expect(result!.semanticName).toBe('minimal-rule');
        });

        test('should handle special characters in search queries', async () => {
            const specialRule: StandardRule = {
                ...testRules[0],
                semanticName: 'rule-with-special-chars',
                displayName: 'Rule with Special Chars: @#$%^&*()',
                description: 'Description with special characters: !@#$%^&*()'
            };

            const result = await service.searchRules({ query: '@#$%' }, [specialRule]);
            expect(result.results.length).toBeGreaterThan(0);
        });
    });
});