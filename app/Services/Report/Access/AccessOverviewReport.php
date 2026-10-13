<?php

namespace App\Services\Report\Access;

use App\Models\Access\AccessMembership;
use App\Models\Employee\Employee;
use App\Models\User;
use App\Services\Report\Tabular\Options;
use App\Services\Report\Tabular\ReportColumn;
use App\Services\Report\Tabular\ReportFilter;
use App\Services\Report\Tabular\ReportSummary;
use App\Services\Report\Tabular\TabularReport;
use App\Support\DateDisplay;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * "ภาพรวมสิทธิ์การเข้าถึง": every access grant (access_memberships) as a register, with the grants
 * and revocations of a date range by month, leavers still holding access, the departments and the
 * resources that need an owner or have no member; breakdown() feeds the cards above the list.
 */
class AccessOverviewReport extends TabularReport
{
    private const STATE_KEYS = ['active' => 'rep_ac_state_active', 'revoked' => 'rep_ac_state_revoked', 'all' => 'rep_ac_state_all'];

    private const STATUS_KEYS = [
        'active' => 'rep_ac_status_active', 'cross' => 'rep_ac_status_cross',
        'left' => 'rep_ac_status_left', 'revoked' => 'rep_ac_status_revoked',
    ];

    private const STATUS_TH = ['active' => 'ใช้งาน', 'cross' => 'ใช้งาน (ข้ามแผนก)', 'left' => 'ผู้ลาออกยังถือ', 'revoked' => 'ถอนแล้ว'];

    public function key(): string
    {
        return 'access.overview';
    }

    public function title(): string
    {
        return 'ภาพรวมสิทธิ์การเข้าถึง';
    }

    public function filters(): array
    {
        return [
            ReportFilter::date('from', today()->startOfYear()->toDateString()),
            ReportFilter::date('to', today()->toDateString()),
            ReportFilter::select('type', Options::fromLabels(AccessFacts::TYPE_KEYS))->labelKey('rep_fl_ac_type'),
            ReportFilter::select('department_id', Options::departments()),
            ReportFilter::select('state', Options::fromLabels(self::STATE_KEYS), 'active')->labelKey('rep_fl_ac_state'),
        ];
    }

    /**
     * Grants of the chosen type, held by the chosen department — active or not.
     *
     * @param  array<string, mixed>  $filters
     */
    private function memberships(array $filters): Builder
    {
        return AccessMembership::query()
            ->select('access_memberships.*')
            ->join('employees', 'employees.id', '=', 'access_memberships.employee_id')
            ->when($filters['type'] ?? null, fn (Builder $q, string $type) => $q->where('access_memberships.resource_type', $type))
            ->when($filters['department_id'] ?? null, fn (Builder $q, $id) => $q->where('employees.department_id', (int) $id));
    }

    public function query(User $viewer, array $filters): Builder
    {
        $state = $filters['state'] ?? 'active';
        $query = AccessFacts::withResource($this->memberships($filters))
            ->with(['employee.department', 'grantedBy:id,name', 'revokedBy:id,name'])
            ->when($state === 'active', fn (Builder $q) => $q->whereNull('access_memberships.revoked_at'))
            ->when($state === 'revoked', fn (Builder $q) => $q->whereNotNull('access_memberships.revoked_at'));

        if ($state === 'revoked') {
            return $query->orderByDesc('access_memberships.revoked_at')->orderByDesc('access_memberships.id');
        }

        // Grants a leaver still holds first: they are the ones to act on.
        return $query
            ->orderByRaw(
                "CASE WHEN access_memberships.revoked_at IS NULL AND employees.status = 'resigned' AND (employees.last_day IS NULL OR employees.last_day < ?) THEN 0 ELSE 1 END",
                [today()->toDateString()],
            )
            ->orderBy('employees.first_name')->orderBy('employees.last_name')
            ->orderBy('access_memberships.resource_type')->orderBy('access_memberships.id');
    }

    public function columns(): array
    {
        return [
            ReportColumn::text('employee', 'พนักงาน', fn (AccessMembership $m) => $m->employee?->name)
                ->labelKey('rep_c_ac_employee')->linkTo('/employees', fn (AccessMembership $m) => $m->employee_id),
            // Drawn under the name, the resource and the status on the page.
            ReportColumn::text('employee_code', 'รหัสพนักงาน', fn (AccessMembership $m) => $m->employee?->code)->hiddenByDefault(),
            ReportColumn::localized('department', 'แผนก', fn (AccessMembership $m) => AccessFacts::department($m->employee)),
            ReportColumn::enum('resource_type', 'ประเภท', fn (AccessMembership $m) => $m->resource_type, AccessFacts::TYPE_KEYS, AccessFacts::TYPE_TH)
                ->labelKey('rep_c_ac_type'),
            ReportColumn::text('resource', 'Resource', fn (AccessMembership $m) => $m->resource?->getAttribute('name'))->labelKey('rep_c_ac_resource'),
            ReportColumn::text('resource_code', 'รหัส Resource', fn (AccessMembership $m) => $m->resource?->getAttribute('code'))
                ->labelKey('rep_c_ac_resource_code')->hiddenByDefault(),
            ReportColumn::text('resource_detail', 'อีเมล / Path / URL', fn (AccessMembership $m) => AccessFacts::detail($m->resource))
                ->labelKey('rep_c_ac_resource_detail')->hiddenByDefault(),
            ReportColumn::localized('resource_department', 'แผนกของ Resource', fn (AccessMembership $m) => $this->resourceDepartment($m))
                ->labelKey('rep_c_ac_resource_department')->hiddenByDefault(),
            ReportColumn::enum('level', 'ระดับ', fn (AccessMembership $m) => AccessFacts::level($m), AccessFacts::LEVEL_KEYS, AccessFacts::LEVEL_TH)
                ->labelKey('rep_c_ac_level'),
            ReportColumn::text('purpose', 'วัตถุประสงค์', fn (AccessMembership $m) => $m->purpose)->labelKey('rep_c_ac_purpose')->hiddenByDefault(),
            ReportColumn::dateTime('granted_at', 'วันที่ให้', fn (AccessMembership $m) => $m->granted_at)->labelKey('rep_c_ac_granted_at'),
            ReportColumn::text('granted_by', 'ผู้ให้', fn (AccessMembership $m) => $m->grantedBy?->name)->labelKey('rep_c_ac_granted_by'),
            ReportColumn::enum('status', 'สถานะ', fn (AccessMembership $m) => $this->status($m), self::STATUS_KEYS, self::STATUS_TH),
            ReportColumn::number('left_days', 'ลาออกมาแล้ว (วัน)', fn (AccessMembership $m) => $m->employee?->hasLeft() ? AccessFacts::daysOut($m->employee) : null)
                ->labelKey('rep_c_ac_left_days')->hiddenByDefault(),
            ReportColumn::dateTime('revoked_at', 'วันที่ถอน', fn (AccessMembership $m) => $m->revoked_at)->labelKey('rep_c_ac_revoked_at')->hiddenByDefault(),
            ReportColumn::text('revoked_by', 'ผู้ถอน', fn (AccessMembership $m) => $m->revokedBy?->name)->labelKey('rep_c_ac_revoked_by')->hiddenByDefault(),
        ];
    }

    /** @return array{name: string, name_th: ?string}|null */
    private function resourceDepartment(AccessMembership $m): ?array
    {
        return in_array($m->resource_type, AccessFacts::OWNABLE, true) ? AccessFacts::department($m->resource) : null;
    }

    /** Revoked; still held by a leaver; held across departments (an email group or file share of another); or plainly in use. */
    private function status(AccessMembership $m): string
    {
        if ($m->revoked_at !== null) {
            return 'revoked';
        }
        if ($m->employee?->hasLeft()) {
            return 'left';
        }
        $owner = in_array($m->resource_type, AccessFacts::OWNABLE, true) ? $m->resource?->getAttribute('department_id') : null;

        $own = $m->employee?->department_id;

        return $owner !== null && $own !== null && (int) $owner !== (int) $own ? 'cross' : 'active';
    }

    /**
     * Every grant the filters keep (active and revoked), with its holder, for the tiles and the cards.
     *
     * @param  array<string, mixed>  $filters
     * @return Collection<int, AccessMembership>
     */
    private function grants(array $filters): Collection
    {
        return AccessFacts::withResource($this->memberships($filters))->with('employee.department')->get();
    }

    /**
     * Access active at seven even steps from just before the range to its end: the granted tile's line.
     *
     * @param  Collection<int, AccessMembership>  $grants
     * @return list<int>
     */
    private function activeAcross(Collection $grants, Carbon $from, Carbon $to): array
    {
        $start = $from->copy()->subSecond();
        $step = ($to->getTimestamp() - $start->getTimestamp()) / 6;

        return array_map(function (int $k) use ($grants, $start, $step): int {
            $at = $start->copy()->addSeconds((int) round($k * $step));

            return $grants->filter(fn (AccessMembership $m) => $m->granted_at?->lte($at) && ($m->revoked_at === null || $m->revoked_at->gt($at)))->count();
        }, range(0, 6));
    }

    /**
     * People still working (not left), in the chosen department.
     *
     * @param  array<string, mixed>  $filters
     */
    private function staying(array $filters): Builder
    {
        return Employee::query()
            ->when($filters['department_id'] ?? null, fn (Builder $q, $id) => $q->where('department_id', (int) $id))
            ->where(fn (Builder $q) => $q->where('status', 'active')
                ->orWhere(fn (Builder $r) => $r->where('status', 'resigned')->where('last_day', '>=', today()->toDateString())));
    }

    public function summary(Builder $query, array $filters): array
    {
        $all = $this->grants($filters);
        $active = $all->whereNull('revoked_at');
        $byType = $active->countBy('resource_type');
        $held = $active->reject(fn (AccessMembership $m) => $m->employee?->hasLeft());
        $holders = $held->pluck('employee_id')->unique()->count();
        $staff = $this->staying($filters)->count();
        [$from, $to] = $this->dayRange($filters);
        $granted = $all->filter(fn (AccessMembership $m) => $m->granted_at?->between($from, $to))->count();
        $revoked = $all->filter(fn (AccessMembership $m) => $m->revoked_at?->between($from, $to))->count();
        $net = $granted - $revoked;
        $direction = match (true) {
            $net > 0 => 'up',
            $net < 0 => 'down',
            default => 'even',
        };
        $left = $active->filter(fn (AccessMembership $m) => $m->employee?->hasLeft());
        $leavers = $left->pluck('employee')->unique('id');
        $longest = $leavers->map(fn (Employee $e) => AccessFacts::daysOut($e))->filter(fn ($d) => $d !== null)->max();
        $care = $this->care($filters);
        $careCount = count($care['owner_gone']) + count($care['no_owner']) + count($care['empty']);

        return [
            ReportSummary::make('ac_active', 'สิทธิ์ที่ใช้งานอยู่', $active->count())->withSplit(array_map(fn (string $type) => [
                'key' => $type, 'label_key' => AccessFacts::TYPE_KEYS[$type], 'short_key' => AccessFacts::TYPE_SHORT_KEYS[$type], 'tone' => AccessFacts::TYPE_TONES[$type], 'value' => (int) $byType->get($type, 0),
            ], $this->types($filters))),
            ReportSummary::make('ac_holders', 'พนักงานที่ถือสิทธิ์', $holders)->withShareOf($staff)->withNote([
                'label_key' => $staff > $holders ? 'rep_n_ac_holders' : 'rep_n_ac_holders_all',
                'values' => ['staff' => $staff, 'median' => (int) round($held->countBy('employee_id')->median() ?? 0), 'none' => max(0, $staff - $holders)],
            ]),
            ReportSummary::make('ac_granted', 'ให้สิทธิ์ในช่วงวันที่', $granted)->withNote([
                'label_key' => 'rep_n_ac_granted',
                'values' => ['revoked' => $revoked],
                'trend' => ['direction' => $direction, 'label_key' => 'rep_n_ac_net_'.$direction, 'values' => ['net' => abs($net)], 'points' => $this->activeAcross($all, $from, $to)],
            ]),
            ReportSummary::make('ac_leavers', 'สิทธิ์ที่ผู้ลาออกยังถือ', $left->count())->withAttention('red')->withNote($left->isEmpty()
                ? ['label_key' => 'rep_n_ac_leavers_none']
                : ['label_key' => $longest === null ? 'rep_n_ac_leavers_people' : 'rep_n_ac_leavers', 'values' => ['people' => $leavers->count(), 'days' => (int) $longest]]),
            ReportSummary::make('ac_care', 'Resource ที่ต้องดูแล', $careCount)->withAttention('amber')->withSplit([
                ['key' => 'owner_gone', 'label_key' => 'rep_ac_care_owner_gone', 'short_key' => 'rep_ac_care_owner_gone_short', 'tone' => 'soft-red', 'value' => count($care['owner_gone'])],
                ['key' => 'no_owner', 'label_key' => 'rep_ac_care_no_owner', 'tone' => 'soft-amber', 'value' => count($care['no_owner'])],
                ['key' => 'empty', 'label_key' => 'rep_ac_care_empty', 'tone' => 'gray', 'value' => count($care['empty'])],
            ]),
        ];
    }

    /**
     * The cards above the list: codes and numbers only, the page writes the words.
     *
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function breakdown(User $viewer, array $filters): array
    {
        $all = $this->grants($filters);
        // Active grants per registry whatever the type filter — the counts on the type segments.
        $types = $this->memberships(['type' => null] + $filters)->whereNull('access_memberships.revoked_at')
            ->select('access_memberships.resource_type')->selectRaw('COUNT(*) as n')->groupBy('access_memberships.resource_type')
            ->pluck('n', 'resource_type');

        return [
            'types' => collect(AccessFacts::TYPES)->mapWithKeys(fn (string $t) => [$t => (int) $types->get($t, 0)])->all(),
            // The register's segments.
            'states' => ['active' => $all->whereNull('revoked_at')->count(), 'revoked' => $all->whereNotNull('revoked_at')->count(), 'all' => $all->count()],
            'months' => $this->months($all, $filters),
            'leavers' => $this->leavers($all->whereNull('revoked_at'), $filters),
            'departments' => $this->departments($all->whereNull('revoked_at'), $filters),
            'care' => $this->care($filters),
        ];
    }

    /**
     * Every month of the range, oldest first, empty ones included: grants by type, and revocations
     * split by whether the holder was still working or had reached their last day.
     *
     * @param  Collection<int, AccessMembership>  $all
     * @param  array<string, mixed>  $filters
     * @return list<array{month: string, granted: int, revoked_work: int, revoked_leave: int, by_type: array<string, int>}>
     */
    private function months(Collection $all, array $filters): array
    {
        [$from, $to] = $this->dayRange($filters);
        $granted = $all->filter(fn (AccessMembership $m) => $m->granted_at?->between($from, $to))->groupBy(fn (AccessMembership $m) => $m->granted_at->format('Y-m'));
        $revoked = $all->filter(fn (AccessMembership $m) => $m->revoked_at?->between($from, $to))->groupBy(fn (AccessMembership $m) => $m->revoked_at->format('Y-m'));
        $onLeaving = fn (AccessMembership $m) => $m->employee?->status?->value === 'resigned'
            && ($m->employee->last_day === null || $m->revoked_at->gte($m->employee->last_day->copy()->startOfDay()));

        $months = [];
        for ($month = $from->copy()->startOfMonth(); $month->lte($to); $month->addMonth()) {
            $key = $month->format('Y-m');
            $in = $granted->get($key, collect());
            $out = $revoked->get($key, collect());
            $leave = $out->filter($onLeaving)->count();
            $months[] = [
                'month' => $key,
                'granted' => $in->count(),
                'revoked_work' => $out->count() - $leave,
                'revoked_leave' => $leave,
                'by_type' => collect(AccessFacts::TYPES)->mapWithKeys(fn (string $t) => [$t => $in->where('resource_type', $t)->count()])->all(),
            ];
        }

        return $months;
    }

    /**
     * Leavers still holding grants, longest gone first, and resources a leaver still owns.
     *
     * @param  Collection<int, AccessMembership>  $active
     * @param  array<string, mixed>  $filters
     * @return array{people: list<array<string, mixed>>, owned: list<array<string, mixed>>, resigned: int}
     */
    private function leavers(Collection $active, array $filters): array
    {
        $people = $active->filter(fn (AccessMembership $m) => $m->employee?->hasLeft())
            ->groupBy('employee_id')
            ->map(fn (Collection $grants) => AccessFacts::person($grants->first()->employee) + [
                'grants' => $grants->map(fn (AccessMembership $m) => [
                    'type' => $m->resource_type, 'id' => (int) $m->resource_id,
                    'code' => $m->resource?->getAttribute('code'), 'name' => $m->resource?->getAttribute('name'),
                ])->values()->all(),
            ])
            ->sortBy([['days', 'desc'], ['name', 'asc']])
            ->values()
            ->all();

        $owned = [];
        foreach (array_intersect(AccessFacts::OWNABLE, $this->types($filters)) as $type) {
            $model = AccessFacts::MODELS[$type];
            $model::query()->with(['department', 'owner.department'])
                ->whereHas('owner', fn (Builder $q) => AccessFacts::whereLeft($q)
                    ->when($filters['department_id'] ?? null, fn (Builder $d, $id) => $d->where('department_id', (int) $id)))
                ->orderBy('code')->get()
                ->each(function ($resource) use ($type, &$owned) {
                    $owned[] = AccessFacts::resource($resource, $type) + ['owner' => AccessFacts::person($resource->owner)];
                });
        }

        $resigned = AccessFacts::whereLeft(Employee::query())
            ->when($filters['department_id'] ?? null, fn (Builder $q, $id) => $q->where('department_id', (int) $id))->count();

        return ['people' => $people, 'owned' => $owned, 'resigned' => $resigned];
    }

    /**
     * Active grants by the holder's department, most first (null = no department): people working
     * there and how many hold anything, grants by type, and the grants leavers still hold.
     *
     * @param  Collection<int, AccessMembership>  $active
     * @param  array<string, mixed>  $filters
     * @return list<array{department_id: ?int, name: ?string, name_th: ?string, staff: int, holders: int, grants: int, by_type: array<string, int>, leavers: int}>
     */
    private function departments(Collection $active, array $filters): array
    {
        $staff = $this->staying($filters)->selectRaw('department_id, COUNT(*) as n')->groupBy('department_id')->pluck('n', 'department_id');

        return $active
            ->groupBy(fn (AccessMembership $m) => (string) ($m->employee?->department_id ?? ''))
            ->map(function (Collection $grants, string $id) use ($staff) {
                $department = $grants->first()->employee?->department;
                $held = $grants->reject(fn (AccessMembership $m) => $m->employee?->hasLeft());

                return [
                    'department_id' => $id === '' ? null : (int) $id,
                    'name' => $department?->name,
                    'name_th' => $department?->name_th,
                    'staff' => (int) $staff->get($id, 0),
                    'holders' => $held->pluck('employee_id')->unique()->count(),
                    'grants' => $grants->count(),
                    'by_type' => collect(AccessFacts::TYPES)->mapWithKeys(fn (string $t) => [$t => $grants->where('resource_type', $t)->count()])->all(),
                    'leavers' => $grants->count() - $held->count(),
                ];
            })
            ->sortBy([['grants', 'desc'], ['name', 'asc']])
            ->values()
            ->all();
    }

    /**
     * Resources that need someone: an email group or file share whose owner has left or that has
     * none, and any resource with no active member. The type filter applies, the department does
     * not — software and social have no department, and IT looks after all of them.
     *
     * @param  array<string, mixed>  $filters
     * @return array{owner_gone: list<array<string, mixed>>, no_owner: list<array<string, mixed>>, empty: list<array<string, mixed>>}
     */
    private function care(array $filters): array
    {
        $care = ['owner_gone' => [], 'no_owner' => [], 'empty' => []];
        foreach ($this->types($filters) as $type) {
            $model = AccessFacts::MODELS[$type];
            $ownable = in_array($type, AccessFacts::OWNABLE, true);
            $with = match ($type) {
                'email_group', 'file_share' => ['department', 'owner.department'],
                'software' => ['brand'],
                default => [],
            };
            if ($ownable) {
                $model::query()->with($with)->whereHas('owner', fn (Builder $q) => AccessFacts::whereLeft($q))->orderBy('code')->get()
                    ->each(function ($r) use ($type, &$care) {
                        $care['owner_gone'][] = AccessFacts::resource($r, $type) + ['owner' => AccessFacts::person($r->owner)];
                    });
                $model::query()->with($with)->whereNull('owner_employee_id')->orderBy('code')->get()
                    ->each(function ($r) use ($type, &$care) {
                        $care['no_owner'][] = AccessFacts::resource($r, $type) + ['owner' => null];
                    });
            }
            $model::query()->with($with)->whereDoesntHave('memberships', fn (Builder $q) => $q->whereNull('revoked_at'))->orderBy('code')->get()
                ->each(function ($r) use ($type, $ownable, &$care) {
                    $care['empty'][] = AccessFacts::resource($r, $type) + ['owner' => $ownable && $r->owner ? AccessFacts::person($r->owner) : null];
                });
        }

        return $care;
    }

    /**
     * @param  array<string, mixed>  $filters
     * @return list<string>
     */
    private function types(array $filters): array
    {
        return ($filters['type'] ?? null) ? [$filters['type']] : AccessFacts::TYPES;
    }

    /** "2026-09" as "ก.ย. 2026" for the file. */
    private static function monthTh(string $month): string
    {
        return DateDisplay::monthYear($month);
    }

    /**
     * The cards as sheets: by month, by department, leavers still holding, resources that need someone.
     *
     * @param  array<string, mixed>  $filters
     * @return list<array{title: string, headings: list<string>, rows: list<list<string|int|float|null>>}>
     */
    public function exportSections(User $viewer, array $filters): array
    {
        $b = $this->breakdown($viewer, $filters);
        $name = fn (?array $l, string $none) => $l === null ? $none : (($l['name_th'] ?? null) ?: $l['name']);
        $types = array_map(fn (string $t) => AccessFacts::TYPE_TH[$t], AccessFacts::TYPES);
        $resourceRow = fn (array $r, string $why) => [
            $why, AccessFacts::TYPE_TH[$r['type']], $r['code'], $r['name'], $r['detail'], $name($r['department'], '—'),
            isset($r['owner']) ? "{$r['owner']['name']} ({$r['owner']['code']})" : null,
        ];

        return [
            [
                'title' => 'ให้–ถอนรายเดือน',
                'headings' => ['เดือน', 'ให้สิทธิ์', ...$types, 'ถอนระหว่างทำงาน', 'ถอนเมื่อลาออก'],
                'rows' => array_map(fn (array $m) => [
                    self::monthTh($m['month']), $m['granted'], ...array_values($m['by_type']), $m['revoked_work'], $m['revoked_leave'],
                ], $b['months']),
            ],
            [
                'title' => 'ตามแผนก',
                'headings' => ['แผนก', 'พนักงานที่ถือสิทธิ์', 'พนักงานทั้งหมด', 'สิทธิ์', ...$types, 'ผู้ลาออกยังถือ'],
                'rows' => array_map(fn (array $d) => [
                    $d['name'] === null ? 'ไม่ระบุแผนก' : ($d['name_th'] ?: $d['name']), $d['holders'], $d['staff'], $d['grants'],
                    ...array_values($d['by_type']), $d['leavers'],
                ], $b['departments']),
            ],
            [
                'title' => 'ผู้ลาออกที่ยังถือสิทธิ์',
                'headings' => ['รหัสพนักงาน', 'ชื่อ', 'แผนก', 'วันสุดท้าย', 'ลาออกมาแล้ว (วัน)', 'จำนวนสิทธิ์', 'สิทธิ์ที่ยังถือ'],
                'rows' => array_map(fn (array $p) => [
                    $p['code'], $p['name'], $name($p['department'], '—'), DateDisplay::cellDate($p['last_day']), $p['days'], count($p['grants']),
                    implode(', ', array_map(fn (array $g) => "{$g['name']} ({$g['code']})", $p['grants'])),
                ], $b['leavers']['people']),
            ],
            [
                'title' => 'Resource ที่ต้องดูแล',
                'headings' => ['เรื่อง', 'ประเภท', 'รหัส', 'ชื่อ', 'อีเมล / Path / URL', 'แผนก', 'เจ้าของ'],
                'rows' => [
                    ...array_map(fn (array $r) => $resourceRow($r, 'เจ้าของลาออกแล้ว'), $b['care']['owner_gone']),
                    ...array_map(fn (array $r) => $resourceRow($r, 'ไม่มีเจ้าของ'), $b['care']['no_owner']),
                    ...array_map(fn (array $r) => $resourceRow($r, 'ไม่มีสมาชิก'), $b['care']['empty']),
                ],
            ],
        ];
    }
}
