import { test, expect, describe, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test';
import { DatabaseConnection } from '../../../src/database/connection.js';
import { DatabaseSchema } from '../../../src/database/schema.js';
import { FtsSearchEngine } from '../../../src/cache/search-index.js';
import { createSearchableStandards, createStandard } from '../../support/factories/standard-factory.js';

describe('P1 - FTS Search Engine Tests', () => {
    let db: DatabaseConnection;
    let schema: DatabaseSchema;
    let searchEngine: FtsSearchEngine;
    let testDbPath: string;

    beforeAll(async () => {
        testDbPath = `./test-data-${Date.now()}.db`;
        db = new DatabaseConnection({
            path: testDbPath,
            walMode: true,
            foreignKeys: true,
            cacheSize: 1000,
            busyTimeout: 5000
        });

        await db.initialize();
        schema = new DatabaseSchema(db);
        await schema.initialize();
        searchEngine = new FtsSearchEngine(db);
    });

    afterAll(async () => {
        if (db) {
            await db.close();
        }
        // Clean up test files
        const fs = require('node:fs');
        try {
            if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
            if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
            if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
        } catch (error) {
            console.warn('Failed to cleanup test files:', error);
        }
    });

    beforeEach(async () => {
        // Clear database before each test
        await db.transaction(async (connection) => {
            await connection.execute('DELETE FROM standards_cache');
            await connection.execute('DELETE FROM usage_analytics');
            // Note: FTS5 content table is managed automatically, don't delete directly
        });
    });

    describe('Search Indexing', () => {
        test('1.2-SEARCH-001 should index and search standards (AC: 2)', async () => {
            // Given: Searchable standards are available
            const testStandards = createSearchableStandards();

            // When: I index the standards and search for them
            for (const standard of testStandards) {
                await searchEngine.indexStandard(standard);
            }

            const results = await searchEngine.search('typescript interface naming');

            // Then: Relevant standards should be found
            expect(results.totalCount).toBeGreaterThan(0);
            expect(results.results.length).toBeGreaterThan(0);
            expect(results.queryTime).toBeLessThan(100); // Performance requirement

            // Results should be relevant to the search query
            const interfaceStandard = results.results.find(result =>
                result.standard.title.includes('Interface Naming Convention')
            );
            expect(interfaceStandard).toBeDefined();
        });

        test('1.2-SEARCH-002 should provide relevant search results with BM25 ranking (AC: 2)', async () => {
            // Given: Standards with varying relevance
            const exactMatchStandard = createStandard({
                title: 'TypeScript Interface Naming',
                description: 'Interfaces should use PascalCase and start with I',
                technology: 'typescript',
                category: 'naming'
            });

            const partialMatchStandard = createStandard({
                title: 'General Naming Guidelines',
                description: 'TypeScript interfaces are part of naming rules',
                technology: 'typescript',
                category: 'best-practices'
            });

            // When: I index the standards and search
            await searchEngine.indexStandard(exactMatchStandard);
            await searchEngine.indexStandard(partialMatchStandard);

            const results = await searchEngine.search('TypeScript interface');

            // Then: Exact matches should rank higher
            expect(results.totalCount).toBe(2);
            expect(results.results).toHaveLength(2);

            // Exact match should have higher score (lower distance means higher relevance in BM25)
            const exactMatch = results.results.find(r => r.standard.title === 'TypeScript Interface Naming');
            const partialMatch = results.results.find(r => r.standard.title === 'General Naming Guidelines');

            expect(exactMatch).toBeDefined();
            expect(partialMatch).toBeDefined();
            expect(exactMatch!.score).toBeGreaterThanOrEqual(partialMatch!.score);

            // Performance check
            expect(results.queryTime).toBeLessThan(100);
        });

        test('1.2-SEARCH-003 should support fuzzy search (AC: 2)', async () => {
            // Given: Standards indexed for searching
            const standards = createSearchableStandards();
            for (const standard of standards) {
                await searchEngine.indexStandard(standard);
            }

            // When: I search with a typo or fuzzy match
            const exactResults = await searchEngine.search('interface naming', { fuzzy: false });
            const fuzzyResults = await searchEngine.search('interfac naming', { fuzzy: true }); // Missing 'e'

            // Then: Fuzzy search should find results even with typos
            expect(exactResults.totalCount).toBeGreaterThan(0);
            expect(fuzzyResults.totalCount).toBeGreaterThan(0);

            // Fuzzy search might find more or the same results
            expect(fuzzyResults.totalCount).toBeGreaterThanOrEqual(exactResults.totalCount);

            // Performance check
            expect(fuzzyResults.queryTime).toBeLessThan(100);
        });
    });

    describe('Search Filtering', () => {
        test('1.2-SEARCH-004 should filter by technology and category (AC: 2)', async () => {
            // Given: Standards across different technologies and categories
            const typeScriptStandard = createStandard({
                title: 'TypeScript Naming Convention',
                technology: 'typescript',
                category: 'naming'
            });

            const javascriptStandard = createStandard({
                title: 'JavaScript Variable Rules',
                technology: 'javascript',
                category: 'naming'
            });

            const pythonStandard = createStandard({
                title: 'Python Style Guide',
                technology: 'python',
                category: 'formatting'
            });

            await searchEngine.indexStandard(typeScriptStandard);
            await searchEngine.indexStandard(javascriptStandard);
            await searchEngine.indexStandard(pythonStandard);

            // When: I search with technology and category filters
            const typeScriptResults = await searchEngine.search('naming', { technology: 'typescript' });
            const namingResults = await searchEngine.search('', { category: 'naming' });
            const pythonResults = await searchEngine.search('', { technology: 'python' });

            // Then: Results should be properly filtered
            expect(typeScriptResults.results).toHaveLength(1);
            expect(typeScriptResults.results[0].standard.id).toBe(typeScriptStandard.id);

            expect(namingResults.results).toHaveLength(2); // TypeScript + JavaScript naming standards

            expect(pythonResults.results).toHaveLength(1);
            expect(pythonResults.results[0].standard.id).toBe(pythonStandard.id);
        });

        test('1.2-SEARCH-005 should provide search suggestions (AC: 2)', async () => {
            // Given: Standards indexed with various terms
            const standards = createSearchableStandards();
            for (const standard of standards) {
                await searchEngine.indexStandard(standard);
            }

            // When: I request search suggestions
            const suggestions = await searchEngine.getSuggestions('inter');

            // Then: Relevant suggestions should be provided
            expect(suggestions.length).toBeGreaterThan(0);
            expect(suggestions.some(suggestion =>
                suggestion.toLowerCase().includes('inter')
            )).toBe(true);

            // Should include interface-related terms
            expect(suggestions.some(suggestion =>
                suggestion.toLowerCase().includes('interface')
            )).toBe(true);
        });
    });

    describe('Search Index Health', () => {
        test('1.2-SEARCH-006 should maintain search index health (AC: 2)', async () => {
            // Given: Standards are indexed
            const standards = createSearchableStandards();
            for (const standard of standards) {
                await searchEngine.indexStandard(standard);
            }

            // When: I check index health
            const health = await searchEngine.getIndexHealth();

            // Then: Index should be healthy
            expect(health.healthy).toBe(true);
            expect(health.totalDocuments).toBe(standards.length);
            expect(health.indexSize).toBeGreaterThan(0);
            expect(health.lastIndexed).toBeDefined();
        });

        test('1.2-SEARCH-007 should remove standards from index (AC: 2)', async () => {
            // Given: A standard is indexed
            const testStandard = createStandard({
                title: 'Test Standard to Remove',
                technology: 'typescript',
                category: 'test'
            });

            await searchEngine.indexStandard(testStandard);

            // Verify it's indexed
            let results = await searchEngine.search('Test Standard to Remove');
            expect(results.totalCount).toBe(1);

            // When: I remove the standard from index
            await searchEngine.removeFromIndex(testStandard.id);

            // Then: It should no longer appear in search results
            results = await searchEngine.search('Test Standard to Remove');
            expect(results.totalCount).toBe(0);
        });
    });

    describe('Search Performance', () => {
        test('1.2-SEARCH-008 should handle search queries under 100ms (AC: 2)', async () => {
            // Given: A large dataset of searchable standards
            const largeStandardSet = Array.from({ length: 100 }, () => createStandard());

            for (const standard of largeStandardSet) {
                await searchEngine.indexStandard(standard);
            }

            const searchQueries = [
                'typescript',
                'naming convention',
                'interface',
                'type annotation',
                'formatting rules',
                'error handling',
                'performance optimization'
            ];

            // When: I perform multiple search queries
            const searchTimes: number[] = [];

            for (const query of searchQueries) {
                const startTime = Date.now();
                const results = await searchEngine.search(query);
                const queryTime = Date.now() - startTime;

                searchTimes.push(queryTime);

                // Then: Each query should complete under 100ms
                expect(queryTime).toBeLessThan(100);
                expect(results.queryTime).toBeLessThan(100);
            }

            // Average query time should also be under 100ms
            const averageQueryTime = searchTimes.reduce((a, b) => a + b, 0) / searchTimes.length;
            expect(averageQueryTime).toBeLessThan(100);
        });
    });
});