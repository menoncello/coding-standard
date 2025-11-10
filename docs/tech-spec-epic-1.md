# Epic Technical Specification: Core MCP Server Infrastructure

Date: 2025-11-09
Author: BMad
Epic ID: 1
Status: Draft

---

## Overview

The Core MCP Server Infrastructure epic establishes the foundational high-performance server that enables instant access
to coding standards through the Model Context Protocol. This epic implements the core caching layer, database
integration, and real-time validation capabilities that provide sub-50ms response times, leveraging Bun's native SQLite
support and ultra-fast performance characteristics. The server serves as the backbone for all subsequent features,
providing standardized access to coding standards through both MCP protocol and CLI interfaces.

## Objectives and Scope

### In Scope

- Build Bun-native MCP server with stdio communication using @modelcontextprotocol/sdk
- Implement SQLite-backed persistent caching with WAL mode for optimal performance
- Create full-text search capabilities using SQLite FTS5 virtual tables
- Develop real-time validation engine for code against established standards
- Establish multi-layer caching architecture (memory → SQLite → file system)
- Implement concurrent request handling without performance degradation
- Create standards retrieval by technology, category, and semantic search
- Establish performance monitoring and analytics collection infrastructure

### Out of Scope

- CLI interface implementation (covered in Epic 2)
- Tool-specific configuration detection (BiomeJS, ESLint, TypeScript - covered in Epic 4)
- Web dashboard implementation (covered in Epic 5)
- Semantic rule naming system (covered in Epic 3)
- Cross-tool standardization and conflict resolution (covered in Epic 4)

## System Architecture Alignment

This epic aligns with the architecture's core performance-first principles by leveraging Bun's native capabilities and
SQLite integration. The implementation follows the established MCP server pattern in `src/mcp/` with shared caching
layer in `src/cache/` and database operations in `src/database/`. The server utilizes the cache-first pattern ensuring
all data access flows through the multi-layer caching system, and implements standardized error handling through the
error utilities in `src/utils/`. This infrastructure provides the foundation for all subsequent epics, enabling the
ultra-fast performance targets (sub-50ms response times) defined in the PRD.

## Detailed Design

### Services and Modules

**MCP Server Core (`src/mcp/server.ts`)**

- Responsibilities: Main server lifecycle, stdio communication, request routing
- Inputs: MCP protocol messages from Claude Code
- Outputs: Structured responses with coding standards data
- Owner: Story 1.1

**Cache Manager (`src/cache/cache-manager.ts`)**

- Responsibilities: Multi-layer caching orchestration, LRU eviction, TTL management
- Inputs: Standard retrieval requests, cache invalidation events
- Outputs: Cached standards data, cache statistics
- Owner: Story 1.3

**Database Layer (`src/database/`)**

- Responsibilities: SQLite connection management, schema migrations, query optimization
- Inputs: Cache miss requests, analytics data, search indexes
- Outputs: Persistent standards storage, search results
- Owner: Story 1.2

**Search Engine (`src/cache/search-index.ts`)**

- Responsibilities: FTS5 query processing, semantic search, result ranking
- Inputs: Search queries, filter criteria
- Outputs: Ranked search results with relevance scores
- Owner: Story 1.2

**Performance Monitor (`src/utils/performance.ts`)**

- Responsibilities: Response time tracking, memory monitoring, alerting
- Inputs: All operation timing data, resource usage metrics
- Outputs: Performance reports, threshold violations
- Owner: Story 1.3

### Data Models and Contracts

**Standards Cache Schema**

```sql
CREATE TABLE standards_cache (
  key TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  accessed_at INTEGER NOT NULL,
  access_count INTEGER DEFAULT 1,
  ttl INTEGER
);

CREATE VIRTUAL TABLE standards_search USING fts5(
  title, content, category, technology, rule_name
);
```

**Core Data Types**

```typescript
interface StandardRule {
  id: string;
  name: string;
  category: string;
  technology: string;
  description: string;
  pattern: string | RegExp;
  severity: 'error' | 'warning' | 'info';
  tags: string[];
  examples: CodeExample[];
  relatedRules: string[];
}

interface CacheEntry {
  key: string;
  data: StandardRule[];
  createdAt: Date;
  accessedAt: Date;
  accessCount: number;
  ttl: number;
}

interface SearchResult {
  rule: StandardRule;
  relevanceScore: number;
  matchHighlights: string[];
}
```

### APIs and Interfaces

**MCP Tool: getStandards**

```typescript
interface GetStandardsRequest {
  technology?: string;
  category?: string;
  context?: string;
  useCache?: boolean;
}

interface GetStandardsResponse {
  standards: StandardRule[];
  cached: boolean;
  responseTime: number;
  total: number;
}
```

**MCP Tool: searchStandards**

```typescript
interface SearchStandardsRequest {
  query: string;
  technology?: string;
  fuzzy?: boolean;
  limit?: number;
}

interface SearchStandardsResponse {
  results: SearchResult[];
  total: number;
  queryTime: number;
  suggestions?: string[];
}
```

**MCP Tool: validateCode**

```typescript
interface ValidateCodeRequest {
  code: string;
  language: string;
  useStrict?: boolean;
  rules?: string[];
}

interface ValidateCodeResponse {
  violations: RuleViolation[];
  summary: ValidationSummary;
  processingTime: number;
}
```

### Workflows and Sequencing

**Standard Retrieval Sequence**

1. Client sends getStandards request to MCP server
2. Server checks in-memory cache first (sub-5ms response)
3. On cache miss, checks SQLite persistent cache (sub-20ms response)
4. On SQLite miss, loads from file system standards (sub-50ms response)
5. Updates all cache layers with LRU eviction strategy
6. Returns formatted response with cache metadata

**Search Query Processing**

1. Client submits search query with optional filters
2. Server parses query and extracts search terms
3. Executes FTS5 query against search index with BM25 ranking
4. Applies technology and category filters
5. Ranks results by relevance score and access frequency
6. Returns top N results with match highlights

**Code Validation Workflow**

1. Client submits code snippet with language specification
2. Server parses code and extracts relevant patterns
3. Matches patterns against applicable standards rules
4. Generates violation reports with line numbers and suggestions
5. Aggregates violations by severity and category
6. Returns validation summary with fix recommendations

## Non-Functional Requirements

### Performance

**Response Time Targets**

- Standard retrieval: < 50ms (target: 30ms for cached, 45ms for uncached)
- Search queries: < 100ms (target: 50ms for FTS5 queries)
- Code validation: < 500ms for typical files (<1000 lines)
- Server startup: < 100ms (target: 50ms with warm cache)
- Concurrent request handling: Maintain <50ms average under 10 concurrent requests

**Resource Utilization**

- Memory usage: < 50MB during normal operation (including all cache layers)
- CPU usage: < 10% during idle, < 50% during peak operations
- Disk usage: < 100MB for complete installation including persistent cache
- SQLite performance: WAL mode for optimal read/write concurrency

**Cache Performance Metrics**

- Memory cache hit rate: > 80% for frequently accessed standards
- SQLite cache hit rate: > 60% for secondary access patterns
- Cache eviction overhead: < 5ms for LRU operations
- Cold start penalty: < 200ms to populate initial cache layers

### Security

**Input Validation and Sanitization**

- All MCP protocol inputs validated against JSON schemas
- SQL injection prevention through parameterized queries only
- File path sanitization to prevent directory traversal attacks
- Regular expression validation for user-defined patterns

**Code Execution Safety**

- No arbitrary code execution from user inputs or standards patterns
- Custom rule validation in sandboxed environment before acceptance
- Principle of least privilege for all database and file system operations
- Secure temporary file handling with automatic cleanup

**Data Protection**

- All processing performed locally with no external data transmission
- Optional anonymous usage analytics with explicit user consent
- Secure configuration file handling with validation
- No persistent storage of sensitive user code or data

### Reliability/Availability

**Error Handling and Recovery**

- Graceful degradation when cache layers fail (fallback to file system)
- Automatic SQLite database recovery on corruption
- Retry logic for transient failures with exponential backoff
- Comprehensive error logging without exposing sensitive information

**Data Integrity**

- ACID compliance for SQLite transactions
- Atomic cache updates to prevent partial state corruption
- Checksum validation for cached data integrity
- Automatic cache repair on detection of corruption

**Fault Tolerance**

- Server remains operational during cache rebuilds
- Graceful handling of malformed standards definitions
- Timeout protection for all operations to prevent hanging
- Resource limits to prevent memory exhaustion attacks

### Observability

**Logging and Monitoring**

- Structured JSON logging with correlation IDs for request tracing
- Performance metrics collection (response times, cache hit rates, error rates)
- Resource usage monitoring (memory, CPU, disk I/O)
- Health check endpoints for external monitoring systems

**Performance Analytics**

- Real-time response time tracking with percentile distributions
- Cache efficiency metrics by technology and category
- Query pattern analysis for optimization opportunities
- Automatic performance regression detection

**Debugging Support**

- Detailed error messages with actionable resolution steps
- Request/response logging at configurable verbosity levels
- Cache state inspection tools for troubleshooting
- Performance profiling hooks for optimization analysis

## Dependencies and Integrations

### Core Runtime Dependencies

**Bun Runtime (>=1.0.0)**

- Purpose: Primary runtime environment with native performance optimizations
- Integration: Direct usage of Bun's built-in SQLite, file system APIs, and HTTP server
- Version Constraints: >=1.0.0 for stable SQLite integration and performance features
- Rationale: Provides 3-4x performance improvement over Node.js with zero dependencies

**TypeScript (5.0+)**

- Purpose: Type safety and enhanced developer experience
- Integration: Built into Bun runtime with strict type checking enabled
- Version Constraints: 5.0+ for modern ES2022+ features and improved type inference
- Rationale: Ensures code quality and maintainability for complex caching logic

**@modelcontextprotocol/sdk (0.5.0)**

- Purpose: Claude Code integration through standardized MCP protocol
- Integration: Core MCP server implementation with stdio communication
- Version Constraints: 0.5.0 for stable API and tool discovery capabilities
- Rationale: Provides standardized protocol for seamless Claude Code integration

### Database and Storage

**SQLite (Built-in to Bun)**

- Purpose: Persistent caching layer with full-text search capabilities
- Integration: WAL mode for optimal read/write concurrency, FTS5 virtual tables
- Version Constraints: Bun's built-in version (currently 3.44+)
- Rationale: Zero dependencies, ACID compliance, and excellent performance for embedded use

**File System APIs**

- Purpose: Standards file loading and configuration management
- Integration: Bun.file() API for zero-copy file operations
- Version Constraints: Bun native implementation
- Rationale: 2-4x faster than Node.js fs operations with better memory efficiency

### Development and Testing Dependencies

**Bun Test Runner (Built-in)**

- Purpose: Unit and integration testing with TypeScript support
- Integration: Native test execution with coverage reporting
- Version Constraints: Bun built-in version
- Rationale: Fast test execution with built-in mocking and assertion libraries

**Bun Types (Development)**

- Purpose: TypeScript definitions for Bun APIs
- Integration: Type definitions for Bun-specific APIs and global functions
- Version Constraints: Matches Bun runtime version
- Rationale: Ensures type safety when using Bun-specific features

### Integration Dependencies (Future Epics)

**BiomeJS Integration (Planned Epic 4)**

- Purpose: Configuration detection and rule mapping
- Integration: Configuration file parsing and rule equivalence mapping
- Version Constraints: Latest stable version
- Rationale: Leading performance-focused linter and formatter

**ESLint Integration (Planned Epic 4)**

- Purpose: Legacy configuration migration and rule compatibility
- Integration: Configuration file parsing and rule transformation
- Version Constraints: ESLint 9+ with flat config support
- Rationale: Ensure backward compatibility with existing projects

**TypeScript Compiler API (Planned Epic 4)**

- Purpose: TypeScript configuration analysis and code validation
- Integration: tsconfig.json parsing and AST-based code analysis
- Version Constraints: TypeScript 5.0+
- Rationale: Deep integration with TypeScript ecosystem

### External Service Dependencies

**None Required**

- This epic is designed to be fully self-contained
- No external network calls or service dependencies
- All processing performed locally for security and performance
- Optional analytics can be enabled with explicit user consent

### System Requirements

**Runtime Environment**

- Bun runtime >= 1.0.0 installed
- 50MB minimum disk space for complete installation
- 100MB minimum RAM recommended for optimal performance
- Support for stdio communication (standard terminal environments)

**Operating System Support**

- Linux (x64, ARM64)
- macOS (Intel, Apple Silicon)
- Windows (x64, ARM64) - with WSL2 for full feature support
- No additional system dependencies or native modules required

## Acceptance Criteria (Authoritative)

### Story 1.1: MCP Server Foundation Acceptance Criteria

**AC1.1.1:** Given the MCP server is running, when I send a basic "getStandards" request, then the server responds with
appropriate standards data in under 50ms

**AC1.1.2:** Given concurrent load testing, when multiple clients send simultaneous requests, then the server handles
all requests without performance degradation exceeding 10%

**AC1.1.3:** Given an invalid MCP protocol request, when the server receives malformed data, then it returns a
structured error response without crashing

**AC1.1.4:** Given the server is initialized, when I request available tools, then the server correctly lists
getStandards, searchStandards, and validateCode tools with proper schemas

### Story 1.2: SQLite Database Integration Acceptance Criteria

**AC1.2.1:** Given standards are retrieved for the first time, when I check the database, then they are cached in SQLite
with appropriate TTL and access metadata

**AC1.2.2:** Given cached standards exist, when I perform a full-text search, then FTS indexes return relevant results
in under 100ms with BM25 ranking

**AC1.2.3:** Given database corruption scenarios, when SQLite detects corruption, then the server automatically recovers
or rebuilds the database without data loss

**AC1.2.4:** Given concurrent database operations, when multiple threads access SQLite simultaneously, then WAL mode
provides optimal read/write concurrency without blocking

### Story 1.3: Caching and Performance Layer Acceptance Criteria

**AC1.3.1:** Given a standard has been cached, when I request the same standard again, then response time is under 30ms
with >80% cache hit rate

**AC1.3.2:** Given memory pressure conditions, when cache eviction occurs, then LRU strategy removes least recently used
items while preserving frequently accessed standards

**AC1.3.3:** Given cache performance monitoring, when I track metrics over time, then cache hit rates exceed targets and
response times remain within SLA thresholds

**AC1.3.4:** Given system startup conditions, when the server initializes with cold cache, then warm-up completes within
200ms with critical standards pre-loaded

## Traceability Mapping

| Acceptance Criteria | Spec Section        | Component(s)        | Test Idea                                            |
|---------------------|---------------------|---------------------|------------------------------------------------------|
| AC1.1.1             | APIs and Interfaces | MCP Server Core     | Load test with 1000 requests, measure response times |
| AC1.1.2             | Performance         | Cache Manager       | Concurrent request test with 10 parallel clients     |
| AC1.1.3             | Security            | Error Handler       | Malformed protocol message injection test            |
| AC1.1.4             | APIs and Interfaces | MCP Server Core     | Tool discovery schema validation test                |
| AC1.2.1             | Data Models         | Database Layer      | Cache TTL and metadata persistence test              |
| AC1.2.2             | Data Models         | Search Engine       | FTS5 query performance and relevance test            |
| AC1.2.3             | Reliability         | Database Layer      | Database corruption recovery simulation              |
| AC1.2.4             | Performance         | Database Layer      | WAL mode concurrency stress test                     |
| AC1.3.1             | Performance         | Cache Manager       | Cache hit rate and response time benchmark           |
| AC1.3.2             | Performance         | Cache Manager       | Memory pressure LRU eviction test                    |
| AC1.3.3             | Observability       | Performance Monitor | Long-running cache efficiency monitoring             |
| AC1.3.4             | Performance         | Cache Manager       | Cold startup warm-up time measurement                |

## Risks, Assumptions, Open Questions

### Risks

**R1: Performance Target Achievement**

- **Risk**: Sub-50ms response times may not be achievable with complex standards data sets
- **Impact**: High - Core performance requirement from PRD
- **Mitigation**: Implement comprehensive performance testing, optimize cache strategies, benchmark against realistic
  data loads
- **Owner**: Performance monitoring implementation in Story 1.3

**R2: MCP Protocol Compatibility**

- **Risk**: @modelcontextprotocol/sdk version compatibility issues with Claude Code
- **Impact**: High - Would prevent core functionality
- **Mitigation**: Pin to stable SDK version, implement comprehensive integration tests, monitor protocol changes
- **Owner**: MCP server implementation in Story 1.1

**R3: SQLite Performance Under Load**

- **Risk**: Database contention and performance degradation with concurrent access
- **Impact**: Medium - Could affect scalability
- **Mitigation**: Implement WAL mode, connection pooling, comprehensive load testing, monitor database metrics
- **Owner**: Database layer implementation in Story 1.2

**R4: Cache Memory Management**

- **Risk**: Memory leaks or excessive memory usage in multi-layer cache system
- **Impact**: Medium - Could impact system stability
- **Mitigation**: Implement strict memory limits, LRU eviction, memory monitoring, automatic cache cleanup
- **Owner**: Cache manager implementation in Story 1.3

### Assumptions

**A1: Bun Runtime Stability**

- **Assumption**: Bun runtime >=1.0.0 provides stable SQLite integration and performance characteristics
- **Validation**: Performance benchmarking against Node.js alternatives, stress testing SQLite operations
- **Impact**: Medium - Core runtime dependency

**A2: Standards Data Structure**

- **Assumption**: Existing coding standards can be effectively normalized into the defined data models
- **Validation**: Prototype with sample standards data, validate schema flexibility
- **Impact**: Low - Schema can be adjusted based on testing

**A3: MCP Protocol Adoption**

- **Assumption**: Claude Code continues to support and evolve the MCP protocol
- **Validation**: Monitor MCP SDK updates, maintain protocol compatibility testing
- **Impact**: Medium - Long-term sustainability

### Open Questions

**Q1: Cache Size Optimization**

- **Question**: What is the optimal cache size for balancing performance and memory usage?
- **Next Step**: Implement configurable cache sizes with default recommendations based on testing
- **Priority**: Medium - Affects user experience and resource usage

**Q2: Standards Update Frequency**

- **Question**: How frequently will standards need to be updated, and what are the cache invalidation implications?
- **Next Step**: Implement cache invalidation strategies and versioning for standards updates
- **Priority**: Medium - Affects cache coherence strategies

**Q3: Error Handling Granularity**

- **Question**: What level of error detail should be exposed to users vs. logged internally?
- **Next Step**: Implement tiered error reporting with user-friendly messages and detailed logs
- **Priority**: Low - Improves debugging experience

## Test Strategy Summary

### Testing Approach

**Multi-Layer Testing Strategy**

- Unit tests for individual components (cache, database, search)
- Integration tests for MCP protocol communication
- Performance tests for response time and memory usage
- Load tests for concurrent request handling
- End-to-end tests for complete workflows

### Test Coverage Areas

**Functional Testing**

- MCP server request/response validation
- Cache layer hit/miss scenarios
- SQLite database operations and FTS queries
- Standards retrieval and search functionality
- Error handling and recovery scenarios

**Performance Testing**

- Response time benchmarking (target <50ms)
- Memory usage monitoring (target <50MB)
- Concurrent request handling (10+ parallel clients)
- Cache hit rate validation (target >80%)
- Database performance under various load conditions

**Security Testing**

- Input validation and sanitization
- SQL injection prevention
- File path traversal protection
- Malformed protocol message handling
- Resource exhaustion protection

### Test Environment Setup

**Development Testing**

- Bun test runner for fast unit test execution
- In-memory SQLite for isolated database testing
- Mock MCP client for protocol testing
- Performance profiling hooks for optimization

**Integration Testing**

- Real SQLite database with sample standards data
- MCP protocol compliance testing
- File system integration for standards loading
- Cache coherence validation across restarts

### Continuous Integration

**Automated Test Pipeline**

- Unit tests on every commit
- Integration tests on pull requests
- Performance regression testing
- Mutation testing for coverage validation
- Automated security scanning

**Quality Gates**

- 95%+ test coverage requirement
- All performance targets must be met
- Zero security vulnerabilities
- Code quality standards compliance

### Performance Benchmarking

**Baseline Metrics**

- Establish performance baselines for all operations
- Track response time distributions (p50, p95, p99)
- Monitor memory usage patterns
- Measure cache efficiency over time

**Regression Testing**

- Automated performance comparisons
- Alert on performance degradation >10%
- Memory leak detection and prevention
- Cache hit rate monitoring and optimization