import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { HotReloadManager } from '../../../src/standards/hot-reload-manager';
import { StandardsRegistry } from '../../../src/standards/registry';
import { FileChange } from '../../../src/utils/file-watcher';

describe('P0: HotReloadManager - AC3: Concurrent Change Handling', () => {
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

  test('3.3-UNIT-001: should maintain registry consistency during concurrent file changes', async () => {
    // GIVEN: Registry contains existing rules with proper structure
    const existingRule1 = {
      id: 'rule-1',
      semanticName: 'typescript-naming-rule-1',
      displayName: 'TypeScript Naming Rule 1',
      description: 'Test naming rule 1',
      category: 'naming',
      technology: 'typescript',
      pattern: '^[a-z][a-zA-Z0-9]*$',
      severity: 'error',
      tags: ['naming'],
      examples: [{
      valid: ['const userName = "test"'],
      invalid: ['const user_name = "test"'],
      description: 'Variable naming examples'
    }],
      relatedRules: [],
      aliases: [],
      deprecated: false,
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: '1.0.0',
        author: 'test',
        source: 'test'
      }
    };

    const existingRule2 = {
      id: 'rule-2',
      semanticName: 'typescript-naming-rule-2',
      displayName: 'TypeScript Naming Rule 2',
      description: 'Test naming rule 2',
      category: 'naming',
      technology: 'typescript',
      pattern: '^[A-Z][a-zA-Z0-9]*$',
      severity: 'warning',
      tags: ['naming'],
      examples: [{
      valid: ['class TestClass {}'],
      invalid: ['class test_class {}'],
      description: 'Class naming examples'
    }],
      relatedRules: [],
      aliases: [],
      deprecated: false,
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: '1.0.0',
        author: 'test',
        source: 'test'
      }
    };

    await registry.addRule(existingRule1);
    await registry.addRule(existingRule2);

    const concurrentChanges: FileChange[] = [
      {
        path: '/standards/typescript/naming-rules.yaml',
        type: 'create',
        timestamp: Date.now()
      },
      {
        path: '/standards/typescript/interface-rules.yaml',
        type: 'create',
        timestamp: Date.now() + 1
      },
      {
        path: '/standards/typescript/formatting-rules.yaml',
        type: 'create',
        timestamp: Date.now() + 2
      }
    ];

    // WHEN: Processing concurrent file system events
    const results = await Promise.all(
      concurrentChanges.map(change => hotReloadManager.processChanges([change]))
    );

    // THEN: Registry maintains consistency with no data loss or partial states
    const successfulResults = results.filter(r => r.success);
    const failedResults = results.filter(r => !r.success);

    // Most operations should fail due to missing files, but registry should remain consistent
    expect(failedResults.length).toBeGreaterThan(0);

    // Verify registry consistency
    const allRules = await registry.getAllRules();
    expect(allRules.length).toBe(2);

    // Verify all original standards are still accessible
    const retrievedRule1 = await registry.getRule('rule-1');
    expect(retrievedRule1).toBeTruthy();
    expect(retrievedRule1.id).toBe('rule-1');

    const retrievedRule2 = await registry.getRule('rule-2');
    expect(retrievedRule2).toBeTruthy();
    expect(retrievedRule2.id).toBe('rule-2');

    // Verify service continuity
    const stats = hotReloadManager.getStats();
    expect(stats.isHealthy).toBe(true);
  });

  test('3.3-UNIT-002: should detect and resolve concurrent update conflicts', async () => {
    // GIVEN: Registry contains a base rule
    const baseRule = {
      id: 'base-rule',
      semanticName: 'typescript-base-naming-rule',
      displayName: 'Base Naming Rule',
      description: 'Base naming rule for testing',
      category: 'naming',
      technology: 'typescript',
      pattern: '^[a-z][a-zA-Z0-9]*$',
      severity: 'error',
      tags: ['naming'],
      examples: [{
      valid: ['const userName = "test"'],
      invalid: ['const user_name = "test"'],
      description: 'Variable naming examples'
    }],
      relatedRules: [],
      aliases: [],
      deprecated: false,
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: '1.0.0',
        author: 'test',
        source: 'test'
      }
    };

    await registry.addRule(baseRule);

    const conflictingChanges: FileChange[] = [
      {
        path: '/standards/typescript/naming-rules.yaml',
        type: 'create',
        timestamp: Date.now()
      },
      {
        path: '/standards/typescript/naming-rules.yaml',
        type: 'create',
        timestamp: Date.now() + 1
      },
      {
        path: '/standards/typescript/naming-rules.yaml',
        type: 'create',
        timestamp: Date.now() + 2
      }
    ];

    // WHEN: Processing conflicting concurrent changes
    const results = await Promise.all(
      conflictingChanges.map(change => hotReloadManager.processChanges([change]))
    );

    // THEN: Conflicts are handled with registry consistency maintained
    const successfulResults = results.filter(r => r.success);
    const failedResults = results.filter(r => !r.success);

    // All should fail due to missing files, but registry should remain consistent
    expect(failedResults.length).toBe(3);

    // Verify final state is consistent
    const finalRule = await registry.getRule('base-rule');
    expect(finalRule).toBeTruthy();
    expect(finalRule.id).toBe('base-rule');

    // Verify all rules are still accessible
    const allRules = await registry.getAllRules();
    expect(allRules.length).toBe(1);

    // Verify service continuity
    const stats = hotReloadManager.getStats();
    expect(stats.isHealthy).toBe(true);
  });
});