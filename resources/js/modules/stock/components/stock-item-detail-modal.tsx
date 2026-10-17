import { useT } from '@/lang';
import { useCurrency } from '@/modules/settings';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { DialogTabs } from '@/shared/components/dialog-tabs';
import { RecordMissing, recordMissingContentClass } from '@/shared/components/record-missing';
import { RecordStamps } from '@/shared/components/record-stamps';
import { SectionLabel } from '@/shared/components/section-label';
import { StatusBadge } from '@/shared/components/status-badge';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { useRecordView } from '@/shared/hooks/use-record-view';
import { localPair } from '@/shared/lib/local-name';
import { TABLE_HEAD } from '@/shared/lib/surface';
import { cn } from '@/shared/lib/utils';
import type { StockItem, StockItemStatus, StockSerialStatus } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle, focusDialogContentClass } from '@/shared/ui/dialog';
import { useUiStore } from '@/stores/ui';
import { Box, ChevronDown, ChevronLeft, ChevronRight, ExternalLink, History, Package, ShieldCheck, SquarePen, Warehouse } from 'lucide-react';
import { Fragment, useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { useStockItem, useStockItemHistory } from '../hooks/use-stock';
import { StockMovementsTab } from './stock-movements-tab';

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
            <div className="text-muted-foreground text-[11px]">{label}</div>
            <div className="truncate text-sm">{children}</div>
        </div>
    );
}

/** A bold KPI cell in the Overview stat strip. */
function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
    return (
        <div className="px-4 py-3">
            <div className="text-muted-foreground text-[10px] font-medium">{label}</div>
            <div className="mt-0.5 text-xl leading-tight font-bold tabular-nums">{value}</div>
            {sub != null && <div className="text-muted-foreground mt-0.5 text-[11px]">{sub}</div>}
        </div>
    );
}

/** Section heading with an optional value pinned to the right. */
function SectionRow({ children, right }: { children: ReactNode; right?: ReactNode }) {
    return (
        <div className="flex items-start justify-between gap-3">
            <SectionLabel>{children}</SectionLabel>
            {right != null && <span className="text-xs">{right}</span>}
        </div>
    );
}

/** Table footer pager (prev / page-of / next), shared by lots and serials. */
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
    const t = useT();
    const fmtN = useNumberFormat();
    return (
        <div className="border-border bg-muted/20 flex items-center justify-between border-t px-3 py-2">
            <span className="text-muted-foreground text-[11px] tabular-nums">
                {fmtN(page * perPage + 1)}–{fmtN(Math.min((page + 1) * perPage, total))} / {fmtN(total)}
            </span>
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => onPage(Math.max(0, page - 1))}
                    disabled={page === 0}
                    aria-label={t('page_prev')}
                    className="hover:bg-accent focus-visible:ring-ring flex h-8 w-8 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-30"
                >
                    <ChevronLeft className="h-4 w-4" aria-hidden />
                </button>
                <span className="text-xs tabular-nums">
                    {fmtN(page + 1)}/{fmtN(pageCount)}
                </span>
                <button
                    type="button"
                    onClick={() => onPage(Math.min(pageCount - 1, page + 1))}
                    disabled={page >= pageCount - 1}
                    aria-label={t('page_next')}
                    className="hover:bg-accent focus-visible:ring-ring flex h-8 w-8 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-30"
                >
                    <ChevronRight className="h-4 w-4" aria-hidden />
                </button>
            </div>
        </div>
    );
}

/**
 * StockItemDetailModal — read-only SKU detail as a tabbed focus dialog
 * (Overview / Movements / Lots / Serials); the last item is retained through the close animation.
 */
export function StockItemDetailModal({
    itemId,
    onClose,
    onEdit,
}: {
    itemId: number | null;
    onClose: () => void;
    onEdit?: (item: StockItem) => void;
}) {
    const fmt = useDateFormat();
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { symbol, format } = useCurrency();
    const lotDetailId = useId();
    const { data, isError } = useStockItem(itemId);
    // History is fetched here (same query key as the Movements tab) so the tab count is known up front
    const { data: history } = useStockItemHistory(itemId);
    const open = itemId !== null;
    // The id resolved to nothing: the record is gone, or the link was never valid
    const missing = isError && !data;

    // Last item retained for the exit animation, never rendered under another item's id
    const { record: item } = useRecordView(itemId, data);

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
        { id: 'overview', label: t('sub_overview') },
        { id: 'movements', label: t('stock_tab_movements'), count: history?.movements.length },
        { id: 'lots', label: t('stock_tab_lots'), count: lots.length },
        // Serials tab only exists for serialized items
        ...(item?.track_serial ? [{ id: 'serials' as TabId, label: t('stock_tab_serials'), count: serials.length }] : []),
    ];

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            {/* The not-found panel drops the fixed focus height */}
            <DialogContent className={cn(focusDialogContentClass, missing && recordMissingContentClass)}>
                {missing ? (
                    <RecordMissing onClose={onClose} />
                ) : !item ? (
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
                        <FocusDialogHeader
                            icon={Package}
                            eyebrow={t('stock_item_eyebrow')}
                            title={item.name}
                            code={item.sku}
                            srDescription={[item.sku, [item.brand, item.model].filter(Boolean).join(' ')].filter(Boolean).join(': ')}
                            titleSuffix={
                                <span
                                    className={cn(
                                        'inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[11.5px] font-semibold',
                                        item.track_serial ? 'bg-brand/10 text-brand-ink' : 'bg-muted text-muted-foreground',
                                    )}
                                >
                                    {item.track_serial ? <ShieldCheck className="h-3 w-3" aria-hidden /> : <Box className="h-3 w-3" aria-hidden />}
                                    {item.track_serial ? t('stock_serialized') : t('stock_qty_only')}
                                </span>
                            }
                            headerRight={
                                <div className="flex flex-col items-end gap-1">
                                    <StatusBadge tone={ITEM_TONE[item.status]}>{t(`stock_st_${item.status}` as Parameters<typeof t>[0])}</StatusBadge>
                                    <RecordStamps
                                        className="text-right"
                                        createdAt={item.created_at}
                                        createdBy={item.created_by_name}
                                        createdByTh={item.created_by_name_th}
                                        updatedAt={item.updated_at}
                                        updatedBy={item.updated_by_name}
                                        updatedByTh={item.updated_by_name_th}
                                    />
                                </div>
                            }
                        />

                        {/* Tab bar */}
                        <DialogTabs className="px-6" tabs={tabs} active={tab} onChange={setTab} />

                        {/* Body */}
                        <div
                            className={cn(
                                'min-h-0 flex-1 overscroll-contain',
                                tab === 'movements' ? 'overflow-hidden p-6' : 'overflow-y-auto px-6 py-5',
                            )}
                        >
                            {/* Overview */}
                            {tab === 'overview' && (
                                <div className="space-y-5">
                                    <div className="border-border bg-muted/20 divide-border/70 grid grid-cols-3 divide-x rounded-xl border">
                                        <Stat
                                            label={t('stock_current')}
                                            value={item.current_stock.toLocaleString()}
                                            sub={
                                                item.reserved != null && item.reserved > 0 ? (
                                                    <span className="flex flex-wrap gap-x-3">
                                                        <span>{t('stock_reserved_n').replace('{n}', String(item.reserved))}</span>
                                                        <span>{t('stock_free_n').replace('{n}', String(item.current_stock - item.reserved))}</span>
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
                                                    {item.total_value.toLocaleString(undefined, {
                                                        minimumFractionDigits: 2,
                                                        maximumFractionDigits: 2,
                                                    })}
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

                                    <div className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-4">
                                        <Meta label={t('stock_category')}>{localPair(item.category, item.category_th, lang) ?? '—'}</Meta>
                                        <Meta label={t('stock_brand_model')}>{[item.brand, item.model].filter(Boolean).join(' ') || '—'}</Meta>
                                        <Meta label={t('stock_unit')}>{item.unit}</Meta>
                                        <Meta label={t('stock_min_max')}>
                                            <span className="tabular-nums">
                                                {item.min_stock} / {item.max_stock}
                                            </span>
                                        </Meta>
                                        <Meta label={t('stock_warranty')}>{item.warranty ?? '—'}</Meta>
                                        <Meta label={t('stock_last_move')}>
                                            <span>{fmt.date(item.last_move_at)}</span>
                                        </Meta>
                                    </div>

                                    <div>
                                        <SectionLabel>{t('stock_by_warehouse')}</SectionLabel>
                                        {balances.length > 0 ? (
                                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                                {balances.map((b) => (
                                                    <div key={b.warehouse} className="border-border bg-card rounded-lg border px-3 py-2.5">
                                                        <div className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
                                                            <Warehouse className="h-3 w-3 shrink-0" aria-hidden />
                                                            <span className="truncate">{b.warehouse}</span>
                                                        </div>
                                                        <div className="mt-1 text-lg leading-none font-bold tabular-nums">
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
                                    <SectionRow right={format(item.total_value)}>{t('stock_lots_title')}</SectionRow>
                                    {lots.length > 0 ? (
                                        <div className="border-border overflow-x-auto rounded-lg border">
                                            <table className="w-full text-sm">
                                                <thead className={TABLE_HEAD}>
                                                    <tr className="border-border text-muted-foreground border-b text-left text-[11.5px] uppercase">
                                                        <th scope="col" className="px-3 py-2 font-medium">
                                                            {t('stock_hist_receive_no')}
                                                        </th>
                                                        <th scope="col" className="px-3 py-2 font-medium">
                                                            {t('stock_date')}
                                                        </th>
                                                        <th scope="col" className="px-3 py-2 text-right font-medium">
                                                            {t('stock_unit_cost')}
                                                        </th>
                                                        <th scope="col" className="px-3 py-2 text-right font-medium">
                                                            {t('stock_lot_remaining')}
                                                        </th>
                                                        <th scope="col" className="px-3 py-2 text-right font-medium">
                                                            {t('stock_lot_value')}
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {pagedLots.map((l) => {
                                                        const expanded = expandedLot === l.id;
                                                        const detailId = `${lotDetailId}-${l.id}`;
                                                        return (
                                                            <Fragment key={l.id}>
                                                                <tr
                                                                    className={cn(
                                                                        'border-b transition-colors',
                                                                        expanded ? 'bg-accent/30 border-transparent' : 'border-border/60',
                                                                    )}
                                                                >
                                                                    <td className="px-3 py-1.5 text-xs">
                                                                        <button
                                                                            type="button"
                                                                            aria-expanded={expanded}
                                                                            aria-controls={expanded ? detailId : undefined}
                                                                            onClick={() => setExpandedLot((id) => (id === l.id ? null : l.id))}
                                                                            className="hover:bg-accent focus-visible:ring-ring -mx-1 inline-flex min-h-7 items-center gap-1.5 rounded px-1 text-left focus-visible:ring-2 focus-visible:outline-hidden"
                                                                        >
                                                                            <ChevronDown
                                                                                className={cn(
                                                                                    'h-3.5 w-3.5 shrink-0 transition-transform',
                                                                                    expanded && 'rotate-180',
                                                                                )}
                                                                                aria-hidden
                                                                            />
                                                                            <span translate="no">{l.doc_no ?? '—'}</span>
                                                                        </button>
                                                                    </td>
                                                                    <td className="text-muted-foreground px-3 py-1.5 text-xs whitespace-nowrap">
                                                                        {fmt.date(l.received_at)}
                                                                    </td>
                                                                    <td className="px-3 py-1.5 text-right text-xs whitespace-nowrap tabular-nums">
                                                                        {format(l.unit_cost)}
                                                                    </td>
                                                                    <td className="px-3 py-1.5 text-right whitespace-nowrap tabular-nums">
                                                                        {l.qty_remaining}
                                                                        <span className="text-muted-foreground">/{l.qty_received}</span>
                                                                    </td>
                                                                    <td className="px-3 py-1.5 text-right font-semibold whitespace-nowrap tabular-nums">
                                                                        {format(l.value)}
                                                                    </td>
                                                                </tr>
                                                                {expanded && (
                                                                    <tr id={detailId} className="border-border/60 border-b last:border-0">
                                                                        <td colSpan={5} className="bg-muted/20 px-4 py-3">
                                                                            <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 sm:grid-cols-3">
                                                                                <Meta label={t('stock_reference')}>{l.reference || '—'}</Meta>
                                                                                <Meta label={t('stock_warehouse')}>{l.warehouse || '—'}</Meta>
                                                                                <Meta label={t('stock_supplier')}>{l.supplier || '—'}</Meta>
                                                                                <Meta label={t('stock_by')}>
                                                                                    {localPair(l.recorded_by, l.recorded_by_th, lang) || '—'}
                                                                                </Meta>
                                                                                <Meta label={t('stock_serial_received')}>
                                                                                    {fmt.date(l.received_at)}
                                                                                </Meta>
                                                                                <Meta label={t('stock_qty')}>
                                                                                    <span className="tabular-nums">
                                                                                        {l.qty_remaining}/{l.qty_received}
                                                                                    </span>
                                                                                </Meta>
                                                                            </div>
                                                                            {l.notes && (
                                                                                <div className="text-muted-foreground mt-2.5 text-xs">
                                                                                    <span>{t('stock_notes')}:</span> {l.notes}
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
                            )}

                            {/* Serials (tab only present when track_serial) */}
                            {tab === 'serials' && (
                                <div>
                                    <SectionRow right={<span className="text-muted-foreground tabular-nums">{serials.length}</span>}>
                                        {t('stock_serial_list')}
                                    </SectionRow>
                                    {serials.length > 0 ? (
                                        <div className="border-border overflow-x-auto rounded-lg border">
                                            <table className="w-full text-sm">
                                                <thead className={TABLE_HEAD}>
                                                    <tr className="border-border text-muted-foreground border-b text-left text-[11.5px] uppercase">
                                                        <th scope="col" className="w-8 px-3 py-2 font-medium">
                                                            #
                                                        </th>
                                                        <th scope="col" className="px-3 py-2 font-medium">
                                                            {t('stock_hist_serial')}
                                                        </th>
                                                        <th scope="col" className="px-3 py-2 font-medium">
                                                            {t('status')}
                                                        </th>
                                                        <th scope="col" className="px-3 py-2 font-medium">
                                                            {t('stock_warehouse')}
                                                        </th>
                                                        <th scope="col" className="px-3 py-2 font-medium">
                                                            {t('stock_serial_received')}
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {pagedSerials.map((s, i) => (
                                                        <tr key={s.id} className="border-border/60 border-b last:border-0">
                                                            <td className="text-muted-foreground px-3 py-1.5 text-xs whitespace-nowrap tabular-nums">
                                                                {serialPage * SERIALS_PER_PAGE + i + 1}
                                                            </td>
                                                            <td className="px-3 py-1.5" translate="no">
                                                                {s.serial}
                                                            </td>
                                                            <td className="px-3 py-1.5">
                                                                <StatusBadge tone={SN_TONE[s.status]}>
                                                                    {t(`stock_sn_${s.status}` as Parameters<typeof t>[0])}
                                                                </StatusBadge>
                                                            </td>
                                                            <td className="px-3 py-1.5">{s.warehouse ?? '—'}</td>
                                                            <td className="text-muted-foreground px-3 py-1.5 text-xs whitespace-nowrap">
                                                                {fmt.date(s.received_at)}
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
                            )}
                        </div>

                        {/* Footer — full history (left) / Edit (right) */}
                        <div className="border-border/60 bg-muted/30 flex items-center gap-2 border-t px-6 py-3">
                            <a
                                href={`/stock/items/${item.id}/history`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-foreground focus-visible:ring-ring mr-auto inline-flex min-h-8 items-center gap-1.5 rounded text-sm font-medium focus-visible:ring-2 focus-visible:outline-hidden"
                            >
                                <History className="h-4 w-4" aria-hidden />
                                {t('stock_history_full')}
                                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                                <span className="sr-only">{t('stock_opens_new_tab')}</span>
                            </a>
                            {onEdit && (
                                <Button variant="outline" onClick={() => onEdit(item)}>
                                    <SquarePen className="h-4 w-4" aria-hidden />
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
