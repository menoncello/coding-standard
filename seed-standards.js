#!/usr/bin/env bun

/**
 * Script para adicionar standards de exemplo ao registry
 */

import { StandardsRegistry } from './src/standards/registry.js';

const registry = new StandardsRegistry('./standards-registry.db');

async function seedStandards() {
    console.log('🚀 Seeding standards registry...');

    await registry.initialize();

    const defaultStandards = [
        {
            semanticName: 'typescript-semicolon-statements',
            pattern: '^.*;$',
            description: 'TypeScript statements should end with semicolons',
            category: 'Formatting',
            technology: 'typescript',
            severity: 'error',
            examples: [
                {
                    valid: ['const x = 1;', 'console.log("hello");', 'return x;'],
                    invalid: ['const x = 1', 'console.log("hello")', 'return x'],
                    description: 'Statements should end with semicolons'
                }
            ]
        },
        {
            semanticName: 'typescript-class-naming',
            pattern: '^[A-Z][a-zA-Z0-9]*$',
            description: 'TypeScript classes should use PascalCase',
            category: 'naming',
            technology: 'typescript',
            severity: 'error',
            examples: [
                {
                    valid: ['UserService', 'HttpClient', 'ConfigManager', 'ApiResponse'],
                    invalid: ['userService', 'http_client', 'config-manager', 'api_response'],
                    description: 'Class naming convention'
                }
            ]
        },
        {
            semanticName: 'typescript-interface-naming',
            pattern: '^I?[A-Z][a-zA-Z0-9]*$',
            description: 'TypeScript interfaces should use PascalCase, optionally prefixed with I',
            category: 'naming',
            technology: 'typescript',
            severity: 'error',
            examples: [
                {
                    valid: ['IUserService', 'IConfigOptions', 'ApiResponse'],
                    invalid: ['iUserService', 'Iconfig-options', 'api_response'],
                    description: 'Interface naming convention'
                }
            ]
        },
        {
            semanticName: 'typescript-variable-naming',
            pattern: '^[a-z][a-zA-Z0-9]*$',
            description: 'TypeScript variables should use camelCase',
            category: 'naming',
            technology: 'typescript',
            severity: 'error',
            examples: [
                {
                    valid: ['userName', 'apiResponse', 'isValid'],
                    invalid: ['UserName', 'api_response', 'isValid_'],
                    description: 'Variable naming convention'
                }
            ]
        },
        {
            semanticName: 'typescript-function-naming',
            pattern: '^[a-z][a-zA-Z0-9]*$',
            description: 'TypeScript functions should use camelCase',
            category: 'naming',
            technology: 'typescript',
            severity: 'error',
            examples: [
                {
                    valid: ['getUserData', 'calculateTotal', 'isValid'],
                    invalid: ['GetUserData', 'calculate_Total', 'IsValid'],
                    description: 'Function naming convention'
                }
            ]
        },
        {
            semanticName: 'typescript-import-naming',
            pattern: '^import.*from [\'"][^\'"]+[\'"];?$',
            description: 'TypeScript imports should use consistent formatting',
            category: 'formatting',
            technology: 'typescript',
            severity: 'warning',
            examples: [
                {
                    valid: ["import { UserService } from './user-service';", "import * as fs from 'fs';"],
                    invalid: ["import {UserService} from'./user-service';", "import * as fs from \"fs\";"],
                    description: 'Import statement formatting'
                }
            ]
        },
        {
            semanticName: 'react-component-naming',
            pattern: '^[A-Z][a-zA-Z0-9]*$',
            description: 'React components should use PascalCase',
            category: 'naming',
            technology: 'react',
            severity: 'error',
            examples: [
                {
                    valid: ['UserProfile', 'DataTable', 'NavigationMenu'],
                    invalid: ['userProfile', 'data_table', 'navigation_menu'],
                    description: 'React component naming convention'
                }
            ]
        },
        {
            semanticName: 'react-prop-naming',
            pattern: '^[a-z][a-zA-Z0-9]*$',
            description: 'React props should use camelCase',
            category: 'naming',
            technology: 'react',
            severity: 'error',
            examples: [
                {
                    valid: ['userName', 'isLoading', 'handleSubmit'],
                    invalid: ['UserName', 'isLoading', 'handle_submit'],
                    description: 'React prop naming convention'
                }
            ]
        },
        {
            semanticName: 'javascript-constant-naming',
            pattern: '^[A-Z][A-Z0-9_]*$',
            description: 'JavaScript constants should use UPPER_SNAKE_CASE',
            category: 'naming',
            technology: 'javascript',
            severity: 'warning',
            examples: [
                {
                    valid: ['API_URL', 'MAX_RETRIES', 'DEFAULT_TIMEOUT'],
                    invalid: ['apiUrl', 'maxRetries', 'defaultTimeout'],
                    description: 'Constant naming convention'
                }
            ]
        },
        {
            semanticName: 'python-class-naming',
            pattern: '^[A-Z][a-zA-Z0-9]*$',
            description: 'Python classes should use PascalCase',
            category: 'naming',
            technology: 'python',
            severity: 'error',
            examples: [
                {
                    valid: ['UserService', 'DatabaseConnection', 'HttpRequestHandler'],
                    invalid: ['user_service', 'database-connection', 'http_request_handler'],
                    description: 'Python class naming convention'
                }
            ]
        },
        {
            semanticName: 'python-function-naming',
            pattern: '^[a-z][a-z0-9_]*$',
            description: 'Python functions and methods should use snake_case',
            category: 'naming',
            technology: 'python',
            severity: 'error',
            examples: [
                {
                    valid: ['get_user_data', 'calculate_total', 'is_valid'],
                    invalid: ['getUserData', 'calculate_total', 'isValid'],
                    description: 'Python function naming convention'
                }
            ]
        }
    ];

    let addedCount = 0;
    for (const standard of defaultStandards) {
        try {
            const result = await standardsRegistryHandler.addStandard(standard);
            if (result.success) {
                addedCount++;
                console.log(`✅ Added: ${standard.semanticName}`);
            } else {
                console.error(`❌ Failed to add ${standard.semanticName}: ${result.message}`);
            }
        } catch (error) {
            console.error(`❌ Error adding ${standard.semanticName}:`, error);
        }
    }

    const stats = await registry.getStats();
    console.log('\n📊 Registry Statistics:');
    console.log(`   Total Rules: ${stats.totalRules}`);
    console.log(`   By Category:`, stats.rulesByCategory);
    console.log(`   By Technology:`, stats.rulesByTechnology);

    console.log(`\n✅ Successfully seeded ${addedCount}/${defaultStandards.length} standards!`);
    registry.close();
}

// Import the registry handler for adding standards
import { standardsRegistryHandler } from './src/mcp/handlers/toolHandlers.js';

// Run seeding
seedStandards().catch(console.error);