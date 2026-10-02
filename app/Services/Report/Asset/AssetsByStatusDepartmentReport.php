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
 * "ทรัพย์สินตามสถานะและแผนก" (Report Center → Assets): one row per department — the department
 * of the employee holding the asset — with how many sit in each status. Assets nobody holds
 * (ready stock, shared/common use, written off) share one "no department" row. Largest first.
 * On screen it is drawn, as the design does: each department's status mix as a stacked bar with
 * its counts, the statuses as a donut (in use at its centre) and the categories as bars — the
 * department bars say what the table would, so the page shows no table; the export keeps it.
 */
class AssetsByStatusDepartmentReport extends TabularReport
{
    use AssetColumns;

    private const SOURCE_KEYS = ['purchased' => 'asset_purchase', 'rented' => 'asset_lease'];

    /**
     * The charts' status order and colours (tabular-charts.tsx draws each tone): in use first,
     * as the design orders them, written off last in gray.
     */
    private const CHART_TONES = [
        'deployed' => 'green', 'common' => 'blue', 'ready' => 'violet',
        'pending_acceptance' => 'orange', 'pending_return' => 'amber', 'writeoff' => 'gray',
    ];

    /** The category chart's longest list; the rest fold into the table below it. */
    private const CATEGORY_BARS = 8;

    public function key(): string
    {
        return 'assets.by_status_department';
    }

    public function title(): string
    {
        return 'ทรัพย์สินตามสถานะและแผนก';
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

        return [
            ReportColumn::localized('department', 'แผนก', fn (Asset $a) => $a->getAttribute('department_id') === null
                ? ['name' => 'No department', 'name_th' => 'ไม่ระบุแผนก']
                : ['name' => $a->getAttribute('department_name'), 'name_th' => $a->getAttribute('department_name_th')]),
            ReportColumn::number('total_count', 'ทั้งหมด', fn (Asset $a) => (int) $a->getAttribute('total_count')),
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
            ->orderByDesc('total_count')
            ->limit(self::CATEGORY_BARS)
            ->get();

        return [
            [
                'type' => 'stacks',
                'key' => 'department',
                'title_key' => 'rep_chart_by_department',
                'legend' => $legend,
                'rows' => $rows->map(fn (Asset $a) => [
                    'label' => $a->getAttribute('department_id') === null
                        ? ['name' => 'No department', 'name_th' => 'ไม่ระบุแผนก']
                        : ['name' => $a->getAttribute('department_name'), 'name_th' => $a->getAttribute('department_name_th')],
                    'values' => array_combine($statuses, array_map(fn (string $s) => (int) $a->getAttribute("st_{$s}"), $statuses)),
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

    public function summary(Builder $query, array $filters): array
    {
        $rows = (clone $query)->get();
        $sum = fn (string $alias) => (int) $rows->sum(fn (Asset $a) => (int) $a->getAttribute($alias));

        return [
            ReportSummary::make('total', 'ทรัพย์สินทั้งหมด', $sum('total_count')),
            ReportSummary::make('in_use', 'ใช้งานอยู่', $sum('st_deployed') + $sum('st_common'), 'green'),
            ReportSummary::make('ready', 'พร้อมส่งมอบ', $sum('st_ready')),
            ReportSummary::make('pending_return', 'รอรับคืน', $sum('st_pending_return'), 'amber'),
        ];
    }
}
