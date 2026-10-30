<?php

namespace App\Http\Resources\Request;

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
            'status' => $this->status?->value,
            'approver_employee_id' => $this->approver_employee_id,
            'approver_name' => $this->approver_name,
            'approver_name_th' => $this->relationLoaded('approver') ? $this->approver?->name_th : null,
            // A department step open to a group has no name to show: the reader is told
            // which department is holding it, and at which positions, so "waiting on" says
            // something rather than sitting blank.
            'approver_department' => $this->when(
                $this->isOpenToDepartment(),
                fn () => $this->groupNames()['department'],
            ),
            'approver_department_th' => $this->when(
                $this->isOpenToDepartment(),
                fn () => $this->groupNames()['department_th'],
            ),
            'approver_positions' => $this->when(
                $this->isOpenToDepartment(),
                fn () => $this->groupNames()['positions'],
            ),
            // A step open to people named by hand has no department rule to state — it has
            // the names. Listed in the order the workflow names them, so the person the
            // route means to ask reads first and the deputies after.
            'approver_candidates' => $this->when(
                $this->isOpenToNamedGroup(),
                fn () => $this->groupNames()['candidates'],
            ),
            'approver_candidates_th' => $this->when(
                $this->isOpenToNamedGroup(),
                fn () => $this->groupNames()['candidates_th'],
            ),
            'note' => $this->note,
            // Why the engine skipped this step, as a code the SPA writes out in the
            // reader's language (`req_skip_*`). Snapshotted: it stays true whatever
            // the org chart does afterwards.
            'skip_reason' => $this->skip_reason?->value,
            // Live, never snapshotted: why nobody can act on this open step ('left' | 'no_account'), null when somebody can
            'blocked' => $this->blockedReason(),
            'acted_by_name' => $this->acted_by_name,
            'acted_by_name_th' => $this->actorNameTh(),
            'became_current_at' => $this->became_current_at?->toDateTimeString(),
            'acted_at' => $this->acted_at?->toDateTimeString(),
        ];
    }

    /** Thai name of whoever signed this row, from their live employee record; null when not loaded or none. */
    public function actorNameTh(): ?string
    {
        return $this->relationLoaded('actedBy') && $this->actedBy?->relationLoaded('employee') ? $this->actedBy->employee?->name_th : null;
    }
}
