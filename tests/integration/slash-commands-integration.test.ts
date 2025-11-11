import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { SlashCommandInterface } from '../../src/cli/slash-commands/index.js';
import { StandardsRegistry } from '../../src/standards/registry.js';

describe('Slash Commands Integration', () => {
    let slashCommandInterface: SlashCommandInterface;
    let registry: StandardsRegistry;
    let tempDbPath: string;

    beforeEach(async () => {
        // Create temporary database for testing
        tempDbPath = `/tmp/test-integration-${Date.now()}.db`;
        registry = new StandardsRegistry(tempDbPath);
        await registry.initialize();

        slashCommandInterface = new SlashCommandInterface(registry);
    });

    afterEach(() => {
        registry.close();
        slashCommandInterface.close();
        // Clean up temporary database
        try {
            Bun.file(tempDbPath).exists();
        } catch (error) {
            // Ignore cleanup errors
        }
    });

    describe('End-to-End Command Processing', () => {
        test('should process complete add workflow', async () => {
            const result = await slashCommandInterface.processCommand(
                '/add integration-test "console\\\\.log" "Prevent console usage" --category quality --severity warning'
            );

            expect(result.success).toBe(true);
            expect(result.message).toContain('Successfully added standard "integration-test"');
            expect(result.data?.ruleName).toBe('integration-test');
            expect(result.data?.category).toBe('quality');
            expect(result.data?.severity).toBe('warning');
            expect(result.executionTime).toBeLessThan(1000);

            // Verify the rule was actually added to the registry
            const addedRule = await registry.getRuleBySemanticName('integration-test');
            expect(addedRule).toBeDefined();
            expect(addedRule!.semanticName).toBe('integration-test');
            expect(addedRule!.pattern).toBe('console\\.log');
            expect(addedRule!.description).toBe('Prevent console usage');
            expect(addedRule!.category).toBe('quality');
            expect(addedRule!.severity).toBe('warning');
        });

        test('should process complete remove workflow', async () => {
            // First add a rule
            await slashCommandInterface.processCommand('/add remove-test "pattern" "Test for removal"');

            // Then remove it
            const result = await slashCommandInterface.processCommand('/remove remove-test');

            expect(result.success).toBe(true);
            expect(result.message).toContain('Successfully removed standard "remove-test"');
            expect(result.data?.ruleName).toBe('remove-test');

            // Verify the rule was actually removed from the registry
            const removedRule = await registry.getRuleBySemanticName('remove-test');
            expect(removedRule).toBeNull();
        });

        test('should process help command with formatting', async () => {
            const result = await slashCommandInterface.processCommand('/help');

            expect(result.success).toBe(true);
            expect(result.message).toBe('Help information retrieved');
            expect(result.data?.help).toContain('Slash Commands Help');
            expect(result.data?.formatAsHelp).toBe(true);
        });

        test('should process help for specific command', async () => {
            const result = await slashCommandInterface.processCommand('/help add');

            expect(result.success).toBe(true);
            expect(result.data?.help).toContain('/ADD');
            expect(result.data?.topic).toBe('add');
        });
    });

    describe('Error Handling and Recovery', () => {
        test('should handle invalid commands with helpful suggestions', async () => {
            const result = await slashCommandInterface.processCommand('invalid command');

            expect(result.success).toBe(false);
            expect(result.error?.code).toBe('INVALID_PREFIX');
            expect(result.suggestions).toBeDefined();
            expect(result.suggestions).toContain('Add / at the beginning of your command');
        });

        test('should handle commands with validation errors', async () => {
            const result = await slashCommandInterface.processCommand('/add "" "" ""'); // Empty required fields

            expect(result.success).toBe(false);
            expect(result.error?.code).toBe('VALIDATION_ERROR');
            expect(result.suggestions).toBeDefined();
        });

        test('should handle removal of non-existent rule', async () => {
            const result = await slashCommandInterface.processCommand('/remove non-existent-rule');

            expect(result.success).toBe(false);
            expect(result.error?.code).toBe('RULE_NOT_FOUND');
        });

        test('should handle invalid regex patterns', async () => {
            const result = await slashCommandInterface.processCommand('/add invalid-regex "[invalid" "Invalid pattern"');

            expect(result.success).toBe(false);
            expect(result.error?.code).toBe('INVALID_PATTERN');
        });
    });

    describe('Performance Requirements', () => {
        test('should meet sub-50ms response time target for simple operations', async () => {
            const start = Date.now();
            const result = await slashCommandInterface.processCommand('/help');
            const duration = Date.now() - start;

            expect(result.success).toBe(true);
            expect(duration).toBeLessThan(50);
            expect(result.executionTime).toBeLessThan(50);
        });

        test('should meet sub-50ms response time target for add operations', async () => {
            const start = Date.now();
            const result = await slashCommandInterface.processCommand('/add perf-test "pattern" "Performance test description"');
            const duration = Date.now() - start;

            expect(result.success).toBe(true);
            expect(duration).toBeLessThan(50);
            expect(result.executionTime).toBeLessThan(50);
        });

        test('should meet sub-50ms response time target for remove operations', async () => {
            // Add a rule first
            await slashCommandInterface.processCommand('/add perf-remove-test "pattern" "Performance test rule"');

            const start = Date.now();
            const result = await slashCommandInterface.processCommand('/remove perf-remove-test');
            const duration = Date.now() - start;

            expect(result.success).toBe(true);
            expect(duration).toBeLessThan(50);
            expect(result.executionTime).toBeLessThan(50);
        });

        test('should handle high volume of commands efficiently', async () => {
            const commandCount = 100;
            const commands = Array.from({ length: commandCount }, (_, i) =>
                `/add perf-volume-${i} "pattern-${i}" "Volume test ${i} with longer description"`
            );

            const start = Date.now();
            const results = await Promise.all(
                commands.map(cmd => slashCommandInterface.processCommand(cmd))
            );
            const totalTime = Date.now() - start;

            expect(results.every(r => r.success)).toBe(true);
            expect(totalTime).toBeLessThan(commandCount * 50); // Average under 50ms per command

            const avgTime = totalTime / commandCount;
            expect(avgTime).toBeLessThan(50);
        });
    });

    describe('Concurrency and Consistency', () => {
        test('should maintain consistency under concurrent operations', async () => {
            const commandCount = 20;
            const commands = Array.from({ length: commandCount }, (_, i) =>
                `/add concurrent-${i} "pattern-${i}" "Concurrent test ${i} with longer description"`
            );

            // Execute all commands concurrently
            const results = await Promise.all(
                commands.map(cmd => slashCommandInterface.processCommand(cmd))
            );

            expect(results.every(r => r.success)).toBe(true);

            // Verify all rules were added
            for (let i = 0; i < commandCount; i++) {
                const rule = await registry.getRuleBySemanticName(`concurrent-${i}`);
                expect(rule).toBeDefined();
                expect(rule!.semanticName).toBe(`concurrent-${i}`);
            }

            // Test concurrent removals
            const removeCommands = Array.from({ length: commandCount }, (_, i) =>
                `/remove concurrent-${i}`
            );

            const removeResults = await Promise.all(
                removeCommands.map(cmd => slashCommandInterface.processCommand(cmd))
            );

            expect(removeResults.every(r => r.success)).toBe(true);

            // Verify all rules were removed
            for (let i = 0; i < commandCount; i++) {
                const rule = await registry.getRuleBySemanticName(`concurrent-${i}`);
                expect(rule).toBeNull();
            }
        });

        test('should handle mixed concurrent operations', async () => {
            const operations = [
                () => slashCommandInterface.processCommand('/add mixed-1 "pattern1" "Test description 1"'),
                () => slashCommandInterface.processCommand('/add mixed-2 "pattern2" "Test description 2"'),
                () => slashCommandInterface.processCommand('/remove mixed-1'),
                () => slashCommandInterface.processCommand('/help add'),
                () => slashCommandInterface.processCommand('/add mixed-3 "pattern3" "Test description 3"')
            ];

            const results = await Promise.all(operations.map(op => op()));

            expect(results.filter(r => r.success)).toHaveLength(5); // 3 adds + 1 help + 1 removal (all succeed)

            // Verify final state using exact matching
            const allRules = await registry.getAllRules();
            const rule1 = allRules.find(rule => rule.semanticName === 'mixed-1');
            const rule2 = allRules.find(rule => rule.semanticName === 'mixed-2');
            const rule3 = allRules.find(rule => rule.semanticName === 'mixed-3');

            expect(rule1).toBeUndefined(); // Should be removed
            expect(rule2).toBeDefined(); // Should exist
            expect(rule3).toBeDefined(); // Should exist
        });
    });

    describe('Registry Integration', () => {
        test('should integrate with registry validation', async () => {
            // Add a rule
            await slashCommandInterface.processCommand('/add validation-test "pattern" "Test rule description"');

            // Try to add a duplicate rule
            const result = await slashCommandInterface.processCommand('/add validation-test "pattern" "Duplicate test description"');

            expect(result.success).toBe(false);
            expect(result.error?.code).toBe('ADD_FAILED');
        });

        test('should maintain registry cache consistency', async () => {
            // Add a rule
            await slashCommandInterface.processCommand('/add cache-test "pattern" "Cache test description"');

            // Verify it's immediately available via semantic name lookup
            const rule = await registry.getRuleBySemanticName('cache-test');
            expect(rule).toBeDefined();

            // Remove it
            await slashCommandInterface.processCommand('/remove cache-test');

            // Verify it's immediately removed
            const removedRule = await registry.getRuleBySemanticName('cache-test');
            expect(removedRule).toBeNull();
        });

        test('should preserve registry state on failures', async () => {
            // Add a valid rule
            await slashCommandInterface.processCommand('/add valid-rule "pattern" "Valid rule description"');

            // Try to add an invalid rule (bad regex)
            await slashCommandInterface.processCommand('/add invalid-rule "[invalid" "Invalid pattern description"');

            // Verify the valid rule is still there and invalid rule was not added using exact matching
            const allRules = await registry.getAllRules();
            const validRule = allRules.find(rule => rule.semanticName === 'valid-rule');
            const invalidRule = allRules.find(rule => rule.semanticName === 'invalid-rule');

            expect(validRule).toBeDefined();
            expect(invalidRule).toBeUndefined();
        });
    });

    describe('Configuration and Features', () => {
        test('should respect parser configuration changes', async () => {
            slashCommandInterface.updateParserConfig({ strictMode: false, caseSensitive: false });

            // Should be more lenient with certain inputs
            const result = await slashCommandInterface.processCommand('/HELP'); // Uppercase should work
            expect(result.success).toBe(true);
        });

        test('should respect executor configuration changes', async () => {
            slashCommandInterface.updateExecutorConfig({ enableAuditLogging: false });

            await slashCommandInterface.processCommand('/add audit-test "pattern" "Audit test with longer description"');

            // Audit log should be empty
            const auditLog = slashCommandInterface.getAuditLog();
            expect(auditLog).toHaveLength(0);
        });

        test('should provide command suggestions', () => {
            const suggestions = slashCommandInterface.getSuggestions('/a');
            expect(suggestions).toContain('/add');

            const generalSuggestions = slashCommandInterface.getSuggestions('');
            expect(generalSuggestions).toContain('/add');
            expect(generalSuggestions).toContain('/remove');
            expect(generalSuggestions).toContain('/help');
        });

        test('should validate commands without executing', () => {
            const validValidation = slashCommandInterface.validateCommand('/add test "pattern" "Description"');
            expect(validValidation.isValid).toBe(true);

            const invalidValidation = slashCommandInterface.validateCommand('invalid command');
            expect(invalidValidation.isValid).toBe(false);
            expect(invalidValidation.errors.length).toBeGreaterThan(0);
        });
    });

    describe('Statistics and Monitoring', () => {
        test('should track execution statistics', async () => {
            // Execute several commands
            await slashCommandInterface.processCommand('/add stats-test-1 "pattern1" "Test description 1"');
            await slashCommandInterface.processCommand('/add stats-test-2 "pattern2" "Test description 2"');
            await slashCommandInterface.processCommand('/remove stats-test-1');
            await slashCommandInterface.processCommand('/help');

            const stats = slashCommandInterface.getStats();

            expect(stats.totalExecutions).toBe(4);
            expect(stats.successfulExecutions).toBe(4);
            expect(stats.failedExecutions).toBe(0);
            expect(stats.averageExecutionTime).toBeGreaterThan(0);
            expect(stats.averageExecutionTime).toBeLessThan(1000);
        });

        test('should maintain audit log', async () => {
            await slashCommandInterface.processCommand('/add audit-log-test "pattern" "Audit test with longer description"', 'test-user');

            const auditLog = slashCommandInterface.getAuditLog();

            expect(auditLog).toHaveLength(1);
            expect(auditLog[0].command).toBe('/add audit-log-test "pattern" "Audit test with longer description"');
            expect(auditLog[0].user).toBe('test-user');
            expect(auditLog[0].result.success).toBe(true);
        });

        test('should limit audit log size', async () => {
            // Execute many commands
            for (let i = 0; i < 10; i++) {
                await slashCommandInterface.processCommand(`/add audit-limit-${i} "pattern${i}" "Test ${i} with longer description"`);
            }

            // Get limited audit log
            const limitedLog = slashCommandInterface.getAuditLog(5);
            expect(limitedLog).toHaveLength(5);

            // Should get the most recent entries
            expect(limitedLog[0].command).toContain('audit-limit-5');
        });
    });

    describe('Edge Cases', () => {
        test('should handle complex patterns and descriptions', async () => {
            const complexPattern = 'import\\s+.*from\\s+[\'\\"][^\'\\"]+[\'\\"];';
            const complexDescription = 'This is a complex description with \\"quotes\\" and \\\\backslashes\\\\';

            const result = await slashCommandInterface.processCommand(
                `/add complex-rule "${complexPattern}" "${complexDescription}"`
            );

            expect(result.success).toBe(true);

            const rule = await registry.getRuleBySemanticName('complex-rule');
            expect(rule).toBeDefined();
            expect(rule!.pattern).toBe('import\\s+.*from\\s+[\'"][^\'"]+[\'"];');
            expect(rule!.description).toBe('This is a complex description with "quotes" and \\backslashes\\');
        });

        test('should handle commands with extra whitespace', async () => {
            const result = await slashCommandInterface.processCommand('  /add   whitespace-test   "pattern"   "Description for whitespace test"  ');

            expect(result.success).toBe(true);
            expect(result.data?.ruleName).toBe('whitespace-test');

            const rule = await registry.getRuleBySemanticName('whitespace-test');
            expect(rule).toBeDefined();
        });

        test('should handle special characters in rule names', async () => {
            const result = await slashCommandInterface.processCommand(
                '/add special-chars-123 "pattern" "Special characters test for rule names"'
            );

            expect(result.success).toBe(true);

            const rule = await registry.getRuleBySemanticName('special-chars-123');
            expect(rule).toBeDefined();
        });
    });
});