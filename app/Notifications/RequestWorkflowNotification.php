<?php

namespace App\Notifications;

use App\Models\Request\ServiceRequest;
use Illuminate\Notifications\Notification;

/**
 * Bell (database) notification for every service-request transition. The
 * subtype tells the SPA which message to render:
 * submitted | waiting | approved_step | approved_final | rejected | fulfilled | cancelled
 */
class RequestWorkflowNotification extends Notification
{
    public function __construct(
        private readonly ServiceRequest $request,
        private readonly string $subtype,
        private readonly ?string $stepLabel = null,
        private readonly ?string $actorName = null,
        private readonly ?string $remark = null,
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
            'step_label' => $this->stepLabel,
            'actor_name' => $this->actorName,
            'remark' => $this->remark,
        ];
    }
}
