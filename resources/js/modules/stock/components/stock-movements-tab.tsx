import { useT } from '@/lang';
import { type Column, DataTable } from '@/shared/components/data-table';
import { EmptyPane } from '@/shared/components/empty-pane';
import { StatusBadge } from '@/shared/components/status-badge';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { cn } from '@/shared/lib/utils';
import { type StockMovementType } from '@/shared/types';
import { History } from 'lucide-react';
import { useStockItemHistory } from '../hooks/use-stock';
import { MV_META } from '../pages/shared';

/** One movement row as returned by the item-history endpoint. */
type Move = {
    id: number;
    doc_no: string | null;
    type: StockMovementType;
    qty: number;
    from_label: string | null;
    to_label: string | null;
    recorded_by: string | null;
    moved_at: string | null;
};

/** Movements tab: a fill-height table of the item's stock movements (date, doc, type, qty, route, by). */
export function StockMovementsTab({ itemId }: { itemId: number }) {
    const t = useT();
    const fmt = useDateFormat();
    const { data: history, isLoading } = useStockItemHistory(itemId);
    const moves = (history?.movements ?? []) as Move[];
    const typeLabel = (type: StockMovementType) => t(`stock_mv_${type}` as Parameters<typeof t>[0]);

    const columns: Column<Move>[] = [
        {
            key: 'moved_at',
            header: t('stock_date'),
            render: (m) => <span className="text-muted-foreground text-xs">{fmt.date(m.moved_at)}</span>,
        },
        {
            key: 'doc_no',
            header: t('stock_doc_no'),
            render: (m) => <span className="text-xs">{m.doc_no ?? '—'}</span>,
        },
        {
            key: 'type',
            header: t('stock_mv_type'),
            render: (m) => <StatusBadge tone={MV_META[m.type].tone}>{typeLabel(m.type)}</StatusBadge>,
        },
        {
            key: 'qty',
            header: t('stock_qty'),
            align: 'right',
            render: (m) => {
                const sign = MV_META[m.type].sign;
                return (
                    <span
                        className={cn(
                            'font-semibold tabular-nums',
                            sign > 0 ? 'text-emerald-700 dark:text-emerald-400' : sign < 0 ? 'text-destructive' : '',
                        )}
                    >
                        {sign > 0 ? '+' : sign < 0 ? '−' : ''}
                        {m.qty}
                    </span>
                );
            },
        },
        {
            key: 'route',
            header: `${t('stock_from')} → ${t('stock_to')}`,
            render: (m) => <span className="text-xs">{[m.from_label, m.to_label].filter(Boolean).join(' → ') || '—'}</span>,
        },
        { key: 'recorded_by', header: t('stock_by'), render: (m) => <span className="text-xs">{m.recorded_by ?? '—'}</span> },
    ];

    if (!isLoading && moves.length === 0) {
        return <EmptyPane icon={History} text={t('stock_no_moves')} />;
    }

    return (
        <div className="h-full">
            <DataTable
                fillHeight
                loading={isLoading}
                columns={columns}
                rows={moves}
                rowKey={(m) => m.id}
                searchable={(m) => `${m.doc_no ?? ''} ${m.recorded_by ?? ''}`}
            />
        </div>
    );
}
