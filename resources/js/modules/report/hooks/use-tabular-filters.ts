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
 *
 * A link may hand a report its starting filters in the query string (the Ticket & SLA
 * page's "ดูทั้งหมด" → `/reports/r/tickets.staff_performance?from=…&to=…`). Those win over
 * the remembered ones, are checked against the definition like stored values are, and are
 * then taken off the URL — filters still live in localStorage, not the address bar.
 */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
        const byName = new Map(definition.filters.map((f) => [f.name, f]));
        const kept: TabularFilters = {};
        for (const [k, v] of Object.entries(parsed)) {
            const filter = byName.get(k);
            if (!filter) continue;
            // A select filter's stored value may point at an option that no longer exists
            // (master data renamed/removed, or the enum changed) — fall back to its default
            // rather than sending the request a value the server would reject.
            // Compared as strings: the select hands back "4" while master-data options carry 4.
            if (filter.type === 'select' && v !== null && !filter.options.some((o) => String(o.value) === String(v))) continue;
            kept[k] = v;
        }
        return { ...defaultsFrom(definition), ...kept };
    } catch {
        return defaultsFrom(definition);
    }
}

/**
 * Filters a link put in the query string, kept only where the definition has that filter
 * and the value is one it would take: a real YYYY-MM-DD for a date, an offered option for
 * a select. Anything else is ignored rather than sent on to a 422.
 */
function fromUrl(definition: TabularDefinition, params: URLSearchParams): TabularFilters {
    const given: TabularFilters = {};
    for (const filter of definition.filters) {
        const value = params.get(filter.name);
        if (value === null || value === '') continue;
        if (filter.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) continue;
        if (filter.type === 'select' && !filter.options.some((o) => String(o.value) === value)) continue;
        given[filter.name] = value;
    }
    return given;
}

/**
 * What gets remembered. A date filter still on its default ("today", "start of this month")
 * is left out so it rolls forward with the calendar on the next visit instead of freezing
 * on the day it was first opened; a date the reader picked is kept.
 */
function toStore(definition: TabularDefinition, filters: TabularFilters): TabularFilters {
    const stored: TabularFilters = { ...filters };
    for (const filter of definition.filters) {
        if (filter.type === 'date' && stored[filter.name] === filter.default) delete stored[filter.name];
    }
    return stored;
}

export function useTabularFilters(definition: TabularDefinition) {
    const [searchParams, setSearchParams] = useSearchParams();
    const [filters, setFilters] = useState<TabularFilters>(() => ({ ...load(definition), ...fromUrl(definition, searchParams) }));

    // Once seeded, the link's filters leave the URL, so a reload shows what the reader has
    // picked since rather than snapping back to what the link carried.
    useEffect(() => {
        const names = definition.filters.map((f) => f.name).filter((name) => searchParams.has(name));
        if (names.length === 0) return;
        setSearchParams(
            (params) => {
                names.forEach((name) => params.delete(name));
                return params;
            },
            { replace: true },
        );
    }, [definition, searchParams, setSearchParams]);

    useEffect(() => {
        try {
            localStorage.setItem(`report.${definition.key}.filters`, JSON.stringify(toStore(definition, filters)));
        } catch {
            // Storage blocked (private window) — filters still work for this visit.
        }
    }, [definition, filters]);

    const patch = (next: TabularFilters) => setFilters((f) => ({ ...f, ...next }));
    const reset = () => setFilters(defaultsFrom(definition));

    return { filters, patch, reset };
}
