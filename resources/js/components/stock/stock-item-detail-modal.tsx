import { StatusBadge } from '@/components/shared/status-badge';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useCurrency } from '@/hooks/use-settings';
import { useStockItem } from '@/hooks/use-stock';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { StockItemStatus, StockSerialStatus } from '@/types';
import { Box, ChevronDown, ChevronLeft, ChevronRight, History, ShieldCheck, Warehouse } from 'lucide-react';
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

/** Rows shown per page in the lot and serial tables. */
const LOTS_PER_PAGE = 10;
const SERIALS_PER_PAGE = 10;

/** A small label/value pair used in the meta row. */
function Meta({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="min-w-0">
            <div className="text-muted-foreground text-[11px] tracking-wide uppercase">{label}</div>
            <div className="truncate text-sm">{children}</div>
        </div>
    );
}

/** A bold KPI cell in the stat strip. */
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
function Pager({
    page,
    pageCount,
    total,
    perPage,
    onPage,
}: {
    page: number;
    pageCount: number;
    total: number;
    perPage: number;
    onPage: (p: number) => void;
}) {
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
 * StockItemDetailModal — read-only view of a SKU. The dialog is height-capped with
 * a fixed header and a scrolling body. The FIFO-lot and serial tables each page at
 * 10 rows so SKUs with many receives / units stay compact inside the viewport.
 */
export function StockItemDetailModal({ itemId, onClose }: { itemId: number | null; onClose: () => void }) {
    const t = useT();
    const { symbol, format } = useCurrency();
    const { data: item, isLoading } = useStockItem(itemId);
    const open = itemId !== null;

    // Independent page indexes for the two paged tables; reset when the SKU changes.
    const [lotPage, setLotPage] = useState(0);
    const [serialPage, setSerialPage] = useState(0);
    // Which lot row is expanded to show its receive details (one at a time).
    const [expandedLot, setExpandedLot] = useState<number | null>(null);
    useEffect(() => {
        setLotPage(0);
        setSerialPage(0);
        setExpandedLot(null);
    }, [itemId]);

    const balances = useMemo(() => (item?.balances ?? []).filter((b) => b.qty > 0), [item]);

    // Only show lots that still have stock on hand; fully-consumed lots (remaining 0) are hidden.
    const lots = (item?.lots ?? []).filter((l) => l.qty_remaining > 0);
    const lotPageCount = Math.max(1, Math.ceil(lots.length / LOTS_PER_PAGE));
    const pagedLots = lots.slice(lotPage * LOTS_PER_PAGE, lotPage * LOTS_PER_PAGE + LOTS_PER_PAGE);

    // Issued units have left stock — only show serials still on hand.
    const serials = (item?.serials ?? []).filter((s) => s.status !== 'issued');
    const serialPageCount = Math.max(1, Math.ceil(serials.length / SERIALS_PER_PAGE));
    const pagedSerials = serials.slice(serialPage * SERIALS_PER_PAGE, serialPage * SERIALS_PER_PAGE + SERIALS_PER_PAGE);

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="flex max-h-[88vh] w-full max-w-3xl flex-col gap-0 overflow-hidden p-0">
                {/* ── Fixed header band (pr clears the close button) ───────────────── */}
                <div className="border-border bg-card border-b px-6 py-4 pr-12">
                    {isLoading || !item ? (
                        <>
                            <DialogTitle className="text-base">{t('stock_detail')}</DialogTitle>
                            <div className="bg-muted mt-2 h-3 w-56 animate-pulse rounded" />
                        </>
                    ) : (
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <DialogTitle className="truncate text-base leading-tight font-semibold">{item.name}</DialogTitle>
                                <div className="text-muted-foreground mt-1 font-mono text-xs">
                                    {item.sku} · {[item.brand, item.model].filter(Boolean).join(' ') || '—'}
                                </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => window.open(`/stock/items/${item.id}/history`, '_blank')}
                                    title={t('stock_history')}
                                    className="border-border hover:bg-muted/50 inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium"
                                >
                                    <History className="h-3 w-3" />
                                    {t('stock_history')}
                                </button>
                                <StatusBadge tone={ITEM_TONE[item.status]}>{t(`stock_st_${item.status}` as Parameters<typeof t>[0])}</StatusBadge>
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
                    )}
                </div>

                {/* ── Scrolling body ──────────────────────────────────────────────── */}
                {isLoading || !item ? (
                    <div className="space-y-4 px-6 py-5">
                        <div className="bg-muted/50 h-20 animate-pulse rounded-xl" />
                        <div className="bg-muted/40 h-32 animate-pulse rounded-lg" />
                        <div className="bg-muted/30 h-48 animate-pulse rounded-lg" />
                    </div>
                ) : (
                    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
                        {/* KPI strip */}
                        <div className="border-border bg-muted/20 divide-border/70 grid grid-cols-3 divide-x rounded-xl border">
                            <Stat
                                label={t('stock_current')}
                                value={item.current_stock.toLocaleString()}
                                sub={<span className="lowercase">{item.unit}</span>}
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

                        {/* Meta row */}
                        <div className="grid grid-cols-3 gap-x-6 gap-y-3">
                            <Meta label={t('stock_category')}>{item.category ?? '—'}</Meta>
                            <Meta label="Min / Max">
                                <span className="font-mono">
                                    {item.min_stock} / {item.max_stock}
                                </span>
                            </Meta>
                            <Meta label={t('stock_warranty')}>{item.warranty ?? '—'}</Meta>
                        </div>

                        {/* Per-warehouse balances as cards */}
                        <div>
                            <SectionLabel>{t('stock_by_warehouse')}</SectionLabel>
                            {balances.length > 0 ? (
                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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

                        {/* FIFO cost lots — paged 10 per page */}
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
                                                        {/* Click a lot row to drill into its receive (PO / warehouse / supplier). */}
                                                        <tr
                                                            onClick={() => setExpandedLot((id) => (id === l.id ? null : l.id))}
                                                            className={cn(
                                                                'hover:bg-accent/40 cursor-pointer border-b transition-colors',
                                                                expanded ? 'bg-accent/30 border-transparent' : 'border-border/60',
                                                            )}
                                                        >
                                                            <td className="px-3 py-1.5 font-mono text-xs">
                                                                <span className="inline-flex items-center gap-1.5">
                                                                    <ChevronDown
                                                                        className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')}
                                                                    />
                                                                    {l.doc_no ?? '—'}
                                                                </span>
                                                            </td>
                                                            <td className="text-muted-foreground px-3 py-1.5 font-mono text-xs">
                                                                {l.received_at?.slice(0, 10) ?? '—'}
                                                            </td>
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
                                                                        <Meta label={t('stock_serial_received')}>
                                                                            {l.received_at?.slice(0, 10) ?? '—'}
                                                                        </Meta>
                                                                        <Meta label={t('stock_qty')}>
                                                                            <span className="font-mono">
                                                                                {l.qty_remaining}/{l.qty_received}
                                                                            </span>
                                                                        </Meta>
                                                                    </div>
                                                                    {l.notes && (
                                                                        <div className="text-muted-foreground mt-2.5 text-xs">
                                                                            <span className="tracking-wide uppercase">{t('stock_notes')}:</span>{' '}
                                                                            {l.notes}
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
                                        <Pager
                                            page={lotPage}
                                            pageCount={lotPageCount}
                                            total={lots.length}
                                            perPage={LOTS_PER_PAGE}
                                            onPage={setLotPage}
                                        />
                                    )}
                                </div>
                            ) : (
                                <div className="text-muted-foreground rounded-lg border border-dashed py-5 text-center text-xs">
                                    {t('stock_no_lots')}
                                </div>
                            )}
                        </div>

                        {/* Serials — table, paged 10 per page */}
                        {item.track_serial ? (
                            <div>
                                <SectionLabel right={<span className="text-muted-foreground">{serials.length}</span>}>
                                    {t('stock_serial_list')}
                                </SectionLabel>
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
                                                        <td className="text-muted-foreground px-3 py-1.5 font-mono text-xs">
                                                            {serialPage * SERIALS_PER_PAGE + i + 1}
                                                        </td>
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
                                        {serials.length > SERIALS_PER_PAGE && (
                                            <Pager
                                                page={serialPage}
                                                pageCount={serialPageCount}
                                                total={serials.length}
                                                perPage={SERIALS_PER_PAGE}
                                                onPage={setSerialPage}
                                            />
                                        )}
                                    </div>
                                ) : (
                                    <div className="text-muted-foreground rounded-lg border border-dashed py-6 text-center text-xs">
                                        {t('stock_no_serials')}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="text-muted-foreground flex items-center gap-2 rounded-lg border border-dashed p-3 text-xs">
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
