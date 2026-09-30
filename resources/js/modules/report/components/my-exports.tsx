/**
 * "ไฟล์ Export ของฉัน" in the Report Center's right rail: the files this person queued from a report's
 * Export dialog, newest first — waiting / being built (polled until done), ready to
 * download for 7 days, or failed with a Retry. Hidden while there is nothing to list.
 * Data: useMyExports (GET /api/reports/exports).
 */
import { useT } from '@/lang';
import { refusalText } from '@/shared/lib/api-errors';
import { formatDateTime } from '@/shared/lib/datetime';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { useToastStore } from '@/stores/toast';
import { AlertCircle, CheckCircle2, Clock, Download, FolderDown, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { useDeleteExport, useDownloadExport, useMyExports, useRetryExport } from '../hooks/use-reports';
import type { ReportExportItem, ReportExportStatus } from '../types';
import { reportStem } from './report-catalogue';
import { reportScope } from './report-scope';

/** Mirrors ReportExport::KEEP_DAYS. */
const KEEP_DAYS = 7;

/** A file still queued after this long most likely has no worker picking it up. */
const SLOW_QUEUE_MS = 2 * 60 * 1000;

const STATUS_META: Record<ReportExportStatus, { Icon: typeof Clock; tone: string; spin?: boolean }> = {
    queued: { Icon: Clock, tone: 'text-slate-600 dark:text-slate-300 bg-slate-500/10' },
    running: { Icon: Loader2, tone: 'text-blue-600 dark:text-blue-400 bg-blue-500/10', spin: true },
    ready: { Icon: CheckCircle2, tone: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10' },
    failed: { Icon: AlertCircle, tone: 'text-red-600 dark:text-red-400 bg-red-500/10' },
};

function formatSize(bytes: number | null): string | null {
    if (bytes == null) return null;
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ExportRow({ item }: { item: ReportExportItem }) {
    const t = useT();
    const confirm = useConfirm();
    const download = useDownloadExport();
    const retry = useRetryExport();
    const remove = useDeleteExport();
    const { Icon, tone, spin } = STATUS_META[item.status];
    const title = t(`rep_${reportStem(item.report_key)}_title`);
    const slow = item.status === 'queued' && Date.now() - new Date(item.created_at).getTime() > SLOW_QUEUE_MS;

    const details: string[] = [formatDateTime(item.created_at)];
    if (item.status === 'ready') {
        if (item.rows_count != null) details.push(t('rep_my_exports_rows').replace('{n}', String(item.rows_count)));
        const size = formatSize(item.size_bytes);
        if (size) details.push(size);
    }
    // The panel heading already says how long files are kept; the exact day sits in the tooltip.
    const keptUntil = item.expires_at ? t('rep_my_exports_kept_until').replace('{date}', formatDateTime(item.expires_at, false)) : undefined;

    const onDownload = () =>
        download.mutate(item, {
            onError: () => useToastStore.getState().push(t('rep_my_exports_download_failed'), 'error'),
        });

    const onRetry = () =>
        retry.mutate(item.id, {
            onError: (error) => useToastStore.getState().push(refusalText(error, t, 'rep_export_refusal_'), 'error'),
        });

    const onDelete = async () => {
        const ok = await confirm({
            variant: 'danger',
            entity: { name: title, sub: item.file_name ?? item.format.toUpperCase() },
            action: () => remove.mutateAsync(item.id),
        });
        if (ok) useToastStore.getState().push(t('rep_my_exports_deleted'), 'error', undefined, 'trash', { duration: 4000 });
    };

    return (
        <div className="border-border flex gap-3 border-b px-4 py-3 last:border-b-0">
            <span
                className={cn(
                    'flex h-10 w-9 shrink-0 items-center justify-center rounded font-mono text-[10px] font-bold uppercase',
                    item.format === 'xlsx'
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : 'bg-red-500/10 text-red-600 dark:text-red-400',
                )}
            >
                {item.format}
            </span>
            <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold" title={title}>
                    {title}
                </div>
                <div className="text-muted-foreground truncate text-xs">{reportScope(item.filters, item.columns_count, t)}</div>
                <div className="text-muted-foreground text-xs" title={keptUntil}>
                    {details.join(' · ')}
                </div>
                {/* A ready file needs no badge — its Download button says it. The others do. */}
                {item.status !== 'ready' && (
                    <span className={cn('mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold', tone)}>
                        <Icon className={cn('h-3.5 w-3.5', spin && 'animate-spin motion-reduce:animate-none')} />
                        {t(`rep_my_exports_st_${item.status}`)}
                    </span>
                )}
                {item.status === 'failed' && item.error && (
                    <div className="text-destructive mt-0.5 text-xs">{t(`rep_my_exports_err_${item.error}`)}</div>
                )}
                {slow && <div className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">{t('rep_my_exports_slow')}</div>}
                {(item.status === 'ready' || item.status === 'failed' || item.status === 'queued') && (
                    <div className="mt-2 flex items-center gap-1">
                        {item.status === 'ready' && (
                            <Button size="sm" variant="outline" onClick={onDownload} disabled={download.isPending}>
                                {download.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                                {t('rep_my_exports_download')}
                            </Button>
                        )}
                        {item.status === 'failed' && (
                            <Button size="sm" variant="outline" onClick={onRetry} disabled={retry.isPending}>
                                {retry.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                                {t('rep_my_exports_retry')}
                            </Button>
                        )}
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={onDelete}
                            aria-label={t('rep_my_exports_delete')}
                            title={t('rep_my_exports_delete')}
                            className="text-muted-foreground ml-auto"
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}

export function MyExports() {
    const t = useT();
    const { data: items = [] } = useMyExports();

    if (items.length === 0) return null;

    return (
        <Card id="my-exports" className="overflow-hidden">
            <div className="bg-muted border-border flex items-center gap-2.5 border-b px-4 py-3">
                <span className="bg-brand/10 text-brand flex h-7 w-7 items-center justify-center rounded-md">
                    <FolderDown className="h-4 w-4" />
                </span>
                <span className="font-semibold">{t('rep_my_exports_title')}</span>
                <span className="text-muted-foreground ml-auto text-xs">{t('rep_my_exports_sub').replace('{days}', String(KEEP_DAYS))}</span>
            </div>
            {items.map((item) => (
                <ExportRow key={item.id} item={item} />
            ))}
        </Card>
    );
}
