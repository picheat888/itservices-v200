<?php

namespace App\Notifications;

use App\Models\Employee\Employee;
use Illuminate\Notifications\Notification;

/**
 * In-app bell to whoever can edit an access registry: someone has left and still holds
 * access that has to be cleared by hand.
 *
 * One bell per resignation, not one per grant. A leaver holding five things is one piece of
 * news and one trip to the Access Directory, where the triage drawer already lists the
 * individual rows — five bells would bury the rest of the tray to say the same thing.
 */
class AccessOffboardingNotification extends Notification
{
    /**
     * @param  array{grants: int, owned: int, total: int}  $outstanding
     */
    public function __construct(
        private readonly Employee $employee,
        private readonly array $outstanding,
    ) {}

    /** @return list<string> */
    public function via(object $notifiable): array
    {
        return ['database'];
    }

    /** @return array<string, mixed> */
    public function toDatabase(object $notifiable): array
    {
        return [
            'type' => 'access_offboarding',
            'employee_id' => $this->employee->id,
            'employee_name' => $this->employee->name,
            'employee_code' => $this->employee->code,
            // Split as well as totalled: revoking a grant and finding a new owner are
            // different jobs, and the reader wants to know which is waiting.
            'grants' => $this->outstanding['grants'],
            'owned' => $this->outstanding['owned'],
            'total' => $this->outstanding['total'],
        ];
    }
}
