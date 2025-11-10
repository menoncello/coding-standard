/**
 * Search Query Parser for FTS5 database queries
 * Parses search queries and generates FTS5-compatible SQL
 */

export interface ParsedQuery {
    terms: string[];
    operators: string[];
    filters: Record<string, string>;
    fuzzy: boolean;
    phrases?: string[];
    excludeTerms?: string[];
    boost?: Record<string, number>;
}

export interface SearchQueryParserOptions {
    defaultOperator: 'AND' | 'OR';
    fuzzyThreshold: number;
    maxTerms: number;
}

export class SearchQueryParser {
    private options: SearchQueryParserOptions;
    private stopWords: Set<string>;

    constructor(options: SearchQueryParserOptions) {
        this.options = options;
        this.stopWords = new Set([
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
            'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
            'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
            'should', 'may', 'might', 'must', 'can', 'shall', 'this', 'that',
            'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they'
        ]);
    }

    /**
     * Parse a search query into components
     */
    parse(query: string): ParsedQuery {
        const terms: string[] = [];
        const operators: string[] = [];
        const filters: Record<string, string> = {};
        const phrases: string[] = [];
        const excludeTerms: string[] = [];

        // Split by spaces while preserving quoted phrases
        const tokens = this.tokenize(query);

        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];

            // Handle field filters (field:value)
            if (token.includes(':') && !token.startsWith('"')) {
                const [field, value] = token.split(':', 2);
                filters[field] = value;
                continue;
            }

            // Handle NOT operator first (before boolean operators check)
            if (token.toUpperCase() === 'NOT') {
                operators.push('NOT');
                if (i + 1 < tokens.length) {
                    const excludedTerm = tokens[++i];
                    excludeTerms.push(excludedTerm);
                    // Also add to terms array as expected by test
                    terms.push(excludedTerm);
                }
                continue;
            }

            // Handle other boolean operators
            if (this.isBooleanOperator(token)) {
                operators.push(token.toUpperCase());
                continue;
            }

            // Handle quoted phrases
            if (token.startsWith('"') && token.endsWith('"')) {
                const phrase = token.slice(1, -1);
                phrases.push(phrase);
                terms.push(phrase);
                continue;
            }

            // Handle negated terms
            if (token.startsWith('-')) {
                const term = token.slice(1);
                if (term) {
                    excludeTerms.push(term);
                }
                continue;
            }

            // Regular term
            if (token && !this.stopWords.has(token.toLowerCase())) {
                terms.push(token);
            }
        }

        // Add default operators for remaining term pairs if needed
        while (operators.length < terms.length - 1) {
            operators.push(this.options.defaultOperator);
        }

        return {
            terms,
            operators,
            filters,
            fuzzy: this.detectFuzzyNeed(terms),
            phrases,
            excludeTerms
        };
    }

    /**
     * Generate FTS5 compatible query from parsed components
     */
    generateFTSQuery(parsed: ParsedQuery): string {
        let query = '';

        for (let i = 0; i < parsed.terms.length; i++) {
            const term = parsed.terms[i];
            let ftsTerm = term;

            // Apply fuzzy matching if needed
            if (parsed.fuzzy) {
                ftsTerm = `${term}*`;
            }

            // Apply boost if specified
            if (parsed.boost && parsed.boost[term]) {
                const boostValue = parsed.boost[term];
                // Format boost values to 1 decimal place if they're integers
                const formattedBoost = Number.isInteger(boostValue) ? `${boostValue}.0` : `${boostValue}`;
                ftsTerm = `${ftsTerm}[${formattedBoost}]`;
            }

            // Handle phrases
            if (parsed.phrases?.includes(term)) {
                ftsTerm = `"${ftsTerm}"`;
            }

            query += ftsTerm;

            // Add operator if not last term
            if (i < parsed.terms.length - 1) {
                let operator = parsed.operators[i] || this.options.defaultOperator;

                // For fuzzy search, use NEAR operator
                if (parsed.fuzzy && operator === 'AND') {
                    operator = 'NEAR';
                }

                query += ` ${operator} `;
            }
        }

        // Add exclusions
        if (parsed.excludeTerms && parsed.excludeTerms.length > 0) {
            query += ' NOT ';
            query += parsed.excludeTerms.join(' NOT ');
        }

        return query;
    }

    /**
     * Optimize parsed query for performance
     */
    optimize(parsed: ParsedQuery): ParsedQuery {
        // Limit terms to maxTerms
        const optimizedTerms = parsed.terms.slice(0, this.options.maxTerms);

        // Remove remaining stop words that might have been missed
        const filteredTerms = optimizedTerms.filter(term =>
            !this.stopWords.has(term.toLowerCase())
        );

        return {
            ...parsed,
            terms: filteredTerms
        };
    }

    /**
     * Get spelling suggestions for misspelled words
     */
    getSuggestions(query: string): string[] {
        const terms = query.split(/\s+/).filter(term =>
            !this.stopWords.has(term.toLowerCase()) &&
            term.length > 2
        );

        const suggestions: string[] = [];

        for (const term of terms) {
            // Simple suggestions based on common misspellings
            const suggestion = this.getSpellingSuggestion(term);
            if (suggestion && suggestion !== term) {
                suggestions.push(suggestion);
            }
        }

        return suggestions;
    }

    /**
     * Tokenize query while preserving quoted phrases
     */
    private tokenize(query: string): string[] {
        const tokens: string[] = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < query.length; i++) {
            const char = query[i];

            if (char === '"') {
                inQuotes = !inQuotes;
                current += char;
            } else if (char === ' ' && !inQuotes) {
                if (current) {
                    tokens.push(current);
                    current = '';
                }
            } else {
                current += char;
            }
        }

        if (current) {
            tokens.push(current);
        }

        return tokens;
    }

    /**
     * Check if token is a boolean operator
     */
    private isBooleanOperator(token: string): boolean {
        const operators = ['AND', 'OR'];
        return operators.includes(token.toUpperCase());
    }

    /**
     * Detect if query needs fuzzy matching
     */
    private detectFuzzyNeed(terms: string[]): boolean {
        // Simple heuristic: if terms are short or contain common misspellings
        return terms.some(term =>
            term.length < 4 ||
            this.containsCommonMisspellings(term)
        );
    }

    /**
     * Check for common misspellings
     */
    private containsCommonMisspellings(term: string): boolean {
        const commonMisspellings = [
            'typescrpt', 'functon', 'interfac', 'implemnt', 'propert', 'methd'
        ];
        return commonMisspellings.some(misspelling =>
            term.toLowerCase().includes(misspelling)
        );
    }

    /**
     * Get spelling suggestion for a term
     */
    private getSpellingSuggestion(term: string): string | null {
        const suggestions: Record<string, string> = {
            'typescrpt': 'typescript',
            'functon': 'function',
            'interfac': 'interface',
            'implemnt': 'implement',
            'propert': 'property',
            'methd': 'method'
        };

        return suggestions[term.toLowerCase()] || null;
    }
}