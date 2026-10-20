import { useT } from '@/lang';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { FileDropZone } from '@/shared/components/file-drop-zone';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { cn, downloadBlob } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogFooterBar, mediumDialogContentClass } from '@/shared/ui/dialog';
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
 * Shared bulk-CSV import dialog: download a template, choose a file, optionally dry-run it,
 * then import (all-or-nothing on the server). Wording, endpoints and the dry-run are passed in.
 */
export function ImportDialog<Row>({
    open,
    onClose,
    eyebrow,
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
    /** The module that opens the import, shown above the title. */
    eyebrow: ReactNode;
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
    const fmtN = useNumberFormat();
    const [file, setFile] = useState<File | null>(null);
    const [result, setResult] = useState<ImportPreviewResult<Row> | null>(null);
    const [errors, setErrors] = useState<ImportRowError[]>([]);
    const [success, setSuccess] = useState<number | null>(null);
    const [generalError, setGeneralError] = useState('');
    // Which pick the newest dry-run belongs to, so a slower earlier answer is ignored
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
            // Clear the pick so choosing the same file again still fires a change
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

    // With a dry-run the file must be wholly clean; without one a chosen file is enough
    const ready = preview ? result !== null && result.meta.invalid === 0 && result.meta.valid > 0 : file !== null;
    const truncated = result != null && result.meta.shown != null && result.meta.shown < result.meta.total;
    // A picked file not yet imported is unsaved work; a finished import clears it.
    const guardClose = useDiscardGuard(open && file !== null);

    return (
        <Dialog open={open} onOpenChange={(o) => !o && !importPending && guardClose(onClose)}>
            <DialogContent className={mediumDialogContentClass}>
                <FocusDialogHeader
                    icon={Upload}
                    eyebrow={eyebrow}
                    title={title}
                    srDescription={description}
                    subtitle={<span className="text-muted-foreground text-sm">{description}</span>}
                />

                <div className="flex min-h-0 flex-1 flex-col gap-4 border-t px-6 py-6">
                    {/* What this import will not do — said before a file is even chosen. */}
                    {notice}

                    <div className="-mx-2 max-h-[min(58dvh,640px)] scroll-py-2 space-y-3 overflow-y-auto px-2 py-1">
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

                        {/* How to fill the file in */}
                        {guide}

                        <FileDropZone
                            // Matches what readImportFile() accepts
                            accept={['csv', 'txt']}
                            hint={hint}
                            compact={file !== null}
                            disabled={importPending}
                            onPick={(list) => handleChoose(Array.from(list)[0] ?? null)}
                        />
                        {file && <p className="text-muted-foreground truncate text-center text-xs font-medium">{file.name}</p>}

                        {preview?.pending && (
                            <div role="status" className="text-muted-foreground flex items-center gap-2 text-sm">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                {t('import_checking')}
                            </div>
                        )}

                        {success != null && (
                            <div
                                role="alert"
                                className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400"
                            >
                                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
                                {successMessage(success)}
                            </div>
                        )}

                        {generalError && (
                            <div
                                role="alert"
                                className="bg-destructive/10 dark:text-destructive flex items-start gap-2 rounded-lg px-3 py-2 text-sm text-red-700"
                            >
                                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                                {generalError}
                            </div>
                        )}

                        {result && preview && (
                            <div className="space-y-2">
                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                    <span className="font-semibold">{t('import_preview_title')}</span>
                                    <span className="bg-muted rounded-full px-2 py-0.5">
                                        {t('import_preview_total')}: {fmtN(result.meta.total)}
                                    </span>
                                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400">
                                        {t('import_preview_valid')}: {fmtN(result.meta.valid)}
                                    </span>
                                    {result.meta.invalid > 0 && (
                                        <span className="bg-destructive/10 dark:text-destructive rounded-full px-2 py-0.5 text-red-700">
                                            {t('import_preview_invalid')}: {fmtN(result.meta.invalid)}
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
                                            .replace('{shown}', fmtN(result.meta.shown ?? 0))
                                            .replace('{total}', fmtN(result.meta.total))}
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
                                <div
                                    role="alert"
                                    className="border-destructive/20 dark:text-destructive flex items-center gap-2 border-b px-3 py-2 text-sm font-semibold text-red-700"
                                >
                                    <AlertCircle className="h-4 w-4" aria-hidden />
                                    {t('import_errors_found')} ({fmtN(errors.length)})
                                </div>
                                <div className="max-h-48 overflow-y-auto px-3 py-2">
                                    {errors.map((rowError) => (
                                        <div key={rowError.row} className="py-0.5 text-xs">
                                            <span className="text-destructive font-semibold">
                                                {t('import_row')} {rowError.row}:
                                            </span>{' '}
                                            <span className="text-muted-foreground">{rowError.message}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <DialogFooterBar>
                    <Button variant="ghost" onClick={() => guardClose(onClose)} disabled={importPending}>
                        {success != null ? t('import_close') : t('cancel')}
                    </Button>
                    <Button onClick={handleImport} disabled={!ready || importPending || preview?.pending}>
                        {importPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        {importPending ? t('import_running') : t('import_run')}
                    </Button>
                </DialogFooterBar>
            </DialogContent>
        </Dialog>
    );
}
