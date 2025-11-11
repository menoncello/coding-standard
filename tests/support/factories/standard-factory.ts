import { faker } from '@faker-js/faker';
import { Standard, Rule } from '../../../src/types/mcp.js';

// Type definitions for test data
export interface TestStandard extends Standard {
    createdAt?: Date;
    updatedAt?: Date;
}

export interface CachedStandard extends TestStandard {
    cacheKey: string;
    ttl: number;
    accessCount: number;
    lastAccessed: Date;
}

// Rule factory
export const createRule = (overrides: Partial<Rule> = {}): Rule => ({
    id: faker.string.uuid(),
    description: faker.lorem.sentence(),
    severity: faker.helpers.arrayElement(['error', 'warning', 'info']),
    category: faker.helpers.arrayElement(['naming', 'formatting', 'structure', 'performance', 'security']),
    example: faker.helpers.maybe(() => `function example() { /* ${faker.lorem.words(3)} */ }`),
    ...overrides,
});

// Standard factory
export const createStandard = (overrides: Partial<Standard> = {}): Standard => ({
    id: faker.string.uuid(),
    title: faker.lorem.sentence(),
    description: faker.lorem.paragraphs(2),
    technology: faker.helpers.arrayElement(['typescript', 'javascript', 'python', 'java', 'go']),
    category: faker.helpers.arrayElement(['naming', 'formatting', 'structure', 'performance', 'security', 'best-practices']),
    rules: [createRule()],
    lastUpdated: faker.date.recent().toISOString(),
    ...overrides,
});

export const createStandards = (count: number, overrides: Partial<Standard> = {}): Standard[] =>
    Array.from({ length: count }, () => createStandard(overrides));

export const createCachedStandard = (overrides: Partial<CachedStandard> = {}): CachedStandard => {
    const standard = createStandard(overrides);
    const ttl = faker.number.int({ min: 3600000, max: 86400000 }); // 1h to 24h
    const createdAt = faker.date.recent();

    return {
        ...standard,
        cacheKey: `standards:${standard.technology}:${standard.category}:${faker.string.alphanumeric(8)}`,
        ttl: Date.now() + ttl,
        accessCount: faker.number.int({ min: 1, max: 100 }),
        lastAccessed: faker.date.between({ from: createdAt, to: new Date() }),
        ...overrides,
    };
};

export const createCachedStandards = (count: number, overrides: Partial<CachedStandard> = {}): CachedStandard[] =>
    Array.from({ length: count }, () => createCachedStandard(overrides));

// Specialized factories for test scenarios
export const createTypeScriptStandard = (overrides: Partial<Standard> = {}): Standard =>
    createStandard({
        technology: 'typescript',
        category: faker.helpers.arrayElement(['types', 'interfaces', 'generics', 'modules']),
        ...overrides,
    });

export const createJavaScriptStandard = (overrides: Partial<Standard> = {}): Standard =>
    createStandard({
        technology: 'javascript',
        category: faker.helpers.arrayElement(['functions', 'variables', 'es6', 'async']),
        ...overrides,
    });

export const createNamingStandard = (overrides: Partial<Standard> = {}): Standard =>
    createStandard({
        category: 'naming',
        title: faker.helpers.arrayElement([
            'Variable Naming Convention',
            'Function Naming Pattern',
            'Class Naming Rules',
            'Interface Naming Style',
            'Constant Naming Format'
        ]),
        rules: [
            createRule({
                description: 'Variables should use camelCase and be descriptive',
                severity: 'error',
                category: 'naming',
            })
        ],
        ...overrides,
    });

export const createFormattingStandard = (overrides: Partial<Standard> = {}): Standard =>
    createStandard({
        category: 'formatting',
        title: faker.helpers.arrayElement([
            'Indentation Style',
            'Line Length Limits',
            'Spacing Rules',
            'Brace Placement',
            'Semicolon Usage'
        ]),
        rules: [
            createRule({
                description: 'Use 2 spaces for indentation, not tabs',
                severity: 'warning',
                category: 'formatting',
            })
        ],
        ...overrides,
    });

// Factory for search test scenarios
export const createSearchableStandards = (): Standard[] => [
    createTypeScriptStandard({
        title: 'Interface Naming Convention',
        description: 'Interfaces should use PascalCase and start with I',
        rules: [
            createRule({
                description: 'Interface names must start with I and use PascalCase',
                severity: 'error',
                category: 'naming',
                example: 'interface IUserConfig { ... }'
            })
        ],
    }),
    createTypeScriptStandard({
        title: 'Type Annotations Required',
        description: 'All function parameters must have explicit type annotations',
        rules: [
            createRule({
                description: 'Function parameters must have explicit type annotations',
                severity: 'error',
                category: 'types',
                example: 'function greet(name: string): string { ... }'
            })
        ],
    }),
    createJavaScriptStandard({
        title: 'Function Declaration Style',
        description: 'Use function declarations over function expressions',
        rules: [
            createRule({
                description: 'Prefer function declarations over function expressions',
                severity: 'warning',
                category: 'structure',
                example: 'function calculate() { ... } // not const calculate = () => { ... }'
            })
        ],
    }),
    createNamingStandard({
        title: 'Variable Naming Rules',
        description: 'Variables should use camelCase and be descriptive',
        rules: [
            createRule({
                description: 'Variable names should use camelCase and be descriptive',
                severity: 'error',
                category: 'naming',
                example: 'const userName = "john"; // not const user_name = "john"'
            })
        ],
    }),
    createFormattingStandard({
        title: 'Indentation Guidelines',
        description: 'Use 2 spaces for indentation, not tabs',
        rules: [
            createRule({
                description: 'Use 2 spaces for indentation, never use tabs',
                severity: 'warning',
                category: 'formatting',
                example: 'if (condition) {\n  // code with 2 spaces\n}'
            })
        ],
    }),
];

// Performance test factories
export const createLargeStandardsDataset = (count: number = 1000): Standard[] => {
    const technologies = ['typescript', 'javascript', 'python', 'java', 'go', 'rust', 'csharp'];
    const categories = ['naming', 'formatting', 'structure', 'performance', 'security', 'testing', 'documentation'];

    return Array.from({ length: count }, (_, index) => createStandard({
        title: `Standard ${index + 1}: ${faker.lorem.words(3)}`,
        technology: faker.helpers.arrayElement(technologies),
        category: faker.helpers.arrayElement(categories),
    }));
};

// Database corruption test factories
export const createCorruptedDatabaseState = () => ({
    validRecords: createStandards(5),
    corruptedRecords: [
        { id: 'corrupted-1', data: null, error: 'Invalid JSON' },
        { id: 'corrupted-2', data: undefined, error: 'Missing data' },
        { id: 'corrupted-3', data: 'invalid-binary-data', error: 'Binary corruption' },
    ],
    checksumErrors: [
        { table: 'standards_cache', expected: 'abc123', actual: 'def456' },
        { table: 'standards_fts', expected: 'ghi789', actual: 'jkl012' },
    ],
});

// FTS test factories
export const createFTSTestData = () => ({
    exactMatches: createStandards(3, {
        title: 'TypeScript Interface Naming',
        description: 'Interfaces should follow naming conventions',
        technology: 'typescript',
        category: 'naming',
    }),
    partialMatches: createStandards(3, {
        title: 'General Naming Guidelines',
        description: 'TypeScript interfaces are part of naming rules',
        technology: 'typescript',
        category: 'naming',
    }),
    unrelatedTerms: createStandards(2, {
        title: 'Python Code Style',
        description: 'Python has different naming conventions',
        technology: 'python',
        category: 'formatting',
    }),
});