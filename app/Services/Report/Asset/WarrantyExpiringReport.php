<?php

namespace App\Services\Report\Asset;

use App\Enums\Asset\AssetSource;
use App\Enums\Asset\AssetStatus;
use App\Models\Asset\Asset;
use App\Models\User;
use App\Services\Report\Tabular\Options;
use App\Services\Report\Tabular\ReportColumn;
use App\Services\Report\Tabular\ReportFilter;
use App\Services\Report\Tabular\ReportSummary;
use App\Services\Report\Tabular\TabularReport;
use Illuminate\Database\Eloquent\Builder;

/**
 * "ประกันใกล้หมดอายุ" (Report Center → Assets): purchased assets — never a lifetime
 * warranty, never already written off — whose warranty runs out inside the chosen window,
 * soonest first, so IT knows what to renew or replace next.
 */
class WarrantyExpiringReport extends TabularReport
{
    use AssetColumns;

    public function key(): string
    {
        return 'assets.warranty_expiring';
    }

    public function title(): string
    {
        return 'ประกันใกล้หมดอายุ';
    }

    public function filters(): array
    {
        return [
            ReportFilter::select('within', Options::dayWindows(), 90),
            ReportFilter::select('category_id', Options::categories()),
            ReportFilter::select('department_id', Options::departments()),
        ];
    }

    public function query(User $viewer, array $filters): Builder
    {
        return Asset::query()
            ->with(['category:id,name,name_th', 'model:id,name', 'ownerEmployee.department:id,name,name_th', 'vendor:id,name,name_th'])
            ->where('source', AssetSource::Purchased->value)
            ->where('warranty_lifetime', false)
            ->where('status', '!=', AssetStatus::Writeoff->value)
            ->whereDate('warranty_end', '>=', today())
            ->whereDate('warranty_end', '<=', today()->addDays((int) $filters['within']))
            ->when($filters['category_id'], fn (Builder $q, $id) => $q->where('category_id', (int) $id))
            ->when($filters['department_id'], fn (Builder $q, $id) => $q->whereHas('ownerEmployee', fn (Builder $e) => $e->where('department_id', (int) $id)))
            ->orderBy('warranty_end')
            ->orderBy('id');
    }

    public function columns(): array
    {
        return [
            ReportColumn::text('asset_code', 'รหัสทรัพย์สิน', fn (Asset $a) => $a->asset_code),
            ReportColumn::localized('category', 'หมวด', fn (Asset $a) => $a->category ? ['name' => $a->category->name, 'name_th' => $a->category->name_th] : null),
            ReportColumn::text('model', 'รุ่น', fn (Asset $a) => $a->model?->name),
            ReportColumn::text('holder', 'ผู้ถือ', fn (Asset $a) => $this->resolveHolder($a)),
            ReportColumn::localized('department', 'แผนก', fn (Asset $a) => $this->resolveDepartment($a)),
            ReportColumn::localized('vendor', 'ผู้ขาย', fn (Asset $a) => $a->vendor ? ['name' => $a->vendor->name, 'name_th' => $a->vendor->name_th] : null),
            ReportColumn::date('warranty_end', 'ประกันถึง', fn (Asset $a) => $a->warranty_end),
            ReportColumn::daysLeft('days_left', 'เหลือ (วัน)', fn (Asset $a) => $a->warranty_end),
        ];
    }

    public function summary(Builder $query, array $filters): array
    {
        $bare = fn () => (clone $query)->setEagerLoads([]);

        $total = $bare()->count();
        $within30 = $bare()->whereDate('warranty_end', '<=', today()->addDays(30))->count();

        return [
            ReportSummary::make('total', 'ทั้งหมด', $total),
            ReportSummary::make('within_30', 'หมดภายใน 30 วัน', $within30, 'amber'),
        ];
    }
}
