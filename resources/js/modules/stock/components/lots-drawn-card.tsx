// Card on the issue and return detail listing the lots a document drew from or put back into, with a total row.
import { useT } from '@/lang';
import { useCurrency } from '@/modules/settings';
import { ScrollTable, type ScrollTableHead } from '@/shared/components/scroll-table';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { cn } from '@/shared/lib/utils';
import type { MovementLots } from '@/shared/types';
import { Skeleton } from '@/shared/ui/skeleton';
import { LOT_INK } from '../lib/lot-accent';
import { LotLink } from './lot-link';

const TH = 'px-2 py-1.5 font-medium';

function CardTitle({ isIssue }: { isIssue: boolean }) {
    const t = useT();
    return <div className={cn('mb-2 text-sm font-semibold', LOT_INK)}>{isIssue ? t('stock_issue_lots_cut') : t('stock_hist_return_into')}</div>;
}

// The Lot table's header cells and columns, shared by the card and its skeleton
function lotsTable(t: ReturnType<typeof useT>, isIssue: boolean) {
    const heads: ScrollTableHead[] = [
        { label: t('stock_hist_col_lot') },
        { label: t('stock_unit_cost_short'), className: 'text-right' },
        { label: isIssue ? t('stock_issue_col_issued') : t('stock_return_col_back'), className: 'text-right' },
        ...(isIssue ? [{ label: t('stock_issue_col_returned'), className: 'text-right' }] : []),
        { label: t('stock_issue_col_total'), className: 'text-right' },
    ];
    const cols = (
        <>
            <col />
            <col className="w-24" />
            <col className="w-14" />
            {isIssue && <col className="w-16" />}
            <col className="w-28" />
        </>
    );
    return {
        heads,
        cols,
        thClassName: TH,
        headRowClassName: 'text-muted-foreground text-left text-xs',
        tableClassName: 'w-full table-fixed text-sm',
    };
}

/** The card before its read arrives: the real title and header, bars for one Lot row and the total row. */
export function LotsDrawnSkeleton({ kind }: { kind: 'issue' | 'return' }) {
    const t = useT();
    const isIssue = kind === 'issue';
    const cells = isIssue ? 5 : 4;
    const bars = (row: string) =>
        Array.from({ length: cells }, (_, i) => (
            <td key={`${row}-${i}`} className="px-2 py-1.5">
                <Skeleton className={cn('my-0.5 h-4', i === 0 ? 'w-36' : 'ml-auto w-10')} />
            </td>
        ));
    return (
        <div className="border-border rounded-lg border p-3">
            <CardTitle isIssue={isIssue} />
            <div aria-hidden>
                <ScrollTable className="border-border rounded-md border" {...lotsTable(t, isIssue)}>
                    <tbody>
                        <tr className="border-border/60 border-t">{bars('lot')}</tr>
                    </tbody>
                    <tfoot>
                        <tr className="border-border border-t">{bars('total')}</tr>
                    </tfoot>
                </ScrollTable>
            </div>
        </div>
    );
}

export function LotsDrawnCard({ data, kind }: { data: MovementLots; kind: 'issue' | 'return' }) {
    const t = useT();
    const fmtN = useNumberFormat();
    const { format } = useCurrency();
    const isIssue = kind === 'issue';
    const totalQty = data.lots.reduce((sum, l) => sum + l.qty, 0);
    const totalBack = data.lots.reduce((sum, l) => sum + l.returned, 0);
    const totalValue = data.lots.reduce((sum, l) => sum + l.qty * l.unit_cost, 0);
    const docs = data.returns
        .map((r) => r.doc_no)
        .filter(Boolean)
        .join(', ');
    const returnedQty = data.returns.reduce((sum, r) => sum + r.qty, 0);

    return (
        <div className="border-border flex min-h-0 flex-col rounded-lg border p-3">
            <CardTitle isIssue={isIssue} />
            <ScrollTable className="border-border min-h-0 rounded-md border" {...lotsTable(t, isIssue)}>
                <tbody className="tabular-nums">
                    {data.lots.map((l) => (
                        <tr key={l.lot_id} className="border-border/60 border-t">
                            <td className="px-2 py-1.5 text-xs whitespace-nowrap">
                                <LotLink lotNo={l.lot_no} newTab />
                            </td>
                            <td className="px-2 py-1.5 text-right whitespace-nowrap">{format(l.unit_cost)}</td>
                            <td className="px-2 py-1.5 text-right">{fmtN(l.qty)}</td>
                            {isIssue && <td className="px-2 py-1.5 text-right">{fmtN(l.returned)}</td>}
                            <td className="px-2 py-1.5 text-right whitespace-nowrap">{format(l.qty * l.unit_cost)}</td>
                        </tr>
                    ))}
                </tbody>
                <tfoot className="bg-background sticky bottom-0">
                    <tr className="border-border border-t font-semibold tabular-nums">
                        <td className="px-2 py-1.5" colSpan={2}>
                            {t('stock_issue_col_total')}
                        </td>
                        <td className="px-2 py-1.5 text-right">{fmtN(totalQty)}</td>
                        {isIssue && <td className="px-2 py-1.5 text-right">{fmtN(totalBack)}</td>}
                        <td className="px-2 py-1.5 text-right whitespace-nowrap">{format(totalValue)}</td>
                    </tr>
                </tfoot>
            </ScrollTable>
            {isIssue && data.returns.length > 0 && (
                <p className="text-muted-foreground mt-2 text-xs">
                    {t('stock_issue_returned_note')
                        .replace('{n}', fmtN(returnedQty))
                        .replace('{docs}', docs)
                        .replace('{left}', fmtN(data.returnable))}
                </p>
            )}
        </div>
    );
}
