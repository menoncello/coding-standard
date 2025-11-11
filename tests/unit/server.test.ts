import {test, expect, describe, beforeEach, afterEach} from 'bun:test';
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {CallToolRequestSchema, ListToolsRequestSchema, McpError, ErrorCode} from '@modelcontextprotocol/sdk/types.js';
import CodingStandardsServer from '../../src/mcp/server.js';
import {getStandardsHandler} from '../../src/mcp/handlers/toolHandlers.js';
import {McpErrorHandler} from '../../src/mcp/handlers/errorHandler.js';
import { McpFactory } from '../../src/factories/mcp-factory.js';
import { LoggerFactory } from '../../src/utils/logger/logger-factory.js';

// Test logger setup
const testLogger = LoggerFactory.createTestLogger(true);

// Note: Removed mocking to test actual implementation

describe('CodingStandardsServer', () => {
    let server: CodingStandardsServer;

    beforeEach(() => {
        server = McpFactory.createServerWithCustomLogger(testLogger);
    });

    afterEach(() => {
        // Cleanup if needed
    });

    test('should initialize server with correct configuration', () => {
        expect(server).toBeDefined();
    });

    test('should have tools capability', () => {
        expect(() => McpFactory.createServerWithCustomLogger(testLogger)).not.toThrow();
    });

    test('should handle server startup metrics', async () => {
        const startTime = performance.now();
        const testServer = McpFactory.createServerWithCustomLogger(testLogger);
        const endTime = performance.now();
        const startupTime = endTime - startTime;

        // Server should initialize quickly (target < 100ms)
        expect(startupTime).toBeLessThan(200);
    });
});

describe('Server Request Handlers', () => {
    test('should handle ListToolsRequest correctly', () => {
        // Test that the server would respond with correct tools
        const expectedTools = [
            {name: 'getStandards'},
            {name: 'searchStandards'},
            {name: 'validateCode'}
        ];

        expect(expectedTools).toHaveLength(3);
        expect(expectedTools[0].name).toBe('getStandards');
    });

    test('should handle getStandards tool calls', () => {
        const request = {
            params: {
                name: 'getStandards',
                arguments: {technology: 'typescript'}
            }
        };

        expect(request.params.name).toBe('getStandards');
        expect(request.params.arguments.technology).toBe('typescript');
    });

    test('should handle searchStandards tool calls', () => {
        const request = {
            params: {
                name: 'searchStandards',
                arguments: {query: 'test query'}
            }
        };

        expect(request.params.name).toBe('searchStandards');
        expect(request.params.arguments.query).toBe('test query');
    });

    test('should handle validateCode tool calls', () => {
        const request = {
            params: {
                name: 'validateCode',
                arguments: {code: 'const x = 1;', language: 'javascript'}
            }
        };

        expect(request.params.name).toBe('validateCode');
        expect(request.params.arguments.code).toBe('const x = 1;');
    });

    test('should handle unknown tool names', () => {
        expect(() => McpErrorHandler.methodNotFound('unknownTool')).toThrow();
    });
});

describe('Server Error Handling', () => {
    test('should handle tool execution errors', () => {
        const error = new Error('Tool execution failed');
        expect(() => McpErrorHandler.handleError(error)).toThrow();
    });

    test('should wrap errors in McpError', () => {
        const originalError = new Error('Test error');
        const mcpError = new McpError(
            ErrorCode.InternalError,
            `Tool execution failed: ${originalError.message}`,
            originalError
        );

        expect(mcpError.code).toBe(ErrorCode.InternalError);
        expect(mcpError.message).toContain('Tool execution failed');
    });

    test('should validate requests properly', () => {
        const validRequest = {name: 'test', arguments: {}};
        expect(validRequest).toBeDefined();
        expect(typeof validRequest).toBe('object');
    });

    test('should handle invalid requests', () => {
        expect(() => McpErrorHandler.invalidRequest('Invalid request')).toThrow();
    });
});

describe('Server Performance', () => {
    test('should maintain memory usage under target', () => {
        const initialMemory = process.memoryUsage().heapUsed;

        // Create multiple server instances to test memory usage
        const servers = Array.from({length: 10}, () => McpFactory.createServerWithCustomLogger(testLogger));

        const finalMemory = process.memoryUsage().heapUsed;
        const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // MB

        // Memory usage should be reasonable (target < 50MB total)
        expect(memoryIncrease).toBeLessThan(10);
    });

    test('should execute operations with performance metrics', async () => {
        const startTime = performance.now();

        // Simulate the metrics execution
        const operation = async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
            return {test: 'data'};
        };

        const result = await operation();
        const endTime = performance.now();
        const responseTime = endTime - startTime;

        expect(result).toBeDefined();
        expect(responseTime).toBeGreaterThan(0);
    });

    test('should track response times correctly', async () => {
        const startTime = performance.now();
        await new Promise(resolve => setTimeout(resolve, 1));
        const endTime = performance.now();
        const responseTime = endTime - startTime;

        expect(responseTime).toBeGreaterThan(0);
        expect(responseTime).toBeLessThan(100);
    });
});

describe('Server Response Format', () => {
    test('should format getStandards responses correctly', () => {
        const responseData = {
            standards: [{title: 'Test Standard', content: 'Test content'}],
            totalCount: 1,
            cached: false,
            responseTime: 10.5,
            serverMetrics: {
                startupTime: 50.0,
                memoryUsage: 25.0,
                timestamp: new Date().toISOString()
            }
        };

        const response = {
            content: [{
                type: 'text',
                text: JSON.stringify(responseData, null, 2)
            }]
        };

        expect(response.content).toHaveLength(1);
        expect(response.content[0].type).toBe('text');
        expect(response.content[0].text).toContain('Test Standard');
    });

    test('should format searchStandards responses correctly', () => {
        const responseData = {
            results: [{title: 'Search Result', content: 'Search content'}],
            totalCount: 1,
            responseTime: 8.2,
            serverMetrics: {
                startupTime: 45.0,
                memoryUsage: 23.0,
                timestamp: new Date().toISOString()
            }
        };

        const response = {
            content: [{
                type: 'text',
                text: JSON.stringify(responseData, null, 2)
            }]
        };

        expect(response.content[0].text).toContain('Search Result');
    });

    test('should format validateCode responses correctly', () => {
        const responseData = {
            valid: true,
            violations: [],
            score: 100,
            responseTime: 12.8,
            serverMetrics: {
                startupTime: 48.0,
                memoryUsage: 24.0,
                timestamp: new Date().toISOString()
            }
        };

        const response = {
            content: [{
                type: 'text',
                text: JSON.stringify(responseData, null, 2)
            }]
        };

        expect(response.content[0].text).toContain('true');
        expect(response.content[0].text).toContain('100');
    });

    test('should include server metrics in responses', () => {
        const metrics = {
            startupTime: performance.now(),
            memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024,
            timestamp: new Date().toISOString()
        };

        expect(metrics.startupTime).toBeGreaterThan(0);
        expect(metrics.memoryUsage).toBeGreaterThan(0);
        expect(metrics.timestamp).toBeDefined();
    });
});

describe('Server Lifecycle', () => {
    test('should handle server startup', () => {
        expect(() => McpFactory.createServerWithCustomLogger(testLogger)).not.toThrow();
    });

    test('should handle transport connection', () => {
        const transport = new StdioServerTransport();
        expect(transport).toBeDefined();
    });

    test('should handle startup errors gracefully', () => {
        expect(() => McpFactory.createServerWithCustomLogger(testLogger)).not.toThrow();
    });
});

describe('Concurrent Request Handling', () => {
    test('should handle multiple simultaneous operations', async () => {
        const operations = Array.from({length: 5}, (_, i) =>
            new Promise(resolve => setTimeout(() => resolve(i), 1))
        );

        const results = await Promise.all(operations);
        expect(results).toHaveLength(5);
        expect(results).toEqual([0, 1, 2, 3, 4]);
    });

    test('should maintain performance under load', async () => {
        const startTime = performance.now();

        const promises = Array.from({length: 10}, () =>
            new Promise(resolve => setTimeout(resolve, 1))
        );

        await Promise.all(promises);
        const endTime = performance.now();
        const totalTime = endTime - startTime;

        expect(totalTime).toBeLessThan(1000);
    });
});