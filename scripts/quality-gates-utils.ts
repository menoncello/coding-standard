/**
 * Utility functions for quality gates validation
 */

import { existsSync, readFileSync } from 'node:fs';
import type { QualityGateResult } from './quality-gates-validator.ts';

// Constants for magic numbers
const EXIT_CODE_FAILURE = 1;

/**
 * Interface for quality gate configuration
 */
interface QualityGateConfig {
  name: string;
  description: string;
  command: string;
  args: string[];
  blocking: boolean;
  errorMessage: string;
}

/**
 * Gets all TypeScript source files from src and tests directories
 * @returns {string[]} - Array of file paths
 */
export function getSourceFiles(): string[] {
  const sourceTsFiles = Array.from(new Bun.Glob('**/*.ts').scanSync({ cwd: 'src' }));
  const sourceTsxFiles = Array.from(new Bun.Glob('**/*.tsx').scanSync({ cwd: 'src' }));
  const testsTsFiles = Array.from(new Bun.Glob('**/*.ts').scanSync({ cwd: 'tests' }));
  const testsTsxFiles = Array.from(new Bun.Glob('**/*.tsx').scanSync({ cwd: 'tests' }));

  return [...sourceTsFiles, ...sourceTsxFiles, ...testsTsFiles, ...testsTsxFiles].map((file) =>
    file.startsWith('src/') ? file : `tests/${file}`,
  );
}

/**
 * Scans files for a specific pattern
 * @param {string[]} files - Array of file paths to scan
 * @param {RegExp} pattern - RegExp pattern to search for
 * @returns {{found: boolean; files: string[]}} - Object with found status and list of files containing the pattern
 */
export function scanFilesForPattern(files: string[], pattern: RegExp): { found: boolean; files: string[] } {
  const foundFiles: string[] = [];

  for (const file of files) {
    if (fileContainsPattern(file, pattern)) {
      foundFiles.push(file);
    }
  }

  return {
    found: foundFiles.length > 0,
    files: foundFiles,
  };
}

/**
 * Checks if a file contains a specific pattern
 * @param {string} file - File path to check
 * @param {RegExp} pattern - RegExp pattern to search for
 * @returns {boolean} - True if pattern is found in file
 */
export function fileContainsPattern(file: string, pattern: RegExp): boolean {
  if (!existsSync(file)) {
    return false;
  }

  const content = readFileSync(file, 'utf8');
  return pattern.test(content);
}

/**
 * Generates a summary message based on validation results
 * @param {boolean} success - Whether validation passed
 * @param {number} totalGates - Total number of gates
 * @param {number} failedCount - Number of failed gates
 * @returns {string} - Summary message
 */
export function generateSummary(success: boolean, totalGates: number, failedCount: number): string {
  return success
    ? `🎉 ALL ${totalGates} quality gates PASSED - Story completion approved`
    : `🚨 ${failedCount} of ${totalGates} quality gates FAILED - Story completion BLOCKED`;
}

/**
 * Executes a single quality gate command and returns the result
 * @param {QualityGateConfig} gate - The quality gate configuration to execute
 * @returns {Promise<QualityGateResult>} - The result of the quality gate execution
 */
export async function executeQualityGate(gate: QualityGateConfig): Promise<QualityGateResult> {
  try {
    // Use Bun's built-in safe execution
    const process = Bun.spawn([gate.command, ...gate.args], {
      stdout: 'pipe',
      stderr: 'pipe',
      stdin: 'inherit',
    });

    const stdout = await new Response(process.stdout).text();
    const stderr = await new Response(process.stderr).text();
    const exitCode = await process.exited;

    return {
      name: gate.name,
      passed: exitCode === 0,
      exitCode,
      output: stdout,
      error: stderr,
      blocking: gate.blocking,
    };
  } catch (error: unknown) {
    return {
      name: gate.name,
      passed: false,
      exitCode: EXIT_CODE_FAILURE,
      output: '',
      error: error instanceof Error ? error.message : String(error),
      blocking: gate.blocking,
    };
  }
}
