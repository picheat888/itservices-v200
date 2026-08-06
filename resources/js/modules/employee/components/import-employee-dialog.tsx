import { useT } from '@/lang';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { employeeApi, type ImportPreview } from '../api/employeeApi';
import { useEmployeeMutations } from '../hooks/use-employees';
import { ImportPreviewTable } from './import-preview-table';

interface RowError {
    row: number;
    message: string;
}

/**
 * Dialog to bulk-import employees from a CSV. Offers a downloadable template, a file
 * picker, and — as soon as a file is chosen — a dry-run of it: every row with the
 * department / section / position / manager it resolved to, and the reason any row
 * cannot be saved. Validation is all-or-nothing on the server, so the Import button
 * only unlocks once the whole file is clean.
 */
export function ImportEmployeeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const t = useT();
    const { import: importMut, previewImport: previewMut } = useEmployeeMutations();
    const inputRef = useRef<HTMLInputElement>(null);
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<ImportPreview | null>(null);
    const [errors, setErrors] = useState<RowError[]>([]);
    const [success, setSuccess] = useState<number | null>(null);
    const [generalError, setGeneralError] = useState('');

    // Reset all state each time the dialog is (re)opened.
    useEffect(() => {
        if (open) {
            setFile(null);
            setPreview(null);
            setErrors([]);
            setSuccess(null);
            setGeneralError('');
            if (inputRef.current) inputRef.current.value = '';
        }
    }, [open]);

    const handleDownload = async () => {
        const blob = await employeeApi.downloadImportTemplate();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'employee-import-template.csv';
        a.click();
        URL.revokeObjectURL(url);
    };

    /** Reads the chosen file straight away so the dialog can show what it would save. */
    const handleChoose = async (chosen: File | null) => {
        setFile(chosen);
        setPreview(null);
        setErrors([]);
        setSuccess(null);
        setGeneralError('');
        if (!chosen) return;

        try {
            setPreview(await previewMut.mutateAsync(chosen));
        } catch (e: unknown) {
            const data = (e as { response?: { data?: { message?: string } } })?.response?.data;
            setGeneralError(data?.message ?? t('import_failed'));
        }
    };

    const handleImport = async () => {
        if (!file) return;
        setErrors([]);
        setSuccess(null);
        setGeneralError('');
        try {
            const res = await importMut.mutateAsync(file);
            setSuccess(res.imported);
            setPreview(null);
        } catch (e: unknown) {
            const data = (e as { response?: { data?: { message?: string; errors?: RowError[] } } })?.response?.data;
            if (data?.errors?.length) {
                setErrors(data.errors);
            } else {
                setGeneralError(data?.message ?? t('import_failed'));
            }
        }
    };

    const ready = preview !== null && preview.meta.invalid === 0 && preview.meta.valid > 0;

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className={preview ? 'max-w-3xl' : 'max-w-lg'}>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Upload className="text-brand h-5 w-5" />
                        {t('import_employee')}
                    </DialogTitle>
                    <DialogDescription>{t('import_desc')}</DialogDescription>
                </DialogHeader>

                <div className="space-y-3 py-1">
                    <button
                        type="button"
                        onClick={handleDownload}
                        className="border-border hover:bg-accent flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium"
                    >
                        <Download className="text-brand h-4 w-4" />
                        {t('import_download_template')}
                    </button>

                    <label className="border-border hover:bg-accent/50 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center">
                        <FileSpreadsheet className="text-muted-foreground h-7 w-7" />
                        <span className="text-sm font-medium">{file ? file.name : t('import_choose_file')}</span>
                        <span className="text-muted-foreground text-xs">{t('import_hint')}</span>
                        <input
                            ref={inputRef}
                            type="file"
                            accept=".csv,text/csv"
                            className="hidden"
                            onChange={(e) => handleChoose(e.target.files?.[0] ?? null)}
                        />
                    </label>

                    {previewMut.isPending && (
                        <div className="text-muted-foreground flex items-center gap-2 text-sm">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {t('import_checking')}
                        </div>
                    )}

                    {success != null && (
                        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400">
                            <CheckCircle2 className="h-4 w-4" />
                            {t('import_success_count').replace('{n}', String(success))}
                        </div>
                    )}

                    {generalError && <div className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm">{generalError}</div>}

                    {preview && (
                        <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                                <span className="font-semibold">{t('import_preview_title')}</span>
                                <span className="bg-muted rounded-full px-2 py-0.5">
                                    {t('import_preview_total')}: {preview.meta.total}
                                </span>
                                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400">
                                    {t('import_preview_valid')}: {preview.meta.valid}
                                </span>
                                {preview.meta.invalid > 0 && (
                                    <span className="bg-destructive/10 text-destructive rounded-full px-2 py-0.5">
                                        {t('import_preview_invalid')}: {preview.meta.invalid}
                                    </span>
                                )}
                            </div>

                            {preview.meta.ignored_columns.length > 0 && (
                                <p className="text-muted-foreground text-xs">
                                    {t('import_ignored_columns')} {preview.meta.ignored_columns.join(', ')}
                                </p>
                            )}

                            <ImportPreviewTable rows={preview.data} />

                            {preview.meta.invalid > 0 && (
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
                                {errors.map((er) => (
                                    <div key={er.row} className="py-0.5 text-xs">
                                        <span className="text-destructive font-mono font-semibold">
                                            {t('import_row')} {er.row}:
                                        </span>{' '}
                                        <span className="text-muted-foreground">{er.message}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={onClose}>
                        {success != null ? t('import_close') : t('cancel')}
                    </Button>
                    <Button onClick={handleImport} disabled={!ready || importMut.isPending || success != null}>
                        <Upload className="h-4 w-4" />
                        {importMut.isPending ? t('import_running') : t('import_run')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
