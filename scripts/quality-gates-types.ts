/**
 * Type definitions and interfaces for quality gates validation system
 */

/**
 * Interface for quality gate result data
 */
export interface QualityGateResult {
  /** Name of the quality gate */
  name: string;
  /** Whether the gate passed validation */
  passed: boolean;
  /** Exit code from the gate execution */
  exitCode: number;
  /** Standard output from the gate execution */
  output: string;
  /** Error output from the gate execution */
  error: string;
  /** Whether this gate blocks completion */
  blocking: boolean;
}

/**
 * Interface for overall validation results
 */
export interface ValidationResult {
  /** Overall success status */
  success: boolean;
  /** Total number of gates executed */
  totalGates: number;
  /** Number of gates that passed */
  passedGates: number;
  /** Number of gates that failed */
  failedGates: number;
  /** Detailed results for each gate */
  results: QualityGateResult[];
  /** Summary message for the validation */
  summary: string;
}

/**
 * Interface for quality gate configuration
 */
export interface QualityGateConfig {
  /** Unique identifier for the gate */
  name: string;
  /** Human-readable description of what the gate checks */
  description: string;
  /** Command to execute for the gate */
  command: string;
  /** Arguments to pass to the command */
  args: string[];
  /** Expected exit code for success */
  expectedExitCode: number;
  /** Whether this gate blocks story completion */
  blocking: boolean;
  /** Error message to display when gate fails */
  errorMessage: string;
}

/**
 * Interface for forbidden pattern configuration
 */
export interface ForbiddenPatternConfig {
  /** Regular expression pattern to search for */
  pattern: RegExp;
  /** Description of what this pattern represents */
  description: string;
  /** Whether this pattern blocks completion */
  blocking: boolean;
  /** Error message to display when pattern is found */
  errorMessage: string;
}

/**
 * Interface for pattern scanning results
 */
export interface PatternScanResult {
  /** Whether the pattern was found */
  found: boolean;
  /** List of files containing the pattern */
  files: string[];
}

/**
 * Interface for forbidden pattern result options
 */
export interface ForbiddenPatternResultOptions {
  /** Name of the pattern */
  patternName: string;
  /** Whether the check passed */
  passed: boolean;
  /** Exit code from the check */
  exitCode: number;
  /** Output from the check */
  output: string;
  /** Error message if check failed */
  error: string;
  /** Whether this blocks completion */
  blocking: boolean;
}

/**
 * Interface for quality gate execution results with counts
 */
export interface QualityGateExecutionResults {
  /** All quality gate results */
  results: QualityGateResult[];
  /** Number of gates that passed */
  passedCount: number;
  /** Number of gates that failed */
  failedCount: number;
}
