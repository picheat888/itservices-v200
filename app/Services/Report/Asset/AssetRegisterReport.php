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
 * "ทะเบียนทรัพย์สิน" (Report Center → Assets): every asset on record, with its current
 * holder/department, status and source — the register IT hands to audit.
 */
class AssetRegisterReport extends TabularReport
{
    use AssetColumns;

    private const STATUS_KEYS = [
        'ready' => 'asset_ready', 'pending_acceptance' => 'asset_pending_accept', 'deployed' => 'asset_deployed',
        'common' => 'asset_common', 'pending_return' => 'asset_pending_return', 'writeoff' => 'asset_writeoff',
    ];

    private const STATUS_TH = [
        'ready' => 'พร้อมจ่าย', 'pending_acceptance' => 'รอยืนยันรับ', 'deployed' => 'ใช้งาน',
        'common' => 'ส่วนกลาง', 'pending_return' => 'รอรับคืน', 'writeoff' => 'ตัดจำหน่าย',
    ];

    private const SOURCE_KEYS = ['purchased' => 'asset_purchase', 'rented' => 'asset_lease'];

    private const SOURCE_TH = ['purchased' => 'ซื้อ', 'rented' => 'เช่า'];

    public function key(): string
    {
        return 'assets.register';
    }

    public function title(): string
    {
        return 'ทะเบียนทรัพย์สิน';
    }

    public function filters(): array
    {
        return [
            ReportFilter::select('status', Options::fromLabels(self::STATUS_KEYS)),
            ReportFilter::select('source', Options::fromLabels(self::SOURCE_KEYS)),
            ReportFilter::select('category_id', Options::categories()),
            ReportFilter::select('department_id', Options::departments()),
            ReportFilter::search(),
        ];
    }

    public function query(User $viewer, array $filters): Builder
    {
        return Asset::query()
            ->with(['category:id,name,name_th', 'brand:id,name', 'model:id,name', 'ownerEmployee.department:id,name,name_th', 'location:id,name', 'contract:id,end_date,value'])
            ->when($filters['status'], fn (Builder $q, string $status) => $q->where('status', $status))
            ->when($filters['source'], fn (Builder $q, string $source) => $q->where('source', $source))
            ->when($filters['category_id'], fn (Builder $q, $id) => $q->where('category_id', (int) $id))
            ->when($filters['department_id'], fn (Builder $q, $id) => $q->whereHas('ownerEmployee', fn (Builder $e) => $e->where('department_id', (int) $id)))
            ->when($filters['search'], fn (Builder $q, string $search) => $q->where(function (Builder $w) use ($search) {
                $like = "%{$search}%";
                $w->where('asset_code', 'like', $like)
                    ->orWhere('tag', 'like', $like)
                    ->orWhere('serial', 'like', $like)
                    ->orWhereHas('model', fn (Builder $m) => $m->where('name', 'like', $like));
            }))
            ->orderBy('asset_code');
    }

    public function columns(): array
    {
        return [
            ReportColumn::text('asset_code', 'รหัสทรัพย์สิน', fn (Asset $a) => $a->asset_code),
            ReportColumn::text('tag', 'Tag', fn (Asset $a) => $a->tag),
            ReportColumn::localized('category', 'หมวด', fn (Asset $a) => $a->category ? ['name' => $a->category->name, 'name_th' => $a->category->name_th] : null),
            ReportColumn::text('brand', 'ยี่ห้อ', fn (Asset $a) => $a->brand?->name),
            ReportColumn::text('model', 'รุ่น', fn (Asset $a) => $a->model?->name),
            ReportColumn::text('serial', 'Serial', fn (Asset $a) => $a->serial),
            ReportColumn::enum('status', 'สถานะ', fn (Asset $a) => $a->status, self::STATUS_KEYS, self::STATUS_TH),
            ReportColumn::enum('source', 'ที่มา', fn (Asset $a) => $a->source, self::SOURCE_KEYS, self::SOURCE_TH),
            ReportColumn::text('holder', 'ผู้ถือ', fn (Asset $a) => $this->resolveHolder($a)),
            ReportColumn::localized('department', 'แผนก', fn (Asset $a) => $this->resolveDepartment($a)),
            ReportColumn::text('location', 'สถานที่', fn (Asset $a) => $a->location?->name),
            ReportColumn::money('value', 'มูลค่า', fn (Asset $a) => $a->value),
            ReportColumn::date('purchase_date', 'วันที่ซื้อ', fn (Asset $a) => $a->purchase_date),
            ReportColumn::date('cover_end', 'ประกัน/สัญญาถึง', fn (Asset $a) => $a->coverEndsOn()),
        ];
    }

    public function summary(Builder $query, array $filters): array
    {
        // Aggregate over clones stripped of the row-listing eager loads — counts and the
        // money sum never need category/brand/model/etc. hydrated.
        $bare = fn () => (clone $query)->setEagerLoads([]);

        $total = $bare()->count();
        $inUse = $bare()->whereIn('status', [AssetStatus::Deployed->value, AssetStatus::Common->value])->count();
        $ready = $bare()->where('status', AssetStatus::Ready->value)->count();
        $purchaseValue = (float) $bare()->where('source', AssetSource::Purchased->value)->sum('value');

        return [
            ReportSummary::make('total', 'ทั้งหมด', $total),
            ReportSummary::make('in_use', 'ใช้งานอยู่', $inUse),
            ReportSummary::make('ready', 'พร้อมจ่าย', $ready),
            ReportSummary::make('purchase_value', 'มูลค่าซื้อรวม', $purchaseValue),
        ];
    }
}
