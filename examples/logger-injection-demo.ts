#!/usr/bin/env bun

/**
 * Demo showing Logger injection pattern for testing
 */

import { LoggerFactory } from '../src/utils/logger/logger-factory.js';
import { DummyLogger } from '../src/utils/logger/dummy-logger.js';
import { LogLevel } from '../src/utils/logger/logger.js';

console.log('=== Logger Injection Demo ===\n');

// Example 1: Production usage with ConsoleLogger
console.log('1. Production Usage:');
const prodLogger = LoggerFactory.getInstance(); // Auto-detected as ConsoleLogger
console.log(`✅ Logger created: ${prodLogger.constructor.name}`);

// Example 2: Test usage with DummyLogger and capture
console.log('\n2. Test Usage:');
const testLogger = LoggerFactory.createTestLogger(true); // Capture logs
console.log(`✅ Test logger created: ${testLogger.constructor.name}`);
console.log(`✅ Test logger capturing: ${testLogger.hasCapturedLogs() ? 'enabled' : 'disabled'}`);

// Simulate some operations
testLogger.info('Test operation started');
testLogger.debug('Processing data...');
testLogger.warn('Performance warning: slow operation');
testLogger.error('Simulated error occurred');

console.log(`✅ Captured ${testLogger.getCapturedLogCount()} log entries`);

// Example 3: Custom Logger for specific test scenario
console.log('\n3. Custom Test Logger Example:');

const customTestLogger = new DummyLogger({}, true);
customTestLogger.info('Custom test scenario started');
customTestLogger.error('Custom error for verification');

const capturedLogs = customTestLogger.getCapturedLogs();
const errorLogs = customTestLogger.getCapturedLogsByLevel(LogLevel.ERROR);

console.log(`✅ Custom test captured ${capturedLogs.length} logs`);
console.log(`✅ Found ${errorLogs.length} error logs for assertions`);

// Show captured logs
console.log('\n=== Captured Test Logs ===');
capturedLogs.forEach((log, index) => {
    console.log(`${index + 1}. [${log.level.toUpperCase()}] ${log.message}`);
});

console.log('\n=== Demo Benefits ===');
console.log('✅ Zero console output in test environment');
console.log('✅ Log capture for test assertions');
console.log('✅ Consistent logging across environments');
console.log('✅ Easy dependency injection for testing');
console.log('✅ Production-ready logging with formatting');

// Test actual production logging
console.log('\n=== Production Logging Test ===');
prodLogger.info('Production server started');
prodLogger.debug('Database connection established');
prodLogger.warn('High memory usage detected');
prodLogger.error('API rate limit exceeded');

console.log('\n=== Demo Complete ===');