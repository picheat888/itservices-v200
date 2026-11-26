// Columns of the asset import files, in file order, as the template and the check table name them.
// Mirrors app/Support/AssetImportColumns.php.
import type { ImportKind } from '../api/assetImportApi';

export type ImportColumnKey =
    | 'asset_code'
    | 'tag'
    | 'category'
    | 'brand'
    | 'model'
    | 'serial'
    | 'warehouse'
    | 'value'
    | 'vendor'
    | 'purchase_date'
    | 'warranty_end'
    | 'warranty_lifetime'
    | 'notes';

export type ImportListName = 'categories' | 'brands' | 'models' | 'warehouses' | 'vendors';

export interface ImportColumn {
    key: ImportColumnKey;
    /** Header cell of the template: "th (en)", or th alone. */
    header: string;
    required: boolean;
    /** Name of the dropdown list the column is picked from. */
    list?: ImportListName;
    /** Lang key of the how-to-fill text. */
    howKey: string;
    example: string;
}

function column(key: ImportColumnKey, header: string, example: string, required: boolean, list?: ImportListName): ImportColumn {
    return { key, header, required, list, howKey: `asset_import_how_${key}`, example };
}

export const IMPORT_COLUMNS: Record<ImportKind, ImportColumn[]> = {
    rented: [
        column('asset_code', 'รหัสทรัพย์สิน (Asset No.)', 'INK-IT-26-0150', false),
        column('tag', 'Tag', 'NB-RT-01', false),
        column('category', 'ประเภท (Type)', 'Notebook', true, 'categories'),
        column('brand', 'ยี่ห้อ (Brand)', 'Lenovo', true, 'brands'),
        column('model', 'รุ่น (Model)', 'ThinkPad E14 Gen 6', true, 'models'),
        column('serial', 'Serial (Serial No.)', 'PF4XK101', true),
        column('warehouse', 'คลัง (Warehouse)', 'คลังกลาง สำนักงานใหญ่', true, 'warehouses'),
        column('notes', 'หมายเหตุ (Remark)', 'ล็อตเช่าปี 2026', false),
    ],
    purchased: [
        column('asset_code', 'รหัสทรัพย์สิน (Asset No.)', 'INK-IT-26-0150', false),
        column('category', 'ประเภท (Type)', 'Notebook', true, 'categories'),
        column('brand', 'ยี่ห้อ (Brand)', 'Lenovo', true, 'brands'),
        column('model', 'รุ่น (Model)', 'ThinkPad E14 Gen 6', true, 'models'),
        column('serial', 'Serial (Serial No.)', 'PF4XK101', true),
        column('warehouse', 'คลัง (Warehouse)', 'คลังกลาง สำนักงานใหญ่', true, 'warehouses'),
        column('tag', 'Tag', 'NB-RT-01', false),
        column('value', 'ราคาซื้อ (Price)', '28,500.00', true),
        column('vendor', 'ผู้ขาย (Vendor)', 'IT City Co., Ltd.', true, 'vendors'),
        column('purchase_date', 'วันที่ซื้อ (Purchase date)', '12/11/2026', true),
        column('warranty_end', 'สิ้นสุดวันรับประกัน (Warranty ends)', '11/11/2029', true),
        column('warranty_lifetime', 'ประกันตลอดชีพ (Lifetime warranty)', 'ใช่', false),
        column('notes', 'หมายเหตุ (Remark)', 'ล็อตเช่าปี 2026', false),
    ],
};
