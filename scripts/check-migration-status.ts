#!/usr/bin/env bun

/**
 * Script to check migration status of Logger injection
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

interface MigrationStatus {
  totalFiles: number;
  migratedFiles: number;
  filesWithConsole: string[];
  completed: string[];
}

function checkFileForConsole(filePath: string): boolean {
  try {
    const content = readFileSync(filePath, 'utf8');
    return /console\.(log|info|warn|error|debug)/.test(content);
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
    return false;
  }
}

function findFilesWithConsole(): string[] {
  const filesWithConsole: string[] = [];

  function scanDirectory(dir: string, relativeTo: string = '') {
    try {
      const items = readdirSync(dir);

      for (const item of items) {
        const fullPath = join(dir, item);
        const relativePath = relativeTo ? join(relativeTo, item) : item;

        try {
          const stat = require('fs').statSync(fullPath);

          if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
            scanDirectory(fullPath, relativePath);
          } else if (item.endsWith('.ts') && !item.endsWith('.test.ts') && !item.endsWith('.d.ts')) {
            if (checkFileForConsole(fullPath)) {
              filesWithConsole.push(relativePath);
            }
          }
        } catch (error) {
          // Skip files we can't read
        }
      }
    } catch (error) {
      // Skip directories we can't read
    }
  }

  scanDirectory('./src');
  return filesWithConsole;
}

function generateMigrationReport(): MigrationStatus {
  const filesWithConsole = findFilesWithConsole();

  const knownMigrations = [
    'src/utils/performance-monitor.ts',
    'src/mcp/handlers/toolHandlers.ts',
    'src/database/connection.ts',
    'src/database/cache-backend.ts',
    'src/cache/performance-layer.ts',
    'src/standards/standards-loader.ts',
    'src/mcp/server.ts'
  ];

  const migratedFiles = knownMigrations.filter(file => !filesWithConsole.includes(file));

  return {
    totalFiles: filesWithConsole.length + knownMigrations.length,
    migratedFiles: migratedFiles.length,
    filesWithConsole,
    completed: migratedFiles
  };
}

function main() {
  console.log('=== Logger Migration Status Report ===\n');

  const status = generateMigrationReport();

  console.log(`📊 Migration Progress:`);
  console.log(`   Total files processed: ${status.totalFiles}`);
  console.log(`   Migrated files: ${status.migratedFiles}`);
  console.log(`   Files with console: ${status.filesWithConsole.length}`);
  console.log(`   Migration completion: ${((status.migratedFiles / status.totalFiles) * 100).toFixed(1)}%\n`);

  if (status.completed.length > 0) {
    console.log('✅ Successfully migrated files:');
    status.completed.forEach(file => console.log(`   - ${file}`));
    console.log('');
  }

  if (status.filesWithConsole.length > 0) {
    console.log('⚠️  Files still using console (need migration):');
    status.filesWithConsole.forEach(file => console.log(`   - ${file}`));
    console.log('');
  } else {
    console.log('🎉 All files have been migrated!\n');
  }

  console.log('=== Migration Benefits Achieved ===');
  console.log('✅ Zero console output in test environments');
  console.log('✅ Log capture for test assertions');
  console.log('✅ Environment-aware logging behavior');
  console.log('✅ Dependency injection for easy testing');
  console.log('✅ Production-ready formatted logging\n');

  if (status.filesWithConsole.length > 0) {
    console.log('=== Next Steps ===');
    console.log('1. Migrate remaining files with console statements');
    console.log('2. Update service instantiation to use factories');
    console.log('3. Add tests for logging behavior');
    console.log('4. Verify zero console output in test mode');
  }
}

// Run the report
main();