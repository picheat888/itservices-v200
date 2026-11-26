<?php

// Checks the rows of an asset import file: matches names to master data, checks every cell and offers the closest name.
// Master data is loaded once per check; serial and code clashes with the system are one query each.

namespace App\Services\Asset;

use App\Enums\Asset\AssetStatus;
use App\Models\Asset\Asset;
use App\Models\Settings\AssetModel;
use App\Models\Settings\Brand;
use App\Models\Settings\Category;
use App\Models\Settings\Vendor;
use App\Models\Stock\Warehouse;
use App\Support\AssetImportColumns;
use App\Support\DateDisplay;
use Illuminate\Support\Facades\DB;

class AssetImportChecker
{
    private const SUGGEST_MIN_SIMILARITY = 65.0;

    private const TAG_MAX = 10;

    private const CODE_MAX = 60;

    private const SERIAL_MAX = 120;

    private const NOTES_MAX = 2000;

    private const YES_WORDS = ['ใช่', 'yes'];

    /** @var array<string, list<array{id:int, name:string, name_th:?string, brand_id?:int}>> */
    private array $master = [];

    /**
     * @param  list<array{line:int, cells: array<string,string>}>  $rows
     * @return array{rows: list<array<string, mixed>>, options: array<string, list<array<string, mixed>>>, meta: array{total:int, valid:int, invalid:int, ignored_columns: list<string>}}
     */
    public function check(string $kind, array $rows, array $ignoredColumns = []): array
    {
        $this->loadMaster();
        $required = $this->requiredKeys($kind);
        $dateFormat = DateDisplay::config()['format'];

        $checked = [];
        foreach ($rows as $row) {
            $checked[] = $this->checkRow($row['line'], $row['cells'], $required, $dateFormat);
        }
        $checked = $this->withClashes($checked);

        $invalid = count(array_filter($checked, fn (array $row) => $row['issues'] !== []));

        return [
            'rows' => $checked,
            'options' => $this->master,
            'meta' => ['total' => count($checked), 'valid' => count($checked) - $invalid, 'invalid' => $invalid, 'ignored_columns' => $ignoredColumns],
        ];
    }

    /**
     * Checks rows whose names are already matched to ids (the import step).
     *
     * @param  list<array{line:int, values: array<string, mixed>}>  $values
     * @return list<array{line:int, issues: list<array<string, mixed>>}>
     */
    public function recheck(string $kind, array $values): array
    {
        $required = $this->requiredKeys($kind);
        $rows = [];
        foreach ($values as $row) {
            $issues = [];
            foreach ($required as $key) {
                $idKey = in_array($key, ['category', 'brand', 'model', 'warehouse', 'vendor'], true) ? "{$key}_id" : $key;
                if (($row['values'][$idKey] ?? null) === null || $row['values'][$idKey] === '') {
                    if ($key === 'warranty_end' && ! empty($row['values']['warranty_lifetime'])) {
                        continue;
                    }
                    $issues[] = ['code' => 'required', 'column' => $key];
                }
            }
            $rows[] = ['line' => $row['line'], 'cells' => [], 'values' => $row['values'], 'issues' => $issues];
        }

        return array_map(fn (array $row) => ['line' => $row['line'], 'issues' => $row['issues']], $this->withClashes($rows));
    }

    /** @return list<string> */
    private function requiredKeys(string $kind): array
    {
        return array_column(array_filter(AssetImportColumns::for($kind), fn (array $c) => $c['required']), 'key');
    }

    private function loadMaster(): void
    {
        $this->master = [
            'categories' => Category::query()->orderBy('name')->get(['id', 'name', 'name_th'])->map(fn ($m) => $this->option($m))->all(),
            'brands' => Brand::query()->orderBy('name')->get(['id', 'name'])->map(fn ($m) => $this->option($m))->all(),
            'models' => AssetModel::query()->orderBy('name')->get(['id', 'name', 'brand_id'])->map(fn ($m) => $this->option($m) + ['brand_id' => (int) $m->brand_id])->all(),
            'warehouses' => Warehouse::query()->orderBy('name')->get(['id', 'name'])->map(fn ($m) => $this->option($m))->all(),
            'vendors' => Vendor::query()->orderBy('name')->get(['id', 'name', 'name_th'])->map(fn ($m) => $this->option($m))->all(),
        ];
    }

    /** @return array{id:int, name:string, name_th?:string} */
    private function option(object $model): array
    {
        $option = ['id' => (int) $model->id, 'name' => (string) $model->name];
        if (! empty($model->name_th)) {
            $option['name_th'] = (string) $model->name_th;
        }

        return $option;
    }

    /**
     * @param  array<string, string>  $cells
     * @param  list<string>  $required
     * @return array<string, mixed>
     */
    private function checkRow(int $line, array $cells, array $required, string $dateFormat): array
    {
        $cell = fn (string $key): string => trim($cells[$key] ?? '');
        $issues = [];
        $values = [];

        foreach (['category' => 'categories', 'brand' => 'brands', 'warehouse' => 'warehouses', 'vendor' => 'vendors'] as $key => $list) {
            $values["{$key}_id"] = $this->matchName($key, $cell($key), $list, in_array($key, $required, true), $issues);
        }
        $values['model_id'] = $this->matchModel($cell('model'), $cell('brand'), $values['brand_id'], in_array('model', $required, true), $issues);

        $lifetime = $this->yesNo($cell('warranty_lifetime'), $issues);
        $values['warranty_lifetime'] = $lifetime;

        foreach (['serial' => self::SERIAL_MAX, 'asset_code' => self::CODE_MAX, 'tag' => self::TAG_MAX, 'notes' => self::NOTES_MAX] as $key => $max) {
            $text = $cell($key);
            $values[$key] = $text === '' ? null : $text;
            if ($text === '' && in_array($key, $required, true)) {
                $issues[] = ['code' => 'required', 'column' => $key];
            } elseif (mb_strlen($text) > $max) {
                $issues[] = ['code' => 'too_long', 'column' => $key, 'max' => $max, 'length' => mb_strlen($text)];
            }
        }

        $values['value'] = $this->price($cell('value'), in_array('value', $required, true), $issues);
        $values['purchase_date'] = $this->date('purchase_date', $cell('purchase_date'), $dateFormat, in_array('purchase_date', $required, true), $issues);
        $warrantyRequired = in_array('warranty_end', $required, true) && ! $lifetime;
        $values['warranty_end'] = $this->date('warranty_end', $cell('warranty_end'), $dateFormat, $warrantyRequired, $issues);

        return ['line' => $line, 'cells' => $cells, 'values' => $values, 'issues' => $issues];
    }

    /**
     * Matches a typed name to a master data id by English or Thai name; records the issue when it fails.
     *
     * @param  list<array<string, mixed>>  $issues
     */
    private function matchName(string $column, string $typed, string $list, bool $required, array &$issues): ?int
    {
        if ($typed === '') {
            if ($required) {
                $issues[] = ['code' => 'required', 'column' => $column];
            }

            return null;
        }

        $needle = $this->normalize($typed);
        foreach ($this->master[$list] as $item) {
            if ($this->normalize($item['name']) === $needle || (isset($item['name_th']) && $this->normalize($item['name_th']) === $needle)) {
                return $item['id'];
            }
        }

        $issues[] = $this->notFound($column, $typed, $this->master[$list]);

        return null;
    }

    /**
     * A model matches by name, or by the dropdown form "name (brand)"; it must sit under the typed brand.
     *
     * @param  list<array<string, mixed>>  $issues
     */
    private function matchModel(string $typed, string $brandTyped, ?int $brandId, bool $required, array &$issues): ?int
    {
        if ($typed === '') {
            if ($required) {
                $issues[] = ['code' => 'required', 'column' => 'model'];
            }

            return null;
        }

        $needle = $this->normalize($typed);
        $brandNames = array_column($this->master['brands'], 'name', 'id');
        $found = [];
        foreach ($this->master['models'] as $model) {
            $withBrand = $this->normalize($model['name'].' ('.($brandNames[$model['brand_id']] ?? '').')');
            if ($this->normalize($model['name']) === $needle || $withBrand === $needle) {
                $found[] = $model;
            }
        }

        if ($found === []) {
            $pool = $brandId === null ? $this->master['models'] : array_values(array_filter($this->master['models'], fn (array $m) => $m['brand_id'] === $brandId));
            $issues[] = $this->notFound('model', $typed, $pool);

            return null;
        }

        if ($brandId === null) {
            return $found[0]['id'];
        }

        foreach ($found as $model) {
            if ($model['brand_id'] === $brandId) {
                return $model['id'];
            }
        }

        $inBrand = array_values(array_filter($this->master['models'], fn (array $m) => $m['brand_id'] === $brandId));
        $issue = ['code' => 'model_not_in_brand', 'column' => 'model', 'value' => $typed, 'brand' => $brandTyped];
        $closest = $this->didYouMean($typed, $inBrand);
        if ($closest !== null) {
            $issue['closest'] = $closest['id'];
            $issue['closest_name'] = $closest['name'];
        }
        $issues[] = $issue;

        return null;
    }

    /**
     * @param  list<array<string, mixed>>  $pool
     * @return array<string, mixed>
     */
    private function notFound(string $column, string $typed, array $pool): array
    {
        $issue = ['code' => 'not_found', 'column' => $column, 'value' => $typed];
        $closest = $this->didYouMean($typed, $pool);
        if ($closest !== null) {
            $issue['closest'] = $closest['id'];
            $issue['closest_name'] = $closest['name'];
        }

        return $issue;
    }

    /**
     * The item whose name (English or Thai) is closest to the typed text, or null when none is close enough.
     *
     * @param  list<array<string, mixed>>  $pool
     * @return array<string, mixed>|null
     */
    private function didYouMean(string $typed, array $pool): ?array
    {
        $best = null;
        $bestScore = 0.0;
        $needle = $this->normalize($typed);

        foreach ($pool as $item) {
            foreach ([$item['name'] ?? '', $item['name_th'] ?? ''] as $candidate) {
                if ($candidate === '') {
                    continue;
                }
                similar_text($needle, $this->normalize($candidate), $percent);
                if ($percent > $bestScore) {
                    $bestScore = $percent;
                    $best = $item;
                }
            }
        }

        return $bestScore >= self::SUGGEST_MIN_SIMILARITY ? $best : null;
    }

    private function normalize(string $text): string
    {
        return mb_strtolower(trim((string) preg_replace('/\s+/u', ' ', $text)));
    }

    /** @param  list<array<string, mixed>>  $issues */
    private function yesNo(string $text, array &$issues): bool
    {
        if ($text === '') {
            return false;
        }
        if (in_array(mb_strtolower($text), self::YES_WORDS, true)) {
            return true;
        }
        $issues[] = ['code' => 'not_yes_no', 'column' => 'warranty_lifetime', 'value' => $text];

        return false;
    }

    /** @param  list<array<string, mixed>>  $issues */
    private function price(string $text, bool $required, array &$issues): ?string
    {
        if ($text === '') {
            if ($required) {
                $issues[] = ['code' => 'required', 'column' => 'value'];
            }

            return null;
        }

        $plain = str_replace(',', '', $text);
        if (! preg_match('/^(\d{1,13})(?:\.(\d{1,2}))?$/', $plain, $m)) {
            $issues[] = ['code' => 'not_a_number', 'column' => 'value', 'value' => $text];

            return null;
        }

        return $m[1].'.'.str_pad($m[2] ?? '', 2, '0');
    }

    /** @param  list<array<string, mixed>>  $issues */
    private function date(string $column, string $text, string $format, bool $required, array &$issues): ?string
    {
        if ($text === '') {
            if ($required) {
                $issues[] = ['code' => 'required', 'column' => $column];
            }

            return null;
        }

        $parts = $this->dateParts($text, $format);
        if ($parts === null) {
            $issues[] = ['code' => 'bad_date', 'column' => $column, 'value' => $text];

            return null;
        }
        [$year, $month, $day] = $parts;
        if ($year > 2400) {
            $year -= 543;
        }
        if (! checkdate($month, $day, $year)) {
            $issues[] = ['code' => 'bad_date', 'column' => $column, 'value' => $text];

            return null;
        }

        return sprintf('%04d-%02d-%02d', $year, $month, $day);
    }

    /** @return array{int,int,int}|null year, month, day */
    private function dateParts(string $text, string $format): ?array
    {
        if (preg_match('/^(\d{4})-(\d{1,2})-(\d{1,2})$/', $text, $m)) {
            return [(int) $m[1], (int) $m[2], (int) $m[3]];
        }
        if (str_starts_with($format, 'ymd_') && preg_match('/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/', $text, $m)) {
            return [(int) $m[1], (int) $m[2], (int) $m[3]];
        }
        if (! str_starts_with($format, 'ymd_') && preg_match('/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/', $text, $m)) {
            return [(int) $m[3], (int) $m[2], (int) $m[1]];
        }

        return null;
    }

    /**
     * Adds duplicate-in-file and already-in-system issues for serials and asset codes (one query each).
     *
     * @param  list<array<string, mixed>>  $rows
     * @return list<array<string, mixed>>
     */
    private function withClashes(array $rows): array
    {
        $takenSerials = $this->heldSerials($rows);
        $takenCodes = $this->usedCodes($rows);
        $firstSerial = [];
        $firstCode = [];

        foreach ($rows as $i => $row) {
            $serial = $this->normalize((string) ($row['values']['serial'] ?? ''));
            if ($serial !== '') {
                if (isset($firstSerial[$serial])) {
                    $rows[$i]['issues'][] = ['code' => 'dup_in_file', 'column' => 'serial', 'line' => $firstSerial[$serial]];
                } else {
                    $firstSerial[$serial] = $row['line'];
                    if (isset($takenSerials[$serial])) {
                        $rows[$i]['issues'][] = ['code' => 'serial_taken', 'column' => 'serial', 'asset_code' => $takenSerials[$serial]];
                    }
                }
            }

            $code = $this->normalize((string) ($row['values']['asset_code'] ?? ''));
            if ($code !== '') {
                if (isset($firstCode[$code])) {
                    $rows[$i]['issues'][] = ['code' => 'dup_in_file', 'column' => 'asset_code', 'line' => $firstCode[$code]];
                } else {
                    $firstCode[$code] = $row['line'];
                    if (isset($takenCodes[$code])) {
                        $rows[$i]['issues'][] = ['code' => 'code_taken', 'column' => 'asset_code'];
                    }
                }
            }
        }

        return $rows;
    }

    /**
     * @param  list<array<string, mixed>>  $rows
     * @return array<string, string> lowercase serial => asset code of an asset not written off
     */
    private function heldSerials(array $rows): array
    {
        $serials = array_values(array_unique(array_filter(array_map(fn (array $r) => $this->normalize((string) ($r['values']['serial'] ?? '')), $rows))));
        if ($serials === []) {
            return [];
        }

        $found = [];
        Asset::query()
            ->whereIn(DB::raw('LOWER(TRIM(serial))'), $serials)
            ->where('status', '!=', AssetStatus::Writeoff->value)
            ->orderBy('id')
            ->get(['serial', 'asset_code'])
            ->each(function (Asset $asset) use (&$found): void {
                $found[$this->normalize((string) $asset->serial)] ??= $asset->asset_code;
            });

        return $found;
    }

    /**
     * @param  list<array<string, mixed>>  $rows
     * @return array<string, true> lowercase asset codes that already exist
     */
    private function usedCodes(array $rows): array
    {
        $codes = array_values(array_unique(array_filter(array_map(fn (array $r) => $this->normalize((string) ($r['values']['asset_code'] ?? '')), $rows))));
        if ($codes === []) {
            return [];
        }

        $found = [];
        foreach (Asset::query()->whereIn(DB::raw('LOWER(TRIM(asset_code))'), $codes)->pluck('asset_code') as $code) {
            $found[$this->normalize((string) $code)] = true;
        }

        return $found;
    }
}
