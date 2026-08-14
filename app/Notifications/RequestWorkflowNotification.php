<?php

namespace App\Notifications;

use App\Models\Employee\Employee;
use App\Models\Request\ServiceRequest;
use Illuminate\Notifications\Notification;

/**
 * Bell (database) notification for every service-request transition. The
 * subtype tells the SPA which message to render:
 * submitted | waiting | ready_to_fulfill | approved_step | approved_final |
 * rejected | fulfilled | cancelled | blocked_no_account
 *
 * `waiting` is only ever an approval rung — a person who has to decide. The IT
 * queue gets `ready_to_fulfill` instead: nobody there decides anything, they
 * deliver, and when the workflow opened its own case they do that in the case.
 *
 * `blocked_no_account` is the odd one out: it goes to the people who can provision
 * a login, not to a participant, and it carries the employee to provision so the
 * bell can open that person rather than the request.
 *
 * `stalled` is `waiting` said again days later, and carries `stalled_days` so the bell
 * can say how long rather than just repeating itself.
 */
class RequestWorkflowNotification extends Notification
{
    public function __construct(
        private readonly ServiceRequest $request,
        private readonly string $subtype,
        private readonly ?string $stepLabel = null,
        private readonly ?string $actorName = null,
        private readonly ?string $remark = null,
        private readonly ?Employee $blockedApprover = null,
        private readonly ?int $stalledDays = null,
    ) {}

    public function via(object $notifiable): array
    {
        return ['database'];
    }

    /**
     * @return array<string, mixed>
     */
    public function toDatabase(object $notifiable): array
    {
        return [
            'type' => 'request',
            'subtype' => $this->subtype,
            'service_request_id' => $this->request->id,
            'reference' => $this->request->reference,
            'title' => $this->request->title,
            'request_type' => $this->request->type?->value,
            // Lets the bell mark an onboarding request the same way the list does.
            'origin' => $this->request->origin?->value,
            // Who the request is FOR. The bell writes its own headline from the type in the
            // reader's language (`title` above is the server's canonical English one), and an
            // on-behalf request has to name the new hire the way the list does.
            'requester_name' => $this->request->requester_name,
            'step_label' => $this->stepLabel,
            'actor_name' => $this->actorName,
            'remark' => $this->remark,
            // The case this request opened, when it opened one. Read by the queue bell,
            // which names it rather than asking for a decision, and by the requester's
            // bells so "IT is on it" points at something real.
            'ticket_id' => $this->request->ticket_id,
            'ticket_no' => $this->request->ticket?->ticket_no,
            // Only set on blocked_no_account: who needs the account, so the bell can
            // deep-link to them in the Employee module.
            'employee_id' => $this->blockedApprover?->id,
            'employee_name' => $this->blockedApprover?->name,
            // Only set on `stalled`: how long the step has been waiting.
            'stalled_days' => $this->stalledDays,
        ];
    }
}
