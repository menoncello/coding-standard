#!/usr/bin/env bun

/**
 * Demo script showing the logger system in action
 * Run this script in different environments to see the behavior
 */

import { LoggerFactory } from '../src/utils/logger/logger-factory.js';
import { LogLevel } from '../src/utils/logger/logger.js';

console.log('=== Logger System Demo ===\n');

// Create logger instance (auto-detected environment)
const logger = LoggerFactory.getInstance();

console.log('Environment detection:');
console.log(`- Is test environment: ${LoggerFactory.isTestEnvironment()}`);
console.log(`- Is production environment: ${LoggerFactory.isProductionEnvironment()}`);
console.log(`- Is development environment: ${LoggerFactory.isDevelopmentEnvironment()}`);

console.log('\n=== Test Logging Operations ===');

// Test all log levels
logger.debug('This is a debug message - usually for development');
logger.info('This is an info message - general information');
logger.warn('This is a warning message - potential issue');
logger.error('This is an error message - something went wrong');
logger.log('This is a log message - general logging');

console.log('\n=== Test with DummyLogger (for testing) ===');

// Create a test logger with capturing enabled
const testLogger = LoggerFactory.createTestLogger(true);

testLogger.info('User login successful');
testLogger.debug('Database query executed in 45ms');
testLogger.warn('Rate limit approaching: 95%');
testLogger.error('Database connection failed');

console.log(`Captured logs count: ${testLogger.getCapturedLogCount()}`);
console.log(`Has captured logs: ${testLogger.hasCapturedLogs()}`);

// Show captured logs
const allLogs = testLogger.getCapturedLogs();
console.log('\nCaptured logs:');
allLogs.forEach((log, index) => {
  console.log(`${index + 1}. [${log.level.toUpperCase()}] ${log.message}`);
});

// Filter by level
const errorLogs = testLogger.getCapturedLogsByLevel(LogLevel.ERROR);
console.log(`\nError logs (${errorLogs.length}):`);
errorLogs.forEach((log) => {
  console.log(`- ${log.message}`);
});

console.log('\n=== Demo Complete ===');