/**
 * Reporting and display utilities for quality gates validation results
 */

import { constants } from './quality-gates-config.ts';
import { log, logSummaryLine } from './quality-gates-logger.ts';
import type { QualityGateResult, ValidationResult } from './quality-gates-types.ts';

/**
 * Displays the validation summary with detailed information
 * @param {ValidationResult} result - Validation result to display
 */
function displayValidationSummary(result: ValidationResult): void {
  const separatorLine = '='.repeat(constants.consoleLineLength);
  const headerLine = `\n${separatorLine}`;

  log(headerLine);
  log('QUALITY GATES VALIDATION SUMMARY');
  log(separatorLine);
  log(`📊 Total gates: ${result.totalGates}`);
  log(`✅ Passed: ${result.passedGates}`);
  log(`❌ Failed: ${result.failedGates}`);

  const successRate = calculateSuccessRate(result.passedGates, result.totalGates);
  log(`🎯 Success rate: ${successRate}%`);

  logSummaryLine(result.summary);
}

/**
 * Handles validation failure by displaying error messages and required actions
 * @param {ValidationResult} result - Validation result that failed
 */
function handleValidationFailure(result: ValidationResult): void {
  log('\n🚨 QUALITY GATES FAILED - STORY COMPLETION BLOCKED');
  log('================================================');
  log('Action required:');
  log('1. Fix ALL failing quality gates');
  log('2. Remove ALL forbidden patterns');
  log('3. Re-run validation when issues are resolved');
  log('4. NO manual overrides permitted');

  displaySpecificFailures(result.results);
}

/**
 * Handles validation success by displaying success message
 */
function handleValidationSuccess(): void {
  log('\n🎉 ALL QUALITY GATES PASSED - PROCEED TO COMPLETION');
  log('==================================================');
}

/**
 * Calculates the success rate as a percentage
 * @param {number} passedGates - Number of gates that passed
 * @param {number} totalGates - Total number of gates
 * @returns {string} Success rate formatted as a percentage with one decimal place
 */
function calculateSuccessRate(passedGates: number, totalGates: number): string {
  return ((passedGates / totalGates) * constants.successRateMultiplier).toFixed(1);
}

/**
 * Displays specific failure details for debugging purposes
 * @param {QualityGateResult[]} results - All quality gate results
 */
function displaySpecificFailures(results: QualityGateResult[]): void {
  const failures = results.filter((result) => !result.passed);

  if (failures.length > 0) {
    log('\n📋 Specific failures to address:');
    for (const failure of failures) {
      log(`  • ${failure.name}: ${failure.error}`);
    }
  }
}

/**
 * Generates a comprehensive validation report for logging purposes
 * @param {ValidationResult} result - Validation result to report on
 * @returns {string} Formatted report string
 */
function generateValidationReport(result: ValidationResult): string {
  const timestamp = new Date().toISOString();
  const reportLines = [
    `Quality Gates Validation Report - ${timestamp}`,
    '='.repeat(constants.reportLineLength),
    `Status: ${result.success ? 'PASSED' : 'FAILED'}`,
    `Total Gates: ${result.totalGates}`,
    `Passed: ${result.passedGates}`,
    `Failed: ${result.failedGates}`,
    `Success Rate: ${calculateSuccessRate(result.passedGates, result.totalGates)}%`,
    '',
    'Detailed Results:',
    ...result.results.map(
      (gateResult) =>
        `  ${gateResult.passed ? '✅' : '❌'} ${gateResult.name}: ${gateResult.passed ? 'PASSED' : 'FAILED'}`,
    ),
    '',
    `Summary: ${result.summary}`,
    '='.repeat(constants.reportLineLength),
  ];

  return reportLines.join('\n');
}

// Exports
export { displayValidationSummary, handleValidationFailure, handleValidationSuccess, generateValidationReport };
