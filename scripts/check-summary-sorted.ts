#!/usr/bin/env bun

/**
 * Script to sort biome check errors by file and count.
 * Usage: bun run scripts/check-summary-sorted.ts [limit]
 */

import { exit } from 'node:process';

/** Default limit for number of files to display */
const DEFAULT_LIMIT = 20;

/** Maximum file path length before truncation */
const MAX_FILE_PATH_LENGTH = 70;

/** Number of characters to keep from the end when truncating file paths */
const TRUNCATE_KEEP_CHARS = 67;

/** Line length for console output formatting */
const CONSOLE_LINE_LENGTH = 80;

/** Padding length for count column in output */
const COUNT_COLUMN_PADDING = 10;

/** Exit code for errors */
const ERROR_EXIT_CODE = 1;

/** Zero value for comparisons and initializations */
const ZERO = 0;

/** Diagnostic severity for errors */
const ERROR_SEVERITY = 'error';

/** Console emojis and symbols */
const emoji = {
  success: '✅',
  chart: '📊',
  trendingUp: '📈',
  wrench: '🔧',
  error: '❌',
  checkMark: '✖',
} as const;

/** Regex pattern for extracting file paths from error lines */
const FILE_PATH_REGEX = /(.+?):\d+:\d+/;

/** Type definition for file error information */
interface FileError {
  /** File path */
  file: string;
  /** Number of errors in the file */
  count: number;
  /** Severity level */
  severity: string;
}

/** Type definition for Biome diagnostic information */
interface BiomeDiagnostic {
  /** Location information */
  location?: {
    /** Path information */
    path?: {
      /** File path */
      file?: string;
    };
  };
  /** Severity level */
  severity?: string;
}

/** Type definition for Biome check result */
interface BiomeResult {
  /** Array of diagnostics */
  diagnostics?: BiomeDiagnostic[];
}

/**
 * Parses command line arguments to get the display limit.
 * @returns {number} The limit for number of files to display
 */
function parseArguments(): number {
  const limitArgument = process.argv[2];

  if (limitArgument !== undefined && limitArgument !== '') {
    return Number.parseInt(limitArgument, 10);
  }

  return DEFAULT_LIMIT;
}

/**
 * Runs the Biome check command and captures output.
 * @returns {Promise<{ stdout: string; stderr: string }>} Object containing stdout and stderr output
 */
async function runBiomeCheck(): Promise<{ stdout: string; stderr: string }> {
  const checkProcess = Bun.spawn(['bunx', '@biomejs/biome', 'check', '.', '--reporter=json'], {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const stdout = await new Response(checkProcess.stdout).text();
  const stderr = await new Response(checkProcess.stderr).text();

  return { stdout, stderr };
}

/**
 * Adds or updates an error entry in the file errors array.
 * @param {FileError[]} fileErrors - Array of file errors to update
 * @param {string} file - File path
 * @param {string} severity - Error severity level
 */
function addOrUpdateFileError(fileErrors: FileError[], file: string, severity: string): void {
  const existingError = fileErrors.find((error) => error.file === file);

  if (existingError !== undefined) {
    existingError.count++;
  } else {
    fileErrors.push({
      file,
      count: 1,
      severity,
    });
  }
}

/**
 * Processes a single diagnostic from Biome JSON output.
 * @param {FileError[]} fileErrors - Array of file errors to update
 * @param {BiomeDiagnostic} diagnostic - Diagnostic to process
 */
function processDiagnostic(fileErrors: FileError[], diagnostic: BiomeDiagnostic): void {
  const file = diagnostic.location?.path?.file;
  if (file !== undefined) {
    const severity = diagnostic.severity ?? ERROR_SEVERITY;
    addOrUpdateFileError(fileErrors, file, severity);
  }
}

/**
 * Parses JSON output from Biome to extract file errors.
 * @param {string} stdout - Standard output from Biome check
 * @returns {FileError[]} Array of file errors
 */
function parseJsonOutput(stdout: string): FileError[] {
  const fileErrors: FileError[] = [];

  try {
    const result = JSON.parse(stdout) as BiomeResult;

    if (hasValidDiagnostics(result) && result.diagnostics) {
      for (const diagnostic of result.diagnostics) {
        processDiagnostic(fileErrors, diagnostic);
      }
    }
  } catch {
    // JSON parsing failed, will fall back to text parsing
  }

  return fileErrors;
}

/**
 * Checks if Biome result has valid diagnostics array.
 * @param {BiomeResult} result - Biome result to check
 * @returns {boolean} True if valid diagnostics array exists
 */
function hasValidDiagnostics(result: BiomeResult): boolean {
  return result.diagnostics !== undefined && Array.isArray(result.diagnostics);
}

/**
 * Checks if a line contains error indicators.
 * @param {string} line - Line to check
 * @returns {boolean} True if line contains error indicators
 */
function lineContainsError(line: string): boolean {
  return line.includes(emoji.checkMark) || line.includes('error');
}

/**
 * Extracts file path from an error line.
 * @param {string} line - Error line to parse
 * @param {FileError[]} fileErrors - Array of file errors to update
 */
function extractFileFromLine(line: string, fileErrors: FileError[]): void {
  const fileMatch = line.match(FILE_PATH_REGEX);

  if (fileMatch?.[1] !== undefined) {
    const file = fileMatch[1];
    addOrUpdateFileError(fileErrors, file, ERROR_SEVERITY);
  }
}

/**
 * Checks if stderr contains error indicators.
 * @param {string} stderr - Standard error output to check
 * @returns {boolean} True if stderr contains error indicators
 */
function stderrContainsErrors(stderr: string): boolean {
  return stderr.includes(emoji.checkMark) || stderr.includes('error');
}

/**
 * Processes error lines to extract file information.
 * @param {string[]} errorLines - Array of error lines to process
 * @param {FileError[]} fileErrors - Array of file errors to update
 */
function processErrorLines(errorLines: string[], fileErrors: FileError[]): void {
  for (const line of errorLines) {
    if (lineContainsError(line)) {
      extractFileFromLine(line, fileErrors);
    }
  }
}

/**
 * Parses text output from Biome to extract file errors (fallback method).
 * @param {string} stderr - Standard error output from Biome check
 * @returns {FileError[]} Array of file errors
 */
function parseTextOutput(stderr: string): FileError[] {
  const fileErrors: FileError[] = [];

  if (stderrContainsErrors(stderr)) {
    const errorLines = stderr.split('\n');
    processErrorLines(errorLines, fileErrors);
  }

  return fileErrors;
}

/**
 * Processes Biome check output to extract and sort file errors.
 * @param {string} stdout - Standard output from Biome check
 * @param {string} stderr - Standard error output from Biome check
 * @returns {FileError[]} Sorted array of file errors
 */
function processBiomeOutput(stdout: string, stderr: string): FileError[] {
  let fileErrors = parseJsonOutput(stdout);

  // Fallback to text parsing if JSON parsing didn't find errors
  if (fileErrors.length === ZERO) {
    fileErrors = parseTextOutput(stderr);
  }

  // Sort by error count (descending)
  return fileErrors.sort((a, b) => b.count - a.count);
}

/**
 * Truncates file path if it exceeds maximum length.
 * @param {string} file - File path to truncate
 * @returns {string} Truncated file path
 */
function truncateFilePath(file: string): string {
  if (file.length > MAX_FILE_PATH_LENGTH) {
    return `${file.slice(-TRUNCATE_KEEP_CHARS)}...`;
  }

  return file;
}

/**
 * Displays the results header with formatting.
 */
function displayResultsHeader(): void {
  console.log(`${emoji.chart} Biome Check Errors by File (sorted by count):`);
  console.log('━'.repeat(CONSOLE_LINE_LENGTH));
  console.log('Count\tFile');
  console.log('─────\t'.padEnd(COUNT_COLUMN_PADDING, '━') + 'File'.padEnd(MAX_FILE_PATH_LENGTH, '━'));
}

/**
 * Displays error entries for each file.
 * @param {FileError[]} fileErrors - Sorted array of file errors
 * @param {number} displayLimit - Number of files to display
 */
function displayErrorEntries(fileErrors: FileError[], displayLimit: number): void {
  for (let index = ZERO; index < displayLimit; index++) {
    const fileError = fileErrors[index];
    if (!fileError) {
      continue;
    }

    const { file, count } = fileError;
    const truncatedFile = truncateFilePath(file);
    console.log(`${count}\t${truncatedFile}`);
  }
}

/**
 * Displays summary statistics.
 * @param {FileError[]} fileErrors - Array of file errors
 * @param {number} totalErrors - Total number of errors
 * @param {number} displayLimit - Number of files displayed
 */
function displaySummary(fileErrors: FileError[], totalErrors: number, displayLimit: number): void {
  console.log('━'.repeat(CONSOLE_LINE_LENGTH));
  console.log(`${emoji.trendingUp} Summary:`);
  console.log(`   Files with errors: ${fileErrors.length}`);
  console.log(`   Total errors: ${totalErrors}`);
  console.log(`   Top ${displayLimit} files shown`);
}

/**
 * Displays additional output if present.
 * @param {string} stderr - Standard error output
 */
function displayAdditionalOutput(stderr: string): void {
  if (stderr.trim().length > ZERO) {
    console.log(`\n${emoji.wrench} Additional output:`);
    console.log(stderr.trim());
  }
}

/**
 * Displays the results of the Biome check.
 * @param {FileError[]} fileErrors - Sorted array of file errors
 * @param {number} limit - Maximum number of files to display
 * @param {string} stderr - Standard error output
 */
function displayResults(fileErrors: FileError[], limit: number, stderr: string): void {
  if (fileErrors.length === ZERO) {
    console.log(`${emoji.success} No check errors found!`);
    return;
  }

  const totalErrors = fileErrors.reduce((sum, item) => sum + item.count, ZERO);
  const displayLimit = Math.min(limit, fileErrors.length);

  displayResultsHeader();
  displayErrorEntries(fileErrors, displayLimit);
  displaySummary(fileErrors, totalErrors, displayLimit);
  displayAdditionalOutput(stderr);
}

/**
 * Main function to run the check summary script.
 */
async function main(): Promise<void> {
  const limit = parseArguments();

  try {
    const { stdout, stderr } = await runBiomeCheck();
    const fileErrors = processBiomeOutput(stdout, stderr);
    displayResults(fileErrors, limit, stderr);
  } catch (error) {
    console.error(`${emoji.error} Error running check summary:`, error);
    exit(ERROR_EXIT_CODE);
  }
}

// Run if called directly
if (import.meta.main) {
  await main();
}
