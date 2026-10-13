<?php

namespace App\Services\Report\Employee;

use App\Enums\Employee\EmployeeStatus;
use App\Models\Access\AccessMembership;
use App\Models\Asset\Asset;
use App\Models\Employee\Employee;
use App\Models\Settings\AppSetting;
use App\Models\User;
use App\Services\Report\Access\AccessFacts;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * Open items of "สรุปเรื่องค้างของพนักงาน" as of today: one UNION (query()) feeds both the cards and the
 * file rows. Accounts are selected only for a viewer with employees.set_credentials.
 */
final class OpenItems
{
    /** The groups in card order. */
    public const GROUPS = ['asset', 'access', 'acct', 'data'];

    /** Data issues in severity order. */
    public const ISSUES = ['mgr_left', 'no_mgr', 'no_email', 'no_dept', 'no_sec', 'no_pos', 'bad_dates'];

    public const ACCOUNT_KINDS = ['left', 'must_change', 'expired'];

    public const GROUP_TH = ['asset' => 'ทรัพย์สินค้างคืน', 'access' => 'สิทธิ์ค้างถอน', 'acct' => 'บัญชีผู้ใช้งาน', 'data' => 'ข้อมูลพนักงานไม่ครบ'];

    public const ISSUE_TH = [
        'mgr_left' => 'หัวหน้าลาออกแล้ว', 'no_mgr' => 'ไม่มีหัวหน้า', 'no_email' => 'ไม่มีอีเมล', 'no_dept' => 'ไม่มีแผนก',
        'no_sec' => 'ไม่มีส่วนงาน', 'no_pos' => 'ไม่มีตำแหน่ง', 'bad_dates' => 'วันที่ไม่สอดคล้อง',
    ];

    public const ACCOUNT_KIND_TH = ['left' => 'เจ้าของบัญชีลาออกแล้ว', 'must_change' => 'ยังไม่ได้เปลี่ยนรหัสผ่านครั้งแรก', 'expired' => 'รหัสผ่านหมดอายุ'];

    public static function canSeeAccounts(User $viewer): bool
    {
        return (bool) $viewer->hasPermission('employees.set_credentials');
    }

    /**
     * The groups this viewer may see, in card order.
     *
     * @return list<string>
     */
    public static function groupsFor(User $viewer): array
    {
        return array_values(array_filter(self::GROUPS, fn (string $g) => $g !== 'acct' || self::canSeeAccounts($viewer)));
    }

    /**
     * Every open item as one flat row: id, grp, grp_rank, employee_id, ref_id (asset / grant / user id),
     * kind, kind_rank, last_day, code.
     */
    public static function query(User $viewer, ?int $departmentId, ?string $search, ?string $group = null): Builder
    {
        $match = $search !== null && $search !== '' ? self::matchingEmployees($search, self::canSeeAccounts($viewer)) : null;
        $like = $match !== null ? self::like($search) : null;

        $selects = [];
        foreach (self::groupsFor($viewer) as $name) {
            if ($group === null || $group === $name) {
                array_push($selects, ...self::selects($name, $departmentId, $match, $like));
            }
        }
        if ($selects === []) {
            $selects = [self::assetSelect($departmentId, null)->whereRaw('1 = 0')];
        }

        $union = array_shift($selects);
        foreach ($selects as $select) {
            $union->unionAll($select);
        }

        return OpenItemRow::query()->fromSub($union, 'open_items')
            ->orderBy('grp_rank')->orderBy('kind_rank')->orderBy('last_day')->orderBy('code')->orderBy('id');
    }

    /**
     * The cards' data: groups the viewer may see, each with its people and rows.
     *
     * @return array<string, mixed>
     */
    public static function collect(User $viewer, ?int $departmentId, ?string $search): array
    {
        $rows = self::query($viewer, $departmentId, $search)->get();
        self::hydrate($rows);
        $by = $rows->groupBy('grp');
        $groups = self::groupsFor($viewer);

        $asset = self::assetGroup($by->get('asset', collect()));
        $access = self::accessGroup($by->get('access', collect()));
        $data = self::dataGroup($by->get('data', collect()));
        $acct = in_array('acct', $groups, true) ? self::accountGroup($by->get('acct', collect())) : null;

        $people = $rows->whereNotNull('employee_id')->pluck('employee_id')->unique()->count()
            + $rows->where('grp', 'acct')->whereNull('employee_id')->count();

        return array_filter([
            'groups' => $groups,
            'people_total' => $people,
            'asset' => $asset,
            'access' => $access,
            'acct' => $acct,
            'data' => $data,
        ], fn ($v) => $v !== null);
    }

    /**
     * Load what the rows point at: the employee (department, position, manager) and the asset,
     * grant or account behind each one.
     *
     * @param  Collection<int, OpenItemRow>  $rows
     */
    public static function hydrate(Collection $rows): void
    {
        if ($rows->isEmpty()) {
            return;
        }

        $employees = Employee::query()
            ->with(['department:id,name,name_th', 'section:id,name,name_th', 'position:id,title', 'manager:id,first_name,last_name,first_name_th,last_name_th,last_day'])
            ->whereIn('id', $rows->pluck('employee_id')->filter()->unique()->all())->get()->keyBy('id');
        $refs = fn (string $grp) => $rows->where('grp', $grp)->pluck('ref_id')->filter()->unique()->all();
        $subjects = [
            'asset' => Asset::query()->with(['category:id,name,name_th', 'model:id,name'])->whereIn('id', $refs('asset'))->get()->keyBy('id'),
            'access' => AccessFacts::withResource(AccessMembership::query())->whereIn('id', $refs('access'))->get()->keyBy('id'),
            'acct' => User::query()->with('role:id,name')->whereIn('id', $refs('acct'))->get()->keyBy('id'),
        ];

        foreach ($rows as $row) {
            $row->setRelation('employee', $employees->get($row->employee_id));
            $row->setRelation('subject', ($subjects[$row->grp] ?? collect())->get($row->ref_id));
        }
    }

    /**
     * One person as the cards list them.
     *
     * @return array{id: int, code: string, name: string, name_th: ?string, department: array{name: string, name_th: ?string}|null, section: array{name: string, name_th: ?string}|null, position: ?string, last_day: ?string, days_out: ?int, resigned: bool}
     */
    public static function person(Employee $employee): array
    {
        return [
            'id' => (int) $employee->id,
            'code' => (string) $employee->code,
            'name' => $employee->name,
            'name_th' => $employee->name_th,
            'department' => AccessFacts::department($employee),
            'section' => $employee->section ? ['name' => $employee->section->name, 'name_th' => $employee->section->name_th] : null,
            'position' => $employee->position?->title,
            'last_day' => $employee->last_day?->toDateString(),
            'days_out' => $employee->last_day ? AccessFacts::daysOut($employee) : null,
            'resigned' => $employee->status === EmployeeStatus::Resigned,
        ];
    }

    /** Text for a data issue's detail column: the manager who left, or the two dates that disagree. */
    public static function issueDetail(string $kind, Employee $employee): ?string
    {
        return match ($kind) {
            'mgr_left' => $employee->manager
                ? "หัวหน้า {$employee->manager->name}".($employee->manager->last_day ? ' วันสุดท้าย '.$employee->manager->last_day->toDateString() : '')
                : null,
            'bad_dates' => 'เริ่ม '.$employee->joined_at?->toDateString().' วันสุดท้าย '.$employee->last_day?->toDateString(),
            default => null,
        };
    }

    // ── groups ──────────────────────────────────────────────────────────────────────

    /** @param Collection<int, OpenItemRow> $rows */
    private static function assetGroup(Collection $rows): array
    {
        $people = self::peopleOldestFirst($rows)->map(fn (Collection $items) => self::person($items->first()->employee) + [
            'assets' => $items->map(fn (OpenItemRow $r) => [
                'id' => (int) $r->ref_id,
                'code' => $r->subject?->asset_code,
                'category' => $r->subject?->category ? ['name' => $r->subject->category->name, 'name_th' => $r->subject->category->name_th] : null,
                'model' => $r->subject?->model?->name,
                'status' => $r->kind,
            ])->sortBy('code', SORT_NATURAL)->values()->all(),
        ]);

        return [
            'people' => $people->count(),
            'pieces' => $rows->count(),
            'oldest_days' => self::oldest($people),
            'rows' => $people->values()->all(),
        ];
    }

    /** @param Collection<int, OpenItemRow> $rows */
    private static function accessGroup(Collection $rows): array
    {
        $people = self::peopleOldestFirst($rows)->map(fn (Collection $items) => self::person($items->first()->employee) + [
            'grants' => $items->map(fn (OpenItemRow $r) => ['type' => $r->kind, 'name' => (string) $r->subject?->resource?->name])
                ->sortBy([fn (array $a, array $b) => array_search($a['type'], AccessFacts::TYPES, true) <=> array_search($b['type'], AccessFacts::TYPES, true), fn (array $a, array $b) => strnatcasecmp($a['name'], $b['name'])])
                ->values()->all(),
        ]);

        return [
            'people' => $people->count(),
            'grants' => $rows->count(),
            'oldest_days' => self::oldest($people),
            'rows' => $people->values()->all(),
        ];
    }

    /** @param Collection<int, OpenItemRow> $rows */
    private static function accountGroup(Collection $rows): array
    {
        $kinds = array_fill_keys(self::ACCOUNT_KINDS, 0);
        foreach ($rows as $row) {
            $kinds[$row->kind]++;
        }

        return [
            'accounts' => $rows->count(),
            'by_kind' => $kinds,
            'expiry_days' => self::expiryDays(),
            'rows' => $rows->sortBy([['kind_rank', 'asc'], ['code', 'asc']])->map(fn (OpenItemRow $r) => [
                'user_id' => (int) $r->ref_id,
                'username' => (string) $r->subject?->username,
                'kind' => $r->kind,
                'role' => $r->subject?->role?->name,
                'password_changed_at' => $r->subject?->password_changed_at?->toDateString(),
                'employee' => $r->employee ? self::person($r->employee) : null,
            ])->values()->all(),
        ];
    }

    /** @param Collection<int, OpenItemRow> $rows */
    private static function dataGroup(Collection $rows): array
    {
        $byIssue = array_fill_keys(self::ISSUES, 0);
        $people = $rows->groupBy('employee_id')->map(function (Collection $items) use (&$byIssue) {
            $employee = $items->first()->employee;
            $issues = $items->sortBy('kind_rank')->map(function (OpenItemRow $r) use ($employee, &$byIssue) {
                $byIssue[$r->kind]++;

                return match ($r->kind) {
                    'mgr_left' => ['key' => 'mgr_left', 'manager' => [
                        'name' => $employee->manager?->name, 'name_th' => $employee->manager?->name_th,
                        'last_day' => $employee->manager?->last_day?->toDateString(),
                    ]],
                    'bad_dates' => ['key' => 'bad_dates', 'joined_at' => $employee->joined_at?->toDateString(), 'last_day' => $employee->last_day?->toDateString()],
                    default => ['key' => $r->kind],
                };
            })->values()->all();

            return self::person($employee) + ['issues' => $issues, 'first' => $items->min('kind_rank')];
        })->sortBy([['first', 'asc'], ['code', 'asc']])->map(function (array $p) {
            unset($p['first']);

            return $p;
        });

        return ['people' => $people->count(), 'by_issue' => $byIssue, 'rows' => $people->values()->all()];
    }

    /**
     * Rows of one group gathered per employee, the longest gone first (then by code).
     *
     * @param  Collection<int, OpenItemRow>  $rows
     * @return Collection<int, Collection<int, OpenItemRow>>
     */
    private static function peopleOldestFirst(Collection $rows): Collection
    {
        return $rows->groupBy('employee_id')->sortBy([
            fn (Collection $a, Collection $b) => ((AccessFacts::daysSince($b->first()->last_day) ?? 0) <=> (AccessFacts::daysSince($a->first()->last_day) ?? 0)),
            fn (Collection $a, Collection $b) => strnatcasecmp((string) $a->first()->code, (string) $b->first()->code),
        ]);
    }

    /** @param Collection<int, array<string, mixed>> $people */
    private static function oldest(Collection $people): ?int
    {
        return $people->isEmpty() ? null : max(0, (int) $people->max(fn (array $p) => $p['days_out'] ?? 0));
    }

    public static function expiryDays(): int
    {
        return max(0, (int) AppSetting::get('password_expiry_days', '0'));
    }

    // ── selects ─────────────────────────────────────────────────────────────────────

    /**
     * @param  Builder<Employee>|null  $match
     * @return list<\Illuminate\Database\Query\Builder>
     */
    private static function selects(string $group, ?int $departmentId, ?Builder $match, ?string $like): array
    {
        return match ($group) {
            'asset' => [self::assetSelect($departmentId, $match)],
            'access' => [self::accessSelect($departmentId, $match)],
            'acct' => self::accountSelects($departmentId, $match, $like),
            'data' => self::dataSelects($departmentId, $match),
        };
    }

    private static function flat(Builder $query, string $id, string $group, int $rank, string $ref, string $kind, int $kindRank): \Illuminate\Database\Query\Builder
    {
        return $query->selectRaw(
            "{$id} as id, '{$group}' as grp, {$rank} as grp_rank, employees.id as employee_id, {$ref} as ref_id, {$kind} as kind, {$kindRank} as kind_rank, employees.last_day as last_day, employees.code as code"
        )->toBase();
    }

    /** Department and search narrowing on a select that has `employees`. */
    private static function narrow(Builder $query, ?int $departmentId, ?Builder $match): Builder
    {
        return $query
            ->when($departmentId, fn (Builder $q) => $q->where('employees.department_id', $departmentId))
            ->when($match, fn (Builder $q) => $q->whereIn('employees.id', $match));
    }

    private static function assetSelect(?int $departmentId, ?Builder $match): \Illuminate\Database\Query\Builder
    {
        $query = Asset::query()->join('employees', 'employees.id', '=', 'assets.owner_employee_id')
            ->where('employees.status', EmployeeStatus::Resigned->value);

        return self::flat(self::narrow($query, $departmentId, $match), 'assets.id * 16', 'asset', 0, 'assets.id', 'assets.status', 0);
    }

    private static function accessSelect(?int $departmentId, ?Builder $match): \Illuminate\Database\Query\Builder
    {
        $query = AccessMembership::query()->join('employees', 'employees.id', '=', 'access_memberships.employee_id')
            ->whereNull('access_memberships.revoked_at');
        AccessFacts::whereLeft($query);

        return self::flat(self::narrow($query, $departmentId, $match), 'access_memberships.id * 16 + 1', 'access', 1, 'access_memberships.id', 'access_memberships.resource_type', 0);
    }

    /** @return list<\Illuminate\Database\Query\Builder> */
    private static function accountSelects(?int $departmentId, ?Builder $match, ?string $like): array
    {
        $account = function (Builder $query, string $kind, int $kindRank) use ($departmentId, $match, $like) {
            $query->when($departmentId, fn (Builder $q) => $q->where('employees.department_id', $departmentId))
                ->when($match, fn (Builder $q) => $q->where(fn (Builder $w) => $w
                    ->whereIn('employees.id', $match)
                    ->orWhereRaw("users.username like ? escape '!'", [$like])));

            return self::flat($query, 'users.id * 16 + 2', 'acct', 2, 'users.id', "'{$kind}'", $kindRank);
        };
        $stillWorks = fn (Builder $q) => $q->where(fn (Builder $w) => $w->whereNull('employees.id')
            ->orWhere(fn (Builder $n) => $n->whereNot(fn (Builder $left) => AccessFacts::whereLeft($left))));

        $left = User::query()->join('employees', 'employees.id', '=', 'users.employee_id');
        AccessFacts::whereLeft($left);

        $mustChange = $stillWorks(User::query()->leftJoin('employees', 'employees.id', '=', 'users.employee_id')
            ->where('users.must_change_password', true));

        $selects = [$account($left, 'left', 0), $account($mustChange, 'must_change', 1)];

        $days = self::expiryDays();
        if ($days > 0) {
            $expired = $stillWorks(User::query()->leftJoin('employees', 'employees.id', '=', 'users.employee_id')
                ->where('users.must_change_password', false)
                // Same rule as User::isPasswordExpired(): never changed counts as expired.
                ->where(fn ($q) => $q->whereNull('users.password_changed_at')->orWhere('users.password_changed_at', '<', now()->subDays($days))));
            $selects[] = $account($expired, 'expired', 2);
        }

        return $selects;
    }

    /** @return list<\Illuminate\Database\Query\Builder> */
    private static function dataSelects(?int $departmentId, ?Builder $match): array
    {
        $working = fn (Builder $q) => $q->whereNot(fn (Builder $left) => AccessFacts::whereLeft($left));
        $notSpecial = fn (Builder $q) => $q->leftJoin('positions', 'positions.id', '=', 'employees.position_id')
            ->where(fn (Builder $w) => $w->whereNull('positions.allow_special_position')->orWhere('positions.allow_special_position', false));
        $issue = function (Builder $query, string $kind) use ($departmentId, $match) {
            $rank = array_search($kind, self::ISSUES, true);

            return self::flat(self::narrow($query, $departmentId, $match), 'employees.id * 16 + '.($rank + 3), 'data', 3, 'null', "'{$kind}'", $rank);
        };

        $managerLeft = Employee::query()->join('employees as m', 'm.id', '=', 'employees.manager_id');
        $working($managerLeft);
        AccessFacts::whereLeft($managerLeft, 'm');

        return [
            $issue($managerLeft, 'mgr_left'),
            $issue($notSpecial($working(Employee::query()))->whereNull('employees.manager_id'), 'no_mgr'),
            $issue($working(Employee::query())->whereNull('employees.email'), 'no_email'),
            $issue($notSpecial($working(Employee::query()))->whereNull('employees.department_id'), 'no_dept'),
            $issue($notSpecial($working(Employee::query()))->whereNull('employees.section_id'), 'no_sec'),
            $issue($working(Employee::query())->whereNull('employees.position_id'), 'no_pos'),
            $issue(Employee::query()->whereNotNull('employees.last_day')->whereNotNull('employees.joined_at')
                ->whereColumn('employees.last_day', '<', 'employees.joined_at'), 'bad_dates'),
        ];
    }

    // ── search ──────────────────────────────────────────────────────────────────────

    /**
     * Employees a search finds by code / name words, asset code or serial, or (credentials only) username; bindings, % _ ! literal.
     *
     * @return Builder<Employee>
     */
    private static function matchingEmployees(string $search, bool $withUsernames): Builder
    {
        $words = preg_split('/\s+/u', trim($search), -1, PREG_SPLIT_NO_EMPTY) ?: [];
        $whole = self::like($search);
        $nameFields = ['employees.code', 'employees.first_name', 'employees.last_name', 'employees.first_name_th', 'employees.last_name_th'];

        $query = Employee::query()->select('employees.id')->where(function (Builder $w) use ($words, $nameFields, $whole, $withUsernames) {
            $w->where(function (Builder $names) use ($words, $nameFields) {
                foreach ($words as $word) {
                    $like = self::like($word);
                    $names->where(function (Builder $any) use ($nameFields, $like) {
                        foreach ($nameFields as $field) {
                            $any->orWhereRaw("{$field} like ? escape '!'", [$like]);
                        }
                    });
                }
            })->orWhereIn('employees.id', Asset::query()->select('owner_employee_id')->whereNotNull('owner_employee_id')
                ->where(fn ($q) => $q->whereRaw("asset_code like ? escape '!'", [$whole])->orWhereRaw("serial like ? escape '!'", [$whole])));
            if ($withUsernames) {
                $w->orWhereIn('employees.id', User::query()->select('employee_id')->whereNotNull('employee_id')
                    ->whereRaw("username like ? escape '!'", [$whole]));
            }
        });

        return $query;
    }

    private static function like(string $text): string
    {
        return '%'.str_replace(['!', '%', '_'], ['!!', '!%', '!_'], trim($text)).'%';
    }
}
