import { FileWatcherService, FileChange } from './file-watcher.js';
import { HotReloadManager, HotReloadResult } from '../standards/hot-reload-manager.js';
import { CacheInvalidationService } from './cache-invalidator.js';
import { Logger, LoggerFactory } from './logger/logger-factory.js';
import { performanceMonitor } from './performance-monitor.js';

/**
 * Hot reload orchestrator configuration
 */
export interface HotReloadOrchestratorConfig {
    enabled: boolean;
    autoStart: boolean;
    maxConcurrentOperations: number;
    operationQueueSize: number;
    retryAttempts: number;
    retryDelayMs: number;
    healthCheckIntervalMs: number;
    auditLogEnabled: boolean;
    performanceTracking: boolean;
}

/**
 * Operation status
 */
export interface OperationStatus {
    id: string;
    type: 'file_watch' | 'hot_reload' | 'cache_invalidation';
    status: 'pending' | 'running' | 'completed' | 'failed';
    startTime: number;
    endTime?: number;
    duration?: number;
    filesProcessed?: number;
    errors: string[];
    warnings: string[];
}

/**
 * Health check result
 */
export interface HealthCheckResult {
    isHealthy: boolean;
    fileWatcherHealthy: boolean;
    hotReloadManagerHealthy: boolean;
    cacheInvalidatorHealthy: boolean;
    memoryUsage: number;
    activeOperations: number;
    queuedOperations: number;
    uptime: number;
    lastActivity: number;
}

/**
 * Orchestrator statistics
 */
export interface OrchestratorStats {
    startTime: number;
    uptime: number;
    totalOperations: number;
    successfulOperations: number;
    failedOperations: number;
    filesProcessed: number;
    averageOperationTime: number;
    lastOperationTime: number;
    healthCheck: HealthCheckResult;
}

/**
 * Hot reload orchestrator for coordinating operations
 */
export class HotReloadOrchestrator {
    private fileWatcher: FileWatcherService;
    private hotReloadManager: HotReloadManager;
    private cacheInvalidator: CacheInvalidationService;
    private config: HotReloadOrchestratorConfig;
    private logger: Logger;

    private isRunning = false;
    private startTime = 0;
    private operations: Map<string, OperationStatus> = new Map();
    private operationQueue: FileChange[] = [];
    private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
    private lastActivity = 0;
    private destroyRequested = false;

    constructor(
        fileWatcher: FileWatcherService,
        hotReloadManager: HotReloadManager,
        cacheInvalidator: CacheInvalidationService,
        config: Partial<HotReloadOrchestratorConfig> = {}
    ) {
        this.fileWatcher = fileWatcher;
        this.hotReloadManager = hotReloadManager;
        this.cacheInvalidator = cacheInvalidator;
        this.logger = LoggerFactory.getInstance();

        this.config = {
            enabled: true,
            autoStart: true,
            maxConcurrentOperations: 3,
            operationQueueSize: 100,
            retryAttempts: 3,
            retryDelayMs: 1000,
            healthCheckIntervalMs: 30000, // 30 seconds
            auditLogEnabled: true,
            performanceTracking: true,
            ...config
        };
    }

    /**
     * Start the orchestrator
     */
    async start(): Promise<void> {
        if (this.isRunning) {
            this.logger.warn('HotReloadOrchestrator is already running');
            return;
        }

        if (!this.config.enabled) {
            this.logger.info('HotReloadOrchestrator is disabled');
            return;
        }

        if (this.destroyRequested) {
            throw new Error('Cannot start destroyed HotReloadOrchestrator');
        }

        try {
            this.startTime = Date.now();
            this.lastActivity = this.startTime;

            this.logger.info('Starting HotReloadOrchestrator');

            // Start file watcher
            await this.fileWatcher.start();

            // Set up file change handler
            this.fileWatcher.onChange(this.handleFileChange.bind(this));

            // Start health check timer
            this.startHealthCheckTimer();

            this.isRunning = true;

            this.logger.info('HotReloadOrchestrator started successfully', {
                config: this.config,
                startTime: this.startTime
            });

            performanceMonitor.recordMetricSimple('orchestrator_started', 0, {
                enabled: this.config.enabled,
                autoStart: this.config.autoStart
            });

        } catch (error) {
            this.logger.error('Failed to start HotReloadOrchestrator', { error });
            throw error;
        }
    }

    /**
     * Stop the orchestrator
     */
    async stop(): Promise<void> {
        if (!this.isRunning) {
            return;
        }

        this.logger.info('Stopping HotReloadOrchestrator');

        // Stop health check timer
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = null;
        }

        // Wait for ongoing operations to complete or timeout
        await this.waitForOperationsCompletion(5000);

        // Stop file watcher
        await this.fileWatcher.stop();

        this.isRunning = false;

        this.logger.info('HotReloadOrchestrator stopped', {
            uptime: this.getUptime(),
            operationsCompleted: this.operations.size
        });

        performanceMonitor.recordMetricSimple('orchestrator_stopped', this.getUptime(), {
            operationsCompleted: this.operations.size
        });
    }

    /**
     * Destroy the orchestrator and clean up resources
     */
    async destroy(): Promise<void> {
        this.destroyRequested = true;
        await this.stop();

        // Clear operations
        this.operations.clear();
        this.operationQueue = [];

        // Destroy components
        await this.fileWatcher.destroy();

        this.logger.info('HotReloadOrchestrator destroyed');
    }

    /**
     * Process manual file changes (for testing or external triggers)
     */
    async processManualChanges(changes: FileChange[]): Promise<HotReloadResult> {
        if (!this.isRunning) {
            throw new Error('Orchestrator is not running');
        }

        return await this.processFileChanges(changes, 'manual');
    }

    /**
     * Get orchestrator statistics
     */
    getStats(): OrchestratorStats {
        const healthCheck = this.performHealthCheck();
        const completedOperations = Array.from(this.operations.values())
            .filter(op => op.status === 'completed' || op.status === 'failed');

        const totalOperations = this.operations.size;
        const successfulOperations = completedOperations
            .filter(op => op.status === 'completed').length;
        const failedOperations = completedOperations
            .filter(op => op.status === 'failed').length;

        const averageOperationTime = completedOperations.length > 0
            ? completedOperations.reduce((sum, op) => sum + (op.duration || 0), 0) / completedOperations.length
            : 0;

        return {
            startTime: this.startTime,
            uptime: this.getUptime(),
            totalOperations,
            successfulOperations,
            failedOperations,
            filesProcessed: completedOperations.reduce((sum, op) => sum + (op.filesProcessed || 0), 0),
            averageOperationTime,
            lastOperationTime: this.lastActivity,
            healthCheck
        };
    }

    /**
     * Get current operations
     */
    getOperations(): OperationStatus[] {
        return Array.from(this.operations.values())
            .sort((a, b) => b.startTime - a.startTime);
    }

    /**
     * Check if orchestrator is healthy
     */
    isHealthy(): boolean {
        return this.performHealthCheck().isHealthy;
    }

    /**
     * Update configuration
     */
    updateConfig(config: Partial<HotReloadOrchestratorConfig>): void {
        const oldConfig = { ...this.config };
        this.config = { ...this.config, ...config };

        this.logger.info('Orchestrator configuration updated', {
            oldConfig,
            newConfig: this.config
        });

        // Restart health check timer if interval changed
        if (this.isRunning &&
            oldConfig.healthCheckIntervalMs !== this.config.healthCheckIntervalMs) {
            this.startHealthCheckTimer();
        }
    }

    /**
     * Handle file change from file watcher
     */
    private async handleFileChange(change: FileChange): Promise<void> {
        try {
            this.lastActivity = Date.now();

            if (this.config.auditLogEnabled) {
                this.logger.info('File change detected', {
                    type: change.type,
                    path: change.path,
                    timestamp: change.timestamp
                });
            }

            // Add to operation queue
            this.operationQueue.push(change);

            // Limit queue size
            if (this.operationQueue.length > this.config.operationQueueSize) {
                this.operationQueue.shift(); // Remove oldest
                this.logger.warn('Operation queue overflow, dropping oldest changes');
            }

            // Process queued changes
            setImmediate(() => this.processQueuedChanges());

        } catch (error) {
            this.logger.error('Error handling file change', { error, change });
        }
    }

    /**
     * Process queued file changes
     */
    private async processQueuedChanges(): Promise<void> {
        if (this.operationQueue.length === 0) {
            return;
        }

        const activeOperations = Array.from(this.operations.values())
            .filter(op => op.status === 'running').length;

        if (activeOperations >= this.config.maxConcurrentOperations) {
            return; // Wait for current operations to complete
        }

        // Take a batch of changes to process
        const batchSize = Math.min(
            this.operationQueue.length,
            this.config.maxConcurrentOperations - activeOperations
        );

        const changes = this.operationQueue.splice(0, batchSize);

        await this.processFileChanges(changes, 'queued');
    }

    /**
     * Process file changes with retry logic
     */
    private async processFileChanges(
        changes: FileChange[],
        source: 'queued' | 'manual'
    ): Promise<HotReloadResult> {
        const operationId = this.generateOperationId();
        const startTime = Date.now();

        const operation: OperationStatus = {
            id: operationId,
            type: 'hot_reload',
            status: 'running',
            startTime,
            errors: [],
            warnings: []
        };

        this.operations.set(operationId, operation);

        try {
            this.logger.debug(`Processing ${changes.length} file changes`, {
                operationId,
                source,
                changes: changes.map(c => `${c.type}:${c.path}`)
            });

            let result: HotReloadResult;
            let attempt = 0;

            // Retry logic
            while (attempt <= this.config.retryAttempts) {
                try {
                    result = await this.hotReloadManager.processChanges(changes);
                    break;
                } catch (error) {
                    attempt++;
                    if (attempt <= this.config.retryAttempts) {
                        this.logger.warn(`Hot reload attempt ${attempt} failed, retrying...`, {
                            operationId,
                            error: error instanceof Error ? error.message : String(error)
                        });

                        // Wait before retry
                        await new Promise(resolve => setTimeout(resolve, this.config.retryDelayMs));
                    } else {
                        throw error;
                    }
                }
            }

            if (!result) {
                throw new Error('Hot reload processing failed after all retries');
            }

            // Update operation status
            operation.status = result.success ? 'completed' : 'failed';
            operation.endTime = Date.now();
            operation.duration = operation.endTime - startTime;
            operation.filesProcessed = result.processedFiles.length;
            operation.errors.push(...result.errors);
            operation.warnings.push(...result.warnings);

            // Invalidate cache if successful
            if (result.success) {
                await this.invalidateCacheForChanges(result);
            }

            // Log operation completion
            if (this.config.auditLogEnabled) {
                this.logger.info(`Hot reload operation ${operationId} completed`, {
                    status: operation.status,
                    duration: operation.duration,
                    filesProcessed: operation.filesProcessed,
                    errors: operation.errors.length,
                    warnings: operation.warnings.length
                });
            }

            // Record performance metrics
            if (this.config.performanceTracking) {
                performanceMonitor.recordMetricSimple('orchestrator_operation', operation.duration!, {
                    operationId,
                    success: result.success,
                    filesProcessed: result.processedFiles.length,
                    source
                });
            }

            return result;

        } catch (error) {
            // Update operation status with error
            operation.status = 'failed';
            operation.endTime = Date.now();
            operation.duration = operation.endTime - startTime;
            operation.errors.push(error instanceof Error ? error.message : 'Unknown error');

            this.logger.error(`Hot reload operation ${operationId} failed`, {
                error,
                duration: operation.duration,
                filesProcessed: changes.length
            });

            // Return failed result
            return {
                success: false,
                processedFiles: [],
                errors: [error instanceof Error ? error.message : 'Unknown error'],
                warnings: [],
                addedRules: [],
                updatedRules: [],
                removedRules: [],
                duration: operation.duration
            };

        } finally {
            // Clean up old operations
            this.cleanupOldOperations();
        }
    }

    /**
     * Invalidate cache for processed changes
     */
    private async invalidateCacheForChanges(result: HotReloadResult): Promise<void> {
        try {
            const allAffectedRules = [
                ...result.addedRules,
                ...result.updatedRules,
                ...result.removedRules
            ];

            if (allAffectedRules.length > 0) {
                await this.cacheInvalidator.invalidateSelective(
                    allAffectedRules,
                    result.addedRules.map(id => `rule-${id}`) // Generate semantic names
                );

                this.logger.debug('Cache invalidated for processed changes', {
                    ruleCount: allAffectedRules.length
                });
            }
        } catch (error) {
            this.logger.warn('Cache invalidation failed', { error });
        }
    }

    /**
     * Start health check timer
     */
    private startHealthCheckTimer(): void {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
        }

        this.healthCheckTimer = setInterval(() => {
            if (this.isRunning && !this.destroyRequested) {
                this.performHealthCheck();
            }
        }, this.config.healthCheckIntervalMs);
    }

    /**
     * Perform health check
     */
    private performHealthCheck(): HealthCheckResult {
        const now = Date.now();

        const fileWatcherStats = this.fileWatcher.getStats();
        const hotReloadStats = this.hotReloadManager.getStats();
        const cacheMetrics = this.cacheInvalidator.getMetrics();

        const activeOperations = Array.from(this.operations.values())
            .filter(op => op.status === 'running').length;

        const isHealthy =
            fileWatcherStats.isWatching &&
            hotReloadStats.isHealthy &&
            this.cacheInvalidator.isPerformant() &&
            activeOperations < this.config.maxConcurrentOperations &&
            this.operationQueue.length < this.config.operationQueueSize;

        const result: HealthCheckResult = {
            isHealthy,
            fileWatcherHealthy: fileWatcherStats.isWatching,
            hotReloadManagerHealthy: hotReloadStats.isHealthy,
            cacheInvalidatorHealthy: this.cacheInvalidator.isPerformant(),
            memoryUsage: process.memoryUsage().heapUsed,
            activeOperations,
            queuedOperations: this.operationQueue.length,
            uptime: this.getUptime(),
            lastActivity: this.lastActivity
        };

        // Log health status if unhealthy
        if (!isHealthy) {
            this.logger.warn('Health check failed', {
                healthCheck: result,
                fileWatcherStats,
                hotReloadStats
            });
        }

        return result;
    }

    /**
     * Wait for operations to complete
     */
    private async waitForOperationsCompletion(timeoutMs: number): Promise<void> {
        const startTime = Date.now();

        while (Date.now() - startTime < timeoutMs) {
            const activeOperations = Array.from(this.operations.values())
                .filter(op => op.status === 'running').length;

            if (activeOperations === 0) {
                return;
            }

            await new Promise(resolve => setTimeout(resolve, 100));
        }

        const activeOperations = Array.from(this.operations.values())
            .filter(op => op.status === 'running').length;

        if (activeOperations > 0) {
            this.logger.warn(`Timeout waiting for ${activeOperations} operations to complete`);
        }
    }

    /**
     * Clean up old operations
     */
    private cleanupOldOperations(): void {
        const maxAge = 5 * 60 * 1000; // 5 minutes
        const now = Date.now();
        const toDelete: string[] = [];

        for (const [id, operation] of this.operations.entries()) {
            if (operation.status === 'completed' || operation.status === 'failed') {
                if (now - (operation.endTime || operation.startTime) > maxAge) {
                    toDelete.push(id);
                }
            }
        }

        for (const id of toDelete) {
            this.operations.delete(id);
        }
    }

    /**
     * Get uptime in milliseconds
     */
    private getUptime(): number {
        return this.startTime > 0 ? Date.now() - this.startTime : 0;
    }

    /**
     * Generate unique operation ID
     */
    private generateOperationId(): string {
        return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}