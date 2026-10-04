/**
 * Server-paginated ticket rows under the report charts (DataTable `server` mode, shimmer on
 * isLoading || isFetching — the app's server-table standard). Two-line cells keep the subject
 * wide: the ticket number sits under the subject, the department under the requester.
 */
import { useT } from '@/lang';
import { type Column, DataTable } from '@/shared/components/data-table';
import { formatDateTime } from '@/shared/lib/datetime';
import { useUiStore } from '@/stores/ui';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCanOpen } from '../hooks/use-can-open';
import { useTicketOverviewRows } from '../hooks/use-reports';
import type { TicketReportFilters, TicketReportRow } from '../types';
import { TicketPriorityBadge, TicketStatusBadge } from './ticket-badges';
import { categoryKey } from './ticket-labels';

export function TicketReportTable({ filters }: { filters: TicketReportFilters }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(20);
    const { data, isLoading, isFetching } = useTicketOverviewRows(filters, page, perPage);
    const canOpenTickets = useCanOpen()('/tickets');

    const columns: Column<TicketReportRow>[] = [
        {
            key: 'opened',
            header: t('rep_col_opened'),
            width: '140px',
            className: 'whitespace-nowrap',
            render: (r) => <span className="font-mono text-xs">{formatDateTime(r.created_at)}</span>,
        },
        {
            // The one flexible column: subject, with the ticket number (the link) under it.
            key: 'subject',
            header: t('rep_col_subject'),
            render: (r) => (
                <div className="min-w-0">
                    <div className="truncate" title={r.subject}>
                        {r.subject}
                    </div>
                    {canOpenTickets ? (
                        <Link to={`/tickets?view=${r.id}`} className="text-brand font-mono text-xs font-medium hover:underline">
                            {r.ticket_no}
                        </Link>
                    ) : (
                        <span className="text-muted-foreground font-mono text-xs">{r.ticket_no}</span>
                    )}
                </div>
            ),
        },
        {
            // Requester with their department under it.
            key: 'requester',
            header: t('rep_col_requester'),
            width: '170px',
            render: (r) => {
                const name = (lang === 'th' && r.requester_name_th) || r.requester_name || '—';
                const dept = (lang === 'th' && r.department_name_th) || r.department_name;
                return (
                    <div className="min-w-0">
                        <div className="truncate" title={name}>
                            {name}
                        </div>
                        {dept && (
                            <div className="text-muted-foreground truncate text-xs" title={dept}>
                                {dept}
                            </div>
                        )}
                    </div>
                );
            },
        },
        { key: 'cat', header: t('rep_col_category'), width: '110px', render: (r) => (r.category ? t(categoryKey(r.category)) : '—') },
        {
            key: 'prio',
            header: t('rep_col_priority'),
            width: '110px',
            render: (r) => <TicketPriorityBadge priority={r.priority} />,
        },
        {
            key: 'status',
            header: t('rep_col_status'),
            width: '130px',
            render: (r) => <TicketStatusBadge status={r.status} />,
        },
        {
            key: 'source',
            header: t('rep_fl_source'),
            width: '150px',
            className: 'whitespace-nowrap',
            render: (r) => (r.source ? t(`rep_source_${r.source}`) : '—'),
        },
        {
            key: 'assignee',
            header: t('rep_col_assignee'),
            width: '170px',
            className: 'truncate whitespace-nowrap',
            render: (r) => r.assignee_name ?? '—',
        },
        {
            key: 'hours',
            header: t('rep_col_resolve'),
            width: '100px',
            align: 'right',
            render: (r) => <span className="font-mono">{r.resolve_hours === null ? '—' : `${r.resolve_hours} ${t('rep_hours')}`}</span>,
        },
        {
            key: 'sla',
            header: t('rep_col_sla'),
            width: '100px',
            render: (r) =>
                r.sla === 'met' ? (
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">{t('rep_sla_met')}</span>
                ) : r.sla === 'over_sla' ? (
                    <span className="font-semibold text-red-600 dark:text-red-400">{t('rep_sla_over_sla')}</span>
                ) : (
                    '—'
                ),
        },
    ];

    return (
        <DataTable
            columns={columns}
            rows={data?.data ?? []}
            rowKey={(r) => r.id}
            loading={isLoading || isFetching}
            // Fixed columns add up to 1,180px; the floor keeps the subject at least ~230px wide and
            // lets the table scroll sideways on a laptop instead of squeezing the subject to nothing.
            tableClassName="min-w-[1410px]"
            server={{
                page,
                pageSize: perPage,
                total: data?.meta.total ?? 0,
                onPageChange: setPage,
                onPageSizeChange: (s) => {
                    setPerPage(s);
                    setPage(1);
                },
            }}
        />
    );
}
