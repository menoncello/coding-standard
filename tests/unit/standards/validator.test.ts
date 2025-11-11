import { test, describe, expect, beforeEach } from 'bun:test';
import { StandardValidator } from '../../../src/standards/validator.js';
import { StandardRule } from '../../../src/standards/types.js';

describe('StandardValidator', () => {
    let validator: StandardValidator;

    beforeEach(() => {
        validator = new StandardValidator();
    });

    const createValidRule = (overrides: Partial<StandardRule> = {}): StandardRule => ({
        id: 'test-rule-id',
        semanticName: 'test-rule',
        displayName: 'Test Rule',
        description: 'This is a test rule that meets all validation requirements',
        category: 'naming',
        technology: 'typescript',
        pattern: '^[A-Z][a-zA-Z0-9]*$',
        severity: 'error',
        tags: ['convention', 'linting'],
        examples: [{
            valid: ['TestClass', 'AnotherClass'],
            invalid: ['testClass', 'another_class'],
            description: 'Class naming example'
        }],
        relatedRules: [],
        aliases: ['test-rule-alias'],
        deprecated: false,
        metadata: {
            createdAt: Date.now(),
            updatedAt: Date.now(),
            version: '1.0.0'
        },
        ...overrides
    });

    describe('Rule Validation', () => {
        test('should validate a complete valid rule', () => {
            const rule = createValidRule();
            const result = validator.validateRule(rule);

            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        test('should detect missing required fields', () => {
            const rule = createValidRule({
                semanticName: '',
                displayName: '',
                description: '',
                category: '',
                technology: '',
                pattern: '',
                severity: undefined
            });

            const result = validator.validateRule(rule);

            expect(result.isValid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);

            const errorFields = result.errors.map(e => e.field);
            expect(errorFields).toContain('semanticName');
            expect(errorFields).toContain('displayName');
            expect(errorFields).toContain('description');
            expect(errorFields).toContain('category');
            expect(errorFields).toContain('technology');
            expect(errorFields).toContain('severity');
        });

        test('should validate semantic name format', () => {
            const testCases = [
                { semanticName: '', valid: false },
                { semanticName: 'a', valid: false }, // Too short
                { semanticName: 'ab', valid: true }, // Minimum length
                { semanticName: 'valid-name', valid: true },
                { semanticName: 'valid-name-123', valid: true },
                { semanticName: 'Invalid-Name', valid: false }, // Uppercase first letter
                { semanticName: 'invalid_name', valid: false }, // Underscore not allowed
                { semanticName: 'invalid name', valid: false }, // Space not allowed
                { semanticName: '123invalid', valid: false }, // Cannot start with number
                { semanticName: 'invalid-', valid: true }, // Ends with hyphen (warning only)
                { semanticName: 'a'.repeat(51), valid: false } // Too long
            ];

            for (const testCase of testCases) {
                const rule = createValidRule({ semanticName: testCase.semanticName });
                const result = validator.validateRule(rule);

                if (testCase.valid) {
                    if (testCase.semanticName.endsWith('-')) {
                        // Should be valid but with warning
                        expect(result.isValid).toBe(true);
                        expect(result.errors.filter(e => e.field === 'semanticName')).toHaveLength(0);
                        expect(result.warnings.some(w => w.field === 'semanticName' && w.code === 'STYLE_WARNING')).toBe(true);
                    } else {
                        expect(result.isValid).toBe(true);
                        expect(result.errors.filter(e => e.field === 'semanticName')).toHaveLength(0);
                    }
                } else {
                    expect(result.isValid).toBe(false);
                    expect(result.errors.some(e => e.field === 'semanticName')).toBe(true);
                }
            }
        });

        test('should validate display name length', () => {
            const testCases = [
                { displayName: 'ab', valid: false }, // Too short
                { displayName: 'abc', valid: true }, // Minimum length
                { displayName: 'a'.repeat(100), valid: true }, // Maximum length
                { displayName: 'a'.repeat(101), valid: false } // Too long
            ];

            for (const testCase of testCases) {
                const rule = createValidRule({ displayName: testCase.displayName });
                const result = validator.validateRule(rule);

                if (testCase.valid) {
                    expect(result.errors.filter(e => e.field === 'displayName')).toHaveLength(0);
                } else {
                    expect(result.errors.some(e => e.field === 'displayName')).toBe(true);
                }
            }
        });

        test('should validate description length', () => {
            const testCases = [
                { description: 'short', valid: false }, // Too short
                { description: 'a'.repeat(10), valid: true }, // Minimum length
                { description: 'a'.repeat(1000), valid: true }, // Maximum length (warning only)
                { description: 'a'.repeat(1001), valid: false } // Too long
            ];

            for (const testCase of testCases) {
                const rule = createValidRule({ description: testCase.description });
                const result = validator.validateRule(rule);

                if (testCase.valid) {
                    if (testCase.description.length > 1000) {
                        expect(result.warnings.some(w => w.field === 'description' && w.code === 'LENGTH_WARNING')).toBe(true);
                    }
                    expect(result.errors.filter(e => e.field === 'description')).toHaveLength(0);
                } else {
                    expect(result.errors.some(e => e.field === 'description')).toBe(true);
                }
            }
        });

        test('should validate category', () => {
            const rule = createValidRule({ category: 'unknown-category' });
            const result = validator.validateRule(rule);

            expect(result.isValid).toBe(true); // Should be valid but with warning
            expect(result.errors.filter(e => e.field === 'category')).toHaveLength(0);
            expect(result.warnings.some(w => w.field === 'category' && w.code === 'UNRECOGNIZED_VALUE')).toBe(true);
        });

        test('should validate technology', () => {
            const rule = createValidRule({ technology: 'unknown-technology' });
            const result = validator.validateRule(rule);

            expect(result.isValid).toBe(true); // Should be valid but with warning
            expect(result.errors.filter(e => e.field === 'technology')).toHaveLength(0);
            expect(result.warnings.some(w => w.field === 'technology' && w.code === 'UNRECOGNIZED_VALUE')).toBe(true);
        });

        test('should validate severity', () => {
            const validSeverities: StandardRule['severity'][] = ['error', 'warning', 'info'];
            for (const severity of validSeverities) {
                const rule = createValidRule({ severity });
                const result = validator.validateRule(rule);
                expect(result.errors.filter(e => e.field === 'severity')).toHaveLength(0);
            }

            const invalidRule = createValidRule({ severity: 'invalid' as any });
            const invalidResult = validator.validateRule(invalidRule);
            expect(invalidResult.errors.some(e => e.field === 'severity')).toBe(true);
        });

        test('should validate tags', () => {
            const ruleWithInvalidTags = createValidRule({
                tags: ['valid-tag', 123 as any, 'another-tag']
            });
            const result = validator.validateRule(ruleWithInvalidTags);

            expect(result.isValid).toBe(false);
            expect(result.errors.some(e => e.field === 'tags' && e.code === 'INVALID_TYPE')).toBe(true);
        });

        test('should validate examples structure', () => {
            const ruleWithInvalidExamples = createValidRule({
                examples: [{
                    valid: ['valid'],
                    invalid: 'not-an-array' as any,
                    description: 'description'
                }]
            });
            const result = validator.validateRule(ruleWithInvalidExamples);

            expect(result.isValid).toBe(false);
            expect(result.errors.some(e => e.field.includes('examples') && e.code === 'INVALID_TYPE')).toBe(true);
        });

        test('should validate metadata', () => {
            const ruleWithInvalidMetadata = createValidRule({
                metadata: {
                    createdAt: -1, // Invalid timestamp
                    updatedAt: Date.now(),
                    version: ''
                }
            });
            const result = validator.validateRule(ruleWithInvalidMetadata);

            expect(result.isValid).toBe(false);
            expect(result.errors.some(e => e.field === 'metadata.createdAt')).toBe(true);
            expect(result.errors.some(e => e.field === 'metadata.version')).toBe(true);
        });

        test('should warn about timestamp order', () => {
            const now = Date.now();
            const ruleWithWrongTimestampOrder = createValidRule({
                metadata: {
                    createdAt: now,
                    updatedAt: now - 1000, // Updated before created
                    version: '1.0.0'
                }
            });
            const result = validator.validateRule(ruleWithWrongTimestampOrder);

            expect(result.isValid).toBe(true);
            expect(result.warnings.some(w => w.field === 'metadata.updatedAt' && w.code === 'TIMESTAMP_ORDER')).toBe(true);
        });
    });

    describe('Pattern Validation', () => {
        test('should validate valid regex patterns', () => {
            const validPatterns = [
                '^[A-Z][a-zA-Z0-9]*$',
                '^[a-z][a-zA-Z0-9]*$',
                '^test-[a-z]+$',
                '^[0-9]+\\.[0-9]+$',
                '^(https?|ftp)://[^\\s/$.?#].[^\\s]*$'
            ];

            for (const pattern of validPatterns) {
                const result = validator.validatePattern(pattern);
                expect(result.isValid).toBe(true);
                expect(result.errors).toHaveLength(0);
            }
        });

        test('should reject invalid regex patterns', () => {
            const invalidPatterns = [
                '[unclosed bracket',
                '(unclosed parenthesis',
                '{unclosed brace',
                'invalid escape\\',
                '*quantifier at start',
                '+quantifier at start',
                '?quantifier at start'
            ];

            for (const pattern of invalidPatterns) {
                const result = validator.validatePattern(pattern);
                expect(result.isValid).toBe(false);
                expect(result.errors.length).toBeGreaterThan(0);
                expect(result.errors[0].code).toBe('INVALID_REGEX');
            }
        });

        test('should warn about complex patterns', () => {
            const complexPattern = '(?:(?=(?:[A-Za-z0-9]+\\.)+[A-Za-z]{2,6})(?:[A-Za-z0-9]+\\.)+[A-Za-z]{2,6})$';
            const result = validator.validatePattern(complexPattern);

            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
            expect(result.warnings.length).toBeGreaterThan(0);
        });

        test('should warn about potential catastrophic backtracking', () => {
            const patternsWithBacktracking = [
                '^(a+)+$',
                '^(a+)*b$',
                '(a+)+b',
                '^(a+)*$'
            ];

            for (const pattern of patternsWithBacktracking) {
                const result = validator.validatePattern(pattern);
                expect(result.isValid).toBe(true);
                expect(result.errors).toHaveLength(0);
                expect(result.warnings.some(w => w.code === 'CATASTROPHIC_BACKTRACKING')).toBe(true);
            }
        });

        test('should calculate pattern complexity', () => {
            const simplePattern = '^[A-Z][a-z]*$';
            const complexPattern = '^(?:(?:https?|ftp)://)?(?:[a-z0-9-]+\\.)+[a-z]{2,}(?:/[^\\s]*)?$';

            const simpleResult = validator.validatePattern(simplePattern);
            const complexResult = validator.validatePattern(complexPattern);

            expect(simpleResult.isValid).toBe(true);
            expect(complexResult.isValid).toBe(true);

            // Complex pattern should generate complexity warnings
            if (complexResult.warnings.length > 0) {
                expect(complexResult.warnings.some(w => w.code === 'HIGH_COMPLEXITY')).toBe(true);
            }
        });
    });

    describe('Conflict Detection', () => {
        test('should detect semantic name conflicts', () => {
            const existingRule = createValidRule({ semanticName: 'existing-rule' });
            const newRule = createValidRule({
                id: 'different-id',
                semanticName: 'existing-rule' // Same semantic name
            });

            const conflicts = validator.detectConflicts(newRule, [existingRule]);
            expect(conflicts).toHaveLength(1);
            expect(conflicts[0].type).toBe('semantic_name');
            expect(conflicts[0].conflictingValue).toBe('existing-rule');
        });

        test('should detect pattern conflicts', () => {
            const existingRule = createValidRule({ pattern: '^[A-Z][a-zA-Z0-9]*$' });
            const newRule = createValidRule({
                id: 'different-id',
                semanticName: 'different-rule',
                pattern: '^[A-Z][a-zA-Z0-9]*$' // Same pattern
            });

            const conflicts = validator.detectConflicts(newRule, [existingRule]);
            expect(conflicts).toHaveLength(1);
            expect(conflicts[0].type).toBe('pattern');
            expect(conflicts[0].conflictingValue).toBe('^[A-Z][a-zA-Z0-9]*$');
        });

        test('should detect alias conflicts', () => {
            const existingRule = createValidRule({ aliases: ['conflicting-alias'] });
            const newRule = createValidRule({
                id: 'different-id',
                semanticName: 'different-rule',
                aliases: ['conflicting-alias'] // Same alias
            });

            const conflicts = validator.detectConflicts(newRule, [existingRule]);
            expect(conflicts).toHaveLength(1);
            expect(conflicts[0].type).toBe('alias');
            expect(conflicts[0].conflictingValue).toBe('conflicting-alias');
        });

        test('should detect alias conflicts with semantic names', () => {
            const existingRule = createValidRule({ semanticName: 'existing-semantic' });
            const newRule = createValidRule({
                id: 'different-id',
                semanticName: 'different-rule',
                aliases: ['existing-semantic'] // Alias matches existing semantic name
            });

            const conflicts = validator.detectConflicts(newRule, [existingRule]);
            expect(conflicts).toHaveLength(1);
            expect(conflicts[0].type).toBe('alias');
            expect(conflicts[0].conflictingValue).toBe('existing-semantic');
        });

        test('should skip self-comparison', () => {
            const rule = createValidRule({ id: 'same-id' });
            const conflicts = validator.detectConflicts(rule, [rule]);
            expect(conflicts).toHaveLength(0);
        });

        test('should detect multiple conflicts', () => {
            const existingRule = createValidRule({
                semanticName: 'conflicting-semantic',
                pattern: '^[A-Z][a-zA-Z0-9]*$',
                aliases: ['conflicting-alias']
            });
            const newRule = createValidRule({
                id: 'different-id',
                semanticName: 'conflicting-semantic',
                pattern: '^[A-Z][a-zA-Z0-9]*$',
                aliases: ['conflicting-alias']
            });

            const conflicts = validator.detectConflicts(newRule, [existingRule]);
            expect(conflicts.length).toBeGreaterThan(1);
            expect(conflicts.some(c => c.type === 'semantic_name')).toBe(true);
            expect(conflicts.some(c => c.type === 'pattern')).toBe(true);
            expect(conflicts.some(c => c.type === 'alias')).toBe(true);
        });
    });

    describe('Metadata Validation', () => {
        test('should validate complete metadata', () => {
            const metadata = {
                createdAt: Date.now(),
                updatedAt: Date.now(),
                version: '1.0.0',
                customFields: { field1: 'value1', field2: 123 }
            };

            const result = validator.validateMetadata(metadata);
            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        test('should reject invalid timestamps', () => {
            const invalidMetadata = {
                createdAt: 'not-a-number' as any,
                updatedAt: -1,
                version: '1.0.0'
            };

            const result = validator.validateMetadata(invalidMetadata);
            expect(result.isValid).toBe(false);
            expect(result.errors.some(e => e.field === 'metadata.createdAt')).toBe(true);
            expect(result.errors.some(e => e.field === 'metadata.updatedAt')).toBe(true);
        });

        test('should reject missing version', () => {
            const invalidMetadata = {
                createdAt: Date.now(),
                updatedAt: Date.now(),
                version: ''
            };

            const result = validator.validateMetadata(invalidMetadata);
            expect(result.isValid).toBe(false);
            expect(result.errors.some(e => e.field === 'metadata.version')).toBe(true);
        });

        test('should reject invalid custom fields type', () => {
            const invalidMetadata = {
                createdAt: Date.now(),
                updatedAt: Date.now(),
                version: '1.0.0',
                customFields: 'not-an-object' as any
            };

            const result = validator.validateMetadata(invalidMetadata);
            expect(result.isValid).toBe(false);
            expect(result.errors.some(e => e.field === 'metadata.customFields')).toBe(true);
        });
    });

    describe('Integration Tests', () => {
        test('should validate complete rule with all checks', () => {
            const existingRules = [
                createValidRule({
                    id: 'existing-1',
                    semanticName: 'existing-rule',
                    pattern: '^[A-Z][a-zA-Z0-9]*$'
                })
            ];

            const newRule = createValidRule({
                id: 'new-rule',
                semanticName: 'existing-rule', // Conflict!
                pattern: '^[A-Z][a-zA-Z0-9]*$', // Same pattern!
                displayName: 'Ne', // Too short
                description: 'Too short'
            });

            const result = validator.validateRule(newRule, existingRules);

            expect(result.isValid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(2);
            expect(result.errors.some(e => e.code === 'CONFLICT')).toBe(true);
            expect(result.errors.some(e => e.field === 'displayName')).toBe(true);
            expect(result.errors.some(e => e.field === 'description')).toBe(true);
        });

        test('should pass validation for a perfect rule', () => {
            const perfectRule = createValidRule({
                semanticName: 'perfect-typescript-class-naming',
                displayName: 'TypeScript Class Naming Convention',
                description: 'Enforces PascalCase naming for TypeScript classes to ensure consistency and readability across the codebase.',
                category: 'naming',
                technology: 'typescript',
                pattern: '^[A-Z][a-zA-Z0-9]*$',
                severity: 'error',
                tags: ['convention', 'linting', 'typescript', 'class'],
                examples: [{
                    valid: ['UserService', 'HttpClient', 'ConfigManager'],
                    invalid: ['userService', 'http_client', 'config-manager'],
                    description: 'Class names should use PascalCase and be descriptive'
                }],
                relatedRules: [],
                aliases: ['ts-class-naming', 'typescript-class'],
                deprecated: false,
                metadata: {
                    createdAt: Date.now() - 86400000, // 1 day ago
                    updatedAt: Date.now(),
                    version: '2.1.0',
                    createdBy: 'standards-team',
                    validationStatus: 'validated'
                }
            });

            const result = validator.validateRule(perfectRule);
            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });
    });
});