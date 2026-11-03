// Monitor TV list helpers: pages that fit the list height, cases new since the last board, popup order. Pure for node tests.
import type { MonitorBoard, MonitorGroup, MonitorRow } from '../types.ts';

export type PageEntry = { kind: 'head'; group: MonitorGroup; count: number } | { kind: 'row'; row: MonitorRow };

/** Splits the ordered rows into pages; a group continued on a new page gets its head again. */
export function paginateRows(rows: MonitorRow[], budgetPx = 634, groupPx = 40, rowPx = 84): PageEntry[][] {
    const counts = new Map<MonitorGroup, number>();
    rows.forEach((r) => counts.set(r.group, (counts.get(r.group) ?? 0) + 1));

    const pages: PageEntry[][] = [];
    let page: PageEntry[] = [];
    let used = 0;
    let headOnPage: MonitorGroup | null = null;

    for (const row of rows) {
        const needsHead = headOnPage !== row.group;
        const need = rowPx + (needsHead ? groupPx : 0);
        if (used + need > budgetPx && page.length > 0) {
            pages.push(page);
            page = [];
            used = 0;
            headOnPage = null;
        }
        if (headOnPage !== row.group) {
            page.push({ kind: 'head', group: row.group, count: counts.get(row.group) ?? 0 });
            used += groupPx;
            headOnPage = row.group;
        }
        page.push({ kind: 'row', row });
        used += rowPx;
    }
    if (page.length > 0) pages.push(page);

    return pages;
}

/** Untaken cases absent from the previous board; the first board (no previous) has none. */
export function newArrivals(previousIds: Set<number> | null, board: MonitorBoard): MonitorRow[] {
    if (previousIds === null) return [];
    return board.rows.filter((r) => r.clock === 'response' && !previousIds.has(r.id));
}

/** Least time left first. */
export function popupOrder(rows: MonitorRow[]): MonitorRow[] {
    return [...rows].sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at));
}

/** What moved since the previous board: rows that are new to it, and rows that have just crossed into overdue. */
export function boardChanges(previous: MonitorBoard | null, next: MonitorBoard): { freshIds: number[]; justOverdueIds: number[] } {
    if (previous === null) return { freshIds: [], justOverdueIds: [] };
    const before = new Map(previous.rows.map((r) => [r.id, r.group]));
    return {
        freshIds: next.rows.filter((r) => !before.has(r.id)).map((r) => r.id),
        justOverdueIds: next.rows.filter((r) => r.group === 'overdue' && before.has(r.id) && before.get(r.id) !== 'overdue').map((r) => r.id),
    };
}
