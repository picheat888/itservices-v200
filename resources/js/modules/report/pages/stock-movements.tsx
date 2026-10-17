// "รับเข้าและเบิกจ่าย" report page (/reports/stock-movements): shared tabular body + StockMovementsCards + its own list cells.
import { useT } from '@/lang';
import { StatusBadge } from '@/shared/components/status-badge';
import { cn } from '@/shared/lib/utils';
import type { StockMovementType } from '@/shared/types';
import { useUiStore } from '@/stores/ui';
import { StockMovementsCards } from '../components/stock-movements-cards';
import { MV_META, signInk, stockCount, stockMoney } from '../components/stock-parts';
import { TabularReportView } from '../components/tabular-report-view';

type Row = Record<string, unknown>;

const movementType = (v: unknown): StockMovementType | null => (typeof v === 'string' && v in MV_META ? (v as StockMovementType) : null);

function TypePill({ value }: { value: unknown }) {
    const t = useT();
    const type = movementType(value);
    if (!type) return <span className="text-muted-foreground">—</span>;
    return <StatusBadge tone={MV_META[type].tone}>{t(`stock_mv_${type}`)}</StatusBadge>;
}

/** Pieces with the movement's sign: in green "+", out violet "−", transfer gray. */
function SignedQty({ row }: { row: Row }) {
    const lang = useUiStore((s) => s.lang);
    const type = movementType(row.type);
    const qty = typeof row.qty === 'number' ? row.qty : null;
    if (qty === null) return <span className="text-muted-foreground">—</span>;
    const sign = type ? MV_META[type].sign : 0;
    return (
        <span className={cn('font-semibold tabular-nums', signInk(sign))}>
            {sign > 0 ? '+' : sign < 0 ? '−' : ''}
            {stockCount(qty, lang)}
        </span>
    );
}

function ValueCell({ value }: { value: unknown }) {
    const lang = useUiStore((s) => s.lang);
    if (typeof value !== 'number') return <span className="text-muted-foreground">—</span>;
    return <span className="font-semibold tabular-nums">{stockMoney(value, lang)}</span>;
}

function movementCell(key: string, row: Row) {
    if (key === 'type') return <TypePill value={row.type} />;
    if (key === 'qty') return <SignedQty row={row} />;
    if (key === 'line_value') return <ValueCell value={row.line_value} />;
    return undefined;
}

export default function StockMovementsReportPage() {
    return (
        <TabularReportView
            reportKey="stock.movements"
            extras={{
                tiles: 5,
                hideSummary: true,
                beforeTable: ({ filters }) => <StockMovementsCards filters={filters} />,
                rowsTitle: 'rep_smv_rows_title',
                renderCell: movementCell,
            }}
        />
    );
}
