/**
 * A ticket's priority and status as coloured pills — one look for every report that lists
 * tickets: the Ticket & SLA page's "รายการ Ticket" (ticket-report-table.tsx) and the backlog
 * page's table (pages/tickets-backlog.tsx, through TabularReportExtras.renderCell). Labels come
 * from the ticket module's own keys (ticket-labels.ts); a ticket with no priority shows "—".
 */
import { useT } from '@/lang';
import { StatusBadge } from '@/shared/components/status-badge';
import { priorityKey, statusKey } from './ticket-labels';

export const TICKET_STATUS_TONE: Record<string, 'blue' | 'amber' | 'green' | 'gray'> = {
    open: 'blue',
    in_progress: 'amber',
    completed: 'green',
    canceled: 'gray',
};

export const TICKET_PRIORITY_TONE: Record<string, 'red' | 'amber' | 'blue' | 'gray'> = {
    critical: 'red',
    high: 'amber',
    medium: 'blue',
    low: 'gray',
};

export function TicketPriorityBadge({ priority }: { priority: string | null | undefined }) {
    const t = useT();
    if (!priority) return <>—</>;
    return <StatusBadge tone={TICKET_PRIORITY_TONE[priority]}>{t(priorityKey(priority))}</StatusBadge>;
}

export function TicketStatusBadge({ status }: { status: string | null | undefined }) {
    const t = useT();
    if (!status) return <>—</>;
    return <StatusBadge tone={TICKET_STATUS_TONE[status]}>{t(statusKey(status))}</StatusBadge>;
}
