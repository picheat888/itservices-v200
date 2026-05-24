<?php

namespace App\Notifications;

use App\Models\Employee;
use Illuminate\Notifications\Notification;

/**
 * Sent to all users with employees.set_credentials permission when a new
 * employee is created. The employee has NO login account yet — a permitted
 * user must set a username & password manually.
 *
 * Delivered synchronously via the in-app (database) bell so it appears
 * immediately. Email delivery will be added with the Email module (queued).
 */
class NewEmployeeNotification extends Notification
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
            'type'          => 'new_employee',
            'subtype'       => 'credentials_required',
            'employee_id'   => $this->employee->id,
            'employee_name' => $this->employee->name,
            'employee_code' => $this->employee->code,
        ];
    }
}
