// "ตรวจทานก่อนยืนยัน" dialog: the count's summary and the rows that will adjust stock, then confirm.
import { useT } from '@/lang';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { cn } from '@/shared/lib/utils';
import type { StockCountLine } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogBody, DialogFooterBar, FormDialogContent } from '@/shared/ui/dialog';
import { Loader2, SquareCheckBig } from 'lucide-react';
import { sheetSummary } from '../../lib/count-sheet';
import { CountKpiCards } from './count-kpi-cards';
import { missingSerialNames, SignedQty, useReasonText, varianceOf } from './count-line-parts';

function AdjustRow({ line }: { line: StockCountLine }) {
    const fmtN = useNumberFormat();
    const reasonText = useReasonText();
    const variance = varianceOf(line) ?? 0;
    const lost = missingSerialNames(line);
    const reason = [reasonText(line), lost.length > 0 ? `(${lost.join(', ')})` : null].filter(Boolean).join(' ');
    return (
        <li className="border-border/60 flex items-center gap-3 border-b px-3 py-2.5 text-sm last:border-0">
            <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{line.name}</div>
                <div className="text-muted-foreground text-xs break-words">{reason || '—'}</div>
            </div>
            <span className="text-muted-foreground text-xs whitespace-nowrap tabular-nums">
                {fmtN(line.system_qty)} → {fmtN(line.counted_qty ?? 0)}
            </span>
            <span
                className={cn(
                    'w-12 shrink-0 text-right font-semibold tabular-nums',
                    variance < 0 ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400',
                )}
            >
                <SignedQty value={variance} />
            </span>
        </li>
    );
}

export function CountReviewDialog({
    open,
    onOpenChange,
    reference,
    warehouse,
    lines,
    confirming,
    onConfirm,
    onCloseAutoFocus,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    reference: string;
    warehouse: string;
    /** The sheet's lines as saved for this review; the caller keeps them through the close animation. */
    lines: StockCountLine[];
    confirming: boolean;
    onConfirm: () => void;
    onCloseAutoFocus?: (event: Event) => void;
}) {
    const t = useT();

    const summary = sheetSummary(lines);
    const toAdjust = lines.filter((l) => (varianceOf(l) ?? 0) !== 0);
    const desc = t('stock_count_review_desc').replace('{warehouse}', warehouse);

    return (
        <Dialog open={open} onOpenChange={(o) => !confirming && onOpenChange(o)}>
            <FormDialogContent onCloseAutoFocus={onCloseAutoFocus}>
                <FocusDialogHeader
                    icon={SquareCheckBig}
                    eyebrow={reference}
                    title={t('stock_count_review_title')}
                    srDescription={desc}
                    subtitle={<span className="text-muted-foreground text-sm">{desc}</span>}
                />
                <DialogBody className="space-y-4 py-4">
                    <CountKpiCards summary={summary} />
                    <section>
                        <h3 className="mb-1.5 text-sm font-semibold">{t('stock_count_to_adjust')}</h3>
                        {toAdjust.length === 0 ? (
                            <p className="border-border text-muted-foreground rounded-lg border px-3 py-4 text-center text-sm">
                                {t('stock_count_nothing_to_adjust')}
                            </p>
                        ) : (
                            <ul className="border-border overflow-hidden rounded-lg border">
                                {toAdjust.map((l) => (
                                    <AdjustRow key={l.id} line={l} />
                                ))}
                            </ul>
                        )}
                    </section>
                    <p className="text-muted-foreground text-xs">{t('stock_count_review_foot')}</p>
                </DialogBody>
                <DialogFooterBar>
                    <Button variant="outline" disabled={confirming} onClick={() => onOpenChange(false)}>
                        {t('stock_count_back_to_edit')}
                    </Button>
                    <Button disabled={confirming} aria-busy={confirming || undefined} onClick={onConfirm}>
                        {confirming && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                        {confirming ? t('saving') : t('stock_count_confirm_adjust')}
                    </Button>
                </DialogFooterBar>
            </FormDialogContent>
        </Dialog>
    );
}
