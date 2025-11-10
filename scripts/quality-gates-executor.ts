/**
 * Core quality gates execution logic and validation orchestration
 */

import process from 'node:process';
import { constants, QUALITY_GATES } from './quality-gates-config.ts';
import { log, logError, logGateResult, logValidationHeader } from './quality-gates-logger.ts';
import { processForbiddenPatternResults } from './quality-gates-pattern-validator.ts';
import type { QualityGateExecutionResults, QualityGateResult, ValidationResult } from './quality-gates-types.ts';
import { executeQualityGate, generateSummary } from './quality-gates-utils.ts';

// Constants for magic numbers
const ZERO = 0;
const EMPTY_LENGTH = 0;
const ONE = 1;
const FIRST_ELEMENT = 0;

/**
 * Calculates total counts and determines success based on quality gate results
 * @param {QualityGateResult[]} results - Quality gate execution results
 * @param {number} passedCount - Count of passed quality gates
 * @param {number} failedCount - Count of failed quality gates
 * @returns {Promise<{ totalPassed: number; totalFailed: number; success: boolean }>} Calculated metrics
 */
async function calculateQualityGateMetrics(
  results: QualityGateResult[],
  passedCount: number,
  failedCount: number,
): Promise<{ totalPassed: number; totalFailed: number; success: boolean }> {
  const { passedCount: forbiddenPassedCount, failedCount: forbiddenFailedCount } =
    await processForbiddenPatternResults(results);

  const totalPassed = passedCount + forbiddenPassedCount;
  const totalFailed = failedCount + forbiddenFailedCount;
  const blockingFailures = results.filter((result) => !result.passed && result.blocking).length;
  const success = blockingFailures === ZERO;

  return { totalPassed, totalFailed, success };
}

/**
 * Creates the summary for the validation result
 * @param {QualityGateResult[]} results - Quality gate execution results
 * @param {number} totalFailed - Total number of failed gates
 * @param {boolean} success - Overall validation success status
 * @returns {string} Generated summary
 */
function createValidationSummary(results: QualityGateResult[], totalFailed: number, success: boolean): string {
  return generateSummary(success, results.length, totalFailed);
}

/**
 * Creates the validation result object with all required fields
 * @param {QualityGateResult[]} results - Quality gate execution results
 * @param {number} totalPassed - Total number of passed gates
 * @param {number} totalFailed - Total number of failed gates
 * @param {boolean} success - Overall validation success status
 * @returns {ValidationResult} Complete validation result
 */
function createValidationResult(
  results: QualityGateResult[],
  totalPassed: number,
  totalFailed: number,
  success: boolean,
): ValidationResult {
  return {
    success,
    totalGates: results.length,
    passedGates: totalPassed,
    failedGates: totalFailed,
    results,
    summary: createValidationSummary(results, totalFailed, success),
  };
}

/**
 * Executes all quality gates and returns the validation result
 * @returns {Promise<ValidationResult>} - Complete validation results
 */
async function validateQualityGates(): Promise<ValidationResult> {
  logValidationHeader();

  const { results, passedCount, failedCount } = await executeAllQualityGates();
  const { totalPassed, totalFailed, success } = await calculateQualityGateMetrics(results, passedCount, failedCount);

  return createValidationResult(results, totalPassed, totalFailed, success);
}

/**
 * Executes a single quality gate and logs the result
 * @param {(typeof QUALITY_GATES)[typeof FIRST_ELEMENT]} gate - Quality gate to execute
 * @returns {Promise<QualityGateResult>} Result of quality gate execution
 */
async function executeAndLogQualityGate(
  gate: (typeof QUALITY_GATES)[typeof FIRST_ELEMENT],
): Promise<QualityGateResult> {
  const result = await executeQualityGate(gate);

  if (result.passed) {
    logGateResult(gate.name, true);
  } else {
    logGateResult(gate.name, false, gate.errorMessage, result.error);
  }

  return result;
}

/**
 * Counts passed and failed quality gates from results
 * @param {QualityGateResult[]} results - Array of quality gate results
 * @returns {{ passedCount: number; failedCount: number }} Count of passed and failed gates
 */
function countQualityGateResults(results: QualityGateResult[]): { passedCount: number; failedCount: number } {
  let passedCount = ZERO;
  let failedCount = ZERO;

  for (const result of results) {
    if (result.passed) {
      passedCount += ONE;
    } else {
      failedCount += ONE;
    }
  }

  return { passedCount, failedCount };
}

/**
 * Executes all quality gates and returns initial results
 * @returns {Promise<QualityGateExecutionResults>} - Results and counts from quality gate execution
 */
async function executeAllQualityGates(): Promise<QualityGateExecutionResults> {
  const gatePromises = QUALITY_GATES.map((gate) => executeAndLogQualityGate(gate));
  const results = await Promise.all(gatePromises);
  const { passedCount, failedCount } = countQualityGateResults(results);

  return { results, passedCount, failedCount };
}

/**
 * Handles successful validation by displaying success message and exiting
 */
function handleSuccessfulValidation(): void {
  log('\n🎉 ALL QUALITY GATES PASSED - PROCEED TO COMPLETION');
  log('==================================================');
  process.exit(constants.exitCodeSuccess); // Allow completion
}

/**
 * Handles failed validation by displaying error messages and exiting
 * @param {ValidationResult} result - Validation result that failed
 */
function handleFailedValidation(result: ValidationResult): void {
  log('\n🚨 QUALITY GATES FAILED - STORY COMPLETION BLOCKED');
  log('================================================');
  log('Action required:');
  log('1. Fix ALL failing quality gates');
  log('2. Remove ALL forbidden patterns');
  log('3. Re-run validation when issues are resolved');
  log('4. NO manual overrides permitted');

  displayValidationFailures(result.results);
  process.exit(constants.exitCodeFailure); // Block completion
}

/**
 * Displays specific validation failures for debugging
 * @param {QualityGateResult[]} results - All quality gate results
 */
function displayValidationFailures(results: QualityGateResult[]): void {
  const failures = results.filter((result) => !result.passed);

  if (failures.length > EMPTY_LENGTH) {
    log('\n📋 Specific failures to address:');
    for (const failure of failures) {
      log(`  • ${failure.name}: ${failure.error}`);
    }
  }
}

/**
 * Main function that runs the quality gates validation and exits with appropriate code
 * @returns {Promise<void>} - Promise that resolves when validation is complete
 */
async function runQualityGatesValidation(): Promise<void> {
  const result = await validateQualityGates();

  if (result.success) {
    handleSuccessfulValidation();
  } else {
    handleFailedValidation(result);
  }
}

/**
 * Error handler for quality gates validator crashes
 * @param {Error} error - The error that occurred
 * @returns {never} - Never returns, always exits process
 */
export function handleValidatorError(error: Error): never {
  logError('💥 Quality gates validator crashed:');
  logError(error.message);
  process.exit(constants.exitCodeFailure);
}

export { validateQualityGates, executeAllQualityGates, runQualityGatesValidation };
