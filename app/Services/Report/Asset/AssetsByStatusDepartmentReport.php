<?php

namespace App\Services\Report\Asset;

use App\Models\Asset\Asset;
use App\Models\User;
use App\Services\Report\Tabular\Options;
use App\Services\Report\Tabular\ReportColumn;
use App\Services\Report\Tabular\ReportFilter;
use App\Services\Report\Tabular\ReportSummary;
use App\Services\Report\Tabular\TabularReport;
use Illuminate\Database\Eloquent\Builder;

/**
 * "ทรัพย์สินตามสถานะ และแผนก" (Report Center → Assets): one row per department — the department
 * of the employee holding the asset — with how many sit in each status. Assets nobody holds
 * (ready stock, shared/common use, written off) share one "no department" row. Largest first.
 * On screen it is drawn, as the design does: each department's status mix as a stacked bar with
 * its counts, the statuses as a donut (in use at its centre) and the categories as bars — the
 * department bars say what the table would, so the page shows no table; the export keeps it.
 * Bought or rented is never left to the filter alone: every tile says how many of each, and the
 * department bars switch from status to source (ซื้อ / เช่า). Assets in no department (in store,
 * shared, written off, or held by someone without one) are one "คลัง · ส่วนกลาง · ไม่ระบุแผนก" row
 * that the chart keeps apart from the departments.
 */
class AssetsByStatusDepartmentReport extends TabularReport
{
    use AssetColumns;

    private const SOURCE_KEYS = ['purchased' => 'asset_purchase', 'rented' => 'asset_lease'];

    /**
     * Short source names and colours for the tiles' footers and the department bars' source view —
     * the soft shades (chart-tones.ts soft-*), as on the Ticket & SLA overview.
     */
    private const SOURCE_CHART = [
        'purchased' => ['label_key' => 'rep_src_purchased', 'tone' => 'soft-blue'],
        // Pink, not violet: violet already means พร้อมส่งมอบ in the same tiles and charts.
        'rented' => ['label_key' => 'rep_src_rented', 'tone' => 'soft-pink'],
    ];

    /** The one row for assets in no department — in store, shared, written off, or held by someone without one. */
    private const UNASSIGNED = ['name' => 'Store · common · no department', 'name_th' => 'คลัง · ส่วนกลาง · ไม่ระบุแผนก'];

    /** Thai export headings of the per-source columns. */
    private const SOURCE_TH = ['purchased' => 'ซื้อ', 'rented' => 'เช่า'];

    /**
     * The charts' status order and colours (tabular-charts.tsx draws each tone): in use first,
     * as the design orders them, written off last in gray — in the soft shades.
     */
    private const CHART_TONES = [
        'deployed' => 'soft-green', 'common' => 'soft-blue', 'ready' => 'soft-violet',
        'pending_acceptance' => 'soft-orange', 'pending_return' => 'soft-amber', 'writeoff' => 'gray',
    ];

    public function key(): string
    {
        return 'assets.by_status_department';
    }

    public function title(): string
    {
        return 'ทรัพย์สินตามสถานะ และแผนก';
    }

    public function filters(): array
    {
        return [
            ReportFilter::select('category_id', Options::categories()),
            ReportFilter::select('source', Options::fromLabels(self::SOURCE_KEYS)),
        ];
    }

    public function query(User $viewer, array $filters): Builder
    {
        // Status values are enum constants, never reader input, so they are inlined.
        $perStatus = array_map(
            fn (string $status) => "SUM(CASE WHEN assets.status = '{$status}' THEN 1 ELSE 0 END) as st_{$status}",
            array_keys(self::STATUS_KEYS),
        );

        $perSource = array_map(
            fn (string $source) => "SUM(CASE WHEN assets.source = '{$source}' THEN 1 ELSE 0 END) as src_{$source}",
            array_keys(self::SOURCE_KEYS),
        );

        return Asset::query()
            ->leftJoin('employees', 'employees.id', '=', 'assets.owner_employee_id')
            ->leftJoin('departments', 'departments.id', '=', 'employees.department_id')
            ->selectRaw(implode(', ', [
                'MIN(assets.id) as id',
                'departments.id as department_id',
                'departments.name as department_name',
                'departments.name_th as department_name_th',
                'COUNT(*) as total_count',
                ...$perStatus,
                ...$perSource,
            ]))
            ->tap(fn (Builder $q) => $this->filtered($q, $filters))
            // MariaDB has no functional-dependency check: every selected department column is grouped.
            ->groupBy('departments.id', 'departments.name', 'departments.name_th')
            ->orderByDesc('total_count')
            ->orderBy('departments.name');
    }

    public function columns(): array
    {
        $statuses = array_map(
            fn (string $status) => ReportColumn::number("st_{$status}", self::STATUS_TH[$status], fn (Asset $a) => (int) $a->getAttribute("st_{$status}")),
            array_keys(self::STATUS_KEYS),
        );

        $sources = array_map(
            fn (string $source) => ReportColumn::number("src_{$source}", self::SOURCE_TH[$source], fn (Asset $a) => (int) $a->getAttribute("src_{$source}")),
            array_keys(self::SOURCE_KEYS),
        );

        return [
            ReportColumn::localized('department', 'แผนก', fn (Asset $a) => $a->getAttribute('department_id') === null
                ? self::UNASSIGNED
                : ['name' => $a->getAttribute('department_name'), 'name_th' => $a->getAttribute('department_name_th')]),
            ReportColumn::number('total_count', 'ทั้งหมด', fn (Asset $a) => (int) $a->getAttribute('total_count')),
            ...$sources,
            ...$statuses,
        ];
    }

    /** The category and source filters, shared by the table's query and the category chart. */
    private function filtered(Builder $query, array $filters): Builder
    {
        return $query
            ->when($filters['category_id'], fn (Builder $q, $id) => $q->where('assets.category_id', (int) $id))
            ->when($filters['source'], fn (Builder $q, string $source) => $q->where('assets.source', $source));
    }

    public function hasCharts(): bool
    {
        return true;
    }

    public function showsTable(): bool
    {
        return false;
    }

    public function charts(Builder $query, array $filters): array
    {
        $rows = (clone $query)->get();
        $statuses = array_keys(self::CHART_TONES);
        $totals = array_combine($statuses, array_map(
            fn (string $status) => (int) $rows->sum(fn (Asset $a) => (int) $a->getAttribute("st_{$status}")),
            $statuses,
        ));
        $all = array_sum($totals);
        $legend = array_map(fn (string $status) => [
            'key' => $status,
            'label_key' => self::STATUS_KEYS[$status],
            'tone' => self::CHART_TONES[$status],
        ], $statuses);

        $categories = $this->filtered(Asset::query(), $filters)
            ->leftJoin('categories', 'categories.id', '=', 'assets.category_id')
            ->selectRaw('categories.id as category_id, categories.name as category_name, categories.name_th as category_name_th, COUNT(*) as total_count')
            ->groupBy('categories.id', 'categories.name', 'categories.name_th')
            // Every category, largest first — the page shows the top ones and folds the rest into
            // "อื่น ๆ" with a way to open them all, so the bars always add up to the whole.
            ->orderByDesc('total_count')
            ->get();

        return [
            [
                'type' => 'stacks',
                'key' => 'department',
                'title_key' => 'rep_chart_by_department',
                // Two ways to split each department's bar; the page switches between them.
                'views' => [
                    ['key' => 'status', 'label_key' => 'rep_chart_view_status', 'series' => $legend],
                    ['key' => 'source', 'label_key' => 'rep_chart_view_source', 'series' => $this->sourceSeries()],
                ],
                'rows' => $rows->map(fn (Asset $a) => [
                    'label' => $a->getAttribute('department_id') === null
                        ? self::UNASSIGNED
                        : ['name' => $a->getAttribute('department_name'), 'name_th' => $a->getAttribute('department_name_th')],
                    // Not a department: the page lists it last, apart, so it does not set the scale.
                    'apart' => $a->getAttribute('department_id') === null,
                    // Status and source keys never collide, so one map serves both views.
                    'values' => [
                        ...array_combine($statuses, array_map(fn (string $s) => (int) $a->getAttribute("st_{$s}"), $statuses)),
                        ...array_combine(array_keys(self::SOURCE_KEYS), array_map(
                            fn (string $s) => (int) $a->getAttribute("src_{$s}"),
                            array_keys(self::SOURCE_KEYS),
                        )),
                    ],
                    'total' => (int) $a->getAttribute('total_count'),
                ])->values()->all(),
            ],
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
            [
                'type' => 'bars',
                'key' => 'category',
                'title_key' => 'rep_chart_by_category',
                'rows' => $categories->map(fn (Asset $a) => [
                    'label' => $a->getAttribute('category_id') === null
                        ? ['name' => 'No category', 'name_th' => 'ไม่ระบุหมวด']
                        : ['name' => $a->getAttribute('category_name'), 'name_th' => $a->getAttribute('category_name_th')],
                    'value' => (int) $a->getAttribute('total_count'),
                ])->values()->all(),
            ],
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

    public function summary(Builder $query, array $filters): array
    {
        $rows = (clone $query)->get();
        $sum = fn (string $alias) => (int) $rows->sum(fn (Asset $a) => (int) $a->getAttribute($alias));

        // How many of each status were bought and how many rented, for each tile's footer.
        $bySource = $this->filtered(Asset::query(), $filters)
            // Aliased off the enum-cast attribute names, so they read back as plain strings.
            ->selectRaw('assets.status as status_value, assets.source as source_value, COUNT(*) as total_count')
            ->groupBy('assets.status', 'assets.source')
            ->get();
        $split = fn (array $statuses) => array_map(fn (array $series) => [
            'key' => $series['key'],
            'label_key' => $series['label_key'],
            'tone' => $series['tone'],
            'value' => (int) $bySource
                ->filter(fn (Asset $a) => $a->getAttribute('source_value') === $series['key']
                    && ($statuses === [] || in_array($a->getAttribute('status_value'), $statuses, true)))
                ->sum(fn (Asset $a) => (int) $a->getAttribute('total_count')),
        ], $this->sourceSeries());

        // Each status tile in its donut colour, with its share of the whole as a badge and meter.
        $all = $sum('total_count');

        return [
            ReportSummary::make('total', 'ทรัพย์สินทั้งหมด', $all)->withSplit($split([])),
            ReportSummary::make('in_use', 'ใช้งาน (รวมส่วนกลาง)', $sum('st_deployed') + $sum('st_common'), 'soft-green')
                ->withSplit($split(['deployed', 'common']))->withShareOf($all),
            ReportSummary::make('ready', 'พร้อมส่งมอบ', $sum('st_ready'), 'soft-violet')->withSplit($split(['ready']))->withShareOf($all),
            ReportSummary::make('pending_return', 'รอรับคืน', $sum('st_pending_return'), 'soft-amber')
                ->withSplit($split(['pending_return']))->withShareOf($all),
        ];
    }
}
