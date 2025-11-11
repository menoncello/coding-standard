import { test, expect, describe, beforeEach } from 'bun:test';
import { CommandHelpSystem } from '../../../../src/cli/slash-commands/help.js';
import { SlashCommandParser } from '../../../../src/cli/slash-commands/parser.js';
import { CommandPattern, SlashCommandType } from '../../../../src/cli/slash-commands/types.js';

describe('CommandHelpSystem', () => {
    let helpSystem: CommandHelpSystem;
    let parser: SlashCommandParser;
    let mockPatterns: Map<SlashCommandType, CommandPattern>;

    beforeEach(() => {
        parser = new SlashCommandParser();
        helpSystem = new CommandHelpSystem(parser.getAvailableCommands());
        mockPatterns = new Map([
            ['add', {
                type: 'add',
                pattern: /^\/add\s+(.+)$/,
                description: 'Add a new standard rule',
                examples: ['/add rule "pattern" "Description"'],
                requiredArgs: ['ruleName', 'pattern', 'description'],
                optionalArgs: ['category', 'technology', 'severity']
            }],
            ['remove', {
                type: 'remove',
                pattern: /^\/remove\s+(.+)$/,
                description: 'Remove an existing standard rule',
                examples: ['/remove rule'],
                requiredArgs: ['ruleName'],
                optionalArgs: []
            }]
        ]);
    });

    describe('General Help', () => {
        test('should return comprehensive help text', () => {
            const help = helpSystem.getGeneralHelp();

            expect(help).toContain('Slash Commands Help');
            expect(help).toContain('Coding Standard Manager');
            expect(help).toContain('AVAILABLE COMMANDS');
            expect(help).toContain('/add');
            expect(help).toContain('/remove');
            expect(help).toContain('/help');
            expect(help).toContain('USAGE EXAMPLES');
            expect(help).toContain('TIPS');
            expect(help).toContain('PERFORMANCE');
        });

        test('should include all available commands', () => {
            const help = helpSystem.getGeneralHelp();

            expect(help).toContain('/add     Add a new standard rule');
            expect(help).toContain('/remove  Remove an existing standard rule');
            expect(help).toContain('/help    Show help information');
        });

        test('should include usage examples', () => {
            const help = helpSystem.getGeneralHelp();

            expect(help).toContain('/add my-rule "import-order"');
            expect(help).toContain('/remove my-rule');
        });

        test('should include performance information', () => {
            const help = helpSystem.getGeneralHelp();

            expect(help).toContain('sub-50ms response times');
            expect(help).toContain('atomic and consistent');
            expect(help).toContain('concurrency-safe');
        });
    });

    describe('Command-Specific Help', () => {
        test('should return help for add command', () => {
            const help = helpSystem.getCommandHelp('add');

            expect(help).toContain('/ADD');
            expect(help).toContain('Add a new standard rule');
            expect(help).toContain('SYNTAX');
            expect(help).toContain('Required: ruleName, pattern, description');
            expect(help).toContain('Optional: category, technology, severity');
            expect(help).toContain('EXAMPLES');
            expect(help).toContain('TIPS FOR /add');
        });

        test('should return help for remove command', () => {
            const help = helpSystem.getCommandHelp('remove');

            expect(help).toContain('/REMOVE');
            expect(help).toContain('Remove an existing standard rule');
            expect(help).toContain('SYNTAX');
            expect(help).toContain('Required: ruleName');
            expect(help).toContain('Optional: (none)');
            expect(help).toContain('TIPS FOR /remove');
        });

        test('should return help for help command', () => {
            const help = helpSystem.getCommandHelp('help');

            expect(help).toContain('/HELP');
            expect(help).toContain('Show help information');
            expect(help).toContain('SYNTAX');
            expect(help).toContain('TIPS FOR /help');
        });

        test('should handle unknown command gracefully', () => {
            const help = helpSystem.getCommandHelp('unknown');

            expect(help).toContain('Unknown command: unknown');
            expect(help).toContain('Available commands:');
            expect(help).toContain('/add');
            expect(help).toContain('/remove');
            expect(help).toContain('/help');
        });

        test('should handle command with slash prefix', () => {
            const help = helpSystem.getCommandHelp('/add');

            expect(help).toContain('/ADD');
            expect(help).toContain('Add a new standard rule');
        });

        test('should return general help for empty topic', () => {
            const help = helpSystem.getCommandHelp('');

            expect(help).toContain('Slash Commands Help');
            expect(help).toContain('AVAILABLE COMMANDS');
        });

        test('should return general help for undefined topic', () => {
            const help = helpSystem.getCommandHelp(undefined as any);

            expect(help).toContain('Slash Commands Help');
            expect(help).toContain('AVAILABLE COMMANDS');
        });
    });

    describe('Examples Help', () => {
        test('should return comprehensive examples', () => {
            const examples = helpSystem.getExamplesHelp();

            expect(examples).toContain('Usage Examples');
            expect(examples).toContain('ADDING STANDARDS');
            expect(examples).toContain('REMOVING STANDARDS');
            expect(examples).toContain('GETTING HELP');
            expect(examples).toContain('QUICK TIPS');
            expect(examples).toContain('PATTERN EXAMPLES');
        });

        test('should include various add command examples', () => {
            const examples = helpSystem.getExamplesHelp();

            expect(examples).toContain('Basic addition:');
            expect(examples).toContain('With category and technology:');
            expect(examples).toContain('With severity level:');
            expect(examples).toContain('With tags:');
            expect(examples).toContain('Complete example:');
        });

        test('should include pattern examples', () => {
            const examples = helpSystem.getExamplesHelp();

            expect(examples).toContain('Simple text match:');
            expect(examples).toContain('Regular expression:');
            expect(examples).toContain('Complex patterns:');
            expect(examples).toContain('"console\\\\.log"');
            expect(examples).toContain('"import\\\\s+.*from');
        });

        test('should include tips and best practices', () => {
            const examples = helpSystem.getExamplesHelp();

            expect(examples).toContain('Always quote pattern strings');
            expect(examples).toContain('Use backslashes to escape special characters');
            expect(examples).toContain('Category helps organize related standards');
            expect(examples).toContain('Severity levels: error, warning, info');
        });
    });

    describe('Error Help', () => {
        test('should provide help for empty input error', () => {
            const help = helpSystem.getErrorHelp('EMPTY_INPUT');

            expect(help).toContain('Empty Input Error');
            expect(help).toContain('You didn\'t provide any command');
            expect(help).toContain('/help');
            expect(help).toContain('/add');
            expect(help).toContain('/remove');
        });

        test('should provide help for invalid prefix error', () => {
            const help = helpSystem.getErrorHelp('INVALID_PREFIX');

            expect(help).toContain('Invalid Command Prefix');
            expect(help).toContain('must start with a forward slash (/)');
            expect(help).toContain('Correct:  /add my-rule');
            expect(help).toContain('Wrong:   add my-rule');
        });

        test('should provide help for validation error', () => {
            const help = helpSystem.getErrorHelp('VALIDATION_ERROR');

            expect(help).toContain('Command Validation Error');
            expect(help).toContain('missing or invalid parameters');
            expect(help).toContain('Missing required arguments');
            expect(help).toContain('Invalid severity level');
            expect(help).toContain('Empty pattern or description strings');
        });

        test('should provide help for unrecognized format error', () => {
            const help = helpSystem.getErrorHelp('UNRECOGNIZED_FORMAT');

            expect(help).toContain('Unrecognized Command Format');
            expect(help).toContain('doesn\'t match any known patterns');
            expect(help).toContain('/add <name> "<pattern>" "<description>"');
            expect(help).toContain('/remove <name>');
            expect(help).toContain('/help [topic]');
        });

        test('should provide help for unknown command error', () => {
            const help = helpSystem.getErrorHelp('UNKNOWN_COMMAND');

            expect(help).toContain('Unknown Command');
            expect(help).toContain('isn\'t recognized');
            expect(help).toContain('Add a new coding standard');
            expect(help).toContain('Remove an existing standard');
            expect(help).toContain('Show help information');
        });

        test('should provide generic help for unknown error codes', () => {
            const help = helpSystem.getErrorHelp('UNKNOWN_ERROR_CODE');

            expect(help).toContain('Error Occurred');
            expect(help).toContain('UNKNOWN_ERROR_CODE');
            expect(help).toContain('Check your command syntax');
            expect(help).toContain('Use /help for available commands');
        });
    });

    describe('Categorized Help', () => {
        test('should return categorized help', () => {
            const help = helpSystem.getCategorizedHelp();

            expect(help).toContain('Commands by Category');
            expect(help).toContain('MANAGEMENT:');
            expect(help).toContain('HELP:');
            expect(help).toContain('/add');
            expect(help).toContain('/remove');
            expect(help).toContain('/help');
        });

        test('should include descriptions in categorized help', () => {
            const help = helpSystem.getCategorizedHelp();

            expect(help).toContain('/add');
            expect(help).toContain('Add a new standard rule');
            expect(help).toContain('/remove');
            expect(help).toContain('Remove an existing standard rule');
        });

        test('should include quick reference', () => {
            const help = helpSystem.getCategorizedHelp();

            expect(help).toContain('Quick Reference');
            expect(help).toContain('ADD STANDARD:');
            expect(help).toContain('REMOVE STANDARD:');
            expect(help).toContain('GET HELP:');
        });
    });

    describe('Quick Reference', () => {
        test('should return quick reference guide', () => {
            const quickRef = helpSystem.getQuickReference();

            expect(quickRef).toContain('Quick Reference');
            expect(quickRef).toContain('ADD STANDARD:');
            expect(quickRef).toContain('REMOVE STANDARD:');
            expect(quickRef).toContain('GET HELP:');
            expect(quickRef).toContain('COMMON OPTIONS:');
            expect(quickRef).toContain('PERFORMANCE:');
        });

        test('should include option descriptions', () => {
            const quickRef = helpSystem.getQuickReference();

            expect(quickRef).toContain('--category <name>');
            expect(quickRef).toContain('--technology <name>');
            expect(quickRef).toContain('--severity <level>');
            expect(quickRef).toContain('--tags "<list>"');
            expect(quickRef).toContain('Organize by category');
            expect(quickRef).toContain('Specify technology');
            expect(quickRef).toContain('Set importance level');
            expect(quickRef).toContain('Add tags for discovery');
        });
    });

    describe('Private Helper Methods', () => {
        test('should generate syntax help for add command', () => {
            const addPattern = mockPatterns.get('add')!;
            const syntaxHelp = (helpSystem as any).generateSyntaxHelp(addPattern);

            expect(syntaxHelp).toContain('/add <rule-name> "<pattern>" "<description>" [options]');
            expect(syntaxHelp).toContain('--category <name>');
            expect(syntaxHelp).toContain('--technology <name>');
            expect(syntaxHelp).toContain('--severity <level>');
            expect(syntaxHelp).toContain('--tags "<tags>"');
        });

        test('should generate syntax help for remove command', () => {
            const removePattern = mockPatterns.get('remove')!;
            const syntaxHelp = (helpSystem as any).generateSyntaxHelp(removePattern);

            expect(syntaxHelp).toContain('/remove <rule-name>');
            expect(syntaxHelp).toContain('Remove a standard by its rule name');
        });

        test('should generate syntax help for help command', () => {
            const helpPattern = mockPatterns.get('help') || {
                type: 'help',
                pattern: /^\/help(?:\s+(.+))?$/,
                description: 'Show help information',
                examples: ['/help', '/help add'],
                requiredArgs: [],
                optionalArgs: ['topic']
            };
            const syntaxHelp = (helpSystem as any).generateSyntaxHelp(helpPattern);

            expect(syntaxHelp).toContain('/help [topic]');
            expect(syntaxHelp).toContain('Show help for all commands or specific topic');
        });

        test('should generate command-specific tips for add command', () => {
            const tips = (helpSystem as any).generateCommandSpecificTips('add');

            expect(tips).toContain('TIPS FOR /add:');
            expect(tips).toContain('Pattern must be a valid JavaScript regular expression');
            expect(tips).toContain('Use quotes around pattern and description');
            expect(tips).toContain('PATTERN EXAMPLES:');
        });

        test('should generate command-specific tips for remove command', () => {
            const tips = (helpSystem as any).generateCommandSpecificTips('remove');

            expect(tips).toContain('TIPS FOR /remove:');
            expect(tips).toContain('Use the exact rule name');
            expect(tips).toContain('Removal is immediate and atomic');
            expect(tips).toContain('Cannot be undone');
        });

        test('should generate command-specific tips for help command', () => {
            const tips = (helpSystem as any).generateCommandSpecificTips('help');

            expect(tips).toContain('TIPS FOR /help:');
            expect(tips).toContain('Use without arguments for general help');
            expect(tips).toContain('Specify command name for detailed syntax');
        });
    });

    describe('Integration with Parser', () => {
        test('should work with real parser patterns', () => {
            const help = helpSystem.getCommandHelp('add');

            expect(help).toContain('/ADD');
            expect(help).toContain('Add a new standard rule');
            expect(help).toContain('Required: ruleName, pattern, description');
            expect(help).toContain('Optional: category, technology, severity, tags');
        });

        test('should include real parser examples', () => {
            const help = helpSystem.getGeneralHelp();

            expect(help).toContain('/add my-rule "import-order" "Enforce import order"');
            expect(help).toContain('/remove my-rule');
            expect(help).toContain('/help add');
        });
    });

    describe('Help Content Quality', () => {
        test('should provide consistent formatting', () => {
            const generalHelp = helpSystem.getGeneralHelp();
            const addHelp = helpSystem.getCommandHelp('add');
            const examples = helpSystem.getExamplesHelp();

            // All help should have clear headers
            expect(generalHelp).toContain('╭');
            expect(addHelp).toContain('╭');
            expect(examples).toContain('╭');

            // All help should be well-structured
            expect(generalHelp.split('\n').length).toBeGreaterThan(10);
            expect(addHelp.split('\n').length).toBeGreaterThan(10);
            expect(examples.split('\n').length).toBeGreaterThan(20);
        });

        test('should include actionable advice', () => {
            const errorHelp = helpSystem.getErrorHelp('VALIDATION_ERROR');

            expect(errorHelp).toContain('Common issues:');
            expect(errorHelp).toContain('Examples of correct usage:');
            expect(errorHelp).toContain('Use /help <command> for detailed syntax help');
        });

        test('should include performance expectations', () => {
            const generalHelp = helpSystem.getGeneralHelp();
            const quickRef = helpSystem.getQuickReference();

            expect(generalHelp).toContain('sub-50ms response times');
            expect(quickRef).toContain('All operations < 50ms');
        });
    });
});