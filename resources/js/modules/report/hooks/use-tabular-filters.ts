/**
 * Filter state of a generic tabular report, remembered per browser in localStorage
 * (the app's list-filter convention; tabs go in the URL, filters do not). Keyed per
 * report (`report.${key}.filters`) so different reports don't clobber each other's
 * saved filters — mirrors `use-ticket-report-filters.ts`, generalized to whatever
 * filter set the report's own definition declares.
 */
import { useEffect, useRef, useState } from 'react';
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

export function useTabularFilters(definition?: TabularDefinition) {
    const [filters, setFilters] = useState<TabularFilters>(() => (definition ? load(definition) : {}));
    // Only reseed when the report itself changes (a fresh key) — not on every refetch of
    // the same definition, which would otherwise overwrite whatever the reader just picked.
    const seededKey = useRef<string | null>(definition?.key ?? null);

    useEffect(() => {
        if (!definition || seededKey.current === definition.key) return;
        seededKey.current = definition.key;
        setFilters(load(definition));
    }, [definition]);

    useEffect(() => {
        if (!definition) return;
        try {
            localStorage.setItem(`report.${definition.key}.filters`, JSON.stringify(filters));
        } catch {
            // Storage blocked (private window) — filters still work for this visit.
        }
    }, [definition, filters]);

    const patch = (next: TabularFilters) => setFilters((f) => ({ ...f, ...next }));
    const reset = () => definition && setFilters(defaultsFrom(definition));

    return { filters, patch, reset };
}
