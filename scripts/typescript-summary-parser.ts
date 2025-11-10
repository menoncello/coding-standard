#!/usr/bin/env bun

/**
 * TypeScript error parsing functions
 * Extracted from typescript-summary-sorted.ts to reduce file size
 */

import { extractErrorType, TYPESCRIPT_ERROR_PATTERN } from './typescript-summary-utilities.ts';

/**
 * Parse TypeScript output to extract file errors
 * @param {string} errorOutput The TypeScript compiler output string to parse
 * @returns {Array<{ file: string; count: number; errorTypes: Set<string> }>} Array of file error objects with file paths, counts, and error types
 */
export function parseTypeScriptOutput(
  errorOutput: string,
): Array<{ file: string; count: number; errorTypes: Set<string> }> {
  const lines = errorOutput.split('\n');
  const fileErrors: Array<{ file: string; count: number; errorTypes: Set<string> }> = [];

  for (const line of lines) {
    const parsedError = parseErrorLine(line);
    if (parsedError) {
      updateFileErrors(fileErrors, parsedError);
    }
  }

  return fileErrors;
}

/**
 * Parse a single error line to extract file and error information
 * @param {string} line A single line from TypeScript output
 * @returns {{ file: string; errorType: string } | null} Error information or null if line doesn't match error pattern
 */
function parseErrorLine(line: string): { file: string; errorType: string } | null {
  const match = line.match(TYPESCRIPT_ERROR_PATTERN);
  if (match?.[1] !== undefined && match[3] !== undefined) {
    const file = match[1];
    const errorDesc = match[3];
    const errorType = extractErrorType(errorDesc);
    return { file, errorType };
  }
  return null;
}

/**
 * Update file errors array with new error information
 * @param {Array<{ file: string; count: number; errorTypes: Set<string> }>} fileErrors The array of file errors to update
 * @param {{ file: string; errorType: string }} parsedError The parsed error information to add
 * @param {string} parsedError.file The file path
 * @param {string} parsedError.errorType The error type
 */
function updateFileErrors(
  fileErrors: Array<{ file: string; count: number; errorTypes: Set<string> }>,
  parsedError: { file: string; errorType: string },
): void {
  const existingError = fileErrors.find((error) => error.file === parsedError.file);
  if (existingError) {
    incrementErrorCount(existingError, parsedError.errorType);
    return;
  }

  addNewFileError(fileErrors, parsedError);
}

/**
 * Increment error count for existing file error
 * @param {{ file: string; count: number; errorTypes: Set<string> }} fileError The existing file error to update
 * @param {string} newErrorType The new error type to add
 * @param {string} fileError.file The file path
 * @param {number} fileError.count The current error count
 * @param {Set<string>} fileError.errorTypes The set of error types
 */
function incrementErrorCount(
  fileError: { file: string; count: number; errorTypes: Set<string> },
  newErrorType: string,
): void {
  fileError.count++;
  fileError.errorTypes.add(newErrorType);
}

/**
 * Add new file error to the array
 * @param {Array<{ file: string; count: number; errorTypes: Set<string> }>} fileErrors The array of file errors to update
 * @param {{ file: string; errorType: string }} parsedError The parsed error information to add
 * @param {string} parsedError.file The file path
 * @param {string} parsedError.errorType The error type
 */
function addNewFileError(
  fileErrors: Array<{ file: string; count: number; errorTypes: Set<string> }>,
  parsedError: { file: string; errorType: string },
): void {
  fileErrors.push({
    file: parsedError.file,
    count: 1,
    errorTypes: new Set([parsedError.errorType]),
  });
}
