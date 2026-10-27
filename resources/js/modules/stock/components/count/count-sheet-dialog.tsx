// "ใบนับสต็อก" dialog: a draft takes counts, serial ticks and reasons, saves, and goes to review; a cancelled sheet is read only.
import { useT } from '@/lang';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { EmptyState } from '@/shared/components/empty-state';
import { SaveButton } from '@/shared/components/save-button';
import { StatusBadge } from '@/shared/components/status-badge';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { searchLabel } from '@/shared/lib/search-words';
import { TABLE_HEAD } from '@/shared/lib/surface';
import { cn } from '@/shared/lib/utils';
import type { CountReason, StockCount, StockCountLine } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { Dialog, DialogBody, DialogContent, DialogFooterBar, focusDialogContentClass } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { useToastStore } from '@/stores/toast';
import { ClipboardCheck, Loader2, Lock, Search } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import type { LinePatch } from '../../api/stockApi';
import { useStockCountMutations } from '../../hooks/use-stock';
import { draftLine, filterIds, lineNeedsReason, linePatch, linesByIds, sheetSummary, type LineEdit, type SheetChip } from '../../lib/count-sheet';
import { stockRefusalText } from '../../lib/refusal';
import { CountChip } from './count-chip';
import { CountDialogPending, CountFacts, pendingFrameClass } from './count-dialog-parts';
import { CountReviewDialog } from './count-review-dialog';
import { CountSerialDialog } from './count-serial-dialog';
import { CountReadRow, CountSheetRow } from './count-sheet-row';

const statusTone = (s: StockCount['status']) => (s === 'committed' ? 'green' : s === 'canceled' ? 'gray' : 'amber');

export function CountSheetDialog({
    open,
    count,
    missing,
    failed,
    onRetry,
    canEdit,
    onClose,
    onRefetch,
}: {
    open: boolean;
    count: StockCount | undefined;
    missing: boolean;
    failed: boolean;
    onRetry: () => void;
    canEdit: boolean;
    onClose: () => void;
    /** Resolves once the open count has been read again (after a save or the commit). */
    onRefetch: () => Promise<{ isError: boolean; error: unknown }>;
}) {
    const t = useT();
    const fmt = useDateFormat();
    const fmtN = useNumberFormat();
    const confirm = useConfirm();
    const { save, commit, cancel } = useStockCountMutations();
    const tableRef = useRef<HTMLDivElement>(null);

    // The last record stays on screen through the close animation
    const [kept, setKept] = useState(count);
    if (count && count !== kept) setKept(count);
    const shown = open ? count : (count ?? kept);

    const [edits, setEdits] = useState<Record<number, LineEdit>>({});
    const [chip, setChip] = useState<SheetChip>('all');
    const [query, setQuery] = useState('');
    const [filterRun, setFilterRun] = useState(0);
    const [serial, setSerial] = useState<{ lineId: number; open: boolean } | null>(null);
    const [review, setReview] = useState<{ open: boolean; lines: StockCountLine[] }>({ open: false, lines: [] });
    const [busy, setBusy] = useState<'save' | 'review' | 'commit' | null>(null);
    const [saved, setSaved] = useState(false);

    // Each opening, or another count, starts with no edits and no filter
    const openKey = open ? (count?.id ?? 0) : null;
    const [seenKey, setSeenKey] = useState(openKey);
    if (openKey !== seenKey) {
        setSeenKey(openKey);
        if (openKey !== null) {
            setEdits({});
            setChip('all');
            setQuery('');
            setSaved(false);
        }
    }

    const editable = shown?.status === 'draft' && canEdit;
    const savedLines = useMemo(() => shown?.lines ?? [], [shown]);
    const lines = useMemo(() => savedLines.map((l) => draftLine(l, edits[l.id])), [savedLines, edits]);
    const patches = useMemo(() => {
        const out: Record<number, LinePatch> = {};
        savedLines.forEach((l, i) => {
            const patch = linePatch(l, lines[i]);
            if (patch) out[l.id] = patch;
        });
        return out;
    }, [savedLines, lines]);
    const dirty = editable && Object.keys(patches).length > 0;
    const guardClose = useDiscardGuard(open && dirty);
    const summary = sheetSummary(lines);

    // The rows a filter picks stay in view while they are edited, until the filter is set again
    const filterKey = `${openKey}|${savedLines.length}|${chip}|${query}|${filterRun}`;
    const [picked, setPicked] = useState<{ key: string; ids: number[] } | null>(null);
    let shownIds = picked?.key === filterKey ? picked.ids : null;
    if (shownIds === null) {
        shownIds = filterIds(lines, chip, query);
        setPicked({ key: filterKey, ids: shownIds });
    }
    const visible = linesByIds(lines, shownIds);
    const pickChip = (next: SheetChip) => {
        setChip(next);
        setFilterRun((n) => n + 1);
    };
    const warehouse = shown?.warehouse ?? '—';

    const toastError = (e: unknown) => useToastStore.getState().push(stockRefusalText(e, t), 'error');

    const edit = (line: StockCountLine, change: LineEdit) => {
        setSaved(false);
        setEdits((prev) => ({ ...prev, [line.id]: { ...prev[line.id], ...change } }));
    };
    const serialLine = serial ? (lines.find((l) => l.id === serial.lineId) ?? null) : null;
    const applySerials = (missingIds: number[], foundIds: number[]) => {
        if (!serialLine) return;
        edit(serialLine, { missing: missingIds, found: foundIds });
    };

    // Sends every edited line, reads the count again, then drops the edits that went out
    const persist = async (): Promise<boolean> => {
        if (!shown || Object.keys(patches).length === 0) return true;
        const sent = edits;
        try {
            await save.mutateAsync({ id: shown.id, lines: patches });
            const read = await onRefetch();
            // Saved, but the fresh copy did not arrive: keep the edits so the old values never show
            if (read.isError) {
                toastError(read.error);
                return false;
            }
            setEdits((cur) => Object.fromEntries(Object.entries(cur).filter(([id, e]) => sent[Number(id)] !== e)));
            return true;
        } catch (e) {
            toastError(e);
            return false;
        }
    };

    const saveDraft = async () => {
        setBusy('save');
        const ok = await persist();
        setBusy(null);
        setSaved(ok);
    };

    // A differing row without a reason blocks the review: show those rows and put the first in view
    const startReview = async () => {
        const first = lines.find(lineNeedsReason);
        if (first) {
            pickChip('no_reason');
            setQuery('');
            window.requestAnimationFrame(() => {
                const row = tableRef.current?.querySelector<HTMLElement>(`[data-line-id="${first.id}"]`);
                row?.scrollIntoView({ block: 'center' });
                row?.querySelector<HTMLElement>('select, textarea')?.focus({ preventScroll: true });
            });
            return;
        }
        setBusy('review');
        const ok = await persist();
        setBusy(null);
        if (ok) setReview({ open: true, lines });
    };

    const confirmCommit = async () => {
        if (!shown) return;
        setBusy('commit');
        try {
            await commit.mutateAsync(shown.id);
            const read = await onRefetch();
            if (read.isError) toastError(read.error);
            setReview((r) => ({ ...r, open: false }));
        } catch (e) {
            toastError(e);
        } finally {
            setBusy(null);
        }
    };

    const cancelSheet = async () => {
        if (!shown) return;
        const done = await confirm({
            variant: 'warn',
            title: t('stock_count_cancel_sheet'),
            description: t('stock_count_cancel_confirm'),
            entity: { name: shown.reference },
            confirmText: t('stock_count_cancel_sheet'),
            cancelText: t('stock_count_back'),
            action: () => cancel.mutateAsync(shown.id),
            errorMessage: (e) => stockRefusalText(e, t),
        });
        if (done) {
            setEdits({});
            onClose();
        }
    };

    const chips: { id: SheetChip; label: string; n: number; tone?: 'red' | 'green' }[] = [
        { id: 'all', label: t('stock_count_chip_all'), n: summary.total },
        { id: 'pending', label: t('stock_count_chip_pending'), n: summary.total - summary.counted },
        { id: 'short', label: t('stock_count_chip_short'), n: summary.short, tone: 'red' },
        { id: 'over', label: t('stock_count_chip_over'), n: summary.over, tone: 'green' },
        { id: 'same', label: t('stock_count_chip_same'), n: summary.same },
        { id: 'no_reason', label: t('stock_count_chip_no_reason'), n: summary.noReason, tone: summary.noReason > 0 ? 'red' : undefined },
    ];

    return (
        <Dialog open={open} onOpenChange={(o) => !o && guardClose(onClose)}>
            <DialogContent className={cn(focusDialogContentClass, !shown && pendingFrameClass(missing))}>
                {!shown ? (
                    <CountDialogPending missing={missing} failed={failed} onRetry={onRetry} onClose={onClose} />
                ) : (
                    <>
                        <FocusDialogHeader
                            icon={ClipboardCheck}
                            eyebrow={shown.reference}
                            title={t('stock_count_sheet')}
                            srDescription={`${shown.reference} ${warehouse}`}
                            titleSuffix={<StatusBadge tone={statusTone(shown.status)}>{t(`stock_count_${shown.status}`)}</StatusBadge>}
                            subtitle={
                                shown.recount_of ? (
                                    <span className="text-muted-foreground text-sm">
                                        {t('stock_count_recount_of').replace('{reference}', shown.recount_of.reference)}
                                    </span>
                                ) : undefined
                            }
                        />
                        <DialogBody className="flex flex-col gap-3 space-y-0 overflow-hidden py-4">
                            <CountFacts
                                items={[
                                    { label: t('stock_warehouse'), value: warehouse },
                                    { label: t('stock_count_opened_by'), value: shown.counted_by || '—' },
                                    { label: t('stock_count_opened_at'), value: shown.created_at ? fmt.dateTime(shown.created_at) : '—' },
                                    {
                                        label: t('stock_count_fact_progress'),
                                        value: t('stock_count_progress_of')
                                            .replace('{n}', fmtN(summary.counted))
                                            .replace('{total}', fmtN(summary.total)),
                                    },
                                ]}
                            />

                            {/* Search and filter chips */}
                            <div className="flex shrink-0 flex-wrap items-center gap-2">
                                <div className="relative max-w-80 min-w-48 flex-1">
                                    <Search
                                        className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2"
                                        aria-hidden
                                    />
                                    <Input
                                        type="search"
                                        name="count-line-search"
                                        autoComplete="off"
                                        aria-label={searchLabel(t('stock_count_search'))}
                                        placeholder={t('stock_count_search')}
                                        value={query}
                                        onChange={(e) => setQuery(e.target.value)}
                                        className="h-9 pl-8 text-sm"
                                    />
                                </div>
                                <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('filters')}>
                                    {chips.map((c) => (
                                        <CountChip
                                            key={c.id}
                                            label={c.label}
                                            count={c.n}
                                            tone={c.tone}
                                            selected={chip === c.id}
                                            onClick={() => pickChip(c.id)}
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* Lines: the header stays, only the table scrolls */}
                            <div
                                ref={tableRef}
                                className="border-border min-h-0 flex-1 scroll-pt-10 overflow-auto overscroll-contain rounded-lg border"
                            >
                                <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
                                    <colgroup>
                                        <col />
                                        <col className="w-[72px] lg:w-[90px]" />
                                        <col className="w-[104px] lg:w-[120px]" />
                                        <col className="w-[88px] lg:w-[96px]" />
                                        <col className="w-[210px] lg:w-[330px]" />
                                    </colgroup>
                                    <thead className={cn(TABLE_HEAD, 'sticky top-0 z-10')}>
                                        <tr className="text-muted-foreground text-left text-xs font-medium">
                                            <th scope="col" className="border-border border-b px-3 py-2">
                                                {t('stock_item')}
                                            </th>
                                            <th scope="col" className="border-border border-b px-3 py-2 text-right">
                                                {t('stock_count_col_system')}
                                            </th>
                                            <th scope="col" className="border-border border-b px-3 py-2 text-right">
                                                {t('stock_count_col_counted')}
                                            </th>
                                            <th scope="col" className="border-border border-b px-3 py-2 text-center">
                                                {t('stock_count_col_diff')}
                                            </th>
                                            <th scope="col" className="border-border border-b px-3 py-2">
                                                {t('stock_count_col_reason')}
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody inert={busy !== null} className={cn(busy !== null && 'opacity-60')}>
                                        {visible.map((l) =>
                                            editable ? (
                                                <CountSheetRow
                                                    key={l.id}
                                                    line={l}
                                                    qtyText={edits[l.id]?.qty ?? (l.counted_qty === null ? '' : String(l.counted_qty))}
                                                    onQty={(qty) => edit(l, { qty })}
                                                    onReason={(reason: CountReason | null) => edit(l, { reason })}
                                                    onNote={(note) => edit(l, { note })}
                                                    onOpenSerials={() => setSerial({ lineId: l.id, open: true })}
                                                />
                                            ) : (
                                                <CountReadRow key={l.id} line={l} />
                                            ),
                                        )}
                                    </tbody>
                                </table>
                                {visible.length === 0 && <EmptyState kind="search" title={t('stock_count_no_match')} className="min-h-0 py-10" />}
                            </div>

                            {editable && (
                                <p className="text-muted-foreground flex shrink-0 items-start gap-2 text-xs">
                                    <Lock className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                                    {t('stock_count_freeze_note').replace('{n}', fmtN(summary.total)).replace('{warehouse}', warehouse)}
                                </p>
                            )}
                        </DialogBody>
                        <DialogFooterBar>
                            {editable ? (
                                <>
                                    <Button
                                        variant="ghost"
                                        className="text-destructive hover:text-destructive mr-auto"
                                        disabled={busy !== null}
                                        onClick={cancelSheet}
                                    >
                                        {t('stock_count_cancel_sheet')}
                                    </Button>
                                    <SaveButton
                                        variant="outline"
                                        loading={busy === 'save'}
                                        success={saved}
                                        disabled={!dirty || busy !== null}
                                        onClick={saveDraft}
                                    >
                                        {t('stock_count_save_draft')}
                                    </SaveButton>
                                    <Button
                                        disabled={summary.counted === 0 || busy !== null}
                                        aria-busy={busy === 'review' || undefined}
                                        onClick={startReview}
                                    >
                                        {busy === 'review' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                                        {t('stock_count_review')}
                                    </Button>
                                </>
                            ) : (
                                <Button variant="outline" onClick={onClose}>
                                    {t('close')}
                                </Button>
                            )}
                        </DialogFooterBar>

                        {editable && (
                            <CountSerialDialog
                                line={serialLine}
                                warehouse={warehouse}
                                lostGroupRef={shown.recount_of?.reference}
                                open={serial?.open ?? false}
                                onOpenChange={(o) => setSerial((s) => (s ? { ...s, open: o } : s))}
                                onApply={applySerials}
                            />
                        )}
                        <CountReviewDialog
                            open={review.open}
                            onOpenChange={(o) => setReview((r) => ({ ...r, open: o }))}
                            reference={shown.reference}
                            warehouse={warehouse}
                            lines={review.lines}
                            confirming={busy === 'commit'}
                            onConfirm={confirmCommit}
                        />
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
