/**
 * Generic export dialog shared by every report page: pick Excel or PDF, then run the
 * caller's own export (ticket overview or a tabular report). Centered focus dialog
 * (FocusDialogHeader) per the app's dialog standard. The dialog owns only the format
 * choice and the PDF-cap note; the caller owns the mutation (isPending/isError/reset)
 * and closes the dialog itself on success.
 */
import { useT } from '@/lang';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { Button } from '@/shared/ui/button';
import { ChoiceCard } from '@/shared/ui/choice-card';
import { Dialog, DialogContent, DialogFooter } from '@/shared/ui/dialog';
import { Download, Loader2 } from 'lucide-react';
import { useState } from 'react';
import type { ExportFormat } from '../types';

/** Mirrors TabularReportExporter::PDF_ROW_LIMIT (and TicketOverviewExporter's own copy). */
const PDF_ROW_LIMIT = 1000;

export function ExportReportDialog({
    open,
    onOpenChange,
    title,
    subtitle,
    total,
    formats,
    onExport,
    isPending,
    isError,
    onReset,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    subtitle?: string;
    total: number;
    formats: ExportFormat[];
    onExport: (format: ExportFormat) => Promise<unknown>;
    isPending: boolean;
    isError: boolean;
    onReset: () => void;
}) {
    const t = useT();
    const [format, setFormat] = useState<ExportFormat>(formats[0] ?? 'xlsx');

    const handleOpenChange = (next: boolean) => {
        if (!next) onReset();
        onOpenChange(next);
    };

    const run = () => {
        // isError already surfaces the failure inline — nothing else to do with a
        // rejection here, but it still needs a handler or it's an unhandled rejection.
        onExport(format)
            .then(() => onOpenChange(false))
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
                    <div className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{t('rep_export_format')}</div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        {choices.map((c) => (
                            <ChoiceCard
                                key={c.value}
                                selected={format === c.value}
                                onClick={() => {
                                    onReset();
                                    setFormat(c.value);
                                }}
                                className="flex gap-3 rounded-lg p-3 text-left"
                            >
                                <span className={`flex h-10 w-9 shrink-0 items-center justify-center rounded font-mono text-[10px] font-bold uppercase ${c.tone}`}>
                                    {c.value}
                                </span>
                                <span>
                                    <span className="block text-sm font-semibold">{c.title}</span>
                                    <span className="text-muted-foreground text-xs">{c.desc}</span>
                                </span>
                            </ChoiceCard>
                        ))}
                    </div>
                    <div className="bg-brand/5 rounded-lg px-3 py-2 text-sm">
                        {t('rep_export_scope').replace('{n}', String(total))}
                        {format === 'pdf' && total > PDF_ROW_LIMIT && (
                            <div className="text-muted-foreground mt-1 text-xs">{t('rep_export_pdf_cap').replace('{n}', String(PDF_ROW_LIMIT))}</div>
                        )}
                    </div>
                    {isError && <div className="text-destructive text-sm">{t('rep_export_failed')}</div>}
                </div>
                <DialogFooter className="border-border border-t px-6 py-4">
                    <Button onClick={run} disabled={isPending}>
                        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        {format === 'xlsx' ? t('rep_export_go_xlsx') : t('rep_export_go_pdf')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
