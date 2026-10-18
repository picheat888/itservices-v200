<?php

// Role Group create, update, delete and default-group writes: one transaction each that opens with locking reads,
// keeps at least one Administrator, retries on a deadlock, and writes the audit row.

namespace App\Services\Permission;

use App\Models\AuditLog;
use App\Models\Permission\GroupRole;
use App\Models\Settings\AppSetting;
use App\Models\User;
use App\Support\RoleKeys;
use App\Support\SuperAdmins;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;

class GroupRoleService
{
    public function __construct(
        private GroupRoleGuards $guards,
        private GroupMembershipWriter $membership,
        private GroupRoleAuditDetails $auditDetails,
    ) {}

    /**
     * Every group with its role and member count, by name.
     *
     * @return Collection<int, GroupRole>
     */
    public function all(): Collection
    {
        return GroupRole::with('role')
            ->withCount('employees')
            ->orderBy('name')
            ->get();
    }

    /**
     * Ids of the groups holding the caller's own employee.
     *
     * @return array<int>
     */
    public function groupIdsOf(User $caller): array
    {
        return DB::table('group_role_employee')
            ->whereIn('employee_id', $caller->linkedEmployeeIds())
            ->pluck('group_role_id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }

    /**
     * @param  array<string, mixed>  $data  validated StoreGroupRoleRequest data
     */
    public function create(User $caller, array $data): GroupRole
    {
        $role = RoleKeys::find($data['role'] ?? null);
        $this->guards->guardRole($data, $role);
        $this->guards->guardSuperGroup($caller, null, $role?->key);

        $employeeIds = GroupMembershipChange::from($data, [])->next;

        return SuperAdmins::keepAtLeastOne(function () use ($caller, $data, $role, $employeeIds) {
            $this->lockMemberships($employeeIds);

            $this->guards->guardOwnAccess($caller, $employeeIds);
            $this->guards->guardProtectedMembers($caller, $employeeIds);
            $this->guards->guardGrantCeiling($caller, $role, $employeeIds !== []);

            $rolesBefore = $this->auditDetails->accountRoles($employeeIds);
            $group = GroupRole::create(['name' => $data['name'], 'role_id' => $role?->id]);
            $this->membership->moveEmployeesInto($group, $employeeIds);
            $this->membership->syncUserRoles($group, $employeeIds);

            $details = $this->auditDetails->membership($employeeIds, [], $rolesBefore);
            AuditLog::record('Created role group', $group->name, $details ?: null, subject: $group);

            return $group;
        }, attempts: 3);
    }

    /**
     * @param  array<string, mixed>  $data  validated UpdateGroupRoleRequest data
     */
    public function update(User $caller, GroupRole $groupRole, array $data): GroupRole
    {
        $role = RoleKeys::find($data['role']);
        $this->guards->guardRole($data, $role);

        return SuperAdmins::keepAtLeastOne(function () use ($caller, $groupRole, $data, $role) {
            // Locks before any plain read
            $group = $this->lockGroup($groupRole);
            $change = GroupMembershipChange::from($data, $this->lockMembers($group));
            $this->lockMemberships($change->added);
            $roleChanges = (int) $group->role_id !== (int) $role?->id;

            $this->guards->guardSuperGroup($caller, $group->role?->key, $role?->key);
            $this->guards->guardOwnAccess($caller, $change->changed(), $change->current, $roleChanges);
            $this->guards->guardProtectedMembers($caller, $change->touched());
            $isDefaultGroup = GroupRole::defaultForNewEmployees()?->id === $group->id;
            $handsRoleOut = $change->added !== [] || ($roleChanges && ($change->next !== [] || $isDefaultGroup));
            $this->guards->guardGrantCeiling($caller, $role, $handsRoleOut);

            $before = $group->getOriginal();
            $rolesBefore = $this->auditDetails->accountRoles($change->touched());
            $group->update(['name' => $data['name'], 'role_id' => $role?->id]);
            $this->membership->moveEmployeesInto($group, $change->added, $change->removed);
            // A role change re-applies to everyone, else only newcomers
            $this->membership->syncUserRoles($group, $roleChanges ? $this->membership->memberIds($group) : $change->added);

            if ($change->removed !== []) {
                $this->membership->fallbackOrphansToDefault($caller, $group, $change->removed);
            }

            $details = [
                ...(AuditLog::changes($before, $group) ?? []),
                ...$this->auditDetails->membership($change->added, $change->removed, $rolesBefore),
            ];
            AuditLog::record('Updated role group', $group->name, $details ?: null, subject: $group);

            return $group;
        }, attempts: 3);
    }

    public function delete(User $caller, GroupRole $groupRole): void
    {
        SuperAdmins::keepAtLeastOne(function () use ($caller, $groupRole) {
            $group = $this->lockGroup($groupRole);
            $memberIds = $this->lockMembers($group);
            $this->guards->guardSuperGroup($caller, $group->role?->key);
            $this->guards->guardOwnAccess($caller, $memberIds);
            $this->guards->guardProtectedMembers($caller, $memberIds);

            $rolesBefore = $this->auditDetails->accountRoles($memberIds);

            // A deleted group stops being the default
            if ((int) AppSetting::get('default_employee_group_id', 0) === $group->id) {
                AppSetting::put('default_employee_group_id', null);
            }

            $group->delete();
            $this->membership->fallbackOrphansToDefault($caller, $group, $memberIds);

            AuditLog::recordDeleted('Deleted role group', $group->name, $group, $this->auditDetails->membership([], $memberIds, $rolesBefore));
        }, attempts: 3);
    }

    /** Sets the Role Group new employees join, or none. */
    public function setDefault(User $caller, mixed $groupId): void
    {
        $group = $groupId ? GroupRole::with('role')->find($groupId) : null;

        $this->guards->guardDefaultGroup($group);

        if ($group) {
            $this->guards->guardGrantCeiling($caller, $group->role, true);
        }

        AppSetting::put('default_employee_group_id', $groupId);
        AuditLog::record('Set default role group', $group?->name ?? '(none)', subject: $group);
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
}
