<?php

namespace App\Services\Report\Access;

use App\Models\Access\AccessMembership;
use App\Models\Access\FileShare;
use App\Models\Employee\Department;
use App\Models\User;
use App\Services\Report\Tabular\Options;
use App\Services\Report\Tabular\ReportColumn;
use App\Services\Report\Tabular\ReportFilter;
use App\Services\Report\Tabular\ReportSummary;
use App\Services\Report\Tabular\TabularReport;
use App\Support\SearchTerms;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;

/**
 * "ตรวจสอบสมาชิกและเจ้าของ": each email group, file share and social account with its owner and members,
 * one row per member, for the owner to review; breakdown() feeds the resource table, the File Share
 * space cards and one resource's member review sheet (sheet(), also printed as a PDF).
 */
class AccessResourceMembersReport extends TabularReport
{
    /** Software has its own licence report. */
    public const TYPES = ['email_group', 'file_share', 'social_platform'];

    private const TODO_KEYS = [
        'leaver' => 'rep_ar_todo_leaver', 'owner' => 'rep_ar_todo_owner',
        'cross' => 'rep_ar_todo_cross', 'empty' => 'rep_ar_todo_empty',
    ];

    private const STATE_KEYS = ['active' => 'rep_ar_state_active', 'cross' => 'rep_ar_state_cross', 'revoked' => 'rep_ar_state_revoked'];

    private const SORT_KEYS = [
        'resource' => 'rep_ar_sort_resource', 'employee' => 'rep_ar_sort_employee', 'department' => 'rep_ar_sort_department',
        'newest' => 'rep_ar_sort_newest', 'oldest' => 'rep_ar_sort_oldest',
    ];

    private const STATUS_KEYS = [
        'active' => 'rep_ac_status_active', 'cross' => 'rep_ac_status_cross',
        'left' => 'rep_ac_status_left', 'revoked' => 'rep_ac_status_revoked',
    ];

    private const STATUS_TH = ['active' => 'ใช้งาน', 'cross' => 'ใช้งาน (ข้ามแผนก)', 'left' => 'ผู้ลาออกยังถือ', 'revoked' => 'ถอนแล้ว'];

    /** The column searched besides the code and name. */
    private const DETAIL_COLUMNS = ['email_group' => 'email', 'file_share' => 'path', 'social_platform' => 'url'];

    /** File share sizes to GB, for the space cards. */
    public const TO_GB = ['KB' => 1 / 1048576, 'GB' => 1, 'TB' => 1024, 'PB' => 1048576];

    /** @var array<string, Collection<int, array<string, mixed>>> resources() per filter set, within one request */
    private array $figures = [];

    /** @var array<string, Collection<int, AccessMembership>> activeMembers() per filter set, within one request */
    private array $members = [];

    public function key(): string
    {
        return 'access.resource_members';
    }

    public function title(): string
    {
        return 'ตรวจสอบสมาชิกและเจ้าของ';
    }

    public function filters(): array
    {
        return [
            ReportFilter::select('type', Options::fromLabels(array_intersect_key(AccessFacts::TYPE_KEYS, array_flip(self::TYPES))))->labelKey('rep_fl_ac_type'),
            ReportFilter::select('department_id', Options::departments())->labelKey('rep_fl_ar_department'),
            ReportFilter::select('todo', Options::fromLabels(self::TODO_KEYS))->labelKey('rep_fl_ar_todo'),
            ReportFilter::search(),
            ReportFilter::select('resource', self::resourceOptions())->labelKey('rep_fl_ar_resource'),
            ReportFilter::select('state', Options::fromLabels(self::STATE_KEYS), 'active')->labelKey('rep_fl_ar_state'),
            ReportFilter::select('sort', Options::fromLabels(self::SORT_KEYS), 'resource')->labelKey('rep_fl_ar_sort')->viewOnly(),
        ];
    }

    /**
     * Every resource, as the picker behind "N คน ›" names it: "type:id" → "CODE Name".
     *
     * @return list<array{value: string, label: string}>
     */
    private static function resourceOptions(): array
    {
        return once(function (): array {
            $options = [];
            foreach (self::TYPES as $type) {
                foreach (AccessFacts::MODELS[$type]::query()->orderBy('code')->get(['id', 'code', 'name']) as $r) {
                    $options[] = ['value' => "{$type}:{$r->id}", 'label' => trim("{$r->code} {$r->name}")];
                }
            }

            return $options;
        });
    }

    /**
     * Each resource the filters keep, with its owner and what its active members are, most to do first.
     *
     * @param  array<string, mixed>  $filters
     * @return Collection<int, array<string, mixed>>
     */
    public function resources(array $filters): Collection
    {
        $key = md5(serialize([$filters['type'] ?? null, $filters['department_id'] ?? null, $filters['todo'] ?? null, $filters['search'] ?? null]));

        return $this->figures[$key] ??= $this->loadResources($filters);
    }

    /**
     * @param  array<string, mixed>  $filters
     * @return Collection<int, array<string, mixed>>
     */
    private function loadResources(array $filters): Collection
    {
        $types = ($filters['type'] ?? null) ? [$filters['type']] : self::TYPES;
        $rows = collect();
        foreach ($types as $type) {
            $ownable = in_array($type, AccessFacts::OWNABLE, true);
            if (! $ownable && ($filters['department_id'] ?? null)) {
                continue;
            }
            $model = AccessFacts::MODELS[$type];
            $model::query()
                ->with([...($ownable ? ['department', 'owner.department'] : []), 'memberships' => fn ($m) => $m->whereNull('revoked_at')->with('employee.department')])
                ->when($filters['department_id'] ?? null, fn (Builder $q, $id) => $q->where('department_id', (int) $id))
                ->when($filters['search'] ?? null, fn (Builder $q, string $search) => SearchTerms::apply($q, $search, ['code', 'name', self::DETAIL_COLUMNS[$type]]))
                ->orderBy('code')->get()
                ->each(fn (Model $r) => $rows->push($this->figuresOf($r, $type)));
        }

        $todo = $filters['todo'] ?? null;

        return $rows
            ->filter(fn (array $r) => match ($todo) {
                'leaver' => $r['mix']['gone'] > 0,
                'owner' => $r['owner_issue'] !== null,
                'cross' => $r['mix']['cross'] > 0,
                'empty' => $r['members'] === 0,
                default => true,
            })
            ->sortBy([['rank', 'desc'], ['members', 'desc'], ['code', 'asc']])
            ->values();
    }

    /**
     * One resource: its owner, its members by where they sit (in its department, another, gone, or
     * it has no department), Read / Read-Write for a file share, and its size.
     *
     * @return array<string, mixed>
     */
    private function figuresOf(Model $resource, string $type): array
    {
        $ownable = in_array($type, AccessFacts::OWNABLE, true);
        $owner = $ownable ? $resource->getRelationValue('owner') : null;
        $mix = ['in_dept' => 0, 'cross' => 0, 'gone' => 0, 'open' => 0];
        $levels = ['Read' => 0, 'Write' => 0];
        foreach ($resource->getRelationValue('memberships') as $m) {
            $mix[$this->kindOf($m, $resource, $type)]++;
            if (isset($levels[$m->access_level])) {
                $levels[$m->access_level]++;
            }
        }
        $issue = ! $ownable ? null : ($owner === null ? 'none' : ($owner->hasLeft() ? 'gone' : null));
        $members = array_sum($mix);

        return AccessFacts::resource($resource, $type) + [
            'owner' => $owner ? AccessFacts::person($owner) : null,
            'owner_issue' => $issue,
            'members' => $members,
            'mix' => $mix,
            'read' => $levels['Read'],
            'write' => $levels['Write'],
            'size' => $resource instanceof FileShare && $resource->size !== null ? ['value' => (int) $resource->size, 'unit' => $resource->size_unit] : null,
            'rank' => $mix['gone'] * 1000 + ($issue ? 100 : 0) + $mix['cross'] * 10 - ($members ? 0 : 1),
        ];
    }

    /** Where a member sits next to the resource: gone (has left), open (no department to compare), in its department, or across. */
    private function kindOf(AccessMembership $m, Model $resource, string $type): string
    {
        $department = in_array($type, AccessFacts::OWNABLE, true) ? $resource->getAttribute('department_id') : null;

        return match (true) {
            (bool) $m->employee?->hasLeft() => 'gone',
            $department === null, $m->employee?->department_id === null => 'open',
            (int) $department === (int) $m->employee?->department_id => 'in_dept',
            default => 'cross',
        };
    }

    /**
     * The members of the resources the filters keep (or of the one picked), active or not.
     *
     * @param  array<string, mixed>  $filters
     */
    private function memberships(array $filters): Builder
    {
        $byType = $this->resources($filters)->groupBy('type')->map(fn (Collection $rs) => $rs->pluck('id')->all());
        [$pickedType, $pickedId] = array_pad(explode(':', (string) ($filters['resource'] ?? '')), 2, null);

        return AccessMembership::query()
            ->select('access_memberships.*')
            ->join('employees', 'employees.id', '=', 'access_memberships.employee_id')
            ->where(function (Builder $q) use ($byType) {
                $q->whereRaw('1 = 0');
                foreach ($byType as $type => $ids) {
                    $q->orWhere(fn (Builder $w) => $w->where('access_memberships.resource_type', $type)->whereIn('access_memberships.resource_id', $ids));
                }
            })
            ->when($pickedType && $pickedId, fn (Builder $q) => $q->where('access_memberships.resource_type', $pickedType)
                ->where('access_memberships.resource_id', (int) $pickedId));
    }

    public function query(User $viewer, array $filters): Builder
    {
        $state = $filters['state'] ?? 'active';
        $query = AccessFacts::withResource($this->memberships($filters), owners: true)
            ->with(['employee.department', 'grantedBy:id,name', 'revokedBy:id,name'])
            ->when($state !== 'revoked', fn (Builder $q) => $q->whereNull('access_memberships.revoked_at'))
            ->when($state === 'revoked', fn (Builder $q) => $q->whereNotNull('access_memberships.revoked_at'))
            ->when($state === 'cross', fn (Builder $q) => $q->whereIn('access_memberships.id', $this->crossIds($filters)));

        $byName = fn (Builder $q) => $q->orderBy('employees.first_name')->orderBy('employees.last_name');

        return match ($filters['sort'] ?? 'resource') {
            'employee' => $byName($query)->orderBy('access_memberships.resource_type')->orderBy('access_memberships.resource_id'),
            'department' => $byName($query->orderBy(Department::query()->select('name')->whereColumn('departments.id', 'employees.department_id'))),
            'newest' => $query->orderByDesc('access_memberships.granted_at')->orderByDesc('access_memberships.id'),
            'oldest' => $query->orderBy('access_memberships.granted_at')->orderBy('access_memberships.id'),
            default => $byName($query->orderBy('access_memberships.resource_type')->orderBy('access_memberships.resource_id')),
        };
    }

    /**
     * Active members sitting across departments (leavers aside, they count as gone).
     *
     * @param  array<string, mixed>  $filters
     * @return list<int>
     */
    private function crossIds(array $filters): array
    {
        return $this->activeMembers($filters)->filter(fn (AccessMembership $m) => $m->getAttribute('kind') === 'cross')->pluck('id')->all();
    }

    /**
     * The active members the filters keep, each with its kind.
     *
     * @param  array<string, mixed>  $filters
     * @return Collection<int, AccessMembership>
     */
    private function activeMembers(array $filters): Collection
    {
        return $this->members[md5(serialize($filters))] ??= AccessFacts::withResource($this->memberships($filters))->with('employee.department')
            ->whereNull('access_memberships.revoked_at')->get()
            ->each(fn (AccessMembership $m) => $m->setAttribute('kind', $m->resource ? $this->kindOf($m, $m->resource, $m->resource_type) : 'open'));
    }

    public function columns(): array
    {
        return [
            ReportColumn::text('resource', 'Resource', fn (AccessMembership $m) => $m->resource?->getAttribute('name'))->labelKey('rep_c_ac_resource'),
            // Drawn under the resource, the name and the status on the page.
            ReportColumn::enum('resource_type', 'ประเภท', fn (AccessMembership $m) => $m->resource_type, AccessFacts::TYPE_KEYS, AccessFacts::TYPE_TH)
                ->labelKey('rep_c_ac_type')->hiddenByDefault(),
            ReportColumn::text('resource_code', 'รหัส Resource', fn (AccessMembership $m) => $m->resource?->getAttribute('code'))
                ->labelKey('rep_c_ac_resource_code')->hiddenByDefault(),
            ReportColumn::text('resource_detail', 'อีเมล / Path / URL', fn (AccessMembership $m) => AccessFacts::detail($m->resource))
                ->labelKey('rep_c_ac_resource_detail')->hiddenByDefault(),
            ReportColumn::localized('resource_department', 'แผนกของ Resource', fn (AccessMembership $m) => in_array($m->resource_type, AccessFacts::OWNABLE, true) ? AccessFacts::department($m->resource) : null)
                ->labelKey('rep_c_ac_resource_department')->hiddenByDefault(),
            ReportColumn::text('owner', 'เจ้าของ', fn (AccessMembership $m) => $this->ownerLabel($m))->labelKey('rep_c_ar_owner')->sheetOnly(),
            ReportColumn::text('employee', 'พนักงาน', fn (AccessMembership $m) => $m->employee?->name)
                ->labelKey('rep_c_ac_employee')->linkTo('/employees', fn (AccessMembership $m) => $m->employee_id),
            ReportColumn::text('employee_code', 'รหัสพนักงาน', fn (AccessMembership $m) => $m->employee?->code)->hiddenByDefault(),
            ReportColumn::localized('department', 'แผนก', fn (AccessMembership $m) => AccessFacts::department($m->employee)),
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

    private function ownerLabel(AccessMembership $m): ?string
    {
        $owner = in_array($m->resource_type, AccessFacts::OWNABLE, true) ? $m->resource?->getRelationValue('owner') : null;

        return $owner ? "{$owner->name} ({$owner->code})" : null;
    }

    private function status(AccessMembership $m): string
    {
        if ($m->revoked_at !== null) {
            return 'revoked';
        }

        return match ($m->resource ? $this->kindOf($m, $m->resource, $m->resource_type) : 'open') {
            'gone' => 'left',
            'cross' => 'cross',
            default => 'active',
        };
    }

    public function summary(Builder $query, array $filters): array
    {
        $resources = $this->resources($filters);
        $members = $this->activeMembers(['resource' => null] + $filters);
        $sum = fn (string $part) => $resources->sum(fn (array $r) => $r['mix'][$part]);
        $byType = $resources->countBy('type');
        $total = $resources->sum('members');
        $socialOnly = ($filters['type'] ?? null) === 'social_platform';
        $ownable = $resources->whereIn('type', AccessFacts::OWNABLE);

        return [
            ReportSummary::make('ar_resources', 'Resource', $resources->count())->withSplit(array_map(fn (string $type) => [
                'key' => $type, 'label_key' => AccessFacts::TYPE_KEYS[$type], 'short_key' => AccessFacts::TYPE_SHORT_KEYS[$type], 'tone' => AccessFacts::TYPE_TONES[$type], 'value' => (int) $byType->get($type, 0),
            ], ($filters['type'] ?? null) ? [$filters['type']] : self::TYPES)),
            ReportSummary::make('ar_members', 'สมาชิกทั้งหมด', $total)->withNote([
                'label_key' => 'rep_n_ar_members',
                'values' => ['people' => $members->pluck('employee_id')->unique()->count()],
            ]),
            ReportSummary::make('ar_cross', 'สมาชิกข้ามแผนก', $socialOnly ? null : $sum('cross'))
                ->withShareOf($resources->sum(fn (array $r) => $r['mix']['in_dept'] + $r['mix']['cross']))
                ->withNote($socialOnly
                    ? ['label_key' => 'rep_n_ar_cross_social']
                    : ['label_key' => $sum('cross') > 0 ? 'rep_n_ar_cross' : 'rep_n_ar_cross_none', 'values' => ['n' => $resources->filter(fn (array $r) => $r['mix']['cross'] > 0)->count()]]),
            ReportSummary::make('ar_leavers', 'ผู้ลาออกยังเป็นสมาชิก', $sum('gone'))->withAttention('red')->withNote([
                'label_key' => $sum('gone') > 0 ? 'rep_n_ar_leavers' : 'rep_n_ar_leavers_none',
                'values' => ['n' => $resources->filter(fn (array $r) => $r['mix']['gone'] > 0)->count()],
            ]),
            ReportSummary::make('ar_owner', 'ต้องหาเจ้าของ', $ownable->whereNotNull('owner_issue')->count())->withAttention('amber')->withSplit([
                ['key' => 'none', 'label_key' => 'rep_ac_care_no_owner', 'tone' => 'soft-amber', 'value' => $ownable->where('owner_issue', 'none')->count()],
                ['key' => 'gone', 'label_key' => 'rep_ac_care_owner_gone', 'short_key' => 'rep_ac_care_owner_gone_short', 'tone' => 'soft-red', 'value' => $ownable->where('owner_issue', 'gone')->count()],
            ]),
        ];
    }

    /**
     * The resource table and the space cards above the list, the segments' counts, and the picked
     * resource's review sheet.
     *
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function breakdown(User $viewer, array $filters): array
    {
        $resources = $this->resources($filters);
        $everyType = $this->resources(['type' => null] + $filters);
        $members = $this->activeMembers($filters);
        $revoked = $this->memberships($filters)->whereNotNull('access_memberships.revoked_at')->count();

        return [
            'types' => collect(self::TYPES)->mapWithKeys(fn (string $t) => [$t => $everyType->where('type', $t)->count()])->all(),
            'states' => ['active' => $members->count(), 'cross' => $members->where('kind', 'cross')->count(), 'revoked' => $revoked],
            'resources' => $resources->map(fn (array $r) => collect($r)->except('rank')->all())->all(),
            // Only while the picked resource is still among the filtered ones; the page clears a stale pick.
            'sheet' => $resources->contains(fn (array $r) => "{$r['type']}:{$r['id']}" === ($filters['resource'] ?? null)) ? $this->sheet($filters) : null,
        ];
    }

    /**
     * One resource's member review sheet: the resource, its owner, and every active member by name.
     *
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>|null
     */
    public function sheet(array $filters): ?array
    {
        [$type, $id] = array_pad(explode(':', (string) ($filters['resource'] ?? '')), 2, null);
        if (! in_array($type, self::TYPES, true) || ! $id) {
            return null;
        }
        $ownable = in_array($type, AccessFacts::OWNABLE, true);
        $resource = AccessFacts::MODELS[$type]::query()
            ->with([...($ownable ? ['department', 'owner.department'] : []), 'memberships' => fn ($m) => $m->whereNull('revoked_at')->with('employee.department')])
            ->find((int) $id);
        if ($resource === null) {
            return null;
        }

        $members = $resource->getRelationValue('memberships')
            ->map(fn (AccessMembership $m) => AccessFacts::person($m->employee) + [
                'level' => AccessFacts::level($m),
                'granted_at' => $m->granted_at?->format('Y-m-d'),
                'kind' => $this->kindOf($m, $resource, $type),
            ])
            ->sortBy('name', SORT_NATURAL | SORT_FLAG_CASE)
            ->values()
            ->all();

        return collect($this->figuresOf($resource, $type))->except('rank')->all() + ['list' => $members];
    }

    /**
     * The resource table and the space by department as sheets.
     *
     * @param  array<string, mixed>  $filters
     * @return list<array{title: string, headings: list<string>, rows: list<list<string|int|float|null>>}>
     */
    public function exportSections(User $viewer, array $filters): array
    {
        $resources = $this->resources($filters);
        $name = fn (?array $l) => $l === null ? null : (($l['name_th'] ?? null) ?: $l['name']);
        $size = fn (?array $s) => $s === null ? null : ($s['value'] === 0 ? 'ไม่จำกัดขนาด' : "{$s['value']} {$s['unit']}");
        $shares = $resources->where('type', 'file_share')->filter(fn (array $r) => $r['size'] !== null);
        $gb = fn (array $r) => $r['size']['value'] * (self::TO_GB[$r['size']['unit']] ?? 0);

        return [
            [
                'title' => 'Resource',
                'headings' => ['ประเภท', 'รหัส', 'ชื่อ', 'อีเมล / Path / URL', 'แผนก', 'เจ้าของ', 'สมาชิก', 'ในแผนก', 'ข้ามแผนก', 'ผู้ลาออก', 'Read', 'Read/Write', 'ขนาด'],
                'rows' => $resources->map(fn (array $r) => [
                    AccessFacts::TYPE_TH[$r['type']], $r['code'], $r['name'], $r['detail'], $name($r['department']),
                    $r['owner'] ? "{$r['owner']['name']} ({$r['owner']['code']})" : ($r['owner_issue'] === 'none' ? 'ไม่มีเจ้าของ' : null),
                    $r['members'], $r['mix']['in_dept'], $r['mix']['cross'], $r['mix']['gone'],
                    $r['type'] === 'file_share' ? $r['read'] : null, $r['type'] === 'file_share' ? $r['write'] : null, $size($r['size']),
                ])->all(),
            ],
            [
                'title' => 'พื้นที่ File Share ตามแผนก',
                'headings' => ['แผนก', 'แชร์', 'ขนาดที่จัดสรร (GB)', 'ไม่จำกัดขนาด'],
                'rows' => $shares->groupBy(fn (array $r) => $name($r['department']) ?? 'ไม่ระบุแผนก')
                    ->map(fn (Collection $group, string $department) => [
                        $department, $group->count(),
                        round($group->filter(fn (array $r) => $r['size']['value'] > 0)->sum($gb), 2),
                        $group->filter(fn (array $r) => $r['size']['value'] === 0)->count(),
                    ])->values()->all(),
            ],
        ];
    }
}
