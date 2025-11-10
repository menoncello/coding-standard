import { DatabaseConnection } from './connection.js';
import { BackupOptions, RecoveryOptions } from '../types/database.js';
import { performanceMonitor } from '../utils/performance-monitor.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

/**
 * Database backup and recovery manager
 */
export class DatabaseRecoveryManager {
    private db: DatabaseConnection;
    private backupDir: string;
    private checksumSalt: string;

    constructor(db: DatabaseConnection, backupDir: string = './backups') {
        this.db = db;
        this.backupDir = backupDir;
        this.checksumSalt = crypto.randomBytes(32).toString('hex');

        // Ensure backup directory exists
        if (!fs.existsSync(this.backupDir)) {
            fs.mkdirSync(this.backupDir, { recursive: true });
        }
    }

    /**
     * Create database backup
     */
    async createBackup(options: Partial<BackupOptions> = {}): Promise<{
        success: boolean;
        backupPath: string;
        size: number;
        checksum: string;
        duration: number;
        error?: string;
    }> {
        const startTime = performance.now();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupName = `coding-standards-backup-${timestamp}.db`;
        const backupPath = path.join(this.backupDir, backupName);

        const defaultOptions: BackupOptions = {
            path: backupPath,
            includeWal: true,
            compress: false,
            ...options
        };

        try {
            performanceMonitor.startTimer('db_backup');

            // Ensure database is healthy before backup
            const healthCheck = await this.db.checkHealth();
            if (!healthCheck.healthy) {
                throw new Error(`Database unhealthy: ${healthCheck.integrityCheck ? 'Foreign key violations' : 'Integrity check failed'}`);
            }

            // Perform checkpoint to flush WAL to main database
            if (defaultOptions.includeWal) {
                await this.db.checkpoint('RESTART');
            }

            // Create backup using SQLite backup API
            const backupSuccessful = await this.performBackup(defaultOptions);

            if (!backupSuccessful) {
                throw new Error('SQLite backup operation failed');
            }

            // Calculate backup file size
            const stats = fs.statSync(defaultOptions.path);
            const size = stats.size;

            // Calculate checksum
            const checksum = await this.calculateFileChecksum(defaultOptions.path);

            // Compress if requested
            let finalPath = defaultOptions.path;
            if (defaultOptions.compress) {
                finalPath = await this.compressBackup(defaultOptions.path);
            }

            // Record backup metadata
            await this.recordBackupMetadata({
                backupPath: finalPath,
                originalPath: defaultOptions.path,
                backupType: defaultOptions.includeWal ? 'full' : 'incremental',
                size,
                checksum,
                timestamp: Date.now(),
                duration: performance.now() - startTime
            });

            const duration = performance.now() - startTime;
            performanceMonitor.endTimer('db_backup');
            performanceMonitor.recordMetric('db_backup_size_bytes', size);
            performanceMonitor.recordMetric('db_backup_duration_ms', duration);

            console.log(`Database backup created: ${finalPath} (${(size / 1024 / 1024).toFixed(2)}MB) in ${duration.toFixed(2)}ms`);

            return {
                success: true,
                backupPath: finalPath,
                size,
                checksum,
                duration
            };

        } catch (error) {
            const duration = performance.now() - startTime;
            performanceMonitor.endTimer('db_backup');
            console.error('Database backup failed:', error);

            return {
                success: false,
                backupPath: options.path || backupPath,
                size: 0,
                checksum: '',
                duration,
                error: String(error)
            };
        }
    }

    /**
     * Perform SQLite backup operation
     */
    private async performBackup(options: BackupOptions): Promise<boolean> {
        try {
            // For Bun SQLite, we need to copy the database file
            const dbConfig = this.db.getMetrics();
            const dbPath = (this.db as any).config?.path || './data/coding-standards.db';

            if (!fs.existsSync(dbPath)) {
                throw new Error(`Source database not found: ${dbPath}`);
            }

            // Copy main database file
            fs.copyFileSync(dbPath, options.path);

            // Copy WAL file if included
            if (options.includeWal) {
                const walPath = `${dbPath}-wal`;
                const walBackupPath = `${options.path}-wal`;

                if (fs.existsSync(walPath)) {
                    fs.copyFileSync(walPath, walBackupPath);
                }
            }

            // Copy SHM file if it exists
            const shmPath = `${dbPath}-shm`;
            const shmBackupPath = `${options.path}-shm`;

            if (fs.existsSync(shmPath)) {
                fs.copyFileSync(shmPath, shmBackupPath);
            }

            return true;

        } catch (error) {
            console.error('Backup operation failed:', error);
            return false;
        }
    }

    /**
     * Calculate file checksum
     */
    private async calculateFileChecksum(filePath: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash('sha256');
            const stream = fs.createReadStream(filePath);

            stream.on('data', (data) => hash.update(data));
            stream.on('end', () => resolve(hash.digest('hex')));
            stream.on('error', reject);
        });
    }

    /**
     * Compress backup file
     */
    private async compressBackup(filePath: string): Promise<string> {
        const compressedPath = `${filePath}.gz`;

        try {
            // Simple gzip compression
            const readStream = fs.createReadStream(filePath);
            const writeStream = fs.createWriteStream(compressedPath);
            const gzip = require('zlib').createGzip();

            return new Promise((resolve, reject) => {
                readStream
                    .pipe(gzip)
                    .pipe(writeStream)
                    .on('finish', () => {
                        // Remove uncompressed file
                        fs.unlinkSync(filePath);
                        resolve(compressedPath);
                    })
                    .on('error', reject);
            });

        } catch (error) {
            console.error('Failed to compress backup:', error);
            return filePath; // Return original path if compression fails
        }
    }

    /**
     * Record backup metadata
     */
    private async recordBackupMetadata(metadata: {
        backupPath: string;
        originalPath: string;
        backupType: string;
        size: number;
        checksum: string;
        timestamp: number;
        duration: number;
    }): Promise<void> {
        try {
            const metadataRecord = {
                id: `backup_${metadata.timestamp}_${Math.random().toString(36).substr(2, 9)}`,
                backup_path: metadata.backupPath,
                original_path: metadata.originalPath,
                backup_type: metadata.backupType,
                backup_size: metadata.size,
                checksum: metadata.checksum,
                created_at: metadata.timestamp,
                execution_time: metadata.duration,
                status: 'created'
            };

            await this.db.execute(`
                INSERT INTO backup_metadata (id, backup_path, backup_type, backup_size, created_at, checksum, status, metadata)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                metadataRecord.id,
                metadataRecord.backup_path,
                metadataRecord.backup_type,
                metadataRecord.backup_size,
                metadataRecord.created_at,
                metadataRecord.checksum,
                metadataRecord.status,
                JSON.stringify(metadataRecord)
            ]);

        } catch (error) {
            console.error('Failed to record backup metadata:', error);
        }
    }

    /**
     * Restore database from backup
     */
    async restoreFromBackup(backupPath: string, options: RecoveryOptions = {}): Promise<{
        success: boolean;
        restoredAt: string;
        duration: number;
        error?: string;
    }> {
        const startTime = performance.now();

        try {
            performanceMonitor.startTimer('db_restore');

            const defaultOptions: RecoveryOptions = {
                backupPath,
                rebuildFromScratch: false,
                validateIntegrity: true,
                maxRetries: 3,
                ...options
            };

            // Verify backup exists and is readable
            if (!fs.existsSync(backupPath)) {
                throw new Error(`Backup file not found: ${backupPath}`);
            }

            // Validate backup integrity
            if (defaultOptions.validateIntegrity) {
                const isValid = await this.validateBackupIntegrity(backupPath);
                if (!isValid) {
                    throw new Error('Backup integrity validation failed');
                }
            }

            // Close current database connection
            await this.db.close();

            // Create backup of current database before restore
            const preRestoreBackup = await this.createEmergencyBackup('pre-restore');

            // Perform restore with retries
            let restored = false;
            let lastError: Error | null = null;

            for (let attempt = 1; attempt <= defaultOptions.maxRetries && !restored; attempt++) {
                try {
                    console.log(`Restore attempt ${attempt}/${defaultOptions.maxRetries}`);
                    restored = await this.performRestore(backupPath, defaultOptions);
                } catch (error) {
                    lastError = error as Error;
                    console.error(`Restore attempt ${attempt} failed:`, error);

                    if (attempt < defaultOptions.maxRetries) {
                        // Wait before retry
                        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                    }
                }
            }

            if (!restored) {
                throw lastError || new Error('Restore failed after all retries');
            }

            // Reinitialize database connection
            await this.db.initialize();

            // Validate restored database
            if (defaultOptions.validateIntegrity) {
                const healthCheck = await this.db.checkHealth();
                if (!healthCheck.healthy) {
                    throw new Error(`Restored database failed health check: ${JSON.stringify(healthCheck)}`);
                }
            }

            const duration = performance.now() - startTime;
            const restoredAt = new Date().toISOString();

            performanceMonitor.endTimer('db_restore');
            performanceMonitor.recordMetric('db_restore_duration_ms', duration);
            performanceMonitor.recordMetric('db_restore_successful', 1);

            console.log(`Database restored successfully from ${backupPath} in ${duration.toFixed(2)}ms`);

            return {
                success: true,
                restoredAt,
                duration
            };

        } catch (error) {
            const duration = performance.now() - startTime;
            performanceMonitor.endTimer('db_restore');
            performanceMonitor.recordMetric('db_restore_failed', 1);
            console.error('Database restore failed:', error);

            return {
                success: false,
                restoredAt: new Date().toISOString(),
                duration,
                error: String(error)
            };
        }
    }

    /**
     * Validate backup integrity
     */
    private async validateBackupIntegrity(backupPath: string): Promise<boolean> {
        try {
            // Check if file is a valid SQLite database
            const tempDb = new Database(backupPath, { readonly: true });

            // Basic integrity check
            const result = tempDb.exec('PRAGMA integrity_check');

            tempDb.close();

            // SQLite integrity_check returns 'ok' if everything is fine
            return result.length === 1 && result[0].integrity_check === 'ok';

        } catch (error) {
            console.error('Backup integrity validation failed:', error);
            return false;
        }
    }

    /**
     * Perform actual restore operation
     */
    private async performRestore(backupPath: string, options: RecoveryOptions): Promise<boolean> {
        try {
            const dbConfig = (this.db as any).config?.path || './data/coding-standards.db';

            // Ensure data directory exists
            const dbDir = path.dirname(dbConfig);
            if (!fs.existsSync(dbDir)) {
                fs.mkdirSync(dbDir, { recursive: true });
            }

            // Remove existing database files
            const filesToRemove = [
                dbConfig,
                `${dbConfig}-wal`,
                `${dbConfig}-shm`
            ];

            for (const file of filesToRemove) {
                if (fs.existsSync(file)) {
                    fs.unlinkSync(file);
                }
            }

            // Copy backup to database location
            fs.copyFileSync(backupPath, dbConfig);

            // Copy WAL and SHM files if they exist
            const backupWal = `${backupPath}-wal`;
            const backupShm = `${backupPath}-shm`;

            if (fs.existsSync(backupWal)) {
                fs.copyFileSync(backupWal, `${dbConfig}-wal`);
            }

            if (fs.existsSync(backupShm)) {
                fs.copyFileSync(backupShm, `${dbConfig}-shm`);
            }

            return true;

        } catch (error) {
            console.error('Restore operation failed:', error);
            return false;
        }
    }

    /**
     * Create emergency backup
     */
    private async createEmergencyBackup(suffix: string): Promise<string | null> {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupName = `emergency-${suffix}-${timestamp}.db`;
            const backupPath = path.join(this.backupDir, backupName);

            const result = await this.createBackup({
                path: backupPath,
                includeWal: true,
                compress: false
            });

            return result.success ? backupPath : null;

        } catch (error) {
            console.error('Failed to create emergency backup:', error);
            return null;
        }
    }

    /**
     * Detect and handle database corruption
     */
    async handleCorruption(): Promise<{
        corruptionDetected: boolean;
        recoveryAttempted: boolean;
        recoverySuccessful: boolean;
        action: string;
        details: string;
    }> {
        try {
            const healthCheck = await this.db.checkHealth();

            if (healthCheck.healthy) {
                return {
                    corruptionDetected: false,
                    recoveryAttempted: false,
                    recoverySuccessful: false,
                    action: 'no_action_needed',
                    details: 'Database is healthy'
                };
            }

            console.warn('Database corruption detected:', healthCheck);

            // Create emergency backup before attempting recovery
            const emergencyBackup = await this.createEmergencyBackup('corruption-detected');

            // Attempt recovery strategies
            const recoveryStrategies = [
                { name: 'integrity_check', action: () => this.attemptIntegrityCheckRepair() },
                { name: 'checkpoint_recovery', action: () => this.attemptCheckpointRecovery() },
                { name: 'wal_rebuild', action: () => this.attemptWalRebuild() },
                { name: 'vacuum_rebuild', action: () => this.attemptVacuumRebuild() }
            ];

            for (const strategy of recoveryStrategies) {
                try {
                    console.log(`Attempting recovery strategy: ${strategy.name}`);
                    const result = await strategy.action();

                    if (result) {
                        // Verify recovery success
                        const postRecoveryCheck = await this.db.checkHealth();
                        if (postRecoveryCheck.healthy) {
                            return {
                                corruptionDetected: true,
                                recoveryAttempted: true,
                                recoverySuccessful: true,
                                action: strategy.name,
                                details: `Database recovered using ${strategy.name}. Emergency backup: ${emergencyBackup}`
                            };
                        }
                    }
                } catch (error) {
                    console.error(`Recovery strategy ${strategy.name} failed:`, error);
                }
            }

            // All recovery strategies failed, need backup restore
            const latestBackup = await this.findLatestValidBackup();

            if (latestBackup) {
                console.log('Attempting restore from latest backup:', latestBackup);
                const restoreResult = await this.restoreFromBackup(latestBackup, {
                    rebuildFromScratch: true,
                    validateIntegrity: true
                });

                if (restoreResult.success) {
                    return {
                        corruptionDetected: true,
                        recoveryAttempted: true,
                        recoverySuccessful: true,
                        action: 'backup_restore',
                        details: `Database restored from backup: ${latestBackup}. Emergency backup: ${emergencyBackup}`
                    };
                }
            }

            return {
                corruptionDetected: true,
                recoveryAttempted: true,
                recoverySuccessful: false,
                action: 'rebuild_required',
                details: `All recovery attempts failed. Manual intervention required. Emergency backup: ${emergencyBackup}`
            };

        } catch (error) {
            console.error('Corruption handling failed:', error);
            return {
                corruptionDetected: true,
                recoveryAttempted: false,
                recoverySuccessful: false,
                action: 'error',
                details: `Corruption handling failed: ${error}`
            };
        }
    }

    /**
     * Attempt integrity check repair
     */
    private async attemptIntegrityCheckRepair(): Promise<boolean> {
        try {
            const result = await this.db.execute('PRAGMA integrity_check');
            return result.length === 1 && result[0].integrity_check === 'ok';
        } catch (error) {
            console.error('Integrity check repair failed:', error);
            return false;
        }
    }

    /**
     * Attempt checkpoint recovery
     */
    private async attemptCheckpointRecovery(): Promise<boolean> {
        try {
            await this.db.checkpoint('RESTART');
            const healthCheck = await this.db.checkHealth();
            return healthCheck.healthy;
        } catch (error) {
            console.error('Checkpoint recovery failed:', error);
            return false;
        }
    }

    /**
     * Attempt WAL rebuild
     */
    private async attemptWalRebuild(): Promise<boolean> {
        try {
            // Force WAL checkpoint and rebuild
            await this.db.execute('PRAGMA wal_checkpoint(TRUNCATE)');
            await this.db.checkpoint('RESTART');

            const healthCheck = await this.db.checkHealth();
            return healthCheck.healthy;
        } catch (error) {
            console.error('WAL rebuild failed:', error);
            return false;
        }
    }

    /**
     * Attempt vacuum rebuild
     */
    private async attemptVacuumRebuild(): Promise<boolean> {
        try {
            await this.db.execute('VACUUM');
            const healthCheck = await this.db.checkHealth();
            return healthCheck.healthy;
        } catch (error) {
            console.error('Vacuum rebuild failed:', error);
            return false;
        }
    }

    /**
     * Find latest valid backup
     */
    private async findLatestValidBackup(): Promise<string | null> {
        try {
            const result = await this.db.execute(`
                SELECT backup_path
                FROM backup_metadata
                WHERE status = 'created'
                ORDER BY created_at DESC
                LIMIT 1
            `);

            if (result.length > 0) {
                const backupPath = result[0].backup_path;
                if (fs.existsSync(backupPath)) {
                    return backupPath;
                }
            }

            // Fallback to file system search
            const backupFiles = fs.readdirSync(this.backupDir)
                .filter(file => file.endsWith('.db') && !file.includes('.gz'))
                .map(file => path.join(this.backupDir, file))
                .sort((a, b) => fs.statSync(b).mtime.getTime() - fs.statSync(a).mtime.getTime());

            for (const backupFile of backupFiles) {
                if (await this.validateBackupIntegrity(backupFile)) {
                    return backupFile;
                }
            }

            return null;

        } catch (error) {
            console.error('Failed to find latest backup:', error);
            return null;
        }
    }

    /**
     * List available backups
     */
    async listBackups(): Promise<Array<{
        path: string;
        size: number;
        created: Date;
        type: string;
        checksum?: string;
    }>> {
        try {
            const backups: Array<{
                path: string;
                size: number;
                created: Date;
                type: string;
                checksum?: string;
            }> = [];

            // Get metadata from database
            const metadataResults = await this.db.execute(`
                SELECT backup_path, backup_size, created_at, backup_type, checksum
                FROM backup_metadata
                WHERE status = 'created'
                ORDER BY created_at DESC
            `);

            for (const row of metadataResults) {
                if (fs.existsSync(row.backup_path)) {
                    backups.push({
                        path: row.backup_path,
                        size: row.backup_size,
                        created: new Date(row.created_at),
                        type: row.backup_type,
                        checksum: row.checksum
                    });
                }
            }

            // Also include backup files that exist but aren't in metadata
            const backupFiles = fs.readdirSync(this.backupDir)
                .filter(file => file.endsWith('.db') || file.endsWith('.db.gz'))
                .map(file => path.join(this.backupDir, file));

            for (const backupFile of backupFiles) {
                if (!backups.find(b => b.path === backupFile)) {
                    const stats = fs.statSync(backupFile);
                    backups.push({
                        path: backupFile,
                        size: stats.size,
                        created: stats.mtime,
                        type: backupFile.includes('incremental') ? 'incremental' : 'full'
                    });
                }
            }

            return backups.sort((a, b) => b.created.getTime() - a.created.getTime());

        } catch (error) {
            console.error('Failed to list backups:', error);
            return [];
        }
    }

    /**
     * Cleanup old backups
     */
    async cleanupOldBackups(maxAge: number = 30 * 24 * 60 * 60 * 1000, maxCount: number = 10): Promise<{
        deleted: number;
        freedSpace: number;
    }> {
        try {
            const backups = await this.listBackups();
            const now = Date.now();
            let deleted = 0;
            let freedSpace = 0;

            // Delete backups older than maxAge
            for (const backup of backups) {
                if (now - backup.created.getTime() > maxAge) {
                    try {
                        fs.unlinkSync(backup.path);
                        deleted++;
                        freedSpace += backup.size;

                        // Also delete WAL and SHM files if they exist
                        const walPath = `${backup.path}-wal`;
                        const shmPath = `${backup.path}-shm`;

                        if (fs.existsSync(walPath)) {
                            fs.unlinkSync(walPath);
                            freedSpace += fs.statSync(walPath).size;
                        }

                        if (fs.existsSync(shmPath)) {
                            fs.unlinkSync(shmPath);
                            freedSpace += fs.statSync(shmPath).size;
                        }

                        console.log(`Deleted old backup: ${backup.path}`);

                    } catch (error) {
                        console.error(`Failed to delete backup ${backup.path}:`, error);
                    }
                }
            }

            // Keep only the most recent maxCount backups
            const remainingBackups = await this.listBackups();
            if (remainingBackups.length > maxCount) {
                const toDelete = remainingBackups.slice(maxCount);

                for (const backup of toDelete) {
                    try {
                        fs.unlinkSync(backup.path);
                        deleted++;
                        freedSpace += backup.size;

                        const walPath = `${backup.path}-wal`;
                        const shmPath = `${backup.path}-shm`;

                        if (fs.existsSync(walPath)) {
                            fs.unlinkSync(walPath);
                            freedSpace += fs.statSync(walPath).size;
                        }

                        if (fs.existsSync(shmPath)) {
                            fs.unlinkSync(shmPath);
                            freedSpace += fs.statSync(shmPath).size;
                        }

                        console.log(`Deleted excess backup: ${backup.path}`);

                    } catch (error) {
                        console.error(`Failed to delete backup ${backup.path}:`, error);
                    }
                }
            }

            performanceMonitor.recordMetric('db_backups_cleaned', deleted);
            performanceMonitor.recordMetric('db_backup_space_freed', freedSpace);

            console.log(`Backup cleanup completed: ${deleted} files deleted, ${(freedSpace / 1024 / 1024).toFixed(2)}MB freed`);

            return { deleted, freedSpace };

        } catch (error) {
            console.error('Backup cleanup failed:', error);
            return { deleted: 0, freedSpace: 0 };
        }
    }

    /**
     * Setup automatic backup schedule
     */
    setupAutoBackup(intervalMs: number = 24 * 60 * 60 * 1000): void {
        setInterval(async () => {
            try {
                console.log('Starting automatic backup...');
                const result = await this.createBackup({
                    compress: true,
                    includeWal: true
                });

                if (result.success) {
                    console.log(`Automatic backup completed: ${result.backupPath}`);
                } else {
                    console.error('Automatic backup failed:', result.error);
                }

                // Cleanup old backups after successful backup
                if (result.success) {
                    await this.cleanupOldBackups();
                }

            } catch (error) {
                console.error('Automatic backup failed:', error);
            }
        }, intervalMs);

        console.log(`Automatic backup scheduled every ${intervalMs / 1000 / 60 / 60} hours`);
    }
}