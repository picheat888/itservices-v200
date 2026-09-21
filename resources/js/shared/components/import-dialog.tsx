import { useT } from '@/lang';
import { FileDropZone } from '@/shared/components/file-drop-zone';
import { cn, downloadBlob } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { AlertCircle, CheckCircle2, Download, Loader2, Upload } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

/** One row of a bulk import the server refused, as every import endpoint reports them. */
export interface ImportRowError {
    row: number;
    message: string;
}

/** The counts a dry-run reports over the WHOLE file, however few rows it lists. */
export interface ImportPreviewMeta {
    total: number;
    valid: number;
    invalid: number;
    /** How many of `total` the listing actually carries — the rest are counted, not shown. */
    shown?: number;
    /** Columns the file had no field for. Ignored, but worth saying so. */
    ignored_columns: string[];
}

/** A dry-run answer: the rows to list (shape is the module's own) plus the counts. */
export interface ImportPreviewResult<Row> {
    data: Row[];
    meta: ImportPreviewMeta;
}

/** The optional dry-run half of an import: run it, say whether it is running, draw it. */
export interface ImportPreviewConfig<Row> {
    run: (file: File) => Promise<ImportPreviewResult<Row>>;
    pending: boolean;
    render: (rows: Row[]) => ReactNode;
}

/**
 * The bulk-CSV import dialog every module shares: download a template, choose a
 * file, optionally see a dry-run of it, then import — with validation all-or-nothing
 * on the server, so a file is either wholly importable or not at all.
 *
 * Employees and contracts each used to carry their own copy of this, which is how
 * one of them ended up with a preview and a drag-and-drop the other never got. What
 * genuinely differs — the wording, the endpoints, and whether there IS a dry-run —
 * is passed in; everything else lives here once.
 */
export function ImportDialog<Row>({
    open,
    onClose,
    title,
    description,
    hint,
    templateFileName,
    downloadTemplate,
    runImport,
    importPending,
    successMessage,
    preview,
    extraDownloads,
    notice,
    guide,
}: {
    open: boolean;
    onClose: () => void;
    title: string;
    description: string;
    /** The line under the drop zone naming the columns this import expects. */
    hint: string;
    templateFileName: string;
    downloadTemplate: () => Promise<Blob>;
    runImport: (file: File) => Promise<{ imported: number }>;
    importPending: boolean;
    successMessage: (imported: number) => string;
    /** Omit for an import that has no dry-run — the file alone then arms the button. */
    preview?: ImportPreviewConfig<Row>;
    /** Further files worth downloading beside the template, drawn as the same button. */
    extraDownloads?: { label: string; fileName: string; fetch: () => Promise<Blob> }[];
    /** Shown above everything: what this import will NOT do, before anything is chosen. */
    notice?: ReactNode;
    /** Shown under the drop zone: how to fill the file in. The module's own content. */
    guide?: ReactNode;
}) {
    const t = useT();
    const [file, setFile] = useState<File | null>(null);
    const [result, setResult] = useState<ImportPreviewResult<Row> | null>(null);
    const [errors, setErrors] = useState<ImportRowError[]>([]);
    const [success, setSuccess] = useState<number | null>(null);
    const [generalError, setGeneralError] = useState('');
    /**
     * Which file the newest dry-run belongs to. Two quick picks race, and without
     * this the slower answer lands last and the dialog shows file A's verdict over
     * file B's name — then imports B on the strength of it.
     */
    const previewRun = useRef(0);

    const clearOutcome = () => {
        setResult(null);
        setErrors([]);
        setSuccess(null);
        setGeneralError('');
    };

    // Reset every time the dialog is (re)opened.
    useEffect(() => {
        if (open) {
            setFile(null);
            clearOutcome();
            previewRun.current++;
        }
    }, [open]);

    /** Reads the server's error envelope, whatever shape this endpoint answers in. */
    const readError = (e: unknown) => (e as { response?: { data?: { message?: string; errors?: ImportRowError[] } } })?.response?.data;

    const handleDownload = async (fetch: () => Promise<Blob>, fileName: string) => {
        try {
            downloadBlob(await fetch(), fileName);
        } catch (e) {
            setGeneralError(readError(e)?.message ?? t('import_template_failed'));
        }
    };

    const downloads = [{ label: t('import_download_template'), fileName: templateFileName, fetch: downloadTemplate }, ...(extraDownloads ?? [])];

    /** Reads the chosen file straight away so the dialog can show what it would save. */
    const handleChoose = async (chosen: File | null) => {
        setFile(chosen);
        clearOutcome();
        const run = ++previewRun.current;
        if (!chosen || !preview) return;

        try {
            const answer = await preview.run(chosen);
            if (previewRun.current === run) setResult(answer);
        } catch (e) {
            if (previewRun.current === run) setGeneralError(readError(e)?.message ?? t('import_failed'));
        }
    };

    const handleImport = async () => {
        if (!file) return;
        setErrors([]);
        setSuccess(null);
        setGeneralError('');
        try {
            const answer = await runImport(file);
            setSuccess(answer.imported);
            setResult(null);
            // The input keeps its value otherwise, so re-picking the very same file
            // fires no change event and the dialog just sits there looking broken.
            setFile(null);
            previewRun.current++;
        } catch (e) {
            const data = readError(e);
            if (data?.errors?.length) {
                setErrors(data.errors);
            } else {
                setGeneralError(data?.message ?? t('import_failed'));
            }
        }
    };

    // With a dry-run the file has to come back wholly clean; without one, having
    // chosen a file is all the dialog can know.
    const ready = preview ? result !== null && result.meta.invalid === 0 && result.meta.valid > 0 : file !== null;
    const truncated = result != null && result.meta.shown != null && result.meta.shown < result.meta.total;

    return (
        <Dialog open={open} onOpenChange={(o) => !o && !importPending && onClose()}>
            <DialogContent className={cn(result ? 'max-w-3xl' : guide ? 'max-w-2xl' : 'max-w-lg')}>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Upload className="text-brand h-5 w-5" />
                        {title}
                    </DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>

                {/* What this import will not do — said before a file is even chosen. */}
                {notice}

                <div className="max-h-[min(58vh,640px)] space-y-3 overflow-y-auto py-1">
                    <div className={cn('grid gap-2', downloads.length > 1 && 'sm:grid-cols-2')}>
                        {downloads.map((download) => (
                            <button
                                key={download.fileName}
                                type="button"
                                onClick={() => handleDownload(download.fetch, download.fileName)}
                                className="border-border hover:bg-accent flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium"
                            >
                                <Download className="text-brand h-4 w-4 shrink-0" />
                                {download.label}
                            </button>
                        ))}
                    </div>

                    {/* How to fill the file in. Above the drop zone, because it is read
                        on the way out to Excel, not on the way back. */}
                    {guide}

                    <FileDropZone
                        // Matches what readImportFile() accepts, so the picker never
                        // hides a file the server would have taken.
                        accept={['csv', 'txt']}
                        hint={hint}
                        compact={file !== null}
                        disabled={importPending}
                        onPick={(list) => handleChoose(Array.from(list)[0] ?? null)}
                    />
                    {file && <p className="text-muted-foreground truncate text-center text-xs font-medium">{file.name}</p>}

                    {preview?.pending && (
                        <div className="text-muted-foreground flex items-center gap-2 text-sm">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {t('import_checking')}
                        </div>
                    )}

                    {success != null && (
                        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400">
                            <CheckCircle2 className="h-4 w-4" />
                            {successMessage(success)}
                        </div>
                    )}

                    {generalError && <div className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm">{generalError}</div>}

                    {result && preview && (
                        <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                                <span className="font-semibold">{t('import_preview_title')}</span>
                                <span className="bg-muted rounded-full px-2 py-0.5">
                                    {t('import_preview_total')}: {result.meta.total}
                                </span>
                                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400">
                                    {t('import_preview_valid')}: {result.meta.valid}
                                </span>
                                {result.meta.invalid > 0 && (
                                    <span className="bg-destructive/10 text-destructive rounded-full px-2 py-0.5">
                                        {t('import_preview_invalid')}: {result.meta.invalid}
                                    </span>
                                )}
                            </div>

                            {result.meta.ignored_columns.length > 0 && (
                                <p className="text-muted-foreground text-xs">
                                    {t('import_ignored_columns')} {result.meta.ignored_columns.join(', ')}
                                </p>
                            )}

                            {preview.render(result.data)}

                            {/* A capped listing has to say so, or the table reads as the whole file. */}
                            {truncated && (
                                <p className="text-muted-foreground text-xs">
                                    {t('import_preview_truncated')
                                        .replace('{shown}', String(result.meta.shown))
                                        .replace('{total}', String(result.meta.total))}
                                </p>
                            )}

                            {result.meta.invalid > 0 && (
                                <p className="text-destructive flex items-start gap-1 text-xs">
                                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                    {t('import_preview_blocked')}
                                </p>
                            )}
                        </div>
                    )}

                    {/* Server-side rejection of a file the preview thought was clean (data changed in between). */}
                    {errors.length > 0 && (
                        <div className="border-destructive/30 bg-destructive/5 rounded-lg border">
                            <div className="border-destructive/20 text-destructive flex items-center gap-2 border-b px-3 py-2 text-sm font-semibold">
                                <AlertCircle className="h-4 w-4" />
                                {t('import_errors_found')} ({errors.length})
                            </div>
                            <div className="max-h-48 overflow-y-auto px-3 py-2">
                                {errors.map((rowError) => (
                                    <div key={rowError.row} className="py-0.5 text-xs">
                                        <span className="text-destructive font-mono font-semibold">
                                            {t('import_row')} {rowError.row}:
                                        </span>{' '}
                                        <span className="text-muted-foreground">{rowError.message}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={onClose} disabled={importPending}>
                        {success != null ? t('import_close') : t('cancel')}
                    </Button>
                    <Button onClick={handleImport} disabled={!ready || importPending || preview?.pending}>
                        <Upload className="h-4 w-4" />
                        {importPending ? t('import_running') : t('import_run')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
