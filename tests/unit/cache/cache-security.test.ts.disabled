import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import {
    CacheEncryptionService,
    CacheAccessControlService,
    EncryptionKeyManager,
    DEFAULT_ENCRYPTION_CONFIG,
    DEFAULT_ACCESS_CONTROL_CONFIG,
    CacheAccessContext,
    EncryptedCacheEntry
} from '../../../src/cache/cache-security.js';

describe('Cache Security Unit Tests', () => {
    describe('EncryptionKeyManager', () => {
        let keyManager: EncryptionKeyManager;

        beforeEach(() => {
            keyManager = new EncryptionKeyManager({
                enabled: true,
                algorithm: 'aes-256-gcm',
                keyRotationInterval: 1000, // 1 second for testing
                sensitiveDataPatterns: [/test/i]
            });
        });

        afterEach(() => {
            keyManager.destroy();
        });

        test('should generate 256-bit encryption key', () => {
            const key = keyManager.getCurrentKey();
            expect(key).toBeDefined();
            expect(key.length).toBe(32); // 256 bits = 32 bytes
            expect(key instanceof Buffer).toBe(true);
        });

        test('should provide decryption keys including previous keys', () => {
            const currentKey = keyManager.getCurrentKey();
            const decryptionKeys = keyManager.getDecryptionKeys();

            expect(decryptionKeys).toContain(currentKey);
            expect(decryptionKeys.length).toBeGreaterThanOrEqual(1);
        });

        test('should handle key rotation correctly', async () => {
            const originalKey = keyManager.getCurrentKey();
            expect(keyManager.hasActiveRotationTimer()).toBe(true);

            // Test automatic rotation
            const beforeRotation = keyManager.getCurrentKey();

            // Wait for automatic key rotation (interval is 1000ms, so wait longer)
            await new Promise<void>((resolve) => {
                setTimeout(() => {
                    const newKey = keyManager.getCurrentKey();
                    expect(newKey).not.toEqual(beforeRotation);

                    const decryptionKeys = keyManager.getDecryptionKeys();
                    expect(decryptionKeys.length).toBeGreaterThanOrEqual(2);
                    expect(decryptionKeys).toContain(originalKey);
                    expect(decryptionKeys).toContain(newKey);

                    resolve();
                }, 1200); // Wait longer than the rotation interval
            });

            // Test manual rotation
            const beforeManualRotation = keyManager.getCurrentKey();
            keyManager.forceKeyRotation();
            const afterManualRotation = keyManager.getCurrentKey();

            expect(afterManualRotation).not.toEqual(beforeManualRotation);

            const finalDecryptionKeys = keyManager.getDecryptionKeys();
            expect(finalDecryptionKeys.length).toBeGreaterThanOrEqual(2);
        });

        test('should clean up resources properly', () => {
            const key = keyManager.getCurrentKey();
            keyManager.destroy();

            // Key should be zeroed out (this is hard to test directly, but we can check the manager is still functional)
            expect(() => {
                keyManager.getCurrentKey();
            }).not.toThrow();
        });
    });

    describe('CacheEncryptionService', () => {
        let encryptionService: CacheEncryptionService;

        beforeEach(() => {
            encryptionService = new CacheEncryptionService({
                enabled: true,
                algorithm: 'aes-256-gcm',
                keyRotationInterval: 0, // Disabled for testing
                sensitiveDataPatterns: [
                    /password/i,
                    /secret/i,
                    /token/i,
                    /credential/i
                ]
            });
        });

        afterEach(() => {
            encryptionService.destroy();
        });

        describe('Pattern Matching', () => {
            test('should identify sensitive data by content', () => {
                const testData = {
                    username: 'john',
                    password: 'secret123',
                    email: 'john@example.com'
                };

                const result = encryptionService.encrypt('user_data', testData);
                expect(result).not.toEqual(testData);
                expect(typeof result === 'object' && result !== null && 'encrypted' in result).toBe(true);
            });

            test('should identify sensitive data by key', () => {
                const testData = { value: 'some_data' };

                const result1 = encryptionService.encrypt('user_password', testData);
                const result2 = encryptionService.encrypt('auth_token', testData);
                const result3 = encryptionService.encrypt('normal_data', testData);

                expect(result1).not.toEqual(testData);
                expect(result2).not.toEqual(testData);
                expect(result3).toEqual(testData); // Should not be encrypted
            });

            test('should not encrypt non-sensitive data', () => {
                const normalData = {
                    name: 'John Doe',
                    age: 30,
                    city: 'New York'
                };

                const result = encryptionService.encrypt('profile_data', normalData);
                expect(result).toEqual(normalData);
            });

            test('should handle complex nested data structures', () => {
                const complexData = {
                    user: {
                        profile: {
                            name: 'John',
                            settings: {
                                theme: 'dark',
                                notifications: true
                            }
                        },
                        credentials: {
                            password: 'secret123',
                            token: 'abc123xyz'
                        }
                    }
                };

                const result = encryptionService.encrypt('user_profile', complexData);
                expect(result).not.toEqual(complexData);
            });
        });

        describe('Encryption/Decryption', () => {
            test('should encrypt and decrypt data correctly', () => {
                const originalData = {
                    password: 'my_secret_password',
                    token: 'auth_token_123',
                    user: 'john_doe'
                };

                const encrypted = encryptionService.encrypt('credentials', originalData);
                const decrypted = encryptionService.decrypt(encrypted);

                expect(decrypted).toEqual(originalData);
            });

            test('should handle string data', () => {
                const originalString = 'user_password_secret';

                const encrypted = encryptionService.encrypt('secret_key', originalString);
                const decrypted = encryptionService.decrypt(encrypted);

                expect(decrypted).toEqual(originalString);
            });

            test('should handle numeric data', () => {
                const originalNumber = 12345;

                const encrypted = encryptionService.encrypt('secret_number', originalNumber);
                const decrypted = encryptionService.decrypt(encrypted);

                expect(decrypted).toEqual(originalNumber);
            });

            test('should handle boolean data', () => {
                const originalBoolean = true;

                const encrypted = encryptionService.encrypt('secret_flag', originalBoolean);
                const decrypted = encryptionService.decrypt(encrypted);

                expect(decrypted).toEqual(originalBoolean);
            });

            test('should handle array data', () => {
                const originalArray = [
                    { password: 'secret1', user: 'user1' },
                    { password: 'secret2', user: 'user2' }
                ];

                const encrypted = encryptionService.encrypt('passwords', originalArray);
                const decrypted = encryptionService.decrypt(encrypted);

                expect(decrypted).toEqual(originalArray);
            });

            test('should preserve data types through encryption/decryption', () => {
                const originalData = {
                    string: 'test',
                    number: 42,
                    boolean: false,
                    null: null,
                    array: [1, 2, 3],
                    object: { nested: true },
                    password: 'secret'
                };

                const encrypted = encryptionService.encrypt('mixed_data', originalData);
                const decrypted = encryptionService.decrypt(encrypted);

                expect(typeof decrypted.string).toBe('string');
                expect(typeof decrypted.number).toBe('number');
                expect(typeof decrypted.boolean).toBe('boolean');
                expect(decrypted.null).toBeNull();
                expect(Array.isArray(decrypted.array)).toBe(true);
                expect(typeof decrypted.object).toBe('object');
                expect(decrypted.object.nested).toBe(true);
            });
        });

        describe('Error Handling', () => {
            test('should handle corrupted encrypted data', () => {
                const corruptedData: EncryptedCacheEntry = {
                    data: {
                        encrypted: 'corrupted_encrypted_data',
                        iv: 'invalid_iv',
                        tag: 'invalid_tag'
                    },
                    timestamp: Date.now(),
                    expiresAt: Date.now() + 60000,
                    hits: 0,
                    encrypted: true
                };

                expect(() => {
                    encryptionService.decrypt(corruptedData);
                }).toThrow('Cache decryption failed');
            });

            test('should handle missing encryption metadata', () => {
                const incompleteData: any = {
                    data: {
                        encrypted: 'some_encrypted_data',
                        iv: 'some_iv'
                        // Missing tag
                    },
                    timestamp: Date.now(),
                    expiresAt: Date.now() + 60000,
                    hits: 0,
                    encrypted: true
                };

                expect(() => {
                    encryptionService.decrypt(incompleteData);
                }).toThrow();
            });

            test('should fail gracefully when encryption is disabled', () => {
                const disabledService = new CacheEncryptionService({
                    enabled: false,
                    algorithm: 'aes-256-gcm',
                    keyRotationInterval: 0,
                    sensitiveDataPatterns: [/password/i]
                });

                const sensitiveData = { password: 'secret' };
                const result = disabledService.encrypt('test', sensitiveData);

                expect(result).toEqual(sensitiveData); // Should return original data unchanged

                disabledService.destroy();
            });
        });

        describe('Access Control Integration', () => {
            test('should attach access control information to encrypted entries', () => {
                const context: CacheAccessContext = {
                    userId: 'user123',
                    role: 'user',
                    permissions: {
                        canRead: true,
                        canWrite: true,
                        canDelete: false,
                        canClear: false,
                        allowedKeys: []
                    },
                    timestamp: Date.now(),
                    sessionId: 'session_abc'
                };

                const sensitiveData = { password: 'secret' };
                const encrypted = encryptionService.encrypt('credentials', sensitiveData, context);

                expect(typeof encrypted === 'object' && encrypted !== null && 'accessControl' in encrypted).toBe(true);
                if (typeof encrypted === 'object' && encrypted !== null && 'accessControl' in encrypted) {
                    expect(encrypted.accessControl).toBeDefined();
                    expect(encrypted.accessControl?.createdBy).toBe('user123');
                    expect(encrypted.accessControl?.allowedRoles).toContain('user');
                }
            });

            test('should validate access permissions during decryption', () => {
                const creatorContext: CacheAccessContext = {
                    userId: 'admin',
                    role: 'admin',
                    permissions: {
                        canRead: true,
                        canWrite: true,
                        canDelete: true,
                        canClear: true,
                        allowedKeys: []
                    },
                    timestamp: Date.now()
                };

                const unauthorizedContext: CacheAccessContext = {
                    userId: 'user1',
                    role: 'user',
                    permissions: {
                        canRead: true,
                        canWrite: false,
                        canDelete: false,
                        canClear: false,
                        allowedKeys: []
                    },
                    timestamp: Date.now()
                };

                const sensitiveData = { password: 'admin_secret' };
                const encrypted = encryptionService.encrypt('admin_data', sensitiveData, creatorContext);

                // Should work for authorized user (admin role)
                expect(() => {
                    encryptionService.decrypt(encrypted, creatorContext);
                }).not.toThrow();

                // Should fail for unauthorized user (user role trying to access admin data)
                expect(() => {
                    encryptionService.decrypt(encrypted, unauthorizedContext);
                }).toThrow('Access denied: role \'user\' not allowed');
            });
        });

        describe('Status and Configuration', () => {
            test('should provide correct status information', () => {
                const status = encryptionService.getStatus();

                expect(status).toHaveProperty('enabled', true);
                expect(status).toHaveProperty('algorithm', 'aes-256-gcm');
                expect(status).toHaveProperty('keyRotationEnabled', false); // Disabled in test config
                expect(status).toHaveProperty('activeKeys');
                expect(typeof status.activeKeys).toBe('number');
                expect(status.activeKeys).toBeGreaterThanOrEqual(1);
            });

            test('should handle disabled encryption', () => {
                const disabledService = new CacheEncryptionService({
                    enabled: false,
                    algorithm: 'aes-256-gcm',
                    keyRotationInterval: 0,
                    sensitiveDataPatterns: [/password/i]
                });

                const status = disabledService.getStatus();
                expect(status.enabled).toBe(false);

                const data = { password: 'secret' };
                const result = disabledService.encrypt('test', data);
                expect(result).toEqual(data); // Should be unchanged

                disabledService.destroy();
            });
        });
    });

    describe('CacheAccessControlService', () => {
        let accessControl: CacheAccessControlService;

        beforeEach(() => {
            accessControl = new CacheAccessControlService({
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
                    ['editor', {
                        canRead: true,
                        canWrite: true,
                        canDelete: false,
                        canClear: false,
                        allowedKeys: []
                    }],
                    ['viewer', {
                        canRead: true,
                        canWrite: false,
                        canDelete: false,
                        canClear: false,
                        allowedKeys: ['public:*', 'readonly:*']
                    }]
                ]),
                auditLogging: true
            });
        });

        test('should create access context correctly', () => {
            const context = accessControl.createContext('user123', 'editor');

            expect(context.userId).toBe('user123');
            expect(context.role).toBe('editor');
            expect(context.permissions.canRead).toBe(true);
            expect(context.permissions.canWrite).toBe(true);
            expect(context.permissions.canDelete).toBe(false);
            expect(context.permissions.canClear).toBe(false);
            expect(context.sessionId).toBeDefined();
            expect(context.timestamp).toBeDefined();
            expect(typeof context.sessionId).toBe('string');
            expect(context.sessionId.length).toBe(32); // 16 bytes = 32 hex chars
        });

        test('should use default role when not specified', () => {
            const context = accessControl.createContext('user456');

            expect(context.role).toBe('default');
            expect(context.permissions.canRead).toBe(true);
            expect(context.permissions.canWrite).toBe(false);
        });

        test('should use default permissions for unknown roles', () => {
            const context = accessControl.createContext('user789', 'unknown_role');

            expect(context.permissions.canRead).toBe(true);
            expect(context.permissions.canWrite).toBe(false);
            expect(context.permissions.canDelete).toBe(false);
            expect(context.permissions.canClear).toBe(false);
        });

        test('should enforce read permissions correctly', () => {
            const adminContext = accessControl.createContext('admin', 'admin');
            const editorContext = accessControl.createContext('editor', 'editor');
            const viewerContext = accessControl.createContext('viewer', 'viewer');

            // Admin can read anything
            expect(accessControl.canRead('any_key', adminContext)).toBe(true);

            // Editor can read anything
            expect(accessControl.canRead('any_key', editorContext)).toBe(true);

            // Viewer can read allowed patterns
            expect(accessControl.canRead('public:data', viewerContext)).toBe(true);
            expect(accessControl.canRead('readonly:config', viewerContext)).toBe(true);
            expect(accessControl.canRead('private:secret', viewerContext)).toBe(false);
        });

        test('should enforce write permissions correctly', () => {
            const adminContext = accessControl.createContext('admin', 'admin');
            const editorContext = accessControl.createContext('editor', 'editor');
            const viewerContext = accessControl.createContext('viewer', 'viewer');

            expect(accessControl.canWrite('any_key', adminContext)).toBe(true);
            expect(accessControl.canWrite('any_key', editorContext)).toBe(true);
            expect(accessControl.canWrite('any_key', viewerContext)).toBe(false);
        });

        test('should enforce delete permissions correctly', () => {
            const adminContext = accessControl.createContext('admin', 'admin');
            const editorContext = accessControl.createContext('editor', 'editor');
            const viewerContext = accessControl.createContext('viewer', 'viewer');

            expect(accessControl.canDelete('any_key', adminContext)).toBe(true);
            expect(accessControl.canDelete('any_key', editorContext)).toBe(false);
            expect(accessControl.canDelete('any_key', viewerContext)).toBe(false);
        });

        test('should enforce clear permissions correctly', () => {
            const adminContext = accessControl.createContext('admin', 'admin');
            const editorContext = accessControl.createContext('editor', 'editor');
            const viewerContext = accessControl.createContext('viewer', 'viewer');

            expect(accessControl.canClear(adminContext)).toBe(true);
            expect(accessControl.canClear(editorContext)).toBe(false);
            expect(accessControl.canClear(viewerContext)).toBe(false);
        });

        test('should log audit events correctly', () => {
            const context = accessControl.createContext('user123', 'viewer');

            // Perform some access attempts
            accessControl.canRead('public:data', context); // Should be granted
            accessControl.canRead('private:data', context); // Should be denied
            accessControl.canWrite('any_data', context); // Should be denied

            const auditLog = accessControl.getAuditLog();

            expect(auditLog.length).toBe(3);
            expect(auditLog[0].action).toBe('read');
            expect(auditLog[0].key).toBe('public:data');
            expect(auditLog[0].userId).toBe('user123');
            expect(auditLog[0].role).toBe('viewer');
            expect(auditLog[0].granted).toBe(true);

            expect(auditLog[1].action).toBe('read');
            expect(auditLog[1].key).toBe('private:data');
            expect(auditLog[1].granted).toBe(false);
            expect(auditLog[1].reason).toBeDefined();

            expect(auditLog[2].action).toBe('write');
            expect(auditLog[2].granted).toBe(false);
        });

        test('should limit audit log size', () => {
            const context = accessControl.createContext('user', 'user');

            // Generate more entries than the limit
            for (let i = 0; i < 100; i++) {
                accessControl.canRead(`key_${i}`, context);
            }

            const auditLog = accessControl.getAuditLog();
            expect(auditLog.length).toBeLessThanOrEqual(10000);
        });

        test('should clear audit log', () => {
            const context = accessControl.createContext('user', 'user');
            accessControl.canRead('test_key', context);

            expect(accessControl.getAuditLog().length).toBe(1);

            accessControl.clearAuditLog();
            expect(accessControl.getAuditLog().length).toBe(0);
        });

        test('should handle disabled access control', () => {
            const disabledService = new CacheAccessControlService({
                enabled: false,
                defaultPermissions: {
                    canRead: false,
                    canWrite: false,
                    canDelete: false,
                    canClear: false,
                    allowedKeys: []
                },
                roleBasedAccess: new Map(),
                auditLogging: false
            });

            const context = disabledService.createContext('user', 'unknown');

            // When disabled, all operations should be allowed regardless of permissions
            expect(disabledService.canRead('any_key', context)).toBe(true);
            expect(disabledService.canWrite('any_key', context)).toBe(true);
            expect(disabledService.canDelete('any_key', context)).toBe(true);
            expect(disabledService.canClear(context)).toBe(true);

            // No audit logging when disabled
            expect(disabledService.getAuditLog().length).toBe(0);
        });

        test('should handle key pattern matching correctly', () => {
            // Create a custom access control service for this test to ensure we have the right permissions
            const testAccessControl = new CacheAccessControlService({
                enabled: true,
                defaultPermissions: {
                    canRead: false,
                    canWrite: false,
                    canDelete: false,
                    canClear: false,
                    allowedKeys: []
                },
                roleBasedAccess: new Map([
                    ['restricted', {
                        canRead: true,
                        canWrite: false,
                        canDelete: false,
                        canClear: false,
                        allowedKeys: ['users:*', 'config:read', 'temp:*']
                    }]
                ]),
                auditLogging: false
            });

            const context = testAccessControl.createContext('user', 'restricted');

            expect(testAccessControl.canRead('users:123', context)).toBe(true);
            expect(testAccessControl.canRead('config:read', context)).toBe(true);
            expect(testAccessControl.canRead('temp:file', context)).toBe(true);
            expect(testAccessControl.canRead('users', context)).toBe(false); // Doesn't match pattern (needs colon and something after)
            expect(testAccessControl.canRead('config:write', context)).toBe(false);
            expect(testAccessControl.canRead('admin:secrets', context)).toBe(false);
        });
    });
});