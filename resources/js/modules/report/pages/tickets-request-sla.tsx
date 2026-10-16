/**
 * "สรุปผล SLA ของ Ticket จากคำขอ" — /reports/tickets-request-sla
 *
 * Report key tickets.request_sla, laid out as the design mockup: the shared tabular body (filters,
 * summary tiles, the server-paged list of tickets opened from requests, export and schedule) plus
 * the page's own cards from components/request-sla-cards.tsx above the list — results per request
 * type (a press on a type filters the page), the tickets still open past SLA, and the SLA rules
 * used. Status and the two SLA verdicts wear pills. Routed by ../routes.tsx.
 */
import { useT } from '@/lang';
import { StatusBadge } from '@/shared/components/status-badge';
import { useUiStore } from '@/stores/ui';
import { oneDecimal, RequestSlaCards } from '../components/request-sla-cards';
import { TabularReportView } from '../components/tabular-report-view';
import { TicketStatusBadge } from '../components/ticket-badges';

const SLA_TONE: Record<string, 'green' | 'red'> = { met: 'green', missed: 'red', over: 'red' };

/** ทัน / ไม่ทัน / เกิน SLA as pills, beside the moment they judge. */
function SlaPill({ value }: { value: unknown }) {
    const t = useT();
    if (typeof value !== 'string' || !SLA_TONE[value]) return <>—</>;
    return <StatusBadge tone={SLA_TONE[value]}>{t(`rep_rs_sla_${value}`)}</StatusBadge>;
}

/** Hours to fix in one decimal ("73.0"), as the per-type table and the summary tiles print them. */
function FixHours({ value }: { value: unknown }) {
    const lang = useUiStore((s) => s.lang);
    return <span>{typeof value === 'number' ? oneDecimal(value, lang) : '—'}</span>;
}

type Label = { name?: string; name_th?: string | null } | null;

/** The person behind the request, with their employee code and department under the name. */
function RequesterCell({ row }: { row: Record<string, unknown> }) {
    const lang = useUiStore((s) => s.lang);
    const pick = (label: Label) => (label ? (lang === 'th' && label.name_th) || label.name || null : null);
    const name = pick(row.requester as Label);
    if (!name) return <span className="text-muted-foreground">—</span>;
    const sub = [typeof row.requester_code === 'string' ? row.requester_code : null, pick(row.department as Label)].filter((s): s is string =>
        Boolean(s),
    );

    return (
        <div className="min-w-0">
            <div className="max-w-[14rem] truncate font-medium" title={name}>
                {name}
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

function requestSlaCell(key: string, row: Record<string, unknown>) {
    if (key === 'requester') return <RequesterCell row={row} />;
    if (key === 'ticket_status') return <TicketStatusBadge status={row.ticket_status as string | null} />;
    if (key === 'fix_hours') return <FixHours value={row.fix_hours} />;
    if (key === 'take_sla' || key === 'close_sla') return <SlaPill value={row[key]} />;
    return undefined;
}

export default function TicketsRequestSlaReportPage() {
    return (
        <TabularReportView
            reportKey="tickets.request_sla"
            extras={{
                innerColumns: ['requester_code', 'department'],
                beforeTable: ({ filters, patch }) => <RequestSlaCards filters={filters} patch={patch} />,
                rowsTitle: 'rep_rs_rows_title',
                renderCell: requestSlaCell,
            }}
        />
    );
}
