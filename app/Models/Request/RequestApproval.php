<?php

namespace App\Models\Request;

use App\Enums\Request\ApprovalSkipReason;
use App\Enums\Request\ApprovalStatus;
use App\Enums\Request\StepActorType;
use App\Enums\Request\WorkflowStepKind;
use App\Models\Employee\Employee;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

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

    /** Whether this employee may act on a group step. */
    public function acceptsEmployee(?Employee $employee): bool
    {
        if ($employee === null) {
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

        return $query->where(function (Builder $q) use ($employee) {
            $q->where('approver_employee_id', $employee->id)
                ->orWhere(fn (Builder $named) => $named
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
