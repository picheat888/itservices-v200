<?php

namespace App\Notifications;

use App\Models\Employee;
use Illuminate\Notifications\Notification;

/**
 * Sent to users with the employees.set_credentials permission (IT) when an
 * employee resigns, prompting offboarding — revoke the login account and
 * reclaim assigned assets. Delivered to the in-app (database) bell.
 */
class EmployeeResignedNotification extends Notification
{
    public function __construct(
        private readonly Employee $employee,
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
            'type'          => 'employee_resigned',
            'subtype'       => 'offboarding',
            'employee_id'   => $this->employee->id,
            'employee_name' => $this->employee->name,
            'employee_code' => $this->employee->code,
        ];
    }
}
