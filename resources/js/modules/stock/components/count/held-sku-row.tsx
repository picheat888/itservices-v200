// A count picker row that another draft count holds: shown so the list stays whole, never selectable.
import { useT } from '@/lang';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { localPair } from '@/shared/lib/local-name';
import type { StockItem } from '@/shared/types';
import { Checkbox } from '@/shared/ui/checkbox';
import { useUiStore } from '@/stores/ui';
import { SnBadge } from './sn-badge';

/** `qty` defaults to the item's total stock; `serialBadge` adds the S/N tag after the SKU. */
export function HeldSkuRow({
    item,
    reference,
    qty,
    serialBadge = false,
}: {
    item: StockItem;
    reference: string;
    qty?: number;
    serialBadge?: boolean;
}) {
    const t = useT();
    const fmtN = useNumberFormat();
    const lang = useUiStore((s) => s.lang);
    return (
        <div className="border-border/60 bg-muted/30 flex w-full items-center gap-3 border-b px-3 py-2 last:border-0">
            <Checkbox className="size-4" checked={false} disabled aria-label={item.sku} />
            <div className="text-muted-foreground min-w-0 flex-1">
                <div className="text-xs">
                    {item.sku}
                    {serialBadge && item.track_serial && <SnBadge />}
                </div>
                <div className="truncate text-xs">{item.name}</div>
                <div className="text-xs font-medium text-amber-800 dark:text-amber-300">
                    {t('stock_count_held_by').replace('{reference}', reference)}
                </div>
            </div>
            <span className="text-muted-foreground w-32 shrink-0 truncate text-xs">{localPair(item.category, item.category_th, lang) ?? '—'}</span>
            <span className="text-muted-foreground w-12 shrink-0 text-right text-sm font-semibold tabular-nums">
                {fmtN(qty ?? item.current_stock)}
            </span>
        </div>
    );
}
