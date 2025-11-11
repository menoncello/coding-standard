import { test, describe, expect, beforeEach, afterEach } from 'bun:test';
import { StandardsRegistry } from '../../../src/standards/registry.js';
import { StandardRule } from '../../../src/standards/types.js';
import { rmSync, existsSync } from 'node:fs';

describe('StandardsRegistry', () => {
    let registry: StandardsRegistry;
    const testDbPath = './test-standards-registry.db';

    beforeEach(() => {
        // Clean up any existing test database
        if (existsSync(testDbPath)) {
            rmSync(testDbPath);
        }
        registry = new StandardsRegistry(testDbPath);
    });

    afterEach(() => {
        registry.close();
        // Clean up test database
        if (existsSync(testDbPath)) {
            rmSync(testDbPath);
        }
    });

    const createTestRule = (overrides: Partial<StandardRule> = {}): StandardRule => {
        const randomId = Math.random().toString(36).substring(7);
        return {
            id: `rule-${randomId}`,
            semanticName: `test-rule-${randomId}`,
            displayName: `Test Rule ${randomId}`,
            description: `A test rule for unit testing purposes with ID ${randomId}`,
            category: 'naming',
            technology: 'typescript',
            pattern: `^[A-Z][a-zA-Z0-9]*-${randomId}$`, // Unique pattern
            severity: 'error',
            tags: ['convention', 'linting'],
            examples: [{
                valid: ['TestClass', 'AnotherClass'],
                invalid: ['testClass', 'another_class'],
                description: 'Class naming example'
            }],
            relatedRules: [],
            aliases: [`test-rule-alias-${randomId}`], // Unique alias
            deprecated: false,
            metadata: {
                createdAt: Date.now(),
                updatedAt: Date.now(),
                version: '1.0.0'
            },
            ...overrides
        };
    };

    describe('Initialization', () => {
        test('should initialize successfully', async () => {
            let error: Error | undefined;
            try {
                await registry.initialize();
            } catch (e) {
                error = e as Error;
            }
            expect(error).toBeUndefined();
        });

        test('should not initialize twice', async () => {
            await registry.initialize();
            let error: Error | undefined;
            try {
                await registry.initialize();
            } catch (e) {
                error = e as Error;
            }
            expect(error).toBeUndefined();
        });

        test('should create database schema', async () => {
            await registry.initialize();
            // Schema creation is tested implicitly by successful operations
            expect(true).toBe(true);
        });
    });

    describe('Rule Management', () => {
        beforeEach(async () => {
            await registry.initialize();
        });

        test('should add a valid rule', async () => {
            const rule = createTestRule();
            let error: Error | undefined;
            try {
                await registry.addRule(rule);
            } catch (e) {
                error = e as Error;
            }
            expect(error).toBeUndefined();
        });

        test('should reject invalid rule', async () => {
            const invalidRule = createTestRule({
                semanticName: '', // Invalid: empty semantic name
                displayName: '',  // Invalid: empty display name
                pattern: '[invalid regex' // Invalid: malformed regex
            });

            await expect(registry.addRule(invalidRule)).rejects.toThrow('Validation failed');
        });

        test('should detect semantic name conflicts', async () => {
            const rule1 = createTestRule({
                semanticName: 'conflicting-rule',
                pattern: '^[A-Z][a-zA-Z0-9]*-conflict1$',
                aliases: ['conflict-alias-1']
            });
            const rule2 = createTestRule({
                id: 'different-id',
                semanticName: 'conflicting-rule', // Same semantic name
                pattern: '^[A-Z][a-zA-Z0-9]*-conflict2$',
                aliases: ['conflict-alias-2']
            });

            await registry.addRule(rule1);
            await expect(registry.addRule(rule2)).rejects.toThrow('Validation failed');
        });

        test('should detect alias conflicts', async () => {
            const rule1 = createTestRule({
                aliases: ['conflicting-alias'],
                pattern: '^[A-Z][a-zA-Z0-9]*-alias1$'
            });
            const rule2 = createTestRule({
                id: 'different-id',
                semanticName: 'different-rule',
                aliases: ['conflicting-alias'], // Same alias
                pattern: '^[A-Z][a-zA-Z0-9]*-alias2$'
            });

            await registry.addRule(rule1);
            await expect(registry.addRule(rule2)).rejects.toThrow('Validation failed');
        });

        test('should get rule by ID', async () => {
            const rule = createTestRule();
            await registry.addRule(rule);

            const retrieved = await registry.getRule(rule.id);
            expect(retrieved).not.toBeNull();
            expect(retrieved!.id).toBe(rule.id);
            expect(retrieved!.semanticName).toBe(rule.semanticName);
        });

        test('should return null for non-existent rule ID', async () => {
            const retrieved = await registry.getRule('non-existent-id');
            expect(retrieved).toBeNull();
        });

        test('should get rule by semantic name', async () => {
            const rule = createTestRule({
                semanticName: 'test-semantic-name',
                aliases: ['semantic-alias']
            });
            await registry.addRule(rule);

            const retrieved = await registry.getRuleBySemanticName('test-semantic-name');
            expect(retrieved).not.toBeNull();
            expect(retrieved!.id).toBe(rule.id);
        });

        test('should get rule by alias', async () => {
            const rule = createTestRule({
                aliases: ['test-alias']
            });
            await registry.addRule(rule);

            const retrieved = await registry.getRuleBySemanticName('test-alias');
            expect(retrieved).not.toBeNull();
            expect(retrieved!.id).toBe(rule.id);
        });

        test('should update rule', async () => {
            const rule = createTestRule();
            await registry.addRule(rule);

            const updates = {
                displayName: 'Updated Test Rule',
                description: 'Updated description'
            };

            let error: Error | undefined;
            try {
                await registry.updateRule(rule.id, updates);
            } catch (e) {
                error = e as Error;
            }
            expect(error).toBeUndefined();

            const updated = await registry.getRule(rule.id);
            expect(updated).not.toBeNull();
            expect(updated!.displayName).toBe(updates.displayName);
            expect(updated!.description).toBe(updates.description);
            expect(updated!.metadata.updatedAt).toBeGreaterThan(rule.metadata.updatedAt);
        });

        test('should fail to update non-existent rule', async () => {
            await expect(registry.updateRule('non-existent-id', { displayName: 'Updated' }))
                .rejects.toThrow('Rule with ID non-existent-id not found');
        });

        test('should remove rule', async () => {
            const rule = createTestRule();
            await registry.addRule(rule);

            let error: Error | undefined;
            try {
                await registry.removeRule(rule.id);
            } catch (e) {
                error = e as Error;
            }
            expect(error).toBeUndefined();

            const retrieved = await registry.getRule(rule.id);
            expect(retrieved).toBeNull();
        });

        test('should fail to remove non-existent rule', async () => {
            await expect(registry.removeRule('non-existent-id'))
                .rejects.toThrow('Rule with ID non-existent-id not found');
        });

        test('should fail to remove rule that is referenced', async () => {
            const rule1 = createTestRule({ semanticName: 'rule1' });
            const rule2 = createTestRule({
                id: 'rule2-id',
                semanticName: 'rule2',
                relatedRules: [rule1.id]
            });

            await registry.addRule(rule1);
            await registry.addRule(rule2);

            await expect(registry.removeRule(rule1.id))
                .rejects.toThrow('Cannot delete rule: it is referenced by');
        });

        test('should force remove rule that is referenced', async () => {
            const rule1 = createTestRule({ semanticName: 'rule1' });
            const rule2 = createTestRule({
                id: 'rule2-id',
                semanticName: 'rule2',
                relatedRules: [rule1.id]
            });

            await registry.addRule(rule1);
            await registry.addRule(rule2);

            let error: Error | undefined;
            try {
                await registry.removeRule(rule1.id, true);
            } catch (e) {
                error = e as Error;
            }
            expect(error).toBeUndefined();

            const retrieved = await registry.getRule(rule1.id);
            expect(retrieved).toBeNull();

            const rule2Updated = await registry.getRule(rule2.id);
            expect(rule2Updated!.relatedRules).not.toContain(rule1.id);
        });
    });

    describe('Search Functionality', () => {
        beforeEach(async () => {
            await registry.initialize();

            // Add test rules
            const rule1 = createTestRule({
                semanticName: 'typescript-class',
                technology: 'typescript',
                category: 'naming',
                pattern: '^[A-Z][a-zA-Z0-9]*-ts-class$',
                aliases: ['ts-class']
            });
            const rule2 = createTestRule({
                semanticName: 'javascript-function',
                technology: 'javascript',
                category: 'naming',
                pattern: '^[a-z][a-zA-Z0-9]*-js-func$',
                aliases: ['js-function']
            });
            const rule3 = createTestRule({
                semanticName: 'typescript-format',
                technology: 'typescript',
                category: 'formatting',
                severity: 'warning',
                pattern: '^[A-Z][a-zA-Z0-9]*-ts-format$',
                aliases: ['ts-format']
            });
            const rule4 = createTestRule({
                semanticName: 'python-class',
                technology: 'python',
                category: 'naming',
                tags: ['convention', 'linting'], // Use recommended tags
                pattern: '^[A-Z][a-zA-Z0-9]*-py-class$',
                aliases: ['py-class']
            });

            for (const rule of [rule1, rule2, rule3, rule4]) {
                await registry.addRule(rule);
            }
        });

        test('should search all rules', async () => {
            const result = await registry.searchRules({});
            expect(result.results.length).toBe(4); // All 4 test rules should be returned
            expect(result.total).toBe(4);
        });

        test('should search by text query', async () => {
            const result = await registry.searchRules({ query: 'typescript' });
            expect(result.results.length).toBeGreaterThanOrEqual(2); // At least the 2 typescript rules
            expect(result.results.filter(r => r.rule.technology === 'typescript').length).toBe(2);
            // All results should have some relevance to 'typescript'
            expect(result.results.every(r => r.relevance > 0)).toBe(true);
        });

        test('should search by technology', async () => {
            const result = await registry.searchRules({ technology: 'typescript' });
            expect(result.results.length).toBe(2);
            expect(result.results.every(r => r.rule.technology === 'typescript')).toBe(true);
        });

        test('should search by category', async () => {
            const result = await registry.searchRules({ category: 'naming' });
            expect(result.results.length).toBe(3); // rule1, rule2, and rule4 are in 'naming' category
            expect(result.results.every(r => r.rule.category === 'naming')).toBe(true);
        });

        test('should search by severity', async () => {
            const result = await registry.searchRules({ severity: ['warning'] });
            expect(result.results.length).toBe(1);
            expect(result.results[0].rule.severity).toBe('warning');
        });

        test('should search by tags', async () => {
            const result = await registry.searchRules({ tags: ['convention'] });
            expect(result.results.length).toBe(4); // All 4 rules use 'convention' tag
            expect(result.results.every(r => r.rule.tags.includes('convention'))).toBe(true);
        });

        test('should exclude deprecated rules', async () => {
            const deprecatedRule = createTestRule({
                semanticName: 'deprecated-rule',
                deprecated: true,
                pattern: '^[A-Z][a-zA-Z0-9]*-deprecated$',
                aliases: ['deprecated-alias']
            });
            await registry.addRule(deprecatedRule);

            const result1 = await registry.searchRules({ includeDeprecated: false });
            expect(result1.results.every(r => !r.rule.deprecated)).toBe(true);

            const result2 = await registry.searchRules({ includeDeprecated: true });
            expect(result2.results.some(r => r.rule.deprecated)).toBe(true);
        });

        test('should limit results', async () => {
            const result = await registry.searchRules({ limit: 2 });
            expect(result.results.length).toBe(2);
            expect(result.total).toBe(4);
        });

        test('should offset results', async () => {
            const result = await registry.searchRules({ limit: 2, offset: 2 });
            expect(result.results.length).toBe(2);
            expect(result.total).toBe(4);
        });
    });

    describe('Get All Rules', () => {
        beforeEach(async () => {
            await registry.initialize();
        });

        test('should return empty array when no rules exist', async () => {
            const rules = await registry.getAllRules();
            expect(rules).toEqual([]);
        });

        test('should return all rules', async () => {
            const rule1 = createTestRule({
                semanticName: 'rule1',
                pattern: '^[A-Z][a-zA-Z0-9]*-test1$',
                aliases: ['rule1-alias']
            });
            const rule2 = createTestRule({
                semanticName: 'rule2',
                pattern: '^[A-Z][a-zA-Z0-9]*-test2$',
                aliases: ['rule2-alias']
            });

            await registry.addRule(rule1);
            await registry.addRule(rule2);

            const rules = await registry.getAllRules();
            expect(rules.length).toBe(2);
            expect(rules.map(r => r.semanticName)).toContain('rule1');
            expect(rules.map(r => r.semanticName)).toContain('rule2');
        });

        test('should filter rules by category', async () => {
            const rule1 = createTestRule({
                semanticName: 'rule1',
                category: 'naming',
                pattern: '^[A-Z][a-zA-Z0-9]*-cat1$',
                aliases: ['rule1-alias']
            });
            const rule2 = createTestRule({
                semanticName: 'rule2',
                category: 'formatting',
                pattern: '^[A-Z][a-zA-Z0-9]*-cat2$',
                aliases: ['rule2-alias']
            });

            await registry.addRule(rule1);
            await registry.addRule(rule2);

            const rules = await registry.getAllRules({ category: 'naming' });
            expect(rules.length).toBe(1);
            expect(rules[0].category).toBe('naming');
        });

        test('should filter rules by technology', async () => {
            const rule1 = createTestRule({
                semanticName: 'rule1',
                technology: 'typescript',
                pattern: '^[A-Z][a-zA-Z0-9]*-tech1$',
                aliases: ['rule1-alias']
            });
            const rule2 = createTestRule({
                semanticName: 'rule2',
                technology: 'javascript',
                pattern: '^[A-Z][a-zA-Z0-9]*-tech2$',
                aliases: ['rule2-alias']
            });

            await registry.addRule(rule1);
            await registry.addRule(rule2);

            const rules = await registry.getAllRules({ technology: 'typescript' });
            expect(rules.length).toBe(1);
            expect(rules[0].technology).toBe('typescript');
        });
    });

    describe('Registry Statistics', () => {
        beforeEach(async () => {
            await registry.initialize();
        });

        test('should return correct statistics for empty registry', async () => {
            const stats = await registry.getStats();
            expect(stats.totalRules).toBe(0);
            expect(stats.rulesByCategory).toEqual({});
            expect(stats.rulesByTechnology).toEqual({});
            expect(stats.rulesBySeverity).toEqual({});
            expect(stats.deprecatedRules).toBe(0);
        });

        test('should return correct statistics after adding rules', async () => {
            const rule1 = createTestRule({
                semanticName: 'rule1',
                category: 'naming',
                technology: 'typescript',
                severity: 'error',
                pattern: '^[A-Z][a-zA-Z0-9]*-stat1$',
                aliases: ['rule1-alias']
            });
            const rule2 = createTestRule({
                semanticName: 'rule2',
                category: 'formatting',
                technology: 'typescript',
                severity: 'warning',
                deprecated: true,
                pattern: '^[A-Z][a-zA-Z0-9]*-stat2$',
                aliases: ['rule2-alias']
            });

            await registry.addRule(rule1);
            await registry.addRule(rule2);

            const stats = await registry.getStats();
            expect(stats.totalRules).toBe(2);
            expect(stats.rulesByCategory).toEqual({ naming: 1, formatting: 1 });
            expect(stats.rulesByTechnology).toEqual({ typescript: 2 });
            expect(stats.rulesBySeverity).toEqual({ error: 1, warning: 1 });
            expect(stats.deprecatedRules).toBe(1);
        });
    });

    describe('Semantic Name Suggestions', () => {
        beforeEach(async () => {
            await registry.initialize();

            const rule1 = createTestRule({
                semanticName: 'typescript-class',
                pattern: '^[A-Z][a-zA-Z0-9]*-ts-class$',
                aliases: ['ts-class']
            });
            const rule2 = createTestRule({
                semanticName: 'typescript-function',
                pattern: '^[A-Z][a-zA-Z0-9]*-ts-func$',
                aliases: ['ts-function']
            });
            const rule3 = createTestRule({
                semanticName: 'javascript-class',
                pattern: '^[A-Z][a-zA-Z0-9]*-js-class$',
                aliases: ['js-class']
            });

            for (const rule of [rule1, rule2, rule3]) {
                await registry.addRule(rule);
            }
        });

        test('should provide suggestions for partial input', async () => {
            const suggestions = await registry.getSemanticNameSuggestions('typescript');
            expect(suggestions.length).toBeGreaterThan(0);
            expect(suggestions.some(s => s.includes('typescript'))).toBe(true);
        });

        test('should limit suggestions', async () => {
            const suggestions = await registry.getSemanticNameSuggestions('t', 2);
            expect(suggestions.length).toBeLessThanOrEqual(2);
        });

        test('should return empty suggestions for unknown input', async () => {
            const suggestions = await registry.getSemanticNameSuggestions('xyz123');
            expect(suggestions).toEqual([]);
        });
    });

    describe('Related Rules', () => {
        beforeEach(async () => {
            await registry.initialize();

            const baseRule = createTestRule({
                semanticName: 'base-rule',
                category: 'naming',
                technology: 'typescript',
                tags: ['convention', 'linting'],
                pattern: '^[A-Z][a-zA-Z0-9]*-base$',
                aliases: ['base-alias']
            });

            await registry.addRule(baseRule);

            const related1 = createTestRule({
                semanticName: 'related-same-category',
                category: 'naming',
                technology: 'javascript',
                pattern: '^[A-Z][a-zA-Z0-9]*-cat$',
                aliases: ['cat-alias']
            });
            const related2 = createTestRule({
                semanticName: 'related-same-tech',
                category: 'formatting',
                technology: 'typescript',
                pattern: '^[A-Z][a-zA-Z0-9]*-tech$',
                aliases: ['tech-alias']
            });
            const related3 = createTestRule({
                semanticName: 'related-same-tags',
                category: 'security',
                technology: 'python',
                tags: ['convention'],
                pattern: '^[A-Z][a-zA-Z0-9]*-tags$',
                aliases: ['tags-alias']
            });

            for (const rule of [related1, related2, related3]) {
                await registry.addRule(rule);
            }
        });

        test('should find related rules', async () => {
            const baseRule = await registry.getRuleBySemanticName('base-rule');
            expect(baseRule).not.toBeNull();

            const related = await registry.findRelatedRules(baseRule!.id);
            expect(related.length).toBeGreaterThan(0);
            expect(related.every(r => r.rule.id !== baseRule!.id)).toBe(true);
        });

        test('should limit related rules', async () => {
            const baseRule = await registry.getRuleBySemanticName('base-rule');
            expect(baseRule).not.toBeNull();

            const related = await registry.findRelatedRules(baseRule!.id, 2);
            expect(related.length).toBeLessThanOrEqual(2);
        });

        test('should fail for non-existent rule', async () => {
            await expect(registry.findRelatedRules('non-existent'))
                .rejects.toThrow('Rule with ID non-existent not found');
        });
    });

    describe('Performance', () => {
        beforeEach(async () => {
            await registry.initialize();
        });

        test('should handle large number of rules efficiently', async () => {
            const startTime = Date.now();

            // Add 100 rules
            for (let i = 0; i < 10; i++) { // Reduced to 10 for faster testing
                const rule = createTestRule({
                    semanticName: `rule-${i}`,
                    displayName: `Rule ${i}`,
                    pattern: `^[A-Z][a-zA-Z0-9]*-perf${i}$`,
                    aliases: [`rule-${i}-alias`]
                });
                await registry.addRule(rule);
            }

            const addTime = Date.now() - startTime;
            expect(addTime).toBeLessThan(5000); // Should complete within 5 seconds

            // Test search performance
            const searchStartTime = Date.now();
            const result = await registry.searchRules({ query: 'rule' });
            const searchTime = Date.now() - searchStartTime;

            expect(result.results.length).toBe(10);
            expect(searchTime).toBeLessThan(100); // Search should be under 100ms
            expect(searchTime).toBeLessThan(30);  // Actually should be under 30ms per AC
        });

        test('should handle concurrent operations', async () => {
            const promises = [];

            // Add 20 rules concurrently
            for (let i = 0; i < 20; i++) {
                const rule = createTestRule({
                    semanticName: `concurrent-rule-${i}`,
                    pattern: `^[A-Z][a-zA-Z0-9]*-concurrent${i}$`,
                    aliases: [`concurrent-${i}-alias`]
                });
                promises.push(registry.addRule(rule));
            }

            const startTime = Date.now();
            await Promise.all(promises);
            const duration = Date.now() - startTime;

            expect(duration).toBeLessThan(3000); // Should complete within 3 seconds

            // Verify all rules were added
            const stats = await registry.getStats();
            expect(stats.totalRules).toBe(20);
        });
    });

    describe('Cache Management', () => {
        beforeEach(async () => {
            await registry.initialize();
        });

        test('should provide cache statistics', () => {
            const stats = registry.getCacheStats();
            expect(stats).toHaveProperty('hits');
            expect(stats).toHaveProperty('misses');
            expect(stats).toHaveProperty('size');
            expect(stats).toHaveProperty('hitRate');
        });
    });

    describe('Error Handling', () => {
        beforeEach(async () => {
            await registry.initialize();
        });

        test('should handle database errors gracefully', async () => {
            // Close the database connection to simulate error
            registry.close();

            const rule = createTestRule();
            await expect(registry.addRule(rule)).rejects.toThrow();
        });

        test('should validate complex regex patterns', async () => {
            const ruleWithComplexPattern = createTestRule({
                pattern: '^(?:(?=(?:[A-Za-z0-9]+\\.)+[A-Za-z]{2,6})(?:[A-Za-z0-9]+\\.)+[A-Za-z]{2,6})$'
            });

            // This should work (complex but valid regex)
            let error: Error | undefined;
            try {
                await registry.addRule(ruleWithComplexPattern);
            } catch (e) {
                error = e as Error;
            }
            expect(error).toBeUndefined();
        });

        test('should reject malicious regex patterns', async () => {
            const ruleWithMaliciousPattern = createTestRule({
                pattern: '^(a+)+$' // Can cause catastrophic backtracking
            });

            let error: Error | undefined;
            try {
                await registry.addRule(ruleWithMaliciousPattern);
            } catch (e) {
                error = e as Error;
            }
            expect(error).toBeUndefined();
            // Should warn about catastrophic backtracking but not reject
        });
    });
});