<?php

namespace App\Services\Employee;

use App\Enums\Employee\EmployeeStatus;
use App\Models\Employee\Employee;
use App\Models\Permission\GroupRole;
use App\Models\Permission\Role;
use App\Models\Settings\AppSetting;
use App\Models\User;
use App\Notifications\EmployeeResignedNotification;
use App\Notifications\NewEmployeeNotification;
use App\Services\Email\EmailNotificationService;
use Illuminate\Support\Collection;
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
     * The credentials-needed bell goes to every holder of the permission — including
     * whoever just added this person, since provisioning the account is their next task.
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
     * Login is by username; the employee's email is mirrored onto the account
     * only as a contact field (it is not a login identifier).
     */
    public function createUserWithCredentials(Employee $employee, string $username, string $password, bool $mustChangePassword = false): User
    {
        $user = User::create([
            'name' => $employee->name,
            'email' => $employee->email ?: null,
            'username' => $username,
            'password' => Hash::make($password),
            // null marks the password as "never set by the user" so the forced-change flow fires.
            'password_changed_at' => $mustChangePassword ? null : now(),
            'must_change_password' => $mustChangePassword,
            'role_id' => $this->resolveGroupRole($employee),
            'employee_id' => $employee->id,
        ]);

        // Mirror the username onto the employee for display/search.
        $employee->update(['username' => $username]);

        return $user;
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function update(Employee $employee, array $data): Employee
    {
        $employee->update($data);

        $this->syncAccountEmail($employee);

        return $employee->load(['department', 'position']);
    }

    /**
     * Mirrors the employee's (possibly edited) email onto their linked login
     * account, so notifications and email-login keep working after HR updates
     * the address. Skipped when another account already owns the new email
     * (users.email is unique).
     */
    private function syncAccountEmail(Employee $employee): void
    {
        $user = User::where('employee_id', $employee->id)->first();
        if ($user === null || ! $employee->email || $user->email === $employee->email) {
            return;
        }

        $taken = User::where('email', $employee->email)->where('id', '!=', $user->id)->exists();
        if ($taken) {
            return;
        }

        $user->update(['email' => $employee->email]);
    }

    public function resign(Employee $employee, ?string $reason, ?string $lastDay, ?User $actor = null): Employee
    {
        $employee->update([
            'status' => EmployeeStatus::Resigned,
            'resign_reason' => $reason,
            'last_day' => $lastDay,
        ]);

        // NOTE: returning the employee's assigned assets is handled by the
        // Assets module (not yet built) — it will flag them as "Returning".

        $this->notifyResignation($employee, $actor);

        return $employee->load(['department', 'position']);
    }

    /**
     * Cancels a resignation by reverting the employee's status back to Active
     * and clearing resign_reason and last_day fields.
     */
    public function cancelResign(Employee $employee): Employee
    {
        $employee->update([
            'status' => EmployeeStatus::Active,
            'resign_reason' => null,
            'last_day' => null,
        ]);

        return $employee->load(['department', 'position']);
    }

    /** Returns the role_id from the employee's first GroupRole, or the base 'user' role id. */
    private function resolveGroupRole(Employee $employee): int
    {
        $group = $employee->groupRoles()->first();

        return $group?->role_id ?? Role::firstOrCreate(
            ['key' => 'user'],
            ['name' => 'Staff', 'color' => '#64748b', 'is_system' => false],
        )->id;
    }

    /**
     * Resolves the recipients for employee events: users holding the given permission.
     * Pass $exclude to leave somebody out — used for announcements, where telling the
     * person who just acted what they just did is noise.
     *
     * @return Collection<int, User>
     */
    private function recipientsWithPermission(string $permission, ?User $exclude): Collection
    {
        return User::all()->filter(
            fn (User $u) => $u->hasPermission($permission) && $u->id !== $exclude?->id
        );
    }

    /** Notifies every user allowed to set credentials that this person still needs one. */
    private function notifyCredentialSetters(Employee $employee): void
    {
        // The acting user is NOT excluded here, unlike the resignation notice: this bell
        // is a to-do ("this person still needs a login"), and adding an employee is a
        // separate act from provisioning their account — usually by the same person, who
        // is often the only holder of the permission. Excluding them sent it to nobody.
        $recipients = $this->recipientsWithPermission('employees.set_credentials', null);

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
                'employee.name' => $employee->name,
                'employee.code' => $employee->code,
            ]);
        }
    }

    /** Notifies IT (employees.set_credentials, except the actor) to offboard a resigned employee. */
    private function notifyResignation(Employee $employee, ?User $actor = null): void
    {
        $recipients = $this->recipientsWithPermission('employees.set_credentials', $actor);

        if ($recipients->isEmpty()) {
            return;
        }

        // In-app (database) bell only — no email template for offboarding yet.
        Notification::send($recipients, new EmployeeResignedNotification($employee));
    }
}
