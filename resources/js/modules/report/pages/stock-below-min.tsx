// "ต่ำกว่าขั้นต่ำและเกินขั้นสูง" report page (/reports/stock-below-min): shared tabular body + stock-levels-cards + its own list cells.
import { useT } from '@/lang';
import { STOCK_STATUS_TONE, StockLevelBar } from '@/modules/stock';
import { StatusBadge } from '@/shared/components/status-badge';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { localPair } from '@/shared/lib/local-name';
import type { StockItemStatus } from '@/shared/types';
import { useUiStore } from '@/stores/ui';
import { StockLevelsCategoryCard, StockLevelsLegend, StockLevelsTiles } from '../components/stock-levels-cards';
import { stockCount, stockMoney } from '../components/stock-parts';
import { TabularReportView } from '../components/tabular-report-view';

type Row = Record<string, unknown>;

/** Drawn inside another cell (SKU and category under the name, unit beside the figures, Min/Max on the bar, the two label codes). */
const INNER = ['sku', 'category', 'unit', 'min_stock', 'max_stock', 'unit_cost_basis', 'value_kind'];

const STATUSES: StockItemStatus[] = ['ok', 'low', 'out', 'over', 'dead'];

const DAY_MS = 86_400_000;

const num = (v: unknown) => (typeof v === 'number' ? v : 0);
const text = (v: unknown) => (typeof v === 'string' ? v : '');
const statusOf = (v: unknown): StockItemStatus | null => (STATUSES.includes(v as StockItemStatus) ? (v as StockItemStatus) : null);

const Dash = () => <span className="text-muted-foreground">—</span>;

/** A figure with its small label under it, right aligned. */
function Figure({ main, sub, className }: { main: React.ReactNode; sub: React.ReactNode; className?: string }) {
    return (
        <span className="block text-right">
            <span className={className ?? 'tabular-nums'}>{main}</span>
            {sub && <small className="text-muted-foreground mt-0.5 block text-xs whitespace-nowrap">{sub}</small>}
        </span>
    );
}

function ItemCell({ row }: { row: Row }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const category = row.category as { name?: string | null; name_th?: string | null } | null;

    return (
        <span className="block max-w-72 min-w-48 whitespace-normal">
            <span className="block leading-snug font-medium">{text(row.item_name) || '—'}</span>
            <small className="text-muted-foreground mt-0.5 block text-xs">{text(row.sku)}</small>
            <small className="text-muted-foreground block text-xs">{localPair(category?.name, category?.name_th, lang) ?? t('rep_slv_no_cat')}</small>
        </span>
    );
}

function StatusCell({ value }: { value: unknown }) {
    const t = useT();
    const status = statusOf(value);
    if (!status) return <Dash />;
    return <StatusBadge tone={STOCK_STATUS_TONE[status]}>{t(`stock_st_${status}`)}</StatusBadge>;
}

/** On-hand and unit above the stock page's Min/Max bar. */
function LevelCell({ row }: { row: Row }) {
    const lang = useUiStore((s) => s.lang);
    const status = statusOf(row.status);
    if (typeof row.qty_on_hand !== 'number' || !status) return <Dash />;

    return (
        <span className="block min-w-36">
            <span className="text-muted-foreground mb-1.5 block text-[13px]">
                <b className="text-foreground text-sm font-semibold tabular-nums">{stockCount(row.qty_on_hand, lang)}</b> {text(row.unit)}
            </span>
            <StockLevelBar current={row.qty_on_hand} min={num(row.min_stock)} max={num(row.max_stock)} status={status} />
        </span>
    );
}

function GapCell({ row }: { row: Row }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const fill = (key: string) =>
        t(key)
            .replace('{n}', stockCount(num(row.gap), lang))
            .replace('{unit}', text(row.unit));
    if (row.status === 'over') return <Figure main={fill('rep_slv_gap_over')} sub={t('rep_slv_gap_over_sub')} />;
    return (
        <Figure
            main={fill('rep_slv_gap_short')}
            sub={t('rep_slv_gap_short_sub')}
            className="font-semibold text-red-700 tabular-nums dark:text-red-400"
        />
    );
}

function ReorderCell({ row }: { row: Row }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    if (row.status === 'over') return <Figure main={<span className="text-muted-foreground">{t('rep_slv_reorder_none')}</span>} sub={null} />;
    return <Figure main={`${stockCount(num(row.reorder_qty), lang)} ${text(row.unit)}`} sub={t('rep_slv_reorder_sub')} />;
}

/** The unit price and where it came from: last receipt, set cost, average cost or none. */
function PriceCell({ row }: { row: Row }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    if (typeof row.unit_cost !== 'number' || row.unit_cost_basis === 'none') {
        return <Figure main={<span className="text-muted-foreground">{t('rep_opt_basis_none')}</span>} sub={t('rep_slv_price_none_sub')} />;
    }
    return <Figure main={stockMoney(row.unit_cost, lang)} sub={t(`rep_opt_basis_${text(row.unit_cost_basis)}`)} />;
}

function ValueCell({ row }: { row: Row }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    if (typeof row.value !== 'number') return <Figure main={<Dash />} sub={t('rep_opt_basis_none')} />;
    return (
        <Figure
            main={stockMoney(row.value, lang)}
            sub={t(row.value_kind === 'excess' ? 'rep_slv_value_excess' : 'rep_opt_value_reorder')}
            className="font-semibold tabular-nums"
        />
    );
}

/** The last move's date and how many days ago. */
function LastMoveCell({ value }: { value: unknown }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const fmt = useDateFormat();
    if (typeof value !== 'string' || value === '') return <Dash />;
    const [y, m, d] = value.slice(0, 10).split('-').map(Number);
    const days = Math.max(0, Math.round((new Date().setHours(0, 0, 0, 0) - new Date(y, m - 1, d).getTime()) / DAY_MS));

    return (
        <span>
            <span className="block text-xs">{fmt.date(value)}</span>
            <small className="text-muted-foreground block text-xs">{t('rep_slv_days_ago').replace('{n}', stockCount(days, lang))}</small>
        </span>
    );
}

function levelCell(key: string, row: Row) {
    if (key === 'item_name') return <ItemCell row={row} />;
    if (key === 'status') return <StatusCell value={row.status} />;
    if (key === 'qty_on_hand') return <LevelCell row={row} />;
    if (key === 'gap') return <GapCell row={row} />;
    if (key === 'reorder_qty') return <ReorderCell row={row} />;
    if (key === 'unit_cost') return <PriceCell row={row} />;
    if (key === 'value') return <ValueCell row={row} />;
    if (key === 'last_move') return <LastMoveCell value={row.last_move} />;
    return undefined;
}

export default function StockBelowMinReportPage() {
    return (
        <TabularReportView
            reportKey="stock.below_min"
            extras={{
                tiles: 5,
                hideSummary: true,
                innerColumns: INNER,
                beforeTable: ({ filters }) => <StockLevelsTiles filters={filters} />,
                afterTable: ({ filters }) => <StockLevelsCategoryCard filters={filters} />,
                rowsTitle: 'rep_slv_rows_title',
                rowsLead: ({ filters }) => <StockLevelsLegend filters={filters} />,
                rowClassName: () => '[&>td]:align-top',
                renderCell: levelCell,
            }}
        />
    );
}
