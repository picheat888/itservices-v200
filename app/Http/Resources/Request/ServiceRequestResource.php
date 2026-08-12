<?php

namespace App\Http\Resources\Request;

use App\Enums\Request\ApprovalStatus;
use App\Enums\Request\RequestStatus;
use App\Enums\Request\WorkflowStepKind;
use App\Enums\Ticket\TicketStatus;
use App\Models\Request\RequestApproval;
use App\Models\Request\ServiceRequest;
use App\Support\RequestSchemas;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Collection;

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
            // One map keyed by schema field, whether the value sits in the json or
            // in one of the foreign-keyed reference columns.
            'fields' => collect($this->fields ?? [])->except('_display')->merge($this->referenceFields()),
            // Point-in-time labels + resolved values, snapshotted at submit.
            'fields_display' => ($this->fields ?? [])['_display'] ?? [],
            'status' => $this->status?->value,
            'auto_ticket' => $this->auto_ticket,
            // Name and department are the snapshot the request was filed with; code,
            // position and photo come off the live employee record (loaded only for
            // the detail view, which is the one that draws the requester card).
            'requester' => [
                'employee_id' => $this->employee_id,
                'user_id' => $this->user_id,
                'name' => $this->requester_name,
                'department' => $this->department_name,
                'code' => $this->whenLoaded('employee', fn () => $this->employee?->code),
                'position' => $this->whenLoaded('employee', fn () => $this->employee?->position?->title),
                'photo_url' => $this->whenLoaded('employee', fn () => $this->employee?->photo_url),
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
                // Who has the case. The IT queue step is where a request actually sits
                // for most of its life, and "waiting" says nothing about whether anybody
                // has picked it up yet.
                'assignee' => $this->ticket->assignee?->name,
            ]),
            'approvals' => RequestApprovalResource::collection($approvals),
            // Compact chain summary for table rows (WorkflowMini).
            'progress' => [
                'total' => $approvalRows->count(),
                'done' => $doneApprovals->count(),
                'current_label' => $current?->label,
            ],
            'can_approve' => $canApprove,
            // The owner may withdraw their own; the filer may withdraw one they sent
            // for somebody who cannot (a new employee without a login).
            'can_cancel' => $viewer !== null && $this->status === RequestStatus::Pending
                && ($this->user_id === $viewer->id || $this->submitted_by_user_id === $viewer->id),
            // Held back while a linked case is still in flight: closing that case is what
            // fulfils the request, so the button would only ever return the 422 that
            // RequestService::fulfill answers with.
            'can_fulfill' => $viewer !== null && $this->status === RequestStatus::Approved
                && (bool) $viewer->hasPermission('requests.fulfill')
                && ! $this->hasCaseInFlight(),
            // The last movement, spelled out: the feed on the dashboard orders by `at` and
            // writes the rest of it as a sentence. Derived here rather than in the SPA so one
            // rule decides what counts as a movement.
            'activity' => $this->lastActivity($approvalRows),
            'approved_at' => $this->approved_at?->toDateTimeString(),
            'rejected_at' => $this->rejected_at?->toDateTimeString(),
            'fulfilled_at' => $this->fulfilled_at?->toDateTimeString(),
            'cancelled_at' => $this->cancelled_at?->toDateTimeString(),
            'created_at' => $this->created_at?->toDateTimeString(),
        ];
    }

    /**
     * What happened to this request most recently — the kind of movement, who made it, and
     * when. `kind` travels as a code so the SPA writes the sentence in the reader's
     * language; `by` is the name frozen on the row that moved, never re-resolved.
     *
     * @param  Collection<int, RequestApproval>  $approvalRows
     * @return array{at: string|null, kind: string, by: string|null}
     */
    private function lastActivity($approvalRows): array
    {
        $at = $this->last_activity_at?->toDateTimeString();
        $signed = $approvalRows
            ->filter(fn (RequestApproval $a) => $a->acted_at !== null)
            ->sortBy('acted_at')
            ->last();
        $queueRow = $this->relationLoaded('approvals')
            ? $this->approvals->first(fn (RequestApproval $a) => $a->kind === WorkflowStepKind::Fulfillment)
            : null;

        return match ($this->status) {
            RequestStatus::Rejected => ['at' => $at, 'kind' => 'rejected', 'by' => $signed?->acted_by_name],
            // Cancelled by the requester withdrawing it, or by IT closing the case without
            // delivering — the fulfilment row names the second one.
            RequestStatus::Cancelled => ['at' => $at, 'kind' => 'cancelled', 'by' => $queueRow?->acted_by_name],
            RequestStatus::Fulfilled => ['at' => $at, 'kind' => 'fulfilled', 'by' => $queueRow?->acted_by_name],
            RequestStatus::Approved => ['at' => $at, 'kind' => 'approved', 'by' => $signed?->acted_by_name],
            // Still in the chain: either somebody has signed a rung, or nothing has happened
            // since it was filed.
            default => $signed !== null
                ? ['at' => $at, 'kind' => 'approved_step', 'by' => $signed->acted_by_name]
                : ['at' => $at, 'kind' => 'submitted', 'by' => $this->submitted_by_name],
        };
    }

    /**
     * A linked case still open or in progress owns the delivery — see
     * RequestService::fulfill for why the manual button stands down for it.
     *
     * Read only from a loaded relation, because a resource must not query. An absent
     * relation counts as in flight: hiding the button costs a detour through the case,
     * while showing it costs a press that comes back 422.
     */
    private function hasCaseInFlight(): bool
    {
        if ($this->ticket_id === null) {
            return false;
        }

        if (! $this->relationLoaded('ticket')) {
            return true;
        }

        return in_array($this->ticket?->status, [TicketStatus::Open, TicketStatus::InProgress], true);
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
