/**
 * "การตัดจำหน่ายทรัพย์สิน" — /reports/assets-writeoffs
 *
 * Report key assets.writeoffs, laid out as the design mockup: the shared tabular body (filters with
 * the contract and reason, the five tiles, the server-paged list, export and schedule) plus the
 * page's own cards from components/writeoff-cards.tsx above the list — by month, by reason, by
 * category (service life, warranty) and the rented assets by contract. The list draws a few cells
 * its own way: the code with brand and model under it, the source as a pill (a rented one with its
 * contract under it), the warranty on the day it left, and "เช่า" in place of a rented unit's value.
 * Routed by ../routes.tsx.
 */
import { useT } from '@/lang';
import { StatusBadge } from '@/shared/components/status-badge';
import { cn } from '@/shared/lib/utils';
import { Link } from 'react-router-dom';
import { TabularReportView } from '../components/tabular-report-view';
import { WriteoffCards } from '../components/writeoff-cards';
import { useCanOpen } from '../hooks/use-can-open';

type Row = Record<string, unknown> & { _links?: Record<string, string> };

const str = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null);

/** The asset code (a link to the asset) with "brand model" under it. */
/** A code that opens its record: the report lists' brand link (as the ticket codes on the SLA reports), with a keyboard focus ring. */
const CODE_LINK =
    'text-brand focus-visible:ring-brand rounded-sm font-mono text-xs font-semibold hover:underline focus-visible:ring-2 focus-visible:outline-none';

function AssetCell({ row }: { row: Row }) {
    const canOpen = useCanOpen();
    const href = row._links?.asset_code;
    const code = String(row.asset_code ?? '');
    const what = [str(row.brand), str(row.model)].filter(Boolean).join(' ');
    return (
        <div className="min-w-0">
            {href && canOpen(href) ? (
                <Link to={href} className={CODE_LINK}>
                    {code}
                </Link>
            ) : (
                <span className="font-mono text-xs font-semibold">{code}</span>
            )}
            {what && (
                <div className="text-muted-foreground max-w-[16rem] truncate text-xs" title={what}>
                    {what}
                </div>
            )}
        </div>
    );
}

/** "ซื้อ" as an orange pill; "เช่า" as the violet badge of the asset inventory, with its contract under it. */
function SourceCell({ row }: { row: Row }) {
    const t = useT();
    const canOpen = useCanOpen();
    if (row.source !== 'rented') {
        return (
            <span className="inline-flex rounded-full bg-orange-500/10 px-2 py-0.5 text-xs font-medium text-orange-700 dark:text-orange-300">
                {t('rep_src_purchased')}
            </span>
        );
    }
    const code = str(row.contract);
    const href = row._links?.contract;
    return (
        <div className="flex flex-col items-start">
            <StatusBadge tone="violet" dot={false}>
                {t('rep_src_rented')}
            </StatusBadge>
            {code &&
                (href && canOpen(href) ? (
                    <Link to={href} className={cn(CODE_LINK, 'mt-0.5 font-medium')}>
                        {code}
                    </Link>
                ) : (
                    <span className="text-muted-foreground mt-0.5 font-mono text-xs">{code}</span>
                ))}
        </div>
    );
}

/** The warranty on the day it left: months still to run, lifetime, expired — "—" when unknown or rented. */
function WarrantyCell({ row }: { row: Row }) {
    const t = useT();
    switch (row.warranty) {
        case 'remaining':
            return <StatusBadge tone="amber">{t('rep_wo_wty_left').replace('{n}', String(row.warranty_months ?? 1))}</StatusBadge>;
        case 'lifetime':
            return <StatusBadge tone="green">{t('rep_wo_wty_lifetime')}</StatusBadge>;
        case 'expired':
            return <StatusBadge tone="gray">{t('rep_wo_wty_expired')}</StatusBadge>;
        default:
            return <span className="text-muted-foreground">—</span>;
    }
}

/** A return to the lessor has no reason of its own — say so instead of a blank. */
function ReasonCell({ row }: { row: Row }) {
    const t = useT();
    const reason = row.outcome === 'returned' ? t('rep_wo_outcome_returned') : str(row.reason);
    return reason ? (
        <span className="block max-w-[16rem] truncate" title={reason}>
            {reason}
        </span>
    ) : (
        <span className="text-muted-foreground">—</span>
    );
}

function writeoffCell(key: string, row: Row) {
    if (key === 'asset_code') return <AssetCell row={row} />;
    if (key === 'source') return <SourceCell row={row} />;
    if (key === 'reason') return <ReasonCell row={row} />;
    if (key === 'warranty') return <WarrantyCell row={row} />;
    // A rented unit is the lessor's: no value of its own to show.
    if (key === 'value' && row.source === 'rented') return <RentedValue />;
    return undefined;
}

function RentedValue() {
    const t = useT();
    return <span className="text-muted-foreground">{t('rep_src_rented')}</span>;
}

export default function AssetsWriteoffsReportPage() {
    return (
        <TabularReportView
            reportKey="assets.writeoffs"
            extras={{
                // Drawn inside other cells: brand and model under the code, the contract under "เช่า",
                // the months left inside the warranty pill, a return to the lessor in the reason cell.
                innerColumns: ['brand', 'model', 'contract', 'warranty_months', 'outcome'],
                beforeTable: ({ filters }) => <WriteoffCards filters={filters} />,
                rowsTitle: 'rep_wo_rows_title',
                renderCell: writeoffCell,
            }}
        />
    );
}
