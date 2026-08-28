<?php

namespace App\Notifications;

use App\Models\Employee\Employee;
use Illuminate\Notifications\Notification;

/**
 * In-app bell to whoever can receive assets back into the pool: someone has left and their
 * devices have all been flagged for return.
 *
 * One bell per resignation, not one per device — the same rule AccessOffboardingNotification
 * follows. A leaver holding five machines is one piece of news and one trip to the Assets
 * page, where the pending-return list already names each one; five bells would bury the rest
 * of the tray to say it five times.
 *
 * The self-service return (a holder sending one thing back) keeps its own per-asset bell:
 * there it really is one device, and the bell names it.
 */
class AssetOffboardingNotification extends Notification
{
    public function __construct(
        private readonly Employee $employee,
        private readonly int $count,
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
            'type' => 'asset_offboarding',
            'employee_id' => $this->employee->id,
            'employee_name' => $this->employee->name,
            'employee_code' => $this->employee->code,
            'count' => $this->count,
        ];
    }
}
