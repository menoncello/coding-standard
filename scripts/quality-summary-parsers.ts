/**
 * Quality summary parsing utilities
 * Shared functions for parsing output from quality check tools
 */

// Constants extracted from magic numbers
const ERROR_COUNT_ZERO = 0;
const ZERO_SLICE = 0;

/**
 * Checks if line indicates no errors found
 * @param {string} line - Line to check
 * @returns {boolean} True if line contains no errors message
 */
function hasNoErrorsMessage(line: string): boolean {
  return line.includes('No') && line.includes('errors found!');
}

/**
 * Determines if a line should be skipped during parsing
 * @param {string} toolName - Name of the tool
 * @param {string} line - Line to check
 * @returns {boolean} True if line should be skipped
 */
function shouldSkipLine(toolName: string, line: string): boolean {
  return toolName === 'Lint' && line.includes('Count') && line.includes('File');
}

/**
 * Parses a file line based on tool type
 * @param {string} toolName - Name of the tool
 * @param {string} line - Line to parse
 * @param {Array<{ file: string; count: number }>} topFiles - Array to populate
 */
function parseFileLine(toolName: string, line: string, topFiles: Array<{ file: string; count: number }>): void {
  if (toolName === 'Lint') {
    parseLintFileLine(line, topFiles);
  } else {
    parseStandardFileLine(line, topFiles);
  }
}

/**
 * Updates total errors from a line
 * @param {string} line - Line to parse
 * @param {number} currentTotal - Current total errors
 * @returns {number} Updated total errors
 */
function updateTotalErrorsFromLine(line: string, currentTotal: number): number {
  if (line.includes('Total errors:')) {
    const match = line.match(/Total errors: (\d+)/);
    return match?.[1] ? Number.parseInt(match[1], 10) : currentTotal;
  }
  return currentTotal;
}

/**
 * Parses a lint-specific file line
 * @param {string} line - The line to parse
 * @param {Array<{ file: string; count: number }>} topFiles - Array to populate with parsed file data
 */
function parseLintFileLine(line: string, topFiles: Array<{ file: string; count: number }>): void {
  if (shouldParseLintLine(line)) {
    parseLintLineFormat(line, topFiles);
  }
}

/**
 * Determines if a lint line should be parsed
 * @param {string} line - Line to check
 * @returns {boolean} True if line should be parsed
 */
function shouldParseLintLine(line: string): boolean {
  const isInFileSection = line.includes('Count') && line.includes('File');
  const hasValidFormat = /^\d+/.test(line) && !line.includes('Count') && !line.includes('━');
  return !isInFileSection && hasValidFormat;
}

/**
 * Parses lint line format and extracts file data
 * @param {string} line - Line to parse
 * @param {Array<{ file: string; count: number }>} topFiles - Array to populate
 */
function parseLintLineFormat(line: string, topFiles: Array<{ file: string; count: number }>): void {
  const match = line.match(/^(\d+)\s+(.+)$/);

  if (match?.[1] && match[2]) {
    const count = Number.parseInt(match[1], 10);
    const file = match[2].trim();

    if (isValidFilePath(file)) {
      topFiles.push({ file, count });
    }
  }
}

/**
 * Checks if a string represents a valid file path
 * @param {string} file - File path to check
 * @returns {boolean} True if valid file path
 */
function isValidFilePath(file: string): boolean {
  return file.includes('/') || file.includes('.');
}

/**
 * Parses a standard file line (for check, typescript, eslint)
 * @param {string} line - The line to parse
 * @param {Array<{ file: string; count: number }>} topFiles - Array to populate with parsed file data
 */
function parseStandardFileLine(line: string, topFiles: Array<{ file: string; count: number }>): void {
  if (isStandardFileLine(line)) {
    const match = line.match(/^(\d+)\s+(\d+)\s+(.+)$/);

    if (match?.[1] && match[3]) {
      const count = Number.parseInt(match[1], 10);
      const file = match[3];

      if (isFileValidForParsing(file)) {
        topFiles.push({ file, count });
      }
    }
  }
}

/**
 * Checks if a line matches standard file format
 * @param {string} line - Line to check
 * @returns {boolean} True if line matches format
 */
function isStandardFileLine(line: string): boolean {
  return /^\d+\s+/.test(line) && !line.includes('Count');
}

/**
 * Checks if a file is valid for parsing
 * @param {string | null | undefined} file - File to check
 * @returns {boolean} True if file is valid
 */
function isFileValidForParsing(file: string | null | undefined): boolean {
  return file !== null && file !== undefined && file.length > ZERO_SLICE && !file.includes('Error');
}

export {
  hasNoErrorsMessage,
  shouldSkipLine,
  parseFileLine,
  updateTotalErrorsFromLine,
  parseLintFileLine,
  shouldParseLintLine,
  parseLintLineFormat,
  isValidFilePath,
  parseStandardFileLine,
  isStandardFileLine,
  isFileValidForParsing,
  ERROR_COUNT_ZERO,
  ZERO_SLICE,
};
