import { faker } from '@faker-js/faker';

export interface SlashCommandStandard {
  id: string;
  name: string;
  pattern: string;
  description: string;
  createdAt: string;
  isActive: boolean;
}

export interface SlashCommandParseResult {
  command: string;
  parameters: Record<string, string>;
  isValid: boolean;
  errors: string[];
}

export const createStandard = (overrides: Partial<SlashCommandStandard> = {}): SlashCommandStandard => ({
  id: faker.string.uuid(),
  name: faker.word.sample(),
  pattern: `/${faker.word.sample()}`,
  description: faker.lorem.sentence(),
  createdAt: faker.date.recent().toISOString(),
  isActive: true,
  ...overrides,
});

export const createStandards = (count: number): SlashCommandStandard[] =>
  Array.from({ length: count }, () => createStandard());

export const createParseResult = (overrides: Partial<SlashCommandParseResult> = {}): SlashCommandParseResult => ({
  command: faker.helpers.arrayElement(['add', 'remove', 'help']),
  parameters: {},
  isValid: faker.datatype.boolean(),
  errors: [],
  ...overrides,
});