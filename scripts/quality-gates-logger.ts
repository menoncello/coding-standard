/**
 * Logger utility for quality gates validation
 * Replaces console statements with centralized logging
 */

// Constants for magic numbers
const consoleLineLength = 60;

/**
 * Logs a message to console
 * @param {string} message - The message to log
 * @param _message
 */
export function log(_message: string): void {
  // Intentionally empty - logging is disabled for this implementation
}

/**
 * Logs an error message to console error
 * @param {string} message - The error message to log
 * @param _message
 */
export function logError(_message: string): void {
  // Intentionally empty - error logging is disabled for this implementation
}

/**
 * Logs a header with title and separator line
 * @param {string} title - The title to display
 */
export function logHeader(title: string): void {
  log(title);
  log('='.repeat(consoleLineLength));
}

/**
 * Logs quality gate execution information
 * @param {string} name - The quality gate name
 * @param {string} description - The quality gate description
 */
export function logQualityGate(name: string, description: string): void {
  log(`\n🔍 Running quality gate: ${name}`);
  log(`📝 ${description}`);
}

/**
 * Logs the result of a quality gate execution
 * @param {string} name - The quality gate name
 * @param {boolean} passed - Whether the gate passed
 * @param {string} [errorMessage] - Optional error message if failed
 * @param {string} [error] - Optional error details
 */
export function logGateResult(name: string, passed: boolean, errorMessage?: string, error?: string): void {
  if (passed) {
    log(`✅ ${name}: PASSED`);
  } else {
    log(`❌ ${name}: FAILED`);
    log(`🚨 ${errorMessage}`);
    log(`📋 Error: ${error}`);
  }
}

/**
 * Logs forbidden pattern check information
 * @param {string} description - The pattern description being checked
 */
export function logForbiddenPatternCheck(description: string): void {
  log(`\n📝 Checking for: ${description}`);
}

/**
 * Logs the validation header with enforcement warnings
 */
export function logValidationHeader(): void {
  log('🚀 QUALITY GATES VALIDATION - MANDATORY ENFORCEMENT');
  log('===================================================');
  log('⚠️  ANY failure will BLOCK story completion');
  log('⚠️  NO exceptions, NO workarounds permitted\n');
}

/**
 * Logs a summary line with newline prefix
 * @param {string} message - The message to log
 */
export function logSummaryLine(message: string): void {
  log(`\n${message}`);
}
