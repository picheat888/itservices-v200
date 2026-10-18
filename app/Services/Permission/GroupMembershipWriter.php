<?php

// Role Group membership writes: moving employees between groups, putting the group's role on their login accounts,
// and sending people left without a group to the default group or the base role.

namespace App\Services\Permission;

use App\Models\Employee\Employee;
use App\Models\Permission\GroupRole;
use App\Models\User;
use App\Support\RoleKeys;
use Illuminate\Support\Facades\DB;

class GroupMembershipWriter
{
    public function __construct(private GroupRoleGuards $guards) {}

    /**
     * Sets the group's role, or the base 'user' role for a group without one, on its employees' login accounts.
     *
     * @param  array<int>  $newEmployeeIds
     */
    public function syncUserRoles(GroupRole $group, array $newEmployeeIds): void
    {
        $this->setAccountRoles($newEmployeeIds, $group->role_id ? (int) $group->role_id : $this->baseRoleId());
    }

    /**
     * Moves the added employees into this group out of every other group, and detaches the removed ones.
     *
     * @param  array<int>  $addedEmployeeIds
     * @param  array<int>  $removedEmployeeIds
     */
    public function moveEmployeesInto(GroupRole $group, array $addedEmployeeIds, array $removedEmployeeIds = []): void
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
    public function memberIds(GroupRole $group): array
    {
        return $group->employees()->pluck('employees.id')->map(fn ($id) => (int) $id)->all();
    }

    /**
     * Moves employees left without a group into the default group, or the base 'user' role.
     *
     * @param  array<int>  $removedEmployeeIds
     */
    public function fallbackOrphansToDefault(User $caller, GroupRole $fromGroup, array $removedEmployeeIds): void
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
        $this->guards->guardGrantCeiling($caller, $landsInDefault ? $defaultGroup->role : null, true);
        if ($landsInDefault) {
            $defaultGroup->employees()->attach($orphanIds);
            $this->syncUserRoles($defaultGroup, $orphanIds);
        } else {
            $this->setAccountRoles($orphanIds, $this->baseRoleId());
        }
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
}
