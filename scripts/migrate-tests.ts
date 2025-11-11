#!/usr/bin/env bun

/**
 * Script to migrate test files to use Logger injection pattern
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { readdirSync, statSync } from 'fs';

interface TestFile {
  path: string;
  content: string;
  needsMigration: boolean;
  oldInstantiations: string[];
}

interface MigrationResult {
  total: number;
  migrated: number;
  skipped: number;
  errors: string[];
}

class TestMigrator {
  private patterns = [
    // DatabaseConnection instantiations
    {
      pattern: /new DatabaseConnection\(\{([^}]*)\}\)/g,
      replacement: 'DatabaseFactory.createDatabaseConnection($1, testLogger)',
      description: 'DatabaseConnection instantiations'
    },
    // SqliteCacheBackend instantiations
    {
      pattern: /new SqliteCacheBackend<([^>]+)>\(\{([^}]*)\}\)/g,
      replacement: 'CacheFactory.createCacheBackend<$1>($2, testLogger)',
      description: 'SqliteCacheBackend instantiations'
    },
    // GetStandardsHandler instantiations
    {
      pattern: /new GetStandardsHandler\(([^)]*)\)/g,
      replacement: 'ToolHandlersFactory.createGetStandardsHandler($1, testDbPath)',
      description: 'GetStandardsHandler instantiations'
    },
    // PerformanceMonitor instantiations
    {
      pattern: /new PerformanceMonitor\(\)/g,
      replacement: 'PerformanceFactory.createPerformanceMonitor()',
      description: 'PerformanceMonitor instantiations'
    },
    // PerformanceCache instantiations
    {
      pattern: /new PerformanceCache<([^>]+)>\(\{([^}]*)\}\)/g,
      replacement: 'CacheFactory.createPerformanceCache<$1>($2)',
      description: 'PerformanceCache instantiations'
    },
    // StandardsLoader instantiations
    {
      pattern: /new StandardsLoader\(([^)]*)\)/g,
      replacement: 'StandardsFactory.createStandardsLoader($1)',
      description: 'StandardsLoader instantiations'
    }
  ];

  private factoryImports = `// Factory imports
import { DatabaseFactory } from '../../../src/factories/database-factory.js';
import { CacheFactory } from '../../../src/factories/cache-factory.js';
import { ToolHandlersFactory } from '../../../src/factories/tool-handlers-factory.js';
import { PerformanceFactory } from '../../../src/factories/performance-factory.js';
import { StandardsFactory } from '../../../src/factories/standards-factory.js';
import { LoggerFactory } from '../../../src/utils/logger/logger-factory.js';`;

  private testLoggerSetup = `// Test logger setup
const testLogger = LoggerFactory.createTestLogger(true);`;

  private findTestFiles(dir: string): string[] {
    const files: string[] = [];

    try {
      const items = readdirSync(dir);

      for (const item of items) {
        const fullPath = join(dir, item);
        const stat = statSync(fullPath);

        if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
          files.push(...this.findTestFiles(fullPath));
        } else if (item.endsWith('.test.ts')) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      // Skip directories we can't read
    }

    return files;
  }

  private analyzeFile(filePath: string): TestFile {
    try {
      const content = readFileSync(filePath, 'utf8');
      const oldInstantiations: string[] = [];
      let needsMigration = false;

      // Check if file needs migration
      for (const patternInfo of this.patterns) {
        const matches = content.match(patternInfo.pattern);
        if (matches) {
          needsMigration = true;
          oldInstantiations.push(...matches.map(match => `${patternInfo.description}: ${match}`));
        }
      }

      return {
        path: filePath,
        content,
        needsMigration,
        oldInstantiations
      };
    } catch (error) {
      console.error(`Error reading file ${filePath}:`, error);
      return {
        path: filePath,
        content: '',
        needsMigration: false,
        oldInstantiations: []
      };
    }
  }

  private migrateFile(testFile: TestFile): string {
    let migratedContent = testFile.content;

    // Add imports if needed
    if (testFile.needsMigration) {
      // Find existing imports section
      const importMatch = migratedContent.match(/^import[^;]*;?$/gm);
      if (importMatch) {
        const lastImport = importMatch[importMatch.length - 1];
        const insertPosition = migratedContent.lastIndexOf(lastImport) + lastImport.length;
        migratedContent =
          migratedContent.slice(0, insertPosition) + '\n' + this.factoryImports +
          migratedContent.slice(insertPosition);
      } else {
        // Add imports at the beginning
        migratedContent = this.factoryImports + '\n' + migratedContent;
      }

      // Add test logger setup before describe blocks
      const describeMatch = migratedContent.match(/describe\(.*?, \(\) => \s*\{/);
      if (describeMatch) {
        const insertPosition = migratedContent.indexOf(describeMatch[0]) + describeMatch[0].length;
        migratedContent =
          migratedContent.slice(0, insertPosition) + '\n    ' + this.testLoggerSetup +
          migratedContent.slice(insertPosition);
      }

      // Apply migration patterns
      for (const patternInfo of this.patterns) {
        migratedContent = migratedContent.replace(patternInfo.pattern, patternInfo.replacement);
      }
    }

    return migratedContent;
  }

  private backupFile(filePath: string): void {
    try {
      const backupPath = filePath + '.backup';
      const content = readFileSync(filePath, 'utf8');
      writeFileSync(backupPath, content);
    } catch (error) {
      console.error(`Error backing up file ${filePath}:`, error);
    }
  }

  private writeMigratedFile(filePath: string, content: string): void {
    try {
      writeFileSync(filePath, content);
    } catch (error) {
      console.error(`Error writing migrated file ${filePath}:`, error);
    }
  }

  migrateTestFiles(): MigrationResult {
    const testFiles = this.findTestFiles('./tests');
    const result: MigrationResult = {
      total: testFiles.length,
      migrated: 0,
      skipped: 0,
      errors: []
    };

    console.log(`\n=== Test Migration Status ===`);
    console.log(`Found ${testFiles.length} test files to analyze`);

    for (const filePath of testFiles) {
      try {
        const testFile = this.analyzeFile(filePath);

        if (testFile.needsMigration) {
          console.log(`\n🔄 Migrating: ${filePath}`);

          // Show what will be changed
          console.log(`   Found patterns to migrate:`);
          testFile.oldInstantiations.forEach(pattern => {
            console.log(`   - ${pattern}`);
          });

          // Create backup
          this.backupFile(filePath);

          // Migrate
          const migratedContent = this.migrateFile(testFile);
          this.writeMigratedFile(filePath, migratedContent);

          result.migrated++;
          console.log(`   ✅ Migration completed`);
        } else {
          result.skipped++;
        }
      } catch (error) {
        result.errors.push(`Error migrating ${filePath}: ${error}`);
        console.error(`❌ Error migrating ${filePath}:`, error);
      }
    }

    return result;
  }
}

// Run migration
const migrator = new TestMigrator();
const result = migrator.migrateTestFiles();

// Report results
console.log(`\n=== Migration Complete ===`);
console.log(`📊 Summary:`);
console.log(`   Total files: ${result.total}`);
console.log(`   Migrated: ${result.migrated}`);
console.log(`   Skipped: ${result.skipped}`);
console.log(`   Errors: ${result.errors.length}`);

if (result.errors.length > 0) {
  console.log(`\n❌ Errors:`);
  result.errors.forEach(error => console.log(`   ${error}`));
  process.exit(1);
} else {
  console.log(`\n✅ All test files migrated successfully!`);

  console.log(`\n=== Next Steps ===`);
  console.log(`1. Run tests to verify functionality: bun test`);
  console.log(`2. Check for any compilation errors: bun run src/mcp/start-server.ts`);
  console.log(`3. Verify zero console output in test mode: NODE_ENV=test bun test`);
  console.log(`4. Remove backup files if migration is successful: find tests -name '*.backup' -delete`);
}

if (result.migrated === 0) {
  console.log(`\n🎉 All test files are already using Logger injection!`);
}