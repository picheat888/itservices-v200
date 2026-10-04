/**
 * "SLA ตามประเภทคำขอ" — /reports/tickets-request-sla
 *
 * Report key tickets.request_sla, laid out as the design mockup: the shared tabular body (filters,
 * summary tiles, the server-paged list of tickets opened from requests, export and schedule) plus
 * the page's own cards from components/request-sla-cards.tsx above the list — results per request
 * type (a press on a type filters the page), the tickets still open past SLA, and the SLA rules
 * used. Status and the two SLA verdicts wear pills. Routed by ../routes.tsx.
 */
import { useT } from '@/lang';
import { StatusBadge } from '@/shared/components/status-badge';
import { RequestSlaCards } from '../components/request-sla-cards';
import { TabularReportView } from '../components/tabular-report-view';
import { TicketStatusBadge } from '../components/ticket-badges';

const SLA_TONE: Record<string, 'green' | 'red'> = { met: 'green', missed: 'red', over: 'red' };

/** ทัน / ไม่ทัน / เกิน SLA as pills, beside the moment they judge. */
function SlaPill({ value }: { value: unknown }) {
    const t = useT();
    if (typeof value !== 'string' || !SLA_TONE[value]) return <>—</>;
    return <StatusBadge tone={SLA_TONE[value]}>{t(`rep_rs_sla_${value}`)}</StatusBadge>;
}

function requestSlaCell(key: string, row: Record<string, unknown>) {
    if (key === 'ticket_status') return <TicketStatusBadge status={row.ticket_status as string | null} />;
    if (key === 'take_sla' || key === 'close_sla') return <SlaPill value={row[key]} />;
    return undefined;
}

export default function TicketsRequestSlaReportPage() {
    return (
        <TabularReportView
            reportKey="tickets.request_sla"
            extras={{
                beforeTable: ({ filters, patch }) => <RequestSlaCards filters={filters} patch={patch} />,
                rowsTitle: 'rep_rs_rows_title',
                renderCell: requestSlaCell,
            }}
        />
    );
}
