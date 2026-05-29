<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AppSetting;
use App\Models\AuditLog;
use App\Models\Employee;
use App\Models\GroupRole;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class GroupRoleController extends Controller
{
    /**
     * Sets User.role to the group's role for all employees in the group.
     *
     * @param  array<int>  $newEmployeeIds
     */
    private function syncUserRoles(GroupRole $group, array $newEmployeeIds): void
    {
        if (! $group->role_id || count($newEmployeeIds) === 0) {
            return;
        }

        $emails = Employee::whereIn('id', $newEmployeeIds)->pluck('email')->filter();
        $usernames = Employee::whereIn('id', $newEmployeeIds)->pluck('username')->filter();
        User::where(function ($q) use ($emails, $usernames) {
            $q->whereIn('email', $emails)->orWhereIn('username', $usernames);
        })->update(['role_id' => $group->role_id]);
    }

    /** Sets the login account's role for an employee (matched by email or username). */
    private function setUserRole(Employee $employee, ?string $roleKey): void
    {
        $roleId = Role::where('key', $roleKey ?: 'user')->value('id');

        if ($employee->email) {
            User::where('email', $employee->email)->update(['role_id' => $roleId]);
        } elseif ($employee->username) {
            User::where('username', $employee->username)->update(['role_id' => $roleId]);
        }
    }

    /**
     * Move semantics for "one employee, one group": detach the given employees
     * from every OTHER group, then set this group's membership to exactly them.
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
     * Handles employees removed from a group. An employee who now belongs to no
     * group falls back to the default group (preserving "everyone has exactly one
     * group"); if there is no default group, or they were removed FROM it, they
     * become group-less with the base 'user' role.
     *
     * @param  array<int>  $removedEmployeeIds
     */
    private function fallbackOrphansToDefault(GroupRole $fromGroup, array $removedEmployeeIds): void
    {
        $defaultId = (int) AppSetting::get('default_employee_group_id', 0);
        $defaultGroup = $defaultId ? GroupRole::find($defaultId) : null;

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

    private function gate(Request $request): void
    {
        abort_unless((bool) $request->user()?->hasPermission('system.manage_groups'), 403);
    }

    /**
     * Blocks non-super users from touching any group tied to the super
     * (Administrator) role. This covers both demoting an admin (removing them
     * from a super group resets their role) and escalating to admin (assigning
     * a group the super role pushes that role onto its members).
     *
     * @param  string|null  $incomingRole  the role the request is trying to set, if any
     */
    private function guardSuperGroup(Request $request, ?string $existingRole, ?string $incomingRole = null): void
    {
        if ($request->user()?->isSuper()) {
            return;
        }

        abort_if(
            $existingRole === 'super' || $incomingRole === 'super',
            403,
            'Only an Administrator can manage the Administrator role group.'
        );
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
            'department_ids' => $g->departments->pluck('id'),
            'employees' => $g->employees->map(fn ($e) => ['id' => $e->id, 'name' => $e->name, 'code' => $e->code]),
            'departments' => $g->departments->map(fn ($d) => ['id' => $d->id, 'name' => $d->name]),
            'member_count' => $g->employees->count(),
            'department_count' => $g->departments->count(),
        ];
    }

    public function index(Request $request): JsonResponse
    {
        $this->gate($request);

        $groups = GroupRole::with(['employees', 'departments'])
            ->orderBy('name')
            ->get()
            ->map(fn ($g) => $this->present($g));

        return response()->json([
            'data' => $groups,
            'default_group_id' => (int) AppSetting::get('default_employee_group_id', 0) ?: null,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->gate($request);
        $data = $this->validateData($request);
        $this->guardSuperGroup($request, null, $data['role'] ?? null);

        $employeeIds = $data['employee_ids'] ?? [];
        $group = DB::transaction(function () use ($data, $employeeIds) {
            $group = GroupRole::create(['name' => $data['name'], 'role' => $data['role'] ?? null]);
            $this->moveEmployeesInto($group, $employeeIds);
            $group->departments()->sync($data['department_ids'] ?? []);
            $this->syncUserRoles($group, $employeeIds);

            return $group;
        });

        AuditLog::record('Created role group', $group->name);

        return response()->json(['data' => $this->present($group), 'message' => 'success'], 201);
    }

    public function update(Request $request, GroupRole $groupRole): JsonResponse
    {
        $this->gate($request);
        $data = $this->validateData($request);
        $this->guardSuperGroup($request, $groupRole->role?->key, $data['role'] ?? null);

        $oldEmployeeIds = $groupRole->employees->pluck('id')->all();
        $newEmployeeIds = $data['employee_ids'] ?? [];

        DB::transaction(function () use ($groupRole, $data, $oldEmployeeIds, $newEmployeeIds) {
            $groupRole->update(['name' => $data['name'], 'role' => $data['role'] ?? null]);
            $this->moveEmployeesInto($groupRole, $newEmployeeIds);
            $groupRole->departments()->sync($data['department_ids'] ?? []);
            $this->syncUserRoles($groupRole, $newEmployeeIds);

            $removed = array_diff($oldEmployeeIds, $newEmployeeIds);
            if (count($removed) > 0) {
                $this->fallbackOrphansToDefault($groupRole, array_values($removed));
            }
        });

        AuditLog::record('Updated role group', $groupRole->name);

        return response()->json(['data' => $this->present($groupRole->load(['employees', 'departments'])), 'message' => 'success']);
    }

    public function destroy(Request $request, GroupRole $groupRole): JsonResponse
    {
        $this->gate($request);
        $this->guardSuperGroup($request, $groupRole->role?->key);

        // Unset default group if this one is being deleted
        if ((int) AppSetting::get('default_employee_group_id', 0) === $groupRole->id) {
            AppSetting::put('default_employee_group_id', null);
        }

        $memberIds = $groupRole->employees->pluck('id')->all();
        $name = $groupRole->name;
        $groupRole->delete();
        $this->fallbackOrphansToDefault($groupRole, $memberIds);

        AuditLog::record('Deleted role group', $name);

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
        AppSetting::put('default_employee_group_id', $groupId);

        $group = $groupId ? GroupRole::find($groupId) : null;
        AuditLog::record('Set default role group', $group?->name ?? '(none)');

        return $this->index($request);
    }

    /**
     * @return array<string, mixed>
     */
    private function validateData(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'role' => ['nullable', 'string', Rule::exists('roles', 'key')],
            'employee_ids' => ['array'],
            'employee_ids.*' => ['exists:employees,id'],
            'department_ids' => ['array'],
            'department_ids.*' => ['exists:departments,id'],
        ]);
    }
}
