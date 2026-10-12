<?php

namespace App\Services\Report\Access;

use App\Models\Access\AccessMembership;
use App\Models\Access\Software;
use App\Models\Request\ServiceRequest;
use App\Models\Settings\Brand;
use App\Models\User;
use App\Services\Report\Tabular\Options;
use App\Services\Report\Tabular\ReportColumn;
use App\Services\Report\Tabular\ReportFilter;
use App\Services\Report\Tabular\ReportSummary;
use App\Services\Report\Tabular\TabularReport;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * "การใช้ License ซอฟต์แวร์" (Report Center → Access): one row per licence holder (a software
 * membership), and above it each software's seats bought against seats in use, the seats leavers
 * still hold, and the software requests waiting for a seat. No seat count means the licence is not
 * seat-limited; AccessService::grant() stops at the count, so "over" is only old or edited data.
 */
class SoftwareLicenseReport extends TabularReport
{
    private const LICENSE_KEYS = [
        'perpetual' => 'access_lic_perpetual', 'subscription' => 'access_lic_subscription',
        'free' => 'access_lic_free', 'open_source' => 'access_lic_open_source',
    ];

    // Mirrors resources/js/lang/th/access.ts.
    private const LICENSE_TH = [
        'perpetual' => 'ซื้อขาด', 'subscription' => 'รายเดือน/รายปี', 'free' => 'ฟรี', 'open_source' => 'Open Source',
    ];

    private const LICENSE_TONES = ['perpetual' => 'soft-violet', 'subscription' => 'soft-blue', 'free' => 'soft-green', 'open_source' => 'gray'];

    private const USAGE_KEYS = [
        'full' => 'rep_usage_full', 'available' => 'rep_usage_available',
        'unlimited' => 'rep_usage_unlimited', 'over' => 'rep_usage_over',
    ];

    private const STATE_KEYS = ['active' => 'rep_sl_state_active', 'revoked' => 'rep_sl_state_revoked'];

    private const STATUS_KEYS = ['active' => 'rep_ac_status_active', 'left' => 'rep_ac_status_left', 'revoked' => 'rep_ac_status_revoked'];

    private const STATUS_TH = ['active' => 'ใช้งาน', 'left' => 'ผู้ลาออกยังถือ', 'revoked' => 'ถอนแล้ว'];

    /** Requests still waiting: not yet decided, or approved and waiting for IT to install. */
    private const OPEN_REQUESTS = ['pending', 'approved'];

    /** A limited software's seats: full with requests waiting, full (or over), or room for more. */
    private const SEAT_STATES = [
        'blocked' => ['label_key' => 'rep_sl_seat_blocked', 'tone' => 'red'],
        'full' => ['label_key' => 'rep_sl_seat_full', 'tone' => 'amber'],
        'room' => ['label_key' => 'rep_sl_seat_room', 'tone' => 'soft-green'],
    ];

    /** How long ago a leaver still holding a seat left; no last day counts as the oldest. */
    private const LEAVER_AGES = [
        'week' => ['label_key' => 'rep_sl_age_week', 'short' => '≤7', 'tone' => 'gray'],
        'month' => ['label_key' => 'rep_sl_age_month', 'short' => '8–30', 'tone' => 'soft-amber'],
        'quarter' => ['label_key' => 'rep_sl_age_quarter', 'short' => '31–90', 'tone' => 'amber'],
        'older' => ['label_key' => 'rep_sl_age_older', 'short' => '>90', 'tone' => 'red'],
    ];

    /** @var array<string, Collection<int, array<string, mixed>>> softwares() per filter set, within one request */
    private array $figures = [];

    /** @var array<string, Collection<int, AccessMembership>> activeMembers() per filter set, within one request */
    private array $members = [];

    public function key(): string
    {
        return 'access.software_licenses';
    }

    public function title(): string
    {
        return 'การใช้ License ซอฟต์แวร์';
    }

    public function filters(): array
    {
        return [
            ReportFilter::select('usage', Options::fromLabels(self::USAGE_KEYS)),
            ReportFilter::select('license_type', Options::fromLabels(self::LICENSE_KEYS)),
            ReportFilter::select('brand_id', self::brandOptions())->labelKey('rep_fl_sl_brand'),
            ReportFilter::search(),
            ReportFilter::select('software_id', self::softwareOptions())->labelKey('rep_fl_sl_software'),
            ReportFilter::select('state', Options::fromLabels(self::STATE_KEYS), 'active')->labelKey('rep_fl_sl_state'),
        ];
    }

    /** @return list<array{value: int, label: string}> */
    private static function brandOptions(): array
    {
        return once(fn (): array => Brand::query()->whereIn('id', Software::query()->select('brand_id')->whereNotNull('brand_id'))->orderBy('name')->get(['id', 'name'])
            ->map(fn (Brand $b) => ['value' => $b->id, 'label' => $b->name])->all());
    }

    /** @return list<array{value: int, label: string}> */
    private static function softwareOptions(): array
    {
        return once(fn (): array => Software::query()->orderBy('code')->get(['id', 'code', 'name'])
            ->map(fn (Software $s) => ['value' => $s->id, 'label' => trim("{$s->code} {$s->name}")])->all());
    }

    /**
     * Each software the filters keep with its seats, holders, leavers and waiting requests, most to do first.
     *
     * @param  array<string, mixed>  $filters
     * @return Collection<int, array<string, mixed>>
     */
    public function softwares(array $filters): Collection
    {
        $key = md5(serialize([$filters['usage'] ?? null, $filters['license_type'] ?? null, $filters['brand_id'] ?? null, $filters['search'] ?? null]));

        return $this->figures[$key] ??= $this->loadSoftwares($filters);
    }

    /**
     * @param  array<string, mixed>  $filters
     * @return Collection<int, array<string, mixed>>
     */
    private function loadSoftwares(array $filters): Collection
    {
        $requests = ServiceRequest::query()->where('type', 'software')->whereIn('status', self::OPEN_REQUESTS)
            ->whereNotNull('software_id')->selectRaw('software_id, COUNT(*) as n')->groupBy('software_id')->pluck('n', 'software_id');

        return Software::query()
            ->with(['brand:id,name', 'memberships' => fn ($m) => $m->whereNull('revoked_at')->with('employee:id,code,first_name,last_name,status,last_day')])
            ->when($filters['license_type'] ?? null, fn (Builder $q, string $type) => $q->where('license_type', $type))
            ->when($filters['brand_id'] ?? null, fn (Builder $q, $id) => $q->where('brand_id', (int) $id))
            ->when($filters['search'] ?? null, function (Builder $q, string $search) {
                $like = '%'.$search.'%';
                $q->where(fn (Builder $w) => $w->where('name', 'like', $like)->orWhere('code', 'like', $like)
                    ->orWhereHas('memberships', fn (Builder $m) => $m->whereNull('revoked_at')->whereHas('employee', fn (Builder $e) => self::holderLike($e, 'employees', $like))));
            })
            ->orderBy('name')->get()
            ->map(function (Software $s) use ($requests) {
                $used = $s->memberships->count();
                $gone = $s->memberships->filter(fn (AccessMembership $m) => $m->employee?->hasLeft())->count();
                $waiting = (int) $requests->get($s->id, 0);
                $usage = match (true) {
                    $s->seats === null => 'unlimited',
                    $used > $s->seats => 'over',
                    $used === $s->seats => 'full',
                    default => 'available',
                };
                $left = $s->seats === null ? null : $s->seats - $used;
                $blocked = $waiting > 0 && $left !== null && $left <= 0;

                return [
                    'id' => $s->id, 'code' => $s->code, 'name' => $s->name, 'brand' => $s->brand?->name,
                    'license_type' => $s->license_type?->value, 'seats' => $s->seats, 'used' => $used, 'gone' => $gone,
                    'left' => $left, 'usage' => $usage, 'pct' => $s->seats ? (int) round($used / $s->seats * 100) : null,
                    'requests' => $waiting, 'blocked' => $blocked,
                    'rank' => ($usage === 'over' ? 1e6 : 0) + ($blocked ? 1e5 : 0) + $gone * 1000 + ($usage === 'full' ? 500 : 0)
                        + ($waiting > 0 && $left !== null && $waiting > max(0, $left) ? 100 : 0) + ($s->seats ? $used / $s->seats * 100 : 0),
                ];
            })
            ->filter(fn (array $s) => ! ($filters['usage'] ?? null) || $s['usage'] === $filters['usage'])
            ->sortBy([['rank', 'desc'], ['name', 'asc']])
            ->values();
    }

    /**
     * The holders of the software the filters keep (or of the one picked), active or not.
     *
     * @param  array<string, mixed>  $filters
     */
    private function memberships(array $filters): Builder
    {
        return AccessMembership::query()
            ->select('access_memberships.*')
            ->join('employees', 'employees.id', '=', 'access_memberships.employee_id')
            ->where('access_memberships.resource_type', 'software')
            ->whereIn('access_memberships.resource_id', $this->softwares($filters)->pluck('id')->all() ?: [0])
            ->when($filters['software_id'] ?? null, fn (Builder $q, $id) => $q->where('access_memberships.resource_id', (int) $id))
            // A software found by its own name keeps all its holders; one found through a holder keeps that holder.
            ->when($filters['search'] ?? null, function (Builder $q, string $search) {
                $like = '%'.$search.'%';
                $q->where(fn (Builder $w) => $w
                    ->whereIn('access_memberships.resource_id', Software::query()->select('id')->where(fn (Builder $s) => $s->where('name', 'like', $like)->orWhere('code', 'like', $like)))
                    ->orWhere(fn (Builder $e) => self::holderLike($e, 'employees', $like)));
            });
    }

    /** A holder whose code, name or Thai name contains the search. */
    private static function holderLike(Builder $q, string $table, string $like): Builder
    {
        return $q->where(fn (Builder $w) => $w->where("{$table}.code", 'like', $like)
            ->orWhereRaw("CONCAT_WS(' ', {$table}.first_name, {$table}.last_name) LIKE ?", [$like])
            ->orWhereRaw("CONCAT_WS(' ', {$table}.first_name_th, {$table}.last_name_th) LIKE ?", [$like]));
    }

    public function query(User $viewer, array $filters): Builder
    {
        $revoked = ($filters['state'] ?? 'active') === 'revoked';
        $query = AccessFacts::withResource($this->memberships($filters))
            ->with(['employee.department', 'grantedBy:id,name', 'revokedBy:id,name'])
            ->when(! $revoked, fn (Builder $q) => $q->whereNull('access_memberships.revoked_at'))
            ->when($revoked, fn (Builder $q) => $q->whereNotNull('access_memberships.revoked_at'));

        if ($revoked) {
            return $query->orderByDesc('access_memberships.revoked_at')->orderByDesc('access_memberships.id');
        }

        // Leavers' seats first: they are the ones to take back.
        return $query
            ->orderByRaw(
                "CASE WHEN employees.status = 'resigned' AND (employees.last_day IS NULL OR employees.last_day < ?) THEN 0 ELSE 1 END",
                [today()->toDateString()],
            )
            ->orderBy('access_memberships.resource_id')
            ->orderBy('employees.first_name')->orderBy('employees.last_name');
    }

    public function columns(): array
    {
        return [
            ReportColumn::text('software', 'ซอฟต์แวร์', fn (AccessMembership $m) => $m->resource?->getAttribute('name')),
            // Drawn under the software, the name and the status on the page.
            ReportColumn::text('software_code', 'รหัส', fn (AccessMembership $m) => $m->resource?->getAttribute('code'))->hiddenByDefault(),
            ReportColumn::text('publisher', 'ผู้ผลิต', fn (AccessMembership $m) => AccessFacts::detail($m->resource))->hiddenByDefault(),
            ReportColumn::enum('license_type', 'ประเภท License', fn (AccessMembership $m) => $m->resource?->getAttribute('license_type'), self::LICENSE_KEYS, self::LICENSE_TH)
                ->hiddenByDefault(),
            ReportColumn::text('employee', 'พนักงาน', fn (AccessMembership $m) => $m->employee?->name)
                ->labelKey('rep_c_ac_employee')->linkTo('/employees', fn (AccessMembership $m) => $m->employee_id),
            ReportColumn::text('employee_code', 'รหัสพนักงาน', fn (AccessMembership $m) => $m->employee?->code)->hiddenByDefault(),
            ReportColumn::localized('department', 'แผนก', fn (AccessMembership $m) => AccessFacts::department($m->employee)),
            ReportColumn::text('purpose', 'วัตถุประสงค์', fn (AccessMembership $m) => $m->purpose)->labelKey('rep_c_ac_purpose')->hiddenByDefault(),
            ReportColumn::dateTime('granted_at', 'วันที่ให้', fn (AccessMembership $m) => $m->granted_at)->labelKey('rep_c_ac_granted_at'),
            ReportColumn::text('granted_by', 'ผู้ให้', fn (AccessMembership $m) => $m->grantedBy?->name)->labelKey('rep_c_ac_granted_by'),
            ReportColumn::enum('status', 'สถานะ', fn (AccessMembership $m) => match (true) {
                $m->revoked_at !== null => 'revoked',
                (bool) $m->employee?->hasLeft() => 'left',
                default => 'active',
            }, self::STATUS_KEYS, self::STATUS_TH),
            ReportColumn::number('left_days', 'ลาออกมาแล้ว (วัน)', fn (AccessMembership $m) => $m->employee?->hasLeft() ? AccessFacts::daysOut($m->employee) : null)
                ->labelKey('rep_c_ac_left_days')->hiddenByDefault(),
            ReportColumn::dateTime('revoked_at', 'วันที่ถอน', fn (AccessMembership $m) => $m->revoked_at)->labelKey('rep_c_ac_revoked_at')->hiddenByDefault(),
            ReportColumn::text('revoked_by', 'ผู้ถอน', fn (AccessMembership $m) => $m->revokedBy?->name)->labelKey('rep_c_ac_revoked_by')->hiddenByDefault(),
        ];
    }

    public function sheetTitle(): string
    {
        return 'ผู้ถือ License';
    }

    public function summary(Builder $query, array $filters): array
    {
        $softwares = $this->softwares($filters);
        $limited = $softwares->whereNotNull('seats');
        $bought = (int) $limited->sum('seats');
        $full = $softwares->whereIn('usage', ['full', 'over']);
        $blocked = $full->where('blocked', true);
        $leavers = $this->activeMembers($filters)->filter(fn (AccessMembership $m) => $m->employee?->hasLeft());
        $byLicense = $softwares->countBy('license_type');
        $gone = (int) $limited->sum('gone');
        $longest = $leavers->map(fn (AccessMembership $m) => AccessFacts::daysOut($m->employee))->filter(fn ($d) => $d !== null)->max();
        $months = $this->seatsByMonth($softwares);
        $net = end($months['points']) - $months['points'][0];
        $direction = $net > 0 ? 'up' : ($net < 0 ? 'down' : 'even');

        return [
            ReportSummary::make('sl_software', 'ซอฟต์แวร์', $softwares->count())->withSplit(array_map(fn (string $type) => [
                'key' => $type, 'label_key' => self::LICENSE_KEYS[$type], 'tone' => self::LICENSE_TONES[$type], 'value' => (int) $byLicense->get($type, 0),
            ], array_keys(self::LICENSE_KEYS))),
            ReportSummary::make('sl_bought', 'License ที่ซื้อ', $bought)->withSplit([
                ['key' => 'work', 'label_key' => 'rep_sl_bar_work', 'tone' => 'soft-blue', 'value' => (int) $limited->sum('used') - $gone],
                ['key' => 'gone', 'label_key' => 'rep_sl_bar_gone', 'tone' => 'soft-red', 'value' => $gone],
                ['key' => 'free', 'label_key' => 'rep_sl_bar_free', 'tone' => 'gray', 'value' => (int) $limited->sum(fn (array $s) => max(0, $s['left']))],
            ]),
            ReportSummary::make('sl_used', 'ใช้ไป', (int) $softwares->sum('used'))->withChart(['kind' => 'line'] + $months)->withNote([
                'label_key' => 'rep_n_sl_used_months',
                'trend' => ['direction' => $direction, 'label_key' => 'rep_n_ac_net_'.$direction, 'values' => ['net' => abs($net)]],
            ]),
            ReportSummary::make('sl_full', 'License เต็ม', $full->count())->withAttention($blocked->isNotEmpty() ? 'red' : 'amber')
                ->withSplit(array_map(fn (string $state) => [
                    'key' => $state, 'label_key' => self::SEAT_STATES[$state]['label_key'], 'tone' => self::SEAT_STATES[$state]['tone'],
                    'value' => $limited->filter(fn (array $s) => self::seatState($s) === $state)->count(),
                ], array_keys(self::SEAT_STATES))),
            ReportSummary::make('sl_leavers', 'ผู้ลาออกที่ยังถือ', $leavers->count())->withAttention('red')
                ->withChart(['kind' => 'columns', 'items' => array_map(fn (string $age) => [
                    'key' => $age, 'label_key' => self::LEAVER_AGES[$age]['label_key'], 'short' => self::LEAVER_AGES[$age]['short'], 'tone' => self::LEAVER_AGES[$age]['tone'],
                    'value' => $leavers->filter(fn (AccessMembership $m) => self::leaverAge(AccessFacts::daysOut($m->employee)) === $age)->count(),
                ], array_keys(self::LEAVER_AGES))])
                ->withNote(match (true) {
                    $leavers->isEmpty() => ['label_key' => 'rep_n_sl_leavers_none'],
                    $longest === null => ['label_key' => 'rep_n_sl_leavers', 'values' => ['n' => $leavers->pluck('employee_id')->unique()->count()]],
                    default => ['label_key' => 'rep_n_sl_leavers_days', 'values' => ['n' => $leavers->pluck('employee_id')->unique()->count(), 'days' => (int) $longest]],
                }),
        ];
    }

    /** @param  array<string, mixed>  $software */
    private static function seatState(array $software): string
    {
        return match (true) {
            (bool) $software['blocked'] => 'blocked',
            in_array($software['usage'], ['full', 'over'], true) => 'full',
            default => 'room',
        };
    }

    private static function leaverAge(?int $days): string
    {
        return match (true) {
            $days === null || $days > 90 => 'older',
            $days > 30 => 'quarter',
            $days > 7 => 'month',
            default => 'week',
        };
    }

    /**
     * Seats held at the end of each of the last six months (this month: today) for the software kept.
     *
     * @param  Collection<int, array<string, mixed>>  $softwares
     * @return array{points: list<int>, months: list<string>}
     */
    private function seatsByMonth(Collection $softwares): array
    {
        $grants = AccessMembership::query()->where('resource_type', 'software')->whereIn('resource_id', $softwares->pluck('id'))->get(['granted_at', 'revoked_at']);
        $points = [];
        $months = [];
        foreach (range(5, 0) as $back) {
            $month = today()->startOfMonth()->subMonths($back);
            $at = $back === 0 ? now() : $month->copy()->endOfMonth();
            $months[] = $month->format('Y-m');
            $points[] = $grants->filter(fn (AccessMembership $m) => $m->granted_at?->lte($at) && ($m->revoked_at === null || $m->revoked_at->gt($at)))->count();
        }

        return ['points' => $points, 'months' => $months];
    }

    /**
     * Active holders of the software the filters keep, whatever the picked one.
     *
     * @param  array<string, mixed>  $filters
     * @return Collection<int, AccessMembership>
     */
    private function activeMembers(array $filters): Collection
    {
        return $this->members[md5(serialize($filters))] ??= AccessFacts::withResource($this->memberships(['software_id' => null] + $filters))
            ->with('employee.department')->whereNull('access_memberships.revoked_at')->get();
    }

    /**
     * The cards above the list: the software table, leavers to take seats back from, requests
     * waiting for a seat, and the segments' counts.
     *
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function breakdown(User $viewer, array $filters): array
    {
        $softwares = $this->softwares($filters);
        $everyUsage = $this->softwares(['usage' => null] + $filters);
        $bySoftware = $softwares->keyBy('id');
        $active = $this->activeMembers($filters);

        $leavers = $active->filter(fn (AccessMembership $m) => $m->employee?->hasLeft())->groupBy('employee_id')
            ->map(fn (Collection $grants) => AccessFacts::person($grants->first()->employee) + [
                'grants' => $grants->map(fn (AccessMembership $m) => [
                    'id' => (int) $m->resource_id, 'code' => $m->resource?->getAttribute('code'), 'name' => $m->resource?->getAttribute('name'),
                    'requests' => (int) ($bySoftware[$m->resource_id]['requests'] ?? 0), 'blocked' => (bool) ($bySoftware[$m->resource_id]['blocked'] ?? false),
                ])->values()->all(),
            ])
            ->sortBy([['days', 'desc'], ['name', 'asc']])->values()->all();

        $requests = ServiceRequest::query()->with(['employee.department', 'software:id,code,name'])
            ->where('type', 'software')->whereIn('status', self::OPEN_REQUESTS)
            ->whereIn('software_id', $softwares->pluck('id')->all() ?: [0])
            ->orderBy('created_at')->get()
            ->map(fn (ServiceRequest $r) => [
                'id' => $r->id,
                'reference' => $r->reference,
                'status' => $r->status->value,
                'created_at' => $r->created_at?->format('Y-m-d H:i'),
                'days' => (int) $r->created_at?->copy()->startOfDay()->diffInDays(today()),
                'software' => ['id' => (int) $r->software_id, 'code' => $r->software?->code, 'name' => $r->software?->name],
                'requester' => [
                    'name' => $r->employee?->name ?? $r->requester_name,
                    'code' => $r->employee?->code,
                    'department' => $r->employee ? AccessFacts::department($r->employee) : ($r->department_name ? ['name' => $r->department_name, 'name_th' => null] : null),
                ],
                'seats_left' => $bySoftware[$r->software_id]['left'] ?? null,
                'gone' => (int) ($bySoftware[$r->software_id]['gone'] ?? 0),
            ])->all();

        $picked = $this->memberships($filters);

        return [
            'usage' => ['all' => $everyUsage->count()] + collect(array_keys(self::USAGE_KEYS))->mapWithKeys(fn (string $u) => [$u => $everyUsage->where('usage', $u)->count()])->all(),
            'states' => ['active' => (clone $picked)->whereNull('access_memberships.revoked_at')->count(), 'revoked' => (clone $picked)->whereNotNull('access_memberships.revoked_at')->count()],
            'softwares' => $softwares->map(fn (array $s) => collect($s)->except('rank')->all())->all(),
            'leavers' => $leavers,
            'requests' => $requests,
            // Only while the picked software is still among the filtered ones; the page clears a stale pick.
            'picked' => $bySoftware->has((int) ($filters['software_id'] ?? 0)) ? $bySoftware[(int) $filters['software_id']]['name'] : null,
        ];
    }

    /**
     * Per software as the first sheet, then the leavers and the requests waiting.
     *
     * @param  array<string, mixed>  $filters
     * @return list<array{title: string, headings: list<string>, rows: list<list<string|int|float|null>>}>
     */
    public function exportSections(User $viewer, array $filters): array
    {
        $b = $this->breakdown($viewer, $filters);
        $usageTh = ['full' => 'เต็ม', 'available' => 'ยังเหลือ', 'unlimited' => 'ไม่จำกัด', 'over' => 'ใช้เกิน'];
        $dept = fn (?array $d) => $d === null ? null : (($d['name_th'] ?? null) ?: $d['name']);

        return [
            [
                'title' => 'การใช้ License ต่อซอฟต์แวร์',
                'headings' => ['รหัส', 'ซอฟต์แวร์', 'ผู้ผลิต', 'ประเภท License', 'ซื้อไว้', 'ใช้ไป', 'คงเหลือ', '% ใช้งาน', 'การใช้งาน', 'ผู้ลาออกที่ยังถือ', 'คำขอรอ'],
                'rows' => array_map(fn (array $s) => [
                    $s['code'], $s['name'], $s['brand'], self::LICENSE_TH[$s['license_type']] ?? $s['license_type'], $s['seats'], $s['used'], $s['left'], $s['pct'],
                    $usageTh[$s['usage']], $s['gone'], $s['requests'],
                ], $b['softwares']),
            ],
            [
                'title' => 'เรียกคืนได้จากผู้ลาออก',
                'headings' => ['รหัสพนักงาน', 'ชื่อ', 'แผนก', 'วันสุดท้าย', 'ลาออกมาแล้ว (วัน)', 'ซอฟต์แวร์ที่ยังถือ'],
                'rows' => array_map(fn (array $p) => [
                    $p['code'], $p['name'], $dept($p['department']), $p['last_day'], $p['days'], implode(', ', array_column($p['grants'], 'name')),
                ], $b['leavers']),
            ],
            [
                'title' => 'คำขอที่รอ License',
                'headings' => ['เลขที่คำขอ', 'ซอฟต์แวร์', 'ผู้ขอ', 'แผนก', 'สถานะ', 'ขอเมื่อ', 'รอมาแล้ว (วัน)', 'License ที่เหลือ'],
                'rows' => array_map(fn (array $r) => [
                    $r['reference'], $r['software']['name'], $r['requester']['name'], $dept($r['requester']['department']),
                    $r['status'] === 'approved' ? 'อนุมัติแล้ว รอติดตั้ง' : 'รออนุมัติ', $r['created_at'], $r['days'], $r['seats_left'],
                ], $b['requests']),
            ],
        ];
    }
}
