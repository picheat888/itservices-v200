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
 * "ภาพรวมของทรัพย์สิน" (Report Center → Assets): where every asset is and what state it is in,
 * over the register of every asset on record (the old "ทะเบียนทรัพย์สิน", folded in here).
 *
 * Above the list it draws, in this order:
 * - the tiles: all, in use, ready, pending return — each split by source (ซื้อ / เช่า);
 * - by department: only assets an employee holds (in use, waiting to be accepted, waiting to come
 *   back), one row per department of the holder, people with no department in one row apart;
 * - the status donut, and the categories as on the /assets overview card (ready / in use /
 *   written off per category, with the category's icon);
 * - three cards for what no employee holds: ready stock by warehouse and shared use by location
 *   (each: how many in each place, then the bought / rented share of each), and the written-off
 *   assets themselves (no write-off date is recorded, so none is shown).
 *
 * Every filter narrows the whole page. The file export carries the list, then one sheet each for
 * departments, warehouses, locations and written-off assets.
 */
class AssetOverviewReport extends TabularReport
{
    use AssetColumns;

    private const SOURCE_KEYS = ['purchased' => 'asset_purchase', 'rented' => 'asset_lease'];

    private const SOURCE_TH = ['purchased' => 'ซื้อ', 'rented' => 'เช่า / เช่าใช้'];

    /**
     * Short source names and colours for the tiles' footers and the source splits — the soft
     * shades (chart-tones.ts soft-*), as on the Ticket & SLA overview.
     */
    private const SOURCE_CHART = [
        // Orange, not blue or violet: blue is ใช้งานอยู่ and violet is รอรับคืน in the Settings colours,
        // and both sit in the same tiles as these footers.
        'purchased' => ['label_key' => 'rep_src_purchased', 'tone' => 'soft-orange'],
        'rented' => ['label_key' => 'rep_src_rented', 'tone' => 'soft-pink'],
    ];

    /**
     * The charts' status order and colours (tabular-charts.tsx draws each tone): in use first,
     * written off last — each status in the colour chosen in Settings → Assets (the same as its
     * badge everywhere), softened for the report (app.css).
     */
    private const CHART_TONES = [
        'deployed' => 'asset-deployed', 'common' => 'asset-common', 'ready' => 'asset-ready',
        'pending_acceptance' => 'asset-pending-acceptance', 'pending_return' => 'asset-pending-return', 'writeoff' => 'asset-writeoff',
    ];

    /** The statuses an employee holds an asset in — the department card's series. */
    private const HELD_STATUSES = ['deployed', 'pending_acceptance', 'pending_return'];

    /**
     * The category card's three groups, as on the /assets overview card ("ทรัพย์สินทั้งหมดในระบบ"):
     * in use counts every status the asset is out of the pool in.
     */
    private const CATEGORY_BUCKETS = [
        'ready' => ['label_key' => 'asset_bucket_ready', 'tone' => 'asset-ready', 'statuses' => ['ready']],
        'used' => ['label_key' => 'asset_bucket_used', 'tone' => 'asset-deployed', 'statuses' => ['deployed', 'common', 'pending_acceptance', 'pending_return']],
        'writeoff' => ['label_key' => 'asset_writeoff', 'tone' => 'asset-writeoff', 'statuses' => ['writeoff']],
    ];

    private const NO_DEPARTMENT = ['name' => 'No department', 'name_th' => 'ไม่ระบุแผนก'];

    private const NO_CATEGORY = ['name' => 'No category', 'name_th' => 'ไม่ระบุหมวดหมู่'];

    private const NO_WAREHOUSE = ['name' => 'No warehouse', 'name_th' => 'ไม่ระบุคลัง'];

    private const NO_LOCATION = ['name' => 'No location', 'name_th' => 'ไม่ระบุสถานที่'];

    public function key(): string
    {
        return 'assets.overview';
    }

    public function title(): string
    {
        return 'ภาพรวมของทรัพย์สิน';
    }

    public function filters(): array
    {
        return [
            ReportFilter::select('status', Options::fromLabels(self::STATUS_KEYS)),
            ReportFilter::select('source', Options::fromLabels(self::SOURCE_KEYS)),
            // "หมวดหมู่" here, as asset categories are called in Master Data; the shared label says "หมวด".
            ReportFilter::select('category_id', Options::categories())->labelKey('rep_fl_asset_category'),
            ReportFilter::select('department_id', Options::departments()),
            ReportFilter::search(),
        ];
    }

    /**
     * Every asset the filters keep, bare — no eager loads, no order — for the list and for every
     * count above it, so the tiles, the cards and the list always agree. Columns are qualified:
     * the counts join employees, departments, categories, warehouses and locations onto it.
     *
     * @param  array<string, mixed>  $filters
     */
    private function filtered(array $filters): Builder
    {
        return Asset::query()
            ->when($filters['status'], fn (Builder $q, string $status) => $q->where('assets.status', $status))
            ->when($filters['source'], fn (Builder $q, string $source) => $q->where('assets.source', $source))
            ->when($filters['category_id'], fn (Builder $q, $id) => $q->where('assets.category_id', (int) $id))
            ->when($filters['department_id'], fn (Builder $q, $id) => $q->whereHas('ownerEmployee', fn (Builder $e) => $e->where('department_id', (int) $id)))
            ->when($filters['search'], fn (Builder $q, string $search) => $q->where(function (Builder $w) use ($search) {
                $like = "%{$search}%";
                $w->where('assets.asset_code', 'like', $like)
                    ->orWhere('assets.tag', 'like', $like)
                    ->orWhere('assets.serial', 'like', $like)
                    ->orWhereHas('model', fn (Builder $m) => $m->where('name', 'like', $like))
                    // Owner is a shared label on the asset, or the holding employee's code.
                    ->orWhere('assets.owner', 'like', $like)
                    ->orWhereHas('ownerEmployee', fn (Builder $e) => $e->where('code', 'like', $like)->orWhere('first_name', 'like', $like)->orWhere('last_name', 'like', $like));
            }));
    }

    public function query(User $viewer, array $filters): Builder
    {
        return $this->filtered($filters)
            ->with([
                'category:id,name,name_th', 'brand:id,name', 'model:id,name', 'ownerEmployee.department:id,name,name_th',
                'location:id,name', 'warehouse:id,name', 'contract:id,end_date,value',
            ])
            ->orderBy('asset_code');
    }

    public function columns(): array
    {
        return [
            ReportColumn::text('asset_code', 'รหัสทรัพย์สิน', fn (Asset $a) => $a->asset_code)->linkTo('/assets', fn (Asset $a) => $a->id),
            ReportColumn::text('tag', 'Tag', fn (Asset $a) => $a->tag),
            ReportColumn::localized('category', 'หมวดหมู่', fn (Asset $a) => $a->category ? ['name' => $a->category->name, 'name_th' => $a->category->name_th] : null)
                ->labelKey('rep_c_asset_category'),
            ReportColumn::text('brand', 'ยี่ห้อ', fn (Asset $a) => $a->brand?->name),
            ReportColumn::text('model', 'รุ่น', fn (Asset $a) => $a->model?->name),
            ReportColumn::text('serial', 'Serial', fn (Asset $a) => $a->serial),
            ReportColumn::enum('status', 'สถานะ', fn (Asset $a) => $a->status, self::STATUS_KEYS, self::STATUS_TH),
            ReportColumn::enum('source', 'ที่มา', fn (Asset $a) => $a->source, self::SOURCE_KEYS, self::SOURCE_TH),
            ReportColumn::text('holder', 'ผู้ถือ', fn (Asset $a) => $this->resolveHolder($a)),
            ReportColumn::localized('department', 'แผนก', fn (Asset $a) => $this->resolveDepartment($a)),
            ReportColumn::text('warehouse', 'คลัง', fn (Asset $a) => $a->warehouse?->name),
            ReportColumn::text('location', 'สถานที่', fn (Asset $a) => $a->location?->name),
            // Rented assets don't store their own value (fee lives on the linked contract —
            // AssetResource::toArray follows the same rule); purchased assets carry it directly.
            ReportColumn::money('value', 'มูลค่า', fn (Asset $a) => $a->source === AssetSource::Rented ? $a->contract?->value : $a->value),
            ReportColumn::date('purchase_date', 'วันที่ซื้อ', fn (Asset $a) => $a->purchase_date),
            ReportColumn::date('cover_end', 'ประกัน/สัญญาถึง', fn (Asset $a) => $a->coverEndsOn()),
        ];
    }

    public function hasCharts(): bool
    {
        return true;
    }

    /**
     * How many assets sit in each status from each source — the tiles and the donut read it.
     *
     * @param  array<string, mixed>  $filters
     * @return Collection<int, array{status: string, source: string, count: int}>
     */
    private function statusSourceCounts(array $filters): Collection
    {
        return $this->filtered($filters)
            // Aliased off the enum-cast attribute names, so they read back as plain strings.
            ->selectRaw('assets.status as status_value, assets.source as source_value, COUNT(*) as total_count')
            ->groupBy('assets.status', 'assets.source')
            ->get()
            ->map(fn (Asset $a) => [
                'status' => (string) $a->getAttribute('status_value'),
                'source' => (string) $a->getAttribute('source_value'),
                'count' => (int) $a->getAttribute('total_count'),
            ]);
    }

    /** SQL counts of each source, as src_purchased / src_rented. Source values are enum constants, never reader input. */
    private static function perSourceSql(): string
    {
        return implode(', ', array_map(
            fn (string $source) => "SUM(CASE WHEN assets.source = '{$source}' THEN 1 ELSE 0 END) as src_{$source}",
            array_keys(self::SOURCE_KEYS),
        ));
    }

    /**
     * One line per department of the holding employee — assets nobody holds are left out — with
     * the count in each status and from each source. Largest first; people with no department in
     * one line with no department id.
     *
     * @param  array<string, mixed>  $filters
     * @return Collection<int, Asset>
     */
    private function departmentLines(array $filters): Collection
    {
        $perStatus = implode(', ', array_map(
            fn (string $status) => "SUM(CASE WHEN assets.status = '{$status}' THEN 1 ELSE 0 END) as st_{$status}",
            array_keys(self::CHART_TONES),
        ));

        return $this->filtered($filters)
            ->join('employees', 'employees.id', '=', 'assets.owner_employee_id')
            ->leftJoin('departments', 'departments.id', '=', 'employees.department_id')
            ->selectRaw('departments.id as department_id, departments.name as department_name, departments.name_th as department_name_th, COUNT(*) as total_count, '.$perStatus.', '.self::perSourceSql())
            // MariaDB has no functional-dependency check: every selected department column is grouped.
            ->groupBy('departments.id', 'departments.name', 'departments.name_th')
            ->orderByDesc('total_count')
            ->orderBy('departments.name')
            ->get();
    }

    /**
     * Assets in one status, one line per warehouse or location they sit at, with how many were
     * bought and how many rented. Largest first; those with none recorded in one line with no id.
     *
     * @param  array<string, mixed>  $filters
     * @return Collection<int, Asset>
     */
    private function placeLines(array $filters, string $status, string $table, string $foreignKey): Collection
    {
        return $this->filtered($filters)
            ->where('assets.status', $status)
            ->leftJoin($table, "{$table}.id", '=', "assets.{$foreignKey}")
            ->selectRaw("{$table}.id as place_id, {$table}.name as place_name, COUNT(*) as total_count, ".self::perSourceSql())
            ->groupBy("{$table}.id", "{$table}.name")
            ->orderByDesc('total_count')
            ->orderBy("{$table}.name")
            ->get();
    }

    /**
     * The written-off assets themselves, by code.
     *
     * @param  array<string, mixed>  $filters
     * @return Collection<int, Asset>
     */
    private function writtenOff(array $filters): Collection
    {
        return $this->filtered($filters)
            ->where('assets.status', 'writeoff')
            ->with(['category:id,name,name_th', 'model:id,name', 'warehouse:id,name'])
            ->orderBy('asset_code')
            ->get();
    }

    /**
     * @param  array<string, mixed>  $filters
     * @return list<array<string, mixed>>
     */
    public function charts(Builder $query, array $filters): array
    {
        $counts = $this->statusSourceCounts($filters);
        $statuses = array_keys(self::CHART_TONES);
        $totals = array_combine($statuses, array_map(
            fn (string $status) => (int) $counts->where('status', $status)->sum('count'),
            $statuses,
        ));
        $all = array_sum($totals);
        $legend = array_map(fn (string $status) => [
            'key' => $status,
            'label_key' => self::STATUS_KEYS[$status],
            'tone' => self::CHART_TONES[$status],
        ], $statuses);

        return [
            $this->departmentChart($filters),
            [
                'type' => 'donut',
                'key' => 'status',
                'title_key' => 'rep_chart_status',
                // "In use" is what the asset is for: someone's, or shared.
                'center' => [
                    'value' => $all === 0 ? null : (int) round(($totals['deployed'] + $totals['common']) / $all * 100),
                    'label_key' => 'rep_chart_in_use',
                ],
                'total' => $all,
                'segments' => array_map(fn (array $item) => [...$item, 'value' => $totals[$item['key']]], $legend),
            ],
            $this->categoryChart($filters),
            $this->placesChart($filters, 'warehouse', 'ready', 'warehouses', 'warehouse_id', self::NO_WAREHOUSE, [
                'title_key' => 'rep_chart_in_store', 'subtitle_key' => 'rep_chart_in_store_status',
                'split_title_key' => 'rep_chart_store_source', 'count_key' => 'rep_chart_stores_n',
            ]),
            $this->placesChart($filters, 'location', 'common', 'locations', 'location_id', self::NO_LOCATION, [
                'title_key' => 'rep_chart_in_common', 'subtitle_key' => null,
                'split_title_key' => 'rep_chart_common_source', 'count_key' => 'rep_chart_locations_n',
            ]),
            $this->writeoffChart($filters),
        ];
    }

    /**
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    private function departmentChart(array $filters): array
    {
        $held = array_values(array_filter(
            array_map(fn (string $status) => ['key' => $status, 'label_key' => self::STATUS_KEYS[$status], 'tone' => self::CHART_TONES[$status]], array_keys(self::CHART_TONES)),
            fn (array $series) => in_array($series['key'], self::HELD_STATUSES, true),
        ));

        return [
            'type' => 'stacks',
            'key' => 'department',
            'title_key' => 'rep_chart_by_department',
            // Two ways to split each department's bar; the page switches between them.
            'views' => [
                ['key' => 'status', 'label_key' => 'rep_chart_view_status', 'series' => $held],
                ['key' => 'source', 'label_key' => 'rep_chart_view_source', 'series' => $this->sourceSeries()],
            ],
            'rows' => $this->departmentLines($filters)->map(fn (Asset $a) => [
                'label' => $a->getAttribute('department_id') === null
                    ? self::NO_DEPARTMENT
                    : ['name' => $a->getAttribute('department_name'), 'name_th' => $a->getAttribute('department_name_th')],
                // Not a department: the page lists it last, apart, so it does not set the scale.
                'apart' => $a->getAttribute('department_id') === null,
                // Status and source keys never collide, so one map serves both views.
                'values' => [
                    ...array_combine(array_keys(self::CHART_TONES), array_map(fn (string $s) => (int) $a->getAttribute("st_{$s}"), array_keys(self::CHART_TONES))),
                    ...$this->sourceValues($a),
                ],
                'total' => (int) $a->getAttribute('total_count'),
            ])->values()->all(),
        ];
    }

    /**
     * The categories as the /assets overview card draws them: each with its icon, its count in
     * each of the three groups and its total, largest first.
     *
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    private function categoryChart(array $filters): array
    {
        $perBucket = implode(', ', array_map(
            fn (string $bucket, array $def) => 'SUM(CASE WHEN assets.status IN ('.implode(', ', array_map(fn (string $s) => "'{$s}'", $def['statuses'])).") THEN 1 ELSE 0 END) as b_{$bucket}",
            array_keys(self::CATEGORY_BUCKETS),
            self::CATEGORY_BUCKETS,
        ));

        $lines = $this->filtered($filters)
            ->leftJoin('categories', 'categories.id', '=', 'assets.category_id')
            ->selectRaw('categories.id as category_id, categories.name as category_name, categories.name_th as category_name_th, categories.icon as category_icon, COUNT(*) as total_count, '.$perBucket)
            ->groupBy('categories.id', 'categories.name', 'categories.name_th', 'categories.icon')
            ->orderByDesc('total_count')
            ->orderBy('categories.name')
            ->get();

        return [
            'type' => 'buckets',
            'key' => 'category',
            'title_key' => 'rep_chart_by_category',
            'series' => array_map(
                fn (string $bucket, array $def) => ['key' => $bucket, 'label_key' => $def['label_key'], 'tone' => $def['tone']],
                array_keys(self::CATEGORY_BUCKETS),
                self::CATEGORY_BUCKETS,
            ),
            'rows' => $lines->map(fn (Asset $a) => [
                'label' => $a->getAttribute('category_id') === null
                    ? self::NO_CATEGORY
                    : ['name' => $a->getAttribute('category_name'), 'name_th' => $a->getAttribute('category_name_th')],
                // A Lucide icon name from Master Data, drawn beside the name as on /assets.
                'icon' => $a->getAttribute('category_icon'),
                'values' => array_combine(
                    array_keys(self::CATEGORY_BUCKETS),
                    array_map(fn (string $bucket) => (int) $a->getAttribute("b_{$bucket}"), array_keys(self::CATEGORY_BUCKETS)),
                ),
                'total' => (int) $a->getAttribute('total_count'),
            ])->values()->all(),
        ];
    }

    /**
     * Assets in one status by where they sit, as a 'places' card — ready stock by warehouse, shared
     * use by location: how many sit in each place, one bar each in the ready colour (both cards the
     * same green), so the fullest and emptiest read at a glance — then, under a ruled heading in the
     * same card, each place's bought / rented share.
     *
     * @param  array<string, mixed>  $filters
     * @param  array{name: string, name_th: string}  $none
     * @param  array{title_key: string, subtitle_key: ?string, split_title_key: string, count_key: string}  $words
     * @return array<string, mixed>
     */
    private function placesChart(array $filters, string $key, string $status, string $table, string $foreignKey, array $none, array $words): array
    {
        $lines = $this->placeLines($filters, $status, $table, $foreignKey);

        return [
            'type' => 'places',
            'key' => $key,
            ...$words,
            'tone' => self::CHART_TONES['ready'],
            'total' => (int) $lines->sum(fn (Asset $a) => (int) $a->getAttribute('total_count')),
            // Each place's ring says how much of it is rented — the part a contract ends.
            'center_key' => 'rented',
            'series' => $this->sourceSeries(),
            'rows' => $lines->map(fn (Asset $a) => [
                'label' => $a->getAttribute('place_id') === null ? $none : ['name' => $a->getAttribute('place_name'), 'name_th' => null],
                'apart' => $a->getAttribute('place_id') === null,
                'values' => $this->sourceValues($a),
                'total' => (int) $a->getAttribute('total_count'),
            ])->values()->all(),
        ];
    }

    /**
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    private function writeoffChart(array $filters): array
    {
        $assets = $this->writtenOff($filters);

        return [
            'type' => 'list',
            'key' => 'writeoff',
            'title_key' => 'rep_chart_writeoff',
            'total' => $assets->count(),
            'rows' => $assets->map(fn (Asset $a) => [
                'id' => $a->id,
                'code' => $a->asset_code,
                'label' => $a->category ? ['name' => $a->category->name, 'name_th' => $a->category->name_th] : null,
                'model' => $a->model?->name,
                'place' => $a->warehouse?->name,
                'reason' => $a->last_reason,
            ])->values()->all(),
        ];
    }

    /**
     * @return list<array{key: string, label_key: string, tone: string}>
     */
    private function sourceSeries(): array
    {
        return array_map(
            fn (string $source) => ['key' => $source, ...self::SOURCE_CHART[$source]],
            array_keys(self::SOURCE_CHART),
        );
    }

    /**
     * A grouped line's src_* counts, by source key.
     *
     * @return array<string, int>
     */
    private function sourceValues(Asset $line): array
    {
        return array_combine(
            array_keys(self::SOURCE_KEYS),
            array_map(fn (string $s) => (int) $line->getAttribute("src_{$s}"), array_keys(self::SOURCE_KEYS)),
        );
    }

    public function summary(Builder $query, array $filters): array
    {
        $counts = $this->statusSourceCounts($filters);
        $count = fn (array $statuses, ?string $source = null) => (int) $counts
            ->filter(fn (array $c) => ($statuses === [] || in_array($c['status'], $statuses, true)) && ($source === null || $c['source'] === $source))
            ->sum('count');
        // How many of each status were bought and how many rented, for each tile's footer.
        $split = fn (array $statuses) => array_map(fn (array $series) => [...$series, 'value' => $count($statuses, $series['key'])], $this->sourceSeries());

        // Each status tile in its donut colour, with its share of the whole as a badge and meter.
        $all = $count([]);

        return [
            ReportSummary::make('total', 'ทรัพย์สินทั้งหมด', $all)->withSplit($split([])),
            ReportSummary::make('in_use', 'ใช้งาน (รวมส่วนกลาง)', $count(['deployed', 'common']), 'asset-deployed')
                ->withSplit($split(['deployed', 'common']))->withShareOf($all),
            ReportSummary::make('ready', 'พร้อมส่งมอบ', $count(['ready']), 'asset-ready')->withSplit($split(['ready']))->withShareOf($all),
            ReportSummary::make('pending_return', 'รอรับคืน', $count(['pending_return']), 'asset-pending-return')
                // Machines still to come back (mostly from leavers) are work IT has to chase — amber frame.
                ->withAttention('amber')
                ->withSplit($split(['pending_return']))->withShareOf($all),
        ];
    }

    /**
     * The cards above the list, one sheet each: departments, ready stock by warehouse, shared use
     * by location, and the written-off assets.
     *
     * @param  array<string, mixed>  $filters
     * @return list<array{title: string, headings: list<string>, rows: list<list<string|int|float|null>>}>
     */
    public function exportSections(User $viewer, array $filters): array
    {
        $sourceHeadings = ['ซื้อ', 'เช่า'];
        $sources = fn (Asset $a) => array_values($this->sourceValues($a));
        $place = fn (Asset $a, array $none) => $a->getAttribute('place_id') === null ? $none['name_th'] : $a->getAttribute('place_name');

        return [
            [
                'title' => 'ทรัพย์สินแยกตามแผนก',
                'headings' => ['แผนก', 'ทั้งหมด', ...$sourceHeadings, ...array_map(fn (string $s) => self::STATUS_TH[$s], self::HELD_STATUSES)],
                'rows' => $this->departmentLines($filters)->map(fn (Asset $a) => [
                    $a->getAttribute('department_id') === null ? self::NO_DEPARTMENT['name_th'] : ($a->getAttribute('department_name_th') ?: $a->getAttribute('department_name')),
                    (int) $a->getAttribute('total_count'),
                    ...$sources($a),
                    ...array_map(fn (string $s) => (int) $a->getAttribute("st_{$s}"), self::HELD_STATUSES),
                ])->values()->all(),
            ],
            [
                'title' => 'ทรัพย์สินในคลัง (พร้อมใช้งาน)',
                'headings' => ['คลัง', 'ทั้งหมด', ...$sourceHeadings],
                'rows' => $this->placeLines($filters, 'ready', 'warehouses', 'warehouse_id')
                    ->map(fn (Asset $a) => [$place($a, self::NO_WAREHOUSE), (int) $a->getAttribute('total_count'), ...$sources($a)])->values()->all(),
            ],
            [
                'title' => 'ทรัพย์สินในส่วนกลาง',
                'headings' => ['สถานที่', 'ทั้งหมด', ...$sourceHeadings],
                'rows' => $this->placeLines($filters, 'common', 'locations', 'location_id')
                    ->map(fn (Asset $a) => [$place($a, self::NO_LOCATION), (int) $a->getAttribute('total_count'), ...$sources($a)])->values()->all(),
            ],
            [
                'title' => 'ตัดจำหน่าย',
                'headings' => ['รหัสทรัพย์สิน', 'หมวดหมู่', 'รุ่น', 'คลัง', 'เหตุผล'],
                'rows' => $this->writtenOff($filters)->map(fn (Asset $a) => [
                    $a->asset_code,
                    $a->category ? ($a->category->name_th ?: $a->category->name) : null,
                    $a->model?->name,
                    $a->warehouse?->name,
                    $a->last_reason,
                ])->values()->all(),
            ],
        ];
    }
}
