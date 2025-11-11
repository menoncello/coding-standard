import { performance } from 'node:perf_hooks';

/**
 * Performance metrics interface
 */
export interface PerformanceMetrics {
    responseTime: number;
    memoryUsage: {
        heapUsed: number;
        heapTotal: number;
        external: number;
        rss: number;
    };
    timestamp: number;
    operation: string;
    success: boolean;
    cacheHit?: boolean;
    data?: any;
}

/**
 * Performance statistics
 */
export interface PerformanceStats {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
    minResponseTime: number;
    maxResponseTime: number;
    averageMemoryUsage: number;
    currentMemoryUsage: number;
    cacheHitRate: number;
    requestsPerSecond: number;
    uptime: number;
}

/**
 * Detailed operation metrics
 */
export interface OperationMetrics {
    operation: string;
    count: number;
    averageResponseTime: number;
    minResponseTime: number;
    maxResponseTime: number;
    successRate: number;
    cacheHitRate: number;
    averageMemoryUsage: number;
    lastExecuted: number;
}

/**
 * Performance monitor class
 */
export class PerformanceMonitor {
    private metrics: PerformanceMetrics[] = [];
    private startTime: number = Date.now();
    private initialStartTime: number = Date.now();
    private maxMetrics: number = 10000; // Keep last 10,000 metrics
    private operationTimers = new Map<string, number>();

    /**
     * Start timing an operation
     */
    startTimer(operation: string): string {
        const timerId = `${operation}-${Date.now()}-${Math.random()}`;
        this.operationTimers.set(timerId, performance.now());
        return timerId;
    }

    /**
     * End timing an operation and record metrics
     */
    endTimer(timerId: string, operation: string, success: boolean = true, cacheHit: boolean = false, data?: any): number {
        const startTime = this.operationTimers.get(timerId);
        if (!startTime) {
            // Silently handle missing timers during tests to avoid console noise
            if (process.env.NODE_ENV !== 'test') {
                console.warn(`Timer ${timerId} not found`);
            }
            return 0;
        }

        const responseTime = performance.now() - startTime;
        this.operationTimers.delete(timerId);

        this.recordMetric({
            responseTime,
            memoryUsage: this.getMemoryUsage(),
            timestamp: Date.now(),
            operation,
            success,
            cacheHit,
            data
        });

        return responseTime;
    }

    /**
     * Record a performance metric directly
     */
    recordMetric(metric: PerformanceMetrics): void {
        this.metrics.push(metric);

        // Keep only the most recent metrics
        if (this.metrics.length > this.maxMetrics) {
            this.metrics = this.metrics.slice(-this.maxMetrics);
        }
    }

    /**
     * Simple record method for compatibility with registry
     */
    recordMetricSimple(operation: string, duration: number, data?: any): void {
        this.recordMetric({
            responseTime: duration,
            memoryUsage: this.getMemoryUsage(),
            timestamp: Date.now(),
            operation,
            success: true,
            data
        });
    }

    /**
     * Get current memory usage
     */
    private getMemoryUsage() {
        const usage = process.memoryUsage();
        return {
            heapUsed: usage.heapUsed,
            heapTotal: usage.heapTotal,
            external: usage.external,
            rss: usage.rss
        };
    }

    /**
     * Get performance statistics
     */
    getStats(): PerformanceStats {
        const now = Date.now();
        const uptime = Math.max(1, now - this.initialStartTime); // Ensure uptime is at least 1ms
        const recentMetrics = this.metrics.filter(m => now - m.timestamp < 60000); // Last minute

        if (this.metrics.length === 0) {
            return {
                totalRequests: 0,
                successfulRequests: 0,
                failedRequests: 0,
                averageResponseTime: 0,
                minResponseTime: 0,
                maxResponseTime: 0,
                averageMemoryUsage: 0,
                currentMemoryUsage: this.getMemoryUsage().heapUsed,
                cacheHitRate: 0,
                requestsPerSecond: 0,
                uptime
            };
        }

        const successful = this.metrics.filter(m => m.success);
        const failed = this.metrics.filter(m => !m.success);
        const cacheHits = this.metrics.filter(m => m.cacheHit === true);

        const responseTimes = this.metrics.map(m => m.responseTime);
        const memoryUsages = this.metrics.map(m => m.memoryUsage.heapUsed);

        return {
            totalRequests: this.metrics.length,
            successfulRequests: successful.length,
            failedRequests: failed.length,
            averageResponseTime: this.average(responseTimes),
            minResponseTime: Math.min(...responseTimes),
            maxResponseTime: Math.max(...responseTimes),
            averageMemoryUsage: this.average(memoryUsages),
            currentMemoryUsage: this.getMemoryUsage().heapUsed,
            cacheHitRate: (cacheHits.length / this.metrics.length) * 100,
            requestsPerSecond: recentMetrics.length / 60, // Per second over last minute
            uptime
        };
    }

    /**
     * Get metrics by operation type
     */
    getOperationMetrics(): OperationMetrics[] {
        const operations = new Map<string, PerformanceMetrics[]>();

        // Group metrics by operation
        for (const metric of this.metrics) {
            if (!operations.has(metric.operation)) {
                operations.set(metric.operation, []);
            }
            operations.get(metric.operation)!.push(metric);
        }

        // Calculate statistics for each operation
        const operationMetrics: OperationMetrics[] = [];
        for (const [operation, operationMetricsList] of operations.entries()) {
            const successful = operationMetricsList.filter(m => m.success);
            const cacheHits = operationMetricsList.filter(m => m.cacheHit === true);
            const responseTimes = operationMetricsList.map(m => m.responseTime);
            const memoryUsages = operationMetricsList.map(m => m.memoryUsage.heapUsed);

            operationMetrics.push({
                operation,
                count: operationMetricsList.length,
                averageResponseTime: this.average(responseTimes),
                minResponseTime: Math.min(...responseTimes),
                maxResponseTime: Math.max(...responseTimes),
                successRate: (successful.length / operationMetricsList.length) * 100,
                cacheHitRate: (cacheHits.length / operationMetricsList.length) * 100,
                averageMemoryUsage: this.average(memoryUsages),
                lastExecuted: Math.max(...operationMetricsList.map(m => m.timestamp))
            });
        }

        return operationMetrics.sort((a, b) => b.lastExecuted - a.lastExecuted);
    }

    /**
     * Get recent metrics
     */
    getRecentMetrics(count: number = 100): PerformanceMetrics[] {
        return this.metrics.slice(-count);
    }

    /**
     * Get metrics in time range
     */
    getMetricsInTimeRange(startTime: number, endTime: number): PerformanceMetrics[] {
        return this.metrics.filter(m => m.timestamp >= startTime && m.timestamp <= endTime);
    }

    /**
     * Clear all metrics
     */
    clearMetrics(): void {
        this.metrics = [];
        this.startTime = Date.now();
        this.operationTimers.clear();
    }

    /**
     * Calculate average of an array of numbers
     */
    private average(numbers: number[]): number {
        if (numbers.length === 0) return 0;
        return numbers.reduce((sum, num) => sum + num, 0) / numbers.length;
    }

    /**
     * Get performance report
     */
    getReport(): string {
        const stats = this.getStats();
        const operations = this.getOperationMetrics();

        return `
Performance Report
==================
Uptime: ${Math.round(stats.uptime / 1000)}s
Total Requests: ${stats.totalRequests}
Success Rate: ${stats.successfulRequests > 0 ? Math.round((stats.successfulRequests / stats.totalRequests) * 100) : 0}%
Average Response Time: ${Math.round(stats.averageResponseTime)}ms
Min/Max Response Time: ${Math.round(stats.minResponseTime)}ms / ${Math.round(stats.maxResponseTime)}ms
Requests/Second: ${Math.round(stats.requestsPerSecond * 100) / 100}
Cache Hit Rate: ${Math.round(stats.cacheHitRate * 100) / 100}%

Memory Usage:
  Current: ${Math.round(stats.currentMemoryUsage / 1024 / 1024)}MB
  Average: ${Math.round(stats.averageMemoryUsage / 1024 / 1024)}MB

Operation Breakdown:
${operations.map(op => `  ${op.operation}: ${op.count} requests, ${Math.round(op.averageResponseTime)}ms avg, ${Math.round(op.successRate)}% success`).join('\n')}
        `.trim();
    }

    /**
     * Export metrics data
     */
    exportData(): {
        stats: PerformanceStats;
        operations: OperationMetrics[];
        recentMetrics: PerformanceMetrics[];
    } {
        return {
            stats: this.getStats(),
            operations: this.getOperationMetrics(),
            recentMetrics: this.getRecentMetrics(100)
        };
    }

    /**
     * Check if performance targets are being met
     */
    checkPerformanceTargets(): {
        responseTimeTarget: boolean;
        memoryTarget: boolean;
        cacheHitRateTarget: boolean;
        successRateTarget: boolean;
        overall: boolean;
    } {
        const stats = this.getStats();

        const responseTimeTarget = stats.averageResponseTime < 50; // 50ms target
        const memoryTarget = stats.currentMemoryUsage < 50 * 1024 * 1024; // 50MB target
        const cacheHitRateTarget = stats.cacheHitRate > 50; // 50% cache hit rate
        const successRateTarget = stats.totalRequests === 0 || (stats.successfulRequests / stats.totalRequests) > 0.95; // 95% success rate

        const overall = responseTimeTarget && memoryTarget && cacheHitRateTarget && successRateTarget;

        return {
            responseTimeTarget,
            memoryTarget,
            cacheHitRateTarget,
            successRateTarget,
            overall
        };
    }
}

/**
 * Global performance monitor instance
 */
export const performanceMonitor = new PerformanceMonitor();

/**
 * Decorator to automatically measure function performance
 */
export function measurePerformance(operation: string) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        const originalMethod = descriptor.value;

        descriptor.value = async function (...args: any[]) {
            const timerId = performanceMonitor.startTimer(operation);
            let success = true;

            try {
                const result = await originalMethod.apply(this, args);
                return result;
            } catch (error) {
                success = false;
                throw error;
            } finally {
                performanceMonitor.endTimer(timerId, operation, success);
            }
        };

        return descriptor;
    };
}

/**
 * Helper function to measure async function performance
 */
export async function measureAsyncFunction<T>(
    operation: string,
    fn: () => Promise<T>,
    data?: any
): Promise<{ result: T; responseTime: number }> {
    const timerId = performanceMonitor.startTimer(operation);
    let success = true;

    try {
        const result = await fn();
        const responseTime = performanceMonitor.endTimer(timerId, operation, success, false, data);
        return { result, responseTime };
    } catch (error) {
        success = false;
        performanceMonitor.endTimer(timerId, operation, success);
        throw error;
    }
}

/**
 * Memory usage monitor
 */
export class MemoryMonitor {
    private samples: Array<{ timestamp: number; usage: NodeJS.MemoryUsage }> = [];
    private maxSamples: number = 1000;
    private intervalId?: NodeJS.Timeout;

    /**
     * Start monitoring memory usage
     */
    startMonitoring(intervalMs: number = 5000): void {
        if (this.intervalId) {
            this.stopMonitoring();
        }

        this.intervalId = setInterval(() => {
            this.samples.push({
                timestamp: Date.now(),
                usage: process.memoryUsage()
            });

            if (this.samples.length > this.maxSamples) {
                this.samples = this.samples.slice(-this.maxSamples);
            }
        }, intervalMs);
    }

    /**
     * Stop monitoring memory usage
     */
    stopMonitoring(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = undefined;
        }
    }

    /**
     * Get memory trend
     */
    getMemoryTrend(): {
        current: NodeJS.MemoryUsage;
        average: NodeJS.MemoryUsage;
        peak: NodeJS.MemoryUsage;
        samples: number;
        trend: 'increasing' | 'decreasing' | 'stable';
    } {
        if (this.samples.length === 0) {
            return {
                current: process.memoryUsage(),
                average: process.memoryUsage(),
                peak: process.memoryUsage(),
                samples: 0,
                trend: 'stable'
            };
        }

        const current = this.samples[this.samples.length - 1].usage;
        const average = this.calculateAverageMemory();
        const peak = this.calculatePeakMemory();

        // Determine trend
        let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
        if (this.samples.length >= 10) {
            const recent = this.samples.slice(-10);
            const older = this.samples.slice(-20, -10);

            if (older.length > 0) {
                const recentAvg = this.calculateAverageMemoryForSamples(recent);
                const olderAvg = this.calculateAverageMemoryForSamples(older);

                if (recentAvg.heapUsed > olderAvg.heapUsed * 1.1) {
                    trend = 'increasing';
                } else if (recentAvg.heapUsed < olderAvg.heapUsed * 0.9) {
                    trend = 'decreasing';
                }
            }
        }

        return {
            current,
            average,
            peak,
            samples: this.samples.length,
            trend
        };
    }

    private calculateAverageMemory(): NodeJS.MemoryUsage {
        return this.calculateAverageMemoryForSamples(this.samples);
    }

    private calculateAverageMemoryForSamples(samples: Array<{ usage: NodeJS.MemoryUsage }>): NodeJS.MemoryUsage {
        if (samples.length === 0) {
            return process.memoryUsage();
        }

        const sum = samples.reduce((acc, sample) => ({
            rss: acc.rss + sample.usage.rss,
            heapTotal: acc.heapTotal + sample.usage.heapTotal,
            heapUsed: acc.heapUsed + sample.usage.heapUsed,
            external: acc.external + sample.usage.external,
            arrayBuffers: acc.arrayBuffers + (sample.usage as any).arrayBuffers || 0
        }), { rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 });

        const count = samples.length;
        return {
            rss: sum.rss / count,
            heapTotal: sum.heapTotal / count,
            heapUsed: sum.heapUsed / count,
            external: sum.external / count,
            arrayBuffers: sum.arrayBuffers / count
        };
    }

    private calculatePeakMemory(): NodeJS.MemoryUsage {
        return this.samples.reduce((peak, sample) => ({
            rss: Math.max(peak.rss, sample.usage.rss),
            heapTotal: Math.max(peak.heapTotal, sample.usage.heapTotal),
            heapUsed: Math.max(peak.heapUsed, sample.usage.heapUsed),
            external: Math.max(peak.external, sample.usage.external),
            arrayBuffers: Math.max(peak.arrayBuffers || 0, (sample.usage as any).arrayBuffers || 0)
        }), { rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 });
    }

    clear(): void {
        this.samples = [];
    }
}

/**
 * Global memory monitor instance
 */
export const memoryMonitor = new MemoryMonitor();