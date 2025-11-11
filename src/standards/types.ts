/**
 * Type definitions for the Standards Registry System
 */

export interface StandardRule {
    id: string;
    semanticName: string;
    displayName: string;
    description: string;
    category: string;
    technology: string;
    pattern: string;
    severity: 'error' | 'warning' | 'info';
    tags: string[];
    examples: RuleExample[];
    relatedRules: string[];
    aliases: string[];
    deprecated: boolean;
    deprecationMessage?: string;
    metadata: RuleMetadata;
}

export interface RuleExample {
    valid: string[];
    invalid: string[];
    description?: string;
}

export interface RuleMetadata {
    createdAt: number;
    updatedAt: number;
    createdBy?: string;
    version: string;
    lastValidated?: number;
    validationStatus?: 'pending' | 'validated' | 'deprecated';
    customFields?: Record<string, any>;
}

export interface SearchQuery {
    query?: string;
    category?: string;
    technology?: string;
    tags?: string[];
    severity?: ('error' | 'warning' | 'info')[];
    fuzzy?: boolean;
    limit?: number;
    offset?: number;
    includeDeprecated?: boolean;
}

export interface SearchResult {
    rule: StandardRule;
    relevance: number;
    matchType: 'exact' | 'semantic' | 'fuzzy' | 'partial';
    matchedFields: string[];
}

export interface ValidationResult {
    isValid: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
}

export interface ValidationError {
    field: string;
    message: string;
    code: string;
    value?: any;
}

export interface ValidationWarning {
    field: string;
    message: string;
    code: string;
    value?: any;
}

export interface Conflict {
    type: 'semantic_name' | 'pattern' | 'alias';
    existingRule: string;
    conflictingValue: string;
    description: string;
}

export interface RegistryStats {
    totalRules: number;
    rulesByCategory: Record<string, number>;
    rulesByTechnology: Record<string, number>;
    rulesBySeverity: Record<string, number>;
    deprecatedRules: number;
    lastUpdated: number;
}

export interface RegistryConfig {
    cacheEnabled: boolean;
    cacheTtl: number;
    maxCacheSize: number;
    validationEnabled: boolean;
    performanceMonitoring: boolean;
    conflictDetection: boolean;
}

export type SortOrder = 'asc' | 'desc';
export type SortField = 'semanticName' | 'displayName' | 'category' | 'technology' | 'severity' | 'createdAt' | 'updatedAt';

export interface SortOptions {
    field: SortField;
    order: SortOrder;
}

export interface PaginationOptions {
    limit: number;
    offset: number;
}

export interface RegistryOptions {
    sort?: SortOptions;
    pagination?: PaginationOptions;
    filters?: Partial<SearchQuery>;
}