<?php

namespace App\Notifications;

use App\Models\Employee\Employee;
use App\Models\Request\ServiceRequest;
use App\Notifications\Concerns\ConfigurableNotification;
use Illuminate\Notifications\Notification;

/**
 * Bell for every service-request transition; the subtype picks the SPA message: submitted | waiting | ready_to_complete |
 * approved_step | approved_final | rejected | completed | not_delivered | cancelled | cancelled_for_owner | stalled |
 * blocked_no_account (to account provisioners, carries the employee) | blocked_no_approver (to requests.notify_blocked).
 */
class RequestWorkflowNotification extends Notification
{
    use ConfigurableNotification;

    public function __construct(
        private readonly ServiceRequest $request,
        private readonly string $subtype,
        private readonly ?string $stepLabel = null,
        private readonly ?string $actorName = null,
        private readonly ?string $remark = null,
        private readonly ?Employee $blockedApprover = null,
        private readonly ?int $stalledDays = null,
    ) {}

    /**
     * The catalogue key for this subtype — the same key the SPA picks when it renders the
     * bell, so switching one off in Settings silences exactly the message an administrator
     * was looking at.
     *
     * `ready_to_complete` splits in two on purpose: with a case open the work lives in the
     * case and the bell only names it, without one somebody in the queue still has to press
     * Complete. They read differently and are silenced separately.
     */
    protected function notificationKey(): string
    {
        if ($this->subtype === 'ready_to_complete') {
            return $this->request->ticket?->ticket_no ? 'notif_request_ready_case' : 'notif_request_ready_manual';
        }

        return 'notif_request_'.$this->subtype;
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
            'requester_name_th' => $this->request->employee?->name_th,
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
