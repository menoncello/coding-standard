import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { HotReloadManager } from '../../../src/standards/hot-reload-manager';
import { StandardsRegistry } from '../../../src/standards/registry';
import { FileChange } from '../../../src/utils/file-watcher';
import { createStandard, createStandards } from '../../support/factories/standard-factory';

describe('P1: HotReloadManager - AC4: Error Handling and Validation', () => {
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
        conflictResolution: 'fail',
        maxConcurrentOperations: 5,
        operationTimeoutMs: 30000
      }
    );
  });

  afterEach(async () => {
    registry.close();
  });

  test('3.3-UNIT-004: should validate rule patterns before registry updates', async () => {
    // GIVEN: Invalid or malformed rule patterns are introduced
    const invalidChange: FileChange = {
      path: '/standards/typescript/invalid-rules.yaml',
      type: 'update',
      timestamp: Date.now()
    };

    // WHEN: Processing invalid change request (file doesn't exist)
    const result = await hotReloadManager.processChanges([invalidChange]);

    // THEN: Change is rejected with clear error messages
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('does not exist');

    // Registry should remain unchanged
    const allRules = await registry.getAllRules();
    expect(allRules.length).toBe(0);
  });

  test('3.3-UNIT-007: should handle malformed YAML/JSON content gracefully', async () => {
    // GIVEN: Malformed file content is detected
    const malformedChanges: FileChange[] = [
      {
        path: '/standards/typescript/malformed.yaml',
        type: 'update',
        timestamp: Date.now()
      },
      {
        path: '/standards/javascript/invalid.json',
        type: 'update',
        timestamp: Date.now() + 1
      }
    ];

    // WHEN: Processing malformed file content (files don't exist)
    const result = await hotReloadManager.processChanges(malformedChanges);

    // THEN: Malformed content is rejected without corrupting registry
    expect(result.success).toBe(false);
    expect(result.errors.length).toBe(2);

    // All failed results should have file not found errors
    result.errors.forEach(error => {
      expect(error).toContain('does not exist');
    });

    // Registry should remain consistent
    const allRules = await registry.getAllRules();
    expect(allRules.length).toBe(0);

    // Service should continue operating
    const stats = hotReloadManager.getStats();
    expect(stats.isHealthy).toBe(true);
  });

  test('3.3-UNIT-008: should provide detailed error context for debugging', async () => {
    // GIVEN: Complex change with multiple potential failure points
    const complexChanges: FileChange[] = [
      {
        path: '/standards/typescript/complex-change.yaml',
        type: 'update',
        timestamp: Date.now()
      },
      {
        path: '/standards/typescript/another-change.json',
        type: 'update',
        timestamp: Date.now() + 1
      }
    ];

    const initialRules = await registry.getAllRules();

    // WHEN: Processing complex change with failures (files don't exist)
    const result = await hotReloadManager.processChanges(complexChanges);

    // THEN: Detailed error context is provided
    expect(result.success).toBe(false);
    expect(result.errors).toBeTruthy();
    expect(result.errors.length).toBeGreaterThan(0);

    // Check error details - should contain file path and error message
    result.errors.forEach(error => {
      expect(error).toBeTruthy();
      expect(typeof error).toBe('string');
    });

    // Registry should be in consistent state
    const finalRules = await registry.getAllRules();
    expect(finalRules.length).toBe(initialRules.length);
  });

  test('3.3-UNIT-009: should maintain registry consistency during validation failures', async () => {
    // GIVEN: Multiple file changes where some fail validation (files don't exist)
    const mixedValidationChanges: FileChange[] = [
      {
        path: '/standards/typescript/valid-standard.yaml',
        type: 'update',
        timestamp: Date.now()
      },
      {
        path: '/standards/javascript/invalid-standard.json',
        type: 'update',
        timestamp: Date.now() + 1
      },
      {
        path: '/standards/general/another-valid-standard.yaml',
        type: 'update',
        timestamp: Date.now() + 2
      },
      {
        path: '/standards/unknown/missing-file.yml',
        type: 'update',
        timestamp: Date.now() + 3
      }
    ];

    const initialRules = await registry.getAllRules();

    // WHEN: Processing mixed validation operations
    const result = await hotReloadManager.processChanges(mixedValidationChanges);

    // THEN: All operations fail due to missing files, but registry remains consistent
    expect(result.success).toBe(false); // Overall failure due to missing files
    expect(result.errors.length).toBe(4); // All 4 files should fail

    // Registry should have the same number of rules (no additions)
    const finalRules = await registry.getAllRules();
    expect(finalRules.length).toBe(initialRules.length);

    // Verify registry is still functional
    const stats = await registry.getStats();
    expect(stats.totalRules).toBe(initialRules.length);

    // Service should continue operating
    const hotReloadStats = hotReloadManager.getStats();
    expect(hotReloadStats.isHealthy).toBe(true);
  });
});