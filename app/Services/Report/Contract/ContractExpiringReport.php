<?php

namespace App\Services\Report\Contract;

use App\Models\Contract\Contract;
use App\Models\User;
use App\Services\Report\Tabular\Options;
use App\Services\Report\Tabular\ReportColumn;
use App\Services\Report\Tabular\ReportFilter;
use App\Services\Report\Tabular\ReportSummary;
use App\Services\Report\Tabular\TabularReport;
use Illuminate\Database\Eloquent\Builder;

/**
 * "สัญญาใกล้หมดอายุ" (Report Center → Contracts): live contracts whose end date falls within
 * the chosen window — including ones already past their end date but never closed
 * (cancelled/expired), because those still need someone to act.
 */
class ContractExpiringReport extends TabularReport
{
    private const TYPE_KEYS = [
        'software' => 'contract_type_software', 'hardware' => 'contract_type_hardware',
        'service' => 'contract_type_service', 'connectivity' => 'contract_type_connectivity',
        'other' => 'contract_type_other',
    ];

    private const TYPE_TH = [
        'software' => 'ซอฟต์แวร์', 'hardware' => 'ฮาร์ดแวร์', 'service' => 'บริการ',
        'connectivity' => 'เครือข่าย', 'other' => 'อื่น ๆ',
    ];

    private const CYCLE_KEYS = ['monthly' => 'contract_billing_monthly', 'quarterly' => 'contract_billing_quarterly', 'yearly' => 'contract_billing_yearly'];

    private const CYCLE_TH = ['monthly' => 'รายเดือน', 'quarterly' => 'รายไตรมาส', 'yearly' => 'รายปี'];

    public function key(): string
    {
        return 'contracts.expiring';
    }

    public function title(): string
    {
        return 'สัญญาใกล้หมดอายุ';
    }

    public function filters(): array
    {
        return [
            ReportFilter::select('within', Options::dayWindows(), 90),
            ReportFilter::select('type', Options::fromLabels(self::TYPE_KEYS)),
            ReportFilter::select('vendor_id', Options::vendors()),
        ];
    }

    public function query(User $viewer, array $filters): Builder
    {
        return Contract::query()
            ->with('vendor:id,name,name_th')
            ->whereNull('cancelled_at')
            ->whereNull('expired_at')
            ->whereDate('end_date', '<=', today()->addDays((int) $filters['within']))
            ->when($filters['type'], fn (Builder $q, string $type) => $q->where('type', $type))
            ->when($filters['vendor_id'], fn (Builder $q, $id) => $q->where('vendor_id', (int) $id))
            ->orderBy('end_date')
            ->orderBy('id');
    }

    public function columns(): array
    {
        return [
            ReportColumn::text('code', 'เลขที่สัญญา', fn (Contract $c) => $c->code),
            ReportColumn::text('name', 'ชื่อสัญญา', fn (Contract $c) => $c->name),
            ReportColumn::localized('vendor', 'ผู้ขาย', fn (Contract $c) => $c->vendor ? ['name' => $c->vendor->name, 'name_th' => $c->vendor->name_th] : null),
            ReportColumn::enum('type', 'ประเภท', fn (Contract $c) => $c->type, self::TYPE_KEYS, self::TYPE_TH),
            ReportColumn::date('start_date', 'วันที่เริ่ม', fn (Contract $c) => $c->start_date),
            ReportColumn::date('end_date', 'วันที่สิ้นสุด', fn (Contract $c) => $c->end_date),
            ReportColumn::daysLeft('days_left', 'เหลือ (วัน)', fn (Contract $c) => $c->end_date),
            ReportColumn::money('value_per_period', 'มูลค่าต่องวด', fn (Contract $c) => $c->value),
            ReportColumn::enum('billing_cycle', 'รอบบิล', fn (Contract $c) => $c->billing_cycle, self::CYCLE_KEYS, self::CYCLE_TH),
        ];
    }

    public function summary(Builder $query, array $filters): array
    {
        // Models, not pluck(): pluck returns the raw column string, get() returns cast dates.
        // Stripped of the row-listing eager load (vendor) — the summary never reads it.
        $ends = (clone $query)->setEagerLoads([])->get(['id', 'end_date'])->pluck('end_date');
        $today = today();

        return [
            ReportSummary::make('total', 'ทั้งหมด', $ends->count()),
            ReportSummary::make('overdue', 'เลยวันสิ้นสุดแล้ว', $ends->filter(fn ($d) => $d->lt($today))->count(), 'red'),
            ReportSummary::make('within_30', 'หมดภายใน 30 วัน', $ends->filter(fn ($d) => $d->gte($today) && $d->lte($today->copy()->addDays(30)))->count(), 'amber'),
        ];
    }
}
