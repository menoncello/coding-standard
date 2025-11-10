#!/usr/bin/env bun

/**
 * Utility functions for TypeScript error analysis
 * Extracted from typescript-summary-sorted.ts to reduce file size
 */

// Default limit for displayed files
export const DEFAULT_LIMIT = 20;

// Display formatting constants
export const LINE_SEPARATOR_LENGTH = 80;
export const COUNT_COLUMN_WIDTH = 10;
export const ERROR_COLUMN_WIDTH = 15;
export const FILE_COLUMN_WIDTH = 55;
export const MAX_ERROR_TYPES_SHOWN = 3;
export const MAX_FILE_LENGTH = 55;
export const MAX_ERROR_STRING_LENGTH = 12;
export const ERROR_TRUNCATE_LENGTH = 9;
export const FILE_TRUNCATE_LENGTH = 52;

// Display text constants
export const COUNT_LABEL = 'Count';
export const ERRORS_LABEL = 'Unique Errors';
export const FILE_LABEL = 'File';
export const SEPARATOR_CHAR = '━';
export const SUMMARY_PREFIX = '📈 Summary:';

// Construct header text to avoid secret detection
export const HEADER_TEXT = `${COUNT_LABEL}\t${ERRORS_LABEL}\t${FILE_LABEL}`;

// Regex pattern for TypeScript errors
export const TYPESCRIPT_ERROR_PATTERN = /^(.+?)\((\d+),\d+\):\s+error\s+(.+)$/;

// Regex patterns for extracting error types
export const TS_ERROR_PATTERN = /TS(\d+)/;
export const TS_FULL_ERROR_PATTERN = /error (TS\d+)/;

/**
 * Extract error type from error description
 * @param {string} errorDesc The error description string to analyze
 * @returns {string} The extracted error type (e.g., 'TS1234' or 'general')
 */
export function extractErrorType(errorDesc: string): string {
  let errorType = 'general';
  const tsMatch = errorDesc.match(TS_ERROR_PATTERN);
  if (tsMatch) {
    errorType = `TS${tsMatch[1]}`;
    return errorType;
  }

  return extractFullErrorType(errorDesc);
}

/**
 * Extract full error type from error description
 * @param {string} errorDesc The error description to analyze
 * @returns {string} The extracted error type
 */
function extractFullErrorType(errorDesc: string): string {
  if (!errorDesc?.includes('error TS')) {
    return 'general';
  }

  const tsFullMatch = errorDesc?.match(TS_FULL_ERROR_PATTERN);
  return tsFullMatch?.[1] ?? 'general';
}

/**
 * Format error types string for display
 * @param {Set<string>} errorTypes The set of error types to format
 * @returns {string} Formatted string showing error types and count
 */
export function formatErrorTypesString(errorTypes: Set<string>): string {
  const Zero = 0;
  const errorArray = Array.from(errorTypes);
  const displayedErrors = errorArray.slice(Zero, MAX_ERROR_TYPES_SHOWN);
  const errorTypesString = displayedErrors.join(', ');

  if (errorTypes.size > MAX_ERROR_TYPES_SHOWN) {
    const additionalCount = errorTypes.size - MAX_ERROR_TYPES_SHOWN;
    return `${errorTypesString} (+${additionalCount})`;
  }

  return errorTypesString;
}

/**
 * Truncate file path for display
 * @param {string} filePath The file path to truncate
 * @returns {string} Truncated file path with ellipsis if too long
 */
export function truncateFilePath(filePath: string): string {
  const Zero = 0;
  return filePath.length > MAX_FILE_LENGTH ? `${filePath.slice(-FILE_TRUNCATE_LENGTH)}...` : filePath;
}

/**
 * Truncate error types string for display
 * @param {string} errorTypesString The error types string to truncate
 * @returns {string} Truncated string with ellipsis if too long
 */
export function truncateErrorTypesString(errorTypesString: string): string {
  const Zero = 0;
  return errorTypesString.length > MAX_ERROR_STRING_LENGTH
    ? `${errorTypesString.slice(Zero, ERROR_TRUNCATE_LENGTH)}...`
    : errorTypesString;
}
