// Confirmed count sheet dialog: facts, summary cards, the rows (only differing ones by default), recount and print.
import { useT } from '@/lang';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { EmptyState } from '@/shared/components/empty-state';
import { ScrollTable } from '@/shared/components/scroll-table';
import { StatusBadge } from '@/shared/components/status-badge';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { localPair } from '@/shared/lib/local-name';
import { cn } from '@/shared/lib/utils';
import type { StockCount } from '@/shared/types';
import { Button, buttonVariants } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { Dialog, DialogBody, DialogContent, DialogFooterBar, focusDialogContentClass } from '@/shared/ui/dialog';
import { useToastStore } from '@/stores/toast';
import { useUiStore } from '@/stores/ui';
import { ClipboardCheck, Loader2, Printer } from 'lucide-react';
import { useState } from 'react';
import { stockCountApi } from '../../api/stockApi';
import { useStockCountMutations } from '../../hooks/use-stock';
import { sheetSummary } from '../../lib/count-sheet';
import { stockRefusalText } from '../../lib/refusal';
import {
    COUNT_HEAD_ROW,
    COUNT_TABLE,
    COUNT_TH,
    CountCols,
    CountDialogPending,
    CountFacts,
    countHeads,
    pendingFrameClass,
} from './count-dialog-parts';
import { CountKpiCards } from './count-kpi-cards';
import { varianceOf } from './count-line-parts';
import { CountReadRow } from './count-sheet-row';

export function CountDoneDialog({
    open,
    count,
    missing,
    failed,
    onRetry,
    listed,
    canRecount,
    onClose,
    onOpenCount,
}: {
    open: boolean;
    count: StockCount | undefined;
    missing: boolean;
    failed: boolean;
    onRetry: () => void;
    /** The list row it opened from, shown in the header while the record loads. */
    listed?: Pick<StockCount, 'reference' | 'status' | 'differing_lines'>;
    canRecount: boolean;
    onClose: () => void;
    /** Opens another count (the recount just made). */
    onOpenCount: (id: number) => void;
}) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const fmt = useDateFormat();
    const fmtN = useNumberFormat();
    const { recount } = useStockCountMutations();

    // The last record stays on screen through the close animation
    const [kept, setKept] = useState(count);
    if (count && count !== kept) setKept(count);
    const shown = open ? count : (count ?? kept);

    // Each opening starts on the differing rows only
    const [onlyDiff, setOnlyDiff] = useState(true);
    const [wasOpen, setWasOpen] = useState(open);
    if (open !== wasOpen) {
        setWasOpen(open);
        if (open) setOnlyDiff(true);
    }

    const lines = shown?.lines ?? [];
    const differing = lines.filter((l) => (varianceOf(l) ?? 0) !== 0);
    const rows = onlyDiff ? differing : lines;
    const manual = shown?.adjust_mode === 'manual';
    const showRecount = canRecount && !manual && shown?.warehouse_id != null && differing.length > 0;

    const startRecount = async () => {
        if (!shown) return;
        try {
            const created = await recount.mutateAsync(shown.id);
            onOpenCount(created.id);
        } catch (e) {
            useToastStore.getState().push(stockRefusalText(e, t), 'error');
        }
    };

    const stamp = (value: string | null | undefined) => (value ? fmt.dateTime(value) : '—');

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className={cn(focusDialogContentClass, !shown && pendingFrameClass(missing))}>
                {!shown ? (
                    <CountDialogPending kind="done" missing={missing} failed={failed} onRetry={onRetry} onClose={onClose} listed={listed} />
                ) : (
                    <>
                        <FocusDialogHeader
                            icon={ClipboardCheck}
                            eyebrow={shown.reference}
                            title={t('stock_count_sheet')}
                            srDescription={`${shown.reference} ${shown.warehouse ?? ''}`}
                            titleSuffix={
                                <>
                                    <StatusBadge tone="green">{t('stock_count_committed')}</StatusBadge>
                                    {manual && <StatusBadge tone="gray">{t('stock_count_mode_badge_manual')}</StatusBadge>}
                                </>
                            }
                            subtitle={
                                shown.recount_of ? (
                                    <span className="text-muted-foreground text-sm">
                                        {t('stock_count_recount_of').replace('{reference}', shown.recount_of.reference)}
                                    </span>
                                ) : undefined
                            }
                        />
                        <DialogBody className="motion-content-in flex flex-col gap-3.5 space-y-0 overflow-hidden py-4">
                            <CountFacts
                                items={[
                                    { label: t('stock_warehouse'), value: shown.warehouse || '—' },
                                    { label: t('stock_count_opened_by'), value: localPair(shown.counted_by, shown.counted_by_th, lang) || '—' },
                                    { label: t('stock_count_opened_at'), value: stamp(shown.created_at) },
                                    { label: t('stock_count_committed_by'), value: localPair(shown.committed_by, shown.committed_by_th, lang) || '—' },
                                    { label: t('stock_count_committed_at'), value: stamp(shown.committed_at) },
                                ]}
                            />
                            {shown.note && (
                                <p className="shrink-0 text-sm">
                                    <span className="text-muted-foreground mr-2 text-xs">{t('stock_notes')}</span>
                                    {shown.note}
                                </p>
                            )}
                            <CountKpiCards summary={sheetSummary(lines)} />
                            <label className="flex w-fit shrink-0 cursor-pointer items-center gap-2 text-sm">
                                <Checkbox className="size-4" checked={onlyDiff} onCheckedChange={(v) => setOnlyDiff(v === true)} />
                                {t('stock_count_only_diff')}
                            </label>

                            <ScrollTable
                                className="border-border flex-1 rounded-lg border"
                                tableClassName={COUNT_TABLE}
                                cols={<CountCols kind="done" />}
                                heads={countHeads(t)}
                                thClassName={COUNT_TH}
                                headRowClassName={COUNT_HEAD_ROW}
                                after={rows.length === 0 && <EmptyState title={t('stock_count_nothing_to_adjust')} className="min-h-0 py-8" />}
                            >
                                <tbody>
                                    {rows.map((l) => (
                                        <CountReadRow key={l.id} line={l} />
                                    ))}
                                </tbody>
                            </ScrollTable>
                        </DialogBody>
                        <DialogFooterBar>
                            {showRecount && (
                                <Button variant="outline" className="mr-auto" disabled={recount.isPending} onClick={startRecount}>
                                    {recount.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                                    {t('stock_count_recount').replace('{n}', fmtN(differing.length))}
                                </Button>
                            )}
                            {!manual && (
                                <a
                                    href={stockCountApi.pdfUrl(shown.id)}
                                    target="_blank"
                                    rel="noopener"
                                    className={buttonVariants({ variant: 'outline' })}
                                >
                                    <Printer className="h-4 w-4" aria-hidden />
                                    {t('stock_print')}
                                    <span className="sr-only">{t('stock_opens_new_tab')}</span>
                                </a>
                            )}
                            <Button variant="outline" onClick={onClose}>
                                {t('close')}
                            </Button>
                        </DialogFooterBar>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
