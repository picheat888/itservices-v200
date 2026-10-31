// One row of the count sheet table: editable on a draft (count, serial button, reason select and note), plain text otherwise.
import { useT } from '@/lang';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { cn } from '@/shared/lib/utils';
import type { CountReason, StockCountLine } from '@/shared/types';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import { ScanBarcode } from 'lucide-react';
import { useId } from 'react';
import { clampQtyText, lineNeedsReason, OVER_REASONS, SHORT_REASONS } from '../../lib/count-sheet';
import { DiffBadge, ItemCell, ReasonCell, varianceOf } from './count-line-parts';

const CELL = 'border-border/60 border-b px-3 py-2 align-middle';
const SELECT =
    'border-input bg-background hover:border-brand/50 focus-visible:border-brand focus-visible:ring-brand/15 h-9 w-full rounded-md border px-2 text-sm transition-[border-color,box-shadow] focus-visible:ring-[3px] focus-visible:outline-hidden';

const rowTint = (variance: number | null) =>
    variance === null || variance === 0 ? '' : variance < 0 ? 'bg-red-50/60 dark:bg-red-950/15' : 'bg-emerald-50/60 dark:bg-emerald-950/15';

/** Read-only row (confirmed or cancelled sheets). */
export function CountReadRow({ line }: { line: StockCountLine }) {
    const fmtN = useNumberFormat();
    return (
        <tr>
            <td className={CELL}>
                <ItemCell line={line} />
            </td>
            <td className={cn(CELL, 'text-muted-foreground text-right tabular-nums')}>{fmtN(line.system_qty)}</td>
            <td className={cn(CELL, 'text-right tabular-nums')}>{line.counted_qty === null ? '—' : fmtN(line.counted_qty)}</td>
            <td className={cn(CELL, 'text-center')}>
                <DiffBadge variance={varianceOf(line)} />
            </td>
            <td className={CELL}>
                <ReasonCell line={line} />
            </td>
        </tr>
    );
}

export function CountSheetRow({
    line,
    qtyText,
    onQty,
    onReason,
    onNote,
    onOpenSerials,
}: {
    /** The line with this sheet's unsaved edits laid over it. */
    line: StockCountLine;
    qtyText: string;
    onQty: (raw: string) => void;
    onReason: (reason: CountReason | null) => void;
    onNote: (note: string) => void;
    onOpenSerials: () => void;
}) {
    const t = useT();
    const fmtN = useNumberFormat();
    const helpId = useId();
    const variance = varianceOf(line);
    const needs = lineNeedsReason(line);
    const options = variance !== null && variance < 0 ? SHORT_REASONS : OVER_REASONS;
    const custom = line.reason === 'custom';
    const noteMissing = needs && custom;
    const reasonMissing = needs && !custom;
    const countedText = line.counted_qty === null ? '—' : fmtN(line.counted_qty);

    return (
        <tr data-line-id={line.id} className={rowTint(variance)}>
            <td className={CELL}>
                <ItemCell line={line} />
            </td>
            <td className={cn(CELL, 'text-muted-foreground text-right tabular-nums')}>{fmtN(line.system_qty)}</td>
            <td className={CELL}>
                {line.track_serial ? (
                    <button
                        type="button"
                        onClick={onOpenSerials}
                        aria-label={
                            line.counted_qty === null
                                ? t('stock_count_tick_serials_none').replace('{sku}', line.sku ?? '')
                                : t('stock_count_tick_serials')
                                      .replace('{sku}', line.sku ?? '')
                                      .replace('{n}', countedText)
                        }
                        className="hover:border-brand/50 focus-visible:border-brand focus-visible:ring-brand/15 bg-background ml-auto flex h-9 w-20 items-center justify-between rounded-md border border-violet-300 px-2.5 text-sm tabular-nums transition-[border-color,box-shadow] focus-visible:ring-[3px] focus-visible:outline-hidden dark:border-violet-500/50"
                    >
                        <ScanBarcode className="h-3.5 w-3.5 text-violet-700 dark:text-violet-300" aria-hidden />
                        <span className={cn(line.counted_qty === null && 'text-muted-foreground')}>{countedText}</span>
                    </button>
                ) : (
                    <Input
                        inputMode="numeric"
                        name={`count-${line.id}`}
                        autoComplete="off"
                        maxLength={7}
                        aria-label={`${t('stock_count_col_counted')} ${line.sku ?? ''}`}
                        value={qtyText}
                        placeholder="—"
                        onChange={(e) => onQty(clampQtyText(e.target.value))}
                        className="ml-auto h-9 w-20 text-right tabular-nums"
                    />
                )}
            </td>
            <td className={cn(CELL, 'text-center')}>
                <DiffBadge variance={variance} />
            </td>
            <td className={CELL}>
                {variance === null || variance === 0 ? (
                    <span className="text-muted-foreground">—</span>
                ) : (
                    <div className="space-y-1.5">
                        <select
                            name={`reason-${line.id}`}
                            value={line.reason ?? ''}
                            onChange={(e) => onReason((e.target.value || null) as CountReason | null)}
                            aria-label={`${t('stock_count_col_reason')} ${line.sku ?? ''}`}
                            aria-invalid={reasonMissing || undefined}
                            aria-describedby={reasonMissing ? helpId : undefined}
                            className={cn(SELECT, line.reason === null && 'text-muted-foreground', reasonMissing && 'border-destructive')}
                        >
                            <option value="">{t('stock_count_reason_pick')}</option>
                            {options.map((r) => (
                                <option key={r} value={r}>
                                    {t(`stock_count_reason_${r}`)}
                                </option>
                            ))}
                        </select>
                        {custom && (
                            <Textarea
                                rows={2}
                                name={`reason-note-${line.id}`}
                                maxLength={500}
                                value={line.reason_note ?? ''}
                                onChange={(e) => onNote(e.target.value)}
                                aria-label={`${t('stock_count_reason_note')} ${line.sku ?? ''}`}
                                aria-invalid={noteMissing || undefined}
                                aria-describedby={noteMissing ? helpId : undefined}
                                placeholder={t('stock_count_reason_note_ph')}
                                className={cn('min-h-0 resize-y py-1.5', noteMissing && 'border-destructive')}
                            />
                        )}
                        {needs && (
                            <p id={helpId} className="text-destructive text-xs">
                                {t('stock_count_reason_needed')}
                            </p>
                        )}
                    </div>
                )}
            </td>
        </tr>
    );
}
