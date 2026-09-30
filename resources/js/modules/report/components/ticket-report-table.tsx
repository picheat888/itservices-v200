/**
 * Server-paginated ticket rows under the report charts (DataTable `server` mode, shimmer on
 * isLoading || isFetching — the app's server-table standard).
 */
import { useT } from '@/lang';
import { type Column, DataTable } from '@/shared/components/data-table';
import { StatusBadge } from '@/shared/components/status-badge';
import { useUiStore } from '@/stores/ui';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCanOpen } from '../hooks/use-can-open';
import { useTicketOverviewRows } from '../hooks/use-reports';
import type { TicketReportFilters, TicketReportRow } from '../types';
import { categoryKey, priorityKey, statusKey } from './ticket-labels';

const STATUS_TONE: Record<string, 'blue' | 'amber' | 'green' | 'gray'> = { open: 'blue', in_progress: 'amber', completed: 'green', canceled: 'gray' };
const PRIORITY_TONE: Record<string, 'red' | 'amber' | 'blue' | 'gray'> = { critical: 'red', high: 'amber', medium: 'blue', low: 'gray' };

export function TicketReportTable({ filters }: { filters: TicketReportFilters }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(20);
    const { data, isLoading, isFetching } = useTicketOverviewRows(filters, page, perPage);
    const canOpenTickets = useCanOpen()('/tickets');

    const columns: Column<TicketReportRow>[] = [
        {
            key: 'no',
            header: t('rep_col_no'),
            width: '170px',
            className: 'whitespace-nowrap',
            render: (r) =>
                canOpenTickets ? (
                    <Link to={`/tickets?view=${r.id}`} className="text-brand font-mono text-xs font-medium hover:underline">
                        {r.ticket_no}
                    </Link>
                ) : (
                    <span className="font-mono text-xs">{r.ticket_no}</span>
                ),
        },
        {
            key: 'subject',
            header: t('rep_col_subject'),
            className: 'truncate whitespace-nowrap',
            render: (r) => <span title={r.subject}>{r.subject}</span>,
        },
        {
            key: 'requester',
            header: t('rep_col_requester'),
            width: '160px',
            className: 'truncate whitespace-nowrap',
            render: (r) => <span className="truncate">{(lang === 'th' && r.requester_name_th) || r.requester_name || '—'}</span>,
        },
        {
            key: 'dept',
            header: t('rep_col_department'),
            width: '140px',
            render: (r) => (lang === 'th' && r.department_name_th) || r.department_name || '—',
        },
        { key: 'cat', header: t('rep_col_category'), width: '110px', render: (r) => (r.category ? t(categoryKey(r.category)) : '—') },
        {
            key: 'prio',
            header: t('rep_col_priority'),
            width: '110px',
            render: (r) => (r.priority ? <StatusBadge tone={PRIORITY_TONE[r.priority]}>{t(priorityKey(r.priority))}</StatusBadge> : '—'),
        },
        {
            key: 'status',
            header: t('rep_col_status'),
            width: '130px',
            render: (r) => <StatusBadge tone={STATUS_TONE[r.status]}>{t(statusKey(r.status))}</StatusBadge>,
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
                ) : r.sla === 'breached' ? (
                    <span className="font-semibold text-red-600 dark:text-red-400">{t('rep_sla_breached')}</span>
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
