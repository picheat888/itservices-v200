import { StatusBadge } from '@/shared/components/status-badge';
import type { Ticket, TicketCategory, TicketPriority, TicketSlaState, TicketStatus } from '@/shared/types';
import { Code, Laptop, MoreHorizontal, Wifi } from 'lucide-react';

type T = (key: string) => string;

/** Named tone + i18n label for each ticket status. */
export const TICKET_STATUS_META: Record<TicketStatus, { tone: 'blue' | 'violet' | 'green' | 'gray'; key: string }> = {
    open: { tone: 'blue', key: 'ticket_open' },
    in_progress: { tone: 'violet', key: 'ticket_in_progress' },
    completed: { tone: 'green', key: 'ticket_completed' },
    canceled: { tone: 'gray', key: 'ticket_canceled' },
};

export const TICKET_PRIORITY_META: Record<TicketPriority, { tone: 'red' | 'amber' | 'blue' | 'gray'; key: string }> = {
    critical: { tone: 'red', key: 'ticket_prio_critical' },
    high: { tone: 'amber', key: 'ticket_prio_high' },
    medium: { tone: 'blue', key: 'ticket_prio_medium' },
    low: { tone: 'gray', key: 'ticket_prio_low' },
};

export const TICKET_CATEGORIES: TicketCategory[] = ['hardware', 'software', 'network', 'other'];

const CATEGORY_ICON: Record<TicketCategory, typeof Laptop> = {
    hardware: Laptop,
    software: Code,
    network: Wifi,
    other: MoreHorizontal,
};

export function TicketStatusBadge({ status, t, className }: { status: TicketStatus; t: T; className?: string }) {
    const meta = TICKET_STATUS_META[status];
    return (
        <StatusBadge tone={meta.tone} className={className}>
            {t(meta.key)}
        </StatusBadge>
    );
}

export function TicketPriorityBadge({ priority, t, className }: { priority: TicketPriority | null; t: T; className?: string }) {
    if (!priority) return <span className="text-muted-foreground text-sm">—</span>;
    const meta = TICKET_PRIORITY_META[priority];
    return (
        <StatusBadge tone={meta.tone} className={className}>
            {t(meta.key)}
        </StatusBadge>
    );
}

/** Badge tone per SLA state — green while healthy, amber near the target, red past it. */
const SLA_TONE: Record<TicketSlaState, 'green' | 'amber' | 'red' | 'gray'> = {
    on_track: 'green',
    at_risk: 'amber',
    breached: 'red',
    met: 'green',
    missed: 'red',
};

/** The due instant of the clock the ticket is currently running against (response while open, resolution after). */
export function ticketSlaActiveDue(tk: Ticket): string | null {
    if (!tk.sla) return null;
    return tk.status === 'open' && !tk.responded_at ? tk.sla.response_due_at : tk.sla.resolve_due_at;
}

/** Compact "2d 4h" / "35m" duration from minutes — also used by the dashboard KPI cards. */
export function slaDuration(minutes: number, t: T): string {
    return shortDuration(minutes * 60000, t);
}

/** Compact "2d 4h" / "35m" duration from milliseconds (absolute-instant math — timezone plays no part). */
function shortDuration(ms: number, t: T): string {
    const totalMinutes = Math.max(0, Math.round(Math.abs(ms) / 60000));
    const d = Math.floor(totalMinutes / 1440);
    const h = Math.floor((totalMinutes % 1440) / 60);
    const m = totalMinutes % 60;
    if (d > 0) return `${d}${t('ticket_sla_unit_d')} ${h}${t('ticket_sla_unit_h')}`;
    if (h > 0) return `${h}${t('ticket_sla_unit_h')} ${m}${t('ticket_sla_unit_m')}`;
    return `${m}${t('ticket_sla_unit_m')}`;
}

/**
 * Live SLA chip for one ticket: time left (or overdue) against the active clock,
 * or the final met/missed verdict once completed. Canceled tickets show a dash.
 */
export function TicketSlaBadge({ ticket, t, className }: { ticket: Ticket; t: T; className?: string }) {
    const sla = ticket.sla;
    if (!sla) return <span className="text-muted-foreground text-sm">—</span>;

    let label: string;
    if (sla.state === 'met') {
        label = t('ticket_sla_met_badge');
    } else if (sla.state === 'missed') {
        label = t('ticket_sla_missed_badge');
    } else {
        const due = ticketSlaActiveDue(ticket);
        const remain = due ? shortDuration(Date.parse(due) - Date.now(), t) : '';
        label = (sla.state === 'breached' ? t('ticket_sla_overdue') : t('ticket_sla_left')).replace('{t}', remain);
    }

    return (
        <StatusBadge tone={SLA_TONE[sla.state]} className={className}>
            {label}
        </StatusBadge>
    );
}

export function TicketCategoryIcon({ category, className }: { category: TicketCategory; className?: string }) {
    const Icon = CATEGORY_ICON[category];
    return <Icon className={className} />;
}

/** Raw lucide icon for a ticket category — for slots that need the component itself (e.g. FocusDialogHeader). */
export function ticketCategoryIcon(category: TicketCategory): typeof Laptop {
    return CATEGORY_ICON[category];
}
