<?php

namespace App\Notifications;

use App\Models\Employee\Employee;
use App\Models\Request\ServiceRequest;
use Illuminate\Notifications\Notification;

/**
 * Bell (database) notification for every service-request transition. The
 * subtype tells the SPA which message to render:
 * submitted | waiting | approved_step | approved_final | rejected | fulfilled |
 * cancelled | blocked_no_account
 *
 * `blocked_no_account` is the odd one out: it goes to the people who can provision
 * a login, not to a participant, and it carries the employee to provision so the
 * bell can open that person rather than the request.
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
            'step_label' => $this->stepLabel,
            'actor_name' => $this->actorName,
            'remark' => $this->remark,
            // Only set on blocked_no_account: who needs the account, so the bell can
            // deep-link to them in the Employee module.
            'employee_id' => $this->blockedApprover?->id,
            'employee_name' => $this->blockedApprover?->name,
        ];
    }
}
