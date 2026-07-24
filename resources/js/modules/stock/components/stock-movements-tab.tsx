import { type Column, DataTable } from '@/shared/components/data-table';
import { StatusBadge } from '@/shared/components/status-badge';
import { useDateTime } from '@/modules/settings';
import { useStockItemHistory } from '../hooks/use-stock';
import { cn } from '@/shared/lib/utils';
import { useUiStore } from '@/stores/ui';
import { type StockMovementType } from '@/shared/types';
import { History } from 'lucide-react';

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

/** Localized label, badge tone, and qty sign for each movement type. */
const TYPE_META: Record<StockMovementType, { th: string; en: string; tone: 'green' | 'amber' | 'red' | 'blue' | 'violet' | 'gray'; sign: '+' | '-' | '' }> = {
    receive: { th: 'รับเข้า', en: 'Receive', tone: 'green', sign: '+' },
    issue: { th: 'เบิกออก', en: 'Issue', tone: 'violet', sign: '-' },
    return: { th: 'คืน', en: 'Return', tone: 'blue', sign: '+' },
    transfer: { th: 'โอน', en: 'Transfer', tone: 'gray', sign: '' },
    adjust_up: { th: 'ปรับเพิ่ม', en: 'Adjust +', tone: 'green', sign: '+' },
    adjust_down: { th: 'ปรับลด', en: 'Adjust −', tone: 'amber', sign: '-' },
};

/** Movements tab: a fill-height table of the item's stock movements (date, doc, type, qty, route, by). */
export function StockMovementsTab({ itemId }: { itemId: number }) {
    const lang = useUiStore((s) => s.lang);
    const { data: history, isLoading } = useStockItemHistory(itemId);
    const { format: fmtDateTime } = useDateTime();
    const moves = (history?.movements ?? []) as Move[];

    const columns: Column<Move>[] = [
        {
            key: 'moved_at',
            header: lang === 'th' ? 'วันที่' : 'Date',
            render: (m) => <span className="text-muted-foreground font-mono text-xs">{fmtDateTime(m.moved_at, false)}</span>,
        },
        { key: 'doc_no', header: lang === 'th' ? 'เลขที่เอกสาร' : 'Doc No', render: (m) => <span className="font-mono text-xs">{m.doc_no ?? '—'}</span> },
        {
            key: 'type',
            header: lang === 'th' ? 'ประเภท' : 'Type',
            render: (m) => <StatusBadge tone={TYPE_META[m.type].tone}>{lang === 'th' ? TYPE_META[m.type].th : TYPE_META[m.type].en}</StatusBadge>,
        },
        {
            key: 'qty',
            header: lang === 'th' ? 'จำนวน' : 'Qty',
            align: 'right',
            render: (m) => {
                const meta = TYPE_META[m.type];
                return (
                    <span className={cn('font-mono font-semibold', meta.sign === '+' ? 'text-emerald-600 dark:text-emerald-400' : meta.sign === '-' ? 'text-red-600 dark:text-red-400' : '')}>
                        {meta.sign}
                        {m.qty}
                    </span>
                );
            },
        },
        {
            key: 'route',
            header: lang === 'th' ? 'จาก → ไป' : 'From → To',
            render: (m) => <span className="text-xs">{[m.from_label, m.to_label].filter(Boolean).join(' → ') || '—'}</span>,
        },
        { key: 'recorded_by', header: lang === 'th' ? 'โดย' : 'By', render: (m) => <span className="text-xs">{m.recorded_by ?? '—'}</span> },
    ];

    if (!isLoading && moves.length === 0) {
        return (
            <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 py-16 text-sm">
                <History className="text-muted-foreground/50 h-8 w-8" />
                {lang === 'th' ? 'ยังไม่มีการเคลื่อนไหว' : 'No movements yet'}
            </div>
        );
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
