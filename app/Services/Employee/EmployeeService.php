<?php

namespace App\Services\Employee;

use App\Enums\Employee\EmployeeStatus;
use App\Models\Access\AccessMembership;
use App\Models\Access\EmailGroup;
use App\Models\Access\FileShare;
use App\Models\Asset\Asset;
use App\Models\Asset\AssetTransfer;
use App\Models\AuditLog;
use App\Models\Employee\Employee;
use App\Models\Permission\GroupRole;
use App\Models\Permission\Role;
use App\Models\Request\RequestApproval;
use App\Models\Request\ServiceRequest;
use App\Models\Ticket\Ticket;
use App\Models\User;
use App\Notifications\AccessOffboardingNotification;
use App\Notifications\EmployeeResignedNotification;
use App\Notifications\NewEmployeeNotification;
use App\Services\Access\AccessService;
use App\Services\Asset\AssetService;
use App\Services\Email\EmailNotificationService;
use App\Services\Request\RequestNotificationService;
use App\Support\DateDisplay;
use App\Support\SearchTerms;
use App\Support\SuperAdmins;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class EmployeeService
{
    /** Refusal code when no role can be resolved for a login account; the SPA words it. */
    public const NO_ROLE_CONFIGURED = 'no_role_configured';

    /** AssetService recalls a leaver's devices in resign(). */
    public function __construct(private readonly AssetService $assets) {}

    /**
     * Directory order: resigned last, no-account first, then the latest start date.
     *
     * @param  Builder<Employee>  $query
     * @return Builder<Employee>
     */
    public function inDirectoryOrder(Builder $query): Builder
    {
        return $query
            ->orderByRaw('status = ?', [EmployeeStatus::Resigned->value])
            ->orderByRaw('EXISTS(SELECT 1 FROM users WHERE users.employee_id = employees.id)')
            ->orderByDesc('joined_at')
            ->orderByDesc('id');
    }

    /**
     * Slim picker rows in directory order: exactly `ids`, or a search with status, exclude and limit.
     *
     * @param  array{search?: ?string, limit?: int, ids?: array<int, int>, exclude?: array<int, int>, status?: ?string, match?: ?string}  $params
     * @return Collection<int, Employee>
     */
    public function pickerList(array $params = []): Collection
    {
        $query = Employee::query()
            ->select(['id', 'code', 'first_name', 'last_name', 'first_name_th', 'last_name_th', 'photo_path', 'department_id', 'position_id', 'status'])
            ->with(['department:id,name,name_th', 'position:id,title']);

        if (isset($params['ids'])) {
            return $this->inDirectoryOrder($query->whereIn('id', $params['ids']))->get();
        }

        $match = $params['match'] ?? null;
        SearchTerms::apply($query, $params['search'] ?? null, [
            ...SearchTerms::personName(), 'code',
            ...match ($match) {
                'position' => [SearchTerms::related('position', ['title'])],
                'none' => [],
                default => [SearchTerms::related('department', ['name', 'name_th'])],
            },
        ]);

        if (! empty($params['exclude'])) {
            $query->whereNotIn('id', $params['exclude']);
        }
        if (! empty($params['status'])) {
            $query->where('status', $params['status']);
        }

        return $this->inDirectoryOrder($query)->limit(min(100, max(1, $params['limit'] ?? 20)))->get();
    }

    /**
     * Creates an employee in the default Role Group and bells everyone who can set their login.
     *
     * @param  array<string, mixed>  $data
     */
    public function create(array $data): Employee
    {
        $employee = Employee::create($data)->load(['department', 'position']);

        // The group decides the role of the login made later
        $this->defaultGroupForNewEmployee()?->employees()->syncWithoutDetaching([$employee->id]);

        $this->notifyCredentialSetters($employee);

        return $employee;
    }

    /** Creates the employee's login; the email is copied as a contact field, not a login name. */
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

        // Approvals that reached them before they had an inbox
        app(RequestNotificationService::class)->deliverPendingApprovals($employee);

        return $user;
    }

    /** Renames and/or resets the login in one transaction; returns the new password when reset. */
    public function updateLogin(Employee $employee, ?string $username, bool $resetting, ?string $password, bool $mustChangePassword): ?string
    {
        return DB::transaction(function () use ($employee, $username, $resetting, $password, $mustChangePassword) {
            if ($username !== null) {
                $this->changeUsername($employee, $username);
            }

            return $resetting ? $this->resetPassword($employee, $password, $mustChangePassword) : null;
        });
    }

    /** Renames the employee's login and mirrors it onto the employee for display and search. */
    public function changeUsername(Employee $employee, string $username): void
    {
        $employee->user->update(['username' => $username]);
        $employee->update(['username' => $username]);
    }

    /** Sets a new password (generated when none is given), signs the login out everywhere, returns it. */
    public function resetPassword(Employee $employee, ?string $password, bool $mustChangePassword): string
    {
        $password = filled($password) ? $password : $this->generatePassword();
        $user = $employee->user;
        $user->forceFill([
            'password' => Hash::make($password),
            // null marks the password as "never set by the user" while forcing a change
            'password_changed_at' => $mustChangePassword ? null : now(),
            'must_change_password' => $mustChangePassword,
        ])->save();
        $user->signOutEverywhere();

        return $password;
    }

    /** A temporary password that meets the policy, without 0/O and 1/l/I. */
    private function generatePassword(int $length = 14): string
    {
        $pools = ['abcdefghijkmnopqrstuvwxyz', 'ABCDEFGHJKLMNPQRSTUVWXYZ', '23456789', '!@#$%&*?'];
        $combined = implode('', $pools);

        $chars = array_map(fn (string $pool) => $pool[random_int(0, strlen($pool) - 1)], $pools);
        while (count($chars) < $length) {
            $chars[] = $combined[random_int(0, strlen($combined) - 1)];
        }
        shuffle($chars);

        return implode('', $chars);
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function update(Employee $employee, array $data): Employee
    {
        DB::transaction(function () use ($employee, $data) {
            $oldCode = $employee->code;
            $employee->update($data);
            $this->carryTransferHistory($oldCode, $employee->code);
        });

        $this->syncAccountEmail($employee);

        return $employee->load(['department', 'position']);
    }

    /** The asset transfer trail names employees by code, so a changed code moves it along. */
    private function carryTransferHistory(?string $oldCode, ?string $newCode): void
    {
        if (blank($oldCode) || blank($newCode) || $oldCode === $newCode) {
            return;
        }

        // toBase(): the trail rows keep their own timestamps
        AssetTransfer::where('from_owner', $oldCode)->toBase()->update(['from_owner' => $newCode]);
        AssetTransfer::where('to_owner', $oldCode)->toBase()->update(['to_owner' => $newCode]);
    }

    /** Copies an edited email onto the linked login, unless another account already has it. */
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

    public function resign(Employee $employee, ?string $reason, ?string $lastDay): Employee
    {
        $employee->update([
            'status' => EmployeeStatus::Resigned,
            'resign_reason' => $reason,
            'last_day' => $lastDay,
        ]);

        // Their devices turn Pending return; no assets permission needed
        $this->assets->requestReturnForEmployee($employee, "Resignation — {$employee->code}");

        // Access is cleared by IT by hand; this only tells them
        $this->notifyAccessOffboarding($employee);

        $this->notifyResignation($employee);

        return $employee->load(['department', 'position']);
    }

    /**
     * Why a record cannot be deleted, as keys the UI words; empty means a clean mis-entry.
     *
     * @return list<string>
     */
    public function deletionBlockers(Employee $employee): array
    {
        $blockers = [];

        if ($employee->status === EmployeeStatus::Resigned) {
            $blockers[] = 'resigned';
        }
        if (Ticket::where('requester_id', $employee->id)->exists()) {
            $blockers[] = 'tickets';
        }
        if (Asset::where('owner_employee_id', $employee->id)->exists()) {
            $blockers[] = 'assets';
        }
        // The custody trail stores codes, not a foreign key
        if (AssetTransfer::where('from_owner', $employee->code)->orWhere('to_owner', $employee->code)->exists()) {
            $blockers[] = 'asset_history';
        }
        if (AccessMembership::where('employee_id', $employee->id)->exists()) {
            $blockers[] = 'access';
        }
        if (EmailGroup::where('owner_employee_id', $employee->id)->exists() || FileShare::where('owner_employee_id', $employee->id)->exists()) {
            $blockers[] = 'access_owner';
        }
        // Role-group membership is not a blocker: create() adds everyone to the default group
        if (ServiceRequest::where('employee_id', $employee->id)->exists()) {
            $blockers[] = 'requests';
        }
        // Holding a step or being one of those it is open to
        if (RequestApproval::where('approver_employee_id', $employee->id)->exists()
            || RequestApproval::whereJsonContains('approver_employee_ids', (int) $employee->id)->exists()) {
            $blockers[] = 'approvals';
        }
        // Named on a workflow step as approver or deputy
        if (DB::table('workflow_step_approvers')->where('employee_id', $employee->id)->exists()) {
            $blockers[] = 'workflow_approver';
        }
        if ($employee->subordinates()->exists()) {
            $blockers[] = 'subordinates';
        }
        if ($this->accountHasBeenUsed($employee->user)) {
            $blockers[] = 'account_used';
        }

        return $blockers;
    }

    /** Whether the login has ever acted; a fresh one goes with the mis-entry. */
    private function accountHasBeenUsed(?User $user): bool
    {
        if (! $user) {
            return false;
        }

        return AuditLog::where('user_id', $user->id)->exists()
            || Ticket::where('assignee_id', $user->id)->exists()
            || ServiceRequest::where('user_id', $user->id)->exists()
            || RequestApproval::where('acted_by_user_id', $user->id)->exists()
            || AccessMembership::where('granted_by', $user->id)->exists()
            || DB::table('notifications')->where('notifiable_type', User::class)->where('notifiable_id', $user->id)->exists();
    }

    /** Removes a mis-entered employee and their login; call only after deletionBlockers() is empty. */
    public function delete(Employee $employee): void
    {
        $employee->user?->delete();
        $employee->delete();
    }

    /**
     * Deletes a mis-entry with its login and audits it, unless something refers to them.
     *
     * @return list<string>|null the blockers when refused, null when deleted
     */
    public function deleteUnlessUsed(Employee $employee): ?array
    {
        $blockers = $this->deletionBlockers($employee);
        if ($blockers) {
            return $blockers;
        }

        // Read before the row is gone
        $label = "{$employee->name} ({$employee->code})";
        $deletedAccount = $employee->user?->username;

        SuperAdmins::keepAtLeastOne(function () use ($employee, $label, $deletedAccount) {
            $this->delete($employee);
            AuditLog::recordDeleted('Deleted employee', $label, $employee, $deletedAccount ? ['facts' => ['login_account' => $deletedAccount]] : null);
        });

        return null;
    }

    /**
     * Swaps the form's photo field for a stored photo_path, deleting the previous file.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public function withStoredPhoto(array $data, ?UploadedFile $photo, ?string $oldPath = null): array
    {
        unset($data['photo']);
        if ($photo) {
            if ($oldPath) {
                Storage::disk('local')->delete($oldPath);
            }
            $data['photo_path'] = $photo->store('employees', 'local');
        }

        return $data;
    }

    /** Back to Active, clearing the reason and last day. */
    public function cancelResign(Employee $employee): Employee
    {
        $employee->update([
            'status' => EmployeeStatus::Active,
            'resign_reason' => null,
            'last_day' => null,
        ]);

        return $employee->load(['department', 'position']);
    }

    /** The Role Group new employees are put into (never a super-role group), or null. */
    private function defaultGroupForNewEmployee(): ?GroupRole
    {
        return GroupRole::defaultForNewEmployees();
    }

    /** The role behind the default Role Group, or null when none is usable. */
    public function defaultRoleForNewEmployee(): ?Role
    {
        return $this->defaultGroupForNewEmployee()?->role;
    }

    /**
     * The role_id for this employee's login account: their own Role Group's role, else the default's.
     *
     * @throws ValidationException when no Role Group answers for this employee
     */
    private function resolveGroupRole(Employee $employee): int
    {
        $roleId = $employee->groupRoles()->first()?->role_id
            ?? $this->defaultGroupForNewEmployee()?->role_id;

        if ($roleId === null) {
            // Code first for the SPA, English sentence second
            throw ValidationException::withMessages(['role' => [
                self::NO_ROLE_CONFIGURED,
                'This employee is in no Role Group, and no default Role Group is set. Create one on the Permissions page and mark it the default before creating login accounts.',
            ]]);
        }

        return $roleId;
    }

    /**
     * Users holding the permission, optionally leaving one out.
     *
     * @return Collection<int, User>
     */
    private function recipientsWithPermission(string $permission, ?User $exclude): Collection
    {
        return User::holdingPermission($permission)
            ->when($exclude, fn ($q) => $q->whereKeyNot($exclude->id))
            ->orderBy('id')
            ->get();
    }

    /** Notifies every user allowed to set credentials that this person still needs one. */
    private function notifyCredentialSetters(Employee $employee): void
    {
        // The actor is included: often the only holder of the permission
        $recipients = $this->recipientsWithPermission('employees.set_credentials', null);

        if ($recipients->isEmpty()) {
            return;
        }

        // In-app (database) bell — synchronous, shows immediately.
        Notification::send($recipients, new NewEmployeeNotification($employee));

        // Email via employee.account_needed (queued)
        $employee->loadMissing(['position', 'section', 'department']);

        $vars = [
            'employee.name' => e((string) $employee->name),
            'employee.code' => e((string) $employee->code),
            'employee.position' => e($employee->position?->title ?: '-'),
            // English name, Thai where English is blank
            'employee.section' => e($this->masterName($employee->section)),
            'employee.department' => e($this->masterName($employee->department)),
            'employee.working' => DateDisplay::emailDate($employee->joined_at),
        ];

        $emailService = app(EmailNotificationService::class);
        foreach ($recipients as $recipient) {
            $emailService->sendTemplate('employee.account_needed', $recipient->email, [
                'user.first_name' => e(explode(' ', (string) $recipient->name)[0] ?: 'there'),
                ...$vars,
            ], url("/employees?tab=directory&view={$employee->id}"), 'Open the employee', $recipient->name);
        }
    }

    /** A master-data name for an English email, the Thai one when that is all it has. */
    private function masterName(?object $record): string
    {
        if ($record === null) {
            return '-';
        }

        return (string) ($record->name ?: ($record->name_th ?: '-'));
    }

    /** Bells and mails access.module holders with an access.*_edit right when the leaver still has access. */
    private function notifyAccessOffboarding(Employee $employee): void
    {
        $access = app(AccessService::class);
        $outstanding = $access->outstandingFor($employee);

        if ($outstanding['total'] === 0) {
            return;
        }

        $editKeys = ['access.email_edit', 'access.file_edit', 'access.social_edit', 'access.software_edit'];
        $recipients = User::holdingPermission('access.module')
            ->holdingAnyPermission($editKeys)
            ->orderBy('id')
            ->get();

        if ($recipients->isEmpty()) {
            return;
        }

        Notification::send($recipients, new AccessOffboardingNotification($employee, $outstanding));

        // The mail lists what the bell only counts
        $table = $access->outstandingTableFor($employee);
        $emailService = app(EmailNotificationService::class);

        foreach ($recipients as $recipient) {
            $emailService->sendTemplate('access.offboarding', $recipient->email, [
                'user.first_name' => e(strtok((string) $recipient->name, ' ') ?: 'there'),
                'employee.name' => e((string) $employee->name),
                'employee.code' => e((string) $employee->code),
                'employee.last_working' => DateDisplay::emailDate($employee->last_day),
                'access.count' => number_format((int) $outstanding['total']),
                'access.table' => $table,
            ], url('/access'), 'Open the Access Directory', $recipient->name);
        }
    }

    /** Bells employees.set_credentials holders to offboard the leaver (actor included), others as news. */
    private function notifyResignation(Employee $employee): void
    {
        $offboarders = $this->recipientsWithPermission('employees.set_credentials', null);

        if ($offboarders->isNotEmpty()) {
            // In-app (database) bell only — no email template for offboarding yet.
            Notification::send($offboarders, new EmployeeResignedNotification($employee));
        }

        // employees.view holders hear it as news, minus the offboarders above
        $offboarderIds = $offboarders->pluck('id');
        $watchers = $this->recipientsWithPermission('employees.view', null)
            ->reject(fn (User $u) => $offboarderIds->contains($u->id));

        if ($watchers->isNotEmpty()) {
            Notification::send($watchers, new EmployeeResignedNotification($employee, 'departure'));
        }

        $this->emailDeparture($employee, $offboarders->concat($watchers));
    }

    /**
     * Mails the departure notice to offboarders and watchers alike, never to the leaver.
     *
     * @param  Collection<int, User>  $recipients
     */
    private function emailDeparture(Employee $employee, Collection $recipients): void
    {
        $audience = $recipients->reject(fn (User $u) => $u->employee_id === $employee->id);

        if ($audience->isEmpty()) {
            return;
        }

        $emailService = app(EmailNotificationService::class);
        $vars = [
            'employee.name' => e((string) $employee->name),
            'employee.code' => e((string) $employee->code),
            'employee.last_working' => DateDisplay::emailDate($employee->last_day),
        ];

        foreach ($audience as $recipient) {
            $emailService->sendTemplate('employee.offboarding', $recipient->email, [
                'user.first_name' => e(strtok((string) $recipient->name, ' ') ?: 'there'),
                ...$vars,
            ], url('/employees'), 'Open the employee list', $recipient->name);
        }
    }
}
