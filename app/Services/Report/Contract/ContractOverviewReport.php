<?php

namespace App\Services\Report\Contract;

use App\Models\Contract\Contract;
use App\Models\User;
use App\Services\Report\Tabular\CellDate;
use App\Services\Report\Tabular\Options;
use App\Services\Report\Tabular\ReportColumn;
use App\Services\Report\Tabular\ReportFilter;
use App\Services\Report\Tabular\ReportSummary;
use App\Services\Report\Tabular\TabularReport;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * "ภาพรวมและค่าใช้จ่ายสัญญา" (Report Center → Contracts): the contracts in use today (started, not
 * yet ended, never cancelled or expired) with their monthly and yearly cost, biggest monthly cost
 * first. breakdown() (ContractOverviewBreakdownController) is what the page draws above the list:
 * the tiles, the bills of the next 12 months, the yearly cost by type and billing cycle, and by vendor.
 * Bills and what is left to pay count every open contract (not cancelled, not expired); scheduled
 * values only, the system records no payments.
 */
class ContractOverviewReport extends TabularReport
{
    use ContractLabels;

    private const STATE_KEYS = ['active' => 'rep_cov_state_active', 'reminder' => 'rep_cov_state_reminder', 'due_today' => 'contract_due_today'];

    private const STATE_TH = ['active' => 'ใช้งาน', 'reminder' => 'ใกล้หมดอายุ', 'due_today' => 'ครบกำหนดวันนี้'];

    /** A live contract ending within this many days counts on the vendor table. */
    private const ENDING_SOON_DAYS = 90;

    private const MONTHS_AHEAD = 12;

    private const NO_VENDOR_TH = 'ไม่ระบุผู้ขาย';

    /** @var array<string, array<string, mixed>> breakdown() per filter set, so summary and export reuse it */
    private array $breakdowns = [];

    public function key(): string
    {
        return 'contracts.overview';
    }

    public function title(): string
    {
        return 'ภาพรวมและค่าใช้จ่ายสัญญา';
    }

    public function filters(): array
    {
        return [
            ReportFilter::select('type', Options::fromLabels(self::TYPE_KEYS)),
            ReportFilter::select('vendor_id', Options::vendors()),
            ReportFilter::select('billing_cycle', Options::fromLabels(self::CYCLE_KEYS))->labelKey('contract_billing'),
        ];
    }

    /**
     * Not cancelled, not expired, narrowed by type / vendor / billing cycle.
     *
     * @param  array<string, mixed>  $filters
     */
    private function open(array $filters): Builder
    {
        return Contract::query()
            ->whereNull('cancelled_at')
            ->whereNull('expired_at')
            ->when($filters['type'] ?? null, fn (Builder $q, string $type) => $q->where('type', $type))
            ->when($filters['vendor_id'] ?? null, fn (Builder $q, $id) => $q->where('vendor_id', (int) $id))
            ->when($filters['billing_cycle'] ?? null, fn (Builder $q, string $cycle) => $q->where('billing_cycle', $cycle));
    }

    public function query(User $viewer, array $filters): Builder
    {
        $monthly = "value / (CASE billing_cycle WHEN 'monthly' THEN 1 WHEN 'quarterly' THEN 3 ELSE 12 END)";

        return $this->open($filters)
            ->with('vendor:id,name,name_th')
            ->whereDate('start_date', '<=', today())
            ->whereDate('end_date', '>=', today())
            ->orderByRaw("{$monthly} DESC")
            ->orderBy('code');
    }

    /** @return array<string, string> */
    protected function meanings(): array
    {
        return [
            'value_per_period' => 'จำนวนเงินที่เรียกเก็บต่อหนึ่งรอบการเรียกเก็บตามที่บันทึกในสัญญา (ต่อเดือน ต่อไตรมาส หรือต่อปีตามรอบการเรียกเก็บ) เป็นมูลค่าตามสัญญา ระบบไม่ได้บันทึกการจ่ายจริง',
            'monthly_cost' => 'ค่าใช้จ่ายต่อปีหารด้วย 12 ปัดทศนิยม 2 ตำแหน่ง',
            'yearly_cost' => 'ค่างวดคูณจำนวนรอบการเรียกเก็บใน 1 ปี: รายเดือน คูณ 12, รายไตรมาส คูณ 4, รายปี คูณ 1',
            'remaining' => 'ค่างวดคูณจำนวนงวดที่ยังเหลือ นับตั้งแต่วันที่ส่งออกถึงก่อนวันที่สิ้นสุด (วันครบงวดคือวันที่เริ่มบวกทีละรอบ 1, 3 หรือ 12 เดือน) เป็นยอดตามสัญญา ไม่ใช่ยอดค้างจ่ายจริง',
            'days_left' => 'จำนวนวันจากวันที่ส่งออกถึงวันที่สิ้นสุดสัญญา 0 = สิ้นสุดวันนี้ (รายงานนี้มีเฉพาะสัญญาที่ยังไม่ถึงวันสิ้นสุด)',
            'time_state' => 'ครบกำหนดวันนี้ = วันที่สิ้นสุดคือวันนี้, ใกล้หมดอายุ = วันที่เหลือไม่เกินรอบแจ้งเตือนที่ไกลที่สุดที่เปิดไว้ในสัญญา (เช่นเปิด 90 และ 30 วันใช้ 90), ใช้งาน = ยังไม่ถึงช่วงแจ้งเตือนหรือไม่ได้เปิดแจ้งเตือน',
        ];
    }

    public function columns(): array
    {
        return [
            ReportColumn::text('code', 'เลขที่สัญญา', fn (Contract $c) => $c->code)->linkTo('/contracts', fn (Contract $c) => $c->id),
            ReportColumn::text('name', 'ชื่อสัญญา', fn (Contract $c) => $c->name),
            ReportColumn::localized('vendor', 'ผู้ขาย', fn (Contract $c) => $c->vendor ? ['name' => $c->vendor->name, 'name_th' => $c->vendor->name_th] : null)->withCode('รหัสผู้ขาย', 'เลข ID ของผู้ขายในระบบ ไม่ซ้ำกันและไม่เปลี่ยนแม้มีการแก้ชื่อ ใช้เชื่อมตารางผู้ขายใน Power BI', fn (Contract $c) => $c->vendor_id),
            ReportColumn::enum('type', 'ประเภท', fn (Contract $c) => $c->type, self::TYPE_KEYS, self::TYPE_TH),
            ReportColumn::enum('billing_cycle', 'รอบการเรียกเก็บ', fn (Contract $c) => $c->billing_cycle, self::CYCLE_KEYS, self::CYCLE_TH)
                ->labelKey('contract_billing'),
            ReportColumn::money('value_per_period', 'ค่างวด', fn (Contract $c) => $c->value)->labelKey('rep_cov_c_bill'),
            ReportColumn::money('monthly_cost', 'ค่าใช้จ่ายต่อเดือน', fn (Contract $c) => round(ContractBilling::monthlyCost($c), 2)),
            ReportColumn::money('yearly_cost', 'ค่าใช้จ่ายต่อปี', fn (Contract $c) => round(ContractBilling::yearlyCost($c), 2)),
            ReportColumn::date('next_bill', 'จ่ายครั้งถัดไป', fn (Contract $c) => $this->nextBill($c))->labelKey('rep_cov_c_next_bill'),
            ReportColumn::money('remaining', 'คงเหลือตามสัญญา', fn (Contract $c) => ContractBilling::remainingValue($c, today()))
                ->labelKey('rep_cov_c_remaining'),
            ReportColumn::date('start_date', 'วันที่เริ่ม', fn (Contract $c) => $c->start_date)->hiddenByDefault(),
            ReportColumn::date('end_date', 'วันที่สิ้นสุด', fn (Contract $c) => $c->end_date),
            ReportColumn::daysLeft('days_left', 'เหลือ (วัน)', fn (Contract $c) => $c->end_date),
            ReportColumn::enum('time_state', 'สถานะ', fn (Contract $c) => self::timeState($c), self::STATE_KEYS, self::STATE_TH)
                ->labelKey('rep_cov_c_time_state'),
        ];
    }

    /** The next bill from today, null once every bill before the end date has fallen. */
    private function nextBill(Contract $contract): ?CarbonImmutable
    {
        return ContractBilling::billDates($contract, today(), CarbonImmutable::parse($contract->end_date))[0] ?? null;
    }

    /** Ends today, inside its own reminder window, or plainly in use (the /contracts time-left colours). */
    private static function timeState(Contract $contract): string
    {
        if ($contract->daysRemaining() <= 0) {
            return 'due_today';
        }

        return $contract->isInReminder() ? 'reminder' : 'active';
    }

    /** The page's own ⓘ text of the tiles it shares with the file. */
    protected function infoKeys(): array
    {
        return ['cov_active' => 'rep_cov_k_active_hint', 'cov_next_12' => 'rep_cov_k_next12_hint', 'cov_remaining' => 'rep_cov_k_remaining_hint'];
    }

    public function summary(Builder $query, array $filters): array
    {
        $tiles = $this->breakdown(null, $filters)['tiles'];

        return [
            ReportSummary::make('cov_active', 'สัญญาที่ใช้งาน', $tiles['active']),
            ReportSummary::make('cov_in_reminder', 'ใกล้หมดอายุ (สัญญา)', $tiles['in_reminder']),
            ReportSummary::make('monthly_total', 'ค่าใช้จ่ายต่อเดือน', $tiles['monthly'], format: 'money'),
            ReportSummary::make('yearly_total', 'ค่าใช้จ่ายต่อปี', $tiles['yearly'], format: 'money'),
            // These two count contracts not started yet, which the rows (live contracts) leave out.
            ReportSummary::make('cov_next_12', 'ต้องจ่ายใน 12 เดือน', $tiles['next_12'], format: 'money')
                ->withNote(['label_key' => 'rep_cov_k_next12_file', 'values' => ['n' => $tiles['next_12_bills'], 'waiting' => $tiles['not_started']]]),
            ReportSummary::make('cov_remaining', 'คงเหลือตามสัญญา', $tiles['remaining'], format: 'money')
                ->withNote(['label_key' => 'rep_cov_k_remaining_file', 'values' => ['waiting' => $tiles['not_started']]]),
        ];
    }

    /**
     * Every open contract in scope with what the cards need: live today or not, its costs, its bills
     * in the next 12 months and what is left to pay until its end date.
     *
     * @param  array<string, mixed>  $filters
     * @return Collection<int, array{contract: Contract, live: bool, type: string, cycle: string, value: float, monthly: float, yearly: float, bills: list<CarbonImmutable>, upcoming: int, remaining: float, days: int, in_reminder: bool}>
     */
    private function contracts(array $filters): Collection
    {
        $today = CarbonImmutable::today();
        $horizon = $today->startOfMonth()->addMonthsNoOverflow(self::MONTHS_AHEAD);

        return $this->open($filters)
            ->with('vendor:id,name,name_th')
            ->orderBy('code')
            ->get()
            ->map(fn (Contract $c) => [
                'contract' => $c,
                'live' => $c->start_date->lte($today) && $c->end_date->gte($today),
                'type' => $c->type instanceof \BackedEnum ? $c->type->value : (string) $c->type,
                'cycle' => (string) $c->billing_cycle,
                'value' => (float) $c->value,
                'monthly' => ContractBilling::monthlyCost($c),
                'yearly' => ContractBilling::yearlyCost($c),
                'bills' => ContractBilling::billDates($c, $today->startOfMonth(), $horizon),
                // Still owed: from today, like remaining (the month chart keeps the whole of this month)
                'upcoming' => count(ContractBilling::billDates($c, $today, $horizon)),
                'remaining' => ContractBilling::remainingValue($c, $today),
                'days' => $c->daysRemaining(),
                'in_reminder' => $c->isInReminder(),
            ]);
    }

    /**
     * What the page draws above the list (see the class note). Codes and numbers only — the page
     * writes the words.
     *
     * @param  array<string, mixed>  $filters
     * @return array{tiles: array<string, mixed>, months: list<array<string, mixed>>, biggest_bill: ?array<string, mixed>, types: list<array<string, mixed>>, cycles: list<array<string, mixed>>, yearly_total: float, vendors: list<array<string, mixed>>}
     */
    public function breakdown(?User $viewer, array $filters): array
    {
        return $this->breakdowns[md5(serialize($filters))] ??= $this->buildBreakdown($filters);
    }

    /**
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    private function buildBreakdown(array $filters): array
    {
        $all = $this->contracts($filters);
        $live = $all->where('live', true)->values();
        $yearlyTotal = (float) $live->sum('yearly');
        $vendors = self::vendors($live);

        return [
            'tiles' => self::tiles($all, $live, $yearlyTotal, $vendors[0] ?? null),
            'months' => self::months($all),
            'biggest_bill' => self::biggestBill($all),
            'types' => self::types($live),
            'cycles' => self::cycles($live),
            'yearly_total' => round($yearlyTotal, 2),
            'vendors' => $vendors,
        ];
    }

    /**
     * @param  Collection<int, array<string, mixed>>  $all
     * @param  Collection<int, array<string, mixed>>  $live
     * @param  array<string, mixed>|null  $topVendor
     * @return array{active: int, in_reminder: int, monthly: float, yearly: float, next_12: float, next_12_bills: int, not_started: int, remaining: float, longest_end: ?string, top_vendor: ?array{vendor_id: ?int, name: ?string, name_th: ?string, yearly: float, share: float}}
     */
    private static function tiles(Collection $all, Collection $live, float $yearlyTotal, ?array $topVendor): array
    {
        $monthly = (float) $live->sum('monthly');
        $longest = $all->filter(fn (array $c) => $c['remaining'] > 0)->sortByDesc(fn (array $c) => $c['contract']->end_date->format('Y-m-d'))->first();

        return [
            'active' => $live->count(),
            'in_reminder' => $live->where('in_reminder', true)->count(),
            'monthly' => round($monthly, 2),
            'yearly' => round($monthly * 12, 2),
            'next_12' => round((float) $all->sum(fn (array $c) => $c['upcoming'] * $c['value']), 2),
            'next_12_bills' => (int) $all->sum('upcoming'),
            'not_started' => $all->filter(fn (array $c) => $c['contract']->start_date->gt(today()))->count(),
            'remaining' => round((float) $all->sum('remaining'), 2),
            'longest_end' => $longest ? $longest['contract']->end_date->format('Y-m-d') : null,
            'top_vendor' => $topVendor === null || $yearlyTotal <= 0 ? null : [
                'vendor_id' => $topVendor['vendor_id'],
                'name' => $topVendor['name'],
                'name_th' => $topVendor['name_th'],
                'yearly' => $topVendor['yearly'],
                'share' => round($topVendor['yearly'] / $yearlyTotal * 100, 1),
            ],
        ];
    }

    /**
     * This month and the next 11, each with the bills that fall in it.
     *
     * @param  Collection<int, array<string, mixed>>  $all
     * @return list<array{month: string, items: list<array{id: int, code: string, name: string, type: string, amount: float, date: string, yearly: float}>}>
     */
    private static function months(Collection $all): array
    {
        $byMonth = [];
        foreach ($all as $c) {
            foreach ($c['bills'] as $date) {
                $byMonth[$date->format('Y-m')][] = [
                    'id' => $c['contract']->id,
                    'code' => (string) $c['contract']->code,
                    'name' => (string) $c['contract']->name,
                    'type' => $c['type'],
                    'amount' => round($c['value'], 2),
                    'date' => $date->format('Y-m-d'),
                    'yearly' => round($c['yearly'], 2),
                ];
            }
        }

        $months = [];
        $month = CarbonImmutable::today()->startOfMonth();
        for ($i = 0; $i < self::MONTHS_AHEAD; $i++, $month = $month->addMonthNoOverflow()) {
            $months[] = ['month' => $month->format('Y-m'), 'items' => $byMonth[$month->format('Y-m')] ?? []];
        }

        return $months;
    }

    /**
     * The single biggest bill ahead: largest amount, then the earliest, then by code.
     *
     * @param  Collection<int, array<string, mixed>>  $all
     * @return array{id: int, code: string, name: string, amount: float, date: string}|null
     */
    private static function biggestBill(Collection $all): ?array
    {
        $bills = $all->flatMap(fn (array $c) => array_map(fn (CarbonImmutable $d) => [
            'id' => $c['contract']->id, 'code' => (string) $c['contract']->code, 'name' => (string) $c['contract']->name,
            'amount' => round($c['value'], 2), 'date' => $d->format('Y-m-d'),
        ], $c['bills']));

        return $bills->sortBy([['amount', 'desc'], ['date', 'asc'], ['code', 'asc']])->first();
    }

    /**
     * Every type with its live contracts and yearly cost, biggest first.
     *
     * @param  Collection<int, array<string, mixed>>  $live
     * @return list<array{type: string, contracts: int, yearly: float}>
     */
    private static function types(Collection $live): array
    {
        $rows = array_map(fn (string $type) => [
            'type' => $type,
            'contracts' => $live->where('type', $type)->count(),
            'yearly' => round((float) $live->where('type', $type)->sum('yearly'), 2),
        ], array_keys(self::TYPE_KEYS));
        usort($rows, fn (array $a, array $b) => $b['yearly'] <=> $a['yearly']);

        return $rows;
    }

    /**
     * Monthly, quarterly and yearly billing with their live contracts and yearly cost.
     *
     * @param  Collection<int, array<string, mixed>>  $live
     * @return list<array{cycle: string, contracts: int, yearly: float}>
     */
    private static function cycles(Collection $live): array
    {
        return array_map(fn (string $cycle) => [
            'cycle' => $cycle,
            'contracts' => $live->where('cycle', $cycle)->count(),
            'yearly' => round((float) $live->where('cycle', $cycle)->sum('yearly'), 2),
        ], array_keys(self::CYCLE_KEYS));
    }

    /**
     * One row per vendor of the live contracts, biggest yearly cost first; no vendor comes last.
     *
     * @param  Collection<int, array<string, mixed>>  $live
     * @return list<array{vendor_id: ?int, name: ?string, name_th: ?string, contracts: int, monthly: float, yearly: float, remaining: float, ending_soon: int}>
     */
    private static function vendors(Collection $live): array
    {
        return $live
            ->groupBy(fn (array $c) => (string) $c['contract']->vendor_id)
            ->map(function (Collection $group) {
                $vendor = $group->first()['contract']->vendor;

                return [
                    'vendor_id' => $vendor?->id,
                    'name' => $vendor?->name,
                    'name_th' => $vendor?->name_th,
                    'contracts' => $group->count(),
                    'monthly' => round((float) $group->sum('monthly'), 2),
                    'yearly' => round((float) $group->sum('yearly'), 2),
                    'remaining' => round((float) $group->sum('remaining'), 2),
                    'ending_soon' => $group->filter(fn (array $c) => $c['days'] <= self::ENDING_SOON_DAYS)->count(),
                ];
            })
            ->sortBy([
                fn (array $a, array $b) => ($a['vendor_id'] === null) <=> ($b['vendor_id'] === null),
                fn (array $a, array $b) => $b['yearly'] <=> $a['yearly'],
                fn (array $a, array $b) => strcmp((string) $a['name'], (string) $b['name']),
            ])
            ->values()
            ->all();
    }

    /**
     * The breakdown as sheets: bills by month, yearly cost by type and by billing cycle, by vendor.
     *
     * @param  array<string, mixed>  $filters
     * @return list<array{title: string, headings: list<string>, rows: list<list<string|int|float|null>>}>
     */
    public function exportSections(User $viewer, array $filters): array
    {
        $data = $this->breakdown($viewer, $filters);
        $total = $data['yearly_total'];
        $share = fn (float $yearly) => $total > 0 ? round($yearly / $total * 100, 1) : 0.0;
        $types = array_keys(self::TYPE_KEYS);

        return [
            [
                'title' => 'เงินที่ต้องจ่ายตามรอบบิล',
                'money' => [1, ...range(3, 2 + count($types))],
                'headings' => ['เดือน', 'รวม', 'สัญญา', ...array_map(fn (string $type) => self::TYPE_TH[$type], $types)],
                'rows' => array_map(function (array $m) use ($types) {
                    $items = collect($m['items']);

                    return [
                        CellDate::month($m['month']),
                        round((float) $items->sum('amount'), 2),
                        $items->count(),
                        ...array_map(fn (string $type) => round((float) $items->where('type', $type)->sum('amount'), 2), $types),
                    ];
                }, $data['months']),
            ],
            [
                'title' => 'ค่าใช้จ่ายต่อปีตามประเภท',
                'money' => [2],
                'headings' => ['ประเภท', 'สัญญา', 'ค่าใช้จ่ายต่อปี', 'สัดส่วน (%)'],
                'rows' => array_map(fn (array $t) => [self::TYPE_TH[$t['type']], $t['contracts'], $t['yearly'], $share($t['yearly'])], $data['types']),
            ],
            [
                'title' => 'ตามรอบการเรียกเก็บ',
                'money' => [2],
                'headings' => ['รอบการเรียกเก็บ', 'สัญญา', 'ค่าใช้จ่ายต่อปี', 'สัดส่วน (%)'],
                'rows' => array_map(fn (array $c) => [self::CYCLE_TH[$c['cycle']], $c['contracts'], $c['yearly'], $share($c['yearly'])], $data['cycles']),
            ],
            [
                'title' => 'ค่าใช้จ่ายตามผู้ขาย',
                'money' => [2, 3, 5],
                'headings' => ['ผู้ขาย', 'สัญญา', 'ค่าใช้จ่ายต่อเดือน', 'ค่าใช้จ่ายต่อปี', 'สัดส่วนต่อปี (%)', 'คงเหลือตามสัญญา', 'หมดใน 90 วัน (สัญญา)'],
                'rows' => array_map(fn (array $v) => [
                    $v['vendor_id'] === null ? self::NO_VENDOR_TH : ($v['name_th'] ?: $v['name']),
                    $v['contracts'], $v['monthly'], $v['yearly'], $share($v['yearly']), $v['remaining'], $v['ending_soon'],
                ], $data['vendors']),
            ],
        ];
    }
}
