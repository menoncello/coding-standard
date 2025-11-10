#!/usr/bin/env bun

/**
 * Comprehensive Quality Analysis Script
 * Analyzes ALL files across ALL quality tools and shows the top most problematic files
 * Usage: bun run scripts/comprehensive-quality-summary.ts [limit]
 */

// Using global process available in Bun runtime

// Constants
const DEFAULT_LIMIT = 20;
const MAX_FILENAME_LENGTH = 80;
const TABLE_WIDTH = 100;
const TOP_ERROR_TYPES_LIMIT = 10;

// Table formatting constants
const RANK_COLUMN_WIDTH = 6;
const TOTAL_COLUMN_WIDTH = 7;
const LINT_COLUMN_WIDTH = 6;
const CHECK_COLUMN_WIDTH = 7;
const TS_COLUMN_WIDTH = 5;
const ESLINT_COLUMN_WIDTH = 7;

// Table padding constants
const RANK_PAD_START = 4;
const TOTAL_PAD_START = 5;
const LINT_PAD_START = 5;
const CHECK_PAD_START = 5;
const TS_PAD_START = 4;
const ESLINT_PAD_START = 6;
const FILE_TRUNCATE_LENGTH = 3;

// Other constants
const DECIMAL_RADIX = 10;
const ERROR_EXIT_CODE = 1;

// Zero constants for calculations
const ZERO = 0;
const ONE = 1;

// Regex patterns (top-level for performance)
const TS_ERROR_PATTERN = /^(.+?)\((\d+),\d+\):\s+error\s+(.+)$/;
const TS_ERROR_CODE_PATTERN = /TS(\d+)/;

interface FileIssue {
  file: string;
  tool: 'lint' | 'check' | 'typescript' | 'eslint';
  count: number;
  severity: string;
  errorType?: string;
}

interface CombinedFileIssues {
  file: string;
  totalIssues: number;
  lintIssues: number;
  checkIssues: number;
  typeScriptIssues: number;
  eslintIssues: number;
  severityBreakdown: {
    error: number;
    warning: number;
    info: number;
  };
  errorTypes: Set<string>;
}

/**
 * Validates if a Biome diagnostic has required file information.
 * @param {{ location?: { path?: { file?: string } } }} diagnostic - The diagnostic object to validate
 * @param {object} diagnostic.location - The location information
 * @param {object} diagnostic.location.path - The path information
 * @param {string} diagnostic.location.path.file - The file path
 * @returns {boolean} True if diagnostic has valid file information
 */
function hasValidFileInformation(diagnostic: { location?: { path?: { file?: string } } }): boolean {
  return Boolean(diagnostic.location?.path?.file);
}

/**
 * Creates a FileIssue object from a valid Biome diagnostic.
 * @param {{ severity?: string; category?: string; location?: { path?: { file?: string } } }} diagnostic - The diagnostic object to convert
 * @param {string} diagnostic.severity - The severity level
 * @param {string} diagnostic.category - The error category
 * @param {object} diagnostic.location - The location information
 * @param {object} diagnostic.location.path - The path information
 * @param {string} diagnostic.location.path.file - The file path
 * @param {'lint' | 'check'} tool - The tool type ('lint' or 'check')
 * @returns {FileIssue} FileIssue object
 */
function createFileIssueFromDiagnostic(
  diagnostic: { severity?: string; category?: string; location?: { path?: { file?: string } } },
  tool: 'lint' | 'check',
): FileIssue {
  return {
    file: diagnostic.location?.path?.file ?? '',
    tool,
    count: 1,
    severity: diagnostic.severity ?? 'error',
    errorType: diagnostic.category,
  };
}

/**
 * Extracts issues from Biome diagnostic output.
 * @param {unknown} result - The parsed JSON result from Biome
 * @param {'lint' | 'check'} tool - The tool type ('lint' or 'check')
 * @returns {FileIssue[]} Array of FileIssue objects
 */
function extractBiomeIssues(result: unknown, tool: 'lint' | 'check'): FileIssue[] {
  const issues: FileIssue[] = [];

  const biomeResult = result as {
    diagnostics?: Array<{ location?: { path?: { file?: string } }; severity?: string; category?: string }>;
  };

  if (!(biomeResult?.diagnostics && Array.isArray(biomeResult.diagnostics))) {
    return issues;
  }

  const validDiagnostics = biomeResult.diagnostics.filter(hasValidFileInformation);

  for (const diagnostic of validDiagnostics) {
    issues.push(createFileIssueFromDiagnostic(diagnostic, tool));
  }

  return issues;
}

/**
 * Runs Biome lint analysis and extracts issues from the output.
 * @returns {Promise<FileIssue[]>} Promise resolving to an array of FileIssue objects
 */
async function runLintAnalysis(): Promise<FileIssue[]> {
  console.log('🔍 Analyzing Lint issues...');
  try {
    const process = Bun.spawn(['bunx', '@biomejs/biome', 'lint', '.', '--reporter=json'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const stdout = await new Response(process.stdout).text();
    const result = JSON.parse(stdout);

    return extractBiomeIssues(result, 'lint');
  } catch {
    console.log('⚠️  Lint analysis failed');
    return [];
  }
}

/**
 * Runs Biome check analysis and extracts issues from the output.
 * @returns {Promise<FileIssue[]>} Promise resolving to an array of FileIssue objects
 */
async function runCheckAnalysis(): Promise<FileIssue[]> {
  console.log('🔍 Analyzing Check issues...');
  try {
    const process = Bun.spawn(['bunx', '@biomejs/biome', 'check', '.', '--reporter=json'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const stdout = await new Response(process.stdout).text();
    const result = JSON.parse(stdout);

    return extractBiomeIssues(result, 'check');
  } catch {
    console.log('⚠️  Check analysis failed');
    return [];
  }
}

/**
 * Extracts TypeScript error type from error description.
 * @param {string} errorDesc - The error description from TypeScript
 * @returns {string} The error type (TSXXXX or 'general')
 */
function extractTsErrorType(errorDesc: string): string {
  const tsMatch = errorDesc.match(TS_ERROR_CODE_PATTERN);
  return tsMatch ? `TS${tsMatch[1]}` : 'general';
}

/**
 * Validates if a TypeScript error match is valid and has required components.
 * @param {RegExpMatchArray | null} match - The regex match from TypeScript error pattern
 * @returns {boolean} True if match has valid error components
 */
function isValidTsErrorMatch(match: RegExpMatchArray | null): match is RegExpMatchArray {
  return match?.[1] !== undefined && match[3] !== undefined && match[3] !== null && match[3] !== '';
}

/**
 * Creates a FileIssue object from a valid TypeScript error match.
 * @param {RegExpMatchArray} match - The valid regex match from TypeScript error pattern
 * @returns {FileIssue} FileIssue object
 */
function createFileIssueFromTsMatch(match: RegExpMatchArray): FileIssue {
  const file = match[1] ?? 'unknown';
  const errorDesc = match[3] ?? 'unknown error';
  const errorType = extractTsErrorType(errorDesc);

  return {
    file,
    tool: 'typescript',
    count: 1,
    severity: 'error',
    errorType,
  };
}

/**
 * Processes TypeScript error lines and extracts issues.
 * @param {string[]} lines - Array of lines from TypeScript compiler output
 * @returns {FileIssue[]} Array of FileIssue objects
 */
function processTsErrorLines(lines: string[]): FileIssue[] {
  const issues: FileIssue[] = [];

  for (const line of lines) {
    const match = line.match(TS_ERROR_PATTERN);
    if (isValidTsErrorMatch(match)) {
      issues.push(createFileIssueFromTsMatch(match));
    }
  }

  return issues;
}

/**
 * Parses TypeScript compiler output and extracts file issues.
 * @param {string} stderr - The stderr output from TypeScript compiler
 * @returns {FileIssue[]} Array of FileIssue objects
 */
function parseTsErrors(stderr: string): FileIssue[] {
  const lines = stderr.split('\n');
  return processTsErrorLines(lines);
}

/**
 * Runs TypeScript compiler analysis and extracts issues from the output.
 * @returns {Promise<FileIssue[]>} Promise resolving to an array of FileIssue objects
 */
async function runTypeScriptAnalysis(): Promise<FileIssue[]> {
  console.log('🔍 Analyzing TypeScript issues...');
  try {
    const process = Bun.spawn(['bunx', 'tsc', '--noEmit', '--skipLibCheck'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const stderr = await new Response(process.stderr).text();
    return parseTsErrors(stderr);
  } catch {
    console.log('⚠️  TypeScript analysis failed');
    return [];
  }
}

/**
 * Validates if an ESLint message has required file information.
 * @param {{ filePath?: unknown }} message - The ESLint message object to validate
 * @param {string} message.filePath - The file path
 * @returns {boolean} True if message has valid file information
 */
function hasValidFilePath(message: { filePath?: unknown }): message is { filePath: string } {
  return typeof message.filePath === 'string' && message.filePath.length > ZERO;
}

/**
 * Creates a FileIssue object from a valid ESLint message.
 * @param {{ filePath: string; severity?: string; ruleId?: string }} message - The ESLint message object to convert
 * @param {string} message.filePath - The file path
 * @param {string} message.severity - The severity level
 * @param {string} message.ruleId - The rule identifier
 * @returns {FileIssue} FileIssue object
 */
function createFileIssueFromEsLintMessage(message: {
  filePath: string;
  severity?: string;
  ruleId?: string;
}): FileIssue {
  return {
    file: message.filePath,
    tool: 'eslint',
    count: 1,
    severity: message.severity ?? 'error',
    errorType: message.ruleId ?? 'unknown',
  };
}

/**
 * Processes valid ESLint messages and converts them to FileIssue objects.
 * @param {unknown[]} messages - Array of ESLint message objects
 * @returns {FileIssue[]} Array of FileIssue objects
 */
function processValidEsLintMessages(messages: unknown[]): FileIssue[] {
  const issues: FileIssue[] = [];

  for (const message of messages) {
    if (hasValidFilePath(message as { filePath?: unknown })) {
      issues.push(createFileIssueFromEsLintMessage(message as { filePath: string }));
    }
  }

  return issues;
}

/**
 * Parses ESLint JSON output and extracts file issues.
 * @param {string} stdout - The JSON output from ESLint
 * @returns {FileIssue[]} Array of FileIssue objects
 */
function parseEsLintOutput(stdout: string): FileIssue[] {
  try {
    const result = JSON.parse(stdout);

    if (result !== null && result !== undefined && Array.isArray(result)) {
      return processValidEsLintMessages(result);
    }
  } catch {
    // JSON parsing failed, return empty array
  }

  return [];
}

/**
 * Runs ESLint analysis and extracts issues from the output.
 * @returns {Promise<FileIssue[]>} Promise resolving to an array of FileIssue objects
 */
async function runEsLintAnalysis(): Promise<FileIssue[]> {
  console.log('🔍 Analyzing ESLint issues...');
  try {
    const process = Bun.spawn(['bunx', 'eslint', '.', '--format', 'json'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const stdout = await new Response(process.stdout).text();
    return parseEsLintOutput(stdout);
  } catch {
    console.log('⚠️  ESLint analysis failed (likely config issue)');
    return [];
  }
}

/**
 * Updates severity breakdown for an existing CombinedFileIssues object.
 * @param {CombinedFileIssues} existing - The existing CombinedFileIssues object to update
 * @param {FileIssue} issue - The new FileIssue to incorporate
 * @returns {void}
 */
function updateSeverityBreakdown(existing: CombinedFileIssues, issue: FileIssue): void {
  if (issue.severity === 'error') {
    existing.severityBreakdown.error += issue.count;
  } else if (issue.severity === 'warning') {
    existing.severityBreakdown.warning += issue.count;
  } else if (issue.severity === 'info') {
    existing.severityBreakdown.info += issue.count;
  }
}

/**
 * Updates tool-specific issue counts for an existing CombinedFileIssues object.
 * @param {CombinedFileIssues} existing - The existing CombinedFileIssues object to update
 * @param {FileIssue} issue - The new FileIssue to incorporate
 * @returns {void}
 */
function updateToolIssues(existing: CombinedFileIssues, issue: FileIssue): void {
  if (issue.tool === 'typescript') {
    existing.typeScriptIssues += issue.count;
  } else {
    existing[`${issue.tool}Issues`] += issue.count;
  }
}

/**
 * Gets the tool-specific issue count for a given FileIssue.
 * @param {FileIssue} issue - The FileIssue to get count from
 * @returns {number} The count for the specific tool
 */
function getToolIssueCount(issue: FileIssue): number {
  return issue.count;
}

/**
 * Creates a severity breakdown object from a FileIssue.
 * @param {FileIssue} issue - The FileIssue to convert
 * @returns {{ error: number; warning: number; info: number }} Severity breakdown object
 */
function createSeverityBreakdown(issue: FileIssue): { error: number; warning: number; info: number } {
  return {
    error: issue.severity === 'error' ? getToolIssueCount(issue) : ZERO,
    warning: issue.severity === 'warning' ? getToolIssueCount(issue) : ZERO,
    info: issue.severity === 'info' ? getToolIssueCount(issue) : ZERO,
  };
}

/**
 * Creates error types set from a FileIssue.
 * @param {FileIssue} issue - The FileIssue to extract error types from
 * @returns {Set<string>} Set of error types
 */
function createErrorTypesSet(issue: FileIssue): Set<string> {
  if (issue.errorType !== undefined && issue.errorType !== null && issue.errorType.length > ZERO) {
    return new Set([issue.errorType]);
  }
  return new Set([]);
}

/**
 * Creates tool-specific issue counts from a FileIssue.
 * @param {FileIssue} issue - The FileIssue to convert
 * @returns {{ lintIssues: number; checkIssues: number; typeScriptIssues: number; eslintIssues: number }} Object with tool-specific issue counts
 */
function createToolIssueCounts(issue: FileIssue): {
  lintIssues: number;
  checkIssues: number;
  typeScriptIssues: number;
  eslintIssues: number;
} {
  const count = getToolIssueCount(issue);
  return {
    lintIssues: issue.tool === 'lint' ? count : ZERO,
    checkIssues: issue.tool === 'check' ? count : ZERO,
    typeScriptIssues: issue.tool === 'typescript' ? count : ZERO,
    eslintIssues: issue.tool === 'eslint' ? count : ZERO,
  };
}

/**
 * Creates a new CombinedFileIssues object from a FileIssue.
 * @param {FileIssue} issue - The FileIssue to convert
 * @returns {CombinedFileIssues} A new CombinedFileIssues object
 */
function createCombinedFileIssues(issue: FileIssue): CombinedFileIssues {
  const toolCounts = createToolIssueCounts(issue);
  const severityBreakdown = createSeverityBreakdown(issue);
  const errorTypes = createErrorTypesSet(issue);

  return {
    file: issue.file,
    totalIssues: getToolIssueCount(issue),
    ...toolCounts,
    severityBreakdown,
    errorTypes,
  };
}

/**
 * Updates an existing CombinedFileIssues object with a new issue.
 * @param {CombinedFileIssues} existing - The existing CombinedFileIssues object to update
 * @param {FileIssue} issue - The new FileIssue to incorporate
 * @returns {void}
 */
function updateExistingCombinedIssues(existing: CombinedFileIssues, issue: FileIssue): void {
  existing.totalIssues += issue.count;
  updateToolIssues(existing, issue);
  updateSeverityBreakdown(existing, issue);
  if (issue.errorType !== undefined && issue.errorType !== null && issue.errorType.length > ZERO) {
    existing.errorTypes.add(issue.errorType);
  }
}

/**
 * Processes a single issue and updates the file map accordingly.
 * @param {Map<string, CombinedFileIssues>} fileMap - Map of file paths to CombinedFileIssues objects
 * @param {FileIssue} issue - The FileIssue to process
 * @returns {void}
 */
function processSingleIssue(fileMap: Map<string, CombinedFileIssues>, issue: FileIssue): void {
  const existing = fileMap.get(issue.file);

  if (existing) {
    updateExistingCombinedIssues(existing, issue);
  } else {
    fileMap.set(issue.file, createCombinedFileIssues(issue));
  }
}

/**
 * Combines issues from different tools into aggregated file-level statistics.
 * @param {FileIssue[]} allIssues - Array of FileIssue objects from all tools
 * @returns {CombinedFileIssues[]} Array of CombinedFileIssues objects with aggregated statistics
 */
function combineIssues(allIssues: FileIssue[]): CombinedFileIssues[] {
  const fileMap = new Map<string, CombinedFileIssues>();

  for (const issue of allIssues) {
    processSingleIssue(fileMap, issue);
  }

  return Array.from(fileMap.values());
}

/**
 * Calculates and collects error types from combined issues.
 * @param {CombinedFileIssues[]} combinedIssues - Array of CombinedFileIssues objects
 * @returns {Set<string>} Set of unique error types
 */
function collectErrorTypes(combinedIssues: CombinedFileIssues[]): Set<string> {
  const allErrorTypes = new Set<string>();
  for (const item of combinedIssues) {
    for (const type of Array.from(item.errorTypes)) {
      allErrorTypes.add(type);
    }
  }
  return allErrorTypes;
}

/**
 * Calculates tool-specific issue statistics.
 * @param {CombinedFileIssues[]} combinedIssues - Array of CombinedFileIssues objects
 * @returns {{ totalLintIssues: number; totalCheckIssues: number; totalTsIssues: number; totalEsLintIssues: number }} Object with tool-specific totals
 */
function calculateToolStatistics(combinedIssues: CombinedFileIssues[]): {
  totalLintIssues: number;
  totalCheckIssues: number;
  totalTsIssues: number;
  totalEsLintIssues: number;
} {
  const totalLintIssues = combinedIssues.reduce((sum, item) => sum + item.lintIssues, ZERO);
  const totalCheckIssues = combinedIssues.reduce((sum, item) => sum + item.checkIssues, ZERO);
  const totalTsIssues = combinedIssues.reduce((sum, item) => sum + item.typeScriptIssues, ZERO);
  const totalEsLintIssues = combinedIssues.reduce((sum, item) => sum + item.eslintIssues, ZERO);

  return { totalLintIssues, totalCheckIssues, totalTsIssues, totalEsLintIssues };
}

/**
 * Displays the analysis title and separator.
 * @returns {void}
 */
function displayAnalysisTitle(): void {
  console.log('\n🏗️  COMPREHENSIVE QUALITY ANALYSIS');
  console.log('━'.repeat(TABLE_WIDTH));
}

/**
 * Displays the overall statistics section.
 * @param {number} totalFiles - Total number of files with issues
 * @param {number} totalIssues - Total number of issues across all files
 * @param {ReturnType<typeof calculateToolStatistics>} toolStats - Tool-specific statistics
 * @param {number} uniqueErrorTypes - Number of unique error types
 * @returns {void}
 */
function displayOverallStatistics(
  totalFiles: number,
  totalIssues: number,
  toolStats: ReturnType<typeof calculateToolStatistics>,
  uniqueErrorTypes: number,
): void {
  console.log('📊 OVERALL STATISTICS:');
  console.log(`   Total Files with Issues: ${totalFiles}`);
  console.log(`   Total Issues: ${totalIssues}`);
  console.log(
    `   └─ Lint: ${toolStats.totalLintIssues} | Check: ${toolStats.totalCheckIssues} | TypeScript: ${toolStats.totalTsIssues} | ESLint: ${toolStats.totalEsLintIssues}`,
  );
  console.log(`   Unique Error Types: ${uniqueErrorTypes}`);
}

/**
 * Displays the header section with overall statistics.
 * @param {number} totalFiles - Total number of files with issues
 * @param {number} totalIssues - Total number of issues across all files
 * @param {ReturnType<typeof calculateToolStatistics>} toolStats - Tool-specific statistics
 * @param {number} uniqueErrorTypes - Number of unique error types
 * @returns {void}
 */
function displayHeader(
  totalFiles: number,
  totalIssues: number,
  toolStats: ReturnType<typeof calculateToolStatistics>,
  uniqueErrorTypes: number,
): void {
  displayAnalysisTitle();
  displayOverallStatistics(totalFiles, totalIssues, toolStats, uniqueErrorTypes);
}

/**
 * Creates the table header for problematic files display.
 * @returns {void}
 */
function createProblematicFilesHeader(): void {
  console.log('\n🔥 TOP MOST PROBLEMATIC FILES:');
  console.log('━'.repeat(TABLE_WIDTH));
  console.log('Rank | Total | Lint | Check |  TS  | ESLint | File'.padEnd(MAX_FILENAME_LENGTH));
  console.log(
    '─────|'.padEnd(RANK_COLUMN_WIDTH, '━') +
      '─────'.padEnd(TOTAL_COLUMN_WIDTH, '━') +
      '─────'.padEnd(LINT_COLUMN_WIDTH, '━') +
      '─────'.padEnd(CHECK_COLUMN_WIDTH, '━') +
      '─────'.padEnd(TS_COLUMN_WIDTH, '━') +
      '─────'.padEnd(ESLINT_COLUMN_WIDTH, '━') +
      'File'.padEnd(MAX_FILENAME_LENGTH, '━'),
  );
}

/**
 * Truncates file name if it exceeds maximum length.
 * @param {string} filename - The file name to truncate
 * @returns {string} Truncated file name or original if within limit
 */
function truncateFilename(filename: string): string {
  return filename.length > MAX_FILENAME_LENGTH
    ? `${filename.slice(-(MAX_FILENAME_LENGTH - FILE_TRUNCATE_LENGTH))}...`
    : filename;
}

/**
 * Formats a single row for problematic files display.
 * @param {CombinedFileIssues} item - CombinedFileIssues object to display
 * @param {number} rank - Rank of the file in the list
 * @returns {string} Formatted string for the row
 */
function formatProblematicFileRow(item: CombinedFileIssues, rank: number): string {
  const truncatedFile = truncateFilename(item.file);
  return (
    `${rank.toString().padStart(RANK_PAD_START)} | ` +
    `${item.totalIssues.toString().padStart(TOTAL_PAD_START)} | ` +
    `${item.lintIssues.toString().padStart(LINT_PAD_START)} | ` +
    `${item.checkIssues.toString().padStart(CHECK_PAD_START)} | ` +
    `${item.typeScriptIssues.toString().padStart(TS_PAD_START)} | ` +
    `${item.eslintIssues.toString().padStart(ESLINT_PAD_START)} | ` +
    `${truncatedFile}`
  );
}

/**
 * Displays file rows for problematic files table.
 * @param {CombinedFileIssues[]} combinedIssues - Sorted array of CombinedFileIssues objects
 * @param {number} displayLimit - Number of files to display
 * @returns {void}
 */
function displayProblematicFileRows(combinedIssues: CombinedFileIssues[], displayLimit: number): void {
  for (let index = 0; index < displayLimit; index++) {
    const item = combinedIssues[index];
    if (!item) {
      continue; // Guard against undefined access
    }

    const rank = index + ONE;
    const formattedRow = formatProblematicFileRow(item, rank);
    console.log(formattedRow);
  }
}

/**
 * Displays the table of problematic files.
 * @param {CombinedFileIssues[]} combinedIssues - Sorted array of CombinedFileIssues objects
 * @param {number} displayLimit - Number of files to display
 * @returns {void}
 */
function displayProblematicFiles(combinedIssues: CombinedFileIssues[], displayLimit: number): void {
  createProblematicFilesHeader();
  displayProblematicFileRows(combinedIssues, displayLimit);
}

/**
 * Displays severity breakdown information.
 * @param {CombinedFileIssues[]} combinedIssues - Array of CombinedFileIssues objects
 * @returns {void}
 */
function displaySeverityBreakdown(combinedIssues: CombinedFileIssues[]): void {
  const totalErrorCount = combinedIssues.reduce((sum, item) => sum + item.severityBreakdown.error, ZERO);
  const totalWarningCount = combinedIssues.reduce((sum, item) => sum + item.severityBreakdown.warning, ZERO);
  const totalInfoCount = combinedIssues.reduce((sum, item) => sum + item.severityBreakdown.info, ZERO);

  console.log('━'.repeat(TABLE_WIDTH));
  console.log('📈 SEVERITY BREAKDOWN:');
  console.log(`   Errors: ${totalErrorCount} | Warnings: ${totalWarningCount} | Info: ${totalInfoCount}`);
}

/**
 * Calculates error type counts from combined issues.
 * @param {CombinedFileIssues[]} combinedIssues - Array of CombinedFileIssues objects
 * @returns {Map<string, number>} Map of error type to occurrence count
 */
function calculateErrorTypeCounts(combinedIssues: CombinedFileIssues[]): Map<string, number> {
  const errorTypeCounts = new Map<string, number>();
  for (const item of combinedIssues) {
    for (const type of Array.from(item.errorTypes)) {
      errorTypeCounts.set(type, (errorTypeCounts.get(type) ?? ZERO) + ONE);
    }
  }
  return errorTypeCounts;
}

/**
 * Displays top error types analysis.
 * @param {CombinedFileIssues[]} combinedIssues - Array of CombinedFileIssues objects
 * @returns {void}
 */
function displayTopErrorTypes(combinedIssues: CombinedFileIssues[]): void {
  const allErrorTypes = collectErrorTypes(combinedIssues);

  if (allErrorTypes.size <= ZERO) {
    return;
  }

  const errorTypeCounts = calculateErrorTypeCounts(combinedIssues);
  const sortedErrorTypes = Array.from(errorTypeCounts.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(ZERO, TOP_ERROR_TYPES_LIMIT);

  console.log('\n🏷️  TOP ERROR TYPES:');
  for (const [errorType, count] of sortedErrorTypes) {
    console.log(`   ${errorType}: ${count} occurrences`);
  }
}

/**
 * Prepares combined issues for display by sorting and calculating totals.
 * @param {CombinedFileIssues[]} combinedIssues - Array of CombinedFileIssues objects to prepare
 * @returns {{ sortedIssues: CombinedFileIssues[]; totalIssues: number; totalFiles: number }} Object with sorted issues and calculated totals
 */
function prepareCombinedIssuesForDisplay(combinedIssues: CombinedFileIssues[]): {
  sortedIssues: CombinedFileIssues[];
  totalIssues: number;
  totalFiles: number;
} {
  // Sort by total issues (descending)
  const sortedIssues = [...combinedIssues].sort((a, b) => b.totalIssues - a.totalIssues);
  const totalIssues = sortedIssues.reduce((sum, item) => sum + item.totalIssues, ZERO);
  const totalFiles = sortedIssues.length;

  return { sortedIssues, totalIssues, totalFiles };
}

/**
 * Displays recommendation message at the end of analysis.
 * @returns {void}
 */
function displayRecommendation(): void {
  console.log('\n💡 RECOMMENDATION:');
  console.log('   Focus on the files in the top list to maximize your impact on code quality!');
}

/**
 * Displays the comprehensive quality analysis results in a formatted table.
 * @param {CombinedFileIssues[]} combinedIssues - Array of CombinedFileIssues objects with aggregated statistics
 * @param {number} limit - Maximum number of files to display in the results
 * @returns {void}
 */
function displayResults(combinedIssues: CombinedFileIssues[], limit: number): void {
  const { sortedIssues, totalIssues, totalFiles } = prepareCombinedIssuesForDisplay(combinedIssues);
  const displayLimit = Math.min(limit, totalFiles);

  // Calculate statistics using helper functions
  const toolStats = calculateToolStatistics(sortedIssues);
  const allErrorTypes = collectErrorTypes(sortedIssues);

  // Display sections using helper functions
  displayHeader(totalFiles, totalIssues, toolStats, allErrorTypes.size);
  displayProblematicFiles(sortedIssues, displayLimit);
  displaySeverityBreakdown(sortedIssues);
  displayTopErrorTypes(sortedIssues);
  displayRecommendation();
}

/**
 * Parses command line arguments and returns the limit.
 * @returns {number} The limit for number of files to display
 */
function parseCommandLineArguments(): number {
  const limitArgument = process.argv[2];
  if (limitArgument !== undefined && limitArgument !== null && limitArgument.trim().length > ZERO) {
    return Number.parseInt(limitArgument, DECIMAL_RADIX);
  }
  return DEFAULT_LIMIT;
}

/**
 * Runs all quality analysis tools in parallel.
 * @returns {Promise<FileIssue[]>} Array of FileIssue objects from all tools
 */
async function runAllAnalyses(): Promise<FileIssue[]> {
  const [lintIssues, checkIssues, typeScriptIssues, eslintIssues] = await Promise.all([
    runLintAnalysis(),
    runCheckAnalysis(),
    runTypeScriptAnalysis(),
    runEsLintAnalysis(),
  ]);

  return [...lintIssues, ...checkIssues, ...typeScriptIssues, ...eslintIssues];
}

/**
 * Handles analysis errors by logging and exiting.
 * @param {unknown} error - The error that occurred
 * @returns {never} Never returns (exits process)
 */
function handleAnalysisError(error: unknown): never {
  console.error('❌ Error running comprehensive quality analysis:', error);
  process.exit(ERROR_EXIT_CODE);
}

/**
 * Main entry point for the comprehensive quality analysis script.
 * @returns {Promise<void>} Promise that resolves when analysis is complete
 */
async function main(): Promise<void> {
  const limit = parseCommandLineArguments();
  console.log(`🚀 Starting comprehensive quality analysis (showing top ${limit} files)...\n`);

  try {
    const allIssues = await runAllAnalyses();
    console.log(`\n📋 Collected ${allIssues.length} total issues from all tools\n`);

    const combinedIssues = combineIssues(allIssues);
    displayResults(combinedIssues, limit);
  } catch (error) {
    handleAnalysisError(error);
  }
}

// Run if called directly
main().catch((error) => {
  console.error('❌ Unhandled error in main:', error);
  process.exit(ERROR_EXIT_CODE);
});
