/**
 * Filter state of the Ticket & SLA report — in the URL, so a link or bookmark opens on exactly
 * what the sender saw, and remembered per browser in localStorage for a visit that brings none.
 *
 * - The URL always holds the current filters (?from=&to=, plus categories=a,b / priority /
 *   department_id / assignee_id when set), rewritten with `replace` as they change, so the
 *   address bar can be copied at any moment and Back is not flooded.
 * - A URL with any of them wins outright: missing ones mean "all", not the remembered value,
 *   so a shared link shows the same numbers for everyone. Report Center links use this too
 *   (report-catalogue.tsx reportRoute adds the hub's period).
 * - A URL without any (the menu) opens on the remembered filters.
 * - Filters that came in a URL are not remembered as the reader's own until they change one on
 *   the page; and a date range on its default (about a quarter up to today) is never stored, so
 *   it rolls forward with the calendar — the same rules as the tabular reports
 *   (use-tabular-filters.ts).
 */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
        source: '',
    };
}

/** tickets.source values the "ที่มา" filter takes (App\Enums\Ticket\TicketSource). */
export const TICKET_SOURCES = ['manual', 'auto_request'];
const SOURCES = TICKET_SOURCES;

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
    if (typeof v.source === 'string' && (v.source === '' || SOURCES.includes(v.source))) kept.source = v.source;
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

const URL_NAMES = ['from', 'to', 'categories', 'priority', 'department_id', 'assignee_id', 'source'];
const ID = /^\d+$/;
const SLUG = /^[a-z_]+$/;

/** The filters a URL carries, each checked on its own; null when it carries none. */
function fromUrl(params: URLSearchParams): TicketReportFilters | null {
    if (!URL_NAMES.some((name) => params.has(name))) return null;
    const filters = defaultTicketReportFilters();
    const from = params.get('from');
    const to = params.get('to');
    if (isDate(from) && isDate(to) && (from as string) <= (to as string)) {
        filters.from = from as string;
        filters.to = to as string;
    }
    const categories = (params.get('categories') ?? '').split(',').filter((c) => SLUG.test(c));
    if (categories.length > 0) filters.categories = categories;
    const priority = params.get('priority') ?? '';
    if (SLUG.test(priority)) filters.priority = priority;
    const department = params.get('department_id') ?? '';
    if (ID.test(department)) filters.department_id = Number(department);
    const assignee = params.get('assignee_id') ?? '';
    if (ID.test(assignee)) filters.assignee_id = Number(assignee);
    const source = params.get('source') ?? '';
    if (SOURCES.includes(source)) filters.source = source;
    return filters;
}

/** The filters as URL params: the dates always, the rest only when they narrow the report. */
function toUrl(filters: TicketReportFilters): Record<string, string> {
    const out: Record<string, string> = { from: filters.from, to: filters.to };
    if (filters.categories.length > 0) out.categories = filters.categories.join(',');
    if (filters.priority) out.priority = filters.priority;
    if (filters.department_id !== null) out.department_id = String(filters.department_id);
    if (filters.assignee_id !== null) out.assignee_id = String(filters.assignee_id);
    if (filters.source) out.source = filters.source;
    return out;
}

const sameFilters = (a: TicketReportFilters, b: TicketReportFilters) => JSON.stringify(toUrl(a)) === JSON.stringify(toUrl(b));

export function useTicketReportFilters() {
    const [params, setParams] = useSearchParams();
    // What a link brought, kept so those filters are not saved as the reader's own pick.
    const [linked] = useState(() => fromUrl(params));
    const [filters, setFilters] = useState<TicketReportFilters>(() => linked ?? load());

    // Mirror the filters into the URL so it can be shared or bookmarked as it stands.
    useEffect(() => {
        const wanted = toUrl(filters);
        const current = Object.fromEntries(URL_NAMES.filter((n) => params.has(n)).map((n) => [n, params.get(n) as string]));
        if (JSON.stringify(current) === JSON.stringify(wanted)) return;
        setParams(
            (next) => {
                URL_NAMES.forEach((n) => next.delete(n));
                Object.entries(wanted).forEach(([n, v]) => next.set(n, v));
                return next;
            },
            { replace: true },
        );
    }, [filters, params, setParams]);

    useEffect(() => {
        // Still exactly what a link brought: leave the reader's remembered filters as they were.
        if (linked !== null && sameFilters(filters, linked)) return;
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(ticketFiltersToStore(filters)));
        } catch {
            // Storage blocked (private window) — filters still work for this visit.
        }
    }, [filters, linked]);

    const patch = (next: Partial<TicketReportFilters>) => setFilters((f) => ({ ...f, ...next }));
    const reset = () => setFilters(defaultTicketReportFilters());

    return { filters, patch, reset };
}
