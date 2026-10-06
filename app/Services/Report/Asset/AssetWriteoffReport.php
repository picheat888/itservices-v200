<?php

namespace App\Services\Report\Asset;

use App\Enums\Asset\AssetSource;
use App\Enums\Asset\AssetStatus;
use App\Models\Asset\Asset;
use App\Models\Contract\Contract;
use App\Models\User;
use App\Services\Report\Tabular\Options;
use App\Services\Report\Tabular\ReportColumn;
use App\Services\Report\Tabular\ReportFilter;
use App\Services\Report\Tabular\ReportSummary;
use App\Services\Report\Tabular\TabularReport;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * "การตัดจำหน่ายทรัพย์สิน" (Report Center → Assets): the assets that left the register within a date
 * range (assets.written_off_at; this year by default) — bought ones written off, rented ones handed
 * back to the lessor (AssetService::returnToVendor: written off with returned_to_vendor_at) or
 * written off another way (lost, broken: still owed to the lessor) — newest first.
 *
 * Tiles: how many (bought / rented), what the bought ones cost, how long they served, how many
 * left while still under warranty, and how many rented units are still out on contracts that
 * have already ended. breakdown() (its own endpoint, AssetWriteoffBreakdownController) is what the
 * page draws above the list: every month of the range, the reasons, the categories (age bands,
 * warranty) and every contract with assets attached — that last one all-time, not by the range.
 * The file carries the same as sheets, then the list.
 */
class AssetWriteoffReport extends TabularReport
{
    private const SOURCE_KEYS = ['purchased' => 'asset_purchase', 'rented' => 'asset_lease'];

    private const SOURCE_TH = ['purchased' => 'ซื้อ', 'rented' => 'เช่า / เช่าใช้'];

    /** How the asset left: written off, or (rented) handed back to its lessor. */
    private const OUTCOME_KEYS = ['written_off' => 'rep_wo_outcome_written_off', 'returned' => 'rep_wo_outcome_returned'];

    private const OUTCOME_TH = ['written_off' => 'ตัดจำหน่าย', 'returned' => 'คืนผู้ให้เช่า'];

    /** A bought asset's warranty on the day it was written off; rented assets have none of their own. */
    private const WARRANTY_KEYS = [
        'remaining' => 'rep_wo_warranty_remaining',
        'lifetime' => 'rep_wo_warranty_lifetime',
        'expired' => 'rep_wo_warranty_expired',
        'unknown' => 'rep_wo_warranty_unknown',
    ];

    private const WARRANTY_TH = ['remaining' => 'ยังมีประกัน', 'lifetime' => 'ประกันตลอดอายุ', 'expired' => 'หมดประกันแล้ว', 'unknown' => '—'];

    /** A contract's state for the "rented by contract" card, most urgent first. */
    private const CONTRACT_FLAGS = ['overdue', 'ending_soon', 'running', 'all_returned'];

    private const CONTRACT_FLAG_TH = [
        'overdue' => 'หมดสัญญาแล้ว ต้องตามคืน',
        'ending_soon' => 'ใกล้หมดสัญญา เตรียมคืน',
        'running' => 'ยังอยู่ในสัญญา',
        'all_returned' => 'คืนครบแล้ว',
    ];

    /** A contract ending within this many days is "ending soon". */
    private const ENDING_SOON_DAYS = 90;

    /** Thai month abbreviations for the file's month rows ("ก.ย. 2026"). */
    private const MONTHS_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

    private const NO_CATEGORY = ['name' => 'No category', 'name_th' => 'ไม่ระบุหมวดหมู่'];

    public function key(): string
    {
        return 'assets.writeoffs';
    }

    public function title(): string
    {
        return 'การตัดจำหน่ายทรัพย์สิน';
    }

    public function filters(): array
    {
        return [
            ReportFilter::date('from', today()->startOfYear()->toDateString()),
            ReportFilter::date('to', today()->toDateString()),
            ReportFilter::select('category_id', Options::categories())->labelKey('rep_fl_asset_category'),
            ReportFilter::select('source', Options::fromLabels(self::SOURCE_KEYS)),
            ReportFilter::select('contract_id', Options::assetContracts())->labelKey('rep_fl_contract'),
            ReportFilter::select('writeoff_reason_id', Options::writeoffReasons())->labelKey('rep_fl_writeoff_reason'),
        ];
    }

    /**
     * The assets the filters keep that left within the range, bare — the list adds its eager loads and order.
     *
     * @param  array<string, mixed>  $filters
     */
    private function filtered(array $filters): Builder
    {
        [$from, $to] = $this->dayRange($filters);

        return Asset::query()
            ->where('assets.status', AssetStatus::Writeoff->value)
            ->whereBetween('assets.written_off_at', [$from, $to])
            ->when($filters['writeoff_reason_id'], fn (Builder $q, $id) => $q->where('assets.writeoff_reason_id', (int) $id))
            ->when($filters['category_id'], fn (Builder $q, $id) => $q->where('assets.category_id', (int) $id))
            ->when($filters['source'], fn (Builder $q, string $source) => $q->where('assets.source', $source))
            ->when($filters['contract_id'], fn (Builder $q, $id) => $q->where('assets.contract_id', (int) $id));
    }

    public function query(User $viewer, array $filters): Builder
    {
        return $this->filtered($filters)
            ->with(['category:id,name,name_th', 'brand:id,name', 'model:id,name', 'warehouse:id,name', 'contract:id,code', 'writeoffReason:id,name', 'writtenOffBy:id,name'])
            ->orderByDesc('assets.written_off_at')
            ->orderBy('assets.asset_code');
    }

    public function columns(): array
    {
        return [
            ReportColumn::dateTime('written_off_at', 'วันที่ตัดจำหน่าย', fn (Asset $a) => $a->written_off_at),
            ReportColumn::text('asset_code', 'รหัสทรัพย์สิน', fn (Asset $a) => $a->asset_code)->linkTo('/assets', fn (Asset $a) => $a->id),
            // Drawn under the code on the page ("Dell Latitude 5440"), so hidden as columns of their own.
            ReportColumn::text('brand', 'ยี่ห้อ', fn (Asset $a) => $a->brand?->name)->hiddenByDefault(),
            ReportColumn::text('model', 'รุ่น', fn (Asset $a) => $a->model?->name)->hiddenByDefault(),
            ReportColumn::localized('category', 'หมวดหมู่', fn (Asset $a) => $a->category ? ['name' => $a->category->name, 'name_th' => $a->category->name_th] : null)
                ->labelKey('rep_c_asset_category'),
            ReportColumn::enum('source', 'ที่มา', fn (Asset $a) => $a->source, self::SOURCE_KEYS, self::SOURCE_TH),
            ReportColumn::text('contract', 'สัญญา', fn (Asset $a) => $a->contract?->code)->linkTo('/contracts', fn (Asset $a) => $a->contract_id),
            // The page reads this into the reason cell: a return to the lessor carries no reason of its own.
            ReportColumn::enum('outcome', 'การตัดออก', fn (Asset $a) => self::outcome($a), self::OUTCOME_KEYS, self::OUTCOME_TH)->hiddenByDefault(),
            ReportColumn::text('reason', 'เหตุผล', fn (Asset $a) => $a->writeoffReason?->name),
            ReportColumn::text('reason_note', 'หมายเหตุ', fn (Asset $a) => $a->last_reason)->hiddenByDefault(),
            ReportColumn::text('written_off_by', 'ผู้ตัดจำหน่าย', fn (Asset $a) => $a->writtenOffBy?->name)->hiddenByDefault(),
            ReportColumn::text('serial', 'Serial', fn (Asset $a) => $a->serial)->hiddenByDefault(),
            ReportColumn::text('warehouse', 'คลัง', fn (Asset $a) => $a->warehouse?->name)->hiddenByDefault(),
            ReportColumn::date('purchase_date', 'วันที่ซื้อ', fn (Asset $a) => $a->purchase_date)->hiddenByDefault(),
            // How long it served: bought to written off, in years (bought assets only).
            ReportColumn::number('age_years', 'อายุใช้งาน (ปี)', fn (Asset $a) => self::ageYears($a) === null ? null : round(self::ageYears($a), 1)),
            ReportColumn::enum('warranty', 'ประกัน ณ วันที่ตัด', fn (Asset $a) => self::warrantyState($a), self::WARRANTY_KEYS, self::WARRANTY_TH),
            // The page writes "เหลือ N เดือน" from this; null unless the warranty still ran.
            ReportColumn::number('warranty_months', 'ประกันเหลือ (เดือน)', fn (Asset $a) => self::warrantyMonthsLeft($a))->hiddenByDefault(),
            // A rented asset has no value of its own; the page marks it "Rented" (the contract's
            // value repeated on every unit read as each one's worth).
            ReportColumn::money('value', 'มูลค่า', fn (Asset $a) => $a->source === AssetSource::Rented ? null : $a->value),
        ];
    }

    /** "returned" for a rented asset handed back to its lessor, "written_off" for every other. */
    private static function outcome(Asset $asset): string
    {
        return $asset->returned_to_vendor_at !== null ? 'returned' : 'written_off';
    }

    /** Years in service, bought to written off — null for a rented asset or one without a purchase date. */
    private static function ageYears(Asset $asset): ?float
    {
        if ($asset->source === AssetSource::Rented || $asset->purchase_date === null || $asset->written_off_at === null) {
            return null;
        }

        return $asset->purchase_date->diffInDays($asset->written_off_at, true) / 365;
    }

    /** remaining / lifetime / expired / unknown on the day it was written off; null for rented. */
    private static function warrantyState(Asset $asset): ?string
    {
        if ($asset->source === AssetSource::Rented) {
            return null;
        }
        if ($asset->warranty_lifetime) {
            return 'lifetime';
        }
        if ($asset->warranty_end === null || $asset->written_off_at === null) {
            return 'unknown';
        }

        return $asset->warranty_end->gt($asset->written_off_at->copy()->startOfDay()) ? 'remaining' : 'expired';
    }

    /** Whole months of warranty still left when written off (at least 1), for a warranty that still ran. */
    private static function warrantyMonthsLeft(Asset $asset): ?int
    {
        if (self::warrantyState($asset) !== 'remaining') {
            return null;
        }
        $days = $asset->written_off_at->copy()->startOfDay()->diffInDays($asset->warranty_end, true);

        return max(1, (int) round($days / 30.44));
    }

    /** Whether it left while still under warranty — a claim that may have been missed. */
    private static function underWarranty(Asset $asset): bool
    {
        return in_array(self::warrantyState($asset), ['remaining', 'lifetime'], true);
    }

    /**
     * The assets that left as bare rows for the tiles, the breakdown and the file's sheets.
     *
     * @param  array<string, mixed>  $filters
     * @return Collection<int, Asset>
     */
    private function written(array $filters): Collection
    {
        return $this->filtered($filters)
            ->leftJoin('categories', 'categories.id', '=', 'assets.category_id')
            ->leftJoin('writeoff_reasons', 'writeoff_reasons.id', '=', 'assets.writeoff_reason_id')
            ->get([
                'assets.id', 'assets.source', 'assets.value', 'assets.written_off_at', 'assets.purchase_date',
                'assets.warranty_end', 'assets.warranty_lifetime', 'assets.returned_to_vendor_at',
                'categories.id as category_ref', 'categories.name as category_name', 'categories.name_th as category_name_th',
                'writeoff_reasons.id as reason_ref', 'writeoff_reasons.name as reason_name',
            ]);
    }

    /** @param Collection<int, Asset> $assets */
    private static function bought(Collection $assets): Collection
    {
        return $assets->filter(fn (Asset $a) => $a->source === AssetSource::Purchased)->values();
    }

    /** @param Collection<int, Asset> $assets */
    private static function rented(Collection $assets): Collection
    {
        return $assets->filter(fn (Asset $a) => $a->source === AssetSource::Rented)->values();
    }

    /** @return array{name: string, name_th: ?string} */
    private static function categoryLabel(Asset $asset): array
    {
        return $asset->getAttribute('category_ref') === null
            ? self::NO_CATEGORY
            : ['name' => (string) $asset->getAttribute('category_name'), 'name_th' => $asset->getAttribute('category_name_th')];
    }

    /** @param Collection<int, Asset> $assets */
    private static function averageAge(Collection $assets): ?float
    {
        $ages = $assets->map(self::ageYears(...))->filter(fn (?float $age) => $age !== null);

        return $ages->isEmpty() ? null : round($ages->avg(), 1);
    }

    public function summary(Builder $query, array $filters): array
    {
        $assets = $this->written($filters);
        $bought = self::bought($assets);
        $boughtValue = (float) $bought->sum('value');
        $underWarranty = $bought->filter(self::underWarranty(...));
        $overdue = collect($this->contracts($filters))->where('flag', 'overdue');

        // The category that served shortest, among the bought assets with a purchase date.
        $shortest = $bought->filter(fn (Asset $a) => self::ageYears($a) !== null)
            ->groupBy(fn (Asset $a) => (string) $a->getAttribute('category_ref'))
            ->map(fn (Collection $group) => ['label' => self::categoryLabel($group->first()), 'years' => self::averageAge($group)])
            ->sortBy('years')
            ->first();

        return [
            ReportSummary::make('wo_total', 'ตัดจำหน่าย (เครื่อง)', $assets->count())->withSplit([
                ['key' => 'purchased', 'label_key' => 'rep_src_purchased', 'tone' => 'soft-orange', 'value' => $bought->count()],
                ['key' => 'rented', 'label_key' => 'rep_src_rented', 'tone' => 'soft-pink', 'value' => self::rented($assets)->count()],
            ]),
            // What the bought ones cost — a rented asset is the lessor's, not a write-off of ours.
            ReportSummary::make('wo_purchase_value', 'มูลค่าซื้อที่ตัดจำหน่าย', $boughtValue, null, 'money')
                ->withNote($bought->isEmpty() ? null : [
                    'label_key' => 'rep_n_wo_purchase',
                    'values' => ['n' => $bought->count(), 'avg' => (int) round($boughtValue / $bought->count())],
                ]),
            ReportSummary::make('wo_avg_life', 'อายุใช้งานเฉลี่ย (ปี)', self::averageAge($bought), null, 'years')
                ->withNote($shortest === null ? null : [
                    'label_key' => 'rep_n_wo_shortest_life',
                    'values' => ['years' => $shortest['years']],
                    'texts' => ['category' => $shortest['label']],
                ]),
            ReportSummary::make('wo_under_warranty', 'ตัดทั้งที่ยังมีประกัน (เครื่อง)', $underWarranty->count())
                ->withAttention('amber')
                ->withNote($underWarranty->isEmpty()
                    ? ['label_key' => 'rep_n_wo_under_warranty_none']
                    : ['label_key' => 'rep_n_wo_under_warranty_value', 'values' => ['value' => (int) round((float) $underWarranty->sum('value'))]]),
            // Units still out on contracts that have already ended — whatever the date range.
            ReportSummary::make('wo_rented_overdue', 'เครื่องเช่าค้างคืน (เครื่อง)', (int) $overdue->sum('still_out'))
                ->withAttention('red')
                ->withNote($overdue->isEmpty()
                    ? ['label_key' => 'rep_n_wo_rented_overdue_none']
                    : ['label_key' => 'rep_n_wo_rented_overdue', 'texts' => ['codes' => $overdue->pluck('code')->implode(', ')]]),
        ];
    }

    /**
     * What the page draws above the list (see the class note). Codes and numbers only — the page
     * writes the words.
     *
     * @param  array<string, mixed>  $filters
     * @return array{months: list<array<string, mixed>>, reasons: list<array<string, mixed>>, categories: list<array<string, mixed>>, contracts: list<array<string, mixed>>}
     */
    public function breakdown(User $viewer, array $filters): array
    {
        $assets = $this->written($filters);

        return [
            'months' => $this->months($assets, $filters),
            'reasons' => self::reasons($assets),
            'categories' => self::categories($assets),
            'contracts' => $this->contracts($filters),
        ];
    }

    /**
     * Every month of the range, oldest first, empty ones included: bought written off, rented
     * handed back, rented written off another way.
     *
     * @param  Collection<int, Asset>  $assets
     * @param  array<string, mixed>  $filters
     * @return list<array{month: string, total: int, bought: int, returned: int, rented_other: int}>
     */
    private function months(Collection $assets, array $filters): array
    {
        [$from, $to] = $this->dayRange($filters);
        $byMonth = $assets->groupBy(fn (Asset $a) => $a->written_off_at->format('Y-m'));

        $months = [];
        for ($month = $from->copy()->startOfMonth(); $month->lte($to); $month->addMonth()) {
            $group = $byMonth->get($month->format('Y-m'), collect());
            $rented = self::rented($group);
            $returned = $rented->filter(fn (Asset $a) => self::outcome($a) === 'returned')->count();
            $months[] = [
                'month' => $month->format('Y-m'),
                'total' => $group->count(),
                'bought' => self::bought($group)->count(),
                'returned' => $returned,
                'rented_other' => $rented->count() - $returned,
            ];
        }

        return $months;
    }

    /**
     * One line per reason, most first: a return to the lessor is its own line ("returned"), an
     * asset written off without one is "none".
     *
     * @param  Collection<int, Asset>  $assets
     * @return list<array{key: string, reason_id: ?int, name: ?string, total: int, bought: int, rented: int}>
     */
    private static function reasons(Collection $assets): array
    {
        return $assets
            ->groupBy(fn (Asset $a) => match (true) {
                self::outcome($a) === 'returned' => 'returned',
                $a->getAttribute('reason_ref') === null => 'none',
                default => 'reason:'.$a->getAttribute('reason_ref'),
            })
            ->map(fn (Collection $group, string $key) => [
                'key' => $key,
                'reason_id' => str_starts_with($key, 'reason:') ? (int) $group->first()->getAttribute('reason_ref') : null,
                'name' => str_starts_with($key, 'reason:') ? (string) $group->first()->getAttribute('reason_name') : null,
                'total' => $group->count(),
                'bought' => self::bought($group)->count(),
                'rented' => self::rented($group)->count(),
            ])
            ->sortBy([['total', 'desc'], ['key', 'asc']])
            ->values()
            ->all();
    }

    /**
     * One line per category, most first: the split, what the bought ones cost, how long they
     * served (average and in bands), and how many left still under warranty.
     *
     * @param  Collection<int, Asset>  $assets
     * @return list<array<string, mixed>>
     */
    private static function categories(Collection $assets): array
    {
        return $assets
            ->groupBy(fn (Asset $a) => (string) $a->getAttribute('category_ref'))
            ->map(function (Collection $group) {
                $bought = self::bought($group);
                $ages = $bought->map(self::ageYears(...))->filter(fn (?float $age) => $age !== null);
                $first = $group->first();

                return [
                    'category_id' => $first->getAttribute('category_ref') === null ? null : (int) $first->getAttribute('category_ref'),
                    'name' => $first->getAttribute('category_ref') === null ? null : (string) $first->getAttribute('category_name'),
                    'name_th' => $first->getAttribute('category_ref') === null ? null : $first->getAttribute('category_name_th'),
                    'total' => $group->count(),
                    'bought' => $bought->count(),
                    'rented' => self::rented($group)->count(),
                    'bought_value' => (float) $bought->sum('value'),
                    'avg_age_years' => self::averageAge($bought),
                    'age_bands' => [
                        'under_3' => $ages->filter(fn (float $age) => $age < 3)->count(),
                        'from_3_to_5' => $ages->filter(fn (float $age) => $age >= 3 && $age <= 5)->count(),
                        'over_5' => $ages->filter(fn (float $age) => $age > 5)->count(),
                    ],
                    'under_warranty' => $bought->filter(self::underWarranty(...))->count(),
                ];
            })
            ->sortBy([['total', 'desc'], ['name', 'asc']])
            ->values()
            ->all();
    }

    /**
     * Every contract with assets attached — all-time, the date range set aside; only the contract
     * filter narrows it. Per contract: its units, handed back, written off another way (owed to
     * the lessor), still out, days to its end, handed back before the end, and its state.
     *
     * @param  array<string, mixed>  $filters
     * @return list<array<string, mixed>>
     */
    private function contracts(array $filters): array
    {
        $contracts = Contract::query()
            ->whereHas('assets')
            ->when($filters['contract_id'] ?? null, fn (Builder $q, $id) => $q->whereKey((int) $id))
            ->with('vendor:id,name')
            ->get(['id', 'code', 'name', 'vendor_id', 'end_date']);
        $assets = Asset::query()
            ->whereIn('contract_id', $contracts->modelKeys())
            ->get(['id', 'contract_id', 'status', 'returned_to_vendor_at'])
            ->groupBy('contract_id');
        $today = today();

        return $contracts
            ->map(function (Contract $contract) use ($assets, $today) {
                $units = $assets->get($contract->id, collect());
                $left = $units->filter(fn (Asset $a) => $a->status === AssetStatus::Writeoff);
                $returned = $left->filter(fn (Asset $a) => $a->returned_to_vendor_at !== null);
                $stillOut = $units->count() - $left->count();
                $daysLeft = $contract->end_date === null ? null : (int) $today->diffInDays($contract->end_date, false);
                $early = $contract->end_date === null ? 0 : $returned
                    ->filter(fn (Asset $a) => $a->returned_to_vendor_at->lt($contract->end_date->copy()->startOfDay()))
                    ->count();

                return [
                    'id' => $contract->id,
                    'code' => (string) $contract->code,
                    'name' => $contract->name,
                    'vendor' => $contract->vendor?->name,
                    'end_date' => $contract->end_date?->format('Y-m-d'),
                    'units' => $units->count(),
                    'returned' => $returned->count(),
                    'written_off_other' => $left->count() - $returned->count(),
                    'still_out' => $stillOut,
                    'days_left' => $daysLeft,
                    'returned_early' => $early,
                    'flag' => match (true) {
                        $stillOut === 0 => 'all_returned',
                        $daysLeft !== null && $daysLeft < 0 => 'overdue',
                        $daysLeft !== null && $daysLeft <= self::ENDING_SOON_DAYS => 'ending_soon',
                        default => 'running',
                    },
                ];
            })
            ->sortBy([
                fn (array $a, array $b) => array_search($a['flag'], self::CONTRACT_FLAGS, true) <=> array_search($b['flag'], self::CONTRACT_FLAGS, true),
                fn (array $a, array $b) => ($a['end_date'] ?? '9999') <=> ($b['end_date'] ?? '9999'),
            ])
            ->values()
            ->all();
    }

    /** "2026-09" as "ก.ย. 2026" for the file. */
    private static function monthTh(string $month): string
    {
        $at = Carbon::createFromFormat('Y-m', $month)->startOfMonth();

        return self::MONTHS_TH[$at->month - 1].' '.$at->year;
    }

    /**
     * The breakdown as sheets: by month, by reason, by category, then the contracts.
     *
     * @param  array<string, mixed>  $filters
     * @return list<array{title: string, headings: list<string>, rows: list<list<string|int|float|null>>}>
     */
    public function exportSections(User $viewer, array $filters): array
    {
        $breakdown = $this->breakdown($viewer, $filters);

        return [
            [
                'title' => 'แยกตามเดือน',
                'headings' => ['เดือน', 'ทั้งหมด', 'ซื้อ', 'เช่า คืนผู้ให้เช่า', 'เช่า ตัดด้วยเหตุผลอื่น'],
                'rows' => array_map(
                    fn (array $m) => [self::monthTh($m['month']), $m['total'], $m['bought'], $m['returned'], $m['rented_other']],
                    $breakdown['months'],
                ),
            ],
            [
                'title' => 'แยกตามเหตุผล',
                'headings' => ['เหตุผล', 'ทั้งหมด', 'ซื้อ', 'เช่า'],
                'rows' => array_map(
                    fn (array $r) => [match ($r['key']) {
                        'returned' => 'คืนผู้ให้เช่า',
                        'none' => 'ไม่ระบุเหตุผล',
                        default => $r['name'],
                    }, $r['total'], $r['bought'], $r['rented']],
                    $breakdown['reasons'],
                ),
            ],
            [
                'title' => 'แยกตามหมวดหมู่',
                'headings' => ['หมวดหมู่', 'ทั้งหมด', 'ซื้อ', 'เช่า', 'มูลค่าซื้อ', 'อายุใช้งานเฉลี่ย (ปี)', 'ไม่ถึง 3 ปี', '3-5 ปี', 'เกิน 5 ปี', 'ยังมีประกัน'],
                'rows' => array_map(
                    fn (array $c) => [
                        $c['category_id'] === null ? self::NO_CATEGORY['name_th'] : ($c['name_th'] ?: $c['name']),
                        $c['total'], $c['bought'], $c['rented'], $c['bought_value'], $c['avg_age_years'],
                        $c['age_bands']['under_3'], $c['age_bands']['from_3_to_5'], $c['age_bands']['over_5'], $c['under_warranty'],
                    ],
                    $breakdown['categories'],
                ),
            ],
            [
                'title' => 'เครื่องเช่าตามสัญญา',
                'headings' => ['สัญญา', 'ชื่อสัญญา', 'ผู้ให้เช่า', 'สิ้นสุดสัญญา', 'เครื่องในสัญญา', 'คืนแล้ว', 'ตัดด้วยเหตุผลอื่น', 'ยังไม่คืน', 'เหลือ (วัน)', 'คืนก่อนกำหนด', 'สถานะ'],
                'rows' => array_map(
                    fn (array $c) => [
                        $c['code'], $c['name'], $c['vendor'], $c['end_date'], $c['units'], $c['returned'], $c['written_off_other'],
                        $c['still_out'], $c['days_left'], $c['returned_early'], self::CONTRACT_FLAG_TH[$c['flag']],
                    ],
                    $breakdown['contracts'],
                ),
            ],
        ];
    }
}
