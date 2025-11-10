# Architecture: coding-standard

## Executive Summary

The coding-standard project implements a high-performance, Bun-native architecture combining a CLI tool with MCP server
capabilities. The architecture prioritizes ultra-fast performance (sub-50ms response times), minimal memory footprint (<
50MB), and seamless integration with existing development tools through intelligent configuration detection and semantic
rule management.

## Project Initialization

```bash
# Initialize project with Bun
bun init coding-standard
cd coding-standard

# Install core dependencies
bun add @modelcontextprotocol/sdk
bun add -d @types/bun bun-types

# Setup TypeScript configuration
bun x tsc --init

# Create project structure
mkdir -p src/{cli,mcp,cache,loaders,database,utils}
mkdir -p tests/{unit,integration}
mkdir -p docs
```

## Decision Summary

| Category        | Decision                  | Version  | Affects Epics | Rationale                                                   |
|-----------------|---------------------------|----------|---------------|-------------------------------------------------------------|
| Runtime         | Bun (primary)             | >=1.0.0  | All           | 3-4x faster performance than Node.js, native SQLite support |
| Language        | TypeScript                | 5.0+     | All           | Type safety, better tooling, MCP SDK compatibility          |
| Database        | SQLite (builtin)          | 3.44+    | All           | Zero dependencies, persistent caching, FTS support          |
| MCP Protocol    | @modelcontextprotocol/sdk | 0.5.0    | All           | Claude Code integration, standardized protocol              |
| Caching         | Bun SQLite + Memory       | 1.0+     | All           | Persistent cache with zero-copy operations                  |
| File Operations | Bun.file() API            | Native   | All           | 2-4x faster than Node.js fs operations                      |
| Testing         | Bun Test Runner           | Native   | All           | Built-in, fast, TypeScript support                          |
| Configuration   | JSON/YAML/TOML            | Multiple | All           | Flexibility for different user preferences                  |

## Project Structure

```
coding-standard/
├── src/
│   ├── cli/
│   │   ├── commands/
│   │   │   ├── init.ts          # Project initialization
│   │   │   ├── add.ts           # Add standards
│   │   │   ├── remove.ts        # Remove standards
│   │   │   ├── search.ts        # Search standards
│   │   │   ├── check.ts         # Validate code
│   │   │   ├── fix.ts           # Auto-fix violations
│   │   │   └── config.ts        # Configuration management
│   │   ├── utils/
│   │   │   ├── output.ts        # Formatted output
│   │   │   ├── validation.ts    # Input validation
│   │   │   └── completion.ts    # Shell completion
│   │   └── index.ts             # CLI entry point
│   ├── mcp/
│   │   ├── server.ts             # Main MCP server
│   │   ├── tools/
│   │   │   ├── getStandards.ts  # Standards retrieval
│   │   │   ├── searchStandards.ts # Fast search
│   │   │   ├── validateCode.ts  # Code validation
│   │   │   └── getAnalytics.ts  # Usage analytics
│   │   └── handlers/
│   │       ├── toolHandlers.ts  # Tool request handlers
│   │       └── errorHandler.ts  # Error handling
│   ├── cache/
│   │   ├── bun-cache.ts          # Bun-optimized cache
│   │   ├── search-index.ts      # SQLite FTS index
│   │   └── cache-manager.ts     # Cache orchestration
│   ├── loaders/
│   │   ├── bun-file-loader.ts   # Fast file operations
│   │   ├── config-loader.ts     # Configuration detection
│   │   ├── standards-loader.ts  # Standards data loading
│   │   └── tool-detector.ts     # BiomeJS/ESLint/TS detection
│   ├── database/
│   │   ├── schema.ts             # Database schema
│   │   ├── migrations.ts         # Database migrations
│   │   ├── analytics.ts          # Usage analytics
│   │   └── connection.ts         # Database connection
│   ├── integrations/
│   │   ├── biomejs.ts            # BiomeJS integration
│   │   ├── eslint.ts             # ESLint integration
│   │   ├── typescript.ts         # TypeScript integration
│   │   └── config-merger.ts      # Cross-tool normalization
│   ├── standards/
│   │   ├── registry.ts           # Rule registry
│   │   ├── semantic-naming.ts    # Rule naming system
│   │   ├── validator.ts          # Rule validation
│   │   └── patterns/             # Standard patterns
│   ├── web/
│   │   ├── dashboard.ts          # Optional web dashboard
│   │   └── api.ts                # REST API endpoints
│   ├── utils/
│   │   ├── logger.ts             # Structured logging
│   │   ├── performance.ts        # Performance monitoring
│   │   ├── file-watcher.ts       # Hot reload functionality
│   │   └── error-handler.ts      # Error utilities
│   └── types/
│       ├── config.ts             # Configuration types
│       ├── standards.ts          # Standards data types
│       ├── mcp.ts                # MCP protocol types
│       └── analytics.ts          # Analytics types
├── tests/
│   ├── unit/                     # Unit tests
│   ├── integration/              # Integration tests
│   ├── fixtures/                 # Test data
│   └── test-utils.ts             # Test utilities
├── docs/
│   ├── API.md                    # API documentation
│   ├── CONFIGURATION.md          # Configuration guide
│   └── STANDARDS.md              # Standards reference
├── scripts/
│   ├── setup.ts                  # Development setup
│   ├── build.ts                  # Build script
│   └── benchmark.ts              # Performance testing
├── standards/
│   ├── react/                    # React standards
│   ├── typescript/               # TypeScript standards
│   ├── nodejs/                   # Node.js standards
│   └── index.json                # Standards index
├── package.json                  # Package configuration
├── tsconfig.json                 # TypeScript configuration
├── bunfig.toml                   # Bun runtime configuration
├── bun.lockb                     # Bun lock file
├── README.md                     # Project documentation
├── skill.md                      # Claude Code skill definition
├── skill/                        # Claude Code skill assets
│   ├── config/
│   │   ├── settings.json         # Skill configuration
│   │   └── bun-config.json       # Bun runtime configuration
│   ├── mcp-bridge/               # MCP server bridge
│   │   ├── client.ts             # MCP client for Claude Code
│   │   ├── message-handler.ts    # Message processing
│   │   └── skill-interface.ts    # Skill-specific API
│   ├── standards/                # Built-in standards
│   │   ├── react/                # React coding standards
│   │   ├── typescript/           # TypeScript standards
│   │   ├── nodejs/               # Node.js standards
│   │   └── patterns/             # Standard patterns library
│   ├── templates/                # Configuration templates
│   │   ├── biome.json.template   # BiomeJS template
│   │   ├── eslint.config.template # ESLint template
│   │   └── tsconfig.template      # TypeScript template
│   └── examples/                 # Usage examples
│       ├── react-examples/       # React examples
│       ├── typescript-examples/  # TypeScript examples
│       └── workflow-examples/    # Workflow examples
```

## Epic to Architecture Mapping

| Epic                          | Architecture Components              | Implementation Focus                              |
|-------------------------------|--------------------------------------|---------------------------------------------------|
| MCP Server Implementation     | src/mcp/, src/cache/, src/database/  | High-performance server with SQLite caching       |
| CLI Interface                 | src/cli/, src/utils/                 | Intuitive command structure with shell completion |
| Standard Management           | src/standards/, src/loaders/         | Dynamic pattern management with hot reload        |
| Tool Integration              | src/integrations/, src/loaders/      | BiomeJS/ESLint/TypeScript detection and mapping   |
| Performance Optimization      | src/cache/, src/utils/performance.ts | Sub-50ms response times and minimal memory usage  |
| Claude Code Skill Integration | skill.md, skill/, MCP bridge         | BMAD skill definition and workflow integration    |

## Technology Stack Details

### Core Technologies

**Bun Runtime (>=1.0.0)**

- Primary runtime for maximum performance
- Built-in SQLite database support
- Native file system operations
- Built-in test runner
- Zero-dependency HTTP server (optional web dashboard)

**TypeScript (5.0+)**

- Strict type checking enabled
- Modern ES2022+ target
- Module resolution: bundler
- Path mapping for clean imports

**SQLite Database**

- WAL mode for optimal performance
- FTS (Full-Text Search) for fast rule searching
- Persistent caching layer
- Usage analytics storage

**MCP Protocol (@modelcontextprotocol/sdk 0.5.0)**

- Claude Code integration
- Standardized tool protocol
- JSON-RPC communication
- Tool discovery and execution

### Integration Points

**CLI → MCP Server**

- Shared cache and database layer
- Common configuration management
- Unified error handling and logging
- Consistent performance monitoring

**MCP Server → External Tools**

- BiomeJS configuration detection and parsing
- ESLint rule mapping and equivalence
- TypeScript compiler configuration analysis
- Cross-tool standardization and normalization

**File System Integration**

- Bun.file() for zero-copy operations
- File watching for hot reload capabilities
- Glob pattern matching for standards discovery
- Atomic file operations for configuration updates

## Claude Code Skill Integration

### Skill Architecture Overview

The coding-standard project implements as a **Claude Code Skill** that provides seamless access to coding standards
through natural language interaction. The skill acts as a bridge between Claude Code's conversational interface and the
high-performance MCP server backend.

### Skill Definition Structure

**skill.md - Main Skill File**

```markdown
---
name: coding-standards
description: Ultra-fast coding standards enforcement and management tool
version: 1.0.0
author: BMad
---

## Skill Capabilities

- **Instant Standards Retrieval**: Get coding standards in <50ms using semantic search
- **Dynamic Pattern Management**: Add/remove standards via slash commands
- **Tool Integration**: Auto-detect and normalize BiomeJS, ESLint, TypeScript configs
- **Real-time Validation**: Validate code against established best practices
- **Configuration Generation**: Generate project-specific configuration files

## Usage Examples

- "Get React best practices for component naming"
- "Add a new rule for async function naming"
- "Check my TypeScript code for circular dependencies"
- "Generate ESLint config for my React project"
```

### MCP Bridge Architecture

**skill/mcp-bridge/client.ts**

```typescript
export class ClaudeCodeSkillClient {
    private mcpServer: MCPConnection;
    private messageHandler: MessageHandler;
    private skillInterface: SkillInterface;

    constructor(config: SkillConfig) {
        this.mcpServer = new MCPConnection(config.mcpServerUrl);
        this.messageHandler = new MessageHandler(this.mcpServer);
        this.skillInterface = new SkillInterface(config);
    }

    async handleClaudeRequest(request: ClaudeRequest): Promise<ClaudeResponse> {
        // 1. Parse natural language request
        // 2. Route to appropriate MCP tool
        // 3. Format response for Claude Code
        // 4. Track usage analytics
    }
}
```

**skill/mcp-bridge/message-handler.ts**

```typescript
export class MessageHandler {
    async processStandardsRequest(query: string): Promise<StandardsResponse> {
        // Parse natural language query
        // Extract technology, category, context
        // Call MCP server tools
        // Format response for Claude
    }

    async processSlashCommand(command: string): Promise<CommandResponse> {
        // Parse slash command syntax
        // Execute command logic
        // Return formatted result
    }
}
```

### Skill Interface Patterns

**Natural Language to Tool Mapping**

```typescript
interface QueryMapping {
    patterns: RegExp[];
    tool: string;
    parameters: Record<string, string>;
    examples: string[];
}

const queryMappings: QueryMapping[] = [
    {
        patterns: [/get.*standards/i, /show.*rules/i, /best practices/i],
        tool: 'getStandards',
        parameters: {technology: 'extract', category: 'extract'},
        examples: [
            "Get React component naming standards",
            "Show TypeScript interface best practices",
            "What are the Node.js error handling patterns?"
        ]
    },
    {
        patterns: [/add.*rule/i, /create.*standard/i, /new.*pattern/i],
        tool: 'addStandard',
        parameters: {ruleName: 'extract', pattern: 'extract'},
        examples: [
            "Add a rule for async function naming",
            "Create a standard for TypeScript enums",
            "Add pattern for React prop validation"
        ]
    }
];
```

### Skill Configuration

**skill/config/settings.json**

```json
{
  "skill": {
    "name": "coding-standards",
    "version": "1.0.0",
    "description": "Ultra-fast coding standards enforcement",
    "author": "BMad"
  },
  "mcp": {
    "serverUrl": "stdio://",
    "timeout": 30000,
    "retries": 3
  },
  "standards": {
    "cacheSize": 1000,
    "updateInterval": 3600000,
    "sources": [
      "./standards/",
      "./templates/"
    ]
  },
  "features": {
    "semanticSearch": true,
    "slashCommands": true,
    "autoDetection": true,
    "configGeneration": true,
    "realTimeValidation": true
  },
  "integrations": {
    "biomejs": true,
    "eslint": true,
    "typescript": true,
    "prettier": false
  }
}
```

### Skill-to-MCP Communication Flow

```typescript
// 1. Claude Code sends natural language request
const claudeRequest = "Get React component best practices";

// 2. Skill parses and routes to MCP tool
const mcpRequest = {
    tool: 'getStandards',
    arguments: {
        technology: 'react',
        category: 'patterns',
        context: 'component best practices'
    }
};

// 3. MCP server processes request
const mcpResponse = await mcpServer.callTool(mcpRequest);

// 4. Skill formats response for Claude Code
const claudeResponse = formatForClaude(mcpResponse);
```

### Built-in Standards Library

**skill/standards/structure**

```typescript
interface StandardLibrary {
    react: {
        components: ComponentStandards;
        hooks: HookStandards;
        patterns: PatternStandards;
    };
    typescript: {
        interfaces: InterfaceStandards;
        types: TypeStandards;
        patterns: PatternStandards;
    };
    nodejs: {
        async: AsyncStandards;
        error: ErrorStandards;
        modules: ModuleStandards;
    };
}
```

**Standard Definition Format**

```typescript
interface CodingStandard {
    id: string;
    name: string;
    category: string;
    technology: string;
    description: string;
    pattern: string | RegExp;
    examples: {
        good: string[];
        bad: string[];
    };
    relatedRules: string[];
    severity: 'error' | 'warning' | 'info';
    tags: string[];
}
```

### Configuration Templates

**skill/templates/biome.json.template**

```json
{
  "$schema": "https://biomejs.dev/schemas/1.0.0/schema.json",
  "organizeImports": {
    "enabled": true
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "{{CUSTOM_RULES}}": "{{CUSTOM_CONFIG}}"
    }
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "semicolons": "always"
    }
  }
}
```

### Usage Examples and Workflows

**skill/examples/workflow-examples/**

```typescript
// Example 1: Project Setup
const setupWorkflow = {
    description: "Set up coding standards for new React project",
    steps: [
        "coding-standards init --react",
        "coding-standards add --rule react-component-naming",
        "coding-standards generate biome.json",
        "coding-standards check src/"
    ]
};

// Example 2: Standards Discovery
const discoveryWorkflow = {
    description: "Find relevant standards for specific context",
    examples: [
        "What are the TypeScript best practices for API responses?",
        "Show me React component patterns for form handling",
        "Get Node.js error handling standards for async functions"
    ]
};
```

### Skill Performance Optimization

**Caching Strategy for Skill**

```typescript
class SkillCache {
    private queryCache: Map<string, StandardsResponse>;
    private patternCache: Map<string, RegExp>;

    async getCachedStandards(query: string): Promise<StandardsResponse | null> {
        // 1. Check query cache
        // 2. Check pattern cache
        // 3. Return cached result or null
    }

    async cacheStandards(query: string, result: StandardsResponse): Promise<void> {
        // Cache with TTL and LRU eviction
    }
}
```

### Integration with BMAD Workflows

The skill integrates seamlessly with BMAD methodology workflows:

**Product Brief Integration**

- Automatically extracts technical requirements from brief
- Suggests relevant standards based on project scope
- Generates configuration templates for identified technologies

**PRD Integration**

- Maps functional requirements to coding standards
- Identifies compliance requirements
- Generates validation rules for acceptance criteria

**Architecture Integration**

- Enforces architectural patterns through standards
- Validates code against architectural decisions
- Ensures consistency across implementation

## Implementation Patterns

These patterns ensure consistent implementation across all AI agents:

### CLI Command Pattern

```typescript
// Standard command structure
export class CommandName {
    async execute(args: CommandArgs): Promise<void> {
        // 1. Validate inputs
        // 2. Load configuration
        // 3. Execute core logic
        // 4. Format output
        // 5. Handle errors consistently
    }
}
```

### MCP Tool Pattern

```typescript
// Standard MCP tool implementation
export class ToolName {
    async handle(request: ToolRequest): Promise<ToolResponse> {
        // 1. Parse and validate request
        // 2. Check cache first
        // 3. Execute business logic
        // 4. Track usage analytics
        // 5. Format response
    }
}
```

### Cache-First Pattern

All data access must follow cache-first approach:

1. Check in-memory cache
2. Check persistent SQLite cache
3. Load from file system
4. Update all cache layers
5. Invalidate related cache entries on changes

### Error Handling Pattern

```typescript
// Consistent error handling
try {
    // Operation
} catch (error) {
    logger.error('Operation failed', {context, error});
    throw new StandardizedError(error.message, error.code);
}
```

## Consistency Rules

### Naming Conventions

**Files and Directories**

- kebab-case for all files and directories
- .ts extension for TypeScript files
- .test.ts for test files
- .types.ts for type definition files

**Code Elements**

- PascalCase for classes and interfaces
- camelCase for functions and variables
- UPPER_SNAKE_CASE for constants
- Private members prefixed with underscore

**Database Schema**

- snake_case for table and column names
- Singular table names (user, not users)
- foreign_key format for foreign keys
- created_at, updated_at for timestamps

### Code Organization

**Module Structure**

```typescript
// 1. Imports (external first, then internal)
// 2. Type definitions
// 3. Constants
// 4. Class/function implementation
// 5. Exports
```

**Directory Organization**

- Group by feature, not by type
- Shared utilities in src/utils/
- Types in dedicated types/ directories
- Tests mirror source structure

### Error Handling

**Error Categories**

- ValidationError: Input validation failures
- ConfigurationError: Configuration issues
- CacheError: Cache operation failures
- IntegrationError: External tool integration issues
- PerformanceError: Performance threshold violations

**Error Response Format**

```typescript
interface ErrorResponse {
    error: {
        code: string;
        message: string;
        details?: any;
        timestamp: string;
        requestId?: string;
    };
}
```

### Logging Strategy

**Log Levels**

- ERROR: System failures, exceptions
- WARN: Performance warnings, deprecated usage
- INFO: Important operations, configuration changes
- DEBUG: Detailed debugging information

**Log Format**

```typescript
interface LogEntry {
    timestamp: string;
    level: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';
    component: string;
    operation: string;
    message: string;
    metadata?: Record<string, any>;
    requestId?: string;
}
```

## Data Architecture

### Database Schema

**Main Tables**

```sql
-- Standards cache
CREATE TABLE standards_cache
(
    key          TEXT PRIMARY KEY,
    data         TEXT    NOT NULL,
    created_at   INTEGER NOT NULL,
    accessed_at  INTEGER NOT NULL,
    access_count INTEGER DEFAULT 1,
    ttl          INTEGER
);

-- Search index (FTS5)
CREATE
VIRTUAL TABLE standards_search USING fts5(
  title,
  content,
  category,
  technology,
  rule_name
);

-- Usage analytics
CREATE TABLE usage_analytics
(
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    tool          TEXT    NOT NULL,
    args          TEXT,
    response_time INTEGER,
    timestamp     INTEGER NOT NULL,
    user_id       TEXT
);

-- File change tracking
CREATE TABLE file_changes
(
    path      TEXT PRIMARY KEY,
    timestamp INTEGER NOT NULL,
    checksum  TEXT
);
```

### Data Models

**Configuration Types**

```typescript
interface CodingStandardsConfig {
    standardsPath?: string;
    remoteRepo?: string;
    cacheSize?: number;
    enableVector?: boolean;
    syncInterval?: number;
    databasePath?: string;
    enableWebDashboard?: boolean;
    webPort?: number;
    bunFeatures?: {
        useSQLite?: boolean;
        useFileWatch?: boolean;
        useWebServer?: boolean;
        enableAnalytics?: boolean;
    };
}
```

**Standard Rule Types**

```typescript
interface StandardRule {
    id: string;
    name: string;
    category: RuleCategory;
    technology: Technology;
    description: string;
    pattern: string | RegExp;
    severity: 'error' | 'warning' | 'info';
    tags: string[];
    examples: CodeExample[];
    relatedRules: string[];
}
```

## API Contracts

### MCP Tool Contracts

**getStandards Tool**

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

**searchStandards Tool**

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

**validateCode Tool**

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

### CLI Command Contracts

**Standard Command Structure**

```typescript
interface CommandResult {
    success: boolean;
    data?: any;
    errors?: string[];
    warnings?: string[];
    metadata?: {
        executionTime: number;
        cacheHit: boolean;
        operationsAffected: number;
    };
}
```

## Security Architecture

### Input Validation

- All user inputs validated against schemas
- File path sanitization to prevent directory traversal
- SQL injection prevention through parameterized queries
- Configuration file validation before processing

### Code Execution Safety

- No arbitrary code execution from user inputs
- Custom rule validation before registration
- Sandboxed evaluation of user-defined patterns
- Principle of least privilege for all operations

### Data Protection

- No persistent storage of sensitive user data
- Local-only processing, no external data transmission
- Optional analytics with user consent
- Secure configuration file handling

## Performance Considerations

### Response Time Targets

- Standard retrieval: < 50ms (target: 30ms)
- Search queries: < 100ms (target: 50ms)
- Configuration validation: < 200ms
- Code validation: < 500ms for typical files
- Server startup: < 100ms (target: 50ms)

### Caching Strategy

- Multi-layer caching: Memory → SQLite → File system
- LRU eviction for memory cache
- TTL-based expiration for SQLite cache
- Intelligent cache invalidation on file changes

### Resource Optimization

- Memory usage < 50MB during normal operation
- CPU usage < 10% during idle, < 50% during peak
- Efficient string operations using Bun's native APIs
- Zero-copy file operations where possible

## Deployment Architecture

### Distribution Model

- Single binary executable via Bun compilation
- NPM package distribution for easy installation
- Support for global and per-project installation
- Automatic updates with semantic versioning

### Runtime Requirements

- Bun runtime >= 1.0.0
- TypeScript support (built into Bun)
- SQLite (built into Bun)
- 50MB minimum disk space
- 100MB minimum RAM recommended

### Installation Methods

```bash
# Global installation
bun add -g coding-standard

# Per-project installation
bun add -D coding-standard

# Direct execution
bunx coding-standard

# Development setup
git clone <repository>
cd coding-standard
bun install
bun run build
```

## Development Environment

### Prerequisites

**Required Tools**

- Bun >= 1.0.0
- Git >= 2.30
- Text editor with TypeScript support

**Recommended Tools**

- VS Code with Bun extension
- SQLite browser for database inspection
- Performance monitoring tools

### Setup Commands

```bash
# Clone and setup
git clone <repository-url>
cd coding-standard
bun install

# Development mode
bun run dev

# Run tests
bun test

# Build for production
bun run build

# Performance benchmarking
bun run benchmark

# Database setup
bun run scripts/setup.ts
```

### Development Workflow

**Code Quality**

- TypeScript strict mode enabled
- ESLint for code style
- Bun test for unit and integration tests
- Mutation testing for coverage validation

**Performance Testing**

- Automated benchmarks in CI/CD
- Response time monitoring
- Memory usage profiling
- Cache hit rate tracking

## Architecture Decision Records (ADRs)

### ADR-001: Bun-Native Architecture

**Decision**: Use Bun as primary runtime instead of Node.js
**Status**: Accepted
**Rationale**: 3-4x performance improvement, built-in SQLite, zero-copy operations
**Consequences**: Requires Bun installation, smaller ecosystem than Node.js

### ADR-002: SQLite-Based Caching

**Decision**: Use SQLite for persistent caching with FTS capabilities
**Status**: Accepted
**Rationale**: Zero dependencies, fast full-text search, persistent storage
**Consequences**: Additional complexity in cache management, SQLite schema maintenance

### ADR-003: MCP Protocol Integration

**Decision**: Implement Model Context Protocol for Claude Code integration
**Status**: Accepted
**Rationale**: Standardized protocol, seamless Claude Code integration, future-proof
**Consequences**: Dependency on MCP SDK, protocol version compatibility requirements

### ADR-004: Semantic Rule Naming

**Decision**: Implement semantic rule naming system instead of pattern matching
**Status**: Accepted
**Rationale**: Better developer experience, intuitive rule references, easier discovery
**Consequences**: Additional complexity in rule registry, maintenance overhead

### ADR-005: Tool Configuration Auto-Detection

**Decision**: Automatically detect and import BiomeJS, ESLint, TypeScript configurations
**Status**: Accepted
**Rationale**: Reduces setup friction, ensures consistency, leverages existing configurations
**Consequences**: Complex configuration parsing logic, handling conflicting configurations

### ADR-006: Claude Code Skill Integration

**Decision**: Implement as Claude Code Skill with natural language interface
**Status**: Accepted
**Rationale**: Seamless integration with Claude Code ecosystem, conversational access to standards
**Consequences**: Additional complexity in skill-MCP bridge, natural language parsing requirements

### ADR-007: BMAD Workflow Integration

**Decision**: Integrate with BMAD methodology workflows (Product Brief, PRD, Architecture)
**Status**: Accepted
**Rationale**: Leverages existing project context, ensures standards align with requirements
**Consequences**: Dependency on BMAD workflow files, additional integration testing

---

_Generated by BMAD Decision Architecture Workflow v1.3.2_
_Date: 2025-11-09_
_For: BMad_