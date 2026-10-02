/**
 * "Ticket ค้างและเกิน SLA" — /reports/tickets-backlog
 *
 * Report key tickets.backlog, laid out as the design mockup: the shared tabular body (filters,
 * summary tiles, the server-paged table, export and schedule) plus the page's own parts from
 * components/backlog-board.tsx — the SLA segments at the head of the filter bar in place of the
 * SLA select, the SLA due board with its owner and category cards above the table (a press on a
 * row filters by that assignee or category), and each row
 * striped by its SLA state. Routed by ../routes.tsx.
 */
import { BacklogBoardCards, BacklogSlaSegments, backlogRowClass } from '../components/backlog-board';
import { TabularReportView } from '../components/tabular-report-view';
import { TicketPriorityBadge, TicketStatusBadge } from '../components/ticket-badges';

/** Priority and status wear the same pills as the Ticket & SLA page's ticket list. */
function backlogCell(key: string, row: Record<string, unknown>) {
    if (key === 'priority') return <TicketPriorityBadge priority={row.priority as string | null} />;
    if (key === 'ticket_status') return <TicketStatusBadge status={row.ticket_status as string | null} />;
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
                rowClassName: backlogRowClass,
                renderCell: backlogCell,
            }}
        />
    );
}
