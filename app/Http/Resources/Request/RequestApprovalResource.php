<?php

namespace App\Http\Resources\Request;

use App\Enums\Request\ApprovalStatus;
use App\Models\Employee\Department;
use App\Models\Employee\Position;
use App\Models\Request\RequestApproval;
use App\Models\User;
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
            // A department step open to a group has no name to show: the reader is told
            // which department is holding it, and at which positions, so "waiting on" says
            // something rather than sitting blank.
            'approver_department' => $this->when(
                $this->isOpenToDepartment(),
                fn () => Department::find($this->approver_department_id)?->name,
            ),
            'approver_positions' => $this->when(
                $this->isOpenToDepartment(),
                fn () => Position::whereIn('id', $this->approver_position_ids ?? [])->pluck('title')->values(),
            ),
            'note' => $this->note,
            // Why the engine skipped this step, as a code the SPA writes out in the
            // reader's language (`req_skip_*`). Snapshotted: it stays true whatever
            // the org chart does afterwards.
            'skip_reason' => $this->skip_reason?->value,
            // Live, never snapshotted: the step is this person's, but they cannot act
            // until an account is provisioned for them. It flips to false the moment
            // one exists, which is why it is not written onto the row at submit time.
            'awaiting_account' => $this->awaitsAnAccount(),
            'acted_by_name' => $this->acted_by_name,
            'became_current_at' => $this->became_current_at?->toDateTimeString(),
            'acted_at' => $this->acted_at?->toDateTimeString(),
        ];
    }

    /**
     * True while this step is still open, belongs to a person, and that person has
     * no login account to act with. Callers eager-load `approvals.approver.user`;
     * without it this falls back to one small query per row.
     */
    private function awaitsAnAccount(): bool
    {
        if ($this->approver_employee_id === null) {
            return false; // the it_staff queue row belongs to a permission, not a person
        }
        if (! in_array($this->status, [ApprovalStatus::Waiting, ApprovalStatus::Current], true)) {
            return false; // already decided or skipped — the account no longer matters
        }

        return $this->relationLoaded('approver')
            ? $this->approver !== null && $this->approver->user === null
            : ! User::where('employee_id', $this->approver_employee_id)->exists();
    }
}
