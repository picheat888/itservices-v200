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
        if (! $group->role || count($newEmployeeIds) === 0) {
            return;
        }

        $emails    = Employee::whereIn('id', $newEmployeeIds)->pluck('email')->filter();
        $usernames = Employee::whereIn('id', $newEmployeeIds)->pluck('username')->filter();
        User::where(function ($q) use ($emails, $usernames) {
            $q->whereIn('email', $emails)->orWhereIn('username', $usernames);
        })->update(['role' => $group->role]);
    }

    /**
     * Resets User.role to 'user' (or next group's role) for employees removed from a group.
     *
     * @param  array<int>  $removedEmployeeIds
     */
    private function resetRoleForOrphans(array $removedEmployeeIds): void
    {
        foreach ($removedEmployeeIds as $empId) {
            $employee = Employee::find($empId);
            if (! $employee) {
                continue;
            }

            $otherGroup = $employee->groupRoles()->first();
            $newRole = $otherGroup?->role ?? 'user';

            if ($employee->email) {
                User::where('email', $employee->email)->update(['role' => $newRole]);
            } elseif ($employee->username) {
                User::where('username', $employee->username)->update(['role' => $newRole]);
            }
        }
    }

    private function gate(Request $request): void
    {
        abort_unless((bool) $request->user()?->hasPermission('system.manage_groups'), 403);
    }

    /**
     * @return array<string, mixed>
     */
    private function present(GroupRole $g): array
    {
        return [
            'id'               => $g->id,
            'name'             => $g->name,
            'role'             => $g->role,
            'role_label'       => $g->role ? (Role::where('key', $g->role)->value('name') ?? $g->role) : null,
            'employee_ids'     => $g->employees->pluck('id'),
            'department_ids'   => $g->departments->pluck('id'),
            'employees'        => $g->employees->map(fn ($e) => ['id' => $e->id, 'name' => $e->name, 'code' => $e->code]),
            'departments'      => $g->departments->map(fn ($d) => ['id' => $d->id, 'name' => $d->name]),
            'member_count'     => $g->employees->count(),
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
            'data'             => $groups,
            'default_group_id' => (int) AppSetting::get('default_employee_group_id', 0) ?: null,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->gate($request);
        $data = $this->validateData($request);

        $group = GroupRole::create(['name' => $data['name'], 'role' => $data['role'] ?? null]);
        $group->employees()->sync($data['employee_ids'] ?? []);
        $group->departments()->sync($data['department_ids'] ?? []);
        $this->syncUserRoles($group, $data['employee_ids'] ?? []);

        AuditLog::record('Created role group', $group->name);

        return response()->json(['data' => $this->present($group), 'message' => 'success'], 201);
    }

    public function update(Request $request, GroupRole $groupRole): JsonResponse
    {
        $this->gate($request);
        $data = $this->validateData($request);

        $oldEmployeeIds = $groupRole->employees->pluck('id')->all();
        $newEmployeeIds = $data['employee_ids'] ?? [];

        $groupRole->update(['name' => $data['name'], 'role' => $data['role'] ?? null]);
        $groupRole->employees()->sync($newEmployeeIds);
        $groupRole->departments()->sync($data['department_ids'] ?? []);
        $this->syncUserRoles($groupRole, $newEmployeeIds);

        $removed = array_diff($oldEmployeeIds, $newEmployeeIds);
        if (count($removed) > 0) {
            $this->resetRoleForOrphans(array_values($removed));
        }

        AuditLog::record('Updated role group', $groupRole->name);

        return response()->json(['data' => $this->present($groupRole), 'message' => 'success']);
    }

    public function destroy(Request $request, GroupRole $groupRole): JsonResponse
    {
        $this->gate($request);

        // Unset default group if this one is being deleted
        if ((int) AppSetting::get('default_employee_group_id', 0) === $groupRole->id) {
            AppSetting::put('default_employee_group_id', null);
        }

        $memberIds = $groupRole->employees->pluck('id')->all();
        $name = $groupRole->name;
        $groupRole->delete();
        $this->resetRoleForOrphans($memberIds);

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
            'name'           => ['required', 'string', 'max:100'],
            'role'           => ['nullable', 'string', Rule::exists('roles', 'key')],
            'employee_ids'   => ['array'],
            'employee_ids.*' => ['exists:employees,id'],
            'department_ids'   => ['array'],
            'department_ids.*' => ['exists:departments,id'],
        ]);
    }
}
