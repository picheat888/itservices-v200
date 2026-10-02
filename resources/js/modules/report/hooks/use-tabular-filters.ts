/**
 * Filter state of a generic tabular report, remembered per browser in localStorage
 * (the app's list-filter convention) and mirrored into the URL for sharing (below). Keyed per
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
 * The filters also live in the URL, so a link or bookmark opens on exactly what the sender saw:
 * the URL always holds the current ones (dates always, others when off their default),
 * rewritten with `replace` as they change. A URL with any of this report's filters wins outright
 * (missing ones mean their default, not the remembered value); a URL with none (the menu) opens on
 * the remembered ones. Filters that came in a URL are not remembered as the reader's own until
 * they change one — same rules as use-ticket-report-filters.ts. Report Center links add the hub's
 * period as ?from=&to= (report-catalogue.tsx reportRoute).
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

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The filters a URL carries, checked against the definition as stored ones are; null when it
 * carries none of this report's filters. An empty value (`within=`) means "ทั้งหมด" for a
 * filter whose default is not; a missing one means its default.
 */
function fromUrl(definition: TabularDefinition, params: URLSearchParams): TabularFilters | null {
    if (!definition.filters.some((f) => params.has(f.name))) return null;
    const filters = defaultsFrom(definition);
    for (const filter of definition.filters) {
        const value = params.get(filter.name);
        if (value === null) continue;
        if (value === '') {
            filters[filter.name] = null;
        } else if (filter.type === 'date') {
            if (ISO_DATE.test(value)) filters[filter.name] = value;
        } else if (filter.type === 'select') {
            const option = filter.options.find((o) => String(o.value) === value);
            if (option) filters[filter.name] = option.value;
        } else {
            filters[filter.name] = value;
        }
    }
    return filters;
}

/** The filters as URL params: dates always, anything else only when it differs from its default. */
function toUrl(definition: TabularDefinition, filters: TabularFilters): Record<string, string> {
    const out: Record<string, string> = {};
    for (const filter of definition.filters) {
        const value = filters[filter.name];
        if (filter.type === 'date') {
            if (value !== null && value !== undefined && value !== '') out[filter.name] = String(value);
        } else if ((value ?? null) !== filter.default) {
            out[filter.name] = value === null || value === undefined ? '' : String(value);
        }
    }
    return out;
}

export function useTabularFilters(definition: TabularDefinition) {
    const [params, setParams] = useSearchParams();
    // What a link brought, kept so those filters are not saved as the reader's own pick.
    const [linked] = useState(() => fromUrl(definition, params));
    const [filters, setFilters] = useState<TabularFilters>(() => linked ?? load(definition));
    const names = definition.filters.map((f) => f.name);

    // Mirror the filters into the URL so it can be shared or bookmarked as it stands. Only this
    // report's own names are touched — the charts' ?view= and any stray ?from= of a report that
    // has no such filter are left to themselves / cleared.
    useEffect(() => {
        const wanted = toUrl(definition, filters);
        const owned = [...new Set([...names, 'from', 'to'])];
        const current = Object.fromEntries(owned.filter((n) => params.has(n)).map((n) => [n, params.get(n) as string]));
        const sorted = (o: Record<string, string>) =>
            JSON.stringify(
                Object.keys(o)
                    .sort()
                    .map((k) => [k, o[k]]),
            );
        if (sorted(current) === sorted(wanted)) return;
        setParams(
            (next) => {
                owned.forEach((n) => next.delete(n));
                Object.entries(wanted).forEach(([n, v]) => next.set(n, v));
                return next;
            },
            { replace: true },
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps -- names follow the definition
    }, [definition, filters, params, setParams]);

    useEffect(() => {
        // Still exactly what a link brought: leave the reader's remembered filters as they were.
        if (linked !== null && JSON.stringify(toUrl(definition, filters)) === JSON.stringify(toUrl(definition, linked))) return;
        try {
            localStorage.setItem(`report.${definition.key}.filters`, JSON.stringify(toStore(definition, filters)));
        } catch {
            // Storage blocked (private window) — filters still work for this visit.
        }
    }, [definition, filters, linked]);

    const patch = (next: TabularFilters) => setFilters((f) => ({ ...f, ...next }));
    const reset = () => setFilters(defaultsFrom(definition));

    return { filters, patch, reset };
}
