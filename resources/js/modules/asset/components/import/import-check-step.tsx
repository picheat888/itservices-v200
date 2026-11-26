// Step 3 of the asset import dialog: one summary line, the rows with their problems, and the note under the table.
// The rows shown while filtered are the ones that were bad when the filter was applied, so a fixed row stays until it is toggled again.
import { useT } from '@/lang';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { cn } from '@/shared/lib/utils';
import { FileSpreadsheet } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import type { CheckedRow, ImportKind, ImportOptions } from '../../api/assetImportApi';
import { IMPORT_COLUMNS, type ImportColumnKey } from '../../lib/import-columns';
import { badRowCount, type CellEdit, type RowEdits } from '../../lib/import-rows';
import { ImportCheckTable } from './import-check-table';

/** Id of the screen-reader-only reason the next button is off; the dialog points the button at it. */
export const NEXT_BLOCKED_ID = 'asset-import-next-blocked';

interface Props {
    kind: ImportKind;
    fileName: string;
    /** Rows with the user's edits applied. */
    rows: CheckedRow[];
    options: ImportOptions;
    edits: RowEdits;
    onEdit: (line: number, column: ImportColumnKey, value: CellEdit) => void;
}

const badLines = (rows: CheckedRow[]) => new Set(rows.filter((row) => row.issues.length > 0).map((row) => row.line));

export function ImportCheckStep({ kind, fileName, rows, options, edits, onEdit }: Props) {
    const t = useT();
    const fmtN = useNumberFormat();
    const bad = badRowCount(rows);
    const [onlyBad, setOnlyBad] = useState(bad > 0);
    const [pinned, setPinned] = useState(() => badLines(rows));

    const choose = useCallback(
        (next: boolean) => {
            setOnlyBad(next);
            if (next) setPinned(badLines(rows));
        },
        [rows],
    );

    const shown = useMemo(() => (onlyBad ? rows.filter((row) => pinned.has(row.line)) : rows), [onlyBad, pinned, rows]);
    // The code column is left out when no row has a code
    const columns = useMemo(
        () => IMPORT_COLUMNS[kind].filter((column) => column.key !== 'asset_code' || rows.some((row) => (row.values.asset_code ?? '') !== '')),
        [kind, rows],
    );
    const total = useMemo(() => rows.reduce((sum, row) => sum + (Number(row.values.value) || 0), 0), [rows]);

    const summary = t('asset_import_summary_line')
        .replace('{rows}', fmtN(rows.length))
        .replace('{ready}', fmtN(rows.length - bad));
    const filters = [
        { only: false, label: t('asset_import_show_all') },
        { only: true, label: t('asset_import_show_bad') },
    ];

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
            <h3 tabIndex={-1} className="sr-only">
                {t('asset_import_step_check')}
            </h3>

            {/* Summary line and the row filter */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <p role="status" className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm tabular-nums">
                    <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                    <span className="font-medium" translate="no">
                        {fileName}
                    </span>
                    <span className="text-muted-foreground">{summary}</span>
                    {bad > 0 && (
                        <span className="font-semibold text-red-700 dark:text-red-300">
                            {t('asset_import_bad_rows').replace('{count}', fmtN(bad))}
                        </span>
                    )}
                    {kind === 'purchased' && (
                        <span className="text-muted-foreground">
                            {t('asset_import_summary_value').replace('{value}', fmtN(total, { decimals: 2 }))}
                        </span>
                    )}
                </p>
                <div className="flex-1" />
                <div role="group" className="border-border bg-card dark:bg-background inline-flex gap-0.5 rounded-md border p-0.5">
                    {filters.map((item) => (
                        <button
                            key={String(item.only)}
                            type="button"
                            aria-pressed={onlyBad === item.only}
                            onClick={() => choose(item.only)}
                            className={cn(
                                'focus-visible:ring-ring h-8 rounded px-2.5 text-xs font-semibold focus-visible:ring-2 focus-visible:outline-hidden',
                                onlyBad === item.only ? 'bg-accent text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Table */}
            <ImportCheckTable columns={columns} rows={shown} options={options} edits={edits} onEdit={onEdit} />

            {/* Note under the table */}
            <p className="text-muted-foreground text-xs">{t('asset_import_check_note')}</p>
            {bad > 0 && (
                <span id={NEXT_BLOCKED_ID} className="sr-only">
                    {t('asset_import_next_blocked')}
                </span>
            )}
        </div>
    );
}
