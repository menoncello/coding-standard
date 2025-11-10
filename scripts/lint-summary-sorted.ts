#!/usr/bin/env bun

/**
 * Script to sort lint errors by file and count.
 *
 * This script runs Biome linter, parses the output, and displays a sorted
 * summary of lint errors by file, making it easier to identify files with
 * the most issues that need attention.
 *
 * Usage: bun run scripts/lint-summary-sorted.ts [limit]
 *
 * @param limit - Optional number of files to display (default: 20)
 */

import process from 'node:process';

/** Default number of files to display in the summary */
const DEFAULT_LIMIT = 20;

/** Maximum file path length before truncation */
const MAX_FILE_PATH_LENGTH = 70;

/** Table width for console output formatting */
const TABLE_WIDTH = 80;

/** Column width for the count column */
const COUNT_COLUMN_WIDTH = 10;

/** Exit code for process failures */
const EXIT_CODE_FAILURE = 1;

/** Number of characters to show when truncating file paths */
const TRUNCATE_LENGTH = 67;

/** Minimum number for checking if value is greater than zero */
const ZERO = 0;

/** Regex pattern for performance - matches summary lines */
const SUMMARY_LINE_PATTERN = /^\s*-\s+(.+?)\s+\((\d+) errors\)$/;

/** Alternative pattern for stderr parsing */
const STDERR_LINE_PATTERN = /^\s*-\s+(.+?)\s+\((\d+) errors?\)/;

interface FileError {
  file: string;
  count: number;
}

/**
 * Parse command line arguments to get the display limit
 * @returns {number} The number of files to display
 */
function parseArguments(): number {
  const limitArgument = process.argv[2];
  if (limitArgument !== undefined && limitArgument !== null) {
    const trimmedArgument = limitArgument.trim();
    if (trimmedArgument.length > ZERO) {
      return Number.parseInt(trimmedArgument, 10);
    }
  }
  return DEFAULT_LIMIT;
}

/**
 * Run Biome linter and capture stdout and stderr output
 * @returns {Promise<{ stdout: string; stderr: string }>} Object containing stdout and stderr text
 */
async function runLint(): Promise<{ stdout: string; stderr: string }> {
  const lintProcess = Bun.spawn(['bunx', '@biomejs/biome', 'lint', '.', '--reporter=summary'], {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const stdout = await new Response(lintProcess.stdout).text();
  const stderr = await new Response(lintProcess.stderr).text();

  return { stdout, stderr };
}

/**
 * Parse file errors from lint output lines
 * @param {readonly string[]} lines - Array of lines from lint output
 * @param {RegExp} pattern - Regex pattern to match file error lines
 * @returns {FileError[]} Array of file error objects
 */
// eslint-disable-next-line complexity
function parseFileErrors(lines: readonly string[], pattern: RegExp): FileError[] {
  const fileErrors: FileError[] = [];

  for (const line of lines) {
    const match = line.match(pattern);
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (match?.[1] && match?.[2]) {
      const file = match[1];
      const count = Number.parseInt(match[2], 10);
      fileErrors.push({ file, count });
    }
  }

  return fileErrors;
}

/**
 * Parse file errors from both stdout and stderr outputs
 * @param {string} stdout - Standard output from lint command
 * @param {string} stderr - Standard error output from lint command
 * @returns {FileError[]} Array of file error objects sorted by count (descending)
 */
function parseLintOutput(stdout: string, stderr: string): FileError[] {
  const lines = stdout.split('\n');
  let fileErrors = parseFileErrors(lines, SUMMARY_LINE_PATTERN);

  // Try parsing from stderr if we didn't get results from stdout
  if (fileErrors.length === ZERO && stderr) {
    const stderrLines = stderr.split('\n');
    const stderrFileErrors = parseFileErrors(stderrLines, STDERR_LINE_PATTERN);
    fileErrors = stderrFileErrors;
  }

  // Sort by error count (descending)
  fileErrors.sort((a, b) => b.count - a.count);

  return fileErrors;
}

/**
 * Truncate file path if it exceeds maximum length
 * @param {string} filePath - The file path to truncate
 * @returns {string} Truncated file path with ellipsis if needed
 */
function truncateFilePath(filePath: string): string {
  return filePath.length > MAX_FILE_PATH_LENGTH ? `${filePath.slice(-TRUNCATE_LENGTH)}...` : filePath;
}

/**
 * Calculate summary statistics for file errors
 * @param {FileError[]} fileErrors - Array of file error objects
 * @param {number} limit - Maximum number of files to display
 * @returns {{ totalErrors: number; displayLimit: number }} Object containing total errors and display limit
 */
function calculateSummaryStats(fileErrors: FileError[], limit: number): { totalErrors: number; displayLimit: number } {
  const totalErrors = fileErrors.reduce((sum, item) => sum + item.count, ZERO);
  const displayLimit = Math.min(limit, fileErrors.length);
  return { totalErrors, displayLimit };
}

/**
 * Display the table header for the lint summary
 */
function displayTableHeader(): void {
  console.log('📊 Lint Errors by File (sorted by count):');
  console.log('━'.repeat(TABLE_WIDTH));
  console.log('Count\tFile');
  console.log('─────\t'.padEnd(COUNT_COLUMN_WIDTH, '━') + 'File'.padEnd(MAX_FILE_PATH_LENGTH, '━'));
}

/**
 * Display the file error rows in the table
 * @param {FileError[]} fileErrors - Array of file error objects
 * @param {number} displayLimit - Number of files to display
 */
function displayFileErrors(fileErrors: FileError[], displayLimit: number): void {
  for (let index = 0; index < displayLimit; index++) {
    const fileError = fileErrors[index];
    if (!fileError) continue;

    const { file, count } = fileError;
    const truncatedFile = truncateFilePath(file);
    console.log(`${count}\t${truncatedFile}`);
  }
}

/**
 * Display the summary statistics
 * @param {FileError[]} fileErrors - Array of file error objects
 * @param {number} totalErrors - Total number of errors
 * @param {number} displayLimit - Number of files displayed
 */
function displaySummaryStats(fileErrors: FileError[], totalErrors: number, displayLimit: number): void {
  console.log('━'.repeat(TABLE_WIDTH));
  console.log('📈 Summary:');
  console.log(`   Files with errors: ${fileErrors.length}`);
  console.log(`   Total errors: ${totalErrors}`);
  console.log(`   Top ${displayLimit} files shown`);
}

/**
 * Display additional stderr output if available
 * @param {string} stderr - Additional stderr output to display
 */
function displayAdditionalOutput(stderr: string): void {
  if (stderr?.trim()) {
    console.log('\n🔧 Additional output:');
    console.log(stderr.trim());
  }
}

/**
 * Display the lint error summary in a formatted table
 * @param {FileError[]} fileErrors - Array of file error objects
 * @param {number} limit - Maximum number of files to display
 * @param {string} stderr - Additional stderr output to display
 */
function displayLintSummary(fileErrors: FileError[], limit: number, stderr: string): void {
  if (fileErrors.length === ZERO) {
    return;
  }

  const { totalErrors, displayLimit } = calculateSummaryStats(fileErrors, limit);

  displayTableHeader();
  displayFileErrors(fileErrors, displayLimit);
  displaySummaryStats(fileErrors, totalErrors, displayLimit);
  displayAdditionalOutput(stderr);
}

/**
 * Main function to run the lint summary script
 */
async function main(): Promise<void> {
  const limit = parseArguments();

  try {
    const { stdout, stderr } = await runLint();
    const fileErrors = parseLintOutput(stdout, stderr);
    displayLintSummary(fileErrors, limit, stderr);
  } catch {
    process.exit(EXIT_CODE_FAILURE);
  }
}

// Run if called directly
if (import.meta.main) {
  await main();
}
