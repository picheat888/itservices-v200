// Page of one Lot (board 8): header, four tiles, reconciliation bar and the ledger entries.
import NotFoundPage from '@/app/not-found';
import { useT } from '@/lang';
import { useCurrency } from '@/modules/settings';
import { LoadFailedPanel } from '@/shared/components/load-failed';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { useDocumentTitle } from '@/shared/hooks/use-document-title';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { httpStatus } from '@/shared/lib/http-errors';
import { TABLE_HEAD } from '@/shared/lib/surface';
import { cn } from '@/shared/lib/utils';
import type { LotDetail, StockMovementType } from '@/shared/types';
import { buttonVariants } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import { Check, ChevronLeft, Printer, TriangleAlert } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { lotLabelsPdfUrl } from '../api/stockApi';
import { useLot } from '../hooks/use-stock';

type Translate = ReturnType<typeof useT>;
type Entry = LotDetail['entries'][number];

const TYPE_BADGE: Record<StockMovementType, string> = {
    receive: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
    issue: 'bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300',
    return: 'bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300',
    transfer: 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300',
    adjust_up: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
    adjust_down: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
};

const COUNT_REASONS = ['lost', 'broken', 'used', 'inbound', 'returned', 'miscount', 'custom'];

export default function LotHistoryPage() {
    const t = useT();
    const { lotNo } = useParams();
    useDocumentTitle('stock_lot_history_title');
    const { data, isLoading, error, refetch } = useLot(lotNo ?? null);

    if (httpStatus(error) === 404) {
        return <NotFoundPage />;
    }
    if (error && !data) {
        return (
            <div className="bg-background mx-auto min-h-dvh max-w-5xl px-6 py-8">
                <LoadFailedPanel onRetry={() => refetch()} />
            </div>
        );
    }
    if (isLoading || !data) {
        return (
            <div role="status" className="bg-background mx-auto min-h-dvh max-w-5xl px-6 py-8">
                <div aria-hidden className="space-y-4">
                    <Skeleton className="h-16 w-full" />
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                        {Array.from({ length: 4 }, (_, i) => (
                            <Skeleton key={i} className="h-16" />
                        ))}
                    </div>
                    <Skeleton className="h-9 w-full" />
                    <Skeleton className="h-48 w-full" />
                </div>
                <span className="sr-only">{t('loading')}</span>
            </div>
        );
    }
    return <LotHistoryView lot={data} t={t} />;
}

function LotHistoryView({ lot, t }: { lot: LotDetail; t: Translate }) {
    const fmtN = useNumberFormat();
    const { format: formatMoney } = useCurrency();
    const { tiles, check } = lot;
    // The count adjustment joins the sum only when a count touched the Lot
    const adjustTerm = tiles.adjusted === 0 ? '' : ` ${tiles.adjusted > 0 ? '+' : '−'} ${fmtN(Math.abs(tiles.adjusted))}`;
    const formula = `${fmtN(tiles.received)} − ${fmtN(tiles.issued)} + ${fmtN(tiles.returned)}${adjustTerm} = ${fmtN(tiles.remaining)}`;

    return (
        <div className="bg-background mx-auto min-h-dvh max-w-5xl px-6 py-8">
            <Link
                to={`/stock/items/${lot.item.id}/history`}
                className="text-muted-foreground hover:text-foreground mb-3 inline-flex min-h-6 items-center gap-1 px-1 text-sm font-medium"
            >
                <ChevronLeft className="h-4 w-4" aria-hidden />
                {t('stock_hist_back')}
            </Link>

            {/* Header */}
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-muted-foreground text-xs font-semibold">{t('stock_lot_history_title')}</div>
                    <h1 className="mt-1 text-xl font-extrabold tabular-nums">{lot.lot_no}</h1>
                    <div className="text-muted-foreground mt-1 text-sm">
                        {lot.item.name} {lot.item.sku} {t('stock_lot_head_at').replace('{warehouse}', lot.warehouse)}{' '}
                        {t('stock_lot_head_cost').replace('{cost}', formatMoney(lot.unit_cost))}
                    </div>
                </div>
                <a
                    href={lotLabelsPdfUrl(lot.lot_no)}
                    target="_blank"
                    rel="noopener"
                    className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'shrink-0')}
                >
                    <Printer className="h-4 w-4" aria-hidden />
                    {t('stock_lot_print_sticker')}
                </a>
            </div>

            {/* Tiles */}
            <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                <Tile label={t('stock_lot_tile_received')} value={fmtN(tiles.received)} />
                <Tile label={t('stock_lot_tile_issued')} value={`−${fmtN(tiles.issued)}`} tone="text-red-700 dark:text-red-400" />
                <Tile label={t('stock_lot_tile_returned')} value={`+${fmtN(tiles.returned)}`} tone="text-green-700 dark:text-green-400" />
                <Tile label={t('stock_lot_tile_remaining')} value={fmtN(tiles.remaining)} />
            </div>

            {/* Check bar */}
            <div
                role="status"
                className={cn(
                    'mb-4 flex items-center gap-2 rounded-lg px-3 py-2 text-sm',
                    check.balanced
                        ? 'bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300'
                        : 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300',
                )}
            >
                {check.balanced ? <Check className="h-4 w-4 shrink-0" aria-hidden /> : <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />}
                <span>
                    {check.balanced
                        ? t('stock_lot_check_ok').replace('{formula}', formula)
                        : t('stock_lot_check_off').replace('{n}', fmtN(check.diff))}
                </span>
            </div>

            <EntryTable entries={lot.entries} t={t} />
        </div>
    );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: string }) {
    return (
        <div className="border-border rounded-lg border px-3.5 py-2.5">
            <div className="text-muted-foreground text-xs">{label}</div>
            <div className={cn('mt-0.5 text-2xl font-bold tabular-nums', tone)}>{value}</div>
        </div>
    );
}

// Reason of a count row; free text passes through as typed
function reasonText(reason: string, t: Translate): string {
    return COUNT_REASONS.includes(reason) ? t(`stock_count_reason_${reason}`) : reason;
}

function EntryTable({ entries, t }: { entries: Entry[]; t: Translate }) {
    const fmtN = useNumberFormat();
    const { date, time } = useDateFormat();
    const signed = (n: number) => (n > 0 ? `+${fmtN(n)}` : n < 0 ? `−${fmtN(Math.abs(n))}` : '0');
    const head = 'px-3 py-2 whitespace-nowrap';

    return (
        <div className="border-border overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
                <thead className={TABLE_HEAD}>
                    <tr className="text-muted-foreground border-border border-b text-left text-xs font-semibold">
                        <th scope="col" className={head}>
                            {t('stock_date')}
                        </th>
                        <th scope="col" className={head}>
                            {t('stock_doc_no')}
                        </th>
                        <th scope="col" className={head}>
                            {t('stock_mv_type')}
                        </th>
                        <th scope="col" className={head}>
                            {t('stock_lot_col_request')}
                        </th>
                        <th scope="col" className={head}>
                            {t('stock_lot_col_person')}
                        </th>
                        <th scope="col" className={head}>
                            {t('stock_warehouse')}
                        </th>
                        <th scope="col" className={cn(head, 'text-right')}>
                            {t('stock_qty')}
                        </th>
                        <th scope="col" className={cn(head, 'text-right')}>
                            {t('stock_lot_tile_remaining')}
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {entries.map((e, i) => (
                        <tr key={i} className="border-border/60 border-b align-top last:border-0">
                            <td className="px-3 py-2 whitespace-nowrap">
                                {date(e.occurred_at)}
                                <div className="text-muted-foreground text-xs">{time(e.occurred_at)}</div>
                            </td>
                            <td className="px-3 py-2 font-medium whitespace-nowrap">{e.doc_no ?? '—'}</td>
                            <td className="px-3 py-2 whitespace-nowrap">
                                <span className={cn('inline-flex h-[22px] items-center rounded-full px-2 text-xs font-medium', TYPE_BADGE[e.type])}>
                                    {t(`stock_mv_${e.type}`)}
                                </span>
                                {e.reason && <div className="text-muted-foreground mt-0.5 text-xs">{reasonText(e.reason, t)}</div>}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">{e.request_reference ?? '—'}</td>
                            <td className="px-3 py-2">
                                {e.person ?? e.recorded_by ?? '—'}
                                {e.recorded_by && e.person && (
                                    <div className="text-muted-foreground text-xs">
                                        {t(e.type === 'return' ? 'stock_lot_returned_by' : 'stock_lot_issued_by').replace('{name}', e.recorded_by)}
                                    </div>
                                )}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                                {e.type === 'transfer' && e.from_warehouse ? `${e.from_warehouse} → ${e.warehouse}` : e.warehouse}
                            </td>
                            <td
                                className={cn(
                                    'px-3 py-2 text-right font-semibold tabular-nums',
                                    e.qty > 0 && 'text-green-700 dark:text-green-400',
                                    e.qty < 0 && 'text-red-700 dark:text-red-400',
                                )}
                            >
                                {signed(e.qty)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">{fmtN(e.balance_after)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
