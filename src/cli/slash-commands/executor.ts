import {
    SlashCommand,
    AddCommand,
    RemoveCommand,
    HelpCommand,
    UnknownCommand
} from './types.js';
import { StandardsRegistry } from '../../standards/registry.js';
import { StandardRule } from '../../standards/types.js';
import { CommandHelpSystem } from './help.js';
import { performanceMonitor } from '../../utils/performance-monitor.js';

/**
 * Execution result interface
 */
export interface ExecutionResult {
    success: boolean;
    message: string;
    data?: any;
    error?: {
        code: string;
        message: string;
        details?: any;
    };
    executionTime: number;
    warnings?: string[];
}

/**
 * Executor configuration interface
 */
export interface ExecutorConfig {
    allowDestructiveOperations: boolean;
    requireConfirmation: boolean;
    enableAuditLogging: boolean;
    maxExecutionTime: number; // in milliseconds
    enablePerformanceMonitoring: boolean;
}

/**
 * Slash Command Executor for registry integration and command execution
 */
export class SlashCommandExecutor {
    private registry: StandardsRegistry;
    private helpSystem: CommandHelpSystem;
    private config: ExecutorConfig;
    private auditLog: Array<{
        timestamp: number;
        command: string;
        result: ExecutionResult;
        user?: string;
    }> = [];
    private locks: Map<string, Promise<ExecutionResult>> = new Map();

    constructor(
        registry: StandardsRegistry,
        helpSystem: CommandHelpSystem,
        config: Partial<ExecutorConfig> = {}
    ) {
        this.registry = registry;
        this.helpSystem = helpSystem;
        this.config = {
            allowDestructiveOperations: true,
            requireConfirmation: false,
            enableAuditLogging: true,
            maxExecutionTime: 1000, // 1 second default
            enablePerformanceMonitoring: true,
            ...config
        };
    }

    /**
     * Execute a slash command with proper error handling and performance monitoring
     */
    async execute(command: SlashCommand, user?: string): Promise<ExecutionResult> {
        const startTime = Date.now();
        const commandString = command.originalInput;

        try {
            // Ensure registry is initialized
            await this.registry.initialize();

            let result: ExecutionResult;

            switch (command.type) {
                case 'add':
                    result = await this.executeAddCommand(command as AddCommand);
                    break;

                case 'remove':
                    result = await this.executeRemoveCommand(command as RemoveCommand);
                    break;

                case 'help':
                    result = this.executeHelpCommand(command as HelpCommand);
                    break;

                case 'unknown':
                    result = this.executeUnknownCommand(command as UnknownCommand);
                    break;

                default:
                    let defaultExecutionTime = Date.now() - startTime;
                    // Ensure minimum execution time of 1ms to avoid zero timing issues
                    defaultExecutionTime = defaultExecutionTime > 0 ? defaultExecutionTime : 1;
                    result = {
                        success: false,
                        message: `Unsupported command type: ${(command as any).type}`,
                        error: {
                            code: 'UNSUPPORTED_COMMAND',
                            message: 'Command type is not supported'
                        },
                        executionTime: defaultExecutionTime
                    };
            }

            // Log execution if enabled
            const executionTime = Date.now() - startTime;
            // Ensure minimum execution time of 1ms to avoid zero timing issues
            const finalExecutionTime = executionTime > 0 ? executionTime : 1;

            // Always use the main execution time for accurate timing
            result.executionTime = finalExecutionTime;

            // Re-evaluate performance warnings based on final execution time
            if (result.success && finalExecutionTime > 50) {
                result.warnings = result.warnings || [];
                result.warnings.push(`Execution time (${finalExecutionTime}ms) exceeded 50ms target`);
            }

            if (this.config.enableAuditLogging) {
                this.logExecution(commandString, result, user);
            }

            // Record performance metrics if enabled
            if (this.config.enablePerformanceMonitoring) {
                performanceMonitor.recordMetricSimple('slash_command_execution', finalExecutionTime, {
                    commandType: command.type,
                    success: result.success,
                    executionTime: finalExecutionTime
                });
            }

            return result;

        } catch (error) {
            const executionTime = Date.now() - startTime;
            // Ensure execution time is at least 1ms to avoid zero timing issues
            const finalExecutionTime = executionTime > 0 ? executionTime : 1;
            const errorResult: ExecutionResult = {
                success: false,
                message: `Execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                error: {
                    code: 'EXECUTION_ERROR',
                    message: error instanceof Error ? error.message : 'Unknown error',
                    details: error
                },
                executionTime: finalExecutionTime
            };

            if (this.config.enableAuditLogging) {
                this.logExecution(commandString, errorResult, user);
            }

            return errorResult;
        }
    }

    /**
     * Execute an add command to add a new standard rule
     */
    private async executeAddCommand(command: AddCommand): Promise<ExecutionResult> {
        const startTime = Date.now();

        try {
            // Validate pattern is a valid regular expression
            let validatedPattern: string;
            try {
                new RegExp(command.pattern);
                validatedPattern = command.pattern;
            } catch (error) {
                let errorExecutionTime = Date.now() - startTime;
                // Ensure minimum execution time of 1ms to avoid zero timing issues
                errorExecutionTime = errorExecutionTime > 0 ? errorExecutionTime : 1;
                return {
                    success: false,
                    message: `Invalid regular expression pattern: ${command.pattern}`,
                    error: {
                        code: 'INVALID_PATTERN',
                        message: 'Pattern must be a valid JavaScript regular expression',
                        details: error
                    },
                    executionTime: errorExecutionTime
                };
            }

            // Generate a unique ID for the rule
            const ruleId = `rule-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

            // Set default values for optional parameters
            const category = command.category || 'general';
            const technology = command.technology || 'general';
            const severity = command.severity || 'warning';
            const tags = command.tags || [];

            // Create the new standard rule
            const newRule: StandardRule = {
                id: ruleId,
                semanticName: command.ruleName,
                displayName: command.ruleName,
                description: command.description,
                category,
                technology,
                pattern: validatedPattern,
                severity,
                tags,
                examples: [{
                    valid: [],
                    invalid: []
                }],
                relatedRules: [],
                aliases: [],
                deprecated: false,
                metadata: {
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    createdBy: 'slash-command',
                    version: '1.0.0'
                }
            };

            // Add the rule to the registry
            await this.registry.addRule(newRule);

            let executionTime = Date.now() - startTime;
            // Ensure minimum execution time of 1ms to avoid zero timing issues
            executionTime = executionTime > 0 ? executionTime : 1;

            return {
                success: true,
                message: `✅ Successfully added standard "${command.ruleName}"`,
                data: {
                    ruleId,
                    ruleName: command.ruleName,
                    category,
                    technology,
                    severity
                },
                executionTime,
                warnings: executionTime > 50 ? [
                    `Execution time (${executionTime}ms) exceeded 50ms target`
                ] : undefined
            };

        } catch (error) {
            let errorExecutionTime = Date.now() - startTime;
            // Ensure minimum execution time of 1ms to avoid zero timing issues
            errorExecutionTime = errorExecutionTime > 0 ? errorExecutionTime : 1;
            return {
                success: false,
                message: `Failed to add standard "${command.ruleName}": ${error instanceof Error ? error.message : 'Unknown error'}`,
                error: {
                    code: 'ADD_FAILED',
                    message: error instanceof Error ? error.message : 'Unknown error',
                    details: error
                },
                executionTime: errorExecutionTime
            };
        }
    }

    /**
     * Execute a remove command to remove an existing standard rule
     */
    private async executeRemoveCommand(command: RemoveCommand): Promise<ExecutionResult> {
        const startTime = Date.now();

        try {
            // For remove operations, we need exact matching - no fuzzy matches allowed
            // Get all rules and check for exact semantic name match
            const allRules = await this.registry.getAllRules();
            const existingRule = allRules.find(rule => rule.semanticName === command.ruleName);

            if (!existingRule) {
                let errorExecutionTime = Date.now() - startTime;
                // Ensure minimum execution time of 1ms to avoid zero timing issues
                errorExecutionTime = errorExecutionTime > 0 ? errorExecutionTime : 1;
                return {
                    success: false,
                    message: `Standard "${command.ruleName}" not found`,
                    error: {
                        code: 'RULE_NOT_FOUND',
                        message: 'The specified rule does not exist in the registry'
                    },
                    executionTime: errorExecutionTime
                };
            }

            // Remove the rule from the registry
            await this.registry.removeRule(existingRule.id);

            let executionTime = Date.now() - startTime;
            // Ensure minimum execution time of 1ms to avoid zero timing issues
            executionTime = executionTime > 0 ? executionTime : 1;

            return {
                success: true,
                message: `✅ Successfully removed standard "${command.ruleName}"`,
                data: {
                    ruleId: existingRule.id,
                    ruleName: command.ruleName,
                    category: existingRule.category
                },
                executionTime,
                warnings: executionTime > 50 ? [
                    `Execution time (${executionTime}ms) exceeded 50ms target`
                ] : undefined
            };

        } catch (error) {
            let errorExecutionTime = Date.now() - startTime;
            // Ensure minimum execution time of 1ms to avoid zero timing issues
            errorExecutionTime = errorExecutionTime > 0 ? errorExecutionTime : 1;
            return {
                success: false,
                message: `Failed to remove standard "${command.ruleName}": ${error instanceof Error ? error.message : 'Unknown error'}`,
                error: {
                    code: 'REMOVE_FAILED',
                    message: error instanceof Error ? error.message : 'Unknown error',
                    details: error
                },
                executionTime: errorExecutionTime
            };
        }
    }

    /**
     * Execute a help command
     */
    private executeHelpCommand(command: HelpCommand): ExecutionResult {
        const startTime = Date.now();
        const helpText = command.topic
            ? this.helpSystem.getCommandHelp(command.topic)
            : this.helpSystem.getGeneralHelp();

        let executionTime = Date.now() - startTime;
        // Ensure minimum execution time of 1ms to avoid zero timing issues
        executionTime = executionTime > 0 ? executionTime : 1;

        return {
            success: true,
            message: 'Help information retrieved',
            data: {
                help: helpText,
                topic: command.topic
            },
            executionTime
        };
    }

    /**
     * Execute an unknown command with suggestions
     */
    private executeUnknownCommand(command: UnknownCommand): ExecutionResult {
        const startTime = Date.now();

        const suggestions = this.helpSystem.getErrorHelp('UNKNOWN_COMMAND');

        let executionTime = Date.now() - startTime;
        // Ensure minimum execution time of 1ms to avoid zero timing issues
        executionTime = executionTime > 0 ? executionTime : 1;

        return {
            success: false,
            message: `Unknown command: /${command.command}`,
            error: {
                code: 'UNKNOWN_COMMAND',
                message: `The command "/${command.command}" is not recognized`
            },
            data: {
                suggestions,
                attemptedCommand: command.command,
                providedArgs: command.args
            },
            executionTime
        };
    }

    /**
     * Get execution statistics and audit log
     */
    getExecutionStats(): {
        totalExecutions: number;
        successfulExecutions: number;
        failedExecutions: number;
        averageExecutionTime: number;
        recentExecutions: Array<{
            timestamp: number;
            command: string;
            success: boolean;
            executionTime: number;
        }>;
    } {
        const totalExecutions = this.auditLog.length;
        const successfulExecutions = this.auditLog.filter(log => log.result.success).length;
        const failedExecutions = totalExecutions - successfulExecutions;

        const averageExecutionTime = totalExecutions > 0
            ? this.auditLog.reduce((sum, log) => sum + log.result.executionTime, 0) / totalExecutions
            : 0;

        const recentExecutions = this.auditLog.slice(-10).map(log => ({
            timestamp: log.timestamp,
            command: log.command,
            success: log.result.success,
            executionTime: log.result.executionTime
        }));

        return {
            totalExecutions,
            successfulExecutions,
            failedExecutions,
            averageExecutionTime,
            recentExecutions
        };
    }

    /**
     * Clear the audit log
     */
    clearAuditLog(): void {
        this.auditLog = [];
    }

    /**
     * Get audit log entries
     */
    getAuditLog(limit?: number): Array<{
        timestamp: number;
        command: string;
        result: ExecutionResult;
        user?: string;
    }> {
        if (limit) {
            return this.auditLog.slice(-limit);
        }
        return [...this.auditLog];
    }

    /**
     * Update executor configuration
     */
    updateConfig(config: Partial<ExecutorConfig>): void {
        this.config = { ...this.config, ...config };
    }

    /**
     * Log execution to audit trail
     */
    private logExecution(command: string, result: ExecutionResult, user?: string): void {
        this.auditLog.push({
            timestamp: Date.now(),
            command,
            result,
            user
        });

        // Keep audit log size manageable (last 1000 entries)
        if (this.auditLog.length > 1000) {
            this.auditLog = this.auditLog.slice(-1000);
        }
    }

    /**
     * Handle concurrent execution with proper locking
     */
    async executeWithLock(command: SlashCommand, lockKey: string, user?: string): Promise<ExecutionResult> {
        // Simple in-memory locking mechanism
        // In a production environment, you might want to use a proper distributed lock
        if (this.locks.has(lockKey)) {
            return {
                success: false,
                message: 'Command already in progress',
                error: {
                    code: 'CONFLICTING_OPERATION',
                    message: 'Another operation is currently in progress for this resource'
                },
                executionTime: 0
            };
        }

        const executionPromise = this.execute(command, user);
        this.locks.set(lockKey, executionPromise);

        try {
            return await executionPromise;
        } finally {
            this.locks.delete(lockKey);
        }
    }
}