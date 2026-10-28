// Card on the issue and return detail listing the lots a document drew from or put back into, with a total row.
import { useT } from '@/lang';
import { useCurrency } from '@/modules/settings';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { TABLE_HEAD } from '@/shared/lib/surface';
import type { MovementLots } from '@/shared/types';
import { Link } from 'react-router-dom';

const TH = 'px-3 py-1.5 font-medium';

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
        <div className="border-border rounded-lg border p-3">
            <div className="mb-2 text-sm font-semibold text-violet-700 dark:text-violet-300">
                {isIssue ? t('stock_issue_lots_cut') : t('stock_hist_return_into')}
            </div>
            <div className="border-border overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                    <thead className={TABLE_HEAD}>
                        <tr className="text-muted-foreground text-left text-[11px]">
                            <th scope="col" className={TH}>
                                {t('stock_hist_col_lot')}
                            </th>
                            <th scope="col" className={`${TH} text-right`}>
                                {t('stock_unit_cost_short')}
                            </th>
                            <th scope="col" className={`${TH} text-right`}>
                                {isIssue ? t('stock_issue_col_issued') : t('stock_return_col_back')}
                            </th>
                            {isIssue && (
                                <th scope="col" className={`${TH} text-right`}>
                                    {t('stock_issue_col_returned')}
                                </th>
                            )}
                            <th scope="col" className={`${TH} text-right`}>
                                {t('stock_issue_col_total')}
                            </th>
                        </tr>
                    </thead>
                    <tbody className="tabular-nums">
                        {data.lots.map((l) => (
                            <tr key={l.lot_id} className="border-border/60 border-t">
                                <td className="px-3 py-1.5 text-xs font-semibold whitespace-nowrap" translate="no">
                                    {l.lot_no ? (
                                        <Link to={`/stock/lots/${encodeURIComponent(l.lot_no)}`} className="text-brand-ink hover:underline">
                                            {l.lot_no}
                                        </Link>
                                    ) : (
                                        '—'
                                    )}
                                </td>
                                <td className="px-3 py-1.5 text-right whitespace-nowrap">{format(l.unit_cost)}</td>
                                <td className="px-3 py-1.5 text-right">{fmtN(l.qty)}</td>
                                {isIssue && <td className="px-3 py-1.5 text-right">{fmtN(l.returned)}</td>}
                                <td className="px-3 py-1.5 text-right whitespace-nowrap">{format(l.qty * l.unit_cost)}</td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr className="border-border border-t font-semibold tabular-nums">
                            <td className="px-3 py-1.5" colSpan={2}>
                                {t('stock_issue_col_total')}
                            </td>
                            <td className="px-3 py-1.5 text-right">{fmtN(totalQty)}</td>
                            {isIssue && <td className="px-3 py-1.5 text-right">{fmtN(totalBack)}</td>}
                            <td className="px-3 py-1.5 text-right whitespace-nowrap">{format(totalValue)}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
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
