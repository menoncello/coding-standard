import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { FileWatcherService } from '../../../src/utils/file-watcher';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';

describe('FileWatcherService - AC2: Performance and Throttling', () => {
  let fileWatcher: FileWatcherService;
  let testDir: string;

  beforeEach(async () => {
    testDir = join(process.cwd(), 'test-temp', Date.now().toString());
    await mkdir(testDir, { recursive: true });

    fileWatcher = new FileWatcherService({
      watchPaths: [testDir],
      fileExtensions: ['.json', '.yaml'],
      debounceMs: 50,
      maxDepth: 2,
      throttleMs: 25,
      ignoredPaths: [],
      batchSize: 10,
      maxBatchWaitMs: 100,
      enabled: true
    });
  });

  afterEach(async () => {
    await fileWatcher.destroy();
    await rm(testDir, { recursive: true, force: true });
  });

  test('should throttle rapid file changes to prevent system overload', async () => {
    // GIVEN: Event throttling is configured to prevent overwhelming the system
    const changeEvents: Array<{timestamp: number}> = [];

    const eventHandler = (event: FileChange) => {
      changeEvents.push({ timestamp: event.timestamp });
    };

    fileWatcher.onChange(eventHandler);
    await fileWatcher.start();

    const testFile = join(testDir, 'rapid-changes.yaml');

    // WHEN: Multiple rapid changes occur to the same file
    const changeCount = 10;
    const startTime = performance.now();

    // Generate very rapid file changes (faster than debounce + throttle)
    for (let i = 0; i < changeCount; i++) {
      await writeFile(testFile, `change ${i}`);
      // Very small delay - faster than debounce (50ms) to trigger debouncing
      await new Promise(resolve => setTimeout(resolve, 5));
    }

    // Wait for all debouncing and throttling to complete
    // Should be longer than normal debounce due to throttling
    await new Promise(resolve => setTimeout(resolve, 800));

    // THEN: Events are throttled and debounced appropriately
    // Due to debouncing (50ms) and rapid changes (5ms intervals),
    // we should get significantly fewer events than changes
    expect(changeEvents.length).toBeLessThan(changeCount);
    expect(changeEvents.length).toBeGreaterThan(0);

    // Verify events are properly spaced considering both debouncing and throttling
    if (changeEvents.length >= 2) {
      for (let i = 1; i < changeEvents.length; i++) {
        const timeDiff = changeEvents[i].timestamp - changeEvents[i-1].timestamp;
        // Events should be spaced by at least the throttle time (25ms)
        expect(timeDiff).toBeGreaterThanOrEqual(20); // Allow some tolerance
      }
    }

    // Verify the total test duration shows throttling is working
    const totalTime = performance.now() - startTime;

    // Should take reasonable time but not too long
    expect(totalTime).toBeGreaterThan(100);
    expect(totalTime).toBeLessThan(2000);
  });

  test('should maintain performance under high-frequency file changes', async () => {
    // GIVEN: System needs to handle high-frequency changes efficiently
    const performanceMetrics = {
      eventCount: 0,
      totalProcessingTime: 0,
      maxSingleEventTime: 0,
      lastEventTime: 0
    };

    fileWatcher.onChange((event) => {
      const startTime = performance.now();
      performanceMetrics.eventCount++;
      performanceMetrics.lastEventTime = Date.now();

      // Simulate some processing work
      for (let i = 0; i < 1000; i++) {
        Math.random();
      }

      const processingTime = performance.now() - startTime;
      performanceMetrics.totalProcessingTime += processingTime;
      performanceMetrics.maxSingleEventTime = Math.max(
        performanceMetrics.maxSingleEventTime,
        processingTime
      );
    });

    await fileWatcher.start();

    // WHEN: High-frequency file changes occur
    const fileCount = 20;
    const files = Array.from({ length: fileCount }, (_, i) =>
      join(testDir, `perf-test-${i}.yaml`)
    );

    const startTime = performance.now();

    // Create files rapidly with controlled timing
    for (let i = 0; i < fileCount; i++) {
      await writeFile(files[i], `performance test ${i}`);
      if (i % 5 === 0) {
        // Use brief pause instead of animation frame
        await new Promise(resolve => setTimeout(resolve, 1));
      }
    }

    // Wait for all events to be processed using event-driven approach
    const allEventsProcessed = new Promise((resolve) => {
      let eventCount = 0;
      fileWatcher.onChange(() => {
        eventCount++;
      });

      // Check if processing is complete when no new events for 100ms
      const checkInterval = setInterval(() => {
        if (eventCount > 0 && Date.now() - performanceMetrics.lastEventTime > 100) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 50);

      // Safety timeout
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve();
      }, 2000);
    });

    // Store last event time for the check above
    performanceMetrics.lastEventTime = performance.now();
    await allEventsProcessed;

    const totalTime = performance.now() - startTime;

    // THEN: Performance remains within acceptable limits
    expect(performanceMetrics.eventCount).toBeGreaterThan(0);
    expect(performanceMetrics.maxSingleEventTime).toBeLessThan(10); // Max 10ms per event

    const avgEventTime = performanceMetrics.totalProcessingTime / performanceMetrics.eventCount;
    expect(avgEventTime).toBeLessThan(5); // Average under 5ms

    // Total processing should be much faster than file operations
    expect(totalTime).toBeLessThan(1000); // Under 1 second for 20 files
  });
});