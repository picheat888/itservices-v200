// A report's filters minus the ones that narrow only part of the page, for that part's request and cache key,
// and how many saved filters narrow the rows (pure, node tests).
import type { TabularFilters } from '../types';

export function withoutFilters(filters: TabularFilters, names: string[]): TabularFilters {
    if (names.length === 0) return filters;
    return Object.fromEntries(Object.entries(filters).filter(([name]) => !names.includes(name)));
}

const DATE_KEYS = new Set(['from', 'to', 'as_of']);

/** View settings saved with a file (every ReportFilter::viewOnly — how a table groups, sorts or shows): no filter to count. */
export const VIEW_KEYS = new Set(['by', 'people_by', 'dept_by', 'dead_days', 'closed', 'sort']);

const isSet = (value: unknown) => value !== null && value !== undefined && value !== '' && !(Array.isArray(value) && value.length === 0);

/** How many saved filters narrow the rows: not the dates, not a view setting, not an empty value. */
export function narrowedFilterCount(filters: Record<string, unknown>): number {
    return Object.entries(filters).filter(([key, value]) => !DATE_KEYS.has(key) && !VIEW_KEYS.has(key) && isSet(value)).length;
}
