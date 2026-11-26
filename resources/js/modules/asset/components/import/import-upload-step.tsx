// Step 2 of the asset import dialog: template download with the column guide, and the one .xlsx file box.
// The box holds the chosen file in the same place as the drop zone; the file is checked as soon as it is picked.
import { useT } from '@/lang';
import { FileDropZone } from '@/shared/components/file-drop-zone';
import { InfoPopover } from '@/shared/components/info-popover';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Check, CircleAlert, CircleHelp, Download, FileSpreadsheet, Loader2, X } from 'lucide-react';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import type { ImportKind } from '../../api/assetImportApi';
import { fillWords } from '../../lib/fill-words';
import { IMPORT_COLUMNS } from '../../lib/import-columns';

interface Props {
    kind: ImportKind;
    file: File | null;
    /** Rows the server found in the chosen file, once its check is done. */
    rowCount: number | null;
    /** The file is being checked. */
    busy: boolean;
    /** Why the server refused the file, in words. */
    refusal: string | null;
    onPick: (file: File) => void;
    /** Resolves true when the file was removed. */
    onRemove: () => Promise<boolean>;
    onDownload: () => Promise<void>;
}

export function ImportUploadStep({ kind, file, rowCount, busy, refusal, onPick, onRemove, onDownload }: Props) {
    const t = useT();
    const fmtN = useNumberFormat();
    const [onlyOne, setOnlyOne] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [said, setSaid] = useState('');
    const [notXlsx, setNotXlsx] = useState(false);
    const [downloadFailed, setDownloadFailed] = useState(false);
    const kindWord = t(`asset_import_kind_${kind}`);

    const meta = (rows: number) => t('asset_import_file_meta').replace('{rows}', fmtN(rows)).replace('{cols}', fmtN(IMPORT_COLUMNS[kind].length));

    const pick = (files: FileList | File[]) => {
        const list = Array.from(files);
        setOnlyOne(list.length > 1);
        if (list.length !== 1) return;
        const isXlsx = list[0].name.toLowerCase().endsWith('.xlsx');
        setNotXlsx(!isXlsx);
        if (!isXlsx) return;
        setSaid('');
        onPick(list[0]);
    };

    const remove = async () => {
        setOnlyOne(false);
        setNotXlsx(false);
        if (await onRemove()) setSaid(t('asset_import_remove_file'));
    };

    const download = async () => {
        setDownloading(true);
        setDownloadFailed(false);
        try {
            await onDownload();
        } catch {
            setDownloadFailed(true);
        } finally {
            setDownloading(false);
        }
    };

    return (
        <div className="mx-auto flex w-full max-w-[760px] flex-col gap-4">
            <div>
                {/* Heading with the column guide */}
                <div className="relative flex items-center gap-1">
                    <h3 tabIndex={-1} className="text-lg font-bold tracking-tight text-balance">
                        {t('asset_import_upload_heading')}
                    </h3>
                    <ColumnGuide kind={kind} />
                </div>
                <p className="text-muted-foreground mt-0.5 text-sm">{t('asset_import_upload_sub')}</p>
            </div>

            {/* Template download */}
            <button
                type="button"
                onClick={download}
                disabled={downloading}
                className="border-border hover:bg-accent focus-visible:ring-ring flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium focus-visible:ring-2 focus-visible:outline-hidden disabled:opacity-60"
            >
                {downloading ? (
                    <Loader2 className="text-brand h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                ) : (
                    <Download className="text-brand h-4 w-4 shrink-0" aria-hidden="true" />
                )}
                {t(`asset_import_download_${kind}`)}
            </button>
            <p className="text-muted-foreground text-xs leading-relaxed">{t(`asset_import_lists_${kind}`)}</p>

            {/* Drop zone, or the chosen file in the same place */}
            {file === null ? (
                <FileDropZone accept={['xlsx']} hint={fillWords(t('asset_import_drop_hint'), { kind: kindWord })} onPick={pick} />
            ) : (
                <ChosenFile file={file} busy={busy} metaText={!busy && rowCount !== null ? meta(rowCount) : null} onPick={pick} onRemove={remove} />
            )}

            {onlyOne && (
                <p role="alert" className="text-destructive flex items-center gap-1.5 text-sm">
                    <CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {t('asset_import_one_file_only')}
                </p>
            )}
            {(notXlsx || refusal !== null || downloadFailed) && (
                <p role="alert" className="text-destructive flex items-start gap-1.5 text-sm">
                    <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    {notXlsx ? t('asset_refusal_import_unreadable') : (refusal ?? t('import_template_failed'))}
                </p>
            )}

            {/* Spoken when the file is checked or removed */}
            <p role="status" aria-live="polite" className="sr-only">
                {said || (file !== null && !busy && rowCount !== null ? meta(rowCount) : '')}
            </p>
        </div>
    );
}

/** The chosen file: name, sheet size, change and remove buttons; another file dropped on it replaces it. */
function ChosenFile({
    file,
    busy,
    metaText,
    onPick,
    onRemove,
}: {
    file: File;
    busy: boolean;
    /** Rows and columns once the check passed; null while checking or after a refusal. */
    metaText: string | null;
    onPick: (files: FileList | File[]) => void;
    onRemove: () => void;
}) {
    const t = useT();
    const input = useRef<HTMLInputElement>(null);
    const [dragOver, setDragOver] = useState(false);

    const drop = (event: DragEvent) => {
        event.preventDefault();
        setDragOver(false);
        onPick(event.dataTransfer.files);
    };

    return (
        <div
            role="group"
            aria-label={file.name}
            aria-busy={busy}
            onDragOver={(event) => {
                event.preventDefault();
                setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={drop}
            className={cn(
                'bg-card flex h-36 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-4 py-3 text-center transition-colors',
                dragOver ? 'border-brand bg-brand/10' : 'border-border',
            )}
        >
            {/* File name and sheet size */}
            <div className="flex max-w-full min-w-0 items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                    <FileSpreadsheet className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 text-left">
                    <div className="truncate text-sm font-semibold" translate="no">
                        {file.name}
                    </div>
                    <div className="text-muted-foreground mt-0.5 flex min-h-4 items-center justify-center gap-1.5 text-xs tabular-nums">
                        {busy ? (
                            <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                                {t('import_checking')}
                            </>
                        ) : (
                            metaText
                        )}
                    </div>
                </div>
            </div>
            <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" className="h-8" disabled={busy} onClick={() => input.current?.click()}>
                    {t('asset_import_change_file')}
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-8" disabled={busy} onClick={onRemove}>
                    <X className="h-4 w-4" aria-hidden="true" />
                    {t('asset_import_remove_file')}
                </Button>
            </div>
            <span className="text-muted-foreground text-[11px]">{t('asset_import_drop_to_replace')}</span>
            <input
                ref={input}
                type="file"
                accept=".xlsx"
                className="hidden"
                tabIndex={-1}
                onChange={(event) => {
                    onPick(event.target.files ?? []);
                    event.target.value = '';
                }}
            />
        </div>
    );
}

/** The (i) button after the heading; its note is the column table, and focus comes back to the button when the note closes. */
function ColumnGuide({ kind }: { kind: ImportKind }) {
    const t = useT();
    const holder = useRef<HTMLSpanElement>(null);
    const focusButton = () => {
        window.requestAnimationFrame(() => {
            const active = document.activeElement;
            if (active === null || active === document.body) holder.current?.querySelector('button')?.focus();
        });
    };

    return (
        <span ref={holder} className="inline-flex">
            <InfoPopover
                label={t('asset_import_columns_help')}
                className="text-muted-foreground hover:text-brand hover:bg-accent grid h-8 w-8 cursor-pointer place-items-center rounded-md"
                contentClassName="w-[min(640px,calc(100vw-2rem))] max-w-none p-0"
                content={(close) => <ColumnTable kind={kind} onClose={close} onGone={focusButton} />}
            >
                <CircleHelp className="h-4 w-4" aria-hidden="true" />
            </InfoPopover>
        </span>
    );
}

function ColumnTable({ kind, onClose, onGone }: { kind: ImportKind; onClose: () => void; onGone: () => void }) {
    const t = useT();
    const gone = useRef(onGone);
    // Runs when the note closes and this table unmounts
    useEffect(() => gone.current, []);

    return (
        <div>
            <div className="border-border flex items-center justify-between gap-2 border-b px-3 py-2">
                <span className="text-xs font-semibold">{t('asset_import_columns_help')}</span>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label={t('close')}
                    className="hover:bg-accent focus-visible:ring-ring grid h-8 w-8 place-items-center rounded-md focus-visible:ring-2 focus-visible:outline-hidden"
                >
                    <X className="h-4 w-4" aria-hidden="true" />
                </button>
            </div>
            <div className="max-h-[50dvh] overflow-auto">
                <table className="w-full text-xs">
                    <caption className="sr-only">{t('asset_import_columns_help')}</caption>
                    <thead>
                        <tr className="dark:bg-muted/50 border-border text-muted-foreground border-b text-left text-[11.5px] font-semibold">
                            <th scope="col" className="px-3 py-2">
                                {t('asset_import_help_column')}
                            </th>
                            <th scope="col" className="px-3 py-2">
                                {t('asset_import_help_required')}
                            </th>
                            <th scope="col" className="px-3 py-2">
                                {t('asset_import_help_how')}
                            </th>
                            <th scope="col" className="px-3 py-2">
                                {t('asset_import_help_example')}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {IMPORT_COLUMNS[kind].map((column) => (
                            <tr key={column.key} className="border-border border-b last:border-0">
                                <th scope="row" className="px-3 py-2 text-left font-medium whitespace-nowrap">
                                    {column.header}
                                </th>
                                <td className="px-3 py-2">
                                    {column.required && (
                                        <>
                                            <Check className="h-4 w-4 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                                            <span className="sr-only">{t('asset_import_help_required')}</span>
                                        </>
                                    )}
                                </td>
                                <td className="text-muted-foreground px-3 py-2">{t(column.howKey)}</td>
                                <td className="px-3 py-2 whitespace-nowrap" translate="no">
                                    {column.example}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
