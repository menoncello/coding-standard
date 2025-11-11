import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { SlashCommandExecutor } from '../../../../src/cli/slash-commands/executor.js';
import { StandardsRegistry } from '../../../../src/standards/registry.js';
import { CommandHelpSystem } from '../../../../src/cli/slash-commands/help.js';
import { SlashCommandParser } from '../../../../src/cli/slash-commands/parser.js';
import { AddCommand, RemoveCommand, HelpCommand } from '../../../../src/cli/slash-commands/types.js';
import { bun } from 'bun';

describe('SlashCommandExecutor', () => {
    let registry: StandardsRegistry;
    let executor: SlashCommandExecutor;
    let helpSystem: CommandHelpSystem;
    let parser: SlashCommandParser;
    let tempDbPath: string;

    beforeEach(async () => {
        // Create temporary database for testing
        tempDbPath = `/tmp/test-registry-${Date.now()}.db`;
        registry = new StandardsRegistry(tempDbPath);
        await registry.initialize();

        parser = new SlashCommandParser();
        helpSystem = new CommandHelpSystem(parser.getAvailableCommands());
        executor = new SlashCommandExecutor(registry, helpSystem);
    });

    afterEach(() => {
        registry.close();
        // Clean up temporary database
        try {
            Bun.file(tempDbPath).exists();
        } catch (error) {
            // Ignore cleanup errors
        }
    });

    describe('Add Command Execution', () => {
        test('should successfully add a new standard rule', async () => {
            const command: AddCommand = {
                type: 'add',
                rawInput: '/add test-rule "console.log" "Prevent console usage"',
                originalInput: '/add test-rule "console.log" "Prevent console usage"',
                ruleName: 'test-rule',
                pattern: 'console.log',
                description: 'Prevent console usage'
            };

            const result = await executor.execute(command);

            expect(result.success).toBe(true);
            expect(result.message).toContain('Successfully added standard "test-rule"');
            expect(result.data?.ruleName).toBe('test-rule');
            expect(result.data?.category).toBe('general'); // default category
            expect(result.data?.technology).toBe('general'); // default technology
            expect(result.data?.severity).toBe('warning'); // default severity
            expect(result.executionTime).toBeLessThan(1000);
        });

        test('should add rule with optional parameters', async () => {
            const command: AddCommand = {
                type: 'add',
                rawInput: '/add security-rule "eval\\(" "Prevent eval usage" --category security --technology javascript --severity error',
                originalInput: '/add security-rule "eval\\(" "Prevent eval usage" --category security --technology javascript --severity error',
                ruleName: 'security-rule',
                pattern: 'eval\\(',
                description: 'Prevent eval usage',
                category: 'security',
                technology: 'javascript',
                severity: 'error'
            };

            const result = await executor.execute(command);

            expect(result.success).toBe(true);
            expect(result.data?.ruleName).toBe('security-rule');
            expect(result.data?.category).toBe('security');
            expect(result.data?.technology).toBe('javascript');
            expect(result.data?.severity).toBe('error');
        });

        test('should add rule with tags', async () => {
            const command: AddCommand = {
                type: 'add',
                rawInput: '/add tagged-rule "pattern" "Description" --tags "security,performance"',
                originalInput: '/add tagged-rule "pattern" "Description" --tags "security,performance"',
                ruleName: 'tagged-rule',
                pattern: 'pattern',
                description: 'Description',
                tags: ['security', 'performance']
            };

            const result = await executor.execute(command);

            expect(result.success).toBe(true);

            // Verify the rule was added with tags
            const addedRule = await registry.getRuleBySemanticName('tagged-rule');
            expect(addedRule?.tags).toEqual(['security', 'performance']);
        });

        test('should reject invalid regex pattern', async () => {
            const command: AddCommand = {
                type: 'add',
                rawInput: '/add invalid-rule "[invalid" "Invalid regex"',
                originalInput: '/add invalid-rule "[invalid" "Invalid regex"',
                ruleName: 'invalid-rule',
                pattern: '[invalid',
                description: 'Invalid regex'
            };

            const result = await executor.execute(command);

            expect(result.success).toBe(false);
            expect(result.error?.code).toBe('INVALID_PATTERN');
            expect(result.message).toContain('Invalid regular expression pattern');
        });

        test('should handle registry errors during add', async () => {
            // Mock registry to throw error
            const originalAddRule = registry.addRule;
            registry.addRule = async () => {
                throw new Error('Registry error');
            };

            const command: AddCommand = {
                type: 'add',
                rawInput: '/add test-rule "pattern" "Description"',
                originalInput: '/add test-rule "pattern" "Description"',
                ruleName: 'test-rule',
                pattern: 'pattern',
                description: 'Description'
            };

            const result = await executor.execute(command);

            expect(result.success).toBe(false);
            expect(result.error?.code).toBe('ADD_FAILED');
            expect(result.message).toContain('Failed to add standard');

            // Restore original method
            registry.addRule = originalAddRule;
        });
    });

    describe('Remove Command Execution', () => {
        beforeEach(async () => {
            // Add a test rule first
            const addCommand: AddCommand = {
                type: 'add',
                rawInput: '/add test-to-remove "pattern" "Test rule for removal"',
                originalInput: '/add test-to-remove "pattern" "Test rule for removal"',
                ruleName: 'test-to-remove',
                pattern: 'pattern',
                description: 'Test rule for removal'
            };

            await executor.execute(addCommand);
        });

        test('should successfully remove existing rule', async () => {
            const command: RemoveCommand = {
                type: 'remove',
                rawInput: '/remove test-to-remove',
                originalInput: '/remove test-to-remove',
                ruleName: 'test-to-remove'
            };

            const result = await executor.execute(command);

            expect(result.success).toBe(true);
            expect(result.message).toContain('Successfully removed standard "test-to-remove"');
            expect(result.data?.ruleName).toBe('test-to-remove');

            // Verify the rule was actually removed
            const removedRule = await registry.getRuleBySemanticName('test-to-remove');
            expect(removedRule).toBeNull();
        });

        test('should handle removal of non-existent rule', async () => {
            const command: RemoveCommand = {
                type: 'remove',
                rawInput: '/remove non-existent-rule',
                originalInput: '/remove non-existent-rule',
                ruleName: 'non-existent-rule'
            };

            const result = await executor.execute(command);

            expect(result.success).toBe(false);
            expect(result.error?.code).toBe('RULE_NOT_FOUND');
            expect(result.message).toContain('not found');
        });

        test('should handle registry errors during remove', async () => {
            // Mock registry to throw error
            const originalRemoveRule = registry.removeRule;
            registry.removeRule = async () => {
                throw new Error('Registry error');
            };

            const command: RemoveCommand = {
                type: 'remove',
                rawInput: '/remove test-to-remove',
                originalInput: '/remove test-to-remove',
                ruleName: 'test-to-remove'
            };

            const result = await executor.execute(command);

            expect(result.success).toBe(false);
            expect(result.error?.code).toBe('REMOVE_FAILED');
            expect(result.message).toContain('Failed to remove standard');

            // Restore original method
            registry.removeRule = originalRemoveRule;
        });
    });

    describe('Help Command Execution', () => {
        test('should return general help', async () => {
            const command: HelpCommand = {
                type: 'help',
                rawInput: '/help',
                originalInput: '/help'
            };

            const result = await executor.execute(command);

            expect(result.success).toBe(true);
            expect(result.message).toBe('Help information retrieved');
            expect(result.data?.help).toContain('Slash Commands Help');
            expect(result.data?.topic).toBeUndefined();
        });

        test('should return command-specific help', async () => {
            const command: HelpCommand = {
                type: 'help',
                rawInput: '/help add',
                originalInput: '/help add',
                topic: 'add'
            };

            const result = await executor.execute(command);

            expect(result.success).toBe(true);
            expect(result.data?.help).toContain('/ADD');
            expect(result.data?.help).toContain('Add a new standard rule');
            expect(result.data?.topic).toBe('add');
        });

        test('should handle help for unknown command', async () => {
            const command: HelpCommand = {
                type: 'help',
                rawInput: '/help unknown',
                originalInput: '/help unknown',
                topic: 'unknown'
            };

            const result = await executor.execute(command);

            expect(result.success).toBe(true);
            expect(result.data?.help).toContain('Unknown command: unknown');
        });
    });

    describe('Performance and Monitoring', () => {
        test('should execute commands within reasonable time', async () => {
            const command: AddCommand = {
                type: 'add',
                rawInput: '/add perf-test "pattern" "Performance test"',
                originalInput: '/add perf-test "pattern" "Performance test"',
                ruleName: 'perf-test',
                pattern: 'pattern',
                description: 'Performance test'
            };

            const start = Date.now();
            const result = await executor.execute(command);
            const duration = Date.now() - start;

            expect(result.success).toBe(true);
            expect(result.executionTime).toBeLessThan(1000);
            expect(duration).toBeLessThan(1000);
        });

        test('should track execution statistics', async () => {
            const command: AddCommand = {
                type: 'add',
                rawInput: '/add stats-test "pattern" "Statistics tracking test"',
                originalInput: '/add stats-test "pattern" "Statistics tracking test"',
                ruleName: 'stats-test',
                pattern: 'pattern',
                description: 'Statistics tracking test'
            };

            await executor.execute(command, 'test-user');

            const stats = executor.getExecutionStats();
            expect(stats.totalExecutions).toBe(1);
            expect(stats.successfulExecutions).toBe(1);
            expect(stats.failedExecutions).toBe(0);
            expect(stats.averageExecutionTime).toBeGreaterThan(0);
        });

        test('should maintain audit log', async () => {
            const command: AddCommand = {
                type: 'add',
                rawInput: '/add audit-test "pattern" "Audit test"',
                originalInput: '/add audit-test "pattern" "Audit test"',
                ruleName: 'audit-test',
                pattern: 'pattern',
                description: 'Audit test'
            };

            await executor.execute(command, 'test-user');

            const auditLog = executor.getAuditLog();
            expect(auditLog).toHaveLength(1);
            expect(auditLog[0].command).toBe(command.originalInput);
            expect(auditLog[0].user).toBe('test-user');
            expect(auditLog[0].result.success).toBe(true);
        });

        test('should warn about performance targets', async () => {
            // Mock slow execution by overriding the internal executeAddCommand method
            const originalExecuteAddCommand = (executor as any).executeAddCommand;
            (executor as any).executeAddCommand = async (command: AddCommand) => {
                await new Promise(resolve => setTimeout(resolve, 60)); // Simulate slow operation
                return originalExecuteAddCommand.call(executor, command);
            };

            const command: AddCommand = {
                type: 'add',
                rawInput: '/add slow-test "pattern" "Slow performance test command"',
                originalInput: '/add slow-test "pattern" "Slow performance test command"',
                ruleName: 'slow-test',
                pattern: 'pattern',
                description: 'Slow performance test command'
            };

            const result = await executor.execute(command);

            expect(result.success).toBe(true);
            expect(result.warnings).toBeDefined();
            expect(result.warnings!.length).toBeGreaterThan(0);
            expect(result.warnings![0]).toContain('Execution time (');
            expect(result.warnings![0]).toContain('ms) exceeded 50ms target');

            // Restore original method
            (executor as any).executeAddCommand = originalExecuteAddCommand;
        });
    });

    describe('Configuration', () => {
        test('should update executor configuration', () => {
            executor.updateConfig({
                allowDestructiveOperations: false,
                requireConfirmation: true
            });

            const config = (executor as any).config;
            expect(config.allowDestructiveOperations).toBe(false);
            expect(config.requireConfirmation).toBe(true);
        });

        test('should disable audit logging', async () => {
            executor.updateConfig({ enableAuditLogging: false });

            const command: AddCommand = {
                type: 'add',
                rawInput: '/add no-audit-test "pattern" "No audit test"',
                originalInput: '/add no-audit-test "pattern" "No audit test"',
                ruleName: 'no-audit-test',
                pattern: 'pattern',
                description: 'No audit test'
            };

            await executor.execute(command);

            const auditLog = executor.getAuditLog();
            expect(auditLog).toHaveLength(0);
        });

        test('should set maximum execution time', () => {
            executor.updateConfig({ maxExecutionTime: 500 });

            const config = (executor as any).config;
            expect(config.maxExecutionTime).toBe(500);
        });
    });

    describe('Error Handling', () => {
        test('should handle command execution errors', async () => {
            // Create an invalid command that will cause execution error
            const invalidCommand = {
                type: 'invalid' as any,
                rawInput: '/invalid',
                originalInput: '/invalid'
            };

            const result = await executor.execute(invalidCommand);

            expect(result.success).toBe(false);
            expect(result.error?.code).toBe('UNSUPPORTED_COMMAND');
            expect(result.message).toContain('Unsupported command type');
        });

        test('should handle registry initialization errors', async () => {
            // Create executor with un-initialized registry
            const uninitializedRegistry = new StandardsRegistry(tempDbPath);
            const testExecutor = new SlashCommandExecutor(uninitializedRegistry, helpSystem);

            const command: AddCommand = {
                type: 'add',
                rawInput: '/add init-test "pattern" "Registry initialization test"',
                originalInput: '/add init-test "pattern" "Registry initialization test"',
                ruleName: 'init-test',
                pattern: 'pattern',
                description: 'Registry initialization test'
            };

            // Should still work as executor initializes registry automatically
            const result = await testExecutor.execute(command);
            expect(result.success).toBe(true);

            uninitializedRegistry.close();
        });
    });

    describe('Concurrency', () => {
        test('should handle concurrent command execution', async () => {
            const commands = Array.from({ length: 10 }, (_, i) => ({
                type: 'add' as const,
                rawInput: `/add concurrent-test-${i} "pattern-${i}" "Concurrent test ${i}"`,
                originalInput: `/add concurrent-test-${i} "pattern-${i}" "Concurrent test ${i}"`,
                ruleName: `concurrent-test-${i}`,
                pattern: `pattern-${i}`,
                description: `Concurrent test ${i}`
            }));

            const promises = commands.map(cmd => executor.execute(cmd));
            const results = await Promise.all(promises);

            expect(results.every(r => r.success)).toBe(true);

            const stats = executor.getExecutionStats();
            expect(stats.totalExecutions).toBe(10);
            expect(stats.successfulExecutions).toBe(10);
        });

        test('should handle execution with locking', async () => {
            const command: AddCommand = {
                type: 'add',
                rawInput: '/add lock-test "pattern" "Locking mechanism test"',
                originalInput: '/add lock-test "pattern" "Locking mechanism test"',
                ruleName: 'lock-test',
                pattern: 'pattern',
                description: 'Locking mechanism test'
            };

            // Execute both calls concurrently - only one should succeed
            const [result1, result2] = await Promise.all([
                executor.executeWithLock(command, 'test-lock'),
                executor.executeWithLock(command, 'test-lock')
            ]);

            // One should succeed and one should fail due to locking
            const hasSuccess = result1.success || result2.success;
            const hasLockFailure = (result1.success === false && result1.error?.code === 'CONFLICTING_OPERATION') ||
                                  (result2.success === false && result2.error?.code === 'CONFLICTING_OPERATION');

            expect(hasSuccess).toBe(true);
            expect(hasLockFailure).toBe(true);
        });
    });

    describe('Utility Methods', () => {
        test('should clear audit log', async () => {
            const command: AddCommand = {
                type: 'add',
                rawInput: '/add clear-test "pattern" "Clear test"',
                originalInput: '/add clear-test "pattern" "Clear test"',
                ruleName: 'clear-test',
                pattern: 'pattern',
                description: 'Clear test'
            };

            await executor.execute(command);
            expect(executor.getAuditLog()).toHaveLength(1);

            executor.clearAuditLog();
            expect(executor.getAuditLog()).toHaveLength(0);
        });

        test('should limit audit log entries returned', async () => {
            const commands = Array.from({ length: 5 }, (_, i) => ({
                type: 'add' as const,
                rawInput: `/add limit-test-${i} "pattern-${i}" "Limit test ${i}"`,
                originalInput: `/add limit-test-${i} "pattern-${i}" "Limit test ${i}"`,
                ruleName: `limit-test-${i}`,
                pattern: `pattern-${i}`,
                description: `Limit test ${i}`
            }));

            for (const cmd of commands) {
                await executor.execute(cmd);
            }

            const limitedLog = executor.getAuditLog(3);
            expect(limitedLog).toHaveLength(3);
            expect(limitedLog[0].command).toContain('limit-test-2'); // Should get last 3
        });
    });
});