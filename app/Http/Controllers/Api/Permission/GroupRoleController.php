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
use App\Services\Permission\GroupRoleMemberService;
use App\Support\RoleKeys;
use App\Support\SuperAdmins;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class GroupRoleController extends Controller
{
    /**
     * Sets the group's role on the login accounts of its employees (by employee_id, then username).
     *
     * @param  array<int>  $newEmployeeIds
     */
    private function syncUserRoles(GroupRole $group, array $newEmployeeIds): void
    {
        if (! $group->role_id || count($newEmployeeIds) === 0) {
            return;
        }

        $usernames = Employee::whereIn('id', $newEmployeeIds)->pluck('username')->filter();

        User::where(function ($q) use ($newEmployeeIds, $usernames) {
            $q->whereIn('employee_id', $newEmployeeIds)
                ->orWhereIn('username', $usernames);
        })->update(['role_id' => $group->role_id]);
    }

    /** Sets the login account's role for a single employee. */
    private function setUserRole(Employee $employee, ?string $roleKey): void
    {
        $roleId = Role::where('key', $roleKey ?: 'user')->value('id');

        User::where(function ($q) use ($employee) {
            $q->where('employee_id', $employee->id);

            if ($employee->username) {
                $q->orWhere('username', $employee->username);
            }
        })->update(['role_id' => $roleId]);
    }

    /**
     * Moves the employees into this group, detaching them from every other group.
     *
     * @param  array<int>  $employeeIds
     */
    private function moveEmployeesInto(GroupRole $group, array $employeeIds): void
    {
        if (count($employeeIds) > 0) {
            DB::table('group_role_employee')
                ->whereIn('employee_id', $employeeIds)
                ->where('group_role_id', '!=', $group->id)
                ->delete();
        }

        $group->employees()->sync($employeeIds);
    }

    /**
     * Moves employees left without a group into the default group, or the base 'user' role.
     *
     * @param  array<int>  $removedEmployeeIds
     */
    private function fallbackOrphansToDefault(GroupRole $fromGroup, array $removedEmployeeIds): void
    {
        $defaultGroup = GroupRole::defaultForNewEmployees();

        foreach ($removedEmployeeIds as $empId) {
            $employee = Employee::find($empId);
            if (! $employee) {
                continue;
            }

            // Still in another group? Then this was a move, not an orphaning.
            if ($employee->groupRoles()->exists()) {
                continue;
            }

            if ($defaultGroup && $defaultGroup->id !== $fromGroup->id) {
                $defaultGroup->employees()->syncWithoutDetaching([$empId]);
                $this->setUserRole($employee, $defaultGroup->role?->key);
            } else {
                $this->setUserRole($employee, 'user');
            }
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
     * Blocks a non-super caller from adding or removing their own employee, or changing the role of a group they sit in.
     *
     * @param  array<int>  $changedEmployeeIds  employees the write adds or removes
     * @param  array<int>  $currentEmployeeIds  the group's members before the write
     */
    private function guardOwnAccess(Request $request, array $changedEmployeeIds, array $currentEmployeeIds = [], bool $roleChanges = false): void
    {
        $caller = $request->user();
        if ($caller->isSuper()) {
            return;
        }

        $ownEmployeeIds = $caller->linkedEmployeeIds();
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

    /** Blocks a non-super caller from handing out a role that holds permissions they do not. */
    private function guardGrantCeiling(Request $request, ?Role $role, bool $handsRoleOut): void
    {
        $caller = $request->user();
        if ($caller->isSuper() || $role === null || ! $handsRoleOut) {
            return;
        }

        if (array_diff($role->allowedKeys(), $caller->permissions()) === []) {
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
            // The caller's own employee sits here: only a Super admin may change its role or members
            'includes_me' => in_array($g->id, $mine, true),
        ];
    }

    public function index(Request $request): JsonResponse
    {
        $this->gate($request);

        $mine = DB::table('group_role_employee')
            ->whereIn('employee_id', $request->user()->linkedEmployeeIds())
            ->pluck('group_role_id')
            ->map(fn ($id) => (int) $id)
            ->all();
        $groups = GroupRole::with('role')
            ->withCount('employees')
            ->orderBy('name')
            ->get()
            ->map(fn ($g) => $this->present($g, $mine));

        return response()->json([
            'data' => $groups,
            'default_group_id' => GroupRole::defaultForNewEmployees()?->id,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->gate($request);
        $data = $this->validateData($request);
        $role = RoleKeys::find($data['role'] ?? null);
        $this->guardRole($data, $role);
        $this->guardSuperGroup($request, null, $role?->key);

        $employeeIds = $data['employee_ids'] ?? [];
        $this->guardOwnAccess($request, $employeeIds);
        $this->guardProtectedMembers($request, $employeeIds);
        $this->guardGrantCeiling($request, $role, $employeeIds !== []);

        $group = SuperAdmins::keepAtLeastOne(function () use ($data, $role, $employeeIds) {
            $rolesBefore = $this->accountRoles($employeeIds);
            $group = GroupRole::create(['name' => $data['name'], 'role_id' => $role?->id]);
            $this->moveEmployeesInto($group, $employeeIds);
            $this->syncUserRoles($group, $employeeIds);

            $details = $this->membershipDetails($employeeIds, [], $rolesBefore);
            AuditLog::record('Created role group', $group->name, $details ?: null, subject: $group);

            return $group;
        });

        return response()->json(['data' => $this->present($group), 'message' => 'success'], 201);
    }

    public function update(Request $request, GroupRole $groupRole): JsonResponse
    {
        $this->gate($request);
        $data = $this->validateData($request);
        $role = RoleKeys::find($data['role'] ?? null);
        $this->guardRole($data, $role);
        $this->guardSuperGroup($request, $groupRole->role?->key, $role?->key);

        $oldEmployeeIds = $groupRole->employees->pluck('id')->all();
        $newEmployeeIds = $this->nextMembers($data, $oldEmployeeIds);
        $addedEmployeeIds = array_values(array_diff($newEmployeeIds, $oldEmployeeIds));
        $removedEmployeeIds = array_values(array_diff($oldEmployeeIds, $newEmployeeIds));
        $roleChanges = (int) $groupRole->role_id !== (int) $role?->id;

        $this->guardOwnAccess($request, [...$addedEmployeeIds, ...$removedEmployeeIds], $oldEmployeeIds, $roleChanges);
        $this->guardProtectedMembers($request, array_values(array_unique([...$newEmployeeIds, ...$removedEmployeeIds])));
        $isDefaultGroup = GroupRole::defaultForNewEmployees()?->id === $groupRole->id;
        $handsRoleOut = $addedEmployeeIds !== [] || ($roleChanges && ($newEmployeeIds !== [] || $isDefaultGroup));
        $this->guardGrantCeiling($request, $role, $handsRoleOut);

        SuperAdmins::keepAtLeastOne(function () use ($groupRole, $data, $role, $newEmployeeIds, $addedEmployeeIds, $removedEmployeeIds) {
            $before = $groupRole->getOriginal();
            $rolesBefore = $this->accountRoles([...$newEmployeeIds, ...$removedEmployeeIds]);
            $groupRole->update(['name' => $data['name'], 'role_id' => $role?->id]);
            $this->moveEmployeesInto($groupRole, $newEmployeeIds);
            $this->syncUserRoles($groupRole, $newEmployeeIds);

            if (count($removedEmployeeIds) > 0) {
                $this->fallbackOrphansToDefault($groupRole, $removedEmployeeIds);
            }

            $details = [
                ...(AuditLog::changes($before, $groupRole) ?? []),
                ...$this->membershipDetails($addedEmployeeIds, $removedEmployeeIds, $rolesBefore),
            ];
            AuditLog::record('Updated role group', $groupRole->name, $details ?: null, subject: $groupRole);
        });

        return response()->json(['data' => $this->present($groupRole->loadCount('employees')), 'message' => 'success']);
    }

    public function destroy(Request $request, GroupRole $groupRole): JsonResponse
    {
        $this->gate($request);
        $this->guardSuperGroup($request, $groupRole->role?->key);

        $memberIds = $groupRole->employees->pluck('id')->all();
        $this->guardOwnAccess($request, $memberIds);
        $this->guardProtectedMembers($request, $memberIds);
        $name = $groupRole->name;

        SuperAdmins::keepAtLeastOne(function () use ($groupRole, $memberIds, $name) {
            $rolesBefore = $this->accountRoles($memberIds);

            // Unset default group if this one is being deleted
            if ((int) AppSetting::get('default_employee_group_id', 0) === $groupRole->id) {
                AppSetting::put('default_employee_group_id', null);
            }

            $groupRole->delete();
            $this->fallbackOrphansToDefault($groupRole, $memberIds);

            AuditLog::recordDeleted('Deleted role group', $name, $groupRole, $this->membershipDetails([], $memberIds, $rolesBefore));
        });

        return response()->json(['message' => 'success']);
    }

    /** Sets the default Role Group for new employees. */
    public function setDefaultGroup(Request $request): JsonResponse
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

        $this->guardGrantCeiling($request, $group?->role, true);

        AppSetting::put('default_employee_group_id', $groupId);
        AuditLog::record('Set default role group', $group?->name ?? '(none)', subject: $group);

        return $this->index($request);
    }

    /**
     * @return array<string, mixed>
     */
    private function validateData(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'role' => ['nullable', 'string', Rule::in(RoleKeys::all())],
            'employee_ids' => ['array'],
            'employee_ids.*' => ['exists:employees,id'],
            'add_ids' => ['array'],
            'add_ids.*' => ['exists:employees,id'],
            'remove_ids' => ['array'],
            'remove_ids.*' => ['integer'],
        ]);
    }

    /**
     * The members after the write: a full employee_ids list, or the current members with add_ids and remove_ids applied.
     *
     * @param  array<string, mixed>  $data
     * @param  array<int>  $current
     * @return array<int>
     */
    private function nextMembers(array $data, array $current): array
    {
        if (! array_key_exists('add_ids', $data) && ! array_key_exists('remove_ids', $data)) {
            return array_map('intval', $data['employee_ids'] ?? []);
        }

        $added = array_map('intval', $data['add_ids'] ?? []);
        $removed = array_map('intval', $data['remove_ids'] ?? []);

        return array_values(array_diff(array_unique([...$current, ...$added]), $removed));
    }

    /** One page of the group's members for the dialog. */
    public function members(Request $request, GroupRole $groupRole, GroupRoleMemberService $service): JsonResponse
    {
        $this->gate($request);
        $perPage = max(10, min(100, (int) $request->query('per_page', 20)));

        return $this->memberPage($request, $service->members($groupRole, $request->query('search'), $perPage));
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

        $result = $service->candidates($group, $params['search'] ?? null, $departmentId, $all, $perPage);
        if ($result instanceof Collection) {
            $this->flagProtected($request, $result->pluck('id')->all());

            return response()->json(['data' => GroupRoleMemberResource::collection($result), 'message' => 'success']);
        }

        return $this->memberPage($request, $result);
    }

    private function memberPage(Request $request, LengthAwarePaginator $page): JsonResponse
    {
        $this->flagProtected($request, collect($page->items())->pluck('id')->all());

        return response()->json([
            'data' => GroupRoleMemberResource::collection($page->items()),
            'meta' => [
                'total' => $page->total(),
                'per_page' => $page->perPage(),
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
            ],
        ]);
    }

    /**
     * Marks the Super-admin employees a non-super caller may not move.
     *
     * @param  array<int>  $employeeIds
     */
    private function flagProtected(Request $request, array $employeeIds): void
    {
        $protected = $request->user()?->isSuper() ? [] : SuperAdmins::protectedEmployeeIds($employeeIds);
        $request->attributes->set('protected_employee_ids', array_map('intval', $protected));
    }
}
