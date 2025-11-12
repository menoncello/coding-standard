import { faker } from '@faker-js/faker';

// Types for hot reload testing
export interface FileChangeEvent {
  path: string;
  type: 'created' | 'modified' | 'deleted';
  timestamp: number;
  size?: number;
  content?: string;
  checksum?: string;
  source?: string;
}

export interface CacheInvalidationEvent {
  keys: string[];
  timestamp: number;
  scope: {
    technology?: string;
    category?: string;
    pattern?: string;
  };
  strategy: 'selective' | 'full' | 'scope-based';
}

export interface HotReloadOperation {
  id: string;
  type: 'add' | 'update' | 'delete' | 'conflict_resolution';
  timestamp: number;
  data: any;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'rolled_back';
  error?: string;
}

export interface ConflictResolution {
  conflictType: 'concurrent_update' | 'schema_mismatch' | 'dependency_conflict';
  detectedAt: number;
  conflictingOperations: HotReloadOperation[];
  resolutionStrategy: 'latest_wins' | 'manual_intervention' | 'merge' | 'reject';
  resolution?: any;
}

// File change event factory
export const createFileChangeEvent = (overrides: Partial<FileChangeEvent> = {}): FileChangeEvent => ({
  path: `/standards/${faker.helpers.arrayElement(['typescript', 'javascript', 'python'])}/${faker.string.alphanumeric(8)}-${faker.string.alphanumeric(6)}.${faker.helpers.arrayElement(['yaml', 'json', 'md'])}`,
  type: faker.helpers.arrayElement(['created', 'modified', 'deleted']),
  timestamp: faker.date.recent().getTime(),
  size: faker.number.int({ min: 100, max: 50000 }),
  content: faker.helpers.maybe(() => faker.lorem.paragraphs(3), { probability: 0.7 }),
  checksum: faker.helpers.maybe(() => faker.string.alphanumeric(32), { probability: 0.8 }),
  source: faker.helpers.arrayElement(['editor', 'git', 'file_system', 'external_tool']),
  ...overrides,
});

// Create multiple file change events for testing
export const createFileChangeEvents = (
  count: number,
  overrides: Partial<FileChangeEvent> = {}
): FileChangeEvent[] =>
  Array.from({ length: count }, () => createFileChangeEvent(overrides));

// Cache invalidation event factory
export const createCacheInvalidationEvent = (overrides: Partial<CacheInvalidationEvent> = {}): CacheInvalidationEvent => ({
  keys: Array.from({ length: faker.number.int({ min: 1, max: 20 }) }, () =>
    `standards:${faker.helpers.arrayElement(['typescript', 'javascript', 'python'])}:${faker.helpers.arrayElement(['naming', 'formatting', 'structure'])}:${faker.string.alphanumeric(6)}`
  ),
  timestamp: faker.date.recent().getTime(),
  scope: {
    technology: faker.helpers.arrayElement(['typescript', 'javascript', 'python', 'go', 'java']),
    category: faker.helpers.arrayElement(['naming', 'formatting', 'structure', 'performance', 'security']),
    pattern: faker.helpers.maybe(() => `${faker.helpers.arrayElement(['**/*', '*', 'src/**'])}.${faker.helpers.arrayElement(['ts', 'js', 'py'])}`, { probability: 0.6 })
  },
  strategy: faker.helpers.arrayElement(['selective', 'full', 'scope-based']),
  ...overrides,
});

// Hot reload operation factory
export const createHotReloadOperation = (overrides: Partial<HotReloadOperation> = {}): HotReloadOperation => ({
  id: faker.string.uuid(),
  type: faker.helpers.arrayElement(['add', 'update', 'delete', 'conflict_resolution']),
  timestamp: faker.date.recent().getTime(),
  data: {
    standardId: faker.helpers.maybe(() => faker.string.uuid(), { probability: 0.7 }),
    changes: faker.helpers.maybe(() => ({
      title: faker.lorem.sentence(),
      description: faker.lorem.paragraph(),
      technology: faker.helpers.arrayElement(['typescript', 'javascript', 'python']),
      category: faker.helpers.arrayElement(['naming', 'formatting', 'structure'])
    }), { probability: 0.8 }),
    affectedFiles: faker.helpers.maybe(() => createFileChangeEvents(faker.number.int({ min: 1, max: 5 })), { probability: 0.6 })
  },
  status: faker.helpers.arrayElement(['pending', 'processing', 'completed', 'failed', 'rolled_back']),
  error: faker.helpers.maybe(() => faker.lorem.sentence(), { probability: 0.2 }),
  ...overrides,
});

// Conflict resolution factory
export const createConflictResolution = (overrides: Partial<ConflictResolution> = {}): ConflictResolution => ({
  conflictType: faker.helpers.arrayElement(['concurrent_update', 'schema_mismatch', 'dependency_conflict']),
  detectedAt: faker.date.recent().getTime(),
  conflictingOperations: Array.from({ length: faker.number.int({ min: 2, max: 5 }) }, () =>
    createHotReloadOperation({ status: 'failed' })
  ),
  resolutionStrategy: faker.helpers.arrayElement(['latest_wins', 'manual_intervention', 'merge', 'reject']),
  resolution: faker.helpers.maybe(() => ({
    appliedAt: faker.date.recent().getTime(),
    appliedStrategy: faker.helpers.arrayElement(['latest_wins', 'merged']),
    finalState: 'consistent'
  }), { probability: 0.7 }),
  ...overrides,
});

// Specialized factories for specific test scenarios

// Factory for concurrent file changes (AC1)
export const createConcurrentFileChanges = (): FileChangeEvent[] => [
  createFileChangeEvent({
    path: '/standards/typescript/naming-rules.yaml',
    type: 'modified',
    timestamp: Date.now(),
    source: 'editor'
  }),
  createFileChangeEvent({
    path: '/standards/javascript/es6-rules.json',
    type: 'modified',
    timestamp: Date.now() + 1,
    source: 'git'
  }),
  createFileChangeEvent({
    path: '/standards/python/pep8-standards.yaml',
    type: 'modified',
    timestamp: Date.now() + 2,
    source: 'external_tool'
  }),
];

// Factory for performance testing (AC2)
export const createPerformanceTestEvents = (count: number = 100): {
  fileChanges: FileChangeEvent[];
  cacheInvalidations: CacheInvalidationEvent[];
} => ({
  fileChanges: Array.from({ length: count }, (_, i) =>
    createFileChangeEvent({
      path: `/standards/typescript/perf-test-${i}.yaml`,
      timestamp: Date.now() + i,
      size: faker.number.int({ min: 1000, max: 10000 })
    })
  ),
  cacheInvalidations: Array.from({ length: Math.floor(count / 10) }, (_, i) =>
    createCacheInvalidationEvent({
      timestamp: Date.now() + i * 10,
      keys: Array.from({ length: 10 }, (_, j) => `perf-test-key-${i}-${j}`)
    })
  ),
});

// Factory for error scenarios (AC4)
export const createErrorScenarios = () => ({
  malformedFileChange: createFileChangeEvent({
    path: '/standards/typescript/malformed.yaml',
    content: 'invalid: yaml: content: [unclosed',
    checksum: 'invalid-checksum'
  }),
  schemaValidationFailure: createFileChangeEvent({
    path: '/standards/typescript/invalid-schema.yaml',
    content: JSON.stringify({
      rules: [
        {
          description: '', // Invalid: empty description
          severity: 'invalid-severity', // Invalid: not in enum
          category: null // Invalid: null category
        }
      ]
    })
  }),
  conflictScenario: createConflictResolution({
    conflictType: 'concurrent_update',
    conflictingOperations: [
      createHotReloadOperation({
        type: 'update',
        data: { standardId: 'shared-standard', title: 'Process A Update' }
      }),
      createHotReloadOperation({
        type: 'update',
        data: { standardId: 'shared-standard', title: 'Process B Update' }
      })
    ]
  }),
});

// Factory for batch operations (AC6)
export const createBatchOperation = (fileCount: number = 5): {
  batchId: string;
  timestamp: number;
  files: FileChangeEvent[];
  atomic: boolean;
} => ({
  batchId: faker.string.uuid(),
  timestamp: Date.now(),
  files: Array.from({ length: fileCount }, (_, i) =>
    createFileChangeEvent({
      path: `/standards/batch-test-${i}.yaml`,
      timestamp: Date.now() + i
    })
  ),
  atomic: true
});

// Factory for performance monitoring data
export const createPerformanceMetrics = () => ({
  fileChangeDetection: {
    averageTime: faker.number.float({ min: 10, max: 95, precision: 0.1 }),
    maxTime: faker.number.float({ min: 80, max: 99, precision: 0.1 }),
    processedCount: faker.number.int({ min: 100, max: 1000 }),
    errorRate: faker.number.float({ min: 0, max: 0.05, precision: 0.001 })
  },
  cacheInvalidation: {
    averageTime: faker.number.float({ min: 5, max: 45, precision: 0.1 }),
    maxTime: faker.number.float({ min: 40, max: 95, precision: 0.1 }),
    invalidatedCount: faker.number.int({ min: 50, max: 500 }),
    selectiveHitRate: faker.number.float({ min: 0.8, max: 0.99, precision: 0.01 })
  },
  registryOperations: {
    averageTime: faker.number.float({ min: 15, max: 80, precision: 0.1 }),
    successRate: faker.number.float({ min: 0.95, max: 1.0, precision: 0.001 }),
    rollbackRate: faker.number.float({ min: 0, max: 0.02, precision: 0.001 })
  },
  memoryUsage: {
    currentMB: faker.number.int({ min: 50, max: 500 }),
    peakMB: faker.number.int({ min: 100, max: 800 }),
    leakDetected: faker.datatype.boolean({ probability: 0.05 })
  }
});

// Factory for health status monitoring
export const createHealthStatus = (status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy') => ({
  overall: status,
  components: {
    fileWatcher: {
      status: status,
      lastActivity: faker.date.recent().toISOString(),
      processedEvents: faker.number.int({ min: 0, max: 1000 }),
      errorCount: status === 'healthy' ? 0 : faker.number.int({ min: 1, max: 10 })
    },
    hotReloadManager: {
      status: status,
      activeOperations: faker.number.int({ min: 0, max: 5 }),
      queueLength: status === 'healthy' ? 0 : faker.number.int({ min: 1, max: 20 }),
      averageProcessingTime: faker.number.float({ min: 10, max: status === 'healthy' ? 50 : 200, precision: 0.1 })
    },
    cacheInvalidator: {
      status: status,
      cacheSize: faker.number.int({ min: 100, max: 10000 }),
      invalidationLatency: faker.number.float({ min: 1, max: status === 'healthy' ? 95 : 500, precision: 0.1 }),
      hitRate: faker.number.float({ min: status === 'healthy' ? 0.8 : 0.5, max: 0.99, precision: 0.01 })
    }
  },
  performanceMetrics: createPerformanceMetrics(),
  alerts: status === 'healthy' ? [] : [
    {
      type: 'performance_degradation',
      message: 'Processing times exceeding thresholds',
      severity: status === 'degraded' ? 'warning' : 'critical',
      timestamp: faker.date.recent().toISOString()
    }
  ]
});

export default {
  createFileChangeEvent,
  createFileChangeEvents,
  createCacheInvalidationEvent,
  createHotReloadOperation,
  createConflictResolution,
  createConcurrentFileChanges,
  createPerformanceTestEvents,
  createErrorScenarios,
  createBatchOperation,
  createPerformanceMetrics,
  createHealthStatus
};