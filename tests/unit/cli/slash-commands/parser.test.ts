import { test, expect, describe, beforeEach } from 'bun:test';
import { SlashCommandParser } from '../../../../src/cli/slash-commands/parser.js';
import { SlashCommandType, ParseResult } from '../../../../src/cli/slash-commands/types.js';

describe('SlashCommandParser', () => {
    let parser: SlashCommandParser;

    beforeEach(() => {
        parser = new SlashCommandParser();
    });

    describe('Command Parsing', () => {
        test('should parse valid add command', () => {
            const input = '/add test-rule "console.log" "Prevent console usage"';
            const result = parser.parse(input);

            expect(result.success).toBe(true);
            expect(result.command?.type).toBe('add');
            expect((result.command as any).ruleName).toBe('test-rule');
            expect((result.command as any).pattern).toBe('console.log');
            expect((result.command as any).description).toBe('Prevent console usage');
        });

        test('should parse add command with all optional parameters', () => {
            const input = '/add complex-rule "import.*from" "Import pattern" --category style --technology javascript --severity error --tags "security,performance"';
            const result = parser.parse(input);

            expect(result.success).toBe(true);
            expect(result.command?.type).toBe('add');
            const addCmd = result.command as any;
            expect(addCmd.ruleName).toBe('complex-rule');
            expect(addCmd.pattern).toBe('import.*from');
            expect(addCmd.description).toBe('Import pattern');
            expect(addCmd.category).toBe('style');
            expect(addCmd.technology).toBe('javascript');
            expect(addCmd.severity).toBe('error');
            expect(addCmd.tags).toEqual(['security', 'performance']);
        });

        test('should parse remove command', () => {
            const input = '/remove test-rule';
            const result = parser.parse(input);

            expect(result.success).toBe(true);
            expect(result.command?.type).toBe('remove');
            expect((result.command as any).ruleName).toBe('test-rule');
        });

        test('should parse help command', () => {
            const result1 = parser.parse('/help');
            const result2 = parser.parse('/help add');

            expect(result1.success).toBe(true);
            expect(result1.command?.type).toBe('help');
            expect((result1.command as any).topic).toBeUndefined();

            expect(result2.success).toBe(true);
            expect(result2.command?.type).toBe('help');
            expect((result2.command as any).topic).toBe('add');
        });

        test('should parse unknown command', () => {
            const input = '/unknown-command arg1 arg2';
            const result = parser.parse(input);

            expect(result.success).toBe(true);
            expect(result.command?.type).toBe('unknown');
            const unknownCmd = result.command as any;
            expect(unknownCmd.command).toBe('unknown-command');
            expect(unknownCmd.args).toEqual(['arg1', 'arg2']);
        });
    });

    describe('Error Handling', () => {
        test('should reject empty input', () => {
            const result = parser.parse('');

            expect(result.success).toBe(false);
            expect(result.error?.code).toBe('EMPTY_INPUT');
            expect(result.error?.suggestions).toContain('Try `/help` for available commands');
        });

        test('should reject input without slash prefix', () => {
            const result = parser.parse('add rule "pattern" "desc"');

            expect(result.success).toBe(false);
            expect(result.error?.code).toBe('INVALID_PREFIX');
            expect(result.error?.expected).toContain('/');
        });

        test('should reject invalid add command missing required arguments', () => {
            const result = parser.parse('/add rule-name');

            expect(result.success).toBe(false);
            expect(result.error?.code).toBe('VALIDATION_ERROR');
        });

        test('should reject invalid remove command', () => {
            const result = parser.parse('/remove');

            expect(result.success).toBe(false);
            expect(result.error?.code).toBe('VALIDATION_ERROR');
        });

        test('should handle malformed quoted strings', () => {
            const result = parser.parse('/add rule "unclosed quote');

            expect(result.success).toBe(false);
            expect(result.error?.code).toBe('VALIDATION_ERROR');
        });

        test('should reject invalid severity level', () => {
            const input = '/add test "pattern" "desc" --severity invalid';
            const result = parser.parse(input);

            expect(result.success).toBe(false);
            expect(result.error?.code).toBe('VALIDATION_ERROR');
        });
    });

    describe('Edge Cases and Special Characters', () => {
        test('should handle escaped quotes in pattern', () => {
            const input = '/add quote-rule "\\"test\\"" "Handle quotes"';
            const result = parser.parse(input);

            expect(result.success).toBe(true);
            expect((result.command as any).pattern).toBe('"test"');
        });

        test('should handle special regex characters', () => {
            const input = '/add regex-rule "import\\s+.*from\\s+[\'\\"][^\'\\"]+[\'\\"]" "Import statement"';
            const result = parser.parse(input);

            expect(result.success).toBe(true);
            expect((result.command as any).pattern).toBe("import\\s+.*from\\s+['\"][^'\"]+['\"]");
        });

        test('should handle newlines and tabs in escaped strings', () => {
            const input = '/add multiline-rule "line1\\nline2\\tindented" "Multiline pattern"';
            const result = parser.parse(input);

            expect(result.success).toBe(true);
            expect((result.command as any).pattern).toBe('line1\nline2\tindented');
        });

        test('should handle rule names with hyphens and underscores', () => {
            const input = '/add rule-name_with-hyphens "pattern" "Description"';
            const result = parser.parse(input);

            expect(result.success).toBe(true);
            expect((result.command as any).ruleName).toBe('rule-name_with-hyphens');
        });
    });

    describe('Command Validation', () => {
        test('should validate add command with all required fields', () => {
            const input = '/add valid-rule "pattern" "Description"';
            const parseResult = parser.parse(input);

            expect(parseResult.success).toBe(true);
            if (parseResult.command) {
                const validationResult = parser.validate(parseResult.command);
                expect(validationResult.isValid).toBe(true);
                expect(validationResult.errors).toHaveLength(0);
            }
        });

        test('should reject add command with empty rule name', () => {
            const input = '/add "" "pattern" "Description"';
            const result = parser.parse(input);

            if (result.success && result.command) {
                const validationResult = parser.validate(result.command);
                expect(validationResult.isValid).toBe(false);
                expect(validationResult.errors).toContain('Rule name is required');
            }
        });

        test('should reject add command with empty pattern', () => {
            const input = '/add rule-name "" "Description"';
            const result = parser.parse(input);

            if (result.success && result.command) {
                const validationResult = parser.validate(result.command);
                expect(validationResult.isValid).toBe(false);
                expect(validationResult.errors).toContain('Pattern is required');
            }
        });

        test('should reject add command with empty description', () => {
            const input = '/add rule-name "pattern" ""';
            const result = parser.parse(input);

            if (result.success && result.command) {
                const validationResult = parser.validate(result.command);
                expect(validationResult.isValid).toBe(false);
                expect(validationResult.errors).toContain('Description is required');
            }
        });
    });

    describe('Suggestions', () => {
        test('should suggest all commands for empty input', () => {
            const suggestions = parser.getSuggestions('');
            expect(suggestions).toContain('/add');
            expect(suggestions).toContain('/remove');
            expect(suggestions).toContain('/help');
        });

        test('should suggest command completions for partial input', () => {
            const suggestions = parser.getSuggestions('/a');
            expect(suggestions).toContain('/add');
        });

        test('should suggest examples for complete commands', () => {
            const suggestions = parser.getSuggestions('/help');
            expect(suggestions.length).toBeGreaterThan(0);
            expect(suggestions.some(s => s.includes('/help'))).toBe(true);
        });

        test('should provide no suggestions for unknown partial commands', () => {
            const suggestions = parser.getSuggestions('/unknown');
            expect(suggestions.length).toBe(0);
        });
    });

    describe('Command Patterns', () => {
        test('should return all available command patterns', () => {
            const patterns = parser.getAvailableCommands();
            expect(patterns.length).toBe(3); // add, remove, help

            const addPattern = patterns.find(p => p.type === 'add');
            expect(addPattern?.description).toBe('Add a new standard rule');
            expect(addPattern?.examples.length).toBeGreaterThan(0);
        });

        test('should check command support', () => {
            expect(parser.isCommandSupported('add')).toBe(true);
            expect(parser.isCommandSupported('remove')).toBe(true);
            expect(parser.isCommandSupported('help')).toBe(true);
            expect(parser.isCommandSupported('unknown')).toBe(false);
        });
    });

    describe('Configuration', () => {
        test('should update parser configuration', () => {
            parser.updateConfig({
                strictMode: false,
                allowExtraArgs: true
            });

            const config = (parser as any).config;
            expect(config.strictMode).toBe(false);
            expect(config.allowExtraArgs).toBe(true);
        });

        test('should add custom command pattern', () => {
            const customPattern = {
                type: 'custom' as SlashCommandType,
                pattern: /^\/custom\s+(.+)$/,
                description: 'Custom command',
                examples: ['/custom test'],
                requiredArgs: ['arg'],
                optionalArgs: []
            };

            parser.addCustomPattern(customPattern);
            expect(parser.isCommandSupported('custom')).toBe(true);

            const result = parser.parse('/custom test');
            expect(result.success).toBe(true);
            expect(result.command?.type).toBe('custom');
        });

        test('should remove command pattern', () => {
            parser.removePattern('help');
            expect(parser.isCommandSupported('help')).toBe(false);

            const result = parser.parse('/help');
            expect(result.command?.type).toBe('unknown');
        });
    });

    describe('Performance', () => {
        test('should parse commands quickly', () => {
            const start = Date.now();

            for (let i = 0; i < 1000; i++) {
                parser.parse('/add test-rule "pattern" "Description"');
            }

            const duration = Date.now() - start;
            expect(duration).toBeLessThan(100); // Should be very fast, less than 100ms for 1000 parses
        });

        test('should handle large input efficiently', () => {
            const longPattern = 'a'.repeat(1000);
            const input = `/add long-rule "${longPattern}" "Long pattern test"`;

            const start = Date.now();
            const result = parser.parse(input);
            const duration = Date.now() - start;

            expect(result.success).toBe(true);
            expect(duration).toBeLessThan(50); // Should handle long patterns quickly
        });
    });
});