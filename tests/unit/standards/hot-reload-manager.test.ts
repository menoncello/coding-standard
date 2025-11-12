import { test, expect, describe, beforeEach, afterEach, mock } from 'bun:test';
import { HotReloadManager } from '../../../src/standards/hot-reload-manager.js';
import { StandardsRegistry } from '../../../src/standards/registry.js';
import { FileChange } from '../../../src/utils/file-watcher.js';
import { Logger, LoggerFactory } from '../../../src/utils/logger/logger-factory.js';

// Mock file content for tests
interface MockFile {
    exists: () => Promise<boolean>;
    text: () => Promise<string>;
}

// Mock file system interface
interface MockFileSystem {
    [path: string]: MockFile;
}

describe('HotReloadManager', () => {
    let hotReloadManager: HotReloadManager;
    let mockRegistry: StandardsRegistry;
    let mockLogger: Logger;
    let originalLoggerFactoryGetInstance: typeof LoggerFactory.getInstance;
    let mockFileSystem: MockFileSystem;
    let originalReadFile: typeof Bun.file;

    beforeEach(() => {
        // Mock logger
        mockLogger = {
            info: mock(() => {}),
            warn: mock(() => {}),
            error: mock(() => {}),
            debug: mock(() => {})
        } as any;

        // Mock LoggerFactory.getInstance
        originalLoggerFactoryGetInstance = LoggerFactory.getInstance;
        LoggerFactory.getInstance = mock(() => mockLogger);

        // Mock registry
        mockRegistry = {
            addRule: mock(() => Promise.resolve(undefined)),
            updateRule: mock(() => Promise.resolve(undefined)),
            removeRule: mock(() => Promise.resolve(undefined)),
            getRule: mock(() => Promise.resolve(null)),
            getAllRules: mock(() => Promise.resolve([]))
        } as any;

        // Initialize mock file system
        mockFileSystem = {};

        // Store original Bun.file and mock it
        originalReadFile = Bun.file;

        // Mock Bun.file to use our mock file system
        Bun.file = mock((path: string): MockFile => {
            if (mockFileSystem[path]) {
                return mockFileSystem[path];
            }
            // Default mock file (doesn't exist)
            return {
                exists: () => Promise.resolve(false),
                text: () => Promise.resolve('')
            };
        });

        hotReloadManager = new HotReloadManager(mockRegistry, {
            enabled: true,
            validateBeforeUpdate: true,
            enableRollback: true,
            maxConcurrentOperations: 3,
            operationTimeoutMs: 5000,
            conflictResolution: 'fail'
        });
    });

    afterEach(() => {
        // Restore original LoggerFactory.getInstance
        LoggerFactory.getInstance = originalLoggerFactoryGetInstance;
        // Restore original Bun.file
        Bun.file = originalReadFile;
        // Clear mock file system
        mockFileSystem = {};
    });

    // Helper function to mock file content
    function mockFileContent(path: string, content: string, exists: boolean = true) {
        mockFileSystem[path] = {
            exists: () => Promise.resolve(exists),
            text: () => Promise.resolve(content)
        };
    }

    describe('Configuration', () => {
        test('should use default configuration', () => {
            const manager = new HotReloadManager(mockRegistry);
            const stats = manager.getStats();

            expect(stats.config.enabled).toBe(true);
            expect(stats.config.validateBeforeUpdate).toBe(true);
            expect(stats.config.enableRollback).toBe(true);
            expect(stats.config.maxConcurrentOperations).toBe(5);
            expect(stats.config.operationTimeoutMs).toBe(30000);
        });

        test('should merge custom configuration', () => {
            const manager = new HotReloadManager(mockRegistry, {
                maxConcurrentOperations: 10,
                conflictResolution: 'overwrite' as const
            });

            const stats = manager.getStats();
            expect(stats.config.maxConcurrentOperations).toBe(10);
            expect(stats.config.conflictResolution).toBe('overwrite');
            expect(stats.config.validateBeforeUpdate).toBe(true); // Default
        });

        test('should update configuration', () => {
            hotReloadManager.updateConfig({
                maxConcurrentOperations: 15,
                enabled: false
            });

            const stats = hotReloadManager.getStats();
            expect(stats.config.maxConcurrentOperations).toBe(15);
            expect(stats.config.enabled).toBe(false);
        });
    });

    describe('Process Changes', () => {
        test('should process single file change successfully', async () => {
            // Mock file reading
            const mockContent = {
                semanticName: 'typescript-test-rule',
                displayName: 'Test Rule',
                description: 'A test rule',
                category: 'test',
                technology: 'typescript',
                pattern: 'test-pattern',
                severity: 'error',
                tags: ['test'],
                examples: [],
                relatedRules: [],
                aliases: []
            };

            // Mock file content
            mockFileContent('/test/rules/test-rule.json', JSON.stringify(mockContent), true);

            const changes: FileChange[] = [{
                path: '/test/rules/test-rule.json',
                type: 'create',
                timestamp: Date.now()
            }];

            const result = await hotReloadManager.processChanges(changes);

            expect(result.success).toBe(true);
            expect(result.processedFiles).toContain('/test/rules/test-rule.json');
            expect(result.errors).toHaveLength(0);
            expect(result.addedRules).toHaveLength(1);
            expect(mockRegistry.addRule).toHaveBeenCalled();
        });

        test('should handle disabled hot reload', async () => {
            hotReloadManager.updateConfig({ enabled: false });

            const changes: FileChange[] = [{
                path: '/test/rules/test-rule.json',
                type: 'create',
                timestamp: Date.now()
            }];

            const result = await hotReloadManager.processChanges(changes);

            expect(result.success).toBe(false);
            expect(result.errors).toContain('Hot reload is disabled');
            expect(mockRegistry.addRule).not.toHaveBeenCalled();
        });

        test('should handle concurrent operation limit', async () => {
            // Simulate ongoing operations
            const busyManager = new HotReloadManager(mockRegistry, {
                maxConcurrentOperations: 0 // Zero to trigger limit
            });

            const changes: FileChange[] = [{
                path: '/test/rules/test-rule.json',
                type: 'create',
                timestamp: Date.now()
            }];

            const result = await busyManager.processChanges(changes);

            expect(result.success).toBe(false);
            expect(result.errors).toContain('Too many concurrent hot reload operations');
        });

        test('should handle file deletion', async () => {
            // Mock existing rule
            const existingRule = {
                id: 'test-rule-id',
                semanticName: 'typescript-test-rule',
                displayName: 'Test Rule',
                description: 'A test rule',
                category: 'test',
                technology: 'typescript',
                pattern: 'test-pattern',
                severity: 'error',
                tags: ['test'],
                examples: [],
                relatedRules: [],
                aliases: [],
                deprecated: false,
                metadata: {
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    version: '1.0.0',
                    author: 'test',
                    source: 'file-watch'
                }
            };

            (mockRegistry.getRule as any).mockResolvedValue(existingRule);

            const changes: FileChange[] = [{
                path: '/test/rules/test-rule.json',
                type: 'delete',
                timestamp: Date.now()
            }];

            const result = await hotReloadManager.processChanges(changes);

            expect(result.success).toBe(true);
            expect(result.removedRules).toHaveLength(1);
            expect(mockRegistry.removeRule).toHaveBeenCalledWith('test-rule', true);
        });

        test('should handle rule updates', async () => {
            // Mock existing rule
            const existingRule = {
                id: 'test-rule-id',
                semanticName: 'typescript-test-rule',
                displayName: 'Test Rule',
                description: 'A test rule',
                category: 'test',
                technology: 'typescript',
                pattern: 'test-pattern',
                severity: 'error',
                tags: ['test'],
                examples: [],
                relatedRules: [],
                aliases: [],
                deprecated: false,
                metadata: {
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    version: '1.0.0',
                    author: 'test',
                    source: 'file-watch'
                }
            };

            const updatedContent = {
                ...existingRule,
                description: 'Updated test rule',
                severity: 'warning'
            };

            (mockRegistry.getRule as any).mockResolvedValue(existingRule);

            // Mock file content
            mockFileContent('/test/rules/test-rule.json', JSON.stringify(updatedContent), true);

            const changes: FileChange[] = [{
                path: '/test/rules/test-rule.json',
                type: 'update',
                timestamp: Date.now()
            }];

            const result = await hotReloadManager.processChanges(changes);

            expect(result.success).toBe(true);
            expect(result.updatedRules).toHaveLength(1);
            expect(mockRegistry.updateRule).toHaveBeenCalled();
        });

        test('should handle multiple file changes', async () => {
            const mockContent = {
                semanticName: 'typescript-test-rule',
                displayName: 'Test Rule',
                description: 'A test rule',
                category: 'test',
                technology: 'typescript',
                pattern: 'test-pattern',
                severity: 'error',
                tags: ['test'],
                examples: [],
                relatedRules: [],
                aliases: []
            };

            // Mock file content for all test files
            mockFileContent('/test/rules/rule1.json', JSON.stringify(mockContent), true);
            mockFileContent('/test/rules/rule2.json', JSON.stringify(mockContent), true);
            mockFileContent('/test/rules/rule3.json', JSON.stringify(mockContent), true);

            const changes: FileChange[] = [
                {
                    path: '/test/rules/rule1.json',
                    type: 'create',
                    timestamp: Date.now()
                },
                {
                    path: '/test/rules/rule2.json',
                    type: 'create',
                    timestamp: Date.now()
                },
                {
                    path: '/test/rules/rule3.json',
                    type: 'create',
                    timestamp: Date.now()
                }
            ];

            const result = await hotReloadManager.processChanges(changes);

            expect(result.success).toBe(true);
            expect(result.processedFiles).toHaveLength(3);
            expect(result.addedRules).toHaveLength(3);
            expect(mockRegistry.addRule).toHaveBeenCalled();
        });
    });

    describe('Validation', () => {
        test('should validate changes before processing', async () => {
            // Mock invalid file content
            mockFileContent('/test/rules/invalid-rule.json', 'invalid json', true);

            const changes: FileChange[] = [{
                path: '/test/rules/invalid-rule.json',
                type: 'create',
                timestamp: Date.now()
            }];

            const result = await hotReloadManager.processChanges(changes);

            expect(result.success).toBe(false);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0]).toContain('invalid-rule.json');
            expect(mockRegistry.addRule).not.toHaveBeenCalled();
        });

        test('should handle missing files', async () => {
            mockFileContent('/test/rules/missing-rule.json', '', false);

            const changes: FileChange[] = [{
                path: '/test/rules/missing-rule.json',
                type: 'create',
                timestamp: Date.now()
            }];

            const result = await hotReloadManager.processChanges(changes);

            expect(result.success).toBe(false);
            expect(result.errors[0]).toContain('does not exist');
        });

        test('should skip validation when disabled', async () => {
            hotReloadManager.updateConfig({ validateBeforeUpdate: false });

            const mockContent = {
                semanticName: 'typescript-test-rule',
                displayName: 'Test Rule',
                description: 'A test rule',
                category: 'test',
                technology: 'typescript',
                pattern: 'test-pattern',
                severity: 'error',
                tags: ['test'],
                examples: [],
                relatedRules: [],
                aliases: []
            };

            mockFileContent('/test/rules/test-rule.json', JSON.stringify(mockContent), true);

            const changes: FileChange[] = [{
                path: '/test/rules/test-rule.json',
                type: 'create',
                timestamp: Date.now()
            }];

            const result = await hotReloadManager.processChanges(changes);

            expect(result.success).toBe(true);
        });
    });

    describe('Rollback', () => {
        test('should rollback on failure when enabled', async () => {
            // Mock successful add but failure on second operation
            let callCount = 0;
            (mockRegistry.addRule as any).mockImplementation(async () => {
                callCount++;
                if (callCount > 1) {
                    throw new Error('Database error');
                }
                return Promise.resolve(undefined);
            });

            const mockContent = {
                semanticName: 'typescript-test-rule',
                displayName: 'Test Rule',
                description: 'A test rule',
                category: 'test',
                technology: 'typescript',
                pattern: 'test-pattern',
                severity: 'error',
                tags: ['test'],
                examples: [],
                relatedRules: [],
                aliases: []
            };

            // Mock file content for both test files
            mockFileContent('/test/rules/rule1.json', JSON.stringify(mockContent), true);
            mockFileContent('/test/rules/rule2.json', JSON.stringify(mockContent), true);

            const changes: FileChange[] = [
                {
                    path: '/test/rules/rule1.json',
                    type: 'create',
                    timestamp: Date.now()
                },
                {
                    path: '/test/rules/rule2.json',
                    type: 'create',
                    timestamp: Date.now()
                }
            ];

            const result = await hotReloadManager.processChanges(changes);

            expect(result.success).toBe(false);
            expect(result.errors).toHaveLength(1);
            expect(result.addedRules).toHaveLength(0); // Rollback occurred
        });

        test('should not rollback when disabled', async () => {
            hotReloadManager.updateConfig({ enableRollback: false });

            (mockRegistry.addRule as any).mockRejectedValue(new Error('Database error'));

            const mockContent = {
                semanticName: 'typescript-test-rule',
                displayName: 'Test Rule',
                description: 'A test rule',
                category: 'test',
                technology: 'typescript',
                pattern: 'test-pattern',
                severity: 'error',
                tags: ['test'],
                examples: [],
                relatedRules: [],
                aliases: []
            };

            mockFileContent('/test/rules/test-rule.json', JSON.stringify(mockContent), true);

            const changes: FileChange[] = [{
                path: '/test/rules/test-rule.json',
                type: 'create',
                timestamp: Date.now()
            }];

            const result = await hotReloadManager.processChanges(changes);

            expect(result.success).toBe(true); // Success because rollback is disabled
            expect(result.errors).toHaveLength(1); // But errors are still recorded
            expect(result.errors[0]).toContain('Database error');
            expect(mockRegistry.addRule).toHaveBeenCalled(); // Operation was attempted
        });
    });

    describe('Statistics and Health', () => {
        test('should provide accurate statistics', () => {
            const stats = hotReloadManager.getStats();

            expect(stats).toEqual({
                config: expect.objectContaining({
                    enabled: true,
                    validateBeforeUpdate: true,
                    enableRollback: true,
                    maxConcurrentOperations: 3,
                    operationTimeoutMs: 5000,
                    conflictResolution: 'fail'
                }),
                ongoingOperations: 0,
                isHealthy: true
            });
        });

        test('should indicate unhealthy when too many operations', () => {
            // Simulate ongoing operations by accessing private method through reflection
            (hotReloadManager as any).ongoingOperations.add('op1');
            (hotReloadManager as any).ongoingOperations.add('op2');
            (hotReloadManager as any).ongoingOperations.add('op3');
            (hotReloadManager as any).ongoingOperations.add('op4');

            const stats = hotReloadManager.getStats();
            expect(stats.isHealthy).toBe(false);
            expect(stats.ongoingOperations).toBe(4);
        });
    });

    describe('Rollback Operations', () => {
        test('should rollback added rules', async () => {
            const rollbackData = {
                addedRules: [{
                    id: 'test-rule-1',
                    semanticName: 'typescript-test-rule',
                    displayName: 'Test Rule 1',
                    description: 'Test description',
                    category: 'test',
                    technology: 'typescript',
                    pattern: 'test-pattern',
                    severity: 'error',
                    tags: [],
                    examples: [],
                    relatedRules: [],
                    aliases: [],
                    deprecated: false,
                    metadata: {
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                        version: '1.0.0',
                        author: 'test',
                        source: 'file-watch'
                    }
                }],
                updatedRules: [],
                removedRules: []
            };

            await hotReloadManager.rollbackFailedOperations(rollbackData);

            expect(mockRegistry.removeRule).toHaveBeenCalledWith('test-rule-1', true);
        });

        test('should rollback updated rules', async () => {
            const originalRule = {
                id: 'test-rule-1',
                semanticName: 'typescript-test-rule',
                displayName: 'Original Test Rule',
                description: 'Original description',
                category: 'test',
                technology: 'typescript',
                pattern: 'original-pattern',
                severity: 'error',
                tags: [],
                examples: [],
                relatedRules: [],
                aliases: [],
                deprecated: false,
                metadata: {
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    version: '1.0.0',
                    author: 'test',
                    source: 'file-watch'
                }
            };

            const rollbackData = {
                addedRules: [],
                updatedRules: [{
                    id: 'test-rule-1',
                    originalRule
                }],
                removedRules: []
            };

            await hotReloadManager.rollbackFailedOperations(rollbackData);

            expect(mockRegistry.updateRule).toHaveBeenCalledWith('test-rule-1', originalRule);
        });

        test('should rollback removed rules', async () => {
            const removedRule = {
                id: 'test-rule-1',
                semanticName: 'typescript-test-rule',
                displayName: 'Removed Test Rule',
                description: 'Removed description',
                category: 'test',
                technology: 'typescript',
                pattern: 'removed-pattern',
                severity: 'error',
                tags: [],
                examples: [],
                relatedRules: [],
                aliases: [],
                deprecated: false,
                metadata: {
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    version: '1.0.0',
                    author: 'test',
                    source: 'file-watch'
                }
            };

            const rollbackData = {
                addedRules: [],
                updatedRules: [],
                removedRules: [{
                    id: 'test-rule-1',
                    originalRule: removedRule
                }]
            };

            await hotReloadManager.rollbackFailedOperations(rollbackData);

            expect(mockRegistry.addRule).toHaveBeenCalledWith(removedRule);
        });

        test('should handle rollback errors gracefully', async () => {
            mockRegistry.removeRule.mockRejectedValue(new Error('Rollback failed'));

            const rollbackData = {
                addedRules: [{
                    id: 'test-rule-1',
                    semanticName: 'typescript-test-rule',
                    displayName: 'Test Rule',
                    description: 'Test description',
                    category: 'test',
                    technology: 'typescript',
                    pattern: 'test-pattern',
                    severity: 'error',
                    tags: [],
                    examples: [],
                    relatedRules: [],
                    aliases: [],
                    deprecated: false,
                    metadata: {
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                        version: '1.0.0',
                        author: 'test',
                        source: 'file-watch'
                    }
                }],
                updatedRules: [],
                removedRules: []
            };

            // Should not throw error
            await expect(hotReloadManager.rollbackFailedOperations(rollbackData)).resolves.toBeUndefined();

            // Should log warning
            expect(mockLogger.warn).toHaveBeenCalledWith(
                'Failed to rollback added rule test-rule-1',
                expect.any(Object)
            );
        });
    });
});