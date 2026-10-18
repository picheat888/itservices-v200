<?php

namespace App\Http\Controllers\Api\Permission;

use App\Enums\UserRole;
use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Employee\Employee;
use App\Models\Permission\GroupRole;
use App\Models\Permission\Role;
use App\Models\Settings\AppSetting;
use App\Models\User;
use App\Support\RoleKeys;
use App\Support\SuperAdmins;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
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
        if (count($employeeIds) === 0) {
            return false;
        }

        $employees = Employee::with('groupRoles.role')->whereIn('id', $employeeIds)->get();
        $inSuperGroup = $employees->contains(
            fn (Employee $employee) => $employee->groupRoles->contains(fn (GroupRole $group) => UserRole::isSuperKey($group->role?->key))
        );
        if ($inSuperGroup) {
            return true;
        }

        $superRoleId = SuperAdmins::roleId();
        if ($superRoleId === null) {
            return false;
        }

        // Same account match as syncUserRoles
        $usernames = $employees->pluck('username')->filter();

        return User::where('role_id', $superRoleId)
            ->where(function ($q) use ($employeeIds, $usernames) {
                $q->whereIn('employee_id', $employeeIds)
                    ->orWhereIn('username', $usernames);
            })
            ->exists();
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
     * @return array<string, mixed>
     */
    private function present(GroupRole $g): array
    {
        return [
            'id' => $g->id,
            'name' => $g->name,
            'role' => $g->role?->key,
            'role_label' => $g->role ? ($g->role->name ?? $g->role->key) : null,
            'employee_ids' => $g->employees->pluck('id'),
            'employees' => $g->employees->map(fn ($e) => ['id' => $e->id, 'name' => $e->name, 'code' => $e->code]),
            'member_count' => $g->employees->count(),
        ];
    }

    public function index(Request $request): JsonResponse
    {
        $this->gate($request);

        $groups = GroupRole::with(['employees'])
            ->orderBy('name')
            ->get()
            ->map(fn ($g) => $this->present($g));

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
        $this->guardProtectedMembers($request, $employeeIds);

        $group = SuperAdmins::keepAtLeastOne(function () use ($data, $role, $employeeIds) {
            $group = GroupRole::create(['name' => $data['name'], 'role_id' => $role?->id]);
            $this->moveEmployeesInto($group, $employeeIds);
            $this->syncUserRoles($group, $employeeIds);

            return $group;
        });

        AuditLog::record('Created role group', $group->name, subject: $group);

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
        $newEmployeeIds = $data['employee_ids'] ?? [];
        $removedEmployeeIds = array_values(array_diff($oldEmployeeIds, $newEmployeeIds));
        $this->guardProtectedMembers($request, array_values(array_unique([...$newEmployeeIds, ...$removedEmployeeIds])));

        $before = [];

        SuperAdmins::keepAtLeastOne(function () use ($groupRole, $data, $role, $newEmployeeIds, $removedEmployeeIds, &$before) {
            $before = $groupRole->getOriginal();
            $groupRole->update(['name' => $data['name'], 'role_id' => $role?->id]);
            $this->moveEmployeesInto($groupRole, $newEmployeeIds);
            $this->syncUserRoles($groupRole, $newEmployeeIds);

            if (count($removedEmployeeIds) > 0) {
                $this->fallbackOrphansToDefault($groupRole, $removedEmployeeIds);
            }
        });

        AuditLog::record('Updated role group', $groupRole->name, AuditLog::changes($before, $groupRole), subject: $groupRole);

        return response()->json(['data' => $this->present($groupRole->load(['employees'])), 'message' => 'success']);
    }

    public function destroy(Request $request, GroupRole $groupRole): JsonResponse
    {
        $this->gate($request);
        $this->guardSuperGroup($request, $groupRole->role?->key);

        $memberIds = $groupRole->employees->pluck('id')->all();
        $this->guardProtectedMembers($request, $memberIds);
        $name = $groupRole->name;

        SuperAdmins::keepAtLeastOne(function () use ($groupRole, $memberIds) {
            // Unset default group if this one is being deleted
            if ((int) AppSetting::get('default_employee_group_id', 0) === $groupRole->id) {
                AppSetting::put('default_employee_group_id', null);
            }

            $groupRole->delete();
            $this->fallbackOrphansToDefault($groupRole, $memberIds);
        });

        AuditLog::recordDeleted('Deleted role group', $name, $groupRole);

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
        ]);
    }
}
