import {McpError} from '../../types/mcp.js';

export class McpErrorHandler {
    private static readonly SENSITIVE_PATTERNS = [
        // Database connection strings
        { pattern: /postgresql:\/\/[^:\s]+:[^@\s]+@/gi, replacement: 'postgresql://***:***@' },
        { pattern: /mysql:\/\/[^:\s]+:[^@\s]+@/gi, replacement: 'mysql://***:***@' },
        { pattern: /mongodb:\/\/[^:\s]+:[^@\s]+@/gi, replacement: 'mongodb://***:***@' },
        { pattern: /redis:\/\/[^:\s]+:[^@\s]+@/gi, replacement: 'redis://***:***@' },

        // Authentication tokens and secrets
        { pattern: /token\s*[=:]\s*[a-zA-Z0-9_\-+/=]{10,}/gi, replacement: 'token=***' },
        { pattern: /secret\s*[=:]\s*[a-zA-Z0-9_\-+/=]{10,}/gi, replacement: 'secret=***' },
        { pattern: /password\s*[=:]\s*[^&\s]+/gi, replacement: 'password=***' },
        { pattern: /api[_\-]?key\s*[=:]\s*[^&\s]+/gi, replacement: 'api_key=***' },
        { pattern: /bearer\s+[a-zA-Z0-9_\-+/=]{20,}/gi, replacement: 'bearer ***' },
        { pattern: /basic\s+[a-zA-Z0-9_\-+/=]+/gi, replacement: 'basic ***' },

        // File paths (absolute and relative)
        { pattern: /[\/\\]([^\/\\:\*\?"<>\|]+\.(json|yaml|yml|toml|env|config|conf|ini))/gi, replacement: '/***.$2' },
        { pattern: /home\/[^\/\\]+/gi, replacement: 'home/***' },
        { pattern: /users\/[^\/\\]+/gi, replacement: 'users/***' },
        { pattern: /etc\/([^\/\\]+)/gi, replacement: 'etc/***' },
        { pattern: /var\/([^\/\\]+)/gi, replacement: 'var/***' },
        { pattern: /tmp\/([^\/\\]+)/gi, replacement: 'tmp/***' },
        { pattern: /\.ssh\//gi, replacement: '.ssh/***' },
        { pattern: /\.aws\//gi, replacement: '.aws/***' },
        { pattern: /\.config\//gi, replacement: '.config/***' },
        { pattern: /\.npm\//gi, replacement: '.npm/***' },
        { pattern: /\.cache\//gi, replacement: '.cache/***' },

        // Stack traces and internal error details
        { pattern: /at\s+[^(\n]+\([^)\n]+\)/gi, replacement: 'at [function]([file])' },
        { pattern: /file:\/\/\/[^:\n]+/gi, replacement: 'file://***' },
        { pattern: /\\([^\\]+\.(ts|js|tsx|jsx))/gi, replacement: '\\***.$1' },
        { pattern: /\/([^\/]+\.(ts|js|tsx|jsx))/gi, replacement: '/***.$1' },
        { pattern: /\bstack trace\b/gi, replacement: 'stack trace [sanitized]' },

        // IP addresses and hostnames
        { pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/gi, replacement: '*.***' },
        { pattern: /https?:\/\/[^\/\s]+/gi, replacement: 'http://***' },

        // Sensitive environment variables
        { pattern: /DB_PASSWORD[=:][^&\s]*/gi, replacement: 'DB_PASSWORD=***' },
        { pattern: /DATABASE_URL[=:][^&\s]*/gi, replacement: 'DATABASE_URL=***' },
        { pattern: /SECRET_KEY[=:][^&\s]*/gi, replacement: 'SECRET_KEY=***' },
        { pattern: /JWT_SECRET[=:][^&\s]*/gi, replacement: 'JWT_SECRET=***' },
        { pattern: /API_SECRET[=:][^&\s]*/gi, replacement: 'API_SECRET=***' },
        { pattern: /ENCRYPTION_KEY[=:][^&\s]*/gi, replacement: 'ENCRYPTION_KEY=***' }
    ];

    private static sanitizeMessage(message: string): string {
        let sanitized = message;

        // Apply all sanitization patterns
        for (const { pattern, replacement } of this.SENSITIVE_PATTERNS) {
            sanitized = sanitized.replace(pattern, replacement);
        }

        // Remove or truncate overly long error messages that might contain encoded data
        if (sanitized.length > 1000) {
            sanitized = sanitized.substring(0, 997) + '...';
        }

        return sanitized;
    }

    private static sanitizeData(data?: unknown): unknown {
        if (!data) return data;

        if (typeof data === 'string') {
            return this.sanitizeMessage(data);
        }

        if (Array.isArray(data)) {
            return data.map(item => this.sanitizeData(item));
        }

        if (typeof data === 'object' && data !== null) {
            const sanitized: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(data)) {
                // Sanitize object keys that might contain sensitive info
                const sanitizedKey = this.sanitizeMessage(key);
                sanitized[sanitizedKey] = this.sanitizeData(value);
            }
            return sanitized;
        }

        return data;
    }
    static createError(code: number, message: string, data?: unknown): McpError {
        const sanitizedMessage = this.sanitizeMessage(message);
        const sanitizedData = this.sanitizeData(data);
        const error = new Error(sanitizedMessage) as McpError;
        error.code = code;
        error.data = sanitizedData;
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
            // Re-sanitize existing MCP errors to ensure they don't contain sensitive data
            const sanitizedMessage = this.sanitizeMessage(error.message);
            const sanitizedData = this.sanitizeData(error.data);

            // Preserve the original error reference but update sanitized content
            if (error.message !== sanitizedMessage) {
                error.message = sanitizedMessage;
            }
            if (error.data !== sanitizedData) {
                error.data = sanitizedData;
            }
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