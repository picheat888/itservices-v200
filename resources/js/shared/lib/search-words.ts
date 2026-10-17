// Client-side search with the server's rules (App\Support\SearchTerms): every word must be found, in any order.
// Dependency-free on purpose: node tests load it directly.

const MAX_WORDS = 6;
const MAX_LENGTH = 100;

/** The distinct lowercase words of a search, at most six; zero-width dropped and spaces collapsed like the server. */
export function searchWords(search: string): string[] {
    const cleaned = search
        .replace(/[​-‍⁠﻿]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_LENGTH)
        .toLowerCase();
    if (cleaned === '') return [];
    return [...new Set(cleaned.split(' '))].slice(0, MAX_WORDS);
}

/** Whether every word of `search` appears somewhere in `haystack`; an empty search matches everything. */
export function matchesAllWords(haystack: string, search: string): boolean {
    const words = searchWords(search);
    if (words.length === 0) return true;
    const text = haystack.toLowerCase();
    return words.every((word) => text.includes(word));
}
