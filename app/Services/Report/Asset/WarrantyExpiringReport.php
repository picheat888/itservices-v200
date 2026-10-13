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
use App\Support\DateDisplay;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * "ประกันใกล้หมดอายุ" (Report Center → Assets): purchased assets — never a lifetime warranty, never
 * written off — whose warranty runs out inside the chosen window (soonest first), or has already run
 * out (state=expired, latest first), so IT knows what to renew, replace or check before handing out.
 *
 * Tiles: due in the window (by where the asset is now), what those cost, due within 30 days, already
 * expired, and how many bought assets carry a warranty date at all. breakdown() (its own endpoint,
 * AssetWarrantyBreakdownController) is what the page draws above the list: the next 12 months, time
 * left in bands, and the categories and vendors split into one non-overlapping set of periods that
 * follows the window. The state filter narrows only the list; the file carries the breakdown as sheets.
 */
class WarrantyExpiringReport extends TabularReport
{
    use AssetColumns;

    private const STATE_KEYS = ['soon' => 'rep_wty_state_soon', 'expired' => 'rep_wty_state_expired'];

    private const WINDOWS = [30, 60, 90, 180, 365];

    private const DEFAULT_WINDOW = 90;

    /** Due within this many days is the amber tile. */
    private const SOON_DAYS = 30;

    /** Statuses in the order and colours of Settings → Assets. */
    private const STATUS_TONES = [
        'ready' => 'asset-ready', 'deployed' => 'asset-deployed', 'common' => 'asset-common',
        'pending_acceptance' => 'asset-pending-acceptance', 'pending_return' => 'asset-pending-return',
    ];

    /** Time left in bands, upper bound in days (null = beyond a year); expired comes first. */
    private const BANDS = ['d30' => 30, 'd90' => 90, 'd180' => 180, 'd365' => 365, 'later' => null];

    private const BAND_TH = [
        'expired' => 'หมดแล้ว', 'd30' => 'ภายใน 30 วัน', 'd90' => '31-90 วัน', 'd180' => '91-180 วัน',
        'd365' => '181-365 วัน', 'later' => 'เกิน 1 ปี',
    ];

    private const NO_CATEGORY_TH = 'ไม่ระบุหมวดหมู่';

    private const NO_VENDOR_TH = 'ไม่ระบุผู้ขาย';

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
            ReportFilter::select('state', Options::fromLabels(self::STATE_KEYS), 'soon')->labelKey('rep_fl_wty_state'),
            ReportFilter::select('within', Options::dayWindows(self::WINDOWS), self::DEFAULT_WINDOW),
            ReportFilter::select('category_id', Options::categories())->labelKey('rep_fl_asset_category'),
            ReportFilter::select('vendor_id', Options::vendors()),
            ReportFilter::select('department_id', Options::departments()),
        ];
    }

    /**
     * Bought, not lifetime, not written off, narrowed by category / vendor / the holder's department.
     *
     * @param  array<string, mixed>  $filters
     */
    private function bought(array $filters): Builder
    {
        return Asset::query()
            ->where('assets.source', AssetSource::Purchased->value)
            ->where('assets.warranty_lifetime', false)
            ->where('assets.status', '!=', AssetStatus::Writeoff->value)
            ->when($filters['category_id'], fn (Builder $q, $id) => $q->where('assets.category_id', (int) $id))
            ->when($filters['vendor_id'], fn (Builder $q, $id) => $q->where('assets.vendor_id', (int) $id))
            ->when($filters['department_id'], fn (Builder $q, $id) => $q->whereHas('ownerEmployee', fn (Builder $e) => $e->where('department_id', (int) $id)));
    }

    /** @param array<string, mixed> $filters */
    private static function window(array $filters): int
    {
        return (int) ($filters['within'] ?? self::DEFAULT_WINDOW);
    }

    public function query(User $viewer, array $filters): Builder
    {
        $query = $this->bought($filters)
            ->with(['category:id,name,name_th', 'brand:id,name', 'model:id,name', 'ownerEmployee.department:id,name,name_th', 'vendor:id,name,name_th'])
            ->whereNotNull('assets.warranty_end');

        if ($filters['state'] === 'expired') {
            return $query->whereDate('assets.warranty_end', '<', today())->orderByDesc('assets.warranty_end')->orderBy('assets.id');
        }

        return $query
            ->whereDate('assets.warranty_end', '>=', today())
            ->whereDate('assets.warranty_end', '<=', today()->addDays(self::window($filters)))
            ->orderBy('assets.warranty_end')
            ->orderBy('assets.id');
    }

    public function columns(): array
    {
        return [
            ReportColumn::text('asset_code', 'รหัสทรัพย์สิน', fn (Asset $a) => $a->asset_code)->linkTo('/assets', fn (Asset $a) => $a->id),
            ReportColumn::localized('category', 'หมวดหมู่', fn (Asset $a) => $a->category ? ['name' => $a->category->name, 'name_th' => $a->category->name_th] : null)
                ->labelKey('rep_c_asset_category'),
            // Drawn before the model on the page ("Dell Latitude 5440").
            ReportColumn::text('brand', 'ยี่ห้อ', fn (Asset $a) => $a->brand?->name)->hiddenByDefault(),
            ReportColumn::text('model', 'รุ่น', fn (Asset $a) => $a->model?->name),
            ReportColumn::text('holder', 'ผู้ถือ', fn (Asset $a) => $this->resolveHolder($a)),
            ReportColumn::localized('department', 'แผนก', fn (Asset $a) => $this->resolveDepartment($a)),
            ReportColumn::localized('vendor', 'ผู้ขาย', fn (Asset $a) => $a->vendor ? ['name' => $a->vendor->name, 'name_th' => $a->vendor->name_th] : null),
            ReportColumn::enum('status', 'สถานะ', fn (Asset $a) => $a->status, self::STATUS_KEYS, self::STATUS_TH)->hiddenByDefault(),
            ReportColumn::date('purchase_date', 'วันที่ซื้อ', fn (Asset $a) => $a->purchase_date)->hiddenByDefault(),
            ReportColumn::money('value', 'มูลค่าซื้อ', fn (Asset $a) => $a->value)->hiddenByDefault(),
            ReportColumn::date('warranty_end', 'ประกันถึง', fn (Asset $a) => $a->warranty_end),
            ReportColumn::daysLeft('days_left', 'เหลือ (วัน)', fn (Asset $a) => $a->warranty_end),
        ];
    }

    /**
     * Every asset in scope with a warranty date, bare: id, code, status, value, days left, category, vendor.
     *
     * @param  array<string, mixed>  $filters
     * @return Collection<int, array{id: int, code: string, status: string, value: float, left: int, category: array{id: ?int, name: ?string, name_th: ?string}, vendor: array{id: ?int, name: ?string, name_th: ?string}}>
     */
    private function dated(array $filters): Collection
    {
        $today = today();

        return $this->bought($filters)
            ->whereNotNull('assets.warranty_end')
            ->leftJoin('categories', 'categories.id', '=', 'assets.category_id')
            ->leftJoin('vendors', 'vendors.id', '=', 'assets.vendor_id')
            ->orderBy('assets.warranty_end')
            ->orderBy('assets.asset_code')
            ->get([
                'assets.id', 'assets.asset_code', 'assets.status', 'assets.value', 'assets.warranty_end',
                'categories.id as category_ref', 'categories.name as category_name', 'categories.name_th as category_name_th',
                'vendors.id as vendor_ref', 'vendors.name as vendor_name', 'vendors.name_th as vendor_name_th',
            ])
            ->map(fn (Asset $a) => [
                'id' => $a->id,
                'code' => (string) $a->asset_code,
                'status' => $a->status instanceof \BackedEnum ? $a->status->value : (string) $a->status,
                'value' => (float) $a->value,
                'left' => (int) $today->diffInDays($a->warranty_end->copy()->startOfDay(), false),
                'category' => [
                    'id' => $a->getAttribute('category_ref') === null ? null : (int) $a->getAttribute('category_ref'),
                    'name' => $a->getAttribute('category_name'),
                    'name_th' => $a->getAttribute('category_name_th'),
                ],
                'vendor' => [
                    'id' => $a->getAttribute('vendor_ref') === null ? null : (int) $a->getAttribute('vendor_ref'),
                    'name' => $a->getAttribute('vendor_name'),
                    'name_th' => $a->getAttribute('vendor_name_th'),
                ],
            ]);
    }

    /** @param Collection<int, array<string, mixed>> $assets */
    private static function expired(Collection $assets): Collection
    {
        return $assets->filter(fn (array $a) => $a['left'] < 0)->values();
    }

    /** @param Collection<int, array<string, mixed>> $assets */
    private static function dueWithin(Collection $assets, int $days): Collection
    {
        return $assets->filter(fn (array $a) => $a['left'] >= 0 && $a['left'] <= $days)->values();
    }

    /**
     * How many of the assets sit in each status, in Settings order.
     *
     * @param  Collection<int, array<string, mixed>>  $assets
     * @return array<string, int>
     */
    private static function byStatus(Collection $assets): array
    {
        $counts = $assets->countBy('status');
        $statuses = [];
        foreach (array_keys(self::STATUS_TONES) as $status) {
            $statuses[$status] = (int) ($counts[$status] ?? 0);
        }

        return $statuses;
    }

    public function summary(Builder $query, array $filters): array
    {
        $within = self::window($filters);
        $assets = $this->dated($filters);
        $due = self::dueWithin($assets, $within);
        $soon = self::dueWithin($assets, self::SOON_DAYS);
        $expired = self::expired($assets);
        $bought = $this->bought($filters)->count();
        $noDate = $this->bought($filters)->whereNull('assets.warranty_end')->count();
        $noVendor = $assets->filter(fn (array $a) => $a['vendor']['id'] === null)->count();
        $statuses = self::byStatus($due);
        $nearest = $soon->first();

        return [
            ReportSummary::make("wty_within_{$within}d", "หมดภายใน {$within} วัน (เครื่อง)", $due->count())
                ->withSplit(array_values(array_filter(array_map(
                    fn (string $status, string $tone) => ['key' => $status, 'label_key' => self::STATUS_KEYS[$status], 'tone' => $tone, 'value' => $statuses[$status]],
                    array_keys(self::STATUS_TONES),
                    self::STATUS_TONES,
                ), fn (array $part) => $part['value'] > 0)))
                ->withNote($due->isEmpty() ? ['label_key' => 'rep_n_wty_within_none'] : null),
            ReportSummary::make('wty_value', 'มูลค่าซื้อที่ประกันจะหมด', (float) $due->sum('value'), null, 'money')
                ->withNote(['label_key' => 'rep_n_wty_value', 'values' => ['n' => $due->count()]]),
            ReportSummary::make('wty_within_30', 'หมดภายใน 30 วัน (เครื่อง)', $soon->count())
                ->withAttention('amber')
                ->withNote($nearest === null
                    ? ['label_key' => 'rep_n_wty_within_30_none']
                    : ['label_key' => 'rep_n_wty_nearest', 'values' => ['d' => $nearest['left']], 'texts' => ['code' => $nearest['code']]]),
            ReportSummary::make('wty_expired', 'หมดแล้ว ยังไม่ตัดจำหน่าย (เครื่อง)', $expired->count())
                ->withAttention('red')
                ->withNote($expired->isEmpty()
                    ? ['label_key' => 'rep_n_wty_expired_none']
                    : [
                        'label_key' => 'rep_n_wty_expired',
                        'values' => ['n' => $expired->where('status', 'ready')->count()],
                        'texts' => ['value' => number_format((float) $expired->sum('value'), 2)],
                    ]),
            ReportSummary::make('wty_dated', 'มีวันหมดประกัน (เครื่อง)', $assets->count(), 'blue')
                ->withShareOf($bought)
                ->withNote(['label_key' => 'rep_n_wty_dated', 'values' => ['bought' => $bought, 'no_date' => $noDate, 'no_vendor' => $noVendor]]),
        ];
    }

    /**
     * What the page draws above the list (see the class note). Codes and numbers only — the page
     * writes the words.
     *
     * @param  array<string, mixed>  $filters
     * @return array{within: int, months: list<array<string, mixed>>, bands: list<array<string, mixed>>, categories: list<array<string, mixed>>, category_totals: ?array<string, mixed>, vendors: list<array<string, mixed>>}
     */
    public function breakdown(User $viewer, array $filters): array
    {
        $within = self::window($filters);
        $assets = $this->dated($filters);

        return [
            'within' => $within,
            'months' => self::months($assets),
            'bands' => self::bands($assets),
            'categories' => self::categories($assets, $within),
            'category_totals' => $assets->isEmpty() ? null : self::groupFigures($assets, $within),
            'vendors' => self::vendors($assets, $within),
        ];
    }

    /**
     * This month and the next 11, by where each asset due that month is now (expired ones left out).
     *
     * @param  Collection<int, array<string, mixed>>  $assets
     * @return list<array{month: string, total: int, statuses: array<string, int>}>
     */
    private static function months(Collection $assets): array
    {
        $today = today();
        $byMonth = $assets
            ->filter(fn (array $a) => $a['left'] >= 0)
            ->groupBy(fn (array $a) => $today->copy()->addDays($a['left'])->format('Y-m'));

        $months = [];
        for ($i = 0, $month = $today->copy()->startOfMonth(); $i < 12; $i++, $month->addMonth()) {
            $group = $byMonth->get($month->format('Y-m'), collect());
            $months[] = ['month' => $month->format('Y-m'), 'total' => $group->count(), 'statuses' => self::byStatus($group)];
        }

        return $months;
    }

    /**
     * Expired, then time left in fixed bands, each split by where the assets are now.
     *
     * @param  Collection<int, array<string, mixed>>  $assets
     * @return list<array{key: string, total: int, statuses: array<string, int>}>
     */
    private static function bands(Collection $assets): array
    {
        $groups = ['expired' => self::expired($assets)];
        $from = 0;
        foreach (self::BANDS as $key => $to) {
            $groups[$key] = $assets->filter(fn (array $a) => $a['left'] >= $from && ($to === null || $a['left'] <= $to))->values();
            $from = ($to ?? 0) + 1;
        }

        return array_map(
            fn (string $key) => ['key' => $key, 'total' => $groups[$key]->count(), 'statuses' => self::byStatus($groups[$key])],
            array_keys($groups),
        );
    }

    /**
     * One row's figures for the category and vendor tables: its periods (expired / in the window /
     * window to a year / beyond a year — one place each), the nearest asset due in the window, how
     * many more fall in it (and on that same day), and the days to the next one due at all.
     *
     * @param  Collection<int, array<string, mixed>>  $assets
     * @return array{total: int, periods: array{expired: int, within: int, mid: int, later: int}, within_year: int, nearest: ?array{id: int, code: string, days_left: int}, more_in_window: int, more_same_day: int, next_days: ?int}
     */
    private static function groupFigures(Collection $assets, int $within): array
    {
        $upcoming = $assets->filter(fn (array $a) => $a['left'] >= 0)->sortBy([['left', 'asc'], ['code', 'asc']])->values();
        $due = $upcoming->filter(fn (array $a) => $a['left'] <= $within)->values();
        $first = $due->first();

        return [
            'total' => $assets->count(),
            'periods' => [
                'expired' => self::expired($assets)->count(),
                'within' => $due->count(),
                'mid' => $upcoming->filter(fn (array $a) => $a['left'] > $within && $a['left'] <= 365)->count(),
                'later' => $upcoming->filter(fn (array $a) => $a['left'] > max($within, 365))->count(),
            ],
            'within_year' => $upcoming->filter(fn (array $a) => $a['left'] <= 365)->count(),
            'nearest' => $first === null ? null : ['id' => $first['id'], 'code' => $first['code'], 'days_left' => $first['left']],
            'more_in_window' => max(0, $due->count() - 1),
            'more_same_day' => $first === null ? 0 : $due->where('left', $first['left'])->count() - 1,
            'next_days' => $upcoming->first()['left'] ?? null,
        ];
    }

    /**
     * One row per category: most due in the window first, then the one due soonest.
     *
     * @param  Collection<int, array<string, mixed>>  $assets
     * @return list<array<string, mixed>>
     */
    private static function categories(Collection $assets, int $within): array
    {
        return $assets
            ->groupBy(fn (array $a) => (string) $a['category']['id'])
            ->map(fn (Collection $group) => [
                'category_id' => $group->first()['category']['id'],
                'name' => $group->first()['category']['name'],
                'name_th' => $group->first()['category']['name_th'],
                ...self::groupFigures($group, $within),
            ])
            ->sortBy([
                fn (array $a, array $b) => $b['periods']['within'] <=> $a['periods']['within'],
                fn (array $a, array $b) => ($a['next_days'] ?? PHP_INT_MAX) <=> ($b['next_days'] ?? PHP_INT_MAX),
                fn (array $a, array $b) => $b['periods']['expired'] <=> $a['periods']['expired'],
                fn (array $a, array $b) => $b['total'] <=> $a['total'],
            ])
            ->values()
            ->all();
    }

    /**
     * One row per vendor, most due in the window first; assets with no vendor come last, apart.
     *
     * @param  Collection<int, array<string, mixed>>  $assets
     * @return list<array<string, mixed>>
     */
    private static function vendors(Collection $assets, int $within): array
    {
        return $assets
            ->groupBy(fn (array $a) => (string) $a['vendor']['id'])
            ->map(fn (Collection $group) => [
                'vendor_id' => $group->first()['vendor']['id'],
                'name' => $group->first()['vendor']['name'],
                'name_th' => $group->first()['vendor']['name_th'],
                ...self::groupFigures($group, $within),
            ])
            ->sortBy([
                fn (array $a, array $b) => ($a['vendor_id'] === null) <=> ($b['vendor_id'] === null),
                fn (array $a, array $b) => $b['periods']['within'] <=> $a['periods']['within'],
                fn (array $a, array $b) => $b['periods']['expired'] <=> $a['periods']['expired'],
                fn (array $a, array $b) => $b['total'] <=> $a['total'],
            ])
            ->values()
            ->all();
    }

    /**
     * The breakdown as sheets: by month, time left, by category, by vendor.
     *
     * @param  array<string, mixed>  $filters
     * @return list<array{title: string, headings: list<string>, rows: list<list<string|int|float|null>>}>
     */
    public function exportSections(User $viewer, array $filters): array
    {
        $breakdown = $this->breakdown($viewer, $filters);
        $within = $breakdown['within'];
        $statusHeadings = array_map(fn (string $status) => self::STATUS_TH[$status], array_keys(self::STATUS_TONES));
        $windowTh = $within === 365 ? '1 ปี' : "{$within} วัน";
        $periodHeadings = ['หมดแล้ว', "ภายใน {$windowTh}", ...($within < 365 ? [($within + 1).' วัน - 1 ปี'] : []), 'เกิน 1 ปี'];
        $periods = fn (array $row) => [
            $row['periods']['expired'], $row['periods']['within'], ...($within < 365 ? [$row['periods']['mid']] : []), $row['periods']['later'],
        ];
        $nearest = fn (array $row) => $row['nearest'] === null ? null : "{$row['nearest']['code']} (อีก {$row['nearest']['days_left']} วัน)";

        return [
            [
                'title' => 'ประกันหมดรายเดือน',
                'headings' => ['เดือน', 'ทั้งหมด', ...$statusHeadings],
                'rows' => array_map(fn (array $m) => [DateDisplay::monthYear($m['month']), $m['total'], ...array_values($m['statuses'])], $breakdown['months']),
            ],
            [
                'title' => 'ประกันเหลืออีกเท่าไร',
                'headings' => ['ช่วง', 'ทั้งหมด', ...$statusHeadings],
                'rows' => array_map(fn (array $b) => [self::BAND_TH[$b['key']], $b['total'], ...array_values($b['statuses'])], $breakdown['bands']),
            ],
            [
                'title' => 'แยกตามหมวดหมู่',
                'headings' => ['หมวดหมู่', 'ทั้งหมด', ...$periodHeadings, 'ใกล้สุด'],
                'rows' => array_map(
                    fn (array $c) => [$c['category_id'] === null ? self::NO_CATEGORY_TH : ($c['name_th'] ?: $c['name']), $c['total'], ...$periods($c), $nearest($c)],
                    $breakdown['categories'],
                ),
            ],
            [
                'title' => 'แยกตามผู้ขาย',
                'headings' => ['ผู้ขาย', 'ทั้งหมด', ...$periodHeadings, 'ใกล้สุด'],
                'rows' => array_map(
                    fn (array $v) => [$v['vendor_id'] === null ? self::NO_VENDOR_TH : ($v['name_th'] ?: $v['name']), $v['total'], ...$periods($v), $nearest($v)],
                    $breakdown['vendors'],
                ),
            ],
        ];
    }
}
