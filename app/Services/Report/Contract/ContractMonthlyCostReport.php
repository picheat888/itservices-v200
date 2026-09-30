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
 * "ค่าใช้จ่ายสัญญารายเดือน" (Report Center → Contracts): every contract in effect today
 * (started, not yet ended, never cancelled or expired) with its per-period fee brought to
 * a monthly and a yearly figure — quarterly ÷ 3, yearly ÷ 12 — biggest monthly cost first.
 * Filter by vendor or type to read the cost of one slice.
 */
class ContractMonthlyCostReport extends TabularReport
{
    use ContractLabels;

    /** Months one billing period covers. */
    private const MONTHS_PER_CYCLE = ['monthly' => 1, 'quarterly' => 3, 'yearly' => 12];

    public function key(): string
    {
        return 'contracts.monthly_cost';
    }

    public function title(): string
    {
        return 'ค่าใช้จ่ายสัญญารายเดือน';
    }

    public function filters(): array
    {
        return [
            ReportFilter::select('type', Options::fromLabels(self::TYPE_KEYS)),
            ReportFilter::select('vendor_id', Options::vendors()),
            ReportFilter::select('billing_cycle', Options::fromLabels(self::CYCLE_KEYS)),
        ];
    }

    public function query(User $viewer, array $filters): Builder
    {
        $monthly = "value / (CASE billing_cycle WHEN 'quarterly' THEN 3 WHEN 'yearly' THEN 12 ELSE 1 END)";

        return Contract::query()
            ->with('vendor:id,name,name_th')
            ->whereNull('cancelled_at')
            ->whereNull('expired_at')
            ->whereDate('start_date', '<=', today())
            ->whereDate('end_date', '>=', today())
            ->when($filters['type'], fn (Builder $q, string $type) => $q->where('type', $type))
            ->when($filters['vendor_id'], fn (Builder $q, $id) => $q->where('vendor_id', (int) $id))
            ->when($filters['billing_cycle'], fn (Builder $q, string $cycle) => $q->where('billing_cycle', $cycle))
            ->orderByRaw("{$monthly} DESC")
            ->orderBy('code');
    }

    public function columns(): array
    {
        return [
            ReportColumn::text('code', 'เลขที่สัญญา', fn (Contract $c) => $c->code),
            ReportColumn::text('name', 'ชื่อสัญญา', fn (Contract $c) => $c->name),
            ReportColumn::localized('vendor', 'ผู้ขาย', fn (Contract $c) => $c->vendor ? ['name' => $c->vendor->name, 'name_th' => $c->vendor->name_th] : null),
            ReportColumn::enum('type', 'ประเภท', fn (Contract $c) => $c->type, self::TYPE_KEYS, self::TYPE_TH),
            ReportColumn::enum('billing_cycle', 'รอบบิล', fn (Contract $c) => $c->billing_cycle, self::CYCLE_KEYS, self::CYCLE_TH),
            ReportColumn::money('value_per_period', 'มูลค่าต่องวด', fn (Contract $c) => $c->value),
            ReportColumn::money('monthly_cost', 'ต่อเดือน', fn (Contract $c) => $this->monthlyCost($c)),
            ReportColumn::money('yearly_cost', 'ต่อปี', fn (Contract $c) => $this->monthlyCost($c) === null ? null : $this->monthlyCost($c) * 12),
            ReportColumn::date('start_date', 'วันที่เริ่ม', fn (Contract $c) => $c->start_date),
            ReportColumn::date('end_date', 'วันที่สิ้นสุด', fn (Contract $c) => $c->end_date),
        ];
    }

    public function summary(Builder $query, array $filters): array
    {
        $contracts = (clone $query)->setEagerLoads([])->get(['id', 'value', 'billing_cycle']);
        $monthly = round((float) $contracts->sum(fn (Contract $c) => $this->monthlyCost($c) ?? 0), 2);

        return [
            ReportSummary::make('total', 'ทั้งหมด', $contracts->count()),
            ReportSummary::make('monthly_total', 'ค่าใช้จ่ายต่อเดือน', $monthly, format: 'money'),
            ReportSummary::make('yearly_total', 'ค่าใช้จ่ายต่อปี', round($monthly * 12, 2), format: 'money'),
        ];
    }

    /** The per-period fee spread over the months that period covers; null when no fee is recorded. */
    private function monthlyCost(Contract $contract): ?float
    {
        if ($contract->value === null) {
            return null;
        }

        return round((float) $contract->value / (self::MONTHS_PER_CYCLE[$contract->billing_cycle] ?? 1), 2);
    }
}
