import {test, expect, describe} from 'bun:test';
import {performance} from 'perf_hooks';

describe('Performance and Load Tests', () => {
    test('should handle sub-50ms response times', async () => {
        // For now, test the tool handlers directly to avoid server process issues
        const {getStandardsHandler} = await import('../../src/mcp/handlers/toolHandlers.js');

        const responseTimes: number[] = [];
        const iterations = 10;

        for (let i = 0; i < iterations; i++) {
            const startTime = performance.now();
            await getStandardsHandler.getStandards({technology: 'typescript'});
            const endTime = performance.now();
            responseTimes.push(endTime - startTime);
        }

        const averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
        const maxResponseTime = Math.max(...responseTimes);

        // All requests should be under 50ms
        expect(maxResponseTime).toBeLessThan(50);
        expect(averageResponseTime).toBeLessThan(30); // Even better average

        console.log(`Average response time: ${averageResponseTime.toFixed(2)}ms`);
        console.log(`Max response time: ${maxResponseTime.toFixed(2)}ms`);
    });

    test('should handle concurrent requests without performance degradation', async () => {
        const {getStandardsHandler} = await import('../../src/mcp/handlers/toolHandlers.js');

        // Test baseline performance (average of multiple runs)
        const baselineRuns = 5;
        const baselineTimes: number[] = [];

        for (let i = 0; i < baselineRuns; i++) {
            const startTime = performance.now();
            await getStandardsHandler.getStandards({technology: 'typescript'});
            baselineTimes.push(performance.now() - startTime);
        }

        const averageBaselineTime = baselineTimes.reduce((a, b) => a + b, 0) / baselineTimes.length;

        // Test concurrent requests
        const concurrentRequests = 10;
        const concurrentStartTime = performance.now();

        const promises = Array.from({length: concurrentRequests}, () =>
            getStandardsHandler.getStandards({technology: 'typescript'})
        );

        await Promise.all(promises);
        const concurrentTime = performance.now() - concurrentStartTime;

        // Calculate performance metrics
        const averageConcurrentTime = concurrentTime / concurrentRequests;
        const degradationPercent = averageBaselineTime > 0.01 ?
            ((averageConcurrentTime - averageBaselineTime) / averageBaselineTime) * 100 : 0;

        // Performance requirements
        expect(averageConcurrentTime).toBeLessThan(5); // Each concurrent request should average under 5ms
        expect(concurrentTime).toBeLessThan(50); // Total concurrent time should be reasonable
        expect(degradationPercent).toBeLessThan(200); // Degradation should be under 200%

        console.log(`Average baseline time: ${averageBaselineTime.toFixed(2)}ms`);
        console.log(`Concurrent time (${concurrentRequests} req): ${concurrentTime.toFixed(2)}ms`);
        console.log(`Average concurrent time: ${averageConcurrentTime.toFixed(2)}ms`);
        console.log(`Performance degradation: ${degradationPercent.toFixed(2)}%`);
    });

    test('should maintain memory usage under target during load', async () => {
        const {getStandardsHandler} = await import('../../src/mcp/handlers/toolHandlers.js');

        // Get initial memory usage
        const initialMemory = process.memoryUsage().heapUsed;

        // Execute many requests to test memory usage
        const requestCount = 100;
        for (let i = 0; i < requestCount; i++) {
            await getStandardsHandler.getStandards({technology: 'typescript'});

            // Sample memory usage every 10 requests
            if (i % 10 === 0) {
                const currentMemory = process.memoryUsage().heapUsed;
                const memoryIncrease = (currentMemory - initialMemory) / 1024 / 1024; // MB

                // Memory increase should stay reasonable
                expect(memoryIncrease).toBeLessThan(20);
            }
        }

        const finalMemory = process.memoryUsage().heapUsed;
        const totalMemoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // MB

        // Total memory usage should stay under 50MB target
        expect(totalMemoryIncrease).toBeLessThan(10); // More conservative for test

        console.log(`Total memory increase: ${totalMemoryIncrease.toFixed(2)}MB`);
        console.log(`Requests processed: ${requestCount}`);
    });

    test('should handle complex requests efficiently', async () => {
        const {getStandardsHandler} = await import('../../src/mcp/handlers/toolHandlers.js');

        // Test complex validation request
        const complexCode = `
class testClass extends baseClass {
  private _property: string;

  constructor(param: string) {
    super();
    this._property = param;
  }

  public async method() {
    console.log('hello world');
    return this._property;
  }
}
    `.trim();

        const startTime = performance.now();
        const result = await getStandardsHandler.validateCode({
            code: complexCode,
            language: 'typescript',
            useStrict: true,
            rules: ['naming', 'formatting', 'best-practices']
        });
        const responseTime = performance.now() - startTime;

        expect(responseTime).toBeLessThan(50);
        expect(result.violations).toBeDefined();
        expect(result.score).toBeGreaterThanOrEqual(0);

        console.log(`Complex validation time: ${responseTime.toFixed(2)}ms`);
        console.log(`Violations found: ${result.violations.length}`);
    });
});