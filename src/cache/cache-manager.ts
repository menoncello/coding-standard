import { Standard, GetStandardsResponse, SearchStandardsResponse, ValidateCodeResponse } from '../types/mcp.js';

/**
 * Cache configuration
 */
export interface CacheConfig {
    ttl: number; // Time to live in milliseconds
    maxSize: number; // Maximum number of items in cache
    enabled: boolean;
}

/**
 * Cache entry with expiration
 */
export interface CacheEntry<T> {
    data: T;
    timestamp: number;
    expiresAt: number;
    hits: number;
}

/**
 * Cache statistics
 */
export interface CacheStats {
    hits: number;
    misses: number;
    size: number;
    hitRate: number;
    memoryUsage: number;
}

/**
 * In-memory cache manager with TTL and LRU eviction
 */
export class CacheManager<T = any> {
    private cache = new Map<string, CacheEntry<T>>();
    private accessOrder = new Map<string, number>();
    private config: CacheConfig;
    private stats = { hits: 0, misses: 0 };
    private accessCounter = 0;

    constructor(config: Partial<CacheConfig> = {}) {
        this.config = {
            ttl: 5 * 60 * 1000, // 5 minutes default
            maxSize: 1000,
            enabled: true,
            ...config
        };
    }

    /**
     * Get value from cache
     */
    get(key: string): T | null {
        if (!this.config.enabled) return null;

        const entry = this.cache.get(key);

        if (!entry) {
            this.stats.misses++;
            return null;
        }

        // Check if expired
        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            this.accessOrder.delete(key);
            this.stats.misses++;
            return null;
        }

        // Update access order and stats
        entry.hits++;
        this.accessOrder.set(key, ++this.accessCounter);
        this.stats.hits++;

        return entry.data;
    }

    /**
     * Set value in cache
     */
    set(key: string, data: T, customTtl?: number): void {
        if (!this.config.enabled) return;

        const ttl = customTtl || this.config.ttl;
        const now = Date.now();
        const expiresAt = now + ttl;

        // Remove existing entry if it exists
        if (this.cache.has(key)) {
            this.cache.delete(key);
        }

        // Evict oldest entries if cache is full
        while (this.cache.size >= this.config.maxSize) {
            this.evictOldest();
        }

        // Add new entry
        const entry: CacheEntry<T> = {
            data,
            timestamp: now,
            expiresAt,
            hits: 0
        };

        this.cache.set(key, entry);
        this.accessOrder.set(key, ++this.accessCounter);
    }

    /**
     * Delete value from cache
     */
    delete(key: string): boolean {
        if (!this.config.enabled) return false;

        const deleted = this.cache.delete(key);
        this.accessOrder.delete(key);
        return deleted;
    }

    /**
     * Clear all cache entries
     */
    clear(): void {
        this.cache.clear();
        this.accessOrder.clear();
        this.stats = { hits: 0, misses: 0 };
        this.accessCounter = 0;
    }

    /**
     * Remove expired entries
     */
    cleanup(): number {
        if (!this.config.enabled) return 0;

        const now = Date.now();
        const expiredKeys: string[] = [];

        for (const [key, entry] of this.cache.entries()) {
            if (now > entry.expiresAt) {
                expiredKeys.push(key);
            }
        }

        for (const key of expiredKeys) {
            this.cache.delete(key);
            this.accessOrder.delete(key);
        }

        return expiredKeys.length;
    }

    /**
     * Evict oldest entry (LRU)
     */
    private evictOldest(): void {
        let oldestKey: string | null = null;
        let oldestAccess = Infinity;

        for (const [key, accessTime] of this.accessOrder.entries()) {
            if (accessTime < oldestAccess) {
                oldestAccess = accessTime;
                oldestKey = key;
            }
        }

        if (oldestKey) {
            this.cache.delete(oldestKey);
            this.accessOrder.delete(oldestKey);
        }
    }

    /**
     * Get cache statistics
     */
    getStats(): CacheStats {
        const totalRequests = this.stats.hits + this.stats.misses;
        const hitRate = totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0;

        // Estimate memory usage (rough calculation)
        let memoryUsage = 0;
        for (const entry of this.cache.values()) {
            try {
                memoryUsage += JSON.stringify(entry.data).length * 2; // UTF-16 characters
                memoryUsage += 64; // Overhead for object metadata
            } catch (error) {
                // Skip if data can't be serialized
            }
        }

        return {
            hits: this.stats.hits,
            misses: this.stats.misses,
            size: this.cache.size,
            hitRate: Math.round(hitRate * 100) / 100,
            memoryUsage
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
    updateConfig(config: Partial<CacheConfig>): void {
        this.config = { ...this.config, ...config };

        // If new max size is smaller, evict excess entries
        while (this.cache.size > this.config.maxSize) {
            this.evictOldest();
        }
    }

    /**
     * Get cache keys
     */
    keys(): string[] {
        return Array.from(this.cache.keys());
    }

    /**
     * Get cache size
     */
    size(): number {
        return this.cache.size;
    }

    /**
     * Check if key exists and is not expired
     */
    has(key: string): boolean {
        const entry = this.cache.get(key);
        if (!entry) return false;

        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            this.accessOrder.delete(key);
            return false;
        }

        return true;
    }
}

/**
 * Specialized cache for MCP responses
 */
export class McpResponseCache {
    private standardsCache: CacheManager<GetStandardsResponse>;
    private searchCache: CacheManager<SearchStandardsResponse>;
    private validationCache: CacheManager<ValidateCodeResponse>;

    constructor(config: Partial<CacheConfig> = {}) {
        // Different TTL for different types of responses
        this.standardsCache = new CacheManager<GetStandardsResponse>({
            ttl: 10 * 60 * 1000, // 10 minutes for standards
            maxSize: 100,
            ...config
        });

        this.searchCache = new CacheManager<SearchStandardsResponse>({
            ttl: 5 * 60 * 1000, // 5 minutes for search results
            maxSize: 500,
            ...config
        });

        this.validationCache = new CacheManager<ValidateCodeResponse>({
            ttl: 2 * 60 * 1000, // 2 minutes for validation results
            maxSize: 1000,
            ...config
        });
    }

    /**
     * Get cached standards response
     */
    getStandards(key: string): GetStandardsResponse | null {
        return this.standardsCache.get(key);
    }

    /**
     * Cache standards response
     */
    setStandards(key: string, response: GetStandardsResponse): void {
        this.standardsCache.set(key, response);
    }

    /**
     * Get cached search response
     */
    getSearch(key: string): SearchStandardsResponse | null {
        return this.searchCache.get(key);
    }

    /**
     * Cache search response
     */
    setSearch(key: string, response: SearchStandardsResponse): void {
        this.searchCache.set(key, response);
    }

    /**
     * Get cached validation response
     */
    getValidation(key: string): ValidateCodeResponse | null {
        return this.validationCache.get(key);
    }

    /**
     * Cache validation response
     */
    setValidation(key: string, response: ValidateCodeResponse): void {
        this.validationCache.set(key, response);
    }

    /**
     * Clear all caches
     */
    clear(): void {
        this.standardsCache.clear();
        this.searchCache.clear();
        this.validationCache.clear();
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
     * Get combined cache statistics
     */
    getStats(): {
        standards: CacheStats;
        search: CacheStats;
        validation: CacheStats;
        combined: CacheStats;
    } {
        const standards = this.standardsCache.getStats();
        const search = this.searchCache.getStats();
        const validation = this.validationCache.getStats();

        const combined: CacheStats = {
            hits: standards.hits + search.hits + validation.hits,
            misses: standards.misses + search.misses + validation.misses,
            size: standards.size + search.size + validation.size,
            hitRate: 0,
            memoryUsage: standards.memoryUsage + search.memoryUsage + validation.memoryUsage
        };

        const totalRequests = combined.hits + combined.misses;
        if (totalRequests > 0) {
            combined.hitRate = Math.round((combined.hits / totalRequests) * 10000) / 100;
        }

        return { standards, search, validation, combined };
    }

    /**
     * Update cache configuration for all caches
     */
    updateConfig(config: Partial<CacheConfig>): void {
        this.standardsCache.updateConfig(config);
        this.searchCache.updateConfig(config);
        this.validationCache.updateConfig(config);
    }

    /**
     * Check if caches are enabled
     */
    isEnabled(): boolean {
        return this.standardsCache.isEnabled() &&
               this.searchCache.isEnabled() &&
               this.validationCache.isEnabled();
    }
}

/**
 * Global cache instance
 */
export const mcpCache = new McpResponseCache({
    ttl: 5 * 60 * 1000, // 5 minutes default
    maxSize: 1000,
    enabled: true
});

/**
 * Cache key generators
 */
export const CacheKeys = {
    standards: (technology?: string, category?: string): string =>
        `standards:${technology || 'all'}:${category || 'all'}`,

    search: (query: string, technology?: string, fuzzy?: boolean, limit?: number): string =>
        `search:${query}:${technology || 'all'}:${fuzzy !== false ? 'fuzzy' : 'exact'}:${limit || 10}`,

    validation: (codeHash: string, language: string, rules?: string[]): string =>
        `validation:${codeHash}:${language}:${rules?.join(',') || 'default'}`
};

/**
 * Utility to create hash of code for caching validation results
 */
export function createCodeHash(code: string): string {
    // Simple hash function - in production, use a proper hash like SHA-256
    let hash = 0;
    for (let i = 0; i < code.length; i++) {
        const char = code.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
}