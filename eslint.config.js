import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import importPlugin from 'eslint-plugin-import';
import jsdoc from 'eslint-plugin-jsdoc';
import nodePlugin from 'eslint-plugin-node';
import securityPlugin from 'eslint-plugin-security';
import sonarjs from 'eslint-plugin-sonarjs';
import unicorn from 'eslint-plugin-unicorn';
import comments from 'eslint-plugin-eslint-comments';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createRequire} from 'node:module';

// Constants for ESLint configuration
const THREE = 3;
const FIVE = 5;
const CONST_4 = 4;
const CONST_15 = 15;
const CONST_200 = 200;
const MAX_LINES_CONFIG = 200;
const MAX_STATEMENTS = 10;

const eslintConfig = [
    {
        ignores: [
            '**/dist/**',
            '**/nodeModules/**',
            '**/coverage/**',
            '**/reports/**',
            '**/.stryker-tmp/**',
            '.turbo/**',
            'node_modules/**',
            '**/*.json'
        ],
    },
    {
        files: ['**/*.ts', '**/*.js'],
        settings: {
            'import/resolver': {
                typescript: {
                    alwaysTryTypes: true,
                    project: ['./tsconfig.json', './packages/*/tsconfig.json'],
                },
            },
            'import/core-modules': ['bun:test'],
        },
        languageOptions: {
            parser: tsparser,
            parserOptions: {
                ecmaVersion: 2022,
                sourceType: 'module',
                project: ['./tsconfig.json', './packages/*/tsconfig.json'],
                tsconfigRootDir: import.meta.dirname,
            },
            globals: {
                Bun: 'readonly',
                process: 'readonly',
                console: 'readonly',
                Buffer: 'readonly',
                __dirname: 'readonly',
                __filename: 'readonly',
                global: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                setImmediate: 'readonly',
                clearImmediate: 'readonly',
            },
        },
        plugins: {
            '@typescript-eslint': tseslint,
            sonarjs,
            unicorn,
            import: importPlugin,
            jsdoc,
            node: nodePlugin,
            security: securityPlugin,
            'eslint-comments': comments,
        },
        rules: {
            // Template-based strict thresholds
            'eslint-comments/no-unused-disable': 'error',
            complexity: ['error', FIVE],
            'max-depth': ['error', THREE],
            'max-lines': ['error', {max: MAX_LINES_CONFIG, skipBlankLines: true, skipComments: true}],
            'max-lines-per-function': ['error', {max: CONST_15, skipBlankLines: true, skipComments: true}],
            'max-nested-callbacks': ['error', THREE],
            'max-params': ['error', CONST_4],
            'max-statements': ['error', MAX_STATEMENTS],

            // TypeScript Advanced Rules
            '@typescript-eslint/explicit-function-return-type': ['error', {allowExpressions: true}],
            '@typescript-eslint/explicit-module-boundary-types': 'error',
            '@typescript-eslint/no-non-null-assertion': 'error',
            '@typescript-eslint/prefer-for-of': 'error',
            '@typescript-eslint/prefer-as-const': 'error',
            '@typescript-eslint/no-array-constructor': 'error',
            '@typescript-eslint/no-inferrable-types': 'error',
            '@typescript-eslint/array-type': ['error', {default: 'array-simple'}],
            '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
            '@typescript-eslint/method-signature-style': ['error', 'property'],
            '@typescript-eslint/naming-convention': [
                'error',
                {selector: 'interface', format: ['PascalCase']},
                {selector: 'typeAlias', format: ['PascalCase']},
                {selector: 'enum', format: ['PascalCase']},
            ],

            // SonarJS Static Analysis
            'sonarjs/cognitive-complexity': ['error', FIVE],
            'sonarjs/no-duplicate-string': ['error', {threshold: THREE}],
            'sonarjs/no-identical-functions': 'error',
            'sonarjs/no-duplicated-branches': 'error',
            'sonarjs/no-redundant-boolean': 'error',
            'sonarjs/prefer-immediate-return': 'error',

            // Unicorn Modern Best Practices
            'unicorn/better-regex': 'error',
            'unicorn/catch-error-name': 'error',
            'unicorn/consistent-function-scoping': 'error',
            'unicorn/custom-error-definition': 'error',
            'unicorn/error-message': 'error',
            'unicorn/escape-case': 'error',
            'unicorn/expiring-todo-comments': 'error',
            'unicorn/explicit-length-check': 'error',
            'unicorn/filename-case': ['error', {case: 'kebabCase'}],
            'unicorn/no-abusive-eslint-disable': 'error',
            'unicorn/no-array-for-each': 'error',
            'unicorn/no-console-spaces': 'error',
            'unicorn/no-instanceof-array': 'error',
            'unicorn/no-invalid-remove-event-listener': 'error',
            'unicorn/no-unreadable-array-destructuring': 'error',
            'unicorn/no-unused-properties': 'error',
            'unicorn/no-useless-undefined': 'error',
            'unicorn/number-literal-case': 'error',
            'unicorn/prefer-add-event-listener': 'error',
            'unicorn/prefer-array-find': 'error',
            'unicorn/prefer-array-flat-map': 'error',
            'unicorn/prefer-array-some': 'error',
            'unicorn/prefer-default-parameters': 'error',
            'unicorn/prefer-includes': 'error',
            'unicorn/prefer-modern-math-apis': 'error',
            'unicorn/prefer-negative-index': 'error',
            'unicorn/prefer-number-properties': 'error',
            'unicorn/prefer-optional-catch-binding': 'error',
            'unicorn/prefer-string-starts-ends-with': 'error',
            'unicorn/prefer-type-error': 'error',
            'unicorn/prevent-abbreviations': 'error',

            // Import Organization
            'import/no-duplicates': 'error',
            'import/no-unresolved': 'error',
            'import/order': [
                'error',
                {
                    groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
                    'newlines-between': 'never',
                    alphabetize: {order: 'asc', caseInsensitive: true},
                },
            ],
            'import/newline-after-import': 'error',
            'import/no-default-export': 'error',
            'import/no-mutable-exports': 'error',

            // JSDoc Documentation
            'jsdoc/check-alignment': 'error',
            'jsdoc/check-param-names': 'error',
            'jsdoc/check-tag-names': 'error',
            'jsdoc/check-types': 'error',
            'jsdoc/require-description': 'error',
            'jsdoc/require-param': 'error',
            'jsdoc/require-param-description': 'error',
            'jsdoc/require-param-type': 'error',
            'jsdoc/require-returns': 'error',
            'jsdoc/require-returns-description': 'error',
            'jsdoc/require-returns-type': 'error',
            'jsdoc/require-jsdoc': [
                'error',
                {
                    require: {
                        FunctionDeclaration: true,
                        MethodDefinition: true,
                        ClassDeclaration: true,
                        ArrowFunctionExpression: false,
                        FunctionExpression: false,
                    },
                },
            ],

            // Core ESLint Rules
            'no-magic-numbers': ['error', {ignoreArrayIndexes: true, ignoreDefaultValues: true}],
            'no-duplicate-imports': 'error',
            'no-lonely-if': 'error',
            'no-return-await': 'error',
            'no-useless-return': 'error',
            'prefer-const': 'error',
            'prefer-template': 'error',
            yoda: 'error',

            // Filtered TypeScript ESLint Rules
            ...Object.fromEntries(
                Object.entries(tseslint.configs.recommended.rules).filter(
                    ([rule]) =>
                        ![
                            '@typescript-eslint/no-unused-vars',
                            '@typescript-eslint/no-explicit-any',
                            '@typescript-eslint/no-debugger',
                            '@typescript-eslint/no-empty-function',
                            '@typescript-eslint/no-non-null-assertion',
                            '@typescript-eslint/no-misused-new',
                            '@typescript-eslint/no-unnecessary-type-assertion',
                            '@typescript-eslint/prefer-const',
                            '@typescript-eslint/no-var-requires',
                        ].includes(rule),
                ),
            ),

            // Additional Performance and Security Rules
            'no-loop-func': 'error',
            'no-self-compare': 'error',
            'no-iterator': 'error',
            'no-restricted-syntax': 'error',
            'prefer-rest-params': 'error',

            // Code Quality Rules
            'array-callback-return': 'error',
            'consistent-return': 'error',
            'func-name-matching': 'error',

            // Additional TypeScript Rules
            '@typescript-eslint/ban-ts-comment': 'error',
            '@typescript-eslint/no-restricted-types': 'error',
            '@typescript-eslint/no-dynamic-delete': 'error',
            '@typescript-eslint/no-empty-interface': 'error',
            '@typescript-eslint/prefer-nullish-coalescing': 'error',
            '@typescript-eslint/prefer-optional-chain': 'error',
            '@typescript-eslint/restrict-template-expressions': 'error',
            '@typescript-eslint/strict-boolean-expressions': 'error',

            // Additional Import Rules
            'import/extensions': ['error', 'never'],
            'import/first': 'error',
            'import/no-relative-parent-imports': 'error',
            'import/no-useless-path-segments': 'error',
        },
    },
    {
        files: ['**/*.test.ts', '**/*.spec.ts', '**/tests/**/*.ts'],
        languageOptions: {
            globals: {
                describe: 'readonly',
                it: 'readonly',
                test: 'readonly',
                expect: 'readonly',
                beforeEach: 'readonly',
                afterEach: 'readonly',
                beforeAll: 'readonly',
                afterAll: 'readonly',
            },
        },
        rules: {
            'max-lines': 'off',
            'max-lines-per-function': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            'sonarjs/no-duplicate-string': 'off',
            'jsdoc/require-jsdoc': 'off',
            'jsdoc/require-description': 'off',
            'jsdoc/require-param': 'off',
            'jsdoc/require-returns': 'off',
            'no-magic-numbers': 'off',
            'import/no-default-export': 'off',
            'import/no-relative-parent-imports': 'off'
        },
    },
    {
        files: ['eslint.config.js'],
        rules: {
            // Disable JSDoc requirements for config files
            'jsdoc/require-jsdoc': 'off',
            // Disable import rules for config files
            'import/order': 'off',
            'import/newline-after-import': 'off',
            'import/no-unresolved': 'off',
            'import/no-default-export': 'off',
            // Disable TypeScript specific rules for JS config files
            '@typescript-eslint/explicit-function-return-type': 'off',
            '@typescript-eslint/explicit-module-boundary-types': 'off',
            // Disable other rules for config files
            'no-magic-numbers': 'off',
            'max-lines': 'off',
        },
    },
];

export {eslintConfig as default};
