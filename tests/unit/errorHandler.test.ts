import {test, expect, describe} from 'bun:test';
import {McpErrorHandler} from '../../src/mcp/handlers/errorHandler.js';

describe('McpErrorHandler', () => {
    test('should create error with code and message', () => {
        const error = McpErrorHandler.createError(-32600, 'Test error');

        expect(error).toBeInstanceOf(Error);
        expect(error.message).toBe('Test error');
        expect(error.code).toBe(-32600);
    });

    test('should create error with data', () => {
        const testData = {field: 'value'};
        const error = McpErrorHandler.createError(-32602, 'Invalid params', testData);

        expect(error.code).toBe(-32602);
        expect(error.data).toEqual(testData);
    });

    test('should create specific error types', () => {
        const invalidRequest = McpErrorHandler.invalidRequest('Bad request');
        expect(invalidRequest.code).toBe(-32600);
        expect(invalidRequest.message).toBe('Invalid Request: Bad request');

        const methodNotFound = McpErrorHandler.methodNotFound('unknownMethod');
        expect(methodNotFound.code).toBe(-32601);
        expect(methodNotFound.message).toBe('Method not found: unknownMethod');

        const invalidParams = McpErrorHandler.invalidParams('Bad params');
        expect(invalidParams.code).toBe(-32602);
        expect(invalidParams.message).toBe('Invalid params: Bad params');

        const internalError = McpErrorHandler.internalError('Server error');
        expect(internalError.code).toBe(-32603);
        expect(internalError.message).toBe('Internal error: Server error');

        const parseError = McpErrorHandler.parseError('JSON error');
        expect(parseError.code).toBe(-32700);
        expect(parseError.message).toBe('Parse error: JSON error');
    });

    test('should identify MCP errors', () => {
        const mcpError = McpErrorHandler.invalidRequest('Test');
        const regularError = new Error('Regular error');

        expect(McpErrorHandler.isMcpError(mcpError)).toBe(true);
        expect(McpErrorHandler.isMcpError(regularError)).toBe(false);
    });

    test('should handle different error types', () => {
        const mcpError = McpErrorHandler.invalidRequest('Original');
        const regularError = new Error('Regular');
        const stringError = 'String error';
        const unknownError = {type: 'object'};

        expect(McpErrorHandler.handleError(mcpError)).toBe(mcpError);

        const handledRegular = McpErrorHandler.handleError(regularError);
        expect(handledRegular.code).toBe(-32603);
        expect(handledRegular.message).toBe('Internal error: Regular');

        const handledString = McpErrorHandler.handleError(stringError);
        expect(handledString.code).toBe(-32603);
        expect(handledString.message).toBe('Internal error: String error');

        const handledUnknown = McpErrorHandler.handleError(unknownError);
        expect(handledUnknown.code).toBe(-32603);
        expect(handledUnknown.message).toBe('Internal error: Unknown error occurred');
    });
});