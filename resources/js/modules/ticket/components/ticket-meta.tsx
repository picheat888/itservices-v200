import { StatusBadge } from '@/shared/components/status-badge';
import type { TicketCategory, TicketPriority, TicketStatus } from '@/shared/types';
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

export function TicketCategoryIcon({ category, className }: { category: TicketCategory; className?: string }) {
    const Icon = CATEGORY_ICON[category];
    return <Icon className={className} />;
}

/** Raw lucide icon for a ticket category — for slots that need the component itself (e.g. FocusDialogHeader). */
export function ticketCategoryIcon(category: TicketCategory): typeof Laptop {
    return CATEGORY_ICON[category];
}
