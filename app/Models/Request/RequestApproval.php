<?php

namespace App\Models\Request;

use App\Enums\Request\ApprovalSkipReason;
use App\Enums\Request\ApprovalStatus;
use App\Enums\Request\StepActorType;
use App\Enums\Request\WorkflowStepKind;
use App\Models\Employee\Employee;
use App\Models\User;
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
        'service_request_id', 'position', 'actor_type', 'kind', 'label', 'sla_days',
        'approver_employee_id', 'approver_name',
        // note = what a person wrote · skip_reason = why the engine skipped the step
        'status', 'note', 'skip_reason', 'acted_by_user_id', 'acted_by_name',
        'became_current_at', 'due_at', 'acted_at',
    ];

    protected function casts(): array
    {
        return [
            'position' => 'integer',
            'actor_type' => StepActorType::class,
            'kind' => WorkflowStepKind::class,
            'status' => ApprovalStatus::class,
            'skip_reason' => ApprovalSkipReason::class,
            'sla_days' => 'decimal:2',
            'became_current_at' => 'datetime',
            'due_at' => 'datetime',
            'acted_at' => 'datetime',
        ];
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
