<?php

namespace App\Services\Report\Asset;

use App\Enums\Asset\AssetSource;
use App\Models\Asset\Asset;
use App\Models\User;
use App\Services\Report\Tabular\Options;
use App\Services\Report\Tabular\ReportColumn;
use App\Services\Report\Tabular\ReportFilter;
use App\Services\Report\Tabular\ReportSummary;
use App\Services\Report\Tabular\TabularReport;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * "การตัดจำหน่ายทรัพย์สิน" (Report Center → Assets): the assets written off within a date range
 * (assets.written_off_at; this year by default), newest first — what, from where, why, and worth
 * how much. The tiles count them (bought / rented) and add up what the bought ones cost; the
 * charts break them down by month and by category, each split by source. The file carries the
 * list, then one sheet per chart.
 */
class AssetWriteoffReport extends TabularReport
{
    private const SOURCE_KEYS = ['purchased' => 'asset_purchase', 'rented' => 'asset_lease'];

    private const SOURCE_TH = ['purchased' => 'ซื้อ', 'rented' => 'เช่า / เช่าใช้'];

    /** The source split's colours — the asset overview's (soft orange bought, soft pink rented). */
    private const SOURCE_SERIES = [
        ['key' => 'purchased', 'label_key' => 'rep_src_purchased', 'tone' => 'soft-orange'],
        ['key' => 'rented', 'label_key' => 'rep_src_rented', 'tone' => 'soft-pink'],
    ];

    /** Thai month abbreviations for the month rows ("ก.ย. 2026"). */
    private const MONTHS_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

    private const NO_CATEGORY = ['name' => 'No category', 'name_th' => 'ไม่ระบุหมวดหมู่'];

    public function key(): string
    {
        return 'assets.writeoffs';
    }

    public function title(): string
    {
        return 'การตัดจำหน่ายทรัพย์สิน';
    }

    public function filters(): array
    {
        return [
            ReportFilter::date('from', today()->startOfYear()->toDateString()),
            ReportFilter::date('to', today()->toDateString()),
            ReportFilter::select('category_id', Options::categories())->labelKey('rep_fl_asset_category'),
            ReportFilter::select('source', Options::fromLabels(self::SOURCE_KEYS)),
            ReportFilter::search(),
        ];
    }

    /**
     * The written-off assets the filters keep, bare — the list adds its eager loads and order.
     *
     * @param  array<string, mixed>  $filters
     */
    private function filtered(array $filters): Builder
    {
        [$from, $to] = $this->dayRange($filters);

        return Asset::query()
            ->where('assets.status', 'writeoff')
            ->whereBetween('assets.written_off_at', [$from, $to])
            ->when($filters['category_id'], fn (Builder $q, $id) => $q->where('assets.category_id', (int) $id))
            ->when($filters['source'], fn (Builder $q, string $source) => $q->where('assets.source', $source))
            ->when($filters['search'], fn (Builder $q, string $search) => $q->where(function (Builder $w) use ($search) {
                $like = "%{$search}%";
                $w->where('assets.asset_code', 'like', $like)
                    ->orWhere('assets.serial', 'like', $like)
                    ->orWhere('assets.last_reason', 'like', $like)
                    ->orWhereHas('model', fn (Builder $m) => $m->where('name', 'like', $like));
            }));
    }

    public function query(User $viewer, array $filters): Builder
    {
        return $this->filtered($filters)
            ->with(['category:id,name,name_th', 'brand:id,name', 'model:id,name', 'warehouse:id,name', 'contract:id,value'])
            ->orderByDesc('assets.written_off_at')
            ->orderBy('assets.asset_code');
    }

    public function columns(): array
    {
        return [
            ReportColumn::dateTime('written_off_at', 'วันที่ตัดจำหน่าย', fn (Asset $a) => $a->written_off_at),
            ReportColumn::text('asset_code', 'รหัสทรัพย์สิน', fn (Asset $a) => $a->asset_code)->linkTo('/assets', fn (Asset $a) => $a->id),
            ReportColumn::localized('category', 'หมวดหมู่', fn (Asset $a) => $a->category ? ['name' => $a->category->name, 'name_th' => $a->category->name_th] : null)
                ->labelKey('rep_c_asset_category'),
            ReportColumn::text('brand', 'ยี่ห้อ', fn (Asset $a) => $a->brand?->name),
            ReportColumn::text('model', 'รุ่น', fn (Asset $a) => $a->model?->name),
            ReportColumn::text('serial', 'Serial', fn (Asset $a) => $a->serial),
            ReportColumn::enum('source', 'ที่มา', fn (Asset $a) => $a->source, self::SOURCE_KEYS, self::SOURCE_TH),
            ReportColumn::text('warehouse', 'คลัง', fn (Asset $a) => $a->warehouse?->name),
            ReportColumn::text('reason', 'เหตุผล', fn (Asset $a) => $a->last_reason),
            ReportColumn::date('purchase_date', 'วันที่ซื้อ', fn (Asset $a) => $a->purchase_date),
            // How long it served: bought to written off, in years.
            ReportColumn::number('age_years', 'อายุใช้งาน (ปี)', fn (Asset $a) => $a->purchase_date === null || $a->written_off_at === null
                ? null
                : round($a->purchase_date->diffInDays($a->written_off_at, true) / 365, 1)),
            // Rented assets carry no value of their own — the contract's, as the asset overview reads it.
            ReportColumn::money('value', 'มูลค่า', fn (Asset $a) => $a->source === AssetSource::Rented ? $a->contract?->value : $a->value),
        ];
    }

    public function hasCharts(): bool
    {
        return true;
    }

    /**
     * The written-off assets as bare rows for the tiles, the charts and the file's sheets.
     *
     * @param  array<string, mixed>  $filters
     * @return Collection<int, Asset>
     */
    private function written(array $filters): Collection
    {
        return $this->filtered($filters)
            ->leftJoin('categories', 'categories.id', '=', 'assets.category_id')
            ->get([
                'assets.id', 'assets.source', 'assets.value', 'assets.written_off_at',
                'categories.id as category_ref', 'categories.name as category_name', 'categories.name_th as category_name_th',
            ]);
    }

    /**
     * Group rows into lines with each source's count, largest-first unless `$keepOrder`.
     *
     * @param  Collection<int, Asset>  $assets
     * @param  callable(Asset): string  $key
     * @param  callable(Asset): array{name: string, name_th: ?string}  $label
     * @return list<array{label: array{name: string, name_th: ?string}, values: array<string, int>, total: int}>
     */
    private static function lines(Collection $assets, callable $key, callable $label, bool $keepOrder = false): array
    {
        $groups = $assets->groupBy($key);
        if ($keepOrder) {
            $groups = $groups->sortKeys();
        }
        $lines = $groups->map(fn (Collection $group) => [
            'label' => $label($group->first()),
            'values' => [
                'purchased' => $group->filter(fn (Asset $a) => $a->source === AssetSource::Purchased)->count(),
                'rented' => $group->filter(fn (Asset $a) => $a->source === AssetSource::Rented)->count(),
            ],
            'total' => $group->count(),
        ])->values();

        return ($keepOrder ? $lines : $lines->sortByDesc('total')->values())->all();
    }

    /** @return array{name: string, name_th: string} "2026-09" as "Sep 2026" / "ก.ย. 2026". */
    private static function monthLabel(Asset $asset): array
    {
        $at = $asset->written_off_at;

        return ['name' => $at->format('M Y'), 'name_th' => self::MONTHS_TH[$at->month - 1].' '.$at->year];
    }

    /** @return array{name: string, name_th: ?string} */
    private static function categoryLabel(Asset $asset): array
    {
        return $asset->getAttribute('category_ref') === null
            ? self::NO_CATEGORY
            : ['name' => (string) $asset->getAttribute('category_name'), 'name_th' => $asset->getAttribute('category_name_th')];
    }

    /**
     * @param  array<string, mixed>  $filters
     * @return list<array<string, mixed>>
     */
    public function charts(Builder $query, array $filters): array
    {
        $assets = $this->written($filters);
        $views = [['key' => 'source', 'label_key' => 'rep_chart_view_source', 'series' => self::SOURCE_SERIES]];

        return [
            [
                'type' => 'stacks',
                'key' => 'month',
                'title_key' => 'rep_chart_wo_by_month',
                'views' => $views,
                // Oldest month first, so the bars read as a timeline.
                'rows' => self::lines($assets, fn (Asset $a) => $a->written_off_at->format('Y-m'), self::monthLabel(...), keepOrder: true),
            ],
            [
                'type' => 'stacks',
                'key' => 'category',
                'title_key' => 'rep_chart_by_category',
                'views' => $views,
                'rows' => self::lines($assets, fn (Asset $a) => (string) $a->getAttribute('category_ref'), self::categoryLabel(...)),
            ],
        ];
    }

    public function summary(Builder $query, array $filters): array
    {
        $assets = $this->written($filters);
        $count = fn (AssetSource $source) => $assets->filter(fn (Asset $a) => $a->source === $source)->count();

        return [
            ReportSummary::make('wo_total', 'ตัดจำหน่าย (เครื่อง)', $assets->count())->withSplit([
                ['key' => 'purchased', 'label_key' => 'rep_src_purchased', 'tone' => 'soft-orange', 'value' => $count(AssetSource::Purchased)],
                ['key' => 'rented', 'label_key' => 'rep_src_rented', 'tone' => 'soft-pink', 'value' => $count(AssetSource::Rented)],
            ]),
            // What the bought ones cost — a rented asset's value is its contract's, not a write-off.
            ReportSummary::make('wo_purchase_value', 'มูลค่าซื้อที่ตัดจำหน่าย', (float) $assets->filter(fn (Asset $a) => $a->source === AssetSource::Purchased)->sum('value'), null, 'money'),
        ];
    }

    /**
     * The two charts as sheets: by month, then by category.
     *
     * @param  array<string, mixed>  $filters
     * @return list<array{title: string, headings: list<string>, rows: list<list<string|int|float|null>>}>
     */
    public function exportSections(User $viewer, array $filters): array
    {
        $assets = $this->written($filters);
        $sheet = fn (array $lines) => array_map(
            fn (array $line) => [$line['label']['name_th'] ?: $line['label']['name'], $line['total'], $line['values']['purchased'], $line['values']['rented']],
            $lines,
        );

        return [
            [
                'title' => 'แยกตามเดือน',
                'headings' => ['เดือน', 'ทั้งหมด', 'ซื้อ', 'เช่า'],
                'rows' => $sheet(self::lines($assets, fn (Asset $a) => $a->written_off_at->format('Y-m'), self::monthLabel(...), keepOrder: true)),
            ],
            [
                'title' => 'แยกตามหมวดหมู่',
                'headings' => ['หมวดหมู่', 'ทั้งหมด', 'ซื้อ', 'เช่า'],
                'rows' => $sheet(self::lines($assets, fn (Asset $a) => (string) $a->getAttribute('category_ref'), self::categoryLabel(...))),
            ],
        ];
    }
}
