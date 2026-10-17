// A report's filters minus the ones that narrow only part of the page, for that part's request and cache key (pure, node tests).
import type { TabularFilters } from '../types';

export function withoutFilters(filters: TabularFilters, names: string[]): TabularFilters {
    if (names.length === 0) return filters;
    return Object.fromEntries(Object.entries(filters).filter(([name]) => !names.includes(name)));
}
