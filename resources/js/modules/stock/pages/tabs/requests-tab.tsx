import { useT } from '@/lang';
import { Column, DataTable } from '@/shared/components/data-table';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { DisabledReason } from '@/shared/components/disabled-reason';
import { EmptyState } from '@/shared/components/empty-state';
import { FormErrorBanner } from '@/shared/components/field';
import { NEW_ROW_CLASS, NewBadge } from '@/shared/components/new-badge';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { StatusBadge, ToneDot } from '@/shared/components/status-badge';
import { TruncText } from '@/shared/components/trunc-text';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { useDebouncedSearch } from '@/shared/hooks/use-debounced-search';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { useListParams } from '@/shared/hooks/use-list-params';
import { useLocalPair } from '@/shared/hooks/use-local-name';
import { useNewRows } from '@/shared/hooks/use-new-rows';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { useRefetchOnOpen } from '@/shared/hooks/use-refetch-on-open';
import { useSeedOnce } from '@/shared/hooks/use-seed-once';
import { digitsOnly } from '@/shared/lib/number';
import { searchLabel } from '@/shared/lib/search-words';
import { CARD_HEADING } from '@/shared/lib/surface';
import { cn } from '@/shared/lib/utils';
import type { IssueResult, StockRequest, StockRequestStatus } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { Dialog, DialogBody, DialogFooterBar, FormDialogContent } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { useToastStore } from '@/stores/toast';
import { ArrowUpFromLine, Ban, Check, FilePlus2, Filter, Search, TriangleAlert, X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { FulfilDone } from '../../components/fulfil-done';
import { LotPickBox } from '../../components/lot-pick-box';
import { RequestDetailDialog } from '../../components/request-detail-dialog';
import { RequestRowMenu } from '../../components/request-row-menu';
import { NEW_REQUEST_DETAIL, useStockItem, useStockRequestActions, useStockRequests } from '../../hooks/use-stock';
import { countLockFor } from '../../lib/count-lock';
import { allocKey, greedyAlloc, prunePicks, refillAlloc } from '../../lib/fulfil-alloc';
import type { PickableLot } from '../../lib/lot-pick';
import { stockRefusalText } from '../../lib/refusal';

// Fulfilling takes stock out: the issue colour of the movement list
const FULFIL_ACCENT = '#7c3aed';

const requestNo = (r: StockRequest) => r.reference ?? `REQ-${String(r.id).padStart(4, '0')}`;

const REQ_TONE: Record<StockRequestStatus, 'amber' | 'blue' | 'green' | 'red' | 'gray'> = {
    pending: 'amber',
    approved: 'blue',
    fulfilled: 'green',
    rejected: 'red',
    cancelled: 'gray',
};

// Statuses offered by the filter (and accepted from ?status=).
const REQUEST_STATUS_FILTERS: StockRequestStatus[] = ['pending', 'approved', 'fulfilled', 'rejected', 'cancelled'];

// Small section heading inside the fulfill dialog.
const EYEBROW = 'text-muted-foreground text-xs font-semibold';

export function RequestsTab({
    can,
    onNew,
    onReturn,
}: {
    can: (p: string) => boolean;
    onNew: () => void;
    /** Opens the return drawer with this request chosen. */
    onReturn?: (requestId: number) => void;
}) {
    const fmt = useDateFormat();
    const t = useT();
    const fmtN = useNumberFormat();
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
    // Search lives in ?search; the list asks the server once typing pauses.
    const search = list.get('search');
    const sentSearch = useDebouncedSearch(search);
    // The API returns actionable requests first (await approval → await fulfillment), server-paginated.
    const {
        data: requestsPage,
        isLoading: requestsLoading,
        isFetching: requestsFetching,
        isPlaceholderData: requestsPlaceholder,
    } = useStockRequests({ page, per_page: perPage, status: status === 'all' ? undefined : status, search: sentSearch || undefined });
    const requests = requestsPage?.data ?? [];
    // A request the user just submitted stays on top for a minute
    const newReqs = useNewRows({
        scope: 'stock-requests',
        rows: requests,
        rowKey: (r) => r.id,
        detail: NEW_REQUEST_DETAIL,
        waiting: requestsFetching,
    });
    const { approve, reject, cancel, fulfill } = useStockRequestActions();
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
    const fulfillItemQuery = useStockItem(fulfillReq?.stock_item_id ?? null, fulfillOpen);
    // Picks a refresh took away, said once above the picking area until the user picks again
    const [gone, setGone] = useState<{ serials: number; warehouses: string[] } | null>(null);
    // After a fulfil the dialog stays open on the ISS summary; `at` tells a refreshed item from the one read before
    const [fulfilDone, setFulfilDone] = useState<{ issue: IssueResult; prevStock: number; at: number } | null>(null);
    const fulfillItem = fulfillItemQuery.data;
    useRefetchOnOpen(fulfillOpen, fulfillItemQuery);
    // Request detail (board 12): the row it opened from stays shown through the close animation
    const [detailReq, setDetailReq] = useState<StockRequest | null>(null);
    const [detailOpen, setDetailOpen] = useState(false);

    // Seed once per request, when its item first loads: greedy allocation (largest warehouse first); a refresh only updates what is shown
    useSeedOnce(fulfillOpen && fulfillReq && fulfillItem ? fulfillReq.id : null, () => {
        setIssueSerialIds([]);
        setSerialWh('all');
        setGone(null);
        const next = greedyAlloc(fulfillItem?.balances ?? [], fulfillReq?.qty ?? 0);
        setAlloc(next);
        setSeedAlloc(next);
    });
    // Fresh balances refill the allocation while it is still the seeded one; a changed allocation stays the user's
    useEffect(() => {
        if (!fulfillOpen || !fulfillItem || !fulfillReq || fulfilDone) return;
        const balances = fulfillItem.balances ?? [];
        const refill = refillAlloc(alloc, seedAlloc, balances, fulfillReq.qty);
        if (refill) {
            setAlloc(refill);
            setSeedAlloc(refill);
        }
        // Serials or warehouses that left the stock drop out of the picks, so the user can choose again
        const inStock = (fulfillItem.serials ?? []).filter((s) => s.status === 'in_stock').map((s) => s.id);
        const pruned = prunePicks(issueSerialIds, inStock, refill ? {} : alloc, balances);
        if (pruned.goneSerials > 0) setIssueSerialIds(pruned.serialIds);
        if (pruned.goneWarehouses.length > 0) setAlloc(pruned.alloc);
        if (pruned.goneSerials > 0 || pruned.goneWarehouses.length > 0) {
            setGone({ serials: pruned.goneSerials, warehouses: pruned.goneWarehouses });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fulfillItem]);

    const onError = (e: unknown) => {
        useToastStore.getState().push(stockRefusalText(e, t), 'error');
    };

    // Request identity shown inside the confirm dialogs.
    const reqEntity = (r: (typeof requests)[number]) => ({
        name: `${r.sku ?? ''} ${r.item_name ?? ''} ×${fmtN(r.qty)}`,
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

    const confirmCancel = async (r: (typeof requests)[number]) => {
        const note =
            r.status === 'approved'
                ? t('stock_cancel_note_approved')
                      .replace('{qty}', fmtN(r.qty))
                      .replace('{unit}', r.unit ?? '')
                : t('stock_cancel_note_pending');
        await confirm({
            variant: 'danger',
            icon: Ban,
            title: t('stock_cancel_confirm'),
            entity: reqEntity(r),
            description: r.is_own ? note : `${note} ${t('stock_cancel_notify')}`,
            confirmText: t('stock_cancel_request'),
            cancelText: t('close'),
            busyText: t('stock_cancel_busy'),
            doneText: t('stock_cancel_done'),
            action: () => cancel.mutateAsync(r.id),
            errorMessage: (e) => stockRefusalText(e, t),
        });
    };

    const openDetail = (r: StockRequest) => {
        setDetailReq(r);
        setDetailOpen(true);
    };

    const openFulfil = (r: StockRequest) => {
        setDetailOpen(false);
        setFulfillReq(r);
        setFulfilDone(null);
        setFulfillOpen(true);
    };

    // Fulfil done screen → "ดูคำขอเบิก"; the row read before the fulfil still says approved until the fresh request lands
    const viewFulfilled = (r: StockRequest) => {
        setFulfillOpen(false);
        openDetail({ ...r, status: 'fulfilled', issue_doc_no: fulfilDone?.issue.doc_no ?? r.issue_doc_no });
    };

    const returnFrom = (requestId: number) => {
        setDetailOpen(false);
        onReturn?.(requestId);
    };

    const hasRowButtons = [...requests, ...newReqs.pinned].some((r) => r.can_decide || (can('fulfill') && r.status === 'approved'));

    const columns: Column<(typeof requests)[number]>[] = [
        {
            key: 'id',
            sticky: 'left',
            header: t('stock_request_no'),
            width: '110px',
            className: 'whitespace-nowrap',
            render: (r) => (
                <div className="flex flex-col items-start gap-0.5">
                    <span className="text-xs font-semibold">{requestNo(r)}</span>
                    {newReqs.isNew(r) && <NewBadge />}
                </div>
            ),
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
        {
            key: 'qty',
            header: t('stock_qty'),
            align: 'right',
            width: '72px',
            render: (r) => <span className="font-bold tabular-nums">{fmtN(r.qty)}</span>,
        },
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
            render: (r) => (
                <div className="min-w-0">
                    <StatusBadge tone={REQ_TONE[r.status]}>{t(`stock_rq_${r.status}` as Parameters<typeof t>[0])}</StatusBadge>
                    {r.status === 'cancelled' && r.cancelled_by && (
                        <TruncText
                            text={t('stock_cancelled_by').replace('{name}', r.cancelled_by)}
                            className="text-muted-foreground mt-0.5 text-xs"
                        />
                    )}
                </div>
            ),
        },
        {
            key: 'decided',
            header: t('stock_approver'),
            width: '150px',
            render: (r) => {
                const decidedAt = r.approved_at ?? r.rejected_at;
                return (
                    <div className="min-w-0">
                        <TruncText text={pairOf(r.approver_name, r.approver_name_th)} className="text-sm" />
                        {decidedAt && <div className="text-muted-foreground text-xs whitespace-nowrap">{fmt.dateTime(decidedAt)}</div>}
                    </div>
                );
            },
        },
        {
            key: 'fulfilled',
            header: t('stock_fulfilled_by'),
            width: '150px',
            render: (r) => (
                <div className="min-w-0">
                    <TruncText text={pairOf(r.fulfilled_by, r.fulfilled_by_th)} className="text-sm" />
                    {r.fulfilled_at && <div className="text-muted-foreground text-xs whitespace-nowrap">{fmt.dateTime(r.fulfilled_at)}</div>}
                    {r.issue_doc_no && (
                        <div className="text-muted-foreground text-xs whitespace-nowrap" translate="no">
                            {r.issue_doc_no}
                        </div>
                    )}
                </div>
            ),
        },
        {
            key: 'actions',
            header: t('actions'),
            align: 'right',
            // Room for the buttons only when this page has a request the reader can approve or fulfill; the menu is on every row
            width: hasRowButtons ? 'clamp(146px, calc(146px + (100vw - 1100px) * 0.5), 216px)' : '72px',
            render: (r) => (
                <div className="flex justify-end gap-1.5">
                    {r.can_decide && (
                        <>
                            <Button
                                size="sm"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    confirmApprove(r);
                                }}
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
                                onClick={(e) => {
                                    e.stopPropagation();
                                    confirmReject(r);
                                }}
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
                            onClick={(e) => {
                                e.stopPropagation();
                                openFulfil(r);
                            }}
                        >
                            <ArrowUpFromLine className="h-3.5 w-3.5" aria-hidden />
                            <span className="hidden xl:inline">{t('stock_fulfill')}</span>
                        </Button>
                    )}
                    <RequestRowMenu request={r} requestNo={requestNo(r)} onOpen={openDetail} onCancel={confirmCancel} />
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
    const pickFifo = () => {
        setGone(null);
        setIssueSerialIds(fulfillInStock.slice(0, fulfillReq?.qty ?? 0).map((s) => s.id));
    };
    const allocTotal = Object.values(alloc).reduce((s, n) => s + n, 0);
    // Ready when the chosen units cover exactly the requested qty.
    const fulfillReady = fulfillSerialized ? !!fulfillReq && issueSerialIds.length === fulfillReq.qty : !!fulfillReq && allocTotal === fulfillReq.qty;
    // Count freeze: the warehouses this issue would draw from.
    const fulfillFrom = fulfillSerialized
        ? fulfillInStock.filter((x) => issueSerialIds.includes(x.id)).map((x) => x.warehouse)
        : Object.entries(alloc)
              .filter(([, q]) => q > 0)
              .map(([warehouse]) => warehouse);
    const fulfillCountedBy = countLockFor(fulfillItem, fulfillFrom);
    const toggleIssueSerial = (id: number) => {
        setGone(null);
        setIssueSerialIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    };
    const fulfillDirty = issueSerialIds.length > 0 || allocKey(alloc) !== allocKey(seedAlloc);
    const guardFulfillClose = useDiscardGuard(fulfillOpen && !fulfilDone && fulfillDirty);
    const closeFulfill = () => setFulfillOpen(false);
    // The item's open lots in the shape the lot preview reads
    const fulfillLots: PickableLot[] = (fulfillItem?.lots ?? []).map((l) => ({
        lot_id: l.id,
        lot_no: l.lot_no,
        warehouse: l.warehouse,
        received_at: l.received_at ?? '',
        remaining: l.qty_remaining,
    }));
    const lotNoById = new Map((fulfillItem?.lots ?? []).map((l) => [l.id, l.lot_no]));
    const serialLotNo = (lotId: number | null) => (lotId !== null ? (lotNoById.get(lotId) ?? null) : null);
    const serialsShowLots = fulfillInStock.some((s) => serialLotNo(s.stock_lot_id) !== null);
    // New on-hand: the refreshed item once it lands, until then the stock read before the fulfil less what went out
    const fulfilNewOnHand = fulfilDone
        ? fulfillItem && fulfillItemQuery.dataUpdatedAt > fulfilDone.at
            ? fulfillItem.current_stock
            : fulfilDone.prevStock - (fulfillReq?.qty ?? 0)
        : 0;

    const setAllocFor = (warehouse: string, max: number, raw: number) => {
        setGone(null);
        setAlloc((a) => ({ ...a, [warehouse]: Math.max(0, Math.min(max, Math.trunc(raw) || 0)) }));
    };

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                    <div className="relative max-w-xs min-w-48 flex-1">
                        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" aria-hidden />
                        <Input
                            value={search}
                            onChange={(e) => list.setFilter('search', e.target.value)}
                            placeholder={t('stock_requests_search')}
                            aria-label={searchLabel(t('stock_requests_search'))}
                            name="search"
                            autoComplete="off"
                            className="pl-9 text-ellipsis"
                        />
                    </div>
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
                pinned={newReqs.pinned}
                rowKey={(r) => r.id}
                rowClassName={(r) => (newReqs.isNew(r) ? NEW_ROW_CLASS : undefined)}
                onRowClick={openDetail}
                loading={requestsLoading || (requestsFetching && requestsPlaceholder)}
                server={{ ...list.table.paging, total: requestsPage?.meta.total ?? 0 }}
                empty={
                    status !== 'all' || search.trim() !== ''
                        ? { kind: 'search', title: t('stock_empty_requests_search'), hint: t('stock_empty_requests_search_hint') }
                        : { title: t('stock_empty_requests'), hint: t('stock_empty_requests_hint') }
                }
            />

            <RequestDetailDialog
                open={detailOpen}
                onClose={() => setDetailOpen(false)}
                request={detailReq}
                requestNo={requestNo}
                canViewStock={can('view')}
                onApprove={confirmApprove}
                onReject={confirmReject}
                onCancel={confirmCancel}
                onFulfil={can('fulfill') ? openFulfil : undefined}
                onReturn={can('return') && onReturn ? returnFrom : undefined}
            />

            {/* Fulfill — review the deduction and issue stock to the requester from here. */}
            <Dialog open={fulfillOpen} onOpenChange={(o) => !o && guardFulfillClose(closeFulfill)}>
                <FormDialogContent>
                    {fulfilDone && fulfillReq ? (
                        <FulfilDone
                            requestId={fulfillReq.id}
                            requestNo={requestNo(fulfillReq)}
                            itemName={fulfillReq.item_name}
                            qty={fulfillReq.qty}
                            newOnHand={fulfilNewOnHand}
                            recipient={pairOf(fulfillReq.requester_name, fulfillReq.requester_name_th) ?? fulfillReq.requester_name}
                            issue={fulfilDone.issue}
                            onViewRequest={() => viewFulfilled(fulfillReq)}
                            onDone={closeFulfill}
                        />
                    ) : (
                        <>
                            <FocusDialogHeader
                                icon={ArrowUpFromLine}
                                accent={FULFIL_ACCENT}
                                eyebrow={t('stock')}
                                title={t('stock_fulfill')}
                                code={fulfillReq ? requestNo(fulfillReq) : undefined}
                                srDescription={t('stock_fulfill_desc')}
                            />
                            <DialogBody>
                                {fulfillReq && (
                                    <div className="space-y-4">
                                        <div className="border-border rounded-lg border p-3">
                                            <div className="text-sm font-semibold">{fulfillReq.item_name}</div>
                                            <div className="text-muted-foreground flex flex-wrap gap-x-3 text-xs">
                                                <span>{fulfillReq.sku}</span>
                                                <span>
                                                    {t('stock_requester')} {pairOf(fulfillReq.requester_name, fulfillReq.requester_name_th)}
                                                </span>
                                                <span>
                                                    {t('stock_fulfil_asked')
                                                        .replace('{n}', fmtN(fulfillReq.qty))
                                                        .replace('{unit}', fulfillReq.unit ?? fulfillItem?.unit ?? '')}
                                                </span>
                                            </div>
                                        </div>

                                        <div role="status" aria-live="polite">
                                            {gone && (
                                                <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                                                    <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                                                    <span>
                                                        {gone.serials > 0 && t('stock_fulfil_serials_gone').replace('{n}', fmtN(gone.serials))}
                                                        {gone.serials > 0 && gone.warehouses.length > 0 && ' '}
                                                        {gone.warehouses.length > 0 &&
                                                            t('stock_fulfil_wh_gone').replace('{names}', gone.warehouses.join(', '))}
                                                    </span>
                                                </p>
                                            )}
                                        </div>
                                        {/* Quantity-only: spread the issue across warehouses (greedy pre-fill, editable). */}
                                        {!fulfillSerialized && (
                                            <div className="border-border overflow-hidden rounded-lg border">
                                                <div
                                                    className={cn(CARD_HEADING, 'border-border flex items-center justify-between border-b px-3 py-2')}
                                                >
                                                    <span className={EYEBROW}>{t('stock_issue_from')}</span>
                                                    <span
                                                        aria-live="polite"
                                                        className={cn(
                                                            'text-xs tabular-nums',
                                                            fulfillReady ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground',
                                                        )}
                                                    >
                                                        {fmtN(allocTotal)}/{fmtN(fulfillReq.qty)}
                                                    </span>
                                                </div>
                                                {fulfillBalances.length === 0 ? (
                                                    <EmptyState
                                                        title={t('stock_empty_requests_fulfil_balances')}
                                                        hint={t('stock_empty_requests_fulfil_balances_hint')}
                                                        className="min-h-0 py-4"
                                                    />
                                                ) : (
                                                    fulfillBalances.map((b) => (
                                                        <div key={b.warehouse} className="border-border/60 border-b last:border-0">
                                                            <div className="flex items-center gap-3 px-3 py-2">
                                                                <div className="min-w-0 flex-1">
                                                                    <div className="truncate text-sm font-medium">{b.warehouse}</div>
                                                                    <div className="text-muted-foreground text-xs tabular-nums">
                                                                        {t('stock_fulfil_has_n')
                                                                            .replace('{n}', fmtN(b.qty))
                                                                            .replace('{unit}', fulfillItem?.unit ?? '')}
                                                                    </div>
                                                                </div>
                                                                <Input
                                                                    inputMode="numeric"
                                                                    name={`alloc-${b.warehouse}`}
                                                                    autoComplete="off"
                                                                    aria-label={b.warehouse}
                                                                    value={alloc[b.warehouse] ?? 0}
                                                                    onChange={(e) =>
                                                                        setAllocFor(b.warehouse, b.qty, Number(digitsOnly(e.target.value)))
                                                                    }
                                                                    className="h-8 w-20 text-right tabular-nums"
                                                                />
                                                            </div>
                                                            {(alloc[b.warehouse] ?? 0) > 0 && (
                                                                <LotPickBox
                                                                    warehouse={b.warehouse}
                                                                    qty={alloc[b.warehouse] ?? 0}
                                                                    lots={fulfillLots}
                                                                />
                                                            )}
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        )}
                                        {!fulfillSerialized && fulfillBalances.length > 0 && (
                                            <p className="text-muted-foreground text-xs">{t('stock_fulfil_lot_note')}</p>
                                        )}

                                        {totalAvailable < fulfillReq.qty && (
                                            <FormErrorBanner message={`${t('stock_insufficient')} (${fmtN(totalAvailable)})`} />
                                        )}

                                        {/* Serialized: pick exactly the units (serials) that go out — across any warehouse. */}
                                        {fulfillSerialized && (
                                            <div className="border-border overflow-hidden rounded-lg border">
                                                <div
                                                    className={cn(CARD_HEADING, 'border-border flex items-center justify-between border-b px-3 py-2')}
                                                >
                                                    <span className={EYEBROW}>{t('stock_pick_serials')}</span>
                                                    <div className="flex items-center gap-2.5">
                                                        <button
                                                            type="button"
                                                            onClick={pickFifo}
                                                            className="text-brand hover:text-brand/80 inline-flex min-h-6 items-center px-1 text-xs font-medium transition-colors"
                                                        >
                                                            {t('stock_pick_fifo')} ({fmtN(fulfillReq.qty)})
                                                        </button>
                                                        <span
                                                            aria-live="polite"
                                                            className={cn(
                                                                'text-xs tabular-nums',
                                                                fulfillReady ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground',
                                                            )}
                                                        >
                                                            {fmtN(issueSerialIds.length)}/{fmtN(fulfillReq.qty)}
                                                        </span>
                                                    </div>
                                                </div>
                                                {/* Warehouse filter — only when serials span more than one warehouse. */}
                                                {Object.keys(serialWhCounts).length > 1 && (
                                                    <div className="border-border/60 flex flex-wrap gap-1.5 border-b px-3 py-2">
                                                        {[['all', fulfillInStock.length] as const, ...Object.entries(serialWhCounts)].map(
                                                            ([wh, n]) => (
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
                                                                    <span className="opacity-70">{fmtN(n)}</span>
                                                                </button>
                                                            ),
                                                        )}
                                                    </div>
                                                )}
                                                <div className="max-h-48 overflow-auto overscroll-contain">
                                                    {visibleSerials.length === 0 ? (
                                                        <EmptyState
                                                            kind="pick"
                                                            title={t('stock_empty_requests_fulfil_serials')}
                                                            hint={t('stock_empty_requests_fulfil_serials_hint')}
                                                            className="min-h-0 py-4"
                                                        />
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
                                                                        atLimit
                                                                            ? 'cursor-not-allowed opacity-40'
                                                                            : 'hover:bg-accent/40 cursor-pointer',
                                                                        checked && 'bg-brand/5',
                                                                    )}
                                                                >
                                                                    <input
                                                                        name="issue_serials"
                                                                        type="checkbox"
                                                                        className="accent-brand h-4 w-4 shrink-0 rounded"
                                                                        checked={checked}
                                                                        disabled={atLimit}
                                                                        onChange={() => toggleIssueSerial(s.id)}
                                                                    />
                                                                    <span className="flex-1 text-xs">{s.serial}</span>
                                                                    {serialLotNo(s.stock_lot_id) && (
                                                                        <span className="text-[11px] font-medium tabular-nums" translate="no">
                                                                            {serialLotNo(s.stock_lot_id)}
                                                                        </span>
                                                                    )}
                                                                    <span className="text-muted-foreground text-[11px]">{s.warehouse ?? '—'}</span>
                                                                    {s.received_at && (
                                                                        <span className="text-muted-foreground text-[11px]">
                                                                            {fmt.date(s.received_at)}
                                                                        </span>
                                                                    )}
                                                                </label>
                                                            );
                                                        })
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                        {fulfillSerialized && serialsShowLots && (
                                            <p className="text-muted-foreground text-xs">{t('stock_fulfil_serial_lot_note')}</p>
                                        )}
                                    </div>
                                )}
                            </DialogBody>
                            <DialogFooterBar>
                                <Button variant="outline" onClick={() => guardFulfillClose(closeFulfill)} disabled={fulfill.isPending}>
                                    {t('cancel')}
                                </Button>
                                <DisabledReason
                                    reason={fulfillCountedBy ? t('stock_refusal_count_in_progress').replace('{reference}', fulfillCountedBy) : null}
                                    label={t('stock_fulfill_deduct')}
                                >
                                    <Button
                                        disabled={!fulfillReq || !fulfillReady || fulfill.isPending || fulfillCountedBy !== null}
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
                                                {
                                                    onError,
                                                    onSuccess: (res) =>
                                                        setFulfilDone({
                                                            issue: res.issue,
                                                            prevStock: fulfillItem?.current_stock ?? 0,
                                                            at: Date.now(),
                                                        }),
                                                },
                                            )
                                        }
                                    >
                                        <ArrowUpFromLine className="h-4 w-4" aria-hidden />
                                        {t('stock_fulfill_deduct')}
                                    </Button>
                                </DisabledReason>
                            </DialogFooterBar>
                        </>
                    )}
                </FormDialogContent>
            </Dialog>
        </div>
    );
}
