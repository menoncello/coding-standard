import {Tool} from '@modelcontextprotocol/sdk/types.js';

export interface GetStandardsRequest {
    technology?: string;
    category?: string;
    context?: string;
    useCache?: boolean;
}

export interface GetStandardsResponse {
    standards: Standard[];
    totalCount: number;
    responseTime: number;
    cached?: boolean;
}

export interface SearchStandardsRequest {
    query: string;
    technology?: string;
    fuzzy?: boolean;
    limit?: number;
}

export interface SearchStandardsResponse {
    results: Standard[];
    totalCount: number;
    responseTime: number;
}

export interface ValidateCodeRequest {
    code: string;
    language: string;
    useStrict?: boolean;
    rules?: string[];
}

export interface ValidateCodeResponse {
    valid: boolean;
    violations: Violation[];
    score: number;
    responseTime: number;
}

export interface Standard {
    id: string;
    title: string;
    description: string;
    technology: string;
    category: string;
    rules: Rule[];
    lastUpdated: string;
}

export interface Rule {
    id: string;
    description: string;
    severity: 'error' | 'warning' | 'info';
    category: string;
    example?: string;
}

export interface Violation {
    rule: Rule;
    line: number;
    column: number;
    message: string;
    severity: 'error' | 'warning' | 'info';
}

export interface McpError extends Error {
    code: number;
    data?: unknown;
}

export interface PerformanceMetrics {
    responseTime: number;
    memoryUsage: number;
    timestamp: number;
}

export const GET_STANDARDS_TOOL: Tool = {
    name: 'getStandards',
    description: 'Retrieve coding standards for specified technology and category',
    inputSchema: {
        type: 'object',
        properties: {
            technology: {
                type: 'string',
                description: 'The technology to get standards for (e.g., typescript, javascript, python)'
            },
            category: {
                type: 'string',
                description: 'The category of standards (e.g., naming, formatting, best-practices)'
            },
            context: {
                type: 'string',
                description: 'Additional context to help find relevant standards'
            },
            useCache: {
                type: 'boolean',
                description: 'Whether to use cached results (default: true)',
                default: true
            }
        }
    }
};

export const SEARCH_STANDARDS_TOOL: Tool = {
    name: 'searchStandards',
    description: 'Search coding standards using natural language query',
    inputSchema: {
        type: 'object',
        properties: {
            query: {
                type: 'string',
                description: 'Search query to find relevant standards'
            },
            technology: {
                type: 'string',
                description: 'Filter by technology'
            },
            fuzzy: {
                type: 'boolean',
                description: 'Enable fuzzy matching (default: true)',
                default: true
            },
            limit: {
                type: 'number',
                description: 'Maximum number of results to return (default: 10)',
                default: 10
            }
        },
        required: ['query']
    }
};

export const VALIDATE_CODE_TOOL: Tool = {
    name: 'validateCode',
    description: 'Validate code against coding standards',
    inputSchema: {
        type: 'object',
        properties: {
            code: {
                type: 'string',
                description: 'The code to validate'
            },
            language: {
                type: 'string',
                description: 'Programming language of the code'
            },
            useStrict: {
                type: 'boolean',
                description: 'Apply strict validation (default: false)',
                default: false
            },
            rules: {
                type: 'array',
                items: {
                    type: 'string'
                },
                description: 'Specific rules to apply (optional)'
            }
        },
        required: ['code', 'language']
    }
};

export const ADD_STANDARD_TOOL: Tool = {
    name: 'addStandard',
    description: 'Add a new coding standard to the registry',
    inputSchema: {
        type: 'object',
        properties: {
            semanticName: {
                type: 'string',
                description: 'Semantic name for the standard (e.g., react-component-naming)'
            },
            pattern: {
                type: 'string',
                description: 'Regular expression pattern for the standard'
            },
            description: {
                type: 'string',
                description: 'Description of what the standard enforces'
            },
            category: {
                type: 'string',
                description: 'Category of the standard (naming, formatting, structure, etc.)',
                enum: ['naming', 'formatting', 'structure', 'performance', 'security', 'testing', 'documentation', 'error-handling', 'best-practices', 'style']
            },
            technology: {
                type: 'string',
                description: 'Technology the standard applies to (typescript, javascript, python, etc.)'
            },
            severity: {
                type: 'string',
                description: 'Severity level for violations',
                enum: ['error', 'warning', 'info'],
                default: 'error'
            },
            examples: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        valid: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'Examples that follow the standard'
                        },
                        invalid: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'Examples that violate the standard'
                        },
                        description: {
                            type: 'string',
                            description: 'Description of this example set'
                        }
                    }
                },
                description: 'Examples showing valid and invalid usage'
            }
        },
        required: ['semanticName', 'pattern', 'description']
    }
};

export const REMOVE_STANDARD_TOOL: Tool = {
    name: 'removeStandard',
    description: 'Remove a coding standard from the registry',
    inputSchema: {
        type: 'object',
        properties: {
            semanticName: {
                type: 'string',
                description: 'Semantic name of the standard to remove'
            },
            force: {
                type: 'boolean',
                description: 'Force removal even if the standard is referenced by other standards',
                default: false
            }
        },
        required: ['semanticName']
    }
};

export const REGISTRY_STATS_TOOL: Tool = {
    name: 'getRegistryStats',
    description: 'Get statistics about the standards registry',
    inputSchema: {
        type: 'object',
        properties: {}
    }
};