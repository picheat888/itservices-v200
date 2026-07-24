import { Column, DataTable } from '@/shared/components/data-table';
import { StatusBadge } from '@/shared/components/status-badge';
import { Button } from '@/shared/ui/button';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { useStockItem, useStockRequestActions, useStockRequests } from '../../hooks/use-stock';
import { useDateTime } from '@/modules/settings';
import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import { useToastStore } from '@/stores/toast';
import type { StockRequest, StockRequestStatus } from '@/shared/types';
import { AlertTriangle, ArrowUpFromLine, Check, FilePlus2, X } from 'lucide-react';
import { useEffect, useState } from 'react';

const REQ_TONE: Record<StockRequestStatus, 'amber' | 'blue' | 'green' | 'red'> = {
    pending: 'amber',
    approved: 'blue',
    fulfilled: 'green',
    rejected: 'red',
};

export function RequestsTab({
    can,
    onNew,
    page,
    setPage,
    perPage,
    setPerPage,
}: {
    can: (p: string) => boolean;
    onNew: () => void;
    // Pagination lives in the parent so switching tabs (which unmounts this tab) keeps your place.
    page: number;
    setPage: (p: number) => void;
    perPage: number;
    setPerPage: (n: number) => void;
}) {
    const t = useT();
    const confirm = useConfirm();
    const { format: fmtDate } = useDateTime();
    // The API returns actionable requests first (await approval → await fulfillment), server-paginated.
    // `loading` tracks only the first load (isLoading), not background refetches (isFetching), so
    // returning to this tab shows the cached page instantly instead of a shimmer every time.
    const { data: requestsPage, isLoading: requestsLoading } = useStockRequests({ page, per_page: perPage });
    const requests = requestsPage?.data ?? [];
    const { approve, reject, fulfill } = useStockRequestActions();
    const [fulfillReq, setFulfillReq] = useState<StockRequest | null>(null);
    // Open state is separate from the data so the dialog content stays mounted while it
    // animates closed (otherwise the content unmounts and Radix skips the exit animation).
    const [fulfillOpen, setFulfillOpen] = useState(false);
    const [issueSerialIds, setIssueSerialIds] = useState<number[]>([]);
    // Warehouse filter for the serial pick list (large serialized SKUs span many warehouses).
    const [serialWh, setSerialWh] = useState<string>('all');
    // Per-warehouse qty to draw when fulfilling a quantity-only item (warehouse → qty).
    const [alloc, setAlloc] = useState<Record<string, number>>({});
    // Live item detail (on-hand + per-unit serials + balances) for the request being fulfilled.
    const { data: fulfillItem } = useStockItem(fulfillReq?.stock_item_id ?? null);

    // Reset selection and greedily pre-fill the allocation (largest warehouse first)
    // whenever a different request opens or its stock detail loads.
    useEffect(() => {
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
    }, [fulfillReq?.id, fulfillItem]);

    const onError = (e: unknown) => {
        const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
        useToastStore.getState().push(msg ?? 'Something went wrong.', 'error');
    };

    // One-line summary of the request, shown inside the confirm dialogs.
    const reqSummary = (r: (typeof requests)[number]) => `${r.sku ?? ''} — ${r.item_name ?? ''}  ·  ×${r.qty}  ·  ${r.requester_name}`;

    const confirmApprove = async (r: (typeof requests)[number]) => {
        await confirm({
            variant: 'edit',
            title: t('stock_approve_confirm'),
            entity: { name: reqSummary(r) },
            confirmText: t('stock_approve'),
            action: () => approve.mutateAsync(r.id),
        });
    };

    const confirmReject = async (r: (typeof requests)[number]) => {
        await confirm({
            variant: 'warn',
            title: t('stock_reject_confirm'),
            entity: { name: reqSummary(r) },
            confirmText: t('stock_reject'),
            action: () => reject.mutateAsync(r.id),
        });
    };

    const columns: Column<(typeof requests)[number]>[] = [
        {
            key: 'id',
            header: t('stock_request_no'),
            render: (r) => <span className="font-mono text-xs font-semibold">{r.reference ?? `REQ-${String(r.id).padStart(4, '0')}`}</span>,
        },
        { key: 'requester', header: t('stock_requester'), render: (r) => <span className="text-sm font-medium">{r.requester_name}</span> },
        {
            key: 'item',
            header: t('stock_item'),
            render: (r) => (
                <div>
                    <div className="font-mono text-xs">{r.sku}</div>
                    <div className="text-muted-foreground truncate text-xs">{r.item_name}</div>
                </div>
            ),
        },
        { key: 'qty', header: t('stock_qty'), align: 'right', render: (r) => <span className="font-mono font-bold">{r.qty}</span> },
        { key: 'reason', header: t('stock_reason'), render: (r) => <span className="text-sm">{r.reason}</span> },
        {
            key: 'status',
            header: t('status'),
            render: (r) => <StatusBadge tone={REQ_TONE[r.status]}>{t(`stock_rq_${r.status}` as Parameters<typeof t>[0])}</StatusBadge>,
        },
        {
            key: 'actions',
            header: t('actions'),
            align: 'right',
            render: (r) => (
                <div className="flex justify-end gap-1.5">
                    {can('approve') && r.status === 'pending' && (
                        <>
                            <Button size="sm" onClick={() => confirmApprove(r)} className="bg-emerald-600 text-white hover:bg-emerald-700">
                                <Check className="h-3.5 w-3.5" />
                                {t('stock_approve')}
                            </Button>
                            <Button size="sm" variant="destructive" title={t('stock_reject')} onClick={() => confirmReject(r)}>
                                <X className="h-3.5 w-3.5" />
                            </Button>
                        </>
                    )}
                    {can('fulfill') && r.status === 'approved' && (
                        <Button
                            size="sm"
                            onClick={() => {
                                setFulfillReq(r);
                                setFulfillOpen(true);
                            }}
                        >
                            <ArrowUpFromLine className="h-3.5 w-3.5" />
                            {t('stock_fulfill')}
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
    // Serialized: every in-stock serial is pickable, across all warehouses, ordered
    // FIFO (oldest received first) so the top of the list is what should go out first.
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
    const setAllocFor = (warehouse: string, max: number, raw: number) =>
        setAlloc((a) => ({ ...a, [warehouse]: Math.max(0, Math.min(max, Math.trunc(raw) || 0)) }));

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <div className="text-muted-foreground text-sm">{t('stock_requests_caption')}</div>
                {can('request') && (
                    <Button onClick={onNew}>
                        <FilePlus2 className="h-4 w-4" />
                        {t('stock_request')}
                    </Button>
                )}
            </div>
            <DataTable
                columns={columns}
                rows={requests}
                rowKey={(r) => r.id}
                loading={requestsLoading}
                server={{
                    page,
                    pageSize: perPage,
                    total: requestsPage?.meta.total ?? 0,
                    onPageChange: setPage,
                    onPageSizeChange: (s) => {
                        setPerPage(s);
                        setPage(1);
                    },
                }}
            />

            {/* Fulfill — review the deduction and issue stock to the requester from here. */}
            <Dialog open={fulfillOpen} onOpenChange={(o) => !o && setFulfillOpen(false)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <ArrowUpFromLine className="h-5 w-5 text-violet-600" />
                            {t('stock_fulfill')}
                        </DialogTitle>
                    </DialogHeader>
                    {fulfillReq && (
                        <div className="space-y-4">
                            <div className="border-border rounded-lg border p-3">
                                <div className="text-sm font-semibold">{fulfillReq.item_name}</div>
                                <div className="text-muted-foreground font-mono text-xs">
                                    {fulfillReq.sku} · {t('stock_requester')}: {fulfillReq.requester_name}
                                </div>
                            </div>

                            {/* Quantity-only: spread the issue across warehouses (greedy pre-fill, editable). */}
                            {!fulfillSerialized && (
                                <div className="border-border overflow-hidden rounded-lg border">
                                    <div className="border-border bg-muted/30 flex items-center justify-between border-b px-3 py-2">
                                        <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                                            {t('stock_issue_from')}
                                        </span>
                                        <span className={cn('font-mono text-xs', fulfillReady ? 'text-emerald-600' : 'text-muted-foreground')}>
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
                                                <span className="text-muted-foreground font-mono text-xs">
                                                    {b.qty} {fulfillItem?.unit}
                                                </span>
                                                <Input
                                                    type="number"
                                                    min={0}
                                                    max={b.qty}
                                                    value={alloc[b.warehouse] ?? 0}
                                                    onChange={(e) => setAllocFor(b.warehouse, b.qty, +e.target.value)}
                                                    className="h-8 w-20 text-right font-mono"
                                                />
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}

                            {totalAvailable < fulfillReq.qty && (
                                <div className="border-destructive/40 bg-destructive/5 text-destructive flex items-center gap-2 rounded-lg border p-3 text-sm">
                                    <AlertTriangle className="h-4 w-4 shrink-0" />
                                    {t('stock_insufficient')} ({totalAvailable})
                                </div>
                            )}

                            {/* Serialized: pick exactly the units (serials) that go out — across any warehouse. */}
                            {fulfillSerialized && (
                                <div className="border-border overflow-hidden rounded-lg border">
                                    <div className="border-border bg-muted/30 flex items-center justify-between border-b px-3 py-2">
                                        <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                                            {t('stock_pick_serials')}
                                        </span>
                                        <div className="flex items-center gap-2.5">
                                            <button
                                                type="button"
                                                onClick={pickFifo}
                                                className="text-brand hover:text-brand/80 text-xs font-medium transition-colors"
                                            >
                                                {t('stock_pick_fifo')} ({fulfillReq.qty})
                                            </button>
                                            <span className={cn('font-mono text-xs', fulfillReady ? 'text-emerald-600' : 'text-muted-foreground')}>
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
                                                    onClick={() => setSerialWh(wh as string)}
                                                    className={cn(
                                                        'rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors',
                                                        serialWh === wh
                                                            ? 'border-brand bg-brand/10 text-brand'
                                                            : 'border-border text-muted-foreground hover:bg-accent/50',
                                                    )}
                                                >
                                                    {wh === 'all' ? t('stock_all_warehouses') : (wh as string)}{' '}
                                                    <span className="font-mono opacity-70">{n}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    <div className="max-h-48 overflow-auto">
                                        {visibleSerials.length === 0 ? (
                                            <div className="text-muted-foreground py-6 text-center text-xs">{t('stock_no_serials')}</div>
                                        ) : (
                                            visibleSerials.map((s) => {
                                                const checked = issueSerialIds.includes(s.id);
                                                // Block extra picks once the requested qty is reached.
                                                const atLimit = !checked && issueSerialIds.length >= fulfillReq.qty;
                                                return (
                                                    <button
                                                        key={s.id}
                                                        type="button"
                                                        disabled={atLimit}
                                                        onClick={() => toggleIssueSerial(s.id)}
                                                        className="hover:bg-accent/40 border-border/60 flex w-full items-center gap-3 border-b px-3 py-2 text-left last:border-0 disabled:opacity-40"
                                                    >
                                                        <span
                                                            className={cn(
                                                                'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                                                                checked ? 'bg-brand border-brand text-white' : 'border-input',
                                                            )}
                                                        >
                                                            {checked && <Check className="h-3 w-3" />}
                                                        </span>
                                                        <span className="flex-1 font-mono text-xs">{s.serial}</span>
                                                        <span className="text-muted-foreground text-[11px]">{s.warehouse ?? '—'}</span>
                                                        {s.received_at && (
                                                            <span className="text-muted-foreground font-mono text-[11px]">
                                                                {fmtDate(s.received_at, false)}
                                                            </span>
                                                        )}
                                                    </button>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setFulfillOpen(false)} disabled={fulfill.isPending}>
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
                            <ArrowUpFromLine className="h-4 w-4" />
                            {t('stock_fulfill_deduct')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
