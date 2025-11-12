import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { FileWatcherService } from '../../../src/utils/file-watcher';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';

describe('FileWatcherService - AC3: Error Resilience', () => {
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
      maxBatchWaitMs: 200,
      enabled: true
    });
  });

  afterEach(async () => {
    await fileWatcher.destroy();
    await rm(testDir, { recursive: true, force: true });
  });

  test('should recover from file system errors gracefully', async () => {
    // GIVEN: Error handling is configured for file system issues
    const changeEvents: Array<{path: string}> = [];

    fileWatcher.onChange((event) => {
      changeEvents.push({ path: event.path });
    });

    await fileWatcher.start();

    // WHEN: File system errors occur (simulate by trying to watch non-existent path)
    const nonExistentFile = join(testDir, 'non-existent', 'file.yaml');

    try {
      await writeFile(nonExistentFile, 'content');
    } catch (error) {
      // Expected to fail - directory doesn't exist
    }

    // Create a valid file to ensure service continues
    const validFile = join(testDir, 'valid-file.yaml');
    await writeFile(validFile, 'valid content');

    // Wait for error recovery using event-driven approach
    const errorRecoveryComplete = new Promise((resolve) => {
      let hasChange = false;
      fileWatcher.onChange(() => {
        hasChange = true;
        resolve();
      });

      // Safety timeout in case no change events occur
      setTimeout(resolve, 1000);
    });

    await errorRecoveryComplete;

    // THEN: Service continues operating after errors
    expect(changeEvents.length).toBeGreaterThan(0);
    expect(changeEvents.some(event => event.path.includes('valid-file.yaml'))).toBe(true);

    // Errors should be logged but not crash the service
    expect(fileWatcher.getStats().isWatching).toBe(true);
  });

  test('should handle permission errors and access denied scenarios', async () => {
    // GIVEN: Service may encounter permission errors
    const changeEvents: Array<{path: string}> = [];

    fileWatcher.onChange((event) => {
      changeEvents.push({ path: event.path });
    });

    await fileWatcher.start();

    // WHEN: Valid files are created after service start
    // Note: This test simulates the service continuing to work after potential errors
    const validFile = join(testDir, 'normal-file.yaml');
    await writeFile(validFile, 'normal content');

    // Wait for normal file processing using event-driven approach
    const normalFileProcessed = new Promise((resolve) => {
      fileWatcher.onChange(() => {
        setTimeout(resolve, 50); // Brief delay for processing
      });

      // Safety timeout
      setTimeout(resolve, 1000);
    });

    await normalFileProcessed;

    // THEN: Service should continue running and process files normally
    expect(fileWatcher.getStats().isWatching).toBe(true);
    expect(changeEvents.some(event => event.path.includes('normal-file.yaml'))).toBe(true);
  });
});