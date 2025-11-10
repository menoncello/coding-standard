#!/usr/bin/env bun

/**
 * Script to run all quality checks and show sorted summaries
 * Usage: bun run scripts/quality-summary.ts [limit]
 */

import process from 'node:process';
import {
  ERROR_COUNT_ZERO,
  hasNoErrorsMessage,
  isFileValidForParsing,
  isStandardFileLine,
  isValidFilePath,
  parseFileLine,
  parseLintFileLine,
  parseLintLineFormat,
  parseStandardFileLine,
  shouldParseLintLine,
  shouldSkipLine,
  updateTotalErrorsFromLine,
  ZERO_SLICE,
} from './quality-summary-parsers.ts';

// Constants extracted from magic numbers
const DEFAULT_LIMIT = 10;
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const MAX_CONSOLE_WIDTH = 80;
const MAX_FILE_DISPLAY_LENGTH = 60;
const MAX_FILE_TRUNCATE_LENGTH = -57;
const TOP_FILES_LIMIT = 10;
const COLUMN_PADDING_COUNT = 4;
const COLUMN_PADDING_TOOLS = 12;
const TRUNCATE_INDICATOR_LENGTH = 3;
const DISPLAY_TRUNCATE_OFFSET = 67;

interface ToolResult {
  name: string;
  success: boolean;
  fileCount: number;
  errorCount: number;
  topFiles: Array<{ file: string; count: number; errorTypes?: Set<string> }>;
}

interface FileAggregate {
  count: number;
  tools: Set<string>;
}

/**
 * Parses process output to extract error information
 * @param {string} stdout - The stdout output from the process
 * @param {string} toolName - Name of the tool for parsing context
 * @returns {{topFiles: Array<{ file: string; count: number }>, totalErrors: number}} Parsed results with top files and error counts
 */
function parseProcessOutput(
  stdout: string,
  toolName: string,
): {
  topFiles: Array<{ file: string; count: number }>;
  totalErrors: number;
} {
  const lines = stdout.split('\n');
  return parseLinesForErrors(lines, toolName);
}

/**
 * Parses lines to extract error information
 * @param {string[]} lines - Lines to parse
 * @param {string} toolName - Name of the tool
 * @returns {{topFiles: Array<{ file: string; count: number }>, totalErrors: number}} Parsed results
 */
function parseLinesForErrors(
  lines: string[],
  toolName: string,
): {
  topFiles: Array<{ file: string; count: number }>;
  totalErrors: number;
} {
  const initialState = createParseState();
  return processAllLines(lines, toolName, initialState);
}

/**
 * Creates initial parse state
 * @returns {{topFiles: Array<{ file: string; count: number }>, totalErrors: number}} Initial state
 */
function createParseState(): {
  topFiles: Array<{ file: string; count: number }>;
  totalErrors: number;
} {
  return {
    topFiles: [],
    totalErrors: ERROR_COUNT_ZERO,
  };
}

/**
 * Processes all lines and returns final state
 * @param {string[]} lines - Lines to process
 * @param {string} toolName - Tool name
 * @param {{topFiles: Array<{ file: string; count: number }>, totalErrors: number}} state - Initial state
 * @param {Array<{ file: string; count: number }>} state.topFiles - Files array in state
 * @param {number} state.totalErrors - Error count in state
 * @returns {{topFiles: Array<{ file: string; count: number }>, totalErrors: number}} Final state
 */
function processAllLines(
  lines: string[],
  toolName: string,
  state: { topFiles: Array<{ file: string; count: number }>; totalErrors: number },
): { topFiles: Array<{ file: string; count: number }>; totalErrors: number } {
  for (const line of lines) {
    const shouldReturn = checkForEarlyReturn(line, toolName);
    if (shouldReturn) {
      return { topFiles: [], totalErrors: ERROR_COUNT_ZERO };
    }

    processLine(line, toolName, state);
  }

  return state;
}

/**
 * Checks if processing should return early
 * @param {string} line - Line to check
 * @param {string} toolName - Tool name for context
 * @returns {boolean} True if should return early
 */
function checkForEarlyReturn(line: string, toolName: string): boolean {
  return hasNoErrorsMessage(line);
}

/**
 * Processes a single line
 * @param {string} line - Line to process
 * @param {string} toolName - Tool name
 * @param {{topFiles: Array<{ file: string; count: number }>, totalErrors: number}} state - Current state
 * @param {Array<{ file: string; count: number }>} state.topFiles - Files array in state
 * @param {number} state.totalErrors - Error count in state
 */
function processLine(
  line: string,
  toolName: string,
  state: { topFiles: Array<{ file: string; count: number }>; totalErrors: number },
): void {
  if (!shouldSkipLine(toolName, line)) {
    parseFileLine(toolName, line, state.topFiles);
  }

  state.totalErrors = updateTotalErrorsFromLine(line, state.totalErrors);
}

/**
 * Creates a tool result object
 * @param {string} name - Tool name
 * @param {boolean} success - Whether the tool succeeded
 * @param {Array<{ file: string; count: number }>} topFiles - Array of top files with errors
 * @param {number} totalErrors - Total error count
 * @returns {ToolResult} Tool result object
 */
function createToolResult(
  name: string,
  success: boolean,
  topFiles: Array<{ file: string; count: number }>,
  totalErrors: number,
): ToolResult {
  return {
    name,
    success,
    fileCount: topFiles.length,
    errorCount: totalErrors,
    topFiles,
  };
}

/**
 * Runs a quality check tool and parses its output
 * @param {string} toolName - Name of the tool to run
 * @param {string} scriptPath - Path to the script to execute
 * @param {number} limit - Maximum number of files to show
 * @returns {Promise<ToolResult>} Tool result with parsed data
 */
async function runQualityTool(toolName: string, scriptPath: string, limit: number): Promise<ToolResult> {
  try {
    const { stdout, exitCode } = await executeToolScript(scriptPath, limit);
    const { topFiles, totalErrors } = parseProcessOutput(stdout, toolName);
    return createToolResult(toolName, exitCode === EXIT_SUCCESS, topFiles, totalErrors);
  } catch {
    return createToolResult(toolName, false, [], ERROR_COUNT_ZERO);
  }
}

/**
 * Executes a tool script and returns output
 * @param {string} scriptPath - Path to the script
 * @param {number} limit - Limit parameter
 * @returns {Promise<{stdout: string, exitCode: number}>} Script output and exit code
 */
async function executeToolScript(
  scriptPath: string,
  limit: number,
): Promise<{
  stdout: string;
  exitCode: number;
}> {
  const process = Bun.spawn(['bun', 'run', scriptPath, String(limit)], {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const stdout = await new Response(process.stdout).text();
  const exitCode = await process.exited;

  return { stdout, exitCode };
}

/**
 * Runs lint summary with specified limit
 * @param {number} limit - Maximum number of files to show in summary
 * @returns {Promise<ToolResult>} Tool result with lint error data
 */
async function runLintSummary(limit: number): Promise<ToolResult> {
  return runQualityTool('Lint', 'scripts/lint-summary-sorted.ts', limit);
}

/**
 * Runs check summary with specified limit
 * @param {number} limit - Maximum number of files to show in summary
 * @returns {Promise<ToolResult>} Tool result with check error data
 */
async function runCheckSummary(limit: number): Promise<ToolResult> {
  return runQualityTool('Check', 'scripts/check-summary-sorted.ts', limit);
}

/**
 * Runs TypeScript summary with specified limit
 * @param {number} limit - Maximum number of files to show in summary
 * @returns {Promise<ToolResult>} Tool result with TypeScript error data
 */
async function runTypeScriptSummary(limit: number): Promise<ToolResult> {
  return runQualityTool('TypeScript', 'scripts/typescript-summary-sorted.ts', limit);
}

/**
 * Runs ESLint summary with specified limit
 * @param {number} limit - Maximum number of files to show in summary
 * @returns {Promise<ToolResult>} Tool result with ESLint error data
 */
async function runEsLintSummary(limit: number): Promise<ToolResult> {
  return runQualityTool('ESLint', 'scripts/eslint-summary-sorted.ts', limit);
}

/**
 * Calculates overall statistics from tool results
 * @param {ToolResult[]} results - Array of tool results
 * @returns {{allSuccess: boolean, totalErrors: number, totalFilesWithErrors: number, uniqueFilesWithErrors: number}} Object containing calculated statistics
 */
function calculateOverallStats(results: ToolResult[]): {
  allSuccess: boolean;
  totalErrors: number;
  totalFilesWithErrors: number;
  uniqueFilesWithErrors: number;
} {
  const allSuccess = results.every((result) => result.success);
  const totalErrors = results.reduce((sum, result) => sum + result.errorCount, ERROR_COUNT_ZERO);
  const totalFilesWithErrors = results.reduce((sum, result) => sum + result.fileCount, ERROR_COUNT_ZERO);
  const uniqueFilesWithErrors = new Set(results.flatMap((result) => result.topFiles.map((file) => file.file))).size;

  return { allSuccess, totalErrors, totalFilesWithErrors, uniqueFilesWithErrors };
}

/**
 * Displays overall status based on statistics
 * @param {boolean} allSuccess - Whether all tools succeeded
 * @param {number} totalErrors - Total error count
 * @param {number} uniqueFilesWithErrors - Number of unique files with errors
 */
function displayOverallStatus(allSuccess: boolean, totalErrors: number, uniqueFilesWithErrors: number): void {
  if (allSuccess && totalErrors === ERROR_COUNT_ZERO) {
    console.log('🎉 All quality checks passed! No issues found.');
  } else {
    console.log(`⚠️  Found ${totalErrors} total issues across ${uniqueFilesWithErrors} unique files.`);
  }
}

/**
 * Displays detailed results for each tool
 * @param {ToolResult[]} results - Array of tool results
 */
function displayDetailedResults(results: ToolResult[]): void {
  console.log('\n📋 DETAILED RESULTS:');
  console.log('━'.repeat(MAX_CONSOLE_WIDTH));

  for (const result of results) {
    const status = result.success ? '✅' : '❌';
    const statusText = result.success ? 'PASSED' : 'FAILED';

    console.log(`${status} ${result.name}: ${result.errorCount} errors in ${result.fileCount} files (${statusText})`);
  }
}

/**
 * Aggregates file data across all tools
 * @param {ToolResult[]} results - Array of tool results
 * @returns {Map<string, FileAggregate>} Map of file names to aggregated data
 */
function aggregateFileData(results: ToolResult[]): Map<string, FileAggregate> {
  const fileAggregates = new Map<string, FileAggregate>();

  for (const result of results) {
    for (const file of result.topFiles) {
      updateFileAggregate(fileAggregates, file.file, file.count, result.name);
    }
  }

  return fileAggregates;
}

/**
 * Updates file aggregate data
 * @param {Map<string, FileAggregate>} fileAggregates - Map to update
 * @param {string} fileName - Name of the file
 * @param {number} count - Error count
 * @param {string} toolName - Name of the tool
 */
function updateFileAggregate(
  fileAggregates: Map<string, FileAggregate>,
  fileName: string,
  count: number,
  toolName: string,
): void {
  const existing = fileAggregates.get(fileName);

  if (existing) {
    updateExistingAggregate(existing, count, toolName);
  } else {
    createNewAggregate(fileAggregates, fileName, count, toolName);
  }
}

/**
 * Updates an existing file aggregate
 * @param {FileAggregate} existing - Existing aggregate to update
 * @param {number} count - Additional error count
 * @param {string} toolName - Tool name to add
 */
function updateExistingAggregate(existing: FileAggregate, count: number, toolName: string): void {
  existing.count += count;
  existing.tools.add(toolName);
}

/**
 * Creates a new file aggregate entry
 * @param {Map<string, FileAggregate>} fileAggregates - Map to update
 * @param {string} fileName - File name
 * @param {number} count - Error count
 * @param {string} toolName - Tool name
 */
function createNewAggregate(
  fileAggregates: Map<string, FileAggregate>,
  fileName: string,
  count: number,
  toolName: string,
): void {
  fileAggregates.set(fileName, {
    count,
    tools: new Set([toolName]),
  });
}

/**
 * Displays top problematic files
 * @param {Map<string, FileAggregate>} fileAggregates - Map of aggregated file data
 */
function displayTopProblematicFiles(fileAggregates: Map<string, FileAggregate>): void {
  if (fileAggregates.size === ERROR_COUNT_ZERO) {
    return;
  }

  console.log('\n🔥 TOP PROBLEMATIC FILES (aggregated across all tools):');
  console.log('━'.repeat(MAX_CONSOLE_WIDTH));

  const sortedFiles = getTopProblematicFiles(fileAggregates);
  displayProblematicFilesList(sortedFiles);
}

/**
 * Gets top problematic files sorted by error count
 * @param {Map<string, FileAggregate>} fileAggregates - Map of file data
 * @returns {Array<[string, FileAggregate]>} Sorted array of files
 */
function getTopProblematicFiles(fileAggregates: Map<string, FileAggregate>): Array<[string, FileAggregate]> {
  return Array.from(fileAggregates.entries())
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(ZERO_SLICE, TOP_FILES_LIMIT);
}

/**
 * Displays a list of problematic files
 * @param {Array<[string, FileAggregate]>} sortedFiles - Sorted files to display
 */
function displayProblematicFilesList(sortedFiles: Array<[string, FileAggregate]>): void {
  for (const [file, data] of sortedFiles) {
    const truncatedFile = formatFileNameForDisplay(file);
    const tools = Array.from(data.tools).join('+');
    console.log(
      `${data.count.toString().padStart(COLUMN_PADDING_COUNT)} | ${tools.padEnd(COLUMN_PADDING_TOOLS)} | ${truncatedFile}`,
    );
  }
}

/**
 * Formats a file name for display
 * @param {string} file - File name to format
 * @returns {string} Formatted file name
 */
function formatFileNameForDisplay(file: string): string {
  return file.length > MAX_FILE_DISPLAY_LENGTH ? `${file.slice(MAX_FILE_TRUNCATE_LENGTH)}...` : file;
}

/**
 * Displays a comprehensive summary of quality check results
 * @param {ToolResult[]} results - Array of tool results from all quality checks
 */
function displaySummary(results: ToolResult[]): void {
  console.log('\n🏗️  QUALITY CHECK SUMMARY');
  console.log('━'.repeat(MAX_CONSOLE_WIDTH));

  const { allSuccess, totalErrors, uniqueFilesWithErrors } = calculateOverallStats(results);

  displayOverallStatus(allSuccess, totalErrors, uniqueFilesWithErrors);
  displayDetailedResults(results);

  const fileAggregates = aggregateFileData(results);
  displayTopProblematicFiles(fileAggregates);
}

/**
 * Parses command line argument for limit
 * @returns {number} Parsed limit value or default
 */
function parseLimitArgument(): number {
  const limitArgument = process.argv[2];

  if (isLimitArgumentValid(limitArgument) && limitArgument !== undefined) {
    return Number.parseInt(limitArgument, 10);
  }

  return DEFAULT_LIMIT;
}

/**
 * Checks if the limit argument is valid
 * @param {string | undefined} limitArgument - The limit argument to check
 * @returns {boolean} True if valid
 */
function isLimitArgumentValid(limitArgument: string | undefined): boolean {
  return limitArgument !== undefined && limitArgument.trim().length > ZERO_SLICE;
}

/**
 * Main execution function
 */
async function main(): Promise<void> {
  const limit = parseLimitArgument();

  console.log(`🔍 Running quality check summary (top ${limit} files)...`);

  const results = await Promise.all([
    runLintSummary(limit),
    runCheckSummary(limit),
    runTypeScriptSummary(limit),
    runEsLintSummary(limit),
  ]);

  displaySummary(results);

  // Exit with error code if any check failed
  const anyFailed = results.some((result) => !result.success);
  if (anyFailed) {
    process.exit(EXIT_FAILURE);
  }
}

// Run if called directly
if (import.meta.main) {
  await main();
}
