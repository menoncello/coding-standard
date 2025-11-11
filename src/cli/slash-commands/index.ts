import { SlashCommandParser } from './parser.js';
import { CommandHelpSystem } from './help.js';
import { SlashCommandExecutor } from './executor.js';
import { StandardsRegistry } from '../../standards/registry.js';
import { ParserConfig, ExecutorConfig } from './types.js';

/**
 * Slash Command Interface - Main entry point for slash command functionality
 */
export class SlashCommandInterface {
    private parser: SlashCommandParser;
    private helpSystem: CommandHelpSystem;
    private executor: SlashCommandExecutor;
    private registry: StandardsRegistry;

    constructor(
        registry: StandardsRegistry,
        parserConfig?: Partial<ParserConfig>,
        executorConfig?: Partial<ExecutorConfig>
    ) {
        this.registry = registry;
        this.parser = new SlashCommandParser(parserConfig);
        this.helpSystem = new CommandHelpSystem(this.parser.getAvailableCommands());
        this.executor = new SlashCommandExecutor(registry, this.helpSystem, executorConfig);
    }

    /**
     * Process a slash command string and return the result
     */
    async processCommand(input: string, user?: string) {
        const startTime = Date.now();

        try {
            // Parse the command
            const parseResult = this.parser.parse(input);

            if (!parseResult.success) {
                // Get help for the specific error
                const errorHelp = parseResult.error?.code
                    ? this.helpSystem.getErrorHelp(parseResult.error.code)
                    : this.helpSystem.getErrorHelp('UNRECOGNIZED_FORMAT');

                // Extract suggestions from error or use formatted help as fallback
                let suggestions: string[];
                if (parseResult.error?.suggestions && Array.isArray(parseResult.error.suggestions)) {
                    suggestions = parseResult.error.suggestions;
                } else {
                    // Extract simple suggestions from the formatted help text
                    suggestions = this.extractSimpleSuggestions(errorHelp);
                }

                return {
                    success: false,
                    message: parseResult.error?.message || 'Command parsing failed',
                    error: parseResult.error,
                    suggestions,
                    executionTime: Date.now() - startTime
                };
            }

            // Execute the parsed command
            const executionResult = await this.executor.execute(parseResult.command!, user);

            // Add suggestions for help commands
            if (parseResult.command?.type === 'help') {
                return {
                    ...executionResult,
                    data: {
                        ...executionResult.data,
                        formatAsHelp: true
                    }
                };
            }

            return executionResult;

        } catch (error) {
            return {
                success: false,
                message: `Command processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                error: {
                    code: 'PROCESSING_ERROR',
                    message: error instanceof Error ? error.message : 'Unknown error'
                },
                suggestions: this.helpSystem.getErrorHelp('UNRECOGNIZED_FORMAT'),
                executionTime: Date.now() - startTime
            };
        }
    }

    /**
     * Get command suggestions based on partial input
     */
    getSuggestions(partialInput: string): string[] {
        return this.parser.getSuggestions(partialInput);
    }

    /**
     * Get comprehensive help information
     */
    getHelp(topic?: string): string {
        return this.helpSystem.getCommandHelp(topic);
    }

    /**
     * Get usage examples
     */
    getExamples(): string {
        return this.helpSystem.getExamplesHelp();
    }

    /**
     * Get categorized help
     */
    getCategorizedHelp(): string {
        return this.helpSystem.getCategorizedHelp();
    }

    /**
     * Get quick reference
     */
    getQuickReference(): string {
        return this.helpSystem.getQuickReference();
    }

    /**
     * Get execution statistics
     */
    getStats() {
        return this.executor.getExecutionStats();
    }

    /**
     * Get audit log
     */
    getAuditLog(limit?: number) {
        return this.executor.getAuditLog(limit);
    }

    /**
     * Clear audit log
     */
    clearAuditLog(): void {
        this.executor.clearAuditLog();
    }

    /**
     * Get available commands
     */
    getAvailableCommands() {
        return this.parser.getAvailableCommands();
    }

    /**
     * Check if a command is supported
     */
    isCommandSupported(commandType: string): boolean {
        return this.parser.isCommandSupported(commandType);
    }

    /**
     * Validate command syntax without executing
     */
    validateCommand(input: string) {
        const parseResult = this.parser.parse(input);
        return {
            isValid: parseResult.success,
            errors: parseResult.error ? [parseResult.error] : [],
            suggestions: parseResult.error?.suggestions || []
        };
    }

    /**
     * Update parser configuration
     */
    updateParserConfig(config: Partial<ParserConfig>): void {
        this.parser.updateConfig(config);
        // Update help system with new patterns
        this.helpSystem = new CommandHelpSystem(this.parser.getAvailableCommands());
        this.executor = new SlashCommandExecutor(this.registry, this.helpSystem);
    }

    /**
     * Update executor configuration
     */
    updateExecutorConfig(config: Partial<ExecutorConfig>): void {
        this.executor.updateConfig(config);
    }

    /**
     * Extract simple suggestions from formatted help text
     */
    private extractSimpleSuggestions(helpText: string): string[] {
        const suggestions: string[] = [];
        const lines = helpText.split('\n');

        for (const line of lines) {
            const trimmed = line.trim();
            // Look for lines that contain specific suggestion patterns
            if (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.includes('Add / at the beginning')) {
                // Extract the core suggestion text
                if (trimmed.includes('Add / at the beginning')) {
                    suggestions.push('Add / at the beginning of your command');
                } else if (trimmed.includes('Try')) {
                    const match = trimmed.match(/Try\s+`([^`]+)`/);
                    if (match) {
                        suggestions.push(match[1]);
                    }
                }
            }
        }

        // Fallback suggestions if none found
        if (suggestions.length === 0) {
            suggestions.push('Try `/help` for available commands');
        }

        return suggestions;
    }

    /**
     * Close the interface and cleanup resources
     */
    close(): void {
        // Registry cleanup is handled by the caller
    }
}

// Export types and classes
export { SlashCommandParser } from './parser.js';
export { CommandHelpSystem } from './help.js';
export { SlashCommandExecutor } from './executor.js';
export * from './types.js';