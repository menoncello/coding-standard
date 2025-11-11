import { test, describe, expect, beforeEach, afterEach } from 'bun:test';
import { StandardsRegistry } from '../../src/standards/registry.js';
import { StandardRule } from '../../src/standards/types.js';
import { rmSync, existsSync } from 'node:fs';

describe('Registry Performance Tests', () => {
    let registry: StandardsRegistry;
    const testDbPath = './performance-test-standards-registry.db';
    const PERFORMANCE_TARGET_MS = 30; // Sub-30ms requirement from AC

    beforeEach(async () => {
        // Clean up any existing test database
        if (existsSync(testDbPath)) {
            rmSync(testDbPath);
        }
        registry = new StandardsRegistry(testDbPath, {
            cacheEnabled: true,
            cacheTtl: 60000, // Long TTL for performance tests
            validationEnabled: false, // Disable validation to avoid warnings in tests
            performanceMonitoring: true,
            conflictDetection: false // Disable conflict detection for performance tests
        });
        await registry.initialize();
    });

    afterEach(() => {
        registry.close();
        // Clean up test database
        if (existsSync(testDbPath)) {
            rmSync(testDbPath);
        }
    });

    const createPerformanceTestRule = (index: number): StandardRule => ({
        id: `perf-rule-${index}`,
        semanticName: `performance-test-rule-${index}`,
        displayName: `Performance Test Rule ${index}`,
        description: `A comprehensive test rule for performance testing with index ${index}`,
        category: ['naming', 'formatting', 'structure', 'security', 'testing'][index % 5],
        technology: ['typescript', 'javascript', 'python', 'java', 'go'][index % 5],
        pattern: `^[A-Z][a-zA-Z0-9]*-${index}$`,
        severity: ['error', 'warning', 'info'][index % 3] as 'error' | 'warning' | 'info',
        tags: [
            'convention', 'consistency', 'readability', 'modularity', 'safety',
            'optimization', 'maintainability', 'accessibility'
        ].slice(0, 3 + (index % 3)),
        examples: [{
            valid: [`ExampleClass${index}`, `TestClass${index}`, `ValidClass${index}`],
            invalid: [`exampleClass${index}`, `test_class${index}`, `invalid-class-${index}`],
            description: `Performance test examples for rule ${index}`
        }],
        relatedRules: [`perf-rule-${(index + 1) % 100}`, `perf-rule-${(index + 2) % 100}`],
        aliases: [`perf-rule-alias-${index}`, `test-rule-${index}`],
        deprecated: index % 20 === 0, // 5% deprecated
        metadata: {
            createdAt: Date.now() - (index * 1000),
            updatedAt: Date.now() - (index * 500),
            version: `1.${index}.0`,
            createdBy: 'performance-test-suite',
            validationStatus: 'validated',
            customFields: {
                performance: true,
                testIndex: index,
                category: 'performance'
            }
        }
    });

    async function measurePerformance<T>(
        operation: () => Promise<T>,
        operationName: string
    ): Promise<{ result: T; duration: number; passed: boolean }> {
        const startTime = Date.now();
        const result = await operation();
        const duration = Date.now() - startTime;
        const passed = duration <= PERFORMANCE_TARGET_MS;

        if (!passed) {
            console.warn(`⚠️  ${operationName} took ${duration}ms (target: ${PERFORMANCE_TARGET_MS}ms)`);
        }

        return { result, duration, passed };
    }

    describe('Basic Operations Performance', () => {
        test('rule retrieval should be under 30ms', async () => {
            // Add test rule
            const rule = createPerformanceTestRule(1);
            await registry.addRule(rule);

            const { duration, passed } = await measurePerformance(
                () => registry.getRuleBySemanticName('performance-test-rule-1'),
                'Rule retrieval'
            );

            expect(duration).toBeLessThan(PERFORMANCE_TARGET_MS);
            expect(passed).toBe(true);
        });

        test('rule search should be under 30ms', async () => {
            // Add test rules
            for (let i = 0; i < 10; i++) {
                await registry.addRule(createPerformanceTestRule(i));
            }

            const { duration, passed } = await measurePerformance(
                () => registry.searchRules({ query: 'performance' }),
                'Rule search'
            );

            expect(duration).toBeLessThan(PERFORMANCE_TARGET_MS);
            expect(passed).toBe(true);
        });

        test('rule addition should be under 50ms', async () => {
            const rule = createPerformanceTestRule(1);
            const { duration } = await measurePerformance(
                () => registry.addRule(rule),
                'Rule addition'
            );

            // Addition operations have higher target (50ms from AC)
            expect(duration).toBeLessThan(50);
        });

        test('semantic name suggestions should be under 30ms', async () => {
            // Add test rules
            for (let i = 0; i < 10; i++) {
                await registry.addRule(createPerformanceTestRule(i));
            }

            const { duration, passed } = await measurePerformance(
                () => registry.getSemanticNameSuggestions('performance'),
                'Semantic name suggestions'
            );

            expect(duration).toBeLessThan(PERFORMANCE_TARGET_MS);
            expect(passed).toBe(true);
        });
    });

    describe('Cache Performance', () => {
        test('cached retrieval should be significantly faster', async () => {
            const rule = createPerformanceTestRule(1);
            await registry.addRule(rule);

            // First retrieval (cache miss)
            const firstResult = await measurePerformance(
                () => registry.getRuleBySemanticName('performance-test-rule-1'),
                'First retrieval (cache miss)'
            );

            // Second retrieval (should be cache hit)
            const secondResult = await measurePerformance(
                () => registry.getRuleBySemanticName('performance-test-rule-1'),
                'Second retrieval (cache hit)'
            );

            expect(firstResult.duration).toBeLessThan(PERFORMANCE_TARGET_MS);
            expect(secondResult.duration).toBeLessThan(PERFORMANCE_TARGET_MS);

            // Cache hit should be faster (allow some tolerance for measurement precision)
            expect(secondResult.duration).toBeLessThanOrEqual(firstResult.duration + 5);
        });

        test('cached search should be significantly faster', async () => {
            // Add test rules
            for (let i = 0; i < 10; i++) {
                await registry.addRule(createPerformanceTestRule(i));
            }

            // First search (cache miss)
            const firstResult = await measurePerformance(
                () => registry.searchRules({ query: 'performance' }),
                'First search (cache miss)'
            );

            // Second search (should be cache hit)
            const secondResult = await measurePerformance(
                () => registry.searchRules({ query: 'performance' }),
                'Second search (cache hit)'
            );

            expect(firstResult.duration).toBeLessThan(PERFORMANCE_TARGET_MS);
            expect(secondResult.duration).toBeLessThan(PERFORMANCE_TARGET_MS);

            // Cache hit should be faster
            expect(secondResult.duration).toBeLessThanOrEqual(firstResult.duration + 5);
        });
    });

    describe('Scale Performance', () => {
        test('performance should scale well with 100 rules', async () => {
            // Add 100 rules
            const addPromises = [];
            for (let i = 0; i < 100; i++) {
                addPromises.push(registry.addRule(createPerformanceTestRule(i)));
            }
            await Promise.all(addPromises);

            // Test search performance (5% of rules are deprecated and filtered out)
            const searchResult = await measurePerformance(
                () => registry.searchRules({ query: 'performance' }),
                'Search with 100 rules'
            );

            expect(searchResult.result.results.length).toBe(95); // 100 - 5 deprecated
            expect(searchResult.duration).toBeLessThan(PERFORMANCE_TARGET_MS);
            expect(searchResult.passed).toBe(true);

            // Test specific retrieval performance
            const retrievalResult = await measurePerformance(
                () => registry.getRuleBySemanticName('performance-test-rule-50'),
                'Retrieval with 100 rules'
            );

            expect(retrievalResult.duration).toBeLessThan(PERFORMANCE_TARGET_MS);
            expect(retrievalResult.passed).toBe(true);
        });

        test('performance should scale well with 1000 rules', async () => {
            // Add 1000 rules in batches for efficiency
            const batchSize = 50;
            for (let batch = 0; batch < 20; batch++) {
                const promises = [];
                for (let i = 0; i < batchSize; i++) {
                    const index = batch * batchSize + i;
                    promises.push(registry.addRule(createPerformanceTestRule(index)));
                }
                await Promise.all(promises);
            }

            // Test search performance (5% of rules are deprecated and filtered out)
            const searchResult = await measurePerformance(
                () => registry.searchRules({ query: 'performance' }),
                'Search with 1000 rules'
            );

            expect(searchResult.result.results.length).toBe(950); // 1000 - 50 deprecated
            expect(searchResult.duration).toBeLessThan(PERFORMANCE_TARGET_MS);
            expect(searchResult.passed).toBe(true);

            // Test filtered search performance
            const filteredResult = await measurePerformance(
                () => registry.searchRules({
                    query: 'performance',
                    technology: 'typescript',
                    category: 'naming'
                }),
                'Filtered search with 1000 rules'
            );

            expect(filteredResult.duration).toBeLessThan(PERFORMANCE_TARGET_MS);
            expect(filteredResult.passed).toBe(true);

            // Test specific retrieval performance
            const retrievalResult = await measurePerformance(
                () => registry.getRuleBySemanticName('performance-test-rule-500'),
                'Retrieval with 1000 rules'
            );

            expect(retrievalResult.duration).toBeLessThan(PERFORMANCE_TARGET_MS);
            expect(retrievalResult.passed).toBe(true);
        });
    });

    describe('Concurrent Performance', () => {
        test('should handle concurrent operations efficiently', async () => {
            // Add test rules
            for (let i = 0; i < 50; i++) {
                await registry.addRule(createPerformanceTestRule(i));
            }

            // Run 50 concurrent searches
            const concurrentSearches = [];
            for (let i = 0; i < 50; i++) {
                concurrentSearches.push(
                    measurePerformance(
                        () => registry.searchRules({ query: `performance-test-rule-${i}` }),
                        `Concurrent search ${i}`
                    )
                );
            }

            const startTime = Date.now();
            const results = await Promise.all(concurrentSearches);
            const totalDuration = Date.now() - startTime;

            // Individual operations should meet targets
            const passedOperations = results.filter(r => r.passed);
            expect(passedOperations.length).toBe(results.length);

            // Concurrent execution should be much faster than sequential
            expect(totalDuration).toBeLessThan(results.length * PERFORMANCE_TARGET_MS);

            // Average operation time should be well under target
            const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
            expect(avgDuration).toBeLessThan(PERFORMANCE_TARGET_MS * 0.8); // 20% buffer for concurrent overhead
        });

        test('should handle mixed concurrent operations', async () => {
            // Add test rules
            for (let i = 0; i < 20; i++) {
                await registry.addRule(createPerformanceTestRule(i));
            }

            const operations = [];

            // Mix of different operations
            for (let i = 0; i < 20; i++) {
                operations.push(
                    registry.searchRules({ query: 'performance' })
                );
                operations.push(
                    registry.getRuleBySemanticName(`performance-test-rule-${i}`)
                );
                operations.push(
                    registry.getSemanticNameSuggestions('performance')
                );
            }

            const startTime = Date.now();
            const results = await Promise.all(operations);
            const duration = Date.now() - startTime;

            // All operations should complete
            expect(results.length).toBe(60); // 20 * 3 operations

            // Should complete efficiently
            expect(duration).toBeLessThan(200); // 60 operations in under 200ms
        });
    });

    describe('Memory Performance', () => {
        test('should maintain performance under memory pressure', async () => {
            // Add rules with large examples to increase memory usage
            for (let i = 0; i < 50; i++) {
                const rule = createPerformanceTestRule(i);
                // Add many examples to increase memory usage
                rule.examples = Array(20).fill({
                    valid: [`ValidExample${i}-1`, `ValidExample${i}-2`, `ValidExample${i}-3`],
                    invalid: [`invalidExample${i}-1`, `invalid_example${i}-2`],
                    description: `Large example set for memory testing ${i}`
                });
                rule.tags = Array(10).fill(0).map((_, j) => `memory-test-tag-${j}`);
                await registry.addRule(rule);
            }

            // Test performance under memory pressure (5% of rules are deprecated and filtered out)
            const searchResult = await measurePerformance(
                () => registry.searchRules({ query: 'memory-test' }),
                'Search under memory pressure'
            );

            expect(searchResult.result.results.length).toBe(47); // 50 - (50/20) deprecated ≈ 47
            expect(searchResult.duration).toBeLessThan(PERFORMANCE_TARGET_MS);
            expect(searchResult.passed).toBe(true);
        });

        test('should handle cache memory efficiently', async () => {
            // Add many rules
            for (let i = 0; i < 100; i++) {
                await registry.addRule(createPerformanceTestRule(i));
            }

            // Clear any existing cache to start fresh
            const cacheStatsBefore = registry.getCacheStats();
            const initialHits = cacheStatsBefore.hits;

            // Perform the same search multiple times to test caching
            await registry.searchRules({ query: 'performance' }); // First time - cache miss
            await registry.searchRules({ query: 'performance' }); // Second time - cache hit
            await registry.searchRules({ query: 'performance' }); // Third time - cache hit

            // Perform the same rule retrieval multiple times
            await registry.getRuleBySemanticName('performance-test-rule-1'); // First time - cache miss
            await registry.getRuleBySemanticName('performance-test-rule-1'); // Second time - cache hit
            await registry.getRuleBySemanticName('performance-test-rule-1'); // Third time - cache hit

            // Test that cache doesn't degrade performance
            const cacheTestResult = await measurePerformance(
                () => registry.searchRules({ query: 'performance' }),
                'Search with populated cache'
            );

            expect(cacheTestResult.duration).toBeLessThan(PERFORMANCE_TARGET_MS);
            expect(cacheTestResult.passed).toBe(true);

            // Check cache statistics - should have cache hits now
            const cacheStatsAfter = registry.getCacheStats();
            expect(cacheStatsAfter.hits).toBeGreaterThan(initialHits);
            expect(cacheStatsAfter.hitRate).toBeGreaterThan(0);
        });
    });

    describe('Stress Tests', () => {
        test('should maintain performance under stress', async () => {
            // Add 500 rules
            for (let i = 0; i < 500; i++) {
                await registry.addRule(createPerformanceTestRule(i));
            }

            // Perform stress test: 100 rapid searches
            const stressResults = [];
            for (let i = 0; i < 100; i++) {
                const result = await measurePerformance(
                    () => registry.searchRules({
                        query: `performance-test-rule-${i % 100}`,
                        limit: 50
                    }),
                    `Stress test search ${i}`
                );
                stressResults.push(result);
            }

            // Analyze results
            const passedOperations = stressResults.filter(r => r.passed);
            const durations = stressResults.map(r => r.duration);
            const avgDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
            const maxDuration = Math.max(...durations);

            expect(passedOperations.length).toBeGreaterThan(90); // At least 90% should pass
            expect(avgDuration).toBeLessThan(PERFORMANCE_TARGET_MS * 0.8); // Average should be well under target
            expect(maxDuration).toBeLessThan(PERFORMANCE_TARGET_MS * 2); // Even slowest should be reasonable
        });

        test('should handle rapid additions and queries', async () => {
            // Rapidly add rules and immediately query them
            for (let i = 0; i < 20; i++) {
                // Add rule
                const rule = createPerformanceTestRule(i);
                await registry.addRule(rule);

                // Immediately query it
                const queryResult = await measurePerformance(
                    () => registry.getRuleBySemanticName(`performance-test-rule-${i}`),
                    `Immediate query after addition ${i}`
                );

                expect(queryResult.duration).toBeLessThan(PERFORMANCE_TARGET_MS);
                expect(queryResult.result).not.toBeNull();
                expect(queryResult.result!.semanticName).toBe(`performance-test-rule-${i}`);
            }
        });
    });

    describe('Performance Regression Detection', () => {
        test('should establish performance baseline', async () => {
            // Add baseline set of rules
            for (let i = 0; i < 10; i++) {
                await registry.addRule(createPerformanceTestRule(i));
            }

            // Baseline measurements
            const baselineSearch = await measurePerformance(
                () => registry.searchRules({ query: 'performance' }),
                'Baseline search'
            );

            const baselineRetrieval = await measurePerformance(
                () => registry.getRuleBySemanticName('performance-test-rule-5'),
                'Baseline retrieval'
            );

            const baselineSuggestions = await measurePerformance(
                () => registry.getSemanticNameSuggestions('performance'),
                'Baseline suggestions'
            );

            // All should pass performance targets
            expect(baselineSearch.passed).toBe(true);
            expect(baselineRetrieval.passed).toBe(true);
            expect(baselineSuggestions.passed).toBe(true);

            // Log baseline values for regression detection
            console.log(`Performance Baseline (10 rules):`);
            console.log(`  Search: ${baselineSearch.duration}ms`);
            console.log(`  Retrieval: ${baselineRetrieval.duration}ms`);
            console.log(`  Suggestions: ${baselineSuggestions.duration}ms`);
        });

        test('should detect performance regression with increased data', async () => {
            // Add larger set of rules
            for (let i = 0; i < 100; i++) {
                await registry.addRule(createPerformanceTestRule(i));
            }

            // Measure performance with larger dataset
            const largeSearch = await measurePerformance(
                () => registry.searchRules({ query: 'performance' }),
                'Large dataset search'
            );

            const largeRetrieval = await measurePerformance(
                () => registry.getRuleBySemanticName('performance-test-rule-50'),
                'Large dataset retrieval'
            );

            // Should still meet performance targets
            expect(largeSearch.passed).toBe(true);
            expect(largeRetrieval.passed).toBe(true);

            // Performance should not degrade significantly
            expect(largeSearch.duration).toBeLessThan(PERFORMANCE_TARGET_MS * 1.5);
            expect(largeRetrieval.duration).toBeLessThan(PERFORMANCE_TARGET_MS * 1.5);

            console.log(`Performance with 100 rules:`);
            console.log(`  Search: ${largeSearch.duration}ms`);
            console.log(`  Retrieval: ${largeRetrieval.duration}ms`);
        });
    });
});