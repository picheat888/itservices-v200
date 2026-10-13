/**
 * Server-paginated ticket rows under the report charts (DataTable `server` mode, shimmer on
 * isLoading || isFetching — the app's server-table standard). Two-line cells keep the subject
 * wide: the ticket number sits under the subject, the employee code and department under the requester.
 */
import { useT } from '@/lang';
import { type Column, DataTable } from '@/shared/components/data-table';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { useListParams } from '@/shared/hooks/use-list-params';
import { useUiStore } from '@/stores/ui';
import { Link } from 'react-router-dom';
import { useCanOpen } from '../hooks/use-can-open';
import { useTicketOverviewRows } from '../hooks/use-reports';
import type { TicketReportFilters, TicketReportRow } from '../types';
import { TicketPriorityBadge, TicketStatusBadge } from './ticket-badges';
import { categoryKey } from './ticket-labels';

export function TicketReportTable({ filters }: { filters: TicketReportFilters }) {
    const fmt = useDateFormat();
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    // Page and rows-per-page live in the URL (?page, ?per); a filter change drops ?page
    const list = useListParams();
    const { data, isLoading, isFetching } = useTicketOverviewRows(filters, list.page, list.perPage);
    const canOpenTickets = useCanOpen()('/tickets');

    const columns: Column<TicketReportRow>[] = [
        {
            key: 'opened',
            header: t('rep_col_opened'),
            width: '140px',
            className: 'whitespace-nowrap',
            render: (r) => <span className="font-mono text-xs">{fmt.dateTime(r.created_at)}</span>,
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
            // Requester, with their employee code and department under it
            key: 'requester',
            header: t('rep_col_requester'),
            width: '190px',
            render: (r) => {
                const name = (lang === 'th' && r.requester_name_th) || r.requester_name;
                if (!name) return <span className="text-muted-foreground">—</span>;
                const sub = [r.requester_code, (lang === 'th' && r.department_name_th) || r.department_name].filter((s): s is string => Boolean(s));
                return (
                    <div className="min-w-0">
                        <div className="truncate font-medium" title={name}>
                            {name}
                        </div>
                        {sub.length > 0 && (
                            <div className="text-muted-foreground flex min-w-0 gap-x-3 text-xs" title={sub.join('\n')}>
                                {sub.map((part) => (
                                    <span key={part} className="truncate">
                                        {part}
                                    </span>
                                ))}
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
            // Fixed columns 1,200px + a ~230px subject; narrower screens scroll sideways
            tableClassName="min-w-[1430px]"
            server={{ ...list.table.paging, total: data?.meta.total ?? 0 }}
        />
    );
}
