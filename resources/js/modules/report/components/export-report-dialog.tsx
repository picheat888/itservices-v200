/**
 * Export dialog of the Ticket & SLA report: pick Excel or PDF, download with the current
 * filters. Centered focus dialog (FocusDialogHeader) per the app's dialog standard.
 */
import { useT } from '@/lang';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { Button } from '@/shared/ui/button';
import { ChoiceCard } from '@/shared/ui/choice-card';
import { Dialog, DialogContent, DialogFooter } from '@/shared/ui/dialog';
import { Download, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useExportTicketOverview } from '../hooks/use-reports';
import type { ExportFormat, TicketReportFilters } from '../types';

/** Mirrors TicketOverviewExporter::PDF_ROW_LIMIT. */
const PDF_ROW_LIMIT = 1000;

export function ExportReportDialog({
    open,
    onOpenChange,
    filters,
    total,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    filters: TicketReportFilters;
    total: number;
}) {
    const t = useT();
    const [format, setFormat] = useState<ExportFormat>('xlsx');
    const exportMut = useExportTicketOverview();

    const handleOpenChange = (next: boolean) => {
        if (!next) exportMut.reset();
        onOpenChange(next);
    };

    const run = () =>
        exportMut.mutate(
            { filters, format },
            {
                onSuccess: () => onOpenChange(false),
            },
        );

    const choices: { value: ExportFormat; title: string; desc: string; tone: string }[] = [
        { value: 'xlsx', title: t('rep_export_xlsx'), desc: t('rep_export_xlsx_desc'), tone: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
        { value: 'pdf', title: t('rep_export_pdf'), desc: t('rep_export_pdf_desc'), tone: 'bg-red-500/10 text-red-600 dark:text-red-400' },
    ];

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="max-w-xl p-0">
                <FocusDialogHeader
                    icon={Download}
                    eyebrow={t('rep_export_eyebrow')}
                    title={t('rep_tickets_overview_title')}
                    subtitle={`${filters.from} – ${filters.to}`}
                    srDescription={t('rep_export_eyebrow')}
                />
                <div className="space-y-4 px-6 pb-2">
                    <div className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{t('rep_export_format')}</div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        {choices.map((c) => (
                            <ChoiceCard key={c.value} selected={format === c.value} onClick={() => { exportMut.reset(); setFormat(c.value); }} className="flex gap-3 rounded-lg p-3 text-left">
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
                    {exportMut.isError && <div className="text-destructive text-sm">{t('rep_export_failed')}</div>}
                </div>
                <DialogFooter className="border-border border-t px-6 py-4">
                    <Button onClick={run} disabled={exportMut.isPending}>
                        {exportMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        {format === 'xlsx' ? t('rep_export_go_xlsx') : t('rep_export_go_pdf')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
