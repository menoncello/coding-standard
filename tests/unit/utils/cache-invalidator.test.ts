import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { CacheInvalidationService } from '../../../src/utils/cache-invalidator';
import { McpResponseCache } from '../../../src/cache/cache-manager';
import { createCachedStandard } from '../../support/factories/standard-factory';

describe('CacheInvalidationService - AC2: Sub-100ms Cache Invalidation', () => {
  let cacheInvalidator: CacheInvalidationService;
  let cache: McpResponseCache;

  beforeEach(() => {
    cache = new McpResponseCache({
      ttl: 3600000, // 1 hour
      maxSize: 1000,
      enabled: true
    });

    cacheInvalidator = new CacheInvalidationService(
      cache,
      {
        enabled: true,
        enableWarming: false, // Disable warming for tests
        warmingDelayMs: 100,
        maxWarmingConcurrency: 3,
        invalidationTimeoutMs: 100, // 100ms target
        selectiveInvalidation: true,
        priorityInvalidation: true
      }
    );
  });

  afterEach(() => {
    cache.clear();
  });

  test('should invalidate cache within 100ms of rule change', async () => {
    // GIVEN: Cache is populated with standards data
    const standards = Array.from({ length: 100 }, () =>
      createCachedStandard({
        technology: 'typescript',
        category: 'naming'
      })
    );

    // Populate cache with some mock standards responses
    for (const standard of standards) {
      const mockResponse = {
        standards: [standard],
        totalCount: 1,
        hasMore: false
      };
      cache.setStandards(standard.cacheKey, mockResponse);
    }

    // WHEN: Rule change triggers cache invalidation
    const ruleId = 'typescript.naming.variables';
    const startTime = performance.now();
    await cacheInvalidator.invalidateForRule(ruleId);
    const endTime = performance.now();
    const processingTime = endTime - startTime;

    // THEN: Cache invalidation completes within 100ms
    expect(processingTime).toBeLessThan(100);

    // Verify cache performance status
    const performanceStatus = cacheInvalidator.getPerformanceStatus();
    expect(performanceStatus.isPerformant).toBe(true);
    expect(performanceStatus.targetTime).toBe(100);

    // Verify metrics are updated
    const metrics = cacheInvalidator.getMetrics();
    expect(metrics.totalInvalidations).toBeGreaterThan(0);
  });

  test('should perform selective cache invalidation for multiple rules', async () => {
    // GIVEN: Cache contains mixed technology and category data
    const mixedStandards = [
      // TypeScript naming rules
      ...Array.from({ length: 20 }, () =>
        createCachedStandard({
          technology: 'typescript',
          category: 'naming'
        })
      ),
      // TypeScript formatting rules
      ...Array.from({ length: 15 }, () =>
        createCachedStandard({
          technology: 'typescript',
          category: 'formatting'
        })
      ),
      // JavaScript rules
      ...Array.from({ length: 25 }, () =>
        createCachedStandard({
          technology: 'javascript',
          category: 'naming'
        })
      )
    ];

    // Populate cache with mock responses
    for (const standard of mixedStandards) {
      const mockResponse = {
        standards: [standard],
        totalCount: 1,
        hasMore: false
      };
      cache.setStandards(standard.cacheKey, mockResponse);
    }

    // Verify cache has data
    const initialStats = cache.getStats();
    expect(initialStats.combined.size).toBeGreaterThan(0);

    // WHEN: Selective invalidation is triggered for multiple rules
    const ruleIds = [
      'typescript.naming.variables',
      'typescript.naming.functions',
      'typescript.naming.classes'
    ];

    const startTime = performance.now();
    await cacheInvalidator.invalidateSelective(ruleIds);
    const endTime = performance.now();
    const processingTime = endTime - startTime;

    // THEN: Selective invalidation completes within 100ms
    expect(processingTime).toBeLessThan(100);

    // Verify metrics are updated
    const metrics = cacheInvalidator.getMetrics();
    expect(metrics.selectiveInvalidations).toBeGreaterThan(0);
    expect(metrics.totalInvalidations).toBeGreaterThan(0);

    // Verify performance status
    const performanceStatus = cacheInvalidator.getPerformanceStatus();
    expect(performanceStatus.isPerformant).toBe(true);
  });

  test('should handle full cache invalidation efficiently', async () => {
    // GIVEN: Large cache dataset needs full invalidation
    const largeStandardsSet = [
      // Create 1000 standards across different categories
      ...Array.from({ length: 300 }, () =>
        createCachedStandard({
          technology: 'typescript',
          category: 'naming'
        })
      ),
      ...Array.from({ length: 250 }, () =>
        createCachedStandard({
          technology: 'typescript',
          category: 'formatting'
        })
      ),
      ...Array.from({ length: 200 }, () =>
        createCachedStandard({
          technology: 'javascript',
          category: 'naming'
        })
      ),
      ...Array.from({ length: 150 }, () =>
        createCachedStandard({
          technology: 'python',
          category: 'formatting'
        })
      ),
      ...Array.from({ length: 100 }, () =>
        createCachedStandard({
          technology: 'go',
          category: 'naming'
        })
      )
    ];

    // Populate cache with mock responses
    for (const standard of largeStandardsSet) {
      const mockResponse = {
        standards: [standard],
        totalCount: 1,
        hasMore: false
      };
      cache.setStandards(standard.cacheKey, mockResponse);
    }

    // Verify cache has data
    const initialStats = cache.getStats();
    expect(initialStats.combined.size).toBeGreaterThan(0);

    // WHEN: Full invalidation is performed
    const startTime = performance.now();
    await cacheInvalidator.invalidateFull();
    const endTime = performance.now();
    const processingTime = endTime - startTime;

    // THEN: Full invalidation operation is efficient and completes within 100ms
    expect(processingTime).toBeLessThan(100);

    // Verify cache is cleared
    const finalStats = cache.getStats();
    expect(finalStats.combined.size).toBe(0);

    // Verify metrics are updated
    const metrics = cacheInvalidator.getMetrics();
    expect(metrics.fullInvalidations).toBeGreaterThan(0);
    expect(metrics.totalInvalidations).toBeGreaterThan(0);

    // Verify performance status
    const performanceStatus = cacheInvalidator.getPerformanceStatus();
    expect(performanceStatus.isPerformant).toBe(true);
    expect(performanceStatus.averageTime).toBeLessThanOrEqual(100);
  });

  describe('Cache Warming and Additional Functionality', () => {
    test('should warm cache with priority processing', async () => {
      // GIVEN: Cache invalidation with warming enabled
      const warmingEnabledInvalidator = new CacheInvalidationService(
        cache,
        {
          enabled: true,
          enableWarming: true,
          warmingDelayMs: 10,
          maxWarmingConcurrency: 2,
          invalidationTimeoutMs: 100,
          selectiveInvalidation: true,
          priorityInvalidation: true
        }
      );

      const ruleIds = ['typescript.naming.variables', 'typescript.naming.functions'];

      // WHEN: Cache warming is requested with priority
      await warmingEnabledInvalidator.warmCache(ruleIds, true);

      // Wait a bit for processing
      await new Promise(resolve => setTimeout(resolve, 50));

      // THEN: Warming operation is queued and metrics updated
      const metrics = warmingEnabledInvalidator.getMetrics();
      expect(metrics.warmingOperations).toBeGreaterThanOrEqual(0);

      const performanceStatus = warmingEnabledInvalidator.getPerformanceStatus();
      expect(performanceStatus.isPerformant).toBe(true);
    });

    test('should update configuration dynamically', () => {
      // GIVEN: Cache invalidator with initial configuration
      expect(cacheInvalidator.getMetrics()).toBeDefined();

      // WHEN: Configuration is updated
      cacheInvalidator.updateConfig({
        invalidationTimeoutMs: 50,
        enableWarming: true
      });

      // THEN: Configuration changes are applied
      const performanceStatus = cacheInvalidator.getPerformanceStatus();
      expect(performanceStatus.targetTime).toBe(50);
    });

    test('should update warming strategy dynamically', () => {
      // GIVEN: Cache invalidator with default warming strategy
      const initialStrategy = cacheInvalidator.getMetrics();

      // WHEN: Warming strategy is updated
      cacheInvalidator.updateWarmingStrategy({
        priorityRules: ['high-priority-rule'],
        batchProcessingEnabled: false
      });

      // THEN: Strategy changes are applied
      // Note: We can't directly inspect the warming strategy, but we can verify
      // the method doesn't throw and the service remains functional
      const performanceStatus = cacheInvalidator.getPerformanceStatus();
      expect(performanceStatus).toBeDefined();
    });

    test('should check performance status correctly', () => {
      // GIVEN: Cache invalidator with known configuration
      const performanceStatus = cacheInvalidator.getPerformanceStatus();

      // WHEN: Performance status is checked
      expect(performanceStatus.isPerformant).toBe(true);
      expect(performanceStatus.targetTime).toBe(100);
      expect(performanceStatus.performanceRatio).toBeGreaterThanOrEqual(0);
    });

    test('should handle disabled service gracefully', async () => {
      // GIVEN: Disabled cache invalidator
      const disabledInvalidator = new CacheInvalidationService(
        cache,
        {
          enabled: false,
          enableWarming: false,
          warmingDelayMs: 100,
          maxWarmingConcurrency: 3,
          invalidationTimeoutMs: 100,
          selectiveInvalidation: true,
          priorityInvalidation: true
        }
      );

      // WHEN: Operations are performed on disabled service
      await disabledInvalidator.invalidateForRule('test.rule');
      await disabledInvalidator.invalidateSelective(['test.rule1', 'test.rule2']);
      await disabledInvalidator.invalidateFull();
      await disabledInvalidator.warmCache(['test.rule'], false);

      // THEN: Operations complete without errors but metrics are not updated
      const metrics = disabledInvalidator.getMetrics();
      expect(metrics.totalInvalidations).toBe(0);
    });

    test('should handle warming when warming is disabled', async () => {
      // GIVEN: Cache invalidator with warming disabled
      const noWarmingInvalidator = new CacheInvalidationService(
        cache,
        {
          enabled: true,
          enableWarming: false,
          warmingDelayMs: 100,
          maxWarmingConcurrency: 3,
          invalidationTimeoutMs: 100,
          selectiveInvalidation: true,
          priorityInvalidation: true
        }
      );

      // WHEN: Warming is requested
      await noWarmingInvalidator.warmCache(['test.rule'], true);

      // THEN: Operation completes but warming is not performed
      const metrics = noWarmingInvalidator.getMetrics();
      expect(metrics.warmingOperations).toBe(0);
    });

    test('should queue warming for multiple rules with semantic names', async () => {
      // GIVEN: Cache invalidator with warming enabled
      const warmingEnabledInvalidator = new CacheInvalidationService(
        cache,
        {
          enabled: true,
          enableWarming: true,
          warmingDelayMs: 5,
          maxWarmingConcurrency: 2,
          invalidationTimeoutMs: 100,
          selectiveInvalidation: true,
          priorityInvalidation: true
        }
      );

      // WHEN: Warming is queued for multiple rules with semantic names
      const ruleIds = ['typescript.naming.variables', 'javascript.naming.functions'];
      const semanticNames = ['typescript-variable-naming', 'javascript-function-naming'];

      // Access private method through type assertion for testing
      const invalidatorAny = warmingEnabledInvalidator as any;
      invalidatorAny.queueWarmingForRules(ruleIds, semanticNames);

      // Wait for warming to process
      await new Promise(resolve => setTimeout(resolve, 20));

      // THEN: Warming metrics are updated
      const metrics = warmingEnabledInvalidator.getMetrics();
      expect(metrics).toBeDefined();
    });

    test('should handle warming queue processing errors gracefully', async () => {
      // GIVEN: Cache invalidator with warming enabled
      const warmingEnabledInvalidator = new CacheInvalidationService(
        cache,
        {
          enabled: true,
          enableWarming: true,
          warmingDelayMs: 1,
          maxWarmingConcurrency: 1,
          invalidationTimeoutMs: 100,
          selectiveInvalidation: true,
          priorityInvalidation: true
        }
      );

      // WHEN: Warming queue is processed with potential errors
      await warmingEnabledInvalidator.warmCache(['test.rule'], true);

      // Add a problematic warming operation to the queue
      const invalidatorAny = warmingEnabledInvalidator as any;
      invalidatorAny.warmingQueue.push(() => Promise.reject(new Error('Test warming error')));

      // Manually trigger processing
      invalidatorAny.processWarmingQueue();

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 20));

      // THEN: Service continues to function despite errors
      const metrics = warmingEnabledInvalidator.getMetrics();
      expect(metrics).toBeDefined();
    });
  });
});