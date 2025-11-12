# ATDD Checklist - Story 3.3: Hot Reload and File Watching

**Generated**: 2025-11-11
**Story ID**: 3.3
**Primary Test Level**: API Tests + Unit Tests
**Status**: Tests in RED Phase (Implementation Required)

---

## Story Summary

**As a developer**, I want **standards to update automatically when files change**, so that **the system stays current without manual intervention**.

This story implements real-time file watching with sub-100ms cache invalidation, concurrent change handling, error recovery, and atomic batch processing for the standards registry system.

---

## Acceptance Criteria Coverage

### AC1: Automatic File Change Detection ✅
**Given** file watching is enabled for standards directory
**When** a standards file is modified with new or updated rules
**Then** the changes are automatically detected and applied without service interruption

**Test Coverage**:
- ✅ API: `should detect file changes and apply updates automatically`
- ✅ Unit: `FileWatcherService - should detect file modifications with debounced change detection`
- ✅ Unit: `should filter files by extension patterns`

### AC2: Cache Invalidation Performance ✅
**Given** file watching detects changes to standards files
**When** the file system events are processed
**Then** the cache is invalidated appropriately within 100ms of file change detection

**Test Coverage**:
- ✅ API: `should invalidate cache within 100ms of file change detection`
- ✅ API: `should clear selective cache entries based on changed rules`
- ✅ Unit: `CacheInvalidationService - should invalidate cache within 100ms`

### AC3: Concurrent Change Consistency ✅
**Given** concurrent file changes occur during hot reload operations
**When** processing the file system events
**Then** the registry maintains consistency with no data loss or partial states

**Test Coverage**:
- ✅ API: `should maintain registry consistency during concurrent file changes`
- ✅ Unit: `HotReloadManager - should maintain registry consistency during concurrent file changes`
- ✅ Unit: `should detect and resolve conflicts for concurrent updates`

### AC4: Error Handling and Recovery ✅
**Given** invalid or malformed rule patterns are introduced via file changes
**When** the hot reload system attempts to apply updates
**Then** the system maintains registry consistency and provides clear error messages without service interruption

**Test Coverage**:
- ✅ API: `should handle invalid rule patterns gracefully`
- ✅ API: `should provide rollback on failed hot reload operations`
- ✅ Unit: `HotReloadManager - should validate rule patterns before registry updates`
- ✅ Unit: `should handle partial failures with service continuity`

### AC5: Service Continuity ✅
**Given** the system is under normal operation
**When** hot reload processes file changes
**Then** existing slash command operations and search functionality remain available with no performance degradation

**Test Coverage**:
- ✅ API: `should maintain slash command availability during hot reload`
- ✅ API: `should maintain search functionality during hot reload operations`
- ✅ Unit: `CacheInvalidationService - should handle performance degradation gracefully`

### AC6: Atomic Batch Processing ✅
**Given** multiple standards files are changed simultaneously
**When** the hot reload system processes the batch of changes
**Then** all changes are applied atomically with proper conflict resolution and rollback on failure

**Test Coverage**:
- ✅ API: `should apply multiple file changes atomically`
- ✅ API: `should provide proper conflict resolution for concurrent updates`
- ✅ Unit: `HotReloadManager - should provide atomic operations with rollback on failure`

---

## Test Files Created

### API Tests (Playwright)
- `tests/api/hot-reload.api.spec.ts` - 5 test suites covering all acceptance criteria
  - AC1: File change detection and automatic application
  - AC2: Cache invalidation performance and selectivity
  - AC3: Error handling and recovery mechanisms
  - AC4: Service continuity during operations
  - AC5: Atomic batch processing with conflict resolution

### Unit Tests (Bun)
- `tests/unit/utils/file-watcher.test.ts` - File watching service tests
  - File change detection with debouncing
  - File filtering by extension patterns
  - Recursive directory watching with depth limits
  - Performance and throttling under load
  - Error resilience and recovery

- `tests/unit/standards/hot-reload-manager.test.ts` - Hot reload orchestration tests
  - Concurrent change handling and consistency
  - Conflict detection and resolution
  - Atomic operations with rollback
  - Validation and error handling

- `tests/unit/utils/cache-invalidator.test.ts` - Cache invalidation service tests
  - Sub-100ms invalidation performance
  - Selective cache invalidation strategies
  - Batch processing under load
  - Performance during hot reload operations

---

## Data Infrastructure

### Factories Created
- `tests/support/factories/hot-reload-factory.ts` - Comprehensive factory for hot reload test data
  - File change events with realistic properties
  - Cache invalidation events with scope-based strategies
  - Hot reload operations with status tracking
  - Conflict resolution scenarios
  - Performance test data generators
  - Error scenario factories

### Fixtures Created
- `tests/support/fixtures/hot-reload.fixture.ts` - Test isolation and setup
  - Isolated test directories for file system operations
  - Standards registry with test database
  - Cache manager with persistence
  - File watcher service with configuration
  - Hot reload manager with rollback capabilities
  - Cache invalidation service with monitoring
  - Performance testing helpers
  - Error scenario simulation

---

## Required data-testid Attributes

Since this is a backend infrastructure story with no UI components, no `data-testid` attributes are required. All testing is performed through API endpoints, service interfaces, and file system operations.

---

## Mock Requirements for DEV Team

### File System Operations
```typescript
// File watching service should handle these file system events
interface FileSystemEvent {
  path: string;
  type: 'created' | 'modified' | 'deleted';
  timestamp: number;
  size?: number;
  checksum?: string;
}
```

### Cache Interface
```typescript
// Cache invalidation should support these operations
interface CacheInvalidationRequest {
  scope: {
    technology?: string;
    category?: string;
    pattern?: string;
  };
  strategy: 'selective' | 'full' | 'scope-based';
  maxTime: number; // 100ms target
}
```

### Registry Operations
```typescript
// Hot reload manager needs these registry operations
interface HotReloadOperation {
  id: string;
  type: 'add' | 'update' | 'delete';
  data: any;
  atomic: boolean;
  rollbackEnabled: boolean;
}
```

---

## Implementation Checklist

### FileWatcherService Implementation
- [ ] **Create `src/utils/file-watcher.ts`**
  - [ ] Implement file system event detection with debouncing
  - [ ] Add file filtering for standards-related extensions (.json, .yaml, .md)
  - [ ] Setup recursive directory watching with configurable depth limits
  - [ ] Add proper event throttling to prevent system overload
  - [ ] Implement error handling for permission issues and file system errors

### HotReloadManager Implementation
- [ ] **Create `src/standards/hot-reload-manager.ts`**
  - [ ] Integrate with existing StandardsRegistry for atomic rule updates
  - [ ] Implement conflict detection and resolution for concurrent changes
  - [ ] Add rollback mechanisms for failed hot reload operations
  - [ ] Create validation pipeline for rule patterns before registry updates
  - [ ] Support concurrent operations with proper synchronization

### CacheInvalidationService Implementation
- [ ] **Create `src/utils/cache-invalidator.ts`**
  - [ ] Integrate with existing cache-first architecture (Memory → SQLite → File)
  - [ ] Implement selective cache invalidation based on changed rules
  - [ ] Add performance monitoring to ensure <100ms cache invalidation targets
  - [ ] Create cache warming strategies for frequently accessed standards
  - [ ] Support batch invalidation operations

### HotReloadOrchestrator Implementation
- [ ] **Create `src/utils/hot-reload-orchestrator.ts`**
  - [ ] Coordinate between FileWatcher, HotReloadManager, and CacheInvalidation
  - [ ] Ensure service continuity during hot reload operations
  - [ ] Implement proper error handling and recovery procedures
  - [ ] Add comprehensive logging and audit trail for hot reload events
  - [ ] Provide health monitoring and performance metrics

### API Endpoints Implementation
- [ ] **Create hot reload API endpoints**
  - [ ] `POST /api/hot-reload/detect-changes` - Process individual file changes
  - [ ] `POST /api/hot-reload/process-batch` - Handle atomic batch operations
  - [ ] `POST /api/hot-reload/invalidate-cache` - Trigger cache invalidation
  - [ ] `GET /api/hot-reload/status` - Monitor hot reload system health
  - [ ] `GET /api/hot-reload/metrics` - Performance and operational metrics

### Integration with Existing Systems
- [ ] **Extend StandardsRegistry CRUD operations**
  - [ ] Add atomic update methods for hot reload integration
  - [ ] Implement conflict detection at registry level
  - [ ] Add rollback capabilities for failed operations
  - [ ] Integrate with existing validation system

- [ ] **Extend Cache Infrastructure**
  - [ ] Add invalidation triggers for file-based changes
  - [ ] Implement selective invalidation strategies
  - [ ] Add performance monitoring for cache operations
  - [ ] Integrate with existing cache warming mechanisms

### Error Handling and Recovery
- [ ] **Implement comprehensive error handling**
  - [ ] File system error recovery (permission issues, missing files)
  - [ ] Schema validation errors with clear messages
  - [ ] Concurrent modification conflict resolution
  - [ ] Partial operation rollback mechanisms
  - [ ] Graceful degradation under high load

### Performance Optimization
- [ ] **Ensure sub-100ms cache invalidation targets**
  - [ ] Optimize cache key lookup and invalidation algorithms
  - [ ] Implement batch processing for multiple changes
  - [ ] Add performance monitoring and alerting
  - [ ] Use efficient data structures for change tracking

- [ ] **Maintain service continuity**
  - [ ] Non-blocking file system operations
  - [ ] Asynchronous cache invalidation
  - [ ] Load balancing for concurrent operations
  - [ ] Resource pooling for frequent operations

### Testing and Validation
- [ ] **Run failing tests to verify RED phase**
  ```bash
  # API tests
  bun run test:e2e tests/api/hot-reload.api.spec.ts

  # Unit tests
  bun test tests/unit/utils/file-watcher.test.ts
  bun test tests/unit/standards/hot-reload-manager.test.ts
  bun test tests/unit/utils/cache-invalidator.test.ts
  ```

- [ ] **Verify all tests fail initially**
  - Tests should fail due to missing implementation, not test errors
  - Failure messages should be clear and actionable
  - All tests must be in RED phase before proceeding

---

## Red-Green-Refactor Workflow

### RED Phase ✅ (Complete)
- [x] All tests written and failing
- [x] Tests cover all acceptance criteria
- [x] Data factories and fixtures created
- [x] Mock requirements documented
- [x] Implementation checklist created

### GREEN Phase (DEV Team - Next Steps)
1. **Pick one failing test suite** (start with FileWatcherService)
2. **Implement minimal code** to make tests pass
3. **Run tests** to verify GREEN phase
4. **Move to next test suite** (HotReloadManager, then CacheInvalidatorService)
5. **Repeat** until all tests pass

### REFACTOR Phase (DEV Team - After GREEN)
1. **All tests passing** (GREEN phase complete)
2. **Improve code quality**
   - Extract common patterns
   - Optimize performance bottlenecks
   - Enhance error handling
   - Add comprehensive logging
3. **Ensure tests still pass** after each refactor
4. **Performance validation** against <100ms targets

---

## Running Tests

### All Tests
```bash
# Run API tests
bun run test:e2e tests/api/hot-reload.api.spec.ts

# Run all unit tests
bun test tests/unit/utils/file-watcher.test.ts
bun test tests/unit/standards/hot-reload-manager.test.ts
bun test tests/unit/utils/cache-invalidator.test.ts
```

### Individual Test Files
```bash
# File watcher service
bun test tests/unit/utils/file-watcher.test.ts

# Hot reload manager
bun test tests/unit/standards/hot-reload-manager.test.ts

# Cache invalidation service
bun test tests/unit/utils/cache-invalidator.test.ts

# API endpoint tests
bun run test:e2e tests/api/hot-reload.api.spec.ts
```

### Debug Mode
```bash
# Run with debugging information
bun test --debug tests/unit/utils/file-watcher.test.ts

# Run specific test case
bun test -t "should detect file modifications" tests/unit/utils/file-watcher.test.ts
```

---

## Performance Validation

After implementation, validate these performance targets:

### Cache Invalidation Performance
- **Target**: <100ms for cache invalidation
- **Test**: `should invalidate cache within 100ms of file change detection`
- **Command**: `bun test -t "100ms" tests/unit/utils/cache-invalidator.test.ts`

### Concurrent Operation Handling
- **Target**: No data loss or partial states under concurrent load
- **Test**: `should maintain registry consistency during concurrent file changes`
- **Command**: `bun test -t "concurrent" tests/unit/standards/hot-reload-manager.test.ts`

### Service Continuity
- **Target**: No performance degradation during hot reload operations
- **Test**: `should maintain slash command availability during hot reload`
- **Command**: `bun run test:e2e -t "service continuity" tests/api/hot-reload.api.spec.ts`

---

## Knowledge Base References Applied

- **Fixture Architecture**: Pure functions → fixture composition patterns
- **Data Factories**: Faker-based dynamic data with override patterns
- **Network-First**: Deterministic waiting patterns (adapted for cache operations)
- **Component TDD**: Red-green-refactor workflow adapted for service testing
- **Test Quality**: Sub-100ms performance targets, isolation, explicit assertions

---

## Next Steps for DEV Team

1. **Run failing tests** to confirm RED phase
2. **Review implementation checklist** for detailed requirements
3. **Implement FileWatcherService** first (foundation for other components)
4. **Follow RED → GREEN → REFACTOR** workflow for each component
5. **Validate performance targets** after each component is implemented
6. **Run integration tests** to verify end-to-end functionality
7. **Monitor system health** during development and testing

**Tests are ready and failing. Implementation can now begin with clear acceptance criteria and comprehensive test coverage.**