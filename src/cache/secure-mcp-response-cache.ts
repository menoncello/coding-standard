import {
    GetStandardsResponse,
    SearchStandardsResponse,
    ValidateCodeResponse
} from '../types/mcp.js';
import {
    SecureCacheManager,
    SecureCacheConfig,
    createSecureCache
} from './secure-cache-manager.js';
import {
    CacheAccessContext,
    DEFAULT_ENCRYPTION_CONFIG,
    DEFAULT_ACCESS_CONTROL_CONFIG
} from './cache-security.js';
import { CacheKeys } from './cache-manager.js';

/**
 * Secure MCP response cache configuration
 */
export interface SecureMcpCacheConfig {
    standards: Partial<SecureCacheConfig>;
    search: Partial<SecureCacheConfig>;
    validation: Partial<SecureCacheConfig>;
    globalEncryption?: {
        enabled: boolean;
        sensitiveDataPatterns: RegExp[];
    };
    globalAccessControl?: {
        enabled: boolean;
        defaultRole: string;
    };
}

/**
 * Secure MCP response cache with encryption and access control
 */
export class SecureMcpResponseCache {
    private standardsCache: SecureCacheManager<GetStandardsResponse>;
    private searchCache: SecureCacheManager<SearchStandardsResponse>;
    private validationCache: SecureCacheManager<ValidateCodeResponse>;
    private config: SecureMcpCacheConfig;

    constructor(config: Partial<SecureMcpCacheConfig> = {}) {
        this.config = {
            standards: {
                ttl: 10 * 60 * 1000, // 10 minutes for standards
                maxSize: 100,
                encryption: {},
                accessControl: {}
            },
            search: {
                ttl: 5 * 60 * 1000, // 5 minutes for search results
                maxSize: 500,
                encryption: {},
                accessControl: {}
            },
            validation: {
                ttl: 2 * 60 * 1000, // 2 minutes for validation results
                maxSize: 1000,
                encryption: {},
                accessControl: {}
            },
            globalEncryption: {
                enabled: true,
                sensitiveDataPatterns: [
                    // Patterns that might appear in MCP responses
                    /user.*data/i,
                    /personal.*information/i,
                    /internal.*standard/i,
                    /proprietary/i,
                    /confidential/i
                ]
            },
            globalAccessControl: {
                enabled: true,
                defaultRole: 'user'
            },
            ...config
        };

        // Initialize secure caches with enhanced security for MCP responses
        this.standardsCache = this.createSecureCache(this.config.standards);
        this.searchCache = this.createSecureCache(this.config.search);
        this.validationCache = this.createSecureCache(this.config.validation);
    }

    /**
     * Create secure cache with MCP-specific configurations
     */
    private createSecureCache<T>(config: Partial<SecureCacheConfig>): SecureCacheManager<T> {
        const enhancedConfig: Partial<SecureCacheConfig> = {
            ...config,
            encryption: {
                ...DEFAULT_ENCRYPTION_CONFIG,
                ...config.encryption,
                // Add MCP-specific sensitive data patterns
                sensitiveDataPatterns: [
                    ...DEFAULT_ENCRYPTION_CONFIG.sensitiveDataPatterns,
                    ...(this.config.globalEncryption?.sensitiveDataPatterns || [])
                ]
            },
            accessControl: {
                ...DEFAULT_ACCESS_CONTROL_CONFIG,
                ...config.accessControl,
                // Enhance role-based access for MCP operations
                roleBasedAccess: new Map([
                    ['admin', {
                        canRead: true,
                        canWrite: true,
                        canDelete: true,
                        canClear: true,
                        allowedKeys: []
                    }],
                    ['user', {
                        canRead: true,
                        canWrite: true, // Users need to write to cache for MCP operations
                        canDelete: false,
                        canClear: false,
                        allowedKeys: ['standards:*', 'search:*', 'validation:*'] // Users can access all MCP data
                    }],
                    ['service', {
                        canRead: true,
                        canWrite: true,
                        canDelete: false, // Services can't delete, only cache
                        canClear: false,
                        allowedKeys: ['standards:*', 'search:*', 'validation:*']
                    }],
                    ['auditor', {
                        canRead: true,
                        canWrite: false,
                        canDelete: false,
                        canClear: false,
                        allowedKeys: ['validation:*'] // Auditors can only access validation results
                    }]
                ])
            }
        };

        return createSecureCache<T>(enhancedConfig);
    }

    /**
     * Create access context from request information
     */
    createAccessContext(requestData?: {
        userId?: string;
        role?: string;
        sessionId?: string;
    }): CacheAccessContext {
        const role = requestData?.role || this.config.globalAccessControl?.defaultRole || 'user';

        return this.standardsCache.getAccessControlService().createContext(
            requestData?.userId,
            role
        );
    }

    /**
     * Get cached standards response with security
     */
    getStandards(key: string, context?: CacheAccessContext): GetStandardsResponse | null {
        return this.standardsCache.get(key, context);
    }

    /**
     * Cache standards response with security
     */
    setStandards(
        key: string,
        response: GetStandardsResponse,
        context?: CacheAccessContext,
        customTtl?: number
    ): void {
        this.standardsCache.set(key, response, context, customTtl);
    }

    /**
     * Get cached search response with security
     */
    getSearch(key: string, context?: CacheAccessContext): SearchStandardsResponse | null {
        return this.searchCache.get(key, context);
    }

    /**
     * Cache search response with security
     */
    setSearch(
        key: string,
        response: SearchStandardsResponse,
        context?: CacheAccessContext,
        customTtl?: number
    ): void {
        this.searchCache.set(key, response, context, customTtl);
    }

    /**
     * Get cached validation response with security
     */
    getValidation(key: string, context?: CacheAccessContext): ValidateCodeResponse | null {
        return this.validationCache.get(key, context);
    }

    /**
     * Cache validation response with security
     */
    setValidation(
        key: string,
        response: ValidateCodeResponse,
        context?: CacheAccessContext,
        customTtl?: number
    ): void {
        this.validationCache.set(key, response, context, customTtl);
    }

    /**
     * Clear all caches with security
     */
    clear(context?: CacheAccessContext): void {
        this.standardsCache.clear(context);
        this.searchCache.clear(context);
        this.validationCache.clear(context);
    }

    /**
     * Cleanup expired entries
     */
    cleanup(): number {
        return this.standardsCache.cleanup() +
               this.searchCache.cleanup() +
               this.validationCache.cleanup();
    }

    /**
     * Get combined secure cache statistics
     */
    getSecureStats(): {
        standards: ReturnType<SecureCacheManager<GetStandardsResponse>['getStats']>;
        search: ReturnType<SecureCacheManager<SearchStandardsResponse>['getStats']>;
        validation: ReturnType<SecureCacheManager<ValidateCodeResponse>['getStats']>;
        combined: {
            totalEntries: number;
            totalEncryptedEntries: number;
            totalDeniedRequests: number;
            totalAuditLogSize: number;
            averageEncryptionOverhead: number;
            averageAccessControlOverhead: number;
        };
        encryptionStatus: {
            enabled: boolean;
            algorithm: string;
            keyRotationEnabled: boolean;
        };
    } {
        const standards = this.standardsCache.getStats();
        const search = this.searchCache.getStats();
        const validation = this.validationCache.getStats();

        const combined = {
            totalEntries: standards.size + search.size + validation.size,
            totalEncryptedEntries: standards.encryption.encryptedEntries +
                                  search.encryption.encryptedEntries +
                                  validation.encryption.encryptedEntries,
            totalDeniedRequests: standards.accessControl.deniedRequests +
                                search.accessControl.deniedRequests +
                                validation.accessControl.deniedRequests,
            totalAuditLogSize: standards.accessControl.auditLogSize +
                              search.accessControl.auditLogSize +
                              validation.accessControl.auditLogSize,
            averageEncryptionOverhead: Math.round(
                (standards.performance.encryptionOverhead +
                 search.performance.encryptionOverhead +
                 validation.performance.encryptionOverhead) / 3 * 100
            ) / 100,
            averageAccessControlOverhead: Math.round(
                (standards.performance.accessControlOverhead +
                 search.performance.accessControlOverhead +
                 validation.performance.accessControlOverhead) / 3 * 100
            ) / 100
        };

        const encryptionStatus = this.standardsCache.getEncryptionService().getStatus();

        return {
            standards,
            search,
            validation,
            combined,
            encryptionStatus
        };
    }

    /**
     * Update cache configuration for all caches
     */
    updateConfig(config: Partial<SecureMcpCacheConfig>): void {
        this.config = { ...this.config, ...config };

        if (config.standards) {
            this.standardsCache.updateConfig(config.standards);
        }
        if (config.search) {
            this.searchCache.updateConfig(config.search);
        }
        if (config.validation) {
            this.validationCache.updateConfig(config.validation);
        }
    }

    /**
     * Check if caches are enabled
     */
    isEnabled(): boolean {
        return this.standardsCache.isEnabled() &&
               this.searchCache.isEnabled() &&
               this.validationCache.isEnabled();
    }

    /**
     * Get cache keys with security filtering
     */
    getKeys(context?: CacheAccessContext): {
        standards: string[];
        search: string[];
        validation: string[];
    } {
        return {
            standards: this.standardsCache.keys(context),
            search: this.searchCache.keys(context),
            validation: this.validationCache.keys(context)
        };
    }

    /**
     * Get cache sizes with security filtering
     */
    getSizes(context?: CacheAccessContext): {
        standards: number;
        search: number;
        validation: number;
        total: number;
    } {
        const standards = this.standardsCache.size(context);
        const search = this.searchCache.size(context);
        const validation = this.validationCache.size(context);

        return {
            standards,
            search,
            validation,
            total: standards + search + validation
        };
    }

    /**
     * Get combined audit log from all caches
     */
    getCombinedAuditLog(limit?: number): Array<{
        cache: 'standards' | 'search' | 'validation';
        entry: ReturnType<SecureCacheManager<any>['getAuditLog']>[0];
    }> {
        const combinedLog: Array<{
            cache: 'standards' | 'search' | 'validation';
            entry: ReturnType<SecureCacheManager<any>['getAuditLog']>[0];
        }> = [];

        // Add entries from each cache with cache identifier
        this.standardsCache.getAuditLog(limit).forEach(entry => {
            combinedLog.push({ cache: 'standards', entry });
        });

        this.searchCache.getAuditLog(limit).forEach(entry => {
            combinedLog.push({ cache: 'search', entry });
        });

        this.validationCache.getAuditLog(limit).forEach(entry => {
            combinedLog.push({ cache: 'validation', entry });
        });

        // Sort by timestamp
        combinedLog.sort((a, b) => a.entry.timestamp - b.entry.timestamp);

        // Apply limit if specified
        if (limit) {
            return combinedLog.slice(-limit);
        }

        return combinedLog;
    }

    /**
     * Clear all audit logs
     */
    clearAllAuditLogs(): void {
        this.standardsCache.clearAuditLog();
        this.searchCache.clearAuditLog();
        this.validationCache.clearAuditLog();
    }

    /**
     * Clear all performance metrics
     */
    clearAllPerformanceMetrics(): void {
        this.standardsCache.clearPerformanceMetrics();
        this.searchCache.clearPerformanceMetrics();
        this.validationCache.clearPerformanceMetrics();
    }

    /**
     * Cleanup resources
     */
    destroy(): void {
        this.standardsCache.destroy();
        this.searchCache.destroy();
        this.validationCache.destroy();
    }

    /**
     * Get security compliance report
     */
    getSecurityComplianceReport(): {
        encryption: {
            enabled: boolean;
            encryptedEntries: number;
            encryptionRate: number;
            algorithm: string;
            keyRotationActive: boolean;
        };
        accessControl: {
            enabled: boolean;
            totalRequests: number;
            deniedRequests: number;
            denialRate: number;
            auditLogEntries: number;
        };
        performance: {
            averageEncryptionOverhead: number;
            averageAccessControlOverhead: number;
            totalSecurityOverhead: number;
        };
        recommendations: string[];
    } {
        const stats = this.getSecureStats();
        const totalEntries = stats.combined.totalEntries;
        const totalRequests = stats.combined.totalDeniedRequests +
                              stats.standards.hits + stats.standards.misses +
                              stats.search.hits + stats.search.misses +
                              stats.validation.hits + stats.validation.misses;

        const recommendations: string[] = [];

        // Encryption recommendations
        if (stats.encryptionStatus.enabled && stats.combined.totalEncryptedEntries < totalEntries * 0.1) {
            recommendations.push('Consider expanding sensitive data patterns to encrypt more cache entries');
        }

        // Access control recommendations
        if (stats.combined.totalDeniedRequests > totalRequests * 0.05) {
            recommendations.push('High denial rate detected - review access control permissions');
        }

        // Performance recommendations
        if (stats.combined.averageEncryptionOverhead > 5.0) {
            recommendations.push('Encryption overhead is high - consider optimizing encryption settings');
        }

        if (stats.combined.averageAccessControlOverhead > 1.0) {
            recommendations.push('Access control overhead is high - consider optimizing permission checks');
        }

        return {
            encryption: {
                enabled: stats.encryptionStatus.enabled,
                encryptedEntries: stats.combined.totalEncryptedEntries,
                encryptionRate: totalEntries > 0 ? Math.round((stats.combined.totalEncryptedEntries / totalEntries) * 10000) / 100 : 0,
                algorithm: stats.encryptionStatus.algorithm,
                keyRotationActive: stats.encryptionStatus.keyRotationEnabled
            },
            accessControl: {
                enabled: stats.combined.totalAuditLogSize > 0,
                totalRequests,
                deniedRequests: stats.combined.totalDeniedRequests,
                denialRate: totalRequests > 0 ? Math.round((stats.combined.totalDeniedRequests / totalRequests) * 10000) / 100 : 0,
                auditLogEntries: stats.combined.totalAuditLogSize
            },
            performance: {
                averageEncryptionOverhead: stats.combined.averageEncryptionOverhead,
                averageAccessControlOverhead: stats.combined.averageAccessControlOverhead,
                totalSecurityOverhead: Math.round((stats.combined.averageEncryptionOverhead + stats.combined.averageAccessControlOverhead) * 100) / 100
            },
            recommendations
        };
    }
}

/**
 * Global secure MCP response cache instance
 */
export const secureMcpCache = new SecureMcpResponseCache({
    standards: {
        ttl: 10 * 60 * 1000, // 10 minutes for standards
        maxSize: 100,
        enabled: true
    },
    search: {
        ttl: 5 * 60 * 1000, // 5 minutes for search results
        maxSize: 500,
        enabled: true
    },
    validation: {
        ttl: 2 * 60 * 1000, // 2 minutes for validation results
        maxSize: 1000,
        enabled: true
    },
    globalEncryption: {
        enabled: true,
        sensitiveDataPatterns: [
            /user.*data/i,
            /personal.*information/i,
            /internal.*standard/i,
            /proprietary/i,
            /confidential/i,
            /secret/i
        ]
    },
    globalAccessControl: {
        enabled: true,
        defaultRole: 'user'
    }
});

/**
 * Enhanced cache keys with security considerations
 */
export const SecureCacheKeys = {
    ...CacheKeys,

    // Security-aware cache keys with user context
    userStandards: (userId?: string, technology?: string, category?: string): string =>
        `user:${userId || 'anonymous'}:standards:${technology || 'all'}:${category || 'all'}`,

    userSearch: (userId?: string, query: string, technology?: string, fuzzy?: boolean, limit?: number): string =>
        `user:${userId || 'anonymous'}:search:${query}:${technology || 'all'}:${fuzzy !== false ? 'fuzzy' : 'exact'}:${limit || 10}`,

    userValidation: (userId?: string, codeHash: string, language: string, rules?: string[]): string =>
        `user:${userId || 'anonymous'}:validation:${codeHash}:${language}:${rules?.join(',') || 'default'}`,

    // Session-specific cache keys
    sessionStandards: (sessionId: string, technology?: string, category?: string): string =>
        `session:${sessionId}:standards:${technology || 'all'}:${category || 'all'}`,

    sessionSearch: (sessionId: string, query: string, technology?: string, fuzzy?: boolean, limit?: number): string =>
        `session:${sessionId}:search:${query}:${technology || 'all'}:${fuzzy !== false ? 'fuzzy' : 'exact'}:${limit || 10}`,

    sessionValidation: (sessionId: string, codeHash: string, language: string, rules?: string[]): string =>
        `session:${sessionId}:validation:${codeHash}:${language}:${rules?.join(',') || 'default'}`,

    // Role-specific cache keys for different access levels
    roleStandards: (role: string, technology?: string, category?: string): string =>
        `role:${role}:standards:${technology || 'all'}:${category || 'all'}`,

    roleSearch: (role: string, query: string, technology?: string, fuzzy?: boolean, limit?: number): string =>
        `role:${role}:search:${query}:${technology || 'all'}:${fuzzy !== false ? 'fuzzy' : 'exact'}:${limit || 10}`,

    roleValidation: (role: string, codeHash: string, language: string, rules?: string[]): string =>
        `role:${role}:validation:${codeHash}:${language}:${rules?.join(',') || 'default'}`
};