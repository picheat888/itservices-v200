import { useT } from '@/lang';
import { Column, DataTable } from '@/shared/components/data-table';
import { FormErrorBanner } from '@/shared/components/field';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { StatusBadge, ToneDot } from '@/shared/components/status-badge';
import { TruncText } from '@/shared/components/trunc-text';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { useListParams } from '@/shared/hooks/use-list-params';
import { useLocalPair } from '@/shared/hooks/use-local-name';
import { CARD_HEADING } from '@/shared/lib/surface';
import { cn } from '@/shared/lib/utils';
import type { StockRequest, StockRequestStatus } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { useToastStore } from '@/stores/toast';
import { ArrowUpFromLine, Check, FilePlus2, Filter, X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { useStockItem, useStockRequestActions, useStockRequests } from '../../hooks/use-stock';
import { stockRefusalText } from '../../lib/refusal';

const REQ_TONE: Record<StockRequestStatus, 'amber' | 'blue' | 'green' | 'red'> = {
    pending: 'amber',
    approved: 'blue',
    fulfilled: 'green',
    rejected: 'red',
};

// Statuses offered by the filter (and accepted from ?status=).
const REQUEST_STATUS_FILTERS: StockRequestStatus[] = ['pending', 'approved', 'fulfilled', 'rejected'];

// Small section heading inside the fulfill dialog.
const EYEBROW = 'text-muted-foreground text-xs font-semibold';

// Order-independent key of the drawn quantities (zero rows ignored).
const allocKey = (a: Record<string, number>) =>
    JSON.stringify(
        Object.entries(a)
            .filter(([, n]) => n > 0)
            .sort(),
    );

export function RequestsTab({ can, onNew }: { can: (p: string) => boolean; onNew: () => void }) {
    const fmt = useDateFormat();
    const t = useT();
    const pairOf = useLocalPair();
    const confirm = useConfirm();
    // Page and rows-per-page live in the URL (?page, ?per).
    const list = useListParams();
    const { page, perPage } = list;
    const statusFilterId = useId();
    // Status filter lives in the URL too (?status).
    const statusParam = list.get('status');
    const status = REQUEST_STATUS_FILTERS.includes(statusParam as StockRequestStatus) ? statusParam : 'all';
    const setStatus = (value: string) => list.setFilter('status', value === 'all' ? '' : value);
    // The API returns actionable requests first (await approval → await fulfillment), server-paginated.
    const {
        data: requestsPage,
        isLoading: requestsLoading,
        isFetching: requestsFetching,
    } = useStockRequests({ page, per_page: perPage, status: status === 'all' ? undefined : status });
    const requests = requestsPage?.data ?? [];
    const { approve, reject, fulfill } = useStockRequestActions();
    const [fulfillReq, setFulfillReq] = useState<StockRequest | null>(null);
    // Open state is separate from the data so the dialog content stays mounted during the close animation.
    const [fulfillOpen, setFulfillOpen] = useState(false);
    const [issueSerialIds, setIssueSerialIds] = useState<number[]>([]);
    // Warehouse filter for the serial pick list (large serialized SKUs span many warehouses).
    const [serialWh, setSerialWh] = useState<string>('all');
    // Per-warehouse qty to draw when fulfilling a quantity-only item (warehouse → qty).
    const [alloc, setAlloc] = useState<Record<string, number>>({});
    const [seedAlloc, setSeedAlloc] = useState<Record<string, number>>({});
    // Live item detail (on-hand + per-unit serials + balances) for the request being fulfilled.
    const { data: fulfillItem } = useStockItem(fulfillReq?.stock_item_id ?? null);

    // Reset selection and greedily pre-fill the allocation (largest warehouse first) on open / detail load.
    useEffect(() => {
        if (!fulfillOpen) return;
        setIssueSerialIds([]);
        setSerialWh('all');
        const bals = [...(fulfillItem?.balances ?? [])].filter((b) => b.qty > 0).sort((a, b) => b.qty - a.qty);
        let remaining = fulfillReq?.qty ?? 0;
        const next: Record<string, number> = {};
        for (const b of bals) {
            if (remaining <= 0) break;
            const take = Math.min(b.qty, remaining);
            next[b.warehouse] = take;
            remaining -= take;
        }
        setAlloc(next);
        setSeedAlloc(next);
    }, [fulfillOpen, fulfillReq?.id, fulfillItem]);

    const onError = (e: unknown) => {
        useToastStore.getState().push(stockRefusalText(e, t), 'error');
    };

    // Request identity shown inside the confirm dialogs.
    const reqEntity = (r: (typeof requests)[number]) => ({
        name: `${r.sku ?? ''} ${r.item_name ?? ''} ×${r.qty}`,
        sub: `${t('stock_requester')}: ${pairOf(r.requester_name, r.requester_name_th)}`,
    });

    const confirmApprove = async (r: (typeof requests)[number]) => {
        await confirm({
            variant: 'edit',
            title: t('stock_approve_confirm'),
            entity: reqEntity(r),
            confirmText: t('stock_approve'),
            action: () => approve.mutateAsync(r.id),
            errorMessage: (e) => stockRefusalText(e, t),
        });
    };

    const confirmReject = async (r: (typeof requests)[number]) => {
        await confirm({
            variant: 'warn',
            title: t('stock_reject_confirm'),
            entity: reqEntity(r),
            confirmText: t('stock_reject'),
            action: () => reject.mutateAsync(r.id),
            errorMessage: (e) => stockRefusalText(e, t),
        });
    };

    const columns: Column<(typeof requests)[number]>[] = [
        {
            key: 'id',
            sticky: 'left',
            header: t('stock_request_no'),
            width: '110px',
            className: 'whitespace-nowrap',
            render: (r) => <span className="text-xs font-semibold">{r.reference ?? `REQ-${String(r.id).padStart(4, '0')}`}</span>,
        },
        {
            key: 'requested_at',
            header: t('stock_requested_at'),
            width: '130px',
            className: 'whitespace-nowrap',
            render: (r) => <span className="text-xs">{fmt.dateTime(r.created_at)}</span>,
        },
        {
            key: 'requester',
            header: t('stock_requester'),
            width: '120px',
            render: (r) => <TruncText text={pairOf(r.requester_name, r.requester_name_th)} className="text-sm font-medium" />,
        },
        {
            key: 'item',
            header: t('stock_item'),
            minWidth: '12rem',
            render: (r) => (
                <div className="min-w-0">
                    <TruncText text={r.sku} className="text-xs" />
                    <TruncText text={r.item_name} className="text-muted-foreground text-xs" />
                </div>
            ),
        },
        { key: 'qty', header: t('stock_qty'), align: 'right', width: '72px', render: (r) => <span className="font-bold tabular-nums">{r.qty}</span> },
        {
            key: 'unit',
            header: t('stock_unit'),
            width: '80px',
            render: (r) => <TruncText text={r.unit} className="text-muted-foreground text-xs lowercase" />,
        },
        { key: 'reason', header: t('stock_reason'), minWidth: '14rem', render: (r) => <TruncText text={r.reason} className="text-sm" /> },
        {
            key: 'status',
            header: t('status'),
            width: '104px',
            className: 'whitespace-nowrap',
            render: (r) => <StatusBadge tone={REQ_TONE[r.status]}>{t(`stock_rq_${r.status}` as Parameters<typeof t>[0])}</StatusBadge>,
        },
        {
            key: 'decided',
            header: t('stock_approver'),
            width: '170px',
            render: (r) => {
                const decidedAt = r.approved_at ?? r.rejected_at;
                return (
                    <div className="min-w-0">
                        <TruncText text={r.approver_name} className="text-sm" />
                        {decidedAt && <div className="text-muted-foreground text-xs whitespace-nowrap">{fmt.dateTime(decidedAt)}</div>}
                    </div>
                );
            },
        },
        {
            key: 'fulfilled',
            header: t('stock_fulfilled_by'),
            width: '170px',
            render: (r) => (
                <div className="min-w-0">
                    <TruncText text={r.fulfilled_by} className="text-sm" />
                    {r.fulfilled_at && <div className="text-muted-foreground text-xs whitespace-nowrap">{fmt.dateTime(r.fulfilled_at)}</div>}
                </div>
            ),
        },
        {
            key: 'actions',
            header: t('actions'),
            align: 'right',
            // Room for the buttons only when this page has a request the reader can approve or fulfill
            width: requests.some((r) => r.can_decide || (can('fulfill') && r.status === 'approved'))
                ? 'clamp(110px, calc(110px + (100vw - 1100px) * 0.5), 190px)'
                : '72px',
            render: (r) => (
                <div className="flex justify-end gap-1.5">
                    {r.can_decide && (
                        <>
                            <Button
                                size="sm"
                                onClick={() => confirmApprove(r)}
                                aria-label={t('stock_approve')}
                                title={t('stock_approve')}
                                className="bg-emerald-700 text-white hover:bg-emerald-800"
                            >
                                <Check className="h-3.5 w-3.5" aria-hidden />
                                <span className="hidden xl:inline">{t('stock_approve')}</span>
                            </Button>
                            <Button
                                size="sm"
                                variant="destructive"
                                aria-label={t('stock_reject')}
                                title={t('stock_reject')}
                                onClick={() => confirmReject(r)}
                            >
                                <X className="h-3.5 w-3.5" aria-hidden />
                            </Button>
                        </>
                    )}
                    {can('fulfill') && r.status === 'approved' && (
                        <Button
                            size="sm"
                            aria-label={t('stock_fulfill')}
                            title={t('stock_fulfill')}
                            onClick={() => {
                                setFulfillReq(r);
                                setFulfillOpen(true);
                            }}
                        >
                            <ArrowUpFromLine className="h-3.5 w-3.5" aria-hidden />
                            <span className="hidden xl:inline">{t('stock_fulfill')}</span>
                        </Button>
                    )}
                    {(r.status === 'fulfilled' || r.status === 'rejected') && <span className="text-muted-foreground text-xs">—</span>}
                </div>
            ),
        },
    ];

    // Fulfill dialog derivations.
    const fulfillSerialized = !!fulfillItem?.track_serial;
    // Warehouses holding stock for this item — the rows of the allocation grid.
    const fulfillBalances = (fulfillItem?.balances ?? []).filter((b) => b.qty > 0);
    const totalAvailable = fulfillBalances.reduce((s, b) => s + b.qty, 0);
    // Serialized: every in-stock serial is pickable across all warehouses, FIFO (oldest received first).
    const fulfillInStock = (fulfillItem?.serials ?? [])
        .filter((s) => s.status === 'in_stock')
        .sort((a, b) => (a.received_at ?? '').localeCompare(b.received_at ?? ''));
    // Per-warehouse counts for the filter chips.
    const serialWhCounts = fulfillInStock.reduce<Record<string, number>>((m, s) => {
        const k = s.warehouse ?? '—';
        m[k] = (m[k] ?? 0) + 1;
        return m;
    }, {});
    const visibleSerials = serialWh === 'all' ? fulfillInStock : fulfillInStock.filter((s) => (s.warehouse ?? '—') === serialWh);
    // Auto-pick the oldest `qty` serials (pure FIFO across all warehouses) in one click.
    const pickFifo = () => setIssueSerialIds(fulfillInStock.slice(0, fulfillReq?.qty ?? 0).map((s) => s.id));
    const allocTotal = Object.values(alloc).reduce((s, n) => s + n, 0);
    // Ready when the chosen units cover exactly the requested qty.
    const fulfillReady = fulfillSerialized ? !!fulfillReq && issueSerialIds.length === fulfillReq.qty : !!fulfillReq && allocTotal === fulfillReq.qty;
    const toggleIssueSerial = (id: number) => setIssueSerialIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    const fulfillDirty = issueSerialIds.length > 0 || allocKey(alloc) !== allocKey(seedAlloc);
    const guardFulfillClose = useDiscardGuard(fulfillOpen && fulfillDirty);
    const closeFulfill = () => setFulfillOpen(false);

    const setAllocFor = (warehouse: string, max: number, raw: number) =>
        setAlloc((a) => ({ ...a, [warehouse]: Math.max(0, Math.min(max, Math.trunc(raw) || 0)) }));

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                {/* Inline status filter: icon + label + dropdown (same as the Movements type filter). */}
                <div className="flex items-center gap-1.5">
                    <Filter className="text-muted-foreground h-3.5 w-3.5 shrink-0" aria-hidden />
                    <label htmlFor={statusFilterId} className="text-muted-foreground shrink-0 text-sm font-medium">
                        {t('status')}
                    </label>
                    <div className="w-44">
                        <SearchableSelect
                            id={statusFilterId}
                            value={status}
                            onChange={setStatus}
                            options={[
                                { value: 'all', label: t('stock_all_statuses'), search: t('stock_all_statuses'), icon: <ToneDot tone="gray" /> },
                                ...REQUEST_STATUS_FILTERS.map((k) => ({
                                    value: k,
                                    label: t(`stock_rq_${k}` as Parameters<typeof t>[0]),
                                    search: t(`stock_rq_${k}` as Parameters<typeof t>[0]),
                                    icon: <ToneDot tone={REQ_TONE[k]} />,
                                })),
                            ]}
                        />
                    </div>
                </div>
                {can('request') && (
                    <Button onClick={onNew}>
                        <FilePlus2 className="h-4 w-4" aria-hidden />
                        {t('stock_request')}
                    </Button>
                )}
            </div>
            <DataTable
                columns={columns}
                rows={requests}
                rowKey={(r) => r.id}
                loading={requestsLoading || requestsFetching}
                server={{ ...list.table.paging, total: requestsPage?.meta.total ?? 0 }}
            />

            {/* Fulfill — review the deduction and issue stock to the requester from here. */}
            <Dialog open={fulfillOpen} onOpenChange={(o) => !o && guardFulfillClose(closeFulfill)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <ArrowUpFromLine className="h-5 w-5 text-violet-600 dark:text-violet-400" aria-hidden />
                            {t('stock_fulfill')}
                        </DialogTitle>
                        <DialogDescription className="sr-only">{t('stock_fulfill_desc')}</DialogDescription>
                    </DialogHeader>
                    {fulfillReq && (
                        <div className="space-y-4">
                            <div className="border-border rounded-lg border p-3">
                                <div className="text-sm font-semibold">{fulfillReq.item_name}</div>
                                <div className="text-muted-foreground flex flex-wrap gap-x-3 text-xs">
                                    <span>{fulfillReq.sku}</span>
                                    <span>
                                        {t('stock_requester')}: {pairOf(fulfillReq.requester_name, fulfillReq.requester_name_th)}
                                    </span>
                                </div>
                            </div>

                            {/* Quantity-only: spread the issue across warehouses (greedy pre-fill, editable). */}
                            {!fulfillSerialized && (
                                <div className="border-border overflow-hidden rounded-lg border">
                                    <div className={cn(CARD_HEADING, 'border-border flex items-center justify-between border-b px-3 py-2')}>
                                        <span className={EYEBROW}>{t('stock_issue_from')}</span>
                                        <span
                                            aria-live="polite"
                                            className={cn(
                                                'text-xs tabular-nums',
                                                fulfillReady ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground',
                                            )}
                                        >
                                            {allocTotal}/{fulfillReq.qty}
                                        </span>
                                    </div>
                                    {fulfillBalances.length === 0 ? (
                                        <div className="text-muted-foreground py-6 text-center text-xs">{t('stock_no_stock')}</div>
                                    ) : (
                                        fulfillBalances.map((b) => (
                                            <div
                                                key={b.warehouse}
                                                className="border-border/60 flex items-center gap-3 border-b px-3 py-2 last:border-0"
                                            >
                                                <span className="flex-1 text-sm">{b.warehouse}</span>
                                                <span className="text-muted-foreground text-xs tabular-nums">
                                                    {b.qty} {fulfillItem?.unit}
                                                </span>
                                                <Input
                                                    type="number"
                                                    inputMode="numeric"
                                                    name={`alloc-${b.warehouse}`}
                                                    aria-label={b.warehouse}
                                                    min={0}
                                                    max={b.qty}
                                                    value={alloc[b.warehouse] ?? 0}
                                                    onChange={(e) => setAllocFor(b.warehouse, b.qty, +e.target.value)}
                                                    className="h-8 w-20 text-right tabular-nums"
                                                />
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}

                            {totalAvailable < fulfillReq.qty && <FormErrorBanner message={`${t('stock_insufficient')} (${totalAvailable})`} />}

                            {/* Serialized: pick exactly the units (serials) that go out — across any warehouse. */}
                            {fulfillSerialized && (
                                <div className="border-border overflow-hidden rounded-lg border">
                                    <div className={cn(CARD_HEADING, 'border-border flex items-center justify-between border-b px-3 py-2')}>
                                        <span className={EYEBROW}>{t('stock_pick_serials')}</span>
                                        <div className="flex items-center gap-2.5">
                                            <button
                                                type="button"
                                                onClick={pickFifo}
                                                className="text-brand hover:text-brand/80 inline-flex min-h-6 items-center px-1 text-xs font-medium transition-colors"
                                            >
                                                {t('stock_pick_fifo')} ({fulfillReq.qty})
                                            </button>
                                            <span
                                                aria-live="polite"
                                                className={cn(
                                                    'text-xs tabular-nums',
                                                    fulfillReady ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground',
                                                )}
                                            >
                                                {issueSerialIds.length}/{fulfillReq.qty}
                                            </span>
                                        </div>
                                    </div>
                                    {/* Warehouse filter — only when serials span more than one warehouse. */}
                                    {Object.keys(serialWhCounts).length > 1 && (
                                        <div className="border-border/60 flex flex-wrap gap-1.5 border-b px-3 py-2">
                                            {[['all', fulfillInStock.length] as const, ...Object.entries(serialWhCounts)].map(([wh, n]) => (
                                                <button
                                                    key={wh}
                                                    type="button"
                                                    aria-pressed={serialWh === wh}
                                                    onClick={() => setSerialWh(wh as string)}
                                                    className={cn(
                                                        'inline-flex min-h-6 items-center rounded-full border px-2 py-1 text-[11px] font-medium transition-colors',
                                                        serialWh === wh
                                                            ? 'border-brand bg-brand/10 text-brand'
                                                            : 'border-border text-muted-foreground hover:bg-accent/50',
                                                    )}
                                                >
                                                    {wh === 'all' ? t('stock_all_warehouses') : (wh as string)}{' '}
                                                    <span className="opacity-70">{n}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    <div className="max-h-48 overflow-auto overscroll-contain">
                                        {visibleSerials.length === 0 ? (
                                            <div className="text-muted-foreground py-6 text-center text-xs">{t('stock_no_serials')}</div>
                                        ) : (
                                            visibleSerials.map((s) => {
                                                const checked = issueSerialIds.includes(s.id);
                                                // Block extra picks once the requested qty is reached.
                                                const atLimit = !checked && issueSerialIds.length >= fulfillReq.qty;
                                                return (
                                                    <label
                                                        key={s.id}
                                                        className={cn(
                                                            'border-border/60 flex w-full items-center gap-3 border-b px-3 py-2 text-left transition-colors last:border-0',
                                                            atLimit ? 'cursor-not-allowed opacity-40' : 'hover:bg-accent/40 cursor-pointer',
                                                            checked && 'bg-brand/5',
                                                        )}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            className="accent-brand h-4 w-4 shrink-0 rounded"
                                                            checked={checked}
                                                            disabled={atLimit}
                                                            onChange={() => toggleIssueSerial(s.id)}
                                                        />
                                                        <span className="flex-1 text-xs">{s.serial}</span>
                                                        <span className="text-muted-foreground text-[11px]">{s.warehouse ?? '—'}</span>
                                                        {s.received_at && (
                                                            <span className="text-muted-foreground text-[11px]">{fmt.date(s.received_at)}</span>
                                                        )}
                                                    </label>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => guardFulfillClose(closeFulfill)} disabled={fulfill.isPending}>
                            {t('cancel')}
                        </Button>
                        <Button
                            disabled={!fulfillReq || !fulfillReady || fulfill.isPending}
                            onClick={() =>
                                fulfillReq &&
                                fulfill.mutate(
                                    {
                                        id: fulfillReq.id,
                                        serialIds: fulfillSerialized ? issueSerialIds : undefined,
                                        allocations: fulfillSerialized
                                            ? undefined
                                            : Object.entries(alloc)
                                                  .filter(([, q]) => q > 0)
                                                  .map(([warehouse, qty]) => ({ warehouse, qty })),
                                    },
                                    { onError, onSuccess: () => setFulfillOpen(false) },
                                )
                            }
                        >
                            <ArrowUpFromLine className="h-4 w-4" aria-hidden />
                            {t('stock_fulfill_deduct')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
