import { test as base } from '@playwright/test';
import { FileWatcherService } from '../../../src/utils/file-watcher';
import { HotReloadManager } from '../../../src/standards/hot-reload-manager';
import { CacheInvalidationService } from '../../../src/utils/cache-invalidator';
import { StandardsRegistry } from '../../../src/standards/registry';
import { CacheManager } from '../../../src/utils/cache/cache-manager';
import { mkdir, rm } from 'fs/promises';
import { join } from 'path';

type HotReloadFixture = {
  testDir: string;
  registry: StandardsRegistry;
  cacheManager: CacheManager;
  fileWatcher: FileWatcherService;
  hotReloadManager: HotReloadManager;
  cacheInvalidator: CacheInvalidationService;
  cleanup: () => Promise<void>;
};

export const test = base.extend<HotReloadFixture>({
  // Create isolated test directory
  testDir: [async ({}, use) => {
    const testDir = join(process.cwd(), 'test-temp', `hot-reload-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    await use(testDir);

    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  }, { scope: 'test' }],

  // Initialize Standards Registry
  registry: [async ({ testDir }, use) => {
    const registry = new StandardsRegistry({
      dataPath: join(testDir, 'standards.db'),
      enablePersistence: true
    });

    await registry.initialize();

    await use(registry);

    await registry.cleanup();
  }, { scope: 'test' }],

  // Initialize Cache Manager
  cacheManager: [async ({ testDir }, use) => {
    const cacheManager = new CacheManager({
      defaultTtl: 3600000, // 1 hour
      maxSize: 1000,
      persistencePath: join(testDir, 'cache.db')
    });

    await cacheManager.initialize();

    await use(cacheManager);

    await cacheManager.cleanup();
  }, { scope: 'test' }],

  // Initialize File Watcher Service
  fileWatcher: [async ({ testDir }, use) => {
    const fileWatcher = new FileWatcherService({
      watchPath: testDir,
      filePatterns: ['*.json', '*.yaml', '*.md'],
      debounceMs: 50,
      maxDepth: 3,
      errorRetryAttempts: 3,
      errorRetryDelay: 100
    });

    await use(fileWatcher);

    await fileWatcher.stop();
  }, { scope: 'test' }],

  // Initialize Hot Reload Manager
  hotReloadManager: [async ({ registry }, use) => {
    const hotReloadManager = new HotReloadManager({
      registry,
      conflictResolution: 'latest-wins',
      atomicOperations: true,
      rollbackEnabled: true,
      validationEnabled: true,
      maxConcurrentOperations: 10
    });

    await use(hotReloadManager);

    await hotReloadManager.cleanup();
  }, { scope: 'test' }],

  // Initialize Cache Invalidation Service
  cacheInvalidator: [async ({ cacheManager }, use) => {
    const cacheInvalidator = new CacheInvalidationService({
      cacheManager,
      invalidationStrategy: 'selective',
      maxInvalidationTime: 100,
      batchSize: 50,
      performanceMonitoring: true
    });

    await use(cacheInvalidator);

    await cacheInvalidator.cleanup();
  }, { scope: 'test' }],

  // Combined cleanup function
  cleanup: [async ({ fileWatcher, hotReloadManager, cacheInvalidator, registry, cacheManager }, use) => {
    const cleanupFn = async () => {
      try {
        await fileWatcher.stop();
        await hotReloadManager.cleanup();
        await cacheInvalidator.cleanup();
        await registry.cleanup();
        await cacheManager.cleanup();
      } catch (error) {
        console.error('Cleanup error:', error);
      }
    };

    await use(cleanupFn);
  }, { scope: 'test' }]
});

// Specialized fixture for performance testing
export const performanceTest = base.extend<HotReloadFixture & {
  performanceMetrics: {
    startTime: number;
    measurements: Array<{
      operation: string;
      duration: number;
      timestamp: number;
    }>;
  };
}>({
  ...test,

  performanceMetrics: [async ({}, use) => {
    const metrics = {
      startTime: performance.now(),
      measurements: [] as Array<{
        operation: string;
        duration: number;
        timestamp: number;
      }>
    };

    const measureOperation = (operation: string, fn: () => Promise<any>) => {
      return async () => {
        const start = performance.now();
        const result = await fn();
        const duration = performance.now() - start;

        metrics.measurements.push({
          operation,
          duration,
          timestamp: Date.now()
        });

        return result;
      };
    };

    await use({
      ...metrics,
      measureOperation
    });
  }, { scope: 'test' }]
});

// Specialized fixture for error scenario testing
export const errorTest = base.extend<HotReloadFixture & {
  simulateError: (type: string, details?: any) => Promise<void>;
  getErrorHistory: () => Array<{
    type: string;
    message: string;
    timestamp: number;
    details?: any;
  }>;
}>({
  ...test,

  simulateError: [async ({ fileWatcher, hotReloadManager }, use) => {
    const errorHistory: Array<{
      type: string;
      message: string;
      timestamp: number;
      details?: any;
    }> = [];

    const simulateErrorFn = async (type: string, details?: any) => {
      const error = {
        type,
        message: `Simulated error: ${type}`,
        timestamp: Date.now(),
        details
      };

      errorHistory.push(error);

      // Trigger error handling in the actual services
      switch (type) {
        case 'permission_denied':
          await fileWatcher.simulateError('permission_denied', details?.path);
          break;
        case 'file_system_error':
          await fileWatcher.simulateError('file_system_error', details);
          break;
        case 'validation_error':
          await hotReloadManager.simulateError('validation_error', details);
          break;
        case 'conflict_detected':
          await hotReloadManager.simulateError('conflict_detected', details);
          break;
        case 'cache_error':
          // Cache invalidator errors can be simulated through the hot reload manager
          await hotReloadManager.simulateError('cache_error', details);
          break;
        default:
          console.warn(`Unknown error type: ${type}`);
      }
    };

    const getErrorHistoryFn = () => [...errorHistory];

    await use(simulateErrorFn);

    // Export getErrorHistory for use in tests
    Object.assign(simulateErrorFn, { getHistory: getErrorHistoryFn });
  }, { scope: 'test' }],

  getErrorHistory: [async ({ simulateError }, use) => {
    await use(() => (simulateError as any).getHistory?.() || []);
  }, { scope: 'test' }]
});

// Helper functions for test setup
export const setupTestStandards = async (registry: StandardsRegistry, count: number = 10) => {
  const standards = Array.from({ length: count }, (_, i) => ({
    id: `test-standard-${i}`,
    title: `Test Standard ${i}`,
    description: `Description for test standard ${i}`,
    technology: 'typescript',
    category: 'naming',
    lastUpdated: new Date().toISOString(),
    rules: [
      {
        id: `rule-${i}`,
        description: `Test rule ${i}`,
        severity: 'error' as const,
        category: 'naming' as const,
        example: `function example${i}() { return ${i}; }`
      }
    ]
  }));

  for (const standard of standards) {
    await registry.add(standard);
  }

  return standards;
};

export const setupTestCache = async (cacheManager: CacheManager, standards: any[]) => {
  for (const standard of standards) {
    const cacheKey = `standards:${standard.technology}:${standard.category}:${standard.id}`;
    await cacheManager.set(cacheKey, standard, 3600000);
  }
};

export const createTestFiles = async (testDir: string, files: Array<{
  name: string;
  content: string;
}>) => {
  const createdFiles = [];

  for (const file of files) {
    const filePath = join(testDir, file.name);
    await writeFile(filePath, file.content);
    createdFiles.push(filePath);
  }

  return createdFiles;
};

export const waitForEvent = <T>(
  emitter: any,
  event: string,
  timeout: number = 5000
): Promise<T> => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Event ${event} not received within ${timeout}ms`));
    }, timeout);

    emitter.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
};

export const assertPerformanceTarget = (
  actualTime: number,
  targetTime: number,
  tolerance: number = 0.1,
  operation: string
) => {
  const maxAllowed = targetTime * (1 + tolerance);
  expect(actualTime).toBeLessThan(
    maxAllowed,
    `${operation} took ${actualTime}ms, which exceeds target of ${targetTime}ms (with ${tolerance * 100}% tolerance)`
  );
};

export { expect };