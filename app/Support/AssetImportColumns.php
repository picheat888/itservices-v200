<?php

// Column catalogue of the asset import files (rented and purchased): order, headers, required columns, header matching.
// Shared by the .xlsx templates and the importer so both read the same names.

namespace App\Support;

class AssetImportColumns
{
    public const KINDS = ['rented', 'purchased'];

    public const MAX_ROWS = 500;

    public const DATA_SHEET = ['rented' => 'ทรัพย์สินเช่า', 'purchased' => 'ทรัพย์สินซื้อ'];

    public const LISTS_SHEET = 'รายการที่ใช้ได้';

    /**
     * Columns of one import kind in file order.
     *
     * @return list<array{key:string, th:string, en:?string, required:bool, list:?string}>
     */
    public static function for(string $kind): array
    {
        $keys = $kind === 'rented'
            ? ['asset_code', 'tag', 'category', 'brand', 'model', 'serial', 'warehouse', 'notes']
            : ['asset_code', 'category', 'brand', 'model', 'serial', 'warehouse', 'tag', 'value', 'vendor', 'purchase_date', 'warranty_end', 'warranty_lifetime', 'notes'];
        $required = $kind === 'rented'
            ? ['category', 'brand', 'model', 'serial', 'warehouse']
            : ['category', 'brand', 'model', 'serial', 'warehouse', 'value', 'vendor', 'purchase_date', 'warranty_end'];

        $all = self::definitions();

        return array_map(fn (string $key): array => $all[$key] + [
            'key' => $key,
            'required' => in_array($key, $required, true),
        ], $keys);
    }

    /**
     * Header text written to row 1: "th (en)", or just th when there is no English part.
     *
     * @param  array{th:string, en:?string}  $column
     */
    public static function header(array $column): string
    {
        return $column['en'] === null ? $column['th'] : "{$column['th']} ({$column['en']})";
    }

    /** Key of the column a header cell names (full header, Thai part or English part), or null. */
    public static function matchHeader(string $kind, string $cell): ?string
    {
        $needle = self::normalise($cell);
        if ($needle === '') {
            return null;
        }

        foreach (self::for($kind) as $column) {
            foreach ([self::header($column), $column['th'], $column['en']] as $candidate) {
                if ($candidate !== null && self::normalise($candidate) === $needle) {
                    return $column['key'];
                }
            }
        }

        return null;
    }

    private static function normalise(string $text): string
    {
        return mb_strtolower(trim((string) preg_replace('/\s+/u', ' ', $text)));
    }

    /** @return array<string, array{th:string, en:?string, list:?string}> */
    private static function definitions(): array
    {
        return [
            'asset_code' => ['th' => 'รหัสทรัพย์สิน', 'en' => 'Asset No.', 'list' => null],
            'tag' => ['th' => 'Tag', 'en' => null, 'list' => null],
            'category' => ['th' => 'ประเภท', 'en' => 'Type', 'list' => 'categories'],
            'brand' => ['th' => 'ยี่ห้อ', 'en' => 'Brand', 'list' => 'brands'],
            'model' => ['th' => 'รุ่น', 'en' => 'Model', 'list' => 'models'],
            'serial' => ['th' => 'Serial', 'en' => 'Serial No.', 'list' => null],
            'warehouse' => ['th' => 'คลัง', 'en' => 'Warehouse', 'list' => 'warehouses'],
            'value' => ['th' => 'ราคาซื้อ', 'en' => 'Price', 'list' => null],
            'vendor' => ['th' => 'ผู้ขาย', 'en' => 'Vendor', 'list' => 'vendors'],
            'purchase_date' => ['th' => 'วันที่ซื้อ', 'en' => 'Purchase date', 'list' => null],
            'warranty_end' => ['th' => 'สิ้นสุดวันรับประกัน', 'en' => 'Warranty ends', 'list' => null],
            'warranty_lifetime' => ['th' => 'ประกันตลอดชีพ', 'en' => 'Lifetime warranty', 'list' => null],
            'notes' => ['th' => 'หมายเหตุ', 'en' => 'Remark', 'list' => null],
        ];
    }
}
