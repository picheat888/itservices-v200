<?php

namespace App\Services;

use App\Enums\EmployeeStatus;
use App\Models\AppSetting;
use App\Models\Employee;
use App\Models\GroupRole;
use App\Models\User;
use App\Notifications\NewEmployeeNotification;
use App\Services\EmailNotificationService;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;

class EmployeeService
{
    /**
     * Creates a new employee and assigns them to the default Role Group.
     * No login account is created automatically — a user with the
     * employees.set_credentials permission must set a username & password
     * later. We notify those users so they can provision the account.
     *
     * @param  array<string, mixed>  $data
     */
    public function create(array $data): Employee
    {
        $employee = Employee::create($data)->load(['department', 'position']);

        // Assign to default group so the correct role key can be resolved
        // when the login account is provisioned later.
        $defaultGroupId = (int) AppSetting::get('default_employee_group_id', 0);
        if ($defaultGroupId) {
            $group = GroupRole::find($defaultGroupId);
            $group?->employees()->syncWithoutDetaching([$employee->id]);
        }

        $this->notifyCredentialSetters($employee);

        return $employee;
    }

    /**
     * Creates a login account for an employee, using a manually chosen
     * username & password. Called by a permitted user from the Employee list.
     * The employee's email (if any) is also set so they can log in with either.
     */
    public function createUserWithCredentials(Employee $employee, string $username, string $password): User
    {
        $roleKey = $this->resolveGroupRole($employee);

        $user = User::create([
            'name'     => $employee->name,
            'email'    => $employee->email ?: null,
            'username' => $username,
            'password' => Hash::make($password),
            'role'     => $roleKey,
        ]);

        // Mirror the username onto the employee so has_account resolves correctly
        // and the account stays linked for future reset-password lookups.
        $employee->update([
            'username'     => $username,
            'login_method' => 'userpass',
        ]);

        return $user;
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function update(Employee $employee, array $data): Employee
    {
        $employee->update($data);

        return $employee->load(['department', 'position']);
    }

    public function resign(Employee $employee, ?string $reason, ?string $lastDay): Employee
    {
        $employee->update([
            'status'        => EmployeeStatus::Resigned,
            'resign_reason' => $reason,
            'last_day'      => $lastDay,
        ]);

        // NOTE: returning the employee's assigned assets is handled by the
        // Assets module (not yet built) — it will flag them as "Returning".

        return $employee->load(['department', 'position']);
    }

    /** Returns the role key from the employee's first GroupRole, or 'user'. */
    private function resolveGroupRole(Employee $employee): string
    {
        $group = $employee->groupRoles()->first();

        return $group?->role ?? 'user';
    }

    /** Notifies every user allowed to set credentials that an account is needed. */
    private function notifyCredentialSetters(Employee $employee): void
    {
        $recipients = User::all()->filter(
            fn (User $u) => $u->hasPermission('employees.set_credentials')
        );

        if ($recipients->isEmpty()) {
            return;
        }

        // In-app (database) bell — synchronous, shows immediately.
        Notification::send($recipients, new NewEmployeeNotification($employee));

        // Email — queued, via the employee.account_needed template (if enabled).
        $emailService = app(EmailNotificationService::class);
        foreach ($recipients as $recipient) {
            if (! $recipient->email) {
                continue;
            }
            $emailService->sendTemplate('employee.account_needed', $recipient->email, [
                'user.first_name' => explode(' ', (string) $recipient->name)[0] ?? 'there',
                'employee.name'   => $employee->name,
                'employee.code'   => $employee->code,
            ]);
        }
    }
}
