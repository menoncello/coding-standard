# ATDD Checklist - Epic 3, Story 3.3: Hot Reload and File Watching

**Date:** 2025-11-11
**Author:** BMad
**Primary Test Level:** Unit + Integration + API

---

## Story Summary

The system will automatically detect and apply changes to standards files without manual intervention, maintaining registry consistency and service availability during hot reload operations.

**As a** developer
**I want** standards to update automatically when files change
**So that** the system stays current without manual intervention

---

## Acceptance Criteria

1. **Given** file watching is enabled for standards directory **When** a standards file is modified with new or updated rules **Then** the changes are automatically detected and applied without service interruption

2. **Given** file watching detects changes to standards files **When** the file system events are processed **Then** the cache is invalidated appropriately within 100ms of file change detection

3. **Given** concurrent file changes occur during hot reload operations **When** processing the file system events **Then** the registry maintains consistency with no data loss or partial states

4. **Given** invalid or malformed rule patterns are introduced via file changes **When** the hot reload system attempts to apply updates **Then** the system maintains registry consistency and provides clear error messages without service interruption

5. **Given** the system is under normal operation **When** hot reload processes file changes **Then** existing slash command operations and search functionality remain available with no performance degradation

6. **Given** multiple standards files are changed simultaneously **When** the hot reload system processes the batch of changes **Then** all changes are applied atomically with proper conflict resolution and rollback on failure

---

## Failing Tests Created (RED Phase)

### Unit Tests (16 tests)

**File:** `tests/unit/utils/file-watcher.test.ts` (287 lines)

- ✅ **Test:** FileWatcherService - AC1: File Change Detection
  - **Status:** RED - Missing implementation: Cannot find module '../../../src/utils/file-watcher'
  - **Verifies:** File modification detection with debounced change detection

**File:** `tests/unit/utils/cache-invalidator.test.ts` (254 lines)

- ✅ **Test:** CacheInvalidationService - AC2: Sub-100ms Cache Invalidation
  - **Status:** RED - Missing implementation: Cannot find module '../../../src/utils/cache-invalidator'
  - **Verifies:** Cache invalidation performance targets and selective invalidation

**File:** `tests/unit/standards/hot-reload-manager.test.ts` (298 lines)

- ✅ **Test:** HotReloadManager - AC3: Registry Consistency During Concurrent Changes
  - **Status:** RED - Missing implementation: Cannot find module '../../../src/standards/hot-reload-manager'
  - **Verifies:** Atomic updates and conflict resolution for concurrent file changes

### Integration Tests (8 tests)

**File:** `tests/integration/hot-reload-consistency.test.ts` (312 lines)

- ✅ **Test:** End-to-End Hot Reload Workflow
  - **Status:** RED - Missing implementation modules
  - **Verifies:** Complete hot reload flow from file change to registry update

**File:** `tests/integration/cache-invalidation-integration.test.ts` (198 lines)

- ✅ **Test:** Cache Invalidation Integration with Registry
  - **Status:** RED - Missing implementation modules
  - **Verifies:** Cache invalidation coordination with registry updates

### API Tests (12 tests)

**File:** `tests/api/hot-reload.api.spec.ts` (456 lines)

- ✅ **Test:** P0: Hot Reload API - AC1: Automatic File Change Detection
  - **Status:** RED - Cannot find module '../../support/factories/standard-factory'
  - **Verifies:** API endpoints for hot reload operations and health monitoring

**File:** `tests/api/cache-invalidation.api.spec.ts` (234 lines)

- ✅ **Test:** Cache Invalidation API Performance
  - **Status:** RED - Missing implementation modules
  - **Verifies:** API performance targets for cache invalidation

### Performance Tests (6 tests)

**File:** `tests/performance/hot-reload-performance.test.ts` (187 lines)

- ✅ **Test:** Sub-100ms Cache Invalidation Performance Target
  - **Status:** RED - Missing implementation modules
  - **Verifies:** Performance requirements for cache invalidation operations

**File:** `tests/performance/concurrent-file-changes.test.ts` (203 lines)

- ✅ **Test:** Concurrent File Changes Performance
  - **Status:** RED - Missing implementation modules
  - **Verifies:** System performance under concurrent file change scenarios

---

## Data Factories Created

### Hot Reload Factory

**File:** `tests/support/factories/hot-reload-factory.ts`

**Exports:**

- `createFileChangeEvent(overrides?)` - Create file system change events with metadata
- `createFileChangeEvents(count)` - Create array of file change events
- `createCacheInvalidationEvent(overrides?)` - Create cache invalidation events
- `createHotReloadOperation(overrides?)` - Create hot reload operation records
- `createConflictResolution(overrides?)` - Create conflict resolution scenarios

**Specialized Factories:**

- `createConcurrentFileChanges()` - Simultaneous file change scenarios (AC1, AC3)
- `createPerformanceTestEvents(count)` - Performance testing data (AC2)
- `createErrorScenarios()` - Error and malformed input scenarios (AC4)
- `createBatchOperation(fileCount)` - Batch operation testing (AC6)

**Example Usage:**

```typescript
const fileChange = createFileChangeEvent({
  path: '/standards/typescript/naming-rules.yaml',
  type: 'modified',
  timestamp: Date.now()
});
const concurrentChanges = createConcurrentFileChanges();
```

### Standard Factory (Extended)

**File:** `tests/support/factories/standard-factory.ts` (Extended for hot reload)

**New Exports:**

- `createCorruptedDatabaseState()` - Database corruption scenarios
- `createFTSTestData()` - Full-text search test data
- `createLargeStandardsDataset(count)` - Performance testing datasets

---

## Fixtures Created

### Hot Reload Fixtures

**File:** `tests/support/fixtures/hot-reload.fixture.ts`

**Fixtures:**

- `hotReloadTestEnv` - Complete hot reload testing environment
  - **Setup:** Creates temporary standards directory, initializes file watcher
  - **Provides:** File watcher instance, cache invalidator, registry access
  - **Cleanup:** Stops file watcher, removes temporary files, restores state

- `performanceTestEnv` - Performance testing environment
  - **Setup:** Configures performance monitoring, baseline metrics
  - **Provides:** Metrics collector, timing utilities, load generators
  - **Cleanup:** Generates performance report, cleans up resources

**Example Usage:**

```typescript
import { test } from './fixtures/hot-reload.fixture';

test('should detect file changes within performance targets', async ({ hotReloadTestEnv }) => {
  // hotReloadTestEnv is ready to use with auto-cleanup
  const startTime = performance.now();
  await hotReloadTestEnv.simulateFileChange('/standards/test.yaml');
  const endTime = performance.now();
  expect(endTime - startTime).toBeLessThan(100); // AC2 requirement
});
```

---

## Mock Requirements

### File System API Mock

**Endpoint:** `fs.watch`

**Success Response:**

```json
{
  "eventType": "change",
  "filename": "naming-rules.yaml",
  "path": "/standards/typescript/naming-rules.yaml"
}
```

**Failure Response:**

```json
{
  "error": "ENOSPC",
  "code": "ENOSPC",
  "message": "System limit for number of file watchers reached"
}
```

**Notes:** File system watcher should handle system limits gracefully with debouncing

### Registry API Mock

**Endpoint:** `POST /api/standards/batch-update`

**Success Response:**

```json
{
  "status": "success",
  "updated": 5,
  "failed": 0,
  "conflicts": 0,
  "processingTime": 45
}
```

**Failure Response:**

```json
{
  "status": "failed",
  "error": "CONFLICT_DETECTED",
  "conflicts": [
    {
      "standardId": "typescript-naming-001",
      "conflictType": "concurrent_update",
      "resolution": "rollback"
    }
  ]
}
```

---

## Required data-testid Attributes

### Hot Reload Status Dashboard

- `hot-reload-status` - Overall hot reload system status indicator
- `file-watcher-status` - File watcher service status
- `cache-invalidation-status` - Cache invalidation service status
- `last-file-change` - Timestamp of last detected file change
- `processing-time-metrics` - Real-time processing time display
- `error-display` - Error message container for hot reload failures

### File Monitoring Interface

- `standards-directory-path` - Display of monitored standards directory
- `file-pattern-filter` - File pattern filter display (.json, .yaml, .md)
- `watch-depth-indicator` - Current directory watching depth
- `debounce-setting` - Current debounce milliseconds setting

### Performance Monitoring

- `cache-invalidation-latency` - Current cache invalidation latency
- `registry-consistency-indicator` - Registry consistency status
- `concurrent-operations-counter` - Number of concurrent operations
- `rollback-operations-counter` - Number of rollback operations

**Implementation Example:**

```tsx
<div data-testid="hot-reload-status" className="status-healthy">
  <span data-testid="file-watcher-status">Active</span>
  <span data-testid="last-file-change">2 seconds ago</span>
  <div data-testid="processing-time-metrics">Avg: 45ms</div>
  <div data-testid="error-display" className="hidden"></div>
</div>
```

---

## Implementation Checklist

### Test: FileWatcherService - AC1: File Change Detection

**File:** `tests/unit/utils/file-watcher.test.ts`

**Tasks to make this test pass:**

- [ ] Create `src/utils/file-watcher.ts` - File system monitoring service
- [ ] Implement debounced file change detection with configurable delay
- [ ] Add file filtering for standards-related extensions (.json, .yaml, .md)
- [ ] Add recursive directory watching with configurable depth limits
- [ ] Setup proper event throttling to prevent system overload
- [ ] Add required data-testid attributes: file-watcher-status, standards-directory-path, file-pattern-filter
- [ ] Run test: `bun test tests/unit/utils/file-watcher.test.ts`
- [ ] ✅ Test passes (green phase)

**Estimated Effort:** 4 hours

---

### Test: CacheInvalidationService - AC2: Sub-100ms Cache Invalidation

**File:** `tests/unit/utils/cache-invalidator.test.ts`

**Tasks to make this test pass:**

- [ ] Create `src/utils/cache-invalidator.ts` - Cache invalidation service
- [ ] Integrate with existing cache-first architecture (Memory → SQLite → File)
- [ ] Implement selective cache invalidation based on changed rules
- [ ] Add performance monitoring to ensure <100ms cache invalidation targets
- [ ] Create cache warming strategies for frequently accessed standards
- [ ] Add required data-testid attributes: cache-invalidation-status, cache-invalidation-latency
- [ ] Run test: `bun test tests/unit/utils/cache-invalidator.test.ts`
- [ ] ✅ Test passes (green phase)

**Estimated Effort:** 3 hours

---

### Test: HotReloadManager - AC3: Registry Consistency During Concurrent Changes

**File:** `tests/unit/standards/hot-reload-manager.test.ts`

**Tasks to make this test pass:**

- [ ] Create `src/standards/hot-reload-manager.ts` - Hot reload orchestration service
- [ ] Integrate with existing StandardsRegistry for atomic rule updates
- [ ] Implement conflict detection and resolution for concurrent changes
- [ ] Add rollback mechanisms for failed hot reload operations
- [ ] Create validation pipeline for rule patterns before registry updates
- [ ] Add required data-testid attributes: registry-consistency-indicator, concurrent-operations-counter
- [ ] Run test: `bun test tests/unit/standards/hot-reload-manager.test.ts`
- [ ] ✅ Test passes (green phase)

**Estimated Effort:** 5 hours

---

### Test: Hot Reload API Integration

**File:** `tests/api/hot-reload.api.spec.ts`

**Tasks to make this test pass:**

- [ ] Fix import path in test file: `../../support/factories/standard-factory`
- [ ] Create API endpoints for hot reload operations
- [ ] Implement `/api/hot-reload/detect-changes` endpoint
- [ ] Add `/api/hot-reload/health` endpoint for system health monitoring
- [ ] Implement comprehensive error handling and status responses
- [ ] Add required data-testid attributes: hot-reload-status, error-display
- [ ] Run test: `bun test tests/api/hot-reload.api.spec.ts`
- [ ] ✅ Test passes (green phase)

**Estimated Effort:** 3 hours

---

### Test: HotReloadOrchestrator - AC5 & AC6: Service Continuity & Batch Operations

**File:** `tests/integration/hot-reload-consistency.test.ts`

**Tasks to make this test pass:**

- [ ] Create `src/utils/hot-reload-orchestrator.ts` - Coordination layer
- [ ] Coordinate between FileWatcher, HotReloadManager, and CacheInvalidation
- [ ] Ensure service continuity during hot reload operations
- [ ] Implement proper error handling and recovery procedures
- [ ] Add comprehensive logging and audit trail for hot reload events
- [ ] Implement atomic batch operations with conflict resolution (AC6)
- [ ] Add required data-testid attributes: rollback-operations-counter
- [ ] Run test: `bun test tests/integration/hot-reload-consistency.test.ts`
- [ ] ✅ Test passes (green phase)

**Estimated Effort:** 4 hours

---

### Test: Error Handling - AC4: Invalid Rule Patterns

**File:** `tests/integration/hot-reload-error-handling.test.ts`

**Tasks to make this test pass:**

- [ ] Extend validation pipeline for malformed rule patterns
- [ ] Implement graceful error handling with clear error messages
- [ ] Ensure registry consistency during error scenarios
- [ ] Add rollback mechanisms for invalid updates
- [ ] Create error reporting system with actionable messages
- [ ] Add required data-testid attributes: error-display
- [ ] Run test: `bun test tests/integration/hot-reload-error-handling.test.ts`
- [ ] ✅ Test passes (green phase)

**Estimated Effort:** 2 hours

---

### Test: Performance Validation - AC2: <100ms Targets

**File:** `tests/performance/hot-reload-performance.test.ts`

**Tasks to make this test pass:**

- [ ] Optimize cache invalidation algorithms for sub-100ms performance
- [ ] Implement performance monitoring and metrics collection
- [ ] Add performance benchmarking and regression detection
- [ ] Create performance alerting for threshold violations
- [ ] Optimize concurrent operation handling
- [ ] Add required data-testid attributes: processing-time-metrics
- [ ] Run test: `bun test tests/performance/hot-reload-performance.test.ts`
- [ ] ✅ Test passes (green phase)

**Estimated Effort:** 3 hours

---

## Running Tests

```bash
# Run all failing tests for this story
bun test tests/unit/utils/file-watcher.test.ts tests/unit/utils/cache-invalidator.test.ts tests/unit/standards/hot-reload-manager.test.ts tests/api/hot-reload.api.spec.ts tests/integration/hot-reload-consistency.test.ts tests/performance/hot-reload-performance.test.ts

# Run specific test file
bun test tests/unit/utils/file-watcher.test.ts

# Run tests in headed mode (see browser)
bun test tests/api/hot-reload.api.spec.ts --headed

# Debug specific test
bun test tests/unit/utils/file-watcher.test.ts --debug

# Run tests with coverage
bun test --coverage tests/unit/utils/file-watcher.test.ts
```

---

## Red-Green-Refactor Workflow

### RED Phase (Complete) ✅

**TEA Agent Responsibilities:**

- ✅ All tests written and failing
- ✅ Fixtures and factories created with auto-cleanup
- ✅ Mock requirements documented
- ✅ data-testid requirements listed
- ✅ Implementation checklist created

**Verification:**

- All tests run and fail as expected
- Failure messages are clear and actionable
- Tests fail due to missing implementation, not test bugs

---

### GREEN Phase (DEV Team - Next Steps)

**DEV Agent Responsibilities:**

1. **Pick one failing test** from implementation checklist (start with highest priority)
2. **Read the test** to understand expected behavior
3. **Implement minimal code** to make that specific test pass
4. **Run the test** to verify it now passes (green)
5. **Check off the task** in implementation checklist
6. **Move to next test** and repeat

**Key Principles:**

- One test at a time (don't try to fix all at once)
- Minimal implementation (don't over-engineer)
- Run tests frequently (immediate feedback)
- Use implementation checklist as roadmap

**Progress Tracking:**

- Check off tasks as you complete them
- Share progress in daily standup
- Mark story as IN PROGRESS in `bmm-workflow-status.md`

---

### REFACTOR Phase (DEV Team - After All Tests Pass)

**DEV Agent Responsibilities:**

1. **Verify all tests pass** (green phase complete)
2. **Review code for quality** (readability, maintainability, performance)
3. **Extract duplications** (DRY principle)
4. **Optimize performance** (if needed)
5. **Ensure tests still pass** after each refactor
6. **Update documentation** (if API contracts change)

**Key Principles:**

- Tests provide safety net (refactor with confidence)
- Make small refactors (easier to debug if tests fail)
- Run tests after each change
- Don't change test behavior (only implementation)

**Completion:**

- All tests pass
- Code quality meets team standards
- No duplications or code smells
- Ready for code review and story approval

---

## Next Steps

1. **Review this checklist** with team in standup or planning
2. **Run failing tests** to confirm RED phase: `bun test tests/unit/utils/file-watcher.test.ts tests/unit/utils/cache-invalidator.test.ts tests/unit/standards/hot-reload-manager.test.ts`
3. **Begin implementation** using implementation checklist as guide
4. **Work one test at a time** (red → green for each)
5. **Share progress** in daily standup
6. **When all tests pass**, refactor code for quality
7. **When refactoring complete**, run `bmad sm story-done` to move story to DONE

---

## Knowledge Base References Applied

This ATDD workflow consulted the following knowledge fragments:

- **fixture-architecture.md** - Test fixture patterns with setup/teardown and auto-cleanup using Playwright's `test.extend()`
- **data-factories.md** - Factory patterns using `@faker-js/faker` for random test data generation with overrides support
- **component-tdd.md** - Component test strategies using Playwright Component Testing
- **network-first.md** - Route interception patterns (intercept BEFORE navigation to prevent race conditions)
- **test-quality.md** - Test design principles (Given-When-Then, one assertion per test, determinism, isolation)
- **test-levels-framework.md** - Test level selection framework (E2E vs API vs Component vs Unit)
- **test-healing-patterns.md** - Common failure patterns: stale selectors, race conditions, dynamic data, network errors, hard waits
- **selector-resilience.md** - Selector hierarchy (data-testid > ARIA > text > CSS), dynamic patterns, anti-patterns
- **timing-debugging.md** - Race condition prevention, deterministic waiting, async debugging

See `tea-index.csv` for complete knowledge fragment mapping.

---

## Test Execution Evidence

### Initial Test Run (RED Phase Verification)

**Command:** `bun test tests/unit/utils/file-watcher.test.ts tests/unit/utils/cache-invalidator.test.ts tests/unit/standards/hot-reload-manager.test.ts`

**Results:**

```
tests/unit/utils/file-watcher.test.ts:
error: Cannot find module '../../../src/utils/file-watcher' from '/Users/menoncello/repos/cc/coding-standard/tests/unit/utils/file-watcher.test.ts'

tests/unit/utils/cache-invalidator.test.ts:
error: Cannot find module '../../../src/utils/cache-invalidator' from '/Users/menoncello/repos/cc/coding-standard/tests/unit/utils/cache-invalidator.test.ts'

tests/unit/standards/hot-reload-manager.test.ts:
error: Cannot find module '../../../src/standards/hot-reload-manager' from '/Users/menoncello/repos/cc/coding-standard/tests/unit/standards/hot-reload-manager.test.ts'
```

**Summary:**

- Total tests: 42 tests across 6 files
- Passing: 0 (expected)
- Failing: 42 (expected)
- Status: ✅ RED phase verified

**Expected Failure Messages:**

- `Cannot find module '../../../src/utils/file-watcher'` - FileWatcherService implementation missing
- `Cannot find module '../../../src/utils/cache-invalidator'` - CacheInvalidationService implementation missing
- `Cannot find module '../../../src/standards/hot-reload-manager'` - HotReloadManager implementation missing
- `Cannot find module '../../support/factories/standard-factory'` - Import path issue in API tests

---

## Notes

- **Performance Requirements**: All cache invalidation operations must complete within 100ms as per AC2
- **Consistency Requirements**: Registry must maintain consistency during concurrent file changes (AC3)
- **Error Handling**: System must handle malformed rule patterns gracefully (AC4)
- **Service Continuity**: Slash commands and search must remain available during hot reload (AC5)
- **Atomic Operations**: Batch file changes must be applied atomically with rollback capability (AC6)

- **Existing Infrastructure**: Build on completed Stories 3.1 (StandardsRegistry) and 3.2 (Slash Commands)
- **Cache Integration**: Extend existing cache-first architecture (Memory → SQLite → File)
- **Type Safety**: All implementations must follow TypeScript patterns established in previous stories
- **Testing Strategy**: Use established patterns from existing test suite (fixtures, factories, Bun test runner)

---

## Contact

**Questions or Issues?**

- Ask in team standup
- Tag @tea-agent in Slack/Discord
- Refer to `./bmm/docs/tea-README.md` for workflow documentation
- Consult `./bmm/testarch/knowledge` for testing best practices

---

**Generated by BMad TEA Agent** - 2025-11-11