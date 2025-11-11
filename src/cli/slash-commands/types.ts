/**
 * Type definitions for Slash Command System
 */

export type SlashCommandType = 'add' | 'remove' | 'help' | 'unknown' | string;

export interface SlashCommand {
    type: SlashCommandType;
    rawInput: string;
    originalInput: string;
}

export interface AddCommand extends SlashCommand {
    type: 'add';
    ruleName: string;
    pattern: string;
    description: string;
    category?: string;
    technology?: string;
    severity?: 'error' | 'warning' | 'info';
    tags?: string[];
}

export interface RemoveCommand extends SlashCommand {
    type: 'remove';
    ruleName: string;
}

export interface HelpCommand extends SlashCommand {
    type: 'help';
    topic?: string;
}

export interface UnknownCommand extends SlashCommand {
    type: 'unknown';
    command: string;
    args: string[];
}

export interface ParseResult {
    success: boolean;
    command?: SlashCommand;
    error?: ParseError;
    suggestions?: string[];
}

export interface ParseError {
    code: string;
    message: string;
    position?: number;
    expected?: string[];
    suggestions?: string[];
}

export interface CommandValidationResult {
    isValid: boolean;
    errors: CommandValidationError[];
    warnings: CommandValidationWarning[];
}

export interface CommandValidationError {
    field: string;
    message: string;
    code: string;
    value?: any;
}

export interface CommandValidationWarning {
    field: string;
    message: string;
    code: string;
    value?: any;
}

export interface CommandPattern {
    type: SlashCommandType;
    pattern: RegExp;
    description: string;
    examples: string[];
    requiredArgs: string[];
    optionalArgs: string[];
}

export interface ParserConfig {
    strictMode: boolean;
    allowExtraArgs: boolean;
    caseSensitive: boolean;
    customPatterns?: Record<string, CommandPattern>;
}