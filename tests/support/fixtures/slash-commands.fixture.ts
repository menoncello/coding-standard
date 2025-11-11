import { test as base } from '@playwright/test';
import { createStandard, createStandards } from '../factories/slash-command-factory';

// Mock Standards Registry for testing
interface MockRegistry {
  standards: Map<string, any>;
  add: (standard: any) => Promise<void>;
  remove: (name: string) => Promise<void>;
  get: (name: string) => Promise<any | null>;
  getAll: () => Promise<any[]>;
  clear: () => void;
}

export const test = base.extend<{
  mockRegistry: MockRegistry;
  testStandards: any[];
}>({
  mockRegistry: async ({}, use) => {
    const standards = new Map();

    const registry: MockRegistry = {
      standards,

      add: async (standard) => {
        standards.set(standard.name, standard);
      },

      remove: async (name) => {
        standards.delete(name);
      },

      get: async (name) => {
        return standards.get(name) || null;
      },

      getAll: async () => {
        return Array.from(standards.values());
      },

      clear: () => {
        standards.clear();
      }
    };

    await use(registry);

    // Cleanup
    registry.clear();
  },

  testStandards: async ({}, use) => {
    const standards = createStandards(3);
    await use(standards);
  },
});