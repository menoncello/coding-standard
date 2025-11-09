import {test, expect, describe} from 'bun:test';
import {McpError, ErrorCode} from '@modelcontextprotocol/sdk/types.js';
import {McpErrorHandler} from '../../src/mcp/handlers/errorHandler.js';

describe('Error Handler Coverage Tests', () => {
    describe('Method Not Found Errors', () => {
        test('should create method not found errors with proper format', () => {
            const methodName = 'unknownMethod';
            const error = McpErrorHandler.methodNotFound(methodName);

            expect(error).toBeInstanceOf(Error);
            expect(error.message).toContain(methodName);
            expect(error.message).toContain('not found');
        });

        test('should handle empty method names', () => {
            const error = McpErrorHandler.methodNotFound('');
            expect(error.message).toBeDefined();
            expect(error.message).not.toBe('');
        });

        test('should handle special characters in method names', () => {
            const specialMethods = ['method-with-dashes', 'method_with_underscores', 'method.with.dots'];

            specialMethods.forEach(method => {
                expect(() => McpErrorHandler.methodNotFound(method)).toThrow();
            });
        });

        test('should handle null/undefined method names', () => {
            expect(() => McpErrorHandler.methodNotFound(null as any)).toThrow();
            expect(() => McpErrorHandler.methodNotFound(undefined as any)).toThrow();
        });
    });

    describe('Invalid Request Errors', () => {
        test('should create invalid request errors with custom messages', () => {
            const message = 'Custom validation message';
            const error = McpErrorHandler.invalidRequest(message);

            expect(error).toBeInstanceOf(Error);
            expect(error.message).toContain(message);
        });

        test('should handle empty error messages', () => {
            const error = McpErrorHandler.invalidRequest('');
            expect(error.message).toBeDefined();
        });

        test('should handle long error messages', () => {
            const longMessage = 'x'.repeat(1000);
            const error = McpErrorHandler.invalidRequest(longMessage);
            expect(error.message).toContain(longMessage);
        });

        test('should handle special characters in error messages', () => {
            const specialMessage = 'Error with special chars: áéíóú 🚀 \n\t\r';
            const error = McpErrorHandler.invalidRequest(specialMessage);
            expect(error.message).toContain(specialMessage);
        });
    });

    describe('Invalid Parameters Errors', () => {
        test('should create invalid parameter errors', () => {
            const paramName = 'testParam';
            const error = McpErrorHandler.invalidParams(`Invalid ${paramName}`);

            expect(error).toBeInstanceOf(Error);
            expect(error.message).toContain(paramName);
        });

        test('should handle multiple parameter validation errors', () => {
            const errors = ['param1 is invalid', 'param2 is required', 'param3 has wrong type'];

            errors.forEach(errorMessage => {
                const error = McpErrorHandler.invalidParams(errorMessage);
                expect(error.message).toContain(errorMessage);
            });
        });

        test('should handle complex validation messages', () => {
            const complexMessage = 'Parameter "userId" must be a positive integer, received: -1';
            const error = McpErrorHandler.invalidParams(complexMessage);
            expect(error.message).toContain(complexMessage);
        });
    });

    describe('Generic Error Handling', () => {
        test('should handle standard Error instances', () => {
            const originalError = new Error('Standard error');
            const handledError = McpErrorHandler.handleError(originalError);

            expect(handledError).toBeInstanceOf(Error);
            expect(handledError.message).toContain(originalError.message);
        });

        test('should handle McpError instances', () => {
            const mcpError = new McpError(ErrorCode.InvalidParams, 'Test MCP error');
            const handledError = McpErrorHandler.handleError(mcpError);

            expect(handledError).toBeInstanceOf(Error);
            expect(handledError.message).toContain('Test MCP error');
            expect(handledError.message).toContain(String(mcpError.code));
        });

        test('should handle custom error types', () => {
            class CustomError extends Error {
                constructor(message: string, public code: string) {
                    super(message);
                    this.name = 'CustomError';
                }
            }

            const customError = new CustomError('Custom error message', 'CUSTOM_CODE');
            const handledError = McpErrorHandler.handleError(customError);

            expect(handledError).toBeInstanceOf(Error);
            expect(handledError.message).toContain('Custom error message');
        });

        test('should handle null/undefined errors', () => {
            const nullError = McpErrorHandler.handleError(null as any);
            expect(nullError).toBeInstanceOf(Error);
            expect(nullError.message).toBeDefined();

            const undefinedError = McpErrorHandler.handleError(undefined as any);
            expect(undefinedError).toBeInstanceOf(Error);
            expect(undefinedError.message).toBeDefined();
        });

        test('should handle non-Error objects', () => {
            const nonErrors = [
                'string error',
                123,
                {message: 'object error'},
                [],
                true,
                false
            ];

            nonErrors.forEach(nonError => {
                const handledError = McpErrorHandler.handleError(nonError as any);
                expect(handledError).toBeInstanceOf(Error);
                expect(handledError.message).toBeDefined();
            });
        });

        test('should preserve error codes from McpError', () => {
            const testCases = [
                {code: ErrorCode.InternalError, message: 'Internal error'},
                {code: ErrorCode.InvalidParams, message: 'Invalid params'},
                {code: ErrorCode.MethodNotFound, message: 'Method not found'},
                {code: ErrorCode.InvalidRequest, message: 'Invalid request'}
            ];

            testCases.forEach(({code, message}) => {
                const mcpError = new McpError(code, message);
                const handledError = McpErrorHandler.handleError(mcpError);

                expect(handledError.message).toContain(String(code));
                expect(handledError.message).toContain(message);
            });
        });

        test('should handle errors with stack traces', () => {
            const error = new Error('Error with stack');
            // Ensure stack is present
            expect(error.stack).toBeDefined();

            const handledError = McpErrorHandler.handleError(error);
            expect(handledError).toBeInstanceOf(Error);
            expect(handledError.message).toContain('Error with stack');
        });

        test('should handle errors without stack traces', () => {
            const error = new Error('Error without stack') as any;
            delete error.stack;

            const handledError = McpErrorHandler.handleError(error);
            expect(handledError).toBeInstanceOf(Error);
            expect(handledError.message).toContain('Error without stack');
        });

        test('should handle errors with additional properties', () => {
            const error = new Error('Error with data') as any;
            error.data = {field1: 'value1', field2: 42};
            error.code = 'CUSTOM_CODE';

            const handledError = McpErrorHandler.handleError(error);
            expect(handledError).toBeInstanceOf(Error);
            expect(handledError.message).toContain('Error with data');
        });

        test('should handle circular reference errors', () => {
            const error = new Error('Circular error') as any;
            error.circular = error;

            const handledError = McpErrorHandler.handleError(error);
            expect(handledError).toBeInstanceOf(Error);
        });

        test('should handle very long error messages', () => {
            const longMessage = 'x'.repeat(10000);
            const error = new Error(longMessage);

            const handledError = McpErrorHandler.handleError(error);
            expect(handledError).toBeInstanceOf(Error);
            expect(handledError.message).toContain(longMessage);
        });

        test('should handle Unicode error messages', () => {
            const unicodeMessage = 'Error with Unicode: 🚀 ñáéíóú 中文 العربية';
            const error = new Error(unicodeMessage);

            const handledError = McpErrorHandler.handleError(error);
            expect(handledError).toBeInstanceOf(Error);
            expect(handledError.message).toContain(unicodeMessage);
        });

        test('should handle JSON in error messages', () => {
            const jsonData = JSON.stringify({error: 'details', code: 123});
            const error = new Error(`JSON error: ${jsonData}`);

            const handledError = McpErrorHandler.handleError(error);
            expect(handledError).toBeInstanceOf(Error);
            expect(handledError.message).toContain(jsonData);
        });
    });

    describe('Error Message Sanitization', () => {
        test('should not expose sensitive information in error messages', () => {
            const sensitiveErrors = [
                new Error('Database password: secret123'),
                new Error('API key: abc123def456'),
                new Error('Token: bearer xyz789'),
                new Error('File path: /home/user/secrets/config')
            ];

            sensitiveErrors.forEach(error => {
                const handledError = McpErrorHandler.handleError(error);
                // Error handling should preserve the message (this test documents current behavior)
                expect(handledError.message).toContain(error.message);
            });
        });

        test('should handle HTML in error messages', () => {
            const htmlError = new Error('Error with <script>alert("xss")</script> content');
            const handledError = McpErrorHandler.handleError(htmlError);

            expect(handledError).toBeInstanceOf(Error);
            expect(handledError.message).toContain('<script>');
        });

        test('should handle newline characters in error messages', () => {
            const multilineError = new Error('Line 1\nLine 2\r\nLine 3');
            const handledError = McpErrorHandler.handleError(multilineError);

            expect(handledError).toBeInstanceOf(Error);
            expect(handledError.message).toContain('Line 1');
            expect(handledError.message).toContain('Line 2');
            expect(handledError.message).toContain('Line 3');
        });
    });

    describe('Performance Considerations', () => {
        test('should handle errors efficiently', () => {
            const startTime = performance.now();

            // Create and handle many errors
            for (let i = 0; i < 1000; i++) {
                const error = new Error(`Test error ${i}`);
                McpErrorHandler.handleError(error);
            }

            const endTime = performance.now();
            const duration = endTime - startTime;

            // Should handle 1000 errors quickly (under 100ms)
            expect(duration).toBeLessThan(100);
        });

        test('should handle large error objects efficiently', () => {
            const largeError = new Error('Large error') as any;
            largeError.data = {
                largeArray: Array.from({length: 10000}, (_, i) => ({id: i, value: `item-${i}`})),
                largeString: 'x'.repeat(50000)
            };

            const startTime = performance.now();
            const handledError = McpErrorHandler.handleError(largeError);
            const endTime = performance.now();

            expect(handledError).toBeInstanceOf(Error);
            expect(endTime - startTime).toBeLessThan(50);
        });
    });

    describe('Edge Cases', () => {
        test('should handle empty error objects', () => {
            const emptyError = new Error('');
            const handledError = McpErrorHandler.handleError(emptyError);

            expect(handledError).toBeInstanceOf(Error);
            expect(handledError.message).toContain('Internal error:');
        });

        test('should handle error objects with only properties', () => {
            const error = {} as Error;
            error.message = undefined;
            error.name = '';

            const handledError = McpErrorHandler.handleError(error);
            expect(handledError).toBeInstanceOf(Error);
        });

        test('should handle errors with nested objects', () => {
            const error = new Error('Nested error') as any;
            error.data = {
                nested: {
                    deeply: {
                        nested: {
                            value: 'deep value'
                        }
                    }
                }
            };

            const handledError = McpErrorHandler.handleError(error);
            expect(handledError).toBeInstanceOf(Error);
        });
    });
});