import { StandardRule, SearchQuery, SearchResult, SortOptions, PaginationOptions } from './types.js';
import { CacheManager } from '../cache/cache-manager.js';

/**
 * Handles semantic name resolution and search functionality
 */
export class SemanticNamingService {
    private cache: CacheManager<SearchResult[]>;
    private readonly fuzzyThreshold = 0.6;
    private readonly maxSearchResults = 10000; // Increased for performance testing

    constructor(cacheConfig?: { ttl: number; maxSize: number }) {
        this.cache = new CacheManager({
            ttl: cacheConfig?.ttl || 5 * 60 * 1000, // 5 minutes default
            maxSize: cacheConfig?.maxSize || 1000
        });
    }

    /**
     * Resolve a semantic name to a standard rule
     */
    async resolveSemanticName(
        semanticName: string,
        rules: StandardRule[],
        useCache: boolean = true
    ): Promise<StandardRule | null> {
        const cacheKey = `resolve:${semanticName}`;

        if (useCache) {
            const cached = this.cache.get(cacheKey);
            if (cached && cached.length > 0) {
                return cached[0].rule;
            }
        }

        // Exact match first
        const exactMatch = rules.find(rule => rule.semanticName === semanticName);
        if (exactMatch) {
            if (useCache) {
                this.cache.set(cacheKey, [{ rule: exactMatch, relevance: 1.0, matchType: 'exact', matchedFields: ['semanticName'] }]);
            }
            return exactMatch;
        }

        // Check aliases
        const aliasMatch = rules.find(rule => rule.aliases.includes(semanticName));
        if (aliasMatch) {
            if (useCache) {
                this.cache.set(cacheKey, [{ rule: aliasMatch, relevance: 0.95, matchType: 'semantic', matchedFields: ['aliases'] }]);
            }
            return aliasMatch;
        }

        // Fuzzy match on semantic name
        const fuzzyMatch = this.findBestFuzzyMatch(semanticName, rules.map(rule => rule.semanticName));
        if (fuzzyMatch && fuzzyMatch.similarity >= this.fuzzyThreshold) {
            const rule = rules.find(rule => rule.semanticName === fuzzyMatch.match);
            if (rule) {
                if (useCache) {
                    this.cache.set(cacheKey, [{ rule, relevance: fuzzyMatch.similarity, matchType: 'fuzzy', matchedFields: ['semanticName'] }]);
                }
                return rule;
            }
        }

        // Fuzzy match on display name
        const displayNameMatch = this.findBestFuzzyMatch(semanticName, rules.map(rule => rule.displayName.toLowerCase()));
        if (displayNameMatch && displayNameMatch.similarity >= this.fuzzyThreshold) {
            const rule = rules.find(rule => rule.displayName.toLowerCase() === displayNameMatch.match);
            if (rule) {
                if (useCache) {
                    this.cache.set(cacheKey, [{ rule, relevance: displayNameMatch.similarity * 0.9, matchType: 'fuzzy', matchedFields: ['displayName'] }]);
                }
                return rule;
            }
        }

        return null;
    }

    /**
     * Search for rules based on query and filters
     */
    async searchRules(
        query: SearchQuery,
        rules: StandardRule[],
        sort?: SortOptions,
        pagination?: PaginationOptions,
        useCache: boolean = true
    ): Promise<{ results: SearchResult[]; total: number }> {
        const cacheKey = this.createSearchCacheKey(query, sort, pagination);

        if (useCache) {
            const cached = this.cache.get(cacheKey);
            if (cached) {
                return { results: cached, total: cached.length };
            }
        }

        let filteredRules = [...rules];

        // Apply filters
        if (query.category) {
            filteredRules = filteredRules.filter(rule => rule.category === query.category);
        }

        if (query.technology) {
            filteredRules = filteredRules.filter(rule => rule.technology.toLowerCase() === query.technology!.toLowerCase());
        }

        if (query.severity && query.severity.length > 0) {
            filteredRules = filteredRules.filter(rule => query.severity!.includes(rule.severity));
        }

        if (query.tags && query.tags.length > 0) {
            filteredRules = filteredRules.filter(rule =>
                query.tags!.some(tag => rule.tags.includes(tag))
            );
        }

        if (!query.includeDeprecated) {
            filteredRules = filteredRules.filter(rule => !rule.deprecated);
        }

        // Text search
        let searchResults: SearchResult[] = [];
        if (query.query) {
            searchResults = this.performTextSearch(query.query, filteredRules, query.fuzzy !== false);
        } else {
            // If no query, return all filtered rules with high relevance
            searchResults = filteredRules.map(rule => ({
                rule,
                relevance: 1.0,
                matchType: 'exact' as const,
                matchedFields: []
            }));
        }

        // Sort results
        if (sort) {
            searchResults = this.sortResults(searchResults, sort);
        } else {
            // Default sort by relevance (descending)
            searchResults.sort((a, b) => b.relevance - a.relevance);
        }

        // Apply pagination
        const total = searchResults.length;
        if (pagination) {
            const start = pagination.offset;
            const end = start + pagination.limit;
            searchResults = searchResults.slice(start, end);
        } else if (query.limit) {
            searchResults = searchResults.slice(0, query.limit);
        } else if (searchResults.length > this.maxSearchResults) {
            searchResults = searchResults.slice(0, this.maxSearchResults);
        }

        // Cache results
        if (useCache) {
            this.cache.set(cacheKey, searchResults);
        }

        return { results: searchResults, total };
    }

    /**
     * Get suggestions for semantic names based on partial input
     */
    async getSemanticNameSuggestions(
        partial: string,
        rules: StandardRule[],
        limit: number = 10,
        useCache: boolean = true
    ): Promise<string[]> {
        const cacheKey = `suggestions:${partial}:${limit}`;

        if (useCache) {
            const cached = this.cache.get(cacheKey);
            if (cached) {
                return cached.map(result => result.rule.semanticName);
            }
        }

        const suggestions: string[] = [];

        // Exact semantic name matches
        const exactMatches = rules
            .filter(rule => rule.semanticName.startsWith(partial.toLowerCase()))
            .map(rule => rule.semanticName);

        suggestions.push(...exactMatches);

        // Display name matches
        const displayNameMatches = rules
            .filter(rule => rule.displayName.toLowerCase().includes(partial.toLowerCase()))
            .map(rule => rule.semanticName);

        suggestions.push(...displayNameMatches);

        // Description matches
        const descriptionMatches = rules
            .filter(rule => rule.description.toLowerCase().includes(partial.toLowerCase()))
            .map(rule => rule.semanticName);

        suggestions.push(...descriptionMatches);

        // Remove duplicates and limit
        const uniqueSuggestions = [...new Set(suggestions)].slice(0, limit);

        // Cache suggestions
        if (useCache) {
            const suggestionResults = uniqueSuggestions.map(semanticName => {
                const rule = rules.find(r => r.semanticName === semanticName);
                return rule ? {
                    rule,
                    relevance: 1.0,
                    matchType: 'exact' as const,
                    matchedFields: []
                } : null;
            }).filter(Boolean) as SearchResult[];

            this.cache.set(cacheKey, suggestionResults);
        }

        return uniqueSuggestions;
    }

    /**
     * Find related rules based on a given rule
     */
    async findRelatedRules(
        rule: StandardRule,
        rules: StandardRule[],
        limit: number = 5,
        useCache: boolean = true
    ): Promise<SearchResult[]> {
        const cacheKey = `related:${rule.id}:${limit}`;

        if (useCache) {
            const cached = this.cache.get(cacheKey);
            if (cached) {
                return cached;
            }
        }

        const related: SearchResult[] = [];
        const otherRules = rules.filter(r => r.id !== rule.id);

        // Find rules with same category
        const sameCategory = otherRules.filter(r => r.category === rule.category);
        for (const relatedRule of sameCategory) {
            related.push({
                rule: relatedRule,
                relevance: 0.8,
                matchType: 'semantic',
                matchedFields: ['category']
            });
        }

        // Find rules with same technology
        const sameTechnology = otherRules.filter(r => r.technology === rule.technology);
        for (const relatedRule of sameTechnology) {
            const existing = related.find(r => r.rule.id === relatedRule.id);
            if (existing) {
                existing.relevance = Math.max(existing.relevance, 0.7);
                if (!existing.matchedFields.includes('technology')) {
                    existing.matchedFields.push('technology');
                }
            } else {
                related.push({
                    rule: relatedRule,
                    relevance: 0.7,
                    matchType: 'semantic',
                    matchedFields: ['technology']
                });
            }
        }

        // Find rules with shared tags
        const sharedTagRules = otherRules.filter(r =>
            r.tags.some(tag => rule.tags.includes(tag))
        );
        for (const relatedRule of sharedTagRules) {
            const existing = related.find(r => r.rule.id === relatedRule.id);
            if (existing) {
                const sharedTags = relatedRule.tags.filter(tag => rule.tags.includes(tag));
                existing.relevance = Math.max(existing.relevance, 0.5 + (sharedTags.length * 0.1));
                if (!existing.matchedFields.includes('tags')) {
                    existing.matchedFields.push('tags');
                }
            } else {
                const sharedTags = relatedRule.tags.filter(tag => rule.tags.includes(tag));
                related.push({
                    rule: relatedRule,
                    relevance: 0.5 + (sharedTags.length * 0.1),
                    matchType: 'semantic',
                    matchedFields: ['tags']
                });
            }
        }

        // Find rules with related patterns (similar complexity or structure)
        for (const relatedRule of otherRules) {
            if (this.arePatternsRelated(rule.pattern, relatedRule.pattern)) {
                const existing = related.find(r => r.rule.id === relatedRule.id);
                if (existing) {
                    existing.relevance = Math.max(existing.relevance, 0.4);
                    if (!existing.matchedFields.includes('pattern')) {
                        existing.matchedFields.push('pattern');
                    }
                } else {
                    related.push({
                        rule: relatedRule,
                        relevance: 0.4,
                        matchType: 'semantic',
                        matchedFields: ['pattern']
                    });
                }
            }
        }

        // Sort by relevance and limit
        related.sort((a, b) => b.relevance - a.relevance);
        const results = related.slice(0, limit);

        // Cache results
        if (useCache) {
            this.cache.set(cacheKey, results);
        }

        return results;
    }

    /**
     * Clear the search cache
     */
    clearCache(): void {
        this.cache.clear();
    }

    /**
     * Get cache statistics
     */
    getCacheStats() {
        return this.cache.getStats();
    }

    /**
     * Perform text search on rules
     */
    private performTextSearch(query: string, rules: StandardRule[], fuzzy: boolean = true): SearchResult[] {
        const normalizedQuery = query.toLowerCase().trim();
        const results: SearchResult[] = [];

        for (const rule of rules) {
            const searchFields = [
                { name: 'semanticName', value: rule.semanticName, weight: 1.0 },
                { name: 'displayName', value: rule.displayName, weight: 0.9 },
                { name: 'description', value: rule.description, weight: 0.7 },
                { name: 'aliases', value: rule.aliases.join(' '), weight: 0.8 },
                { name: 'tags', value: rule.tags.join(' '), weight: 0.6 },
                { name: 'category', value: rule.category, weight: 0.5 },
                { name: 'technology', value: rule.technology, weight: 0.5 }
            ];

            let bestMatch = { relevance: 0, matchedFields: [] as string[] };

            for (const field of searchFields) {
                const fieldValue = field.value.toLowerCase();

                // Exact match
                if (fieldValue === normalizedQuery) {
                    bestMatch.relevance = Math.max(bestMatch.relevance, field.weight);
                    if (!bestMatch.matchedFields.includes(field.name)) {
                        bestMatch.matchedFields.push(field.name);
                    }
                    continue;
                }

                // Contains match
                if (fieldValue.includes(normalizedQuery)) {
                    bestMatch.relevance = Math.max(bestMatch.relevance, field.weight * 0.8);
                    if (!bestMatch.matchedFields.includes(field.name)) {
                        bestMatch.matchedFields.push(field.name);
                    }
                    continue;
                }

                // Word matches
                const queryWords = normalizedQuery.split(/\s+/);
                const fieldWords = fieldValue.split(/\s+/);
                const wordMatches = queryWords.filter(word =>
                    fieldWords.some(fieldWord => fieldWord.includes(word))
                );

                if (wordMatches.length > 0) {
                    const wordRelevance = (wordMatches.length / queryWords.length) * field.weight * 0.6;
                    bestMatch.relevance = Math.max(bestMatch.relevance, wordRelevance);
                    if (!bestMatch.matchedFields.includes(field.name)) {
                        bestMatch.matchedFields.push(field.name);
                    }
                }

                // Fuzzy match
                if (fuzzy && fieldValue.length > 3) {
                    const similarity = this.calculateStringSimilarity(normalizedQuery, fieldValue);
                    if (similarity >= this.fuzzyThreshold) {
                        const fuzzyRelevance = similarity * field.weight * 0.5;
                        bestMatch.relevance = Math.max(bestMatch.relevance, fuzzyRelevance);
                        if (!bestMatch.matchedFields.includes(field.name)) {
                            bestMatch.matchedFields.push(field.name);
                        }
                    }
                }
            }

            if (bestMatch.relevance > 0) {
                results.push({
                    rule,
                    relevance: bestMatch.relevance,
                    matchType: bestMatch.relevance >= 0.9 ? 'exact' :
                              bestMatch.relevance >= 0.7 ? 'semantic' : 'fuzzy',
                    matchedFields: bestMatch.matchedFields
                });
            }
        }

        return results;
    }

    /**
     * Find best fuzzy match using Levenshtein distance
     */
    private findBestFuzzyMatch(target: string, candidates: string[]): { match: string; similarity: number } | null {
        let bestMatch: { match: string; similarity: number } | null = null;
        const normalizedTarget = target.toLowerCase();

        for (const candidate of candidates) {
            const normalizedCandidate = candidate.toLowerCase();
            const similarity = this.calculateStringSimilarity(normalizedTarget, normalizedCandidate);

            if (!bestMatch || similarity > bestMatch.similarity) {
                bestMatch = { match: candidate, similarity };
            }
        }

        return bestMatch && bestMatch.similarity >= this.fuzzyThreshold ? bestMatch : null;
    }

    /**
     * Calculate string similarity using Jaro-Winkler distance
     */
    private calculateStringSimilarity(s1: string, s2: string): number {
        if (s1 === s2) return 1.0;
        if (s1.length === 0 || s2.length === 0) return 0.0;

        const matchWindow = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
        const s1Matches = new Array(s1.length).fill(false);
        const s2Matches = new Array(s2.length).fill(false);

        let matches = 0;
        let transpositions = 0;

        // Find matches
        for (let i = 0; i < s1.length; i++) {
            const start = Math.max(0, i - matchWindow);
            const end = Math.min(i + matchWindow + 1, s2.length);

            for (let j = start; j < end; j++) {
                if (!s2Matches[j] && s1[i] === s2[j]) {
                    s1Matches[i] = true;
                    s2Matches[j] = true;
                    matches++;
                    break;
                }
            }
        }

        if (matches === 0) return 0.0;

        // Count transpositions
        let k = 0;
        for (let i = 0; i < s1.length; i++) {
            if (s1Matches[i]) {
                while (!s2Matches[k]) {
                    k++;
                }
                if (s1[i] !== s2[k]) {
                    transpositions++;
                }
                k++;
            }
        }

        const jaro = (matches / s1.length + matches / s2.length + (matches - transpositions / 2) / matches) / 3;

        // Jaro-Winkler enhancement
        let prefixLength = 0;
        const maxPrefixLength = 4;
        while (prefixLength < maxPrefixLength &&
               s1[prefixLength] === s2[prefixLength]) {
            prefixLength++;
        }

        return jaro + (0.1 * prefixLength * (1 - jaro));
    }

    /**
     * Check if two regex patterns are related
     */
    private arePatternsRelated(pattern1: string, pattern2: string): boolean {
        // Simple pattern relation detection - can be enhanced
        const tokens1 = pattern1.split(/[\[\]\(\)\{\}\.\?\*\+\|\^\\]/).filter(t => t.length > 0);
        const tokens2 = pattern2.split(/[\[\]\(\)\{\}\.\?\*\+\|\^\\]/).filter(t => t.length > 0);

        // If patterns share significant tokens, consider them related
        const commonTokens = tokens1.filter(token => tokens2.includes(token));
        return commonTokens.length >= Math.min(tokens1.length, tokens2.length) * 0.3;
    }

    /**
     * Sort search results
     */
    private sortResults(results: SearchResult[], sort: SortOptions): SearchResult[] {
        const { field, order } = sort;

        return results.sort((a, b) => {
            let valueA: string | number;
            let valueB: string | number;

            switch (field) {
                case 'semanticName':
                    valueA = a.rule.semanticName;
                    valueB = b.rule.semanticName;
                    break;
                case 'displayName':
                    valueA = a.rule.displayName;
                    valueB = b.rule.displayName;
                    break;
                case 'category':
                    valueA = a.rule.category;
                    valueB = b.rule.category;
                    break;
                case 'technology':
                    valueA = a.rule.technology;
                    valueB = b.rule.technology;
                    break;
                case 'severity':
                    const severityOrder = { 'error': 3, 'warning': 2, 'info': 1 };
                    valueA = severityOrder[a.rule.severity];
                    valueB = severityOrder[b.rule.severity];
                    break;
                case 'createdAt':
                    valueA = a.rule.metadata.createdAt;
                    valueB = b.rule.metadata.createdAt;
                    break;
                case 'updatedAt':
                    valueA = a.rule.metadata.updatedAt;
                    valueB = b.rule.metadata.updatedAt;
                    break;
                default:
                    // Default to relevance sorting
                    valueA = a.relevance;
                    valueB = b.relevance;
            }

            if (typeof valueA === 'string' && typeof valueB === 'string') {
                const comparison = valueA.localeCompare(valueB);
                return order === 'desc' ? -comparison : comparison;
            }

            const comparison = (valueA as number) - (valueB as number);
            return order === 'desc' ? -comparison : comparison;
        });
    }

    /**
     * Create cache key for search
     */
    private createSearchCacheKey(query: SearchQuery, sort?: SortOptions, pagination?: PaginationOptions): string {
        const keyParts = [
            'search',
            JSON.stringify(query),
            sort ? `${sort.field}:${sort.order}` : 'default',
            pagination ? `${pagination.offset}:${pagination.limit}` : 'no-pagination'
        ];
        return keyParts.join('|');
    }
}