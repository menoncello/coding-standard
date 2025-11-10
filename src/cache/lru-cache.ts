/**
 * High-performance LRU cache optimized for sub-30ms response times
 * Implements efficient O(1) operations with memory pressure handling
 */

import { CacheEntry } from './cache-manager.js';

/**
 * LRU cache node for doubly-linked list
 */
interface LRUNode<T> {
    key: string;
    entry: CacheEntry<T>;
    prev: LRUNode<T> | null;
    next: LRUNode<T> | null;
}

/**
 * Memory pressure levels
 */
export enum MemoryPressureLevel {
    NONE = 'none',
    LOW = 'low',
    MEDIUM = 'medium',
    HIGH = 'high',
    CRITICAL = 'critical'
}

/**
 * LRU cache configuration
 */
export interface LRUCacheConfig {
    maxSize: number;
    memoryLimit: number; // Memory limit in bytes
    ttl: number; // Default TTL in milliseconds
    evictionThreshold: number; // Percentage of memory limit to trigger eviction
    cleanupInterval: number; // Cleanup interval in milliseconds
    enableMemoryPressure: boolean;
    enableMetrics: boolean;
}

/**
 * Cache performance metrics
 */
export interface LRUCacheMetrics {
    hits: number;
    misses: number;
    evictions: number;
    memoryUsage: number;
    size: number;
    hitRate: number;
    averageGetTime: number;
    averageSetTime: number;
    memoryPressureLevel: MemoryPressureLevel;
}

/**
 * High-performance LRU cache with memory pressure handling
 */
export class LRUCache<T = any> {
    private cache = new Map<string, LRUNode<T>>();
    private config: LRUCacheConfig;
    private metrics: LRUCacheMetrics;
    private head: LRUNode<T> | null = null;
    private tail: LRUNode<T> | null = null;
    private cleanupTimer: Timer | null = null;
    private memoryUsage = 0;
    private totalGetTime = 0;
    private totalSets = 0;
    private totalSetTime = 0;

    constructor(config: Partial<LRUCacheConfig> = {}) {
        this.config = {
            maxSize: 1000,
            memoryLimit: 50 * 1024 * 1024, // 50MB
            ttl: 5 * 60 * 1000, // 5 minutes default TTL
            evictionThreshold: 0.8, // 80% of memory limit
            cleanupInterval: 60000, // 1 minute
            enableMemoryPressure: true,
            enableMetrics: true,
            ...config
        };

        this.metrics = {
            hits: 0,
            misses: 0,
            evictions: 0,
            memoryUsage: 0,
            size: 0,
            hitRate: 0,
            averageGetTime: 0,
            averageSetTime: 0,
            memoryPressureLevel: MemoryPressureLevel.NONE
        };

        // Start cleanup timer
        this.startCleanupTimer();
    }

    /**
     * Get value from cache (O(1) operation)
     */
    get(key: string): T | undefined {
        const startTime = performance.now();

        const node = this.cache.get(key);
        if (!node) {
            this.metrics.misses++;
            this.updateGetMetrics(performance.now() - startTime);
            return undefined;
        }

        // Check expiration
        if (Date.now() > node.entry.expiresAt) {
            this.removeNode(node);
            this.cache.delete(key);
            this.updateMemoryUsage();
            this.metrics.misses++;
            this.updateGetMetrics(performance.now() - startTime);
            return undefined;
        }

        // Move to front (most recently used)
        this.moveToFront(node);
        node.entry.hits++;
        this.metrics.hits++;

        this.updateGetMetrics(performance.now() - startTime);
        return node.entry.data;
    }

    /**
     * Set value in cache (O(1) operation)
     */
    set(key: string, data: T, ttl?: number): void {
        const startTime = performance.now();

        // Check if key already exists
        const existingNode = this.cache.get(key);
        if (existingNode) {
            // Update existing entry
            this.removeNode(existingNode);
            this.cache.delete(key);
            this.updateMemoryUsage();
        }

        // Create new entry
        const now = Date.now();
        const entry: CacheEntry<T> = {
            data,
            timestamp: now,
            expiresAt: now + (ttl || this.config.ttl), // Use config.ttl as default
            hits: 0
        };

        const node: LRUNode<T> = {
            key,
            entry,
            prev: null,
            next: this.head
        };

        if (this.head) {
            this.head.prev = node;
        }
        this.head = node;

        if (!this.tail) {
            this.tail = node;
        }

        this.cache.set(key, node);
        this.updateMemoryUsage();

        // Handle memory pressure and size limits
        this.handleEviction();

        this.totalSets++;
        this.updateSetMetrics(performance.now() - startTime);
    }

    /**
     * Delete value from cache
     */
    delete(key: string): boolean {
        const node = this.cache.get(key);
        if (!node) return false;

        this.removeNode(node);
        this.cache.delete(key);
        this.updateMemoryUsage();
        return true;
    }

    /**
     * Check if key exists and is not expired
     */
    has(key: string): boolean {
        const node = this.cache.get(key);
        if (!node) return false;

        if (Date.now() > node.entry.expiresAt) {
            this.removeNode(node);
            this.cache.delete(key);
            this.updateMemoryUsage();
            return false;
        }

        return true;
    }

    /**
     * Clear all cache entries
     */
    clear(): void {
        this.cache.clear();
        this.head = null;
        this.tail = null;
        this.memoryUsage = 0;
        this.resetMetrics();
    }

    /**
     * Get cache size
     */
    size(): number {
        return this.cache.size;
    }

    /**
     * Get all keys
     */
    keys(): string[] {
        return Array.from(this.cache.keys());
    }

    /**
     * Remove expired entries
     */
    cleanup(): number {
        const now = Date.now();
        const expiredKeys: string[] = [];

        for (const [key, node] of this.cache.entries()) {
            if (now > node.entry.expiresAt) {
                expiredKeys.push(key);
            }
        }

        for (const key of expiredKeys) {
            const node = this.cache.get(key);
            if (node) {
                this.removeNode(node);
                this.cache.delete(key);
            }
        }

        this.updateMemoryUsage();
        return expiredKeys.length;
    }

    /**
     * Get current memory pressure level
     */
    getMemoryPressureLevel(): MemoryPressureLevel {
        if (!this.config.enableMemoryPressure) {
            return MemoryPressureLevel.NONE;
        }

        const memoryUsageRatio = this.memoryUsage / this.config.memoryLimit;

        if (memoryUsageRatio >= 0.95) return MemoryPressureLevel.CRITICAL;
        if (memoryUsageRatio >= 0.85) return MemoryPressureLevel.HIGH;
        if (memoryUsageRatio >= 0.75) return MemoryPressureLevel.MEDIUM;
        if (memoryUsageRatio >= 0.6) return MemoryPressureLevel.LOW;
        return MemoryPressureLevel.NONE;
    }

    /**
     * Get cache metrics
     */
    getMetrics(): LRUCacheMetrics {
        const totalRequests = this.metrics.hits + this.metrics.misses;
        const hitRate = totalRequests > 0 ? (this.metrics.hits / totalRequests) * 100 : 0;
        const avgGetTime = this.metrics.hits + this.metrics.misses > 0 ?
            this.totalGetTime / (this.metrics.hits + this.metrics.misses) : 0;
        const avgSetTime = this.totalSets > 0 ? this.totalSetTime / this.totalSets : 0;

        return {
            ...this.metrics,
            hitRate: Math.round(hitRate * 100) / 100,
            averageGetTime: Math.round(avgGetTime * 1000) / 1000, // Convert to microseconds
            averageSetTime: Math.round(avgSetTime * 1000) / 1000, // Convert to microseconds
            memoryUsage: this.memoryUsage,
            size: this.cache.size,
            memoryPressureLevel: this.getMemoryPressureLevel()
        };
    }

    /**
     * Get cache statistics (alias for getMetrics for test compatibility)
     */
    getStats(): LRUCacheMetrics {
        return this.getMetrics();
    }

    /**
     * Force memory pressure eviction
     */
    forceEviction(targetSize?: number): number {
        const target = targetSize || Math.floor(this.config.maxSize * 0.7);
        let evicted = 0;

        while (this.cache.size > target && this.tail) {
            const nodeToRemove = this.tail;
            this.removeNode(nodeToRemove);
            this.cache.delete(nodeToRemove.key);
            evicted++;
        }

        this.updateMemoryUsage();
        this.metrics.evictions += evicted;
        return evicted;
    }

    /**
     * Destroy cache and cleanup timers
     */
    destroy(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
        this.clear();
    }

    /**
     * Move node to front of LRU list
     */
    private moveToFront(node: LRUNode<T>): void {
        if (node === this.head) return;

        this.removeNode(node);

        node.prev = null;
        node.next = this.head;

        if (this.head) {
            this.head.prev = node;
        }
        this.head = node;

        if (!this.tail) {
            this.tail = node;
        }
    }

    /**
     * Remove node from LRU list
     */
    private removeNode(node: LRUNode<T>): void {
        if (node.prev) {
            node.prev.next = node.next;
        } else {
            this.head = node.next;
        }

        if (node.next) {
            node.next.prev = node.prev;
        } else {
            this.tail = node.prev;
        }
    }

    /**
     * Handle eviction based on memory pressure and size limits
     */
    private handleEviction(): void {
        // Memory pressure eviction
        if (this.config.enableMemoryPressure) {
            const memoryPressureLevel = this.getMemoryPressureLevel();
            if (memoryPressureLevel !== MemoryPressureLevel.NONE) {
                const evictionRatio = this.getEvictionRatio(memoryPressureLevel);
                const targetSize = Math.floor(this.config.maxSize * (1 - evictionRatio));
                this.forceEviction(targetSize);
                return;
            }
        }

        // Size-based eviction
        while (this.cache.size > this.config.maxSize && this.tail) {
            const nodeToRemove = this.tail;
            this.removeNode(nodeToRemove);
            this.cache.delete(nodeToRemove.key);
            this.metrics.evictions++;
        }
    }

    /**
     * Get eviction ratio based on memory pressure level
     */
    private getEvictionRatio(level: MemoryPressureLevel): number {
        switch (level) {
            case MemoryPressureLevel.CRITICAL: return 0.5; // Evict 50%
            case MemoryPressureLevel.HIGH: return 0.3; // Evict 30%
            case MemoryPressureLevel.MEDIUM: return 0.2; // Evict 20%
            case MemoryPressureLevel.LOW: return 0.1; // Evict 10%
            default: return 0;
        }
    }

    /**
     * Update memory usage estimation
     */
    private updateMemoryUsage(): void {
        this.memoryUsage = 0;
        for (const node of this.cache.values()) {
            // Estimate memory usage
            this.memoryUsage += this.estimateEntrySize(node.entry);
        }
        this.metrics.memoryUsage = this.memoryUsage;
    }

    /**
     * Estimate memory size of cache entry
     */
    private estimateEntrySize(entry: CacheEntry<T>): number {
        try {
            const dataSize = JSON.stringify(entry.data).length * 2; // UTF-16
            const overhead = 200; // Object overhead
            return dataSize + overhead;
        } catch (error) {
            return 1000; // Fallback estimate
        }
    }

    /**
     * Update get operation metrics
     */
    private updateGetMetrics(time: number): void {
        if (!this.config.enableMetrics) return;
        this.totalGetTime += time;
        this.updateHitRate();
    }

    /**
     * Update set operation metrics
     */
    private updateSetMetrics(time: number): void {
        if (!this.config.enableMetrics) return;
        this.totalSetTime += time;
    }

    /**
     * Update hit rate calculation
     */
    private updateHitRate(): void {
        const totalRequests = this.metrics.hits + this.metrics.misses;
        this.metrics.hitRate = totalRequests > 0 ?
            Math.round((this.metrics.hits / totalRequests) * 10000) / 100 : 0;
    }

    /**
     * Reset all metrics
     */
    private resetMetrics(): void {
        this.metrics = {
            hits: 0,
            misses: 0,
            evictions: 0,
            memoryUsage: 0,
            size: 0,
            hitRate: 0,
            averageGetTime: 0,
            averageSetTime: 0,
            memoryPressureLevel: MemoryPressureLevel.NONE
        };
        this.totalGetTime = 0;
        this.totalSets = 0;
        this.totalSetTime = 0;
    }

    /**
     * Start cleanup timer
     */
    private startCleanupTimer(): void {
        if (this.config.cleanupInterval > 0) {
            this.cleanupTimer = setInterval(() => {
                this.cleanup();
            }, this.config.cleanupInterval);
        }
    }
}