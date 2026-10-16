// "การตัดจำหน่ายทรัพย์สิน" report page (/reports/assets-writeoffs): shared tabular body + WriteoffCards + its own list cells.
import { useT } from '@/lang';
import { StatusBadge } from '@/shared/components/status-badge';
import { useUiStore } from '@/stores/ui';
import { Link } from 'react-router-dom';
import { CODE_LINK } from '../components/chart-parts';
import { TabularReportView } from '../components/tabular-report-view';
import { WriteoffCards } from '../components/writeoff-cards';
import { YearsTip } from '../components/years-tip';
import { useCanOpen } from '../hooks/use-can-open';

type Row = Record<string, unknown> & { _links?: Record<string, string> };

const str = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null);

function None() {
    return <span className="text-muted-foreground">—</span>;
}

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
                <span className="text-xs font-semibold">{code}</span>
            )}
            {what && (
                <div className="text-muted-foreground max-w-[16rem] truncate text-xs" title={what}>
                    {what}
                </div>
            )}
        </div>
    );
}

function SourceCell({ row }: { row: Row }) {
    const t = useT();
    const canOpen = useCanOpen();
    if (row.source === 'purchased') {
        return (
            <StatusBadge tone="orange" dot={false}>
                {t('rep_src_purchased')}
            </StatusBadge>
        );
    }
    if (row.source !== 'rented') return <None />;
    const code = str(row.contract);
    const href = row._links?.contract;
    return (
        <div className="flex flex-col items-start">
            <StatusBadge tone="violet" dot={false}>
                {t('rep_src_rented')}
            </StatusBadge>
            {code &&
                (href && canOpen(href) ? (
                    <Link to={href} className={`${CODE_LINK} mt-0.5`}>
                        {code}
                    </Link>
                ) : (
                    <span className="text-muted-foreground mt-0.5 text-xs">{code}</span>
                ))}
        </div>
    );
}

function WarrantyCell({ row }: { row: Row }) {
    const t = useT();
    switch (row.warranty) {
        case 'remaining':
            return (
                <StatusBadge tone="amber">
                    {typeof row.warranty_months === 'number'
                        ? t('rep_wo_wty_left').replace('{n}', String(row.warranty_months))
                        : t('rep_wo_warranty_remaining')}
                </StatusBadge>
            );
        case 'lifetime':
            return <StatusBadge tone="green">{t('rep_wo_wty_lifetime')}</StatusBadge>;
        case 'expired':
            return <StatusBadge tone="gray">{t('rep_wo_wty_expired')}</StatusBadge>;
        default:
            return <None />;
    }
}

function ReasonCell({ row }: { row: Row }) {
    const t = useT();
    const reason = row.outcome === 'returned' ? t('rep_wo_outcome_returned') : str(row.reason);
    return reason ? (
        <span className="block max-w-[16rem] truncate" title={reason}>
            {reason}
        </span>
    ) : (
        <None />
    );
}

function AgeCell({ years }: { years: number }) {
    const lang = useUiStore((s) => s.lang);
    return (
        <span className="tabular-nums">
            <YearsTip years={years}>
                {years.toLocaleString(lang === 'th' ? 'th-TH' : 'en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            </YearsTip>
        </span>
    );
}

function writeoffCell(key: string, row: Row) {
    if (key === 'asset_code') return <AssetCell row={row} />;
    if (key === 'source') return <SourceCell row={row} />;
    if (key === 'reason') return <ReasonCell row={row} />;
    if (key === 'warranty') return <WarrantyCell row={row} />;
    if (key === 'value' && row.source === 'rented') return <None />;
    if (key === 'age_years' && typeof row.age_years === 'number') return <AgeCell years={row.age_years} />;
    return undefined;
}

export default function AssetsWriteoffsReportPage() {
    return (
        <TabularReportView
            reportKey="assets.writeoffs"
            extras={{
                tiles: 5,
                innerColumns: ['brand', 'model', 'contract', 'warranty_months', 'outcome'],
                beforeTable: ({ filters }) => <WriteoffCards filters={filters} />,
                rowsTitle: 'rep_wo_rows_title',
                renderCell: writeoffCell,
            }}
        />
    );
}
