import { useT } from '@/lang';
import { type Column, DataTable } from '@/shared/components/data-table';
import { StatusBadge } from '@/shared/components/status-badge';
import type { AssetTicket, TicketPriority, TicketStatus } from '@/shared/types';
import { Wrench } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// Tones + i18n keys mirror the Tickets module's ticket-meta. Kept inline (like
// contract-assets-tab does for asset status) so this module stays independent of
// @/modules/ticket — a barrel import would close an asset ⇄ ticket dependency cycle.
const STATUS_META: Record<TicketStatus, { tone: 'blue' | 'violet' | 'green' | 'gray'; key: string }> = {
    open: { tone: 'blue', key: 'ticket_open' },
    in_progress: { tone: 'violet', key: 'ticket_in_progress' },
    completed: { tone: 'green', key: 'ticket_completed' },
    canceled: { tone: 'gray', key: 'ticket_canceled' },
};

const PRIORITY_META: Record<TicketPriority, { tone: 'red' | 'amber' | 'blue' | 'gray'; key: string }> = {
    critical: { tone: 'red', key: 'ticket_prio_critical' },
    high: { tone: 'amber', key: 'ticket_prio_high' },
    medium: { tone: 'blue', key: 'ticket_prio_medium' },
    low: { tone: 'gray', key: 'ticket_prio_low' },
};

/**
 * Repair-tickets tab: service tickets that reference this asset, rendered as a fill-height
 * table. Clicking a row deep-links into the Tickets module (/tickets?view=<id>).
 */
export function AssetTicketsTab({ tickets, loading }: { tickets: AssetTicket[]; loading?: boolean }) {
    const t = useT();
    const navigate = useNavigate();

    // Empty is a fact about the asset; while its tickets are still loading the
    // table's own loading rows say "not yet" instead.
    if (tickets.length === 0 && !loading) {
        return (
            <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 py-16 text-center text-sm">
                <Wrench className="text-muted-foreground/50 h-8 w-8" />
                <div>{t('asset_tickets_empty')}</div>
                <div className="text-xs">{t('asset_tickets_empty_hint')}</div>
            </div>
        );
    }

    const columns: Column<AssetTicket>[] = [
        {
            key: 'subject',
            header: t('asset_tk_subject'),
            render: (tk) => (
                <div>
                    <span className="text-muted-foreground block font-mono text-[11px]">{tk.ticket_no}</span>
                    <span className="font-medium">{tk.subject}</span>
                </div>
            ),
        },
        { key: 'category', header: t('asset_tk_category'), render: (tk) => <span className="text-sm">{t(`ticket_cat_${tk.category}`)}</span> },
        {
            key: 'priority',
            header: t('asset_tk_priority'),
            render: (tk) =>
                tk.priority ? (
                    <StatusBadge tone={PRIORITY_META[tk.priority].tone}>{t(PRIORITY_META[tk.priority].key)}</StatusBadge>
                ) : (
                    <span className="text-muted-foreground text-sm">—</span>
                ),
        },
        {
            key: 'status',
            header: t('asset_tk_status'),
            render: (tk) => <StatusBadge tone={STATUS_META[tk.status].tone}>{t(STATUS_META[tk.status].key)}</StatusBadge>,
        },
        {
            key: 'created_at',
            header: t('asset_tk_date'),
            render: (tk) => <span className="text-muted-foreground font-mono text-xs">{tk.created_at ?? '—'}</span>,
        },
        { key: 'assignee', header: t('asset_tk_assignee'), render: (tk) => <span className="text-sm">{tk.assignee_name ?? '—'}</span> },
    ];

    return (
        <div className="h-full">
            <DataTable
                fillHeight
                columns={columns}
                rows={tickets}
                rowKey={(tk) => tk.id}
                loading={loading}
                searchable={(tk) => `${tk.ticket_no} ${tk.subject}`}
                onRowClick={(tk) => navigate(`/tickets?view=${tk.id}`)}
            />
        </div>
    );
}
