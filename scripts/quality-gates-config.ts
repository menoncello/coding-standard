/**
 * Configuration constants and settings for quality gates validation
 */

import type { ForbiddenPatternConfig, QualityGateConfig } from './quality-gates-types.ts';

/**
 * Quality gates configuration - MANDATORY REQUIREMENTS
 * These are the core quality gates that must pass for story completion
 */
export const QUALITY_GATES: QualityGateConfig[] = [
  {
    name: 'typescript_compilation',
    description: 'TypeScript strict mode compilation - ZERO errors permitted',
    command: 'bun',
    args: ['run', 'build'],
    expectedExitCode: 0,
    blocking: true,
    errorMessage: '🚨 BLOCKED: TypeScript compilation failed - Fix ALL TypeScript errors before proceeding',
  },
  {
    name: 'eslint_compliance',
    description: 'ESLint strict compliance - ZERO errors permitted',
    command: 'bun',
    args: ['run', 'lint'],
    expectedExitCode: 0,
    blocking: true,
    errorMessage: '🚨 BLOCKED: ESLint errors detected - Fix ALL ESLint issues. NO eslint-disable allowed!',
  },
  {
    name: 'test_execution',
    description: 'All tests must pass - ZERO test failures permitted',
    command: 'bun',
    args: ['test'],
    expectedExitCode: 0,
    blocking: true,
    errorMessage: '🚨 BLOCKED: Test failures detected - ALL tests must pass before proceeding',
  },
  {
    name: 'dependency_security',
    description: 'Security vulnerability scan',
    command: 'bun',
    args: ['audit'],
    expectedExitCode: 0,
    blocking: true,
    errorMessage: '🚨 BLOCKED: Security vulnerabilities detected - Update dependencies before proceeding',
  },
];

/**
 * Forbidden patterns - INSTANT REJECTION
 * These patterns are strictly forbidden and will cause immediate rejection
 */
export const FORBIDDEN_PATTERNS: ForbiddenPatternConfig[] = [
  {
    pattern: /eslint-disable/g,
    description: 'ESLint disables are forbidden - Fix the root cause instead',
    blocking: true,
    errorMessage: '🚨 BLOCKED: eslint-disable found in code - Remove all eslint-disable comments',
  },
  {
    pattern: /@ts-ignore/g,
    description: 'TypeScript ignores are forbidden - Fix the type issue instead',
    blocking: true,
    errorMessage: '🚨 BLOCKED: @ts-ignore found in code - Remove all @ts-ignore comments',
  },
];

/**
 * Constants for magic numbers used throughout the system
 */
export const constants = {
  /** Length of console separator lines */
  consoleLineLength: 60,
  /** Length of report separator lines */
  reportLineLength: 50,
  /** Multiplier for calculating success rate percentages */
  successRateMultiplier: 100,
  /** Exit code for failure conditions */
  exitCodeFailure: 1,
  /** Exit code for success conditions */
  exitCodeSuccess: 0,
  /** Center point for random number calculations */
  randomCenter: 0.5,
  /** Multiplier for variance calculations */
  varianceMultiplier: 2,
  /** Factor for variance calculations */
  varianceFactor: 0.2,
  /** Milliseconds per second for time calculations */
  millisecondsPerSecond: 1000,
  /** Standard adapter synthesis rate in words per second */
  standardAdapterRate: 10,
  /** Fast adapter synthesis rate in words per second */
  fastAdapterRate: 15,
  /** Slow adapter synthesis rate in words per second */
  slowAdapterRate: 6,
  /** Base memory usage in MB for mock adapters */
  baseMemoryMb: 10,
  /** Memory variance in MB for mock adapters */
  memoryVarianceMb: 20,
  /** Memory factor for calculating adapter usage */
  memoryFactor: 0.5,
  /** Estimated bytes per word for audio synthesis */
  bytesPerWordEstimate: 100,
  /** Increment value for array indexing */
  increment: 1,
  /** Decimal radix for parseInt */
  decimalRadix: 10,
  /** Zero value */
  zero: 0,
} as const;
