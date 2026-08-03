<?php

namespace App\Http\Resources\Request;

use App\Enums\Request\ApprovalStatus;
use App\Models\Request\RequestApproval;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One frozen approval-chain row as the SPA trail renders it.
 *
 * @mixin RequestApproval
 */
class RequestApprovalResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'position' => $this->position,
            'actor_type' => $this->actor_type?->value,
            'kind' => $this->kind?->value,
            'label' => $this->label,
            'sla_days' => $this->sla_days !== null ? (float) $this->sla_days : null,
            'status' => $this->status?->value,
            'approver_employee_id' => $this->approver_employee_id,
            'approver_name' => $this->approver_name,
            'note' => $this->note,
            'acted_by_name' => $this->acted_by_name,
            'became_current_at' => $this->became_current_at?->toDateTimeString(),
            'due_at' => $this->due_at?->toDateTimeString(),
            'acted_at' => $this->acted_at?->toDateTimeString(),
            'overdue' => $this->status === ApprovalStatus::Current
                && $this->due_at !== null
                && $this->due_at->isPast(),
        ];
    }
}
