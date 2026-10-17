// "มูลค่าคงคลัง" report page (/reports/stock-valuation): shared tabular body + StockValuationCards + its own list cells.
import { useT } from '@/lang';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { useUiStore } from '@/stores/ui';
import { stockCount, stockMoney } from '../components/stock-parts';
import { StockValuationCards } from '../components/stock-valuation-cards';
import { TabularReportView } from '../components/tabular-report-view';
import type { TabularFilters } from '../types';

type Row = Record<string, unknown>;

/** The unit is drawn beside the quantity, not in a column of its own. */
const INNER = ['unit'];

const DAY_MS = 86_400_000;

const dayStart = (value: string) => {
    const [y, m, d] = value.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d).getTime();
};

function QtyCell({ row }: { row: Row }) {
    const lang = useUiStore((s) => s.lang);
    if (typeof row.qty_on_hand !== 'number') return <span className="text-muted-foreground">—</span>;
    return (
        <span className="tabular-nums">
            {stockCount(row.qty_on_hand, lang)} {typeof row.unit === 'string' ? row.unit : ''}
        </span>
    );
}

function MoneyCell({ value, strong }: { value: unknown; strong?: boolean }) {
    const lang = useUiStore((s) => s.lang);
    if (typeof value !== 'number') return <span className="text-muted-foreground">—</span>;
    return <span className={strong ? 'font-semibold tabular-nums' : 'tabular-nums'}>{stockMoney(value, lang)}</span>;
}

/** The last move's date and how many days before the report's day. */
function LastMoveCell({ value, asOf }: { value: unknown; asOf: unknown }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const fmt = useDateFormat();
    if (typeof value !== 'string' || value === '') return <span className="text-muted-foreground">—</span>;
    const day = typeof asOf === 'string' && asOf !== '' ? dayStart(asOf) : new Date().setHours(0, 0, 0, 0);
    const days = Math.max(0, Math.round((day - dayStart(value)) / DAY_MS));

    return (
        <span>
            <span className="block text-xs">{fmt.date(value)}</span>
            <small className="text-muted-foreground block text-xs">{t('rep_sva_days_ago').replace('{n}', stockCount(days, lang))}</small>
        </span>
    );
}

function valuationCell(key: string, row: Row, ctx: { filters: TabularFilters }) {
    if (key === 'qty_on_hand') return <QtyCell row={row} />;
    if (key === 'avg_cost') return <MoneyCell value={row.avg_cost} />;
    if (key === 'stock_value') return <MoneyCell value={row.stock_value} strong />;
    if (key === 'last_move') return <LastMoveCell value={row.last_move} asOf={ctx.filters.as_of} />;
    return undefined;
}

export default function StockValuationReportPage() {
    return (
        <TabularReportView
            reportKey="stock.valuation"
            extras={{
                tiles: 4,
                hideSummary: true,
                innerColumns: INNER,
                beforeTable: ({ filters }) => <StockValuationCards filters={filters} />,
                rowsTitle: 'rep_sva_rows_title',
                renderCell: valuationCell,
            }}
        />
    );
}
