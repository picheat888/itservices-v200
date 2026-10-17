/**
 * Server-paginated ticket rows under the report charts (DataTable `server` mode, shimmer on
 * isLoading || isFetching — the app's server-table standard). Two-line cells keep the subject
 * wide: the ticket number sits under the subject, the employee code and department under the requester.
 */
import { useT } from '@/lang';
import { type Column, DataTable } from '@/shared/components/data-table';
import { DateTimeCell } from '@/shared/components/date-time-cell';
import { useDateColumnWidth } from '@/shared/hooks/use-date-column-width';
import { useListParams } from '@/shared/hooks/use-list-params';
import { localPair } from '@/shared/lib/local-name';
import { useUiStore } from '@/stores/ui';
import { Link } from 'react-router-dom';
import { useCanOpen } from '../hooks/use-can-open';
import { useTicketOverviewRows } from '../hooks/use-reports';
import type { TicketReportFilters, TicketReportRow } from '../types';
import { TicketPriorityBadge, TicketStatusBadge } from './ticket-badges';
import { categoryKey } from './ticket-labels';

export function TicketReportTable({ filters }: { filters: TicketReportFilters }) {
    const dateWidth = useDateColumnWidth();
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
            width: dateWidth,
            render: (r) => <DateTimeCell value={r.created_at} />,
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
                        <Link to={`/tickets?view=${r.id}`} className="text-brand text-xs font-medium hover:underline">
                            {r.ticket_no}
                        </Link>
                    ) : (
                        <span className="text-muted-foreground text-xs">{r.ticket_no}</span>
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
                const name = localPair(r.requester_name, r.requester_name_th, lang);
                if (!name) return <span className="text-muted-foreground">—</span>;
                const sub = [r.requester_code, localPair(r.department_name, r.department_name_th, lang)].filter((s): s is string => Boolean(s));
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
            render: (r) => localPair(r.assignee_name, r.assignee_name_th, lang) ?? '—',
        },
        {
            key: 'hours',
            header: t('rep_col_resolve'),
            width: '100px',
            align: 'right',
            render: (r) => <span>{r.resolve_hours === null ? '—' : `${r.resolve_hours} ${t('rep_hours')}`}</span>,
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
            empty={{ kind: 'search', title: t('rep_empty_tickets_overview_rows'), hint: t('rep_empty_tickets_overview_rows_hint') }}
            // Fixed columns 1,200px + a ~230px subject; narrower screens scroll sideways
            tableClassName="min-w-[1430px]"
            server={{ ...list.table.paging, total: data?.meta.total ?? 0 }}
        />
    );
}
