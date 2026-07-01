import { Column, DataTable } from '@/shared/components/data-table';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { StatusBadge } from '@/shared/components/status-badge';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { useCurrency, useDateTime } from '@/hooks/use-settings';
import { useMovementSerials, useStockMovements } from '@/hooks/use-stock';
import { useT } from '@/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { useUiStore } from '@/stores/ui';
import type { StockMovementType } from '@/shared/types';
import { ArrowRight, Filter, Printer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { MV_META, MV_TONE_BG } from '../shared';

export function MovementsTab() {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { format } = useCurrency();
    const { format: fmtDateTime } = useDateTime();
    const [type, setType] = useState('all');
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(20);
    // Changing the type filter resets to page 1 (the result set changes).
    useEffect(() => {
        setPage(1);
    }, [type]);
    const {
        data: movementsPage,
        isLoading: movementsLoading,
        isFetching: movementsFetching,
    } = useStockMovements({ type: type === 'all' ? undefined : type, page, per_page: perPage });
    const movements = movementsPage?.data ?? [];
    const [viewMove, setViewMove] = useState<(typeof movements)[number] | null>(null);
    // Open state is separate from the data so the detail content stays mounted while the
    // dialog animates closed (Radix only plays the exit animation if content isn't unmounted).
    const [moveOpen, setMoveOpen] = useState(false);
    // Serial codes for the movement being viewed (fetched on demand for the detail dialog).
    const { data: moveSerials = [] } = useMovementSerials(viewMove?.id ?? null);

    const columns: Column<(typeof movements)[number]>[] = [
        {
            key: 'doc_no',
            header: t('stock_doc_no'),
            render: (m) => <span className="font-mono text-xs font-semibold">{m.doc_no ?? '—'}</span>,
        },
        { key: 'moved_at', header: t('audit_time'), render: (m) => <span className="font-mono text-xs">{fmtDateTime(m.moved_at)}</span> },
        {
            key: 'type',
            header: t('stock_mv_type'),
            render: (m) => {
                const meta = MV_META[m.type];
                const Icon = meta.icon;
                return (
                    <StatusBadge tone={meta.tone} dot={false}>
                        <Icon className="h-3 w-3" />
                        {t(`stock_mv_${m.type}` as Parameters<typeof t>[0])}
                    </StatusBadge>
                );
            },
        },
        {
            key: 'item',
            header: t('stock_item'),
            render: (m) => (
                <div>
                    <div className="font-mono text-xs">{m.sku}</div>
                    <div className="text-muted-foreground truncate text-xs">{m.item_name}</div>
                </div>
            ),
        },
        { key: 'qty', header: t('stock_qty'), align: 'right', render: (m) => <span className="font-mono font-bold">{m.qty}</span> },
        { key: 'from', header: t('stock_events_from'), render: (m) => <span className="text-sm">{m.from || '—'}</span> },
        { key: 'to', header: t('stock_events_to'), render: (m) => <span className="text-sm">{m.to || '—'}</span> },
        {
            key: 'reference',
            header: t('stock_reference'),
            render: (m) => <span className="text-muted-foreground font-mono text-xs">{m.reference || '—'}</span>,
        },
        { key: 'recorded_by', header: t('stock_by'), render: (m) => <span className="text-sm">{m.recorded_by || '—'}</span> },
    ];

    return (
        <div className="space-y-3">
            {/* Inline type filter: icon + label + dropdown (no popover). */}
            <div className="flex flex-wrap items-center gap-1.5">
                <Filter className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
                <span className="text-muted-foreground shrink-0 text-sm font-medium">{lang === 'th' ? 'ประเภท:' : 'Filter:'}</span>
                <div className="w-44">
                    <SearchableSelect
                        value={type}
                        onChange={setType}
                        options={[
                            { value: 'all', label: t('stock_all_types'), search: t('stock_all_types') },
                            ...(['receive', 'issue', 'return', 'transfer'] as StockMovementType[]).map((k) => ({
                                value: k,
                                label: t(`stock_mv_${k}` as Parameters<typeof t>[0]),
                                search: t(`stock_mv_${k}` as Parameters<typeof t>[0]),
                            })),
                        ]}
                    />
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
                server={{
                    page,
                    pageSize: perPage,
                    total: movementsPage?.meta.total ?? 0,
                    onPageChange: setPage,
                    onPageSizeChange: (s) => {
                        setPerPage(s);
                        setPage(1);
                    },
                }}
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
                                        <DialogTitle className="flex items-start gap-3 pt-4 text-left">
                                            {/* Type icon — tinted by movement tone. */}
                                            <span
                                                className={cn(
                                                    'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl',
                                                    MV_TONE_BG[meta.tone],
                                                )}
                                            >
                                                <Icon className="h-6 w-6" />
                                            </span>
                                            {/* Action label + timestamp, with the document number (and optional
                                                external reference) as the audit record's identity beneath. */}
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-start justify-between gap-2">
                                                    <span className="truncate text-base leading-tight font-semibold">
                                                        {t(`stock_mv_${viewMove.type}` as Parameters<typeof t>[0])}
                                                    </span>
                                                    <span className="text-muted-foreground shrink-0 font-mono text-[11px] font-normal">
                                                        {fmtDateTime(viewMove.moved_at)}
                                                    </span>
                                                </div>
                                                <div className="text-muted-foreground mt-0.5 font-mono text-[11px] font-normal">
                                                    {t('stock_doc_no')} : {viewMove.doc_no ?? '—'}
                                                </div>
                                                {viewMove.reference && (
                                                    <div className="text-muted-foreground font-mono text-[11px] font-normal">
                                                        {t('stock_reference')} : {viewMove.reference}
                                                    </div>
                                                )}
                                            </div>
                                        </DialogTitle>
                                    </DialogHeader>

                                    <div className="max-h-[72vh] space-y-4 overflow-auto">
                                        {/* Item + signed quantity */}
                                        <div className="border-border flex items-center justify-between gap-3 rounded-xl border p-3.5">
                                            <div className="min-w-0">
                                                <div className="truncate text-sm font-semibold">{viewMove.item_name}</div>
                                                <div className="text-muted-foreground font-mono text-xs">SKU : {viewMove.sku}</div>
                                            </div>
                                            <div
                                                className={cn(
                                                    'shrink-0 font-mono text-2xl font-bold',
                                                    inbound ? 'text-emerald-600' : 'text-destructive',
                                                )}
                                            >
                                                {inbound ? '+' : '−'}
                                                {viewMove.qty}
                                            </div>
                                        </div>

                                        {/* Source → destination. A return has no source, so it shows just the
                                            destination warehouse; movements with a source use the From → To flow.
                                            Adjustments have neither, so nothing renders. */}
                                        {!viewMove.from && viewMove.to ? (
                                            <div className="border-border rounded-xl border p-3">
                                                <div className="text-muted-foreground text-[10px] tracking-wide uppercase">
                                                    {viewMove.type === 'return' ? t('stock_to_warehouse') : t('stock_to')}
                                                </div>
                                                <div className="truncate text-sm">{viewMove.to}</div>
                                            </div>
                                        ) : viewMove.from || viewMove.to ? (
                                            <div className="border-border grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl border p-3">
                                                <div className="min-w-0">
                                                    <div className="text-muted-foreground text-[10px] tracking-wide uppercase">
                                                        {viewMove.type === 'receive' ? t('stock_supplier') : t('stock_from')}
                                                    </div>
                                                    <div className="truncate text-sm">{viewMove.from || '—'}</div>
                                                </div>
                                                <ArrowRight className="text-muted-foreground h-4 w-4 shrink-0" />
                                                <div className="min-w-0 text-right">
                                                    <div className="text-muted-foreground text-[10px] tracking-wide uppercase">
                                                        {viewMove.type === 'receive' ? t('stock_warehouse') : t('stock_to')}
                                                    </div>
                                                    <div className="truncate text-sm">{viewMove.to || '—'}</div>
                                                </div>
                                            </div>
                                        ) : null}

                                        {/* Value: unit cost · qty · total (receive lots only) */}
                                        {viewMove.unit_cost != null && (
                                            <div>
                                                <div className="text-muted-foreground mb-1 text-[10px] tracking-wide uppercase">
                                                    {t('stock_value')}
                                                </div>
                                                <div className="border-border grid grid-cols-3 overflow-hidden rounded-lg border text-center text-sm">
                                                    <div className="bg-card px-2 py-2">
                                                        <div className="text-muted-foreground text-[10px] tracking-wide uppercase">
                                                            {t('stock_unit_cost')}
                                                        </div>
                                                        <div className="mt-0.5 font-mono">{format(viewMove.unit_cost)}</div>
                                                    </div>
                                                    <div className="border-border bg-card border-l px-2 py-2">
                                                        <div className="text-muted-foreground text-[10px] tracking-wide uppercase">
                                                            {t('stock_qty')}
                                                        </div>
                                                        <div className="mt-0.5 font-mono">{viewMove.qty}</div>
                                                    </div>
                                                    <div className="border-border bg-card border-l px-2 py-2">
                                                        <div className="text-muted-foreground text-[10px] tracking-wide uppercase">
                                                            {t('stock_mv_total')}
                                                        </div>
                                                        <div className="mt-0.5 font-mono font-bold text-emerald-600">
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
                                                    <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
                                                        {t('stock_serial_list')}
                                                    </span>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => window.open(`/api/stock-movements/${viewMove.id}/labels/pdf`, '_blank')}
                                                    >
                                                        <Printer className="h-3.5 w-3.5" />
                                                        {t('stock_print')}
                                                    </Button>
                                                </div>
                                                <div className="border-border max-h-48 overflow-auto rounded-lg border">
                                                    <table className="w-full text-sm">
                                                        <thead className="bg-muted/40 sticky top-0">
                                                            <tr className="text-muted-foreground text-left text-[10px] tracking-wide uppercase">
                                                                <th className="w-10 px-3 py-1.5">#</th>
                                                                <th className="px-3 py-1.5">{t('stock_hist_serial')}</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {moveSerials.map((s, i) => (
                                                                <tr key={s} className="border-border/60 border-t">
                                                                    <td className="text-muted-foreground px-3 py-1.5 font-mono text-xs">{i + 1}</td>
                                                                    <td className="px-3 py-1.5 font-mono text-xs">{s}</td>
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
                                                <div className="text-muted-foreground mb-1 text-[10px] tracking-wide uppercase">
                                                    {t('stock_notes')}
                                                </div>
                                                <div className="bg-muted/40 rounded-lg p-3 text-sm">{viewMove.notes}</div>
                                            </div>
                                        )}

                                        {/* Recorded by (type-aware label) */}
                                        <div>
                                            <div className="text-muted-foreground text-[10px] tracking-wide uppercase">
                                                {t(`stock_mv_${viewMove.type}` as Parameters<typeof t>[0])} {t('stock_by')}
                                            </div>
                                            <div className="text-sm">{viewMove.recorded_by || '—'}</div>
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
