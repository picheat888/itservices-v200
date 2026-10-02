/**
 * "Ticket ค้างและเกิน SLA" — /reports/tickets-backlog
 *
 * Report key tickets.backlog, laid out as the design mockup: the shared tabular body (filters,
 * summary tiles, the server-paged table, export and schedule) plus the page's own parts from
 * components/backlog-board.tsx — the SLA segments at the head of the filter bar in place of the
 * SLA select, the SLA due board with its owner and category cards above the table, and each row
 * striped by its SLA state. Routed by ../routes.tsx.
 */
import { BacklogBoardCards, BacklogSlaSegments, backlogRowClass } from '../components/backlog-board';
import { TabularReportView } from '../components/tabular-report-view';

export default function TicketsBacklogReportPage() {
    return (
        <TabularReportView
            reportKey="tickets.backlog"
            extras={{
                hiddenFilters: ['sla'],
                filterLead: ({ filters, patch }) => <BacklogSlaSegments filters={filters} patch={patch} />,
                beforeTable: ({ filters }) => <BacklogBoardCards filters={filters} />,
                rowClassName: backlogRowClass,
            }}
        />
    );
}
