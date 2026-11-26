// Table of the check step: one row per sheet row. Only cells with a problem, or that the user already edited, are inputs;
// the result column names the column to fix and jumps to it. Own table because DataTable has no row headers.
import { useT } from '@/lang';
import { SearchableSelect, type SearchOption } from '@/shared/components/searchable-select';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { cn } from '@/shared/lib/utils';
import { Input } from '@/shared/ui/input';
import { Check, CircleAlert, CircleCheck } from 'lucide-react';
import { memo } from 'react';
import type { CheckedRow, CheckedValues, ImportOption, ImportOptions, Issue } from '../../api/assetImportApi';
import type { ImportColumn, ImportColumnKey, ImportListName } from '../../lib/import-columns';
import { fillIssueWords, optionsFor, type CellEdit, type RowEdits } from '../../lib/import-rows';

/** Lang key of each column's name; the same words as the asset form. */
const COLUMN_LABEL: Record<ImportColumnKey, string> = {
    asset_code: 'asset_tag',
    tag: 'asset_nickname',
    category: 'asset_type',
    brand: 'asset_brand',
    model: 'asset_model',
    serial: 'asset_serial',
    warehouse: 'asset_warehouse',
    value: 'asset_purchase_price',
    vendor: 'asset_supplier',
    purchase_date: 'asset_purchase_date',
    warranty_end: 'asset_warranty_end',
    warranty_lifetime: 'asset_warranty_lifetime',
    notes: 'asset_notes',
};

/** Columns picked from a list: the checked value holding the id, and the option list. */
const LIST_COLUMN: Partial<Record<ImportColumnKey, { idField: keyof CheckedValues; list: ImportListName }>> = {
    category: { idField: 'category_id', list: 'categories' },
    brand: { idField: 'brand_id', list: 'brands' },
    model: { idField: 'model_id', list: 'models' },
    warehouse: { idField: 'warehouse_id', list: 'warehouses' },
    vendor: { idField: 'vendor_id', list: 'vendors' },
};

const cellDomId = (line: number, column: string) => `asset-import-cell-${line}-${column}`;
const isCodeColumn = (column: ImportColumnKey) => column === 'serial' || column === 'asset_code' || column === 'tag';

// Scrolls the cell into view past the pinned columns and puts the cursor in it
function focusCell(line: number, column: string) {
    const cell = document.getElementById(cellDomId(line, column));
    if (!cell) return;
    cell.scrollIntoView({ block: 'nearest', inline: 'center' });
    cell.focus({ preventScroll: true });
}

const stickyRow = 'sticky left-0 z-[1] w-16 min-w-16 bg-card';
const stickyResult = 'sticky left-16 z-[1] min-w-36 shadow-[1px_0_0_var(--color-border)] bg-card';

type EditHandler = (line: number, column: ImportColumnKey, value: CellEdit) => void;

interface TableProps {
    columns: ImportColumn[];
    rows: CheckedRow[];
    options: ImportOptions;
    edits: RowEdits;
    onEdit: EditHandler;
}

export function ImportCheckTable({ columns, rows, options, edits, onEdit }: TableProps) {
    const t = useT();
    const headClass = 'bg-card sticky top-0 px-3 py-2.5 whitespace-nowrap shadow-[0_1px_0_var(--color-border)]';

    return (
        <div className="border-border flex min-h-0 flex-1 flex-col overflow-clip rounded-xl border">
            <div className="min-h-0 flex-1 overflow-auto">
                <table className="w-full text-sm">
                    <caption className="sr-only">{t('asset_import_step_check')}</caption>
                    <thead>
                        <tr className="text-muted-foreground text-left text-[11.5px] font-semibold">
                            <th scope="col" className={cn(headClass, 'left-0 z-20 w-16 min-w-16')}>
                                {t('asset_import_col_row')}
                            </th>
                            <th
                                scope="col"
                                className={cn(headClass, 'left-16 z-20 min-w-36 shadow-[1px_0_0_var(--color-border),0_1px_0_var(--color-border)]')}
                            >
                                {t('asset_import_col_result')}
                            </th>
                            {columns.map((column) => (
                                <th key={column.key} scope="col" className={cn(headClass, 'z-10')}>
                                    {t(COLUMN_LABEL[column.key])}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => (
                            <CheckRow key={row.line} row={row} rowEdits={edits[row.line]} columns={columns} options={options} onEdit={onEdit} />
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

interface RowProps {
    row: CheckedRow;
    rowEdits: RowEdits[number] | undefined;
    columns: ImportColumn[];
    options: ImportOptions;
    onEdit: EditHandler;
}

// Memoised: rows without edits keep their identity across edits, so only the touched row renders again
const CheckRow = memo(function CheckRow({ row, rowEdits, columns, options, onEdit }: RowProps) {
    const t = useT();
    const fmtN = useNumberFormat();
    const labelOf = (column: string) => (column in COLUMN_LABEL ? t(COLUMN_LABEL[column as ImportColumnKey]) : column);

    const issueWords = (issue: Issue) => fillIssueWords(t(`asset_import_issue_${issue.code}`), issue, row, options, labelOf, fmtN);

    const firstBad = columns.find((column) => row.issues.some((issue) => issue.column === column.key))?.key ?? row.issues[0]?.column;

    return (
        <tr className="border-border border-b last:border-0">
            <th scope="row" className={cn(stickyRow, 'px-3 py-2 text-left align-top font-medium tabular-nums')}>
                {fmtN(row.line)}
            </th>
            <td className={cn(stickyResult, 'px-3 py-2 align-top whitespace-nowrap')}>
                {firstBad === undefined ? (
                    <span className="inline-flex min-h-8 items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                        <CircleCheck className="h-4 w-4" aria-hidden="true" />
                        {t('asset_import_row_ready')}
                    </span>
                ) : (
                    <button
                        type="button"
                        onClick={() => focusCell(row.line, firstBad)}
                        className="hover:bg-accent focus-visible:ring-ring inline-flex min-h-8 items-center gap-1 rounded-md px-1.5 text-xs font-semibold text-red-700 focus-visible:ring-2 focus-visible:outline-hidden dark:text-red-300"
                    >
                        <CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                        {t('asset_import_fix_column').replace('{column}', labelOf(firstBad))}
                    </button>
                )}
            </td>
            {columns.map((column) => {
                const issues = row.issues.filter((issue) => issue.column === column.key);
                const edited = rowEdits !== undefined && column.key in rowEdits;
                return (
                    <td key={column.key} className="px-3 py-2 align-top">
                        {issues.length > 0 || edited ? (
                            <EditableCell
                                row={row}
                                column={column.key}
                                label={labelOf(column.key)}
                                edit={rowEdits?.[column.key]}
                                edited={edited}
                                options={options}
                                issues={issues.map(issueWords)}
                                closest={issues.find((issue) => issue.closest !== undefined)?.closest}
                                onEdit={onEdit}
                            />
                        ) : (
                            <PlainCell row={row} column={column.key} options={options} />
                        )}
                    </td>
                );
            })}
        </tr>
    );
});

/** A clean cell: the name for a picked list item, otherwise the text as the file had it. */
function PlainCell({ row, column, options }: { row: CheckedRow; column: ImportColumnKey; options: ImportOptions }) {
    const t = useT();
    if (column === 'warranty_lifetime') return <span className="whitespace-nowrap">{row.values.warranty_lifetime ? t('yes') : ''}</span>;
    let text = row.cells[column] ?? '';
    const listed = LIST_COLUMN[column];
    if (listed) {
        const id = row.values[listed.idField];
        text = options[listed.list].find((option) => option.id === id)?.name ?? text;
    }
    return (
        <span
            className={cn('whitespace-nowrap', (column === 'value' || isCodeColumn(column)) && 'tabular-nums')}
            translate={isCodeColumn(column) ? 'no' : undefined}
        >
            {text}
        </span>
    );
}

interface CellProps {
    row: CheckedRow;
    column: ImportColumnKey;
    label: string;
    edit: CellEdit | undefined;
    edited: boolean;
    options: ImportOptions;
    /** Problems already in words; empty once fixed. */
    issues: string[];
    closest: number | undefined;
    onEdit: EditHandler;
}

/** A cell the user can change: a list for names, a yes or blank choice for lifetime warranty, a text box for the rest. */
function EditableCell({ row, column, label, edit, edited, options, issues, closest, onEdit }: CellProps) {
    const t = useT();
    const id = cellDomId(row.line, column);
    const errorId = `${id}-error`;
    const invalid = issues.length > 0;
    const describedBy = invalid ? errorId : undefined;
    // A lifetime flag the file wrote as something else stays as the current choice, so picking blank is a change
    const unresolved = invalid && !edited && column === 'warranty_lifetime';

    return (
        <div className="min-w-44">
            {column === 'warranty_lifetime' ? (
                <select
                    id={id}
                    aria-label={label}
                    aria-invalid={invalid}
                    aria-describedby={describedBy}
                    value={unresolved ? 'file' : (edited ? edit === true : row.values.warranty_lifetime) ? 'yes' : ''}
                    onChange={(event) => onEdit(row.line, column, event.target.value === 'yes')}
                    className={cn(
                        'border-input bg-background focus-visible:border-brand focus-visible:ring-brand/15 h-9 w-full rounded-md border px-3 text-sm focus-visible:ring-[3px] focus-visible:outline-hidden',
                        invalid && 'border-destructive',
                    )}
                >
                    {unresolved && (
                        <option value="file" disabled>
                            {row.cells.warranty_lifetime}
                        </option>
                    )}
                    <option value="" />
                    <option value="yes">{t('yes')}</option>
                </select>
            ) : LIST_COLUMN[column] ? (
                <ListCell
                    row={row}
                    column={column}
                    label={label}
                    id={id}
                    invalid={invalid}
                    describedBy={describedBy}
                    options={options}
                    closest={closest}
                    onEdit={onEdit}
                />
            ) : (
                <Input
                    id={id}
                    aria-label={label}
                    aria-invalid={invalid}
                    aria-describedby={describedBy}
                    inputMode={column === 'value' ? 'decimal' : undefined}
                    translate={isCodeColumn(column) ? 'no' : undefined}
                    value={typeof edit === 'string' ? edit : (row.cells[column] ?? '')}
                    onChange={(event) => onEdit(row.line, column, event.target.value)}
                    className={cn('h-9 text-sm', invalid && 'border-destructive focus-visible:border-destructive')}
                />
            )}
            {invalid && (
                <div id={errorId} className="text-destructive mt-1 space-y-0.5 text-xs">
                    {issues.map((words, index) => (
                        <p key={index} className="flex items-start gap-1">
                            <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            {words}
                        </p>
                    ))}
                </div>
            )}
            {!invalid && edited && (
                <p className="mt-1 flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                    <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {t('asset_import_cell_fixed')}
                </p>
            )}
        </div>
    );
}

interface ListCellProps {
    row: CheckedRow;
    column: ImportColumnKey;
    label: string;
    id: string;
    invalid: boolean;
    describedBy: string | undefined;
    options: ImportOptions;
    closest: number | undefined;
    onEdit: EditHandler;
}

// The choices of a name column; models are limited to the row's brand, the closest name first
function ListCell({ row, column, label, id, invalid, describedBy, options, closest, onEdit }: ListCellProps) {
    const listed = LIST_COLUMN[column];
    if (!listed) return null;
    const brandId = row.values.brand_id;
    const choices = choicesFor(column, options, brandId, closest);
    const current = row.values[listed.idField];
    const value = typeof current === 'number' ? String(current) : '';
    // A model of another brand is no longer a choice but must still show on the trigger
    const kept = value !== '' && !choices.some((choice) => choice.value === value) ? pickedOption(options[listed.list], Number(value)) : undefined;

    return (
        <div className={cn(invalid && '[&_[role=combobox]]:border-destructive')}>
            <SearchableSelect
                id={id}
                aria-label={label}
                aria-invalid={invalid}
                aria-describedby={describedBy}
                value={value}
                options={choices}
                selectedOption={kept}
                searchPlaceholder={label}
                onChange={(next) => onEdit(row.line, column, next === '' ? null : Number(next))}
            />
        </div>
    );
}

function pickedOption(list: ImportOption[], id: number): SearchOption | undefined {
    const found = list.find((option) => option.id === id);
    return found ? { value: String(found.id), label: found.name, search: found.name } : undefined;
}

// Choices per option set, column and (for models) brand are built once; the closest name is moved to the top per cell
const choiceCache = new WeakMap<ImportOptions, Map<string, SearchOption[]>>();

function choicesFor(column: ImportColumnKey, options: ImportOptions, brandId: number | null, closest: number | undefined): SearchOption[] {
    let cache = choiceCache.get(options);
    if (!cache) choiceCache.set(options, (cache = new Map()));
    const key = `${column}:${column === 'model' ? brandId : ''}`;
    let base = cache.get(key);
    if (!base) {
        const scoped: ImportOptions =
            column === 'model' && brandId !== null ? { ...options, models: options.models.filter((model) => model.brand_id === brandId) } : options;
        cache.set(key, (base = optionsFor(column, scoped)));
    }
    const at = closest === undefined ? -1 : base.findIndex((choice) => choice.value === String(closest));
    return at > 0 ? [base[at], ...base.slice(0, at), ...base.slice(at + 1)] : base;
}
