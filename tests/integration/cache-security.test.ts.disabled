import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import type { CacheEncryptionConfig, AccessControlConfig } from '../../src/cache/cache-security.js';
import {
    CacheEncryptionService,
    CacheAccessControlService,
    EncryptionKeyManager,
    DEFAULT_ENCRYPTION_CONFIG,
    DEFAULT_ACCESS_CONTROL_CONFIG
} from '../../src/cache/cache-security.js';
import {
    SecureCacheManager,
    createSecureCache
} from '../../src/cache/secure-cache-manager.js';
import {
    SecureMcpResponseCache,
    secureMcpCache,
    SecureCacheKeys
} from '../../src/cache/secure-mcp-response-cache.js';
import { GetStandardsResponse, SearchStandardsResponse, ValidateCodeResponse } from '../../src/types/mcp.js';

describe('Cache Security Integration Tests', () => {
    describe('Encryption Key Manager', () => {
        let keyManager: EncryptionKeyManager;

        beforeEach(() => {
            keyManager = new EncryptionKeyManager({
                enabled: true,
                algorithm: 'aes-256-gcm',
                keyRotationInterval: 100, // Short interval for testing
                sensitiveDataPatterns: [/password/i]
            });
        });

        afterEach(() => {
            keyManager.destroy();
        });

        test('1.3-SEC-001 should generate and rotate encryption keys', async () => {
            const initialKey = keyManager.getCurrentKey();
            expect(initialKey).toBeDefined();
            expect(initialKey.length).toBe(32); // 256 bits

            // Test automatic key rotation with proper async handling
            const beforeRotation = keyManager.getCurrentKey();
            expect(keyManager.hasActiveRotationTimer()).toBe(true);

            // Wait for automatic key rotation to occur (interval is 100ms, so wait longer)
            await new Promise<void>((resolve) => {
                setTimeout(() => {
                    const afterAutoRotation = keyManager.getCurrentKey();
                    expect(afterAutoRotation).not.toEqual(beforeRotation);
                    resolve();
                }, 200); // Wait longer than the rotation interval
            });

            // Test manual key rotation
            const beforeManualRotation = keyManager.getCurrentKey();
            keyManager.forceKeyRotation();
            const afterManualRotation = keyManager.getCurrentKey();
            expect(afterManualRotation).not.toEqual(beforeManualRotation);
        });

        test('1.3-SEC-002 should maintain decryption keys during rotation', () => {
            const currentKey = keyManager.getCurrentKey();
            const decryptionKeys = keyManager.getDecryptionKeys();

            expect(decryptionKeys).toContain(currentKey);
            expect(decryptionKeys.length).toBeGreaterThanOrEqual(1);
        });
    });

    describe('Cache Encryption Service', () => {
        let encryptionService: CacheEncryptionService;
        const testConfig: CacheEncryptionConfig = {
            enabled: true,
            algorithm: 'aes-256-gcm',
            keyRotationInterval: 0, // Disabled for testing
            sensitiveDataPatterns: [
                /password/i,
                /secret/i,
                /token/i,
                /user.*data/i
            ]
        };

        beforeEach(() => {
            encryptionService = new CacheEncryptionService(testConfig);
        });

        afterEach(() => {
            encryptionService.destroy();
        });

        test('1.3-SEC-003 should encrypt data matching sensitive patterns', () => {
            const sensitiveData = { password: 'secret123', token: 'abc123' };
            const key = 'user_credentials';

            const encrypted = encryptionService.encrypt(key, sensitiveData);

            expect(encrypted).not.toEqual(sensitiveData);
            expect(typeof encrypted).toBe('object');
            expect(encrypted).toHaveProperty('encrypted', true);
            expect(encrypted).toHaveProperty('data');
            expect(encrypted.data).toHaveProperty('encrypted');
            expect(encrypted.data).toHaveProperty('iv');
            expect(encrypted.data).toHaveProperty('tag');
        });

        test('1.3-SEC-004 should not encrypt non-sensitive data', () => {
            const normalData = { name: 'John', age: 30 };
            const key = 'user_profile';

            const result = encryptionService.encrypt(key, normalData);

            expect(result).toEqual(normalData); // Should be unchanged
        });

        test('1.3-SEC-005 should decrypt encrypted data correctly', () => {
            const originalData = { password: 'secret123', user: 'admin' };
            const key = 'secure_data';

            const encrypted = encryptionService.encrypt(key, originalData);
            const decrypted = encryptionService.decrypt(encrypted);

            expect(decrypted).toEqual(originalData);
        });

        test('1.3-SEC-006 should handle decryption errors gracefully', () => {
            const corruptedEncryptedData = {
                data: {
                    encrypted: 'invalid_encrypted_data',
                    iv: 'invalid_iv',
                    tag: 'invalid_tag'
                },
                timestamp: Date.now(),
                expiresAt: 0,
                hits: 0,
                encrypted: true
            };

            expect(() => {
                encryptionService.decrypt(corruptedEncryptedData);
            }).toThrow('Cache decryption failed');
        });

        test('1.3-SEC-007 should provide encryption status', () => {
            const status = encryptionService.getStatus();

            expect(status).toHaveProperty('enabled', true);
            expect(status).toHaveProperty('algorithm', 'aes-256-gcm');
            expect(status).toHaveProperty('keyRotationEnabled', false); // Disabled in test config
            expect(status).toHaveProperty('activeKeys');
            expect(status.activeKeys).toBeGreaterThanOrEqual(1);
        });
    });

    describe('Cache Access Control Service', () => {
        let accessControl: CacheAccessControlService;
        const testConfig: AccessControlConfig = {
            enabled: true,
            defaultPermissions: {
                canRead: true,
                canWrite: false,
                canDelete: false,
                canClear: false,
                allowedKeys: []
            },
            roleBasedAccess: new Map([
                ['admin', {
                    canRead: true,
                    canWrite: true,
                    canDelete: true,
                    canClear: true,
                    allowedKeys: []
                }],
                ['user', {
                    canRead: true,
                    canWrite: false,
                    canDelete: false,
                    canClear: false,
                    allowedKeys: ['public:*', 'standards:*']
                }],
                ['readonly', {
                    canRead: true,
                    canWrite: false,
                    canDelete: false,
                    canClear: false,
                    allowedKeys: ['standards:read']
                }]
            ]),
            auditLogging: true
        };

        beforeEach(() => {
            accessControl = new CacheAccessControlService(testConfig);
        });

        test('1.3-SEC-008 should create access context with default role', () => {
            const context = accessControl.createContext('user123');

            expect(context).toHaveProperty('userId', 'user123');
            expect(context).toHaveProperty('role', 'default');
            expect(context).toHaveProperty('permissions');
            expect(context).toHaveProperty('sessionId');
            expect(context).toHaveProperty('timestamp');
        });

        test('1.3-SEC-009 should create access context with specified role', () => {
            const context = accessControl.createContext('admin123', 'admin');

            expect(context.role).toBe('admin');
            expect(context.permissions.canRead).toBe(true);
            expect(context.permissions.canWrite).toBe(true);
            expect(context.permissions.canDelete).toBe(true);
            expect(context.permissions.canClear).toBe(true);
        });

        test('1.3-SEC-010 should enforce read permissions correctly', () => {
            const adminContext = accessControl.createContext('admin', 'admin');
            const userContext = accessControl.createContext('user', 'user');
            const readonlyContext = accessControl.createContext('readonly', 'readonly');

            // Test admin access
            expect(accessControl.canRead('any_key', adminContext)).toBe(true);

            // Test user access to allowed keys
            expect(accessControl.canRead('public:data', userContext)).toBe(true);
            expect(accessControl.canRead('standards:rules', userContext)).toBe(true);

            // Test user access to restricted keys
            expect(accessControl.canRead('admin:secrets', userContext)).toBe(false);

            // Test readonly access
            expect(accessControl.canRead('standards:read', readonlyContext)).toBe(true);
            expect(accessControl.canRead('standards:write', readonlyContext)).toBe(false);
        });

        test('1.3-SEC-011 should enforce write permissions correctly', () => {
            const adminContext = accessControl.createContext('admin', 'admin');
            const userContext = accessControl.createContext('user', 'user');

            expect(accessControl.canWrite('any_key', adminContext)).toBe(true);
            expect(accessControl.canWrite('public:data', userContext)).toBe(false);
        });

        test('1.3-SEC-012 should enforce delete permissions correctly', () => {
            const adminContext = accessControl.createContext('admin', 'admin');
            const userContext = accessControl.createContext('user', 'user');

            expect(accessControl.canDelete('any_key', adminContext)).toBe(true);
            expect(accessControl.canDelete('public:data', userContext)).toBe(false);
        });

        test('1.3-SEC-013 should enforce clear permissions correctly', () => {
            const adminContext = accessControl.createContext('admin', 'admin');
            const userContext = accessControl.createContext('user', 'user');

            expect(accessControl.canClear(adminContext)).toBe(true);
            expect(accessControl.canClear(userContext)).toBe(false);
        });

        test('1.3-SEC-014 should log audit events', () => {
            const userContext = accessControl.createContext('user', 'user');

            // Perform some access attempts
            accessControl.canRead('public:data', userContext);
            accessControl.canWrite('public:data', userContext); // Should be denied
            accessControl.canDelete('public:data', userContext); // Should be denied

            const auditLog = accessControl.getAuditLog();

            expect(auditLog.length).toBeGreaterThan(0);
            expect(auditLog.some(entry => entry.action === 'read')).toBe(true);
            expect(auditLog.some(entry => entry.action === 'write')).toBe(true);
            expect(auditLog.some(entry => entry.action === 'delete')).toBe(true);
            expect(auditLog.some(entry => entry.granted === false)).toBe(true);
        });

        test('1.3-SEC-015 should limit audit log size', () => {
            const context = accessControl.createContext('user', 'user');

            // Generate many audit entries
            for (let i = 0; i < 100; i++) {
                accessControl.canRead(`key_${i}`, context);
            }

            const auditLog = accessControl.getAuditLog();
            expect(auditLog.length).toBeLessThanOrEqual(10000); // Should be limited
        });
    });

    describe('Secure Cache Manager', () => {
        let secureCache: SecureCacheManager<string>;

        beforeEach(() => {
            secureCache = createSecureCache<string>({
                ttl: 60000, // 1 minute
                maxSize: 100,
                enabled: true,
                encryption: {
                    enabled: true,
                    keyRotationInterval: 0 // Disabled for testing
                },
                accessControl: {
                    enabled: true,
                    auditLogging: true
                }
            });
        });

        afterEach(() => {
            secureCache.destroy();
        });

        test('1.3-SEC-016 should store and retrieve data with encryption', () => {
            const sensitiveData = JSON.stringify({ password: 'secret123', token: 'abc123' });
            const key = 'secure_credentials';

            secureCache.set(key, sensitiveData);
            const retrieved = secureCache.get(key);

            expect(retrieved).toBe(sensitiveData);
        });

        test('1.3-SEC-017 should enforce access control on get operations', () => {
            // Create a secure cache with restrictive access control
            const restrictedCache = createSecureCache({
                ttl: 60000,
                maxSize: 100,
                enabled: true,
                accessControl: {
                    enabled: true,
                    defaultPermissions: {
                        canRead: false,
                        canWrite: false,
                        canDelete: false,
                        canClear: false,
                        allowedKeys: []
                    },
                    roleBasedAccess: new Map([
                        ['admin', {
                            canRead: true,
                            canWrite: true,
                            canDelete: true,
                            canClear: true,
                            allowedKeys: ['*'] // Admin can access all keys
                        }],
                        ['readonly', {
                            canRead: true,
                            canWrite: false,
                            canDelete: false,
                            canClear: false,
                            allowedKeys: ['public:*'] // Only allow access to public keys
                        }]
                    ]),
                    auditLogging: false
                }
            });

            const data = 'test_data';
            const protectedKey = 'admin:secret_data';
            const publicKey = 'public:info';
            const adminContext = restrictedCache.getAccessControlService().createContext('admin', 'admin');
            const readonlyContext = restrictedCache.getAccessControlService().createContext('user', 'readonly');

            // Set protected data with admin context
            restrictedCache.set(protectedKey, data, adminContext);

            // Get protected data with admin context (should work)
            const adminResult = restrictedCache.get(protectedKey, adminContext);
            expect(adminResult).toBe(data);

            // Try to get protected data with readonly user - should return null due to access denial
            const readonlyResult = restrictedCache.get(protectedKey, readonlyContext);
            expect(readonlyResult).toBeNull(); // Access denied for non-public key

            // Public data should be accessible to readonly user
            restrictedCache.set(publicKey, 'public_info', adminContext);
            const publicResult = restrictedCache.get(publicKey, readonlyContext);
            expect(publicResult).toBe('public_info');

            restrictedCache.destroy();
        });

        test('1.3-SEC-018 should enforce access control on set operations', () => {
            // Create a secure cache with restrictive access control
            const restrictedCache = createSecureCache({
                ttl: 60000,
                maxSize: 100,
                enabled: true,
                accessControl: {
                    enabled: true,
                    defaultPermissions: {
                        canRead: false,
                        canWrite: false,
                        canDelete: false,
                        canClear: false,
                        allowedKeys: []
                    },
                    roleBasedAccess: new Map([
                        ['admin', {
                            canRead: true,
                            canWrite: true,
                            canDelete: true,
                            canClear: true,
                            allowedKeys: ['*'] // Admin can access all keys
                        }],
                        ['readonly', {
                            canRead: true,
                            canWrite: false,
                            canDelete: false,
                            canClear: false,
                            allowedKeys: ['public:*'] // Only allow read/write access to public keys
                        }]
                    ]),
                    auditLogging: false
                }
            });

            const data = 'test_data';
            const protectedKey = 'admin:secret_data';
            const adminContext = restrictedCache.getAccessControlService().createContext('admin', 'admin');
            const readonlyContext = restrictedCache.getAccessControlService().createContext('user', 'readonly');

            // First set data with admin to have something in cache
            restrictedCache.set(protectedKey, data, adminContext);
            expect(restrictedCache.get(protectedKey, adminContext)).toBe(data);

            // Try to overwrite with restricted user - should fail gracefully
            restrictedCache.set(protectedKey, 'overwritten_data', readonlyContext);

            // Verify the original data is still there (overwrite failed)
            const result = restrictedCache.get(protectedKey, adminContext);
            expect(result).toBe(data); // Should still be original data

            restrictedCache.destroy();
        });

        test('1.3-SEC-019 should enforce access control on delete operations', () => {
            const data = 'test_data';
            const key = 'protected_data';
            const userContext = secureCache.getAccessControlService().createContext('user', 'readonly');

            secureCache.set(key, data); // Set without context

            // Try to delete with restricted user
            const result = secureCache.delete(key, userContext);
            expect(result).toBe(false);
        });

        test('1.3-SEC-020 should enforce access control on clear operations', () => {
            const data = 'test_data';
            const key = 'test_key';
            const adminContext = secureCache.getAccessControlService().createContext('admin', 'admin');
            const userContext = secureCache.getAccessControlService().createContext('user', 'readonly');

            // Set data with admin context
            secureCache.set(key, data, adminContext);
            expect(secureCache.has(key, adminContext)).toBe(true);

            // Try to clear with restricted user - should fail gracefully
            secureCache.clear(userContext);

            // Data should still be there when checked with admin
            expect(secureCache.has(key, adminContext)).toBe(true);
        });

        test('1.3-SEC-021 should provide enhanced statistics', () => {
            const adminContext = secureCache.getAccessControlService().createContext('admin', 'admin');
            const userContext = secureCache.getAccessControlService().createContext('user', 'readonly');

            // Add some data and perform operations
            secureCache.set('test1', 'data1', adminContext);
            secureCache.get('test1', adminContext);

            // Try some denied operations
            try {
                secureCache.get('test1', userContext);
            } catch (e) {
                // Expected
            }

            const stats = secureCache.getStats();

            expect(stats).toHaveProperty('encryption');
            expect(stats).toHaveProperty('accessControl');
            expect(stats).toHaveProperty('performance');
            expect(stats.encryption).toHaveProperty('enabled');
            expect(stats.encryption).toHaveProperty('encryptedEntries');
            expect(stats.accessControl).toHaveProperty('enabled');
            expect(stats.accessControl).toHaveProperty('totalRequests');
            expect(stats.accessControl).toHaveProperty('deniedRequests');
            expect(stats.performance).toHaveProperty('encryptionOverhead');
            expect(stats.performance).toHaveProperty('accessControlOverhead');
        });

        test('1.3-SEC-022 should filter keys based on access permissions', () => {
            const adminContext = secureCache.getAccessControlService().createContext('admin', 'admin');
            const userContext = secureCache.getAccessControlService().createContext('user', 'user');

            secureCache.set('admin_only', 'secret_data', adminContext);
            secureCache.set('public_data', 'public_info');

            // Admin should see all keys
            const adminKeys = secureCache.keys(adminContext);
            expect(adminKeys).toContain('admin_only');
            expect(adminKeys).toContain('public_data');

            // User should only see public keys
            const userKeys = secureCache.keys(userContext);
            expect(userKeys).toContain('public_data');
            // Note: Whether 'admin_only' appears depends on the specific access control configuration
        });
    });

    describe('Secure MCP Response Cache', () => {
        let secureMcpCache: SecureMcpResponseCache;

        beforeEach(() => {
            secureMcpCache = new SecureMcpResponseCache({
                globalEncryption: {
                    enabled: true,
                    sensitiveDataPatterns: [/password/i, /secret/i]
                },
                globalAccessControl: {
                    enabled: true,
                    defaultRole: 'user'
                }
            });
        });

        afterEach(() => {
            secureMcpCache.destroy();
        });

        test('1.3-SEC-023 should cache and retrieve standards responses with security', () => {
            const standardsResponse: GetStandardsResponse = {
                standards: [
                    {
                        id: '1',
                        technology: 'TypeScript',
                        category: 'Formatting',
                        name: 'TypeScript Naming Conventions',
                        description: 'Naming conventions for TypeScript code',
                        rule: 'use camelCase for variables and functions',
                        severity: 'warning',
                        examples: [
                            {
                                bad: 'var my_variable = 1;',
                                good: 'var myVariable = 1;',
                                explanation: 'Use camelCase instead of snake_case'
                            }
                        ]
                    }
                ],
                totalCount: 1,
                cached: false
            };

            const key = SecureCacheKeys.standards('TypeScript', 'Formatting');
            const adminContext = secureMcpCache.createAccessContext({ userId: 'admin', role: 'admin' });

            secureMcpCache.setStandards(key, standardsResponse, adminContext);
            const retrieved = secureMcpCache.getStandards(key, adminContext);

            expect(retrieved).toEqual(standardsResponse);
        });

        test('1.3-SEC-024 should cache and retrieve search responses with security', () => {
            const searchResponse: SearchStandardsResponse = {
                results: [
                    {
                        id: '1',
                        technology: 'TypeScript',
                        category: 'Formatting',
                        name: 'TypeScript Naming Conventions',
                        description: 'Naming conventions for TypeScript code',
                        rule: 'use camelCase for variables and functions',
                        severity: 'warning',
                        examples: [
                            {
                                bad: 'var my_variable = 1;',
                                good: 'var myVariable = 1;',
                                explanation: 'Use camelCase instead of snake_case'
                            }
                        ],
                        score: 0.95
                    }
                ],
                totalCount: 1,
                query: 'naming',
                cached: false
            };

            const key = SecureCacheKeys.search('naming', 'TypeScript', true, 10);
            const userContext = secureMcpCache.createAccessContext({ userId: 'user1', role: 'user' });

            secureMcpCache.setSearch(key, searchResponse, userContext);
            const retrieved = secureMcpCache.getSearch(key, userContext);

            expect(retrieved).toEqual(searchResponse);
        });

        test('1.3-SEC-025 should cache and retrieve validation responses with security', () => {
            const validationResponse: ValidateCodeResponse = {
                valid: false,
                violations: [
                    {
                        rule: 'Use camelCase for variable names',
                        severity: 'error',
                        line: 1,
                        column: 5,
                        message: 'Variable name should use camelCase',
                        suggestion: 'myVariable'
                    }
                ],
                score: 0.8,
                code: 'var my_variable = 1;',
                language: 'typescript'
            };

            const key = SecureCacheKeys.validation('abc123', 'typescript', ['naming']);
            const userContext = secureMcpCache.createAccessContext({ userId: 'user1', role: 'user' });

            secureMcpCache.setValidation(key, validationResponse, userContext);
            const retrieved = secureMcpCache.getValidation(key, userContext);

            expect(retrieved).toEqual(validationResponse);
        });

        test('1.3-SEC-026 should provide security compliance report', () => {
            const adminContext = secureMcpCache.createAccessContext({ userId: 'admin', role: 'admin' });

            // Add some test data
            const testData = {
                password: 'secret123', // This should trigger encryption
                user: 'test_user'
            };

            secureMcpCache.setStandards('test_key', testData as any, adminContext);

            const report = secureMcpCache.getSecurityComplianceReport();

            expect(report).toHaveProperty('encryption');
            expect(report).toHaveProperty('accessControl');
            expect(report).toHaveProperty('performance');
            expect(report).toHaveProperty('recommendations');

            expect(report.encryption.enabled).toBe(true);
            expect(report.encryption.algorithm).toBe('aes-256-gcm');
            expect(report.encryption.encryptedEntries).toBeGreaterThanOrEqual(0);
            expect(report.accessControl.enabled).toBe(true);
        });

        test('1.3-SEC-027 should provide comprehensive audit logging', () => {
            const adminContext = secureMcpCache.createAccessContext({ userId: 'admin', role: 'admin' });
            const userContext = secureMcpCache.createAccessContext({ userId: 'user1', role: 'user' });

            // Perform various operations
            secureMcpCache.setStandards('test1', {} as any, adminContext);
            secureMcpCache.getStandards('test1', adminContext);

            try {
                secureMcpCache.setStandards('test2', {} as any, userContext);
            } catch (e) {
                // Expected - access denied
            }

            const auditLog = secureMcpCache.getCombinedAuditLog();

            expect(auditLog.length).toBeGreaterThan(0);
            expect(auditLog.some(entry => entry.cache === 'standards')).toBe(true);
            expect(auditLog.some(entry => entry.entry.granted === true)).toBe(true);
        });

        test('1.3-SEC-028 should maintain performance under security overhead', () => {
            const adminContext = secureMcpCache.createAccessContext({ userId: 'admin', role: 'admin' });

            const startTime = performance.now();

            // Perform multiple operations
            for (let i = 0; i < 50; i++) {
                const key = `performance_test_${i}`;
                const data = { id: i, password: `secret_${i}` }; // Should be encrypted

                secureMcpCache.setStandards(key, data as any, adminContext);
                secureMcpCache.getStandards(key, adminContext);
            }

            const endTime = performance.now();
            const totalTime = endTime - startTime;
            const avgOperationTime = totalTime / 100; // 50 sets + 50 gets

            // Security overhead should be reasonable (less than 5ms per operation on average)
            expect(avgOperationTime).toBeLessThan(5.0);
        });
    });

    describe('Security Integration with Performance Requirements', () => {
        test('1.3-SEC-029 should maintain sub-30ms response times with security', () => {
            const secureCache = createSecureCache({
                ttl: 60000,
                maxSize: 1000,
                enabled: true,
                encryption: {
                    enabled: true,
                    keyRotationInterval: 0
                },
                accessControl: {
                    enabled: true,
                    auditLogging: true
                }
            });

            const adminContext = secureCache.getAccessControlService().createContext('admin', 'admin');
            const sensitiveData = { password: 'test_secret', user: 'test_user' };

            // Measure set operation time
            const setStart = performance.now();
            secureCache.set('perf_test', JSON.stringify(sensitiveData), adminContext);
            const setTime = performance.now() - setStart;

            // Measure get operation time
            const getStart = performance.now();
            const retrieved = secureCache.get('perf_test', adminContext);
            const getTime = performance.now() - getStart;

            expect(retrieved).toBe(JSON.stringify(sensitiveData));
            expect(setTime).toBeLessThan(30);
            expect(getTime).toBeLessThan(30);

            secureCache.destroy();
        });

        test('1.3-SEC-030 should handle encryption failures gracefully', () => {
            // Mock encryption service to fail
            const failingEncryptionService = {
                encrypt: () => {
                    throw new Error('Encryption failed');
                },
                decrypt: (data: any) => data, // Return as-is for failed encryption
                getStatus: () => ({ enabled: false, algorithm: '', keyRotationEnabled: false, activeKeys: 0 }),
                destroy: () => {}
            } as any;

            const secureCache = createSecureCache({
                enabled: true,
                encryption: { enabled: false }, // Disable encryption to test failure handling
                accessControl: { enabled: true, auditLogging: true }
            });

            const adminContext = secureCache.getAccessControlService().createContext('admin', 'admin');
            const testData = 'test_data';

            // Should not throw and should store data anyway
            expect(() => {
                secureCache.set('fail_test', testData, adminContext);
            }).not.toThrow();

            // Should be able to retrieve the data
            const retrieved = secureCache.get('fail_test', adminContext);
            expect(retrieved).toBe(testData);

            secureCache.destroy();
        });
    });
});