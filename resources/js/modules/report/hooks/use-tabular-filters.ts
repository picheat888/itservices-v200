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
 * A link from the Report Center carries its period as ?from=&to= (report-catalogue.tsx
 * reportRoute). A report with both a `from` and a `to` filter opens on those dates for this
 * visit; they are taken off the URL (by every report, so none keeps a stray query) and are not
 * remembered as the reader's pick unless they change the dates on the page.
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

/** The dates a Report Center link brought — only for a report that has both, and in order. */
function fromLink(definition: TabularDefinition, params: URLSearchParams): { from: string; to: string } | null {
    const names = new Set(definition.filters.filter((f) => f.type === 'date').map((f) => f.name));
    const from = params.get('from') ?? '';
    const to = params.get('to') ?? '';
    if (!names.has('from') || !names.has('to') || !ISO_DATE.test(from) || !ISO_DATE.test(to) || from > to) return null;
    return { from, to };
}

export function useTabularFilters(definition: TabularDefinition) {
    const [params, setParams] = useSearchParams();
    const [linked] = useState(() => fromLink(definition, params));
    const [filters, setFilters] = useState<TabularFilters>(() => ({ ...load(definition), ...(linked ?? {}) }));

    // Once read, the link's dates leave the URL — a reload shows what the reader has since picked.
    useEffect(() => {
        if (!params.has('from') && !params.has('to')) return;
        setParams(
            (next) => {
                next.delete('from');
                next.delete('to');
                return next;
            },
            { replace: true },
        );
    }, [params, setParams]);

    useEffect(() => {
        const key = `report.${definition.key}.filters`;
        let stored = toStore(definition, filters);
        // Still on the dates the link brought: remember everything else, keep the old dates.
        if (linked !== null && filters.from === linked.from && filters.to === linked.to) {
            const previous = load(definition);
            stored = toStore(definition, { ...filters, from: previous.from, to: previous.to });
        }
        try {
            localStorage.setItem(key, JSON.stringify(stored));
        } catch {
            // Storage blocked (private window) — filters still work for this visit.
        }
    }, [definition, filters, linked]);

    const patch = (next: TabularFilters) => setFilters((f) => ({ ...f, ...next }));
    const reset = () => setFilters(defaultsFrom(definition));

    return { filters, patch, reset };
}
