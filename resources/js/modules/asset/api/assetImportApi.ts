// Asset import calls: template download, whole-file check (nothing written) and the all-or-nothing import.
// Also holds the shapes the import dialog shares with the server.
import { ensureCsrf, http } from '@/shared/lib/http';
import type { ApiEnvelope } from '@/shared/types';

export type ImportKind = 'rented' | 'purchased';

/** One cell-level problem, worded in the UI by `asset_import_issue_<code>`. */
export interface Issue {
    code: string;
    column: string;
    value?: string;
    closest?: number;
    closest_name?: string;
    line?: number;
    asset_code?: string;
    max?: number;
    length?: number;
    brand?: string;
}

/** Matched values of a row: master data ids, text kept as typed, price as a numeric string, dates as Y-m-d. */
export interface CheckedValues {
    category_id: number | null;
    brand_id: number | null;
    model_id: number | null;
    warehouse_id: number | null;
    vendor_id: number | null;
    serial: string | null;
    asset_code: string | null;
    tag: string | null;
    notes: string | null;
    value: string | null;
    purchase_date: string | null;
    warranty_end: string | null;
    warranty_lifetime: boolean;
}

/** One data row of the file after the server matched and checked it; `line` is the sheet row number. */
export interface CheckedRow {
    line: number;
    cells: Record<string, string>;
    values: CheckedValues;
    issues: Issue[];
}

export interface ImportOption {
    id: number;
    name: string;
    name_th?: string | null;
}

export interface ImportModelOption extends ImportOption {
    brand_id: number;
}

export interface ImportOptions {
    categories: ImportOption[];
    brands: ImportOption[];
    models: ImportModelOption[];
    warehouses: ImportOption[];
    vendors: ImportOption[];
}

export interface ImportPreview {
    rows: CheckedRow[];
    options: ImportOptions;
    meta: { total: number; valid: number; invalid: number; ignored_columns: string[] };
}

/** One row of the import request: ids and normalised text only. */
export interface ImportRunRow {
    line: number;
    category_id: number | null;
    brand_id: number | null;
    model_id: number | null;
    serial: string | null;
    warehouse_id: number | null;
    asset_code: string | null;
    tag: string | null;
    notes: string | null;
    value: string | null;
    vendor_id: number | null;
    purchase_date: string | null;
    warranty_end: string | null;
    warranty_lifetime: boolean;
}

export interface ImportRunPayload {
    kind: ImportKind;
    contract_id?: number;
    rows: ImportRunRow[];
}

export interface ImportResult {
    imported: number;
    ids: number[];
    first_code: string | null;
    last_code: string | null;
    contract_code: string | null;
}

/** File names the server gives the templates. */
export const IMPORT_TEMPLATE_FILES: Record<ImportKind, string> = {
    rented: 'asset-import-rental-template.xlsx',
    purchased: 'asset-import-purchase-template.xlsx',
};

export const assetImportApi = {
    template: (kind: ImportKind) => http.get('/assets/import-template', { params: { kind }, responseType: 'blob' }).then((r) => r.data as Blob),
    // Whole-file check with the real rules; nothing is written
    preview: async (kind: ImportKind, file: File) => {
        await ensureCsrf();
        const fd = new FormData();
        fd.append('file', file);
        fd.append('kind', kind);
        const { data } = await http.post<ApiEnvelope<ImportPreview>>('/assets/import/preview', fd);
        return data.data;
    },
    run: async (payload: ImportRunPayload) => {
        await ensureCsrf();
        const { data } = await http.post<ApiEnvelope<ImportResult>>('/assets/import', payload);
        return data.data;
    },
};
