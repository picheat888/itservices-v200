import { StatusBadge } from '@/components/shared/status-badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useStockItem } from '@/hooks/use-stock';
import { useCurrency } from '@/hooks/use-settings';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { StockItemStatus, StockSerialStatus } from '@/types';
import { Box, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';

const ITEM_TONE: Record<StockItemStatus, 'green' | 'amber' | 'red' | 'blue' | 'gray'> = {
    ok: 'green',
    low: 'amber',
    out: 'red',
    over: 'blue',
    dead: 'gray',
};

const SN_TONE: Record<StockSerialStatus, 'green' | 'violet' | 'blue' | 'gray'> = {
    in_stock: 'green',
    issued: 'violet',
    returned: 'blue',
    retired: 'gray',
};

/** A single label/value pair in the detail grid. */
function Kv({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div>
            <div className="text-muted-foreground text-[11px]">{label}</div>
            <div className="text-sm">{children}</div>
        </div>
    );
}

/**
 * StockItemDetailModal — read-only view of a SKU: its key attributes plus, for
 * serialized items, the full list of per-unit serials with status and receive date.
 */
export function StockItemDetailModal({ itemId, onClose }: { itemId: number | null; onClose: () => void }) {
    const t = useT();
    const { symbol } = useCurrency();
    const { data: item, isLoading } = useStockItem(itemId);
    const open = itemId !== null;

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{t('stock_detail')}</DialogTitle>
                </DialogHeader>
                {isLoading || !item ? (
                    <div className="space-y-4">
                        <div className="flex items-start justify-between gap-3">
                            <div className="space-y-2">
                                <div className="bg-muted h-5 w-40 animate-pulse rounded" />
                                <div className="bg-muted h-3 w-56 animate-pulse rounded" />
                            </div>
                            <div className="bg-muted h-6 w-24 animate-pulse rounded-full" />
                        </div>
                        <div className="bg-muted/30 grid grid-cols-2 gap-3 rounded-lg p-4 sm:grid-cols-3">
                            {Array.from({ length: 6 }).map((_, i) => (
                                <div key={i} className="space-y-1.5">
                                    <div className="bg-muted h-2.5 w-14 animate-pulse rounded" />
                                    <div className="bg-muted h-4 w-20 animate-pulse rounded" />
                                </div>
                            ))}
                        </div>
                        <div className="bg-muted/50 h-40 animate-pulse rounded-lg" />
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Header: name, identity, status + tracking mode */}
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="text-base font-semibold">{item.name}</div>
                                <div className="text-muted-foreground font-mono text-xs">
                                    {item.sku} · {[item.brand, item.model].filter(Boolean).join(' ') || '—'}
                                </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                                <StatusBadge tone={ITEM_TONE[item.status]}>
                                    {t(`stock_st_${item.status}` as Parameters<typeof t>[0])}
                                </StatusBadge>
                                <span
                                    className={cn(
                                        'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium',
                                        item.track_serial ? 'bg-brand/10 text-brand' : 'bg-muted text-muted-foreground',
                                    )}
                                >
                                    {item.track_serial ? <ShieldCheck className="h-3 w-3" /> : <Box className="h-3 w-3" />}
                                    {item.track_serial ? t('stock_serialized') : t('stock_qty_only')}
                                </span>
                            </div>
                        </div>

                        {/* Attribute grid */}
                        <div className="bg-muted/30 grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg p-4 sm:grid-cols-3">
                            <Kv label={t('stock_category')}>{item.category ?? '—'}</Kv>
                            <Kv label={t('stock_warehouse')}>{item.warehouse ?? '—'}</Kv>
                            <Kv label={t('stock_current')}>
                                <span className="font-mono font-bold">
                                    {item.current_stock} {item.unit}
                                </span>
                            </Kv>
                            <Kv label="Min / Max">
                                <span className="font-mono">
                                    {item.min_stock} / {item.max_stock}
                                </span>
                            </Kv>
                            <Kv label={t('stock_avg_cost')}>
                                <span className="font-mono">
                                    {symbol}
                                    {item.cost.toLocaleString()}
                                </span>
                            </Kv>
                            <Kv label={t('stock_supplier')}>{item.supplier ?? '—'}</Kv>
                            <Kv label={t('stock_warranty')}>{item.warranty ?? '—'}</Kv>
                        </div>

                        {/* FIFO cost lots — where each receive's unit cost & remaining value live */}
                        <div>
                            <div className="text-muted-foreground mb-2 flex items-center justify-between text-xs font-semibold tracking-wide uppercase">
                                <span>{t('stock_lots_title')}</span>
                                <span className="font-mono">
                                    {symbol}
                                    {item.total_value.toLocaleString()}
                                </span>
                            </div>
                            {item.lots && item.lots.length > 0 ? (
                                <div className="border-border overflow-hidden rounded-lg border">
                                    <table className="w-full text-sm">
                                        <thead className="bg-muted/40">
                                            <tr className="border-border text-muted-foreground border-b text-left text-[11.5px] uppercase">
                                                <th className="px-3 py-2">{t('stock_serial_received')}</th>
                                                <th className="px-3 py-2 text-right">{t('stock_unit_cost')}</th>
                                                <th className="px-3 py-2 text-right">{t('stock_lot_remaining')}</th>
                                                <th className="px-3 py-2 text-right">{t('stock_lot_value')}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {item.lots.map((l) => (
                                                <tr key={l.id} className="border-border/60 border-b last:border-0">
                                                    <td className="text-muted-foreground px-3 py-1.5 font-mono text-xs">{l.received_at?.slice(0, 10) ?? '—'}</td>
                                                    <td className="px-3 py-1.5 text-right font-mono text-xs">
                                                        {symbol}
                                                        {l.unit_cost.toLocaleString()}
                                                    </td>
                                                    <td className="px-3 py-1.5 text-right font-mono">
                                                        {l.qty_remaining}
                                                        <span className="text-muted-foreground">/{l.qty_received}</span>
                                                    </td>
                                                    <td className="px-3 py-1.5 text-right font-mono font-semibold">
                                                        {symbol}
                                                        {l.value.toLocaleString()}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="text-muted-foreground rounded-md border border-dashed py-5 text-center text-xs">{t('stock_no_lots')}</div>
                            )}
                        </div>

                        {/* Serials */}
                        {item.track_serial ? (
                            <div>
                                <div className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
                                    {t('stock_serial_list')} <span className="font-mono">{item.serials?.length ?? 0}</span>
                                </div>
                                {item.serials && item.serials.length > 0 ? (
                                    <div className="border-border max-h-72 overflow-auto rounded-lg border">
                                        <table className="w-full text-sm">
                                            <thead className="bg-muted/40 sticky top-0">
                                                <tr className="border-border text-muted-foreground border-b text-left text-[11.5px] uppercase">
                                                    <th className="w-8 px-3 py-2">#</th>
                                                    <th className="px-3 py-2">Serial</th>
                                                    <th className="px-3 py-2">{t('status')}</th>
                                                    <th className="px-3 py-2">{t('stock_warehouse')}</th>
                                                    <th className="px-3 py-2">{t('stock_serial_received')}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {item.serials.map((s, i) => (
                                                    <tr key={s.id} className="border-border/60 border-b last:border-0">
                                                        <td className="text-muted-foreground px-3 py-1.5 font-mono text-xs">{i + 1}</td>
                                                        <td className="px-3 py-1.5 font-mono">{s.serial}</td>
                                                        <td className="px-3 py-1.5">
                                                            <StatusBadge tone={SN_TONE[s.status]}>
                                                                {t(`stock_sn_${s.status}` as Parameters<typeof t>[0])}
                                                            </StatusBadge>
                                                        </td>
                                                        <td className="px-3 py-1.5">{s.warehouse ?? '—'}</td>
                                                        <td className="text-muted-foreground px-3 py-1.5 font-mono text-xs">
                                                            {s.received_at?.slice(0, 10) ?? '—'}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <div className="text-muted-foreground rounded-md border border-dashed py-6 text-center text-xs">
                                        {t('stock_no_serials')}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="text-muted-foreground flex items-center gap-2 rounded-md border border-dashed p-3 text-xs">
                                <Box className="h-4 w-4" />
                                {t('stock_not_serialized_note')}
                            </div>
                        )}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
