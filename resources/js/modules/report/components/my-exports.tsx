/**
 * "ไฟล์ส่งออกของฉัน" in the Report Center's right rail: the files this person queued from a
 * report's Export dialog, newest first, drawn as a file browser lists files — a file tile (type
 * and size), then three lines: the report; the slice it holds and its row count; when it was
 * made and how long ago (or, while not ready, waiting / being built with a bar, or failed with
 * the reason). Download, retry and delete are icon buttons. Kept 7 days.
 * Data: useMyExports (GET /api/reports/exports).
 */
import { useT } from '@/lang';
import { refusalText } from '@/shared/lib/api-errors';
import { formatDateTime, relativeTime } from '@/shared/lib/datetime';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { useToastStore } from '@/stores/toast';
import { useUiStore } from '@/stores/ui';
import { AlertCircle, CheckCircle2, Clock, Download, Loader2, RotateCcw, Trash2 } from 'lucide-react';
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
    const lang = useUiStore((s) => s.lang);
    const confirm = useConfirm();
    const download = useDownloadExport();
    const retry = useRetryExport();
    const remove = useDeleteExport();
    const { Icon, tone, spin } = STATUS_META[item.status];
    const title = t(`rep_${reportStem(item.report_key)}_title`);
    const slow = item.status === 'queued' && Date.now() - new Date(item.created_at).getTime() > SLOW_QUEUE_MS;

    const size = formatSize(item.size_bytes);
    const madeAt = item.finished_at ?? item.created_at;
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

    const building = item.status === 'queued' || item.status === 'running';
    const iconButton = 'text-muted-foreground hover:text-foreground h-7 w-7';

    return (
        <div className="border-border flex items-start gap-3 border-b px-4 py-3 last:border-b-0">
            {/* The file itself, as a file browser draws one: its type, and its size under it. */}
            <span
                className={cn(
                    'flex h-12 w-11 shrink-0 flex-col items-center justify-center gap-0.5 rounded-md border',
                    item.format === 'xlsx'
                        ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : 'border-red-500/25 bg-red-500/10 text-red-600 dark:text-red-400',
                )}
                title={item.file_name ?? undefined}
            >
                <span className="font-mono text-[10px] leading-none font-bold uppercase">{item.format}</span>
                <span className="text-muted-foreground text-[9px] leading-none">{size ?? '—'}</span>
            </span>

            <div className="min-w-0 flex-1">
                {/* 1 — which report */}
                <div className="truncate text-sm font-semibold" title={title}>
                    {title}
                </div>
                {/* 2 — which slice of it, and how many rows */}
                <div className="text-foreground/75 mt-0.5 truncate text-xs">
                    {reportScope(item.filters, item.columns_count, t, lang)}
                    {item.rows_count != null && ` · ${t('rep_my_exports_rows').replace('{n}', item.rows_count.toLocaleString())}`}
                </div>
                {/* 3 — when it was made and how long ago; or where it stands while it is not ready */}
                {item.status === 'failed' ? (
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span className={cn('inline-flex h-5 items-center gap-1 rounded-full px-2 font-semibold', tone)}>
                            <Icon className="h-3 w-3" />
                            {t('rep_my_exports_st_failed')}
                        </span>
                        {item.error && <span className="text-muted-foreground">{t(`rep_my_exports_err_${item.error}`)}</span>}
                    </div>
                ) : building ? (
                    <>
                        <div className="text-muted-foreground mt-0.5 text-[11px]">{`${t(`rep_my_exports_st_${item.status}`)}…`}</div>
                        {/* Indeterminate: the queue gives no percentage. Still under reduced motion. */}
                        <div className="bg-muted mt-1.5 h-1 overflow-hidden rounded-full" aria-hidden="true">
                            <span
                                className={cn('bg-brand block h-full w-3/5 animate-pulse rounded-full motion-reduce:animate-none', spin && 'w-4/5')}
                            />
                        </div>
                    </>
                ) : (
                    <div className="text-muted-foreground mt-0.5 text-[11px]" title={keptUntil}>
                        {formatDateTime(madeAt)} · {relativeTime(madeAt, lang, '')}
                    </div>
                )}
                {slow && <div className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">{t('rep_my_exports_slow')}</div>}
            </div>

            {/* Icons only; the name and the tooltip say what each does. */}
            <div className="-mt-0.5 -mr-1 flex shrink-0 items-center">
                {item.status === 'ready' && (
                    <Button
                        size="icon"
                        variant="ghost"
                        onClick={onDownload}
                        disabled={download.isPending}
                        aria-label={t('rep_my_exports_download')}
                        title={t('rep_my_exports_download')}
                        className="text-brand hover:text-brand h-7 w-7"
                    >
                        {download.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    </Button>
                )}
                {item.status === 'failed' && (
                    <Button
                        size="icon"
                        variant="ghost"
                        onClick={onRetry}
                        disabled={retry.isPending}
                        aria-label={t('rep_my_exports_retry')}
                        title={t('rep_my_exports_retry')}
                        className={iconButton}
                    >
                        {retry.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                    </Button>
                )}
                {item.status !== 'running' && (
                    <Button
                        size="icon"
                        variant="ghost"
                        onClick={onDelete}
                        aria-label={t('rep_my_exports_delete')}
                        title={t('rep_my_exports_delete')}
                        className={cn(iconButton, 'hover:text-destructive')}
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                )}
            </div>
        </div>
    );
}

/** The design's rail card heading: muted icon + title, a note on the right. */
export function RailHeading({ icon: Icon, title, note }: { icon: typeof Clock; title: string; note?: string }) {
    return (
        <div className="border-border flex items-center justify-between gap-3 border-b px-[18px] py-3.5">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Icon className="text-muted-foreground h-4 w-4" />
                {title}
            </h3>
            {note && <span className="text-muted-foreground text-xs">{note}</span>}
        </div>
    );
}

export function MyExports() {
    const t = useT();
    const { data: items = [] } = useMyExports();

    return (
        <Card id="my-exports" className="overflow-hidden">
            <RailHeading icon={Download} title={t('rep_my_exports_title')} note={t('rep_my_exports_sub').replace('{days}', String(KEEP_DAYS))} />
            {items.length === 0 ? (
                <p className="text-muted-foreground px-[18px] py-4 text-[12.5px]">{t('rep_my_exports_empty')}</p>
            ) : (
                items.map((item) => <ExportRow key={item.id} item={item} />)
            )}
        </Card>
    );
}
