// Rows of the asset import dialog: applying edits, the checks the page can run while typing (same rules and issue codes
// as app/Services/Asset/AssetImportChecker.php), dropdown options, summary groups and the request payload. Pure logic.
import type { SearchOption } from '@/shared/components/searchable-select';
import type {
    CheckedRow,
    CheckedValues,
    ImportKind,
    ImportOption,
    ImportOptions,
    ImportRunPayload,
    ImportRunRow,
    Issue,
} from '../api/assetImportApi';
import { IMPORT_COLUMNS, type ImportColumnKey, type ImportListName } from './import-columns.ts';

/** Value typed or picked for a cell: an id for dropdown columns, text for the rest, a boolean for lifetime warranty. */
export type CellEdit = string | number | boolean | null;

/** Edits by sheet line, then by column. */
export type RowEdits = Record<number, Partial<Record<ImportColumnKey, CellEdit>>>;

export interface IssueContext {
    kind: ImportKind;
    /** Every row, edits applied, for the repeated-in-file check. */
    rows: CheckedRow[];
    /** Needed for the model-belongs-to-brand check. */
    options?: ImportOptions;
}

export type SummaryEntry = [label: string, count: number, value: number];

export interface SummaryGroups {
    byModel: SummaryEntry[];
    byWarehouse: SummaryEntry[];
    byVendor?: SummaryEntry[];
}

// Same limits as the server checker
const TEXT_MAX: Partial<Record<ImportColumnKey, number>> = { serial: 120, asset_code: 60, tag: 10, notes: 2000 };
const DUPLICATE_COLUMNS: ImportColumnKey[] = ['serial', 'asset_code'];
const ID_FIELD: Partial<Record<ImportColumnKey, keyof CheckedValues>> = {
    category: 'category_id',
    brand: 'brand_id',
    model: 'model_id',
    warehouse: 'warehouse_id',
    vendor: 'vendor_id',
};
const OPTION_LIST: Partial<Record<ImportColumnKey, ImportListName>> = {
    category: 'categories',
    brand: 'brands',
    model: 'models',
    warehouse: 'warehouses',
    vendor: 'vendors',
};

/** Price as the server stores it ("28500.00"): up to 13 digits, up to 2 decimals, commas allowed. Null when it is not a price. */
export function normalizePrice(text: string): string | null {
    const match = /^(\d{1,13})(?:\.(\d{1,2}))?$/.exec(text.replace(/,/g, '').trim());
    return match ? `${match[1]}.${(match[2] ?? '').padEnd(2, '0')}` : null;
}

/** Y-m-d of a real calendar date (Buddhist years over 2400 count back 543), or null. */
export function normalizeDate(text: string): string | null {
    const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text.trim());
    if (!match) return null;
    let year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (year > 2400) year -= 543;
    const real = new Date(Date.UTC(year, month - 1, day));
    if (real.getUTCFullYear() !== year || real.getUTCMonth() !== month - 1 || real.getUTCDate() !== day) return null;
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function isRequired(column: ImportColumnKey, row: CheckedRow, kind: ImportKind): boolean {
    const listed = IMPORT_COLUMNS[kind].find((c) => c.key === column);
    if (!listed) return false;
    // Lifetime warranty makes the end date optional
    if (column === 'warranty_end') return !row.values.warranty_lifetime;
    return listed.required;
}

/**
 * Problems of one cell with the value as typed. Uses the server's issue codes so the check table words
 * them with the same lang keys.
 */
export function localIssues(row: CheckedRow, column: ImportColumnKey, value: CellEdit, ctx: IssueContext): Issue[] {
    if (!IMPORT_COLUMNS[ctx.kind].some((c) => c.key === column) || column === 'warranty_lifetime') return [];
    const required = isRequired(column, row, ctx.kind);
    const blank: Issue[] = required ? [{ code: 'required', column }] : [];

    if (ID_FIELD[column]) {
        if (value === null || value === '') return blank;
        return column === 'model' ? modelBrandIssues(row, Number(value), ctx) : [];
    }

    const text = typeof value === 'string' ? value.trim() : value === null ? '' : String(value);
    if (text === '') return blank;

    if (column === 'value') return normalizePrice(text) === null ? [{ code: 'not_a_number', column, value: text }] : [];
    if (column === 'purchase_date' || column === 'warranty_end')
        return normalizeDate(text) === null ? [{ code: 'bad_date', column, value: text }] : [];

    const max = TEXT_MAX[column];
    const length = [...text].length;
    if (max !== undefined && length > max) return [{ code: 'too_long', column, max, length }];
    if (DUPLICATE_COLUMNS.includes(column)) {
        const first = firstRepeat(row, column, text, ctx.rows);
        if (first !== null) return [{ code: 'dup_in_file', column, line: first }];
    }
    return [];
}

function modelBrandIssues(row: CheckedRow, modelId: number, ctx: IssueContext): Issue[] {
    const brandId = row.values.brand_id;
    const model = ctx.options?.models.find((m) => m.id === modelId);
    if (!model || brandId === null || model.brand_id === brandId) return [];
    return [{ code: 'model_not_in_brand', column: 'model', value: String(modelId) }];
}

// Earliest other row holding the same text (case-insensitive), or null
function firstRepeat(row: CheckedRow, column: ImportColumnKey, text: string, rows: CheckedRow[]): number | null {
    const needle = text.toLowerCase();
    const lines = rows
        .filter(
            (other) =>
                other.line !== row.line &&
                String(other.values[column as keyof CheckedValues] ?? '')
                    .trim()
                    .toLowerCase() === needle,
        )
        .map((other) => other.line);
    return lines.length > 0 ? Math.min(...lines) : null;
}

function applyEdit(values: CheckedValues, column: ImportColumnKey, edit: CellEdit): CheckedValues {
    const idField = ID_FIELD[column];
    if (idField) return { ...values, [idField]: edit === null || edit === '' ? null : Number(edit) };
    if (column === 'warranty_lifetime') return { ...values, warranty_lifetime: edit === true };
    const text = typeof edit === 'string' ? edit.trim() : edit === null ? '' : String(edit);
    if (text === '') return { ...values, [column]: null };
    // A valid price or date is stored in the server's form; a wrong one stays as typed so the cell shows it back
    if (column === 'value') return { ...values, value: normalizePrice(text) ?? text };
    if (column === 'purchase_date' || column === 'warranty_end') return { ...values, [column]: normalizeDate(text) ?? text };
    return { ...values, [column]: text };
}

function valueOf(values: CheckedValues, column: ImportColumnKey): CellEdit {
    const idField = ID_FIELD[column];
    return values[idField ?? (column as keyof CheckedValues)] as CellEdit;
}

/**
 * Rows with the user's edits applied. An edited cell drops the issues the server gave it and gets the
 * page-side check instead; the input rows are not changed.
 */
export function rowsWithEdits(rows: CheckedRow[], edits: RowEdits, options?: ImportOptions, kind: ImportKind = 'purchased'): CheckedRow[] {
    const applied = rows.map((row) => {
        const rowEdits = edits[row.line];
        if (!rowEdits) return row;
        let values = row.values;
        for (const [column, edit] of Object.entries(rowEdits) as [ImportColumnKey, CellEdit][]) values = applyEdit(values, column, edit);
        return { ...row, values };
    });
    const ctx: IssueContext = { kind, rows: applied, options };

    return applied.map((row, index) => {
        const rowEdits = edits[row.line];
        if (!rowEdits) return row;
        let issues = row.issues;
        for (const column of Object.keys(rowEdits) as ImportColumnKey[]) {
            issues = issues.filter((issue) => issue.column !== column).concat(localIssues(row, column, valueOf(row.values, column), ctx));
        }
        // A new brand re-judges the model; a new lifetime flag re-judges the end date
        if ('brand' in rowEdits && !('model' in rowEdits)) {
            issues = issues.filter((issue) => issue.code !== 'model_not_in_brand');
            if (row.values.model_id !== null) issues = issues.concat(modelBrandIssues(row, row.values.model_id, ctx));
        }
        if ('warranty_lifetime' in rowEdits && !('warranty_end' in rowEdits)) {
            issues = issues.filter((issue) => !(issue.column === 'warranty_end' && issue.code === 'required'));
            issues = issues.concat(row.values.warranty_end === null ? localIssues(row, 'warranty_end', null, ctx) : []);
        }
        return { ...applied[index], issues };
    });
}

/** Rows that still have at least one issue. */
export function badRowCount(rows: CheckedRow[]): number {
    return rows.filter((row) => row.issues.length > 0).length;
}

function labelOf(option: ImportOption): SearchOption {
    return { value: String(option.id), label: option.name, search: `${option.name} ${option.name_th ?? ''}`.trim() };
}

/** Dropdown choices for a column, the closest name first. */
export function optionsFor(column: ImportColumnKey, options: ImportOptions, closestId?: number | null): SearchOption[] {
    const list = OPTION_LIST[column];
    if (!list) return [];
    const all = options[list];
    const closest = all.find((option) => option.id === closestId);
    const rest = all.filter((option) => option !== closest);
    return (closest ? [closest, ...rest] : rest).map(labelOf);
}

function group(rows: CheckedRow[], idOf: (row: CheckedRow) => number | null, names: ImportOption[]): SummaryEntry[] {
    const totals = new Map<number, { count: number; value: number }>();
    for (const row of rows) {
        const id = idOf(row);
        if (id === null) continue;
        const total = totals.get(id) ?? { count: 0, value: 0 };
        total.count += 1;
        total.value += Number(row.values.value ?? 0) || 0;
        totals.set(id, total);
    }
    return [...totals.entries()]
        .map(([id, total]): SummaryEntry => [names.find((n) => n.id === id)?.name ?? `#${id}`, total.count, Math.round(total.value * 100) / 100])
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** Counts and price totals by model, warehouse and (purchased only) vendor, biggest group first. */
export function summaryGroups(rows: CheckedRow[], options: ImportOptions, kind: ImportKind): SummaryGroups {
    const groups: SummaryGroups = {
        byModel: group(rows, (r) => r.values.model_id, options.models),
        byWarehouse: group(rows, (r) => r.values.warehouse_id, options.warehouses),
    };
    if (kind === 'purchased') groups.byVendor = group(rows, (r) => r.values.vendor_id, options.vendors);
    return groups;
}

/** Splits a long list into the first `limit` entries and the folded remainder. */
export function foldAt<T>(entries: T[], limit: number): { shown: T[]; rest: T[] } {
    return { shown: entries.slice(0, limit), rest: entries.slice(limit) };
}

/** Body of the import request: ids and normalised text; the contract goes with rentals only. */
export function importRunPayload(kind: ImportKind, rows: CheckedRow[], contractId: number | null): ImportRunPayload {
    const payload: ImportRunPayload = {
        kind,
        rows: rows.map(
            ({ line, values: v }): ImportRunRow => ({
                line,
                category_id: v.category_id,
                brand_id: v.brand_id,
                model_id: v.model_id,
                serial: v.serial,
                warehouse_id: v.warehouse_id,
                asset_code: v.asset_code,
                tag: v.tag,
                notes: v.notes,
                value: v.value === null ? null : normalizePrice(v.value),
                vendor_id: v.vendor_id,
                purchase_date: v.purchase_date === null ? null : normalizeDate(v.purchase_date),
                warranty_end: v.warranty_end === null ? null : normalizeDate(v.warranty_end),
                warranty_lifetime: v.warranty_lifetime === true,
            }),
        ),
    };
    if (kind === 'rented' && contractId !== null) payload.contract_id = contractId;
    return payload;
}
