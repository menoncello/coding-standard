import {test, expect, describe, beforeAll, afterAll} from 'bun:test';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {spawn} from 'child_process';
import {join} from 'path';

describe('MCP Protocol Integration Tests', () => {
    let client: Client;
    let serverProcess: any;

    beforeAll(async () => {
        // Start the server process
        const serverPath = join(import.meta.dir, '../../src/mcp/server.ts');
        serverProcess = spawn('bun', ['run', serverPath], {
            stdio: ['pipe', 'pipe', 'inherit']
        });

        // Create client transport
        const transport = new StdioClientTransport({
            command: 'bun',
            args: ['run', serverPath],
        });

        client = new Client(
            {
                name: 'test-client',
                version: '1.0.0'
            },
            {
                capabilities: {}
            }
        );

        try {
            await client.connect(transport);
        } catch (error) {
            console.error('Failed to connect to server:', error);
            throw error;
        }
    });

    afterAll(async () => {
        if (client) {
            await client.close();
        }
        if (serverProcess) {
            serverProcess.kill();
        }
    });

    test('should list available tools', async () => {
        const result = await client.listTools();

        expect(result.tools).toHaveLength(6);
        expect(result.tools.map(t => t.name)).toEqual([
            'getStandards',
            'searchStandards',
            'validateCode',
            'addStandard',
            'removeStandard',
            'getRegistryStats'
        ]);

        // Check tool schemas
        const getStandardsTool = result.tools.find(t => t.name === 'getStandards');
        expect(getStandardsTool?.inputSchema).toBeDefined();
        expect(getStandardsTool?.inputSchema.type).toBe('object');
    });

    test('should handle getStandards tool call', async () => {
        const result = await client.callTool({
            name: 'getStandards',
            arguments: {
                technology: 'typescript',
                category: 'naming'
            }
        });

        expect(result.content).toHaveLength(1);
        expect(result.content[0].type).toBe('text');

        const response = JSON.parse(result.content[0].text as string);
        expect(response.standards).toBeDefined();
        expect(response.totalCount).toBeGreaterThanOrEqual(0);
        expect(response.responseTime).toBeGreaterThanOrEqual(0);
        expect(response.serverMetrics).toBeDefined();
    });

    test('should handle searchStandards tool call', async () => {
        const result = await client.callTool({
            name: 'searchStandards',
            arguments: {
                query: 'pascalcase',
                limit: 5
            }
        });

        expect(result.content).toHaveLength(1);
        expect(result.content[0].type).toBe('text');

        const response = JSON.parse(result.content[0].text as string);
        expect(response.results).toBeDefined();
        expect(response.totalCount).toBeGreaterThanOrEqual(0);
        expect(response.responseTime).toBeGreaterThanOrEqual(0);
    });

    test('should handle validateCode tool call', async () => {
        const code = `
class testClass {
  constructor() {
    console.log('hello')
  }
}
    `.trim();

        const result = await client.callTool({
            name: 'validateCode',
            arguments: {
                code,
                language: 'typescript'
            }
        });

        expect(result.content).toHaveLength(1);
        expect(result.content[0].type).toBe('text');

        const response = JSON.parse(result.content[0].text as string);
        expect(response.valid).toBeDefined();
        expect(response.violations).toBeDefined();
        expect(response.score).toBeGreaterThanOrEqual(0);
        expect(response.score).toBeLessThanOrEqual(100);
    });

    test('should handle tool call errors gracefully', async () => {
        await expect(
            client.callTool({
                name: 'getStandards',
                arguments: {
                    technology: 123 // Invalid type
                }
            })
        ).rejects.toThrow();

        await expect(
            client.callTool({
                name: 'searchStandards',
                arguments: {
                    // Missing required 'query' parameter
                }
            })
        ).rejects.toThrow();

        await expect(
            client.callTool({
                name: 'validateCode',
                arguments: {
                    code: 'test'
                    // Missing required 'language' parameter
                }
            })
        ).rejects.toThrow();
    });

    test('should handle addStandard tool call', async () => {
        // Use a unique pattern to avoid conflicts with existing rules
        const uniquePattern = `^Test-[A-Z][a-zA-Z0-9]*-${Date.now()}$`;
        const semanticName = `test-naming-convention-${Date.now()}`;

        const result = await client.callTool({
            name: 'addStandard',
            arguments: {
                semanticName,
                pattern: uniquePattern,
                description: 'Test naming convention for classes',
                category: 'naming',
                technology: 'typescript',
                severity: 'error'
            }
        });

        expect(result.content).toHaveLength(1);
        expect(result.content[0].type).toBe('text');

        const response = JSON.parse(result.content[0].text as string);

        // Check that we got a valid response structure
        expect(response).toHaveProperty('success');
        expect(response).toHaveProperty('message');
        expect(response).toHaveProperty('responseTime');

        // Should be successful with unique pattern
        expect(response.success).toBe(true);
        expect(response.id).toBeDefined();
        expect(response.responseTime).toBeGreaterThanOrEqual(0);
    });

    test('should handle removeStandard tool call', async () => {
        // Use a unique semantic name that likely doesn't exist yet
        const semanticName = `nonexistent-standard-${Date.now()}`;

        const result = await client.callTool({
            name: 'removeStandard',
            arguments: {
                semanticName,
                force: true
            }
        });

        expect(result.content).toHaveLength(1);
        expect(result.content[0].type).toBe('text');

        const response = JSON.parse(result.content[0].text as string);
        expect(response).toHaveProperty('success');
        expect(response).toHaveProperty('message');
        expect(response).toHaveProperty('responseTime');

        // Should handle both existing and non-existent standards
        expect(typeof response.success).toBe('boolean');
        expect(response.responseTime).toBeGreaterThanOrEqual(0);
    });

    test('should handle getRegistryStats tool call', async () => {
        const result = await client.callTool({
            name: 'getRegistryStats',
            arguments: {}
        });

        expect(result.content).toHaveLength(1);
        expect(result.content[0].type).toBe('text');

        const response = JSON.parse(result.content[0].text as string);
        expect(response.registryStats).toBeDefined();
        expect(response.registryStats.totalRules).toBeGreaterThanOrEqual(0);
        expect(response.registryStats.rulesByCategory).toBeDefined();
        expect(response.registryStats.rulesByTechnology).toBeDefined();
        expect(response.responseTime).toBeGreaterThanOrEqual(0);
    });

    test('should handle unknown tool name', async () => {
        await expect(
            client.callTool({
                name: 'unknownTool',
                arguments: {}
            })
        ).rejects.toThrow();
    });
});