#!/usr/bin/env bun

/**
 * Script to sort TypeScript errors by file and count
 * Usage: bun run scripts/typescript-summary-sorted.ts [limit]
 */

import { argv, exit } from 'node:process';
import { DEFAULT_LIMIT, displayResults, TYPESCRIPT_ERROR_PATTERN } from './typescript-summary-display.ts';
import { parseTypeScriptOutput } from './typescript-summary-parser.ts';

/**
 * Show additional output from TypeScript
 * @param {string} errorOutput The TypeScript compiler output to filter
 */
function showAdditionalOutput(errorOutput: string): void {
  const Zero = 0;
  const additionalOutput = errorOutput
    .split('\n')
    .filter((line) => !line.match(TYPESCRIPT_ERROR_PATTERN) && Boolean(line.trim()))
    .join('\n');

  if (additionalOutput && additionalOutput.trim().length > Zero) {
    console.log('\n🔧 Additional output:');
    console.log(additionalOutput);
  }
}

/**
 * Main function to run TypeScript error analysis
 */
async function main(): Promise<void> {
  const limit = parseCommandLineArgument();
  const ErrorExitCode = 1;

  try {
    await runTypeScriptAnalysis(limit);
  } catch (error) {
    console.error('❌ Error running TypeScript summary:', error);
    exit(ErrorExitCode);
  }
}

/**
 * Parse command line argument for display limit
 * @returns {number} The display limit value
 */
function parseCommandLineArgument(): number {
  const Zero = 0;
  const limitArgument = argv[2];
  const trimmedArgument = limitArgument?.trim();
  return trimmedArgument && trimmedArgument.length > Zero ? Number.parseInt(limitArgument, 10) : DEFAULT_LIMIT;
}

/**
 * Run the complete TypeScript analysis workflow
 * @param {number} limit The maximum number of files to display
 */
async function runTypeScriptAnalysis(limit: number): Promise<void> {
  const typeScriptOutput = await runTypeScriptCheck();
  const fileErrors = processTypeScriptOutput(typeScriptOutput);
  const displayLimit = Math.min(limit, fileErrors.length);

  displayResults(fileErrors, displayLimit);
  showAdditionalOutput(typeScriptOutput);
}

/**
 * Run TypeScript compiler check and capture output
 * @returns {string} The combined stdout and stderr output from TypeScript
 */
async function runTypeScriptCheck(): Promise<string> {
  const tsProcess = Bun.spawn(['bunx', 'tsc', '--noEmit', '--skipLibCheck'], {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const stdout = await new Response(tsProcess.stdout).text();
  const stderr = await new Response(tsProcess.stderr).text();
  return stderr || stdout;
}

/**
 * Process TypeScript output to extract and sort file errors
 * @param {string} errorOutput The TypeScript compiler output
 * @returns {Array<{ file: string; count: number; errorTypes: Set<string> }>} Sorted array of file errors
 */
function processTypeScriptOutput(errorOutput: string): Array<{ file: string; count: number; errorTypes: Set<string> }> {
  const fileErrors = parseTypeScriptOutput(errorOutput);
  fileErrors.sort((a, b) => b.count - a.count);
  return fileErrors;
}

// Run if called directly
main().catch((error) => {
  console.error('❌ Unhandled error:', error);
  const ErrorExitCode = 1;
  exit(ErrorExitCode);
});
