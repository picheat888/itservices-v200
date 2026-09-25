/**
 * Filter state of the Ticket & SLA report, remembered per browser in localStorage
 * (the app's list-filter convention; tabs go in the URL, filters do not).
 */
import { useEffect, useState } from 'react';
import type { TicketReportFilters } from '../types';

const STORAGE_KEY = 'report.tickets-overview.filters';

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

function isFilters(value: unknown): value is TicketReportFilters {
    if (!value || typeof value !== 'object') return false;
    const v = value as Record<string, unknown>;
    const date = (x: unknown) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x);
    const idOrNull = (x: unknown) => x === null || typeof x === 'number';
    return (
        date(v.from) &&
        date(v.to) &&
        Array.isArray(v.categories) &&
        v.categories.every((c) => typeof c === 'string') &&
        typeof v.priority === 'string' &&
        idOrNull(v.department_id) &&
        idOrNull(v.assignee_id)
    );
}

function load(): TicketReportFilters {
    try {
        const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
        return isFilters(parsed) ? parsed : defaultTicketReportFilters();
    } catch {
        return defaultTicketReportFilters();
    }
}

export function useTicketReportFilters() {
    const [filters, setFilters] = useState<TicketReportFilters>(load);

    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
        } catch {
            // Storage blocked (private window) — filters still work for this visit.
        }
    }, [filters]);

    const patch = (next: Partial<TicketReportFilters>) => setFilters((f) => ({ ...f, ...next }));
    const reset = () => setFilters(defaultTicketReportFilters());

    return { filters, patch, reset };
}
