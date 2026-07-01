import { StockMovementsTab } from '@/components/stock/stock-movements-tab';
import { StatusBadge } from '@/shared/components/status-badge';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/shared/ui/dialog';
import { useCurrency } from '@/hooks/use-settings';
import { useStockItem, useStockItemHistory } from '@/hooks/use-stock';
import { useT } from '@/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { useUiStore } from '@/stores/ui';
import type { StockItem, StockItemStatus, StockSerialStatus } from '@/shared/types';
import { Box, ChevronDown, ChevronLeft, ChevronRight, History, Package, ShieldCheck, SquarePen, Warehouse } from 'lucide-react';
import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';

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
    adjusted: 'gray',
};

const LOTS_PER_PAGE = 10;
const SERIALS_PER_PAGE = 10;

type TabId = 'overview' | 'movements' | 'lots' | 'serials';

/** A small label/value pair used in the meta grid and lot details. */
function Meta({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="min-w-0">
            <div className="text-muted-foreground text-[11px] tracking-wide uppercase">{label}</div>
            <div className="truncate text-sm">{children}</div>
        </div>
    );
}

/** A bold KPI cell in the Overview stat strip. */
function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
    return (
        <div className="px-4 py-3">
            <div className="text-muted-foreground text-[10px] font-medium tracking-wider uppercase">{label}</div>
            <div className="mt-0.5 font-mono text-xl leading-tight font-bold tabular-nums">{value}</div>
            {sub != null && <div className="text-muted-foreground mt-0.5 text-[11px]">{sub}</div>}
        </div>
    );
}

/** Section heading with an optional value pinned to the right. */
function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
    return (
        <div className="mb-2 flex items-center justify-between">
            <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{children}</span>
            {right != null && <span className="font-mono text-xs">{right}</span>}
        </div>
    );
}

/** Reusable table footer pager (prev / page-of / next), shared by lots and serials. */
function Pager({ page, pageCount, total, perPage, onPage }: { page: number; pageCount: number; total: number; perPage: number; onPage: (p: number) => void }) {
    return (
        <div className="border-border bg-muted/20 flex items-center justify-between border-t px-3 py-2">
            <span className="text-muted-foreground font-mono text-[11px]">
                {page * perPage + 1}–{Math.min((page + 1) * perPage, total)} / {total}
            </span>
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => onPage(Math.max(0, page - 1))}
                    disabled={page === 0}
                    aria-label="Previous page"
                    className="hover:bg-accent flex h-6 w-6 items-center justify-center rounded-md transition-colors disabled:pointer-events-none disabled:opacity-30"
                >
                    <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="font-mono text-xs tabular-nums">
                    {page + 1}/{pageCount}
                </span>
                <button
                    type="button"
                    onClick={() => onPage(Math.min(pageCount - 1, page + 1))}
                    disabled={page >= pageCount - 1}
                    aria-label="Next page"
                    className="hover:bg-accent flex h-6 w-6 items-center justify-center rounded-md transition-colors disabled:pointer-events-none disabled:opacity-30"
                >
                    <ChevronRight className="h-4 w-4" />
                </button>
            </div>
        </div>
    );
}

/**
 * StockItemDetailModal — read-only SKU detail as a 1100px tabbed focus dialog
 * (Overview / Movements / Lots / Serials). The dialog stays mounted and toggles
 * `open` so it animates closed; the last item is retained so content doesn't flash
 * to skeleton during the fade-out.
 */
export function StockItemDetailModal({ itemId, onClose, onEdit }: { itemId: number | null; onClose: () => void; onEdit?: (item: StockItem) => void }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { symbol, format } = useCurrency();
    const { data, isLoading } = useStockItem(itemId);
    // History is fetched here (and reused by the Movements tab via the same query key)
    // so the Movements tab count is known up front.
    const { data: history } = useStockItemHistory(itemId);
    const open = itemId !== null;

    // Retain the last loaded item so the dialog renders real content while it animates closed.
    const [shownItem, setShownItem] = useState<StockItem | null>(null);
    useEffect(() => {
        if (data) setShownItem(data);
    }, [data]);
    const item = data ?? shownItem;

    const [tab, setTab] = useState<TabId>('overview');
    const [lotPage, setLotPage] = useState(0);
    const [serialPage, setSerialPage] = useState(0);
    const [expandedLot, setExpandedLot] = useState<number | null>(null);
    useEffect(() => {
        setTab('overview');
        setLotPage(0);
        setSerialPage(0);
        setExpandedLot(null);
    }, [itemId]);

    const balances = useMemo(() => (item?.balances ?? []).filter((b) => b.qty > 0), [item]);
    const lots = (item?.lots ?? []).filter((l) => l.qty_remaining > 0);
    const lotPageCount = Math.max(1, Math.ceil(lots.length / LOTS_PER_PAGE));
    const pagedLots = lots.slice(lotPage * LOTS_PER_PAGE, lotPage * LOTS_PER_PAGE + LOTS_PER_PAGE);
    const serials = (item?.serials ?? []).filter((s) => s.status !== 'issued');
    const serialPageCount = Math.max(1, Math.ceil(serials.length / SERIALS_PER_PAGE));
    const pagedSerials = serials.slice(serialPage * SERIALS_PER_PAGE, serialPage * SERIALS_PER_PAGE + SERIALS_PER_PAGE);

    const tabs: { id: TabId; label: string; count?: number }[] = [
        { id: 'overview', label: lang === 'th' ? 'ภาพรวม' : 'Overview' },
        { id: 'movements', label: lang === 'th' ? 'การเคลื่อนไหว' : 'Movements', count: history?.movements.length },
        { id: 'lots', label: lang === 'th' ? 'ล็อตต้นทุน' : 'Lots', count: lots.length },
        // Serials tab only exists for serialized items.
        ...(item?.track_serial ? [{ id: 'serials' as TabId, label: lang === 'th' ? 'ซีเรียล' : 'Serials', count: serials.length }] : []),
    ];

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="!flex h-[min(860px,calc(100vh-72px))] max-w-[1100px] flex-col gap-0 overflow-hidden p-0">
                {isLoading || !item ? (
                    <div className="space-y-4 px-6 py-6">
                        <DialogTitle className="text-base">{t('stock_detail')}</DialogTitle>
                        <DialogDescription className="sr-only">{t('stock_detail')}</DialogDescription>
                        <div className="bg-muted/50 h-20 animate-pulse rounded-xl" />
                        <div className="bg-muted/40 h-32 animate-pulse rounded-lg" />
                        <div className="bg-muted/30 h-48 animate-pulse rounded-lg" />
                    </div>
                ) : (
                    <>
                        {/* Header */}
                        <div className="flex items-center gap-3 px-6 pt-5 pb-4">
                            <div className="bg-brand/10 text-brand flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
                                <Package className="h-5 w-5" />
                            </div>
                            <div className="min-w-0">
                                <div className="text-muted-foreground text-[10.5px] font-bold tracking-[0.14em] uppercase">
                                    {lang === 'th' ? 'สินค้าคงคลัง' : 'Stock Item'}
                                </div>
                                <DialogTitle className="mt-0.5 flex flex-wrap items-center gap-2 text-base font-extrabold tracking-tight">
                                    <span className="truncate">{item.name}</span>
                                    <span className="bg-brand/10 text-brand shrink-0 rounded-md px-2 py-0.5 font-mono text-xs font-semibold">{item.sku}</span>
                                    <span
                                        className={cn(
                                            'inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[11.5px] font-semibold',
                                            item.track_serial ? 'bg-brand/10 text-brand' : 'bg-muted text-muted-foreground',
                                        )}
                                    >
                                        {item.track_serial ? <ShieldCheck className="h-3 w-3" /> : <Box className="h-3 w-3" />}
                                        {item.track_serial ? t('stock_serialized') : t('stock_qty_only')}
                                    </span>
                                </DialogTitle>
                                <DialogDescription className="sr-only">
                                    {item.sku} · {[item.brand, item.model].filter(Boolean).join(' ')}
                                </DialogDescription>
                            </div>
                            <div className="ml-auto flex shrink-0 items-center gap-2 pr-8">
                                <StatusBadge tone={ITEM_TONE[item.status]}>{t(`stock_st_${item.status}` as Parameters<typeof t>[0])}</StatusBadge>
                            </div>
                        </div>

                        {/* Tab bar */}
                        <div className="border-border/60 flex gap-1 border-b px-6">
                            {tabs.map((tb) => (
                                <button
                                    key={tb.id}
                                    type="button"
                                    onClick={() => setTab(tb.id)}
                                    className={cn(
                                        'relative px-4 py-3 text-sm font-semibold transition-colors',
                                        tab === tb.id ? 'text-brand' : 'text-muted-foreground hover:text-foreground',
                                    )}
                                >
                                    {tb.label}
                                    {tb.count != null && tb.count > 0 && (
                                        <span className="bg-accent ml-1.5 rounded-full px-1.5 py-0.5 font-mono text-[11px]">{tb.count}</span>
                                    )}
                                    {tab === tb.id && <span className="bg-brand absolute inset-x-2 -bottom-px h-0.5 rounded-full" />}
                                </button>
                            ))}
                        </div>

                        {/* Body */}
                        <div className={cn('min-h-0 flex-1', tab === 'movements' ? 'overflow-hidden p-6' : 'overflow-y-auto px-6 py-5')}>
                            {/* Overview */}
                            {tab === 'overview' && (
                                <div className="space-y-5">
                                    <div className="border-border bg-muted/20 divide-border/70 grid grid-cols-3 divide-x rounded-xl border">
                                        <Stat
                                            label={t('stock_current')}
                                            value={item.current_stock.toLocaleString()}
                                            sub={
                                                item.reserved != null && item.reserved > 0 ? (
                                                    <span>
                                                        {lang === 'th' ? `สำรอง ${item.reserved} · ว่าง ${item.current_stock - item.reserved}` : `${item.reserved} reserved · ${item.current_stock - item.reserved} free`}
                                                    </span>
                                                ) : (
                                                    <span className="lowercase">{item.unit}</span>
                                                )
                                            }
                                        />
                                        <Stat
                                            label={t('stock_value')}
                                            value={
                                                <>
                                                    <span className="text-muted-foreground text-sm">{symbol}</span>
                                                    {item.total_value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </>
                                            }
                                        />
                                        <Stat
                                            label={t('stock_avg_cost')}
                                            value={
                                                <>
                                                    <span className="text-muted-foreground text-sm">{symbol}</span>
                                                    {item.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </>
                                            }
                                        />
                                    </div>

                                    <div className="grid grid-cols-4 gap-x-6 gap-y-3">
                                        <Meta label={t('stock_category')}>{item.category ?? '—'}</Meta>
                                        <Meta label={lang === 'th' ? 'ยี่ห้อ / รุ่น' : 'Brand / Model'}>{[item.brand, item.model].filter(Boolean).join(' ') || '—'}</Meta>
                                        <Meta label={lang === 'th' ? 'หน่วย' : 'Unit'}>{item.unit}</Meta>
                                        <Meta label="Min / Max">
                                            <span className="font-mono">
                                                {item.min_stock} / {item.max_stock}
                                            </span>
                                        </Meta>
                                        <Meta label={t('stock_warranty')}>{item.warranty ?? '—'}</Meta>
                                        <Meta label={lang === 'th' ? 'เคลื่อนไหวล่าสุด' : 'Last move'}>
                                            <span className="font-mono">{item.last_move_at?.slice(0, 10) ?? '—'}</span>
                                        </Meta>
                                    </div>

                                    <div>
                                        <SectionLabel>{t('stock_by_warehouse')}</SectionLabel>
                                        {balances.length > 0 ? (
                                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                                {balances.map((b) => (
                                                    <div key={b.warehouse} className="border-border bg-card rounded-lg border px-3 py-2.5">
                                                        <div className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
                                                            <Warehouse className="h-3 w-3 shrink-0" />
                                                            <span className="truncate">{b.warehouse}</span>
                                                        </div>
                                                        <div className="mt-1 font-mono text-lg leading-none font-bold tabular-nums">
                                                            {b.qty}
                                                            <span className="text-muted-foreground ml-1 text-xs font-normal">{item.unit}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="text-muted-foreground rounded-lg border border-dashed py-4 text-center text-xs">—</div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Movements */}
                            {tab === 'movements' && itemId != null && <StockMovementsTab itemId={itemId} />}

                            {/* Lots */}
                            {tab === 'lots' && (
                                <div>
                                    <SectionLabel right={format(item.total_value)}>{t('stock_lots_title')}</SectionLabel>
                                    {lots.length > 0 ? (
                                        <div className="border-border overflow-hidden rounded-lg border">
                                            <table className="w-full text-sm">
                                                <thead className="bg-muted/40">
                                                    <tr className="border-border text-muted-foreground border-b text-left text-[11.5px] uppercase">
                                                        <th className="px-3 py-2 font-medium">{t('stock_hist_receive_no')}</th>
                                                        <th className="px-3 py-2 font-medium">{t('stock_date')}</th>
                                                        <th className="px-3 py-2 text-right font-medium">{t('stock_unit_cost')}</th>
                                                        <th className="px-3 py-2 text-right font-medium">{t('stock_lot_remaining')}</th>
                                                        <th className="px-3 py-2 text-right font-medium">{t('stock_lot_value')}</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {pagedLots.map((l) => {
                                                        const expanded = expandedLot === l.id;
                                                        return (
                                                            <Fragment key={l.id}>
                                                                <tr
                                                                    onClick={() => setExpandedLot((id) => (id === l.id ? null : l.id))}
                                                                    className={cn(
                                                                        'hover:bg-accent/40 cursor-pointer border-b transition-colors',
                                                                        expanded ? 'bg-accent/30 border-transparent' : 'border-border/60',
                                                                    )}
                                                                >
                                                                    <td className="px-3 py-1.5 font-mono text-xs">
                                                                        <span className="inline-flex items-center gap-1.5">
                                                                            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} />
                                                                            {l.doc_no ?? '—'}
                                                                        </span>
                                                                    </td>
                                                                    <td className="text-muted-foreground px-3 py-1.5 font-mono text-xs">{l.received_at?.slice(0, 10) ?? '—'}</td>
                                                                    <td className="px-3 py-1.5 text-right font-mono text-xs">{format(l.unit_cost)}</td>
                                                                    <td className="px-3 py-1.5 text-right font-mono">
                                                                        {l.qty_remaining}
                                                                        <span className="text-muted-foreground">/{l.qty_received}</span>
                                                                    </td>
                                                                    <td className="px-3 py-1.5 text-right font-mono font-semibold">{format(l.value)}</td>
                                                                </tr>
                                                                {expanded && (
                                                                    <tr className="border-border/60 border-b last:border-0">
                                                                        <td colSpan={5} className="bg-muted/20 px-4 py-3">
                                                                            <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 sm:grid-cols-3">
                                                                                <Meta label={t('stock_reference')}>{l.reference || '—'}</Meta>
                                                                                <Meta label={t('stock_warehouse')}>{l.warehouse || '—'}</Meta>
                                                                                <Meta label={t('stock_supplier')}>{l.supplier || '—'}</Meta>
                                                                                <Meta label={t('stock_by')}>{l.recorded_by || '—'}</Meta>
                                                                                <Meta label={t('stock_serial_received')}>{l.received_at?.slice(0, 10) ?? '—'}</Meta>
                                                                                <Meta label={t('stock_qty')}>
                                                                                    <span className="font-mono">
                                                                                        {l.qty_remaining}/{l.qty_received}
                                                                                    </span>
                                                                                </Meta>
                                                                            </div>
                                                                            {l.notes && (
                                                                                <div className="text-muted-foreground mt-2.5 text-xs">
                                                                                    <span className="tracking-wide uppercase">{t('stock_notes')}:</span> {l.notes}
                                                                                </div>
                                                                            )}
                                                                        </td>
                                                                    </tr>
                                                                )}
                                                            </Fragment>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                            {lots.length > LOTS_PER_PAGE && (
                                                <Pager page={lotPage} pageCount={lotPageCount} total={lots.length} perPage={LOTS_PER_PAGE} onPage={setLotPage} />
                                            )}
                                        </div>
                                    ) : (
                                        <div className="text-muted-foreground rounded-lg border border-dashed py-5 text-center text-xs">{t('stock_no_lots')}</div>
                                    )}
                                </div>
                            )}

                            {/* Serials (tab only present when track_serial) */}
                            {tab === 'serials' && (
                                <div>
                                    <SectionLabel right={<span className="text-muted-foreground">{serials.length}</span>}>{t('stock_serial_list')}</SectionLabel>
                                    {serials.length > 0 ? (
                                        <div className="border-border overflow-hidden rounded-lg border">
                                            <table className="w-full text-sm">
                                                <thead className="bg-muted/40">
                                                    <tr className="border-border text-muted-foreground border-b text-left text-[11.5px] uppercase">
                                                        <th className="w-8 px-3 py-2 font-medium">#</th>
                                                        <th className="px-3 py-2 font-medium">Serial</th>
                                                        <th className="px-3 py-2 font-medium">{t('status')}</th>
                                                        <th className="px-3 py-2 font-medium">{t('stock_warehouse')}</th>
                                                        <th className="px-3 py-2 font-medium">{t('stock_serial_received')}</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {pagedSerials.map((s, i) => (
                                                        <tr key={s.id} className="border-border/60 border-b last:border-0">
                                                            <td className="text-muted-foreground px-3 py-1.5 font-mono text-xs">{serialPage * SERIALS_PER_PAGE + i + 1}</td>
                                                            <td className="px-3 py-1.5 font-mono">{s.serial}</td>
                                                            <td className="px-3 py-1.5">
                                                                <StatusBadge tone={SN_TONE[s.status]}>{t(`stock_sn_${s.status}` as Parameters<typeof t>[0])}</StatusBadge>
                                                            </td>
                                                            <td className="px-3 py-1.5">{s.warehouse ?? '—'}</td>
                                                            <td className="text-muted-foreground px-3 py-1.5 font-mono text-xs">{s.received_at?.slice(0, 10) ?? '—'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                            {serials.length > SERIALS_PER_PAGE && (
                                                <Pager page={serialPage} pageCount={serialPageCount} total={serials.length} perPage={SERIALS_PER_PAGE} onPage={setSerialPage} />
                                            )}
                                        </div>
                                    ) : (
                                        <div className="text-muted-foreground rounded-lg border border-dashed py-6 text-center text-xs">{t('stock_no_serials')}</div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Footer — full history (left) / Edit (right) */}
                        <div className="border-border/60 bg-muted/30 flex items-center gap-2 border-t px-6 py-3">
                            <a
                                href={`/stock/items/${item.id}/history`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-foreground mr-auto inline-flex items-center gap-1.5 text-sm font-medium"
                            >
                                <History className="h-4 w-4" />
                                {lang === 'th' ? 'ประวัติทั้งหมด' : 'Full history'}
                            </a>
                            {onEdit && (
                                <Button variant="outline" onClick={() => onEdit(item)}>
                                    <SquarePen className="h-4 w-4" />
                                    {t('edit')}
                                </Button>
                            )}
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
