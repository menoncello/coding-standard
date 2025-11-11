# Story 3.1: Standards Registry System

Status: done

## Story

As a **developer**,
I want **a semantic rule naming system**,
so that **I can reference standards using intuitive names instead of complex patterns**.

## Acceptance Criteria

1. **Given** the standards registry is initialized
**When** I add a new standard with semantic name "react-component-naming" and pattern "^[A-Z][a-zA-Z0-9]*$"
**Then** the standard is stored with all required metadata (description, category, technology, severity, examples)

2. **Given** a standard is stored in the registry
**When** I retrieve it by its semantic name
**Then** the response time is under 30ms and all metadata is returned

3. **Given** multiple standards are stored
**When** I search by category or technology
**Then** relevant standards are returned with sub-30ms response times

4. **Given** I add a standard with the same semantic name as an existing one
**When** the registry processes the request
**Then** it provides a clear error message about the conflict

5. **Given** I add invalid metadata or patterns
**When** the registry processes the request
**Then** it validates inputs and provides specific error messages

## Tasks / Subtasks

- [x] Implement StandardsRegistry core data structures (AC: 1, 2)
  - [x] Create StandardRule interface and registry schema
  - [x] Implement in-memory and SQLite persistence layers
  - [x] Add CRUD operations with proper error handling
- [x] Develop SemanticNamingService for name resolution (AC: 1, 2, 3)
  - [x] Implement exact match and fuzzy search algorithms
  - [x] Add categorization and filtering capabilities
  - [x] Integrate with cache layer for performance
- [x] Create StandardValidator for input validation (AC: 4, 5)
  - [x] Implement regular expression validation and ReDoS prevention
  - [x] Add metadata validation with clear error messages
  - [x] Create conflict detection for duplicate semantic names
- [x] Implement performance optimization and caching (AC: 2, 3)
  - [x] Add memory cache for frequently accessed standards
  - [x] Integrate with existing SQLite cache infrastructure
  - [x] Ensure sub-30ms response times for all operations
- [x] Create comprehensive test suite (AC: 1, 2, 3, 4, 5)
  - [x] Unit tests for all registry operations
  - [x] Integration tests for end-to-end workflows
  - [x] Performance tests to validate sub-30ms targets
  - [x] Security tests for input validation and ReDoS prevention
- [x] Address NFR Assessment HIGH Priority Issues
  - [x] Update vulnerable dependencies (@stryker-mutator/util and semver)
  - [x] Implement CI burn-in testing for cache components
  - [x] Add dependency overrides to patch transitive vulnerabilities
  - [x] Create GitHub Actions workflow for automated burn-in testing

## Dev Notes

### Architecture Patterns and Constraints

- **Cache-First Architecture**: All registry operations must follow the Memory → SQLite → File system pattern established in Epic 1
- **Performance Targets**: Sub-30ms response times for standard retrieval, sub-50ms for addition/modification operations
- **Data Model Alignment**: Use StandardRule interface from tech spec with all required metadata fields
- **Error Handling**: Follow established error handling patterns from MCP server architecture with structured error responses

### Source Tree Components to Touch

**New Components** (following unified project structure):
- `src/standards/registry.ts` - Core StandardsRegistry implementation
- `src/standards/semantic-naming.ts` - SemanticNamingService for name resolution
- `src/standards/validator.ts` - StandardValidator for input validation
- `src/standards/types.ts` - TypeScript interfaces and type definitions
- `tests/unit/standards/registry.test.ts` - Unit tests for registry operations
- `tests/integration/standards-system.test.ts` - Integration tests

**Modified Components**:
- `src/mcp/handlers/toolHandlers.ts` - Extended with StandardsRegistry integration and new registry management tools
- `src/mcp/server.ts` - Updated with new MCP tools: addStandard, removeStandard, getRegistryStats
- `src/types/mcp.ts` - Added type definitions for registry management tools
- `seed-standards.js` - Created seeding script with comprehensive default standards
- `STANDARDS_REGISTRY_INTEGRATION.md` - Complete integration documentation

### Testing Standards Summary

- **Unit Testing**: Bun test runner with >95% line coverage requirement
- **Performance Testing**: Load tests with 1,000+ standards to validate sub-30ms targets
- **Security Testing**: Input validation and ReDoS attack prevention testing
- **Integration Testing**: End-to-end tests with MCP protocol integration

### Project Structure Notes

**Alignment with Unified Project Structure**:
- Follow established `src/standards/` module organization pattern
- Use TypeScript interfaces in `types.ts` for clear type definitions
- Implement proper separation of concerns with dedicated service classes
- Adhere to established naming conventions (PascalCase for classes, camelCase for methods)

**Dependencies Integration**:
- Leverage existing SQLite database infrastructure from Epic 1
- Extend cache layer rather than creating new caching system
- Integrate with existing audit logging and monitoring systems

### References

- [Source: bmad-ephemeral/stories/tech-spec-epic-3.md#Detailed-Design] - Complete technical specification and service definitions
- [Source: docs/epics.md#Epic-3] - Epic requirements and story breakdown
- [Source: docs/PRD.md] - Business requirements and performance targets
- [Source: docs/architecture.md] - System architecture constraints and patterns
- [Source: docs/test-architecture.md] - Testing framework requirements and standards

## Dev Agent Record

### Implementation Summary

✅ **IMPLEMENTATION COMPLETED** - All acceptance criteria fulfilled with sub-30ms performance targets.

### Context Reference

- bmad-ephemeral/stories/3-1-standards-registry-system.context.xml

### Agent Model Used

Claude Sonnet 4.5

### Debug Log References

### Completion Notes List

1. ✅ **AC1: Standards Storage** - Implemented complete rule storage with all required metadata (description, category, technology, severity, examples)
2. ✅ **AC2: Sub-30ms Retrieval** - Achieved semantic name resolution under 30ms using Memory → SQLite architecture
3. ✅ **AC3: Sub-30ms Search** - Implemented fast search with category/technology filtering under 30ms
4. ✅ **AC4: Conflict Detection** - Clear error messages for semantic name conflicts
5. ✅ **AC5: Input Validation** - Comprehensive validation with specific error messages and ReDoS protection
6. ✅ **MCP Integration** - Successfully integrated registry with existing MCP server infrastructure
7. ✅ **Backward Compatibility** - All existing MCP clients continue to work without changes
8. ✅ **New MCP Tools** - Added addStandard, removeStandard, and getRegistryStats tools for dynamic registry management
9. ✅ **NFR Security Fix** - Updated @stryker-mutator/util to v9.3.0 and semver to v7.7.3 with dependency overrides, resolving HIGH priority vulnerabilities
10. ✅ **NFR Reliability Fix** - Implemented comprehensive CI burn-in testing with GitHub Actions workflow (.github/workflows/cache-burn-in.yml)
11. ✅ **Local Burn-in Testing** - Added cache-burn-in.sh script with 10-iteration stability testing for cache components
12. ✅ **Performance Monitoring** - Added burn-in performance metrics collection with sub-30ms target validation

### File List

**New Implementation Files:**
- `src/standards/types.ts` - Complete type definitions for StandardRule, SearchQuery, ValidationResult
- `src/standards/registry.ts` - Core StandardsRegistry with SQLite persistence and caching
- `src/standards/validator.ts` - StandardValidator with conflict detection and ReDoS prevention
- `src/standards/semantic-naming.ts` - SemanticNamingService with fuzzy search and performance optimization
- `tests/unit/standards/registry.test.ts` - Comprehensive unit tests (44 tests)
- `tests/unit/standards/validator.test.ts` - Validation and conflict detection tests
- `tests/unit/standards/semantic-naming.test.ts` - Search and naming service tests
- `tests/integration/standards-system.test.ts` - End-to-end integration tests
- `tests/performance/registry-performance.test.ts` - Performance validation tests (sub-30ms targets)

**Key Features Implemented:**
- **Cache-First Architecture**: Memory → SQLite → File system with TTL and LRU eviction
- **Semantic Name Resolution**: Exact match, fuzzy matching, and alias support
- **Advanced Search**: Multi-field search with relevance scoring and caching
- **Conflict Detection**: Semantic name, pattern, and alias conflict prevention
- **Performance Optimization**: Sub-30ms response times with comprehensive monitoring
- **Input Validation**: Regex validation with ReDoS attack prevention
- **MCP Integration Ready**: Compatible interfaces for tool handler integration

### Architecture Compliance

✅ **Cache-First Pattern**: All operations follow Memory → SQLite pattern established in Epic 1
✅ **Performance Targets**: Sub-30ms retrieval and search validated
✅ **Error Handling**: Structured error responses following MCP patterns
✅ **Type Safety**: Comprehensive TypeScript interfaces and validation

### Test Coverage

- **44 Unit Tests**: Complete registry, validator, and semantic naming coverage
- **Integration Tests**: End-to-end workflows with database persistence
- **Performance Tests**: Sub-30ms targets validated under load
- **Security Tests**: ReDoS protection and input validation verified

### MCP Server Integration

**Updated MCP Infrastructure:**
- **Tool Handlers**: Extended `src/mcp/handlers/toolHandlers.ts` with StandardsRegistry integration
- **Server Updates**: Updated `src/mcp/server.ts` to handle new registry management tools
- **Type Extensions**: Enhanced `src/types/mcp.ts` with comprehensive tool schemas
- **Backward Compatibility**: All existing MCP tools (getStandards, searchStandards, validateCode) now use registry automatically

**New MCP Tools:**
- `addStandard` - Dynamically add new coding standards to the registry
- `removeStandard` - Remove standards from the registry with conflict checking
- `getRegistryStats` - Get comprehensive registry statistics and performance metrics

**Integration Documentation:**
- Created `STANDARDS_REGISTRY_INTEGRATION.md` with complete usage guide
- Added `seed-standards.js` script for populating registry with default standards
- Performance targets validated: All operations under 30ms as required

**NFR Compliance Files:**
- `.github/workflows/cache-burn-in.yml` - GitHub Actions workflow for automated cache burn-in testing
- `scripts/cache-burn-in.sh` - Local burn-in testing script with configurable iterations
- `package.json` - Updated with dependency overrides and burn-in scripts
- Security vulnerabilities resolved through dependency management

**Usage Examples:**
```bash
# Add new standard via MCP
mcp call addStandard '{"semanticName": "custom-rule", "pattern": "^[A-Z][a-z]*$", "description": "Custom naming rule"}'

# Get registry statistics
mcp call getRegistryStats '{}'

# Existing tools work with registry automatically
mcp call searchStandards '{"query": "typescript naming", "technology": "typescript"}'
```