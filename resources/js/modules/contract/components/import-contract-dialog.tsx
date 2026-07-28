import { useT } from '@/lang';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { useUiStore } from '@/stores/ui';
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { contractApi } from '../api/contractApi';
import { useContractMutations } from '../hooks/use-contracts';

interface RowError {
    row: number;
    message: string;
}

/** Dialog to bulk-import contracts from a CSV. Offers a downloadable template,
 *  a file picker, and a Save action. Validation is all-or-nothing on the server. */
export function ImportContractDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { import: importMut } = useContractMutations();
    const inputRef = useRef<HTMLInputElement>(null);
    const [file, setFile] = useState<File | null>(null);
    const [errors, setErrors] = useState<RowError[]>([]);
    const [success, setSuccess] = useState<number | null>(null);
    const [generalError, setGeneralError] = useState('');

    useEffect(() => {
        if (open) {
            setFile(null);
            setErrors([]);
            setSuccess(null);
            setGeneralError('');
            if (inputRef.current) inputRef.current.value = '';
        }
    }, [open]);

    const handleDownload = async () => {
        const blob = await contractApi.downloadImportTemplate();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'contract-import-template.csv';
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleImport = async () => {
        if (!file) return;
        setErrors([]);
        setSuccess(null);
        setGeneralError('');
        try {
            const res = await importMut.mutateAsync(file);
            setSuccess(res.imported);
        } catch (e: unknown) {
            const data = (e as { response?: { data?: { message?: string; errors?: RowError[] } } })?.response?.data;
            if (data?.errors?.length) {
                setErrors(data.errors);
            } else {
                setGeneralError(data?.message ?? t('import_failed'));
            }
        }
    };

    const successMsg = success != null ? (lang === 'th' ? `นำเข้าสำเร็จ ${success} รายการ` : `Imported ${success} contract(s)`) : '';

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Upload className="text-brand h-5 w-5" />
                        {t('import_contract')}
                    </DialogTitle>
                    <DialogDescription>{t('import_contract_desc')}</DialogDescription>
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
                        <span className="text-muted-foreground text-xs">{t('import_contract_hint')}</span>
                        <input
                            ref={inputRef}
                            type="file"
                            accept=".csv,text/csv"
                            className="hidden"
                            onChange={(e) => {
                                setFile(e.target.files?.[0] ?? null);
                                setErrors([]);
                                setSuccess(null);
                                setGeneralError('');
                            }}
                        />
                    </label>

                    {success != null && (
                        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400">
                            <CheckCircle2 className="h-4 w-4" />
                            {successMsg}
                        </div>
                    )}

                    {generalError && <div className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm">{generalError}</div>}

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
                    <Button onClick={handleImport} disabled={!file || importMut.isPending || success != null}>
                        <Upload className="h-4 w-4" />
                        {importMut.isPending ? t('import_running') : t('import_run')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
