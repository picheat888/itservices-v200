// Stock request detail (board 12): its steps, the item, stock or the Lots to pick, and once issued the ISS with its returns.
import { useT } from '@/lang';
import { useCurrency } from '@/modules/settings';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { EmptyState } from '@/shared/components/empty-state';
import { FormErrorBanner } from '@/shared/components/field';
import { LoadFailedPanel } from '@/shared/components/load-failed';
import { StatusBadge } from '@/shared/components/status-badge';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { useLocalPair } from '@/shared/hooks/use-local-name';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { TABLE_HEAD } from '@/shared/lib/surface';
import { cn } from '@/shared/lib/utils';
import type { RequestTrail, StockItem, StockRequest, StockRequestStatus } from '@/shared/types';
import { Button, buttonVariants } from '@/shared/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooterBar, focusDialogOnOpen, mediumDialogContentClass } from '@/shared/ui/dialog';
import { Skeleton } from '@/shared/ui/skeleton';
import { ArrowUpFromLine, Ban, Check, ClipboardList, Printer, RotateCcw, X } from 'lucide-react';
import { useId } from 'react';
import { issuePdfUrl } from '../api/stockApi';
import { useRequestTrail, useStockItem, useStockRequest } from '../hooks/use-stock';
import type { PickableLot } from '../lib/lot-pick';
import { previewLotPicks, requestSteps, type RequestStep } from '../lib/request-detail';
import { LotLink } from './lot-link';

const REQ_TONE: Record<StockRequestStatus, 'amber' | 'blue' | 'green' | 'red' | 'gray'> = {
    pending: 'amber',
    approved: 'blue',
    fulfilled: 'green',
    rejected: 'red',
    cancelled: 'gray',
};

const LABEL = 'text-muted-foreground text-xs';
const H3 = 'mb-2 text-sm font-semibold';
const TH = 'border-border border-b px-3 py-1.5 font-medium';
const TD = 'border-border/60 border-b px-3 py-2 tabular-nums group-last:border-0';
const UNASSIGNED = 'Unassigned';

export interface RequestDetailActions {
    onApprove: (r: StockRequest) => void;
    onReject: (r: StockRequest) => void;
    onCancel: (r: StockRequest) => void;
    /** Shown only to fulfillers. */
    onFulfil?: (r: StockRequest) => void;
    /** Shown only to who may record a return. */
    onReturn?: (requestId: number) => void;
}

interface RequestDetailDialogProps extends RequestDetailActions {
    open: boolean;
    onClose: () => void;
    /** The row the dialog opened from; the fresh request replaces it once read. */
    request: StockRequest | null;
    requestNo: (r: StockRequest) => string;
    /** Stock per warehouse and the Lot preview read the item, which needs stock.view. */
    canViewStock: boolean;
}

export function RequestDetailDialog({ open, onClose, request, requestNo, canViewStock, ...actions }: RequestDetailDialogProps) {
    const t = useT();
    const fresh = useStockRequest(request?.id ?? null, open).data;
    const r = fresh && fresh.id === request?.id ? fresh : request;
    const readsStock = !!r && canViewStock && (r.status === 'pending' || r.status === 'approved');
    const itemQuery = useStockItem(readsStock && r ? r.stock_item_id : null, open);
    const trailQuery = useRequestTrail(r?.status === 'fulfilled' ? r.id : null, open);

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className={mediumDialogContentClass} onOpenAutoFocus={focusDialogOnOpen}>
                {r && (
                    <>
                        <FocusDialogHeader
                            icon={ClipboardList}
                            eyebrow={t('stock_requests_tab')}
                            title={requestNo(r)}
                            titleSuffix={<StatusBadge tone={REQ_TONE[r.status]}>{t(`stock_rq_${r.status}` as Parameters<typeof t>[0])}</StatusBadge>}
                            srDescription={t('stock_rq_detail_title')}
                        />
                        <DialogBody className="space-y-4 px-6 py-4">
                            <StepBar request={r} />
                            <ItemCard request={r} />
                            <RequestFacts request={r} />
                            {readsStock && r.status === 'pending' && <StockNow query={itemQuery} />}
                            {readsStock && r.status === 'approved' && <PickPreview query={itemQuery} qty={r.qty} />}
                            {r.status === 'fulfilled' &&
                                (trailQuery.isError ? (
                                    <LoadFailedPanel onRetry={() => trailQuery.refetch()} />
                                ) : trailQuery.data ? (
                                    <IssueTrail trail={trailQuery.data} />
                                ) : (
                                    <Skeleton className="h-40 w-full" />
                                ))}
                        </DialogBody>
                        <DetailFooter request={r} trail={trailQuery.data} onClose={onClose} {...actions} />
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}

// Step bar: ขอเบิก → อนุมัติ → จ่ายของ
function StepBar({ request }: { request: StockRequest }) {
    const t = useT();
    const fmt = useDateFormat();
    const pairOf = useLocalPair();
    const steps = requestSteps(request, (name, nameTh) => pairOf(name, nameTh) ?? name);
    const TITLE: Record<RequestStep['key'], string> = { asked: t('stock_rq_asked'), approve: t('stock_approve'), fulfil: t('stock_fulfill') };
    const WAITING: Record<RequestStep['key'], string | null> = { asked: null, approve: t('stock_rq_pending'), fulfil: t('stock_rq_awaiting_fulfil') };

    return (
        <ol className="grid grid-cols-3 gap-3">
            {steps.map((s) => {
                const title = s.closedAs ? t(`stock_rq_${s.closedAs}`) : s.doc ? `${TITLE[s.key]} ${s.doc}` : TITLE[s.key];
                const who = s.who ?? (s.state === 'now' ? WAITING[s.key] : null);
                return (
                    <li key={s.key} className="flex min-w-0 items-start gap-2" aria-current={s.state === 'now' ? 'step' : undefined}>
                        <StepDot step={s} />
                        <div className="min-w-0">
                            <div
                                className={cn('truncate text-sm font-semibold', s.state === 'wait' && 'text-muted-foreground')}
                                translate={s.doc ? 'no' : undefined}
                            >
                                {title}
                            </div>
                            {who && <div className={cn(LABEL, 'truncate')}>{who}</div>}
                            {s.when && <div className={cn(LABEL, 'whitespace-nowrap')}>{fmt.dateTime(s.when)}</div>}
                        </div>
                    </li>
                );
            })}
        </ol>
    );
}

function StepDot({ step }: { step: RequestStep }) {
    const base = 'mt-px grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full';
    if (step.state === 'done') {
        return (
            <span className={cn(base, 'bg-emerald-600 text-white')}>
                <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
            </span>
        );
    }
    if (step.state === 'closed') {
        return (
            <span className={cn(base, 'text-white', step.closedAs === 'rejected' ? 'bg-destructive' : 'bg-muted-foreground')}>
                <X className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
            </span>
        );
    }
    if (step.state === 'now') {
        return (
            <span className={cn(base, 'bg-amber-500')}>
                <span className="h-1.5 w-1.5 rounded-full bg-white" />
            </span>
        );
    }
    return <span className={cn(base, 'bg-muted')} />;
}

function ItemCard({ request }: { request: StockRequest }) {
    const t = useT();
    const fmtN = useNumberFormat();
    return (
        <div className="border-border flex items-center gap-4 rounded-lg border px-4 py-3">
            <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-semibold">{request.item_name}</div>
                <div className={LABEL}>{request.sku}</div>
            </div>
            <div className="shrink-0 text-right">
                <div className={LABEL}>{t('stock_rq_asked')}</div>
                <div className="text-2xl leading-tight font-extrabold tabular-nums">
                    {fmtN(request.qty)} <span className="text-sm font-medium">{request.unit}</span>
                </div>
            </div>
        </div>
    );
}

function RequestFacts({ request }: { request: StockRequest }) {
    const t = useT();
    const fmt = useDateFormat();
    const pairOf = useLocalPair();
    return (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div className="min-w-0">
                <dt className={LABEL}>{t('stock_requester')}</dt>
                <dd className="truncate">{pairOf(request.requester_name, request.requester_name_th)}</dd>
            </div>
            <div className="min-w-0">
                <dt className={LABEL}>{t('stock_requested_at')}</dt>
                <dd>{request.created_at ? fmt.dateTime(request.created_at) : '—'}</dd>
            </div>
            <div className="col-span-2 min-w-0">
                <dt className={LABEL}>{t('stock_reason')}</dt>
                <dd className="break-words">{request.reason}</dd>
            </div>
        </dl>
    );
}

type ItemQuery = { data?: StockItem; isError: boolean; refetch: () => unknown };

// Pending: stock per warehouse
function StockNow({ query }: { query: ItemQuery }) {
    const t = useT();
    const fmtN = useNumberFormat();
    const titleId = useId();
    const balances = (query.data?.balances ?? []).filter((b) => b.qty > 0);

    return (
        <section aria-labelledby={titleId}>
            <h3 id={titleId} className={H3}>
                {t('stock_rq_stock_now')}
            </h3>
            <ItemState query={query}>
                {balances.length === 0 ? (
                    <div className="border-border rounded-lg border">
                        <EmptyState
                            title={t('stock_empty_requests_fulfil_balances')}
                            hint={t('stock_empty_requests_fulfil_balances_hint')}
                            className="min-h-0 py-4"
                        />
                    </div>
                ) : (
                    <div className="border-border overflow-hidden rounded-lg border">
                        <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
                            <colgroup>
                                <col />
                                <col className="w-28" />
                            </colgroup>
                            <thead className={TABLE_HEAD}>
                                <tr className="text-muted-foreground text-left text-xs">
                                    <th scope="col" className={TH}>
                                        {t('stock_warehouse')}
                                    </th>
                                    <th scope="col" className={cn(TH, 'text-right')}>
                                        {t('stock_lots_in_stock')}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {balances.map((b) => (
                                    <tr key={b.warehouse} className="group">
                                        <td className={cn(TD, 'truncate')}>{warehouseName(b.warehouse, t)}</td>
                                        <td className={cn(TD, 'text-right')}>{fmtN(b.qty)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </ItemState>
        </section>
    );
}

// Approved: the Lots the fulfil dialog will seed, oldest first
function PickPreview({ query, qty }: { query: ItemQuery; qty: number }) {
    const t = useT();
    const fmt = useDateFormat();
    const fmtN = useNumberFormat();
    const titleId = useId();
    const lots: PickableLot[] = (query.data?.lots ?? []).map((l) => ({
        lot_id: l.id,
        lot_no: l.lot_no,
        warehouse: l.warehouse,
        received_at: l.received_at ?? '',
        remaining: l.qty_remaining,
    }));
    const picks = previewLotPicks(query.data?.balances ?? [], lots, qty);
    const available = (query.data?.balances ?? []).reduce((sum, b) => sum + Math.max(0, b.qty), 0);

    return (
        <section aria-labelledby={titleId}>
            <h3 id={titleId} className={H3}>
                {t('stock_rq_lots_to_pick')}
            </h3>
            <ItemState query={query}>
                {available < qty && <FormErrorBanner message={`${t('stock_insufficient')} (${fmtN(available)})`} className="mb-2" />}
                {picks.length > 0 && (
                    <div className="border-border overflow-hidden rounded-lg border">
                        <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
                            <colgroup>
                                <col />
                                <col className="w-[34%]" />
                                <col className="w-28" />
                                <col className="w-24" />
                                <col className="w-16" />
                            </colgroup>
                            <thead className={TABLE_HEAD}>
                                <tr className="text-muted-foreground text-left text-xs">
                                    <th scope="col" className={TH}>
                                        {t('stock_warehouse')}
                                    </th>
                                    <th scope="col" className={TH}>
                                        {t('stock_lot_word')}
                                    </th>
                                    <th scope="col" className={TH}>
                                        {t('stock_lots_col_received')}
                                    </th>
                                    <th scope="col" className={cn(TH, 'text-right')}>
                                        {t('stock_fulfil_col_left_in_lot')}
                                    </th>
                                    <th scope="col" className={cn(TH, 'text-right')}>
                                        {t('stock_fulfil_col_pick')}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {picks.map((p) => (
                                    <tr key={`${p.warehouse}-${p.lot_id}`} className="group">
                                        <td className={cn(TD, 'truncate')}>{warehouseName(p.warehouse, t)}</td>
                                        <td className={cn(TD, 'truncate font-semibold')} translate="no">
                                            {p.lot_no ?? t('stock_lot_before_tracking')}
                                        </td>
                                        <td className={cn(TD, 'whitespace-nowrap')}>{p.received_at ? fmt.date(p.received_at) : '—'}</td>
                                        <td className={cn(TD, 'text-right')}>{fmtN(p.remaining)}</td>
                                        <td className={cn(TD, 'text-right font-bold text-violet-800 dark:text-violet-300')}>{fmtN(p.take)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                <p className={cn(LABEL, 'mt-1.5')}>{t('stock_rq_pick_note')}</p>
            </ItemState>
        </section>
    );
}

// The item read behind the stock and preview sections: skeleton, retry, then the content
function ItemState({ query, children }: { query: ItemQuery; children: React.ReactNode }) {
    if (query.isError) return <LoadFailedPanel onRetry={() => query.refetch()} />;
    if (!query.data) return <Skeleton className="h-24 w-full" />;
    return <>{children}</>;
}

// Fulfilled: the ISS with its Lots, then the returns against it
function IssueTrail({ trail }: { trail: RequestTrail }) {
    const t = useT();
    const fmt = useDateFormat();
    const fmtN = useNumberFormat();
    const { format } = useCurrency();
    const issueTitleId = useId();
    const returnsTitleId = useId();
    const issue = trail.issue;

    return (
        <>
            {issue && (
                <section aria-labelledby={issueTitleId}>
                    <h3 id={issueTitleId} className={H3}>
                        {t('stock_rq_issue_sheet')}
                    </h3>
                    <div className="border-border overflow-hidden rounded-lg border">
                        <dl className="border-border grid grid-cols-3 gap-4 border-b px-3.5 py-3 text-sm">
                            <div className="min-w-0">
                                <dt className={LABEL}>{t('stock_issue_doc_no')}</dt>
                                <dd className="truncate text-[15px] font-bold" translate="no">
                                    {issue.doc_no ?? '—'}
                                </dd>
                            </div>
                            <div className="min-w-0">
                                <dt className={LABEL}>{t('stock_rq_issued_at')}</dt>
                                <dd>{issue.moved_at ? fmt.dateTime(issue.moved_at) : '—'}</dd>
                            </div>
                            <div className="min-w-0">
                                <dt className={LABEL}>{t('stock_rq_issued_by')}</dt>
                                <dd className="truncate">{issue.recorded_by ?? '—'}</dd>
                            </div>
                        </dl>
                        <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
                            <colgroup>
                                <col />
                                <col className="w-[34%]" />
                                <col className="w-28" />
                                <col className="w-16" />
                                <col className="w-20" />
                            </colgroup>
                            <thead className={TABLE_HEAD}>
                                <tr className="text-muted-foreground text-left text-xs">
                                    <th scope="col" className={TH}>
                                        {t('stock_warehouse')}
                                    </th>
                                    <th scope="col" className={TH}>
                                        {t('stock_lot_word')}
                                    </th>
                                    <th scope="col" className={cn(TH, 'text-right')}>
                                        {t('stock_unit_cost_short')}
                                    </th>
                                    <th scope="col" className={cn(TH, 'text-right')}>
                                        {t('stock_issue_col_issued')}
                                    </th>
                                    <th scope="col" className={cn(TH, 'text-right')}>
                                        {t('stock_issue_col_returned')}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {issue.lines.map((l) => (
                                    <tr key={`${l.warehouse}-${l.lot_id}`} className="group">
                                        <td className={cn(TD, 'truncate')}>{warehouseName(l.warehouse, t)}</td>
                                        <td className={cn(TD, 'truncate')}>
                                            {l.lot_no ? <LotLink lotNo={l.lot_no} /> : t('stock_lot_before_tracking')}
                                        </td>
                                        <td className={cn(TD, 'text-right whitespace-nowrap')}>{format(l.unit_cost)}</td>
                                        <td className={cn(TD, 'text-right')}>{fmtN(l.qty)}</td>
                                        <td
                                            className={cn(
                                                TD,
                                                'text-right',
                                                l.returned > 0 ? 'font-semibold text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground',
                                            )}
                                        >
                                            {fmtN(l.returned)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {trail.returns.length === 0 && trail.returnable > 0 && (
                        <p className={cn(LABEL, 'mt-1.5')}>{t('stock_rq_can_return_n').replace('{n}', fmtN(trail.returnable))}</p>
                    )}
                </section>
            )}

            {trail.returns.length > 0 && (
                <section aria-labelledby={returnsTitleId}>
                    <h3 id={returnsTitleId} className={H3}>
                        {t('stock_rq_returns_title')}
                    </h3>
                    <div className="border-border overflow-hidden rounded-lg border">
                        <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
                            <colgroup>
                                <col className="w-[22%]" />
                                <col className="w-[22%]" />
                                <col />
                                <col className="w-16" />
                                <col className="w-[20%]" />
                            </colgroup>
                            <thead className={TABLE_HEAD}>
                                <tr className="text-muted-foreground text-left text-xs">
                                    <th scope="col" className={TH}>
                                        {t('stock_rq_return_doc_no')}
                                    </th>
                                    <th scope="col" className={TH}>
                                        {t('stock_rq_returned_at')}
                                    </th>
                                    <th scope="col" className={TH}>
                                        {t('stock_hist_return_into')}
                                    </th>
                                    <th scope="col" className={cn(TH, 'text-right')}>
                                        {t('stock_qty')}
                                    </th>
                                    <th scope="col" className={TH}>
                                        {t('stock_rq_returned_by')}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {trail.returns.flatMap((ret, i) =>
                                    ret.lines.map((l, j) => (
                                        <tr key={`${ret.doc_no ?? i}-${j}`} className="group">
                                            <td className={cn(TD, 'truncate font-semibold')} translate="no">
                                                {j === 0 ? (ret.doc_no ?? '—') : ''}
                                            </td>
                                            <td className={cn(TD, 'whitespace-nowrap')}>
                                                {j === 0 && ret.moved_at ? fmt.dateTime(ret.moved_at) : ''}
                                            </td>
                                            <td className={cn(TD, 'truncate')}>
                                                {l.lot_no ? <LotLink lotNo={l.lot_no} /> : t('stock_lot_before_tracking')}
                                            </td>
                                            <td className={cn(TD, 'text-right')}>{fmtN(l.qty)}</td>
                                            <td className={cn(TD, 'truncate')}>{j === 0 ? (ret.recorded_by ?? '—') : ''}</td>
                                        </tr>
                                    )),
                                )}
                            </tbody>
                        </table>
                    </div>
                    {trail.returnable > 0 && (
                        <p className={cn(LABEL, 'mt-1.5')}>{t('stock_rq_can_return_n').replace('{n}', fmtN(trail.returnable))}</p>
                    )}
                </section>
            )}
        </>
    );
}

// Footer: print on the left; the actions this reader may take on the right
function DetailFooter({
    request: r,
    trail,
    onClose,
    onApprove,
    onReject,
    onCancel,
    onFulfil,
    onReturn,
}: RequestDetailActions & { request: StockRequest; trail?: RequestTrail; onClose: () => void }) {
    const t = useT();
    const canReturn = !!onReturn && r.status === 'fulfilled' && (trail?.returnable ?? 0) > 0;
    const decide = r.status === 'pending' && r.can_decide;
    // The requester's own pending request: cancel stands where the decision buttons would
    const cancelPending = r.status === 'pending' && !r.can_decide && r.can_cancel;
    const cancelApproved = r.status === 'approved' && r.can_cancel;
    const fulfil = r.status === 'approved' && !!onFulfil;
    const hasAction = decide || cancelPending || cancelApproved || fulfil || canReturn;

    return (
        <DialogFooterBar className="flex-wrap">
            {r.status === 'fulfilled' && (
                <a href={issuePdfUrl(r.id)} target="_blank" rel="noopener" className={cn(buttonVariants({ variant: 'outline' }), 'mr-auto')}>
                    <Printer className="h-4 w-4" aria-hidden />
                    {t('stock_issue_print')}
                    <span className="sr-only">{t('stock_opens_new_tab')}</span>
                </a>
            )}
            {decide && (
                <>
                    <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => onReject(r)}>
                        <X className="h-4 w-4" aria-hidden />
                        {t('stock_reject')}
                    </Button>
                    <Button onClick={() => onApprove(r)}>
                        <Check className="h-4 w-4" aria-hidden />
                        {t('stock_approve')}
                    </Button>
                </>
            )}
            {(cancelPending || cancelApproved) && (
                <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => onCancel(r)}>
                    <Ban className="h-4 w-4" aria-hidden />
                    {t('stock_cancel_request')}
                </Button>
            )}
            {fulfil && (
                <Button onClick={() => onFulfil?.(r)}>
                    <ArrowUpFromLine className="h-4 w-4" aria-hidden />
                    {t('stock_fulfill')}
                </Button>
            )}
            {canReturn && (
                <Button variant="outline" onClick={() => onReturn?.(r.id)}>
                    <RotateCcw className="h-4 w-4" aria-hidden />
                    {t('stock_rq_return_from_this')}
                </Button>
            )}
            {(r.status === 'fulfilled' || !hasAction) && (
                <Button variant="outline" onClick={onClose}>
                    {t('close')}
                </Button>
            )}
        </DialogFooterBar>
    );
}

const warehouseName = (name: string, t: ReturnType<typeof useT>) => (name === UNASSIGNED ? t('stock_lot_unassigned') : name);
