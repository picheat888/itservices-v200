<?php

// The refusals for Role Group writes: unknown role, the super group, Administrator members, own access and the grant ceiling.

namespace App\Services\Permission;

use App\Enums\UserRole;
use App\Models\Permission\GroupRole;
use App\Models\Permission\Role;
use App\Models\User;
use App\Support\GrantCeiling;
use App\Support\RoleKeys;
use App\Support\SuperAdmins;
use Illuminate\Validation\ValidationException;

class GroupRoleGuards
{
    /**
     * @param  array<string, mixed>  $data
     */
    public function guardRole(array $data, ?Role $role): void
    {
        if (isset($data['role']) && $role === null) {
            throw ValidationException::withMessages(['role' => 'The selected role is invalid.']);
        }
    }

    /**
     * Blocks non-super users from touching any group tied to the super role.
     *
     * @param  string|null  $incomingRole  the role the request is trying to set, if any
     */
    public function guardSuperGroup(User $caller, ?string $existingRole, ?string $incomingRole = null): void
    {
        if ($caller->isSuper()) {
            return;
        }

        abort_if(
            UserRole::isSuperKey($existingRole) || UserRole::isSuperKey($incomingRole),
            403,
            'Only an Administrator can manage the Administrator role group.'
        );
    }

    /**
     * Blocks non-super users from moving, removing or re-saving a Super admin.
     *
     * @param  array<int>  $touchedEmployeeIds
     */
    public function guardProtectedMembers(User $caller, array $touchedEmployeeIds): void
    {
        if ($caller->isSuper() || SuperAdmins::protectedEmployeeIds($touchedEmployeeIds) === []) {
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
    public function guardOwnAccess(User $caller, array $changedEmployeeIds, array $currentEmployeeIds = [], bool $roleChanges = false): void
    {
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

    /** Whether the caller may hand out this role; null is a group without a role, which hands out the base role. */
    public function withinGrantCeiling(User $caller, ?Role $role): bool
    {
        if ($caller->isSuper()) {
            return true;
        }

        $role ??= RoleKeys::find('user');

        return $role === null || array_diff($role->allowedKeys(), $caller->permissions()) === [];
    }

    /** Blocks a non-super caller from handing out a role that holds permissions they do not. */
    public function guardGrantCeiling(User $caller, ?Role $role, bool $handsRoleOut): void
    {
        if (! $handsRoleOut || $this->withinGrantCeiling($caller, $role)) {
            return;
        }

        GrantCeiling::refuse(GrantCeiling::HAND_OUT_MESSAGE);
    }

    /** Refuses a super-role group as the default group for new employees. */
    public function guardDefaultGroup(?GroupRole $group): void
    {
        if (! $group || ! UserRole::isSuperKey($group->role?->key)) {
            return;
        }

        abort(response()->json([
            'message' => 'The Administrator group cannot be the default group for new employees.',
            'code' => 'default_group_super',
        ], 422));
    }

    /** Whether a non-super caller is refused every add to this group: a super-role group, or a role above their ceiling. */
    public function refusesEveryAdd(User $caller, ?GroupRole $group): bool
    {
        if ($group === null || $caller->isSuper()) {
            return false;
        }

        return UserRole::isSuperKey($group->role?->key) || ! $this->withinGrantCeiling($caller, $group->role);
    }

    /**
     * The Super-admin employees among these that the caller may not move; none for a Super admin.
     *
     * @param  array<int>  $employeeIds
     * @return array<int>
     */
    public function protectedFrom(User $caller, array $employeeIds): array
    {
        return $caller->isSuper() ? [] : SuperAdmins::protectedEmployeeIds($employeeIds);
    }
}
