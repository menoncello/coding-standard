#!/usr/bin/env bun

import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ErrorCode,
    ListToolsRequestSchema,
    McpError,
} from '@modelcontextprotocol/sdk/types.js';
import {
    GET_STANDARDS_TOOL,
    SEARCH_STANDARDS_TOOL,
    VALIDATE_CODE_TOOL,
    ADD_STANDARD_TOOL,
    REMOVE_STANDARD_TOOL,
    REGISTRY_STATS_TOOL,
    GetStandardsRequest,
    SearchStandardsRequest,
    ValidateCodeRequest,
    PerformanceMetrics
} from '../types/mcp.js';
import {McpErrorHandler} from './handlers/errorHandler.js';
import {getStandardsHandler, standardsRegistryHandler} from './handlers/toolHandlers.js';
import {performance} from 'perf_hooks';

class CodingStandardsServer {
    private server: Server;
    private startTime: number;

    constructor() {
        this.startTime = performance.now();
        this.server = new Server(
            {
                name: 'coding-standards-server',
                version: '1.0.0',
            },
            {
                capabilities: {
                    tools: {},
                },
            }
        );

        this.setupHandlers();
    }

    private setupHandlers(): void {
        // List available tools
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    GET_STANDARDS_TOOL,
                    SEARCH_STANDARDS_TOOL,
                    VALIDATE_CODE_TOOL,
                    ADD_STANDARD_TOOL,
                    REMOVE_STANDARD_TOOL,
                    REGISTRY_STATS_TOOL,
                ],
            };
        });

        // Handle tool calls
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const startTime = performance.now();

            try {
                const {name, arguments: args} = request.params;

                switch (name) {
                    case 'getStandards':
                        return await this.handleGetStandards(args as GetStandardsRequest, startTime);

                    case 'searchStandards':
                        return await this.handleSearchStandards(args as SearchStandardsRequest, startTime);

                    case 'validateCode':
                        return await this.handleValidateCode(args as ValidateCodeRequest, startTime);

                    case 'addStandard':
                        return await this.handleAddStandard(args, startTime);

                    case 'removeStandard':
                        return await this.handleRemoveStandard(args, startTime);

                    case 'getRegistryStats':
                        return await this.handleGetRegistryStats(startTime);

                    default:
                        throw McpErrorHandler.methodNotFound(name);
                }
            } catch (error) {
                const mcpError = McpErrorHandler.handleError(error);
                throw new McpError(
                    ErrorCode.InternalError,
                    `Tool execution failed: ${mcpError.message}`,
                    mcpError.data
                );
            }
        });
    }

    private async handleGetStandards(request: GetStandardsRequest, startTime: number) {
        const metrics = await this.executeWithMetrics(
            () => getStandardsHandler.getStandards(request)
        );

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        standards: metrics.result.standards,
                        totalCount: metrics.result.totalCount,
                        responseTime: metrics.responseTime,
                        cached: metrics.result.cached || false,
                        serverMetrics: {
                            startupTime: this.startTime,
                            memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024, // MB
                            timestamp: new Date().toISOString()
                        }
                    }, null, 2)
                }
            ]
        };
    }

    private async handleSearchStandards(request: SearchStandardsRequest, startTime: number) {
        const metrics = await this.executeWithMetrics(
            () => getStandardsHandler.searchStandards(request)
        );

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        results: metrics.result.results,
                        totalCount: metrics.result.totalCount,
                        responseTime: metrics.responseTime,
                        serverMetrics: {
                            startupTime: this.startTime,
                            memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024, // MB
                            timestamp: new Date().toISOString()
                        }
                    }, null, 2)
                }
            ]
        };
    }

    private async handleValidateCode(request: ValidateCodeRequest, startTime: number) {
        const metrics = await this.executeWithMetrics(
            () => getStandardsHandler.validateCode(request)
        );

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        valid: metrics.result.valid,
                        violations: metrics.result.violations,
                        score: metrics.result.score,
                        responseTime: metrics.responseTime,
                        serverMetrics: {
                            startupTime: this.startTime,
                            memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024, // MB
                            timestamp: new Date().toISOString()
                        }
                    }, null, 2)
                }
            ]
        };
    }

    private async handleAddStandard(request: any, startTime: number) {
        const result = await standardsRegistryHandler.addStandard(request);
        const responseTime = performance.now() - startTime;

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        success: result.success,
                        id: result.id,
                        message: result.message,
                        responseTime,
                        serverMetrics: {
                            startupTime: this.startTime,
                            memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024, // MB
                            timestamp: new Date().toISOString()
                        }
                    }, null, 2)
                }
            ]
        };
    }

    private async handleRemoveStandard(request: any, startTime: number) {
        const result = await standardsRegistryHandler.removeStandard(request);
        const responseTime = performance.now() - startTime;

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        success: result.success,
                        message: result.message,
                        responseTime,
                        serverMetrics: {
                            startupTime: this.startTime,
                            memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024, // MB
                            timestamp: new Date().toISOString()
                        }
                    }, null, 2)
                }
            ]
        };
    }

    private async handleGetRegistryStats(startTime: number) {
        const stats = await standardsRegistryHandler.getRegistryStats();
        const responseTime = performance.now() - startTime;

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        registryStats: {
                            totalRules: stats.totalRules,
                            rulesByCategory: stats.rulesByCategory,
                            rulesByTechnology: stats.rulesByTechnology,
                            cacheStats: stats.cacheStats
                        },
                        responseTime,
                        serverMetrics: {
                            startupTime: this.startTime,
                            memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024, // MB
                            timestamp: new Date().toISOString()
                        }
                    }, null, 2)
                }
            ]
        };
    }

    private async executeWithMetrics<T>(operation: () => Promise<T>): Promise<{ result: T; responseTime: number }> {
        const startTime = performance.now();
        const result = await operation();
        const responseTime = performance.now() - startTime;

        return {result, responseTime};
    }

    private validateRequest(request: unknown): void {
        if (!request || typeof request !== 'object') {
            throw McpErrorHandler.invalidRequest('Request must be an object');
        }
    }

    async run(): Promise<void> {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('Coding Standards MCP Server running on stdio');
    }
}

// Start server if this file is run directly
if (import.meta.main) {
    const server = new CodingStandardsServer();
    server.run().catch((error) => {
        console.error('Server failed to start:', error);
        process.exit(1);
    });
}

export default CodingStandardsServer;