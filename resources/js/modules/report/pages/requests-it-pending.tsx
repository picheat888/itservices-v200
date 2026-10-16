// "คำขอที่รอ IT ส่งมอบ" report page (/reports/requests-it-pending): shared tabular body + ItPendingCards + its own list cells.
import { useT } from '@/lang';
import { StatusBadge } from '@/shared/components/status-badge';
import { REQUEST_ONBOARDING_BADGE, REQUEST_ONBOARDING_ROW } from '@/shared/lib/request-meta';
import { cn } from '@/shared/lib/utils';
import { useUiStore } from '@/stores/ui';
import { Link } from 'react-router-dom';
import { CODE_LINK } from '../components/chart-parts';
import { ItPendingAsOf, ItPendingCards } from '../components/it-pending-cards';
import { TabularReportView } from '../components/tabular-report-view';
import { TicketStatusBadge } from '../components/ticket-badges';
import { useCanOpen } from '../hooks/use-can-open';

type Row = Record<string, unknown> & { _links?: Record<string, string> };

/** Columns drawn inside the type, requester and ticket cells — kept in the rows and the files. */
const INNER = ['origin', 'requester_code', 'department', 'ticket_status'];

const str = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null);

/** The type, with the Request module's violet "พนักงานใหม่" badge under it for a request filed from Add Employee. */
function TypeCell({ row }: { row: Row }) {
    const t = useT();
    return (
        <div className="flex min-w-0 flex-col items-start gap-1">
            <span className="max-w-full truncate">{str(row.request_type) ? t(`req_${row.request_type}`) : '—'}</span>
            {row.origin === 'onboarding' && <StatusBadge tone={REQUEST_ONBOARDING_BADGE.tone}>{t(REQUEST_ONBOARDING_BADGE.labelKey)}</StatusBadge>}
        </div>
    );
}

/** The requester's name, with their employee code and department under it. */
function RequesterCell({ row }: { row: Row }) {
    const lang = useUiStore((s) => s.lang);
    const name = str(row.requester);
    const department = row.department as { name?: string; name_th?: string | null } | null;
    const sub = [str(row.requester_code), department ? (lang === 'th' && department.name_th) || department.name || null : null].filter(
        (s): s is string => Boolean(s),
    );
    return (
        <div className="min-w-0">
            <div className="max-w-[14rem] truncate font-medium" title={name ?? undefined}>
                {name ?? '—'}
            </div>
            {sub.length > 0 && (
                <div className="text-muted-foreground flex max-w-[14rem] gap-x-3 text-xs" title={sub.join('\n')}>
                    {sub.map((part) => (
                        <span key={part} className="truncate">
                            {part}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}

/** Whole days waiting as a pill: over 7 red, 4–7 amber, up to 3 gray. */
function WaitPill({ value }: { value: unknown }) {
    const t = useT();
    if (typeof value !== 'number') return <>—</>;
    const tone = value > 7 ? 'red' : value > 3 ? 'amber' : 'gray';
    return <StatusBadge tone={tone}>{t('rep_rqi_wait_days').replace('{n}', value.toLocaleString())}</StatusBadge>;
}

/** The ticket number (its link) with its status under it; none yet reads so. */
function TicketCell({ row }: { row: Row }) {
    const t = useT();
    const canOpen = useCanOpen();
    const number = str(row.ticket_no);
    if (!number) return <span className="text-muted-foreground text-xs">{t('rep_rqi_opt_no_ticket')}</span>;
    const href = row._links?.ticket_no;
    return (
        <div className="flex flex-col items-start gap-1">
            {href && canOpen(href) ? (
                <Link to={href} className={CODE_LINK} translate="no">
                    {number}
                </Link>
            ) : (
                <span className="text-xs" translate="no">
                    {number}
                </span>
            )}
            <TicketStatusBadge status={row.ticket_status as string | null} />
        </div>
    );
}

/** Who holds the ticket; a ticket nobody holds says so in amber, no ticket is a dash. */
function AssigneeCell({ row }: { row: Row }) {
    const t = useT();
    if (!str(row.ticket_no)) return <span className="text-muted-foreground">—</span>;
    const name = str(row.assignee);
    return name ? <span>{name}</span> : <span className="font-semibold text-amber-600 dark:text-amber-400">{t('rep_rqi_unassigned')}</span>;
}

function itPendingCell(key: string, row: Row) {
    if (key === 'request_type') return <TypeCell row={row} />;
    if (key === 'requester') return <RequesterCell row={row} />;
    if (key === 'waiting_days') return <WaitPill value={row.waiting_days} />;
    if (key === 'ticket_no') return <TicketCell row={row} />;
    if (key === 'assignee') return <AssigneeCell row={row} />;
    return undefined;
}

/** The list's left stripe by how long the request has waited (as the backlog list), and the onboarding tint. */
function rowClass(row: Record<string, unknown>): string | undefined {
    const days = typeof row.waiting_days === 'number' ? row.waiting_days : 0;
    const stripe =
        days > 7
            ? '[&>td:first-child]:shadow-[inset_3px_0_0_var(--color-red-400)]'
            : days > 3
              ? '[&>td:first-child]:shadow-[inset_3px_0_0_var(--color-amber-400)]'
              : undefined;
    return cn(stripe, row.origin === 'onboarding' && REQUEST_ONBOARDING_ROW) || undefined;
}

export default function RequestsItPendingReportPage() {
    return (
        <TabularReportView
            reportKey="requests.it_pending"
            extras={{
                tiles: 5,
                innerColumns: INNER,
                // The group-by switch shapes only the "ภาระงานที่รอส่งมอบ" card, not the list.
                cardOnlyFilters: ['by'],
                filterTrail: ({ filters }) => <ItPendingAsOf filters={filters} />,
                beforeTable: ({ filters, patch }) => <ItPendingCards filters={filters} patch={patch} />,
                rowsTitle: 'rep_rqi_rows_title',
                rowClassName: rowClass,
                renderCell: itPendingCell,
            }}
        />
    );
}
