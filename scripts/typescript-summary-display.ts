#!/usr/bin/env bun

/**
 * Display functions for TypeScript error analysis
 * Extracted from typescript-summary-sorted.ts to reduce file size
 */

import {
  COUNT_COLUMN_WIDTH,
  DEFAULT_LIMIT,
  ERROR_COLUMN_WIDTH,
  FILE_COLUMN_WIDTH,
  formatErrorTypesString,
  HEADER_TEXT,
  LINE_SEPARATOR_LENGTH,
  SEPARATOR_CHAR,
  SUMMARY_PREFIX,
  TYPESCRIPT_ERROR_PATTERN,
  truncateErrorTypesString,
  truncateFilePath,
} from './typescript-summary-utilities.ts';

/**
 * Display results to console
 * @param {Array<{ file: string; count: number; errorTypes: Set<string> }>} fileErrors The array of file errors to display
 * @param {number} displayLimit The maximum number of files to display
 */
export function displayResults(
  fileErrors: Array<{ file: string; count: number; errorTypes: Set<string> }>,
  displayLimit: number,
): void {
  const Zero = 0;
  if (fileErrors.length === Zero) {
    console.log('✅ No TypeScript errors found!');
    return;
  }

  const totalErrors = fileErrors.reduce((sum, item) => sum + item.count, Zero);

  displayResultsHeader();
  displayResultsTable(fileErrors, displayLimit);
  displayResultsSummary(fileErrors, totalErrors, displayLimit);
}

/**
 * Display the header for results output
 */
function displayResultsHeader(): void {
  console.log('📊 TypeScript Errors by File (sorted by count):');
  console.log(SEPARATOR_CHAR.repeat(LINE_SEPARATOR_LENGTH));
  console.log(HEADER_TEXT);
  console.log(
    '─────\t'.padEnd(COUNT_COLUMN_WIDTH, SEPARATOR_CHAR) +
      'Errors'.padEnd(ERROR_COLUMN_WIDTH, SEPARATOR_CHAR) +
      'File'.padEnd(FILE_COLUMN_WIDTH, SEPARATOR_CHAR),
  );
}

/**
 * Display the main results table
 * @param {Array<{ file: string; count: number; errorTypes: Set<string> }>} fileErrors The array of file errors to display
 * @param {number} displayLimit The maximum number of files to display
 */
function displayResultsTable(
  fileErrors: Array<{ file: string; count: number; errorTypes: Set<string> }>,
  displayLimit: number,
): void {
  const Zero = 0;
  for (let index = 0; index < displayLimit; index++) {
    const fileError = fileErrors[index];
    if (!fileError) {
      continue;
    }

    displayFileErrorRow(fileError);
  }
}

/**
 * Display a single row for a file error
 * @param {{ file: string; count: number; errorTypes: Set<string> }} fileError The file error to display as a row
 * @param {string} fileError.file The file path
 * @param {number} fileError.count The error count
 * @param {Set<string>} fileError.errorTypes The set of error types
 */
function displayFileErrorRow(fileError: { file: string; count: number; errorTypes: Set<string> }): void {
  const { file, count, errorTypes } = fileError;
  const uniqueErrors = errorTypes.size;
  const errorTypesString = formatErrorTypesString(errorTypes);
  const truncatedFile = truncateFilePath(file);
  const truncatedErrors = truncateErrorTypesString(errorTypesString);

  console.log(`${count}\t${uniqueErrors}\t${truncatedErrors.padEnd(ERROR_COLUMN_WIDTH)} ${truncatedFile}`);
}

/**
 * Display summary statistics
 * @param {Array<{ file: string; count: number; errorTypes: Set<string> }>} fileErrors The array of file errors
 * @param {number} totalErrors Total number of errors across all files
 * @param {number} displayLimit The maximum number of files displayed
 */
function displayResultsSummary(
  fileErrors: Array<{ file: string; count: number; errorTypes: Set<string> }>,
  totalErrors: number,
  displayLimit: number,
): void {
  const Zero = 0;
  displaySummaryHeader();
  displaySummaryStats(fileErrors.length, totalErrors, displayLimit);
  displayErrorTypesSummary(fileErrors);
}

/**
 * Display the summary header
 */
function displaySummaryHeader(): void {
  console.log(SEPARATOR_CHAR.repeat(LINE_SEPARATOR_LENGTH));
  console.log(SUMMARY_PREFIX);
}

/**
 * Display summary statistics
 * @param {number} filesWithCount Number of files with errors
 * @param {number} totalErrors Total number of errors
 * @param {number} displayLimit Maximum number of files displayed
 */
function displaySummaryStats(filesWithCount: number, totalErrors: number, displayLimit: number): void {
  console.log(`   Files with errors: ${filesWithCount}`);
  console.log(`   Total errors: ${totalErrors}`);
  console.log(`   Top ${displayLimit} files shown`);
}

/**
 * Display error types summary
 * @param {Array<{ file: string; count: number; errorTypes: Set<string> }>} fileErrors The array of file errors
 */
function displayErrorTypesSummary(fileErrors: Array<{ file: string; count: number; errorTypes: Set<string> }>): void {
  const Zero = 0;
  const allErrorTypes = collectAllErrorTypes(fileErrors);
  if (allErrorTypes.size > Zero) {
    console.log(`   Unique error types: ${allErrorTypes.size}`);
    console.log(`   Error types: ${Array.from(allErrorTypes).sort().join(', ')}`);
  }
}

/**
 * Collect all unique error types from file errors
 * @param {Array<{ file: string; count: number; errorTypes: Set<string> }>} fileErrors The array of file errors
 * @returns {Set<string>} Set of all unique error types
 */
function collectAllErrorTypes(
  fileErrors: Array<{ file: string; count: number; errorTypes: Set<string> }>,
): Set<string> {
  const allErrorTypes = new Set<string>();
  for (const error of fileErrors) {
    for (const type of Array.from(error.errorTypes)) {
      allErrorTypes.add(type);
    }
  }
  return allErrorTypes;
}
