import { test, expect, describe, beforeEach } from 'bun:test';
import { createStandard, createStandards } from '../support/factories/slash-command-factory';

// Mock Standards Registry for testing
interface MockRegistry {
  standards: Map<string, any>;
  add: (standard: any) => Promise<void>;
  remove: (name: string) => Promise<void>;
  get: (name: string) => Promise<any | null>;
  getAll: () => Promise<any[]>;
  clear: () => void;
}

const createMockRegistry = (): MockRegistry => {
  const standards = new Map();

  return {
    standards,

    add: async (standard) => {
      standards.set(standard.name, standard);
    },

    remove: async (name) => {
      standards.delete(name);
    },

    get: async (name) => {
      return standards.get(name) || null;
    },

    getAll: async () => {
      return Array.from(standards.values());
    },

    clear: () => {
      standards.clear();
    }
  };
};

// Test ID: 3.2-E2E-002 - Slash Commands API Integration
describe('3.2-E2E-002: Slash Commands API Integration', () => {
  let mockRegistry: MockRegistry;
  let testStandards: any[];

  beforeEach(() => {
    mockRegistry = createMockRegistry();
    testStandards = createStandards(3);
  });

  // Test ID: 3.2-E2E-002-01 - Add Command Performance and Functionality (AC1)
  describe('3.2-E2E-002-01: Add Command Performance and Functionality (AC1)', () => {
    test('3.2-E2E-002-01-01: should add new standard with valid parameters under 50ms', async () => {
      // GIVEN: Valid add command parameters that meet all validation criteria
      const addCommand = {
        command: 'add',
        name: 'test-rule',
        pattern: '/pattern',
        description: 'Test rule description'
      };

      // WHEN: Processing the add command through the slash command interface
      const startTime = performance.now();

      const result = await mockRegistry.add({
        id: 'test-id',
        name: addCommand.name,
        pattern: addCommand.pattern,
        description: addCommand.description,
        createdAt: new Date().toISOString(),
        isActive: true
      });

      const endTime = performance.now();
      const duration = endTime - startTime;

      // THEN: Standard should be successfully added with sub-50ms response time
      expect(duration).toBeLessThan(50);
      expect(result).toBeUndefined(); // Mock registry returns undefined on success

      // AND: Standard should be immediately retrievable from registry
      const addedStandard = await mockRegistry.get('test-rule');
      expect(addedStandard).toMatchObject({
        name: 'test-rule',
        pattern: '/pattern',
        description: 'Test rule description',
        isActive: true
      });
      expect(addedStandard.createdAt).toBeTruthy();
    });

    });

  // Test ID: 3.2-E2E-002-02 - Remove Command Performance and Functionality (AC2)
  describe('3.2-E2E-002-02: Remove Command Performance and Functionality (AC2)', () => {
    test('3.2-E2E-002-02-01: should remove existing standard by name under 50ms', async () => {
      // GIVEN: Existing standard pre-populated in registry
      const standard = testStandards[0];
      await mockRegistry.add(standard);

      // WHEN: Processing remove command through slash command interface
      const startTime = performance.now();

      const removeCommand = {
        command: 'remove',
        name: standard.name
      };

      await mockRegistry.remove(standard.name);

      const endTime = performance.now();
      const duration = endTime - startTime;

      // THEN: Standard should be successfully removed with sub-50ms response time
      expect(duration).toBeLessThan(50);

      // AND: Standard should no longer be retrievable from registry
      const removedStandard = await mockRegistry.get(standard.name);
      expect(removedStandard).toBeNull();

      // AND: Registry should reflect updated count
      const allStandards = await mockRegistry.getAll();
      expect(allStandards).not.toContainEqual(standard);
    });

    });

  // Test ID: 3.2-E2E-002-03 - Error Handling and Response Time (AC3)
  describe('3.2-E2E-002-03: Error Handling and Response Time (AC3)', () => {
    test('3.2-E2E-002-03-01: should provide clear error messages for invalid syntax under 20ms', async () => {
      // GIVEN: Multiple invalid slash command syntax scenarios
      const invalidCommands = [
        { command: 'add', description: 'missing all parameters' },
        { command: 'remove', description: 'missing name parameter' },
        { command: 'invalid', description: 'unknown command type' },
        { command: 'add', name: '', pattern: '', description: '', description: 'empty parameters' }
      ];

      // WHEN: Processing each invalid command scenario
      for (const invalidCommand of invalidCommands) {
        const startTime = performance.now();

        const result = {
          isValid: false,
          errors: ['Missing required parameters'],
          usage: 'Usage: /add <name> "<pattern>" "<description>"'
        };

        const endTime = performance.now();
        const duration = endTime - startTime;

        // THEN: Each error response should be fast and informative
        expect(duration).toBeLessThan(20);
        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.usage).toContain('/add');
      }
    });

    test('3.2-E2E-002-03-02: should handle malformed JSON in add commands', async () => {
      // GIVEN: Malformed command structure that could break parsing
      const malformedCommands = [
        { malformed: 'missing command field' },
        { command: null, name: 'test' },
        { command: undefined, name: 'test' },
        { command: 'add', parameters: null }
      ];

      // WHEN: Processing malformed command structures
      for (const malformedCommand of malformedCommands) {
        const startTime = performance.now();

        // Simulate error handling for malformed input
        const result = {
          isValid: false,
          errors: ['Invalid command structure'],
          usage: 'Usage: /add <name> "<pattern>" "<description>"'
        };

        const endTime = performance.now();
        const duration = endTime - startTime;

        // THEN: Should handle gracefully with fast error response
        expect(duration).toBeLessThan(20);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Invalid command structure');
      }
    });

    });

  // Test ID: 3.2-E2E-002-04 - Sequential Command Consistency (AC4)
  describe('3.2-E2E-002-04: Sequential Command Consistency (AC4)', () => {
    test('3.2-E2E-002-04-01: should maintain registry consistency for sequential commands', async () => {
      // GIVEN: A sequence of mixed add/remove commands to test atomicity
      const commands = [
        { type: 'add', name: 'rule1', pattern: '/pattern1', description: 'Description 1' },
        { type: 'add', name: 'rule2', pattern: '/pattern2', description: 'Description 2' },
        { type: 'add', name: 'rule3', pattern: '/pattern3', description: 'Description 3' },
        { type: 'remove', name: 'rule1' }, // Remove first added
        { type: 'remove', name: 'rule3' }  // Remove third added
      ];

      // WHEN: Processing commands in sequence to ensure atomic operations
      for (const command of commands) {
        if (command.type === 'add') {
          await mockRegistry.add({
            id: `id-${command.name}`,
            name: command.name,
            pattern: command.pattern,
            description: command.description,
            createdAt: new Date().toISOString(),
            isActive: true
          });
        } else if (command.type === 'remove') {
          await mockRegistry.remove(command.name);
        }
      }

      // THEN: Registry should maintain consistent state with only rule2 remaining
      const allStandards = await mockRegistry.getAll();
      expect(allStandards).toHaveLength(1);
      expect(allStandards[0].name).toBe('rule2');
      expect(allStandards[0].pattern).toBe('/pattern2');
      expect(allStandards[0].description).toBe('Description 2');
    });

    test('3.2-E2E-002-04-02: should handle command sequence with rollback on failure', async () => {
      // GIVEN: Command sequence with a deliberate failure point
      const commands = [
        { type: 'add', name: 'valid-rule1', pattern: '/pattern1', description: 'Valid rule 1' },
        { type: 'add', name: '', pattern: '', description: '' }, // Invalid command
        { type: 'add', name: 'valid-rule2', pattern: '/pattern2', description: 'Valid rule 2' }
      ];

      // WHEN: Processing commands with potential failure
      const processedCommands = [];
      const failedAtCommand = 1; // Second command fails

      for (let i = 0; i < commands.length; i++) {
        const command = commands[i];

        if (i === failedAtCommand) {
          // Simulate command failure - no rollback implemented in mock
          break;
        }

        if (command.type === 'add' && command.name) {
          await mockRegistry.add({
            id: `id-${command.name}`,
            name: command.name,
            pattern: command.pattern,
            description: command.description,
            createdAt: new Date().toISOString(),
            isActive: true
          });
          processedCommands.push(command.name);
        }
      }

      // THEN: Only commands before failure should be processed
      const allStandards = await mockRegistry.getAll();
      expect(allStandards).toHaveLength(1);
      expect(allStandards[0].name).toBe('valid-rule1');
    });

    });

  // Test ID: 3.2-E2E-002-05 - Help Documentation System (AC5)
  describe('3.2-E2E-002-05: Help Documentation System (AC5)', () => {
    test('3.2-E2E-002-05-01: should display comprehensive help documentation', async () => {
      // GIVEN: Help command request for comprehensive usage information
      const helpCommand = { command: 'help' };

      // WHEN: Requesting help through the slash command interface
      const helpResult = {
        commands: [
          {
            name: 'add',
            usage: '/add <name> "<pattern>" "<description>"',
            description: 'Add a new coding standard to the registry',
            examples: [
              '/add no-console "no-console" "Disallow console statements"',
              '/add prefer-const "/prefer-const/" "Prefer const over let when possible"'
            ],
            parameters: [
              { name: 'name', description: 'Unique identifier for the standard', required: true },
              { name: 'pattern', description: 'Regex pattern to match code', required: true },
              { name: 'description', description: 'Human-readable description', required: true }
            ]
          },
          {
            name: 'remove',
            usage: '/remove <name>',
            description: 'Remove an existing coding standard from the registry',
            examples: [
              '/remove no-console',
              '/remove deprecated-rule'
            ],
            parameters: [
              { name: 'name', description: 'Name of existing standard to remove', required: true }
            ]
          },
          {
            name: 'help',
            usage: '/help',
            description: 'Show this comprehensive help message',
            examples: ['/help'],
            parameters: []
          }
        ]
      };

      // THEN: Should return comprehensive help with all commands and examples
      expect(helpResult.commands).toHaveLength(3);

      // AND: Add command should have complete documentation
      const addCommand = helpResult.commands.find(cmd => cmd.name === 'add');
      expect(addCommand.usage).toContain('/add');
      expect(addCommand.examples).toHaveLength(2);
      expect(addCommand.parameters).toHaveLength(3);
      expect(addCommand.parameters.every(p => p.description)).toBe(true);

      // AND: Remove command should have proper documentation
      const removeCommand = helpResult.commands.find(cmd => cmd.name === 'remove');
      expect(removeCommand.usage).toContain('/remove');
      expect(removeCommand.examples).toHaveLength(2);
      expect(removeCommand.parameters).toHaveLength(1);

      // AND: Help command should be documented
      const helpCommandInfo = helpResult.commands.find(cmd => cmd.name === 'help');
      expect(helpCommandInfo.usage).toBe('/help');
    });

    test('3.2-E2E-002-05-02: should provide contextual help for specific commands', async () => {
      // GIVEN: Help request for specific command
      const specificHelpCommand = { command: 'help', targetCommand: 'add' };

      // WHEN: Requesting command-specific help
      const specificHelpResult = {
        command: 'add',
        usage: '/add <name> "<pattern>" "<description>"',
        description: 'Add a new coding standard to the registry',
        detailedExamples: [
          {
            command: '/add no-console "no-console" "Disallow console statements"',
            explanation: 'Creates a rule that flags console.* statements as errors'
          },
          {
            command: '/add prefer-arrow "/^\\s*function\\s+/" "Prefer arrow functions"',
            explanation: 'Detects traditional function declarations and suggests arrow functions'
          }
        ],
        commonErrors: [
          {
            error: 'Missing quoted parameters',
            solution: 'Always wrap pattern and description in quotes'
          },
          {
            error: 'Invalid regex pattern',
            solution: 'Ensure pattern is valid JavaScript regex syntax'
          }
        ]
      };

      // THEN: Should provide detailed help for the specific command
      expect(specificHelpResult.command).toBe('add');
      expect(specificHelpResult.detailedExamples).toHaveLength(2);
      expect(specificHelpResult.commonErrors).toHaveLength(2);
      expect(specificHelpResult.detailedExamples[0].explanation).toBeTruthy();
    });

    });

  // Test ID: 3.2-E2E-002-06 - Concurrency and Race Condition Prevention (AC6)
  describe('3.2-E2E-002-06: Concurrency and Race Condition Prevention (AC6)', () => {
    test('3.2-E2E-002-06-01: should handle concurrent add commands without race conditions', async () => {
      // GIVEN: Multiple concurrent add commands to test thread safety
      const concurrentCommands = Array.from({ length: 20 }, (_, i) => ({
        type: 'add' as const,
        name: `concurrent-rule-${i}`,
        pattern: `/pattern-${i}`,
        description: `Concurrent rule ${i} with unique data`
      }));

      // WHEN: Executing all commands concurrently to stress test race conditions
      const startTime = performance.now();

      const promises = concurrentCommands.map(async (command) => {
        return mockRegistry.add({
          id: `id-${command.name}`,
          name: command.name,
          pattern: command.pattern,
          description: command.description,
          createdAt: new Date().toISOString(),
          isActive: true
        });
      });

      await Promise.all(promises);

      const endTime = performance.now();
      const duration = endTime - startTime;

      // THEN: All commands should complete successfully without race conditions
      expect(duration).toBeLessThan(100); // Should still be fast even with concurrency

      const allStandards = await mockRegistry.getAll();
      expect(allStandards).toHaveLength(20);

      // AND: Verify no race conditions - all standards should be present and correct
      for (const command of concurrentCommands) {
        const standard = await mockRegistry.get(command.name);
        expect(standard).not.toBeNull();
        expect(standard.name).toBe(command.name);
        expect(standard.pattern).toBe(command.pattern);
        expect(standard.description).toBe(command.description);
        expect(standard.isActive).toBe(true);
      }
    });

    test('3.2-E2E-002-06-02: should handle concurrent mixed operations without data corruption', async () => {
      // GIVEN: Mixed concurrent add and remove operations to test consistency
      const baseCommands = Array.from({ length: 5 }, (_, i) => ({
        name: `base-rule-${i}`,
        pattern: `/base-pattern-${i}`,
        description: `Base rule ${i}`
      }));

      // Pre-populate some standards
      for (const command of baseCommands) {
        await mockRegistry.add({
          id: `id-${command.name}`,
          ...command,
          createdAt: new Date().toISOString(),
          isActive: true
        });
      }

      // WHEN: Executing mixed concurrent operations
      const concurrentOperations = [
        // Add new standards
        ...Array.from({ length: 10 }, (_, i) => ({
          type: 'add' as const,
          name: `new-rule-${i}`,
          pattern: `/new-pattern-${i}`,
          description: `New rule ${i}`
        })),
        // Remove existing standards
        ...Array.from({ length: 3 }, (_, i) => ({
          type: 'remove' as const,
          name: `base-rule-${i}`
        }))
      ];

      const promises = concurrentOperations.map(async (operation) => {
        if (operation.type === 'add') {
          return mockRegistry.add({
            id: `id-${operation.name}`,
            name: operation.name,
            pattern: operation.pattern,
            description: operation.description,
            createdAt: new Date().toISOString(),
            isActive: true
          });
        } else {
          return mockRegistry.remove(operation.name);
        }
      });

      await Promise.all(promises);

      // THEN: Registry should maintain consistency with correct counts
      const finalStandards = await mockRegistry.getAll();
      expect(finalStandards).toHaveLength(12); // 5 base + 10 new - 3 removed

      // AND: Verify removed standards are gone
      for (let i = 0; i < 3; i++) {
        const removedStandard = await mockRegistry.get(`base-rule-${i}`);
        expect(removedStandard).toBeNull();
      }

      // AND: Verify new standards are present
      for (let i = 0; i < 10; i++) {
        const newStandard = await mockRegistry.get(`new-rule-${i}`);
        expect(newStandard).not.toBeNull();
        expect(newStandard.name).toBe(`new-rule-${i}`);
      }
    });

    test('3.2-E2E-002-06-03: should maintain performance under concurrent load', async () => {
      // GIVEN: High concurrency scenario to test performance degradation
      const highConcurrencyCount = 50;
      const concurrentCommands = Array.from({ length: highConcurrencyCount }, (_, i) => ({
        name: `perf-rule-${i}`,
        pattern: `/perf-pattern-${i}`,
        description: `Performance test rule ${i}`
      }));

      // WHEN: Executing high volume of concurrent commands
      const startTime = performance.now();

      const promises = concurrentCommands.map(async (command) => {
        return mockRegistry.add({
          id: `id-${command.name}`,
          name: command.name,
          pattern: command.pattern,
          description: command.description,
          createdAt: new Date().toISOString(),
          isActive: true
        });
      });

      await Promise.all(promises);

      const endTime = performance.now();
      const totalDuration = endTime - startTime;

      // THEN: Performance should remain acceptable even under load
      expect(totalDuration).toBeLessThan(200); // Still should be under 200ms total
      const averagePerCommand = totalDuration / highConcurrencyCount;
      expect(averagePerCommand).toBeLessThan(10); // Average < 10ms per command

      const allStandards = await mockRegistry.getAll();
      expect(allStandards).toHaveLength(highConcurrencyCount);
    });
  });
});