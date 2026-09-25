/**
 * Filter state of a generic tabular report, remembered per browser in localStorage
 * (the app's list-filter convention; tabs go in the URL, filters do not). Keyed per
 * report (`report.${key}.filters`) so different reports don't clobber each other's
 * saved filters — mirrors `use-ticket-report-filters.ts`, generalized to whatever
 * filter set the report's own definition declares.
 *
 * `definition` must already be loaded when this is called — the page only mounts the
 * component that calls this hook once its `useTabularDefinition` query has resolved
 * (and remounts it, via `key={definition.key}`, whenever the reader switches reports).
 * That way the `useState` initialiser below always has a real definition to seed from:
 * no `{}` render, no "seed effect" running a tick after the first fetch already fired
 * with no filters, and no risk of report A's filters bleeding into report B.
 */
import { useEffect, useState } from 'react';
import type { TabularDefinition, TabularFilters } from '../types';

function defaultsFrom(definition: TabularDefinition): TabularFilters {
    const defaults: TabularFilters = {};
    for (const filter of definition.filters) {
        defaults[filter.name] = filter.default;
    }
    return defaults;
}

function isTabularFilters(value: unknown): value is TabularFilters {
    if (!value || typeof value !== 'object') return false;
    return Object.values(value as Record<string, unknown>).every((v) => v === null || typeof v === 'string' || typeof v === 'number');
}

function load(definition: TabularDefinition): TabularFilters {
    try {
        const parsed: unknown = JSON.parse(localStorage.getItem(`report.${definition.key}.filters`) ?? 'null');
        if (!isTabularFilters(parsed)) return defaultsFrom(definition);
        // Drop stored keys the definition no longer has, and seed any new one from its default.
        const known = new Set(definition.filters.map((f) => f.name));
        const kept: TabularFilters = {};
        for (const [k, v] of Object.entries(parsed)) {
            if (known.has(k)) kept[k] = v;
        }
        return { ...defaultsFrom(definition), ...kept };
    } catch {
        return defaultsFrom(definition);
    }
}

export function useTabularFilters(definition: TabularDefinition) {
    const [filters, setFilters] = useState<TabularFilters>(() => load(definition));

    useEffect(() => {
        try {
            localStorage.setItem(`report.${definition.key}.filters`, JSON.stringify(filters));
        } catch {
            // Storage blocked (private window) — filters still work for this visit.
        }
    }, [definition, filters]);

    const patch = (next: TabularFilters) => setFilters((f) => ({ ...f, ...next }));
    const reset = () => setFilters(defaultsFrom(definition));

    return { filters, patch, reset };
}
