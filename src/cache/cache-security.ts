import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'crypto';

/**
 * Cache encryption configuration
 */
export interface CacheEncryptionConfig {
    enabled: boolean;
    algorithm: string; // Encryption algorithm (e.g., 'aes-256-gcm')
    keyRotationInterval: number; // Time interval in milliseconds for key rotation
    sensitiveDataPatterns: RegExp[]; // Patterns to identify sensitive data
}

/**
 * Access control configuration
 */
export interface AccessControlConfig {
    enabled: boolean;
    defaultPermissions: CachePermissions;
    roleBasedAccess: Map<string, CachePermissions>;
    auditLogging: boolean;
}

/**
 * Cache permissions
 */
export interface CachePermissions {
    canRead: boolean;
    canWrite: boolean;
    canDelete: boolean;
    canClear: boolean;
    allowedKeys: string[]; // Specific cache keys this role can access (empty = all)
}

/**
 * Cache access context
 */
export interface CacheAccessContext {
    userId?: string;
    sessionId?: string;
    role: string;
    permissions: CachePermissions;
    timestamp: number;
}

/**
 * Encrypted cache entry
 */
export interface EncryptedCacheEntry<T = any> {
    data: {
        encrypted: string;
        iv: string;
        tag: string;
        metadata?: Record<string, any>;
    };
    timestamp: number;
    expiresAt: number;
    hits: number;
    encrypted: boolean; // Flag to identify encrypted entries
    accessControl?: {
        createdBy?: string;
        allowedRoles?: string[];
        permissions?: CachePermissions;
    };
}

/**
 * Encryption key manager with rotation support
 */
export class EncryptionKeyManager {
    private currentKey: Buffer;
    private previousKeys: Buffer[] = [];
    private keyRotationTimer?: Timer;
    private config: CacheEncryptionConfig;

    constructor(config: CacheEncryptionConfig) {
        this.config = config;
        this.currentKey = this.generateKey();

        // Set up key rotation
        if (config.keyRotationInterval > 0) {
            this.scheduleKeyRotation();
        }
    }

    /**
     * Generate a new encryption key
     */
    private generateKey(): Buffer {
        return randomBytes(32); // 256 bits for AES-256
    }

    /**
     * Schedule next key rotation
     */
    private scheduleKeyRotation(): void {
        if (this.keyRotationTimer) {
            clearTimeout(this.keyRotationTimer);
        }

        this.keyRotationTimer = setTimeout(() => {
            this.rotateKey();
        }, this.config.keyRotationInterval);
    }

    /**
     * Rotate encryption key
     */
    private rotateKey(): void {
        // Move current key to previous keys
        this.previousKeys.push(this.currentKey);

        // Keep only last 3 keys for decryption during rotation period
        if (this.previousKeys.length > 3) {
            this.previousKeys.shift();
        }

        // Generate new key
        this.currentKey = this.generateKey();

        // Schedule next rotation
        this.scheduleKeyRotation();
    }

    /**
     * Get current encryption key
     */
    getCurrentKey(): Buffer {
        return this.currentKey;
    }

    /**
     * Get all keys for decryption (current + previous)
     */
    getDecryptionKeys(): Buffer[] {
        return [this.currentKey, ...this.previousKeys];
    }

    /**
     * Destroy all keys (cleanup)
     */
    destroy(): void {
        if (this.keyRotationTimer) {
            clearTimeout(this.keyRotationTimer);
        }

        // Clear keys from memory
        this.currentKey.fill(0);
        this.previousKeys.forEach(key => key.fill(0));
        this.previousKeys = [];
    }
}

/**
 * Cache encryption service
 */
export class CacheEncryptionService {
    private keyManager: EncryptionKeyManager;
    private config: CacheEncryptionConfig;

    constructor(config: CacheEncryptionConfig) {
        this.config = config;
        this.keyManager = new EncryptionKeyManager(config);
    }

    /**
     * Check if data should be encrypted based on patterns
     */
    private shouldEncrypt<T>(key: string, data: T): boolean {
        if (!this.config.enabled) return false;

        const dataString = JSON.stringify(data).toLowerCase();
        const keyString = key.toLowerCase();

        // Check against sensitive data patterns
        for (const pattern of this.config.sensitiveDataPatterns) {
            if (pattern.test(dataString) || pattern.test(keyString)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Encrypt data
     */
    encrypt<T>(key: string, data: T, context?: CacheAccessContext): EncryptedCacheEntry<T> | T {
        if (!this.shouldEncrypt(key, data)) {
            return data;
        }

        try {
            const dataString = JSON.stringify(data);
            const iv = randomBytes(16); // Initialization vector
            const encryptionKey = this.keyManager.getCurrentKey();

            const cipher = createCipheriv(this.config.algorithm, encryptionKey, iv);

            let encrypted = cipher.update(dataString, 'utf8', 'hex');
            encrypted += cipher.final('hex');

            const tag = cipher.getAuthTag();

            const entry: EncryptedCacheEntry<T> = {
                data: {
                    encrypted,
                    iv: iv.toString('hex'),
                    tag: tag.toString('hex'),
                    metadata: {
                        algorithm: this.config.algorithm,
                        keyId: this.createKeyId(encryptionKey)
                    }
                },
                timestamp: Date.now(),
                expiresAt: 0, // Will be set by cache manager
                hits: 0,
                encrypted: true
            };

            // Add access control information if provided
            if (context) {
                entry.accessControl = {
                    createdBy: context.userId,
                    allowedRoles: [context.role],
                    permissions: context.permissions
                };
            }

            return entry;
        } catch (error) {
            console.error('Encryption failed:', error);
            // Fail safe - return unencrypted data
            return data;
        }
    }

    /**
     * Decrypt data
     */
    decrypt<T>(entry: EncryptedCacheEntry<T> | T, context?: CacheAccessContext): T {
        if (!this.isEncrypted(entry)) {
            return entry as T;
        }

        try {
            const encryptedEntry = entry as EncryptedCacheEntry<T>;

            // Validate access permissions
            if (context && encryptedEntry.accessControl) {
                this.validateAccess(context, encryptedEntry.accessControl);
            }

            const encryptionData = encryptedEntry.data;
            const iv = Buffer.from(encryptionData.iv, 'hex');
            const tag = Buffer.from(encryptionData.tag, 'hex');

            // Try decryption with current key first, then previous keys
            const keys = this.keyManager.getDecryptionKeys();

            for (const key of keys) {
                try {
                    const decipher = createDecipheriv(this.config.algorithm, key, iv);
                    decipher.setAuthTag(tag);

                    let decrypted = decipher.update(encryptionData.encrypted, 'hex', 'utf8');
                    decrypted += decipher.final('utf8');

                    return JSON.parse(decrypted) as T;
                } catch (error) {
                    // Try next key
                    continue;
                }
            }

            throw new Error('Unable to decrypt with any available key');
        } catch (error) {
            console.error('Decryption failed:', error);
            throw new Error(`Cache decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Check if entry is encrypted
     */
    private isEncrypted<T>(entry: EncryptedCacheEntry<T> | T): entry is EncryptedCacheEntry<T> {
        return typeof entry === 'object' && entry !== null && 'encrypted' in entry && entry.encrypted === true;
    }

    /**
     * Validate access permissions
     */
    private validateAccess(context: CacheAccessContext, accessControl: EncryptedCacheEntry['accessControl']): void {
        if (!accessControl) return;

        // Check role-based access - allow if no roles specified or user's role is allowed
        if (accessControl.allowedRoles && accessControl.allowedRoles.length > 0) {
            if (!accessControl.allowedRoles.includes(context.role)) {
                throw new Error(`Access denied: role '${context.role}' not allowed`);
            }
        }

        // Check specific permissions
        if (accessControl.permissions) {
            const permissions = accessControl.permissions;

            // For now, we'll focus on read permissions (can be extended for write/delete)
            if (!permissions.canRead) {
                throw new Error('Access denied: read permission not granted');
            }
        }
    }

    /**
     * Create key identifier for tracking
     */
    private createKeyId(key: Buffer): string {
        return createHash('sha256').update(key).digest('hex').substring(0, 8);
    }

    /**
     * Get encryption status
     */
    getStatus(): {
        enabled: boolean;
        algorithm: string;
        keyRotationEnabled: boolean;
        activeKeys: number;
    } {
        return {
            enabled: this.config.enabled,
            algorithm: this.config.algorithm,
            keyRotationEnabled: this.config.keyRotationInterval > 0,
            activeKeys: this.keyManager.getDecryptionKeys().length
        };
    }

    /**
     * Cleanup resources
     */
    destroy(): void {
        this.keyManager.destroy();
    }
}

/**
 * Access control service
 */
export class CacheAccessControlService {
    private config: AccessControlConfig;
    private auditLog: Array<{
        action: string;
        key: string;
        userId?: string;
        role: string;
        timestamp: number;
        granted: boolean;
        reason?: string;
    }> = [];

    constructor(config: AccessControlConfig) {
        this.config = config;
    }

    /**
     * Create access context from request
     */
    createContext(userId?: string, role: string = 'default'): CacheAccessContext {
        const permissions = this.getPermissionsForRole(role);

        return {
            userId,
            sessionId: this.generateSessionId(),
            role,
            permissions,
            timestamp: Date.now()
        };
    }

    /**
     * Get permissions for a role
     */
    private getPermissionsForRole(role: string): CachePermissions {
        if (this.config.roleBasedAccess.has(role)) {
            return this.config.roleBasedAccess.get(role)!;
        }

        return this.config.defaultPermissions;
    }

    /**
     * Generate session ID
     */
    private generateSessionId(): string {
        return randomBytes(16).toString('hex');
    }

    /**
     * Check read access
     */
    canRead(key: string, context: CacheAccessContext): boolean {
        return this.checkAccess('read', key, context);
    }

    /**
     * Check write access
     */
    canWrite(key: string, context: CacheAccessContext): boolean {
        return this.checkAccess('write', key, context);
    }

    /**
     * Check delete access
     */
    canDelete(key: string, context: CacheAccessContext): boolean {
        return this.checkAccess('delete', key, context);
    }

    /**
     * Check clear access
     */
    canClear(context: CacheAccessContext): boolean {
        const granted = !this.config.enabled || context.permissions.canClear;

        this.logAudit({
            action: 'clear',
            key: '*',
            userId: context.userId,
            role: context.role,
            timestamp: Date.now(),
            granted
        });

        return granted;
    }

    /**
     * Generic access checker
     */
    private checkAccess(action: 'read' | 'write' | 'delete', key: string, context: CacheAccessContext): boolean {
        if (!this.config.enabled) {
            return true; // Access control disabled
        }

        const permissions = context.permissions;
        let granted = false;
        let reason: string | undefined;

        // Check specific key permissions
        if (permissions.allowedKeys.length > 0) {
            const keyMatches = permissions.allowedKeys.some(pattern => {
                // Convert wildcard pattern to regex
                const regexPattern = pattern.replace(/\*/g, '.*');
                return new RegExp(`^${regexPattern}$`).test(key);
            });

            if (!keyMatches) {
                reason = `Key '${key}' not in allowed patterns`;
            }
        }

        // Check action permissions
        if (!reason) {
            switch (action) {
                case 'read':
                    granted = permissions.canRead;
                    if (!granted) reason = 'Read permission not granted';
                    break;
                case 'write':
                    granted = permissions.canWrite;
                    if (!granted) reason = 'Write permission not granted';
                    break;
                case 'delete':
                    granted = permissions.canDelete;
                    if (!granted) reason = 'Delete permission not granted';
                    break;
            }
        }

        this.logAudit({
            action,
            key,
            userId: context.userId,
            role: context.role,
            timestamp: Date.now(),
            granted,
            reason
        });

        return granted;
    }

    /**
     * Log audit event
     */
    private logAudit(event: {
        action: string;
        key: string;
        userId?: string;
        role: string;
        timestamp: number;
        granted: boolean;
        reason?: string;
    }): void {
        if (!this.config.auditLogging) return;

        this.auditLog.push(event);

        // Keep only last 10000 entries to prevent memory issues
        if (this.auditLog.length > 10000) {
            this.auditLog = this.auditLog.slice(-5000);
        }
    }

    /**
     * Get audit log
     */
    getAuditLog(limit?: number): Array<{
        action: string;
        key: string;
        userId?: string;
        role: string;
        timestamp: number;
        granted: boolean;
        reason?: string;
    }> {
        if (limit) {
            return this.auditLog.slice(-limit);
        }
        return [...this.auditLog];
    }

    /**
     * Clear audit log
     */
    clearAuditLog(): void {
        this.auditLog = [];
    }
}

/**
 * Default configurations
 */
export const DEFAULT_ENCRYPTION_CONFIG: CacheEncryptionConfig = {
    enabled: true,
    algorithm: 'aes-256-gcm',
    keyRotationInterval: 24 * 60 * 60 * 1000, // 24 hours
    sensitiveDataPatterns: [
        /password/i,
        /token/i,
        /secret/i,
        /key/i,
        /credential/i,
        /auth/i,
        /session/i,
        /user.*data/i,
        /personal.*information/i,
        /pii/i
    ]
};

export const DEFAULT_ACCESS_CONTROL_CONFIG: AccessControlConfig = {
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
            allowedKeys: []
        }],
        ['service', {
            canRead: true,
            canWrite: true,
            canDelete: true,
            canClear: false,
            allowedKeys: []
        }]
    ]),
    auditLogging: true
};