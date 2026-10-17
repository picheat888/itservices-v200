import { useT } from '@/lang';
import { useCurrency } from '@/modules/settings';
import { Column, DataTable } from '@/shared/components/data-table';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { StatusBadge } from '@/shared/components/status-badge';
import { TruncText } from '@/shared/components/trunc-text';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { useDebouncedSearch } from '@/shared/hooks/use-debounced-search';
import { useListParams } from '@/shared/hooks/use-list-params';
import { useLocalPair } from '@/shared/hooks/use-local-name';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { searchLabel } from '@/shared/lib/search-words';
import { TABLE_HEAD } from '@/shared/lib/surface';
import { cn } from '@/shared/lib/utils';
import type { StockMovementType } from '@/shared/types';
import { buttonVariants } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { ArrowRight, Filter, Printer, Search } from 'lucide-react';
import { useId, useState } from 'react';
import { useMovementSerials, useStockMovements } from '../../hooks/use-stock';
import { MV_META, MV_TONE_BG } from '../shared';

// Types offered by the filter (and accepted from ?type=).
const MOVEMENT_TYPES: StockMovementType[] = ['receive', 'issue', 'return', 'transfer'];

// Small section heading inside the detail dialog.
const EYEBROW = 'text-muted-foreground text-xs font-semibold';

export function MovementsTab() {
    const fmt = useDateFormat();
    const t = useT();
    const fmtN = useNumberFormat();
    const pairOf = useLocalPair();
    const { format } = useCurrency();
    const typeFilterId = useId();
    // Type filter, page and rows-per-page live in the URL (?type, ?page, ?per).
    const list = useListParams();
    const { page, perPage } = list;
    const typeParam = list.get('type');
    const type = MOVEMENT_TYPES.includes(typeParam as StockMovementType) ? typeParam : 'all';
    const setType = (value: string) => list.setFilter('type', value === 'all' ? '' : value);
    // Search lives in ?search; the list asks the server once typing pauses.
    const search = list.get('search');
    const sentSearch = useDebouncedSearch(search);
    const {
        data: movementsPage,
        isLoading: movementsLoading,
        isFetching: movementsFetching,
    } = useStockMovements({ type: type === 'all' ? undefined : type, search: sentSearch || undefined, page, per_page: perPage });
    const movements = movementsPage?.data ?? [];
    const [viewMove, setViewMove] = useState<(typeof movements)[number] | null>(null);
    // Open state is separate from the data so the detail stays mounted during the close animation.
    const [moveOpen, setMoveOpen] = useState(false);
    // Serial codes for the movement being viewed (fetched on demand for the detail dialog).
    const { data: moveSerials = [] } = useMovementSerials(viewMove?.id ?? null);

    const columns: Column<(typeof movements)[number]>[] = [
        {
            key: 'doc_no',
            sticky: 'left',
            header: t('stock_doc_no'),
            width: '110px',
            className: 'whitespace-nowrap',
            render: (m) => <span className="text-xs font-semibold">{m.doc_no ?? '—'}</span>,
        },
        {
            key: 'moved_at',
            header: t('audit_time'),
            width: '140px',
            className: 'whitespace-nowrap',
            render: (m) => <span className="text-xs">{fmt.dateTime(m.moved_at)}</span>,
        },
        {
            key: 'type',
            header: t('stock_mv_type'),
            width: '120px',
            className: 'whitespace-nowrap',
            render: (m) => {
                const meta = MV_META[m.type];
                const Icon = meta.icon;
                return (
                    <StatusBadge tone={meta.tone} dot={false}>
                        <Icon className="h-3 w-3" aria-hidden />
                        {t(`stock_mv_${m.type}` as Parameters<typeof t>[0])}
                    </StatusBadge>
                );
            },
        },
        {
            key: 'item',
            header: t('stock_item'),
            minWidth: '12rem',
            render: (m) => (
                <div className="min-w-0">
                    <TruncText text={m.sku} className="text-xs" />
                    <TruncText text={m.item_name} className="text-muted-foreground text-xs" />
                </div>
            ),
        },
        {
            key: 'qty',
            header: t('stock_qty'),
            align: 'right',
            width: '70px',
            render: (m) => <span className="font-bold tabular-nums">{fmtN(m.qty)}</span>,
        },
        {
            key: 'unit_cost',
            header: t('stock_unit_cost_short'),
            align: 'right',
            width: '110px',
            className: 'whitespace-nowrap',
            render: (m) => <span className="text-xs tabular-nums">{m.unit_cost != null ? format(m.unit_cost) : '—'}</span>,
        },
        {
            key: 'value',
            header: t('stock_value'),
            align: 'right',
            width: '120px',
            className: 'whitespace-nowrap',
            render: (m) => <span className="text-xs tabular-nums">{m.unit_cost != null ? format(m.unit_cost * m.qty) : '—'}</span>,
        },
        { key: 'from', header: t('stock_events_from'), width: '130px', render: (m) => <TruncText text={m.from} className="text-sm" /> },
        { key: 'to', header: t('stock_events_to'), width: '130px', render: (m) => <TruncText text={m.to} className="text-sm" /> },
        {
            key: 'reference',
            header: t('stock_reference'),
            width: '140px',
            render: (m) => <TruncText text={m.reference} className="text-muted-foreground text-xs" />,
        },
        {
            key: 'recorded_by',
            header: t('stock_by'),
            width: '150px',
            render: (m) => <TruncText text={pairOf(m.recorded_by, m.recorded_by_th)} className="text-sm" />,
        },
        {
            key: 'notes',
            header: t('stock_notes'),
            minWidth: '12rem',
            render: (m) => <TruncText text={m.notes} className="text-muted-foreground text-xs" />,
        },
    ];

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full max-w-xs">
                    <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" aria-hidden />
                    <Input
                        value={search}
                        onChange={(e) => list.setFilter('search', e.target.value)}
                        placeholder={t('stock_movements_tab_search')}
                        aria-label={searchLabel(t('stock_movements_tab_search'))}
                        name="search"
                        autoComplete="off"
                        className="pl-9 text-ellipsis"
                    />
                </div>
                {/* Inline type filter: icon + label + dropdown (no popover). */}
                <div className="flex flex-wrap items-center gap-1.5">
                    <Filter className="text-muted-foreground h-3.5 w-3.5 shrink-0" aria-hidden />
                    <label htmlFor={typeFilterId} className="text-muted-foreground shrink-0 text-sm font-medium">
                        {t('stock_mv_type')}
                    </label>
                    <div className="w-44">
                        <SearchableSelect
                            id={typeFilterId}
                            value={type}
                            onChange={setType}
                            options={[
                                { value: 'all', label: t('stock_all_types'), search: t('stock_all_types') },
                                ...MOVEMENT_TYPES.map((k) => ({
                                    value: k,
                                    label: t(`stock_mv_${k}` as Parameters<typeof t>[0]),
                                    search: t(`stock_mv_${k}` as Parameters<typeof t>[0]),
                                })),
                            ]}
                        />
                    </div>
                </div>
            </div>
            <DataTable
                columns={columns}
                rows={movements}
                rowKey={(m) => m.id}
                onRowClick={(m) => {
                    setViewMove(m);
                    setMoveOpen(true);
                }}
                loading={movementsLoading || movementsFetching}
                server={{ ...list.table.paging, total: movementsPage?.meta.total ?? 0 }}
                empty={
                    type !== 'all' || search.trim() !== ''
                        ? { kind: 'search', title: t('stock_empty_movements_search'), hint: t('stock_empty_movements_search_hint') }
                        : { title: t('stock_empty_movements'), hint: t('stock_empty_movements_hint') }
                }
            />

            {/* Movement detail — the per-entry audit-log view. */}
            <Dialog open={moveOpen} onOpenChange={(o) => !o && setMoveOpen(false)}>
                <DialogContent className="max-w-md">
                    {viewMove &&
                        (() => {
                            const meta = MV_META[viewMove.type];
                            const Icon = meta.icon;
                            const inbound = ['receive', 'return', 'adjust_up'].includes(viewMove.type);
                            return (
                                <>
                                    <DialogHeader>
                                        <div className="flex items-start gap-3 pt-4 text-left">
                                            {/* Type icon — tinted by movement tone. */}
                                            <span
                                                className={cn(
                                                    'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl',
                                                    MV_TONE_BG[meta.tone],
                                                )}
                                                aria-hidden
                                            >
                                                <Icon className="h-6 w-6" />
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-start justify-between gap-2">
                                                    <DialogTitle className="min-w-0 truncate text-base leading-tight font-semibold">
                                                        {t(`stock_mv_${viewMove.type}` as Parameters<typeof t>[0])}
                                                    </DialogTitle>
                                                    <span className="text-muted-foreground shrink-0 text-[11px]">
                                                        {fmt.dateTime(viewMove.moved_at)}
                                                    </span>
                                                </div>
                                                <DialogDescription className="mt-0.5 text-[11px]">
                                                    {t('stock_doc_no')}: {viewMove.doc_no ?? '—'}
                                                </DialogDescription>
                                                {viewMove.reference && (
                                                    <div className="text-muted-foreground text-[11px]">
                                                        {t('stock_reference')}: {viewMove.reference}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </DialogHeader>

                                    <div className="max-h-[72vh] space-y-4 overflow-auto overscroll-contain">
                                        {/* Item + signed quantity */}
                                        <div className="border-border flex items-center justify-between gap-3 rounded-xl border p-3.5">
                                            <div className="min-w-0">
                                                <div className="truncate text-sm font-semibold">{viewMove.item_name}</div>
                                                <div className="text-muted-foreground text-xs">
                                                    {t('stock_sku')}: {viewMove.sku}
                                                </div>
                                            </div>
                                            <div
                                                className={cn(
                                                    'shrink-0 text-2xl font-bold tabular-nums',
                                                    inbound ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive',
                                                )}
                                            >
                                                {inbound ? '+' : '−'}
                                                {fmtN(viewMove.qty)}
                                            </div>
                                        </div>

                                        {/* Source → destination (a return has no source; adjustments have neither). */}
                                        {!viewMove.from && viewMove.to ? (
                                            <div className="border-border rounded-xl border p-3">
                                                <div className={EYEBROW}>{viewMove.type === 'return' ? t('stock_to_warehouse') : t('stock_to')}</div>
                                                <div className="truncate text-sm">{viewMove.to}</div>
                                            </div>
                                        ) : viewMove.from || viewMove.to ? (
                                            <div className="border-border grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl border p-3">
                                                <div className="min-w-0">
                                                    <div className={EYEBROW}>
                                                        {viewMove.type === 'receive' ? t('stock_supplier') : t('stock_from')}
                                                    </div>
                                                    <div className="truncate text-sm">{viewMove.from || '—'}</div>
                                                </div>
                                                <ArrowRight className="text-muted-foreground h-4 w-4 shrink-0" aria-hidden />
                                                <div className="min-w-0 text-right">
                                                    <div className={EYEBROW}>
                                                        {viewMove.type === 'receive' ? t('stock_warehouse') : t('stock_to')}
                                                    </div>
                                                    <div className="truncate text-sm">{viewMove.to || '—'}</div>
                                                </div>
                                            </div>
                                        ) : null}

                                        {/* Value: unit cost, qty, total (receive lots only) */}
                                        {viewMove.unit_cost != null && (
                                            <div>
                                                <div className={cn(EYEBROW, 'mb-1')}>{t('stock_value')}</div>
                                                <div className="border-border grid grid-cols-3 overflow-hidden rounded-lg border text-center text-sm">
                                                    <div className="bg-card px-2 py-2">
                                                        <div className={EYEBROW}>{t('stock_unit_cost')}</div>
                                                        <div className="mt-0.5 tabular-nums">{format(viewMove.unit_cost)}</div>
                                                    </div>
                                                    <div className="border-border bg-card border-l px-2 py-2">
                                                        <div className={EYEBROW}>{t('stock_qty')}</div>
                                                        <div className="mt-0.5 tabular-nums">{fmtN(viewMove.qty)}</div>
                                                    </div>
                                                    <div className="border-border bg-card border-l px-2 py-2">
                                                        <div className={EYEBROW}>{t('stock_mv_total')}</div>
                                                        <div className="mt-0.5 font-bold text-emerald-700 tabular-nums dark:text-emerald-400">
                                                            {format(viewMove.qty * viewMove.unit_cost)}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Serial list + reprint labels (retroactive, e.g. for a Receive) */}
                                        {moveSerials.length > 0 && (
                                            <div>
                                                <div className="mb-1 flex items-center justify-between gap-2">
                                                    <span className={EYEBROW}>{t('stock_serial_list')}</span>
                                                    <a
                                                        href={`/pdf/stock-movements/${viewMove.id}/labels`}
                                                        target="_blank"
                                                        rel="noopener"
                                                        className={buttonVariants({ variant: 'outline', size: 'sm' })}
                                                    >
                                                        <Printer className="h-3.5 w-3.5" aria-hidden />
                                                        {t('stock_print')}
                                                    </a>
                                                </div>
                                                <div className="border-border max-h-48 overflow-auto overscroll-contain rounded-lg border">
                                                    <table className="w-full text-sm">
                                                        <thead className={cn(TABLE_HEAD, 'sticky top-0')}>
                                                            <tr className="text-muted-foreground text-left text-xs font-semibold">
                                                                <th scope="col" className="w-10 px-3 py-1.5">
                                                                    #
                                                                </th>
                                                                <th scope="col" className="px-3 py-1.5">
                                                                    {t('stock_hist_serial')}
                                                                </th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {moveSerials.map((s, i) => (
                                                                <tr key={s} className="border-border/60 border-t">
                                                                    <td className="text-muted-foreground px-3 py-1.5 text-xs whitespace-nowrap tabular-nums">
                                                                        {i + 1}
                                                                    </td>
                                                                    <td className="px-3 py-1.5 text-xs whitespace-nowrap">{s}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        )}

                                        {/* Notes */}
                                        {viewMove.notes && (
                                            <div>
                                                <div className={cn(EYEBROW, 'mb-1')}>{t('stock_notes')}</div>
                                                <div className="bg-muted/40 rounded-lg p-3 text-sm">{viewMove.notes}</div>
                                            </div>
                                        )}

                                        {/* Recorded by (type-aware label) */}
                                        <div>
                                            <div className={EYEBROW}>
                                                {t(`stock_mv_${viewMove.type}` as Parameters<typeof t>[0])} {t('stock_by')}
                                            </div>
                                            <div className="text-sm">{pairOf(viewMove.recorded_by, viewMove.recorded_by_th) || '—'}</div>
                                        </div>
                                    </div>
                                </>
                            );
                        })()}
                </DialogContent>
            </Dialog>
        </div>
    );
}
