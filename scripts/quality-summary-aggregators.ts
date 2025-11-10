/**
 * Quality summary aggregation utilities
 * Shared functions for aggregating and displaying quality check results
 */

// Constants extracted from magic numbers
const ERROR_COUNT_ZERO = 0;
const ZERO_SLICE = 0;
const MAX_CONSOLE_WIDTH = 80;
const MAX_FILE_DISPLAY_LENGTH = 60;
const MAX_FILE_TRUNCATE_LENGTH = -57;
const TOP_FILES_LIMIT = 10;
const COLUMN_PADDING_COUNT = 4;
const COLUMN_PADDING_TOOLS = 12;

export interface FileAggregate {
  count: number;
  tools: Set<string>;
}

/**
 * Updates file aggregate data
 * @param {Map<string, FileAggregate>} fileAggregates - Map to update
 * @param {string} fileName - Name of the file
 * @param {number} count - Error count
 * @param {string} toolName - Name of the tool
 */
export function updateFileAggregate(
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
 * Gets top problematic files sorted by error count
 * @param {Map<string, FileAggregate>} fileAggregates - Map of file data
 * @returns {Array<[string, FileAggregate]>} Sorted array of files
 */
export function getTopProblematicFiles(fileAggregates: Map<string, FileAggregate>): Array<[string, FileAggregate]> {
  return Array.from(fileAggregates.entries())
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(ZERO_SLICE, TOP_FILES_LIMIT);
}

/**
 * Displays a list of problematic files
 * @param {Array<[string, FileAggregate]>} sortedFiles - Sorted files to display
 */
export function displayProblematicFilesList(sortedFiles: Array<[string, FileAggregate]>): void {
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
 * Displays top problematic files
 * @param {Map<string, FileAggregate>} fileAggregates - Map of aggregated file data
 */
export function displayTopProblematicFiles(fileAggregates: Map<string, FileAggregate>): void {
  if (fileAggregates.size === ERROR_COUNT_ZERO) {
    return;
  }

  console.log('\n🔥 TOP PROBLEMATIC FILES (aggregated across all tools):');
  console.log('━'.repeat(MAX_CONSOLE_WIDTH));

  const sortedFiles = getTopProblematicFiles(fileAggregates);
  displayProblematicFilesList(sortedFiles);
}

export {
  ERROR_COUNT_ZERO,
  ZERO_SLICE,
  MAX_CONSOLE_WIDTH,
  MAX_FILE_DISPLAY_LENGTH,
  MAX_FILE_TRUNCATE_LENGTH,
  TOP_FILES_LIMIT,
  COLUMN_PADDING_COUNT,
  COLUMN_PADDING_TOOLS,
};
