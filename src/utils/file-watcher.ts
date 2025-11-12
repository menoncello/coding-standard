import { Logger, LoggerFactory } from './logger/logger-factory.js';
import { performanceMonitor } from './performance-monitor.js';
import { watch, FSWatcher } from 'fs';
import { join, resolve } from 'path';

/**
 * File change event types
 */
export type FileChangeEvent = 'create' | 'update' | 'delete';

/**
 * File change information
 */
export interface FileChange {
    path: string;
    type: FileChangeEvent;
    timestamp: number;
    size?: number;
}

/**
 * File watcher configuration
 */
export interface FileWatcherConfig {
    watchPaths: string[];
    debounceMs: number;
    throttleMs: number;
    maxDepth: number;
    fileExtensions: string[];
    ignoredPaths: string[];
    batchSize: number;
    maxBatchWaitMs: number;
    enabled: boolean;
}

/**
 * Event batch for debounced processing
 */
interface EventBatch {
    events: FileChange[];
    timeout: ReturnType<typeof setTimeout> | null;
    lastEventTime: number;
}

/**
 * File watcher service with debounced change detection and event batching
 */
export class FileWatcherService {
    private config: FileWatcherConfig;
    private logger: Logger;
    private isWatching = false;
    private watchers: Array<{ path: string; watcher: FSWatcher }> = [];
    private eventHandlers: Array<(event: FileChange) => void | Promise<void>> = [];
    private eventQueue = new Map<string, EventBatch>();
    private batchTimeout: ReturnType<typeof setTimeout> | null = null;
    private lastProcessTime = 0;
    private destroyed = false;

    constructor(config: Partial<FileWatcherConfig> = {}) {
        this.logger = LoggerFactory.getInstance();

        this.config = {
            watchPaths: ['./standards'],
            debounceMs: 100,
            throttleMs: 50,
            maxDepth: 5,
            fileExtensions: ['.json', '.yaml', '.yml', '.md'],
            ignoredPaths: [
                '**/node_modules/**',
                '**/.git/**',
                '**/dist/**',
                '**/build/**',
                '**/tmp/**',
                '**/.DS_Store'
            ],
            batchSize: 50,
            maxBatchWaitMs: 500,
            enabled: true,
            ...config
        };
    }

    /**
     * Start file watching
     */
    async start(): Promise<void> {
        if (this.isWatching) {
            this.logger.warn('FileWatcherService is already running');
            return;
        }

        if (!this.config.enabled) {
            this.logger.info('FileWatcherService is disabled');
            return;
        }

        if (this.destroyed) {
            throw new Error('Cannot start destroyed FileWatcherService');
        }

        try {
            this.logger.info('Starting FileWatcherService', {
                watchPaths: this.config.watchPaths,
                fileExtensions: this.config.fileExtensions,
                debounceMs: this.config.debounceMs
            });

            // Start watcher for each path
            for (const watchPath of this.config.watchPaths) {
                await this.startPathWatcher(watchPath);
            }

            this.isWatching = true;

            // Start batch processing timer
            this.startBatchProcessor();

            this.logger.info('FileWatcherService started successfully');

        } catch (error) {
            this.logger.error('Failed to start FileWatcherService', { error });
            throw error;
        }
    }

    /**
     * Stop file watching
     */
    async stop(): Promise<void> {
        if (!this.isWatching) {
            return;
        }

        this.logger.info('Stopping FileWatcherService');

        // Clear all timeouts
        if (this.batchTimeout) {
            clearTimeout(this.batchTimeout);
            this.batchTimeout = null;
        }

        for (const eventBatch of this.eventQueue.values()) {
            if (eventBatch.timeout) {
                clearTimeout(eventBatch.timeout);
            }
        }
        this.eventQueue.clear();

        // Stop all watchers
        for (const { watcher } of this.watchers) {
            try {
                watcher.close();
            } catch (error) {
                this.logger.warn('Error closing file watcher', { error });
            }
        }
        this.watchers = [];

        this.isWatching = false;
        this.lastProcessTime = 0;

        this.logger.info('FileWatcherService stopped');
    }

    /**
     * Destroy the service and clean up resources
     */
    async destroy(): Promise<void> {
        await this.stop();
        this.destroyed = true;
        this.eventHandlers = [];
    }

    /**
     * Add event handler for file changes
     */
    onChange(handler: (event: FileChange) => void | Promise<void>): void {
        this.eventHandlers.push(handler);
    }

    /**
     * Remove event handler
     */
    removeEventHandler(handler: (event: FileChange) => void | Promise<void>): void {
        const index = this.eventHandlers.indexOf(handler);
        if (index > -1) {
            this.eventHandlers.splice(index, 1);
        }
    }

    /**
     * Get watcher statistics
     */
    getStats(): {
        isWatching: boolean;
        watchedPaths: string[];
        eventHandlersCount: number;
        queuedEvents: number;
        config: FileWatcherConfig;
    } {
        return {
            isWatching: this.isWatching,
            watchedPaths: this.watchers.map(w => w.path),
            eventHandlersCount: this.eventHandlers.length,
            queuedEvents: Array.from(this.eventQueue.values())
                .reduce((total, batch) => total + batch.events.length, 0),
            config: { ...this.config }
        };
    }

    /**
     * Update configuration
     */
    updateConfig(config: Partial<FileWatcherConfig>): void {
        const oldPaths = [...this.config.watchPaths];
        this.config = { ...this.config, ...config };

        // Restart watchers if paths changed
        if (this.isWatching && JSON.stringify(oldPaths) !== JSON.stringify(this.config.watchPaths)) {
            this.restartWatchers();
        }
    }

    /**
     * Start watcher for a specific path
     */
    private async startPathWatcher(watchPath: string): Promise<void> {
        try {
            // Check if path exists
            const pathExists = await this.pathExists(watchPath);
            if (!pathExists) {
                this.logger.warn(`Watch path does not exist: ${watchPath}`);
                return;
            }

            // Use Node.js file watching
            const self = this;
            const watcher = watch(watchPath, { recursive: true }, async (eventType, filename) => {
                if (self.destroyed || !filename) return;

                // Use proper path joining to handle nested directories correctly
                const fullPath = resolve(watchPath, filename);

                // Filter by file extensions
                if (self.shouldIgnoreFile(fullPath)) {
                    return;
                }

                // Convert event type
                const changeType = self.mapEventType(eventType);
                if (!changeType) {
                    return;
                }

                // Get file stats asynchronously
                let size: number | undefined;
                if (eventType !== 'rename') {
                    try {
                        const stats = await Bun.file(fullPath).stat();
                        size = stats.size;
                    } catch (error) {
                        // File might have been deleted
                    }
                }

                const fileChange: FileChange = {
                    path: fullPath,
                    type: changeType,
                    timestamp: Date.now(),
                    size
                };

                self.queueFileChange(fileChange);
            });

            this.watchers.push({ path: watchPath, watcher });

            this.logger.debug(`Started watcher for path: ${watchPath}`);

        } catch (error) {
            this.logger.error(`Failed to start watcher for path: ${watchPath}`, { error });
            throw error;
        }
    }

    /**
     * Check if path exists
     */
    private async pathExists(path: string): Promise<boolean> {
        try {
            const stats = await Bun.file(path).stat();
            return stats.isDirectory || stats.isFile;
        } catch {
            return false;
        }
    }

    /**
     * Check if file should be ignored based on extension and path
     */
    private shouldIgnoreFile(path: string): boolean {
        if (!path) return true;

        // Check if it's a file with valid extension
        const hasValidExtension = this.config.fileExtensions.some(ext =>
            path.toLowerCase().endsWith(ext.toLowerCase())
        );

        if (!hasValidExtension) {
            return true;
        }

        // Check ignored paths
        for (const ignoredPath of this.config.ignoredPaths) {
            if (path.match(this.globToRegex(ignoredPath))) {
                return true;
            }
        }

        return false;
    }

    /**
     * Convert glob pattern to regex
     */
    private globToRegex(pattern: string): RegExp {
        const regexPattern = pattern
            .replace(/\*\*/g, '.*')
            .replace(/\*/g, '[^/]*')
            .replace(/\?/g, '[^/]');
        return new RegExp(regexPattern);
    }

    /**
     * Map Node.js fs.watch event to our event type
     */
    private mapEventType(event: string): FileChangeEvent | null {
        switch (event) {
            case 'rename':
                // In Node.js, 'rename' can indicate either creation or deletion
                // We'll need to check if the file exists to determine the actual event
                return 'create'; // Default to create, will be refined in processing
            case 'change':
                return 'update';
            default:
                return null;
        }
    }

    /**
     * Queue file change for debounced processing
     */
    private queueFileChange(change: FileChange): void {
        const key = change.path;
        const now = Date.now();

        // Remove existing timeout for this path
        if (this.eventQueue.has(key)) {
            const existing = this.eventQueue.get(key)!;
            if (existing.timeout) {
                clearTimeout(existing.timeout);
            }
        }

        // Create or update batch
        const batch: EventBatch = {
            events: [change],
            timeout: null,
            lastEventTime: now
        };

        // Set timeout for debounced processing
        batch.timeout = setTimeout(() => {
            this.processEventBatch(key);
        }, this.config.debounceMs);

        this.eventQueue.set(key, batch);
    }

    /**
     * Process event batch for a specific path
     */
    private processEventBatch(path: string): void {
        const batch = this.eventQueue.get(path);
        if (!batch || this.destroyed) {
            return;
        }

        // Remove from queue
        this.eventQueue.delete(path);

        // Get the latest event for this path
        const latestEvent = batch.events[batch.events.length - 1];

        // Apply throttling
        const now = Date.now();
        const timeSinceLastProcess = now - this.lastProcessTime;
        if (timeSinceLastProcess < this.config.throttleMs) {
            // Re-queue with remaining throttle time to prevent cascading delays
            const remainingDelay = this.config.throttleMs - timeSinceLastProcess;
            setTimeout(() => this.processEventBatch(path), remainingDelay);
            return;
        }

        this.lastProcessTime = now;

        // Process the event
        this.processFileChange(latestEvent);
    }

    /**
     * Start batch processor for multiple events
     */
    private startBatchProcessor(): void {
        const processBatch = () => {
            if (this.eventQueue.size > 0 && !this.destroyed) {
                const events: FileChange[] = [];
                const paths: string[] = [];

                // Collect events for batch processing
                for (const [path, batch] of this.eventQueue.entries()) {
                    if (batch.timeout) {
                        clearTimeout(batch.timeout);
                    }
                    events.push(...batch.events);
                    paths.push(path);
                }

                // Clear processed events
                for (const path of paths) {
                    this.eventQueue.delete(path);
                }

                // Process batch
                this.processEventBatchArray(events);
            }

            // Schedule next batch
            if (this.isWatching && !this.destroyed) {
                this.batchTimeout = setTimeout(processBatch, this.config.maxBatchWaitMs);
            }
        };

        this.batchTimeout = setTimeout(processBatch, this.config.maxBatchWaitMs);
    }

    /**
     * Process array of file changes
     */
    private async processEventBatchArray(events: FileChange[]): Promise<void> {
        const startTime = Date.now();

        try {
            // Deduplicate events by path and keep latest
            const latestEvents = new Map<string, FileChange>();
            for (const event of events) {
                latestEvents.set(event.path, event);
            }

            const uniqueEvents = Array.from(latestEvents.values());

            this.logger.debug(`Processing batch of ${uniqueEvents.length} file changes`);

            // Process events in parallel with limit
            const concurrency = Math.min(uniqueEvents.length, 10);
            const chunks = [];

            for (let i = 0; i < uniqueEvents.length; i += concurrency) {
                chunks.push(uniqueEvents.slice(i, i + concurrency));
            }

            for (const chunk of chunks) {
                await Promise.all(chunk.map(event => this.processFileChange(event)));
            }

            const duration = Date.now() - startTime;
            performanceMonitor.recordMetricSimple('file_watch_batch_processed', duration, {
                eventCount: uniqueEvents.length,
                batchSize: chunks.length
            });

        } catch (error) {
            this.logger.error('Error processing file change batch', {
                error,
                eventCount: events.length
            });
        }
    }

    /**
     * Process single file change
     */
    private async processFileChange(change: FileChange): Promise<void> {
        const startTime = Date.now();

        try {
            this.logger.debug(`Processing file change: ${change.type} - ${change.path}`);

            // Call all event handlers
            const promises = this.eventHandlers.map(async (handler) => {
                try {
                    await handler(change);
                } catch (error) {
                    this.logger.error(`Error in file change handler for ${change.path}`, {
                        error: error instanceof Error ? error.message : String(error)
                    });
                }
            });

            await Promise.allSettled(promises);

            const duration = Date.now() - startTime;
            performanceMonitor.recordMetricSimple('file_change_processed', duration, {
                type: change.type,
                path: change.path
            });

        } catch (error) {
            this.logger.error(`Error processing file change for ${change.path}`, {
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    /**
     * Restart watchers with new configuration
     */
    private async restartWatchers(): Promise<void> {
        this.logger.info('Restarting file watchers with new configuration');

        // Stop existing watchers
        for (const { watcher } of this.watchers) {
            try {
                watcher.close();
            } catch (error) {
                this.logger.warn('Error closing existing file watcher', { error });
            }
        }
        this.watchers = [];

        // Start new watchers
        for (const watchPath of this.config.watchPaths) {
            await this.startPathWatcher(watchPath);
        }

        this.logger.info('File watchers restarted successfully');
    }
}