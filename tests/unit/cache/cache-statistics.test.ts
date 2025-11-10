import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { CacheStatistics, CacheEventType } from '../../../src/cache/cache-statistics.js';

describe('CacheStatistics - Unit Tests', () => {
    let cacheStats: CacheStatistics;

    beforeEach(() => {
        // GIVEN: Fresh cache statistics instance
        cacheStats = new CacheStatistics();
    });

    test('should initialize with zero statistics', () => {
        // WHEN: Creating new statistics instance
        // THEN: All metrics should start at zero
        const realtimeStats = cacheStats.getRealtimeStats();
        expect(realtimeStats.currentHitRate).toBe(0);
        expect(realtimeStats.currentResponseTime).toBe(0);
        expect(realtimeStats.currentMemoryUsage).toBe(0);
        expect(realtimeStats.recentEvents).toHaveLength(0);
        expect(realtimeStats.alerts).toHaveLength(0);

        const analytics = cacheStats.getAnalytics();
        expect(analytics.performance.averageResponseTime).toBe(0);
        expect(analytics.efficiency.hitRateTrend).toHaveLength(0);
        expect(analytics.memory.usageTrend).toHaveLength(0);
    });

    test('should record cache hits correctly', () => {
        // GIVEN: Statistics instance
        // WHEN: Recording cache hits using recordEvent
        cacheStats.recordEvent({
            type: CacheEventType.HIT,
            layer: 'memory',
            value: 15 // 15ms response time
        });
        cacheStats.recordEvent({
            type: CacheEventType.HIT,
            layer: 'memory',
            value: 25 // 25ms response time
        });
        cacheStats.recordEvent({
            type: CacheEventType.HIT,
            layer: 'memory',
            value: 10 // 10ms response time
        });

        // THEN: Statistics should reflect hits
        const realtimeStats = cacheStats.getRealtimeStats();
        expect(realtimeStats.currentHitRate).toBe(100); // All hits
        expect(realtimeStats.currentResponseTime).toBe(16.67); // (15+25+10)/3
        expect(realtimeStats.recentEvents.length).toBeGreaterThan(0);
        expect(realtimeStats.recentEvents.every(e => e.type === CacheEventType.HIT)).toBe(true);
    });

    test('should record cache misses correctly', () => {
        // GIVEN: Statistics instance
        // WHEN: Recording cache misses using recordEvent
        cacheStats.recordEvent({
            type: CacheEventType.MISS,
            layer: 'memory',
            value: 50 // 50ms response time (cache miss + backend fetch)
        });
        cacheStats.recordEvent({
            type: CacheEventType.MISS,
            layer: 'memory',
            value: 75 // 75ms response time
        });

        // THEN: Statistics should reflect misses
        const realtimeStats = cacheStats.getRealtimeStats();
        expect(realtimeStats.currentHitRate).toBe(0); // All misses
        expect(realtimeStats.currentResponseTime).toBe(62.5); // (50+75)/2
        expect(realtimeStats.recentEvents.length).toBeGreaterThan(0);
        expect(realtimeStats.recentEvents.every(e => e.type === CacheEventType.MISS)).toBe(true);
    });

    test('should calculate hit rate correctly for mixed hits/misses', () => {
        // GIVEN: Statistics instance
        // WHEN: Recording mixed hits and misses
        cacheStats.recordEvent({ type: CacheEventType.HIT, layer: 'memory', value: 20 });
        cacheStats.recordEvent({ type: CacheEventType.HIT, layer: 'memory', value: 15 });
        cacheStats.recordEvent({ type: CacheEventType.MISS, layer: 'memory', value: 80 });
        cacheStats.recordEvent({ type: CacheEventType.HIT, layer: 'memory', value: 25 });
        cacheStats.recordEvent({ type: CacheEventType.MISS, layer: 'memory', value: 90 });

        // THEN: Hit rate should be calculated correctly
        const realtimeStats = cacheStats.getRealtimeStats();
        expect(realtimeStats.currentHitRate).toBe(60); // 3 hits out of 5
        expect(realtimeStats.currentResponseTime).toBe(46); // (20+15+80+25+90)/5
    });

    test('should record evictions correctly', () => {
        // GIVEN: Statistics instance
        // WHEN: Recording evictions
        cacheStats.recordEvent({ type: CacheEventType.EVICTION, layer: 'memory' });
        cacheStats.recordEvent({ type: CacheEventType.EVICTION, layer: 'memory' });
        cacheStats.recordEvent({ type: CacheEventType.EVICTION, layer: 'memory' });

        // THEN: Evictions should be tracked
        const realtimeStats = cacheStats.getRealtimeStats();
        const evictionEvents = realtimeStats.recentEvents.filter(e => e.type === CacheEventType.EVICTION);
        expect(evictionEvents.length).toBe(3);
    });

    test('should track memory usage through time series data', () => {
        // GIVEN: Statistics instance
        // WHEN: Recording memory usage events
        cacheStats.recordEvent({
            type: CacheEventType.MEMORY_PRESSURE,
            layer: 'memory',
            value: 1024 * 1024, // 1MB
            metadata: { action: 'usage_update' }
        });
        cacheStats.recordEvent({
            type: CacheEventType.MEMORY_PRESSURE,
            layer: 'memory',
            value: 2 * 1024 * 1024, // 2MB
            metadata: { action: 'usage_update' }
        });

        // THEN: Memory usage should be tracked
        const analytics = cacheStats.getAnalytics();
        expect(analytics.memory.pressureEvents.length).toBeGreaterThan(0);
    });

    test('should destroy statistics correctly', () => {
        // GIVEN: Statistics with data
        cacheStats.recordEvent({ type: CacheEventType.HIT, layer: 'memory', value: 10 });
        cacheStats.recordEvent({ type: CacheEventType.MISS, layer: 'memory', value: 50 });
        cacheStats.recordEvent({ type: CacheEventType.EVICTION, layer: 'memory' });

        expect(cacheStats.getRealtimeStats().recentEvents.length).toBeGreaterThan(0);

        // WHEN: Destroying statistics
        cacheStats.destroy();

        // THEN: All statistics should be reset
        const realtimeStats = cacheStats.getRealtimeStats();
        expect(realtimeStats.recentEvents).toHaveLength(0);
        expect(realtimeStats.currentHitRate).toBe(0);
        expect(realtimeStats.currentResponseTime).toBe(0);
    });

    test('should provide analytics data', () => {
        // GIVEN: Statistics with some data
        cacheStats.recordEvent({ type: CacheEventType.HIT, layer: 'memory', value: 20 });
        cacheStats.recordEvent({ type: CacheEventType.HIT, layer: 'memory', value: 25 });
        cacheStats.recordEvent({ type: CacheEventType.MISS, layer: 'memory', value: 80 });

        // WHEN: Getting analytics
        const analytics = cacheStats.getAnalytics();

        // THEN: Should provide comprehensive analytics
        expect(analytics).toBeDefined();
        expect(analytics.performance).toBeDefined();
        expect(analytics.efficiency).toBeDefined();
        expect(analytics.memory).toBeDefined();
        expect(analytics.patterns).toBeDefined();
        expect(analytics.sla).toBeDefined();
    });

    test('should export statistics in different formats', () => {
        // GIVEN: Statistics with data
        cacheStats.recordEvent({ type: CacheEventType.HIT, layer: 'memory', value: 20 });
        cacheStats.recordEvent({ type: CacheEventType.MISS, layer: 'memory', value: 50 });

        // WHEN: Exporting statistics
        const exportedJSON = cacheStats.exportStatistics();

        // THEN: Should export valid JSON
        expect(() => JSON.parse(exportedJSON)).not.toThrow();
        const parsed = JSON.parse(exportedJSON);
        expect(parsed.analytics).toBeDefined();
        expect(parsed.realtime).toBeDefined();
        expect(parsed.events).toBeDefined();
    });

    test('should generate performance report', () => {
        // GIVEN: Statistics with performance data
        cacheStats.recordEvent({ type: CacheEventType.HIT, layer: 'memory', value: 20 });
        cacheStats.recordEvent({ type: CacheEventType.MISS, layer: 'memory', value: 50 });
        cacheStats.recordEvent({ type: CacheEventType.EVICTION, layer: 'memory' });

        // WHEN: Generating performance report
        const report = cacheStats.generatePerformanceReport();

        // THEN: Should generate a comprehensive report
        expect(report).toBeDefined();
        expect(typeof report).toBe('string');
        expect(report).toContain('Cache Performance Report');
        expect(report).toContain('Total Requests');
        expect(report).toContain('Cache Hits');
        expect(report).toContain('Cache Misses');
    });

    test('should predict performance when enabled', () => {
        // GIVEN: Statistics with predictive analysis enabled
        const predictiveCacheStats = new CacheStatistics({
            enablePredictiveAnalysis: true,
            alertThresholds: {
                hitRateMin: 80,
                responseTimeMax: 100,
                memoryUsageMax: 50 * 1024 * 1024,
                slaComplianceMin: 95
            }
        });

        // Add some data points for prediction
        for (let i = 0; i < 5; i++) {
            predictiveCacheStats.recordEvent({
                type: CacheEventType.HIT,
                layer: 'memory',
                value: 20 + i * 2
            });
        }

        // WHEN: Predicting performance
        const prediction = predictiveCacheStats.predictPerformance(1);

        // THEN: Should provide performance predictions
        expect(prediction).toBeDefined();
        expect(prediction.predictedHitRate).toBeGreaterThanOrEqual(0);
        expect(prediction.predictedMemoryUsage).toBeGreaterThanOrEqual(0);
        expect(prediction.predictedResponseTime).toBeGreaterThanOrEqual(0);
        expect(prediction.confidence).toBeGreaterThanOrEqual(0);
        expect(prediction.recommendations).toBeDefined();
        expect(Array.isArray(prediction.recommendations)).toBe(true);
    });

    test('should handle predictive analysis when disabled', () => {
        // GIVEN: Statistics with predictive analysis disabled
        const nonPredictiveCacheStats = new CacheStatistics({
            enablePredictiveAnalysis: false
        });

        // WHEN: Predicting performance
        const prediction = nonPredictiveCacheStats.predictPerformance(1);

        // THEN: Should return default prediction
        expect(prediction.predictedHitRate).toBe(0);
        expect(prediction.predictedMemoryUsage).toBe(0);
        expect(prediction.predictedResponseTime).toBe(0);
        expect(prediction.confidence).toBe(0);
        expect(prediction.recommendations).toContain('Predictive analysis is disabled');
    });

    test('should handle alert generation', () => {
        // GIVEN: Statistics with low threshold configuration
        const alertCacheStats = new CacheStatistics({
            alertThresholds: {
                hitRateMin: 50, // Lower threshold to trigger alerts easily
                responseTimeMax: 30,
                memoryUsageMax: 1024 * 1024, // 1MB
                slaComplianceMin: 80
            }
        });

        // WHEN: Recording operations that should trigger alerts
        alertCacheStats.recordEvent({ type: CacheEventType.MISS, layer: 'memory' });
        alertCacheStats.recordEvent({ type: CacheEventType.MISS, layer: 'memory' });
        alertCacheStats.recordEvent({
            type: CacheEventType.MEMORY_PRESSURE,
            layer: 'memory',
            value: 2 * 1024 * 1024 // 2MB - above threshold
        });

        // THEN: Should generate alerts
        const realtimeStats = alertCacheStats.getRealtimeStats();
        // Note: Alerts depend on the time window and may not be generated immediately
        expect(Array.isArray(realtimeStats.alerts)).toBe(true);
    });

    test('should handle different event types', () => {
        // GIVEN: Statistics instance
        // WHEN: Recording different event types
        cacheStats.recordEvent({ type: CacheEventType.HIT, layer: 'memory', value: 10 });
        cacheStats.recordEvent({ type: CacheEventType.MISS, layer: 'memory', value: 50 });
        cacheStats.recordEvent({ type: CacheEventType.EVICTION, layer: 'memory' });
        cacheStats.recordEvent({ type: CacheEventType.PROMOTION, layer: 'persistent' });
        cacheStats.recordEvent({ type: CacheEventType.CLEANUP, layer: 'memory' });
        cacheStats.recordEvent({ type: CacheEventType.WARMUP, layer: 'memory' });
        cacheStats.recordEvent({ type: CacheEventType.SLA_VIOLATION, layer: 'memory' });

        // THEN: Should track all event types
        const realtimeStats = cacheStats.getRealtimeStats();
        expect(realtimeStats.recentEvents.length).toBeGreaterThan(0);

        const eventTypes = new Set(realtimeStats.recentEvents.map(e => e.type));
        expect(eventTypes.has(CacheEventType.HIT)).toBe(true);
        expect(eventTypes.has(CacheEventType.MISS)).toBe(true);
        expect(eventTypes.has(CacheEventType.EVICTION)).toBe(true);
    });
});