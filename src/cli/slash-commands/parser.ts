import {
    SlashCommand,
    SlashCommandType,
    AddCommand,
    RemoveCommand,
    HelpCommand,
    UnknownCommand,
    ParseResult,
    ParseError,
    CommandPattern,
    ParserConfig
} from './types.js';

/**
 * Slash Command Parser for parsing and validating slash command syntax
 */
export class SlashCommandParser {
    private config: ParserConfig;
    private patterns: Map<SlashCommandType, CommandPattern>;

    constructor(config: Partial<ParserConfig> = {}) {
        this.config = {
            strictMode: true,
            allowExtraArgs: false,
            caseSensitive: true,
            customPatterns: {},
            ...config
        };

        this.patterns = new Map([
            ['add', {
                type: 'add',
                pattern: /^\/add\s+([^\s]+(?:\s*"[^"]*")?)\s+"((?:[^"\\]|\\.)*)"\s+"((?:[^"\\]|\\.)*)"(?:\s+--category\s+([^\s]+))?(?:\s+--technology\s+([^\s]+))?(?:\s+--severity\s+([^\s]+))?(?:\s+--tags\s+"([^"]*)")?\s*$/,
                description: 'Add a new standard rule',
                examples: [
                    '/add my-rule "import-order" "Enforce import order"',
                    '/add test-rule "no-console" "Disallow console statements" --category quality --technology javascript --severity error',
                    '/add complex-rule "complex-pattern" "Complex validation" --tags "security,performance"'
                ],
                requiredArgs: ['ruleName', 'pattern', 'description'],
                optionalArgs: ['category', 'technology', 'severity', 'tags']
            }],
            ['remove', {
                type: 'remove',
                pattern: /^\/remove\s+([^\s]+)\s*$/,
                description: 'Remove an existing standard rule',
                examples: [
                    '/remove my-rule',
                    '/remove test-rule'
                ],
                requiredArgs: ['ruleName'],
                optionalArgs: []
            }],
            ['help', {
                type: 'help',
                pattern: /^\/help(?:\s+(.+))?\s*$/,
                description: 'Show help information',
                examples: [
                    '/help',
                    '/help add',
                    '/help remove'
                ],
                requiredArgs: [],
                optionalArgs: ['topic']
            }]
        ]);
    }

    /**
     * Parse a slash command string into a structured command object
     */
    parse(input: string): ParseResult {
        if (!input || typeof input !== 'string') {
            return {
                success: false,
                error: {
                    code: 'EMPTY_INPUT',
                    message: 'Input cannot be empty',
                    suggestions: ['Try `/help` for available commands']
                }
            };
        }

        const trimmedInput = input.trim();
        const originalInput = input;

        if (!trimmedInput.startsWith('/')) {
            return {
                success: false,
                error: {
                    code: 'INVALID_PREFIX',
                    message: 'Commands must start with /',
                    position: 0,
                    expected: ['/', 'command name'],
                    suggestions: ['Add / at the beginning of your command', 'Try `/help` for available commands']
                }
            };
        }

        // First check if this looks like a basic slash command format
        const unknownPattern = this.config.caseSensitive
            ? /^\/([^\s]+)(?:\s+(.*))?$/
            : /^\/([^\s]+)(?:\s+(.*))?$/i;
        const unknownMatch = trimmedInput.match(unknownPattern);

        if (!unknownMatch) {
            return {
                success: false,
                error: {
                    code: 'UNRECOGNIZED_FORMAT',
                    message: 'Command format not recognized',
                    suggestions: ['Try `/help` for available commands', 'Check command syntax and try again']
                }
            };
        }

        const [, rawCommand, argsString] = unknownMatch;
        const command = this.config.caseSensitive ? rawCommand : rawCommand.toLowerCase();

        // Store args for potential unknown command fallback
        const args = argsString ? argsString.trim().split(/\s+/).filter(arg => arg.length > 0) : [];

        // Try each pattern in order - include custom patterns
        for (const [commandType, pattern] of this.patterns) {
            // Create case-sensitive or case-insensitive pattern based on config
            const searchPattern = this.config.caseSensitive
                ? pattern.pattern
                : new RegExp(pattern.pattern.source, pattern.pattern.flags.replace('i', '') + 'i');

            const match = trimmedInput.match(searchPattern);
            if (match) {
                return this.createCommandFromMatch(commandType, match, trimmedInput, originalInput);
            }
        }

        // If no patterns matched, determine if it's a known command with bad syntax or truly unknown
        const builtInCommands = ['add', 'remove', 'help'];
        const isKnownBuiltInCommand = builtInCommands.includes(command);
        const isCurrentlySupported = this.patterns.has(command as SlashCommandType);

        if (isKnownBuiltInCommand && isCurrentlySupported) {
            // This is a known command but with invalid format - use VALIDATION_ERROR for syntax issues
            return {
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: `Invalid syntax for /${command} command`,
                    position: trimmedInput.indexOf(command) + 1,
                    expected: ['correct syntax'],
                    suggestions: [`Check /help ${command} for proper syntax`, 'Verify all required parameters are provided']
                }
            };
        }

        // Return unknown command for truly unrecognized commands
        return {
            success: true,
            command: {
                type: 'unknown',
                rawInput: trimmedInput,
                originalInput,
                command: command,
                args
            } as UnknownCommand
        };
    }

    /**
     * Validate a parsed command object
     */
    validate(command: SlashCommand): { isValid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (!command) {
            errors.push('Command cannot be null or undefined');
            return { isValid: false, errors };
        }

        switch (command.type) {
            case 'add':
                const addCmd = command as AddCommand;
                if (!addCmd.ruleName || addCmd.ruleName.trim().length === 0) {
                    errors.push('Rule name is required');
                }
                if (!addCmd.pattern || addCmd.pattern.trim().length === 0) {
                    errors.push('Pattern is required');
                }
                if (!addCmd.description || typeof addCmd.description !== 'string' || addCmd.description.trim().length === 0) {
                    errors.push('Description is required');
                }
                if (addCmd.severity && !['error', 'warning', 'info'].includes(addCmd.severity)) {
                    errors.push('Severity must be one of: error, warning, info');
                }
                break;

            case 'remove':
                const removeCmd = command as RemoveCommand;
                if (!removeCmd.ruleName || removeCmd.ruleName.trim().length === 0) {
                    errors.push('Rule name is required');
                }
                break;

            case 'help':
                // Help commands are always valid
                break;

            case 'unknown':
                if (this.config.strictMode) {
                    errors.push(`Unknown command: ${(command as UnknownCommand).command}`);
                }
                break;

            default:
                // Custom commands are considered valid if they have the basic structure
                if (!command.type || !command.rawInput || !command.originalInput) {
                    errors.push('Custom command missing required properties');
                }
                break;
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Get command suggestions based on partial input
     */
    getSuggestions(partialInput: string): string[] {
        const suggestions: string[] = [];
        const trimmed = partialInput.trim();

        if (trimmed.length === 0 || trimmed === '/') {
            return ['/add', '/remove', '/help'];
        }

        // If it starts with / but isn't complete, suggest command completions
        if (trimmed.startsWith('/')) {
            const commandPart = trimmed.substring(1);
            for (const [type, pattern] of this.patterns) {
                if (type.startsWith(commandPart)) {
                    suggestions.push(`/${type}`);
                }
            }
        }

        // If it's a known command, suggest examples
        for (const [type, pattern] of this.patterns) {
            if (trimmed === `/${type}`) {
                suggestions.push(...pattern.examples.slice(0, 3));
            }
        }

        return suggestions;
    }

    /**
     * Get all available command patterns
     */
    getAvailableCommands(): CommandPattern[] {
        return Array.from(this.patterns.values());
    }

    /**
     * Check if a command type is supported
     */
    isCommandSupported(commandType: string): boolean {
        return this.patterns.has(commandType as SlashCommandType);
    }

    /**
     * Create a command object from a regex match
     */
    private createCommandFromMatch(
        type: SlashCommandType,
        match: RegExpMatchArray,
        rawInput: string,
        originalInput: string
    ): ParseResult {
        try {
            let command: SlashCommand;

            switch (type) {
                case 'add': {
                    const [, ruleName, pattern, description, category, technology, severity, tags] = match;

                    // Parse tags from comma-separated string if present
                    let parsedTags: string[] = [];
                    if (tags) {
                        parsedTags = tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
                    }

                    command = {
                        type: 'add',
                        rawInput,
                        originalInput,
                        ruleName: this.processQuotedValue(ruleName),
                        pattern: this.unescapeQuotes(pattern),
                        description: this.unescapeQuotes(description),
                        category: category?.trim(),
                        technology: technology?.trim(),
                        severity: severity as 'error' | 'warning' | 'info' || undefined,
                        tags: parsedTags.length > 0 ? parsedTags : undefined
                    } as AddCommand;
                    break;
                }

                case 'remove': {
                    const [, ruleName] = match;
                    command = {
                        type: 'remove',
                        rawInput,
                        originalInput,
                        ruleName: ruleName.trim()
                    } as RemoveCommand;
                    break;
                }

                case 'help': {
                    const [, topic] = match;
                    command = {
                        type: 'help',
                        rawInput,
                        originalInput,
                        topic: topic?.trim() || undefined
                    } as HelpCommand;
                    break;
                }

                default: {
                    // Handle custom commands
                    const pattern = this.patterns.get(type);
                    if (pattern && this.config.customPatterns?.[type]) {
                        // For custom commands, create a generic command object with all matched groups
                        const commandData: any = {
                            type: type,
                            rawInput,
                            originalInput
                        };

                        // Add named capture groups or indexed groups to command data
                        if (match.groups) {
                            Object.assign(commandData, match.groups);
                        } else {
                            // For simple patterns, add the first capture group as 'args'
                            if (match[1]) {
                                commandData.args = match[1];
                            }
                        }

                        command = commandData as SlashCommand;
                        break;
                    }

                    return {
                        success: false,
                        error: {
                            code: 'UNSUPPORTED_COMMAND',
                            message: `Command type ${type} is not supported`,
                            suggestions: ['Try `/help` for available commands']
                        }
                    };
                }
            }

            const validation = this.validate(command);
            if (!validation.isValid) {
                return {
                    success: false,
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: validation.errors.join('; '),
                        suggestions: ['Check command syntax and required parameters', 'Try `/help` for examples']
                    }
                };
            }

            return {
                success: true,
                command
            };

        } catch (error) {
            return {
                success: false,
                error: {
                    code: 'PARSE_ERROR',
                    message: `Failed to parse command: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    suggestions: ['Check command syntax and try again', 'Try `/help` for examples']
                }
            };
        }
    }

    /**
     * Process quoted values for rule names, handling both quoted and unquoted values
     */
    private processQuotedValue(str: string): string {
        const trimmed = str.trim();

        // Handle empty quoted strings ""
        if (trimmed === '""') {
            return '';
        }

        // Handle quoted strings with content
        if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
            return this.unescapeQuotes(trimmed.slice(1, -1));
        }

        // Handle unquoted values
        return trimmed;
    }

    /**
     * Unescape quoted strings, handling common escape sequences
     */
    private unescapeQuotes(str: string): string {
        return str
            .replace(/\\"/g, '"')
            .replace(/\\n/g, '\n')
            .replace(/\\t/g, '\t')
            .replace(/\\\\/g, '\\');
    }

    /**
     * Add a custom command pattern
     */
    addCustomPattern(pattern: CommandPattern): void {
        // Store in config for persistence
        if (this.config.customPatterns) {
            this.config.customPatterns[pattern.type] = pattern;
        }
        // Add to active patterns map
        this.patterns.set(pattern.type, pattern);
    }

    /**
     * Remove a command pattern
     */
    removePattern(type: SlashCommandType): void {
        this.patterns.delete(type);
        if (this.config.customPatterns?.[type]) {
            delete this.config.customPatterns[type];
        }
    }

    /**
     * Update parser configuration
     */
    updateConfig(config: Partial<ParserConfig>): void {
        this.config = { ...this.config, ...config };
        // Note: Patterns are already dynamic in the parse method based on caseSensitivity
    }
}