/**
 * Intelligent cache warming system for critical standards
 * Analyzes access patterns and pre-loads frequently accessed content
 */

import { PerformanceCache } from './performance-layer.js';
import { PerformanceMonitor } from '../utils/performance-monitor.js';

/**
 * Access pattern entry
 */
export interface AccessPattern {
    key: string;
    frequency: number;
    lastAccessed: number;
    averageAccessTime: number;
    priority: 'low' | 'medium' | 'high' | 'critical';
    category: string;
    technology: string;
}

/**
 * Warm-up strategy
 */
export enum WarmupStrategy {
    FREQUENCY_BASED = 'frequency_based',
    PRIORITY_BASED = 'priority_based',
    TIME_BASED = 'time_based',
    HYBRID = 'hybrid'
}

/**
 * Cache warming configuration
 */
export interface CacheWarmingConfig {
    strategy: WarmupStrategy;
    warmupTimeout: number; // Maximum time for warmup (ms)
    criticalCategories: string[];
    criticalTechnologies: string[];
    maxWarmupItems: number;
    accessPatternWindow: number; // Time window to analyze patterns (ms)
    enablePredictiveWarming: boolean;
    warmupOnStartup: boolean;
    warmupOnAccess: boolean;
}

/**
 * Warm-up result
 */
export interface WarmupResult {
    success: boolean;
    itemsWarmed: number;
    timeSpent: number;
    errors: string[];
    skippedItems: string[];
    warmupStrategy: WarmupStrategy;
}

/**
 * Access analytics
 */
export interface AccessAnalytics {
    totalAccesses: number;
    uniqueKeys: number;
    mostAccessed: AccessPattern[];
    accessFrequency: Map<string, number>;
    averageAccessInterval: number;
    peakAccessTimes: number[];
}

/**
 * Cache warming manager for intelligent pre-loading
 */
export class CacheWarmer<T = any> {
    private performanceCache: PerformanceCache<T>;
    private performanceMonitor: PerformanceMonitor;
    private config: CacheWarmingConfig;
    private accessPatterns = new Map<string, AccessPattern>();
    private accessHistory: Array<{ key: string; timestamp: number; responseTime: number }> = [];
    private isWarming = false;
    private warmupPromise: Promise<WarmupResult> | null = null;

    constructor(
        performanceCache: PerformanceCache<T>,
        config: Partial<CacheWarmingConfig> = {}
    ) {
        this.performanceCache = performanceCache;
        this.performanceMonitor = new PerformanceMonitor();

        this.config = {
            strategy: WarmupStrategy.HYBRID,
            warmupTimeout: 200, // 200ms target
            criticalCategories: ['security', 'performance', 'linting'],
            criticalTechnologies: ['typescript', 'javascript', 'react'],
            maxWarmupItems: 50,
            accessPatternWindow: 24 * 60 * 60 * 1000, // 24 hours
            enablePredictiveWarming: true,
            warmupOnStartup: true,
            warmupOnAccess: false,
            ...config
        };
    }

    /**
     * Record cache access for pattern analysis
     */
    recordAccess(key: string, responseTime: number, metadata?: {
        category?: string;
        technology?: string;
    }): void {
        const timestamp = Date.now();

        // Update access history
        this.accessHistory.push({ key, timestamp, responseTime });

        // Trim old access records
        const cutoff = timestamp - this.config.accessPatternWindow;
        this.accessHistory = this.accessHistory.filter(access => access.timestamp > cutoff);

        // Update access pattern
        const existing = this.accessPatterns.get(key);
        if (existing) {
            existing.frequency++;
            existing.lastAccessed = timestamp;
            existing.averageAccessTime = (existing.averageAccessTime + responseTime) / 2;
        } else {
            const pattern: AccessPattern = {
                key,
                frequency: 1,
                lastAccessed: timestamp,
                averageAccessTime: responseTime,
                priority: this.calculatePriority(key, metadata),
                category: metadata?.category || this.extractCategoryFromKey(key),
                technology: metadata?.technology || this.extractTechnologyFromKey(key)
            };
            this.accessPatterns.set(key, pattern);
        }

        // Trigger adaptive warming if enabled
        if (this.config.warmupOnAccess && !this.isWarming) {
            this.triggerAdaptiveWarmup(key);
        }
    }

    /**
     * Perform cache warmup for critical items
     */
    async warmupCache(dataProvider: (key: string) => Promise<T>): Promise<WarmupResult> {
        if (this.isWarming) {
            return this.warmupPromise || {
                success: false,
                itemsWarmed: 0,
                timeSpent: 0,
                errors: ['Warmup already in progress'],
                skippedItems: [],
                warmupStrategy: this.config.strategy
            };
        }

        this.isWarming = true;
        const timerId = this.performanceMonitor.startTimer('cache_warmup');
        const startTime = Date.now();

        this.warmupPromise = this.performWarmup(dataProvider, startTime);

        try {
            const result = await this.warmupPromise;
            this.performanceMonitor.endTimer(timerId, 'cache_warmup', result.success);

            if (!result.success && result.errors.length > 0) {
                console.warn('Cache warmup completed with errors:', result.errors);
            }

            return result;

        } finally {
            this.isWarming = false;
            this.warmupPromise = null;
        }
    }

    /**
     * Get access analytics and patterns
     */
    getAccessAnalytics(): AccessAnalytics {
        const totalAccesses = this.accessHistory.length;
        const uniqueKeys = new Set(this.accessHistory.map(access => access.key)).size;

        // Calculate most accessed keys
        const mostAccessed = Array.from(this.accessPatterns.values())
            .sort((a, b) => b.frequency - a.frequency)
            .slice(0, 10);

        // Calculate access frequency distribution
        const accessFrequency = new Map<string, number>();
        this.accessHistory.forEach(access => {
            accessFrequency.set(access.key, (accessFrequency.get(access.key) || 0) + 1);
        });

        // Calculate average access interval
        const sortedTimestamps = this.accessHistory.map(access => access.timestamp).sort();
        let averageInterval = 0;
        if (sortedTimestamps.length > 1) {
            const intervals = [];
            for (let i = 1; i < sortedTimestamps.length; i++) {
                intervals.push(sortedTimestamps[i] - sortedTimestamps[i - 1]);
            }
            averageInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
        }

        // Find peak access times (simplified - hourly buckets)
        const hourlyBuckets = new Array(24).fill(0);
        this.accessHistory.forEach(access => {
            const hour = new Date(access.timestamp).getHours();
            hourlyBuckets[hour]++;
        });
        const peakAccessTimes = hourlyBuckets
            .map((count, hour) => ({ hour, count }))
            .filter(item => item.count > 0)
            .sort((a, b) => b.count - a.count)
            .slice(0, 3)
            .map(item => item.hour);

        return {
            totalAccesses,
            uniqueKeys,
            mostAccessed,
            accessFrequency,
            averageAccessInterval: averageInterval,
            peakAccessTimes
        };
    }

    /**
     * Get warmup candidates based on strategy
     */
    getWarmupCandidates(limit: number = this.config.maxWarmupItems): string[] {
        const candidates: Array<{ key: string; score: number }> = [];

        for (const [key, pattern] of this.accessPatterns.entries()) {
            const score = this.calculateWarmupScore(pattern);
            candidates.push({ key, score });
        }

        // Sort by score and return top candidates
        return candidates
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map(candidate => candidate.key);
    }

    /**
     * Perform the actual warmup operation
     */
    private async performWarmup(dataProvider: (key: string) => Promise<T>, startTime: number): Promise<WarmupResult> {
        const result: WarmupResult = {
            success: true,
            itemsWarmed: 0,
            timeSpent: 0,
            errors: [],
            skippedItems: [],
            warmupStrategy: this.config.strategy
        };

        try {
            // Get warmup candidates based on strategy
            const candidates = this.getWarmupCandidates();

            if (candidates.length === 0) {
                result.success = true;
                result.timeSpent = Date.now() - startTime;
                return result;
            }

            // Warm up items in parallel with timeout
            const warmupPromises = candidates.map(async (key) => {
                try {
                    // Check if already cached
                    if (await this.performanceCache.has(key)) {
                        result.skippedItems.push(`${key} (already cached)`);
                        return;
                    }

                    // Load and cache the item
                    const data = await dataProvider(key);
                    if (data) {
                        await this.performanceCache.set(key, data);
                        result.itemsWarmed++;
                    } else {
                        result.skippedItems.push(`${key} (no data)`);
                    }

                } catch (error) {
                    result.errors.push(`${key}: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
            });

            // Wait for all warmup operations with timeout
            await Promise.race([
                Promise.all(warmupPromises),
                new Promise(resolve => setTimeout(resolve, this.config.warmupTimeout))
            ]);

            result.timeSpent = Date.now() - startTime;
            result.success = result.errors.length === 0 || result.itemsWarmed > 0;

        } catch (error) {
            result.success = false;
            result.errors.push(`Warmup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            result.timeSpent = Date.now() - startTime;
        }

        return result;
    }

    /**
     * Trigger adaptive warmup based on access patterns
     */
    private async triggerAdaptiveWarmup(accessedKey: string): Promise<void> {
        if (!this.config.enablePredictiveWarming) return;

        // Find related keys that might benefit from warming
        const pattern = this.accessPatterns.get(accessedKey);
        if (!pattern || pattern.priority === 'low') return;

        // Get related keys based on category/technology
        const relatedKeys = Array.from(this.accessPatterns.entries())
            .filter(([key, p]) =>
                key !== accessedKey &&
                (p.category === pattern.category || p.technology === pattern.technology) &&
                p.frequency >= 2 // At least accessed twice
            )
            .map(([key]) => key)
            .slice(0, 5); // Limit to 5 related items

        if (relatedKeys.length === 0) return;

        // Perform adaptive warmup in background (fire and forget)
        this.adaptiveWarmup(relatedKeys).catch(error => {
            console.warn('Adaptive warmup failed:', error);
        });
    }

    /**
     * Perform adaptive warmup for related items
     */
    private async adaptiveWarmup(keys: string[]): Promise<void> {
        // This would integrate with your data loading system
        // For now, it's a placeholder that shows the intention
        console.debug(`Adaptive warmup triggered for keys: ${keys.join(', ')}`);
    }

    /**
     * Calculate warmup score for a key
     */
    private calculateWarmupScore(pattern: AccessPattern): number {
        let score = 0;

        switch (this.config.strategy) {
            case WarmupStrategy.FREQUENCY_BASED:
                score = pattern.frequency;
                break;

            case WarmupStrategy.PRIORITY_BASED:
                const priorityWeights = { critical: 100, high: 75, medium: 50, low: 25 };
                score = priorityWeights[pattern.priority] + pattern.frequency;
                break;

            case WarmupStrategy.TIME_BASED:
                const recencyWeight = Math.max(0, 1 - (Date.now() - pattern.lastAccessed) / this.config.accessPatternWindow);
                score = pattern.frequency * recencyWeight;
                break;

            case WarmupStrategy.HYBRID:
                const priorityWeight = { critical: 1.0, high: 0.8, medium: 0.6, low: 0.4 }[pattern.priority];
                const recencyBonus = Math.max(0, 1 - (Date.now() - pattern.lastAccessed) / this.config.accessPatternWindow);
                score = pattern.frequency * priorityWeight * (1 + recencyBonus);

                // Bonus for critical categories/technologies
                if (this.config.criticalCategories.includes(pattern.category)) {
                    score *= 1.5;
                }
                if (this.config.criticalTechnologies.includes(pattern.technology)) {
                    score *= 1.3;
                }
                break;
        }

        // Apply time decay for old accesses
        const timeSinceAccess = Date.now() - pattern.lastAccessed;
        const decayFactor = Math.exp(-timeSinceAccess / (7 * 24 * 60 * 60 * 1000)); // 7-day half-life
        score *= decayFactor;

        return Math.round(score * 100) / 100;
    }

    /**
     * Calculate priority for a key
     */
    private calculatePriority(key: string, metadata?: { category?: string; technology?: string }): 'low' | 'medium' | 'high' | 'critical' {
        const category = metadata?.category || this.extractCategoryFromKey(key);
        const technology = metadata?.technology || this.extractTechnologyFromKey(key);

        // Critical categories and technologies get highest priority
        if (this.config.criticalCategories.includes(category) ||
            this.config.criticalTechnologies.includes(technology)) {
            return 'critical';
        }

        // Common patterns get high priority
        if (key.includes('eslint') || key.includes('typescript') || key.includes('react')) {
            return 'high';
        }

        // Other patterns get medium priority
        if (key.includes('config') || key.includes('standard')) {
            return 'medium';
        }

        return 'low';
    }

    /**
     * Extract category from cache key
     */
    private extractCategoryFromKey(key: string): string {
        const keyLower = key.toLowerCase();
        if (keyLower.includes('security') || keyLower.includes('auth')) return 'security';
        if (keyLower.includes('perf') || keyLower.includes('performance')) return 'performance';
        if (keyLower.includes('lint') || keyLower.includes('style')) return 'linting';
        if (keyLower.includes('test') || keyLower.includes('spec')) return 'testing';
        if (keyLower.includes('build') || keyLower.includes('deploy')) return 'build';
        if (keyLower.includes('config') || keyLower.includes('setting')) return 'configuration';
        return 'general';
    }

    /**
     * Extract technology from cache key
     */
    private extractTechnologyFromKey(key: string): string {
        const keyLower = key.toLowerCase();
        if (keyLower.includes('typescript') || keyLower.includes('ts')) return 'typescript';
        if (keyLower.includes('javascript') || keyLower.includes('js')) return 'javascript';
        if (keyLower.includes('react') || keyLower.includes('jsx')) return 'react';
        if (keyLower.includes('vue') || keyLower.includes('vuejs')) return 'vue';
        if (keyLower.includes('angular') || keyLower.includes('ng')) return 'angular';
        if (keyLower.includes('node') || keyLower.includes('nodejs')) return 'nodejs';
        if (keyLower.includes('python') || keyLower.includes('py')) return 'python';
        if (keyLower.includes('eslint') || keyLower.includes('prettier')) return 'tooling';
        return 'general';
    }
}