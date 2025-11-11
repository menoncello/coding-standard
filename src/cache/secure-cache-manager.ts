import {
    CacheConfig,
    CacheEntry,
    CacheStats,
    CacheManager
} from './cache-manager.js';
import {
    CacheEncryptionService,
    CacheAccessControlService,
    CacheAccessContext,
    EncryptedCacheEntry,
    DEFAULT_ENCRYPTION_CONFIG,
    DEFAULT_ACCESS_CONTROL_CONFIG,
    CacheEncryptionConfig,
    AccessControlConfig
} from './cache-security.js';

/**
 * Secure cache configuration
 */
export interface SecureCacheConfig extends CacheConfig {
    encryption: Partial<CacheEncryptionConfig>;
    accessControl: Partial<AccessControlConfig>;
}

/**
 * Enhanced cache statistics with security metrics
 */
export interface SecureCacheStats extends CacheStats {
    encryption: {
        enabled: boolean;
        encryptedEntries: number;
        algorithm: string;
        keyRotationEnabled: boolean;
    };
    accessControl: {
        enabled: boolean;
        totalRequests: number;
        deniedRequests: number;
        auditLogSize: number;
    };
    performance: {
        encryptionOverhead: number; // Average time in ms for encryption/decryption
        accessControlOverhead: number; // Average time in ms for access checks
    };
}

/**
 * Secure cache manager with encryption and access control
 */
export class SecureCacheManager<T = any> {
    private cache: CacheManager<T | EncryptedCacheEntry<T>>;
    private encryptionService: CacheEncryptionService;
    private accessControlService: CacheAccessControlService;
    private config: SecureCacheConfig;
    private performanceMetrics: {
        encryptionTime: number[];
        accessControlTime: number[];
        deniedRequests: number;
        totalRequests: number;
    };

    constructor(config: Partial<SecureCacheConfig> = {}) {
        this.config = {
            ttl: 5 * 60 * 1000, // 5 minutes default
            maxSize: 1000,
            enabled: true,
            encryption: {},
            accessControl: {},
            ...config
        };

        // Initialize services
        const encryptionConfig = { ...DEFAULT_ENCRYPTION_CONFIG, ...this.config.encryption };
        const accessControlConfig = { ...DEFAULT_ACCESS_CONTROL_CONFIG, ...this.config.accessControl };

        this.encryptionService = new CacheEncryptionService(encryptionConfig);
        this.accessControlService = new CacheAccessControlService(accessControlConfig);

        // Initialize underlying cache
        this.cache = new CacheManager<T | EncryptedCacheEntry<T>>({
            ttl: this.config.ttl,
            maxSize: this.config.maxSize,
            enabled: this.config.enabled
        });

        // Initialize performance metrics
        this.performanceMetrics = {
            encryptionTime: [],
            accessControlTime: [],
            deniedRequests: 0,
            totalRequests: 0
        };
    }

    /**
     * Get value from cache with security checks
     */
    get(key: string, context?: CacheAccessContext): T | null {
        if (!this.config.enabled) return null;

        const startTime = performance.now();

        try {
            // Track total requests
            this.performanceMetrics.totalRequests++;

            // Check access permissions
            if (context && this.accessControlService.canRead(key, context)) {
                const accessTime = performance.now() - startTime;
                this.performanceMetrics.accessControlTime.push(accessTime);

                // Get encrypted entry from cache
                const entry = this.cache.get(key);

                if (!entry) {
                    return null;
                }

                // Decrypt if necessary
                const decryptStartTime = performance.now();
                const decryptedData = this.encryptionService.decrypt(entry, context);
                const decryptTime = performance.now() - decryptStartTime;
                this.performanceMetrics.encryptionTime.push(decryptTime);

                return decryptedData;
            } else if (context) {
                // Access denied - return null instead of throwing exception
                this.performanceMetrics.deniedRequests++;
                const accessTime = performance.now() - startTime;
                this.performanceMetrics.accessControlTime.push(accessTime);
                return null;
            } else {
                // No context provided - use default permissions
                const entry = this.cache.get(key);

                if (!entry) {
                    return null;
                }

                // Decrypt if necessary (without access control)
                const decryptStartTime = performance.now();
                const decryptedData = this.encryptionService.decrypt(entry);
                const decryptTime = performance.now() - decryptStartTime;
                this.performanceMetrics.encryptionTime.push(decryptTime);

                return decryptedData;
            }
        } catch (error) {
            console.error(`Secure cache get failed for key '${key}':`, error);
            return null;
        }
    }

    /**
     * Set value in cache with security
     */
    set(key: string, data: T, context?: CacheAccessContext, customTtl?: number): void {
        if (!this.config.enabled) return;

        const startTime = performance.now();

        try {
            // Check access permissions
            if (context && this.accessControlService.canWrite(key, context)) {
                const accessTime = performance.now() - startTime;
                this.performanceMetrics.accessControlTime.push(accessTime);

                // Encrypt data if necessary
                const encryptStartTime = performance.now();
                const processedData = this.encryptionService.encrypt(key, data, context);
                const encryptTime = performance.now() - encryptStartTime;
                this.performanceMetrics.encryptionTime.push(encryptTime);

                // Store in underlying cache
                this.cache.set(key, processedData, customTtl);
            } else if (context) {
                // Access denied - fail gracefully by silently ignoring
                this.performanceMetrics.deniedRequests++;
                const accessTime = performance.now() - startTime;
                this.performanceMetrics.accessControlTime.push(accessTime);
                return; // Silently ignore the operation
            } else {
                // No context provided - encrypt based on patterns only
                const encryptStartTime = performance.now();
                const processedData = this.encryptionService.encrypt(key, data);
                const encryptTime = performance.now() - encryptStartTime;
                this.performanceMetrics.encryptionTime.push(encryptTime);

                this.cache.set(key, processedData, customTtl);
            }
        } catch (error) {
            console.error(`Secure cache set failed for key '${key}':`, error);

            // Don't store data if access was explicitly denied
            if (error instanceof Error && error.message.includes('Access denied')) {
                // Silently ignore access denied operations
                return;
            }

            // Fail safe - store unencrypted if encryption fails (but not for access control)
            this.cache.set(key, data, customTtl);
        }
    }

    /**
     * Delete value from cache with security checks
     */
    delete(key: string, context?: CacheAccessContext): boolean {
        if (!this.config.enabled) return false;

        const startTime = performance.now();

        try {
            // Check access permissions
            if (context && this.accessControlService.canDelete(key, context)) {
                const accessTime = performance.now() - startTime;
                this.performanceMetrics.accessControlTime.push(accessTime);

                return this.cache.delete(key);
            } else if (context) {
                // Access denied
                this.performanceMetrics.deniedRequests++;
                const accessTime = performance.now() - startTime;
                this.performanceMetrics.accessControlTime.push(accessTime);
                return false;
            } else {
                // No context provided - allow deletion
                return this.cache.delete(key);
            }
        } catch (error) {
            console.error(`Secure cache delete failed for key '${key}':`, error);
            return false;
        }
    }

    /**
     * Clear all cache entries with security checks
     */
    clear(context?: CacheAccessContext): void {
        if (!this.config.enabled) return;

        const startTime = performance.now();

        try {
            // Check access permissions
            if (context && this.accessControlService.canClear(context)) {
                const accessTime = performance.now() - startTime;
                this.performanceMetrics.accessControlTime.push(accessTime);

                this.cache.clear();
            } else if (context) {
                // Access denied - fail gracefully (do nothing)
                this.performanceMetrics.deniedRequests++;
                const accessTime = performance.now() - startTime;
                this.performanceMetrics.accessControlTime.push(accessTime);
                return; // Fail gracefully - do nothing
            } else {
                // No context provided - allow clear
                this.cache.clear();
            }
        } catch (error) {
            console.error('Secure cache clear failed:', error);
        }
    }

    /**
     * Remove expired entries
     */
    cleanup(): number {
        if (!this.config.enabled) return 0;

        return this.cache.cleanup();
    }

    /**
     * Get enhanced cache statistics
     */
    getStats(): SecureCacheStats {
        const baseStats = this.cache.getStats();
        const encryptionStatus = this.encryptionService.getStatus();

        // Calculate encrypted entries count
        let encryptedEntries = 0;
        const keys = this.cache.keys();

        for (const key of keys) {
            const entry = this.cache.get(key);
            if (entry && typeof entry === 'object' && 'encrypted' in entry && entry.encrypted) {
                encryptedEntries++;
            }
        }

        // Calculate performance overheads
        const avgEncryptionTime = this.performanceMetrics.encryptionTime.length > 0
            ? this.performanceMetrics.encryptionTime.reduce((a, b) => a + b, 0) / this.performanceMetrics.encryptionTime.length
            : 0;

        const avgAccessControlTime = this.performanceMetrics.accessControlTime.length > 0
            ? this.performanceMetrics.accessControlTime.reduce((a, b) => a + b, 0) / this.performanceMetrics.accessControlTime.length
            : 0;

        return {
            ...baseStats,
            encryption: {
                enabled: encryptionStatus.enabled,
                encryptedEntries,
                algorithm: encryptionStatus.algorithm,
                keyRotationEnabled: encryptionStatus.keyRotationEnabled
            },
            accessControl: {
                enabled: this.accessControlService.getAuditLog().length > 0, // Enabled if audit logging is active
                totalRequests: this.performanceMetrics.totalRequests,
                deniedRequests: this.performanceMetrics.deniedRequests,
                auditLogSize: this.accessControlService.getAuditLog().length
            },
            performance: {
                encryptionOverhead: Math.round(avgEncryptionTime * 100) / 100,
                accessControlOverhead: Math.round(avgAccessControlTime * 100) / 100
            }
        };
    }

    /**
     * Check if cache is enabled
     */
    isEnabled(): boolean {
        return this.config.enabled;
    }

    /**
     * Update cache configuration
     */
    updateConfig(config: Partial<SecureCacheConfig>): void {
        this.config = { ...this.config, ...config };

        // Update underlying cache configuration
        this.cache.updateConfig({
            ttl: this.config.ttl,
            maxSize: this.config.maxSize,
            enabled: this.config.enabled
        });
    }

    /**
     * Get cache keys (with access control filtering if context provided)
     */
    keys(context?: CacheAccessContext): string[] {
        if (!this.config.enabled) return [];

        const allKeys = this.cache.keys();

        // If no context provided, return all keys
        if (!context) {
            return allKeys;
        }

        // Filter keys based on access permissions
        return allKeys.filter(key => this.accessControlService.canRead(key, context));
    }

    /**
     * Get cache size (with access control filtering if context provided)
     */
    size(context?: CacheAccessContext): number {
        if (!this.config.enabled) return 0;

        if (!context) {
            return this.cache.size();
        }

        // Count accessible entries
        return this.keys(context).length;
    }

    /**
     * Check if key exists and is not expired (with access control)
     */
    has(key: string, context?: CacheAccessContext): boolean {
        if (!this.config.enabled) return false;

        // Check access permissions first
        if (context && !this.accessControlService.canRead(key, context)) {
            return false;
        }

        return this.cache.has(key);
    }

    /**
     * Get access control service for advanced operations
     */
    getAccessControlService(): CacheAccessControlService {
        return this.accessControlService;
    }

    /**
     * Get encryption service for advanced operations
     */
    getEncryptionService(): CacheEncryptionService {
        return this.encryptionService;
    }

    /**
     * Get audit log
     */
    getAuditLog(limit?: number) {
        return this.accessControlService.getAuditLog(limit);
    }

    /**
     * Clear audit log
     */
    clearAuditLog(): void {
        this.accessControlService.clearAuditLog();
    }

    /**
     * Clear performance metrics
     */
    clearPerformanceMetrics(): void {
        this.performanceMetrics = {
            encryptionTime: [],
            accessControlTime: [],
            deniedRequests: 0,
            totalRequests: 0
        };
    }

    /**
     * Cleanup resources
     */
    destroy(): void {
        this.encryptionService.destroy();
        this.clear();
        this.clearPerformanceMetrics();
        this.clearAuditLog();
    }
}

/**
 * Factory function to create secure cache instances
 */
export function createSecureCache<T = any>(
    config?: Partial<SecureCacheConfig>
): SecureCacheManager<T> {
    return new SecureCacheManager<T>(config);
}

/**
 * Default secure cache instance
 */
export const secureCache = createSecureCache({
    ttl: 5 * 60 * 1000, // 5 minutes default
    maxSize: 1000,
    enabled: true,
    encryption: {
        enabled: true,
        keyRotationInterval: 24 * 60 * 60 * 1000 // 24 hours
    },
    accessControl: {
        enabled: true,
        auditLogging: true
    }
});