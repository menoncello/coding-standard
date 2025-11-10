#!/usr/bin/env bun
/**
 * Quality Gates Validator - MANDATORY ENFORCEMENT
 * ================================================
 *
 * CRITICAL: This script validates ALL quality gates
 * ANY failure = AUTOMATIC BLOCK of story completion
 * NO exceptions, NO workarounds, NO manual overrides
 *
 * Usage: bun run scripts/quality-gates-validator.ts
 * Exit codes:
 *   0 = ALL quality gates passed
 *   1 = Quality gate failure - BLOCK completion
 */

import { handleValidatorError, runQualityGatesValidation } from './quality-gates-executor.ts';

/**
 * Main entry point for the quality gates validator
 * @returns {Promise<void>} - Promise that resolves when validation is complete
 */
async function main(): Promise<void> {
  await runQualityGatesValidation();
}

// Execute if run directly
if (typeof require !== 'undefined' && require.main === module) {
  main().catch(handleValidatorError);
}

// Re-export types for backward compatibility
export type { QualityGateResult, ValidationResult } from './quality-gates-types.ts';
