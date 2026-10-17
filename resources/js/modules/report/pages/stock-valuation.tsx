// "มูลค่าคงคลัง" report page (/reports/stock-valuation): shared tabular body + StockValuationCards + its own list cells.
import { useUiStore } from '@/stores/ui';
import { LastMoveCell, stockCount, stockMoney } from '../components/stock-parts';
import { StockValuationCards } from '../components/stock-valuation-cards';
import { TabularReportView } from '../components/tabular-report-view';
import type { TabularFilters } from '../types';

type Row = Record<string, unknown>;

function QtyCell({ row }: { row: Row }) {
    const lang = useUiStore((s) => s.lang);
    if (typeof row.qty_on_hand !== 'number') return <span className="text-muted-foreground">—</span>;
    return <span className="tabular-nums">{stockCount(row.qty_on_hand, lang)}</span>;
}

function MoneyCell({ value, strong }: { value: unknown; strong?: boolean }) {
    const lang = useUiStore((s) => s.lang);
    if (typeof value !== 'number') return <span className="text-muted-foreground">—</span>;
    return <span className={strong ? 'font-semibold tabular-nums' : 'tabular-nums'}>{stockMoney(value, lang)}</span>;
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
                cardOnlyFilters: ['dead_days'],
                beforeTable: ({ filters, patch }) => <StockValuationCards filters={filters} patch={patch} />,
                rowsTitle: 'rep_sva_rows_title',
                renderCell: valuationCell,
            }}
        />
    );
}
