<?php

namespace App\Notifications;

use App\Models\Employee\Employee;
use App\Notifications\Concerns\ConfigurableNotification;
use Illuminate\Notifications\Notification;

/**
 * Sent when an employee resigns. Delivered to the in-app (database) bell.
 *
 * Two audiences read the same event differently, so the subtype says which one this copy is
 * for. 'offboarding' is a task for whoever can close the account (employees.set_credentials);
 * 'departure' is news for everyone else who works with the directory — they cannot act on it,
 * but it changes who they route work to and who they expect to find on a list.
 */
class EmployeeResignedNotification extends Notification
{
    use ConfigurableNotification;

    public function __construct(
        private readonly Employee $employee,
        /** 'offboarding' (a task) or 'departure' (news). */
        private readonly string $subtype = 'offboarding',
    ) {}

    protected function notificationKey(): string
    {
        return $this->subtype === 'departure' ? 'notif_departure' : 'notif_resigned';
    }

    /** @return array<string, mixed> */
    public function toDatabase(object $notifiable): array
    {
        return [
            'type' => 'employee_resigned',
            'subtype' => $this->subtype,
            'employee_id' => $this->employee->id,
            'employee_name' => $this->employee->name,
            'employee_code' => $this->employee->code,
        ];
    }
}
