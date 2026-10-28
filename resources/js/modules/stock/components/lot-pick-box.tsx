// Fulfil dialog: the lots to pick for one warehouse's quantity, oldest first, with the whole-lot mark (board 3).
import { useT } from '@/lang';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { cn } from '@/shared/lib/utils';
import { Package } from 'lucide-react';
import { useId } from 'react';
import { LOT_BOX, LOT_INK } from '../lib/lot-accent';
import { pickLots, type PickableLot } from '../lib/lot-pick';

const CELL = 'border-t border-violet-200/70 px-3 py-2 dark:border-violet-900/60';

export function LotPickBox({ warehouse, qty, lots }: { warehouse: string; qty: number; lots: PickableLot[] }) {
    const t = useT();
    const fmt = useDateFormat();
    const fmtN = useNumberFormat();
    const titleId = useId();
    const picks = pickLots(lots, warehouse, qty);

    if (picks.length === 0) return null;

    return (
        <div className={cn('mx-3 mb-3 overflow-hidden rounded-lg border', LOT_BOX)}>
            <div id={titleId} className={cn('flex items-center gap-1.5 px-3 py-2 text-xs font-semibold', LOT_INK)}>
                <Package className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {t('stock_fulfil_pick_lots')}
            </div>
            <table aria-labelledby={titleId} className="w-full table-fixed border-separate border-spacing-0 text-sm">
                <colgroup>
                    <col />
                    <col className="w-24" />
                    <col className="w-16" />
                </colgroup>
                <thead>
                    <tr className="text-muted-foreground text-left text-xs font-medium">
                        <th scope="col" className="px-3 pb-1.5">
                            {t('stock_lot_word')}
                        </th>
                        <th scope="col" className="px-3 pb-1.5 text-right">
                            {t('stock_fulfil_col_left_in_lot')}
                        </th>
                        <th scope="col" className="px-3 pb-1.5 text-right">
                            {t('stock_fulfil_col_pick')}
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {picks.map((p) => (
                        <tr key={p.lot_id}>
                            <td className={CELL}>
                                <div className="truncate font-semibold tabular-nums" translate="no">
                                    {p.lot_no ?? t('stock_lot_before_tracking')}
                                </div>
                                <div className="text-muted-foreground flex flex-wrap gap-x-2 text-xs">
                                    {p.received_at && <span>{t('stock_fulfil_received_on').replace('{date}', fmt.date(p.received_at))}</span>}
                                    {p.whole && <span className={cn('font-medium', LOT_INK)}>{t('stock_fulfil_take_whole')}</span>}
                                </div>
                            </td>
                            <td className={cn(CELL, 'text-right tabular-nums')}>{fmtN(p.remaining)}</td>
                            <td className={cn(CELL, 'text-right font-bold tabular-nums', LOT_INK)}>{fmtN(p.take)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
