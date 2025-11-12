import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { CacheInvalidationService } from '../../../src/utils/cache-invalidator';
import { CacheManager } from '../../../src/cache/cache-manager';
import { McpResponseCache } from '../../../src/cache/cache-manager';

describe('CacheInvalidationService - AC5: Performance During Hot Reload', () => {
  let cacheInvalidator: CacheInvalidationService;
  let cacheManager: CacheManager;
  let mcpCache: McpResponseCache;

  beforeEach(async () => {
    cacheManager = new CacheManager({
      ttl: 3600000,
      maxSize: 2000,
      enabled: true
    });

    mcpCache = new McpResponseCache();

    // Initialize MCP cache (if it has initialization)
    if ('initialize' in mcpCache && typeof mcpCache.initialize === 'function') {
      await mcpCache.initialize();
    }

    cacheInvalidator = new CacheInvalidationService(
      mcpCache,
      {
        enabled: true,
        enableWarming: false, // Disable for testing
        warmingDelayMs: 0,
        maxWarmingConcurrency: 1,
        invalidationTimeoutMs: 100,
        selectiveInvalidation: true,
        priorityInvalidation: true
      }
    );
  });

  afterEach(async () => {
    // Clean up resources if cleanup methods exist
    if (cacheInvalidator && 'cleanup' in cacheInvalidator && typeof cacheInvalidator.cleanup === 'function') {
      await cacheInvalidator.cleanup();
    }
    if (cacheManager && 'cleanup' in cacheManager && typeof cacheManager.cleanup === 'function') {
      await cacheManager.cleanup();
    }
    if (mcpCache && 'cleanup' in mcpCache && typeof mcpCache.cleanup === 'function') {
      await mcpCache.cleanup();
    }
  });

  test('should maintain performance with concurrent invalidation operations', async () => {
    // GIVEN: Cache is populated with substantial data
    const ruleIds = Array.from({ length: 500 }, (_, i) => `typescript:naming:rule-${i}`);

    // WHEN: Multiple concurrent invalidation operations occur
    const concurrentInvalidations = Array.from({ length: 20 }, (_, i) =>
      cacheInvalidator.invalidateForRule(`typescript:naming:rule-${i}`)
    );

    const startTime = performance.now();

    const results = await Promise.allSettled(concurrentInvalidations);

    const endTime = performance.now();
    const totalTime = endTime - startTime;

    // THEN: Performance remains within acceptable limits
    expect(totalTime).toBeLessThan(200); // All operations within 200ms
    expect(results.length).toBe(20);

    // All operations should succeed
    const successfulResults = results.filter(r => r.status === 'fulfilled');
    expect(successfulResults.length).toBe(20);

    // Performance should be within target
    expect(totalTime / 20).toBeLessThan(100); // Average per operation

    // Check that invalidation service is still performant
    const performanceStatus = cacheInvalidator.getPerformanceStatus();
    expect(performanceStatus.isPerformant).toBe(true);
    expect(performanceStatus.averageTime).toBeLessThan(100);
  });

  test('should degrade gracefully under high load', async () => {
    // GIVEN: System is under high load with many invalidations
    const highLoadCount = 100;

    // WHEN: Processing high load of invalidation operations
    const startTime = performance.now();

    const invalidationPromises = Array.from({ length: highLoadCount }, (_, i) =>
      cacheInvalidator.invalidateForRule(`typescript:naming:rule-${i}`)
    );

    const results = await Promise.allSettled(invalidationPromises);

    const endTime = performance.now();
    const totalTime = endTime - startTime;

    // THEN: Service degrades gracefully without failures
    expect(totalTime).toBeLessThan(500); // Degraded but within limits

    // Check that all operations completed (either fulfilled or rejected)
    expect(results.length).toBe(highLoadCount);

    // Count successful vs failed operations
    const successfulResults = results.filter(r => r.status === 'fulfilled');
    const failedResults = results.filter(r => r.status === 'rejected');

    // Most operations should succeed even under load
    expect(successfulResults.length).toBeGreaterThan(highLoadCount * 0.9); // At least 90% success rate

    // Performance metrics should be available
    const metrics = cacheInvalidator.getMetrics();
    expect(metrics.totalInvalidations).toBeGreaterThan(0);
    expect(metrics.averageInvalidationTime).toBeGreaterThan(0);

    // Check performance status
    const performanceStatus = cacheInvalidator.getPerformanceStatus();
    expect(performanceStatus.averageTime).toBeGreaterThan(0);

    // Even under load, should complete within reasonable time
    expect(performanceStatus.averageTime).toBeLessThan(150); // Some operations may take longer under load
  });

  test('should monitor and report performance metrics during hot reload', async () => {
    // GIVEN: Performance monitoring is enabled
    const initialMetrics = cacheInvalidator.getMetrics();
    expect(initialMetrics.totalInvalidations).toBe(0);
    expect(initialMetrics.averageInvalidationTime).toBe(0);

    // WHEN: Performing various invalidation operations
    const operations = [
      // Single invalidation
      cacheInvalidator.invalidateForRule('typescript:naming:rule-1'),

      // Selective invalidation
      cacheInvalidator.invalidateSelective([
        'typescript:formatting:rule-1',
        'typescript:formatting:rule-2'
      ]),

      // Full invalidation
      cacheInvalidator.invalidateFull()
    ];

    const results = await Promise.allSettled(operations);

    // THEN: Performance metrics are accurately tracked and reported
    const finalMetrics = cacheInvalidator.getMetrics();

    expect(finalMetrics.totalInvalidations).toBeGreaterThan(0);
    expect(finalMetrics.averageInvalidationTime).toBeGreaterThan(0);

    // All operations should succeed
    const successfulResults = results.filter(r => r.status === 'fulfilled');
    expect(successfulResults.length).toBe(3);

    // Performance should be within SLA
    expect(finalMetrics.averageInvalidationTime).toBeLessThan(100);

    // Check performance status
    const performanceStatus = cacheInvalidator.getPerformanceStatus();
    expect(performanceStatus.averageTime).toBeGreaterThan(0);
    expect(performanceStatus.targetTime).toBe(100); // Our configured timeout

    // Service should still be performant after these operations
    expect(cacheInvalidator.isPerformant()).toBe(true);
  });

  test('should handle invalidation performance thresholds correctly', async () => {
    // GIVEN: Performance thresholds are configured with strict timeout
    const slowCacheInvalidator = new CacheInvalidationService(
      mcpCache,
      {
        enabled: true,
        enableWarming: false,
        warmingDelayMs: 0,
        maxWarmingConcurrency: 1,
        invalidationTimeoutMs: 50, // Very strict threshold
        selectiveInvalidation: true,
        priorityInvalidation: true
      }
    );

    try {
      // Reset metrics to start fresh
      slowCacheInvalidator.resetMetrics();

      // WHEN: Performing multiple invalidation operations to test threshold
      const invalidationPromises = Array.from({ length: 50 }, (_, i) =>
        slowCacheInvalidator.invalidateForRule(`typescript:complex:rule-${i}`)
      );

      await Promise.allSettled(invalidationPromises);

      // THEN: Performance metrics reflect the operations
      const metrics = slowCacheInvalidator.getMetrics();
      expect(metrics.totalInvalidations).toBeGreaterThan(0);
      expect(metrics.averageInvalidationTime).toBeGreaterThan(0);

      // Check performance status with strict threshold
      const performanceStatus = slowCacheInvalidator.getPerformanceStatus();
      expect(performanceStatus.targetTime).toBe(50); // Our strict threshold

      // Even with strict threshold, service should still function
      // But performance may be below threshold depending on system load
      if (performanceStatus.isPerformant) {
        // If performant, average time should be under threshold
        expect(performanceStatus.averageTime).toBeLessThan(50);
      } else {
        // If not performant, average time exceeds threshold
        expect(performanceStatus.averageTime).toBeGreaterThan(50);
        expect(performanceStatus.performanceRatio).toBeGreaterThan(1);
      }

      // Service should still be operational regardless of performance
      expect(metrics.errorCount).toBe(0); // No errors should have occurred

    } finally {
      // Clean up if cleanup method exists
      if ('cleanup' in slowCacheInvalidator && typeof slowCacheInvalidator.cleanup === 'function') {
        await slowCacheInvalidator.cleanup();
      }
    }
  });
});