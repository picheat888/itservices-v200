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
 */
class AssetsByStatusDepartmentReport extends TabularReport
{
    use AssetColumns;

    private const SOURCE_KEYS = ['purchased' => 'asset_purchase', 'rented' => 'asset_lease'];

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
            ->when($filters['category_id'], fn (Builder $q, $id) => $q->where('assets.category_id', (int) $id))
            ->when($filters['source'], fn (Builder $q, string $source) => $q->where('assets.source', $source))
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
