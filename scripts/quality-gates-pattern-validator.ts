/**
 * Forbidden pattern validation functionality for quality gates
 */

import { constants, FORBIDDEN_PATTERNS } from './quality-gates-config.ts';
import { log, logForbiddenPatternCheck } from './quality-gates-logger.ts';
import type { ForbiddenPatternResultOptions, QualityGateResult } from './quality-gates-types.ts';
import { getSourceFiles, scanFilesForPattern } from './quality-gates-utils.ts';

/**
 * Scans source files for all forbidden patterns
 * @returns {QualityGateResult[]} - Results of forbidden pattern checks
 */
export function checkForbiddenPatterns(): QualityGateResult[] {
  log('\n🔍 Checking forbidden patterns in source code...');

  const results: QualityGateResult[] = [];

  for (const forbidden of FORBIDDEN_PATTERNS) {
    const patternResult = checkSingleForbiddenPattern(forbidden);
    results.push(patternResult);
  }

  return results;
}

/**
 * Checks a single forbidden pattern in source files
 * @param {typeof FORBIDDEN_PATTERNS[0]} forbidden - The forbidden pattern configuration
 * @returns {QualityGateResult} - Result of the pattern check
 */
export function checkSingleForbiddenPattern(forbidden: (typeof FORBIDDEN_PATTERNS)[0]): QualityGateResult {
  logForbiddenPatternCheck(forbidden.description);

  try {
    const files = getSourceFiles();
    const patternCheckResult = scanFilesForPattern(files, forbidden.pattern);

    if (patternCheckResult.found) {
      return handleFailedPatternCheck(forbidden, patternCheckResult.files);
    }

    return handleSuccessfulPatternCheck(forbidden);
  } catch (error: unknown) {
    return handlePatternCheckError(forbidden, error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Creates a forbidden pattern result object
 * @param {ForbiddenPatternResultOptions} options - The result options
 * @returns {QualityGateResult} - The result object
 */
export function createForbiddenPatternResult(options: ForbiddenPatternResultOptions): QualityGateResult {
  return {
    name: options.patternName,
    passed: options.passed,
    exitCode: options.exitCode,
    output: options.output,
    error: options.error,
    blocking: options.blocking,
  };
}

/**
 * Handles successful forbidden pattern check
 * @param {typeof FORBIDDEN_PATTERNS[0]} forbidden - The forbidden pattern configuration
 * @returns {QualityGateResult} - The success result
 */
export function handleSuccessfulPatternCheck(forbidden: (typeof FORBIDDEN_PATTERNS)[0]): QualityGateResult {
  return createForbiddenPatternResult({
    patternName: `forbidden_pattern_${forbidden.pattern.source}`,
    passed: true,
    exitCode: constants.exitCodeSuccess,
    output: 'No forbidden patterns found',
    error: '',
    blocking: forbidden.blocking,
  });
}

/**
 * Handles failed forbidden pattern check
 * @param {typeof FORBIDDEN_PATTERNS[0]} forbidden - The forbidden pattern configuration
 * @param {string[]} files - List of files containing the pattern
 * @returns {QualityGateResult} - The failure result
 */
export function handleFailedPatternCheck(
  forbidden: (typeof FORBIDDEN_PATTERNS)[0],
  files: string[],
): QualityGateResult {
  return createForbiddenPatternResult({
    patternName: `forbidden_pattern_${forbidden.pattern.source}`,
    passed: false,
    exitCode: constants.exitCodeFailure,
    output: '',
    error: `Forbidden pattern found in files: ${files.join(', ')}`,
    blocking: forbidden.blocking,
  });
}

/**
 * Handles error in forbidden pattern check
 * @param {typeof FORBIDDEN_PATTERNS[0]} forbidden - The forbidden pattern configuration
 * @param {Error} error - The error that occurred
 * @returns {QualityGateResult} - The error result
 */
export function handlePatternCheckError(forbidden: (typeof FORBIDDEN_PATTERNS)[0], error: Error): QualityGateResult {
  return createForbiddenPatternResult({
    patternName: `forbidden_pattern_${forbidden.pattern.source}`,
    passed: false,
    exitCode: constants.exitCodeFailure,
    output: '',
    error: `Error checking forbidden patterns: ${error.message}`,
    blocking: forbidden.blocking,
  });
}

/**
 * Processes forbidden pattern results and updates counts
 * @param {QualityGateResult[]} results - Array to store results
 * @returns {Promise<{passedCount: number; failedCount: number}>} - Updated counts from forbidden pattern checks
 */
export async function processForbiddenPatternResults(
  results: QualityGateResult[],
): Promise<{ passedCount: number; failedCount: number }> {
  const forbiddenResults = await checkForbiddenPatterns();
  results.push(...forbiddenResults);

  let passedCount = 0;
  let failedCount = 0;

  for (const result of forbiddenResults) {
    if (result.passed) {
      log('✅ Forbidden patterns check: PASSED');
      passedCount += 1;
    } else {
      log('❌ Forbidden patterns check: FAILED');
      log(`🚨 ${result.error}`);
      failedCount += 1;
    }
  }

  return { passedCount, failedCount };
}
