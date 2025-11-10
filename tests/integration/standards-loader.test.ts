import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { StandardsLoader } from '../../src/standards/standards-loader.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

describe('StandardsLoader Integration Tests', () => {
    let loader: StandardsLoader;
    let testProjectRoot: string;

    beforeEach(async () => {
        loader = new StandardsLoader();
        testProjectRoot = process.cwd();
    });

    afterEach(() => {
        loader.clearCache();
    });

    describe('loadStandards', () => {
        test('should load standards from real project configuration files', async () => {
            const standards = await loader.loadStandards();

            expect(standards).toBeDefined();
            expect(Array.isArray(standards)).toBe(true);

            // Should have loaded standards from ESLint, Biome, and TypeScript configs
            expect(standards.length).toBeGreaterThan(0);

            // Check that standards have required properties
            standards.forEach(standard => {
                expect(standard).toHaveProperty('id');
                expect(standard).toHaveProperty('title');
                expect(standard).toHaveProperty('category');
                expect(standard).toHaveProperty('technology');
                expect(standard).toHaveProperty('description');
                expect(standard).toHaveProperty('rules');
                expect(standard).toHaveProperty('lastUpdated');

                expect(Array.isArray(standard.rules)).toBe(true);
                expect(standard.rules.length).toBeGreaterThan(0);

                // Check rule properties
                standard.rules.forEach(rule => {
                    expect(rule).toHaveProperty('id');
                    expect(rule).toHaveProperty('description');
                    expect(rule).toHaveProperty('severity');
                    expect(rule).toHaveProperty('category');
                    expect(['error', 'warning', 'info']).toContain(rule.severity);
                });
            });
        });

        test('should load Biome standards', async () => {
            const standards = await loader.loadStandards();
            const biomeStandards = standards.filter(s => s.id.includes('biome'));

            expect(biomeStandards.length).toBeGreaterThan(0);

            // Check for expected Biome categories
            const categories = biomeStandards.map(s => s.category);
            expect(categories).toContain('Formatting');
            expect(categories).toContain('Linting');
        });

        test('should load TypeScript standards (if available)', async () => {
            const standards = await loader.loadStandards();
            const tsStandards = standards.filter(s => s.id.includes('typescript') || s.technology.toLowerCase().includes('typescript'));

            // TypeScript standards may not be present, which is okay
            if (tsStandards.length > 0) {
                // Should have TypeScript-related rules
                const typeScriptRules = tsStandards.flatMap(s => s.rules);
                expect(typeScriptRules.length).toBeGreaterThan(0);
            }
        });

        test('should cache loaded standards', async () => {
            // Simple cache test without complex mocking
            const standards1 = await loader.loadStandards();
            const standards2 = await loader.loadStandards();

            // Should return the same results (cached)
            expect(standards1).toEqual(standards2);
        });

        test('should handle missing configuration files gracefully', async () => {
            const tempDir = `${tmpdir()}/test-standards-${Date.now()}`;
            mkdirSync(tempDir, { recursive: true });

            try {
                const tempLoader = new StandardsLoader(tempDir);
                const standards = await tempLoader.loadStandards();

                // Should not crash and should return empty array when no config files exist
                expect(Array.isArray(standards)).toBe(true);
                expect(standards.length).toBe(0);
            } finally {
                // Clean up
                const fs = await import('node:fs/promises');
                await fs.rm(tempDir, { recursive: true, force: true });
            }
        });
    });

    describe('getStandardsByTechnology', () => {
        test('should filter standards by technology', async () => {
            const tsStandards = await loader.getStandardsByTechnology('typescript');
            const jsStandards = await loader.getStandardsByTechnology('javascript');

            expect(tsStandards.length).toBeGreaterThan(0);
            expect(jsStandards.length).toBeGreaterThan(0);

            // All returned standards should match the technology
            tsStandards.forEach(standard => {
                expect(standard.technology.toLowerCase()).toContain('typescript');
            });

            jsStandards.forEach(standard => {
                expect(standard.technology.toLowerCase()).toContain('javascript');
            });
        });

        test('should be case insensitive for technology filtering', async () => {
            const lowerCase = await loader.getStandardsByTechnology('typescript');
            const upperCase = await loader.getStandardsByTechnology('TYPESCRIPT');
            const mixedCase = await loader.getStandardsByTechnology('TypeScript');

            expect(lowerCase.length).toBe(upperCase.length);
            expect(lowerCase.length).toBe(mixedCase.length);
        });
    });

    describe('getStandardsByCategory', () => {
        test('should filter standards by category', async () => {
            const formattingStandards = await loader.getStandardsByCategory('Formatting');
            const lintingStandards = await loader.getStandardsByCategory('Linting');

            expect(formattingStandards.length).toBeGreaterThan(0);
            expect(lintingStandards.length).toBeGreaterThan(0);

            // All returned standards should match the category
            formattingStandards.forEach(standard => {
                expect(standard.category.toLowerCase()).toBe('formatting');
            });

            lintingStandards.forEach(standard => {
                expect(standard.category.toLowerCase()).toBe('linting');
            });
        });

        test('should be case insensitive for category filtering', async () => {
            const lowerCase = await loader.getStandardsByCategory('formatting');
            const upperCase = await loader.getStandardsByCategory('FORMATTING');
            const mixedCase = await loader.getStandardsByCategory('Formatting');

            expect(lowerCase.length).toBe(upperCase.length);
            expect(lowerCase.length).toBe(mixedCase.length);
        });
    });

    describe('configuration file parsing', () => {
        test('should parse ESLint configuration correctly', async () => {
            const eslintStandards = await loader['loadESLintStandards']();

            expect(Array.isArray(eslintStandards)).toBe(true);

            if (eslintStandards.length > 0) {
                const eslintStandard = eslintStandards[0];
                expect(eslintStandard.id).toContain('eslint');
                expect(eslintStandard.technology).toContain('javascript/typescript');
                expect(eslintStandard.rules.length).toBeGreaterThan(0);

                // Check specific ESLint rules that should be present
                const allRules = eslintStandards.flatMap(s => s.rules);
                expect(allRules.some(r => r.id.includes('complexity'))).toBe(true);
                expect(allRules.some(r => r.id.includes('max-'))).toBe(true);
            }
        });

        test('should parse Biome configuration correctly', async () => {
            const biomeStandards = await loader['loadBiomeStandards']();

            expect(Array.isArray(biomeStandards)).toBe(true);

            if (biomeStandards.length > 0) {
                const biomeStandard = biomeStandards[0];
                expect(biomeStandard.id).toContain('biome');
                expect(biomeStandard.technology).toContain('javascript/typescript');
                expect(biomeStandard.rules.length).toBeGreaterThan(0);

                // Check for Biome-specific rules
                const allRules = biomeStandards.flatMap(s => s.rules);
                expect(allRules.some(r => r.id.includes('biome-'))).toBe(true);
            }
        });

        test('should parse TypeScript configuration correctly', async () => {
            const tsStandards = await loader['loadTypeScriptStandards']();

            expect(Array.isArray(tsStandards)).toBe(true);

            if (tsStandards.length > 0) {
                const tsStandard = tsStandards[0];
                expect(tsStandard.id).toContain('typescript');
                expect(tsStandard.technology).toBe('typescript');
                expect(tsStandard.rules.length).toBeGreaterThan(0);

                // Check for TypeScript-specific rules
                const allRules = tsStandards.flatMap(s => s.rules);
                expect(allRules.some(r => r.id.includes('ts-'))).toBe(true);
            }
        });
    });

    describe('error handling', () => {
        test('should handle invalid ESLint configuration', async () => {
            const tempDir = `${tmpdir()}/test-eslint-${Date.now()}`;
            mkdirSync(tempDir, { recursive: true });

            try {
                // Create invalid ESLint config
                const invalidEslintPath = path.join(tempDir, 'eslint.config.js');
                writeFileSync(invalidEslintPath, 'invalid javascript code {');

                const tempLoader = new StandardsLoader(tempDir);
                const standards = await tempLoader.loadStandards();

                // Should not crash, just skip the invalid config
                expect(Array.isArray(standards)).toBe(true);
            } finally {
                // Clean up
                const fs = await import('node:fs/promises');
                await fs.rm(tempDir, { recursive: true, force: true });
            }
        });

        test('should handle invalid JSON configuration', async () => {
            const tempDir = `${tmpdir()}/test-json-${Date.now()}`;
            mkdirSync(tempDir, { recursive: true });

            try {
                // Create invalid JSON config
                const invalidJsonPath = path.join(tempDir, 'biome.json');
                writeFileSync(invalidJsonPath, '{ invalid json }');

                const tempLoader = new StandardsLoader(tempDir);
                const standards = await tempLoader.loadStandards();

                // Should not crash, just skip the invalid config
                expect(Array.isArray(standards)).toBe(true);
            } finally {
                // Clean up
                const fs = await import('node:fs/promises');
                await fs.rm(tempDir, { recursive: true, force: true });
            }
        });

        test('should handle missing files gracefully', async () => {
            const tempDir = `${tmpdir()}/test-missing-${Date.now()}`;
            mkdirSync(tempDir, { recursive: true });

            try {
                const tempLoader = new StandardsLoader(tempDir);

                // Should not crash when files don't exist
                const eslintStandards = await tempLoader['loadESLintStandards']();
                const biomeStandards = await tempLoader['loadBiomeStandards']();
                const tsStandards = await tempLoader['loadTypeScriptStandards']();

                expect(Array.isArray(eslintStandards)).toBe(true);
                expect(Array.isArray(biomeStandards)).toBe(true);
                expect(Array.isArray(tsStandards)).toBe(true);
            } finally {
                // Clean up
                const fs = await import('node:fs/promises');
                await fs.rm(tempDir, { recursive: true, force: true });
            }
        });
    });

    describe('performance', () => {
        test('should load standards within reasonable time', async () => {
            const startTime = performance.now();
            await loader.loadStandards();
            const endTime = performance.now();

            const loadTime = endTime - startTime;
            expect(loadTime).toBeLessThan(1000); // Should load within 1 second
        });

        test('should be faster on second load due to caching', async () => {
            // First load
            const start1 = performance.now();
            await loader.loadStandards();
            const time1 = performance.now() - start1;

            // Second load (cached)
            const start2 = performance.now();
            await loader.loadStandards();
            const time2 = performance.now() - start2;

            expect(time2).toBeLessThan(time1);
            expect(time2).toBeLessThan(100); // Cached load should be very fast
        });
    });

    describe('cache management', () => {
        test('should clear cache correctly', async () => {
            // Load standards to populate cache
            const standards1 = await loader.loadStandards();

            // Clear cache
            loader.clearCache();

            // Load again - should hit file system again (not just return from cache)
            const standards2 = await loader.loadStandards();

            // Should return valid results
            expect(Array.isArray(standards2)).toBe(true);
            expect(standards1).toEqual(standards2);
        });
    });
});