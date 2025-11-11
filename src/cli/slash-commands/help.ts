import { CommandPattern, SlashCommandType } from './types.js';

/**
 * Command Help System for providing comprehensive usage documentation
 */
export class CommandHelpSystem {
    private commandPatterns: Map<SlashCommandType, CommandPattern>;

    constructor(commandPatterns: Map<SlashCommandType, CommandPattern> | CommandPattern[]) {
        if (Array.isArray(commandPatterns)) {
            // Convert array to Map
            this.commandPatterns = new Map(commandPatterns.map(pattern => [pattern.type, pattern]));
        } else {
            // Use provided Map directly
            this.commandPatterns = commandPatterns;
        }
    }

    /**
     * Generate comprehensive help text for all commands
     */
    getGeneralHelp(): string {
        const help = `
╭─────────────────────────────────────────────────────────────────╮
│                    Slash Commands Help                         │
│                 Coding Standard Manager                        │
╰─────────────────────────────────────────────────────────────────╯

AVAILABLE COMMANDS:

${this.generateCommandList()}

USAGE EXAMPLES:

${this.generateUsageExamples()}

TIPS:

• Use quotes around parameters containing spaces
• Optional parameters are prefixed with --
• Commands are case-insensitive
• Use tab completion for command suggestions
• All commands maintain sub-50ms response times

GETTING HELP:

• /help              - Show this help message
• /help <command>    - Show detailed help for specific command
• /help examples     - Show more usage examples

PERFORMANCE:

• All commands execute in under 50ms
• Registry operations are atomic and consistent
• concurrency-safe for multiple simultaneous commands

For more information, try:
  /help add     - Learn about adding standards
  /help remove  - Learn about removing standards
`.trim();

        return help;
    }

    /**
     * Generate detailed help for a specific command
     */
    getCommandHelp(commandType?: string): string {
        if (!commandType) {
            return this.getGeneralHelp();
        }

        const normalizedType = commandType.toLowerCase().replace(/^\//, '') as SlashCommandType;
        const pattern = this.commandPatterns.get(normalizedType);

        if (!pattern) {
            return `❌ Unknown command: ${commandType}

Available commands:
${Array.from(this.commandPatterns.keys()).map(cmd => `  /${cmd}`).join('\n')}

Use /help for general assistance.`;
        }

        return this.generateDetailedCommandHelp(pattern);
    }

    /**
     * Generate help examples section
     */
    getExamplesHelp(): string {
        const examples = `
╭─────────────────────────────────────────────────────────────────╮
│                        Usage Examples                          │
╰─────────────────────────────────────────────────────────────────╯

ADDING STANDARDS:

Basic addition:
  /add no-console "no-console" "Disallow console statements"

With category and technology:
  /add import-order "import\\s+from\\s+['"][^'"]+['"]" "Enforce import order" --category style --technology javascript

With severity level:
  /add security-check "eval\\(" "Prevent eval usage" --category security --severity error

With tags:
  /add performance-rule "for\\s*\\(.*\\)\\.length" "Optimize array loops" --tags "performance,optimization"

Complete example:
  /add react-hooks-check "useEffect.*\\[\\s*\\]" "Check React useEffect dependencies" \\
    --category react --technology typescript --severity warning --tags "react,hooks,dependencies"

REMOVING STANDARDS:

Simple removal:
  /remove no-console
  /remove old-security-rule

GETTING HELP:

General help:
  /help

Command-specific help:
  /help add
  /help remove

QUICK TIPS:

• Always quote pattern strings containing special characters
• Use backslashes to escape special characters in patterns
• Category helps organize related standards
• Severity levels: error, warning, info
• Tags help with discovery and filtering

PATTERN EXAMPLES:

Simple text match:
  "console\\\\.log"

Regular expression:
  "import\\\\s+.*from"

Complex patterns:
  "function\\s+\\w+\\([^)]*\\)\\s*\\{"
  "class\\s+\\w+\\s+extends\\s+\\w+"

Remember: All patterns are JavaScript regular expressions!
`.trim();

        return examples;
    }

    /**
     * Generate error-specific help suggestions
     */
    getErrorHelp(errorCode: string, context?: any): string {
        const errorHelp: Record<string, string> = {
            'EMPTY_INPUT': `
⚠️  Empty Input Error

You didn't provide any command. Try one of these:
  /help        - Show available commands
  /add         - Add a new standard
  /remove      - Remove an existing standard
`,

            'INVALID_PREFIX': `
⚠️  Invalid Command Prefix

All commands must start with a forward slash (/).

Correct:  /add my-rule
Wrong:   add my-rule

Available commands:
  /add, /remove, /help
`,

            'VALIDATION_ERROR': `
⚠️  Command Validation Error

Your command has missing or invalid parameters.

Common issues:
• Missing required arguments (rule name, pattern, description)
• Invalid severity level (must be: error, warning, info)
• Empty pattern or description strings

Examples of correct usage:
  /add rule-name "pattern" "Description"
  /remove rule-name

Use /help <command> for detailed syntax help.
`,

            'UNRECOGNIZED_FORMAT': `
⚠️  Unrecognized Command Format

Your command doesn't match any known patterns.

Try these formats:
  /add <name> "<pattern>" "<description>"
  /remove <name>
  /help [topic]

Or use: /help for complete assistance
`,

            'UNKNOWN_COMMAND': `
⚠️  Unknown Command

The command you entered isn't recognized.

Available commands:
  /add     - Add a new coding standard
  /remove  - Remove an existing standard
  /help    - Show help information

Use /help for detailed command information.
`
        };

        const help = errorHelp[errorCode];
        if (help) {
            return help;
        }

        return `
⚠️  Error Occurred

An error occurred while processing your command (${errorCode}).

Suggestions:
• Check your command syntax
• Use /help for available commands
• Try /help <command> for specific command help

If problems persist, please report this issue.
`;
    }

    /**
     * Generate categorized help sections
     */
    getCategorizedHelp(): string {
        const categories = {
            'Management': ['add', 'remove'],
            'Help': ['help']
        };

        let help = `
╭─────────────────────────────────────────────────────────────────╮
│                    Commands by Category                         │
╰─────────────────────────────────────────────────────────────────╯
`;

        for (const [category, commands] of Object.entries(categories)) {
            help += `\n${category.toUpperCase()}:\n`;
            for (const cmd of commands) {
                const pattern = this.commandPatterns.get(cmd as SlashCommandType);
                if (pattern) {
                    help += `  /${cmd.padEnd(10)} ${pattern.description}\n`;
                }
            }
        }

        help += `\n${this.generateQuickReference()}`;

        return help;
    }

    /**
     * Generate quick reference guide
     */
    getQuickReference(): string {
        return this.generateQuickReference();
    }

    /**
     * Generate command list section
     */
    private generateCommandList(): string {
        let list = '';
        for (const [type, pattern] of this.commandPatterns) {
            list += `  /${type.padEnd(7)} ${pattern.description}\n`;
        }
        return list;
    }

    /**
     * Generate usage examples section
     */
    private generateUsageExamples(): string {
        const examples = [
            'Add a simple rule:',
            '  /add my-rule "import-order" "Enforce import order"',
            '',
            'Remove a rule:',
            '  /remove my-rule',
            '',
            'Get command help:',
            '  /help add'
        ];

        return examples.join('\n');
    }

    /**
     * Generate detailed help for a specific command
     */
    private generateDetailedCommandHelp(pattern: CommandPattern): string {
        const requiredArgs = pattern.requiredArgs.length > 0
            ? `Required: ${pattern.requiredArgs.join(', ')}\n`
            : '';

        const optionalArgs = pattern.optionalArgs.length > 0
            ? `Optional: ${pattern.optionalArgs.join(', ')}\n`
            : 'Optional: (none)\n';

        const examples = pattern.examples.map(ex => `  ${ex}`).join('\n');

        return `
╭─────────────────────────────────────────────────────────────────╮
│  /${pattern.type.toUpperCase()}${' '.repeat(48 - pattern.type.length)} │
╰─────────────────────────────────────────────────────────────────╯

DESCRIPTION:
${pattern.description}

SYNTAX:
${this.generateSyntaxHelp(pattern)}

${requiredArgs}${optionalArgs}EXAMPLES:
${examples}

${this.generateCommandSpecificTips(pattern.type)}
`.trim();
    }

    /**
     * Generate syntax help for a command pattern
     */
    private generateSyntaxHelp(pattern: CommandPattern): string {
        switch (pattern.type) {
            case 'add':
                return `/add <rule-name> "<pattern>" "<description>" [options]

Options:
  --category <name>     Category for organization
  --technology <name>   Technology (javascript, typescript, etc.)
  --severity <level>    error | warning | info
  --tags "<tags>"       Comma-separated tags in quotes`;

            case 'remove':
                return `/remove <rule-name>

Remove a standard by its rule name`;

            case 'help':
                return `/help [topic]

Show help for all commands or specific topic`;

            default:
                return `No syntax help available for /${pattern.type}`;
        }
    }

    /**
     * Generate command-specific tips
     */
    private generateCommandSpecificTips(type: SlashCommandType): string {
        const tips: Record<SlashCommandType, string> = {
            'add': `
TIPS FOR /add:
• Pattern must be a valid JavaScript regular expression
• Use quotes around pattern and description
• Escape special characters in patterns with backslashes
• Category helps organize related standards
• Choose appropriate severity level for your team
• Tags improve discoverability and filtering

PATTERN EXAMPLES:
  "console\\\\.log"           - Match console.log
  "import\\\\s+from"          - Match import statements
  "function\\\\s+\\\\w+"       - Match function declarations
  "class\\\\s+\\\\w+\\\\s+extends" - Match class inheritance`,
            'remove': `
TIPS FOR /remove:
• Use the exact rule name you used when adding
• Removal is immediate and atomic
• Cannot be undone - consider carefully
• Check for dependent rules before removing`,
            'help': `
TIPS FOR /help:
• Use without arguments for general help
• Specify command name for detailed syntax
• Try 'examples' for more usage examples`
        };

        return tips[type] || '';
    }

    /**
     * Generate quick reference section
     */
    private generateQuickReference(): string {
        return `
╭─────────────────────────────────────────────────────────────────╮
│                      Quick Reference                            │
╰─────────────────────────────────────────────────────────────────╯

ADD STANDARD:
  /add name "pattern" "description" [--options]

REMOVE STANDARD:
  /remove name

GET HELP:
  /help [command|topic]

COMMON OPTIONS:
  --category <name>     Organize by category
  --technology <name>   Specify technology
  --severity <level>    Set importance level
  --tags "<list>"       Add tags for discovery

PERFORMANCE: All operations < 50ms with atomic consistency
`;
    }
}