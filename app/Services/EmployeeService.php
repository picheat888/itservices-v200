<?php

namespace App\Services;

use App\Enums\EmployeeStatus;
use App\Models\AppSetting;
use App\Models\Department;
use App\Models\Employee;
use App\Models\GroupRole;
use App\Models\Position;
use App\Models\Role;
use App\Models\User;
use App\Notifications\EmployeeResignedNotification;
use App\Notifications\NewEmployeeNotification;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
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
     * @param  User|null  $actor  the user performing the action (excluded from notifications)
     */
    public function create(array $data, ?User $actor = null): Employee
    {
        $employee = Employee::create($data)->load(['department', 'position']);

        // Assign to default group so the correct role key can be resolved
        // when the login account is provisioned later.
        $defaultGroupId = (int) AppSetting::get('default_employee_group_id', 0);
        if ($defaultGroupId) {
            $group = GroupRole::find($defaultGroupId);
            $group?->employees()->syncWithoutDetaching([$employee->id]);
        }

        $this->notifyCredentialSetters($employee, $actor);

        return $employee;
    }

    /**
     * Creates a login account for an employee, using a manually chosen
     * username & password. Called by a permitted user from the Employee list.
     * The employee's email (if any) is also set so they can log in with either.
     */
    public function createUserWithCredentials(Employee $employee, string $username, string $password): User
    {
        $user = User::create([
            'name' => $employee->name,
            'email' => $employee->email ?: null,
            'username' => $username,
            'password' => Hash::make($password),
            'password_changed_at' => now(),
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

        return $employee->load(['department', 'position']);
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

    /**
     * Validates and bulk-imports employee rows parsed from a CSV.
     * All-or-nothing: if ANY row fails validation, nothing is imported and the
     * full error list is returned so the user can fix the file and retry.
     * Department/Position are matched by their code. No login accounts and no
     * "credentials needed" notifications are created (bulk import would spam);
     * accounts are provisioned later via the normal set-credentials flow.
     *
     * @param  array<int, array<string, string>>  $rows  each keyed by column name
     * @return array{imported: int, errors: list<array{row: int, message: string}>}
     */
    public function importRows(array $rows): array
    {
        $deptByCode = Department::pluck('id', 'code');
        $posByCode = Position::pluck('id', 'code');
        $existingCodes = Employee::pluck('code')->flip();
        $existingEmails = Employee::whereNotNull('email')->pluck('email')
            ->mapWithKeys(fn ($e) => [strtolower($e) => true]);

        $errors = [];
        $prepared = [];
        $seenCodes = [];
        $seenEmails = [];

        foreach ($rows as $i => $row) {
            $line = $i + 2; // +1 for header, +1 for 1-based line numbers
            $code = trim($row['code'] ?? '');
            $name = trim($row['name'] ?? '');
            $email = trim($row['email'] ?? '');
            $deptCode = trim($row['department'] ?? '');
            $posCode = trim($row['position'] ?? '');
            $joined = trim($row['joined_at'] ?? '');
            $rowErr = [];

            if ($name === '') {
                $rowErr[] = 'name ว่าง';
            }

            if ($code !== '') {
                if (isset($existingCodes[$code])) {
                    $rowErr[] = "code '{$code}' ซ้ำกับที่มีอยู่";
                }
                if (isset($seenCodes[$code])) {
                    $rowErr[] = "code '{$code}' ซ้ำในไฟล์";
                }
                $seenCodes[$code] = true;
            }

            if ($email !== '') {
                $lower = strtolower($email);
                if (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
                    $rowErr[] = "email '{$email}' ไม่ถูกต้อง";
                }
                if (isset($existingEmails[$lower])) {
                    $rowErr[] = "email '{$email}' ซ้ำกับที่มีอยู่";
                }
                if (isset($seenEmails[$lower])) {
                    $rowErr[] = "email '{$email}' ซ้ำในไฟล์";
                }
                $seenEmails[$lower] = true;
            }

            $deptId = null;
            if ($deptCode !== '') {
                $deptId = $deptByCode[$deptCode] ?? null;
                if (! $deptId) {
                    $rowErr[] = "department code '{$deptCode}' ไม่พบ";
                }
            }

            $posId = null;
            if ($posCode !== '') {
                $posId = $posByCode[$posCode] ?? null;
                if (! $posId) {
                    $rowErr[] = "position code '{$posCode}' ไม่พบ";
                }
            }

            if ($joined !== '') {
                $d = \DateTime::createFromFormat('Y-m-d', $joined);
                if (! $d || $d->format('Y-m-d') !== $joined) {
                    $rowErr[] = "joined_at '{$joined}' ต้องเป็นรูปแบบ YYYY-MM-DD";
                }
            }

            if ($rowErr) {
                $errors[] = ['row' => $line, 'message' => implode(', ', $rowErr)];

                continue;
            }

            $prepared[] = [
                'code' => $code !== '' ? $code : null,
                'name' => $name,
                'name_th' => trim($row['name_th'] ?? '') ?: null,
                'email' => $email !== '' ? $email : null,
                'phone' => trim($row['phone'] ?? '') ?: null,
                'department_id' => $deptId,
                'position_id' => $posId,
                'joined_at' => $joined !== '' ? $joined : null,
                'status' => EmployeeStatus::Active,
            ];
        }

        if (! empty($errors)) {
            return ['imported' => 0, 'errors' => $errors];
        }

        $defaultGroupId = (int) AppSetting::get('default_employee_group_id', 0);
        $group = $defaultGroupId ? GroupRole::find($defaultGroupId) : null;

        DB::transaction(function () use ($prepared, $group) {
            foreach ($prepared as $data) {
                $employee = Employee::create($data); // code auto-generated when null
                $group?->employees()->syncWithoutDetaching([$employee->id]);
            }
        });

        return ['imported' => count($prepared), 'errors' => []];
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
     * Resolves the recipients for employee events: users holding the given
     * permission, excluding the acting user (no point notifying yourself).
     *
     * @return Collection<int, User>
     */
    private function recipientsWithPermission(string $permission, ?User $actor): Collection
    {
        return User::all()->filter(
            fn (User $u) => $u->hasPermission($permission) && $u->id !== $actor?->id
        );
    }

    /** Notifies every user allowed to set credentials (except the actor) that an account is needed. */
    private function notifyCredentialSetters(Employee $employee, ?User $actor = null): void
    {
        $recipients = $this->recipientsWithPermission('employees.set_credentials', $actor);

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
