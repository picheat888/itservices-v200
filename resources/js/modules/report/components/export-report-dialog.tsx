/**
 * Generic export dialog shared by every report page: pick Excel or PDF, then queue the
 * caller's own export (ticket overview or a tabular report). Centered focus dialog
 * (FocusDialogHeader) per the app's dialog standard. One summary box says what the file holds —
 * the row count, the dates and filters as chips (`filterChips`, from schedule-filter-summary.ts),
 * the column / PDF-cap notes — with the "made in the background" line under it. The format
 * cards are a radio group to assistive tech. The dialog owns the format choice and the toast
 * (clicking it opens the Report Center, where "ไฟล์ส่งออกของฉัน" lists the file); the caller
 * owns the mutation (isPending/error/reset).
 */
import { useT } from '@/lang';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { refusalText } from '@/shared/lib/api-errors';
import { Button } from '@/shared/ui/button';
import { ChoiceCard } from '@/shared/ui/choice-card';
import { Dialog, DialogContent, DialogFooter } from '@/shared/ui/dialog';
import { useToastStore } from '@/stores/toast';
import { Download, Info, Loader2 } from 'lucide-react';
import { useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ExportFormat } from '../types';
import type { FilterChip } from './schedule-filter-summary';

/** Mirrors TabularReportExporter::PDF_ROW_LIMIT (and TicketOverviewExporter's own copy). */
const PDF_ROW_LIMIT = 1000;

export function ExportReportDialog({
    open,
    onOpenChange,
    title,
    subtitle,
    total,
    formats,
    note,
    filterChips,
    onExport,
    isPending,
    error,
    onReset,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    subtitle?: string;
    total: number;
    formats: ExportFormat[];
    /** One extra line under the scope note (e.g. "only the 5 columns shown"). */
    note?: string;
    /** The dates and filters the file is built with; [] = the whole report. */
    filterChips?: FilterChip[];
    onExport: (format: ExportFormat) => Promise<unknown>;
    isPending: boolean;
    /** The mutation's error — a refusal (e.g. too many files waiting) is worded from its reason. */
    error: unknown;
    onReset: () => void;
}) {
    const t = useT();
    const navigate = useNavigate();
    const [format, setFormat] = useState<ExportFormat>(formats[0] ?? 'xlsx');
    const formatLabelId = useId();

    const handleOpenChange = (next: boolean) => {
        if (!next) onReset();
        onOpenChange(next);
    };

    const run = () => {
        // `error` already surfaces the failure inline — nothing else to do with a
        // rejection here, but it still needs a handler or it's an unhandled rejection.
        onExport(format)
            .then(() => {
                onOpenChange(false);
                // The file is built on the queue; its bell says when it is ready.
                useToastStore.getState().push(t('rep_export_queued'), 'success', t('rep_export_queued_title'), undefined, {
                    duration: 6000,
                    onActivate: () => navigate('/reports'),
                });
            })
            .catch(() => {});
    };

    const allChoices: Record<ExportFormat, { title: string; desc: string; tone: string }> = {
        xlsx: { title: t('rep_export_xlsx'), desc: t('rep_export_xlsx_desc'), tone: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
        pdf: { title: t('rep_export_pdf'), desc: t('rep_export_pdf_desc'), tone: 'bg-red-500/10 text-red-600 dark:text-red-400' },
    };
    const choices = formats.map((value) => ({ value, ...allChoices[value] }));

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="max-w-xl p-0">
                <FocusDialogHeader
                    icon={Download}
                    eyebrow={t('rep_export_eyebrow')}
                    title={title}
                    subtitle={subtitle}
                    srDescription={t('rep_export_eyebrow')}
                />
                <div className="space-y-4 px-6 pb-2">
                    <div id={formatLabelId} className="text-muted-foreground text-xs font-semibold">
                        {t('rep_export_format')}
                    </div>
                    <div role="radiogroup" aria-labelledby={formatLabelId} className="grid gap-3 sm:grid-cols-2">
                        {choices.map((c) => (
                            <ChoiceCard
                                key={c.value}
                                role="radio"
                                aria-checked={format === c.value}
                                selected={format === c.value}
                                onClick={() => {
                                    onReset();
                                    setFormat(c.value);
                                }}
                                className="flex gap-3 rounded-lg p-3 text-left"
                            >
                                <span
                                    className={`flex h-10 w-9 shrink-0 items-center justify-center rounded font-mono text-[10px] font-bold uppercase ${c.tone}`}
                                >
                                    {c.value}
                                </span>
                                <span>
                                    <span className="block text-sm font-semibold">{c.title}</span>
                                    <span className="text-muted-foreground text-xs">{c.desc}</span>
                                </span>
                            </ChoiceCard>
                        ))}
                    </div>
                    {/* One box for what the file holds: how many rows, which dates and filters, then the caveats. */}
                    <div className="bg-brand/5 space-y-2 rounded-lg px-3 py-2.5 text-sm">
                        <div className="font-medium">{t('rep_export_scope').replace('{n}', total.toLocaleString())}</div>
                        {filterChips && (
                            <div className="flex flex-wrap items-center gap-1.5 text-xs">
                                <span className="text-muted-foreground">{t('rep_schedule_filters_label')}</span>
                                {filterChips.length === 0 ? (
                                    <span className="text-muted-foreground">{t('rep_export_filters_none')}</span>
                                ) : (
                                    filterChips.map((chip) => (
                                        <span key={chip.label} className="bg-background border-border rounded-full border px-2 py-0.5">
                                            <span className="text-muted-foreground">{chip.label}:</span>{' '}
                                            <span className="font-medium">{chip.value}</span>
                                        </span>
                                    ))
                                )}
                            </div>
                        )}
                        {note && <div className="text-muted-foreground text-xs">{note}</div>}
                        {format === 'pdf' && total > PDF_ROW_LIMIT && (
                            <div className="text-muted-foreground text-xs">{t('rep_export_pdf_cap').replace('{n}', String(PDF_ROW_LIMIT))}</div>
                        )}
                    </div>
                    {/* Said before the click — the file is not what comes back from the button. */}
                    <div className="text-muted-foreground flex items-start gap-2 text-xs">
                        <Info className="mt-px h-3.5 w-3.5 shrink-0" />
                        <span>{t('rep_export_queue_note')}</span>
                    </div>
                    {error != null && <div className="text-destructive text-sm">{refusalText(error, t, 'rep_export_refusal_')}</div>}
                </div>
                <DialogFooter className="border-border border-t px-6 py-4">
                    <Button variant="ghost" onClick={() => handleOpenChange(false)}>
                        {t('rep_dialog_cancel')}
                    </Button>
                    <Button onClick={run} disabled={isPending}>
                        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        {format === 'xlsx' ? t('rep_export_go_xlsx') : t('rep_export_go_pdf')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
