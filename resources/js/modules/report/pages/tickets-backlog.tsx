/**
 * "Ticket ค้าง และเกิน SLA" — /reports/tickets-backlog
 *
 * Report key tickets.backlog, laid out as the design mockup: the shared tabular body (filters,
 * summary tiles, the server-paged table, export and schedule) plus the page's own parts from
 * components/backlog-board.tsx — the SLA segments at the head of the filter bar in place of the
 * SLA select, the SLA due board with its owner and category cards above the table (a press on a
 * row filters by that assignee or category), and each row
 * striped by its SLA state. Routed by ../routes.tsx.
 */
import { useT } from '@/lang';
import { BacklogBoardCards, BacklogSlaSegments, backlogRowClass } from '../components/backlog-board';
import { TabularReportView } from '../components/tabular-report-view';
import { TicketPriorityBadge, TicketStatusBadge } from '../components/ticket-badges';
import type { TabularFilters } from '../types';

/** "39 วัน" — or "5 ชม." under a day — rather than 39.4 days, as the time-left pills count. */
function AgeCell({ days }: { days: number | null }) {
    const t = useT();
    if (days === null) return <>—</>;
    const text =
        days < 1
            ? t('rep_hours_n').replace('{n}', String(Math.max(1, Math.round(days * 24))))
            : t('rep_days_n').replace('{n}', String(Math.round(days)));
    return <span className="font-mono">{text}</span>;
}

/** The table card names what it holds under the SLA segment pressed: all, over SLA, due within 24 h, not due yet. */
function backlogRowsTitle(filters: TabularFilters) {
    return filters.sla ? `rep_bl_rows_${filters.sla}` : 'rep_bl_rows_title';
}

/** Priority and status wear the same pills as the Ticket & SLA page's ticket list; age reads in days. */
function backlogCell(key: string, row: Record<string, unknown>) {
    if (key === 'priority') return <TicketPriorityBadge priority={row.priority as string | null} />;
    if (key === 'ticket_status') return <TicketStatusBadge status={row.ticket_status as string | null} />;
    if (key === 'age_days') return <AgeCell days={typeof row.age_days === 'number' ? row.age_days : null} />;
    return undefined;
}

export default function TicketsBacklogReportPage() {
    return (
        <TabularReportView
            reportKey="tickets.backlog"
            extras={{
                // SLA has its own segments at the head of the bar; search is off this page for now.
                hiddenFilters: ['sla', 'search'],
                filterLead: ({ filters, patch }) => <BacklogSlaSegments filters={filters} patch={patch} />,
                beforeTable: ({ filters, patch }) => <BacklogBoardCards filters={filters} patch={patch} />,
                rowsTitle: backlogRowsTitle,
                rowClassName: backlogRowClass,
                renderCell: backlogCell,
            }}
        />
    );
}
