<?php

namespace App\Services\Report\Employee;

use App\Models\Asset\Asset;
use App\Models\Employee\Employee;
use App\Models\User;
use App\Services\Report\Asset\AssetColumns;
use App\Services\Report\Tabular\Options;
use App\Services\Report\Tabular\ReportColumn;
use App\Services\Report\Tabular\ReportFilter;
use App\Services\Report\Tabular\ReportSummary;
use App\Services\Report\Tabular\TabularReport;
use Illuminate\Database\Eloquent\Builder;

/**
 * "ทรัพย์สินค้างคืนจากผู้ลาออก" (Report Center → Employees): every asset still in the name of
 * an employee who has resigned, earliest last day first — the collection list for IT.
 *
 * Gated by employees.view, not assets.view: like the Employee detail's Assets tab it only
 * surfaces what people hold (the own-module "peek"), and it shows no asset values.
 */
class LeaverAssetsReport extends TabularReport
{
    use AssetColumns;

    public function key(): string
    {
        return 'employees.leaver_assets';
    }

    public function title(): string
    {
        return 'ทรัพย์สินค้างคืนจากผู้ลาออก';
    }

    public function filters(): array
    {
        return [
            ReportFilter::select('status', Options::fromLabels(self::STATUS_KEYS)),
            ReportFilter::select('department_id', Options::departments()),
            ReportFilter::search(),
        ];
    }

    public function query(User $viewer, array $filters): Builder
    {
        return Asset::query()
            ->with(['category:id,name,name_th', 'brand:id,name', 'model:id,name', 'ownerEmployee.department:id,name,name_th'])
            ->whereHas('ownerEmployee', fn (Builder $e) => $e->where('status', 'resigned'))
            ->when($filters['status'], fn (Builder $q, string $status) => $q->where('status', $status))
            ->when($filters['department_id'], fn (Builder $q, $id) => $q->whereHas('ownerEmployee', fn (Builder $e) => $e->where('department_id', (int) $id)))
            ->when($filters['search'], function (Builder $q, string $search) {
                $like = '%'.$search.'%';
                $q->where(fn (Builder $w) => $w->where('asset_code', 'like', $like)
                    ->orWhere('serial', 'like', $like)
                    ->orWhereHas('ownerEmployee', fn (Builder $e) => $e->where('code', 'like', $like)
                        ->orWhere('first_name', 'like', $like)->orWhere('last_name', 'like', $like)
                        ->orWhere('first_name_th', 'like', $like)->orWhere('last_name_th', 'like', $like)));
            })
            ->orderBy(Employee::query()->select('last_day')->whereColumn('employees.id', 'assets.owner_employee_id'))
            ->orderBy('asset_code');
    }

    public function columns(): array
    {
        return [
            ReportColumn::text('asset_code', 'รหัสทรัพย์สิน', fn (Asset $a) => $a->asset_code)->linkTo('/assets', fn (Asset $a) => $a->id),
            ReportColumn::localized('category', 'หมวด', fn (Asset $a) => $a->category ? ['name' => $a->category->name, 'name_th' => $a->category->name_th] : null),
            ReportColumn::text('brand', 'ยี่ห้อ', fn (Asset $a) => $a->brand?->name),
            ReportColumn::text('model', 'รุ่น', fn (Asset $a) => $a->model?->name),
            ReportColumn::text('serial', 'Serial', fn (Asset $a) => $a->serial),
            ReportColumn::enum('status', 'สถานะ', fn (Asset $a) => $a->status, self::STATUS_KEYS, self::STATUS_TH),
            ReportColumn::text('holder', 'ผู้ถือ', fn (Asset $a) => $this->resolveHolder($a)),
            ReportColumn::localized('department', 'แผนก', fn (Asset $a) => $this->resolveDepartment($a)),
            ReportColumn::date('last_day', 'วันทำงานวันสุดท้าย', fn (Asset $a) => $a->ownerEmployee?->last_day),
            ReportColumn::daysLeft('days_left', 'เหลือ (วัน)', fn (Asset $a) => $a->ownerEmployee?->last_day),
        ];
    }

    public function summary(Builder $query, array $filters): array
    {
        $assets = (clone $query)->setEagerLoads([])->with('ownerEmployee:id,last_day')->get(['id', 'owner_employee_id', 'status']);

        return [
            ReportSummary::make('total', 'ทั้งหมด', $assets->count()),
            ReportSummary::make('leavers', 'ผู้ลาออก', $assets->pluck('owner_employee_id')->unique()->count()),
            ReportSummary::make('past_last_day', 'เลยวันสุดท้ายแล้ว', $assets->filter(fn (Asset $a) => $a->ownerEmployee?->last_day?->lt(today()))->count(), 'red'),
            ReportSummary::make('pending_return', 'รอรับคืน', $assets->filter(fn (Asset $a) => $a->status?->value === 'pending_return')->count(), 'amber'),
        ];
    }
}
