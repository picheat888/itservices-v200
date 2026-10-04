/**
 * "สรุปผล SLA ของ Ticket ที่ผู้ใช้เปิดเอง" — /reports/tickets-manual-sla
 *
 * Report key tickets.manual_sla, laid out as the design mockup: the shared tabular body (filters,
 * summary tiles, the server-paged list of tickets users opened, export and schedule) plus the
 * page's own cards from components/manual-sla-cards.tsx above the list — the table grouped by the
 * dimension picked on its "แยกตาม" switch (a press on a line filters the page), how late the late
 * closes were with the cases still open past SLA, and the SLA rules used. The `by` filter is that
 * switch, so it stays out of the filter bar. Routed by ../routes.tsx.
 */
import { useT } from '@/lang';
import { StatusBadge } from '@/shared/components/status-badge';
import { useUiStore } from '@/stores/ui';
import { Link } from 'react-router-dom';
import { ManualSlaCards } from '../components/manual-sla-cards';
import { oneDecimal } from '../components/request-sla-cards';
import { TabularReportView } from '../components/tabular-report-view';
import { TicketPriorityBadge, TicketStatusBadge } from '../components/ticket-badges';
import { useCanOpen } from '../hooks/use-can-open';

const SLA_TONE: Record<string, 'green' | 'red'> = { met: 'green', missed: 'red', over: 'red' };

/** ทัน / ไม่ทัน / เกิน SLA as pills, beside the moment they judge. */
function SlaPill({ value }: { value: unknown }) {
    const t = useT();
    if (typeof value !== 'string' || !SLA_TONE[value]) return <>—</>;
    return <StatusBadge tone={SLA_TONE[value]}>{t(`rep_rs_sla_${value}`)}</StatusBadge>;
}

/** Hours to fix in one decimal ("73.0"), as the grouped table and the summary tiles print them. */
function FixHours({ value }: { value: unknown }) {
    const lang = useUiStore((s) => s.lang);
    return <span className="font-mono">{typeof value === 'number' ? oneDecimal(value, lang) : '—'}</span>;
}

type Row = Record<string, unknown> & { _links?: Record<string, string> };

/** The subject with the ticket number (the link) under it — the Ticket & SLA page's ticket list. */
function SubjectCell({ row }: { row: Row }) {
    const canOpen = useCanOpen();
    const href = row._links?.ticket_no;
    const subject = String(row.subject ?? '');
    return (
        <div className="min-w-0">
            <div className="truncate" title={subject}>
                {subject || '—'}
            </div>
            {href && canOpen(href) ? (
                <Link to={href} className="text-brand font-mono text-xs font-medium hover:underline">
                    {String(row.ticket_no ?? '')}
                </Link>
            ) : (
                <span className="text-muted-foreground font-mono text-xs">{String(row.ticket_no ?? '')}</span>
            )}
        </div>
    );
}

/** The requester with their department under it. */
function RequesterCell({ row }: { row: Row }) {
    const lang = useUiStore((s) => s.lang);
    const named = (v: unknown) => {
        const n = v as { name?: string | null; name_th?: string | null } | null;
        return (lang === 'th' && n?.name_th) || n?.name || null;
    };
    const name = named(row.requester);
    const dept = named(row.department);
    return (
        <div className="min-w-0">
            <div className="truncate" title={name ?? undefined}>
                {name ?? '—'}
            </div>
            {dept && (
                <div className="text-muted-foreground truncate text-xs" title={dept}>
                    {dept}
                </div>
            )}
        </div>
    );
}

function manualSlaCell(key: string, row: Row) {
    if (key === 'subject') return <SubjectCell row={row} />;
    if (key === 'requester') return <RequesterCell row={row} />;
    if (key === 'ticket_status') return <TicketStatusBadge status={row.ticket_status as string | null} />;
    if (key === 'priority') return <TicketPriorityBadge priority={row.priority as string | null} />;
    if (key === 'fix_hours') return <FixHours value={row.fix_hours} />;
    if (key === 'take_sla' || key === 'close_sla') return <SlaPill value={row[key]} />;
    return undefined;
}

export default function TicketsManualSlaReportPage() {
    return (
        <TabularReportView
            reportKey="tickets.manual_sla"
            extras={{
                // Drawn inside the subject and requester cells, as on the Ticket & SLA page.
                innerColumns: ['ticket_no', 'department'],
                beforeTable: ({ filters, patch }) => <ManualSlaCards filters={filters} patch={patch} />,
                rowsTitle: 'rep_ms_rows_title',
                renderCell: manualSlaCell,
            }}
        />
    );
}
