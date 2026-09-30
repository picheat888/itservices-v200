/**
 * Filter state of the Ticket & SLA report, remembered per browser in localStorage
 * (the app's list-filter convention; tabs go in the URL, filters do not).
 *
 * The date range is remembered only when the reader picked it. Left on its default (about a
 * quarter up to today) it is not stored, so it rolls forward with the calendar on the next
 * visit instead of freezing on the day the page was first opened — the same rule the tabular
 * reports follow (use-tabular-filters.ts).
 */
import { useEffect, useState } from 'react';
import type { TicketReportFilters } from '../types';

// v2: the first version stored the default range as fixed dates, so every browser that had
// opened the page kept showing a window that ended on that day. A new key drops those.
const STORAGE_KEY = 'report.tickets-overview.filters.v2';

/** Local YYYY-MM-DD (no UTC shift). */
export function isoDate(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Default window: the first day of the month two months back, through today (≈ one quarter). */
export function defaultTicketReportFilters(today = new Date()): TicketReportFilters {
    return {
        from: isoDate(new Date(today.getFullYear(), today.getMonth() - 2, 1)),
        to: isoDate(today),
        categories: [],
        priority: '',
        department_id: null,
        assignee_id: null,
    };
}

const isDate = (x: unknown) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x);

/** What may come back from storage: every field optional, each checked on its own. */
function fromStorage(value: unknown): Partial<TicketReportFilters> {
    if (!value || typeof value !== 'object') return {};
    const v = value as Record<string, unknown>;
    const idOrNull = (x: unknown) => x === null || typeof x === 'number';
    const kept: Partial<TicketReportFilters> = {};
    if (isDate(v.from) && isDate(v.to)) {
        kept.from = v.from as string;
        kept.to = v.to as string;
    }
    if (Array.isArray(v.categories) && v.categories.every((c) => typeof c === 'string')) kept.categories = v.categories as string[];
    if (typeof v.priority === 'string') kept.priority = v.priority;
    if (idOrNull(v.department_id)) kept.department_id = v.department_id as number | null;
    if (idOrNull(v.assignee_id)) kept.assignee_id = v.assignee_id as number | null;
    return kept;
}

function load(): TicketReportFilters {
    try {
        return { ...defaultTicketReportFilters(), ...fromStorage(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')) };
    } catch {
        return defaultTicketReportFilters();
    }
}

/** The range goes into storage only when it is not today's default. */
export function ticketFiltersToStore(filters: TicketReportFilters, today = new Date()): Partial<TicketReportFilters> {
    const defaults = defaultTicketReportFilters(today);
    const { from, to, ...rest } = filters;
    return from === defaults.from && to === defaults.to ? rest : filters;
}

export function useTicketReportFilters() {
    const [filters, setFilters] = useState<TicketReportFilters>(load);

    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(ticketFiltersToStore(filters)));
        } catch {
            // Storage blocked (private window) — filters still work for this visit.
        }
    }, [filters]);

    const patch = (next: Partial<TicketReportFilters>) => setFilters((f) => ({ ...f, ...next }));
    const reset = () => setFilters(defaultTicketReportFilters());

    return { filters, patch, reset };
}
