// Rows of the asset import dialog: applying edits, the checks the page can run while typing (same rules and issue codes
// as app/Services/Asset/AssetImportChecker.php), dropdown options, summary groups and the request payload. Pure logic.
import type { SearchOption } from '@/shared/components/searchable-select';
import type { DateFormat } from '@/shared/lib/datetime';
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
import { fillWords } from './fill-words.ts';
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
    options: ImportOptions;
    /** The date-format setting: decides whether typed dates are day-first or year-first. */
    dateFormat: DateFormat;
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

/**
 * Y-m-d of a real calendar date, or null. Y-m-d and the template's day-first d/m/Y or d-m-Y are read under every
 * date-format setting (no setting is month-first); a year-first Y/m/d only under the ymd_* settings.
 * Years over 2400 are Buddhist and count back 543.
 */
export function normalizeDate(text: string, format: DateFormat): string | null {
    const trimmed = text.trim();
    let parts = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
    let order: [number, number, number] = [1, 2, 3];
    if (!parts && format.startsWith('ymd_')) parts = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(trimmed);
    if (!parts) {
        parts = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(trimmed);
        order = [3, 2, 1];
    }
    if (!parts) return null;
    let year = Number(parts[order[0]]);
    const month = Number(parts[order[1]]);
    const day = Number(parts[order[2]]);
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
        return normalizeDate(text, ctx.dateFormat) === null ? [{ code: 'bad_date', column, value: text }] : [];

    const max = TEXT_MAX[column];
    const length = [...text].length;
    if (max !== undefined && length > max) return [{ code: 'too_long', column, max, length }];
    if (DUPLICATE_COLUMNS.includes(column)) {
        const first = firstLineOf(row.line, column, text, ctx.rows);
        if (first !== null) return [{ code: 'dup_in_file', column, line: first }];
    }
    return [];
}

function modelBrandIssues(row: CheckedRow, modelId: number, ctx: IssueContext): Issue[] {
    const brandId = row.values.brand_id;
    const model = ctx.options.models.find((m) => m.id === modelId);
    if (!model || brandId === null || model.brand_id === brandId) return [];
    return [{ code: 'model_not_in_brand', column: 'model', value: String(modelId) }];
}

// Same comparison as the server: whitespace runs collapse to one space, trimmed, case-insensitive
function sameKey(text: string): string {
    return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

// Line of the first row holding `text` when that row is not `line` itself (the server flags only later occurrences)
function firstLineOf(line: number, column: ImportColumnKey, text: string, rows: CheckedRow[]): number | null {
    const needle = sameKey(text);
    for (const other of rows) {
        const key = other.line === line ? needle : sameKey(String(other.values[column as keyof CheckedValues] ?? ''));
        if (key === needle) return other.line === line ? null : other.line;
    }
    return null;
}

// Replaces every row's dup_in_file flags with the first-occurrence rule, so fixing one row clears the ones that pointed at it.
// One pass builds the first line of each text; a row whose flags are unchanged keeps its identity.
function withDuplicateFlags(rows: CheckedRow[]): CheckedRow[] {
    const firstSeen = new Map<ImportColumnKey, Map<string, number>>();
    for (const column of DUPLICATE_COLUMNS) {
        const seen = new Map<string, number>();
        for (const row of rows) {
            const key = sameKey(String(row.values[column as keyof CheckedValues] ?? ''));
            if (key !== '' && !seen.has(key)) seen.set(key, row.line);
        }
        firstSeen.set(column, seen);
    }
    const isFlag = (issue: Issue) => issue.code === 'dup_in_file' && DUPLICATE_COLUMNS.includes(issue.column as ImportColumnKey);
    return rows.map((row) => {
        const flags: Issue[] = [];
        for (const column of DUPLICATE_COLUMNS) {
            const key = sameKey(String(row.values[column as keyof CheckedValues] ?? ''));
            const first = key === '' ? undefined : firstSeen.get(column)?.get(key);
            if (first !== undefined && first !== row.line) flags.push({ code: 'dup_in_file', column, line: first });
        }
        const current = row.issues.filter(isFlag);
        const same =
            current.length === flags.length &&
            current.every((issue) => flags.some((flag) => flag.column === issue.column && flag.line === issue.line));
        return same ? row : { ...row, issues: [...row.issues.filter((issue) => !isFlag(issue)), ...flags] };
    });
}

function applyEdit(values: CheckedValues, column: ImportColumnKey, edit: CellEdit, dateFormat: DateFormat): CheckedValues {
    const idField = ID_FIELD[column];
    if (idField) return { ...values, [idField]: edit === null || edit === '' ? null : Number(edit) };
    if (column === 'warranty_lifetime') return { ...values, warranty_lifetime: edit === true };
    const text = typeof edit === 'string' ? edit.trim() : edit === null ? '' : String(edit);
    if (text === '') return { ...values, [column]: null };
    // A valid price or date is stored in the server's form; a wrong one stays as typed so the cell shows it back
    if (column === 'value') return { ...values, value: normalizePrice(text) ?? text };
    if (column === 'purchase_date' || column === 'warranty_end') return { ...values, [column]: normalizeDate(text, dateFormat) ?? text };
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
export function rowsWithEdits(rows: CheckedRow[], edits: RowEdits, options: ImportOptions, kind: ImportKind, dateFormat: DateFormat): CheckedRow[] {
    const applied = rows.map((row) => {
        const rowEdits = edits[row.line];
        if (!rowEdits) return row;
        let values = row.values;
        for (const [column, edit] of Object.entries(rowEdits) as [ImportColumnKey, CellEdit][]) values = applyEdit(values, column, edit, dateFormat);
        return { ...row, values };
    });
    const ctx: IssueContext = { kind, rows: applied, options, dateFormat };

    const judged = applied.map((row, index) => {
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
    return withDuplicateFlags(judged);
}

/** What the server refused per sheet line: its issues and the values that were sent when it refused. */
export type ServerIssueOverlay = Record<number, { issues: Issue[]; sent: CheckedValues }>;

/**
 * Rows with the server's issues laid over them. An issue stays on its cell until that cell's value differs
 * from the one sent, because the page-side checks cannot produce serial_taken, code_taken or not_found.
 * A row the overlay does not change keeps its identity.
 */
export function withServerIssues(rows: CheckedRow[], overlay: ServerIssueOverlay): CheckedRow[] {
    return rows.map((row) => {
        const refused = overlay[row.line];
        if (!refused) return row;
        const kept = refused.issues.filter(
            (issue) =>
                valueOf(row.values, issue.column as ImportColumnKey) === valueOf(refused.sent, issue.column as ImportColumnKey) &&
                !row.issues.some((own) => own.code === issue.code && own.column === issue.column),
        );
        return kept.length === 0 ? row : { ...row, issues: [...row.issues, ...kept] };
    });
}

/** The overlay for a refused import: the server's issues per sheet line with the values sent for that line. Lines no longer in the rows are dropped. */
export function overlayFromRefusal(lines: { row: number; issues: Issue[] }[], rows: CheckedRow[]): ServerIssueOverlay {
    const overlay: ServerIssueOverlay = {};
    for (const { row: line, issues } of lines) {
        const sent = rows.find((r) => r.line === line)?.values;
        if (sent) overlay[line] = { issues, sent };
    }
    return overlay;
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
export function importRunPayload(kind: ImportKind, rows: CheckedRow[], contractId: number | null, dateFormat: DateFormat): ImportRunPayload {
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
                purchase_date: v.purchase_date === null ? null : normalizeDate(v.purchase_date, dateFormat),
                warranty_end: v.warranty_end === null ? null : normalizeDate(v.warranty_end, dateFormat),
                warranty_lifetime: v.warranty_lifetime === true,
            }),
        ),
    };
    if (kind === 'rented' && contractId !== null) payload.contract_id = contractId;
    return payload;
}

/** One issue in words: the template's placeholders filled from the issue, the row and the list names (spaced by fillWords). */
export function fillIssueWords(
    template: string,
    issue: Issue,
    row: CheckedRow,
    options: ImportOptions,
    columnName: (column: string) => string,
    formatNumber: (value: number) => string,
): string {
    const fill: Record<string, string | number | undefined> = {
        ...issue,
        column: columnName(issue.column),
        brand: issue.brand ?? options.brands.find((brand) => brand.id === row.values.brand_id)?.name ?? '',
        // The server sends no value for a taken code; the cell's own text is the code
        value: issue.value ?? row.values.asset_code ?? row.cells.asset_code ?? '',
    };
    const words: Record<string, string> = {};
    for (const [name, value] of Object.entries(fill)) {
        if (value !== undefined) words[name] = typeof value === 'number' ? formatNumber(value) : String(value);
    }
    return fillWords(template, words);
}
