<?php

namespace App\Http\Controllers\Api\Permission;

use App\Enums\UserRole;
use App\Http\Controllers\Controller;
use App\Http\Resources\Permission\GroupRoleMemberResource;
use App\Models\AuditLog;
use App\Models\Employee\Employee;
use App\Models\Permission\GroupRole;
use App\Models\Permission\Role;
use App\Models\Settings\AppSetting;
use App\Models\User;
use App\Services\Permission\GroupMembershipChange;
use App\Services\Permission\GroupRoleMemberService;
use App\Services\Permission\RoleOptionService;
use App\Support\RoleKeys;
use App\Support\SuperAdmins;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class GroupRoleController extends Controller
{
    /**
     * Sets the group's role, or the base 'user' role for a group without one, on its employees' login accounts.
     *
     * @param  array<int>  $newEmployeeIds
     */
    private function syncUserRoles(GroupRole $group, array $newEmployeeIds): void
    {
        $this->setAccountRoles($newEmployeeIds, $group->role_id ? (int) $group->role_id : $this->baseRoleId());
    }

    /** The base role given to anyone whose group has no role, or who has no group. */
    private function baseRoleId(): ?int
    {
        return RoleKeys::find('user')?->id;
    }

    /**
     * Sets one role on the login accounts of the employees (by employee_id, then username).
     *
     * @param  array<int>  $employeeIds
     */
    private function setAccountRoles(array $employeeIds, ?int $roleId): void
    {
        if ($employeeIds === []) {
            return;
        }

        $usernames = Employee::whereIn('id', $employeeIds)->pluck('username')->filter();

        User::where(function ($q) use ($employeeIds, $usernames) {
            $q->whereIn('employee_id', $employeeIds)
                ->orWhereIn('username', $usernames);
        })->update(['role_id' => $roleId]);
    }

    /**
     * Moves the added employees into this group out of every other group, and detaches the removed ones.
     *
     * @param  array<int>  $addedEmployeeIds
     * @param  array<int>  $removedEmployeeIds
     */
    private function moveEmployeesInto(GroupRole $group, array $addedEmployeeIds, array $removedEmployeeIds = []): void
    {
        if ($addedEmployeeIds !== []) {
            DB::table('group_role_employee')->whereIn('employee_id', $addedEmployeeIds)->delete();
            $group->employees()->attach($addedEmployeeIds);
        }

        if ($removedEmployeeIds !== []) {
            $group->employees()->detach($removedEmployeeIds);
        }
    }

    /**
     * The group's members now.
     *
     * @return array<int>
     */
    private function memberIds(GroupRole $group): array
    {
        return $group->employees()->pluck('employees.id')->map(fn ($id) => (int) $id)->all();
    }

    /** Re-reads the group under a row lock, so two saves of one group run one after the other. */
    private function lockGroup(GroupRole $group): GroupRole
    {
        return GroupRole::lockForUpdate()->findOrFail($group->id);
    }

    /**
     * The group's members, read under lock.
     *
     * @return array<int>
     */
    private function lockMembers(GroupRole $group): array
    {
        return DB::table('group_role_employee')
            ->where('group_role_id', $group->id)
            ->lockForUpdate()
            ->pluck('employee_id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }

    /**
     * Locks the group rows these employees sit in now, before the write moves them out.
     *
     * @param  array<int>  $employeeIds
     */
    private function lockMemberships(array $employeeIds): void
    {
        if ($employeeIds !== []) {
            DB::table('group_role_employee')->whereIn('employee_id', $employeeIds)->lockForUpdate()->pluck('group_role_id');
        }
    }

    /**
     * Moves employees left without a group into the default group, or the base 'user' role.
     *
     * @param  array<int>  $removedEmployeeIds
     */
    private function fallbackOrphansToDefault(Request $request, GroupRole $fromGroup, array $removedEmployeeIds): void
    {
        // Still in another group means a move, not an orphaning
        $orphanIds = Employee::whereIn('id', $removedEmployeeIds)
            ->whereDoesntHave('groupRoles')
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();
        if ($orphanIds === []) {
            return;
        }

        $defaultGroup = GroupRole::defaultForNewEmployees();
        $landsInDefault = $defaultGroup && $defaultGroup->id !== $fromGroup->id;
        // The role they land on is handed out by this write
        $this->guardGrantCeiling($request, $landsInDefault ? $defaultGroup->role : null, true);
        if ($landsInDefault) {
            $defaultGroup->employees()->attach($orphanIds);
            $this->syncUserRoles($defaultGroup, $orphanIds);
        } else {
            $this->setAccountRoles($orphanIds, $this->baseRoleId());
        }
    }

    /**
     * The role id of every login account tied to the employees (same match as syncUserRoles).
     *
     * @param  array<int>  $employeeIds
     * @return array<int, int|null> user id => role id
     */
    private function accountRoles(array $employeeIds): array
    {
        if ($employeeIds === []) {
            return [];
        }

        $usernames = Employee::whereIn('id', $employeeIds)->pluck('username')->filter();

        return User::where(function ($q) use ($employeeIds, $usernames) {
            $q->whereIn('employee_id', $employeeIds)
                ->orWhereIn('username', $usernames);
        })
            ->pluck('role_id', 'id')
            ->map(fn ($roleId) => $roleId === null ? null : (int) $roleId)
            ->all();
    }

    /**
     * Audit details for a membership write: who joined, who left, and every account whose role moved.
     *
     * @param  array<int>  $addedEmployeeIds
     * @param  array<int>  $removedEmployeeIds
     * @param  array<int, int|null>  $rolesBefore  accountRoles() taken before the writes
     * @return array{added?: list<string>, removed?: list<string>, role_changes?: list<array{name: string, from: string|null, to: string|null}>}
     */
    private function membershipDetails(array $addedEmployeeIds, array $removedEmployeeIds, array $rolesBefore): array
    {
        $memberLabels = Employee::whereIn('id', [...$addedEmployeeIds, ...$removedEmployeeIds])
            ->get()
            ->mapWithKeys(fn (Employee $employee) => [$employee->id => "{$employee->name} ({$employee->code})"]);
        $labelsOf = fn (array $employeeIds) => $memberLabels->only($employeeIds)->sort()->values()->all();

        $changedAccounts = User::whereIn('id', array_keys($rolesBefore))
            ->get(['id', 'name', 'role_id'])
            ->filter(fn (User $account) => ($account->role_id === null ? null : (int) $account->role_id) !== $rolesBefore[$account->id]);
        $roleIds = $changedAccounts->flatMap(fn (User $account) => [$account->role_id, $rolesBefore[$account->id]])->filter()->unique();
        $roleNames = Role::whereIn('id', $roleIds)->get()->mapWithKeys(fn (Role $role) => [$role->id => $role->name ?? $role->key]);

        $roleChanges = $changedAccounts
            ->map(fn (User $account) => [
                'name' => $account->name,
                'from' => $roleNames->get($rolesBefore[$account->id]),
                'to' => $roleNames->get($account->role_id),
            ])
            ->sortBy('name')
            ->values()
            ->all();

        return array_filter([
            'added' => $labelsOf($addedEmployeeIds),
            'removed' => $labelsOf($removedEmployeeIds),
            'role_changes' => $roleChanges,
        ]);
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function guardRole(array $data, ?Role $role): void
    {
        if (isset($data['role']) && $role === null) {
            throw ValidationException::withMessages(['role' => 'The selected role is invalid.']);
        }
    }

    private function gate(Request $request): void
    {
        abort_unless((bool) $request->user()?->hasPermission('system.manage_groups'), 403);
    }

    /**
     * Blocks non-super users from touching any group tied to the super role.
     *
     * @param  string|null  $incomingRole  the role the request is trying to set, if any
     */
    private function guardSuperGroup(Request $request, ?string $existingRole, ?string $incomingRole = null): void
    {
        if ($request->user()?->isSuper()) {
            return;
        }

        abort_if(
            UserRole::isSuperKey($existingRole) || UserRole::isSuperKey($incomingRole),
            403,
            'Only an Administrator can manage the Administrator role group.'
        );
    }

    /**
     * Whether any of the employees sits in a super-role group or has a super login account.
     *
     * @param  array<int>  $employeeIds
     */
    private function touchesASuperAdmin(array $employeeIds): bool
    {
        return SuperAdmins::protectedEmployeeIds($employeeIds) !== [];
    }

    /**
     * Blocks non-super users from moving, removing or re-saving a Super admin.
     *
     * @param  array<int>  $touchedEmployeeIds
     */
    private function guardProtectedMembers(Request $request, array $touchedEmployeeIds): void
    {
        if ($request->user()?->isSuper() || ! $this->touchesASuperAdmin($touchedEmployeeIds)) {
            return;
        }

        abort(response()->json([
            'message' => 'Only an Administrator can add, remove or move an Administrator account.',
            'code' => 'admin_members_protected',
        ], 403));
    }

    /**
     * Blocks every caller, Super admin included, from adding or removing their own employee, or changing the role of a group they sit in.
     *
     * @param  array<int>  $changedEmployeeIds  employees the write adds or removes
     * @param  array<int>  $currentEmployeeIds  the group's members before the write
     */
    private function guardOwnAccess(Request $request, array $changedEmployeeIds, array $currentEmployeeIds = [], bool $roleChanges = false): void
    {
        $ownEmployeeIds = $request->user()->linkedEmployeeIds();
        $touchesOwnAccess = array_intersect($ownEmployeeIds, $changedEmployeeIds) !== []
            || ($roleChanges && array_intersect($ownEmployeeIds, $currentEmployeeIds) !== []);
        if (! $touchesOwnAccess) {
            return;
        }

        abort(response()->json([
            'message' => 'You cannot change your own role group membership or its role.',
            'code' => 'own_access',
        ], 403));
    }

    /** Whether the caller may hand out this role; null is a group without a role, which hands out the base role. */
    private function withinGrantCeiling(User $caller, ?Role $role): bool
    {
        if ($caller->isSuper()) {
            return true;
        }

        $role ??= RoleKeys::find('user');

        return $role === null || array_diff($role->allowedKeys(), $caller->permissions()) === [];
    }

    /** Blocks a non-super caller from handing out a role that holds permissions they do not. */
    private function guardGrantCeiling(Request $request, ?Role $role, bool $handsRoleOut): void
    {
        if (! $handsRoleOut || $this->withinGrantCeiling($request->user(), $role)) {
            return;
        }

        abort(response()->json([
            'message' => 'You can only hand out a role whose permissions you hold yourself.',
            'code' => 'grant_ceiling',
        ], 403));
    }

    /**
     * @param  array<int>  $mine  ids of the groups holding the caller's own employee
     * @return array<string, mixed>
     */
    private function present(GroupRole $g, array $mine = []): array
    {
        return [
            'id' => $g->id,
            'name' => $g->name,
            'role' => $g->role?->key,
            'role_label' => $g->role ? ($g->role->name ?? $g->role->key) : null,
            'member_count' => $g->employees_count ?? $g->employees()->count(),
            // The caller's own employee sits here: nobody may change its role or their own membership
            'includes_me' => in_array($g->id, $mine, true),
        ];
    }

    /**
     * Ids of the groups holding the caller's own employee.
     *
     * @return array<int>
     */
    private function myGroupIds(Request $request): array
    {
        return DB::table('group_role_employee')
            ->whereIn('employee_id', $request->user()->linkedEmployeeIds())
            ->pluck('group_role_id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }

    public function index(Request $request, RoleOptionService $roleOptions): JsonResponse
    {
        $this->gate($request);

        $mine = $this->myGroupIds($request);
        $groups = GroupRole::with('role')
            ->withCount('employees')
            ->orderBy('name')
            ->get()
            ->map(fn ($g) => $this->present($g, $mine));

        return response()->json([
            'data' => $groups,
            'default_group_id' => GroupRole::defaultForNewEmployees()?->id,
            // The roles a group can be given, for the group dialog
            'roles' => $roleOptions->options(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->gate($request);
        $data = $this->validateData($request);
        $role = RoleKeys::find($data['role'] ?? null);
        $this->guardRole($data, $role);
        $this->guardSuperGroup($request, null, $role?->key);

        $employeeIds = GroupMembershipChange::from($data, [])->next;

        $group = SuperAdmins::keepAtLeastOne(function () use ($request, $data, $role, $employeeIds) {
            $this->lockMemberships($employeeIds);

            $this->guardOwnAccess($request, $employeeIds);
            $this->guardProtectedMembers($request, $employeeIds);
            $this->guardGrantCeiling($request, $role, $employeeIds !== []);

            $rolesBefore = $this->accountRoles($employeeIds);
            $group = GroupRole::create(['name' => $data['name'], 'role_id' => $role?->id]);
            $this->moveEmployeesInto($group, $employeeIds);
            $this->syncUserRoles($group, $employeeIds);

            $details = $this->membershipDetails($employeeIds, [], $rolesBefore);
            AuditLog::record('Created role group', $group->name, $details ?: null, subject: $group);

            return $group;
        }, attempts: 3);

        return response()->json(['data' => $this->present($group->load('role'), $this->myGroupIds($request)), 'message' => 'success'], 201);
    }

    public function update(Request $request, GroupRole $groupRole): JsonResponse
    {
        $this->gate($request);
        $data = $this->validateData($request, updating: true);
        $role = RoleKeys::find($data['role']);
        $this->guardRole($data, $role);

        $groupRole = SuperAdmins::keepAtLeastOne(function () use ($request, $groupRole, $data, $role) {
            // Locks before any plain read
            $group = $this->lockGroup($groupRole);
            $change = GroupMembershipChange::from($data, $this->lockMembers($group));
            $this->lockMemberships($change->added);
            $roleChanges = (int) $group->role_id !== (int) $role?->id;

            $this->guardSuperGroup($request, $group->role?->key, $role?->key);
            $this->guardOwnAccess($request, $change->changed(), $change->current, $roleChanges);
            $this->guardProtectedMembers($request, $change->touched());
            $isDefaultGroup = GroupRole::defaultForNewEmployees()?->id === $group->id;
            $handsRoleOut = $change->added !== [] || ($roleChanges && ($change->next !== [] || $isDefaultGroup));
            $this->guardGrantCeiling($request, $role, $handsRoleOut);

            $before = $group->getOriginal();
            $rolesBefore = $this->accountRoles($change->touched());
            $group->update(['name' => $data['name'], 'role_id' => $role?->id]);
            $this->moveEmployeesInto($group, $change->added, $change->removed);
            // A role change re-applies to everyone, else only newcomers
            $this->syncUserRoles($group, $roleChanges ? $this->memberIds($group) : $change->added);

            if ($change->removed !== []) {
                $this->fallbackOrphansToDefault($request, $group, $change->removed);
            }

            $details = [
                ...(AuditLog::changes($before, $group) ?? []),
                ...$this->membershipDetails($change->added, $change->removed, $rolesBefore),
            ];
            AuditLog::record('Updated role group', $group->name, $details ?: null, subject: $group);

            return $group;
        }, attempts: 3);

        return response()->json([
            'data' => $this->present($groupRole->load('role')->loadCount('employees'), $this->myGroupIds($request)),
            'message' => 'success',
        ]);
    }

    public function destroy(Request $request, GroupRole $groupRole): JsonResponse
    {
        $this->gate($request);

        SuperAdmins::keepAtLeastOne(function () use ($request, $groupRole) {
            $group = $this->lockGroup($groupRole);
            $memberIds = $this->lockMembers($group);
            $this->guardSuperGroup($request, $group->role?->key);
            $this->guardOwnAccess($request, $memberIds);
            $this->guardProtectedMembers($request, $memberIds);

            $rolesBefore = $this->accountRoles($memberIds);

            // Unset default group if this one is being deleted
            if ((int) AppSetting::get('default_employee_group_id', 0) === $group->id) {
                AppSetting::put('default_employee_group_id', null);
            }

            $group->delete();
            $this->fallbackOrphansToDefault($request, $group, $memberIds);

            AuditLog::recordDeleted('Deleted role group', $group->name, $group, $this->membershipDetails([], $memberIds, $rolesBefore));
        }, attempts: 3);

        return response()->json(['message' => 'success']);
    }

    /** Sets the default Role Group for new employees. */
    public function setDefaultGroup(Request $request, RoleOptionService $roleOptions): JsonResponse
    {
        $this->gate($request);

        $data = $request->validate([
            'group_id' => ['nullable', Rule::exists('group_roles', 'id')],
        ]);

        $groupId = $data['group_id'] ?? null;
        $group = $groupId ? GroupRole::with('role')->find($groupId) : null;

        if ($group && UserRole::isSuperKey($group->role?->key)) {
            abort(response()->json([
                'message' => 'The Administrator group cannot be the default group for new employees.',
                'code' => 'default_group_super',
            ], 422));
        }

        if ($group) {
            $this->guardGrantCeiling($request, $group->role, true);
        }

        AppSetting::put('default_employee_group_id', $groupId);
        AuditLog::record('Set default role group', $group?->name ?? '(none)', subject: $group);

        return $this->index($request, $roleOptions);
    }

    /**
     * Members come as a full employee_ids list or as add_ids / remove_ids, never both; an update must send the role, even as null.
     *
     * @return array<string, mixed>
     */
    private function validateData(Request $request, bool $updating = false): array
    {
        $roleRules = ['nullable', 'string', Rule::in(RoleKeys::all())];

        return $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'role' => $updating ? ['present', ...$roleRules] : $roleRules,
            'employee_ids' => ['array', 'missing_with:add_ids,remove_ids'],
            'employee_ids.*' => ['exists:employees,id'],
            'add_ids' => ['array'],
            'add_ids.*' => ['exists:employees,id'],
            'remove_ids' => ['array'],
            'remove_ids.*' => ['integer'],
        ]);
    }

    /** One page of the group's members for the dialog. */
    public function members(Request $request, GroupRole $groupRole, GroupRoleMemberService $service): JsonResponse
    {
        $this->gate($request);
        $params = $request->validate([
            'search' => ['nullable', 'string'],
            'per_page' => ['nullable', 'integer'],
        ]);
        $perPage = max(10, min(100, (int) ($params['per_page'] ?? 20)));

        return $this->memberPage($request, $service->members($groupRole, $params['search'] ?? null, $perPage));
    }

    /** People who can join a group (or a new one): one page, or a whole department with all=1. */
    public function candidates(Request $request, GroupRoleMemberService $service): JsonResponse
    {
        $this->gate($request);
        $params = $request->validate([
            'group_id' => ['nullable', 'integer'],
            'department_id' => ['nullable', 'integer'],
            'search' => ['nullable', 'string'],
            'all' => ['nullable', 'boolean'],
            'per_page' => ['nullable', 'integer'],
        ]);
        $group = isset($params['group_id']) ? GroupRole::find($params['group_id']) : null;
        $departmentId = isset($params['department_id']) ? (int) $params['department_id'] : null;
        // A whole list is only offered per department
        $all = $request->boolean('all') && $departmentId !== null;
        $perPage = max(10, min(100, (int) ($params['per_page'] ?? 20)));

        $page = $service->candidates($group, $params['search'] ?? null, $departmentId, $all, $perPage);
        // For "Everyone in {dept} (n)": who this caller may actually add
        $extraMeta = $departmentId !== null
            ? ['addable' => $this->refusesEveryAdd($request, $group) ? 0 : $service->addableCount($group, $params['search'] ?? null, $departmentId, $request->user())]
            : [];

        return $this->memberPage($request, $page, $extraMeta);
    }

    /** Whether a non-super caller is refused every add to this group: a super-role group, or a role above their ceiling. */
    private function refusesEveryAdd(Request $request, ?GroupRole $group): bool
    {
        $caller = $request->user();
        if ($group === null || $caller->isSuper()) {
            return false;
        }

        return UserRole::isSuperKey($group->role?->key) || ! $this->withinGrantCeiling($caller, $group->role);
    }

    /**
     * @param  array<string, mixed>  $extraMeta
     */
    private function memberPage(Request $request, LengthAwarePaginator $page, array $extraMeta = []): JsonResponse
    {
        $this->flagCallerRows($request, collect($page->items())->pluck('id')->all());

        return response()->json([
            'data' => GroupRoleMemberResource::collection($page->items()),
            'meta' => [
                'total' => $page->total(),
                'per_page' => $page->perPage(),
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                ...$extraMeta,
            ],
        ]);
    }

    /**
     * Marks the Super-admin employees a non-super caller may not move, and the caller's own employee.
     *
     * @param  array<int>  $employeeIds
     */
    private function flagCallerRows(Request $request, array $employeeIds): void
    {
        $protected = $request->user()?->isSuper() ? [] : SuperAdmins::protectedEmployeeIds($employeeIds);
        $request->attributes->set('protected_employee_ids', array_map('intval', $protected));
        $request->attributes->set('my_employee_ids', $request->user()->linkedEmployeeIds());
    }
}
