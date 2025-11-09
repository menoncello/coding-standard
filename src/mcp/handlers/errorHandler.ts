import {McpError} from '../../types/mcp.js';

export class McpErrorHandler {
    static createError(code: number, message: string, data?: unknown): McpError {
        const error = new Error(message) as McpError;
        error.code = code;
        error.data = data;
        return error;
    }

    static invalidRequest(message: string, data?: unknown): McpError {
        return this.createError(-32600, `Invalid Request: ${message}`, data);
    }

    static methodNotFound(method: string): McpError {
        return this.createError(-32601, `Method not found: ${method}`);
    }

    static invalidParams(message: string, data?: unknown): McpError {
        return this.createError(-32602, `Invalid params: ${message}`, data);
    }

    static internalError(message: string, data?: unknown): McpError {
        return this.createError(-32603, `Internal error: ${message}`, data);
    }

    static parseError(message: string, data?: unknown): McpError {
        return this.createError(-32700, `Parse error: ${message}`, data);
    }

    static isMcpError(error: unknown): error is McpError {
        return error instanceof Error && 'code' in error;
    }

    static handleError(error: unknown): McpError {
        if (this.isMcpError(error)) {
            return error;
        }

        if (error instanceof Error) {
            return this.internalError(error.message);
        }

        if (typeof error === 'string') {
            return this.internalError(error);
        }

        return this.internalError('Unknown error occurred');
    }
}