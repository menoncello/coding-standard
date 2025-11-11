import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import {
    performanceMonitor,
    PerformanceMonitor,
    measurePerformance,
    measureAsyncFunction,
    memoryMonitor,
    MemoryMonitor
} from '../../src/utils/performance-monitor.js';
// Factory imports
import { DatabaseFactory } from '../../src/factories/database-factory.js';
import { CacheFactory } from '../../src/factories/cache-factory.js';
import { ToolHandlersFactory } from '../../src/factories/tool-handlers-factory.js';
import { PerformanceFactory } from '../../src/factories/performance-factory.js';
import { StandardsFactory } from '../../src/factories/standards-factory.js';
import { LoggerFactory } from '../../src/utils/logger/logger-factory.js';

describe('PerformanceMonitor Integration Tests', () => {
    // Test logger setup
const testLogger = LoggerFactory.createTestLogger(true);
    let monitor: PerformanceMonitor;

    beforeEach(() => {
        monitor = PerformanceFactory.createPerformanceMonitor();
        // Clear the global performance monitor to ensure clean state for decorator tests
        performanceMonitor.clearMetrics();
    });

    afterEach(() => {
        monitor.clearMetrics();
        performanceMonitor.clearMetrics();
    });

    describe('timer operations', () => {
        test('should start and end timers correctly', () => {
            const timerId = monitor.startTimer('test-operation');
            expect(timerId).toBeTruthy();
            expect(typeof timerId).toBe('string');

            // Wait a bit to ensure measurable time
            const start = performance.now();
            const responseTime = monitor.endTimer(timerId, 'test-operation');
            const end = performance.now();

            expect(responseTime).toBeGreaterThan(0);
            expect(responseTime).toBeLessThan(end - start + 10); // Allow small margin
        });

        test('should handle ending non-existent timers gracefully', () => {
            const responseTime = monitor.endTimer('non-existent-timer', 'test-operation');
            expect(responseTime).toBe(0);
        });

        test('should track success and failure states', () => {
            const successTimerId = monitor.startTimer('success-op');
            monitor.endTimer(successTimerId, 'success-op', true);

            const failureTimerId = monitor.startTimer('failure-op');
            monitor.endTimer(failureTimerId, 'failure-op', false);

            const stats = monitor.getStats();
            expect(stats.successfulRequests).toBe(1);
            expect(stats.failedRequests).toBe(1);
        });
    });

    describe('direct metric recording', () => {
        test('should record metrics directly', () => {
            monitor.recordMetric({
                responseTime: 100,
                memoryUsage: {
                    heapUsed: 1000000,
                    heapTotal: 2000000,
                    external: 100000,
                    rss: 5000000
                },
                timestamp: Date.now(),
                operation: 'test-operation',
                success: true,
                data: { test: true }
            });

            const stats = monitor.getStats();
            expect(stats.totalRequests).toBe(1);
            expect(stats.successfulRequests).toBe(1);
            expect(stats.averageResponseTime).toBe(100);
        });

        test('should limit stored metrics to max size', () => {
            const smallMonitor = PerformanceFactory.createPerformanceMonitor();
            (smallMonitor as any).maxMetrics = 3;

            // Add more metrics than the limit
            for (let i = 0; i < 5; i++) {
                smallMonitor.recordMetric({
                    responseTime: i * 10,
                    memoryUsage: {
                        heapUsed: 1000000,
                        heapTotal: 2000000,
                        external: 100000,
                        rss: 5000000
                    },
                    timestamp: Date.now() + i,
                    operation: 'test-operation',
                    success: true
                });
            }

            const stats = smallMonitor.getStats();
            expect(stats.totalRequests).toBe(3); // Should be limited to maxMetrics
        });
    });

    describe('statistics calculation', () => {
        beforeEach(() => {
            // Add some test metrics
            monitor.recordMetric({
                responseTime: 10,
                memoryUsage: {
                    heapUsed: 1000000,
                    heapTotal: 2000000,
                    external: 100000,
                    rss: 5000000
                },
                timestamp: Date.now() - 1000,
                operation: 'op1',
                success: true
            });

            monitor.recordMetric({
                responseTime: 20,
                memoryUsage: {
                    heapUsed: 1100000,
                    heapTotal: 2100000,
                    external: 110000,
                    rss: 5100000
                },
                timestamp: Date.now() - 500,
                operation: 'op2',
                success: true
            });

            monitor.recordMetric({
                responseTime: 30,
                memoryUsage: {
                    heapUsed: 1200000,
                    heapTotal: 2200000,
                    external: 120000,
                    rss: 5200000
                },
                timestamp: Date.now(),
                operation: 'op1',
                success: false
            });
        });

        test('should calculate basic statistics correctly', () => {
            const stats = monitor.getStats();

            expect(stats.totalRequests).toBe(3);
            expect(stats.successfulRequests).toBe(2);
            expect(stats.failedRequests).toBe(1);
            expect(stats.averageResponseTime).toBe(20); // (10 + 20 + 30) / 3
            expect(stats.minResponseTime).toBe(10);
            expect(stats.maxResponseTime).toBe(30);
            expect(stats.uptime).toBeGreaterThan(0);
        });

        test('should calculate memory statistics correctly', () => {
            const stats = monitor.getStats();

            expect(stats.averageMemoryUsage).toBe(1100000); // (1000000 + 1100000 + 1200000) / 3
            expect(stats.currentMemoryUsage).toBeGreaterThan(0);
        });

        test('should calculate requests per second for recent metrics', () => {
            const stats = monitor.getStats();
            expect(stats.requestsPerSecond).toBeGreaterThanOrEqual(0);
        });

        test('should handle empty metrics correctly', () => {
            const emptyMonitor = PerformanceFactory.createPerformanceMonitor();
            const stats = emptyMonitor.getStats();

            expect(stats.totalRequests).toBe(0);
            expect(stats.successfulRequests).toBe(0);
            expect(stats.failedRequests).toBe(0);
            expect(stats.averageResponseTime).toBe(0);
            expect(stats.minResponseTime).toBe(0);
            expect(stats.maxResponseTime).toBe(0);
            expect(stats.averageMemoryUsage).toBe(0);
            expect(stats.cacheHitRate).toBe(0);
            expect(stats.requestsPerSecond).toBe(0);
        });
    });

    describe('operation metrics', () => {
        beforeEach(() => {
            // Add metrics for different operations
            monitor.recordMetric({
                responseTime: 10,
                memoryUsage: { heapUsed: 1000000, heapTotal: 2000000, external: 100000, rss: 5000000 },
                timestamp: Date.now(),
                operation: 'operation1',
                success: true,
                cacheHit: true
            });

            monitor.recordMetric({
                responseTime: 20,
                memoryUsage: { heapUsed: 1100000, heapTotal: 2100000, external: 110000, rss: 5100000 },
                timestamp: Date.now() + 1,
                operation: 'operation1',
                success: false,
                cacheHit: false
            });

            monitor.recordMetric({
                responseTime: 30,
                memoryUsage: { heapUsed: 1200000, heapTotal: 2200000, external: 120000, rss: 5200000 },
                timestamp: Date.now() + 2,
                operation: 'operation2',
                success: true,
                cacheHit: false
            });
        });

        test('should group metrics by operation', () => {
            const operationMetrics = monitor.getOperationMetrics();

            expect(operationMetrics).toHaveLength(2);

            const op1Metrics = operationMetrics.find(op => op.operation === 'operation1');
            const op2Metrics = operationMetrics.find(op => op.operation === 'operation2');

            expect(op1Metrics).toBeDefined();
            expect(op2Metrics).toBeDefined();

            expect(op1Metrics!.count).toBe(2);
            expect(op1Metrics!.averageResponseTime).toBe(15); // (10 + 20) / 2
            expect(op1Metrics!.successRate).toBe(50); // 1 success out of 2
            expect(op1Metrics!.cacheHitRate).toBe(50); // 1 cache hit out of 2

            expect(op2Metrics!.count).toBe(1);
            expect(op2Metrics!.averageResponseTime).toBe(30);
            expect(op2Metrics!.successRate).toBe(100);
            expect(op2Metrics!.cacheHitRate).toBe(0);
        });

        test('should sort operations by last executed time', () => {
            const operationMetrics = monitor.getOperationMetrics();

            // Should be sorted by lastExecuted descending
            expect(operationMetrics[0].operation).toBe('operation2');
            expect(operationMetrics[1].operation).toBe('operation1');
        });
    });

    describe('recent metrics', () => {
        test('should return recent metrics', () => {
            // Add some metrics
            for (let i = 0; i < 10; i++) {
                monitor.recordMetric({
                    responseTime: i * 10,
                    memoryUsage: { heapUsed: 1000000, heapTotal: 2000000, external: 100000, rss: 5000000 },
                    timestamp: Date.now() + i,
                    operation: 'test-operation',
                    success: true
                });
            }

            const recent = monitor.getRecentMetrics(5);
            expect(recent).toHaveLength(5);

            // Should be the last 5 metrics
            recent.forEach((metric, index) => {
                expect(metric.responseTime).toBe((5 + index) * 10);
            });
        });

        test('should handle count larger than available metrics', () => {
            monitor.recordMetric({
                responseTime: 100,
                memoryUsage: { heapUsed: 1000000, heapTotal: 2000000, external: 100000, rss: 5000000 },
                timestamp: Date.now(),
                operation: 'test-operation',
                success: true
            });

            const recent = monitor.getRecentMetrics(10);
            expect(recent).toHaveLength(1);
        });
    });

    describe('time range filtering', () => {
        test('should filter metrics by time range', () => {
            const now = Date.now();
            const oneHourAgo = now - (60 * 60 * 1000);

            // Add metrics at different times
            monitor.recordMetric({
                responseTime: 10,
                memoryUsage: { heapUsed: 1000000, heapTotal: 2000000, external: 100000, rss: 5000000 },
                timestamp: oneHourAgo,
                operation: 'old-operation',
                success: true
            });

            monitor.recordMetric({
                responseTime: 20,
                memoryUsage: { heapUsed: 1100000, heapTotal: 2100000, external: 110000, rss: 5100000 },
                timestamp: now,
                operation: 'recent-operation',
                success: true
            });

            const recentMetrics = monitor.getMetricsInTimeRange(now - 60000, now + 60000); // Last minute
            expect(recentMetrics).toHaveLength(1);
            expect(recentMetrics[0].operation).toBe('recent-operation');
        });
    });

    describe('performance targets', () => {
        test('should check performance targets correctly', () => {
            // Add good metrics
            monitor.recordMetric({
                responseTime: 25, // Under 50ms target
                memoryUsage: { heapUsed: 1000000, heapTotal: 2000000, external: 100000, rss: 5000000 }, // Under 50MB
                timestamp: Date.now(),
                operation: 'good-operation',
                success: true,
                cacheHit: true
            });

            const targets = monitor.checkPerformanceTargets();
            expect(targets.responseTimeTarget).toBe(true);
            expect(targets.memoryTarget).toBe(true);
            expect(targets.cacheHitRateTarget).toBe(true);
            expect(targets.successRateTarget).toBe(true);
            expect(targets.overall).toBe(true);
        });

        test('should detect when targets are not met', () => {
            // Add metrics that exceed targets
            monitor.recordMetric({
                responseTime: 100, // Over 50ms target
                memoryUsage: { heapUsed: 1000000, heapTotal: 2000000, external: 100000, rss: 5000000 },
                timestamp: Date.now(),
                operation: 'slow-operation',
                success: true,
                cacheHit: false
            });

            const targets = monitor.checkPerformanceTargets();
            expect(targets.responseTimeTarget).toBe(false);
            expect(targets.cacheHitRateTarget).toBe(false);
            expect(targets.overall).toBe(false);
        });
    });

    describe('report generation', () => {
        test('should generate performance report', () => {
            monitor.recordMetric({
                responseTime: 25,
                memoryUsage: { heapUsed: 1000000, heapTotal: 2000000, external: 100000, rss: 5000000 },
                timestamp: Date.now(),
                operation: 'test-operation',
                success: true,
                cacheHit: true
            });

            const report = monitor.getReport();
            expect(report).toContain('Performance Report');
            expect(report).toContain('Total Requests: 1');
            expect(report).toContain('Success Rate: 100%');
            expect(report).toContain('Cache Hit Rate: 100%');
            expect(report).toContain('test-operation');
        });
    });

    describe('data export', () => {
        test('should export data correctly', () => {
            monitor.recordMetric({
                responseTime: 25,
                memoryUsage: { heapUsed: 1000000, heapTotal: 2000000, external: 100000, rss: 5000000 },
                timestamp: Date.now(),
                operation: 'test-operation',
                success: true,
                cacheHit: true
            });

            const exportedData = monitor.exportData();

            expect(exportedData.stats).toBeDefined();
            expect(exportedData.operations).toBeDefined();
            expect(exportedData.recentMetrics).toBeDefined();

            expect(exportedData.stats.totalRequests).toBe(1);
            expect(exportedData.operations).toHaveLength(1);
            expect(exportedData.recentMetrics).toHaveLength(1);
        });
    });
});

describe('measurePerformance decorator', () => {
    beforeEach(() => {
        performanceMonitor.clearMetrics();
    });

    afterEach(() => {
        performanceMonitor.clearMetrics();
    });

    test('should measure function performance automatically', async () => {
        class TestClass {
            @measurePerformance('test-method')
            async testMethod(delay: number = 10): Promise<string> {
                await new Promise(resolve => setTimeout(resolve, delay));
                return 'result';
            }
        }

        const testInstance = new TestClass();
        const result = await testInstance.testMethod(50);

        expect(result).toBe('result');

        const stats = performanceMonitor.getStats();
        expect(stats.totalRequests).toBe(1);
        expect(stats.successfulRequests).toBe(1);
        expect(stats.averageResponseTime).toBeGreaterThan(40); // At least 50ms minus small margin
    });

    test('should handle function failures correctly', async () => {
        class TestClass {
            @measurePerformance('failing-method')
            async failingMethod(): Promise<string> {
                throw new Error('Test error');
            }
        }

        const testInstance = new TestClass();

        try {
            await testInstance.failingMethod();
            expect(true).toBe(false); // Should not reach here
        } catch (error) {
            expect(error.message).toBe('Test error');
        }

        const stats = performanceMonitor.getStats();
        expect(stats.totalRequests).toBe(1);
        expect(stats.failedRequests).toBe(1);
        expect(stats.successfulRequests).toBe(0);
    });
});

describe('measureAsyncFunction helper', () => {
    beforeEach(() => {
        performanceMonitor.clearMetrics();
    });

    afterEach(() => {
        performanceMonitor.clearMetrics();
    });

    test('should measure async function performance', async () => {
        const asyncFunction = async () => {
            await new Promise(resolve => setTimeout(resolve, 50));
            return 'test result';
        };

        const { result, responseTime } = await measureAsyncFunction('test-async', asyncFunction, { test: true });

        expect(result).toBe('test result');
        expect(responseTime).toBeGreaterThan(40);

        const stats = performanceMonitor.getStats();
        expect(stats.totalRequests).toBe(1);
        expect(stats.successfulRequests).toBe(1);
    });

    test('should handle async function failures', async () => {
        const failingFunction = async () => {
            throw new Error('Async error');
        };

        try {
            await measureAsyncFunction('failing-async', failingFunction);
            expect(true).toBe(false); // Should not reach here
        } catch (error) {
            expect(error.message).toBe('Async error');
        }

        const stats = performanceMonitor.getStats();
        expect(stats.totalRequests).toBe(1);
        expect(stats.failedRequests).toBe(1);
    });
});

describe('MemoryMonitor Integration Tests', () => {
    let memMonitor: MemoryMonitor;

    beforeEach(() => {
        memMonitor = new MemoryMonitor();
    });

    afterEach(() => {
        memMonitor.stopMonitoring();
        memMonitor.clear();
    });

    test('should track memory usage over time', async () => {
        memMonitor.startMonitoring(100); // Monitor every 100ms

        // Wait for some samples
        await new Promise(resolve => setTimeout(resolve, 250));

        memMonitor.stopMonitoring();

        const trend = memMonitor.getMemoryTrend();
        expect(trend.samples).toBeGreaterThan(0);
        expect(trend.current).toBeDefined();
        expect(trend.average).toBeDefined();
        expect(trend.peak).toBeDefined();
    });

    test('should detect memory trends', async () => {
        memMonitor.startMonitoring(50);

        // Wait for samples
        await new Promise(resolve => setTimeout(resolve, 200));
        memMonitor.stopMonitoring();

        const trend = memMonitor.getMemoryTrend();
        expect(['increasing', 'decreasing', 'stable']).toContain(trend.trend);
    });

    test('should handle no samples gracefully', () => {
        const trend = memMonitor.getMemoryTrend();

        expect(trend.current).toBeDefined();
        expect(trend.average).toBeDefined();
        expect(trend.peak).toBeDefined();
        expect(trend.samples).toBe(0);
        expect(trend.trend).toBe('stable');
    });

    test('should clear samples correctly', async () => {
        memMonitor.startMonitoring(50);
        await new Promise(resolve => setTimeout(resolve, 150));
        memMonitor.stopMonitoring();

        expect(memMonitor.getMemoryTrend().samples).toBeGreaterThan(0);

        memMonitor.clear();
        expect(memMonitor.getMemoryTrend().samples).toBe(0);
    });

    test('should restart monitoring correctly', async () => {
        memMonitor.startMonitoring(50);
        await new Promise(resolve => setTimeout(resolve, 120)); // Run for ~120ms (should get 2-3 samples)
        memMonitor.stopMonitoring();

        const firstTrend = memMonitor.getMemoryTrend();
        expect(firstTrend.samples).toBeGreaterThan(0);

        memMonitor.clear();
        memMonitor.startMonitoring(50);
        await new Promise(resolve => setTimeout(resolve, 250)); // Run for ~250ms (should get more samples)
        memMonitor.stopMonitoring();

        const secondTrend = memMonitor.getMemoryTrend();
        expect(secondTrend.samples).toBeGreaterThan(0);
        expect(secondTrend.samples).not.toBe(firstTrend.samples); // Should have different sample counts
    });
});