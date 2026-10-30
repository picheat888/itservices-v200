<?php

namespace App\Models\Request;

use App\Enums\Employee\EmployeeStatus;
use App\Enums\Request\ApprovalSkipReason;
use App\Enums\Request\ApprovalStatus;
use App\Enums\Request\StepActorType;
use App\Enums\Request\WorkflowStepKind;
use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Employee\Position;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Collection;

/**
 * One frozen step of a service request's resolved approval chain. Created at
 * submit by WorkflowResolverService and never re-resolved — approver identity,
 * labels and SLA stay exactly as they were when the requester hit submit.
 */
class RequestApproval extends Model
{
    protected $fillable = [
        'service_request_id', 'position', 'actor_type', 'kind', 'label',
        'approver_employee_id', 'approver_name', 'approver_department_id', 'approver_position_ids',
        'approver_employee_ids',
        // note = what a person wrote · skip_reason = why the engine skipped the step
        'status', 'note', 'skip_reason', 'acted_by_user_id', 'acted_by_name',
        'became_current_at', 'acted_at',
    ];

    /** @var array{department: string|null, department_th: string|null, positions: list<string>, candidates: list<string>, candidates_th: list<string|null>}|null */
    protected ?array $preloadedGroupNames = null;

    /** @var Collection<int, Employee>|null */
    protected ?Collection $preloadedCandidates = null;

    protected function casts(): array
    {
        return [
            'position' => 'integer',
            'actor_type' => StepActorType::class,
            'kind' => WorkflowStepKind::class,
            'status' => ApprovalStatus::class,
            'skip_reason' => ApprovalSkipReason::class,
            'approver_position_ids' => 'array',
            'approver_employee_ids' => 'array',
            'became_current_at' => 'datetime',
            'acted_at' => 'datetime',
        ];
    }

    /**
     * True when this step is open to a group rather than to one named person: a department
     * step configured by position. The first eligible person to act takes it, and acting
     * writes their id into approver_employee_id — so a decided row reads like any other and
     * nothing downstream has to know the difference.
     */
    public function isOpenToDepartment(): bool
    {
        return $this->approver_employee_id === null
            && $this->approver_department_id !== null
            && $this->approver_position_ids !== null
            && $this->approver_position_ids !== [];
    }

    /**
     * The same openness, reached the other way: the step named several people by hand
     * rather than a rung of a department. A list of alternates, not signatures to collect —
     * the first of them to act settles the step, exactly as with a department group.
     */
    public function isOpenToNamedGroup(): bool
    {
        return $this->approver_employee_id === null
            && $this->approver_employee_ids !== null
            && $this->approver_employee_ids !== [];
    }

    /** Open to more than one person, by either route. */
    public function isOpenToGroup(): bool
    {
        return $this->isOpenToNamedGroup() || $this->isOpenToDepartment();
    }

    /**
     * The employee ids a named-group step accepts; empty on every other kind of row.
     *
     * @return list<int>
     */
    public function namedApproverIds(): array
    {
        return $this->isOpenToNamedGroup()
            ? array_map('intval', array_values($this->approver_employee_ids))
            : [];
    }

    /**
     * What a group step shows instead of one name: its department, position titles and named people.
     *
     * @return array{department: string|null, department_th: string|null, positions: list<string>, candidates: list<string>, candidates_th: list<string|null>}
     */
    public function groupNames(): array
    {
        if ($this->preloadedGroupNames === null) {
            static::preloadGroupNames([$this]);
        }

        return $this->preloadedGroupNames;
    }

    /**
     * Fills groupNames() for many rows at once — one query per lookup table instead of per row.
     *
     * @param  iterable<RequestApproval>  $approvals
     */
    public static function preloadGroupNames(iterable $approvals): void
    {
        $rows = collect($approvals);
        $departmentRows = $rows->filter(fn (self $row) => $row->isOpenToDepartment());
        $namedRows = $rows->filter(fn (self $row) => $row->isOpenToNamedGroup());

        $departmentIds = $departmentRows->pluck('approver_department_id')->unique()->values();
        $positionIds = $departmentRows->flatMap(fn (self $row) => $row->approver_position_ids)->unique()->values();
        $employeeIds = $namedRows->flatMap(fn (self $row) => $row->namedApproverIds())->unique()->values();

        $departments = $departmentIds->isEmpty() ? collect() : Department::whereIn('id', $departmentIds)->get()->keyBy('id');
        $positions = $positionIds->isEmpty() ? collect() : Position::whereIn('id', $positionIds)->pluck('title', 'id');
        $employees = $employeeIds->isEmpty() ? collect() : Employee::whereIn('id', $employeeIds)->get()->keyBy('id');

        foreach ($rows as $row) {
            $row->preloadedGroupNames = [
                'department' => $row->isOpenToDepartment() ? $departments->get($row->approver_department_id)?->name : null,
                'department_th' => $row->isOpenToDepartment() ? $departments->get($row->approver_department_id)?->name_th : null,
                // Id order, the order a whereIn on positions returns.
                'positions' => $row->isOpenToDepartment()
                    ? collect($row->approver_position_ids)->map(fn ($id) => (int) $id)->unique()->sort()
                        ->filter(fn (int $id) => $positions->has($id))
                        ->map(fn (int $id) => $positions->get($id))->values()->all()
                    : [],
                // The workflow's own order: the first name is who the route means to ask.
                'candidates' => collect($row->namedApproverIds())
                    ->map(fn (int $id) => $employees->get($id)?->name)
                    ->filter()->values()->all(),
                // Same order as candidates; null where the person has no Thai name.
                'candidates_th' => collect($row->namedApproverIds())
                    ->filter(fn (int $id) => (bool) $employees->get($id)?->name)
                    ->map(fn (int $id) => $employees->get($id)->name_th)->values()->all(),
            ];
        }
    }

    /**
     * Whether this employee may act on a group step. Never the person the request is for:
     * a department group can include the requester (they hold one of its positions), and
     * the resolver only keeps them out of the "is anybody left?" check, not out of the row.
     */
    public function acceptsEmployee(?Employee $employee): bool
    {
        if ($employee === null || $employee->status === EmployeeStatus::Resigned || $this->isRequestOf($employee)) {
            return false;
        }

        if ($this->isOpenToNamedGroup()) {
            return in_array((int) $employee->id, $this->namedApproverIds(), true);
        }

        return $this->isOpenToDepartment()
            && (int) $employee->department_id === (int) $this->approver_department_id
            && in_array((int) $employee->position_id, array_map('intval', $this->approver_position_ids), true);
    }

    /**
     * Rows this employee may act on — theirs by name, or open to a group they belong to.
     *
     * One place, because five callers ask the same question (the sidebar badge, the
     * "waiting on me" tab and its count, what a viewer may read, and whether the detail
     * page shows Approve) and an answer that differs between them is a request somebody
     * can decide but cannot find.
     *
     * @param  Builder<RequestApproval>  $query
     * @return Builder<RequestApproval>
     */
    public function scopeActionableBy(Builder $query, ?Employee $employee): Builder
    {
        if ($employee === null) {
            return $query->whereRaw('1 = 0');
        }

        // Nobody acts on their own request — see acceptsEmployee().
        $query->whereHas('request', fn (Builder $r) => $r
            ->whereNull('employee_id')
            ->orWhere('employee_id', '!=', $employee->id));

        return $query->where(function (Builder $q) use ($employee) {
            $q->where('approver_employee_id', $employee->id);

            // Group steps accept only people who can still hold a step (see acceptsEmployee).
            if ($employee->status === EmployeeStatus::Resigned) {
                return;
            }

            $q->orWhere(fn (Builder $named) => $named
                ->whereNull('approver_employee_id')
                ->whereJsonContains('approver_employee_ids', (int) $employee->id));

            if ($employee->department_id !== null && $employee->position_id !== null) {
                $q->orWhere(fn (Builder $group) => $group
                    ->whereNull('approver_employee_id')
                    ->where('approver_department_id', $employee->department_id)
                    ->whereJsonContains('approver_position_ids', (int) $employee->position_id));
            }
        });
    }

    /**
     * Employees a group step accepts (read from its criteria, even once taken); never the requester, no resigned unless $onlyActive is false.
     *
     * @return Collection<int, Employee>
     */
    public function groupCandidates(bool $onlyActive = true): Collection
    {
        if ($onlyActive && $this->preloadedCandidates !== null) {
            return $this->preloadedCandidates;
        }

        $namedIds = array_map('intval', array_values($this->approver_employee_ids ?? []));
        $positionIds = array_map('intval', array_values($this->approver_position_ids ?? []));

        if ($namedIds !== []) {
            $query = Employee::whereIn('id', $namedIds);
        } elseif ($this->approver_department_id !== null && $positionIds !== []) {
            $query = Employee::where('department_id', $this->approver_department_id)->whereIn('position_id', $positionIds);
        } else {
            return collect();
        }

        $candidates = $query
            ->with('user')
            ->when($onlyActive, fn ($q) => $q->where('status', '!=', EmployeeStatus::Resigned->value))
            ->when($this->request?->employee_id, fn ($q, $ownerId) => $q->where('id', '!=', $ownerId))
            ->orderBy('id')
            ->get();

        return self::inNamedOrder($candidates, $namedIds);
    }

    /**
     * Fills groupCandidates() for the open group steps among many rows: one employee query instead of one per row.
     *
     * @param  iterable<RequestApproval>  $approvals
     */
    public static function preloadGroupCandidates(iterable $approvals): void
    {
        $rows = collect($approvals)->filter(fn (self $row) => $row->isOpenToGroup()
            && in_array($row->status, [ApprovalStatus::Waiting, ApprovalStatus::Current], true));
        if ($rows->isEmpty()) {
            return;
        }

        $departmentRows = $rows->filter(fn (self $row) => $row->isOpenToDepartment());
        $namedIds = $rows->flatMap(fn (self $row) => $row->namedApproverIds())->unique()->values();
        $departmentIds = $departmentRows->pluck('approver_department_id')->unique()->values();
        $positionIds = $departmentRows->flatMap(fn (self $row) => array_map('intval', $row->approver_position_ids))->unique()->values();

        $employees = Employee::with('user')
            ->where('status', '!=', EmployeeStatus::Resigned->value)
            ->where(fn (Builder $q) => $q->whereIn('id', $namedIds)
                ->orWhere(fn (Builder $d) => $d->whereIn('department_id', $departmentIds)->whereIn('position_id', $positionIds)))
            ->orderBy('id')
            ->get();

        foreach ($rows as $row) {
            $accepted = $employees->filter(fn (Employee $employee) => $row->acceptsEmployee($employee))->values();
            $row->preloadedCandidates = self::inNamedOrder($accepted, $row->namedApproverIds());
        }
    }

    /**
     * Named steps keep the workflow's order: the first name is who the route means to ask.
     *
     * @param  Collection<int, Employee>  $candidates
     * @param  list<int>  $namedIds
     * @return Collection<int, Employee>
     */
    private static function inNamedOrder(Collection $candidates, array $namedIds): Collection
    {
        return $namedIds !== []
            ? $candidates->sortBy(fn (Employee $e) => array_search((int) $e->id, $namedIds, true))->values()
            : $candidates;
    }

    /**
     * Why nobody can act on this open approval step: 'left' when its approver (or every member of its group) has gone,
     * 'no_account' when nobody who could act has a login; null when somebody can.
     */
    public function blockedReason(): ?string
    {
        if ($this->kind !== WorkflowStepKind::Approval || ! in_array($this->status, [ApprovalStatus::Waiting, ApprovalStatus::Current], true)) {
            return null;
        }

        if ($this->isOpenToGroup()) {
            $candidates = $this->groupCandidates();
            if ($candidates->isEmpty()) {
                return 'left';
            }

            return $candidates->contains(fn (Employee $employee) => $employee->user !== null) ? null : 'no_account';
        }

        $approver = $this->approver;
        if ($approver === null) {
            return null;
        }
        if ($approver->hasLeft()) {
            return 'left';
        }

        return $approver->user === null ? 'no_account' : null;
    }

    /** True when this row belongs to a request filed for this employee. */
    private function isRequestOf(Employee $employee): bool
    {
        $ownerId = $this->relationLoaded('request')
            ? $this->request?->employee_id
            : ServiceRequest::query()->whereKey($this->service_request_id)->value('employee_id');

        return $ownerId !== null && (int) $ownerId === (int) $employee->id;
    }

    /** @return BelongsTo<ServiceRequest, $this> */
    public function request(): BelongsTo
    {
        return $this->belongsTo(ServiceRequest::class, 'service_request_id');
    }

    /** @return BelongsTo<Employee, $this> */
    public function approver(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'approver_employee_id');
    }

    /** @return BelongsTo<User, $this> */
    public function actedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'acted_by_user_id');
    }
}
