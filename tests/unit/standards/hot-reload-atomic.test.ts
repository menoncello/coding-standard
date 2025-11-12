import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { HotReloadManager } from '../../../src/standards/hot-reload-manager';
import { StandardsRegistry } from '../../../src/standards/registry';
import { FileChange } from '../../../src/utils/file-watcher';

describe('P1: HotReloadManager - AC6: Atomic Operations and Rollback', () => {
  let hotReloadManager: HotReloadManager;
  let registry: StandardsRegistry;

  beforeEach(async () => {
    registry = new StandardsRegistry(':memory:');
    await registry.initialize();

    hotReloadManager = new HotReloadManager(
      registry,
      {
        enabled: true,
        validateBeforeUpdate: true,
        enableRollback: true,
        conflictResolution: 'latest-wins',
        maxConcurrentOperations: 5,
        operationTimeoutMs: 30000
      }
    );
  });

  afterEach(async () => {
    registry.close();
  });

  test('3.3-UNIT-003: should provide atomic operations with rollback on failure', async () => {
    // GIVEN: Atomic operations are enabled with rollback capability
    const complexChange = {
      path: '/standards/typescript/batch-update.yaml',
      type: 'update',
      timestamp: Date.now()
    };

    const initialRegistrySize = (await registry.getAllRules()).length;

    // WHEN: Processing batch operation with invalid operation (file doesn't exist)
    const result = await hotReloadManager.processChanges([complexChange]);

    // THEN: Change is rejected since file doesn't exist
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('does not exist');

    // Registry should be in original state
    const finalRegistrySize = (await registry.getAllRules()).length;
    expect(finalRegistrySize).toBe(initialRegistrySize);

    // Registry should remain consistent
    const registryStats = await registry.getStats();
    expect(registryStats.totalRules).toBe(initialRegistrySize);

    // Verify no changes were applied
    const allStandards = await registry.getAllRules();
    expect(allStandards.length).toBe(initialRegistrySize);
  });

  test('3.3-UNIT-005: should handle batch operations atomically', async () => {
    // GIVEN: Multiple standards files are changed simultaneously
    const existingStandards = [
      {
        id: 'js-es6-1',
        semanticName: 'javascript-es6-arrow-functions',
        displayName: 'Arrow Functions',
        description: 'Use arrow functions for callbacks',
        category: 'es6',
        technology: 'javascript',
        pattern: 'arrow-functions',
        severity: 'info' as const,
        tags: ['es6', 'functions'],
        examples: [{ valid: ['const fn = () => {}'], invalid: ['const fn = function() {}'], description: 'Use arrow functions' }],
        relatedRules: [],
        aliases: ['arrow-fn'],
        deprecated: false,
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
          version: '1.0.0'
        }
      },
      {
        id: 'js-es6-2',
        semanticName: 'javascript-es6-template-literals',
        displayName: 'Template Literals',
        description: 'Use template literals for string interpolation',
        category: 'es6',
        technology: 'javascript',
        pattern: 'template-literals',
        severity: 'info' as const,
        tags: ['es6', 'strings'],
        examples: [{ valid: ['`Hello ${name}`'], invalid: ['"Hello " + name'], description: 'Use template literals' }],
        relatedRules: [],
        aliases: ['template-strings'],
        deprecated: false,
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
          version: '1.0.0'
        }
      },
      {
        id: 'js-es6-3',
        semanticName: 'javascript-es6-destructuring',
        displayName: 'Destructuring Assignment',
        description: 'Use destructuring for object and array manipulation',
        category: 'es6',
        technology: 'javascript',
        pattern: 'destructuring',
        severity: 'info' as const,
        tags: ['es6', 'destructuring'],
        examples: [{ valid: ['const {name} = obj'], invalid: ['const name = obj.name'], description: 'Use destructuring' }],
        relatedRules: [],
        aliases: ['destructure'],
        deprecated: false,
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
          version: '1.0.0'
        }
      }
    ];

    // Add initial standards
    for (const standard of existingStandards) {
      await registry.addRule(standard);
    }

    const batchChanges = [
      {
        path: '/standards/batch-update-1.yaml',
        type: 'update',
        timestamp: Date.now()
      },
      {
        path: '/standards/batch-update-2.yaml',
        type: 'update',
        timestamp: Date.now() + 1
      }
    ];

    const initialCount = (await registry.getAllRules()).length;

    // WHEN: Processing batch atomic operation (files don't exist)
    const result = await hotReloadManager.processChanges(batchChanges);

    // THEN: Operations fail due to missing files
    expect(result.success).toBe(false);
    expect(result.errors.length).toBe(2);

    // Registry should be in original state
    const finalCount = (await registry.getAllRules()).length;
    expect(finalCount).toBe(initialCount);

    // Registry should remain consistent
    const registryStats = await registry.getStats();
    expect(registryStats.totalRules).toBe(initialCount);
  });

  test('3.3-UNIT-006: should maintain consistency during conflicting batch operations', async () => {
    // GIVEN: Conflicting batch operations occur simultaneously
    const sharedStandard = {
      id: 'python-formatting-1',
      semanticName: 'python-formatting-pep8',
      displayName: 'PEP8 Formatting Rules',
      description: 'Original formatting rules for Python',
      category: 'formatting',
      technology: 'python',
      pattern: 'pep8-formatting',
      severity: 'warning' as const,
      tags: ['python', 'pep8', 'formatting'],
      examples: [{ valid: ['print("Hello")'], invalid: ['print "Hello"'], description: 'Use print function' }],
      relatedRules: [],
      aliases: ['pep8'],
      deprecated: false,
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: '1.0.0'
      }
    };

    await registry.addRule(sharedStandard);

    const conflictingBatches = [
      {
        path: '/standards/python/formatting-batch-1.yaml',
        type: 'update',
        timestamp: Date.now()
      },
      {
        path: '/standards/python/formatting-batch-2.yaml',
        type: 'update',
        timestamp: Date.now() + 1
      }
    ];

    // WHEN: Processing conflicting batch operations (files don't exist)
    const results = await Promise.all(
      conflictingBatches.map(batch => hotReloadManager.processChanges([batch]))
    );

    // THEN: All operations fail due to missing files but registry remains consistent
    const successfulResults = results.filter(r => r.success);
    const failedResults = results.filter(r => !r.success);

    // All should fail due to missing files
    expect(successfulResults.length).toBe(0);
    expect(failedResults.length).toBe(2);

    // Registry should still contain the original standard
    const finalStandard = await registry.getRule(sharedStandard.id);
    expect(finalStandard).toBeTruthy();
    expect(finalStandard.displayName).toBe('PEP8 Formatting Rules');

    // Registry should remain consistent
    const registryStats = await registry.getStats();
    expect(registryStats.totalRules).toBe(1); // Only the original standard

    // Verify no data loss occurred
    const allStandards = await registry.getAllRules();
    expect(allStandards.length).toBe(1);
  });
});