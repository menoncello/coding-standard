import { faker } from '@faker-js/faker';
import { Standard } from '../../../src/types/mcp.js';

// Cache performance test data factories
export interface CacheTestStandard extends Standard {
    accessFrequency: number;
    lastAccessed: Date;
    cacheHits: number;
    size: number;
    ttl: number;
    priority: 'critical' | 'high' | 'medium' | 'low';
}

export interface CachePerformanceMetrics {
    hitRate: number;
    averageResponseTime: number;
    memoryUsage: number;
    evictionRate: number;
    throughput: number;
}

export interface CacheTestScenario {
    name: string;
    standards: CacheTestStandard[];
    expectedHitRate: number;
    expectedResponseTime: number;
    memoryPressure: boolean;
    description: string;
}

// Cache test standard factory
export const createCacheTestStandard = (overrides: Partial<CacheTestStandard> = {}): CacheTestStandard => ({
    id: faker.string.uuid(),
    title: faker.lorem.sentence(),
    description: faker.lorem.paragraph(),
    technology: faker.helpers.arrayElement(['typescript', 'javascript', 'python', 'java', 'go']),
    category: faker.helpers.arrayElement(['naming', 'formatting', 'structure', 'performance', 'security']),
    rules: [{
        id: faker.string.uuid(),
        description: faker.lorem.sentence(),
        severity: faker.helpers.arrayElement(['error', 'warning', 'info']),
        category: faker.helpers.arrayElement(['naming', 'formatting', 'structure']),
        example: faker.helpers.maybe(() => `function example() { /* ${faker.lorem.words(3)} */ }`)
    }],
    lastUpdated: faker.date.recent().toISOString(),

    // Cache-specific properties
    accessFrequency: faker.number.int({ min: 1, max: 100 }),
    lastAccessed: faker.date.recent(),
    cacheHits: faker.number.int({ min: 0, max: 1000 }),
    size: faker.number.int({ min: 1024, max: 10240 }), // 1KB - 10KB
    ttl: faker.number.int({ min: 60000, max: 3600000 }), // 1 min - 1 hour
    priority: faker.helpers.arrayElement(['critical', 'high', 'medium', 'low']),
    ...overrides,
});

// Create multiple cache test standards
export const createCacheTestStandards = (count: number, overrides: Partial<CacheTestStandard> = {}): CacheTestStandard[] =>
    Array.from({ length: count }, () => createCacheTestStandard(overrides));

// Performance metrics factory
export const createCachePerformanceMetrics = (overrides: Partial<CachePerformanceMetrics> = {}): CachePerformanceMetrics => ({
    hitRate: faker.number.float({ min: 0, max: 100, fractionDigits: 2 }),
    averageResponseTime: faker.number.float({ min: 1, max: 100, fractionDigits: 2 }),
    memoryUsage: faker.number.int({ min: 1024, max: 102400 }), // 1KB - 100KB
    evictionRate: faker.number.float({ min: 0, max: 50, fractionDigits: 2 }),
    throughput: faker.number.int({ min: 100, max: 10000 }),
    ...overrides,
});

// Test scenario factories
export const createHighTrafficScenario = (): CacheTestScenario => {
    const standards = createCacheTestStandards(50, {
        accessFrequency: faker.number.int({ min: 50, max: 100 }),
        priority: faker.helpers.weightedArrayElement([
            { weight: 30, value: 'critical' },
            { weight: 40, value: 'high' },
            { weight: 20, value: 'medium' },
            { weight: 10, value: 'low' }
        ])
    });

    return {
        name: 'High Traffic Load',
        description: 'Simulates high-traffic conditions with many concurrent requests',
        standards,
        expectedHitRate: faker.number.float({ min: 85, max: 95, fractionDigits: 2 }),
        expectedResponseTime: faker.number.float({ min: 15, max: 25, fractionDigits: 2 }),
        memoryPressure: true
    };
};

export const createMemoryPressureScenario = (): CacheTestScenario => {
    const standards = createCacheTestStandards(200, {
        size: faker.number.int({ min: 5120, max: 20480 }), // 5KB - 20KB each
        accessFrequency: faker.number.int({ min: 1, max: 20 })
    });

    return {
        name: 'Memory Pressure Test',
        description: 'Tests cache behavior under memory pressure with frequent evictions',
        standards,
        expectedHitRate: faker.number.float({ min: 60, max: 75, fractionDigits: 2 }),
        expectedResponseTime: faker.number.float({ min: 20, max: 35, fractionDigits: 2 }),
        memoryPressure: true
    };
};

export const createColdStartScenario = (): CacheTestScenario => {
    const criticalStandards = createCacheTestStandards(10, {
        priority: 'critical',
        accessFrequency: faker.number.int({ min: 80, max: 100 })
    });

    const regularStandards = createCacheTestStandards(40, {
        priority: faker.helpers.arrayElement(['high', 'medium', 'low']),
        accessFrequency: faker.number.int({ min: 1, max: 30 })
    });

    return {
        name: 'Cold Start Performance',
        description: 'Tests cache warm-up performance from cold start',
        standards: [...criticalStandards, ...regularStandards],
        expectedHitRate: faker.number.float({ min: 40, max: 60, fractionDigits: 2 }), // Initially low
        expectedResponseTime: faker.number.float({ min: 150, max: 200, fractionDigits: 2 }), // Initially high
        memoryPressure: false
    };
};

export const createSustainedLoadScenario = (): CacheTestScenario => {
    const standards = createCacheTestStandards(100, {
        accessFrequency: faker.helpers.weightedArrayElement([
            { weight: 10, value: 1 },     // 10% rarely accessed
            { weight: 30, value: 25 },    // 30% occasionally
            { weight: 40, value: 50 },    // 40% regularly
            { weight: 20, value: 100 }    // 20% frequently
        ])
    });

    return {
        name: 'Sustained Load Test',
        description: 'Tests cache performance under sustained, realistic load patterns',
        standards,
        expectedHitRate: faker.number.float({ min: 75, max: 90, fractionDigits: 2 }),
        expectedResponseTime: faker.number.float({ min: 10, max: 20, fractionDigits: 2 }),
        memoryPressure: false
    };
};

// Cache configuration factory for testing
export const createCacheConfig = (overrides: any = {}) => ({
    maxMemorySize: 50 * 1024 * 1024, // 50MB
    maxCacheEntries: 1000,
    cacheTTLMilliseconds: 300000, // 5 minutes
    warmupTimeoutMilliseconds: 200,
    performanceMonitorEnabled: true,
    slaThresholds: {
        maxResponseTime: 30,
        minCacheHitRate: 80,
        maxMemoryUsagePercent: 90
    },
    ...overrides,
});

// Access pattern factory
export const createAccessPattern = (standards: CacheTestStandard[]) => {
    const pattern = [];

    // Create weighted access pattern based on frequency
    for (const standard of standards) {
        const accessCount = Math.floor(standard.accessFrequency / 10);
        for (let i = 0; i < accessCount; i++) {
            pattern.push({
                cacheKey: `standards:${standard.technology}:${standard.category}:${standard.id}`,
                standard,
                timestamp: faker.date.recent(),
                operation: faker.helpers.arrayElement(['get', 'set', 'delete'])
            });
        }
    }

    // Shuffle pattern for realistic distribution
    return faker.helpers.shuffleArray(pattern);
};

// Performance benchmark data factory
export const createPerformanceBenchmark = (scenario: CacheTestScenario) => ({
    scenarioName: scenario.name,
    testDuration: 60000, // 1 minute
    concurrentUsers: faker.number.int({ min: 10, max: 100 }),
    requestsPerSecond: faker.number.int({ min: 50, max: 500 }),
    expectedMetrics: {
        p50ResponseTime: scenario.expectedResponseTime * 0.8,
        p90ResponseTime: scenario.expectedResponseTime,
        p95ResponseTime: scenario.expectedResponseTime * 1.2,
        p99ResponseTime: scenario.expectedResponseTime * 1.5,
        hitRate: scenario.expectedHitRate,
        throughput: faker.number.int({ min: 1000, max: 10000 })
    },
    requirements: {
        maxResponseTime: scenario.expectedResponseTime * 1.5,
        minHitRate: scenario.expectedHitRate * 0.9,
        maxMemoryUsage: scenario.memoryPressure ? 90 : 70
    }
});

// SLA violation factory
export const createSLAViolation = (type: 'response_time' | 'hit_rate' | 'memory_usage' | 'throughput') => {
    const baseViolation = {
        timestamp: faker.date.recent(),
        severity: faker.helpers.arrayElement(['warning', 'critical']),
        duration: faker.number.int({ min: 1000, max: 30000 }), // 1s - 30s
        affectedOperations: faker.number.int({ min: 1, max: 100 })
    };

    switch (type) {
        case 'response_time':
            return {
                ...baseViolation,
                type: 'response_time' as const,
                actualValue: faker.number.float({ min: 31, max: 100, fractionDigits: 2 }),
                threshold: 30,
                description: `Response time exceeded 30ms threshold`
            };
        case 'hit_rate':
            return {
                ...baseViolation,
                type: 'hit_rate' as const,
                actualValue: faker.number.float({ min: 0, max: 79, fractionDigits: 2 }),
                threshold: 80,
                description: `Cache hit rate below 80% threshold`
            };
        case 'memory_usage':
            return {
                ...baseViolation,
                type: 'memory_usage' as const,
                actualValue: faker.number.float({ min: 91, max: 100, fractionDigits: 2 }),
                threshold: 90,
                description: `Memory usage above 90% threshold`
            };
        case 'throughput':
            return {
                ...baseViolation,
                type: 'throughput' as const,
                actualValue: faker.number.int({ min: 0, max: 999 }),
                threshold: 1000,
                description: `Throughput below minimum threshold`
            };
        default:
            throw new Error(`Unknown SLA violation type: ${type}`);
    }
};

// Predefined test scenarios
export const CACHE_TEST_SCENARIOS = {
    HIGH_TRAFFIC: createHighTrafficScenario(),
    MEMORY_PRESSURE: createMemoryPressureScenario(),
    COLD_START: createColdStartScenario(),
    SUSTAINED_LOAD: createSustainedLoadScenario()
} as const;