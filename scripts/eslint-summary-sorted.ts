#!/usr/bin/env bun

/**
 * Script to sort ESLint errors by file and count.
 * This script parses ESLint output and sorts errors by file, providing a summary view.
 * Usage: bun run scripts/eslint-summary-sorted.ts [limit]
 */

import { argv, exit } from 'node:process';

// Constants
const DEFAULT_LIMIT = 20;
const TABLE_LINE_LENGTH = 80;
const COUNT_COLUMN_WIDTH = 10;
const FILE_COLUMN_WIDTH = 55;
const ERROR_COLUMN_WIDTH = 15;
const TRUNCATED_FILE_LENGTH = 52;
const TRUNCATED_ERROR_LENGTH = 9;
const MAX_ERROR_TYPES_SHOWN = 3;
const START_INDEX = 0;
const EXIT_CODE_ERROR = 1;

// Regex patterns
const ESLINT_ERROR_PATTERN = /^\s+(\d+):(\d+)\s+(\w+)\s+(.*)\s+(\S+)$/;
const FILE_NAME_LINE_PATTERN = /^\s+\d+:\d+/;

/**
 * Interface for file error tracking
 */
interface FileError {
  file: string;
  count: number;
  errorTypes: Set<string>;
}

/**
 * Execute ESLint and capture output.
 * @returns {Promise<{ stdout: string; stderr: string }>} Promise that resolves to an object containing stdout and stderr
 */
async function runEslint(): Promise<{ stdout: string; stderr: string }> {
  const eslintProcess = Bun.spawn(['bunx', 'eslint', '.'], {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const stdout = await new Response(eslintProcess.stdout).text();
  const stderr = await new Response(eslintProcess.stderr).text();

  return { stdout, stderr };
}

/**
 * Parse a single line for ESLint errors.
 * @param {string} line - The line to parse
 * @param {string} currentFile - The current file being processed
 * @returns {{ hasError: boolean; ruleName?: string }} Whether the line has an error and the rule name
 */
function parseLineForError(line: string, currentFile: string): { hasError: boolean; ruleName?: string } {
  const match = line.match(ESLINT_ERROR_PATTERN);

  if (match && currentFile) {
    return { hasError: true, ruleName: match[5] };
  }

  return { hasError: false };
}

/**
 * Process a single line for file errors.
 * @param {string} line - The line to process
 * @param {string} currentFile - The current file being processed
 * @param {FileError[]} fileErrors - Array to update with file errors
 * @returns {string} The updated current file
 */
function processLine(line: string, currentFile: string, fileErrors: FileError[]): string {
  if (isFileNameLine(line)) {
    return line.trim();
  }

  const errorResult = parseLineForError(line, currentFile);
  if (errorResult.hasError && errorResult.ruleName !== undefined) {
    addOrUpdateFileError(fileErrors, currentFile, errorResult.ruleName);
  }

  return currentFile;
}

/**
 * Process ESLint output lines and extract file errors.
 * @param {string[]} lines - Array of ESLint output lines
 * @returns {FileError[]} Array of file errors with counts and error types
 */
function processEslintLines(lines: string[]): FileError[] {
  const fileErrors: FileError[] = [];
  let currentFile = '';

  for (const line of lines) {
    currentFile = processLine(line, currentFile, fileErrors);
  }

  return fileErrors;
}

/**
 * Parse ESLint output and extract file errors.
 * @param {string} errorOutput - The raw output from ESLint
 * @returns {FileError[]} Array of file errors with counts and error types
 */
function parseEslintOutput(errorOutput: string): FileError[] {
  const lines = errorOutput.split('\n');
  return processEslintLines(lines);
}

/**
 * Check if a line represents a filename.
 * @param {string} line - The line to check
 * @returns {boolean} True if the line represents a filename
 */
function isFileNameLine(line: string): boolean {
  return Boolean(line.trim() && !line.startsWith(' ') && !line.match(FILE_NAME_LINE_PATTERN));
}

/**
 * Add or update file error entry.
 * @param {FileError[]} fileErrors - Array of file errors to update
 * @param {string} currentFile - The file path to add or update
 * @param {string} ruleName - The rule name to add to the error types
 */
function addOrUpdateFileError(fileErrors: FileError[], currentFile: string, ruleName: string): void {
  const existingError = fileErrors.find((error) => error.file === currentFile);

  if (existingError) {
    existingError.count++;
    existingError.errorTypes.add(ruleName);
  } else {
    fileErrors.push({
      file: currentFile,
      count: 1,
      errorTypes: new Set([ruleName]),
    });
  }
}

/**
 * Format error types string for display.
 * @param {Set<string>} errorTypes - Set of error types to format
 * @returns {string} Formatted string representation of error types
 */
function formatErrorTypesString(errorTypes: Set<string>): string {
  const errorTypesArray = Array.from(errorTypes);
  const shownTypes = errorTypesArray.slice(START_INDEX, MAX_ERROR_TYPES_SHOWN).join(', ');
  const remainingCount = errorTypesArray.length - MAX_ERROR_TYPES_SHOWN;

  return remainingCount > START_INDEX ? `${shownTypes} (+${remainingCount})` : shownTypes;
}

/**
 * Truncate file path if too long.
 * @param {string} filePath - The file path to truncate
 * @returns {string} Truncated file path
 */
function truncateFilePath(filePath: string): string {
  return filePath.length > FILE_COLUMN_WIDTH ? `${filePath.slice(-TRUNCATED_FILE_LENGTH)}...` : filePath;
}

/**
 * Truncate error types string if too long.
 * @param {string} errorTypesString - The error types string to truncate
 * @returns {string} Truncated error types string
 */
function truncateErrorTypesString(errorTypesString: string): string {
  return errorTypesString.length > ERROR_COLUMN_WIDTH
    ? `${errorTypesString.slice(START_INDEX, TRUNCATED_ERROR_LENGTH)}...`
    : errorTypesString;
}

/**
 * Display the table header.
 */
function displayTableHeader(): void {
  console.log('📊 ESLint Errors by File (sorted by count):');
  console.log('━'.repeat(TABLE_LINE_LENGTH));
  console.log('Count\tUnique Errors\tFile');
  console.log(
    '─────\t'.padEnd(COUNT_COLUMN_WIDTH, '━') +
      'Errors'.padEnd(ERROR_COLUMN_WIDTH, '━') +
      'File'.padEnd(FILE_COLUMN_WIDTH, '━'),
  );
}

/**
 * Display a single row in the results table.
 * @param {FileError} fileError - The file error to display
 * @param {number} _index - The row index (unused)
 */
function displayTableRow(fileError: FileError, _index: number): void {
  const { file, count, errorTypes } = fileError;
  const uniqueErrors = errorTypes.size;
  const errorTypesString = formatErrorTypesString(errorTypes);
  const truncatedFile = truncateFilePath(file);
  const truncatedErrors = truncateErrorTypesString(errorTypesString);

  console.log(`${count}\t${uniqueErrors}\t${truncatedErrors.padEnd(ERROR_COLUMN_WIDTH)} ${truncatedFile}`);
}

/**
 * Display the results table.
 * @param {FileError[]} fileErrors - Array of file errors to display
 * @param {number} limit - Maximum number of files to display
 */
function displayResults(fileErrors: FileError[], limit: number): void {
  if (fileErrors.length === START_INDEX) {
    console.log('✅ No ESLint errors found!');
    return;
  }

  const totalErrors = fileErrors.reduce((sum, item) => sum + item.count, START_INDEX);
  const displayLimit = Math.min(limit, fileErrors.length);

  displayTableHeader();

  for (let index = START_INDEX; index < displayLimit; index++) {
    const fileError = fileErrors[index];
    if (fileError) {
      displayTableRow(fileError, index);
    }
  }

  console.log('━'.repeat(TABLE_LINE_LENGTH));
  displaySummary(fileErrors, totalErrors, displayLimit);
}

/**
 * Display summary statistics.
 * @param {FileError[]} fileErrors - Array of file errors to summarize
 * @param {number} totalErrors - Total number of errors across all files
 * @param {number} displayLimit - Number of files displayed in the table
 */
function displaySummary(fileErrors: FileError[], totalErrors: number, displayLimit: number): void {
  console.log('📈 Summary:');
  console.log(`   Files with errors: ${fileErrors.length}`);
  console.log(`   Total errors: ${totalErrors}`);
  console.log(`   Top ${displayLimit} files shown`);

  const allErrorTypes = getAllErrorTypes(fileErrors);

  if (allErrorTypes.size > START_INDEX) {
    console.log(`   Unique error types: ${allErrorTypes.size}`);
    console.log(`   Error types: ${Array.from(allErrorTypes).sort().join(', ')}`);
  }
}

/**
 * Get all unique error types from file errors.
 * @param {FileError[]} fileErrors - Array of file errors to extract error types from
 * @returns {Set<string>} Set of unique error type names
 */
function getAllErrorTypes(fileErrors: FileError[]): Set<string> {
  const allErrorTypes = new Set<string>();

  for (const error of fileErrors) {
    const errorTypesArray = Array.from(error.errorTypes);
    for (const type of errorTypesArray) {
      allErrorTypes.add(type);
    }
  }

  return allErrorTypes;
}

/**
 * Check if a line should be included in additional output.
 * @param {string} line - The line to check
 * @returns {boolean} True if the line should be included
 */
function isAdditionalOutputLine(line: string): boolean {
  return (
    !line.match(ESLINT_ERROR_PATTERN) && line.trim().length > START_INDEX && !line.includes('✖') && !line.includes('✔')
  );
}

/**
 * Display additional output that doesn't match the error pattern.
 * @param {string[]} lines - Array of output lines to filter and display
 */
function displayAdditionalOutput(lines: string[]): void {
  const additionalOutput = lines.filter(isAdditionalOutputLine).join('\n');

  if (additionalOutput.trim().length > START_INDEX) {
    console.log('\n🔧 Additional output:');
    console.log(additionalOutput);
  }
}

/**
 * Parse command line arguments to get the limit.
 * @returns {number} The limit to use for displaying results
 */
function parseLimitArgument(): number {
  const limitArgument = argv[2];
  return limitArgument !== undefined && limitArgument.trim().length > START_INDEX
    ? Number.parseInt(limitArgument, 10)
    : DEFAULT_LIMIT;
}

/**
 * Process ESLint output and display results.
 * @param {string} errorOutput - The raw ESLint output
 * @param {number} limit - Maximum number of files to display
 */
function processAndDisplayResults(errorOutput: string, limit: number): void {
  const lines = errorOutput.split('\n');
  const fileErrors = parseEslintOutput(errorOutput);

  // Sort by error count (descending)
  fileErrors.sort((a, b) => b.count - a.count);

  displayResults(fileErrors, limit);
  displayAdditionalOutput(lines);
}

/**
 * Main function to run the ESLint summary script.
 * Executes ESLint, parses the output, and displays sorted error summary.
 */
async function main(): Promise<void> {
  const limit = parseLimitArgument();

  try {
    const { stdout, stderr } = await runEslint();
    const errorOutput = stdout ?? stderr;
    processAndDisplayResults(errorOutput, limit);
  } catch (error) {
    console.error('❌ Error running ESLint summary:', error);
    exit(EXIT_CODE_ERROR);
  }
}

// Run if called directly
main().catch((error) => {
  console.error('❌ Unhandled error:', error);
  exit(EXIT_CODE_ERROR);
});
