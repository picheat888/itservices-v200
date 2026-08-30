<?php

namespace App\Services\Employee;

use App\Enums\Employee\EmployeeStatus;
use App\Models\Employee\Employee;
use App\Models\Permission\GroupRole;
use App\Models\Permission\Role;
use App\Models\Settings\AppSetting;
use App\Models\User;
use App\Notifications\AccessOffboardingNotification;
use App\Notifications\EmployeeResignedNotification;
use App\Notifications\NewEmployeeNotification;
use App\Services\Access\AccessService;
use App\Services\Asset\AssetService;
use App\Services\Email\EmailNotificationService;
use App\Services\Request\RequestNotificationService;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Validation\ValidationException;

class EmployeeService
{
    /**
     * Sent when no role can be resolved for a login account. A code, not a sentence, so
     * the SPA writes it out in the reader's language — same contract as ChainBlockReason.
     */
    public const NO_ROLE_CONFIGURED = 'no_role_configured';

    /**
     * The Asset service is here so a resignation can hand the leaver's devices back on its
     * own — see resign(). Injected rather than resolved inline so tests can swap it out.
     */
    public function __construct(private readonly AssetService $assets) {}

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
        $this->defaultGroupForNewEmployee()?->employees()->syncWithoutDetaching([$employee->id]);

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

        // An approval that reached this person before they had an account was never
        // delivered — nothing replays a notification. Now that there is an inbox, hand
        // over whatever has been waiting on them.
        app(RequestNotificationService::class)->deliverPendingApprovals($employee);

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

    public function resign(Employee $employee, ?string $reason, ?string $lastDay): Employee
    {
        $employee->update([
            'status' => EmployeeStatus::Resigned,
            'resign_reason' => $reason,
            'last_day' => $lastDay,
        ]);

        // A leaver's devices are recalled with them: everything still in their hands turns
        // Pending return and IT is belled to collect it. Ungated on purpose — recording a
        // resignation must not also require an assets permission.
        $this->assets->requestReturnForEmployee($employee, "Resignation — {$employee->code}");

        // Access is NOT revoked automatically — the system's standing rule is that IT does
        // access by hand (the same reason an approved request never auto-grants). What was
        // missing was anyone being told: the leaver's grants and owned resources simply sat
        // there until somebody happened to open the Access Directory.
        $this->notifyAccessOffboarding($employee);

        $this->notifyResignation($employee);

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
     * The Role Group new employees are put into — whichever one an Admin marked as the
     * default on the Permission page — or null when none is marked.
     *
     * The single place that setting is read: create() puts the person in this group, and
     * defaultRoleForNewEmployee() takes the role from it. Two readers resolving it their
     * own way is how the Add Employee form ended up displaying an unrelated
     * `default_employee_role` setting that nothing applied, agreeing with reality only by
     * accident.
     */
    private function defaultGroupForNewEmployee(): ?GroupRole
    {
        $groupId = (int) AppSetting::get('default_employee_group_id', 0);

        return $groupId ? GroupRole::with('role')->find($groupId) : null;
    }

    /**
     * The role a brand-new employee ends up with — whatever sits behind the default
     * Role Group, and nothing else. Null when no default group is set.
     *
     * There is deliberately no fallback to a role key. An install is entitled to define
     * its own Role Templates and delete the seeded ones, so any key named in code is a
     * guess about somebody else's configuration; a system that has not been told which
     * role new people get should say so, not pick one.
     */
    public function defaultRoleForNewEmployee(): ?Role
    {
        return $this->defaultGroupForNewEmployee()?->role;
    }

    /**
     * The role_id for this employee's login account: their own Role Group's role, else
     * the default group's — the same answer the Add Employee form showed.
     *
     * Refuses when neither exists. This used to firstOrCreate a role keyed `user`, which
     * on an install that configures its own templates conjured up a "Staff" role holding
     * no permissions at all: an account that can sign in and reach nothing, carrying a
     * role its administrator never made. Refusing puts the choice back with the person
     * provisioning accounts, who is the one who can go and make it.
     *
     * @throws ValidationException when no Role Group answers for this employee
     */
    private function resolveGroupRole(Employee $employee): int
    {
        $roleId = $employee->groupRoles()->first()?->role_id
            ?? $this->defaultGroupForNewEmployee()?->role_id;

        if ($roleId === null) {
            // Code first so the SPA can translate it, English sentence second for any
            // client that does not — the shape ChainBlockReason established.
            throw ValidationException::withMessages(['role' => [
                self::NO_ROLE_CONFIGURED,
                'This employee is in no Role Group, and no default Role Group is set. Create one on the Permissions page and mark it the default before creating login accounts.',
            ]]);
        }

        return $roleId;
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
        //
        // Enough of the new starter to set an account up without opening the record: who
        // they are, where they sit, and when they need it by. Loaded once rather than per
        // recipient — the same three relations for everybody on the list.
        $employee->loadMissing(['position', 'section', 'department']);

        $vars = [
            'employee.name' => (string) $employee->name,
            'employee.code' => (string) $employee->code,
            'employee.position' => $employee->position?->title ?: '-',
            // Master data is mixed-language and the English name is the one that is always
            // filled; the Thai name stands in where it is not.
            'employee.section' => $this->masterName($employee->section),
            'employee.department' => $this->masterName($employee->department),
            'employee.working' => $employee->joined_at?->format('d-m-Y') ?? '-',
        ];

        $emailService = app(EmailNotificationService::class);
        foreach ($recipients as $recipient) {
            $emailService->sendTemplate('employee.account_needed', $recipient->email, [
                'user.first_name' => explode(' ', (string) $recipient->name)[0] ?? 'there',
                ...$vars,
            ], url("/employees?tab=directory&view={$employee->id}"), 'Open the employee', $recipient->name);
        }
    }

    /**
     * A master-data record's name for an English email: its own name, or the Thai one when
     * that is all it has.
     *
     * Departments carry both, sections usually only the English — a blank cell in a list an
     * IT admin works from is worse than the wrong language.
     */
    private function masterName(?object $record): string
    {
        if ($record === null) {
            return '-';
        }

        return (string) ($record->name ?: ($record->name_th ?: '-'));
    }

    /**
     * Bells whoever can actually clear a leaver's access. Silent when they hold none — an
     * alert about nothing trains people to ignore the tray.
     *
     * Gated on both halves of what the bell asks for, reusing the keys the module already
     * defines rather than inventing one: access.module because the bell links to /access and
     * that master opens the page (a bell whose link 403s is worse than no bell), plus any
     * access.*_edit because revoking a grant and reassigning an owner both need edit — a
     * viewer would get a to-do they cannot carry out. Normalisation makes edit imply the
     * master on save, but older roles can still hold a child without it, so both are checked.
     *
     * The acting user is NOT excluded, for the reason spelled out on notifyCredentialSetters:
     * clearing access is a separate act from recording the resignation, and the person who
     * can do it is often the only holder of the permission — dropping them leaves the bell
     * with nobody to go to. Whoever files the resignation still has to clear the access later.
     */
    private function notifyAccessOffboarding(Employee $employee): void
    {
        $access = app(AccessService::class);
        $outstanding = $access->outstandingFor($employee);

        if ($outstanding['total'] === 0) {
            return;
        }

        $editKeys = ['access.email_edit', 'access.file_edit', 'access.social_edit', 'access.software_edit'];
        $recipients = User::all()->filter(
            fn (User $u) => $u->hasPermission('access.module')
                && collect($editKeys)->contains(fn (string $key) => $u->hasPermission($key))
        );

        if ($recipients->isEmpty()) {
            return;
        }

        Notification::send($recipients, new AccessOffboardingNotification($employee, $outstanding));

        // The mail carries what the bell only counts: a bell says there is work, the list
        // says what it is — and it is read away from the screen, by whoever is clearing the
        // account rather than sitting in the Access Directory.
        $table = $access->outstandingTableFor($employee);
        $emailService = app(EmailNotificationService::class);

        foreach ($recipients as $recipient) {
            $emailService->sendTemplate('access.offboarding', $recipient->email, [
                'user.first_name' => strtok((string) $recipient->name, ' ') ?: 'there',
                'employee.name' => (string) $employee->name,
                'employee.code' => (string) $employee->code,
                'employee.last_working' => $employee->last_day?->format('d-m-Y') ?? '-',
                'access.count' => (string) $outstanding['total'],
                'access.table' => $table,
            ], url('/access'), 'Open the Access Directory', $recipient->name);
        }
    }

    /**
     * Notifies IT (employees.set_credentials) to offboard a resigned employee.
     *
     * The actor used to be excluded, which quietly killed the bell: a single admin holds
     * this permission in most installs, so filing a resignation removed the only recipient
     * and nobody was ever told to close the account. Closing a login is a later job than
     * recording that someone left, even when the same person does both.
     */
    private function notifyResignation(Employee $employee): void
    {
        $offboarders = $this->recipientsWithPermission('employees.set_credentials', null);

        if ($offboarders->isNotEmpty()) {
            // In-app (database) bell only — no email template for offboarding yet.
            Notification::send($offboarders, new EmployeeResignedNotification($employee));
        }

        // Everyone else who works with the directory hears it as news rather than a task:
        // they cannot close the account, but a departure changes who they route work to and
        // who they expect to see on a list. Reuses employees.view — the key that already
        // decides who may look at staff records at all — minus the people above, so nobody
        // gets told twice about the same person.
        $offboarderIds = $offboarders->pluck('id');
        $watchers = $this->recipientsWithPermission('employees.view', null)
            ->reject(fn (User $u) => $offboarderIds->contains($u->id));

        if ($watchers->isNotEmpty()) {
            Notification::send($watchers, new EmployeeResignedNotification($employee, 'departure'));
        }

        $this->emailDeparture($employee, $offboarders->concat($watchers));
    }

    /**
     * Mails the same departure notice the bell carries.
     *
     * Sent to everyone who may look at staff records — offboarders included, unlike the two
     * bells above. The bells split because somebody holding both permissions would otherwise
     * be told twice about one event in one tray; on email there is nothing to be told twice
     * BY, because the offboarding task itself has no mail of its own. Leaving them out would
     * mean the person most involved in a departure is the one person it is not announced to.
     *
     * The leaver is skipped when they have a login of their own: telling somebody their own
     * resignation has been recorded is not news to them.
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
            'employee.name' => (string) $employee->name,
            'employee.code' => (string) $employee->code,
            'employee.last_working' => $employee->last_day?->format('d-m-Y') ?? '-',
        ];

        foreach ($audience as $recipient) {
            $emailService->sendTemplate('employee.offboarding', $recipient->email, [
                'user.first_name' => strtok((string) $recipient->name, ' ') ?: 'there',
                ...$vars,
            ], url('/employees'), 'Open the employee list', $recipient->name);
        }
    }
}
