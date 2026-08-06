<?php

namespace App\Http\Resources\Request;

use App\Enums\Request\ApprovalStatus;
use App\Enums\Request\RequestStatus;
use App\Enums\Request\WorkflowStepKind;
use App\Models\Request\RequestApproval;
use App\Models\Request\ServiceRequest;
use App\Support\RequestSchemas;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A service request with its frozen approval chain and viewer-relative action
 * flags (can_approve / can_reject follow the resolved current approver, not a
 * permission).
 *
 * @mixin ServiceRequest
 */
class ServiceRequestResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $viewer = $request->user();
        $approvals = $this->whenLoaded('approvals');
        $loaded = $this->relationLoaded('approvals') ? $this->approvals : collect();

        $current = $loaded->first(fn (RequestApproval $a) => $a->status === ApprovalStatus::Current);
        $approvalRows = $loaded->filter(fn (RequestApproval $a) => $a->kind === WorkflowStepKind::Approval);
        $doneApprovals = $approvalRows->filter(fn (RequestApproval $a) => in_array($a->status, [ApprovalStatus::Approved, ApprovalStatus::Skipped], true));

        $canApprove = $viewer !== null
            && $this->status === RequestStatus::Pending
            && $current !== null
            && $current->kind === WorkflowStepKind::Approval
            && $viewer->employee_id !== null
            && (int) $viewer->employee_id === (int) $current->approver_employee_id;

        return [
            'id' => $this->id,
            'reference' => $this->reference,
            'type' => $this->type?->value,
            'title' => $this->title,
            'reason' => $this->reason,
            'priority' => $this->priority?->value,
            'estimated_value' => $this->estimated_value,
            // One map keyed by schema field, whether the value sits in the json or
            // in one of the foreign-keyed reference columns.
            'fields' => collect($this->fields ?? [])->except('_display')->merge($this->referenceFields()),
            // Point-in-time labels + resolved values, snapshotted at submit.
            'fields_display' => ($this->fields ?? [])['_display'] ?? [],
            'status' => $this->status?->value,
            'auto_ticket' => $this->auto_ticket,
            'requester' => [
                'employee_id' => $this->employee_id,
                'user_id' => $this->user_id,
                'name' => $this->requester_name,
                'department' => $this->department_name,
            ],
            // Why this request exists — 'onboarding' is what makes the list and the
            // detail mark it as a new hire rather than a colleague's own request.
            'origin' => $this->origin?->value,
            // Who filed it. Only interesting when that is somebody other than the
            // owner, so it is null for an ordinary submission.
            'submitted_by' => $this->origin?->isOnBehalf() && $this->submitted_by_user_id !== null
                ? ['user_id' => $this->submitted_by_user_id, 'name' => $this->submitted_by_name]
                : null,
            'workflow' => [
                'id' => $this->workflow_id,
                'name' => $this->whenLoaded('workflow', fn () => $this->workflow?->name),
            ],
            'ticket' => $this->whenLoaded('ticket', fn () => $this->ticket === null ? null : [
                'id' => $this->ticket->id,
                'ticket_no' => $this->ticket->ticket_no,
                'status' => $this->ticket->status?->value,
            ]),
            'approvals' => RequestApprovalResource::collection($approvals),
            // Compact chain summary for table rows (WorkflowMini).
            'progress' => [
                'total' => $approvalRows->count(),
                'done' => $doneApprovals->count(),
                'current_label' => $current?->label,
                'current_overdue' => $current !== null && $current->due_at !== null && $current->due_at->isPast(),
            ],
            'can_approve' => $canApprove,
            // The owner may withdraw their own; the filer may withdraw one they sent
            // for somebody who cannot (a new employee without a login).
            'can_cancel' => $viewer !== null && $this->status === RequestStatus::Pending
                && ($this->user_id === $viewer->id || $this->submitted_by_user_id === $viewer->id),
            'can_fulfill' => $viewer !== null && $this->status === RequestStatus::Approved && (bool) $viewer->hasPermission('requests.fulfill'),
            'approved_at' => $this->approved_at?->toDateTimeString(),
            'rejected_at' => $this->rejected_at?->toDateTimeString(),
            'fulfilled_at' => $this->fulfilled_at?->toDateTimeString(),
            'cancelled_at' => $this->cancelled_at?->toDateTimeString(),
            'created_at' => $this->created_at?->toDateTimeString(),
        ];
    }

    /**
     * The reference columns put back under the schema keys the SPA knows, so the
     * form and the detail view read one shape regardless of where a value lives.
     *
     * @return array<string, int>
     */
    private function referenceFields(): array
    {
        if ($this->type === null) {
            return [];
        }

        $fields = [];
        foreach (RequestSchemas::referenceColumns($this->type) as $key => $column) {
            if ($this->{$column} !== null) {
                $fields[$key] = (int) $this->{$column};
            }
        }

        return $fields;
    }
}
