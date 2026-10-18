<?php

namespace App\Services\Report\Contract;

use App\Enums\Asset\AssetSource;
use App\Enums\Asset\AssetStatus;
use App\Models\Asset\Asset;
use App\Models\Contract\Contract;
use App\Models\Settings\Category;
use App\Models\Settings\Vendor;
use App\Models\User;
use App\Services\Report\Asset\AssetColumns;
use App\Services\Report\Tabular\CellDate;
use App\Services\Report\Tabular\Options;
use App\Services\Report\Tabular\ReportColumn;
use App\Services\Report\Tabular\ReportFilter;
use App\Services\Report\Tabular\ReportSummary;
use App\Services\Report\Tabular\TabularReport;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * "สัญญาเช่าและทรัพย์สิน" (Report Center → Contracts): hardware contracts and the assets linked to them,
 * the rented units that go back to the lessor, and rent per unit against the purchase price of the same model.
 * The list is one row per linked asset; breakdown() feeds the tiles and the two cards above it.
 */
class ContractRentalsReport extends TabularReport
{
    use AssetColumns;

    private const SCOPE_KEYS = ['open' => 'rep_crent_scope_open', 'all' => 'rep_crent_scope_all'];

    private const LIST_KEYS = ['all' => 'rep_crent_list_all', 'return' => 'rep_crent_list_return'];

    private const SOURCE_KEYS = ['rented' => 'rep_src_rented', 'purchased' => 'rep_src_purchased'];

    private const SOURCE_TH = ['rented' => 'เช่า', 'purchased' => 'ซื้อ'];

    /** Where a contract's linked assets came from: any rented unit makes it a rental. */
    private const KIND_TH = ['rent' => 'เช่า', 'buy' => 'ซื้อ', 'none' => 'ไม่ผูกเครื่อง'];

    /** A contract's state as the /contracts list words it. */
    private const STATE_KEYS = [
        'active' => 'contract_active', 'reminder' => 'expiring_soon', 'due_today' => 'contract_due_today', 'overdue' => 'contract_overdue',
        'cancelled' => 'contract_cancelled', 'expired' => 'contract_expired',
    ];

    private const STATE_TH = [
        'active' => 'ใช้งาน', 'reminder' => 'ใกล้หมดอายุ', 'due_today' => 'ครบกำหนดวันนี้', 'overdue' => 'เกินกำหนด', 'cancelled' => 'ยกเลิกแล้ว', 'expired' => 'สิ้นสุดแล้ว',
    ];

    /** Asset statuses in the order of Settings → Assets, written off last. */
    private const STATUSES = ['ready', 'deployed', 'common', 'pending_acceptance', 'pending_return', 'writeoff'];

    /** @var array<string, Collection<int, array<string, mixed>>> facts per filter set, so tiles, cards and the file share one read */
    private array $facts = [];

    /** Rented units on a contract ending within this many days must go back soon. */
    private const RETURN_DAYS = 90;

    public function key(): string
    {
        return 'contracts.rentals';
    }

    public function title(): string
    {
        return 'สัญญาเช่าและทรัพย์สิน';
    }

    public function filters(): array
    {
        return [
            ReportFilter::select('scope', Options::fromLabels(self::SCOPE_KEYS), 'open')->labelKey('rep_fl_crent_scope'),
            ReportFilter::select('vendor_id', self::vendorOptions()),
            ReportFilter::select('category_id', self::categoryOptions())->labelKey('rep_fl_crent_category'),
            ReportFilter::select('list', Options::fromLabels(self::LIST_KEYS), 'all')->labelKey('rep_fl_crent_list'),
        ];
    }

    /** @return list<array{value: int, label: string, label_th: ?string}> */
    private static function vendorOptions(): array
    {
        return Vendor::query()
            ->whereIn('id', Contract::query()->where('type', 'hardware')->whereNotNull('vendor_id')->select('vendor_id'))
            ->orderBy('name')->get(['id', 'name', 'name_th'])
            ->map(fn (Vendor $v) => ['value' => $v->id, 'label' => $v->name, 'label_th' => $v->name_th])->all();
    }

    /** @return list<array{value: int, label: string, label_th: ?string}> */
    private static function categoryOptions(): array
    {
        $linked = Asset::query()
            ->join('contracts', 'contracts.id', '=', 'assets.contract_id')
            ->where('contracts.type', 'hardware')
            ->whereNotNull('assets.category_id')
            ->select('assets.category_id');

        return Category::query()->whereIn('id', $linked)->orderBy('name')->get(['id', 'name', 'name_th'])
            ->map(fn (Category $c) => ['value' => $c->id, 'label' => $c->name, 'label_th' => $c->name_th])->all();
    }

    /** @param array<string, mixed> $filters */
    private static function openOnly(array $filters): bool
    {
        return ($filters['scope'] ?? 'open') !== 'all';
    }

    /**
     * Hardware contracts in scope: open (not cancelled, not expired) or all, narrowed by vendor.
     *
     * @param  array<string, mixed>  $filters
     */
    private function contracts(array $filters): Builder
    {
        return Contract::query()
            ->where('contracts.type', 'hardware')
            ->when(self::openOnly($filters), fn (Builder $q) => $q->whereNull('contracts.cancelled_at')->whereNull('contracts.expired_at'))
            ->when($filters['vendor_id'] ?? null, fn (Builder $q, $id) => $q->where('contracts.vendor_id', (int) $id));
    }

    public function query(User $viewer, array $filters): Builder
    {
        $returnBy = today()->addDays(self::RETURN_DAYS)->toDateString();

        return Asset::query()
            ->select('assets.*')
            ->join('contracts', 'contracts.id', '=', 'assets.contract_id')
            ->whereIn('assets.contract_id', $this->contracts($filters)->select('contracts.id'))
            ->when($filters['category_id'] ?? null, fn (Builder $q, $id) => $q->where('assets.category_id', (int) $id))
            ->when(($filters['list'] ?? 'all') === 'return', fn (Builder $q) => $q
                ->where('assets.source', AssetSource::Rented->value)
                ->where('assets.status', '!=', AssetStatus::Writeoff->value)
                ->where(fn (Builder $w) => $w
                    ->whereNotNull('contracts.cancelled_at')
                    ->orWhereNotNull('contracts.expired_at')
                    ->orWhereDate('contracts.end_date', '<=', $returnBy)))
            ->with([
                'contract.vendor:id,name,name_th', 'category:id,name,name_th', 'brand:id,name', 'model:id,name',
                'ownerEmployee.department:id,code,name,name_th',
            ])
            ->orderBy('contracts.end_date')
            ->orderBy('assets.asset_code');
    }

    /** @return array<string, string> */
    protected function meanings(): array
    {
        return [
            'contract_state' => 'สถานะของสัญญาที่ทรัพย์สินผูกอยู่: ใช้งาน, ใกล้หมดอายุ (อยู่ในช่วงแจ้งเตือนของสัญญา), ครบกำหนดวันนี้, เกินกำหนด (เลยวันสิ้นสุดแต่ยังไม่ได้ปิดสัญญา), ยกเลิกแล้ว, สิ้นสุดแล้ว',
            'days_left' => 'จำนวนวันจากวันที่ส่งออกถึงวันที่สิ้นสุดสัญญา ติดลบ = เลยวันสิ้นสุดแล้ว ว่าง = สัญญาถูกยกเลิกหรือสิ้นสุดแล้ว',
            'status' => 'สถานะปัจจุบันของทรัพย์สิน: พร้อมส่งมอบ (อยู่ในคลัง), รอรับมอบ, ใช้งานอยู่, ส่วนกลาง, รอรับคืน, ตัดจำหน่าย (รวมเครื่องเช่าที่คืนผู้ให้เช่าแล้ว)',
            'holder' => 'ผู้ถือปัจจุบันในรูปแบบ ชื่อ (รหัสพนักงาน) ถ้าเป็นส่วนกลางแสดงชื่อการใช้งานส่วนกลางที่บันทึกไว้ ว่าง = ไม่มีผู้ถือ เช่นอยู่ในคลัง',
        ];
    }

    public function columns(): array
    {
        return [
            ReportColumn::text('asset_code', 'รหัสทรัพย์สิน', fn (Asset $a) => $a->asset_code)->linkTo('/assets', fn (Asset $a) => $a->id),
            ReportColumn::localized('category', 'หมวดหมู่', fn (Asset $a) => $a->category ? ['name' => $a->category->name, 'name_th' => $a->category->name_th] : null)
                ->labelKey('rep_c_asset_category'),
            ReportColumn::text('brand', 'ยี่ห้อ', fn (Asset $a) => $a->brand?->name),
            ReportColumn::text('model', 'รุ่น', fn (Asset $a) => $a->model?->name),
            ReportColumn::enum('source', 'ที่มา', fn (Asset $a) => $a->source, self::SOURCE_KEYS, self::SOURCE_TH),
            ReportColumn::enum('status', 'สถานะ', fn (Asset $a) => $a->status, self::STATUS_KEYS, self::STATUS_TH),
            ReportColumn::text('holder', 'ผู้ถือ', fn (Asset $a) => $this->resolveHolder($a)),
            ReportColumn::text('holder_code', 'รหัสพนักงานผู้ถือ', fn (Asset $a) => $a->ownerEmployee?->code)->sheetOnly()->describe('รหัสพนักงานที่ถือทรัพย์สินอยู่ ใช้เชื่อมกับตารางพนักงาน (ว่าง = ไม่มีพนักงานถือ เช่น อยู่ในคลังหรือเป็นส่วนกลาง)'),
            ReportColumn::localized('department', 'แผนก', fn (Asset $a) => $this->resolveDepartment($a))->withCode('รหัสแผนก', 'รหัสแผนกในระบบ ใช้เชื่อมกับตารางแผนกใน Power BI (ชื่อแผนกอาจเปลี่ยนได้ รหัสไม่เปลี่ยน)'),
            ReportColumn::text('contract_code', 'เลขที่สัญญา', fn (Asset $a) => $a->contract?->code)
                ->labelKey('rep_c_code')
                ->linkTo('/contracts', fn (Asset $a) => $a->contract_id),
            ReportColumn::text('contract_name', 'ชื่อสัญญา', fn (Asset $a) => $a->contract?->name)->labelKey('rep_c_name')->hiddenByDefault(),
            ReportColumn::localized('vendor', 'ผู้ขาย', fn (Asset $a) => $a->contract?->vendor ? ['name' => $a->contract->vendor->name, 'name_th' => $a->contract->vendor->name_th] : null)
                ->hiddenByDefault(),
            ReportColumn::date('end_date', 'วันที่สิ้นสุด', fn (Asset $a) => $a->contract?->end_date)->labelKey('rep_crent_c_end'),
            ReportColumn::enum('contract_state', 'สถานะสัญญา', fn (Asset $a) => $a->contract ? self::state($a->contract) : null, self::STATE_KEYS, self::STATE_TH)
                ->labelKey('rep_crent_c_state'),
            // A closed contract has no time left, only its state.
            ReportColumn::daysLeft('days_left', 'เหลือ (วัน)', fn (Asset $a) => $a->contract && ! self::closed($a->contract) ? $a->contract->end_date : null),
        ];
    }

    private static function closed(Contract $contract): bool
    {
        return $contract->cancelled_at !== null || $contract->expired_at !== null;
    }

    /** active / reminder / due_today / overdue / cancelled / expired — the /contracts status and its time-left tone. */
    private static function state(Contract $contract): string
    {
        return match (true) {
            $contract->expired_at !== null => 'expired',
            $contract->cancelled_at !== null => 'cancelled',
            $contract->daysRemaining() < 0 => 'overdue',
            $contract->daysRemaining() === 0 => 'due_today',
            $contract->isInReminder() => 'reminder',
            default => 'active',
        };
    }

    /**
     * One entry per hardware contract in scope with its assets (under the category filter) and
     * where it stands. Contracts with no asset in the chosen category drop out.
     *
     * @param  array<string, mixed>  $filters
     * @return Collection<int, array<string, mixed>>
     */
    private function facts(array $filters): Collection
    {
        return $this->facts[md5(serialize($filters))] ??= $this->readFacts($filters);
    }

    /**
     * @param  array<string, mixed>  $filters
     * @return Collection<int, array<string, mixed>>
     */
    private function readFacts(array $filters): Collection
    {
        $contracts = $this->contracts($filters)->with('vendor:id,name,name_th')->get();
        $assets = Asset::query()
            ->whereIn('assets.contract_id', $contracts->modelKeys())
            ->leftJoin('asset_models', 'asset_models.id', '=', 'assets.model_id')
            ->leftJoin('brands', 'brands.id', '=', 'asset_models.brand_id')
            ->leftJoin('categories', 'categories.id', '=', 'assets.category_id')
            ->get([
                'assets.id', 'assets.contract_id', 'assets.model_id', 'assets.category_id', 'assets.source', 'assets.status',
                'asset_models.name as model_name', 'brands.name as brand_name',
                'categories.name as category_name', 'categories.name_th as category_name_th',
            ])
            ->map(fn (Asset $a) => [
                'contract_id' => (int) $a->contract_id,
                'model_id' => $a->model_id === null ? null : (int) $a->model_id,
                'model' => $a->getAttribute('model_name'),
                'brand' => $a->getAttribute('brand_name'),
                'category_id' => $a->category_id === null ? null : (int) $a->category_id,
                'category' => ['name' => $a->getAttribute('category_name'), 'name_th' => $a->getAttribute('category_name_th')],
                'rented' => $a->source === AssetSource::Rented,
                'status' => $a->status instanceof AssetStatus ? $a->status->value : (string) $a->status,
            ])
            ->groupBy('contract_id');
        $category = $filters['category_id'] ?? null;

        return $contracts
            ->map(function (Contract $contract) use ($assets, $category) {
                $all = $assets->get($contract->id, collect());
                $shown = $category ? $all->where('category_id', (int) $category)->values() : $all;
                $live = fn (array $a) => $a['status'] !== AssetStatus::Writeoff->value;
                $out = $shown->filter(fn (array $a) => $a['rented'] && $live($a))->values();
                $liveUnits = $all->filter($live)->count();
                $rentedUnits = $all->filter(fn (array $a) => $a['rented'] && $live($a))->count();
                $days = $contract->daysRemaining();
                $closed = self::closed($contract);
                $ended = $closed || $days <= 0;
                $kind = $shown->contains('rented', true) ? 'rent' : ($shown->isNotEmpty() ? 'buy' : 'none');
                $monthly = ContractBilling::monthlyCost($contract);

                return [
                    'contract' => $contract,
                    'assets' => $shown,
                    'out' => $out,
                    'kind' => $kind,
                    'closed' => $closed,
                    'ended' => $ended,
                    'days' => $days,
                    'monthly' => $monthly,
                    // A lease shares its rent over the rented units; bought units on it are serviced, not rented
                    'per_unit' => match (true) {
                        $kind === 'rent' => $rentedUnits === 0 ? null : $monthly / $rentedUnits,
                        $kind === 'buy' => $liveUnits === 0 ? null : $monthly / $liveUnits,
                        default => null,
                    },
                    'late' => $ended ? $out : collect(),
                    'soon' => ! $ended && $days <= self::RETURN_DAYS ? $out : collect(),
                ];
            })
            ->filter(fn (array $c) => ! $category || $c['assets']->isNotEmpty())
            ->values();
    }

    /** Contracts needing action first: units past their end, units due back soon, then bought ones ending. */
    private static function rank(array $c): int
    {
        return match (true) {
            $c['late']->isNotEmpty() => 0,
            $c['soon']->isNotEmpty() => 1,
            $c['kind'] === 'buy' && $c['ended'] => 2,
            $c['kind'] === 'buy' && $c['days'] <= self::RETURN_DAYS => 3,
            default => 4,
        };
    }

    /**
     * The tiles' figures.
     *
     * @param  Collection<int, array<string, mixed>>  $facts
     * @return array{contracts: array{total: int, rent: int, buy: int, none: int}, rented_in_use: int, avg_per_unit: ?float, due_soon: int, due_soon_held: int, due_soon_ready: int, ended_out: int, ended_out_contracts: int, unlinked: int, unlinked_yearly: float}
     */
    private static function tiles(Collection $facts): array
    {
        $running = $facts->reject(fn (array $c) => $c['ended']);
        $rentLive = $running->filter(fn (array $c) => $c['kind'] === 'rent' && $c['out']->isNotEmpty());
        $rentUnits = $rentLive->sum(fn (array $c) => $c['out']->count());
        $soon = $facts->flatMap(fn (array $c) => $c['soon']->all());
        $late = $facts->filter(fn (array $c) => $c['late']->isNotEmpty());
        $unlinked = $facts->where('kind', 'none');

        return [
            'contracts' => [
                'total' => $facts->count(),
                'rent' => $facts->where('kind', 'rent')->count(),
                'buy' => $facts->where('kind', 'buy')->count(),
                'none' => $unlinked->count(),
            ],
            'rented_in_use' => (int) $running->sum(fn (array $c) => $c['out']->count()),
            // Same per-unit cost as the contract rows, weighted by the units counted here.
            'avg_per_unit' => $rentUnits > 0 ? round($rentLive->sum(fn (array $c) => ($c['per_unit'] ?? 0) * $c['out']->count()) / $rentUnits, 2) : null,
            'due_soon' => $soon->count(),
            'due_soon_held' => $soon->where('status', AssetStatus::Deployed->value)->count(),
            'due_soon_ready' => $soon->where('status', AssetStatus::Ready->value)->count(),
            'ended_out' => (int) $late->sum(fn (array $c) => $c['late']->count()),
            'ended_out_contracts' => $late->count(),
            'unlinked' => $unlinked->count(),
            'unlinked_yearly' => round((float) $unlinked->reject(fn (array $c) => $c['closed'])->sum(fn (array $c) => $c['monthly'] * 12), 2),
        ];
    }

    public function summary(Builder $query, array $filters): array
    {
        $tiles = self::tiles($this->facts($filters));
        $split = fn (string $key, string $labelKey, string $tone) => ['key' => $key, 'label_key' => $labelKey, 'tone' => $tone, 'value' => $tiles['contracts'][$key]];
        $open = self::openOnly($filters);

        return [
            ReportSummary::make($open ? 'crent_contracts_open' : 'crent_contracts_all', $open ? 'สัญญาฮาร์ดแวร์ที่เปิดอยู่ (สัญญา)' : 'สัญญาฮาร์ดแวร์ (สัญญา)', $tiles['contracts']['total'])
                ->withSplit([
                    $split('rent', 'rep_src_rented', 'violet'),
                    $split('buy', 'rep_src_purchased', 'orange'),
                    $split('none', 'rep_crent_src_none', 'gray'),
                ]),
            ReportSummary::make('crent_rented_in_use', 'เครื่องเช่าที่ใช้อยู่ (เครื่อง)', $tiles['rented_in_use'])
                ->withNote($tiles['avg_per_unit'] === null
                    ? ['label_key' => 'rep_crent_rented_none']
                    : ['label_key' => 'rep_crent_rented_avg', 'texts' => ['avg' => number_format($tiles['avg_per_unit'], 2)]]),
            ReportSummary::make('crent_due_soon', 'ต้องคืนภายใน 90 วัน (เครื่อง)', $tiles['due_soon'])->withAttention('amber'),
            ReportSummary::make('crent_ended_out', 'หมดสัญญาแล้ว ยังไม่คืน (เครื่อง)', $tiles['ended_out'])->withAttention('red'),
            ReportSummary::make('crent_unlinked', 'สัญญาที่ไม่ผูกเครื่อง (สัญญา)', $tiles['unlinked']),
            ReportSummary::make('crent_unlinked_yearly', 'ค่าใช้จ่ายต่อปีของสัญญาที่ไม่ผูกเครื่อง', $tiles['unlinked_yearly'], null, 'money'),
        ];
    }

    /**
     * What the page draws above the list: the tiles, every contract with its assets by status, and
     * rent against the purchase price per model. Codes and numbers only — the page writes the words.
     *
     * @param  array<string, mixed>  $filters
     * @return array{scope: string, tiles: array<string, mixed>, contracts: list<array<string, mixed>>, models: list<array<string, mixed>>}
     */
    public function breakdown(User $viewer, array $filters): array
    {
        $facts = $this->facts($filters);

        return [
            'scope' => self::openOnly($filters) ? 'open' : 'all',
            'tiles' => self::tiles($facts),
            'contracts' => self::contractRows($facts),
            'models' => self::models($facts),
        ];
    }

    /**
     * One row per contract: linked ones by rank, then end date and code; unlinked ones after them,
     * open before closed, soonest end first.
     *
     * @param  Collection<int, array<string, mixed>>  $facts
     * @return list<array<string, mixed>>
     */
    private static function contractRows(Collection $facts): array
    {
        $row = function (array $c) {
            $contract = $c['contract'];
            $counts = $c['assets']->countBy('status');

            return [
                'id' => $contract->id,
                'code' => (string) $contract->code,
                'name' => $contract->name,
                'vendor' => $contract->vendor ? ['name' => $contract->vendor->name, 'name_th' => $contract->vendor->name_th] : null,
                'kind' => $c['kind'],
                'units' => $c['assets']->count(),
                'statuses' => array_combine(self::STATUSES, array_map(fn (string $s) => (int) ($counts[$s] ?? 0), self::STATUSES)),
                'per_unit' => $c['per_unit'] === null ? null : round($c['per_unit'], 2),
                'yearly' => round($c['monthly'] * 12, 2),
                'end_date' => $contract->end_date->format('Y-m-d'),
                'days_left' => $c['days'],
                'state' => self::state($contract),
                'due_soon' => $c['soon']->count(),
                'ended_out' => $c['late']->count(),
                'rank' => self::rank($c),
            ];
        };
        $linked = $facts->reject(fn (array $c) => $c['kind'] === 'none')->map($row)
            ->sortBy([['rank', 'asc'], ['end_date', 'asc'], ['code', 'asc']]);
        $unlinked = $facts->where('kind', 'none')->map(fn (array $c) => [...$row($c), 'closed' => $c['closed']])
            ->sortBy([['closed', 'asc'], ['end_date', 'asc'], ['code', 'asc']])
            ->map(function (array $r) {
                unset($r['closed']);

                return $r;
            });

        return [...$linked->values()->all(), ...$unlinked->values()->all()];
    }

    /**
     * Rent per unit against the average price of bought units of the same model, for models rented on
     * contracts still running. Rent per unit = Σ (contract per unit × its units) ÷ units; the term is the
     * unit-weighted contract length; most extra over buying first, models with nothing to compare last.
     *
     * @param  Collection<int, array<string, mixed>>  $facts
     * @return list<array<string, mixed>>
     */
    private static function models(Collection $facts): array
    {
        $groups = [];
        foreach ($facts as $c) {
            if ($c['kind'] !== 'rent' || $c['ended'] || $c['out']->isEmpty() || $c['per_unit'] === null) {
                continue;
            }
            $term = max(1, $c['contract']->durationMonths());
            foreach ($c['out']->groupBy(fn (array $a) => (string) $a['model_id']) as $key => $units) {
                $first = $units->first();
                $groups[$key] ??= [
                    'model_id' => $first['model_id'], 'name' => $first['model'], 'brand' => $first['brand'], 'category' => $first['category'],
                    'units' => 0, 'monthly' => 0.0, 'term_units' => 0, 'contracts' => [],
                ];
                $groups[$key]['units'] += $units->count();
                $groups[$key]['monthly'] += $c['per_unit'] * $units->count();
                $groups[$key]['term_units'] += $term * $units->count();
                $groups[$key]['contracts'][$c['contract']->id] = true;
            }
        }
        if ($groups === []) {
            return [];
        }

        $bought = Asset::query()
            ->whereIn('model_id', array_filter(array_column($groups, 'model_id')))
            ->where('source', AssetSource::Purchased->value)
            ->where('value', '>', 0)
            ->groupBy('model_id')
            ->selectRaw('model_id, COUNT(*) as units, AVG(value) as average')
            ->get()
            ->keyBy('model_id');

        return collect($groups)
            ->map(function (array $g) use ($bought) {
                $perUnit = $g['monthly'] / $g['units'];
                $term = $g['term_units'] / $g['units'];
                $rentTotal = $perUnit * $term;
                $buy = $g['model_id'] === null ? null : $bought->get($g['model_id']);
                $average = $buy ? (float) $buy->getAttribute('average') : null;

                return [
                    'model_id' => $g['model_id'],
                    'name' => $g['name'],
                    'brand' => $g['brand'],
                    'category' => $g['category'],
                    'contracts' => count($g['contracts']),
                    'units' => $g['units'],
                    'per_unit' => round($perUnit, 2),
                    'term_months' => round($term, 1),
                    'rent_total' => round($rentTotal, 2),
                    'avg_buy' => $average === null ? null : round($average, 2),
                    'bought' => $buy ? (int) $buy->getAttribute('units') : 0,
                    'break_even_months' => $average === null || $perUnit <= 0 ? null : round($average / $perUnit, 1),
                    'over_buy' => $average === null ? null : round($rentTotal / $average - 1, 4),
                ];
            })
            ->sortBy([
                fn (array $a, array $b) => ($b['over_buy'] ?? -INF) <=> ($a['over_buy'] ?? -INF),
                fn (array $a, array $b) => $b['units'] <=> $a['units'],
                fn (array $a, array $b) => (string) $a['name'] <=> (string) $b['name'],
            ])
            ->values()
            ->all();
    }

    /**
     * The two cards as sheets: contracts with their assets by status, and rent against buying per model.
     *
     * @param  array<string, mixed>  $filters
     * @return list<array{title: string, headings: list<string>, rows: list<list<string|int|float|null>>}>
     */
    public function exportSections(User $viewer, array $filters): array
    {
        $breakdown = $this->breakdown($viewer, $filters);
        $name = fn (?array $label) => $label === null ? null : (($label['name_th'] ?? null) ?: ($label['name'] ?? null));

        return [
            [
                'title' => 'สถานะเครื่องตามสัญญา',
                'headings' => [
                    'เลขที่สัญญา', 'ชื่อสัญญา', 'ผู้ขาย', 'ที่มา', 'เครื่อง', ...array_map(fn (string $s) => self::STATUS_TH[$s], self::STATUSES),
                    'ค่าเช่าต่อเครื่องต่อเดือน', 'ค่าเช่าต่อปี', 'วันที่สิ้นสุด', 'สถานะสัญญา', 'เหลือ (วัน)',
                ],
                'rows' => array_map(fn (array $c) => [
                    $c['code'], $c['name'], $name($c['vendor']), self::KIND_TH[$c['kind']], $c['units'], ...array_values($c['statuses']),
                    $c['per_unit'], $c['yearly'], CellDate::date($c['end_date']), self::STATE_TH[$c['state']],
                    in_array($c['state'], ['cancelled', 'expired'], true) ? null : $c['days_left'],
                ], $breakdown['contracts']),
            ],
            [
                'title' => 'ค่าเช่าเทียบราคาซื้อ',
                'headings' => [
                    'ยี่ห้อ', 'รุ่น', 'หมวดหมู่', 'สัญญา', 'เครื่องเช่า', 'ค่าเช่าต่อเครื่องต่อเดือน', 'อายุสัญญาเฉลี่ย (เดือน)',
                    'ค่าเช่าตลอดสัญญา', 'ราคาซื้อเฉลี่ย', 'เครื่องซื้อที่ใช้เทียบ', 'เช่าครบราคาซื้อใน (เดือน)',
                ],
                'rows' => array_map(fn (array $m) => [
                    $m['brand'], $m['name'] ?? 'ไม่ระบุรุ่น', $name($m['category']), $m['contracts'], $m['units'], $m['per_unit'], $m['term_months'],
                    $m['rent_total'], $m['avg_buy'], $m['bought'], $m['break_even_months'],
                ], $breakdown['models']),
            ],
        ];
    }
}
