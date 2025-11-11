import { test, expect, describe, beforeEach } from 'bun:test';
import { SlashCommandParser } from '../../src/cli/slash-commands/parser.js';
import { createParseResult } from '../support/factories/slash-command-factory';

// Test ID: 3.2-E2E-001 - Slash Command Parser Functionality
describe('3.2-E2E-001: Slash Command Parser', () => {
  let parser: SlashCommandParser;

  beforeEach(() => {
    parser = new SlashCommandParser();
  });

  // Test ID: 3.2-E2E-001-01 - Command Parsing Core Functionality
  describe('3.2-E2E-001-01: Command Parsing Core Functionality', () => {
    test('3.2-E2E-001-01-01: should parse valid add command with quoted parameters', () => {
      // GIVEN: Valid add command with quoted parameters following AC1 requirements
      const input = '/add no-console "no-console" "Disallow console statements"';

      // WHEN: Parsing the command through the slash command parser
      const result = parser.parse(input);

      // THEN: Should extract command and all parameters correctly with no errors
      expect(result.success).toBe(true);
      expect(result.command?.type).toBe('add');
      expect((result.command as any).ruleName).toBe('no-console');
      expect((result.command as any).pattern).toBe('no-console');
      expect((result.command as any).description).toBe('Disallow console statements');
      expect(result.error).toBeUndefined();
    });

    test('3.2-E2E-001-01-02: should parse valid remove command', () => {
      // GIVEN: Valid remove command following AC2 requirements
      const input = '/remove no-console';

      // WHEN: Parsing the remove command
      const result = parser.parse(input);

      // THEN: Should extract command and target name correctly
      expect(result.success).toBe(true);
      expect(result.command?.type).toBe('remove');
      expect((result.command as any).ruleName).toBe('no-console');
      expect(result.error).toBeUndefined();
    });

    test('3.2-E2E-001-01-03: should parse help command', () => {
      // GIVEN: Help command following AC5 requirements
      const input = '/help';

      // WHEN: Parsing the help command
      const result = parser.parse(input);

      // THEN: Should identify help command with no parameters required
      expect(result.success).toBe(true);
      expect(result.command?.type).toBe('help');
      expect(result.error).toBeUndefined();
    });

    test('should return errors for missing required parameters', () => {
      // GIVEN: Add command missing required parameters (violates AC3)
      const input = '/add';

      // WHEN: Parsing the incomplete command
      const result = parser.parse(input);

      // THEN: Should return validation error for known command with invalid syntax
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('VALIDATION_ERROR');
      expect(result.error?.message).toContain('Invalid syntax for /add command');
      expect(result.command).toBeUndefined();
    });

    test('should handle malformed quoted strings', () => {
      // GIVEN: Command with unclosed quotes
      const input = '/add test "unclosed-quote';

      // WHEN: Parsing command
      const result = parser.parse(input);

      // THEN: Should return validation error for known command with malformed syntax
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('VALIDATION_ERROR');
      expect(result.error?.message).toContain('Invalid syntax for /add command');
      expect(result.command).toBeUndefined();
    });

    test('should handle unknown commands', () => {
      // GIVEN: Unknown command
      const input = '/unknown-command';

      // WHEN: Parsing command
      const result = parser.parse(input);

      // THEN: Should return unknown command
      expect(result.success).toBe(true);
      expect(result.command?.type).toBe('unknown');
      expect((result.command as any).command).toBe('unknown-command');
      expect(result.error).toBeUndefined();
    });
  });

  // Test ID: 3.2-E2E-001-03 - Command Validation Logic
  describe('3.2-E2E-001-03: Command Validation Logic', () => {
    test('3.2-E2E-001-03-01: should validate add command parameters', () => {
      // GIVEN: Valid add command parameters with all required fields
      const command = {
        type: 'add',
        rawInput: '/add test-rule "/pattern" "Test description"',
        originalInput: '/add test-rule "/pattern" "Test description"',
        ruleName: 'test-rule',
        pattern: '/pattern',
        description: 'Test description'
      };

      // WHEN: Validating the command structure and parameters
      const result = parser.validate(command);

      // THEN: Should pass validation with no errors
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('3.2-E2E-001-03-02: should reject invalid parameter types', () => {
      // GIVEN: Invalid parameter types including empty strings and wrong data types
      const command = {
        type: 'add',
        rawInput: '/add test-rule "/pattern" "Test description"',
        originalInput: '/add test-rule "/pattern" "Test description"',
        ruleName: '', // empty name string
        pattern: '', // empty pattern string
        description: 123 as any // number instead of string
      };

      // WHEN: Validating the malformed command parameters
      const result = parser.validate(command);

      // THEN: Should fail validation with specific type and content errors
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Rule name is required');
      expect(result.errors).toContain('Pattern is required');
      expect(result.errors).toContain('Description is required');
      expect(result.errors.length).toBeGreaterThan(2); // Should have multiple validation errors
    });

    test('3.2-E2E-001-03-03: should validate remove command parameters', () => {
      // GIVEN: Valid remove command with required name parameter
      const command = {
        type: 'remove',
        rawInput: '/remove existing-rule',
        originalInput: '/remove existing-rule',
        ruleName: 'existing-rule'
      };

      // WHEN: Validating the remove command structure
      const result = parser.validate(command);

      // THEN: Should pass validation with no errors
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('3.2-E2E-001-03-04: should reject remove command with missing name', () => {
      // GIVEN: Remove command missing the required name parameter
      const command = {
        type: 'remove',
        rawInput: '/remove',
        originalInput: '/remove',
        ruleName: '' // empty name
      };

      // WHEN: Validating the incomplete remove command
      const result = parser.validate(command);

      // THEN: Should fail validation with specific missing parameter error
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Rule name is required');
    });

    test('3.2-E2E-001-03-05: should reject remove command with empty name', () => {
      // GIVEN: Remove command with empty name parameter
      const command = {
        type: 'remove',
        rawInput: '/remove',
        originalInput: '/remove',
        ruleName: '' // Empty name string
      };

      // WHEN: Validating the remove command with empty name
      const result = parser.validate(command);

      // THEN: Should fail validation with empty name error
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Rule name is required');
    });
  });

  // Test ID: 3.2-E2E-001-02 - Error Handling and Validation
  describe('3.2-E2E-001-02: Error Handling and Validation (AC3)', () => {
    test('3.2-E2E-001-02-01: should handle malformed quoted strings', () => {
      // GIVEN: Command with unclosed quotes causing syntax error
      const input = '/add test "unclosed-quote';

      // WHEN: Parsing the malformed command
      const result = parser.parse(input);

      // THEN: Should return validation error for known command with malformed syntax
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('VALIDATION_ERROR');
      expect(result.error?.message).toContain('Invalid syntax for /add command');
      expect(result.command).toBeUndefined();
    });

    test('3.2-E2E-001-02-02: should handle unknown commands with help suggestion', () => {
      // GIVEN: Unknown command not in supported command set
      const input = '/unknown-command';

      // WHEN: Parsing the unknown command
      const result = parser.parse(input);

      // THEN: Should return unknown command
      expect(result.success).toBe(true);
      expect(result.command?.type).toBe('unknown');
      expect((result.command as any).command).toBe('unknown-command');
      expect(result.error).toBeUndefined();
    });

    test('3.2-E2E-001-02-03: should handle remove command with missing name parameter', () => {
      // GIVEN: Remove command without required name parameter
      const input = '/remove';

      // WHEN: Parsing the incomplete remove command
      const result = parser.parse(input);

      // THEN: Should return validation error for known command with invalid syntax
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('VALIDATION_ERROR');
      expect(result.error?.message).toContain('Invalid syntax for /remove command');
      expect(result.command).toBeUndefined();
    });

    test('3.2-E2E-001-02-04: should handle add command with partially missing parameters', () => {
      // GIVEN: Add command with only name, missing pattern and description
      const input = '/add test-rule';

      // WHEN: Parsing the incomplete add command
      const result = parser.parse(input);

      // THEN: Should return validation error for known command with insufficient parameters
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('VALIDATION_ERROR');
      expect(result.error?.message).toContain('Invalid syntax for /add command');
      expect(result.command).toBeUndefined();
    });

    test('3.2-E2E-001-02-05: should handle empty command input', () => {
      // GIVEN: Empty or whitespace-only command input
      const input = '';

      // WHEN: Parsing the empty input
      const result = parser.parse(input);

      // THEN: Should return empty input error
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('EMPTY_INPUT');
      expect(result.error?.message).toBe('Input cannot be empty');
      expect(result.command).toBeUndefined();
    });

    test('3.2-E2E-001-02-06: should handle commands with special characters in parameters', () => {
      // GIVEN: Add command with special characters - using correct format (unquoted rule name)
      const input = '/add special-rule "/path/[a-z]+/" "Rule for special chars"';

      // WHEN: Parsing the command with special characters
      const result = parser.parse(input);

      // THEN: Should correctly handle quoted special characters
      expect(result.success).toBe(true);
      expect(result.command?.type).toBe('add');
      expect((result.command as any).ruleName).toBe('special-rule');
      expect((result.command as any).pattern).toBe('/path/[a-z]+/');
      expect((result.command as any).description).toBe('Rule for special chars');
      expect(result.error).toBeUndefined();
    });

    test('3.2-E2E-001-02-07: should handle nested quotes in description parameter', () => {
      // GIVEN: Add command with quotes inside the description - using string concatenation to avoid escaping issues
      const input = '/add quote-rule "/quote/" "This handles \\"quoted text\\" properly"';

      // WHEN: Parsing the command with nested quotes
      const result = parser.parse(input);

      // THEN: Should properly handle escaped quotes
      expect(result.success).toBe(true);
      expect(result.command?.type).toBe('add');
      expect((result.command as any).ruleName).toBe('quote-rule');
      expect((result.command as any).pattern).toBe('/quote/');
      expect((result.command as any).description).toBe('This handles "quoted text" properly');
      expect(result.error).toBeUndefined();
    });
  });
});